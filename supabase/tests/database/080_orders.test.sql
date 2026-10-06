-- 080_orders: orders (M17 tables, guards and counters), conversion post-conditions (M18, see `bun run test:migration`),
-- the sale-side changes (M19) and the eight order functions (M20). docs/features/05-orders.md §3.1-§3.3, §3.7.
-- Functions run as the farm owner, exactly as the server calls them; hand-built writes go through tests.try_as.
-- Concurrency (two phones delivering the same order) can't be tested in one session; the manual recipe is in §4.
begin;
select plan(237);

select tests.create_farm('Farm O', 'o');   -- the main flow: numbering, create, edit, status, cancel, deliver, close, void
select tests.create_farm('Farm P', 'p');   -- per-farm numbering, an empty farm
select tests.create_farm('Farm Q', 'q');   -- shortfall, inactive client and archived size still deliver (AC33)
select tests.create_farm('Farm L', 'l');   -- list_orders
select tests.create_farm('Farm X', 'x');   -- the order_status_for fixture table

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------
create function pg_temp.rpc_as(p_who text, p_sql text) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  perform tests.authenticate_as(p_who);
  execute p_sql into v;
  perform tests.clear_authentication();
  return v;
end
$$;

-- 'ok', or '<SQLSTATE>|<hint>|<detail>' (tests.try_as only returns the SQLSTATE).
create function pg_temp.try_detail(p_who text, p_sql text) returns text language plpgsql as $$
declare
  v_state  text;
  v_hint   text;
  v_detail text;
begin
  begin
    perform tests.authenticate_as(p_who);
    execute p_sql;
    perform tests.clear_authentication();
    return 'ok';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_detail = pg_exception_detail;
    perform tests.clear_authentication();
    return v_state || '|' || coalesce(v_hint, '') || '|' || coalesce(v_detail, '');
  end;
end
$$;

-- The state and hint only.
create function pg_temp.state_of(p_who text, p_sql text) returns text language plpgsql as $$
declare
  v text := pg_temp.try_detail(p_who, p_sql);
begin
  return case when v = 'ok' then 'ok' else split_part(v, '|', 1) || '|' || split_part(v, '|', 2) end;
end
$$;

create function pg_temp.try_shortfall(p_who text, p_sql text) returns jsonb language plpgsql as $$
declare
  v_detail text;
begin
  begin
    perform tests.authenticate_as(p_who);
    execute p_sql;
    perform tests.clear_authentication();
    return null;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    perform tests.clear_authentication();
    return v_detail::jsonb;
  end;
end
$$;

create function pg_temp.szid(p_who text, p_name text) returns uuid language sql stable as $$
  select s.id from public.sizes s where s.tenant_id = tests.tenant_id_of(p_who) and s.name = p_name
$$;

create function pg_temp.ids(p_who text, p_names text[]) returns uuid[] language sql stable as $$
  select coalesce(array_agg(pg_temp.szid(p_who, n) order by o), '{}'::uuid[]) from unnest(p_names) with ordinality t(n, o)
$$;

create function pg_temp.add_client(p_who text, p_name text) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.clients (tenant_id, name) values (tests.tenant_id_of(p_who), p_name) returning id into v_id;
  return v_id;
end
$$;

create function pg_temp.produce(p_who text, p_size_name text, p_eggs integer) returns void language plpgsql as $$
begin
  insert into public.production (tenant_id, produced_on, size_id, quality, eggs)
  values (tests.tenant_id_of(p_who), current_date, pg_temp.szid(p_who, p_size_name), 'good', p_eggs)
  on conflict (tenant_id, produced_on, quality, size_id) do update set eggs = public.production.eggs + excluded.eggs;
end
$$;

-- On hand for one size (as postgres, through the one on-hand function).
create function pg_temp.oh(p_who text, p_size_name text) returns integer language sql stable as $$
  select (e ->> 'eggs')::integer
  from jsonb_array_elements(app.on_hand_json(tests.tenant_id_of(p_who), array[pg_temp.szid(p_who, p_size_name)]) -> 'onHand') e
$$;

-- SQL text builders for the calls.
create function pg_temp.q_create(p_who text, p_client uuid, p_date date, p_names text[], p_eggs int[], p_prices numeric[],
                                 p_wanted date default null, p_sub uuid default gen_random_uuid()) returns text language sql stable as $$
  select format('select public.create_order(%L, %L, %L, %L, %L::uuid[], %L::int[], %L::numeric[], %L)',
    tests.tenant_id_of(p_who), p_sub, p_client, p_date, pg_temp.ids(p_who, p_names), p_eggs, p_prices, p_wanted)
$$;

create function pg_temp.q_update(p_who text, p_order uuid, p_version bigint, p_client uuid, p_date date, p_names text[], p_eggs int[], p_prices numeric[],
                                 p_wanted date default null) returns text language sql stable as $$
  select format('select public.update_order(%L, %L, %L, %L, %L, %L::uuid[], %L::int[], %L::numeric[], %L)',
    tests.tenant_id_of(p_who), p_order, p_version, p_client, p_date, pg_temp.ids(p_who, p_names), p_eggs, p_prices, p_wanted)
$$;

create function pg_temp.q_deliver(p_who text, p_order uuid, p_date date, p_names text[], p_eggs int[],
                                  p_confirm boolean default false, p_sub uuid default gen_random_uuid()) returns text language sql stable as $$
  select format('select public.deliver_order(%L, %L, %L, %L, %L::uuid[], %L::int[], %L)',
    tests.tenant_id_of(p_who), p_sub, p_order, p_date, pg_temp.ids(p_who, p_names), p_eggs, p_confirm)
$$;

create function pg_temp.q_one(p_who text, p_fn text, p_order uuid, p_extra text default null) returns text language sql stable as $$
  select format('select public.%s(%L, %L%s)', p_fn, tests.tenant_id_of(p_who), p_order, coalesce(', ' || p_extra, ''))
$$;

create function pg_temp.q_void(p_who text, p_sale uuid, p_version bigint) returns text language sql stable as $$
  select format('select public.void_sale(%L, %L, %L)', tests.tenant_id_of(p_who), p_sale, p_version)
$$;

create function pg_temp.ln(p_order jsonb, p_who text, p_size text) returns jsonb language sql stable as $$
  select l from jsonb_array_elements(p_order -> 'lines') l where l ->> 'sizeId' = pg_temp.szid(p_who, p_size)::text
$$;

-- The order as the database sees it (as postgres), for assertions that must not go through the functions.
create function pg_temp.ord(p_order uuid) returns jsonb language sql stable as $$
  select app.order_json(o.tenant_id, o.id, true) from public.orders o where o.id = p_order
$$;

-- ---------------------------------------------------------------------------------------------
-- A. Numbering (AC18), create (AC9-AC16, AC50), no stock effect (AC10).
-- ---------------------------------------------------------------------------------------------
create temp table _o as
  select tests.tenant_id_of('o') as t,
         pg_temp.add_client('o', 'O Client 1') as c1,
         pg_temp.add_client('o', 'O Client 2') as c2,
         pg_temp.add_client('o', 'O Inactive') as ci;
grant select on _o to authenticated;
update public.clients set archived_at = now() where id = (select ci from _o);
select pg_temp.produce('o', 'Large', 6000);
select pg_temp.produce('o', 'Medium', 3000);
select pg_temp.produce('o', 'Small', 900);

create temp table _stock0 as select app.on_hand_json((select t from _o), null) as j;

create temp table _o1 as
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Large', 'Medium'], array[241, 120], array[6.75, 6.00])) as r;
select is((select r -> 'order' ->> 'orderNumber' from _o1), '1', 'AC18: a farm''s first order is 1');
select is((select r ->> 'replayed' from _o1), 'false', 'a first create is not a replay');
select is((select r -> 'order' ->> 'status' from _o1), 'requested', 'a new order is Requested');
select is((select r -> 'order' ->> 'version' from _o1), '1', 'a new order has version 1');
select is((select r -> 'order' ->> 'orderTotal' from _o1), '78.23', 'AC14: Large 241 eggs at 6.75 (54.23) + Medium 120 at 6.00 (24.00) = 78.23');
select is((select r -> 'order' ->> 'deliveryCount' from _o1), '0', 'a new order has no deliveries');
select is((select r -> 'order' -> 'deliveries' from _o1), '[]'::jsonb, 'the create response carries an empty deliveries list');
select is((select jsonb_array_length(r -> 'order' -> 'lines') from _o1), 2, 'the order has its two lines');
select is((pg_temp.ln((select r -> 'order' from _o1), 'o', 'Large') ->> 'remainingEggs')::int, 241, 'AC32: remaining is computed: nothing delivered, all 241 owed');

create temp table _o2 as
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[30], array[6.5])) as r;
select is((select r -> 'order' ->> 'orderNumber' from _o2), '2', 'AC18: the second order is 2');

create temp table _p as select tests.tenant_id_of('p') as t, pg_temp.add_client('p', 'P Client') as c1;
grant select on _p to authenticated;
select is(
  (pg_temp.rpc_as('p', pg_temp.q_create('p', (select c1 from _p), current_date, array['Small'], array[30], array[6.5])) -> 'order' ->> 'orderNumber'),
  '1', 'AC18: numbers are per farm: farm P''s first order is 1 too');
