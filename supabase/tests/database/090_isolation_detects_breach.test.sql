-- 090_isolation_detects_breach: AC25, automated. docs/features/00-project-scaffold.md §3.7.
-- Proves the isolation suite is not vacuous: each mutation below WEAKENS isolation, and the checker
-- must report at least one failed check. tests.mutation_detected() applies the mutation inside a
-- subtransaction and always rolls it back (DDL is transactional in Postgres), and the whole file is
-- wrapped in begin/rollback as a second guarantee. The last assertions prove everything was restored.
begin;
select plan(16);

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

-- m8: sizes readable by everyone signed in (feature 01)
select ok(tests.mutation_detected($m$
  drop policy sizes_select on public.sizes;
  create policy sizes_select on public.sizes for select to authenticated using (true);
$m$, 'a', 'b'), 'm8 detected: sizes_select replaced with using (true)');

-- m9: production insert policy without a tenant WITH CHECK
select ok(tests.mutation_detected($m$
  drop policy production_insert on public.production;
  create policy production_insert on public.production for insert to authenticated with check (true);
$m$, 'a', 'b'), 'm9 detected: production_insert replaced with with check (true)');

-- m10: RLS switched off on production.
select ok(tests.mutation_detected($m$
  alter table public.production disable row level security;
$m$, 'a', 'b'), 'm10 detected: row level security disabled on production');

-- m11 (QA, feature 01): the §3.6 mutation. A weak UPDATE WITH CHECK IS a reachable breach: as A,
-- `update public.production set tenant_id = <B>` (no column-referencing WHERE, so the SELECT policy is
-- not applied to the new row) moves A's unsized reject rows into B. Checker check 8 now attacks that way.
select ok(tests.mutation_detected($m$
  drop policy production_update on public.production;
  create policy production_update on public.production for update to authenticated
    using (tenant_id = (select app.current_tenant_id())) with check (true);
$m$, 'a', 'b'), 'm11 detected: production_update replaced with with check (true)');

-- m12 (feature 01, QA round 1 follow-up): a delete policy with no tenant filter. As A,
-- `delete from public.production where true` removes B's rows; check 9 (delete_all) detects it.
select ok(tests.mutation_detected($m$
  drop policy production_delete on public.production;
  create policy production_delete on public.production for delete to authenticated using (true);
$m$, 'a', 'b'), 'm12 detected: production_delete replaced with using (true)');

-- m13 (QA, feature 01 round 2): a weak UPDATE USING with the REAL WITH CHECK. As A,
-- `update public.production set tenant_id = <A>` passes the WITH CHECK and pulls B's rows into A
-- (verified: B's reject row moved). Check 4's column-referencing WHERE masks it; check 10 detects it.
select ok(tests.mutation_detected($m$
  drop policy production_update on public.production;
  create policy production_update on public.production for update to authenticated
    using (true) with check (tenant_id = (select app.current_tenant_id()));
$m$, 'a', 'b'), 'm13 detected: production_update USING replaced with (true), WITH CHECK kept');

-- Everything was restored by the mutation helper (not just by the final rollback).
select ok(not exists (select 1 from tests.isolation_checks('a', 'b') c where not c.passed),
  'after all mutations: every isolation check passes again (mutations were undone)');
select is(
  array(select p.polname::text from pg_policy p
        where p.polrelid in ('public.tenants'::regclass, 'public.memberships'::regclass, 'public.sizes'::regclass,
                             'public.production'::regclass, 'public.production_submissions'::regclass)
        order by 1),
  array['memberships_select_own', 'production_delete', 'production_insert', 'production_select',
        'production_submissions_insert', 'production_submissions_select', 'production_update',
        'sizes_select', 'tenants_select_own'],
  'after all mutations: only the original policies exist, RLS grants unchanged')
  ;

select * from finish();
rollback;
