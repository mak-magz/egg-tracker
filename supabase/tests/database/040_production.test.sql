-- 040_production: sizes seeding, production constraints and the production functions.
-- docs/features/01-production-logging.md §3.1, §3.6. RPCs run as the farm owner (authenticated + RLS).
begin;
select plan(61);

select tests.create_farm('Farm A', 'a');
select tests.create_farm('Farm C', 'c');
select tests.create_farm('Farm D', 'd');

-- Runs p_sql as p_who and returns its single jsonb result. Errors propagate (use tests.try_as for SQLSTATEs).
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

-- Farm A's size ids by name.
create function pg_temp.sid(p_name text) returns uuid language sql stable as $$
  select s.id from public.sizes s where s.tenant_id = tests.tenant_id_of('a') and s.name = p_name
$$;

-- format() helpers for the RPC calls.
create function pg_temp.log_sql(p_sub uuid, p_day date, p_names text[], p_eggs int[], p_rejects int)
  returns text language sql stable as $$
  select format('select public.log_production(%L, %L, %L, %L::uuid[], %L::int[], %s)',
                tests.tenant_id_of('a'), p_sub, p_day,
                (select array_agg(pg_temp.sid(n) order by i) from unnest(p_names) with ordinality u(n, i)),
                p_eggs, p_rejects)
$$;
create function pg_temp.replace_sql(p_day date, p_names text[], p_eggs int[], p_rejects int)
  returns text language sql stable as $$
  select format('select public.replace_production_day(%L, %L, %L::uuid[], %L::int[], %s)',
                tests.tenant_id_of('a'), p_day,
                coalesce((select array_agg(pg_temp.sid(n) order by i) from unnest(p_names) with ordinality u(n, i)), '{}'),
                p_eggs, p_rejects)
$$;
create function pg_temp.good_eggs(v jsonb) returns int[] language sql immutable as $$
  select coalesce(array_agg((g ->> 'eggs')::int order by i), '{}') from jsonb_array_elements(v -> 'good') with ordinality e(g, i)
$$;
create function pg_temp.a_rows() returns bigint language sql stable as $$
  select count(*) from public.production where tenant_id = tests.tenant_id_of('a')
$$;

-- ---------------------------------------------------------------------------------------------
-- Seeding (AC37)
-- ---------------------------------------------------------------------------------------------
select is(
  array(select s.name || ':' || s.sort_order || ':' || s.color_slot from public.sizes s
        where s.tenant_id = tests.tenant_id_of('a') order by s.sort_order),
  array['Small:0:0', 'Medium:1:1', 'Large:2:2', 'Jumbo:3:3'],
  'a new farm gets Small, Medium, Large, Jumbo with colour slots 0-3, in order');
select app.seed_default_sizes(tests.tenant_id_of('a'));
select is((select count(*) from public.sizes where tenant_id = tests.tenant_id_of('a')), 4::bigint,
  'app.seed_default_sizes is idempotent');

-- ---------------------------------------------------------------------------------------------
-- Constraints (as postgres)
-- ---------------------------------------------------------------------------------------------
select throws_ok(format('insert into public.production (tenant_id, produced_on, size_id, quality, eggs) values (%L, ''2026-01-01'', %L, ''reject'', 1)',
                        tests.tenant_id_of('a'), pg_temp.sid('Large')), '23514', null, 'a sized reject is rejected');
select throws_ok(format('insert into public.production (tenant_id, produced_on, quality, eggs) values (%L, ''2026-01-01'', ''good'', 1)',
                        tests.tenant_id_of('a')), '23514', null, 'an unsized good row is rejected');
select throws_ok(format('insert into public.production (tenant_id, produced_on, size_id, quality, eggs) values (%L, ''2026-01-01'', %L, ''good'', 0)',
                        tests.tenant_id_of('a'), pg_temp.sid('Large')), '23514', null, 'eggs = 0 is rejected');
select throws_ok(format('insert into public.production (tenant_id, produced_on, size_id, quality, eggs) values (%L, ''2026-01-01'', %L, ''cracked'', 1)',
                        tests.tenant_id_of('a'), pg_temp.sid('Large')), '23514', null, 'an unknown quality is rejected');
select throws_ok(format('insert into public.production (tenant_id, produced_on, quality, eggs) values (%1$L, ''2026-01-01'', ''reject'', 1), (%1$L, ''2026-01-01'', ''reject'', 2)',
                        tests.tenant_id_of('a')), '23505', null, 'two reject rows for one day are rejected (nulls not distinct)');
