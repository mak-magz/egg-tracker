-- 010_rls_coverage: meta-guards over the whole `public` schema (docs/features/00-project-scaffold.md §3.7).
-- A new table that forgets RLS, updated_at, tenant_id, its index, or its isolation-registry row fails here.
begin;
select plan(32);

-- Ordinary + partitioned tables in public.
create temp view _public_tables as
  select c.oid::regclass as t, c.relname::text as name
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p');

select is(
  array(select name from _public_tables p join pg_class c on c.oid = p.t where not c.relrowsecurity order by 1),
  '{}'::text[],
  'every public table has row level security enabled');

select is(
  array(select name from _public_tables p
        where p.t not in (select r.table_name from tests.tenant_table_registry() r) order by 1),
  '{}'::text[],
  'every public table is in the isolation registry (tests.tenant_table_registry in 000_helpers.sql)');

select is(
  array(select r.table_name::text from tests.tenant_table_registry() r
        where r.table_name not in (select t from _public_tables) order by 1),
  '{}'::text[],
  'every registry entry is a public table');

select is(
  array(select name from _public_tables p
        where not exists (select 1 from pg_attribute a
                          where a.attrelid = p.t and a.attname = 'updated_at' and not a.attisdropped
                            and a.atttypid = 'timestamptz'::regtype and a.attnotnull)
        order by 1),
  '{}'::text[],
  'every public table has updated_at timestamptz not null');

select is(
  array(select name from _public_tables p
        where not exists (select 1 from pg_trigger tg
                          where tg.tgrelid = p.t and not tg.tgisinternal
                            and tg.tgfoid = 'app.set_updated_at()'::regprocedure)
        order by 1),
  '{}'::text[],
  'every public table has an updated_at trigger using app.set_updated_at()');

-- tenants is the root: its id IS the tenant id (D4). Every other table has tenant_id.
select is(
  array(select name from _public_tables p
        where name <> 'tenants'
          and not exists (select 1 from pg_attribute a
                          where a.attrelid = p.t and a.attname = 'tenant_id' and not a.attisdropped
                            and a.atttypid = 'uuid'::regtype and a.attnotnull)
        order by 1),
  '{}'::text[],
  'every public table except tenants has tenant_id uuid not null');

select is(
  array(select name from _public_tables p
        where name <> 'tenants'
          and not exists (select 1 from pg_constraint k
                          join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
                          where k.conrelid = p.t and k.contype = 'f' and array_length(k.conkey, 1) = 1
                            and a.attname = 'tenant_id' and k.confrelid = 'public.tenants'::regclass)
        order by 1),
  '{}'::text[],
  'every tenant_id references public.tenants');

select is(
  array(select name from _public_tables p
        where name <> 'tenants'
          and not exists (select 1 from pg_index i
                          join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                          where i.indrelid = p.t and a.attname = 'tenant_id')
        order by 1),
  '{}'::text[],
  'every public table except tenants has an index that starts with tenant_id');

select is(
  array(select name from _public_tables p
        where has_table_privilege('anon', p.t, 'select, insert, update, delete, truncate, references, trigger')
        order by 1),
  '{}'::text[],
  'anon has no privileges on any public table');

-- Views must run with the caller's rights so RLS applies (the inventory view later).
select is(
  array(select c.relname::text from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
          and not coalesce(c.reloptions @> array['security_invoker=true']
                        or c.reloptions @> array['security_invoker=on'], false)
        order by 1),
  '{}'::text[],
  'every public view has security_invoker = true');

-- Service-role-only provisioning functions.
select is(
  array(select f::text from unnest(array[
          'public.provision_farm(uuid,text,integer,boolean)'::regprocedure,
          'public.admin_user_id_by_email(text)'::regprocedure,
          'public.admin_revoke_sessions(uuid)'::regprocedure]) f
        where has_function_privilege('anon', f, 'execute') order by 1),
  '{}'::text[],
  'anon cannot execute provision_farm / admin_user_id_by_email / admin_revoke_sessions');

