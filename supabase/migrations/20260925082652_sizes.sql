-- M4 sizes (docs/features/01-production-logging.md §3.1, §3.2)
-- Egg sizes are per-farm data (owner decision 2, D10): an ordered list with a stable colour slot.
-- Sizes are never deleted (AC41): retiring one sets archived_at (follow-up feature "Farm settings: sizes").

create table public.sizes (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants (id) on delete cascade,
  name        text        not null,
  -- The farm's order. Not unique, so a later reorder needs no deferred constraint. Ties break by name, then id.
  sort_order  integer     not null,
  -- Stable colour (UX R2): 0-9 map to the palette, 10+ repeat it with a dashed line. Never reused.
  color_slot  smallint    not null,
  archived_at timestamptz null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint sizes_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint sizes_sort_order_nonnegative check (sort_order >= 0),
  constraint sizes_color_slot_nonnegative check (color_slot >= 0),
  -- Target of production's composite FK (a size must belong to the same farm). Also the index leading with tenant_id.
  constraint sizes_tenant_id_id_key unique (tenant_id, id),
  -- A slot is never reused, even after archiving, so an archived size keeps its colour in past charts.
  constraint sizes_tenant_color_slot_key unique (tenant_id, color_slot)
);

comment on table public.sizes is 'Per-farm egg sizes (ordered, stable colour slot, archived not deleted). Referenced by size_id.';

-- No two sizes in a farm share a name, whatever the case (archived ones included, so past days never show duplicates).
create unique index sizes_tenant_name_key on public.sizes (tenant_id, lower(btrim(name)));

create trigger set_updated_at
  before update on public.sizes
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Default size list: the ONLY place Small/Medium/Large/Jumbo appear (AC37, AC38).
-- Idempotent: an existing name or colour slot is left alone.
-- ---------------------------------------------------------------------------
create function app.seed_default_sizes(p_tenant_id uuid)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  insert into public.sizes (tenant_id, name, sort_order, color_slot)
  values (p_tenant_id, 'Small', 0, 0),
         (p_tenant_id, 'Medium', 1, 1),
         (p_tenant_id, 'Large', 2, 2),
         (p_tenant_id, 'Jumbo', 3, 3)
  on conflict do nothing;
end
$$;

comment on function app.seed_default_sizes(uuid) is 'Seeds a farm''s default sizes. Idempotent. Called by the tenants insert trigger.';

create function app.seed_default_sizes_trigger()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  perform app.seed_default_sizes(new.id);
  return null;
end
$$;

revoke all on function app.seed_default_sizes(uuid) from public;
revoke all on function app.seed_default_sizes_trigger() from public;

-- Every new farm gets the list, whatever creates it (provision_farm, tests.create_farm, future sign-up).
-- Tenants are only inserted by postgres (directly or inside the security definer provision_farm).
create trigger seed_default_sizes
  after insert on public.tenants
  for each row execute function app.seed_default_sizes_trigger();

-- ---------------------------------------------------------------------------
-- Grants + RLS. Owners can only READ sizes in feature 01 (D14): no write grant AND no write policy.
-- ---------------------------------------------------------------------------
revoke all on public.sizes from anon, authenticated;
grant select on public.sizes to authenticated;

alter table public.sizes enable row level security;

create policy sizes_select on public.sizes
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

-- Backfill existing farms (AC37).
select app.seed_default_sizes(t.id) from public.tenants t;
