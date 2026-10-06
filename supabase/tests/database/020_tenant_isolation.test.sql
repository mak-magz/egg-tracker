-- 020_tenant_isolation: farm A vs farm B (AC24, AC26). docs/features/00-project-scaffold.md §3.7.
-- The generic A-vs-B checks come from tests.isolation_checks() over every registered table, so a
-- later feature only adds a registry row in 000_helpers.sql. The named cases below spell out AC24.
begin;

select plan(2 * tests.isolation_check_count() + 30 + 30 + 1 + 6 + 30 + 1 + 5 + 2 + 4 + 113);

select tests.create_farm('Farm A', 'a');
select tests.create_farm('Farm B', 'b');

-- Generic registry-driven checks, both directions.
select ok(c.passed, c.description) from tests.isolation_checks('a', 'b') c;
select ok(c.passed, c.description) from tests.isolation_checks('b', 'a') c;

-- ---------------------------------------------------------------------------------------------
-- Named AC24 cases. tests.try_as() returns 'ok:<rows>' or the SQLSTATE.
-- ---------------------------------------------------------------------------------------------

-- Positive controls: each owner sees exactly their own farm and membership.
select is(tests.try_as('a', 'select 1 from public.tenants'), 'ok:1', 'A sees exactly one farm (its own)');
select is(tests.try_as('a', 'select 1 from public.memberships'), 'ok:1', 'A sees exactly one membership (its own)');

-- A cannot change B's eggs-per-tray, even naming B explicitly.
select ok(
  tests.try_as('a', format('update public.tenants set eggs_per_tray = 1 where id = %L', tests.tenant_id_of('b')))
    in ('ok:0', '42501'),
  'A cannot update B''s eggs_per_tray');
select is((select eggs_per_tray from public.tenants where id = tests.tenant_id_of('b')), 30,
  'B''s eggs_per_tray is unchanged (re-read as postgres)');

select ok(
  tests.try_as('a', format('update public.tenants set name = ''Pwned'' where id = %L', tests.tenant_id_of('b')))
    in ('ok:0', '42501'),
  'A cannot rename B''s farm');
select is((select name from public.tenants where id = tests.tenant_id_of('b')), 'Farm B', 'B''s farm name is unchanged');

select ok(
  tests.try_as('a', format('delete from public.tenants where id = %L', tests.tenant_id_of('b'))) in ('ok:0', '42501'),
  'A cannot delete B''s farm');
select ok(exists (select 1 from public.tenants where id = tests.tenant_id_of('b')), 'B''s farm still exists');

-- Memberships: A cannot join B's farm, nor read/move/delete B's membership.
select is(
  tests.try_as('a', format('insert into public.memberships (tenant_id, user_id) values (%L, auth.uid())',
                           tests.tenant_id_of('b'))),
  '42501',
  'A cannot insert a membership into B''s farm');
select is(
  tests.try_as('a', format('select 1 from public.memberships where user_id = %L', tests.user_id('b'))),
  'ok:0',
  'A cannot read B''s membership');
select ok(
  tests.try_as('a', format('update public.memberships set tenant_id = %L where user_id = %L',
                           tests.tenant_id_of('a'), tests.user_id('b'))) in ('ok:0', '42501'),
  'A cannot move B''s membership');
select ok(
  tests.try_as('a', format('delete from public.memberships where user_id = %L', tests.user_id('b'))) in ('ok:0', '42501'),
  'A cannot delete B''s membership');
select is((select tenant_id from public.memberships where user_id = tests.user_id('b')), tests.tenant_id_of('b'),
  'B''s membership is unchanged');

-- v1: owners cannot create farms or edit even their own farm (set at provisioning only, D6).
select is(tests.try_as('a', 'insert into public.tenants (name) values (''Another farm'')'), '42501',
  'A cannot create a farm');
select ok(
  tests.try_as('a', format('update public.tenants set eggs_per_tray = 12 where id = %L', tests.tenant_id_of('a')))
    in ('ok:0', '42501'),
  'A cannot update its own farm in v1');

-- Signed-out requests read nothing from either farm.
select ok(tests.try_as('anon', 'select 1 from public.tenants') in ('ok:0', '42501')
          and tests.try_as('anon', 'select 1 from public.memberships') in ('ok:0', '42501'),
  'anon reads no farms and no memberships');

-- ---------------------------------------------------------------------------------------------
-- Feature 01 (AC21, AC34, AC35, AC40): production RPCs and sizes.
-- ---------------------------------------------------------------------------------------------
create temp table _ids as
  select tests.tenant_id_of('a') as ta, tests.tenant_id_of('b') as tb,
         (select s.id from public.sizes s where s.tenant_id = tests.tenant_id_of('a') and s.name = 'Large') as a_large,
         (select s.id from public.sizes s where s.tenant_id = tests.tenant_id_of('b') and s.name = 'Large') as b_large;
grant select on _ids to authenticated, anon;

create temp table _b_before as
  select count(*) as n, coalesce(sum(eggs), 0) as eggs from public.production where tenant_id = (select tb from _ids);

