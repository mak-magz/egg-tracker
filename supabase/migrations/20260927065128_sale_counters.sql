-- M14 sale_counters (docs/features/04-sales.md §3.1 "M14", §3.8 D1)
--
-- Sale numbers (AC5): a whole number per farm, given by the system when a sale is logged, unique in the farm and
-- NEVER reused (a deleted sale leaves a gap), given in the order sales are LOGGED (not by sale date). A per-tenant
-- counter row, incremented under the same advisory lock (app.lock_tenant_sales, added in M15) that guards the
-- stock-shortfall check, not a Postgres SEQUENCE (one sequence per tenant would be per-tenant DDL, which breaks the
-- shared-tables model this app is built on) and not a count-of-rows (gaps from deletes, and races).

create table public.sale_counters (
  tenant_id   uuid        primary key references public.tenants (id) on delete cascade,
  next_number bigint      not null default 1 check (next_number >= 1),
  updated_at  timestamptz not null default now()
);

comment on table public.sale_counters is
  'One row per farm: the next sale number to assign (AC5). No separate id: tenant_id is the key, like tenants itself.';

create trigger set_updated_at
  before update on public.sale_counters
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seeded the same way sizes is (app.seed_default_sizes / seed_default_sizes_trigger): every new farm gets a
-- counter row, and existing farms are backfilled below.
-- ---------------------------------------------------------------------------
create function app.seed_sale_counter(p_tenant_id uuid)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  insert into public.sale_counters (tenant_id) values (p_tenant_id)
  on conflict do nothing;
end
$$;

comment on function app.seed_sale_counter(uuid) is 'Seeds a farm''s sale counter at 1. Idempotent. Called by the tenants insert trigger.';

create function app.seed_sale_counter_trigger()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  perform app.seed_sale_counter(new.id);
  return null;
end
$$;

revoke all on function app.seed_sale_counter(uuid) from public;
revoke all on function app.seed_sale_counter_trigger() from public;

create trigger seed_sale_counter
  after insert on public.tenants
  for each row execute function app.seed_sale_counter_trigger();

-- ---------------------------------------------------------------------------
-- Grants + RLS. `select`/`update (next_number, updated_at)` only: no insert (seeded by the tenant trigger, and by
-- provision_farm's security definer context exactly as the sizes seed is), no delete.
--
-- Residual risk, accepted (§3.1): a hand-built `update sale_counters set next_number = ...` on the owner's own row
-- could jump or rewind their farm's numbering. It affects only that farm, and rewinding can't corrupt anything: the
-- next create_sale either takes an already-used number (refused by sales_tenant_number_key, a safe 500) or, if
-- truly free, looks like a decision the owner made about their own farm's numbering. Not worth a second lock or a
-- monotonic-only check for v1.
-- ---------------------------------------------------------------------------
revoke all on public.sale_counters from anon, authenticated;
grant select on public.sale_counters to authenticated;
grant update (next_number, updated_at) on public.sale_counters to authenticated;

alter table public.sale_counters enable row level security;

create policy sale_counters_select on public.sale_counters
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy sale_counters_update on public.sale_counters
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

-- Backfill existing farms (as sizes does for AC37).
select app.seed_sale_counter(t.id) from public.tenants t;