select is(
  array(select f::text from unnest(array[
          'public.provision_farm(uuid,text,integer,boolean)'::regprocedure,
          'public.admin_user_id_by_email(text)'::regprocedure,
          'public.admin_revoke_sessions(uuid)'::regprocedure]) f
        where has_function_privilege('authenticated', f, 'execute') order by 1),
  '{}'::text[],
  'authenticated cannot execute provision_farm / admin_user_id_by_email / admin_revoke_sessions');

select ok(
  has_function_privilege('service_role', 'public.provision_farm(uuid,text,integer,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.admin_user_id_by_email(text)', 'execute')
  and has_function_privilege('service_role', 'public.admin_revoke_sessions(uuid)', 'execute'),
  'service_role can execute the provisioning functions');

-- General guard: a SECURITY DEFINER function in public bypasses RLS, so browsers must not reach it.
select is(
  array(select p.oid::regprocedure::text from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.prosecdef
          and (has_function_privilege('anon', p.oid, 'execute')
               or has_function_privilege('authenticated', p.oid, 'execute'))
        order by 1),
  '{}'::text[],
  'no security definer function in public is executable by anon or authenticated');

select ok(
  not has_schema_privilege('anon', 'app', 'usage')
  and has_function_privilege('authenticated', 'app.current_tenant_id()', 'execute')
  and not has_function_privilege('anon', 'app.current_tenant_id()', 'execute'),
  'app.current_tenant_id() is callable by authenticated only');

-- Feature 01: the production RPCs are security INVOKER (RLS applies inside), authenticated-only.
create temp view _production_rpcs as
  select f from unnest(array[
    'public.production_days(uuid,date,date)'::regprocedure,
    'public.log_production(uuid,uuid,date,uuid[],integer[],integer)'::regprocedure,
    'public.replace_production_day(uuid,date,uuid[],integer[],integer)'::regprocedure,
    'public.delete_production_day(uuid,date)'::regprocedure]) f;

select is(
  array(select r.f::text from _production_rpcs r join pg_proc p on p.oid = r.f where p.prosecdef order by 1),
  '{}'::text[],
  'the production RPCs are security invoker');

select is(
  array(select r.f::text from _production_rpcs r where has_function_privilege('anon', r.f, 'execute') order by 1),
  '{}'::text[],
  'anon cannot execute the production RPCs');

select is(
  array(select r.f::text from _production_rpcs r where not has_function_privilege('authenticated', r.f, 'execute') order by 1),
  '{}'::text[],
  'authenticated can execute the production RPCs');

select is(
  array(select f::text from unnest(array[
          'app.assert_tenant(uuid)'::regprocedure,
          'app.production_days_json(uuid,date,date)'::regprocedure,
          'app.production_day_json(uuid,date)'::regprocedure,
          'app.check_production_input(date,uuid[],integer[],integer)'::regprocedure,
          'app.lock_production_day(uuid,date)'::regprocedure,
          'app.seed_default_sizes(uuid)'::regprocedure,
          'app.seed_default_sizes_trigger()'::regprocedure,
          'app.production_bounds()'::regprocedure]) f
        where has_function_privilege('anon', f, 'execute')
           or (f::text like 'app.seed_default_sizes%' and has_function_privilege('authenticated', f, 'execute'))
        order by 1),
  '{}'::text[],
  'the app.* production helpers are not executable by anon (and size seeding not by authenticated)');

-- Feature 02: the size-management RPCs are security INVOKER, authenticated-only. The owner now WRITES sizes, so
-- what an owner can NOT do is pinned down at the privilege level (column grants), not only in the functions.
create temp view _size_rpcs as
  select f from unnest(array[
    'public.add_size(uuid,uuid,text)'::regprocedure,
    'public.rename_size(uuid,uuid,text)'::regprocedure,
    'public.reorder_sizes(uuid,uuid[])'::regprocedure,
    'public.archive_size(uuid,uuid)'::regprocedure,
    'public.restore_size(uuid,uuid)'::regprocedure]) f;

select is(
  array(select r.f::text from _size_rpcs r join pg_proc p on p.oid = r.f where p.prosecdef order by 1),
  '{}'::text[],
  'the size RPCs are security invoker');

