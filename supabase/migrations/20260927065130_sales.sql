-- M15 sales (docs/features/04-sales.md §3.1 "M15", §3.5, §3.8 D2-D5, D9-D12)
--
-- A sale is a HEADER (`sales`) plus 1-20 LINES (`sale_lines`, PK (tenant_id, sale_id, size_id), so "no size twice"
-- is a primary key, not just a check, AC16). Owners WRITE both (the M16 functions are security invoker, so the
-- caller needs the privilege), and the browser holds the same JWT, so PostgREST could reach the tables directly.
-- Every rule that matters therefore lives here, in the database, for EVERY write path:
--   * column-level grants: an owner can never write sale_number, id, tenant_id, created_at directly;
--   * CHECK constraints: status/delivered_date/client rules by type (AC13, AC23, AC24, AC54);
--   * a composite FK (tenant_id, size_id) / (tenant_id, client_id): a sale or line can never point at another
--     farm's client or size (AC58);
--   * a deferred, per-row constraint trigger for "1 to 20 lines" (a cross-row rule no CHECK can express, and
--     update_sale's delete-then-upsert legitimately passes a sale's line count through states a same-statement
--     check would reject);
--   * a BEFORE DELETE trigger backstopping "only a Pending sale can be deleted" (AC44) for a direct PostgREST delete;
--   * a BEFORE UPDATE trigger backstopping "voided_at is one-way" (AC67, AC68) for a direct PostgREST update: it is
--     an updatable column (void_sale itself writes it), so this is what actually makes it one-way against every
--     write path, not only the function.
--
-- `sales`/`sale_lines` get a REAL delete grant (mirroring `production`, not `clients`/`sizes`'s "never deleted"
-- pattern): AC44 requires an actual removal, but only for a `pending` sale (owner correction, 2026-09-27) --
-- `delete_sale` (M16) refuses a `complete` one outright, and `void_sale` (M16) is the correction for those instead.
--
-- Custom SQLSTATEs used directly by this migration's own triggers/constraints (M16 defines the rest):
--   TM028 a sale doesn't have 1 to 20 lines (deferred trigger backstop; M16's validate_sale_lines raises it too)
--   TM040 voided_at changed or cleared once set (sales_write_guard trigger backstop, direct write only)
--   TM041 delete_sale / a direct delete: the sale isn't pending (sales_delete_guard trigger backstop)
--
-- Deviation from the architect's exact wording (recorded in §4): the design describes ONE statement-level trigger
-- "after insert or delete ... referencing new table as new_rows old_table as old_rows", deferred. Postgres does not
-- allow combining multiple events (INSERT OR DELETE) with transition tables on one trigger ("Multiple events can be
-- specified using OR, except when transition relations are requested"), and DEFERRABLE requires a CONSTRAINT
-- TRIGGER, which must be FOR EACH ROW and cannot use transition tables at all. So this is built as a single
-- FOR EACH ROW deferred CONSTRAINT TRIGGER that, for the one row's sale_id, re-checks that sale's final line count
-- at commit (or SET CONSTRAINTS ... IMMEDIATE) time -- same guarantee (checked once per save, after every delete and
-- insert has happened), just row- instead of statement-shaped.

-- ---------------------------------------------------------------------------
-- 1. Helpers with no dependency on the tables created below (schema app: not exposed by PostgREST).
-- ---------------------------------------------------------------------------

-- Serialises sale writes for one farm for the length of the (short) transaction: sale-number assignment AND the
-- stock-shortfall check are both taken under this lock, so two phones can never collide on a number or both oversell
-- the last few trays (§3 intro, closes X5). Key prefix differs from 'clients:', 'sizes:' and the production-day key.
create function app.lock_tenant_sales(p_tenant_id uuid)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('sales:' || p_tenant_id::text, 0));
end
$$;

