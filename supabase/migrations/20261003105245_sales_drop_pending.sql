-- M19 sales_drop_pending (docs/features/05-orders.md §3.1.3, §3.3.4, AC37-AC42)
--
-- DESTRUCTIVE, no down migration: drops sales.status, three public functions and the delete machinery. Take a
-- backup before applying to a hosted database. M18 has already moved every pending sale into an order, so no
-- pending row exists here (asserted below).
--
-- After this file every sale is a real, completed transaction that has already left the farm:
--   * no status, no pending, no mark-delivered, no mark-pending;
--   * sales are VOID-ONLY: no delete grant, no delete policy, no delete function, no delete route (AC40);
--   * one date: `sale_date` is the day the eggs left (decision U1). `delivered_date` stays as a GENERATED copy of
--     it (decision U3), so it can never differ and cannot be written.
--
-- Retired SQLSTATEs, never reused: TM034, TM039, TM041, TM042. TM035 was never used and stays a gap.

-- ---------------------------------------------------------------------------
-- 1. Drop the old public functions (their signatures change or they go) and the helpers only they used.
-- ---------------------------------------------------------------------------
drop function public.mark_sale_delivered(uuid, uuid, date, boolean);
drop function public.mark_sale_pending(uuid, uuid);
drop function public.delete_sale(uuid, uuid);
drop function public.list_sales(uuid, date, date, text, text, uuid, int, int, boolean);
drop function public.create_sale(uuid, uuid, text, date, uuid[], integer[], numeric[], uuid, date, boolean);
drop function public.update_sale(uuid, uuid, bigint, text, date, uuid[], integer[], numeric[], uuid, date, boolean);
drop function app.derive_sale_status(text, date, date);
drop function app.list_sales_json(uuid, date, date, text, text, uuid, int, int, boolean);
drop function app.sale_payload_hash(text, uuid, date, date, uuid[], integer[], numeric[]);

-- ---------------------------------------------------------------------------
-- 2. Sales become void-only at the database.
-- ---------------------------------------------------------------------------
drop trigger sales_delete_guard on public.sales;
drop function app.sales_delete_guard();
drop policy sales_delete on public.sales;
revoke delete on public.sales from authenticated;

-- ---------------------------------------------------------------------------
-- 3. The one date, and the status column goes.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.sales s where s.status = 'pending' or s.delivered_date is null) then
    raise exception 'a pending sale remains: M18 must run before M19' using errcode = 'TM054';
  end if;
end
$$;

-- Decision U1: a sale's date is the day the eggs left. Old deliveries logged one day and delivered later move to
-- their delivered date.
update public.sales set sale_date = delivered_date where sale_date <> delivered_date;

alter table public.sales
  drop constraint sales_status_delivered_date,
  drop constraint sales_on_site_complete,
  drop constraint sales_voided_only_complete,
  drop constraint sales_on_site_same_day,
  drop constraint sales_delivered_not_before_sale,
  drop constraint sales_delivered_date_not_future;
drop index public.sales_tenant_status_idx;
alter table public.sales drop column status;
-- Not null by construction, can never differ from sale_date, not writable (it leaves the insert and update grants).
alter table public.sales
  drop column delivered_date,
  add column delivered_date date generated always as (sale_date) stored;

comment on table public.sales is
  'A sale''s header: one sale number, a type (delivery/on_site), one date, lines in sale_lines. Always a real sale; void-only. order_id links a delivery to its order.';
comment on column public.sales.delivered_date is
  'Generated copy of sale_date (decision U3): a sale has ONE date. Candidate for a later cleanup.';

-- ---------------------------------------------------------------------------
-- 4. Grants: order_id is insertable (only deliver_order sets it) and never updatable. No delivered_date, no status.
-- ---------------------------------------------------------------------------
revoke insert, update on public.sales from authenticated;
grant insert (tenant_id, sale_number, client_id, type, sale_date, order_id) on public.sales to authenticated;
grant update (client_id, type, sale_date, voided_at, version, updated_at) on public.sales to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Sale-side functions and triggers.
-- ---------------------------------------------------------------------------

-- SHA-256 of the normalised create_sale payload: no delivered date any more. Excludes confirm_shortfall.
create function app.sale_payload_hash(
  p_type text,
  p_client_id uuid,
  p_sale_date date,
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
    || coalesce((
         select string_agg(u.size_id::text || ':' || u.eggs::text || ':' || round(u.price, 2)::text, chr(30) order by u.size_id)
         from unnest(p_size_ids, p_eggs, p_prices) u(size_id, eggs, price)
       ), ''),
    'UTF8')), 'hex')