select is(
  tests.try_as('a', format('select public.production_days(%L)', (select tb from _ids))),
  'TM006', 'A cannot read B''s production through production_days (TM006)');
select is(
  tests.try_as('a', format('select public.log_production(%L, gen_random_uuid(), date ''2026-01-02'', array[%L]::uuid[], array[5], 0)',
                           (select tb from _ids), (select b_large from _ids))),
  'TM006', 'A cannot log production into B''s farm (TM006)');
select is(
  tests.try_as('a', format('select public.replace_production_day(%L, date ''2026-01-01'', array[%L]::uuid[], array[1], 0)',
                           (select tb from _ids), (select b_large from _ids))),
  'TM006', 'A cannot replace a day of B''s production (TM006)');
select is(
  tests.try_as('a', format('select public.delete_production_day(%L, date ''2026-01-01'')', (select tb from _ids))),
  'TM006', 'A cannot delete a day of B''s production (TM006)');
select is(
  (select row(count(*), coalesce(sum(eggs), 0))::text from public.production where tenant_id = (select tb from _ids)),
  (select row(n, eggs)::text from _b_before),
  'B''s production is unchanged (re-read as postgres)');

select is(
  tests.try_as('a', format('select public.log_production(%L, gen_random_uuid(), date ''2026-01-02'', array[%L]::uuid[], array[5], 0)',
                           (select ta from _ids), (select b_large from _ids))),
  'TM001', 'A cannot log production against B''s size through the RPC (TM001)');
select is(
  tests.try_as('a', format('insert into public.production (tenant_id, produced_on, size_id, quality, eggs) values (%L, date ''2026-01-02'', %L, ''good'', 5)',
                           (select ta from _ids), (select b_large from _ids))),
  'TM001', 'A cannot insert production against B''s size directly (production_bounds trigger, TM001)');
-- The composite FK is the storage-level guarantee on its own: with the trigger off, it still refuses (23503).
alter table public.production disable trigger production_bounds;
select is(
  tests.try_as('a', format('insert into public.production (tenant_id, produced_on, size_id, quality, eggs) values (%L, date ''2026-01-02'', %L, ''good'', 5)',
                           (select ta from _ids), (select b_large from _ids))),
  '23503', 'even without the trigger, the composite FK refuses B''s size (23503)');
alter table public.production enable trigger production_bounds;

select is(tests.try_as('a', 'select 1 from public.sizes'), 'ok:4', 'A sees exactly its own 4 sizes');
select is(tests.try_as('a', format('select 1 from public.sizes where tenant_id = %L', (select tb from _ids))), 'ok:0',
  'A sees none of B''s sizes');

select is(tests.try_as('anon', format('select public.production_days(%L)', (select ta from _ids))), '42501',
  'anon cannot execute production_days');
select is(
  tests.try_as('anon', format('select public.log_production(%L, gen_random_uuid(), date ''2026-01-02'', array[%L]::uuid[], array[5], 0)',
                              (select ta from _ids), (select a_large from _ids))),
  '42501', 'anon cannot execute log_production');
select is(
  tests.try_as('anon', format('select public.replace_production_day(%L, date ''2026-01-01'', array[%L]::uuid[], array[1], 0)',
                              (select ta from _ids), (select a_large from _ids))),
  '42501', 'anon cannot execute replace_production_day');
select is(tests.try_as('anon', format('select public.delete_production_day(%L, date ''2026-01-01'')', (select ta from _ids))),
  '42501', 'anon cannot execute delete_production_day');

-- ---------------------------------------------------------------------------------------------
-- Feature 02 (AC26, AC27): size management, both directions. Owners now WRITE sizes (column-limited grants +
-- functions), so the write side of the isolation is spelled out here. tests.try_as() returns 'ok:<rows>' or the
-- SQLSTATE.
-- ---------------------------------------------------------------------------------------------
create temp table _sz_dir as
  select * from (values
    ('a', (select ta from _ids), (select tb from _ids), (select a_large from _ids), (select b_large from _ids)),
    ('b', (select tb from _ids), (select ta from _ids), (select b_large from _ids), (select a_large from _ids))
  ) v(who, own, victim, own_size, victim_size);
grant select on _sz_dir to authenticated, anon;