-- The ONE place a line total is computed (AC22): price per tray x the line's eggs / tray size, rounded to the
-- nearest centavo, half up. Postgres numeric division is exact (no float), and round(numeric, 2) rounds half away
-- from zero, which is half-up for the positive amounts here. Its JS twin is computeLineTotal in shared/utils/price.ts.
create function app.sale_line_total(p_price numeric, p_eggs integer, p_eggs_per_tray integer)
  returns numeric
  language sql
  immutable
  security invoker
  set search_path = ''
as $$
  select round(p_price * p_eggs / p_eggs_per_tray, 2)
$$;

comment on function app.sale_line_total(numeric, integer, integer) is
  'AC22: price per tray x eggs / eggs per tray, rounded half up to 2 decimals. Twin of computeLineTotal().';

-- SHA-256 of the normalised payload, for create_sale's idempotency ledger (AC30): type, client, dates and every
-- line (sorted by size_id, so line order never matters). Deliberately excludes confirm_shortfall, so retrying the
-- SAME sale with "record anyway" after a shortfall is not "a different payload" (TM038).
create function app.sale_payload_hash(
  p_type text,
  p_client_id uuid,
  p_sale_date date,
  p_delivered_date date,
  p_size_ids uuid[],
  p_eggs integer[],
  p_prices numeric[]
)
  returns text
  language sql
  immutable
  security invoker
  set search_path = ''
as $$
  select encode(sha256(convert_to(
    p_type || chr(31) || coalesce(p_client_id::text, '') || chr(31) || p_sale_date::text || chr(31)
    || coalesce(p_delivered_date::text, '') || chr(31)
    || coalesce((
         select string_agg(u.size_id::text || ':' || u.eggs::text || ':' || round(u.price, 2)::text, chr(30) order by u.size_id)
         from unnest(p_size_ids, p_eggs, p_prices) u(size_id, eggs, price)
       ), ''),
    'UTF8')), 'hex')
$$;

-- The ONE place status is derived from type + dates (AC23, AC24, AC64-AC66), used identically by create_sale and
-- update_sale, so a type change needs no special-case code beyond this.
create function app.derive_sale_status(p_type text, p_sale_date date, p_delivered_date date default null)
  returns table (status text, delivered_date date)
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  if p_sale_date is null then
    raise exception 'sale date is required' using errcode = 'TM005';
  end if;
  if p_sale_date > (now() at time zone 'utc')::date + 1 then
    raise exception 'sale date is in the future' using errcode = 'TM002', hint = 'sale_date';
  end if;

  if p_type = 'on_site' then
    -- Any p_delivered_date argument is ignored: an on-site sale's sale date and delivered date are the same day.
    status := 'complete';
    delivered_date := p_sale_date;
    return next;
    return;
  end if;

  if p_delivered_date is null then
    status := 'pending';
    delivered_date := null;
    return next;
    return;
  end if;

  if p_delivered_date < p_sale_date then
    raise exception 'delivered date is before the sale date' using errcode = 'TM034';
  end if;
  if p_delivered_date > (now() at time zone 'utc')::date + 1 then
    raise exception 'delivered date is in the future' using errcode = 'TM002', hint = 'delivered_date';
  end if;

  status := 'complete';
  delivered_date := p_delivered_date;
  return next;
end
$$;

-- Client rules by type (AC13, AC41, AC54, AC64): a delivery needs a client; a client id that DIFFERS from the
-- sale's existing one (a newly chosen one, including "there was none before") must be active; the sale's own,
-- unchanged client is accepted even if it has since become inactive (AC41).
create function app.validate_sale_client(p_tenant_id uuid, p_type text, p_client_id uuid, p_existing_client_id uuid default null)
  returns void
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  if p_type = 'delivery' and p_client_id is null then
    raise exception 'a delivery needs a client' using errcode = 'TM032', hint = 'required';
  end if;

  if p_client_id is not null and p_client_id is distinct from p_existing_client_id
     and not exists (select 1 from public.clients c where c.tenant_id = p_tenant_id and c.id = p_client_id and c.archived_at is null) then
    raise exception 'client is not available' using errcode = 'TM032', hint = 'invalid';
  end if;