select is((pg_temp.rpc_as('p', format('select public.list_orders(%L)', (select t from _p))) ->> 'hasAny'), 'true', 'hasAny is true once the farm has an order');

-- Replay (AC16): the same submission id and payload creates nothing and returns the FIRST order.
create temp table _sub as select gen_random_uuid() as id;
create temp table _r1 as
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[60], array[6.5], null, (select id from _sub))) as r;
create temp table _r2 as
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[60], array[6.5], null, (select id from _sub))) as r;
select is((select r ->> 'replayed' from _r2), 'true', 'AC16: the same submission id and payload is a replay');
select is((select r -> 'order' ->> 'id' from _r2), (select r -> 'order' ->> 'id' from _r1), 'AC16: a replay returns the same order, one order number');
select is((select count(*) from public.orders where tenant_id = (select t from _o)), 3::bigint, 'AC16: a replay creates no second order (3 orders so far)');
select is(
  pg_temp.state_of('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[61], array[6.5], null, (select id from _sub))),
  'TM038|', 'the same submission id with another payload is refused (TM038)');

-- Validation: every rule, with the right SQLSTATE and hint.
select is(pg_temp.state_of('o', pg_temp.q_create('o', (select c1 from _o), current_date, array[]::text[], array[]::int[], array[]::numeric[])), 'TM028|', 'AC12: 0 lines (TM028)');
select is(
  pg_temp.state_of('o', format('select public.create_order(%L, gen_random_uuid(), %L, current_date, (select array_agg(gen_random_uuid()) from generate_series(1,21)), (select array_agg(30) from generate_series(1,21)), (select array_agg(6.5::numeric) from generate_series(1,21)))', (select t from _o), (select c1 from _o))),
  'TM028|', 'AC12: 21 lines (TM028)');
select is(pg_temp.state_of('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small', 'Small'], array[30, 30], array[6.5, 6.5])), 'TM029|', 'AC12: a size twice (TM029)');
select is(pg_temp.state_of('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[0], array[6.5])), 'TM030|', 'AC12: 0 eggs (TM030)');
select is(pg_temp.state_of('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[100001], array[6.5])), 'TM030|', 'AC12: 100,001 eggs (TM030)');
select is(pg_temp.state_of('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[30], array[0])), 'TM031|not_positive', 'AC12: price 0 (TM031 not_positive)');
select is(pg_temp.state_of('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[30], array[10000])), 'TM031|too_large', 'AC12: price 10,000 (TM031 too_large)');
select is(pg_temp.state_of('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[30], array[6.505])), 'TM031|too_many_decimals', 'AC12: price 6.505 (TM031 too_many_decimals)');
select is(pg_temp.state_of('o', pg_temp.q_create('o', null, current_date, array['Small'], array[30], array[6.5])), 'TM032|required', 'AC11: a client is required (TM032 required)');
select is(pg_temp.state_of('o', pg_temp.q_create('o', (select ci from _o), current_date, array['Small'], array[30], array[6.5])), 'TM032|invalid', 'AC50: a new order cannot use an inactive client (TM032 invalid)');
select is(pg_temp.state_of('o', pg_temp.q_create('o', gen_random_uuid(), current_date, array['Small'], array[30], array[6.5])), 'TM032|invalid', 'AC52: a foreign client id gets the same answer');
select is(pg_temp.state_of('o', pg_temp.q_create('o', (select c1 from _o), current_date + 2, array['Small'], array[30], array[6.5])), 'TM002|order_date', 'AC15: a future order date (TM002 order_date)');
select is(pg_temp.state_of('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[30], array[6.5], current_date - 1)), 'TM055|wanted_by', 'AC15: wanted-by before the order date (TM055 wanted_by)');
select is(pg_temp.state_of('o', pg_temp.q_create('o', (select c1 from _o), current_date - 3, array['Small'], array[30], array[6.5], current_date - 3)), 'ok', 'AC15: wanted-by equal to the order date, and a past order date, are fine');
select is(pg_temp.state_of('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[30], array[6.5], current_date + 30)), 'ok', 'AC15: wanted-by may be in the future');

create temp table _jumbo as select pg_temp.szid('o', 'Jumbo') as id;
update public.sizes set archived_at = now() where id = (select id from _jumbo);
select is(
  pg_temp.state_of('o', format('select public.create_order(%L, gen_random_uuid(), %L, current_date, array[%L]::uuid[], array[30], array[6.5])', (select t from _o), (select c1 from _o), (select id from _jumbo))),
  'TM033|archived', 'AC50: a new line cannot use an archived size (TM033 archived)');

-- AC10: ordering never touches stock. Same on-hand JSON as before any order existed (all orders so far are creates).
select is(app.on_hand_json((select t from _o), null), (select j from _stock0), 'AC10: creating orders leaves every size''s on hand unchanged');

-- ---------------------------------------------------------------------------------------------
-- B. Status moves (AC21), edit before any delivery (AC19, AC20), cancel (AC22).
-- ---------------------------------------------------------------------------------------------
create temp table _s1 as select pg_temp.rpc_as('o', pg_temp.q_one('o', 'set_order_status', (select (r -> 'order' ->> 'id')::uuid from _o2), '''confirmed''')) as r;
select is((select r -> 'order' ->> 'status' from _s1), 'confirmed', 'AC21: Requested -> Confirmed');
select is((select r ->> 'changed' from _s1), 'true', 'AC21: ... a real change');
select is((select r -> 'order' ->> 'version' from _s1), '2', 'AC20: ... bumps the version');
select is((pg_temp.rpc_as('o', pg_temp.q_one('o', 'set_order_status', (select (r -> 'order' ->> 'id')::uuid from _o2), '''confirmed''')) ->> 'changed'), 'false', 'AC21: the same status again is changed: false');
select is((pg_temp.rpc_as('o', pg_temp.q_one('o', 'set_order_status', (select (r -> 'order' ->> 'id')::uuid from _o2), '''ready''')) -> 'order' ->> 'status'), 'ready', 'AC21: Confirmed -> Ready');
select is((pg_temp.rpc_as('o', pg_temp.q_one('o', 'set_order_status', (select (r -> 'order' ->> 'id')::uuid from _o2), '''requested''')) -> 'order' ->> 'status'), 'requested', 'AC21: and straight back to Requested');
select is(pg_temp.state_of('o', pg_temp.q_one('o', 'set_order_status', (select (r -> 'order' ->> 'id')::uuid from _o2), '''partially_fulfilled''')), 'TM005|', 'AC50: partially_fulfilled cannot be set by hand (TM005)');
select is(pg_temp.state_of('o', pg_temp.q_one('o', 'set_order_status', (select (r -> 'order' ->> 'id')::uuid from _o2), '''fulfilled''')), 'TM005|', 'AC50: fulfilled cannot be set by hand (TM005)');
select is(pg_temp.state_of('o', pg_temp.q_one('o', 'set_order_status', gen_random_uuid(), '''ready''')), 'TM044|', 'an unknown order id is TM044');

-- Edit before any delivery: everything changes.
create temp table _e1 as
  select pg_temp.rpc_as('o', pg_temp.q_update('o', (select (r -> 'order' ->> 'id')::uuid from _o2), 4, (select c2 from _o), current_date - 1,
    array['Small', 'Large'], array[60, 30], array[6.5, 7.00], current_date + 5)) as r;
select is((select r ->> 'changed' from _e1), 'true', 'AC19: a free edit before any delivery');
select is((select r -> 'order' ->> 'clientId' from _e1), (select c2::text from _o), 'AC19: ... the client changed');
select is((select r -> 'order' ->> 'wantedBy' from _e1), to_char(current_date + 5, 'YYYY-MM-DD'), 'AC19: ... and wanted-by');
select is((select jsonb_array_length(r -> 'order' -> 'lines') from _e1), 2, 'AC19: ... and a line was added');
select is((select r -> 'order' ->> 'orderNumber' from _e1), '2', 'AC18: editing never changes the order number');
select is((select r -> 'order' ->> 'status' from _e1), 'requested', 'AC19: ... or the status');
select is(
  pg_temp.state_of('o', pg_temp.q_update('o', (select (r -> 'order' ->> 'id')::uuid from _o2), 4, (select c2 from _o), current_date - 1, array['Small'], array[61], array[6.5])),
  'TM045|', 'AC20: a stale edit that would change something is refused (TM045)');
select is(
  (pg_temp.rpc_as('o', pg_temp.q_update('o', (select (r -> 'order' ->> 'id')::uuid from _o2), 1, (select c2 from _o), current_date - 1,
    array['Small', 'Large'], array[60, 30], array[6.5, 7.00], current_date + 5)) ->> 'changed'),
  'false', 'AC19: a stale version whose result matches what is stored is changed: false');
select is(
  pg_temp.state_of('o', pg_temp.q_update('o', (select (r -> 'order' ->> 'id')::uuid from _o2), 5, (select ci from _o), current_date - 1, array['Small'], array[61], array[6.5])),
  'TM032|invalid', 'AC19: a newly chosen inactive client is refused on an edit');

-- AC10 again: edits and status moves left stock alone.
select is(app.on_hand_json((select t from _o), null), (select j from _stock0), 'AC10: edits and status moves leave every size''s on hand unchanged');

-- Frozen totals (AC51): a farm tray-size change does not move a re-saved unchanged line's total.
create temp table _ft as
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Large', 'Medium'], array[241, 120], array[6.75, 6.00])) as r;
update public.tenants set eggs_per_tray = 24 where id = (select t from _o);
create temp table _ft2 as
  select pg_temp.rpc_as('o', pg_temp.q_update('o', (select (r -> 'order' ->> 'id')::uuid from _ft), 1, (select c1 from _o), current_date,
    array['Large', 'Medium'], array[241, 96], array[6.75, 6.00])) as r;
select is(pg_temp.ln((select r -> 'order' from _ft2), 'o', 'Large') ->> 'lineTotal', '54.23', 'AC51: an unchanged line keeps its frozen total after the tray size changes');
select is(pg_temp.ln((select r -> 'order' from _ft2), 'o', 'Medium') ->> 'lineTotal', '24.00', 'AC51: a changed line uses the new tray size (96 eggs = 4 trays of 24)');
update public.tenants set eggs_per_tray = 30 where id = (select t from _o);

-- Cancel (AC22).
create temp table _c1 as select pg_temp.rpc_as('o', pg_temp.q_one('o', 'cancel_order', (select (r -> 'order' ->> 'id')::uuid from _o2))) as r;
select is((select r -> 'order' ->> 'status' from _c1), 'cancelled', 'AC22: an order with no delivery can be cancelled');
select is((select r -> 'order' ->> 'cancelledAt' from _c1), to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'AC22: cancelledAt is set');
select is((select r -> 'order' ->> 'orderNumber' from _c1), '2', 'AC22: a cancelled order keeps its number');
select is((pg_temp.rpc_as('o', pg_temp.q_one('o', 'cancel_order', (select (r -> 'order' ->> 'id')::uuid from _o2))) ->> 'changed'), 'false', 'AC22: cancelling twice is changed: false');
select is(pg_temp.state_of('o', pg_temp.q_update('o', (select (r -> 'order' ->> 'id')::uuid from _o2), 6, (select c1 from _o), current_date, array['Small'], array[61], array[6.5])), 'TM046|cancelled', 'AC19: a cancelled order cannot be edited (TM046)');
select is(pg_temp.state_of('o', pg_temp.q_one('o', 'set_order_status', (select (r -> 'order' ->> 'id')::uuid from _o2), '''ready''')), 'TM046|cancelled', 'AC22: ... or moved to another status');
select is(pg_temp.state_of('o', pg_temp.q_deliver('o', (select (r -> 'order' ->> 'id')::uuid from _o2), current_date, array['Small'], array[1])), 'TM046|cancelled', 'AC22: ... or delivered');
select is(pg_temp.state_of('o', pg_temp.q_one('o', 'close_order', (select (r -> 'order' ->> 'id')::uuid from _o2), '1')), 'TM048|', 'AC34: ... or closed short (TM048)');
select is(app.on_hand_json((select t from _o), null), (select j from _stock0), 'AC10/AC22: cancelling leaves stock unchanged');

-- ---------------------------------------------------------------------------------------------
-- C. Deliver (AC24-AC33): partial, rest, replay, caps, dates, lines.
-- ---------------------------------------------------------------------------------------------
create temp table _d1 as
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date - 2, array['Large', 'Medium'], array[300, 100], array[6.50, 6.00])) as r;
create temp table _d1id as select (r -> 'order' ->> 'id')::uuid as id from _d1;
grant select on _d1id to authenticated;
create temp table _large0 as select pg_temp.oh('o', 'Large') as n;
create temp table _dsub as select gen_random_uuid() as id;

create temp table _dl1 as
  select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select id from _d1id), current_date - 1, array['Large'], array[120], false, (select id from _dsub))) as r;
select is((select r ->> 'replayed' from _dl1), 'false', 'AC27: a delivery is not a replay the first time');
select is((select r -> 'sale' ->> 'type' from _dl1), 'delivery', 'AC27: a delivery is a sale of type delivery');
select is((select r -> 'sale' ->> 'clientId' from _dl1), (select c1::text from _o), 'AC27: ... for the order''s client');
select is((select r -> 'sale' ->> 'orderId' from _dl1), (select id::text from _d1id), 'AC27: ... linked to the order');
select is((select r -> 'sale' ->> 'orderNumber' from _dl1), (select r -> 'order' ->> 'orderNumber' from _d1), 'AC39: ... and the sale shows the order number');
select is((select r -> 'sale' ->> 'saleDate' from _dl1), to_char(current_date - 1, 'YYYY-MM-DD'), 'AC27: ... on the delivered date');
select is((select r -> 'sale' -> 'lines' -> 0 ->> 'pricePerTray' from _dl1), '6.50', 'AC27: ... at the order line''s price per tray');
select is((select r -> 'sale' -> 'lines' -> 0 ->> 'lineTotal' from _dl1), '26.00', 'AC27/AC51: ... with its own rounded total (6.50 x 120 / 30)');
select is((select jsonb_array_length(r -> 'sale' -> 'lines') from _dl1), 1, 'AC27: lines with 0 now are not on the sale');
select is((select r -> 'order' ->> 'status' from _dl1), 'partially_fulfilled', 'AC28: some remaining: Partially fulfilled');
select is((pg_temp.ln((select r -> 'order' from _dl1), 'o', 'Large') ->> 'deliveredEggs')::int, 120, 'AC32: delivered so far is 120');
select is((pg_temp.ln((select r -> 'order' from _dl1), 'o', 'Large') ->> 'remainingEggs')::int, 180, 'AC32: remaining is 180');
select is((select (r -> 'order' ->> 'deliveryCount')::int from _dl1), 1, 'the order counts one delivery');
select is((select jsonb_array_length(r -> 'order' -> 'deliveries') from _dl1), 1, 'the order detail lists the delivery');
select is(pg_temp.oh('o', 'Large'), (select n from _large0) - 120, 'AC29: on hand fell by exactly the delivered eggs');

-- Replay (AC31): one sale, one number, stock once.
create temp table _dl1b as
  select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select id from _d1id), current_date - 1, array['Large'], array[120], false, (select id from _dsub))) as r;
select is((select r ->> 'replayed' from _dl1b), 'true', 'AC31: the same submission id is a replay');
select is((select r -> 'sale' ->> 'id' from _dl1b), (select r -> 'sale' ->> 'id' from _dl1), 'AC31: ... that returns the first sale');
select is((select count(*) from public.sales where order_id = (select id from _d1id)), 1::bigint, 'AC31: ... and creates no second sale');
select is(pg_temp.oh('o', 'Large'), (select n from _large0) - 120, 'AC31: ... and moves stock once');
select is(pg_temp.state_of('o', pg_temp.q_deliver('o', (select id from _d1id), current_date - 1, array['Large'], array[121], false, (select id from _dsub))), 'TM038|', 'AC31: the same submission id with other lines is TM038');

-- Caps (AC26).
select is(pg_temp.state_of('o', pg_temp.q_deliver('o', (select id from _d1id), current_date, array['Large'], array[181])), 'TM050|', 'AC26: delivering more than remains is refused (TM050)');
select is(pg_temp.state_of('o', pg_temp.q_deliver('o', (select id from _d1id), current_date, array['Medium'], array[101])), 'TM050|', 'AC26: ... on any line');
select is(pg_temp.state_of('o', pg_temp.q_deliver('o', (select id from _d1id), current_date, array['Small'], array[1])), 'TM052|not_on_order', 'a size that is not a line of the order (TM052 not_on_order)');
select is(pg_temp.state_of('o', pg_temp.q_deliver('o', (select id from _d1id), current_date, array[]::text[], array[]::int[])), 'TM052|empty', 'AC25: a delivery with no lines (TM052 empty)');
select is(pg_temp.state_of('o', pg_temp.q_deliver('o', (select id from _d1id), current_date, array['Large'], array[0])), 'TM030|', 'AC25: a line of 0 eggs is refused (TM030)');
select is(pg_temp.state_of('o', pg_temp.q_deliver('o', (select id from _d1id), current_date, array['Large', 'Large'], array[1, 1])), 'TM029|', 'a size twice in one delivery (TM029)');
select is(pg_temp.state_of('o', pg_temp.q_deliver('o', (select id from _d1id), current_date + 2, array['Large'], array[1])), 'TM002|delivered_date', 'AC24: a future delivered date (TM002 delivered_date)');
select is(pg_temp.state_of('o', pg_temp.q_deliver('o', (select id from _d1id), current_date - 3, array['Large'], array[1])), 'TM055|delivered_date', 'AC24: before the order date (TM055 delivered_date)');

-- Exactly the remaining is fine (180), the order stays Partially fulfilled while Medium is owed; then Medium finishes it.
create temp table _dl2 as select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select id from _d1id), current_date, array['Large'], array[180])) as r;
select is((select r -> 'order' ->> 'status' from _dl2), 'partially_fulfilled', 'AC28: Large done but Medium owed: still Partially fulfilled');
select is((select r -> 'sale' ->> 'saleNumber' from _dl2), '2', 'AC27: each delivery takes the next sale number');
select is(pg_temp.oh('o', 'Large'), (select n from _large0) - 300, 'AC29: Large on hand after 120 + 180 delivered');
create temp table _dl3 as select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select id from _d1id), current_date, array['Medium'], array[100])) as r;
select is((select r -> 'order' ->> 'status' from _dl3), 'fulfilled', 'AC28: nothing remaining: Fulfilled');
select is((select (r -> 'order' ->> 'deliveryCount')::int from _dl3), 3, 'three deliveries on the order');
select is(pg_temp.state_of('o', pg_temp.q_deliver('o', (select id from _d1id), current_date, array['Large'], array[1])), 'TM046|fulfilled', 'a fulfilled order cannot be delivered (TM046)');
select is(pg_temp.state_of('o', pg_temp.q_one('o', 'cancel_order', (select id from _d1id))), 'TM047|', 'AC22: an order with deliveries cannot be cancelled (TM047)');
select is(pg_temp.state_of('o', pg_temp.q_one('o', 'set_order_status', (select id from _d1id), '''ready''')), 'TM046|fulfilled', 'a fulfilled order''s status cannot be moved by hand');
select is((pg_temp.ord((select id from _d1id)) -> 'deliveries' -> 0 ->> 'saleNumber'), '3', 'the detail lists deliveries newest first');