select throws_ok(format('insert into public.sizes (tenant_id, name, sort_order, color_slot) values (%L, '' large '', 9, 9)',
                        tests.tenant_id_of('a')), '23505', null, 'a duplicate size name (any case, trimmed) is rejected');
select throws_ok(format('insert into public.sizes (tenant_id, name, sort_order, color_slot) values (%L, ''Peewee'', 9, 2)',
                        tests.tenant_id_of('a')), '23505', null, 'a colour slot is never reused within a farm');

insert into public.production (tenant_id, produced_on, size_id, quality, eggs)
  values (tests.tenant_id_of('c'), '2026-01-01',
          (select id from public.sizes where tenant_id = tests.tenant_id_of('c') and name = 'Small'), 'good', 10);
select throws_ok(format('delete from public.sizes where tenant_id = %L and name = ''Small''', tests.tenant_id_of('c')),
  '23503', null, 'a size that has production cannot be deleted (AC41)');
select lives_ok(format('delete from public.tenants where id = %L', tests.tenant_id_of('c')),
  'deleting a whole farm with production still works (NO ACTION composite FK)');

-- ---------------------------------------------------------------------------------------------
-- log_production (AC3, AC8, AC12, AC13, AC35)
-- ---------------------------------------------------------------------------------------------
create temp table _r as
  select pg_temp.rpc_as('a', pg_temp.log_sql('00000000-0000-4000-8000-000000000001', '2026-08-04',
    array['Small', 'Medium', 'Large', 'Jumbo'], array[42, 148, 264, 40], 5)) as v;
select is((select row((v -> 'day' ->> 'goodTotal')::int, (v -> 'day' ->> 'rejects')::int,
                      (v ->> 'hadBefore')::boolean, (v ->> 'replayed')::boolean)::text from _r),
  row(494, 5, false, false)::text, 'AC3: 494 good + 5 rejects, hadBefore false, not replayed');
select is((select pg_temp.good_eggs(v -> 'day') from _r), array[42, 148, 264, 40],
  'good lines come back in the farm''s size order');
select is((select v -> 'day' ->> 'date' from _r), '2026-08-04', 'the day json carries the date as YYYY-MM-DD');

create temp table _r2 as
  select pg_temp.rpc_as('a', pg_temp.log_sql('00000000-0000-4000-8000-000000000002', '2026-08-04',
    array['Large'], array[66], 0)) as v;
select is((select row((v ->> 'hadBefore')::boolean, (v -> 'day' ->> 'goodTotal')::int)::text from _r2),
  row(true, 560)::text, 'AC8: adding to a logged day reports hadBefore and adds to the total');
select is((select row(count(*), sum(eggs))::text from public.production
           where tenant_id = tests.tenant_id_of('a') and produced_on = '2026-08-04' and size_id = pg_temp.sid('Large')),
  row(1, 330)::text, 'AC8: Large is ONE row of 330 eggs');

create temp table _r3 as
  select pg_temp.rpc_as('a', pg_temp.log_sql('00000000-0000-4000-8000-000000000002', '2026-08-04',
    array['Large'], array[66], 0)) as v;
select is((select row((v ->> 'replayed')::boolean, (v ->> 'hadBefore')::boolean, (v -> 'day' ->> 'goodTotal')::int)::text from _r3),
  row(true, true, 560)::text, 'AC12: the same submissionId replays: nothing added, same hadBefore');

create temp table _n0 as select pg_temp.a_rows() as n;
select is(tests.try_as('a', pg_temp.log_sql(gen_random_uuid(), '2026-08-04', array['Small', 'Medium'], array[1, 1], 0)),
  'ok:1', 'control: a valid log succeeds');
select is(
  tests.try_as('a', format('select public.log_production(%L, gen_random_uuid(), ''2026-08-05'', %L::uuid[], array[5, 7], 0)',
                           tests.tenant_id_of('a'), array[pg_temp.sid('Small'), gen_random_uuid()])),
  'TM001', 'AC35: an unknown size among good lines raises TM001');
select is(pg_temp.a_rows(), (select n from _n0),
  'AC13: the failed save wrote nothing (no partial day, no ledger row)');
select is((select count(*) from public.production_submissions where tenant_id = tests.tenant_id_of('a')), 3::bigint,
  'the ledger holds one row per applied submission');

