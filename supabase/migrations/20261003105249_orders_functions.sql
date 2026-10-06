-- M20 orders_functions (docs/features/05-orders.md §3.1.4, §3.3)
--
-- Eight public functions, each ONE security invoker function = one transaction per rpc call, RLS applying as for a
-- direct query. Each takes p_tenant_id (filled by TenantDb.rpc from the server context, never from the request) and
-- first asserts it equals app.current_tenant_id() (TM006). Every write takes app.lock_tenant_sales (D7: one per-farm
-- lock for sale numbers, order numbers, the cap and the stock check), THEN the order row lock, in that order always.
--
-- SQLSTATEs (continuing after TM043; see M17 for the ones its triggers raise):
--   TM044 the order isn't one of this farm's (foreign or unknown: same answer)
--   TM045 the order's version isn't the one the form opened with, and the request would change something
--   TM046 the order is closed to this change (hint cancelled | fulfilled | closed_short)
--   TM047 cancel_order: the order has a non-voided delivery
--   TM048 close_order: the order isn't partially fulfilled
--   TM049 set_order_status: the order is partially fulfilled (has a non-voided delivery)
--   TM050 deliver_order: a line exceeds what is remaining
--   TM051 update_order: breaks a delivery (hint below_delivered | line_locked | client_locked; detail {"sizeIds":[..]})
--   TM052 deliver_order: a size isn't a line of this order (hint not_on_order), or the delivery has no lines (hint empty)
--   TM053 a linked sale's client, type or lines changed (M19)
--   TM054 an impossible state or transition (M17 guard)
--   TM055 a date is earlier than the order date (hint wanted_by | delivered_date | sale_date | order_date)
-- Reused with the same meaning: TM002, TM005, TM006, TM028-TM033 (via validate_order_lines / validate_sale_client),
-- TM036, TM037 (stock short), TM038, TM040, TM043.
-- No exception message or detail below ever holds a client name, phone or price (AC54).

-- ---------------------------------------------------------------------------
-- 1. JSON builders (schema app). The shape is exactly Order / OrderDetail in shared/types/api.ts.
-- ---------------------------------------------------------------------------

-- One order as OrderJson (and, with p_with_deliveries, OrderDetailJson), or null. remainingEggs is 0 on a cancelled,
-- fulfilled or closed-short order; delivered-so-far is computed here every time, never stored.
create function app.order_json(p_tenant_id uuid, p_order_id uuid, p_with_deliveries boolean default false)
  returns jsonb
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'orderNumber', o.order_number,
    'clientId', o.client_id,
    'orderDate', to_char(o.order_date, 'YYYY-MM-DD'),
    'wantedBy', case when o.wanted_by is null then null else to_char(o.wanted_by, 'YYYY-MM-DD') end,
    'status', o.status,
    'closedShortAt', case when o.closed_short_at is null then null else to_char(o.closed_short_at at time zone 'utc', 'YYYY-MM-DD') end,
    'cancelledAt', case when o.cancelled_at is null then null else to_char(o.cancelled_at at time zone 'utc', 'YYYY-MM-DD') end,
    'convertedFromSaleNumber', o.converted_from_sale_number,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sizeId', l.size_id,
               'orderedEggs', l.eggs,
               'deliveredEggs', coalesce(d.eggs, 0),
               'remainingEggs', case
                  when o.status in ('cancelled', 'fulfilled') or o.closed_short_at is not null then 0
                  else greatest(l.eggs - coalesce(d.eggs, 0), 0) end,
               'droppedEggs', l.dropped_eggs,
               'pricePerTray', l.price_per_tray,
               'lineTotal', l.line_total)
             order by z.sort_order, z.name, z.id)
      from public.order_lines l
      left join public.sizes z on z.tenant_id = l.tenant_id and z.id = l.size_id
      left join app.order_delivered_eggs(p_tenant_id, p_order_id) d on d.size_id = l.size_id
      where l.tenant_id = p_tenant_id and l.order_id = o.id
    ), '[]'::jsonb),
    'orderTotal', coalesce((select sum(l.line_total) from public.order_lines l where l.tenant_id = p_tenant_id and l.order_id = o.id), 0),
    'deliveryCount', (select count(*) from public.sales s where s.tenant_id = p_tenant_id and s.order_id = o.id and s.voided_at is null),
    'voidedDeliveryCount', (select count(*) from public.sales s where s.tenant_id = p_tenant_id and s.order_id = o.id and s.voided_at is not null),
    'version', o.version
  ) || case when p_with_deliveries then jsonb_build_object('deliveries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'saleId', s.id,
               'saleNumber', s.sale_number,
               'deliveredDate', to_char(s.sale_date, 'YYYY-MM-DD'),
               'voidedAt', case when s.voided_at is null then null else to_char(s.voided_at at time zone 'utc', 'YYYY-MM-DD') end,
               'lines', coalesce((
                 select jsonb_agg(jsonb_build_object('sizeId', sl.size_id, 'eggs', sl.eggs) order by z.sort_order, z.name, z.id)
                 from public.sale_lines sl
                 left join public.sizes z on z.tenant_id = sl.tenant_id and z.id = sl.size_id
                 where sl.tenant_id = p_tenant_id and sl.sale_id = s.id
               ), '[]'::jsonb))
             order by s.sale_date desc, s.sale_number desc)
      from public.sales s
      where s.tenant_id = p_tenant_id and s.order_id = o.id
    ), '[]'::jsonb)) else '{}'::jsonb end
  from public.orders o
  where o.tenant_id = p_tenant_id and o.id = p_order_id
