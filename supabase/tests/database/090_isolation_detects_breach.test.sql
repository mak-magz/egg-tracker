-- 090_isolation_detects_breach: AC25, automated. docs/features/00-project-scaffold.md §3.7.
-- Proves the isolation suite is not vacuous: each mutation below WEAKENS isolation, and the checker
-- must report at least one failed check. tests.mutation_detected() applies the mutation inside a
-- subtransaction and always rolls it back (DDL is transactional in Postgres), and the whole file is
-- wrapped in begin/rollback as a second guarantee. The last assertions prove everything was restored.
begin;
select plan(26);

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

-- m14 (feature 02): sizes insert policy without a tenant WITH CHECK. Owners now have an insert grant on
-- (tenant_id, name), so this is a reachable breach: as A, `insert into sizes (tenant_id, name) values (<B>, ...)`.
-- Since the security audit fix (L-1) the sizes_write_guard trigger ALSO refuses another farm's tenant_id (42501,
-- before the RLS check), so a weak policy alone is no longer a breach: the second lock holds. The mutation
-- therefore removes both locks: the weak policy, and the guard (with defaults standing in for the slot and position
-- it assigns, so the insert can otherwise succeed). The checker must still notice.
select ok(tests.mutation_detected($m$
  drop policy sizes_insert on public.sizes;
  create policy sizes_insert on public.sizes for insert to authenticated with check (true);
  alter table public.sizes disable trigger sizes_write_guard;
  alter table public.sizes alter column sort_order set default 99, alter column color_slot set default 99;
$m$, 'a', 'b'), 'm14 detected: sizes_insert replaced with with check (true) and the guard trigger disabled');

-- m14b (audit L-1): the RLS policy alone is still enough to refuse the insert when the trigger is disabled.
select ok(not tests.mutation_detected($m$
  alter table public.sizes disable trigger sizes_write_guard;
  alter table public.sizes alter column sort_order set default 99, alter column color_slot set default 99;
$m$, 'a', 'b'), 'm14b not a breach: with only the guard trigger disabled the sizes_insert policy still holds');

-- m15 (feature 02): sizes update policy with no tenant filter at all. NOTE: a weak USING or a weak WITH CHECK
-- ALONE is not a reachable breach on sizes, because owners have no privilege on tenant_id: a victim row stays a
-- victim row, so the correct half of the policy still stops the write (verified). With both weakened, as A,
-- `update public.sizes set updated_at = updated_at where true` reaches B's rows; checker check 11 detects it.
select ok(tests.mutation_detected($m$
  drop policy sizes_update on public.sizes;
  create policy sizes_update on public.sizes for update to authenticated using (true) with check (true);
$m$, 'a', 'b'), 'm15 detected: sizes_update replaced with using (true) with check (true)');

-- m16 (feature 02): a delete grant and a permissive delete policy on sizes (AC25: no owner can delete a size).
select ok(tests.mutation_detected($m$
  grant delete on public.sizes to authenticated;
  create policy sizes_delete_any on public.sizes for delete to authenticated using (true);
$m$, 'a', 'b'), 'm16 detected: delete grant + permissive delete policy on sizes');

-- m17 (feature 03): clients insert policy without a tenant WITH CHECK. Owners have an insert grant on
-- (tenant_id, name, phone, default_price), so this is a reachable breach: as A, `insert into clients (tenant_id, name)
-- values (<B>, ...)`. The clients_write_guard trigger ALSO refuses another farm's tenant_id (42501, before the RLS
-- check), so the mutation removes both locks, as m14 does for sizes. The checker must still notice.
select ok(tests.mutation_detected($m$
  drop policy clients_insert on public.clients;
  create policy clients_insert on public.clients for insert to authenticated with check (true);
  alter table public.clients disable trigger clients_write_guard;
$m$, 'a', 'b'), 'm17 detected: clients_insert replaced with with check (true) and the guard trigger disabled');

-- m17b: the RLS policy alone is still enough to refuse the insert when the guard trigger is disabled.
select ok(not tests.mutation_detected($m$
  alter table public.clients disable trigger clients_write_guard;
$m$, 'a', 'b'), 'm17b not a breach: with only the guard trigger disabled the clients_insert policy still holds');

-- m18 (feature 03): clients update policy with no tenant filter at all. A weak USING or WITH CHECK ALONE is not a
-- reachable breach (owners have no privilege on tenant_id); with both weakened, as A,
-- `update public.clients set updated_at = now() where true` reaches B's rows; checker check 11 detects it.
select ok(tests.mutation_detected($m$
  drop policy clients_update on public.clients;
  create policy clients_update on public.clients for update to authenticated using (true) with check (true);
$m$, 'a', 'b'), 'm18 detected: clients_update replaced with using (true) with check (true)');

-- m19 (feature 03): a delete grant and a permissive delete policy on clients (AC21: no owner can delete a client).
select ok(tests.mutation_detected($m$
  grant delete on public.clients to authenticated;
  create policy clients_delete_any on public.clients for delete to authenticated using (true);
$m$, 'a', 'b'), 'm19 detected: delete grant + permissive delete policy on clients');

-- m20 (feature 03): the client ledger's insert policy without a tenant WITH CHECK, and its guard trigger disabled.
-- (With both weakened the attacker's row reaches the foreign key instead of being refused with 42501, and the checker
-- reports it.)
select ok(tests.mutation_detected($m$
  drop policy client_submissions_insert on public.client_submissions;
  create policy client_submissions_insert on public.client_submissions for insert to authenticated with check (true);
  alter table public.client_submissions disable trigger client_submissions_guard;
$m$, 'a', 'b'), 'm20 detected: client_submissions_insert replaced with with check (true) and its guard trigger disabled');

-- m20b: the ledger's RLS policy alone still refuses the insert when its guard trigger is disabled.
select ok(not tests.mutation_detected($m$
  alter table public.client_submissions disable trigger client_submissions_guard;
$m$, 'a', 'b'), 'm20b not a breach: with only its guard trigger disabled the client_submissions_insert policy still holds');

-- Everything was restored by the mutation helper (not just by the final rollback).
select ok(not exists (select 1 from tests.isolation_checks('a', 'b') c where not c.passed),
  'after all mutations: every isolation check passes again (mutations were undone)');
select is(
  array(select p.polname::text from pg_policy p
        where p.polrelid in ('public.tenants'::regclass, 'public.memberships'::regclass, 'public.sizes'::regclass,
                             'public.production'::regclass, 'public.production_submissions'::regclass,
                             'public.size_submissions'::regclass, 'public.clients'::regclass,
                             'public.client_submissions'::regclass)
        order by p.polname::text collate "C"),
  array['client_submissions_insert', 'client_submissions_select', 'clients_insert', 'clients_select', 'clients_update',
        'memberships_select_own', 'production_delete', 'production_insert', 'production_select',
        'production_submissions_insert', 'production_submissions_select', 'production_update',
        'size_submissions_insert', 'size_submissions_select', 'sizes_insert', 'sizes_select', 'sizes_update',
        'tenants_select_own'],
  'after all mutations: only the original policies exist, RLS grants unchanged')
  ;

select * from finish();
rollback;