-- Two deliveries of one line can differ from the order line's total by a centavo (AC51).
create temp table _cp as
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[2], array[6.75])) as r;
create temp table _cpid as select (r -> 'order' ->> 'id')::uuid as id from _cp;
select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select id from _cpid), current_date, array['Small'], array[1]));
create temp table _cp2 as select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select id from _cpid), current_date, array['Small'], array[1])) as r;
select is((select r -> 'order' -> 'lines' -> 0 ->> 'lineTotal' from _cp2), '0.45', 'AC51: the order line total stays 0.45');
select is((select sum(l.line_total) from public.sale_lines l join public.sales s on s.id = l.sale_id where s.order_id = (select id from _cpid)), 0.46, 'AC51: the two deliveries total 0.46 (each rounded on its own eggs)');
select is((select r -> 'order' ->> 'status' from _cp2), 'fulfilled', 'two single-egg deliveries finish the order');

-- ---------------------------------------------------------------------------------------------
-- D. Stock, AC30 and AC33 (farm Q).
-- ---------------------------------------------------------------------------------------------
create temp table _q as
  select tests.tenant_id_of('q') as t, pg_temp.add_client('q', 'Q Client') as c1;
grant select on _q to authenticated;
select pg_temp.produce('q', 'Large', 30);
select pg_temp.produce('q', 'Medium', 300);
create temp table _q1 as
  select pg_temp.rpc_as('q', pg_temp.q_create('q', (select c1 from _q), current_date, array['Large'], array[60], array[6.5])) as r;