-- Templates: %1$L victim tenant, %2$L victim's size id, %3$L own tenant, %4$L own size id, %5$L a fresh uuid.
create temp table _sz_cases as
  select * from (values
    ('add_size with the other farm''s tenant id', 'select public.add_size(%1$L, %5$L, ''x'')', 'TM006'),
    ('rename_size with the other farm''s tenant id', 'select public.rename_size(%1$L, %2$L, ''x'')', 'TM006'),
    ('reorder_sizes with the other farm''s tenant id', 'select public.reorder_sizes(%1$L, array[%2$L]::uuid[])', 'TM006'),
    ('archive_size with the other farm''s tenant id', 'select public.archive_size(%1$L, %2$L)', 'TM006'),
    ('restore_size with the other farm''s tenant id', 'select public.restore_size(%1$L, %2$L)', 'TM006'),
    ('rename_size on the other farm''s size id', 'select public.rename_size(%3$L, %2$L, ''x'')', 'TM011'),
    ('archive_size on the other farm''s size id', 'select public.archive_size(%3$L, %2$L)', 'TM011'),
    ('restore_size on the other farm''s size id', 'select public.restore_size(%3$L, %2$L)', 'TM011'),
    ('reorder_sizes with the other farm''s size id', 'select public.reorder_sizes(%3$L, array[%2$L]::uuid[])', 'TM012'),
    ('a direct update of the other farm''s size names', 'update public.sizes set name = ''Pwned'' where tenant_id = %1$L', 'ok:0'),
    ('a direct insert of a size into the other farm', 'insert into public.sizes (tenant_id, name) values (%1$L, ''Pwned'')', '42501'),
    ('a direct delete of the other farm''s sizes', 'delete from public.sizes where tenant_id = %1$L', '42501'),
    ('a direct read of the other farm''s size ledger', 'select 1 from public.size_submissions where tenant_id = %1$L', 'ok:0'),
    -- Security audit M-1, L-1: the ledger insert is refused for another farm's tenant_id (by the guard trigger,
    -- before it takes that farm's lock), and a ledger row can't point at another farm's size (composite FK).
    ('a direct insert of a ledger row into the other farm', 'insert into public.size_submissions (tenant_id, id, size_id, name) values (%1$L, %5$L, %2$L, ''x'')', '42501'),
    ('a direct ledger row for own farm pointing at the other farm''s size', 'insert into public.size_submissions (tenant_id, id, size_id, name) values (%3$L, %5$L, %2$L, ''x'')', '23503')
  ) c(descr, tpl, expected);

create temp table _sz_before as
  select id, tenant_id, name, sort_order, color_slot, archived_at from public.sizes
  where tenant_id in ((select ta from _ids), (select tb from _ids));

select is(
  tests.try_as(d.who, format(c.tpl, d.victim, d.victim_size, d.own, d.own_size, gen_random_uuid())),
  c.expected,
  format('%s: %s (%s)', d.who, c.descr, c.expected))
from _sz_dir d cross join _sz_cases c;

select is(
  array(select row(s.id, s.tenant_id, s.name, s.sort_order, s.color_slot, s.archived_at)::text
        from public.sizes s where s.tenant_id in ((select ta from _ids), (select tb from _ids)) order by s.id),
  array(select row(b.id, b.tenant_id, b.name, b.sort_order, b.color_slot, b.archived_at)::text
        from _sz_before b order by b.id),
  'both farms'' sizes are unchanged after every attempt (re-read as postgres)');

select is(
  tests.try_as('anon', format('select public.add_size(%L, gen_random_uuid(), ''x'')', (select ta from _ids))),
  '42501', 'anon cannot execute add_size');
select is(
  tests.try_as('anon', format('select public.rename_size(%L, %L, ''x'')', (select ta from _ids), (select a_large from _ids))),
  '42501', 'anon cannot execute rename_size');
select is(
  tests.try_as('anon', format('select public.reorder_sizes(%L, array[%L]::uuid[])', (select ta from _ids), (select a_large from _ids))),
  '42501', 'anon cannot execute reorder_sizes');
select is(
  tests.try_as('anon', format('select public.archive_size(%L, %L)', (select ta from _ids), (select a_large from _ids))),
  '42501', 'anon cannot execute archive_size');
select is(
  tests.try_as('anon', format('select public.restore_size(%L, %L)', (select ta from _ids), (select a_large from _ids))),
  '42501', 'anon cannot execute restore_size');
select is(tests.try_as('anon', 'insert into public.sizes (tenant_id, name) values (gen_random_uuid(), ''x'')'), '42501',
  'anon cannot insert a size');

-- ---------------------------------------------------------------------------------------------
-- Feature 03 (AC28, AC32, AC35): clients, the first personal data. Both directions, reads AND writes. Owners write
-- clients through column-limited grants and four security invoker functions, so the write side is spelled out here.
-- The registry rows (000_helpers) already run the 11 generic checks for `clients` and `client_submissions`.
-- ---------------------------------------------------------------------------------------------
-- The registry seed ("Seed client") exists for both farms by now.
create temp table _cl_ids as
  select (select ta from _ids) as ta, (select tb from _ids) as tb,
         (select c.id from public.clients c where c.tenant_id = (select ta from _ids) order by c.created_at, c.id limit 1) as a_client,
         (select c.id from public.clients c where c.tenant_id = (select tb from _ids) order by c.created_at, c.id limit 1) as b_client;
grant select on _cl_ids to authenticated, anon;

create temp table _cl_dir as
  select * from (values
    ('a', (select ta from _cl_ids), (select tb from _cl_ids), (select a_client from _cl_ids), (select b_client from _cl_ids)),
    ('b', (select tb from _cl_ids), (select ta from _cl_ids), (select b_client from _cl_ids), (select a_client from _cl_ids))
  ) v(who, own, victim, own_client, victim_client);