select is(tests.try_as('a', pg_temp.log_sql(gen_random_uuid(), ((now() at time zone 'utc')::date + 2), array['Small'], array[1], 0)),
  'TM002', 'AC11 backstop: UTC today + 2 raises TM002');
select is(tests.try_as('a', pg_temp.log_sql(gen_random_uuid(), ((now() at time zone 'utc')::date + 1), array['Small'], array[1], 0)),
  'ok:1', 'UTC today + 1 (a local today east of UTC) is accepted');
select is(tests.try_as('a', pg_temp.log_sql(gen_random_uuid(), '2026-08-05', array['Small', 'Large'], array[0, 0], 0)),
  'TM004', 'AC10: all zero raises TM004');
select is(tests.try_as('a', pg_temp.log_sql(gen_random_uuid(), '2026-08-05', array['Large', 'Large'], array[1, 2], 0)),
  'TM005', 'a duplicate size raises TM005');
select is(tests.try_as('a', pg_temp.log_sql(gen_random_uuid(), '2026-08-05', array['Large'], array[-1], 5)),
  'TM005', 'a negative count raises TM005');
select is(tests.try_as('a', format('select public.log_production(%L, gen_random_uuid(), ''2026-08-05'', %L::uuid[], array[1, 2], 0)',
                                   tests.tenant_id_of('a'), array[pg_temp.sid('Large')])),
  'TM005', 'mismatched array lengths raise TM005');
select is(tests.try_as('a', format('select public.log_production(null, gen_random_uuid(), ''2026-08-05'', %L::uuid[], array[1], 0)',
                                   array[pg_temp.sid('Large')])),
  'TM006', 'a null p_tenant_id raises TM006');

-- Replace fixture for 2026-08-03 (logged before Jumbo is archived).
select pg_temp.rpc_as('a', pg_temp.log_sql(gen_random_uuid(), '2026-08-03',
  array['Small', 'Medium', 'Large', 'Jumbo'], array[42, 148, 264, 40], 5));
update public.sizes set archived_at = now() where id = pg_temp.sid('Jumbo');
select is(tests.try_as('a', pg_temp.log_sql(gen_random_uuid(), '2026-08-06', array['Jumbo'], array[10], 0)),
  'TM001', 'an archived size cannot be logged (TM001)');

-- ---------------------------------------------------------------------------------------------
-- replace_production_day (AC23, AC24, AC26)
-- ---------------------------------------------------------------------------------------------
create temp table _e as
  select pg_temp.rpc_as('a', pg_temp.replace_sql('2026-08-03',
    array['Small', 'Medium', 'Large', 'Jumbo'], array[42, 148, 234, 40], 5)) as v;
select is((select (v -> 'day' ->> 'goodTotal')::int from _e), 464, 'AC23: Large 264 -> 234 makes the day 464');
select is((select pg_temp.good_eggs(v -> 'day') from _e), array[42, 148, 234, 40],
  'an archived size already on the day is accepted on edit');

create temp table _e2 as
  select pg_temp.rpc_as('a', pg_temp.replace_sql('2026-08-03',
    array['Small', 'Medium', 'Large', 'Jumbo'], array[42, 0, 234, 40], 0)) as v;
select is((select row(pg_temp.good_eggs(v -> 'day'), (v -> 'day' ->> 'rejects')::int)::text from _e2),
  row(array[42, 234, 40], 0)::text, 'a size (and rejects) set to 0 disappear from the day');
select is((select count(*) from public.production where tenant_id = tests.tenant_id_of('a') and produced_on = '2026-08-03'),
  3::bigint, 'the replaced day has exactly the non-zero rows');

select is(tests.try_as('a', pg_temp.replace_sql('2026-07-01', array['Small'], array[1], 0)),
  'TM003', 'replacing a day with no production raises TM003');
select is(tests.try_as('a', pg_temp.replace_sql('2026-08-03', array['Small'], array[0], 0)),
  'TM004', 'AC24: an all-zero edit raises TM004 (the UI routes it to delete)');
select is(tests.try_as('a', pg_temp.replace_sql(((now() at time zone 'utc')::date + 1), array['Jumbo'], array[5], 0)),
  'TM001', 'an archived size NOT already on the day is rejected on edit');