create temp table _q1id as select (r -> 'order' ->> 'id')::uuid as id from _q1;
select is(
  pg_temp.state_of('q', pg_temp.q_deliver('q', (select id from _q1id), current_date, array['Large'], array[60])),
  'TM037|', 'AC30: a delivery that takes a size below 0 is refused with TM037');
select is(
  (pg_temp.try_shortfall('q', pg_temp.q_deliver('q', (select id from _q1id), current_date, array['Large'], array[60])) -> 'shortfall' -> 0 ->> 'onHandEggs')::int,
  30, 'AC30: the shortfall detail names what is on hand (30)');
select is(
  (pg_temp.try_shortfall('q', pg_temp.q_deliver('q', (select id from _q1id), current_date, array['Large'], array[60])) -> 'shortfall' -> 0 ->> 'neededEggs')::int,
  60, 'AC30: ... and what the delivery takes (60)');
select is(pg_temp.oh('q', 'Large'), 30, 'AC30: the refused delivery changed nothing');
create temp table _qsub as select gen_random_uuid() as id;
select is(pg_temp.state_of('q', pg_temp.q_deliver('q', (select id from _q1id), current_date, array['Large'], array[60], false, (select id from _qsub))), 'TM037|', 'a first attempt without confirmation raises');
create temp table _q2 as
  select pg_temp.rpc_as('q', pg_temp.q_deliver('q', (select id from _q1id), current_date, array['Large'], array[60], true, (select id from _qsub))) as r;
select is((select r ->> 'replayed' from _q2), 'false', 'AC30: Deliver anyway under the same submission id goes through (the hash excludes the confirm flag)');
select is(pg_temp.oh('q', 'Large'), -30, 'AC30: ... and on hand is now -30');

-- AC33: a client since made inactive and a size since archived still deliver.
create temp table _q3 as
  select pg_temp.rpc_as('q', pg_temp.q_create('q', (select c1 from _q), current_date, array['Medium'], array[60], array[6.5])) as r;
update public.clients set archived_at = now() where id = (select c1 from _q);
update public.sizes set archived_at = now() where id = pg_temp.szid('q', 'Medium');
create temp table _q4 as
  select pg_temp.rpc_as('q', pg_temp.q_deliver('q', (select (r -> 'order' ->> 'id')::uuid from _q3), current_date, array['Medium'], array[30])) as r;
select is((select r -> 'order' ->> 'status' from _q4), 'partially_fulfilled', 'AC33: delivering for an inactive client and an archived size still works');
select is((select r -> 'sale' ->> 'clientId' from _q4), (select c1::text from _q), 'AC33: ... and the sale keeps that client');

-- ---------------------------------------------------------------------------------------------
-- E. Close short (AC34).
-- ---------------------------------------------------------------------------------------------
create temp table _k1 as
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Large', 'Medium'], array[90, 60], array[6.00, 6.00])) as r;
create temp table _k1id as select (r -> 'order' ->> 'id')::uuid as id from _k1;
select is(pg_temp.state_of('o', pg_temp.q_one('o', 'close_order', (select id from _k1id), '1')), 'TM048|', 'AC34: close short on a Requested order is refused (TM048)');
create temp table _k1d as select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select id from _k1id), current_date, array['Large', 'Medium'], array[90, 30])) as r;
select is(pg_temp.state_of('o', pg_temp.q_one('o', 'close_order', (select id from _k1id), '1')), 'TM045|', 'AC34: close short from a stale version is refused (TM045)');
create temp table _k1c as
  select pg_temp.rpc_as('o', pg_temp.q_one('o', 'close_order', (select id from _k1id), ((select r -> 'order' ->> 'version' from _k1d)))) as r;
select is((select r -> 'order' ->> 'status' from _k1c), 'fulfilled', 'AC34: closing short makes the order Fulfilled');
select isnt((select r -> 'order' ->> 'closedShortAt' from _k1c), null, 'AC34: ... and records when');
select is((pg_temp.ln((select r -> 'order' from _k1c), 'o', 'Medium') ->> 'droppedEggs')::int, 30, 'AC34: ... with the dropped eggs per size (Medium 30)');
select is((pg_temp.ln((select r -> 'order' from _k1c), 'o', 'Large') ->> 'droppedEggs')::int, 0, 'AC34: ... and 0 on a fully delivered line');
select is((pg_temp.ln((select r -> 'order' from _k1c), 'o', 'Medium') ->> 'remainingEggs')::int, 0, 'AC34: a closed-short order owes nothing');
select is((pg_temp.rpc_as('o', pg_temp.q_one('o', 'close_order', (select id from _k1id), '1')) ->> 'changed'), 'false', 'AC34: closing again is changed: false, whatever the version');
select is(pg_temp.state_of('o', pg_temp.q_one('o', 'cancel_order', (select id from _k1id))), 'TM047|', 'AC34: a closed-short order cannot be cancelled');
select is(pg_temp.state_of('o', pg_temp.q_deliver('o', (select id from _k1id), current_date, array['Medium'], array[1])), 'TM046|closed_short', 'AC34: ... or delivered');
select is(pg_temp.state_of('o', pg_temp.q_update('o', (select id from _k1id), 9, (select c1 from _o), current_date, array['Large'], array[90], array[6.0])), 'TM046|closed_short', 'AC34: ... or edited');
select is(pg_temp.state_of('o', pg_temp.q_one('o', 'set_order_status', (select id from _k1id), '''ready''')), 'TM046|closed_short', 'AC34: ... or moved to another status');
select is(pg_temp.oh('o', 'Medium'), 3000 - 100 - 30 - 0, 'AC34: closing short changed no stock (Medium 3000 - 100 - 30)');