grant select on _cl_dir to authenticated, anon;

-- Templates: %1$L victim tenant, %2$L victim's client id, %3$L own tenant, %4$L own client id, %5$L a fresh uuid.
create temp table _cl_cases as
  select * from (values
    ('add_client with the other farm''s tenant id', 'select public.add_client(%1$L, %5$L, ''x'')', 'TM006'),
    ('update_client with the other farm''s tenant id', 'select public.update_client(%1$L, %2$L, 1, ''x'', null, null)', 'TM006'),
    ('archive_client with the other farm''s tenant id', 'select public.archive_client(%1$L, %2$L)', 'TM006'),
    ('restore_client with the other farm''s tenant id', 'select public.restore_client(%1$L, %2$L)', 'TM006'),
    ('update_client on the other farm''s client id', 'select public.update_client(%3$L, %2$L, 1, ''x'', null, null)', 'TM023'),
    ('archive_client on the other farm''s client id', 'select public.archive_client(%3$L, %2$L)', 'TM023'),
    ('restore_client on the other farm''s client id', 'select public.restore_client(%3$L, %2$L)', 'TM023'),
    ('a direct update of the other farm''s client names', 'update public.clients set name = ''Pwned'' where tenant_id = %1$L', 'ok:0'),
    ('a direct mark-inactive of the other farm''s clients', 'update public.clients set archived_at = now() where tenant_id = %1$L', 'ok:0'),
    ('a direct insert of a client into the other farm', 'insert into public.clients (tenant_id, name) values (%1$L, ''Pwned'')', '42501'),
    ('a direct delete of the other farm''s clients', 'delete from public.clients where tenant_id = %1$L', '42501'),
    ('a direct read of the other farm''s clients', 'select 1 from public.clients where tenant_id = %1$L', 'ok:0'),
    ('a direct read of the other farm''s client ledger', 'select 1 from public.client_submissions where tenant_id = %1$L', 'ok:0'),
    ('a direct insert of a ledger row into the other farm', 'insert into public.client_submissions (tenant_id, id, client_id, payload_hash) values (%1$L, %5$L, %2$L, repeat(''0'', 64))', '42501'),
    ('a direct ledger row for own farm pointing at the other farm''s client', 'insert into public.client_submissions (tenant_id, id, client_id, payload_hash) values (%3$L, %5$L, %2$L, repeat(''0'', 64))', '23503')
  ) c(descr, tpl, expected);

create temp table _cl_before as
  select id, tenant_id, name, phone, default_price, archived_at, version from public.clients
  where tenant_id in ((select ta from _cl_ids), (select tb from _cl_ids));

select is(
  tests.try_as(d.who, format(c.tpl, d.victim, d.victim_client, d.own, d.own_client, gen_random_uuid())),
  c.expected,
  format('%s: %s (%s)', d.who, c.descr, c.expected))
from _cl_dir d cross join _cl_cases c;

select is(
  array(select row(s.id, s.tenant_id, s.name, s.phone, s.default_price, s.archived_at, s.version)::text
        from public.clients s where s.tenant_id in ((select ta from _cl_ids), (select tb from _cl_ids)) order by s.id),
  array(select row(b.id, b.tenant_id, b.name, b.phone, b.default_price, b.archived_at, b.version)::text
        from _cl_before b order by b.id),
  'both farms'' clients are unchanged after every attempt (re-read as postgres)');

select is(
  tests.try_as('anon', format('select public.add_client(%L, gen_random_uuid(), ''x'')', (select ta from _cl_ids))),
  '42501', 'anon cannot execute add_client');
select is(
  tests.try_as('anon', format('select public.update_client(%L, %L, 1, ''x'', null, null)', (select ta from _cl_ids), (select a_client from _cl_ids))),
  '42501', 'anon cannot execute update_client');
select is(
  tests.try_as('anon', format('select public.archive_client(%L, %L)', (select ta from _cl_ids), (select a_client from _cl_ids))),
  '42501', 'anon cannot execute archive_client');
select is(
  tests.try_as('anon', format('select public.restore_client(%L, %L)', (select ta from _cl_ids), (select a_client from _cl_ids))),
  '42501', 'anon cannot execute restore_client');
select is(tests.try_as('anon', 'insert into public.clients (tenant_id, name) values (gen_random_uuid(), ''x'')'), '42501',
  'anon cannot insert a client');

-- Uniqueness is per farm: farm A can add a name farm B has (and the reverse), and gets no hint that B has it.
insert into public.clients (tenant_id, name) values ((select tb from _cl_ids), 'Maple Street Market');
insert into public.clients (tenant_id, name) values ((select ta from _cl_ids), 'Zed Market');
select is(
  tests.try_as('a', format('select public.add_client(%L, gen_random_uuid(), ''Maple Street Market'')', (select ta from _cl_ids))),
  'ok:1', 'AC28: A can add "Maple Street Market" although B has it: no error, no hint');
