-- 000_helpers.sql: shared pgTAP helpers, the tenant-table REGISTRY and the isolation CHECKER.
-- Design: docs/features/00-project-scaffold.md §3.7.
--
-- Unlike every other test file, this one is NOT wrapped in begin/rollback: it commits the `tests`
-- schema to the LOCAL database so the later files (run in filename order by `bun run test:db`) can use it.
-- `bun run db:reset` wipes it. Everything is `create or replace`, so re-running is idempotent.
-- The `tests` schema is not in [api].schemas, so PostgREST never exposes it.
--
-- ============================================================================================
-- ADDING A NEW TENANT TABLE (AC26): add ONE row to tests.tenant_table_registry() below, with a
-- seed_sql that inserts one row for tenant %1$L (as postgres) and an attack_insert_sql that an
-- attacker would use to write into the victim's tenant %1$L. 020 and 090 then cover it
-- automatically, and 010 fails until you do.
-- ============================================================================================

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- --------------------------------------------------------------------------------------------
-- Users and farms (run as postgres)
-- --------------------------------------------------------------------------------------------

-- 'a' -> 'a@test.local'; anything containing '@' is used as-is.
create or replace function tests.email_of(p_identifier text)
  returns text language sql immutable as $$
  select case when p_identifier like '%@%' then lower(p_identifier) else lower(p_identifier) || '@test.local' end
$$;

create or replace function tests.create_user(p_identifier text)
  returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  select u.id into v_id from auth.users u where u.email = tests.email_of(p_identifier);
  if v_id is not null then
    return v_id;
  end if;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          tests.email_of(p_identifier), '', now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now())
  returning id into v_id;
  return v_id;
end
$$;

create or replace function tests.user_id(p_identifier text)
  returns uuid language plpgsql stable as $$
declare
  v_id uuid;
begin
  select u.id into v_id from auth.users u where u.email = tests.email_of(p_identifier);
  if v_id is null then
    raise exception 'tests.user_id: no test user %', p_identifier;
  end if;
  return v_id;
end
$$;

-- Creates the owner (if needed), a tenant and the membership. Returns the tenant id.
create or replace function tests.create_farm(p_name text, p_owner_identifier text)
  returns uuid language plpgsql as $$
declare
  v_user   uuid := tests.create_user(p_owner_identifier);
  v_tenant uuid;
begin
  insert into public.tenants (name) values (p_name) returning id into v_tenant;
  insert into public.memberships (tenant_id, user_id) values (v_tenant, v_user);
  return v_tenant;
end
$$;

create or replace function tests.tenant_id_of(p_identifier text)
  returns uuid language plpgsql stable as $$
declare
  v_tenant uuid;
begin
  select m.tenant_id into v_tenant from public.memberships m where m.user_id = tests.user_id(p_identifier);
  if v_tenant is null then
    raise exception 'tests.tenant_id_of: % has no farm', p_identifier;
  end if;
  return v_tenant;
end
$$;

-- --------------------------------------------------------------------------------------------
-- Role switching. Mirrors what PostgREST does per request: SET LOCAL role + request.jwt.claims.
-- --------------------------------------------------------------------------------------------

create or replace function tests.authenticate_as(p_identifier text)
  returns void language plpgsql as $$
declare
  v_id    uuid := tests.user_id(p_identifier);   -- look up BEFORE dropping privileges
  v_email text := tests.email_of(p_identifier);
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id, 'role', 'authenticated', 'email', v_email, 'aud', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_id::text, true);
  perform set_config('role', 'authenticated', true);
end
$$;

create or replace function tests.authenticate_anon()
  returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end
$$;

-- Back to the session user (postgres) with no JWT claims.
create or replace function tests.clear_authentication()
  returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end
$$;

-- Runs p_sql as p_who ('anon' or a test-user identifier) and ALWAYS comes back as the session user.
-- Returns 'ok:<row_count>' on success (row_count = rows returned by a SELECT or affected by DML),
-- or the SQLSTATE on error (e.g. '42501' insufficient_privilege). Errors roll back p_sql's effects;
-- a successful write stays in the caller's transaction (every test file rolls back at the end).
create or replace function tests.try_as(p_who text, p_sql text)
  returns text language plpgsql as $$
declare
  v_uid   uuid;
  v_n     bigint;
  v_state text;
