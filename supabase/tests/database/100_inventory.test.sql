-- 100_inventory: app.owed_by_size, app.inventory_json, public.get_inventory (M21).
-- docs/features/06-inventory.md §3.1, §3.6. Functions run as the farm owner, as the server calls them.
begin;
select plan(40);

select tests.create_farm('Farm I', 'i');   -- the PM's worked example and every state change
select tests.create_farm('Farm J', 'j');   -- another farm: must change nothing in I
select tests.create_farm('Farm E', 'e');   -- empty / rejects only / sales only

create function pg_temp.rpc_as(p_who text, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_who);
  execute p_sql into v;
  perform tests.clear_authentication();
  return v;
end
$$;

create function pg_temp.szid(p_who text, p_name text) returns uuid language sql stable as $$
  select s.id from public.sizes s where s.tenant_id = tests.tenant_id_of(p_who) and s.name = p_name
$$;

create function pg_temp.produce(p_who text, p_size_name text, p_eggs integer, p_quality text default 'good') returns void language plpgsql as $$
begin
  insert into public.production (tenant_id, produced_on, size_id, quality, eggs)
  values (tests.tenant_id_of(p_who), current_date, case when p_quality = 'reject' then null else pg_temp.szid(p_who, p_size_name) end, p_quality, p_eggs)
  on conflict (tenant_id, produced_on, quality, size_id) do update set eggs = public.production.eggs + excluded.eggs;
end
$$;

create function pg_temp.add_client(p_who text, p_name text) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.clients (tenant_id, name) values (tests.tenant_id_of(p_who), p_name) returning id into v_id;
  return v_id;
end
$$;

-- The screen payload, as the signed-in owner.
create function pg_temp.inv(p_who text) returns jsonb language sql as $$
  select pg_temp.rpc_as(p_who, format('select public.get_inventory(%L)', tests.tenant_id_of(p_who)))
$$;

-- One field of one size in a payload (null when the size is not listed).
create function pg_temp.f(p_inv jsonb, p_who text, p_size text, p_field text) returns bigint language sql stable as $$
  select (s ->> p_field)::bigint from jsonb_array_elements(p_inv -> 'sizes') s where s ->> 'id' = pg_temp.szid(p_who, p_size)::text
$$;

create function pg_temp.mk_order(p_who text, p_client uuid, p_names text[], p_eggs int[]) returns jsonb language sql as $$
  select pg_temp.rpc_as(p_who, format('select public.create_order(%L, gen_random_uuid(), %L, current_date, %L::uuid[], %L::int[], (select array_agg(6.5::numeric) from generate_series(1, %s)))',
    tests.tenant_id_of(p_who), p_client,
    (select array_agg(pg_temp.szid(p_who, n) order by o) from unnest(p_names) with ordinality t(n, o)),
    p_eggs, cardinality(p_eggs)))
$$;

create function pg_temp.oid_of(p_order jsonb) returns uuid language sql immutable as $$ select (p_order -> 'order' ->> 'id')::uuid $$;

create function pg_temp.step(p_who text, p_fn text, p_order uuid, p_extra text default null) returns jsonb language sql as $$
  select pg_temp.rpc_as(p_who, format('select public.%s(%L, %L%s)', p_fn, tests.tenant_id_of(p_who), p_order, coalesce(', ' || p_extra, '')))
$$;

create function pg_temp.deliver(p_who text, p_order uuid, p_size text, p_eggs int) returns jsonb language sql as $$
  select pg_temp.rpc_as(p_who, format('select public.deliver_order(%L, gen_random_uuid(), %L, current_date, array[%L]::uuid[], array[%s], true)',
    tests.tenant_id_of(p_who), p_order, pg_temp.szid(p_who, p_size), p_eggs))
$$;