-- ---------------------------------------------------------------------------------------------
-- F. Edit after a delivery (AC19, AC57) and the minimums.
-- ---------------------------------------------------------------------------------------------
create temp table _u1 as
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date - 4, array['Large', 'Medium'], array[300, 100], array[6.50, 6.00])) as r;
create temp table _u1id as select (r -> 'order' ->> 'id')::uuid as id from _u1;
create temp table _u1d as select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select id from _u1id), current_date - 1, array['Large'], array[120])) as r;
create temp table _u1v as select (r -> 'order' ->> 'version')::bigint as v from _u1d;
select is(pg_temp.state_of('o', pg_temp.q_update('o', (select id from _u1id), (select v from _u1v), (select c2 from _o), current_date - 4, array['Large', 'Medium'], array[300, 100], array[6.50, 6.00])), 'TM051|client_locked', 'AC19: the client is locked after a delivery (TM051 client_locked)');
select is(pg_temp.state_of('o', pg_temp.q_update('o', (select id from _u1id), (select v from _u1v), (select c1 from _o), current_date - 4, array['Large', 'Medium'], array[100, 100], array[6.50, 6.00])), 'TM051|below_delivered', 'AC19: a line cannot go below what was delivered (TM051 below_delivered)');
select is(
  (regexp_match(pg_temp.try_detail('o', pg_temp.q_update('o', (select id from _u1id), (select v from _u1v), (select c1 from _o), current_date - 4, array['Large', 'Medium'], array[100, 100], array[6.50, 6.00])), '\{"sizeIds": \["([0-9a-f-]+)"\]\}'))[1],
  pg_temp.szid('o', 'Large')::text, 'AC19: ... and names the offending size in the detail');
select is(pg_temp.state_of('o', pg_temp.q_update('o', (select id from _u1id), (select v from _u1v), (select c1 from _o), current_date - 4, array['Medium'], array[100], array[6.00])), 'TM051|line_locked', 'AC19: a delivered line cannot be removed (TM051 line_locked)');
select is(pg_temp.state_of('o', pg_temp.q_update('o', (select id from _u1id), (select v from _u1v), (select c1 from _o), current_date, array['Large', 'Medium'], array[300, 100], array[6.50, 6.00])), 'TM055|order_date', 'AC57: the order date cannot pass the first non-voided delivery (TM055 order_date)');

create temp table _u2 as
  select pg_temp.rpc_as('o', pg_temp.q_update('o', (select id from _u1id), (select v from _u1v), (select c1 from _o), current_date - 5,
    array['Large', 'Medium', 'Small'], array[300, 100, 30], array[7.00, 6.00, 6.50], current_date)) as r;
select is((select r ->> 'changed' from _u2), 'true', 'AC19: after a delivery the price can change, a line can be added and the order date can move earlier');
select is((select r -> 'order' ->> 'status' from _u2), 'partially_fulfilled', 'AC19: ... and the order stays Partially fulfilled');
select is((select l.price_per_tray from public.sale_lines l join public.sales s on s.id = l.sale_id where s.order_id = (select id from _u1id) limit 1), 6.50, 'AC19: a price change never touches a delivery already made');
select is(pg_temp.ln((select r -> 'order' from _u2), 'o', 'Large') ->> 'pricePerTray', '7.00', 'AC19: ... only the order line (future deliveries)');

-- Lowering every line to what was delivered makes the order Fulfilled by itself.
create temp table _u3 as
  select pg_temp.rpc_as('o', pg_temp.q_update('o', (select id from _u1id), (select (r -> 'order' ->> 'version')::bigint from _u2), (select c1 from _o), current_date - 5,
    array['Large'], array[120], array[7.00], current_date)) as r;
select is((select r -> 'order' ->> 'status' from _u3), 'fulfilled', 'AC19: lowering every line to its delivered amount makes the order Fulfilled');
select is((select jsonb_array_length(r -> 'order' -> 'lines') from _u3), 1, 'AC19: ... after dropping the lines that had nothing delivered');

-- ---------------------------------------------------------------------------------------------
-- G. Void of a delivery (AC35) and the trigger path; edits of a linked sale (AC36).
-- ---------------------------------------------------------------------------------------------
create temp table _v1 as
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date - 2, array['Large'], array[300], array[6.50])) as r;
create temp table _v1id as select (r -> 'order' ->> 'id')::uuid as id from _v1;
create temp table _v1a as select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select id from _v1id), current_date - 1, array['Large'], array[100])) as r;
create temp table _v1b as select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select id from _v1id), current_date, array['Large'], array[200])) as r;
select is((select r -> 'order' ->> 'status' from _v1b), 'fulfilled', 'setup: the order is Fulfilled by two deliveries');
create temp table _large1 as select pg_temp.oh('o', 'Large') as n;

create temp table _v1bv as
  select pg_temp.rpc_as('o', pg_temp.q_void('o', (select (r -> 'sale' ->> 'id')::uuid from _v1b), (select (r -> 'sale' ->> 'version')::bigint from _v1b))) as r;
select is((select r -> 'order' ->> 'status' from _v1bv), 'partially_fulfilled', 'AC35: voiding one of two deliveries of a Fulfilled order: Partially fulfilled');
select is((select (r -> 'order' -> 'lines' -> 0 ->> 'remainingEggs')::int from _v1bv), 200, 'AC35: ... the voided eggs are owed again');
select is((select (r -> 'order' ->> 'voidedDeliveryCount')::int from _v1bv), 1, 'AC35: ... and the voided delivery is counted separately');
select is((select (r -> 'order' ->> 'version')::bigint from _v1bv), (select (r -> 'order' ->> 'version')::bigint from _v1b) + 1, 'AC35/AC20: ... and the order''s version moved');
select is((select r -> 'sale' ->> 'orderId' from _v1bv), (select id::text from _v1id), 'the void response carries the sale');
select is(pg_temp.oh('o', 'Large'), (select n from _large1) + 200, 'AC35: the voided eggs are back on hand');
select is(
  (select (d ->> 'voidedAt') is not null from jsonb_array_elements(pg_temp.ord((select id from _v1id)) -> 'deliveries') d where (d ->> 'saleNumber')::int = (select (r -> 'sale' ->> 'saleNumber')::int from _v1b)),
  true, 'AC35: the order''s delivery list shows the voided one as voided');

create temp table _v1av as
  select pg_temp.rpc_as('o', pg_temp.q_void('o', (select (r -> 'sale' ->> 'id')::uuid from _v1a), (select (r -> 'sale' ->> 'version')::bigint from _v1a))) as r;
select is((select r -> 'order' ->> 'status' from _v1av), 'ready', 'AC35/G1: voiding the last non-voided delivery sends a Partially fulfilled order back to Ready');
select is((select (r -> 'order' ->> 'deliveryCount')::int from _v1av), 0, 'AC35/G1: ... with no counted delivery left');
create temp table _v1x as select pg_temp.rpc_as('o', pg_temp.q_one('o', 'cancel_order', (select id from _v1id))) as r;
select is((select r -> 'order' ->> 'status' from _v1x), 'cancelled', 'AC22/G1: an order whose every delivery is voided can be cancelled');

-- A Fulfilled order with ONE delivery, voided: back to Ready.
create temp table _v2 as
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[30], array[6.50])) as r;
create temp table _v2d as select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select (r -> 'order' ->> 'id')::uuid from _v2), current_date, array['Small'], array[30])) as r;
select is((select r -> 'order' ->> 'status' from _v2d), 'fulfilled', 'setup: Fulfilled by one delivery');
select is(
  (pg_temp.rpc_as('o', pg_temp.q_void('o', (select (r -> 'sale' ->> 'id')::uuid from _v2d), (select (r -> 'sale' ->> 'version')::bigint from _v2d))) -> 'order' ->> 'status'),
  'ready', 'AC35: voiding the only delivery of a Fulfilled order: Ready');

-- A hand-built `update sales set voided_at` fixes the order too (the trigger lives on the table).
create temp table _v3 as
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Small'], array[60], array[6.50])) as r;
create temp table _v3d as select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select (r -> 'order' ->> 'id')::uuid from _v3), current_date, array['Small'], array[30])) as r;
select is(pg_temp.try_detail('o', format('update public.sales set voided_at = now(), version = version + 1 where id = %L', (select r -> 'sale' ->> 'id' from _v3d))), 'ok', 'a hand-built void is allowed for the owner (the same column void_sale writes)');
select is((pg_temp.ord((select (r -> 'order' ->> 'id')::uuid from _v3)) ->> 'status'), 'ready', 'AC35: ... and the trigger brought the order back to Ready');

-- Closed short stays closed when one of its deliveries is voided; dropped amounts do not change.
create temp table _kv as
  select pg_temp.rpc_as('o', pg_temp.q_void('o', (select (r -> 'sale' ->> 'id')::uuid from _k1d), (select (r -> 'sale' ->> 'version')::bigint from _k1d))) as r;
select is((select r -> 'order' ->> 'status' from _kv), 'fulfilled', 'AC35: a closed-short order stays Fulfilled when a delivery is voided');
select isnt((select r -> 'order' ->> 'closedShortAt' from _kv), null, 'AC35: ... and closed short');
select is((pg_temp.ln((select r -> 'order' from _kv), 'o', 'Medium') ->> 'droppedEggs')::int, 30, 'AC35: ... and its dropped amount is unchanged');