$$;

comment on function app.order_json(uuid, uuid, boolean) is
  'One order (header + lines + computed progress, optionally its deliveries) as one jsonb value, or null.';

-- Orders as ONE jsonb value { hasAny, total, orders }. 'open' returns EVERY open order and ignores limit / offset
-- (AC5); the other views page. Open sort: wanted_by soonest first (none last), then oldest order (AC3); every
-- other view: newest order date, then highest number. hasAny ignores every filter; total is the filtered count.
create function app.list_orders_json(
  p_tenant_id uuid,
  p_view text,
  p_client_id uuid,
  p_from date,
  p_to date,
  p_limit int,
  p_offset int
)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
declare
  v_result jsonb;
  v_off    int := coalesce(p_offset, 0);
  v_lim    int := coalesce(p_limit, 25);
begin
  if p_view is null or p_view not in ('open', 'all', 'fulfilled', 'cancelled') then
    raise exception 'malformed view' using errcode = 'TM005';
  end if;

  -- SET-BASED (QA S-1): one pass aggregates every page order's lines, delivered-so-far and delivery counts; no
  -- per-order function call. The shape is exactly app.order_json's without `deliveries` (the list never carries them).
  with matched as (
    select o.id, o.order_number, o.client_id, o.order_date, o.wanted_by, o.status, o.closed_short_at, o.cancelled_at,
           o.converted_from_sale_number, o.version,
           row_number() over (order by o.wanted_by asc nulls last, o.order_date asc, o.order_number asc) as rn_open,
           row_number() over (order by o.order_date desc, o.order_number desc) as rn_other
    from public.orders o
    where o.tenant_id = p_tenant_id
      and case p_view
            when 'open' then o.status in ('requested', 'confirmed', 'ready', 'partially_fulfilled')
            when 'all' then true
            else o.status = p_view
          end
      and (p_client_id is null or o.client_id = p_client_id)
      and (p_from is null or o.order_date >= p_from)
      and (p_to is null or o.order_date <= p_to)
  ), page as (
    -- The open view is NEVER paged (AC5); the other views are.
    select m.*, case when p_view = 'open' then m.rn_open else m.rn_other end as rn
    from matched m
    where p_view = 'open' or (m.rn_other > v_off and m.rn_other <= v_off + v_lim)
  ), delivered as (
    select s.order_id, sl.size_id, sum(sl.eggs)::bigint as eggs
    from public.sales s
    join public.sale_lines sl on sl.tenant_id = s.tenant_id and sl.sale_id = s.id
    where s.tenant_id = p_tenant_id and s.voided_at is null and s.order_id in (select id from page)
    group by s.order_id, sl.size_id
  ), counts as (
    select s.order_id,
           count(*) filter (where s.voided_at is null) as n,
           count(*) filter (where s.voided_at is not null) as n_voided
    from public.sales s
    where s.tenant_id = p_tenant_id and s.order_id in (select id from page)
    group by s.order_id
  ), lines as (
    select l.order_id,
           jsonb_agg(jsonb_build_object(
             'sizeId', l.size_id,
             'orderedEggs', l.eggs,
             'deliveredEggs', coalesce(d.eggs, 0),
             'remainingEggs', case
                when p.status in ('cancelled', 'fulfilled') or p.closed_short_at is not null then 0
                else greatest(l.eggs - coalesce(d.eggs, 0), 0) end,
             'droppedEggs', l.dropped_eggs,
             'pricePerTray', l.price_per_tray,
             'lineTotal', l.line_total) order by z.sort_order, z.name, z.id) as lines,
           sum(l.line_total) as total
    from public.order_lines l
    join page p on p.id = l.order_id
    left join public.sizes z on z.tenant_id = l.tenant_id and z.id = l.size_id
    left join delivered d on d.order_id = l.order_id and d.size_id = l.size_id
    where l.tenant_id = p_tenant_id
    group by l.order_id
  )
  select jsonb_build_object(
    'hasAny', exists (select 1 from public.orders x where x.tenant_id = p_tenant_id),
    'total', (select count(*) from matched),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'orderNumber', p.order_number,
        'clientId', p.client_id,
        'orderDate', to_char(p.order_date, 'YYYY-MM-DD'),
        'wantedBy', case when p.wanted_by is null then null else to_char(p.wanted_by, 'YYYY-MM-DD') end,
        'status', p.status,
        'closedShortAt', case when p.closed_short_at is null then null else to_char(p.closed_short_at at time zone 'utc', 'YYYY-MM-DD') end,
        'cancelledAt', case when p.cancelled_at is null then null else to_char(p.cancelled_at at time zone 'utc', 'YYYY-MM-DD') end,
        'convertedFromSaleNumber', p.converted_from_sale_number,
        'lines', coalesce(ln.lines, '[]'::jsonb),
        'orderTotal', coalesce(ln.total, 0),
        'deliveryCount', coalesce(c.n, 0),
        'voidedDeliveryCount', coalesce(c.n_voided, 0),
        'version', p.version) order by p.rn)
      from page p
      left join lines ln on ln.order_id = p.id
      left join counts c on c.order_id = p.id
    ), '[]'::jsonb))
  into v_result;
  return v_result;
