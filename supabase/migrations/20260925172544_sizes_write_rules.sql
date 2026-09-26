-- M8 sizes_write_rules (docs/features/02-farm-settings.md §3.1 "M8", §3.2, §3.8 D1, D2, D5, D7, D10, D11)
--
-- Owners now WRITE `sizes` (the M9 functions are security invoker, so the caller needs the privilege), and the
-- browser holds the same JWT, so PostgREST could reach the table directly. Every rule that matters therefore
-- lives here, in the database, for EVERY write path:
--   * column-level grants: an owner can never write tenant_id, color_slot, id, or delete a size;
--   * a BEFORE trigger: normalises the name, assigns colour slot and position, caps a farm at 100 sizes;
--   * an AFTER statement trigger: a farm can never be left with no active size.
--
-- Custom SQLSTATEs (continuing M6's TM001-TM007; the M9 functions add TM008-TM013):
--   TM010 archiving would leave the farm with no active size (M9 pre-check AND the trigger below)
--   TM014 tenant_id or color_slot changed (trigger)
--   TM015 the farm already has 100 sizes (archived included; sizes are never deleted)

-- ---------------------------------------------------------------------------
-- 1. Helpers (schema app: not exposed by PostgREST). They run as the caller, so `authenticated` may execute them.
-- ---------------------------------------------------------------------------

-- The ONE SQL definition of AC4's name rule. Twin of normalizeSizeName in shared/utils/size-name.ts:
--   Unicode NFC, then every run of whitespace becomes one space, then the ends are trimmed.
-- The whitespace class is spelled out (not \s) so it matches JavaScript's `\s` whatever the database locale:
-- \t \n \v \f \r, space, NBSP, U+1680, U+2000-200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF.
create function app.normalize_size_name(p_name text)
  returns text
  language sql
  immutable
  security invoker
  set search_path = ''
as $$
  select btrim(regexp_replace(
    normalize(p_name, nfc),
    '[\t\n\v\f\r    -     　﻿]+',
    ' ', 'g'))
$$;

comment on function app.normalize_size_name(text) is
  'Size-name rule (AC4): NFC, whitespace runs collapsed to one space, ends trimmed. Twin of normalizeSizeName().';

-- Serialises size writes for one farm for the length of the (short) transaction. The key prefix differs from
-- the production-day lock ('<tenant>:<date>'), so the two never collide. Re-entrant within one transaction.
create function app.lock_tenant_sizes(p_tenant_id uuid)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('sizes:' || p_tenant_id::text, 0));
end
$$;

-- Rewrites sort_order to 0..n-1: active sizes first in the owner's order, archived ones after them in their
-- previous relative order. Only rows whose value differs are touched, so updated_at doesn't move on the rest.
create function app.compact_size_order(p_tenant_id uuid)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  update public.sizes s
  set sort_order = r.rn
  from (
    select z.id,
           (row_number() over (order by (z.archived_at is not null), z.sort_order, z.name, z.id) - 1)::integer as rn
    from public.sizes z
    where z.tenant_id = p_tenant_id
  ) r
  where s.id = r.id and s.tenant_id = p_tenant_id and s.sort_order <> r.rn;
end
$$;

revoke all on function app.normalize_size_name(text) from public;
revoke all on function app.lock_tenant_sizes(uuid) from public;
revoke all on function app.compact_size_order(uuid) from public;

grant execute on function app.normalize_size_name(text) to authenticated;
grant execute on function app.lock_tenant_sizes(uuid) to authenticated;
grant execute on function app.compact_size_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Existing names, then the constraint. (The unique index sizes_tenant_name_key and sizes_name_length stay.)
-- ---------------------------------------------------------------------------
update public.sizes
set name = app.normalize_size_name(name)
where name <> app.normalize_size_name(name);

alter table public.sizes
  add constraint sizes_name_normalised check (name = app.normalize_size_name(name));