begin
  if p_who <> 'anon' then
    v_uid := tests.user_id(p_who);   -- fail loudly on a typo, before switching roles
  end if;
  begin
    if p_who = 'anon' then
      perform tests.authenticate_anon();
    else
      perform tests.authenticate_as(p_who);
    end if;
    execute p_sql;
    get diagnostics v_n = row_count;
    perform tests.clear_authentication();
    return 'ok:' || v_n;
  exception when others then
    -- The subtransaction rollback already restored role and claims.
    get stacked diagnostics v_state = returned_sqlstate;
    perform tests.clear_authentication();
    return v_state;
  end;
end
$$;

-- Like tests.try_as, but ALWAYS rolls p_sql back (even on success), so destructive probes such as
-- `delete ... where true` never remove the attacker's own seeded rows. Returns 'ok:<row_count>' or the SQLSTATE.
create or replace function tests.try_as_rolled_back(p_who text, p_sql text)
  returns text language plpgsql as $$
declare
  v_res text;
begin
  begin
    v_res := tests.try_as(p_who, p_sql);
    raise exception 'tests.try_as_rolled_back: undo' using errcode = 'TSTRB';
  exception when sqlstate 'TSTRB' then
    null;   -- rolled back; v_res survives
  end;
  perform tests.clear_authentication();
  return v_res;
end
$$;

-- --------------------------------------------------------------------------------------------
-- REGISTRY: every table in `public` must appear here (010 enforces it).
--   table_name        the table
--   tenant_column     'tenant_id' (or 'id' for the root `tenants` table)
--   seed_sql          format() template, %1$L = tenant id; inserts >= 1 row for that tenant as postgres.
--                     null when tests.create_farm() already seeds the table.
--   attack_insert_sql format() template, %1$L = VICTIM tenant id; run as the attacker, must raise 42501.
-- Rows are seeded in registry order, so list parents before children.
-- --------------------------------------------------------------------------------------------
create or replace function tests.tenant_table_registry()
  returns table (table_name regclass, tenant_column text, seed_sql text, attack_insert_sql text)
  language sql stable as $$
  values
    ('public.tenants'::regclass, 'id', null::text,
       'insert into public.tenants (id, name) values (%1$L, ''x'')'),
    ('public.memberships'::regclass, 'tenant_id', null::text,
       'insert into public.memberships (tenant_id, user_id) values (%1$L, auth.uid())'),
    -- Feature 01. sizes: seeded by the tenants insert trigger (Small/Medium/Large/Jumbo).
    ('public.sizes'::regclass, 'tenant_id', null::text,
       'insert into public.sizes (tenant_id, name, sort_order, color_slot) values (%1$L, ''Attack'', 99, 99)'),
    -- production seeds an UNSIZED reject row. A sized row would make every cross-tenant move fail on the
    -- composite size FK (23503), which aborts the whole statement and hides whether rows were movable; with a
    -- reject row, a theft (check 10) or a push (check 8) shows up as moved rows (`ok:n`). The composite FK is
    -- covered by 020 and 040. Each seed gets its own date (2026-01-02 + rows so far), so two farms' seed rows
    -- never share a (date, quality) key (a move would hit 23505 instead) and never collide with the attack
    -- row on 2026-01-01.
    ('public.production'::regclass, 'tenant_id',
       'insert into public.production (tenant_id, produced_on, quality, eggs) values (%1$L, date ''2026-01-02'' + (select count(*) from public.production)::int, ''reject'', 3)',
       'insert into public.production (tenant_id, produced_on, quality, eggs) values (%1$L, date ''2026-01-01'', ''reject'', 1)'),
    ('public.production_submissions'::regclass, 'tenant_id',
       'insert into public.production_submissions (tenant_id, id, produced_on, had_before) values (%1$L, gen_random_uuid(), date ''2026-01-01'', false)',
       'insert into public.production_submissions (tenant_id, id, produced_on, had_before) values (%1$L, gen_random_uuid(), date ''2026-01-01'', false)')
    -- Later features add e.g.:
    -- ,('public.clients'::regclass, 'tenant_id',
    --     'insert into public.clients (tenant_id, name) values (%1$L, ''Seed client'')',
    --     'insert into public.clients (tenant_id, name) values (%1$L, ''Attack'')')
$$;