-- ---------------------------------------------------------------------------------------------
-- delete_production_day (AC25, AC26)
-- ---------------------------------------------------------------------------------------------
create temp table _d as
  select pg_temp.rpc_as('a', format('select public.delete_production_day(%L, ''2026-08-03'')', tests.tenant_id_of('a'))) as v;
select is((select row(v -> 'removed' ->> 'date', (v -> 'removed' ->> 'goodTotal')::int, (v -> 'removed' ->> 'rejects')::int)::text from _d),
  row('2026-08-03', 316, 0)::text, 'delete returns the removed day''s totals');
select is((select count(*) from public.production where tenant_id = tests.tenant_id_of('a') and produced_on = '2026-08-03'),
  0::bigint, 'delete leaves no rows for the day');
select is(tests.try_as('a', format('select public.delete_production_day(%L, ''2026-08-03'')', tests.tenant_id_of('a'))),
  'TM003', 'a second delete raises TM003');

-- ---------------------------------------------------------------------------------------------
-- production_days (AC15, AC19, AC27, AC28, AC39)
-- ---------------------------------------------------------------------------------------------
create temp table _l as
  select pg_temp.rpc_as('a', format('select public.production_days(%L, ''2026-08-01'', ''2026-08-31'')', tests.tenant_id_of('a'))) as v;
select is((select array(select d ->> 'date' from jsonb_array_elements(v -> 'days') d) from _l),
  array['2026-08-04'], 'only days with production in range are returned');

select pg_temp.rpc_as('a', pg_temp.log_sql(gen_random_uuid(), '2026-08-01', array['Small'], array[30], 0));
select pg_temp.rpc_as('a', pg_temp.log_sql(gen_random_uuid(), '2026-08-02', array['Medium'], array[30], 0));
create temp table _l2 as
  select pg_temp.rpc_as('a', format('select public.production_days(%L, ''2026-08-01'', ''2026-08-31'')', tests.tenant_id_of('a'))) as v;
select is((select array(select d ->> 'date' from jsonb_array_elements(v -> 'days') d) from _l2),
  array['2026-08-04', '2026-08-02', '2026-08-01'], 'days come newest first');
select is((select pg_temp.good_eggs(v -> 'days' -> 0) from _l2), array[43, 149, 330, 40],
  'good lines in size order (Small, Medium, Large, Jumbo)');

-- Reorder: Large first. The order changes, the counts don't (AC39).
update public.sizes set sort_order = 10 where id = pg_temp.sid('Small');
update public.sizes set sort_order = 0 where id = pg_temp.sid('Large');
create temp table _l3 as
  select pg_temp.rpc_as('a', format('select public.production_days(%L, ''2026-08-04'', ''2026-08-04'')', tests.tenant_id_of('a'))) as v;
select is((select pg_temp.good_eggs(v -> 'days' -> 0) from _l3), array[330, 149, 40, 43],
  'AC39: reordering sizes changes the order, not the counts');

-- Rename: same size id, same counts (labels resolve from the size list).
update public.sizes set name = 'Extra Large' where id = pg_temp.sid('Large');
create temp table _l4 as
  select pg_temp.rpc_as('a', format('select public.production_days(%L, ''2026-08-04'', ''2026-08-04'')', tests.tenant_id_of('a'))) as v;
select is((select v from _l4), (select v from _l3), 'AC39: renaming a size changes nothing in the day data');

create temp table _l5 as
  select pg_temp.rpc_as('a', format('select public.production_days(%L, ''2020-01-01'', ''2020-01-31'')', tests.tenant_id_of('a'))) as v;
select is((select row((v ->> 'hasAny')::boolean, jsonb_array_length(v -> 'days'))::text from _l5),
  row(true, 0)::text, 'AC28: an empty range still reports hasAny = true');

select is((select jsonb_array_length(pg_temp.rpc_as('a', format('select public.production_days(%L, ''2026-08-02'')', tests.tenant_id_of('a'))) -> 'days')),
  3, 'from only: from..open end (08-02, 08-04 and the UTC-today+1 day)');
select is((select jsonb_array_length(pg_temp.rpc_as('a', format('select public.production_days(%L, null, ''2026-08-02'')', tests.tenant_id_of('a'))) -> 'days')),
  2, 'to only: open start..to');
select is((select jsonb_array_length(pg_temp.rpc_as('a', format('select public.production_days(%L)', tests.tenant_id_of('a'))) -> 'days')),
  4, 'no range: every day');

