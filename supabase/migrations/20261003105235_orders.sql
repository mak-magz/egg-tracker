-- M17 orders (docs/features/05-orders.md §3.1 "M17", §3.2, §3.3.1, §3.9 D1-D7)
--
-- ADDITIVE ONLY: new tables, helpers and guard triggers, plus sales.order_id. Nothing is dropped or rewritten here,
-- so this file is safe to apply alone. The pending-sale conversion is M18, the sale-side changes M19, the public
-- functions M20.
--
-- An ORDER is a promise: a header (`orders`) plus 1-20 lines (`order_lines`, PK (tenant_id, order_id, size_id), so
-- "one line per size" is a key, AC12). A DELIVERY is a normal sale whose `order_id` points here (many sales per
-- order). Delivered-so-far and remaining are NEVER stored: `app.order_delivered_eggs` computes them from the order's
-- non-voided linked sales (AC32). The one stored derived fact is `order_lines.dropped_eggs`, written once at Close
-- short (D5).
--
-- Owners hold the same JWT in the browser, so PostgREST could reach these tables directly. Every rule therefore
-- lives here for EVERY write path (AC50, D4): column-level grants, CHECK constraints, composite FKs, and the guard
-- triggers below.
--
-- New SQLSTATEs raised by this file's triggers (M20 defines the rest; docs §3.3.1):
--   TM028 an order does not have 1 to 20 lines (deferred trigger, also raised by validate_sale_lines)
--   TM046 the order is closed to this change (hint cancelled | fulfilled | closed_short)
--   TM047 cancel with a non-voided delivery (also the guard's backstop)
--   TM048 close short on an order that is not partially fulfilled (also the guard's backstop)
--   TM051 an edit that breaks a delivery (hint below_delivered | line_locked | client_locked; detail {"sizeIds":[..]})
--   TM054 an impossible state or transition (only a hand-built write reaches it)
--   TM055 a date is earlier than the order date (hint order_date here)

-- ---------------------------------------------------------------------------
-- 1. order_counters: the per-farm order number sequence (same shape as sale_counters, AC18).
-- ---------------------------------------------------------------------------
create table public.order_counters (
  tenant_id   uuid        primary key references public.tenants (id) on delete cascade,
  next_number bigint      not null default 1 check (next_number >= 1),
  updated_at  timestamptz not null default now()
);

comment on table public.order_counters is
  'One row per farm: the next order number to assign (AC18). Independent of sale_counters.';

create trigger set_updated_at
  before update on public.order_counters
  for each row execute function app.set_updated_at();

create function app.seed_order_counter(p_tenant_id uuid)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  insert into public.order_counters (tenant_id) values (p_tenant_id)
  on conflict do nothing;
end
$$;

comment on function app.seed_order_counter(uuid) is 'Seeds a farm''s order counter at 1. Idempotent. Called by the tenants insert trigger.';

create function app.seed_order_counter_trigger()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  perform app.seed_order_counter(new.id);
  return null;
end
$$;

revoke all on function app.seed_order_counter(uuid) from public;
revoke all on function app.seed_order_counter_trigger() from public;

create trigger seed_order_counter
  after insert on public.tenants
  for each row execute function app.seed_order_counter_trigger();

-- ---------------------------------------------------------------------------
-- 2. orders (the header)
-- ---------------------------------------------------------------------------
create table public.orders (
  id                         uuid        primary key default gen_random_uuid(),
  tenant_id                  uuid        not null references public.tenants (id) on delete cascade,
  -- Assigned only by create_order (M20) and by M18, never by an owner function (AC18).
  order_number               bigint      not null,
  -- An order always has a client (AC11). Not null, plain composite FK: a client is never deleted (feature 03).
  client_id                  uuid        not null,
  order_date                 date        not null,
  wanted_by                  date        null,
  status                     text        not null default 'requested'
                                         check (status in ('requested', 'confirmed', 'ready', 'partially_fulfilled', 'fulfilled', 'cancelled')),
  -- One-way flags (like sales.voided_at), not statuses.
  cancelled_at               timestamptz null,
  closed_short_at            timestamptz null,
  -- "Formerly sale #N" (AC45). Written only by M18; owners hold no grant on it.
  converted_from_sale_number bigint      null,
  -- Stale-edit marker (AC20): bumped on every real change to the header, a line OR a delivery.
  version                    bigint      not null default 1,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint orders_version_positive check (version >= 1),
  -- Composite-FK target for order_lines, order_submissions and sales.
  constraint orders_tenant_id_id_key unique (tenant_id, id),
  constraint orders_tenant_number_key unique (tenant_id, order_number),
  constraint orders_client_fk foreign key (tenant_id, client_id) references public.clients (tenant_id, id),
  constraint orders_cancelled_at_status check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint orders_closed_short_status check (closed_short_at is null or status = 'fulfilled'),
  constraint orders_wanted_not_before_order check (wanted_by is null or wanted_by >= order_date),
  -- Same UTC + 1 slack as sales_date_not_future.
  constraint orders_date_not_future check (order_date <= (now() at time zone 'utc')::date + 1)
);

comment on table public.orders is
  'An order header: a promise to deliver. Lines in order_lines; deliveries are sales with sales.order_id. Never deleted.';

-- A pending sale converts at most once: the idempotency backstop for M18.
create unique index orders_tenant_converted_key
  on public.orders (tenant_id, converted_from_sale_number)
  where converted_from_sale_number is not null;
-- The Open sort (AC3).
create index orders_tenant_open_idx
  on public.orders (tenant_id, wanted_by asc nulls last, order_date, order_number)
  where status in ('requested', 'confirmed', 'ready', 'partially_fulfilled');
-- Every other view.
create index orders_tenant_date_idx on public.orders (tenant_id, order_date desc, order_number desc);
create index orders_tenant_client_idx on public.orders (tenant_id, client_id);

create trigger set_updated_at
  before update on public.orders
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. order_lines
-- ---------------------------------------------------------------------------
create table public.order_lines (
  tenant_id      uuid        not null references public.tenants (id) on delete cascade,
  order_id       uuid        not null,
  size_id        uuid        not null,
  eggs           integer     not null check (eggs between 1 and 100000),
  price_per_tray numeric     not null check (price_per_tray > 0 and price_per_tray <= 9999.99 and price_per_tray = round(price_per_tray, 2)),
  -- Frozen at write time (AC51).
  line_total     numeric     not null check (line_total >= 0),
  -- Written once, at Close short (D5): the remainder dropped at that moment. 0 otherwise.
  dropped_eggs   integer     not null default 0 check (dropped_eggs >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint order_lines_pkey primary key (tenant_id, order_id, size_id),
  constraint order_lines_order_fk foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  -- Plain (not cascading), same "NO ACTION so a whole-tenant cascade works" reasoning as sale_lines_size_fk.
  constraint order_lines_size_fk foreign key (tenant_id, size_id) references public.sizes (tenant_id, id)
);

comment on table public.order_lines is
  'One line of an order: a size, its ordered eggs, price per tray and frozen total. PK doubles as "no size twice".';

create index order_lines_tenant_size_idx on public.order_lines (tenant_id, size_id);

create trigger set_updated_at
  before update on public.order_lines
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. order_submissions: the create_order idempotency ledger (mirror of sale_submissions). deliver_order has no
-- ledger of its own: it reuses sale_submissions (D6).
-- ---------------------------------------------------------------------------
create table public.order_submissions (
  tenant_id    uuid        not null references public.tenants (id) on delete cascade,
  id           uuid        not null,
  order_id     uuid        not null,
  payload_hash text        not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint order_submissions_pkey primary key (tenant_id, id),
  constraint order_submissions_order_fk foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);

comment on table public.order_submissions is 'Idempotency ledger for create_order, keyed by (tenant, client submissionId).';

create trigger set_updated_at
  before update on public.order_submissions
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. sales.order_id: a delivery points at its order. NOT unique (many sales per order). Composite FK: a sale can
-- never point at another farm's order. A linked sale is always a delivery. Only deliver_order sets it (M19 grants
-- it on insert and never on update).
-- ---------------------------------------------------------------------------
alter table public.sales add column order_id uuid null;
alter table public.sales
  add constraint sales_order_fk foreign key (tenant_id, order_id) references public.orders (tenant_id, id),
  add constraint sales_order_is_delivery check (order_id is null or type = 'delivery');
create index sales_tenant_order_idx on public.sales (tenant_id, order_id) where order_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Helper functions (schema app, not exposed by PostgREST).
-- ---------------------------------------------------------------------------

-- THE definition of delivered-so-far (AC32): per size, the eggs on the order's non-voided linked sales.
create function app.order_delivered_eggs(p_tenant_id uuid, p_order_id uuid)
  returns table (size_id uuid, eggs bigint)
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select sl.size_id, sum(sl.eggs)::bigint
  from public.sales s
  join public.sale_lines sl on sl.tenant_id = s.tenant_id and sl.sale_id = s.id
  where s.tenant_id = p_tenant_id and s.order_id = p_order_id and s.voided_at is null
  group by sl.size_id
$$;

comment on function app.order_delivered_eggs(uuid, uuid) is
  'AC32: per size, the eggs on an order''s non-voided deliveries. The only definition of delivered-so-far.';

-- The status an order should have from its figures (3.0). Its TypeScript twin is orderStatusFor() in
-- shared/utils/order-status.ts; the shared fixture table is asserted in pgTAP (D9).
create function app.order_status_for(p_tenant_id uuid, p_order_id uuid)
  returns text
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
declare
  v_status    text;
  v_closed    timestamptz;
  v_delivered bigint;
  v_remaining boolean;
begin
  select o.status, o.closed_short_at into v_status, v_closed
  from public.orders o where o.tenant_id = p_tenant_id and o.id = p_order_id;
  if not found then
    return null;
  end if;
  if v_status = 'cancelled' or v_closed is not null then
    return v_status;
  end if;

  select coalesce(sum(d.eggs), 0) into v_delivered from app.order_delivered_eggs(p_tenant_id, p_order_id) d;
  if v_delivered = 0 then
    return case when v_status in ('requested', 'confirmed', 'ready') then v_status else 'ready' end;
  end if;

  select exists (
    select 1
    from public.order_lines l
    left join app.order_delivered_eggs(p_tenant_id, p_order_id) d on d.size_id = l.size_id
    where l.tenant_id = p_tenant_id and l.order_id = p_order_id and l.eggs > coalesce(d.eggs, 0)
  ) into v_remaining;
  return case when v_remaining then 'partially_fulfilled' else 'fulfilled' end;
end
$$;

comment on function app.order_status_for(uuid, uuid) is
  '3.0: the status an order should have from its deliveries. Cancelled and closed short never move.';

-- Locks the order row and brings its status in line with its deliveries (deliver_order, the void trigger).
create function app.recompute_order_status(p_tenant_id uuid, p_order_id uuid, p_bump_version boolean default true)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_status text;
begin
  perform 1 from public.orders o where o.tenant_id = p_tenant_id and o.id = p_order_id for update;
  if not found then
    return;
  end if;
  v_status := app.order_status_for(p_tenant_id, p_order_id);
  update public.orders o
  set status = v_status,
      version = case when p_bump_version then o.version + 1 else o.version end
  where o.tenant_id = p_tenant_id and o.id = p_order_id;
end
$$;

comment on function app.recompute_order_status(uuid, uuid, boolean) is
  'Locks the order and sets status = order_status_for (+ version bump). Used by deliver_order and the void trigger.';

-- SHA-256 of the normalised create_order payload (lines sorted by size id: line order never matters). Same recipe
-- as app.sale_payload_hash.
create function app.order_payload_hash(
  p_client_id uuid,
  p_order_date date,
  p_wanted_by date,
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
    'order' || chr(31) || coalesce(p_client_id::text, '') || chr(31) || coalesce(p_order_date::text, '') || chr(31)
    || coalesce(p_wanted_by::text, '') || chr(31)
    || coalesce((
         select string_agg(u.size_id::text || ':' || u.eggs::text || ':' || round(u.price, 2)::text, chr(30) order by u.size_id)
         from unnest(p_size_ids, p_eggs, p_prices) u(size_id, eggs, price)
       ), ''),
    'UTF8')), 'hex')