-- ---------------------------------------------------------------------------------------------
-- Empty states (AC15, AC7, AC13): nothing, rejects only, sales only.
-- ---------------------------------------------------------------------------------------------
select is((pg_temp.inv('e') ->> 'hasAny'), 'false', 'hasAny is false for a farm with no production');
select is(jsonb_array_length(pg_temp.inv('e') -> 'sizes'), 4, 'AC1: every active size still has a row (the four seeded sizes) when empty');
select pg_temp.produce('e', null, 50, 'reject');
select is((pg_temp.inv('e') ->> 'hasAny'), 'false', 'AC7: rejects only is still the empty state');
select is((select sum((s ->> 'onHandEggs')::int) from jsonb_array_elements(pg_temp.inv('e') -> 'sizes') s), 0::bigint, 'AC7: rejects never appear in any on-hand figure');

select pg_temp.rpc_as('e', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[60], array[6.5], null, true)',
  tests.tenant_id_of('e'), pg_temp.szid('e', 'Small')));
select is((pg_temp.inv('e') ->> 'hasAny'), 'true', 'a farm with a sale but no production shows cards (hasAny true)');
select is(pg_temp.f(pg_temp.inv('e'), 'e', 'Small', 'onHandEggs'), -60::bigint, 'AC13: on hand is the true negative, never clamped');

-- ---------------------------------------------------------------------------------------------
-- The PM's worked example (farm I). Large 600 - 240 = 360; Medium 300; Small 0; Jumbo 90.
-- Order A: Large 300. Order B: Medium 150 with 60 delivered.
-- ---------------------------------------------------------------------------------------------
create temp table _i as select tests.tenant_id_of('i') as t, pg_temp.add_client('i', 'I Client') as c;
grant select on _i to authenticated;
select pg_temp.produce('i', 'Large', 600);
select pg_temp.produce('i', 'Medium', 300);
select pg_temp.produce('i', 'Jumbo', 90);
select pg_temp.produce('i', null, 40, 'reject');
create temp table _sale as
  select pg_temp.rpc_as('i', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[240], array[6.5], null, true)',
    (select t from _i), pg_temp.szid('i', 'Large'))) as r;
create temp table _a as select pg_temp.mk_order('i', (select c from _i), array['Large'], array[300]) as r;
create temp table _b as select pg_temp.mk_order('i', (select c from _i), array['Medium'], array[150]) as r;
select pg_temp.deliver('i', pg_temp.oid_of((select r from _b)), 'Medium', 60);
-- B's delivery took 60 Medium (on hand 240); more production restores the example's 300.
select pg_temp.produce('i', 'Medium', 60);

create temp table _inv as select pg_temp.inv('i') as j;
select is(pg_temp.f((select j from _inv), 'i', 'Large', 'onHandEggs'), 360::bigint, 'AC2: Large on hand 600 - 240 = 360');
select is(pg_temp.f((select j from _inv), 'i', 'Medium', 'onHandEggs'), 300::bigint, 'AC2: Medium on hand 300 (360 produced - 60 delivered)');
select is(pg_temp.f((select j from _inv), 'i', 'Small', 'onHandEggs'), 0::bigint, 'AC1/AC2: Small shows 0');
select is(pg_temp.f((select j from _inv), 'i', 'Jumbo', 'onHandEggs'), 90::bigint, 'AC2: Jumbo on hand 90');
select is((select sum((s ->> 'onHandEggs')::int) from jsonb_array_elements((select j from _inv) -> 'sizes') s), 750::bigint, 'AC3: total on hand 750');
select is(pg_temp.f((select j from _inv), 'i', 'Large', 'owedEggs'), 300::bigint, 'AC4: Large owed 300');
select is(pg_temp.f((select j from _inv), 'i', 'Medium', 'owedEggs'), 90::bigint, 'AC4: Medium owed 150 - 60 delivered = 90');
select is((select sum((s ->> 'owedEggs')::int) from jsonb_array_elements((select j from _inv) -> 'sizes') s), 390::bigint, 'AC4: total owed 390');
select is((select j ->> 'hasAny' from _inv), 'true', 'hasAny is true with production');
select is(
  (select array_agg(s ->> 'name' order by o) from jsonb_array_elements((select j from _inv) -> 'sizes') with ordinality t(s, o)),
  (select array_agg(name::text order by sort_order, name, id) from public.sizes where tenant_id = (select t from _i)),
  'AC1: sizes come in the farm''s order, with the farm''s names');