-- ---------------------------------------------------------------------------------------------
-- Table-level bounds for DIRECT writes as the owner (security audit M1, migration production_bounds).
-- State here: Jumbo is archived, Large is renamed 'Extra Large', and 2026-08-04 holds a Jumbo line.
-- (Placed after the day-list assertions above, which count days.)
-- ---------------------------------------------------------------------------------------------
create function pg_temp.ins_sql(p_day date, p_size text, p_quality text, p_eggs int) returns text language sql stable as $$
  select format('insert into public.production (tenant_id, produced_on, size_id, quality, eggs) values (%L, %L, %L, %L, %s)',
                tests.tenant_id_of('a'), p_day, case when p_size is null then null else pg_temp.sid(p_size) end, p_quality, p_eggs)
$$;

select is(tests.try_as('a', pg_temp.ins_sql(((now() at time zone 'utc')::date + 2), 'Small', 'good', 10)),
  'TM002', 'M1: a direct insert dated after UTC today + 1 is rejected (TM002)');
select is(tests.try_as('a', pg_temp.ins_sql('2026-07-15', 'Small', 'good', 1000001)),
  'TM007', 'M1: a direct insert over 1,000,000 eggs is rejected (TM007)');
select is(tests.try_as('a', pg_temp.ins_sql('2026-07-15', 'Jumbo', 'good', 10)),
  'TM001', 'M1: a direct insert of a NEW line for an archived size is rejected (TM001)');
select is(tests.try_as('a', pg_temp.ins_sql('2026-07-15', 'Small', 'good', 1000000)),
  'ok:1', 'a valid direct insert (active size, past date, exactly the cap) is still accepted');
select is(tests.try_as('a', pg_temp.ins_sql(((now() at time zone 'utc')::date - 1), null, 'reject', 3)),
  'ok:1', 'a valid direct reject insert is still accepted');

select is(tests.try_as('a', format('update public.production set eggs = 1000001 where tenant_id = %L and produced_on = %L',
                                   tests.tenant_id_of('a'), date '2026-07-15')),
  'TM007', 'M1: a direct update over the cap is rejected (TM007)');
select is(tests.try_as('a', format('update public.production set produced_on = %L where tenant_id = %L and produced_on = %L',
                                   (now() at time zone 'utc')::date + 5, tests.tenant_id_of('a'), date '2026-07-15')),
  'TM002', 'M1: a direct update moving a row to a future date is rejected (TM002)');
select is(tests.try_as('a', format('update public.production set size_id = %L where tenant_id = %L and produced_on = %L',
                                   pg_temp.sid('Jumbo'), tests.tenant_id_of('a'), date '2026-07-15')),
  'TM001', 'M1: a direct update switching a row to an archived size is rejected (TM001)');
select is(tests.try_as('a', format('update public.production set produced_on = %L where tenant_id = %L and produced_on = %L and size_id = %L',
                                   date '2026-07-06', tests.tenant_id_of('a'), date '2026-08-04', pg_temp.sid('Jumbo'))),
  'TM001', 'R3-1: moving an archived size''s line to another day (a new line there) is rejected (TM001)');
select is(tests.try_as('a', format('update public.production set eggs = 41 where tenant_id = %L and produced_on = %L and size_id = %L',
                                   tests.tenant_id_of('a'), date '2026-08-04', pg_temp.sid('Jumbo'))),
  'ok:1', 'correcting the count of an existing line of a since-archived size is still allowed');

select pg_temp.rpc_as('a', pg_temp.log_sql(gen_random_uuid(), '2026-07-20', array['Small'], array[1000000], 0));
select is(tests.try_as('a', pg_temp.log_sql(gen_random_uuid(), '2026-07-20', array['Small'], array[1], 0)),
  'TM007', 'an add that would push a day''s line past the cap raises TM007 (nothing written)');

alter table public.production disable trigger production_bounds;
select throws_ok(pg_temp.ins_sql('2026-07-16', 'Small', 'good', 1000001), '23514', null,
  'the production_eggs_range check backs up the trigger (eggs between 1 and 1,000,000)');
alter table public.production enable trigger production_bounds;

select is(
  (select pg_temp.rpc_as('d', format('select public.production_days(%L)', tests.tenant_id_of('d')))),
  '{"hasAny": false, "days": []}'::jsonb, 'AC27: a farm with no production gets hasAny = false and no days');

select * from finish();
rollback;
