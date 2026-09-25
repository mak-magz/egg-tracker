-- 030_foundation_constraints: tenants/memberships constraints, triggers and provisioning (AC22, AC30).
begin;
select plan(29);

-- eggs_per_tray default and range (AC22)
insert into public.tenants (id, name) values ('00000000-0000-0000-0000-00000000a001', 'Default Farm');
select is((select eggs_per_tray from public.tenants where id = '00000000-0000-0000-0000-00000000a001'), 30,
  'eggs_per_tray defaults to 30');
select throws_ok($$insert into public.tenants (name, eggs_per_tray) values ('Zero', 0)$$, '23514', null,
  'eggs_per_tray = 0 is rejected');
select throws_ok($$insert into public.tenants (name, eggs_per_tray) values ('Neg', -1)$$, '23514', null,
  'eggs_per_tray = -1 is rejected');
select throws_ok($$insert into public.tenants (name, eggs_per_tray) values ('Null', null)$$, '23502', null,
  'eggs_per_tray = null is rejected');
select lives_ok($$insert into public.tenants (name, eggs_per_tray) values ('One', 1)$$, 'eggs_per_tray = 1 is accepted');

-- name
select throws_ok($$insert into public.tenants (name) values ('   ')$$, '23514', null, 'a blank farm name is rejected');
select throws_ok($$insert into public.tenants (name) values ('')$$, '23514', null, 'an empty farm name is rejected');
select throws_ok(format('insert into public.tenants (name) values (%L)', repeat('x', 101)), '23514', null,
  'a 101-character farm name is rejected');
select lives_ok(format('insert into public.tenants (name) values (%L)', repeat('x', 100)),
  'a 100-character farm name is accepted');

-- updated_at triggers (now() is fixed inside the transaction, so start from an old value)
alter table public.tenants disable trigger set_updated_at;
update public.tenants set updated_at = '2000-01-01' where id = '00000000-0000-0000-0000-00000000a001';
alter table public.tenants enable trigger set_updated_at;
update public.tenants set name = 'Renamed' where id = '00000000-0000-0000-0000-00000000a001';
select is((select updated_at from public.tenants where id = '00000000-0000-0000-0000-00000000a001'), now(),
  'tenants.updated_at is bumped on update');

select tests.create_user('m1');
insert into public.memberships (tenant_id, user_id)
  values ('00000000-0000-0000-0000-00000000a001', tests.user_id('m1'));
alter table public.memberships disable trigger set_updated_at;
update public.memberships set updated_at = '2000-01-01' where user_id = tests.user_id('m1');
alter table public.memberships enable trigger set_updated_at;
update public.memberships set created_at = created_at where user_id = tests.user_id('m1');
select is((select updated_at from public.memberships where user_id = tests.user_id('m1')), now(),
  'memberships.updated_at is bumped on update');

-- memberships constraints
select throws_ok(
  format('insert into public.memberships (tenant_id, user_id) values (%L, %L)',
         '00000000-0000-0000-0000-00000000a001', tests.user_id('m1')),
  '23505', null, 'a user can belong to only one farm (unique user_id)');
select throws_ok(
  format('insert into public.memberships (tenant_id, user_id) values (gen_random_uuid(), %L)', tests.create_user('m2')),
  '23503', null, 'a membership must reference an existing farm');
select throws_ok(
  $$insert into public.memberships (tenant_id, user_id) values ('00000000-0000-0000-0000-00000000a001', gen_random_uuid())$$,
  '23503', null, 'a membership must reference an existing auth user');

-- provision_farm idempotency (AC30)
select tests.create_user('p1');
create temp table _t0 as select count(*) as n from public.tenants;

select is(
  (select row(f.farm_name, f.eggs_per_tray, f.outcome)::text
   from public.provision_farm(tests.user_id('p1'), '  Hendricks Farm ') f),
  row('Hendricks Farm', 30, 'created')::text,
  'provision_farm creates a farm (trimmed name, default 30 eggs per tray)');
select is((select count(*) from public.tenants), (select n + 1 from _t0), 'exactly one tenant was created');
select is(
  array(select s.name from public.sizes s where s.tenant_id = tests.tenant_id_of('p1') order by s.sort_order),
  array['Small', 'Medium', 'Large', 'Jumbo'],
  'provision_farm gives the new farm the default sizes with no extra step (AC37)');

select is(
  (select row(f.tenant_id, f.farm_name, f.eggs_per_tray, f.outcome)::text
   from public.provision_farm(tests.user_id('p1'), 'Other Name', 12) f),
  row(tests.tenant_id_of('p1'), 'Hendricks Farm', 30, 'unchanged')::text,
  're-running without p_update changes nothing and reports unchanged');
select is((select count(*) from public.tenants), (select n + 1 from _t0), 're-running creates no second tenant');

select is(
  (select row(f.tenant_id, f.farm_name, f.eggs_per_tray, f.outcome)::text
   from public.provision_farm(tests.user_id('p1'), 'Hendricks Egg Farm', 24, true) f),
  row(tests.tenant_id_of('p1'), 'Hendricks Egg Farm', 24, 'updated')::text,
  'p_update changes the name and eggs per tray');
select is(
  (select row(f.farm_name, f.eggs_per_tray, f.outcome)::text
   from public.provision_farm(tests.user_id('p1'), 'Hendricks Egg Farm', null, true) f),
  row('Hendricks Egg Farm', 24, 'updated')::text,
  'p_update without eggs per tray keeps the current value');
select is((select count(*) from public.tenants), (select n + 1 from _t0), 'updating creates no second tenant');
select is((select count(*) from public.memberships where user_id = tests.user_id('p1')), 1::bigint,
  'the owner still has exactly one membership');

select tests.create_user('p2');
select is(
  (select f.eggs_per_tray from public.provision_farm(tests.user_id('p2'), 'Small Trays', 12) f), 12,
  'provision_farm stores an explicit eggs per tray');
select tests.create_user('p3');
select throws_ok(
  format('select * from public.provision_farm(%L, %L, 0)', tests.user_id('p3'), 'Bad Trays'),
  '23514', null, 'provision_farm rejects eggs per tray = 0');
select is((select count(*) from public.memberships where user_id = tests.user_id('p3')), 0::bigint,
  'a rejected provision leaves no membership behind');
select throws_ok(
  $$select * from public.provision_farm(gen_random_uuid(), 'Ghost')$$,
  '23503', null, 'provision_farm rejects an unknown user');

-- admin helpers
select is(public.admin_user_id_by_email('  P1@TEST.local '), tests.user_id('p1'),
  'admin_user_id_by_email is case-insensitive and trims');

insert into auth.sessions (id, user_id) values (gen_random_uuid(), tests.user_id('p1')),
                                              (gen_random_uuid(), tests.user_id('p1'));
select is(public.admin_revoke_sessions(tests.user_id('p1')), 2, 'admin_revoke_sessions deletes the user''s sessions');

select * from finish();
rollback;