select is(
  (select (j -> 'sizes' -> 0) ?& array['id', 'name', 'sortOrder', 'colorSlot', 'active', 'onHandEggs', 'owedEggs'] from _inv),
  true, 'a size row carries id, name, sortOrder, colorSlot, active, onHandEggs, owedEggs');

select is(
  (select array_agg((s ->> 'onHandEggs')::int order by s ->> 'id') from jsonb_array_elements((select j from _inv) -> 'sizes') s),
  (select array_agg((e ->> 'eggs')::int order by e ->> 'sizeId') from jsonb_array_elements(app.on_hand_json((select t from _i), null) -> 'onHand') e),
  'AC12: on hand equals app.on_hand_json, size for size');

-- Parity with app.order_json: the sum of remainingEggs over all orders equals owedEggs, per size.
create function pg_temp.parity_diff() returns bigint language sql as $$
  with p as (
    select (l ->> 'sizeId')::uuid as size_id, sum((l ->> 'remainingEggs')::int) as owed
    from public.orders o, lateral jsonb_array_elements(app.order_json(o.tenant_id, o.id) -> 'lines') l
    where o.tenant_id = (select t from _i) group by 1
  )
  select count(*) from p full join app.owed_by_size((select t from _i)) w on w.size_id = p.size_id
  where coalesce(p.owed, 0) <> coalesce(w.eggs, 0)
$$;
select is(pg_temp.parity_diff(), 0::bigint, 'parity: owed_by_size equals the sum of order_json remainingEggs, per size');

-- AC5/AC11: order create / confirm / ready / cancel change owed only, never on hand.
create temp table _oh0 as select app.on_hand_json((select t from _i), null) as j;
create temp table _c as select pg_temp.mk_order('i', (select c from _i), array['Small'], array[30]) as r;
select is(pg_temp.f(pg_temp.inv('i'), 'i', 'Small', 'owedEggs'), 30::bigint, 'AC5: a new order adds to owed');
select pg_temp.step('i', 'set_order_status', pg_temp.oid_of((select r from _c)), '''confirmed''');
select pg_temp.step('i', 'set_order_status', pg_temp.oid_of((select r from _c)), '''ready''');
select is(pg_temp.f(pg_temp.inv('i'), 'i', 'Small', 'owedEggs'), 30::bigint, 'AC4: Confirmed and Ready orders are still open and owed');
select pg_temp.step('i', 'cancel_order', pg_temp.oid_of((select r from _c)));
select is(pg_temp.f(pg_temp.inv('i'), 'i', 'Small', 'owedEggs'), 0::bigint, 'AC4: a Cancelled order contributes 0');
select is(app.on_hand_json((select t from _i), null), (select j from _oh0), 'AC5/AC11: creating, confirming, readying and cancelling orders never changes on hand');

-- Closed short and Fulfilled contribute 0 (AC4).
create temp table _d as select pg_temp.mk_order('i', (select c from _i), array['Jumbo'], array[60]) as r;
select pg_temp.deliver('i', pg_temp.oid_of((select r from _d)), 'Jumbo', 30);
select is(pg_temp.f(pg_temp.inv('i'), 'i', 'Jumbo', 'owedEggs'), 30::bigint, 'a partly delivered order owes the rest (60 - 30)');
select pg_temp.step('i', 'close_order', pg_temp.oid_of((select r from _d)),
  (select o.version::text from public.orders o where o.id = pg_temp.oid_of((select r from _d))));
select is(pg_temp.f(pg_temp.inv('i'), 'i', 'Jumbo', 'owedEggs'), 0::bigint, 'AC4: a Closed-short order contributes 0 (dropped eggs are not owed)');
create temp table _f as select pg_temp.mk_order('i', (select c from _i), array['Jumbo'], array[30]) as r;
select pg_temp.deliver('i', pg_temp.oid_of((select r from _f)), 'Jumbo', 30);
select is(pg_temp.f(pg_temp.inv('i'), 'i', 'Jumbo', 'owedEggs'), 0::bigint, 'AC4: a Fulfilled order contributes 0');
select is(pg_temp.parity_diff(), 0::bigint, 'parity still holds with cancelled, closed-short and fulfilled orders');