$$;

-- The ONE on-hand calculation (AC41): good production minus the eggs of NON-VOIDED sales, by size. Every sale is
-- real now, so the old status test is gone. Orders appear nowhere in it (AC10).
create or replace function app.on_hand_json(p_tenant_id uuid, p_size_ids uuid[] default null)
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
    where sl.tenant_id = p_tenant_id and s.voided_at is null
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
  'AC41: good production minus non-voided sale eggs, by size. The ONE on-hand calculation. Orders never enter it.';

-- One sale as { id, saleNumber, type, clientId, saleDate, orderId, orderNumber, version, voidedAt, lines, saleTotal }.
create or replace function app.sale_json(p_tenant_id uuid, p_sale_id uuid)
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
    'clientId', s.client_id,
    'saleDate', to_char(s.sale_date, 'YYYY-MM-DD'),
    'orderId', s.order_id,
    'orderNumber', (select o.order_number from public.orders o where o.tenant_id = s.tenant_id and o.id = s.order_id),
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

-- Sales in [p_from, p_to] (null = open-ended), filtered and paginated server-side, as ONE jsonb value
-- { hasAny, total, sales }, newest sale_date first then highest sale_number (AC4). hasAny ignores every filter.
create function app.list_sales_json(
  p_tenant_id uuid,
  p_from date,
  p_to date,
  p_type text,
  p_client_id uuid,
  p_limit int,
  p_offset int,
  p_include_voided boolean default false
)
  returns jsonb
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with matched as (
    select s.id, s.sale_date, s.sale_number
    from public.sales s
    where s.tenant_id = p_tenant_id
      and (p_from is null or s.sale_date >= p_from)
      and (p_to is null or s.sale_date <= p_to)
      and (p_type is null or s.type = p_type)
      and (p_client_id is null or s.client_id = p_client_id)
      and (p_include_voided or s.voided_at is null)
  ), page as (
    select m.id, m.sale_date, m.sale_number
    from matched m
    order by m.sale_date desc, m.sale_number desc
    limit p_limit offset coalesce(p_offset, 0)
  )
  select jsonb_build_object(
    'hasAny', exists (select 1 from public.sales x where x.tenant_id = p_tenant_id),
    'total', (select count(*) from matched),
    'sales', coalesce(
      (select jsonb_agg(app.sale_json(p_tenant_id, p.id) order by p.sale_date desc, p.sale_number desc) from page p),
      '[]'::jsonb)
  )
$$;

comment on function app.list_sales_json(uuid, date, date, text, uuid, int, int, boolean) is
  'AC4/AC7/AC10/AC39/AC68: filtered, paginated sales as one jsonb value.';

revoke all on function app.sale_payload_hash(text, uuid, date, uuid[], integer[], numeric[]) from public;
revoke all on function app.list_sales_json(uuid, date, date, text, uuid, int, int, boolean) from public;
grant execute on function app.sale_payload_hash(text, uuid, date, uuid[], integer[], numeric[]) to authenticated;
grant execute on function app.list_sales_json(uuid, date, date, text, uuid, int, int, boolean) to authenticated;

-- ---- triggers ----