-- Editing a linked sale (AC36): only the date.
create temp table _l as select (r -> 'sale') as s, (r -> 'order') as o from _dl1;
select is(pg_temp.state_of('o', format('select public.update_sale(%L, %L, %L, ''delivery'', %L, array[%L]::uuid[], array[120], array[6.5], %L)', (select t from _o), (select s ->> 'id' from _l), (select s ->> 'version' from _l), current_date - 1, pg_temp.szid('o', 'Large'), (select c2 from _o))), 'TM053|', 'AC36: a linked sale''s client cannot change (TM053)');
select is(pg_temp.state_of('o', format('select public.update_sale(%L, %L, %L, ''delivery'', %L, array[%L]::uuid[], array[90], array[6.5], %L)', (select t from _o), (select s ->> 'id' from _l), (select s ->> 'version' from _l), current_date - 1, pg_temp.szid('o', 'Large'), (select c1 from _o))), 'TM053|', 'AC36: ... nor its eggs');
select is(pg_temp.state_of('o', format('select public.update_sale(%L, %L, %L, ''delivery'', %L, array[%L]::uuid[], array[120], array[7.5], %L)', (select t from _o), (select s ->> 'id' from _l), (select s ->> 'version' from _l), current_date - 1, pg_temp.szid('o', 'Large'), (select c1 from _o))), 'TM053|', 'AC36: ... nor its price');
select is(pg_temp.state_of('o', format('select public.update_sale(%L, %L, %L, ''on_site'', %L, array[%L]::uuid[], array[120], array[6.5])', (select t from _o), (select s ->> 'id' from _l), (select s ->> 'version' from _l), current_date - 1, pg_temp.szid('o', 'Large'))), 'TM053|', 'AC42: ... nor its type');
select is(pg_temp.state_of('o', format('select public.update_sale(%L, %L, %L, ''delivery'', %L, array[%L]::uuid[], array[120], array[6.5], %L)', (select t from _o), (select s ->> 'id' from _l), (select s ->> 'version' from _l), current_date - 3, pg_temp.szid('o', 'Large'), (select c1 from _o))), 'TM055|sale_date', 'AC36: the date cannot be before the order date (TM055 sale_date)');
select is(pg_temp.state_of('o', format('select public.update_sale(%L, %L, %L, ''delivery'', %L, array[%L]::uuid[], array[120], array[6.5], %L)', (select t from _o), (select s ->> 'id' from _l), (select s ->> 'version' from _l), current_date + 2, pg_temp.szid('o', 'Large'), (select c1 from _o))), 'TM002|sale_date', 'AC36: ... or in the future (TM002 sale_date)');
select is((pg_temp.rpc_as('o', format('select public.update_sale(%L, %L, %L, ''delivery'', %L, array[%L]::uuid[], array[120], array[6.5], %L)', (select t from _o), (select s ->> 'id' from _l), (select s ->> 'version' from _l), current_date - 1, pg_temp.szid('o', 'Large'), (select c1 from _o))) ->> 'changed'), 'false', 'AC36: the same date is changed: false');
create temp table _ls as
  select pg_temp.rpc_as('o', format('select public.update_sale(%L, %L, %L, ''delivery'', %L, array[%L]::uuid[], array[120], array[6.5], %L)', (select t from _o), (select s ->> 'id' from _l), (select s ->> 'version' from _l), current_date - 2, pg_temp.szid('o', 'Large'), (select c1 from _o))) as r;
select is((select r ->> 'changed' from _ls), 'true', 'AC36: the date of a linked sale can change');
select is((pg_temp.ord((select id from _d1id)) ->> 'version')::bigint, (select (r -> 'order' ->> 'version')::bigint from _dl3) + 1, 'AC36/AC20: ... and bumped the order''s version by one');

-- ---------------------------------------------------------------------------------------------
-- H. Hand-built writes (AC50): the guard triggers, as the owner.
-- ---------------------------------------------------------------------------------------------
create temp table _g as
  select (select id from _d1id) as fulfilled_order,
         (select (r -> 'order' ->> 'id')::uuid from _v3) as ready_order,
         (select (r -> 'order' ->> 'id')::uuid from _o2) as cancelled_order,
         (select (r -> 'order' ->> 'id')::uuid from _u1) as partial_order,
         (select (r -> 'sale' ->> 'id')::uuid from _dl1) as linked_sale;
grant select on _g to authenticated;
create temp table _gp as   -- a fresh Partially fulfilled order for the guards
  select pg_temp.rpc_as('o', pg_temp.q_create('o', (select c1 from _o), current_date, array['Large', 'Medium'], array[300, 100], array[6.50, 6.00])) as r;
create temp table _gpd as select pg_temp.rpc_as('o', pg_temp.q_deliver('o', (select (r -> 'order' ->> 'id')::uuid from _gp), current_date, array['Large'], array[100])) as r;

select is(tests.try_as('o', format('update public.orders set status = ''fulfilled'' where id = %L', (select ready_order from _g))), 'TM054', 'AC50: an undelivered order cannot be set Fulfilled by hand (TM054)');
select is(tests.try_as('o', format('update public.orders set status = ''partially_fulfilled'' where id = %L', (select ready_order from _g))), 'TM054', 'AC50: ... or Partially fulfilled (TM054)');
select is(tests.try_as('o', format('update public.orders set status = ''confirmed'' where id = %L', (select (r -> 'order' ->> 'id')::uuid from _gp))), 'TM054', 'AC50: a delivered order cannot be set back to Confirmed by hand (TM054)');
select is(tests.try_as('o', format('update public.orders set status = ''cancelled'', cancelled_at = now() where id = %L', (select (r -> 'order' ->> 'id')::uuid from _gp))), 'TM047', 'AC22: an order with a delivery cannot be cancelled by hand (TM047)');
select is(tests.try_as('o', format('update public.orders set status = ''fulfilled'', closed_short_at = now() where id = %L', (select ready_order from _g))), 'TM048', 'AC34: only a Partially fulfilled order can be closed short by hand (TM048)');
select is(tests.try_as('o', format('update public.orders set cancelled_at = null, status = ''ready'' where id = %L', (select cancelled_order from _g))), 'TM046', 'AC22: a cancelled order cannot be reopened (TM046)');
select is(tests.try_as('o', format('update public.orders set wanted_by = current_date + 9 where id = %L', (select cancelled_order from _g))), 'TM046', 'AC19: a cancelled order''s header is frozen (TM046)');
select is(tests.try_as('o', format('update public.orders set wanted_by = current_date + 9 where id = %L', (select fulfilled_order from _g))), 'TM046', 'AC19: a fulfilled order''s header is frozen (TM046)');
select is(tests.try_as('o', format('update public.orders set client_id = %L where id = %L', (select c2 from _o), (select (r -> 'order' ->> 'id')::uuid from _gp))), 'TM051', 'AC19: the client cannot change after a delivery, even by hand (TM051)');
select is(tests.try_as('o', format('update public.orders set order_date = current_date + 1 where id = %L', (select (r -> 'order' ->> 'id')::uuid from _gp))), 'TM055', 'AC57: ... nor the order date past the first delivery, even by hand (TM055)');
select is(tests.try_as('o', format('update public.orders set order_number = 777 where id = %L', (select ready_order from _g))), '42501', 'AC18: the order number cannot be updated');
select is(tests.try_as('o', format('insert into public.orders (tenant_id, order_number, client_id, order_date, status) values (%L, 880, %L, current_date, ''fulfilled'')', (select t from _o), (select c1 from _o))), 'TM054', 'AC50: an order cannot be inserted already Fulfilled (TM054)');
select is(tests.try_as('o', format('insert into public.orders (tenant_id, order_number, client_id, order_date, version) values (%L, 881, %L, current_date, 5)', (select t from _o), (select c1 from _o))), '42501', 'AC50: ... or with a chosen version (no column grant)');
select is(tests.try_as('o', format('insert into public.orders (tenant_id, order_number, client_id, order_date, status) values (%L, 1, %L, current_date, ''requested'')', (select t from _o), (select c1 from _o))), '23505', 'AC18: a duplicate order number in a farm is refused (unique)');
select is(tests.try_as('o', format('insert into public.orders (tenant_id, order_number, client_id, order_date, status) values (%L, 882, %L, current_date + 3, ''requested'')', (select t from _o), (select c1 from _o))), '23514', 'AC15: an order date in the future is refused by the table check');
select is(tests.try_as('o', format('insert into public.orders (tenant_id, order_number, client_id, order_date, wanted_by, status) values (%L, 883, %L, current_date, current_date - 1, ''requested'')', (select t from _o), (select c1 from _o))), '23514', 'AC15: wanted-by before the order date is refused by the table check');
select is(tests.try_as('o', format('delete from public.orders where id = %L', (select ready_order from _g))), '42501', 'AC23: an order cannot be deleted');
select is(tests.try_as('o', format('delete from public.sales where id = %L', (select linked_sale from _g))), '42501', 'AC40: a sale cannot be deleted');