-- Voiding the example's sale returns its eggs (Large 360 -> 600).
create temp table _v as
  select pg_temp.rpc_as('i', format('select public.void_sale(%L, %L, %L)', (select t from _i), (select r -> 'sale' ->> 'id' from _sale), (select r -> 'sale' ->> 'version' from _sale))) as r;
select is(pg_temp.f(pg_temp.inv('i'), 'i', 'Large', 'onHandEggs'), 600::bigint, 'AC10: voiding the 240-egg sale returns its eggs');

-- AC10: a delivery lowers on hand and owed together (deliver 120 of A: Large 600 -> 480, owed 300 -> 180).
create temp table _dl as select pg_temp.deliver('i', pg_temp.oid_of((select r from _a)), 'Large', 120) as r;
select is(pg_temp.f(pg_temp.inv('i'), 'i', 'Large', 'onHandEggs'), 480::bigint, 'AC10: delivering from order A lowers Large on hand by the delivered eggs');
select is(pg_temp.f(pg_temp.inv('i'), 'i', 'Large', 'owedEggs'), 180::bigint, 'AC10: ... and lowers what A still owes in the same step');
select pg_temp.rpc_as('i', format('select public.void_sale(%L, %L, %L)', (select t from _i), x.id, x.version))
  from (select id, version from public.sales where tenant_id = (select t from _i) and order_id = pg_temp.oid_of((select r from _a)) and voided_at is null) x;
select is(pg_temp.f(pg_temp.inv('i'), 'i', 'Large', 'owedEggs'), 300::bigint, 'AC10: voiding the delivery puts the eggs back on the order');
select is(pg_temp.f(pg_temp.inv('i'), 'i', 'Large', 'onHandEggs'), 600::bigint, 'AC10: ... and back on hand');
select is(pg_temp.parity_diff(), 0::bigint, 'parity holds after voids');

-- AC14: an archived size is shown only while it has eggs on hand or owed.
select pg_temp.rpc_as('j', format('select public.archive_size(%L, %L)', tests.tenant_id_of('j'), pg_temp.szid('j', 'Small')));
select is(pg_temp.f(pg_temp.inv('j'), 'j', 'Small', 'onHandEggs'), null, 'AC14: an archived size at 0 and 0 is not listed');
select is(jsonb_array_length(pg_temp.inv('j') -> 'sizes'), 3, 'AC14: ... the other three sizes still are');
select pg_temp.produce('i', 'Small', 30);
select pg_temp.rpc_as('i', format('select public.archive_size(%L, %L)', (select t from _i), pg_temp.szid('i', 'Small')));
select is(pg_temp.f(pg_temp.inv('i'), 'i', 'Small', 'onHandEggs'), 30::bigint, 'AC14: an archived size with eggs is listed');
select is((pg_temp.inv('i') -> 'sizes' -> -1 ->> 'active'), 'false', 'AC14: ... after the active sizes, marked active = false');

-- AC21: another farm's data changes nothing here, and its tenant id is refused.
create temp table _before as select pg_temp.inv('i') as j;
select pg_temp.produce('j', 'Large', 9000);
select pg_temp.mk_order('j', pg_temp.add_client('j', 'J Client'), array['Large'], array[3000]);
select is(pg_temp.inv('i'), (select j from _before), 'AC21: another farm''s production and orders change nothing in this farm''s figures');
select is(tests.try_as('i', format('select public.get_inventory(%L)', tests.tenant_id_of('j'))), 'TM006', 'get_inventory with another farm''s tenant id is refused (TM006)');
select is(tests.try_as('anon', format('select public.get_inventory(%L)', tests.tenant_id_of('i'))), '42501', 'anon cannot execute get_inventory');

select * from finish();
rollback;