$$;

revoke all on function app.order_delivered_eggs(uuid, uuid) from public;
revoke all on function app.order_status_for(uuid, uuid) from public;
revoke all on function app.recompute_order_status(uuid, uuid, boolean) from public;
revoke all on function app.order_payload_hash(uuid, date, date, uuid[], integer[], numeric[]) from public;

grant execute on function app.order_delivered_eggs(uuid, uuid) to authenticated;
grant execute on function app.order_status_for(uuid, uuid) to authenticated;
grant execute on function app.recompute_order_status(uuid, uuid, boolean) to authenticated;
grant execute on function app.order_payload_hash(uuid, date, date, uuid[], integer[], numeric[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Guard triggers (the database form of AC50, D4).
-- ---------------------------------------------------------------------------

-- 7a. order_lines_bounds: 1 to 20 lines at commit (deferred, per row: see M15's header for why this is a
-- constraint trigger and not a statement-level one).
create function app.order_lines_bounds()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_tenant uuid;
  v_order  uuid;
  v_count  bigint;
begin
  if tg_op = 'DELETE' then
    v_tenant := old.tenant_id;
    v_order := old.order_id;
  else
    v_tenant := new.tenant_id;
    v_order := new.order_id;
  end if;

  if not exists (select 1 from public.orders o where o.tenant_id = v_tenant and o.id = v_order) then
    return null;
  end if;

  select count(*) into v_count from public.order_lines l where l.tenant_id = v_tenant and l.order_id = v_order;
  if v_count < 1 or v_count > 20 then
    raise exception 'an order must have 1 to 20 lines' using errcode = 'TM028';
  end if;
  return null;
end
$$;

comment on function app.order_lines_bounds() is
  'Deferred constraint trigger: at commit, every touched order has 1 to 20 lines (TM028 backstop for a direct write).';

revoke all on function app.order_lines_bounds() from public;

create constraint trigger order_lines_bounds
  after insert or delete on public.order_lines
  deferrable initially deferred
  for each row execute function app.order_lines_bounds();

-- 7a2. orders_need_lines (QA B-2): the bound above fires on order_lines rows only, so a header inserted with NO line
-- (a hand-built POST /rest/v1/orders) would slip through. A deferred constraint trigger on the header insert requires
-- at least one line at commit (create_order and M18 insert the lines in the same transaction).
create function app.orders_need_lines()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if exists (select 1 from public.orders o where o.tenant_id = new.tenant_id and o.id = new.id)
     and not exists (select 1 from public.order_lines l where l.tenant_id = new.tenant_id and l.order_id = new.id) then
    raise exception 'an order must have 1 to 20 lines' using errcode = 'TM028';
  end if;
  return null;
end
$$;

comment on function app.orders_need_lines() is
  'Deferred constraint trigger: at commit, every inserted order has at least one line (TM028 backstop for a header-only insert).';

revoke all on function app.orders_need_lines() from public;

create constraint trigger orders_need_lines
  after insert on public.orders
  deferrable initially deferred
  for each row execute function app.orders_need_lines();

-- 7b. order_lines_write_guard: no line write on a cancelled / fulfilled order; eggs never below what is delivered;
-- a delivered line is never removed.
create function app.order_lines_write_guard()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_tenant    uuid;
  v_order     uuid;
  v_size      uuid;
  v_status    text;
  v_closed    timestamptz;
  v_delivered bigint;
begin
  if tg_op = 'DELETE' then
    -- A whole-farm cascade (tenant deleted) removes the lines with the tenant row already gone: allow it.
    if not exists (select 1 from public.tenants t where t.id = old.tenant_id) then
      return old;
    end if;
    v_tenant := old.tenant_id; v_order := old.order_id; v_size := old.size_id;
  else
    v_tenant := new.tenant_id; v_order := new.order_id; v_size := new.size_id;
  end if;

  select o.status, o.closed_short_at into v_status, v_closed
  from public.orders o where o.tenant_id = v_tenant and o.id = v_order;
  if not found then
    -- Order gone (cascade from the order) or never there (the FK refuses an insert): nothing to protect.
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_status in ('cancelled', 'fulfilled') then
    raise exception 'this order is closed to changes' using errcode = 'TM046',
      hint = case when v_status = 'cancelled' then 'cancelled' when v_closed is not null then 'closed_short' else 'fulfilled' end;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  select coalesce(sum(d.eggs), 0) into v_delivered
  from app.order_delivered_eggs(v_tenant, v_order) d where d.size_id = v_size;

  if tg_op = 'UPDATE' then
    if new.eggs < v_delivered then
      raise exception 'a line cannot go below what was delivered' using errcode = 'TM051', hint = 'below_delivered',
        detail = jsonb_build_object('sizeIds', jsonb_build_array(v_size))::text;
    end if;
    return new;
  end if;

  if v_delivered > 0 then
    raise exception 'a delivered line cannot be removed' using errcode = 'TM051', hint = 'line_locked',
      detail = jsonb_build_object('sizeIds', jsonb_build_array(v_size))::text;
  end if;
  return old;
end
$$;

comment on function app.order_lines_write_guard() is
  'Trigger: order lines are frozen once cancelled/fulfilled (TM046); eggs never below delivered, a delivered line never removed (TM051).';

revoke all on function app.order_lines_write_guard() from public;

create trigger order_lines_write_guard
  before insert or update or delete on public.order_lines
  for each row execute function app.order_lines_write_guard();

-- 7c. orders_write_guard: the state machine at the table (3.1.1). Whatever path writes an order, the stored
-- status agrees with the deliveries and the one-way flags never move back.
create function app.orders_write_guard()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_delivered bigint;
  v_remaining boolean;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('requested', 'confirmed', 'ready')
       or new.cancelled_at is not null or new.closed_short_at is not null or new.version <> 1 then
      raise exception 'a new order starts open' using errcode = 'TM054';
    end if;
    return new;
  end if;

  -- (1) A cancelled or closed-short order is terminal: only version / updated_at may move.
  if old.status = 'cancelled' or old.closed_short_at is not null then
    if (new.client_id, new.order_date, new.wanted_by, new.status, new.cancelled_at, new.closed_short_at)
       is distinct from (old.client_id, old.order_date, old.wanted_by, old.status, old.cancelled_at, old.closed_short_at) then
      raise exception 'this order is closed to changes' using errcode = 'TM046',
        hint = case when old.status = 'cancelled' then 'cancelled' else 'closed_short' end;
    end if;
    return new;
  end if;

  select coalesce(sum(d.eggs), 0) into v_delivered from app.order_delivered_eggs(old.tenant_id, old.id) d;

  -- (2) A fulfilled order: header frozen; status may only fall back to partially_fulfilled or ready (a void).
  if old.status = 'fulfilled' then
    if (new.client_id, new.order_date, new.wanted_by, new.cancelled_at, new.closed_short_at)
       is distinct from (old.client_id, old.order_date, old.wanted_by, old.cancelled_at, old.closed_short_at)
       or new.status not in ('fulfilled', 'partially_fulfilled', 'ready') then
      raise exception 'this order is closed to changes' using errcode = 'TM046', hint = 'fulfilled';
    end if;
  end if;

  -- (3) The one-way flags: set once, from the right state, never cleared.
  if new.cancelled_at is distinct from old.cancelled_at then
    if new.cancelled_at is null or old.status not in ('requested', 'confirmed', 'ready') or v_delivered > 0 then
      raise exception 'an order with a delivery cannot be cancelled' using errcode = 'TM047';
    end if;
  end if;
  if new.closed_short_at is distinct from old.closed_short_at then
    if new.closed_short_at is null or old.status <> 'partially_fulfilled' then
      raise exception 'only a partly delivered order can be closed short' using errcode = 'TM048';
    end if;
  end if;

  -- (4) The client is fixed once something is delivered; the order date can't pass the first delivery (AC57).
  if new.client_id <> old.client_id and v_delivered > 0 then
    raise exception 'the client cannot change after a delivery' using errcode = 'TM051', hint = 'client_locked';
  end if;
  if new.order_date > old.order_date and exists (
       select 1 from public.sales s
       where s.tenant_id = old.tenant_id and s.order_id = old.id and s.voided_at is null and s.sale_date < new.order_date) then
    raise exception 'the order date is after its first delivery' using errcode = 'TM055', hint = 'order_date';
  end if;

  -- (5) The new status must agree with the deliveries. Cancelled and closed short carry no delivery rule.
  if new.status = 'cancelled' or new.closed_short_at is not null then
    return new;
  end if;
  select exists (
    select 1
    from public.order_lines l
    left join app.order_delivered_eggs(old.tenant_id, old.id) d on d.size_id = l.size_id
    where l.tenant_id = old.tenant_id and l.order_id = old.id and l.eggs > coalesce(d.eggs, 0)
  ) into v_remaining;

  if new.status in ('requested', 'confirmed', 'ready') then
    if v_delivered <> 0 then
      raise exception 'status does not agree with the deliveries' using errcode = 'TM054';
    end if;
  elsif new.status = 'partially_fulfilled' then
    if v_delivered = 0 or not v_remaining then
      raise exception 'status does not agree with the deliveries' using errcode = 'TM054';
    end if;
  elsif new.status = 'fulfilled' then
    if v_delivered = 0 or v_remaining then
      raise exception 'status does not agree with the deliveries' using errcode = 'TM054';
    end if;
  end if;
  return new;
end
$$;

comment on function app.orders_write_guard() is
  'Trigger: the order state machine at the table. Status must agree with the deliveries; flags are one-way (TM046-TM048, TM051, TM054, TM055).';

revoke all on function app.orders_write_guard() from public;

create trigger orders_write_guard
  before insert or update on public.orders
  for each row execute function app.orders_write_guard();

-- ---------------------------------------------------------------------------
-- 8. Grants and RLS (§3.2). Orders are never deleted: no delete grant, no delete policy (AC23).
-- ---------------------------------------------------------------------------
revoke all on public.order_counters from anon, authenticated;
grant select on public.order_counters to authenticated;
grant update (next_number, updated_at) on public.order_counters to authenticated;

alter table public.order_counters enable row level security;

create policy order_counters_select on public.order_counters
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy order_counters_update on public.order_counters
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

select app.seed_order_counter(t.id) from public.tenants t;

revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;
-- No id, created_at, converted_from_sale_number. order_number is insertable but never updatable.
grant insert (tenant_id, order_number, client_id, order_date, wanted_by, status) on public.orders to authenticated;
grant update (client_id, order_date, wanted_by, status, cancelled_at, closed_short_at, version, updated_at) on public.orders to authenticated;

alter table public.orders enable row level security;

create policy orders_select on public.orders
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy orders_insert on public.orders
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant_id()));

create policy orders_update on public.orders
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

revoke all on public.order_lines from anon, authenticated;
grant select on public.order_lines to authenticated;
grant insert (tenant_id, order_id, size_id, eggs, price_per_tray, line_total, dropped_eggs) on public.order_lines to authenticated;
-- No update of order_id / size_id (the PK): a "moved" line is a delete + insert.
grant update (eggs, price_per_tray, line_total, dropped_eggs, updated_at) on public.order_lines to authenticated;
grant delete on public.order_lines to authenticated;

alter table public.order_lines enable row level security;

create policy order_lines_select on public.order_lines
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy order_lines_insert on public.order_lines
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant_id()));

create policy order_lines_update on public.order_lines
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

create policy order_lines_delete on public.order_lines
  for delete to authenticated
  using (tenant_id = (select app.current_tenant_id()));

revoke all on public.order_submissions from anon, authenticated;
grant select on public.order_submissions to authenticated;
grant insert (tenant_id, id, order_id, payload_hash) on public.order_submissions to authenticated;

alter table public.order_submissions enable row level security;

create policy order_submissions_select on public.order_submissions
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy order_submissions_insert on public.order_submissions
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant_id()));