-- sale_lines_linked_guard: a delivery's lines are written only by deliver_order, which sets the transaction-local
-- flag app.order_delivery = 'on' around its own insert. The flag cannot be set from the browser: PostgREST only
-- exposes functions in the exposed schemas, and pg_catalog.set_config is not one (pgTAP proves it).
create function app.sale_lines_linked_guard()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_tenant uuid;
  v_sale   uuid;
  v_order  uuid;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.tenants t where t.id = old.tenant_id) then
      return old;
    end if;
    v_tenant := old.tenant_id; v_sale := old.sale_id;
  else
    v_tenant := new.tenant_id; v_sale := new.sale_id;
  end if;

  select s.order_id into v_order from public.sales s where s.tenant_id = v_tenant and s.id = v_sale;
  if not found or v_order is null or coalesce(current_setting('app.order_delivery', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'a delivery made from an order cannot have its lines changed' using errcode = 'TM053';
end
$$;

comment on function app.sale_lines_linked_guard() is
  'Trigger: lines of a sale linked to an order change only inside deliver_order (TM053, AC36).';

revoke all on function app.sale_lines_linked_guard() from public;

create trigger sale_lines_linked_guard
  before insert or update or delete on public.sale_lines
  for each row execute function app.sale_lines_linked_guard();

-- sales_order_id_guard (QA B-1): order_id is insertable by grant (deliver_order must set it), so a hand-built
-- POST /rest/v1/sales with order_id would link a header to an order and make it count as a delivery. The same
-- transaction-local flag as the lines guard: only deliver_order, which sets app.order_delivery around its insert.
create function app.sales_order_id_guard()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if new.order_id is not null and coalesce(current_setting('app.order_delivery', true), '') <> 'on' then
    raise exception 'a delivery can only be created by delivering an order' using errcode = 'TM053';
  end if;
  return new;
end
$$;

comment on function app.sales_order_id_guard() is
  'Trigger: sales.order_id is set only inside deliver_order (TM053, QA B-1).';

revoke all on function app.sales_order_id_guard() from public;

create trigger sales_order_id_guard
  before insert on public.sales
  for each row execute function app.sales_order_id_guard();

-- sales_need_lines (QA B-2, the same hole from feature 04): a sale header inserted with no line is refused at commit.
create function app.sales_need_lines()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if exists (select 1 from public.sales s where s.tenant_id = new.tenant_id and s.id = new.id)
     and not exists (select 1 from public.sale_lines l where l.tenant_id = new.tenant_id and l.sale_id = new.id) then
    raise exception 'a sale must have 1 to 20 lines' using errcode = 'TM028';
  end if;
  return null;
end
$$;

comment on function app.sales_need_lines() is
  'Deferred constraint trigger: at commit, every inserted sale has at least one line (TM028 backstop for a header-only insert).';

revoke all on function app.sales_need_lines() from public;

create constraint trigger sales_need_lines
  after insert on public.sales
  deferrable initially deferred
  for each row execute function app.sales_need_lines();

-- sales_write_guard (extended): voided_at one-way (TM040), plus a linked sale's client, type and order never change.
create or replace function app.sales_write_guard()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'voided_at is one-way and cannot change once set' using errcode = 'TM040';
  end if;
  if new.order_id is distinct from old.order_id
     or (old.order_id is not null and (new.client_id is distinct from old.client_id or new.type <> old.type)) then
    raise exception 'a delivery made from an order cannot change its client, type or order' using errcode = 'TM053';
  end if;
  return new;
end
$$;

comment on function app.sales_write_guard() is
  'Trigger: voided_at is one-way (TM040); a linked sale''s client, type and order never change (TM053).';

-- sales_void_sync_order: voiding a delivery brings its order's status and version right IN THE SAME STATEMENT, so
-- even a hand-built `update sales set voided_at = now()` leaves the order correct (AC35).
create function app.sales_void_sync_order()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  perform app.recompute_order_status(new.tenant_id, new.order_id);
  return null;
end
$$;

comment on function app.sales_void_sync_order() is
  'Trigger: voiding a linked sale recomputes its order''s status and bumps the order''s version (AC35).';

revoke all on function app.sales_void_sync_order() from public;

create trigger sales_void_sync_order
  after update of voided_at on public.sales
  for each row
  when (old.voided_at is null and new.voided_at is not null and new.order_id is not null)
  execute function app.sales_void_sync_order();

-- ---------------------------------------------------------------------------
-- 6. Public sale functions (3.3.4).
-- ---------------------------------------------------------------------------

-- create_sale (AC37, AC38): { sale, replayed }. A DIRECT sale: it has already left the farm on p_sale_date, so the
-- stock-shortfall check applies to EVERY new sale. order_id is never set here.
create function public.create_sale(
  p_tenant_id uuid,
  p_submission_id uuid,
  p_type text,
  p_sale_date date,
  p_size_ids uuid[],
  p_eggs integer[],
  p_prices numeric[],
  p_client_id uuid default null,
  p_confirm_shortfall boolean default false
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_hash          text;
  v_prev          record;
  v_number        bigint;
  v_sale_id       uuid;
  v_eggs_per_tray integer;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_submission_id is null then
    raise exception 'submission id is required' using errcode = 'TM005';
  end if;
  if p_type is null or p_type not in ('delivery', 'on_site') then
    raise exception 'malformed type' using errcode = 'TM005';
  end if;
  if p_sale_date is null then
    raise exception 'sale date is required' using errcode = 'TM005';
  end if;
  if p_size_ids is null or p_eggs is null or p_prices is null
     or cardinality(p_size_ids) <> cardinality(p_eggs) or cardinality(p_size_ids) <> cardinality(p_prices) then
    raise exception 'malformed lines' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  v_hash := app.sale_payload_hash(p_type, p_client_id, p_sale_date, p_size_ids, p_eggs, p_prices);

  -- A replay writes nothing and returns the FIRST sale. Checked before any other validation, so a retry can never
  -- fail for the sale it just created.
  select s.sale_id, s.payload_hash into v_prev
  from public.sale_submissions s
  where s.tenant_id = p_tenant_id and s.id = p_submission_id;
  if found then
    if v_prev.payload_hash <> v_hash then
      raise exception 'submission id was used with another payload' using errcode = 'TM038';
    end if;
    return jsonb_build_object('sale', app.sale_json(p_tenant_id, v_prev.sale_id), 'replayed', true);
  end if;

  perform app.validate_sale_lines(p_tenant_id, p_size_ids, p_eggs, p_prices, '{}'::uuid[]);
  perform app.validate_sale_client(p_tenant_id, p_type, p_client_id, null);

  if p_sale_date > (now() at time zone 'utc')::date + 1 then
    raise exception 'sale date is in the future' using errcode = 'TM002', hint = 'sale_date';
  end if;

  -- Every sale takes every line's eggs in FULL (AC38). Nothing is written if this raises.
  perform app.check_sale_shortfall(p_tenant_id, p_size_ids, p_eggs, p_confirm_shortfall);

  update public.sale_counters
  set next_number = next_number + 1
  where tenant_id = p_tenant_id
  returning next_number - 1 into v_number;
  if v_number is null then
    raise exception 'no sale counter for this farm' using errcode = 'TM006';
  end if;

  select coalesce(t.eggs_per_tray, 30) into v_eggs_per_tray from public.tenants t where t.id = p_tenant_id;

  insert into public.sales (tenant_id, sale_number, client_id, type, sale_date)
  values (p_tenant_id, v_number, p_client_id, p_type, p_sale_date)
  returning id into v_sale_id;

  insert into public.sale_lines (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total)
  select p_tenant_id, v_sale_id, u.size_id, u.eggs, round(u.price, 2), app.sale_line_total(u.price, u.eggs, v_eggs_per_tray)
  from unnest(p_size_ids, p_eggs, p_prices) u(size_id, eggs, price);

  insert into public.sale_submissions (tenant_id, id, sale_id, payload_hash)
  values (p_tenant_id, p_submission_id, v_sale_id, v_hash);

  return jsonb_build_object('sale', app.sale_json(p_tenant_id, v_sale_id), 'replayed', false);
end
$$;

-- update_sale (AC36, AC42): { sale, changed }. REPLACES the whole sale: header + every line.
--   * DIRECT sale: stock delta = new eggs minus old eggs per size (both sides always count). A type change moves no
--     stock and never asks (AC42).
--   * LINKED sale (order_id set): client, type and the line set must equal what is stored (TM053); only sale_date
--     may change, not before the order date (TM055 sale_date) and not in the future (TM002). It bumps the sale's
--     version AND the order's (the order's delivery list shows that date). No shortfall check: stock is unchanged.
create function public.update_sale(
  p_tenant_id uuid,
  p_sale_id uuid,
  p_version bigint,
  p_type text,
  p_sale_date date,
  p_size_ids uuid[],
  p_eggs integer[],
  p_prices numeric[],
  p_client_id uuid default null,
  p_confirm_shortfall boolean default false
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur           record;
  v_order_date    date;
  v_cur_size_ids  uuid[];
  v_cur_eggs      integer[];
  v_cur_prices    numeric[];
  v_new_size_ids  uuid[];
  v_new_eggs      integer[];
  v_new_prices    numeric[];
  v_unchanged     boolean;
  v_eggs_per_tray integer;
  v_union_ids     uuid[];
  v_needed        integer[];
begin
  perform app.assert_tenant(p_tenant_id);
  if p_sale_id is null or p_version is null then
    raise exception 'sale id and version are required' using errcode = 'TM005';
  end if;
  if p_type is null or p_type not in ('delivery', 'on_site') or p_sale_date is null then
    raise exception 'malformed sale' using errcode = 'TM005';
  end if;
  if p_size_ids is null or p_eggs is null or p_prices is null
     or cardinality(p_size_ids) <> cardinality(p_eggs) or cardinality(p_size_ids) <> cardinality(p_prices) then
    raise exception 'malformed lines' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  select s.id, s.client_id, s.type, s.sale_date, s.version, s.voided_at, s.order_id
  into v_cur
  from public.sales s
  where s.tenant_id = p_tenant_id and s.id = p_sale_id;
  if not found then
    raise exception 'unknown sale' using errcode = 'TM027';
  end if;
  -- A voided sale accepts no further change of any kind (AC68).
  if v_cur.voided_at is not null then
    raise exception 'sale is voided' using errcode = 'TM043';
  end if;

  select array_agg(l.size_id order by l.size_id), array_agg(l.eggs order by l.size_id), array_agg(l.price_per_tray order by l.size_id)
  into v_cur_size_ids, v_cur_eggs, v_cur_prices
  from public.sale_lines l
  where l.tenant_id = p_tenant_id and l.sale_id = p_sale_id;

  select array_agg(u.size_id order by u.size_id), array_agg(u.eggs order by u.size_id), array_agg(round(u.price, 2) order by u.size_id)
  into v_new_size_ids, v_new_eggs, v_new_prices
  from unnest(p_size_ids, p_eggs, p_prices) u(size_id, eggs, price);

  -- ---- LINKED sale: only the date may change (AC36) ----
  if v_cur.order_id is not null then
    if p_type <> v_cur.type
       or p_client_id is distinct from v_cur.client_id
       or v_new_size_ids is distinct from v_cur_size_ids
       or v_new_eggs is distinct from v_cur_eggs
       or v_new_prices is distinct from v_cur_prices then
      raise exception 'a delivery made from an order can only change its date' using errcode = 'TM053';
    end if;

    if p_sale_date = v_cur.sale_date then
      return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', false);
    end if;

    if p_sale_date > (now() at time zone 'utc')::date + 1 then
      raise exception 'sale date is in the future' using errcode = 'TM002', hint = 'sale_date';
    end if;
    select o.order_date into v_order_date from public.orders o where o.tenant_id = p_tenant_id and o.id = v_cur.order_id;
    if p_sale_date < v_order_date then
      raise exception 'sale date is before the order date' using errcode = 'TM055', hint = 'sale_date';
    end if;
    if p_version <> v_cur.version then
      raise exception 'sale was changed elsewhere' using errcode = 'TM036';
    end if;

    update public.sales s set sale_date = p_sale_date, version = s.version + 1
    where s.tenant_id = p_tenant_id and s.id = p_sale_id;
    perform 1 from public.orders o where o.tenant_id = p_tenant_id and o.id = v_cur.order_id for update;
    update public.orders o set version = o.version + 1 where o.tenant_id = p_tenant_id and o.id = v_cur.order_id;

    return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', true);
  end if;

  -- ---- DIRECT sale ----
  -- Kept, since-archived size lines are never refused: the sale's OWN size set, as it was before this edit, is passed as "existing".
  perform app.validate_sale_lines(p_tenant_id, p_size_ids, p_eggs, p_prices, coalesce(v_cur_size_ids, '{}'::uuid[]));
  perform app.validate_sale_client(p_tenant_id, p_type, p_client_id, v_cur.client_id);

  if p_sale_date > (now() at time zone 'utc')::date + 1 then
    raise exception 'sale date is in the future' using errcode = 'TM002', hint = 'sale_date';
  end if;

  -- Nothing to write, whatever the version says: a retry of an edit whose reply was lost, or the same edit made
  -- elsewhere. No version bump, so an open form of this sale isn't made stale by a no-op.
  v_unchanged :=
    v_cur.type = p_type
    and v_cur.client_id is not distinct from p_client_id
    and v_cur.sale_date = p_sale_date
    and v_cur_size_ids = v_new_size_ids
    and v_cur_eggs = v_new_eggs
    and v_cur_prices = v_new_prices;

  if v_unchanged then
    return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', false);
  end if;

  if p_version <> v_cur.version then
    raise exception 'sale was changed elsewhere' using errcode = 'TM036';
  end if;

  -- Per size, what this save NEWLY takes (new eggs minus old eggs), over the union of old and new sizes (AC42):
  -- never warns for a size this save takes less from, or the same from. A type change moves no stock.
  with old_lines as (
    select t.size_id, t.eggs from unnest(coalesce(v_cur_size_ids, '{}'::uuid[]), coalesce(v_cur_eggs, '{}'::integer[])) as t(size_id, eggs)
  ), new_lines as (
    select t.size_id, t.eggs from unnest(v_new_size_ids, v_new_eggs) as t(size_id, eggs)
  ), union_ids as (
    select size_id from old_lines union select size_id from new_lines
  )
  select array_agg(u.size_id order by u.size_id),
         array_agg(coalesce(nl.eggs, 0) - coalesce(ol.eggs, 0) order by u.size_id)
  into v_union_ids, v_needed
  from union_ids u
  left join old_lines ol on ol.size_id = u.size_id
  left join new_lines nl on nl.size_id = u.size_id;

  perform app.check_sale_shortfall(p_tenant_id, v_union_ids, v_needed, p_confirm_shortfall);

  select coalesce(t.eggs_per_tray, 30) into v_eggs_per_tray from public.tenants t where t.id = p_tenant_id;

  delete from public.sale_lines l
  where l.tenant_id = p_tenant_id and l.sale_id = p_sale_id and l.size_id <> all (p_size_ids);

  -- Keeps a line's FROZEN total (AC55) whenever its eggs and price are unchanged.
  insert into public.sale_lines (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total)
  select p_tenant_id, p_sale_id, u.size_id, u.eggs, round(u.price, 2), app.sale_line_total(u.price, u.eggs, v_eggs_per_tray)
  from unnest(p_size_ids, p_eggs, p_prices) u(size_id, eggs, price)
  on conflict (tenant_id, sale_id, size_id) do update
  set eggs = excluded.eggs,
      price_per_tray = excluded.price_per_tray,
      line_total = case
        when sale_lines.eggs = excluded.eggs and sale_lines.price_per_tray = excluded.price_per_tray
          then sale_lines.line_total
        else excluded.line_total
      end;

  update public.sales s
  set client_id = p_client_id, type = p_type, sale_date = p_sale_date, version = s.version + 1
  where s.tenant_id = p_tenant_id and s.id = p_sale_id;

  return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', true);
end
$$;

-- void_sale (AC67, AC68, AC35): { sale, changed, order }. One-way, never a shortfall check (voiding only gives eggs
-- back). The sales_void_sync_order trigger brings a linked order right in the same statement; `order` is that
-- recomputed order (or null for a direct sale) so the UI updates it without a second call. Idempotent once voided.
-- app.order_json is created in M20; plpgsql resolves it when this runs, not when it is created.
create or replace function public.void_sale(p_tenant_id uuid, p_sale_id uuid, p_version bigint)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur record;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_sale_id is null or p_version is null then
    raise exception 'sale id and version are required' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  select s.voided_at, s.version, s.order_id into v_cur
  from public.sales s where s.tenant_id = p_tenant_id and s.id = p_sale_id;
  if not found then
    raise exception 'unknown sale' using errcode = 'TM027';
  end if;

  if v_cur.voided_at is not null then
    return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', false,
      'order', case when v_cur.order_id is null then null else app.order_json(p_tenant_id, v_cur.order_id, true) end);
  end if;
  if p_version <> v_cur.version then
    raise exception 'sale was changed elsewhere' using errcode = 'TM036';
  end if;

  update public.sales s
  set voided_at = now(), version = s.version + 1
  where s.tenant_id = p_tenant_id and s.id = p_sale_id;

  return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', true,
    'order', case when v_cur.order_id is null then null else app.order_json(p_tenant_id, v_cur.order_id, true) end);
end
$$;

-- list_sales (AC4, AC39, AC68): { hasAny, total, sales }. No status filter any more.
create function public.list_sales(
  p_tenant_id uuid,
  p_from date default null,
  p_to date default null,
  p_type text default null,
  p_client_id uuid default null,
  p_limit int default 25,
  p_offset int default 0,
  p_include_voided boolean default false
)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  perform app.assert_tenant(p_tenant_id);
  return app.list_sales_json(p_tenant_id, p_from, p_to, p_type, p_client_id, p_limit, p_offset, p_include_voided);
end
$$;

revoke execute on function public.create_sale(uuid, uuid, text, date, uuid[], integer[], numeric[], uuid, boolean) from public, anon;
revoke execute on function public.update_sale(uuid, uuid, bigint, text, date, uuid[], integer[], numeric[], uuid, boolean) from public, anon;
revoke execute on function public.void_sale(uuid, uuid, bigint) from public, anon;
revoke execute on function public.list_sales(uuid, date, date, text, uuid, int, int, boolean) from public, anon;

grant execute on function public.create_sale(uuid, uuid, text, date, uuid[], integer[], numeric[], uuid, boolean) to authenticated;
grant execute on function public.update_sale(uuid, uuid, bigint, text, date, uuid[], integer[], numeric[], uuid, boolean) to authenticated;
grant execute on function public.void_sale(uuid, uuid, bigint) to authenticated;
grant execute on function public.list_sales(uuid, date, date, text, uuid, int, int, boolean) to authenticated;
