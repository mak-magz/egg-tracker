-- 010_rls_coverage: meta-guards over the whole `public` schema (docs/features/00-project-scaffold.md §3.7).
-- A new table that forgets RLS, updated_at, tenant_id, its index, or its isolation-registry row fails here.
begin;
select plan(58);

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

-- Feature 03: the client RPCs are security INVOKER, authenticated-only. Owners WRITE clients (the first personal data),
-- so what an owner can NOT do is pinned down at the privilege level, not only in the functions.
create temp view _client_rpcs as
  select f from unnest(array[
    'public.add_client(uuid,uuid,text,text,numeric)'::regprocedure,
    'public.update_client(uuid,uuid,bigint,text,text,numeric)'::regprocedure,
    'public.archive_client(uuid,uuid)'::regprocedure,
    'public.restore_client(uuid,uuid)'::regprocedure]) f;

select is(
  array(select r.f::text from _client_rpcs r join pg_proc p on p.oid = r.f where p.prosecdef order by 1),
  '{}'::text[],
  'the client RPCs are security invoker');

select is(
  array(select r.f::text from _client_rpcs r where has_function_privilege('anon', r.f, 'execute') order by 1),
  '{}'::text[],
  'anon cannot execute the client RPCs');

select is(
  array(select r.f::text from _client_rpcs r where not has_function_privilege('authenticated', r.f, 'execute') order by 1),
  '{}'::text[],
  'authenticated can execute the client RPCs');

select is(
  array(select f::text from unnest(array[
          'app.normalize_client_name(text)'::regprocedure,
          'app.normalize_client_phone(text)'::regprocedure,
          'app.client_text_invalid(text)'::regprocedure,
          'app.client_text_visible(text)'::regprocedure,
          'app.lock_tenant_clients(uuid)'::regprocedure,
          'app.assert_client_input_size(text,text)'::regprocedure,
          'app.assert_client_fields(text,text,numeric)'::regprocedure,
          'app.client_payload_hash(text,text,numeric)'::regprocedure,
          'app.clients_write_guard()'::regprocedure,
          'app.client_submissions_guard()'::regprocedure]) f
        where has_function_privilege('anon', f, 'execute') order by 1),
  '{}'::text[],
  'the app.* client helpers and trigger functions are not executable by anon');

select is(
  array(select f::text from unnest(array[
          'app.normalize_client_name(text)'::regprocedure,
          'app.normalize_client_phone(text)'::regprocedure,
          'app.client_text_invalid(text)'::regprocedure,
          'app.client_text_visible(text)'::regprocedure,
          'app.lock_tenant_clients(uuid)'::regprocedure,
          'app.assert_client_input_size(text,text)'::regprocedure,
          'app.assert_client_fields(text,text,numeric)'::regprocedure,
          'app.client_payload_hash(text,text,numeric)'::regprocedure]) f
        where not has_function_privilege('authenticated', f, 'execute') order by 1),
  '{}'::text[],
  'the client helpers the CHECK constraints and the invoker functions call are executable by authenticated');

select is(
  array(select t || ':' || p from unnest(array['public.clients', 'public.client_submissions']) t,
                                   unnest(array['delete', 'truncate', 'references', 'trigger']) p
        where has_table_privilege('authenticated', t, p) order by 1),
  '{}'::text[],
  'authenticated has no delete, truncate, references or trigger privilege on clients or client_submissions (AC21)');

select is(
  array(select c from unnest(array['id', 'version', 'archived_at', 'created_at', 'updated_at']) c
        where has_column_privilege('authenticated', 'public.clients', c, 'insert') order by 1),
  '{}'::text[],
  'authenticated cannot insert id, version, archived_at, created_at or updated_at into clients (a client is born active)');

select is(
  array(select c from unnest(array['id', 'tenant_id', 'version', 'created_at']) c
        where has_column_privilege('authenticated', 'public.clients', c, 'update') order by 1),
  '{}'::text[],
  'authenticated cannot update id, tenant_id, version or created_at on clients');