end
$$;

-- Line rules (AC15, AC16, AC17, AC19, AC20, AC38, AC41, AC54): 1-20 lines, no duplicate size, eggs 1-100,000, a
-- valid price, and every size NOT already on the sale (p_existing_size_ids) must be one of this farm's ACTIVE
-- sizes. create_sale passes p_existing_size_ids := '{}' (every line is new); update_sale passes the sale's size
-- set as it was BEFORE this edit (so a kept, since-archived size line is never refused, AC38/AC41).
create function app.validate_sale_lines(
  p_tenant_id uuid,
  p_size_ids uuid[],
  p_eggs integer[],
  p_prices numeric[],
  p_existing_size_ids uuid[] default '{}'
)
  returns void
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  if p_size_ids is null or p_eggs is null or p_prices is null
     or cardinality(p_size_ids) <> cardinality(p_eggs)
     or cardinality(p_size_ids) <> cardinality(p_prices)
     or array_position(p_size_ids, null) is not null
     or array_position(p_eggs, null) is not null
     or array_position(p_prices, null) is not null then
    raise exception 'malformed lines' using errcode = 'TM005';
  end if;

  if cardinality(p_size_ids) < 1 or cardinality(p_size_ids) > 20 then
    raise exception 'a sale must have 1 to 20 lines' using errcode = 'TM028';
  end if;

  if exists (select 1 from unnest(p_size_ids) u(size_id) group by u.size_id having count(*) > 1) then
    raise exception 'a size appears twice in one sale' using errcode = 'TM029';
  end if;

  if exists (select 1 from unnest(p_eggs) e(eggs) where e.eggs < 1 or e.eggs > 100000) then
    raise exception 'a line''s eggs are out of range' using errcode = 'TM030';
  end if;

  if exists (select 1 from unnest(p_prices) pr(price) where pr.price <= 0) then
    raise exception 'a line''s price must be above 0' using errcode = 'TM031', hint = 'not_positive';
  end if;
  if exists (select 1 from unnest(p_prices) pr(price) where pr.price > 9999.99) then
    raise exception 'a line''s price is too large' using errcode = 'TM031', hint = 'too_large';
  end if;
  if exists (select 1 from unnest(p_prices) pr(price) where pr.price <> round(pr.price, 2)) then
    raise exception 'a line''s price has too many decimals' using errcode = 'TM031', hint = 'too_many_decimals';
  end if;

  if exists (
    select 1 from unnest(p_size_ids) u(size_id)
    where u.size_id <> all (p_existing_size_ids)
      and not exists (select 1 from public.sizes s where s.tenant_id = p_tenant_id and s.id = u.size_id and s.archived_at is null)
  ) then
    if exists (
      select 1 from unnest(p_size_ids) u(size_id)
      where u.size_id <> all (p_existing_size_ids)
        and exists (select 1 from public.sizes s where s.tenant_id = p_tenant_id and s.id = u.size_id and s.archived_at is not null)
    ) then
      raise exception 'a new line''s size has been archived' using errcode = 'TM033', hint = 'archived';
    end if;
    raise exception 'a new line''s size is not one of this farm''s' using errcode = 'TM033', hint = 'not_found';
  end if;
end
$$;

revoke all on function app.lock_tenant_sales(uuid) from public;
revoke all on function app.sale_line_total(numeric, integer, integer) from public;
revoke all on function app.sale_payload_hash(text, uuid, date, date, uuid[], integer[], numeric[]) from public;
revoke all on function app.derive_sale_status(text, date, date) from public;
revoke all on function app.validate_sale_client(uuid, text, uuid, uuid) from public;
revoke all on function app.validate_sale_lines(uuid, uuid[], integer[], numeric[], uuid[]) from public;