-- --------------------------------------------------------------------------------------------
-- CHECKER (plain SQL, not pgTAP, so 020 and 090 can share it).
-- For every registered table, as p_attacker against p_victim:
--   1 positive_control   attacker sees >= 1 of its own rows (a deny-everything policy can't pass)
--   2 select_victim      attacker sees 0 rows where <col> = victim (naming the other farm explicitly)
--   3 select_others      attacker sees 0 rows where <col> <> own
--   4 update_victim      update ... where <col> = victim affects 0 rows or raises 42501
--   5 delete_victim      delete ... where <col> = victim affects 0 rows or raises 42501, victim row still exists
--   6 insert_victim      attack_insert_sql with the victim's id raises 42501
--   8 update_into_victim update ... set <col> = victim where true affects 0 rows or raises 42501
--                        (catches an update policy without a correct WITH CHECK; the WHERE must not
--                        reference columns, or the SELECT policy on the new row masks the weakness)
--   7 anon_select        anon sees 0 rows of the whole table, or is denied (42501)
--   9 delete_all         `delete ... where true` (rolled back) deletes no more rows than the attacker owns,
--                        or is denied (42501). Catches a weak DELETE USING: check 5's column-referencing
--                        WHERE makes Postgres apply the SELECT policy too, which masks it.
--  10 update_steal       `update ... set <col> = own where true` (rolled back) touches no more rows than the
--                        attacker owns, or is denied (42501). Catches a weak UPDATE USING that check 4 masks:
--                        with the real WITH CHECK, setting <col> to the attacker's own id passes it and pulls
--                        the victim's rows into the attacker's tenant (QA feature 01 round 2, 090 m13).
--                        Any other error (e.g. 23503 from a victim row's composite FK) counts as detected.
-- Each check is isolated (tests.try_as catches errors), so one failure never hides the rest.
-- --------------------------------------------------------------------------------------------
create or replace function tests.isolation_checks(p_attacker text, p_victim text)
  returns table (table_name text, check_name text, passed boolean, description text)
  language plpgsql as $$
#variable_conflict use_column
declare
  r        record;
  v_own    uuid := tests.tenant_id_of(p_attacker);
  v_victim uuid := tests.tenant_id_of(p_victim);
  v_t      text;
  v_col    text;
  v_res    text;
  v_n      bigint;
  v_prefix text;
begin
  for r in select * from tests.tenant_table_registry() loop
    v_t := r.table_name::text;
    v_col := r.tenant_column;
    v_prefix := format('%s (%s vs %s): ', v_t, p_attacker, p_victim);

    -- Seed (as postgres) only when the tenant has no rows yet, so repeated runs stay idempotent.
    if r.seed_sql is not null then
      execute format('select count(*) from %s where %I = %L', v_t, v_col, v_own) into v_n;
      if v_n = 0 then execute format(r.seed_sql, v_own); end if;
      execute format('select count(*) from %s where %I = %L', v_t, v_col, v_victim) into v_n;
      if v_n = 0 then execute format(r.seed_sql, v_victim); end if;
    end if;

    -- 1
    v_res := tests.try_as(p_attacker, format('select 1 from %s where %I = %L', v_t, v_col, v_own));
    table_name := v_t; check_name := 'positive_control';
    passed := v_res like 'ok:%' and v_res <> 'ok:0';
    description := v_prefix || 'attacker sees its own rows (positive control) [got ' || v_res || ']';
    return next;

    -- 2
    v_res := tests.try_as(p_attacker, format('select 1 from %s where %I = %L', v_t, v_col, v_victim));
    check_name := 'select_victim';
    passed := v_res = 'ok:0';
    description := v_prefix || 'attacker reads 0 victim rows, even naming the victim explicitly [got ' || v_res || ']';
    return next;

    -- 3
    v_res := tests.try_as(p_attacker, format('select 1 from %s where %I is distinct from %L', v_t, v_col, v_own));
    check_name := 'select_others';
    passed := v_res = 'ok:0';
    description := v_prefix || 'attacker reads 0 rows of any other tenant [got ' || v_res || ']';
    return next;

    -- 4
    v_res := tests.try_as(p_attacker,
      format('update %s set updated_at = updated_at where %I = %L', v_t, v_col, v_victim));
    check_name := 'update_victim';
    passed := v_res in ('ok:0', '42501');
    description := v_prefix || 'attacker updates 0 victim rows (or is denied) [got ' || v_res || ']';
    return next;

    -- 5
    v_res := tests.try_as(p_attacker, format('delete from %s where %I = %L', v_t, v_col, v_victim));
    execute format('select count(*) from %s where %I = %L', v_t, v_col, v_victim) into v_n;
    check_name := 'delete_victim';
    passed := v_res in ('ok:0', '42501') and v_n >= 1;
    description := v_prefix || 'attacker deletes 0 victim rows (or is denied) [got ' || v_res
      || ', victim rows left: ' || v_n || ']';
    return next;

    -- 6
    v_res := tests.try_as(p_attacker, format(r.attack_insert_sql, v_victim));
    check_name := 'insert_victim';
    passed := v_res = '42501';
    description := v_prefix || 'attacker insert into the victim tenant is denied with 42501 [got ' || v_res || ']';
    return next;

    -- 8 (a missing/weak WITH CHECK lets an owner move its own row into another tenant)
    -- The WHERE must NOT reference the table's columns: when it does, Postgres also checks the NEW row
    -- against the SELECT policy, which masks a weak UPDATE WITH CHECK. `update ... set tenant_id = B`
    -- with no column-referencing WHERE is exactly how an owner would exploit it (QA feature 01, 090 m11).
    v_res := tests.try_as(p_attacker,
      format('update %s set %I = %L where true', v_t, v_col, v_victim));
    check_name := 'update_into_victim';
    passed := v_res in ('ok:0', '42501');
    description := v_prefix || 'attacker cannot move its own rows into the victim tenant [got ' || v_res || ']';
    return next;

    -- 7
    v_res := tests.try_as('anon', format('select 1 from %s', v_t));
    check_name := 'anon_select';
    passed := v_res in ('ok:0', '42501');
    description := v_prefix || 'signed-out (anon) reads 0 rows (or is denied) [got ' || v_res || ']';
    return next;

    -- 9 (a weak DELETE USING, unmasked: no column-referencing WHERE, so the SELECT policy isn't applied)
    execute format('select count(*) from %s where %I = %L', v_t, v_col, v_own) into v_n;
    v_res := tests.try_as_rolled_back(p_attacker, format('delete from %s where true', v_t));
    check_name := 'delete_all';
    passed := v_res = '42501' or (v_res like 'ok:%' and substr(v_res, 4)::bigint <= v_n);
    description := v_prefix || 'attacker''s unrestricted delete removes only its own rows (or is denied) [got '
      || v_res || ', attacker owns ' || v_n || ']';
    return next;

    -- 10 (a weak UPDATE USING, unmasked: the attacker pulls the victim's rows into its own tenant)
    execute format('select count(*) from %s where %I = %L', v_t, v_col, v_own) into v_n;
    v_res := tests.try_as_rolled_back(p_attacker, format('update %s set %I = %L where true', v_t, v_col, v_own));
    check_name := 'update_steal';
    passed := v_res = '42501' or (v_res like 'ok:%' and substr(v_res, 4)::bigint <= v_n);
    description := v_prefix || 'attacker''s unrestricted update touches only its own rows (or is denied) [got '
      || v_res || ', attacker owns ' || v_n || ']';
    return next;
  end loop;

  perform tests.clear_authentication();
end
$$;

-- Number of checks isolation_checks() returns per direction (keeps plan() counts in sync).
create or replace function tests.isolation_check_count()
  returns integer language sql stable as $$
  select 10 * count(*)::int from tests.tenant_table_registry()
$$;

-- AC25: applies p_mutation (as postgres), runs the checker, then UNDOES the mutation by raising and
-- catching a private error, which rolls back the subtransaction (DDL included). Returns true when at
-- least one check failed, i.e. the suite detected the weakening. Errors in p_mutation propagate.
create or replace function tests.mutation_detected(p_mutation text, p_attacker text, p_victim text)
  returns boolean language plpgsql as $$
declare
  v_detected boolean;
begin
  begin
    execute p_mutation;
    select exists (select 1 from tests.isolation_checks(p_attacker, p_victim) c where not c.passed)
      into v_detected;
    raise exception 'tests.mutation_detected: undo mutation' using errcode = 'TSTUN';
  exception when sqlstate 'TSTUN' then
    null;   -- mutation rolled back; v_detected survives (plpgsql variables aren't transactional)
  end;
  perform tests.clear_authentication();
  return v_detected;
end
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- pg_prove needs TAP output from every file.
select plan(1);
select ok(to_regprocedure('tests.isolation_checks(text,text)') is not null, 'test helpers installed');
select * from finish();