end
$$;

comment on function app.list_orders_json(uuid, text, uuid, date, date, int, int) is
  'AC2-AC6, AC49: filtered orders as one jsonb value. The open view is never capped (AC5).';

-- Line rules for orders: the sale rules, literally the same function (TM028-TM033), so they cannot drift (D11).
create function app.validate_order_lines(
  p_tenant_id uuid,
  p_size_ids uuid[],
  p_eggs integer[],
  p_prices numeric[],
  p_existing_size_ids uuid[] default '{}'
)
  returns void
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select app.validate_sale_lines(p_tenant_id, p_size_ids, p_eggs, p_prices, p_existing_size_ids)
$$;

-- SHA-256 of a deliver_order request: order, date and lines (by size). Excludes confirm_shortfall, so "Deliver
-- anyway" is the same request. A create_sale hash can never collide with it (different prefix).
create function app.deliver_payload_hash(p_order_id uuid, p_delivered_date date, p_size_ids uuid[], p_eggs integer[])
  returns text
  language sql
  immutable
  security invoker
  set search_path = ''
as $$
  select encode(sha256(convert_to(
    'deliver' || chr(31) || coalesce(p_order_id::text, '') || chr(31) || coalesce(p_delivered_date::text, '') || chr(31)
    || coalesce((
         select string_agg(u.size_id::text || ':' || u.eggs::text, chr(30) order by u.size_id)
         from unnest(p_size_ids, p_eggs) u(size_id, eggs)
       ), ''),
    'UTF8')), 'hex')
$$;