grant execute on function app.lock_tenant_sales(uuid) to authenticated;
grant execute on function app.sale_line_total(numeric, integer, integer) to authenticated;
grant execute on function app.sale_payload_hash(text, uuid, date, date, uuid[], integer[], numeric[]) to authenticated;
grant execute on function app.derive_sale_status(text, date, date) to authenticated;
grant execute on function app.validate_sale_client(uuid, text, uuid, uuid) to authenticated;
grant execute on function app.validate_sale_lines(uuid, uuid[], integer[], numeric[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. sales (the header)
-- ---------------------------------------------------------------------------
create table public.sales (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references public.tenants (id) on delete cascade,
  -- Assigned only by create_sale (M16), never by an owner (AC5).
  sale_number    bigint      not null,
  -- null = on-site walk-in (AC13). A delivery always has one (sales_delivery_needs_client).
  client_id      uuid        null,
  type           text        not null check (type in ('delivery', 'on_site')),
  status         text        not null check (status in ('pending', 'complete')),
  sale_date      date        not null,
  -- null = pending. Set exactly when status = 'complete' (sales_status_delivered_date).
  delivered_date date        null,
  -- The stale-edit marker (AC43), bumped by the M16 functions on every real change.
  version        bigint      not null default 1,
  -- One-way (AC67, owner correction 2026-09-27): null = not voided. Set only by void_sale, only on a complete
  -- sale, and never cleared. NOT a third status value: status stays 'complete' forever on a voided sale.
  voided_at      timestamptz null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint sales_version_positive check (version >= 1),
  -- The composite-FK target for sale_lines.
  constraint sales_tenant_id_id_key unique (tenant_id, id),
  -- AC5: unique per farm, never reused.
  constraint sales_tenant_number_key unique (tenant_id, sale_number),
  -- Nullable FK, NOT cascading and NO set null: a client is never deleted (feature 03), so this never fires.
  constraint sales_client_fk foreign key (tenant_id, client_id) references public.clients (tenant_id, id),
  constraint sales_status_delivered_date check ((status = 'pending') = (delivered_date is null)),
  constraint sales_delivery_needs_client check (type <> 'delivery' or client_id is not null),
  constraint sales_on_site_complete check (type <> 'on_site' or status = 'complete'),
  constraint sales_on_site_same_day check (type <> 'on_site' or delivered_date = sale_date),
  constraint sales_delivered_not_before_sale check (delivered_date is null or delivered_date >= sale_date),
  constraint sales_date_not_future check (sale_date <= (now() at time zone 'utc')::date + 1),
  constraint sales_delivered_date_not_future check (delivered_date is null or delivered_date <= (now() at time zone 'utc')::date + 1),
  -- AC67: a Pending sale is never voided.
  constraint sales_voided_only_complete check (voided_at is null or status = 'complete')
);

comment on table public.sales is
  'A sale''s header: one order, one sale number, a type (delivery/on_site) and a status (pending/complete). Lines in sale_lines.';

create index sales_tenant_date_idx on public.sales (tenant_id, sale_date desc, sale_number desc);
create index sales_tenant_status_idx on public.sales (tenant_id, status);
create index sales_tenant_client_idx on public.sales (tenant_id, client_id);
-- Helps the default "exclude voided" and the "show voided" toggle skip-scan; not required at v1 scale.
create index sales_tenant_voided_idx on public.sales (tenant_id) where voided_at is not null;

create trigger set_updated_at
  before update on public.sales
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. sale_lines
-- ---------------------------------------------------------------------------
create table public.sale_lines (
  tenant_id      uuid        not null references public.tenants (id) on delete cascade,
  sale_id        uuid        not null,
  size_id        uuid        not null,
  eggs           integer     not null check (eggs between 1 and 100000),
  price_per_tray numeric     not null check (price_per_tray > 0 and price_per_tray <= 9999.99 and price_per_tray = round(price_per_tray, 2)),
  -- Frozen at write time (AC55): never recomputed for an unchanged line, whatever the tray size or currency does later.
  line_total     numeric     not null check (line_total >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- The primary key IS "no size twice in one sale" (AC16, AC54), not just a check.
  constraint sale_lines_pkey primary key (tenant_id, sale_id, size_id),
  constraint sale_lines_sale_fk foreign key (tenant_id, sale_id) references public.sales (tenant_id, id) on delete cascade,
  -- Plain (not cascading), same "NO ACTION so a whole-tenant cascade works" reasoning as production_size_fk.
  constraint sale_lines_size_fk foreign key (tenant_id, size_id) references public.sizes (tenant_id, id)
);

comment on table public.sale_lines is
  'One line of a sale: a size, its eggs, its price per tray and its frozen total. PK doubles as "no size twice".';

-- Backs app.on_hand_json (mirrors production_tenant_size_idx).
create index sale_lines_tenant_size_idx on public.sale_lines (tenant_id, size_id);

create trigger set_updated_at
  before update on public.sale_lines
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. sale_lines_bounds: "a sale has 1 to 20 lines" (AC15, AC54) is a cross-row rule no CHECK can express, and
-- update_sale's delete-then-upsert sequence legitimately passes a sale's line count through 0 mid-transaction on a
-- full replace. See the file header for why this is a FOR EACH ROW deferred CONSTRAINT TRIGGER (not the
-- statement-level, transition-table trigger the design describes, which Postgres does not allow for combined
-- INSERT OR DELETE events) -- same guarantee: checked once per save, after every delete and insert has happened.
-- ---------------------------------------------------------------------------
create function app.sale_lines_bounds()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_tenant uuid;
  v_sale   uuid;
  v_count  bigint;
begin
  if tg_op = 'DELETE' then
    v_tenant := old.tenant_id;
    v_sale := old.sale_id;
  else
    v_tenant := new.tenant_id;
    v_sale := new.sale_id;
  end if;

  -- The sale itself may have been removed in the same transaction (delete_sale cascades to its lines): nothing to
  -- check then. Checking the same sale's final count more than once (one firing per affected row) is harmless.
  if not exists (select 1 from public.sales s where s.tenant_id = v_tenant and s.id = v_sale) then
    return null;
  end if;

  select count(*) into v_count from public.sale_lines l where l.tenant_id = v_tenant and l.sale_id = v_sale;
  if v_count < 1 or v_count > 20 then
    raise exception 'a sale must have 1 to 20 lines' using errcode = 'TM028';
  end if;
  return null;
end
$$;

comment on function app.sale_lines_bounds() is
  'Deferred constraint trigger: at commit, every touched sale has 1 to 20 lines (TM028 backstop for a direct write).';

revoke all on function app.sale_lines_bounds() from public;

create constraint trigger sale_lines_bounds
  after insert or delete on public.sale_lines
  deferrable initially deferred
  for each row execute function app.sale_lines_bounds();

-- ---------------------------------------------------------------------------
-- 5. sales_delete_guard: backstops "only a Pending sale can be deleted" (AC44) for a direct PostgREST delete, not
-- only delete_sale (M16). The delete grant below is intentionally table-wide (mirroring production's); this is
-- what enforces WHICH rows, below the grant.
-- ---------------------------------------------------------------------------
create function app.sales_delete_guard()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if old.status <> 'pending' then
    raise exception 'only a pending sale can be deleted' using errcode = 'TM041';
  end if;
  return old;
end
$$;

comment on function app.sales_delete_guard() is
  'Trigger: refuses to delete a sale that is not pending (TM041) -- a complete sale is voided instead, never deleted.';

revoke all on function app.sales_delete_guard() from public;

create trigger sales_delete_guard
  before delete on public.sales
  for each row execute function app.sales_delete_guard();

-- ---------------------------------------------------------------------------
-- 5b. sales_write_guard: backstops the columns a direct PostgREST write must never be able to move, beyond what
-- the column grants already refuse outright (tenant_id, id and sale_number have NO update grant at all, so they
-- need no runtime check here). voided_at IS updatable (the owner's own void_sale writes it), so THIS is what makes
-- it truly one-way (AC67, AC68): once set, an update can never clear it or move it to a different instant, even
-- through a hand-built PostgREST request that never goes near void_sale.
-- ---------------------------------------------------------------------------
create function app.sales_write_guard()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'voided_at is one-way and cannot change once set' using errcode = 'TM040';
  end if;
  return new;
end
$$;

comment on function app.sales_write_guard() is
  'Trigger: voided_at, once set, can never be cleared or changed by any write path (TM040, AC67/AC68).';

revoke all on function app.sales_write_guard() from public;

create trigger sales_write_guard
  before update on public.sales
  for each row execute function app.sales_write_guard();

-- ---------------------------------------------------------------------------
-- 6. Helpers that depend on sales / sale_lines existing.
-- ---------------------------------------------------------------------------

-- The ONE on-hand calculation (AC25, AC33, AC53): good production minus completed, NON-VOIDED sales' eggs, grouped
-- by size, for the given size_ids (or every size of the farm, active and archived, when null). Reused unchanged by
-- Inventory (feature 06). A voided sale's lines never count, regardless of status (AC67): status stays 'complete'
-- forever on a voided sale, so `voided_at is null` is what actually excludes it.
create function app.on_hand_json(p_tenant_id uuid, p_size_ids uuid[] default null)
  returns jsonb
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with produced as (
    select size_id, sum(eggs) as eggs from public.production
    where tenant_id = p_tenant_id and quality = 'good' group by size_id
  ), sold as (
    select sl.size_id, sum(sl.eggs) as eggs
    from public.sale_lines sl join public.sales s
      on s.tenant_id = sl.tenant_id and s.id = sl.sale_id
    where sl.tenant_id = p_tenant_id and s.status = 'complete' and s.voided_at is null
    group by sl.size_id
  ), wanted as (
    select id as size_id from public.sizes
    where tenant_id = p_tenant_id and (p_size_ids is null or id = any (p_size_ids))
  )
  select jsonb_build_object('onHand', coalesce(jsonb_agg(jsonb_build_object(
    'sizeId', w.size_id, 'eggs', coalesce(pr.eggs, 0) - coalesce(so.eggs, 0)
  ) order by w.size_id), '[]'::jsonb))
  from wanted w left join produced pr using (size_id) left join sold so using (size_id)
$$;

comment on function app.on_hand_json(uuid, uuid[]) is
  'AC25/AC53: good production minus completed, non-voided sale eggs, by size. The ONE on-hand calculation.';

-- The shortfall check (AC26, AC35, AC42): p_needed is the amount THIS save newly takes from that size (never a
-- running total). Ignores non-positive entries. Raises TM037 (unless p_confirm) naming only the short sizes, in the
-- farm's size order, with what's on hand and what's needed -- never revealing sizes with enough stock.
create function app.check_sale_shortfall(p_tenant_id uuid, p_size_ids uuid[], p_needed integer[], p_confirm boolean)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_shortfall jsonb;
begin
  if p_size_ids is null or p_needed is null or cardinality(p_size_ids) <> cardinality(p_needed) then
    raise exception 'malformed shortfall check' using errcode = 'TM005';
  end if;

  with wanted as (
    select u.size_id, u.needed
    from unnest(p_size_ids, p_needed) u(size_id, needed)
    where u.needed > 0
  ), oh as (
    select (e ->> 'sizeId')::uuid as size_id, (e ->> 'eggs')::integer as on_hand
    from jsonb_array_elements(
      app.on_hand_json(p_tenant_id, case when exists (select 1 from wanted) then (select array_agg(w.size_id) from wanted w) else '{}'::uuid[] end) -> 'onHand'
    ) e
  )
  select jsonb_agg(jsonb_build_object('sizeId', w.size_id, 'onHandEggs', coalesce(oh.on_hand, 0), 'neededEggs', w.needed)
                   order by s.sort_order, s.name, s.id)
  into v_shortfall
  from wanted w
  left join oh on oh.size_id = w.size_id
  left join public.sizes s on s.tenant_id = p_tenant_id and s.id = w.size_id
  where coalesce(oh.on_hand, 0) - w.needed < 0;

  if v_shortfall is not null and not p_confirm then
    raise exception 'insufficient stock' using errcode = 'TM037', detail = jsonb_build_object('shortfall', v_shortfall)::text;
  end if;
end
$$;

comment on function app.check_sale_shortfall(uuid, uuid[], integer[], boolean) is
  'AC26/AC35/AC42: raises TM037 (detail: {shortfall:[...]}) for sizes this save would take below 0, unless p_confirm.';

-- One sale as { id, saleNumber, type, status, clientId, saleDate, deliveredDate, version, voidedAt,
-- lines: [{ sizeId, eggs, pricePerTray, lineTotal }] (farm size order), saleTotal }, or null. saleTotal is computed
-- here, never stored (§3 intro).
create function app.sale_json(p_tenant_id uuid, p_sale_id uuid)
  returns jsonb
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'saleNumber', s.sale_number,
    'type', s.type,
    'status', s.status,
    'clientId', s.client_id,
    'saleDate', to_char(s.sale_date, 'YYYY-MM-DD'),
    'deliveredDate', case when s.delivered_date is null then null else to_char(s.delivered_date, 'YYYY-MM-DD') end,
    'version', s.version,
    'voidedAt', case when s.voided_at is null then null else to_char(s.voided_at at time zone 'utc', 'YYYY-MM-DD') end,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sizeId', sl.size_id, 'eggs', sl.eggs, 'pricePerTray', sl.price_per_tray, 'lineTotal', sl.line_total)
             order by z.sort_order, z.name, z.id)
      from public.sale_lines sl
      left join public.sizes z on z.tenant_id = sl.tenant_id and z.id = sl.size_id
      where sl.tenant_id = p_tenant_id and sl.sale_id = s.id
    ), '[]'::jsonb),
    'saleTotal', coalesce((select sum(sl.line_total) from public.sale_lines sl where sl.tenant_id = p_tenant_id and sl.sale_id = s.id), 0)
  )
  from public.sales s
  where s.tenant_id = p_tenant_id and s.id = p_sale_id
$$;

comment on function app.sale_json(uuid, uuid) is 'One sale (header + lines + computed total) as one jsonb value, or null.';

-- Sales in [p_from, p_to] (null = open-ended), filtered and paginated server-side (D4), as ONE jsonb value:
-- { hasAny, total, sales }, newest sale_date first then highest sale_number (AC4). hasAny ignores every filter,
-- p_include_voided included (AC46/AC10 vs AC68's default-hide). When p_status = 'pending', p_limit is NOT applied
-- (AC9): every pending sale, however many, however old.
create function app.list_sales_json(
  p_tenant_id uuid,
  p_from date,
  p_to date,
  p_status text,
  p_type text,
  p_client_id uuid,
  p_limit int,
  p_offset int,
  p_include_voided boolean default false
)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
declare
  v_limit int := case when p_status = 'pending' then null else p_limit end;
begin
  return (
    with matched as (
      select s.id, s.sale_date, s.sale_number
      from public.sales s
      where s.tenant_id = p_tenant_id
        and (p_from is null or s.sale_date >= p_from)
        and (p_to is null or s.sale_date <= p_to)
        and (p_status is null or s.status = p_status)
        and (p_type is null or s.type = p_type)
        and (p_client_id is null or s.client_id = p_client_id)
        and (p_include_voided or s.voided_at is null)
    ), page as (
      select m.id, m.sale_date, m.sale_number
      from matched m
      order by m.sale_date desc, m.sale_number desc
      limit v_limit offset coalesce(p_offset, 0)
    )
    select jsonb_build_object(
      'hasAny', exists (select 1 from public.sales x where x.tenant_id = p_tenant_id),
      'total', (select count(*) from matched),
      'sales', coalesce(
        (select jsonb_agg(app.sale_json(p_tenant_id, p.id) order by p.sale_date desc, p.sale_number desc) from page p),
        '[]'::jsonb)
    )
  );
end
$$;

comment on function app.list_sales_json(uuid, date, date, text, text, uuid, int, int, boolean) is
  'AC4/AC7-AC10/AC52: filtered, paginated sales as one jsonb value. Pending never capped (AC9).';

revoke all on function app.on_hand_json(uuid, uuid[]) from public;
revoke all on function app.check_sale_shortfall(uuid, uuid[], integer[], boolean) from public;
revoke all on function app.sale_json(uuid, uuid) from public;
revoke all on function app.list_sales_json(uuid, date, date, text, text, uuid, int, int, boolean) from public;

grant execute on function app.on_hand_json(uuid, uuid[]) to authenticated;
grant execute on function app.check_sale_shortfall(uuid, uuid[], integer[], boolean) to authenticated;
grant execute on function app.sale_json(uuid, uuid) to authenticated;
grant execute on function app.list_sales_json(uuid, date, date, text, text, uuid, int, int, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. sale_submissions: idempotency ledger for create_sale (the client_submissions/production_submissions pattern).
-- ---------------------------------------------------------------------------
create table public.sale_submissions (
  tenant_id    uuid        not null references public.tenants (id) on delete cascade,
  -- The client's submissionId.
  id           uuid        not null,
  sale_id      uuid        not null,
  -- SHA-256 of the normalised payload (app.sale_payload_hash), so a replay whose payload differs is refused (TM038).
  payload_hash text        not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint sale_submissions_pkey primary key (tenant_id, id),
  -- Unlike clients, a sale CAN be deleted (AC44): deleting it removes its ledger row too.
  constraint sale_submissions_sale_fk foreign key (tenant_id, sale_id) references public.sales (tenant_id, id) on delete cascade
);

comment on table public.sale_submissions is 'Idempotency ledger for create_sale, keyed by (tenant, client submissionId).';

create trigger set_updated_at
  before update on public.sale_submissions
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Grants and policies (§3.2). Mirrors production, not clients/sizes: sales/sale_lines get a REAL delete grant,
-- restricted to WHICH rows only by delete_sale (M16) and the sales_delete_guard trigger above (AC44).
-- ---------------------------------------------------------------------------
revoke all on public.sales from anon, authenticated;
grant select on public.sales to authenticated;
-- No id, created_at. sale_number is insertable (create_sale sets it) but never updatable.
grant insert (tenant_id, sale_number, client_id, type, status, sale_date, delivered_date) on public.sales to authenticated;
grant update (client_id, type, status, sale_date, delivered_date, voided_at, version, updated_at) on public.sales to authenticated;
grant delete on public.sales to authenticated;

alter table public.sales enable row level security;

create policy sales_select on public.sales
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy sales_insert on public.sales
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant_id()));

create policy sales_update on public.sales
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

create policy sales_delete on public.sales
  for delete to authenticated
  using (tenant_id = (select app.current_tenant_id()));

revoke all on public.sale_lines from anon, authenticated;
grant select on public.sale_lines to authenticated;
grant insert (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total) on public.sale_lines to authenticated;
-- No update of sale_id/size_id (the PK): a "moved" line is a delete + insert.
grant update (eggs, price_per_tray, line_total, updated_at) on public.sale_lines to authenticated;
grant delete on public.sale_lines to authenticated;

alter table public.sale_lines enable row level security;

create policy sale_lines_select on public.sale_lines
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy sale_lines_insert on public.sale_lines
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant_id()));

create policy sale_lines_update on public.sale_lines
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

create policy sale_lines_delete on public.sale_lines
  for delete to authenticated
  using (tenant_id = (select app.current_tenant_id()));

revoke all on public.sale_submissions from anon, authenticated;
grant select on public.sale_submissions to authenticated;
grant insert (tenant_id, id, sale_id, payload_hash) on public.sale_submissions to authenticated;
-- No update, no delete (removed only by the sale's cascade).

alter table public.sale_submissions enable row level security;

create policy sale_submissions_select on public.sale_submissions
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy sale_submissions_insert on public.sale_submissions
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant_id()));