select is(
  array(select r.f::text from _size_rpcs r where has_function_privilege('anon', r.f, 'execute') order by 1),
  '{}'::text[],
  'anon cannot execute the size RPCs');

select is(
  array(select r.f::text from _size_rpcs r where not has_function_privilege('authenticated', r.f, 'execute') order by 1),
  '{}'::text[],
  'authenticated can execute the size RPCs');

select is(
  array(select f::text from unnest(array[
          'app.normalize_size_name(text)'::regprocedure,
          'app.lock_tenant_sizes(uuid)'::regprocedure,
          'app.compact_size_order(uuid)'::regprocedure,
          'app.sizes_write_guard()'::regprocedure,
          'app.sizes_keep_one_active()'::regprocedure,
          'app.size_submissions_guard()'::regprocedure]) f
        where has_function_privilege('anon', f, 'execute') order by 1),
  '{}'::text[],
  'the app.* size helpers and trigger functions are not executable by anon');

select is(
  array(select f::text from unnest(array[
          'app.normalize_size_name(text)'::regprocedure,
          'app.lock_tenant_sizes(uuid)'::regprocedure,
          'app.compact_size_order(uuid)'::regprocedure]) f
        where not has_function_privilege('authenticated', f, 'execute') order by 1),
  '{}'::text[],
  'the size helpers the invoker functions and the name check call are executable by authenticated');

select is(
  array(select p from unnest(array['delete', 'truncate', 'references', 'trigger']) p
        where has_table_privilege('authenticated', 'public.sizes', p) order by 1),
  '{}'::text[],
  'authenticated has no delete, truncate, references or trigger privilege on sizes (AC25)');

select is(
  array(select c from unnest(array['id', 'sort_order', 'color_slot', 'archived_at', 'created_at', 'updated_at']) c
        where has_column_privilege('authenticated', 'public.sizes', c, 'insert') order by 1),
  '{}'::text[],
  'authenticated cannot insert id, sort_order, color_slot, archived_at, created_at or updated_at into sizes (the trigger assigns them)');

select is(
  array(select c from unnest(array['id', 'tenant_id', 'color_slot', 'created_at']) c
        where has_column_privilege('authenticated', 'public.sizes', c, 'update') order by 1),
  '{}'::text[],
  'authenticated cannot update id, tenant_id, color_slot or created_at on sizes');

select ok(
  has_column_privilege('authenticated', 'public.sizes', 'tenant_id', 'insert')
  and has_column_privilege('authenticated', 'public.sizes', 'name', 'insert')
  and has_column_privilege('authenticated', 'public.sizes', 'name', 'update')
  and has_column_privilege('authenticated', 'public.sizes', 'sort_order', 'update')
  and has_column_privilege('authenticated', 'public.sizes', 'archived_at', 'update'),
  'authenticated can insert (tenant_id, name) and update (name, sort_order, archived_at) on sizes');

select is(
  array(select p.polname::text from pg_policy p where p.polrelid = 'public.sizes'::regclass and p.polcmd in ('d', '*')),
  '{}'::text[],
  'sizes has no delete policy (no grant and no policy: two locks)');

select is(
  array(select p from unnest(array['update', 'delete', 'truncate']) p
        where has_table_privilege('authenticated', 'public.size_submissions', p) order by 1),
  '{}'::text[],
  'authenticated can only select and insert on size_submissions');

-- Security audit M-1: the ledger insert grant is limited to the columns add_size writes.
select is(
  array(select c from unnest(array['created_at', 'updated_at']) c
        where has_column_privilege('authenticated', 'public.size_submissions', c, 'insert') order by 1),
  '{}'::text[],
  'authenticated cannot insert created_at or updated_at into size_submissions');

select ok(
  has_column_privilege('authenticated', 'public.size_submissions', 'tenant_id', 'insert')
  and has_column_privilege('authenticated', 'public.size_submissions', 'id', 'insert')
  and has_column_privilege('authenticated', 'public.size_submissions', 'size_id', 'insert')
  and has_column_privilege('authenticated', 'public.size_submissions', 'name', 'insert'),
  'authenticated can insert (tenant_id, id, size_id, name) into size_submissions (what add_size writes)');

select * from finish();
rollback;
