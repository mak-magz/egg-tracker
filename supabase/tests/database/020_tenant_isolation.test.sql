-- 020_tenant_isolation: farm A vs farm B (AC24, AC26). docs/features/00-project-scaffold.md §3.7.
-- The generic A-vs-B checks come from tests.isolation_checks() over every registered table, so a
-- later feature only adds a registry row in 000_helpers.sql. The named cases below spell out AC24.
begin;

select plan(2 * tests.isolation_check_count() + 16);

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

select * from finish();
rollback;
