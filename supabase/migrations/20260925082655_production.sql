-- M5 production (docs/features/01-production-logging.md §3.1, §3.2)
-- One AGGREGATE row per (farm, date, quality, size): logging a date again adds to its rows (upsert),
-- Edit replaces the day, Delete removes it by date. Always individual eggs. Writes go through the
-- security invoker functions in M6, but every data rule is enforced here too (direct PostgREST writes).

create table public.production (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants (id) on delete cascade,
  -- The owner's local calendar date, as sent by the device.
  produced_on date        not null,
  size_id     uuid        null,
  quality     text        not null,
  eggs        integer     not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint production_quality_valid check (quality in ('good', 'reject')),
  -- Zero rows aren't stored: a size with nothing is simply absent.
  constraint production_eggs_positive check (eggs > 0),
  -- Rejects are unsized and good eggs are sized (AC35, D2).
  constraint production_reject_unsized check ((quality = 'reject') = (size_id is null)),
  -- A size must belong to the SAME farm (AC35, AC40). NO ACTION (not RESTRICT) so a whole-tenant cascade works;
  -- deleting a single size that has production fails (AC41). Not checked when size_id is null (rejects).
  constraint production_size_fk foreign key (tenant_id, size_id) references public.sizes (tenant_id, id),
  -- The aggregate key and upsert arbiter: one row per day per size, one reject row per day.
  constraint production_day_key unique nulls not distinct (tenant_id, produced_on, quality, size_id)
);

comment on table public.production is 'Daily production, one aggregate row per (farm, date, quality, size). Eggs, never trays.';

-- Backs the composite FK and the Inventory group-by-size (feature 04).
create index production_tenant_size_idx on public.production (tenant_id, size_id);

create trigger set_updated_at
  before update on public.production
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- production_submissions: idempotency ledger for "add" saves (a retried Save never adds twice).
-- ---------------------------------------------------------------------------
create table public.production_submissions (
  tenant_id   uuid        not null references public.tenants (id) on delete cascade,
  -- The client's submissionId.
  id          uuid        not null,
  produced_on date        not null,
  -- Whether the date already had production BEFORE this submit (a replay reports the same toast wording).
  had_before  boolean     not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Scoped to the tenant: one farm's key can never collide with, or probe, another farm's.
  constraint production_submissions_pkey primary key (tenant_id, id)
);

comment on table public.production_submissions is 'Idempotency ledger for log_production, keyed by (tenant, client submissionId).';

create trigger set_updated_at
  before update on public.production_submissions
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants + RLS. The functions are security invoker, so owners need the table grants themselves.
-- ---------------------------------------------------------------------------
revoke all on public.production from anon, authenticated;
grant select, insert, update, delete on public.production to authenticated;

revoke all on public.production_submissions from anon, authenticated;
grant select, insert on public.production_submissions to authenticated;

alter table public.production enable row level security;
alter table public.production_submissions enable row level security;

create policy production_select on public.production
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy production_insert on public.production
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant_id()));

create policy production_update on public.production
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

create policy production_delete on public.production
  for delete to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy production_submissions_select on public.production_submissions
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy production_submissions_insert on public.production_submissions
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant_id()));