select ok(
  has_table_privilege('authenticated', 'public.clients', 'select')
  and has_column_privilege('authenticated', 'public.clients', 'tenant_id', 'insert')
  and has_column_privilege('authenticated', 'public.clients', 'name', 'insert')
  and has_column_privilege('authenticated', 'public.clients', 'phone', 'insert')
  and has_column_privilege('authenticated', 'public.clients', 'default_price', 'insert')
  and has_column_privilege('authenticated', 'public.clients', 'name', 'update')
  and has_column_privilege('authenticated', 'public.clients', 'phone', 'update')
  and has_column_privilege('authenticated', 'public.clients', 'default_price', 'update')
  and has_column_privilege('authenticated', 'public.clients', 'archived_at', 'update'),
  'authenticated can select clients, insert (tenant_id, name, phone, default_price) and update (name, phone, default_price, archived_at)');

select is(
  array(select p.polname::text from pg_policy p where p.polrelid = 'public.clients'::regclass and p.polcmd in ('d', '*')),
  '{}'::text[],
  'clients has no delete policy (no grant and no policy: two locks)');

select is(
  array(select p from unnest(array['update', 'delete', 'truncate']) p
        where has_table_privilege('authenticated', 'public.client_submissions', p) order by 1),
  '{}'::text[],
  'authenticated can only select and insert on client_submissions');

select is(
  array(select c from unnest(array['created_at', 'updated_at']) c
        where has_column_privilege('authenticated', 'public.client_submissions', c, 'insert') order by 1),
  '{}'::text[],
  'authenticated cannot insert created_at or updated_at into client_submissions');

select ok(
  has_column_privilege('authenticated', 'public.client_submissions', 'tenant_id', 'insert')
  and has_column_privilege('authenticated', 'public.client_submissions', 'id', 'insert')
  and has_column_privilege('authenticated', 'public.client_submissions', 'client_id', 'insert')
  and has_column_privilege('authenticated', 'public.client_submissions', 'payload_hash', 'insert'),
  'authenticated can insert (tenant_id, id, client_id, payload_hash) into client_submissions (what add_client writes)');

-- Feature 03 currency (AC35): the currency is the farm's own data; owners can read it and can not change it.
select is(
  array(select a.attname::text from pg_attribute a
        where a.attrelid = 'public.tenants'::regclass and a.attnum > 0 and not a.attisdropped
          and (has_column_privilege('authenticated', 'public.tenants', a.attname, 'update')
               or has_column_privilege('authenticated', 'public.tenants', a.attname, 'insert'))
        order by 1),
  '{}'::text[],
  'authenticated cannot insert or update any column of tenants, currency included (AC35)');

select ok(has_column_privilege('authenticated', 'public.tenants', 'currency', 'select'),
  'authenticated can read tenants.currency (through its own farm''s row)');

-- Feature 05: the order RPCs are security INVOKER, authenticated-only. Orders are never deleted and sales are void-only,
-- so what an owner can NOT do is pinned down at the privilege level, not only in the functions.
create temp view _order_rpcs as
  select f from unnest(array[
    'public.create_order(uuid,uuid,uuid,date,uuid[],integer[],numeric[],date)'::regprocedure,
    'public.update_order(uuid,uuid,bigint,uuid,date,uuid[],integer[],numeric[],date)'::regprocedure,
    'public.set_order_status(uuid,uuid,text)'::regprocedure,
    'public.cancel_order(uuid,uuid)'::regprocedure,
    'public.close_order(uuid,uuid,bigint)'::regprocedure,
    'public.deliver_order(uuid,uuid,uuid,date,uuid[],integer[],boolean)'::regprocedure,
    'public.get_order(uuid,uuid)'::regprocedure,
    'public.list_orders(uuid,text,uuid,date,date,int,int)'::regprocedure]) f;

select is(
  array(select r.f::text from _order_rpcs r join pg_proc p on p.oid = r.f where p.prosecdef order by 1),
  '{}'::text[],
  'the order RPCs are security invoker');

select is(
  array(select r.f::text from _order_rpcs r where has_function_privilege('anon', r.f, 'execute') order by 1),
  '{}'::text[],
  'anon cannot execute the order RPCs');

select is(
  array(select r.f::text from _order_rpcs r where not has_function_privilege('authenticated', r.f, 'execute') order by 1),
  '{}'::text[],
  'authenticated can execute the order RPCs');