select is(tests.try_as('o', format('insert into public.sale_lines (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total) values (%L, %L, %L, 1, 6.5, 0.22)', (select t from _o), (select linked_sale from _g), pg_temp.szid('o', 'Medium'))), 'TM053', 'AC36: a line cannot be hand-added to a delivery (TM053)');
select is(tests.try_as('o', format('update public.sale_lines set eggs = 1 where sale_id = %L', (select linked_sale from _g))), 'TM053', 'AC36: ... nor edited');
select is(tests.try_as('o', format('delete from public.sale_lines where sale_id = %L', (select linked_sale from _g))), 'TM053', 'AC36: ... nor deleted');
select is(tests.try_as('o', format('update public.sales set client_id = %L where id = %L', (select c2 from _o), (select linked_sale from _g))), 'TM053', 'AC36: a delivery''s client cannot be changed by hand (TM053)');
select is(tests.try_as('o', format('update public.sales set type = ''on_site'' where id = %L', (select linked_sale from _g))), 'TM053', 'a linked sale cannot become on-site by hand either (TM053)');
select is(tests.try_as('o', format('update public.sales set order_id = null where id = %L', (select linked_sale from _g))), '42501', 'order_id is never updatable (no column grant)');
select is(tests.try_as('o', format('insert into public.sales (tenant_id, sale_number, client_id, type, sale_date, order_id) values (%L, 990, %L, ''delivery'', current_date, %L)', (select t from _o), (select c1 from _o), (select ready_order from _g))), 'TM053', 'QA B-1: a hand-built sale cannot be linked to an order; only deliver_order sets order_id (TM053)');
select is(tests.try_as('o', format('set constraints all immediate; insert into public.orders (tenant_id, order_number, client_id, order_date, status) values (%L, 890, %L, current_date, ''requested'')', (select t from _o), (select c1 from _o))), 'TM028', 'QA B-2: an order header with no line is refused at commit (TM028)');
select is(tests.try_as('o', format('set constraints all immediate; insert into public.sales (tenant_id, sale_number, type, sale_date) values (%L, 891, ''on_site'', current_date)', (select t from _o))), 'TM028', 'QA B-2: a sale header with no line is refused at commit (TM028)');
select is(tests.try_as('o', format('set constraints all immediate; with o as (insert into public.orders (tenant_id, order_number, client_id, order_date, status) values (%L, 892, %L, current_date, ''requested'') returning id) insert into public.order_lines (tenant_id, order_id, size_id, eggs, price_per_tray, line_total) select %L, o.id, %L, 30, 6.5, 6.5 from o', (select t from _o), (select c1 from _o), (select t from _o), pg_temp.szid('o', 'Small'))), 'ok:1', 'QA B-2: an order inserted together with its line is accepted');
set constraints all deferred;

select is(tests.try_as('o', format('update public.order_lines set eggs = 10 where order_id = %L and size_id = %L', (select (r -> 'order' ->> 'id')::uuid from _gp), pg_temp.szid('o', 'Large'))), 'TM051', 'AC19: a delivered line cannot go below delivered by hand (TM051)');
select is(tests.try_as('o', format('delete from public.order_lines where order_id = %L and size_id = %L', (select (r -> 'order' ->> 'id')::uuid from _gp), pg_temp.szid('o', 'Large'))), 'TM051', 'AC19: ... nor be deleted by hand (TM051)');
select is(tests.try_as('o', format('update public.order_lines set eggs = 5000 where order_id = %L', (select cancelled_order from _g))), 'TM046', 'AC19: a cancelled order''s lines are frozen (TM046)');
select is(tests.try_as('o', format('delete from public.order_lines where order_id = %L', (select fulfilled_order from _g))), 'TM046', 'AC19: ... and so are a fulfilled one''s (TM046)');
select is(tests.try_as('o', format('insert into public.order_lines (tenant_id, order_id, size_id, eggs, price_per_tray, line_total) values (%L, %L, %L, 5, 6.5, 1.08)', (select t from _o), (select fulfilled_order from _g), pg_temp.szid('o', 'Small'))), 'TM046', 'AC19: ... no line can be added to them (TM046)');
select is(tests.try_as('o', format('update public.order_lines set eggs = 0 where order_id = %L', (select ready_order from _g))), '23514', 'AC12: a line of 0 eggs is refused by the table check');
select is(tests.try_as('o', format('update public.order_lines set price_per_tray = 6.505 where order_id = %L', (select ready_order from _g))), '23514', 'AC12: ... and so is a 3-decimal price');
select is(tests.try_as('o', format('update public.order_lines set size_id = %L where order_id = %L', pg_temp.szid('o', 'Small'), (select ready_order from _g))), '42501', 'an order line''s size cannot be updated (no column grant)');

-- 20 lines are allowed, a 21st is refused at commit (deferred TM028 trigger): checked with the trigger forced immediate.
select is(
  (select count(*) from pg_trigger t where t.tgrelid = 'public.order_lines'::regclass and t.tgname = 'order_lines_bounds' and t.tgdeferrable and t.tginitdeferred),
  1::bigint, 'AC50: order_lines_bounds is a deferred constraint trigger');

-- The linked-sale flag cannot be reached through the Data API: PostgREST exposes only the configured schemas, and
-- neither a `set_config` function nor pg_catalog is among them (R4).
select is(
  (select count(*) from pg_proc p where p.proname = 'set_config' and p.pronamespace in ('public'::regnamespace, 'graphql_public'::regnamespace)),
  0::bigint, 'R4: no set_config function is exposed in the API schemas');