select is(
  tests.try_as('b', format('select public.add_client(%L, gen_random_uuid(), ''Zed Market'')', (select tb from _cl_ids))),
  'ok:1', 'AC28: B can add "Zed Market" although A has it');

-- The currency is the farm's own data (AC35): A never sees B's value, whatever B's currency is.
select is(tests.try_as('a', format('select currency from public.tenants where id = %L', (select tb from _cl_ids))), 'ok:0',
  'AC35: A cannot read B''s currency');
update public.tenants set currency = 'USD' where id = (select tb from _cl_ids);
select is(tests.try_as('a', 'select 1 from public.tenants where currency = ''USD'''), 'ok:0',
  'AC35: with B on USD, A sees no USD farm');
select is(tests.try_as('a', 'select 1 from public.tenants where currency = ''PHP'''), 'ok:1', 'AC35: A still reads PHP for itself');
select is(tests.try_as('b', 'select 1 from public.tenants where currency = ''USD'''), 'ok:1', 'AC35: B reads USD for itself');

-- ---------------------------------------------------------------------------------------------
-- Features 04 and 05 (AC58, AC52): sales, orders and their lines, both directions, reads AND writes. The registry
-- rows (000_helpers) already run the 11 generic checks for sales, sale_lines, sale_submissions, sale_counters,
-- orders, order_lines, order_submissions and order_counters. Sales are void-only and orders are never deleted, so
-- a direct delete of either is denied outright (42501); order_lines keeps a delete grant, so RLS answers 0 rows.
-- ---------------------------------------------------------------------------------------------
insert into public.sales (tenant_id, sale_number, type, sale_date)
values (tests.tenant_id_of('a'), 501, 'on_site', current_date);
insert into public.sales (tenant_id, sale_number, type, sale_date)
values (tests.tenant_id_of('b'), 501, 'on_site', current_date);

insert into public.orders (tenant_id, order_number, client_id, order_date, status)
select tests.tenant_id_of('a'), 501, (select id from public.clients where tenant_id = tests.tenant_id_of('a') order by created_at, id limit 1), current_date, 'requested';
insert into public.orders (tenant_id, order_number, client_id, order_date, status)
select tests.tenant_id_of('b'), 501, (select id from public.clients where tenant_id = tests.tenant_id_of('b') order by created_at, id limit 1), current_date, 'requested';

create temp table _sl_ids as
  select tests.tenant_id_of('a') as ta, tests.tenant_id_of('b') as tb,
         (select id from public.sales where tenant_id = tests.tenant_id_of('a') and sale_number = 501) as a_sale,
         (select id from public.sales where tenant_id = tests.tenant_id_of('b') and sale_number = 501) as b_sale,
         (select id from public.sizes where tenant_id = tests.tenant_id_of('a') and name = 'Large') as a_large,
         (select id from public.sizes where tenant_id = tests.tenant_id_of('b') and name = 'Large') as b_large,
         (select id from public.clients where tenant_id = tests.tenant_id_of('a') order by created_at, id limit 1) as a_client,
         (select id from public.clients where tenant_id = tests.tenant_id_of('b') order by created_at, id limit 1) as b_client,
         (select id from public.orders where tenant_id = tests.tenant_id_of('a') and order_number = 501) as a_order,
         (select id from public.orders where tenant_id = tests.tenant_id_of('b') and order_number = 501) as b_order;
grant select on _sl_ids to authenticated, anon;

insert into public.sale_lines (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total)
select ta, a_sale, a_large, 30, 6.5, 6.5 from _sl_ids;
insert into public.sale_lines (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total)
select tb, b_sale, b_large, 30, 6.5, 6.5 from _sl_ids;
insert into public.order_lines (tenant_id, order_id, size_id, eggs, price_per_tray, line_total)
select ta, a_order, a_large, 60, 6.5, 13 from _sl_ids;
insert into public.order_lines (tenant_id, order_id, size_id, eggs, price_per_tray, line_total)
select tb, b_order, b_large, 60, 6.5, 13 from _sl_ids;

create temp table _sl_dir as
  select * from (values
    ('a', (select ta from _sl_ids), (select tb from _sl_ids), (select a_sale from _sl_ids), (select b_sale from _sl_ids), (select a_large from _sl_ids), (select b_large from _sl_ids), (select a_client from _sl_ids), (select b_client from _sl_ids), (select a_order from _sl_ids), (select b_order from _sl_ids)),
    ('b', (select tb from _sl_ids), (select ta from _sl_ids), (select b_sale from _sl_ids), (select a_sale from _sl_ids), (select b_large from _sl_ids), (select a_large from _sl_ids), (select b_client from _sl_ids), (select a_client from _sl_ids), (select b_order from _sl_ids), (select a_order from _sl_ids))
  ) v(who, own, victim, own_sale, victim_sale, own_size, victim_size, own_client, victim_client, own_order, victim_order);
grant select on _sl_dir to authenticated, anon;