select is(
  array(select f::text from unnest(array[
          'app.order_delivered_eggs(uuid,uuid)'::regprocedure,
          'app.order_status_for(uuid,uuid)'::regprocedure,
          'app.recompute_order_status(uuid,uuid,boolean)'::regprocedure,
          'app.order_payload_hash(uuid,date,date,uuid[],integer[],numeric[])'::regprocedure,
          'app.deliver_payload_hash(uuid,date,uuid[],integer[])'::regprocedure,
          'app.order_json(uuid,uuid,boolean)'::regprocedure,
          'app.list_orders_json(uuid,text,uuid,date,date,int,int)'::regprocedure,
          'app.validate_order_lines(uuid,uuid[],integer[],numeric[],uuid[])'::regprocedure,
          'app.orders_write_guard()'::regprocedure,
          'app.order_lines_write_guard()'::regprocedure,
          'app.order_lines_bounds()'::regprocedure,
          'app.sale_lines_linked_guard()'::regprocedure,
          'app.sales_void_sync_order()'::regprocedure,
          'app.seed_order_counter(uuid)'::regprocedure]) f
        where has_function_privilege('anon', f, 'execute') order by 1),
  '{}'::text[],
  'the app.* order helpers and trigger functions are not executable by anon');

select is(
  array(select t || ':' || p from unnest(array['public.orders', 'public.order_lines', 'public.order_counters', 'public.order_submissions', 'public.sales']) t,
                                   unnest(array['delete', 'truncate', 'references', 'trigger']) p
        where has_table_privilege('authenticated', t, p) and not (t = 'public.order_lines' and p = 'delete') order by 1),
  '{}'::text[],
  'authenticated has no delete, truncate, references or trigger privilege on orders, order_counters, order_submissions or sales (AC23, AC40); order_lines keeps delete for update_order');

select is(
  array(select p.polrelid::regclass::text || ':' || p.polname::text from pg_policy p
        where p.polrelid in ('public.orders'::regclass, 'public.order_counters'::regclass, 'public.order_submissions'::regclass, 'public.sales'::regclass)
          and p.polcmd in ('d', '*') order by 1),
  '{}'::text[],
  'orders, order_counters, order_submissions and sales have no delete policy');

select is(
  array(select c from unnest(array['id', 'created_at', 'converted_from_sale_number', 'cancelled_at', 'closed_short_at', 'version']) c
        where has_column_privilege('authenticated', 'public.orders', c, 'insert') order by 1),
  '{}'::text[],
  'authenticated cannot insert id, created_at, converted_from_sale_number, cancelled_at, closed_short_at or version into orders (an order is born open)');

select is(
  array(select c from unnest(array['id', 'tenant_id', 'order_number', 'converted_from_sale_number', 'created_at']) c
        where has_column_privilege('authenticated', 'public.orders', c, 'update') order by 1),
  '{}'::text[],
  'authenticated cannot update id, tenant_id, order_number, converted_from_sale_number or created_at on orders');

select is(
  array(select c from unnest(array['delivered_date', 'id', 'created_at']) c
        where has_column_privilege('authenticated', 'public.sales', c, 'insert') or has_column_privilege('authenticated', 'public.sales', c, 'update')
        order by 1),
  '{}'::text[],
  'authenticated can neither insert nor update a sale''s id, created_at or generated delivered_date, (feature 05)');

select ok(
  has_column_privilege('authenticated', 'public.sales', 'order_id', 'insert')
  and not has_column_privilege('authenticated', 'public.sales', 'order_id', 'update')
  and not has_column_privilege('authenticated', 'public.order_lines', 'size_id', 'update')
  and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sales' and column_name in ('status')),
  'order_id is insertable but never updatable on sales; an order line''s size can not be updated; sales has no status column');

select is(
  (select count(*)::int from pg_default_acl d
   cross join lateral aclexplode(d.defaclacl) a
   where d.defaclnamespace = 'public'::regnamespace
     and d.defaclrole = 'postgres'::regrole
     and a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))
     and not (d.defaclobjtype = 'f' and a.grantee = (select oid from pg_roles where rolname = 'authenticated'))),
  0,
  'default privileges for postgres in public grant nothing on new tables or sequences to anon/authenticated, nor functions to anon');

select * from finish();
rollback;