select ok(
  not exists (select 1 from pg_roles r, unnest(r.rolconfig) c where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%pg_catalog%'),
  'R4: pg_catalog is not among the schemas PostgREST exposes');

-- ---------------------------------------------------------------------------------------------
-- I. get_order and list_orders (AC2-AC7, AC49).
-- ---------------------------------------------------------------------------------------------
select is((pg_temp.rpc_as('o', format('select public.get_order(%L, gen_random_uuid())', (select t from _o))) -> 'order'), 'null'::jsonb, 'get_order on an unknown id is null');
select is((pg_temp.rpc_as('o', format('select public.get_order(%L, %L)', (select t from _o), (select id from _d1id))) -> 'order' ->> 'id'), (select id::text from _d1id), 'get_order returns the order with its deliveries');
select is(jsonb_array_length(pg_temp.rpc_as('o', format('select public.get_order(%L, %L)', (select t from _o), (select id from _d1id))) -> 'order' -> 'deliveries'), 3, 'AC7: ... all three deliveries');

create temp table _lt as select tests.tenant_id_of('l') as t, pg_temp.add_client('l', 'L Client A') as ca, pg_temp.add_client('l', 'L Client B') as cb;
grant select on _lt to authenticated;
select is((pg_temp.rpc_as('l', format('select public.list_orders(%L)', (select t from _lt))) ->> 'hasAny'), 'false', 'AC6: a farm with no orders has hasAny false');
-- 60 open orders, direct inserts (as postgres): every 3rd has a wanted-by date.
insert into public.orders (tenant_id, order_number, client_id, order_date, wanted_by, status)
select (select t from _lt), n, case when n % 2 = 0 then (select ca from _lt) else (select cb from _lt) end,
       current_date - (n % 20), case when n % 3 = 0 then current_date + (n % 7) else null end, 'confirmed'
from generate_series(1, 60) n;
insert into public.order_lines (tenant_id, order_id, size_id, eggs, price_per_tray, line_total)
select o.tenant_id, o.id, pg_temp.szid('l', 'Large'), 30, 6.5, 6.5 from public.orders o where o.tenant_id = (select t from _lt);
update public.order_counters set next_number = 61 where tenant_id = (select t from _lt);

select is((pg_temp.rpc_as('l', format('select public.list_orders(%L, ''open'', null, null, null, 5, 0)', (select t from _lt))) ->> 'total')::int, 60, 'AC5: the open view counts all 60');
select is(jsonb_array_length(pg_temp.rpc_as('l', format('select public.list_orders(%L, ''open'', null, null, null, 5, 0)', (select t from _lt))) -> 'orders'), 60, 'AC5: ... and returns all 60, ignoring the limit');
select is(
  array(select (e ->> 'orderNumber')::int from jsonb_array_elements(pg_temp.rpc_as('l', format('select public.list_orders(%L, ''open'', null, null, null, 5, 0)', (select t from _lt))) -> 'orders') with ordinality t(e, o) order by o),
  array(select order_number::int from public.orders where tenant_id = (select t from _lt) order by wanted_by asc nulls last, order_date asc, order_number asc),
  'AC3: the open view is sorted wanted-by soonest first (none last), then oldest order, then number');

-- Other statuses: one cancelled, one fulfilled, one closed short, through the real functions.
create temp table _lc as
  select pg_temp.rpc_as('l', pg_temp.q_create('l', (select ca from _lt), current_date, array['Large'], array[30], array[6.5])) as r;
create temp table _lcc as select pg_temp.rpc_as('l', pg_temp.q_one('l', 'cancel_order', (select (r -> 'order' ->> 'id')::uuid from _lc))) as r;
select pg_temp.produce('l', 'Large', 1000);
create temp table _lf as
  select pg_temp.rpc_as('l', pg_temp.q_create('l', (select ca from _lt), current_date - 30, array['Large'], array[30], array[6.5])) as r;
select pg_temp.rpc_as('l', pg_temp.q_deliver('l', (select (r -> 'order' ->> 'id')::uuid from _lf), current_date - 20, array['Large'], array[30]));
create temp table _lk as
  select pg_temp.rpc_as('l', pg_temp.q_create('l', (select cb from _lt), current_date - 31, array['Large'], array[60], array[6.5])) as r;
create temp table _lkd as select pg_temp.rpc_as('l', pg_temp.q_deliver('l', (select (r -> 'order' ->> 'id')::uuid from _lk), current_date - 20, array['Large'], array[30])) as r;
select pg_temp.rpc_as('l', pg_temp.q_one('l', 'close_order', (select (r -> 'order' ->> 'id')::uuid from _lk), (select r -> 'order' ->> 'version' from _lkd)));

select is((pg_temp.rpc_as('l', format('select public.list_orders(%L, ''open'')', (select t from _lt))) ->> 'total')::int, 60, 'AC4: the open view excludes cancelled, fulfilled and closed-short orders');
select is((pg_temp.rpc_as('l', format('select public.list_orders(%L, ''all'')', (select t from _lt))) ->> 'total')::int, 63, 'AC4: All counts every order');
select is((pg_temp.rpc_as('l', format('select public.list_orders(%L, ''cancelled'')', (select t from _lt))) ->> 'total')::int, 1, 'AC4: Cancelled');
select is((pg_temp.rpc_as('l', format('select public.list_orders(%L, ''fulfilled'')', (select t from _lt))) ->> 'total')::int, 2, 'AC4: Fulfilled includes the closed-short order');
select is(jsonb_array_length(pg_temp.rpc_as('l', format('select public.list_orders(%L, ''all'', null, null, null, 25, 0)', (select t from _lt))) -> 'orders'), 25, 'AC49: a non-open view pages by the limit');
select is(jsonb_array_length(pg_temp.rpc_as('l', format('select public.list_orders(%L, ''all'', null, null, null, 25, 50)', (select t from _lt))) -> 'orders'), 13, 'AC49: ... and by the offset (63 - 50)');
select is(
  array(select (e ->> 'orderNumber')::int from jsonb_array_elements(pg_temp.rpc_as('l', format('select public.list_orders(%L, ''all'', null, null, null, 100, 0)', (select t from _lt))) -> 'orders') with ordinality t(e, o) order by o),
  array(select order_number::int from public.orders where tenant_id = (select t from _lt) order by order_date desc, order_number desc),
  'AC3: other views are newest order date first, then highest number');
select is((pg_temp.rpc_as('l', format('select public.list_orders(%L, ''open'', %L)', (select t from _lt), (select ca from _lt))) ->> 'total')::int, 30, 'AC4: the client filter');
select is((pg_temp.rpc_as('l', format('select public.list_orders(%L, ''open'', null, %L, %L)', (select t from _lt), current_date - 2, current_date - 1)) ->> 'total')::int,
  (select count(*)::int from public.orders where tenant_id = (select t from _lt) and status = 'confirmed' and order_date between current_date - 2 and current_date - 1),
  'AC4: the date range includes both end dates');
select is((pg_temp.rpc_as('l', format('select public.list_orders(%L, ''open'', %L, %L, null)', (select t from _lt), (select cb from _lt), current_date - 2)) ->> 'total')::int,
  (select count(*)::int from public.orders where tenant_id = (select t from _lt) and status = 'confirmed' and client_id = (select cb from _lt) and order_date >= current_date - 2),
  'AC4: filters combine');
select is((pg_temp.rpc_as('l', format('select public.list_orders(%L, ''open'', null, %L)', (select t from _lt), current_date + 5)) ->> 'total')::int, 0, 'AC6: a filter that matches nothing has total 0...');
select is((pg_temp.rpc_as('l', format('select public.list_orders(%L, ''open'', null, %L)', (select t from _lt), current_date + 5)) ->> 'hasAny'), 'true', 'AC6: ... while hasAny stays true');
select is(pg_temp.state_of('l', format('select public.list_orders(%L, ''bogus'')', (select t from _lt))), 'TM005|', 'an unknown view is TM005');

-- ---------------------------------------------------------------------------------------------
-- J. order_status_for: the shared fixture table of tests/unit/order-status.spec.ts (D9).
-- Each row is built with the guard triggers off (the guards would refuse an inconsistent state), then read back
-- through the real function. Triggers are switched back on right after.
-- ---------------------------------------------------------------------------------------------
create temp table _x as
  select tests.tenant_id_of('x') as t, pg_temp.add_client('x', 'X Client') as c1, pg_temp.szid('x', 'Large') as l1, pg_temp.szid('x', 'Medium') as l2;

create function pg_temp.fixture(p_status text, p_closed boolean, p_lines int[]) returns text language plpgsql as $$
declare
  v_t     uuid := (select t from _x);
  v_order uuid;
  v_sale  uuid;
  v_n     bigint;
  v_i     int;
  v_res   text;
  v_sizes uuid[] := array[(select l1 from _x), (select l2 from _x)];
begin
  set constraints all immediate;
  alter table public.orders disable trigger user;
  alter table public.order_lines disable trigger user;
  alter table public.sale_lines disable trigger user;
  alter table public.sales disable trigger user;
  select coalesce(max(order_number), 0) + 1 into v_n from public.orders where tenant_id = v_t;
  insert into public.orders (id, tenant_id, order_number, client_id, order_date, status, cancelled_at, closed_short_at)
  values (gen_random_uuid(), v_t, v_n, (select c1 from _x), current_date, p_status,
          case when p_status = 'cancelled' then now() end, case when p_closed then now() end)
  returning id into v_order;
  for v_i in 1 .. cardinality(p_lines) / 2 loop
    insert into public.order_lines (tenant_id, order_id, size_id, eggs, price_per_tray, line_total)
    values (v_t, v_order, v_sizes[v_i], p_lines[2 * v_i - 1], 6.5, 1);
    if p_lines[2 * v_i] > 0 then
      select coalesce(max(sale_number), 0) + 1 into v_n from public.sales where tenant_id = v_t;
      insert into public.sales (tenant_id, sale_number, client_id, type, sale_date, order_id)
      values (v_t, v_n, (select c1 from _x), 'delivery', current_date, v_order) returning id into v_sale;
      insert into public.sale_lines (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total)
      values (v_t, v_sale, v_sizes[v_i], p_lines[2 * v_i], 6.5, 1);
    end if;
  end loop;
  alter table public.orders enable trigger user;
  alter table public.order_lines enable trigger user;
  alter table public.sale_lines enable trigger user;
  alter table public.sales enable trigger user;
  set constraints all deferred;
  v_res := app.order_status_for(v_t, v_order);
  return v_res;
end
$$;

-- row: current status, closed short, [ordered, delivered] per line  ->  expected
select is(pg_temp.fixture('requested', false, array[300, 0]), 'requested', 'D9 fixture 1: requested, nothing delivered -> requested');
select is(pg_temp.fixture('confirmed', false, array[300, 0, 100, 0]), 'confirmed', 'D9 fixture 2: confirmed, two lines, nothing delivered -> confirmed');
select is(pg_temp.fixture('ready', false, array[300, 0]), 'ready', 'D9 fixture 3: ready, nothing delivered -> ready');
select is(pg_temp.fixture('partially_fulfilled', false, array[300, 0]), 'ready', 'D9 fixture 4: partially fulfilled with nothing delivered (last delivery voided) -> ready');
select is(pg_temp.fixture('fulfilled', false, array[300, 0]), 'ready', 'D9 fixture 5: fulfilled with nothing delivered -> ready');
select is(pg_temp.fixture('ready', false, array[300, 120]), 'partially_fulfilled', 'D9 fixture 6: ready, 120 of 300 delivered -> partially fulfilled');
select is(pg_temp.fixture('requested', false, array[300, 120]), 'partially_fulfilled', 'D9 fixture 7: requested, 120 delivered -> partially fulfilled');
select is(pg_temp.fixture('partially_fulfilled', false, array[300, 300, 100, 40]), 'partially_fulfilled', 'D9 fixture 8: one line done, one not -> partially fulfilled');
select is(pg_temp.fixture('ready', false, array[300, 300]), 'fulfilled', 'D9 fixture 9: ready, everything delivered -> fulfilled');
select is(pg_temp.fixture('partially_fulfilled', false, array[300, 300, 100, 100]), 'fulfilled', 'D9 fixture 10: both lines done -> fulfilled');
select is(pg_temp.fixture('fulfilled', false, array[300, 300, 100, 40]), 'partially_fulfilled', 'D9 fixture 11: fulfilled with something owed again (a void) -> partially fulfilled');
select is(pg_temp.fixture('fulfilled', true, array[300, 200]), 'fulfilled', 'D9 fixture 12: closed short stays fulfilled');
select is(pg_temp.fixture('fulfilled', true, array[300, 0]), 'fulfilled', 'D9 fixture 13: closed short with nothing delivered stays fulfilled');
select is(pg_temp.fixture('cancelled', false, array[300, 0]), 'cancelled', 'D9 fixture 14: cancelled stays cancelled');
select is((select count(*) from pg_trigger where tgrelid in ('public.orders'::regclass, 'public.order_lines'::regclass, 'public.sale_lines'::regclass, 'public.sales'::regclass) and tgenabled = 'D'), 0::bigint, 'the guard triggers are enabled again after the fixtures');

select * from finish();
rollback;