-- Templates: %1$L victim tenant, %2$L victim sale id, %3$L own tenant, %4$L own sale id, %5$L fresh uuid,
-- %6$L victim size id, %7$L own size id, %8$L victim client id, %9$L own client id, %10$L victim order id,
-- %11$L own order id.
create temp table _sl_cases as
  select * from (values
    ('create_sale with the other farm''s tenant id', 'select public.create_sale(%1$L, gen_random_uuid(), ''on_site'', current_date, array[%7$L]::uuid[], array[30], array[6.5])', 'TM006'),
    ('update_sale with the other farm''s tenant id', 'select public.update_sale(%1$L, %2$L, 1, ''on_site'', current_date, array[%6$L]::uuid[], array[30], array[6.5])', 'TM006'),
    ('void_sale with the other farm''s tenant id', 'select public.void_sale(%1$L, %2$L, 1)', 'TM006'),
    ('get_sale with the other farm''s tenant id', 'select public.get_sale(%1$L, %2$L)', 'TM006'),
    ('list_sales with the other farm''s tenant id', 'select public.list_sales(%1$L)', 'TM006'),
    ('get_on_hand with the other farm''s tenant id', 'select public.get_on_hand(%1$L)', 'TM006'),
    ('update_sale on the other farm''s sale id', 'select public.update_sale(%3$L, %2$L, 1, ''on_site'', current_date, array[%7$L]::uuid[], array[30], array[6.5])', 'TM027'),
    ('void_sale on the other farm''s sale id', 'select public.void_sale(%3$L, %2$L, 1)', 'TM027'),
    ('create_sale naming the other farm''s size on a line', 'select public.create_sale(%3$L, gen_random_uuid(), ''on_site'', current_date, array[%6$L]::uuid[], array[30], array[6.5])', 'TM033'),
    ('create_sale naming the other farm''s client on a delivery', 'select public.create_sale(%3$L, gen_random_uuid(), ''delivery'', current_date, array[%7$L]::uuid[], array[30], array[6.5], %8$L)', 'TM032'),
    ('a direct update of the other farm''s sales', 'update public.sales set updated_at = now() where tenant_id = %1$L', 'ok:0'),
    ('a direct insert of a sale into the other farm', 'insert into public.sales (tenant_id, sale_number, type, sale_date) values (%1$L, 999999, ''on_site'', current_date)', '42501'),
    -- Sales are void-only: there is no delete grant at all, so even a delete naming the other farm answers 42501.
    ('a direct delete of the other farm''s sales', 'delete from public.sales where tenant_id = %1$L', '42501'),
    ('a direct read of the other farm''s sales', 'select 1 from public.sales where tenant_id = %1$L', 'ok:0'),
    ('a direct read of the other farm''s sale lines', 'select 1 from public.sale_lines where tenant_id = %1$L', 'ok:0'),
    ('a direct insert of a sale line into the other farm', 'insert into public.sale_lines (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total) values (%1$L, %2$L, %6$L, 30, 6.5, 6.5)', '42501'),
    ('a direct insert of a ledger row into the other farm', 'insert into public.sale_submissions (tenant_id, id, sale_id, payload_hash) values (%1$L, %5$L, %2$L, repeat(''0'', 64))', '42501'),
    ('a direct ledger row for own farm pointing at the other farm''s sale', 'insert into public.sale_submissions (tenant_id, id, sale_id, payload_hash) values (%3$L, %5$L, %2$L, repeat(''0'', 64))', '23503'),
    -- Feature 05: every order function with the other farm's tenant id (TM006) ...
    ('create_order with the other farm''s tenant id', 'select public.create_order(%1$L, gen_random_uuid(), %9$L, current_date, array[%7$L]::uuid[], array[30], array[6.5])', 'TM006'),
    ('update_order with the other farm''s tenant id', 'select public.update_order(%1$L, %10$L, 1, %8$L, current_date, array[%6$L]::uuid[], array[30], array[6.5])', 'TM006'),
    ('set_order_status with the other farm''s tenant id', 'select public.set_order_status(%1$L, %10$L, ''ready'')', 'TM006'),
    ('cancel_order with the other farm''s tenant id', 'select public.cancel_order(%1$L, %10$L)', 'TM006'),
    ('close_order with the other farm''s tenant id', 'select public.close_order(%1$L, %10$L, 1)', 'TM006'),
    ('deliver_order with the other farm''s tenant id', 'select public.deliver_order(%1$L, gen_random_uuid(), %10$L, current_date, array[%6$L]::uuid[], array[1])', 'TM006'),
    ('get_order with the other farm''s tenant id', 'select public.get_order(%1$L, %10$L)', 'TM006'),
    ('list_orders with the other farm''s tenant id', 'select public.list_orders(%1$L)', 'TM006'),
    -- ... and with the other farm's order id on the caller's own tenant (TM044) ...
    ('update_order on the other farm''s order id', 'select public.update_order(%3$L, %10$L, 1, %9$L, current_date, array[%7$L]::uuid[], array[30], array[6.5])', 'TM044'),
    ('set_order_status on the other farm''s order id', 'select public.set_order_status(%3$L, %10$L, ''ready'')', 'TM044'),
    ('cancel_order on the other farm''s order id', 'select public.cancel_order(%3$L, %10$L)', 'TM044'),
    ('close_order on the other farm''s order id', 'select public.close_order(%3$L, %10$L, 1)', 'TM044'),
    ('deliver_order on the other farm''s order id', 'select public.deliver_order(%3$L, gen_random_uuid(), %10$L, current_date, array[%7$L]::uuid[], array[1])', 'TM044'),
    -- ... and naming the other farm's client, size or order inside the caller's own order.
    ('create_order naming the other farm''s client', 'select public.create_order(%3$L, gen_random_uuid(), %8$L, current_date, array[%7$L]::uuid[], array[30], array[6.5])', 'TM032'),
    ('create_order naming the other farm''s size on a line', 'select public.create_order(%3$L, gen_random_uuid(), %9$L, current_date, array[%6$L]::uuid[], array[30], array[6.5])', 'TM033'),
    ('deliver_order naming the other farm''s size on its own order', 'select public.deliver_order(%3$L, gen_random_uuid(), %11$L, current_date, array[%6$L]::uuid[], array[1])', 'TM052'),
    ('a direct update of the other farm''s orders', 'update public.orders set updated_at = now() where tenant_id = %1$L', 'ok:0'),
    ('a direct insert of an order into the other farm', 'insert into public.orders (tenant_id, order_number, client_id, order_date, status) values (%1$L, 999999, %8$L, current_date, ''requested'')', '42501'),
    -- Orders are never deleted: no delete grant, so 42501 (not 0 rows).
    ('a direct delete of the other farm''s orders', 'delete from public.orders where tenant_id = %1$L', '42501'),
    ('a direct read of the other farm''s orders', 'select 1 from public.orders where tenant_id = %1$L', 'ok:0'),
    ('a direct read of the other farm''s order lines', 'select 1 from public.order_lines where tenant_id = %1$L', 'ok:0'),
    ('a direct update of the other farm''s order lines', 'update public.order_lines set eggs = 1 where tenant_id = %1$L', 'ok:0'),
    ('a direct delete of the other farm''s order lines', 'delete from public.order_lines where tenant_id = %1$L', 'ok:0'),
    ('a direct insert of an order line into the other farm', 'insert into public.order_lines (tenant_id, order_id, size_id, eggs, price_per_tray, line_total) values (%1$L, %10$L, %6$L, 30, 6.5, 6.5)', '42501'),
    ('a direct insert of an order ledger row into the other farm', 'insert into public.order_submissions (tenant_id, id, order_id, payload_hash) values (%1$L, %5$L, %10$L, repeat(''0'', 64))', '42501'),
    ('a direct update of the other farm''s order counter', 'update public.order_counters set next_number = 1 where tenant_id = %1$L', 'ok:0'),
    -- A delivery that links the caller's own sale to the other farm's order (FK failure), or the other farm's own.
    ('a direct sale in own farm linked to the other farm''s order', 'insert into public.sales (tenant_id, sale_number, client_id, type, sale_date, order_id) values (%3$L, 999998, %9$L, ''delivery'', current_date, %10$L)', 'TM053'),
    ('a direct sale in the other farm linked to its order', 'insert into public.sales (tenant_id, sale_number, client_id, type, sale_date, order_id) values (%1$L, 999997, %8$L, ''delivery'', current_date, %10$L)', 'TM053')
  ) c(descr, tpl, expected);

