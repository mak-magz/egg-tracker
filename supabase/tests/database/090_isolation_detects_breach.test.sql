-- 090_isolation_detects_breach: AC25, automated. docs/features/00-project-scaffold.md §3.7.
-- Proves the isolation suite is not vacuous: each mutation below WEAKENS isolation, and the checker
-- must report at least one failed check. tests.mutation_detected() applies the mutation inside a
-- subtransaction and always rolls it back (DDL is transactional in Postgres), and the whole file is
-- wrapped in begin/rollback as a second guarantee. The last assertions prove everything was restored.
begin;
select plan(10);

select tests.create_farm('Farm A', 'a');
select tests.create_farm('Farm B', 'b');

select ok(not exists (select 1 from tests.isolation_checks('a', 'b') c where not c.passed),
  'baseline: every isolation check passes with the real policies');

-- m1: tenants readable by everyone signed in
select ok(tests.mutation_detected($m$
  drop policy tenants_select_own on public.tenants;
  create policy tenants_select_own on public.tenants for select to authenticated using (true);
$m$, 'a', 'b'), 'm1 detected: tenants_select_own replaced with using (true)');

-- m2: memberships readable by everyone signed in
select ok(tests.mutation_detected($m$
  drop policy memberships_select_own on public.memberships;
  create policy memberships_select_own on public.memberships for select to authenticated using (true);
$m$, 'a', 'b'), 'm2 detected: memberships_select_own replaced with using (true)');

-- m3: RLS switched off on tenants
select ok(tests.mutation_detected($m$
  alter table public.tenants disable row level security;
$m$, 'a', 'b'), 'm3 detected: row level security disabled on tenants');

-- m4: owners may insert any membership
select ok(tests.mutation_detected($m$
  grant insert on public.memberships to authenticated;
  create policy memberships_insert_any on public.memberships for insert to authenticated with check (true);
$m$, 'a', 'b'), 'm4 detected: insert grant + permissive insert policy on memberships');

-- m5: the tenant helper resolves to the victim's farm
select ok(tests.mutation_detected(format($m$
  create or replace function app.current_tenant_id() returns uuid
    language sql stable security definer set search_path = '' as $f$ select %L::uuid $f$;
$m$, tests.tenant_id_of('b')), 'a', 'b'), 'm5 detected: app.current_tenant_id() returns the victim''s tenant');

-- m6: an update policy that forgets a correct WITH CHECK, so an owner can move its membership into B.
-- (A permissive USING alone is not a breach: UPDATE only sees rows the SELECT policy allows.)
select ok(tests.mutation_detected($m$
  grant update on public.memberships to authenticated;
  create policy memberships_update_own on public.memberships for update to authenticated
    using (user_id = (select auth.uid())) with check (true);
$m$, 'a', 'b'), 'm6 detected: update policy on memberships without a tenant WITH CHECK');

-- m7: anon can read farms
select ok(tests.mutation_detected($m$
  grant select on public.tenants to anon;
  create policy tenants_select_anon on public.tenants for select to anon using (true);
$m$, 'a', 'b'), 'm7 detected: anon select grant + permissive anon policy on tenants');

-- Everything was restored by the mutation helper (not just by the final rollback).
select ok(not exists (select 1 from tests.isolation_checks('a', 'b') c where not c.passed),
  'after all mutations: every isolation check passes again (mutations were undone)');
select is(
  array(select p.polname::text from pg_policy p
        where p.polrelid in ('public.tenants'::regclass, 'public.memberships'::regclass) order by 1),
  array['memberships_select_own', 'tenants_select_own'],
  'after all mutations: only the original policies exist, RLS grants unchanged')
  ;

select * from finish();
rollback;