-- ---------------------------------------------------------------------------
-- 3. sizes_write_guard: BEFORE INSERT OR UPDATE, every write path.
-- ---------------------------------------------------------------------------
create function app.sizes_write_guard()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_count bigint;
begin
  if tg_op = 'INSERT' then
    new.name := app.normalize_size_name(new.name);

    -- Queue behind any other size write of this farm BEFORE computing slot and position, so two adds
    -- can't race to the same colour. (If a multi-row insert can't see its own earlier rows, the unique
    -- (tenant_id, color_slot) key turns that into a clean 23505, never a repeated colour.)
    perform app.lock_tenant_sizes(new.tenant_id);

    select count(*) into v_count from public.sizes s where s.tenant_id = new.tenant_id;
    if v_count >= 100 then
      raise exception 'too many sizes' using errcode = 'TM015';
    end if;

    -- Colour: the smallest non-negative slot no size of the farm (archived included) has ever used. Slots
    -- 0-9 are the ten palette colours (none red), 10+ repeat them dashed, and a slot is never reused, so no
    -- other size's colour ever changes (AC5, UX R2). An explicit slot (the seed function) is honoured.
    if new.color_slot is null then
      select min(g)::smallint into new.color_slot
      from generate_series(0, v_count::integer) g
      where not exists (select 1 from public.sizes s where s.tenant_id = new.tenant_id and s.color_slot = g);
    end if;

    -- Position: the end of the farm's list (M9 compacts it afterwards).
    if new.sort_order is null then
      select coalesce(max(s.sort_order), -1) + 1 into new.sort_order
      from public.sizes s where s.tenant_id = new.tenant_id;
    end if;
  else
    if new.tenant_id is distinct from old.tenant_id or new.color_slot is distinct from old.color_slot then
      raise exception 'tenant_id and color_slot are immutable' using errcode = 'TM014';
    end if;
    if new.name is distinct from old.name then
      new.name := app.normalize_size_name(new.name);
    end if;
  end if;

  return new;
end
$$;

comment on function app.sizes_write_guard() is
  'Trigger: name normalised, colour slot and position assigned, 100-size cap (TM015), tenant_id/color_slot immutable (TM014).';

revoke all on function app.sizes_write_guard() from public;

create trigger sizes_write_guard
  before insert or update on public.sizes
  for each row execute function app.sizes_write_guard();

-- ---------------------------------------------------------------------------
-- 4. sizes_keep_one_active: AFTER UPDATE, per STATEMENT (transition tables need a statement trigger with no
-- column list). A bulk `update ... set archived_at = now()` must not archive everything, and a row trigger
-- can't reliably see its own statement's other rows. The lock makes two phones archiving the last two sizes at
-- once queue: the second re-counts with a fresh snapshot (READ COMMITTED) and is refused.
-- ---------------------------------------------------------------------------
create function app.sizes_keep_one_active()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  for v_tenant in
    select distinct n.tenant_id
    from new_rows n
    join old_rows o on o.id = n.id
    where o.archived_at is null and n.archived_at is not null
    order by 1
  loop
    perform app.lock_tenant_sizes(v_tenant);
    if not exists (select 1 from public.sizes s where s.tenant_id = v_tenant and s.archived_at is null) then
      raise exception 'a farm must keep at least one active size' using errcode = 'TM010';
    end if;
  end loop;
  return null;
end
$$;

comment on function app.sizes_keep_one_active() is
  'Trigger: a statement that archives sizes may not leave a farm with no active size (TM010).';

revoke all on function app.sizes_keep_one_active() from public;

create trigger sizes_keep_one_active
  after update on public.sizes
  referencing old table as old_rows new table as new_rows
  for each statement execute function app.sizes_keep_one_active();

-- ---------------------------------------------------------------------------
-- 5. size_submissions: idempotency ledger for add_size (twin of production_submissions).
-- ---------------------------------------------------------------------------
create table public.size_submissions (
  tenant_id  uuid        not null references public.tenants (id) on delete cascade,
  -- The client's submissionId.
  id         uuid        not null,
  size_id    uuid        not null,
  -- The NORMALISED requested name, so a replay with a different name is refused (TM013), not answered with
  -- the first size (security audit L1).
  name       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Scoped to the tenant: one farm's key can never collide with, or probe, another farm's.
  constraint size_submissions_pkey primary key (tenant_id, id),
  constraint size_submissions_size_fk foreign key (tenant_id, size_id) references public.sizes (tenant_id, id)
);

comment on table public.size_submissions is 'Idempotency ledger for add_size, keyed by (tenant, client submissionId).';

create trigger set_updated_at
  before update on public.size_submissions
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Grants and policies.
-- ---------------------------------------------------------------------------
revoke all on public.sizes from anon, authenticated;
grant select on public.sizes to authenticated;
-- Nothing else is insertable: the trigger fills position and colour, so an owner can't pick a colour or a slot.
grant insert (tenant_id, name) on public.sizes to authenticated;
-- Rename, reorder, archive, restore. Never tenant_id, color_slot, id, created_at. updated_at is listed so the
-- generic isolation check 4 (update ... set updated_at = updated_at) still has teeth; the trigger overwrites it.
grant update (name, sort_order, archived_at, updated_at) on public.sizes to authenticated;
-- No delete, truncate, references or trigger privilege, and no delete policy (two locks: AC25).

create policy sizes_insert on public.sizes
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant_id()));

create policy sizes_update on public.sizes
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

revoke all on public.size_submissions from anon, authenticated;
grant select, insert on public.size_submissions to authenticated;

alter table public.size_submissions enable row level security;

create policy size_submissions_select on public.size_submissions
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy size_submissions_insert on public.size_submissions
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant_id()));