create temp table _sl_before as
  select id, tenant_id, sale_number, voided_at, version from public.sales
  where tenant_id in ((select ta from _sl_ids), (select tb from _sl_ids));
create temp table _or_before as
  select id, tenant_id, order_number, status, version, (select count(*) from public.order_lines l where l.order_id = o.id) as n_lines
  from public.orders o
  where tenant_id in ((select ta from _sl_ids), (select tb from _sl_ids));

select is(
  tests.try_as(d.who, format(c.tpl, d.victim, d.victim_sale, d.own, d.own_sale, gen_random_uuid(), d.victim_size, d.own_size, d.victim_client, d.own_client, d.victim_order, d.own_order)),
  c.expected,
  format('%s: %s (%s)', d.who, c.descr, c.expected))
from _sl_dir d cross join _sl_cases c;

select is(
  array(select row(s.id, s.tenant_id, s.sale_number, s.voided_at, s.version)::text
        from public.sales s where s.tenant_id in ((select ta from _sl_ids), (select tb from _sl_ids)) order by s.id),
  array(select row(b.id, b.tenant_id, b.sale_number, b.voided_at, b.version)::text
        from _sl_before b order by b.id),
  'both farms'' sales are unchanged after every attempt (re-read as postgres)');

select is(
  array(select row(o.id, o.tenant_id, o.order_number, o.status, o.version, (select count(*) from public.order_lines l where l.order_id = o.id))::text
        from public.orders o where o.tenant_id in ((select ta from _sl_ids), (select tb from _sl_ids)) order by o.id),
  array(select row(b.id, b.tenant_id, b.order_number, b.status, b.version, b.n_lines)::text from _or_before b order by b.id),
  'AC52: both farms'' orders (status, version, lines) are unchanged after every attempt (re-read as postgres)');