revoke all on function app.order_json(uuid, uuid, boolean) from public;
revoke all on function app.list_orders_json(uuid, text, uuid, date, date, int, int) from public;
revoke all on function app.validate_order_lines(uuid, uuid[], integer[], numeric[], uuid[]) from public;
revoke all on function app.deliver_payload_hash(uuid, date, uuid[], integer[]) from public;
grant execute on function app.order_json(uuid, uuid, boolean) to authenticated;
grant execute on function app.list_orders_json(uuid, text, uuid, date, date, int, int) to authenticated;
grant execute on function app.validate_order_lines(uuid, uuid[], integer[], numeric[], uuid[]) to authenticated;
grant execute on function app.deliver_payload_hash(uuid, date, uuid[], integer[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. create_order (AC9-AC18, AC50): { order, replayed }. Idempotent per submission id. Touches no stock (AC10).
-- ---------------------------------------------------------------------------
create function public.create_order(
  p_tenant_id uuid,
  p_submission_id uuid,
  p_client_id uuid,
  p_order_date date,
  p_size_ids uuid[],
  p_eggs integer[],
  p_prices numeric[],
  p_wanted_by date default null
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
  v_order_id      uuid;
  v_eggs_per_tray integer;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_submission_id is null or p_order_date is null then
    raise exception 'submission id and order date are required' using errcode = 'TM005';
  end if;
  if p_size_ids is null or p_eggs is null or p_prices is null
     or cardinality(p_size_ids) <> cardinality(p_eggs) or cardinality(p_size_ids) <> cardinality(p_prices) then
    raise exception 'malformed lines' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  v_hash := app.order_payload_hash(p_client_id, p_order_date, p_wanted_by, p_size_ids, p_eggs, p_prices);

  -- A replay writes nothing and returns the FIRST order, before any other validation.
  select s.order_id, s.payload_hash into v_prev
  from public.order_submissions s
  where s.tenant_id = p_tenant_id and s.id = p_submission_id;
  if found then
    if v_prev.payload_hash <> v_hash then
      raise exception 'submission id was used with another payload' using errcode = 'TM038';
    end if;
    return jsonb_build_object('order', app.order_json(p_tenant_id, v_prev.order_id, true), 'replayed', true);
  end if;

  perform app.validate_order_lines(p_tenant_id, p_size_ids, p_eggs, p_prices, '{}'::uuid[]);
  -- A client is required and must be ACTIVE for a new order.
  perform app.validate_sale_client(p_tenant_id, 'delivery', p_client_id, null);

  if p_order_date > (now() at time zone 'utc')::date + 1 then
    raise exception 'order date is in the future' using errcode = 'TM002', hint = 'order_date';
  end if;
  if p_wanted_by is not null and p_wanted_by < p_order_date then
    raise exception 'wanted-by is before the order date' using errcode = 'TM055', hint = 'wanted_by';
  end if;

  update public.order_counters
  set next_number = next_number + 1
  where tenant_id = p_tenant_id
  returning next_number - 1 into v_number;
  if v_number is null then
    raise exception 'no order counter for this farm' using errcode = 'TM006';
  end if;

  select coalesce(t.eggs_per_tray, 30) into v_eggs_per_tray from public.tenants t where t.id = p_tenant_id;

  insert into public.orders (tenant_id, order_number, client_id, order_date, wanted_by, status)
  values (p_tenant_id, v_number, p_client_id, p_order_date, p_wanted_by, 'requested')
  returning id into v_order_id;

  insert into public.order_lines (tenant_id, order_id, size_id, eggs, price_per_tray, line_total)
  select p_tenant_id, v_order_id, u.size_id, u.eggs, round(u.price, 2), app.sale_line_total(u.price, u.eggs, v_eggs_per_tray)
  from unnest(p_size_ids, p_eggs, p_prices) u(size_id, eggs, price);

  insert into public.order_submissions (tenant_id, id, order_id, payload_hash)
  values (p_tenant_id, p_submission_id, v_order_id, v_hash);

  return jsonb_build_object('order', app.order_json(p_tenant_id, v_order_id, true), 'replayed', false);
end
$$;

-- ---------------------------------------------------------------------------
-- 3. update_order (AC19, AC20, AC57): { order, changed }. REPLACES the whole order: header + every line.
-- ---------------------------------------------------------------------------
create function public.update_order(
  p_tenant_id uuid,
  p_order_id uuid,
  p_version bigint,
  p_client_id uuid,
  p_order_date date,
  p_size_ids uuid[],
  p_eggs integer[],
  p_prices numeric[],
  p_wanted_by date default null
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur           record;
  v_cur_size_ids  uuid[];
  v_cur_eggs      integer[];
  v_cur_prices    numeric[];
  v_new_size_ids  uuid[];
  v_new_eggs      integer[];
  v_new_prices    numeric[];
  v_delivered_n   bigint;
  v_first_date    date;
  v_bad_ids       uuid[];
  v_eggs_per_tray integer;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_order_id is null or p_version is null or p_order_date is null then
    raise exception 'order id, version and order date are required' using errcode = 'TM005';
  end if;
  if p_size_ids is null or p_eggs is null or p_prices is null
     or cardinality(p_size_ids) <> cardinality(p_eggs) or cardinality(p_size_ids) <> cardinality(p_prices) then
    raise exception 'malformed lines' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  select o.id, o.client_id, o.order_date, o.wanted_by, o.status, o.closed_short_at, o.version
  into v_cur
  from public.orders o
  where o.tenant_id = p_tenant_id and o.id = p_order_id
  for update;
  if not found then
    raise exception 'unknown order' using errcode = 'TM044';
  end if;
  if v_cur.status in ('cancelled', 'fulfilled') then
    raise exception 'this order is closed to changes' using errcode = 'TM046',
      hint = case when v_cur.status = 'cancelled' then 'cancelled' when v_cur.closed_short_at is not null then 'closed_short' else 'fulfilled' end;
  end if;

  select array_agg(l.size_id order by l.size_id), array_agg(l.eggs order by l.size_id), array_agg(l.price_per_tray order by l.size_id)
  into v_cur_size_ids, v_cur_eggs, v_cur_prices
  from public.order_lines l
  where l.tenant_id = p_tenant_id and l.order_id = p_order_id;

  -- A kept, since-archived size and the order's own inactive client are never refused (AC19).
  perform app.validate_order_lines(p_tenant_id, p_size_ids, p_eggs, p_prices, coalesce(v_cur_size_ids, '{}'::uuid[]));
  perform app.validate_sale_client(p_tenant_id, 'delivery', p_client_id, v_cur.client_id);

  if p_order_date > (now() at time zone 'utc')::date + 1 then
    raise exception 'order date is in the future' using errcode = 'TM002', hint = 'order_date';
  end if;
  if p_wanted_by is not null and p_wanted_by < p_order_date then
    raise exception 'wanted-by is before the order date' using errcode = 'TM055', hint = 'wanted_by';
  end if;
  -- AC57: the order date can't pass the earliest non-voided delivery.
  select min(s.sale_date) into v_first_date
  from public.sales s where s.tenant_id = p_tenant_id and s.order_id = p_order_id and s.voided_at is null;
  if v_first_date is not null and p_order_date > v_first_date then
    raise exception 'order date is after its first delivery' using errcode = 'TM055', hint = 'order_date';
  end if;

  select array_agg(u.size_id order by u.size_id), array_agg(u.eggs order by u.size_id), array_agg(round(u.price, 2) order by u.size_id)
  into v_new_size_ids, v_new_eggs, v_new_prices
  from unnest(p_size_ids, p_eggs, p_prices) u(size_id, eggs, price);

  -- Nothing to write, whatever the version says: a retry whose reply was lost, or the same edit made elsewhere.
  -- No version bump, so an open detail isn't made stale by a no-op.
  if v_cur.client_id = p_client_id
     and v_cur.order_date = p_order_date
     and v_cur.wanted_by is not distinct from p_wanted_by
     and v_cur_size_ids = v_new_size_ids
     and v_cur_eggs = v_new_eggs
     and v_cur_prices = v_new_prices then
    return jsonb_build_object('order', app.order_json(p_tenant_id, p_order_id, true), 'changed', false);
  end if;

  if p_version <> v_cur.version then
    raise exception 'order was changed elsewhere' using errcode = 'TM045';
  end if;

  -- Delivery locks (only when something is delivered). The guard triggers re-check the same rules for other paths.
  select count(*) into v_delivered_n from app.order_delivered_eggs(p_tenant_id, p_order_id);
  if v_delivered_n > 0 then
    if p_client_id <> v_cur.client_id then
      raise exception 'the client cannot change after a delivery' using errcode = 'TM051', hint = 'client_locked';
    end if;

    select array_agg(d.size_id) into v_bad_ids
    from app.order_delivered_eggs(p_tenant_id, p_order_id) d
    where d.size_id <> all (p_size_ids);
    if v_bad_ids is not null then
      raise exception 'a delivered line cannot be removed' using errcode = 'TM051', hint = 'line_locked',
        detail = jsonb_build_object('sizeIds', to_jsonb(v_bad_ids))::text;
    end if;

    select array_agg(u.size_id) into v_bad_ids
    from unnest(p_size_ids, p_eggs) u(size_id, eggs)
    join app.order_delivered_eggs(p_tenant_id, p_order_id) d on d.size_id = u.size_id
    where u.eggs < d.eggs;
    if v_bad_ids is not null then
      raise exception 'a line cannot go below what was delivered' using errcode = 'TM051', hint = 'below_delivered',
        detail = jsonb_build_object('sizeIds', to_jsonb(v_bad_ids))::text;
    end if;
  end if;

  select coalesce(t.eggs_per_tray, 30) into v_eggs_per_tray from public.tenants t where t.id = p_tenant_id;

  delete from public.order_lines l
  where l.tenant_id = p_tenant_id and l.order_id = p_order_id and l.size_id <> all (p_size_ids);

  -- Keeps a line's FROZEN total (AC51) whenever its eggs and price are unchanged.
  insert into public.order_lines (tenant_id, order_id, size_id, eggs, price_per_tray, line_total)
  select p_tenant_id, p_order_id, u.size_id, u.eggs, round(u.price, 2), app.sale_line_total(u.price, u.eggs, v_eggs_per_tray)
  from unnest(p_size_ids, p_eggs, p_prices) u(size_id, eggs, price)
  on conflict (tenant_id, order_id, size_id) do update
  set eggs = excluded.eggs,
      price_per_tray = excluded.price_per_tray,
      line_total = case
        when order_lines.eggs = excluded.eggs and order_lines.price_per_tray = excluded.price_per_tray
          then order_lines.line_total
        else excluded.line_total
      end;

  -- ONE update: the lines are already written, so an edit that lowers every line to its delivered amount makes the
  -- order fulfilled in the same statement (AC19); the guard trigger validates the result.
  update public.orders o
  set client_id = p_client_id, order_date = p_order_date, wanted_by = p_wanted_by,
      version = o.version + 1,
      status = app.order_status_for(p_tenant_id, p_order_id)
  where o.tenant_id = p_tenant_id and o.id = p_order_id;

  return jsonb_build_object('order', app.order_json(p_tenant_id, p_order_id, true), 'changed', true);
end
$$;

-- ---------------------------------------------------------------------------
-- 4. set_order_status (AC21): { order, changed }. Requested / confirmed / ready only; no version (D8): last write
-- wins among three harmless states and the move is idempotent.
-- ---------------------------------------------------------------------------
create function public.set_order_status(p_tenant_id uuid, p_order_id uuid, p_status text)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur record;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_order_id is null or p_status is null or p_status not in ('requested', 'confirmed', 'ready') then
    raise exception 'malformed status' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  select o.status, o.closed_short_at into v_cur
  from public.orders o where o.tenant_id = p_tenant_id and o.id = p_order_id for update;
  if not found then
    raise exception 'unknown order' using errcode = 'TM044';
  end if;
  if v_cur.status in ('cancelled', 'fulfilled') then
    raise exception 'this order is closed to changes' using errcode = 'TM046',
      hint = case when v_cur.status = 'cancelled' then 'cancelled' when v_cur.closed_short_at is not null then 'closed_short' else 'fulfilled' end;
  end if;
  if v_cur.status = 'partially_fulfilled' then
    raise exception 'an order with a delivery has its status set by its deliveries' using errcode = 'TM049';
  end if;
  if v_cur.status = p_status then
    return jsonb_build_object('order', app.order_json(p_tenant_id, p_order_id, true), 'changed', false);
  end if;

  update public.orders o set status = p_status, version = o.version + 1
  where o.tenant_id = p_tenant_id and o.id = p_order_id;

  return jsonb_build_object('order', app.order_json(p_tenant_id, p_order_id, true), 'changed', true);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. cancel_order (AC22): { order, changed }. Only before the first NON-VOIDED delivery (G1).
-- ---------------------------------------------------------------------------
create function public.cancel_order(p_tenant_id uuid, p_order_id uuid)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur record;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_order_id is null then
    raise exception 'order id is required' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  select o.status into v_cur
  from public.orders o where o.tenant_id = p_tenant_id and o.id = p_order_id for update;
  if not found then
    raise exception 'unknown order' using errcode = 'TM044';
  end if;
  if v_cur.status = 'cancelled' then
    return jsonb_build_object('order', app.order_json(p_tenant_id, p_order_id, true), 'changed', false);
  end if;
  -- partially_fulfilled and fulfilled both mean a non-voided delivery exists (a voided one sends the order back to ready).
  if v_cur.status not in ('requested', 'confirmed', 'ready') then
    raise exception 'an order with a delivery cannot be cancelled' using errcode = 'TM047';
  end if;

  update public.orders o set status = 'cancelled', cancelled_at = now(), version = o.version + 1
  where o.tenant_id = p_tenant_id and o.id = p_order_id;

  return jsonb_build_object('order', app.order_json(p_tenant_id, p_order_id, true), 'changed', true);
end
$$;

-- ---------------------------------------------------------------------------
-- 6. close_order (AC34): { order, changed }. One-way. Records what is dropped per size; stock is untouched.
-- ---------------------------------------------------------------------------
create function public.close_order(p_tenant_id uuid, p_order_id uuid, p_version bigint)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur record;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_order_id is null or p_version is null then
    raise exception 'order id and version are required' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  select o.status, o.closed_short_at, o.version into v_cur
  from public.orders o where o.tenant_id = p_tenant_id and o.id = p_order_id for update;
  if not found then
    raise exception 'unknown order' using errcode = 'TM044';
  end if;
  if v_cur.closed_short_at is not null then
    return jsonb_build_object('order', app.order_json(p_tenant_id, p_order_id, true), 'changed', false);
  end if;
  if v_cur.status <> 'partially_fulfilled' then
    raise exception 'only a partly delivered order can be closed short' using errcode = 'TM048';
  end if;
  -- A one-way action must be taken from the figures the owner saw.
  if p_version <> v_cur.version then
    raise exception 'order was changed elsewhere' using errcode = 'TM045';
  end if;

  update public.order_lines l
  set dropped_eggs = greatest(l.eggs - coalesce((
        select d.eggs from app.order_delivered_eggs(p_tenant_id, p_order_id) d where d.size_id = l.size_id), 0), 0)
  where l.tenant_id = p_tenant_id and l.order_id = p_order_id;

  update public.orders o set status = 'fulfilled', closed_short_at = now(), version = o.version + 1
  where o.tenant_id = p_tenant_id and o.id = p_order_id;

  return jsonb_build_object('order', app.order_json(p_tenant_id, p_order_id, true), 'changed', true);
end
$$;

-- ---------------------------------------------------------------------------
-- 7. deliver_order (AC24-AC31, AC33): { order, sale, replayed }. Creates ONE normal sale (type delivery, the order's
-- client, the order lines' prices) linked to the order and brings the order's status right, all in one transaction.
-- Reuses sale_submissions as its ledger (D6).
-- ---------------------------------------------------------------------------
create function public.deliver_order(
  p_tenant_id uuid,
  p_submission_id uuid,
  p_order_id uuid,
  p_delivered_date date,
  p_size_ids uuid[],
  p_eggs integer[],
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
  v_cur           record;
  v_number        bigint;
  v_sale_id       uuid;
  v_eggs_per_tray integer;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_submission_id is null or p_order_id is null or p_delivered_date is null then
    raise exception 'submission id, order id and delivered date are required' using errcode = 'TM005';
  end if;
  if p_size_ids is null or p_eggs is null or cardinality(p_size_ids) <> cardinality(p_eggs)
     or array_position(p_size_ids, null) is not null or array_position(p_eggs, null) is not null then
    raise exception 'malformed lines' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  v_hash := app.deliver_payload_hash(p_order_id, p_delivered_date, p_size_ids, p_eggs);

  -- A replay writes nothing and returns the FIRST delivery (AC31).
  select s.sale_id, s.payload_hash into v_prev
  from public.sale_submissions s
  where s.tenant_id = p_tenant_id and s.id = p_submission_id;
  if found then
    if v_prev.payload_hash <> v_hash then
      raise exception 'submission id was used with another payload' using errcode = 'TM038';
    end if;
    return jsonb_build_object(
      'order', app.order_json(p_tenant_id, p_order_id, true),
      'sale', app.sale_json(p_tenant_id, v_prev.sale_id),
      'replayed', true);
  end if;

  select o.client_id, o.order_date, o.status, o.closed_short_at into v_cur
  from public.orders o where o.tenant_id = p_tenant_id and o.id = p_order_id for update;
  if not found then
    raise exception 'unknown order' using errcode = 'TM044';
  end if;
  if v_cur.status in ('cancelled', 'fulfilled') then
    raise exception 'this order is closed to changes' using errcode = 'TM046',
      hint = case when v_cur.status = 'cancelled' then 'cancelled' when v_cur.closed_short_at is not null then 'closed_short' else 'fulfilled' end;
  end if;

  if p_delivered_date > (now() at time zone 'utc')::date + 1 then
    raise exception 'delivered date is in the future' using errcode = 'TM002', hint = 'delivered_date';
  end if;
  if p_delivered_date < v_cur.order_date then
    raise exception 'delivered date is before the order date' using errcode = 'TM055', hint = 'delivered_date';
  end if;

  if cardinality(p_size_ids) = 0 then
    raise exception 'a delivery needs at least one line' using errcode = 'TM052', hint = 'empty';
  end if;
  if exists (select 1 from unnest(p_eggs) e(eggs) where e.eggs < 1 or e.eggs > 100000) then
    raise exception 'a line''s eggs are out of range' using errcode = 'TM030';
  end if;
  if exists (select 1 from unnest(p_size_ids) u(size_id) group by u.size_id having count(*) > 1) then
    raise exception 'a size appears twice in one delivery' using errcode = 'TM029';
  end if;
  if exists (
    select 1 from unnest(p_size_ids) u(size_id)
    where not exists (select 1 from public.order_lines l where l.tenant_id = p_tenant_id and l.order_id = p_order_id and l.size_id = u.size_id)
  ) then
    raise exception 'a size is not a line of this order' using errcode = 'TM052', hint = 'not_on_order';
  end if;
  -- Each line <= what is remaining (AC26). A client since made inactive and a size since archived are NOT checked (AC33).
  if exists (
    select 1
    from unnest(p_size_ids, p_eggs) u(size_id, eggs)
    join public.order_lines l on l.tenant_id = p_tenant_id and l.order_id = p_order_id and l.size_id = u.size_id
    left join app.order_delivered_eggs(p_tenant_id, p_order_id) d on d.size_id = u.size_id
    where u.eggs > l.eggs - coalesce(d.eggs, 0)
  ) then
    raise exception 'a line exceeds what is left to deliver' using errcode = 'TM050';
  end if;

  -- Stock: the delivery takes its full eggs (AC30). TM037 names only the short sizes, unless confirmed.
  perform app.check_sale_shortfall(p_tenant_id, p_size_ids, p_eggs, p_confirm_shortfall);

  update public.sale_counters
  set next_number = next_number + 1
  where tenant_id = p_tenant_id
  returning next_number - 1 into v_number;
  if v_number is null then
    raise exception 'no sale counter for this farm' using errcode = 'TM006';
  end if;

  select coalesce(t.eggs_per_tray, 30) into v_eggs_per_tray from public.tenants t where t.id = p_tenant_id;

  -- The linked-sale guards (M19) let the header's order_id and the lines through only while this
  -- transaction-local flag is on.
  perform set_config('app.order_delivery', 'on', true);
  insert into public.sales (tenant_id, sale_number, client_id, type, sale_date, order_id)
  values (p_tenant_id, v_number, v_cur.client_id, 'delivery', p_delivered_date, p_order_id)
  returning id into v_sale_id;

  insert into public.sale_lines (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total)
  select p_tenant_id, v_sale_id, u.size_id, u.eggs, l.price_per_tray, app.sale_line_total(l.price_per_tray, u.eggs, v_eggs_per_tray)
  from unnest(p_size_ids, p_eggs) u(size_id, eggs)
  join public.order_lines l on l.tenant_id = p_tenant_id and l.order_id = p_order_id and l.size_id = u.size_id;
  perform set_config('app.order_delivery', 'off', true);

  insert into public.sale_submissions (tenant_id, id, sale_id, payload_hash)
  values (p_tenant_id, p_submission_id, v_sale_id, v_hash);

  perform app.recompute_order_status(p_tenant_id, p_order_id);

  return jsonb_build_object(
    'order', app.order_json(p_tenant_id, p_order_id, true),
    'sale', app.sale_json(p_tenant_id, v_sale_id),
    'replayed', false);
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Reads.
-- ---------------------------------------------------------------------------
create function public.get_order(p_tenant_id uuid, p_order_id uuid)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  perform app.assert_tenant(p_tenant_id);
  return jsonb_build_object('order', app.order_json(p_tenant_id, p_order_id, true));
end
$$;

create function public.list_orders(
  p_tenant_id uuid,
  p_view text default 'open',
  p_client_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_limit int default 25,
  p_offset int default 0
)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  perform app.assert_tenant(p_tenant_id);
  return app.list_orders_json(p_tenant_id, p_view, p_client_id, p_from, p_to, p_limit, p_offset);
end
$$;

revoke execute on function public.create_order(uuid, uuid, uuid, date, uuid[], integer[], numeric[], date) from public, anon;
revoke execute on function public.update_order(uuid, uuid, bigint, uuid, date, uuid[], integer[], numeric[], date) from public, anon;
revoke execute on function public.set_order_status(uuid, uuid, text) from public, anon;
revoke execute on function public.cancel_order(uuid, uuid) from public, anon;
revoke execute on function public.close_order(uuid, uuid, bigint) from public, anon;
revoke execute on function public.deliver_order(uuid, uuid, uuid, date, uuid[], integer[], boolean) from public, anon;
revoke execute on function public.get_order(uuid, uuid) from public, anon;
revoke execute on function public.list_orders(uuid, text, uuid, date, date, int, int) from public, anon;

grant execute on function public.create_order(uuid, uuid, uuid, date, uuid[], integer[], numeric[], date) to authenticated;
grant execute on function public.update_order(uuid, uuid, bigint, uuid, date, uuid[], integer[], numeric[], date) to authenticated;
grant execute on function public.set_order_status(uuid, uuid, text) to authenticated;
grant execute on function public.cancel_order(uuid, uuid) to authenticated;
grant execute on function public.close_order(uuid, uuid, bigint) to authenticated;
grant execute on function public.deliver_order(uuid, uuid, uuid, date, uuid[], integer[], boolean) to authenticated;
grant execute on function public.get_order(uuid, uuid) to authenticated;
grant execute on function public.list_orders(uuid, text, uuid, date, date, int, int) to authenticated;
