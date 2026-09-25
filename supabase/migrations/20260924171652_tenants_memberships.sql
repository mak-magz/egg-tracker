-- M2 tenants_memberships (docs/features/00-project-scaffold.md §3.2, §3.3)
--
-- `tenants` is the ROOT table: its `id` IS the tenant id, so it has no separate tenant_id column (D4).
-- Every other table carries `tenant_id uuid not null references public.tenants(id)`.

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
create table public.tenants (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  -- Per-farm setting. The default (30, owner decision) lives ONLY here: provisioning omits the column.
  eggs_per_tray integer     not null default 30,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tenants_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint tenants_eggs_per_tray_positive check (eggs_per_tray >= 1)
);

comment on table public.tenants is 'Farms. Root of multi-tenancy: tenants.id is the tenant id.';

create trigger set_updated_at
  before update on public.tenants
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- memberships (user -> farm)
-- ---------------------------------------------------------------------------
create table public.memberships (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One farm per user in v1. Multi-farm later: replace with unique (tenant_id, user_id).
  constraint memberships_user_id_key unique (user_id)
);

comment on table public.memberships is 'Maps auth users to their farm. Source of truth for tenant resolution.';

create index memberships_tenant_id_idx on public.memberships (tenant_id);

create trigger set_updated_at
  before update on public.memberships
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Shared tenant-resolution helper. Every policy calls it as (select app.current_tenant_id())
-- so the planner evaluates it once per statement (initPlan).
-- security definer: reads memberships without recursing into memberships' own RLS.
-- ---------------------------------------------------------------------------
create function app.current_tenant_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.tenant_id
  from public.memberships m
  where m.user_id = (select auth.uid())
  limit 1
$$;

comment on function app.current_tenant_id() is
  'Tenant of the signed-in user (JWT sub -> memberships). The ONE place tenant resolution happens in SQL.';

revoke all on function app.current_tenant_id() from public;
grant execute on function app.current_tenant_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Grants + RLS. Owners can only READ their own farm and membership in v1 (D6):
-- no write grants AND no write policies (two independent locks).
-- ---------------------------------------------------------------------------
revoke all on public.tenants from anon, authenticated;
grant select on public.tenants to authenticated;

revoke all on public.memberships from anon, authenticated;
grant select on public.memberships to authenticated;

alter table public.tenants enable row level security;
alter table public.memberships enable row level security;

create policy tenants_select_own on public.tenants
  for select to authenticated
  using (id = (select app.current_tenant_id()));

create policy memberships_select_own on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()));