-- get_sale / get_order on the other farm's id return null, never the victim's row (not an error, so they aren't in
-- the table above).
select tests.authenticate_as('a');
select is(
  (public.get_sale((select ta from _sl_ids), (select b_sale from _sl_ids)) -> 'sale')::text,
  'null',
  'AC58: A''s get_sale on B''s sale id returns sale: null, not B''s sale');
select is(
  (public.get_order((select ta from _sl_ids), (select b_order from _sl_ids)) -> 'order')::text,
  'null',
  'AC52: A''s get_order on B''s order id returns order: null, not B''s order');
-- list_orders for farm A never contains B's order, even in the uncapped open view.
select is(
  (public.list_orders((select ta from _sl_ids)) ->> 'total')::int, 2,
  'AC52: A''s open order list holds exactly A''s own two orders (the registry seed and 501), never B''s');
select tests.clear_authentication();

select is(
  tests.try_as('anon', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[30], array[6.5])', (select ta from _sl_ids), (select a_large from _sl_ids))),
  '42501', 'anon cannot execute create_sale');
select is(
  tests.try_as('anon', format('select public.update_sale(%L, %L, 1, ''on_site'', current_date, array[%L]::uuid[], array[30], array[6.5])', (select ta from _sl_ids), (select a_sale from _sl_ids), (select a_large from _sl_ids))),
  '42501', 'anon cannot execute update_sale');
select is(
  tests.try_as('anon', format('select public.void_sale(%L, %L, 1)', (select ta from _sl_ids), (select a_sale from _sl_ids))),
  '42501', 'anon cannot execute void_sale');
select is(
  tests.try_as('anon', format('select public.get_sale(%L, %L)', (select ta from _sl_ids), (select a_sale from _sl_ids))),
  '42501', 'anon cannot execute get_sale');
select is(
  tests.try_as('anon', format('select public.list_sales(%L)', (select ta from _sl_ids))),
  '42501', 'anon cannot execute list_sales');
select is(
  tests.try_as('anon', format('select public.get_on_hand(%L)', (select ta from _sl_ids))),
  '42501', 'anon cannot execute get_on_hand');
select is(tests.try_as('anon', 'insert into public.sales (tenant_id, sale_number, type, sale_date) values (gen_random_uuid(), 1, ''on_site'', current_date)'), '42501',
  'anon cannot insert a sale');

-- Feature 05: anon can execute none of the eight order functions, and cannot insert an order.
select is(
  tests.try_as('anon', format('select public.create_order(%L, gen_random_uuid(), %L, current_date, array[%L]::uuid[], array[30], array[6.5])', (select ta from _sl_ids), (select a_client from _sl_ids), (select a_large from _sl_ids))),
  '42501', 'anon cannot execute create_order');
select is(
  tests.try_as('anon', format('select public.update_order(%L, %L, 1, %L, current_date, array[%L]::uuid[], array[30], array[6.5])', (select ta from _sl_ids), (select a_order from _sl_ids), (select a_client from _sl_ids), (select a_large from _sl_ids))),
  '42501', 'anon cannot execute update_order');
select is(
  tests.try_as('anon', format('select public.set_order_status(%L, %L, ''ready'')', (select ta from _sl_ids), (select a_order from _sl_ids))),
  '42501', 'anon cannot execute set_order_status');
select is(
  tests.try_as('anon', format('select public.cancel_order(%L, %L)', (select ta from _sl_ids), (select a_order from _sl_ids))),
  '42501', 'anon cannot execute cancel_order');
select is(
  tests.try_as('anon', format('select public.close_order(%L, %L, 1)', (select ta from _sl_ids), (select a_order from _sl_ids))),
  '42501', 'anon cannot execute close_order');
select is(
  tests.try_as('anon', format('select public.deliver_order(%L, gen_random_uuid(), %L, current_date, array[%L]::uuid[], array[1])', (select ta from _sl_ids), (select a_order from _sl_ids), (select a_large from _sl_ids))),
  '42501', 'anon cannot execute deliver_order');
select is(
  tests.try_as('anon', format('select public.get_order(%L, %L)', (select ta from _sl_ids), (select a_order from _sl_ids))),
  '42501', 'anon cannot execute get_order');
select is(
  tests.try_as('anon', format('select public.list_orders(%L)', (select ta from _sl_ids))),
  '42501', 'anon cannot execute list_orders');
select is(tests.try_as('anon', format('insert into public.orders (tenant_id, order_number, client_id, order_date, status) values (%L, 1, %L, current_date, ''requested'')', (select ta from _sl_ids), (select a_client from _sl_ids))), '42501',
  'anon cannot insert an order');

select * from finish();
rollback;
