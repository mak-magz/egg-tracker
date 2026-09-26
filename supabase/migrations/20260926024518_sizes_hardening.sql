-- M10 sizes_hardening (security audit of feature 02: M-1, M-2, L-1, L-2)
--
-- M8 and M9 are already applied locally, so this is a NEW migration that replaces functions (create or replace
-- keeps their grants) and adds constraints. Everything stays security invoker with search_path = ''.
--
--   M-1  size_submissions: the ledger name has a length cap (40, the size-name limit; the ledger stores the
--        NORMALISED name), the insert grant is limited to the columns add_size writes, and a BEFORE INSERT trigger
--        caps a farm's ledger at 100 rows, so a direct insert can't grow it without limit. The cap equals the
--        100-size cap of M8: every ledger row belongs to a size that add_size created, and sizes are never
--        deleted, so add_size can never reach it (the 4 seeded sizes have no row). The ledger can't be made
--        writable ONLY through the functions: they are security invoker, so the caller needs the privilege.
--   M-2  Cheap input caps BEFORE any work: a raw name over 200 characters is refused (TM008) before it is
--        normalised, in the size trigger, add_size and rename_size; a reorder array over 100 ids (the size cap)
--        is refused (TM005) before the distinct count. 200 is well above 40, so no real name is affected; the
--        checks after normalising (1 to 40) are unchanged.
--   L-1  sizes_write_guard runs before the RLS WITH CHECK, so on an insert naming ANOTHER farm it used to take
--        that farm's advisory lock before failing. It now raises 42501 first, when the caller is `authenticated`.
--        Provisioning and fixtures run as postgres / service_role and are not affected. The ledger trigger
--        does the same.
--   L-2  sizes.sort_order is capped at 100000 (an owner could write 2147483647 and make the next add_size
--        overflow, 22003). The trigger's "end of the list" value is capped at the same number, and add_size and
--        restore_size compact the order BEFORE computing max + 1, so neither can ever overflow or hit the cap.
--
-- New SQLSTATE: TM016 the farm's size ledger already has 100 rows (direct inserts only; unreachable from the routes).

-- ---------------------------------------------------------------------------
-- L-2. sort_order range. The existing data is compact (0..n-1, n <= 100), so it satisfies the new check.
-- ---------------------------------------------------------------------------
alter table public.sizes drop constraint sizes_sort_order_nonnegative;
alter table public.sizes
  add constraint sizes_sort_order_range check (sort_order between 0 and 100000);

-- ---------------------------------------------------------------------------
-- L-1 + M-2 + L-2. sizes_write_guard, replaced.
-- ---------------------------------------------------------------------------
create or replace function app.sizes_write_guard()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_count bigint;
begin
  if tg_op = 'INSERT' then
    -- L-1: the RLS WITH CHECK runs after this trigger, so refuse another farm's tenant_id BEFORE taking that
    -- farm's lock (an owner who knew its id could otherwise queue behind its writes). Only for `authenticated`:
    -- provisioning, seeding and the test fixtures insert as postgres / service_role.
    if current_user = 'authenticated' and new.tenant_id is distinct from (select app.current_tenant_id()) then
      raise exception 'row is not for the caller''s farm' using errcode = '42501';
    end if;

    -- M-2: a cheap length check before the (regex) normalisation. Real names are 1 to 40 characters.
    if char_length(new.name) > 200 then
      raise exception 'size name is too long' using errcode = 'TM008';
    end if;
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

    -- Position: the end of the farm's list (M9 compacts it around this). Capped at the sort_order limit (L-2),
    -- so a size pushed to the limit by a direct update can't make an insert fail; compaction restores 0..n-1.
    if new.sort_order is null then
      select least(coalesce(max(s.sort_order), -1) + 1, 100000) into new.sort_order
      from public.sizes s where s.tenant_id = new.tenant_id;
    end if;
  else
    if new.tenant_id is distinct from old.tenant_id or new.color_slot is distinct from old.color_slot then
      raise exception 'tenant_id and color_slot are immutable' using errcode = 'TM014';
    end if;
    if new.name is distinct from old.name then
      if char_length(new.name) > 200 then
        raise exception 'size name is too long' using errcode = 'TM008';
      end if;
      new.name := app.normalize_size_name(new.name);
    end if;
  end if;

  return new;
end
$$;

comment on function app.sizes_write_guard() is
  'Trigger: another farm''s tenant_id refused before its lock (42501), raw name over 200 characters refused (TM008), name normalised, colour slot and position assigned, 100-size cap (TM015), tenant_id/color_slot immutable (TM014).';

-- ---------------------------------------------------------------------------
-- M-1. size_submissions: name cap, column-limited insert grant, per-farm row cap.
-- ---------------------------------------------------------------------------
alter table public.size_submissions
  add constraint size_submissions_name_length check (char_length(name) <= 40);

-- created_at and updated_at have defaults; nothing else is ever chosen by the caller.
revoke insert on public.size_submissions from authenticated;
grant insert (tenant_id, id, size_id, name) on public.size_submissions to authenticated;

create function app.size_submissions_guard()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  -- Same order as sizes_write_guard: the farm check comes before the lock (L-1).
  if current_user = 'authenticated' and new.tenant_id is distinct from (select app.current_tenant_id()) then
    raise exception 'row is not for the caller''s farm' using errcode = '42501';
  end if;

  -- Serialise with the size writes, so two direct inserts can't both pass the count and exceed the cap.
  perform app.lock_tenant_sizes(new.tenant_id);

  if (select count(*) from public.size_submissions s where s.tenant_id = new.tenant_id) >= 100 then
    raise exception 'too many size submissions' using errcode = 'TM016';
  end if;
  return new;
end
$$;

comment on function app.size_submissions_guard() is
  'Trigger: another farm''s tenant_id refused before its lock (42501); a farm''s size ledger holds at most 100 rows (TM016).';

revoke all on function app.size_submissions_guard() from public;

create trigger size_submissions_guard
  before insert on public.size_submissions
  for each row execute function app.size_submissions_guard();

-- ---------------------------------------------------------------------------
-- M-2 + L-2. The size functions, replaced (same signatures, so the M9 grants stay).
-- ---------------------------------------------------------------------------

-- add_size: raw name capped before normalising; the order is compacted before the new size is added.
create or replace function public.add_size(p_tenant_id uuid, p_submission_id uuid, p_name text)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_name  text;
  v_prev  record;
  v_match record;
  v_id    uuid;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_submission_id is null then
    raise exception 'submission id is required' using errcode = 'TM005';
  end if;
  -- M-2: cheap cap before any work (the lock, the regex).
  if char_length(p_name) > 200 then
    raise exception 'size name must be 1 to 40 characters' using errcode = 'TM008';
  end if;
  perform app.lock_tenant_sizes(p_tenant_id);

  v_name := app.normalize_size_name(p_name);
  if v_name is null or v_name = '' or char_length(v_name) > 40 then
    raise exception 'size name must be 1 to 40 characters' using errcode = 'TM008';
  end if;

  -- A replay (a retry after a lost response) writes nothing and returns the first size.
  select s.size_id, s.name into v_prev
  from public.size_submissions s
  where s.tenant_id = p_tenant_id and s.id = p_submission_id;
  if found then
    if lower(v_prev.name) <> lower(v_name) then
      raise exception 'submission id was used with another name' using errcode = 'TM013';
    end if;
    return jsonb_build_object('changedId', v_prev.size_id, 'replayed', true);
  end if;

  select z.id, z.name, (z.archived_at is not null) as archived into v_match
  from public.sizes z
  where z.tenant_id = p_tenant_id and lower(btrim(z.name)) = lower(v_name);
  if found then
    raise exception 'a size with this name exists'
      using errcode = 'TM009',
            detail = jsonb_build_object('id', v_match.id, 'name', v_match.name, 'archived', v_match.archived)::text;
  end if;

  -- L-2: settle sort_order to 0..n-1 first, so the trigger's max + 1 is small whatever an owner wrote directly.
  perform app.compact_size_order(p_tenant_id);

  -- The M8 trigger assigns colour slot and position (or TM015). If anything below raises, the ledger row
  -- rolls back with the size, so a retry after a REFUSED add re-evaluates.
  insert into public.sizes (tenant_id, name) values (p_tenant_id, v_name) returning id into v_id;
  insert into public.size_submissions (tenant_id, id, size_id, name) values (p_tenant_id, p_submission_id, v_id, v_name);
  perform app.compact_size_order(p_tenant_id);

  return jsonb_build_object('changedId', v_id, 'replayed', false);
end
$$;

-- rename_size: raw name capped before normalising.
create or replace function public.rename_size(p_tenant_id uuid, p_size_id uuid, p_name text)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_name text;
  v_size record;
begin
  perform app.assert_tenant(p_tenant_id);
  -- M-2: cheap cap before any work (the lock, the regex).
  if char_length(p_name) > 200 then
    raise exception 'size name must be 1 to 40 characters' using errcode = 'TM008';
  end if;
  perform app.lock_tenant_sizes(p_tenant_id);

  v_name := app.normalize_size_name(p_name);
  if v_name is null or v_name = '' or char_length(v_name) > 40 then
    raise exception 'size name must be 1 to 40 characters' using errcode = 'TM008';
  end if;

  select z.name, z.archived_at into v_size
  from public.sizes z where z.tenant_id = p_tenant_id and z.id = p_size_id;
  if not found then
    raise exception 'unknown size' using errcode = 'TM011';
  end if;
  if v_size.archived_at is not null then
    raise exception 'size is archived' using errcode = 'TM012';
  end if;

  -- Another size only: a case- or spacing-only change to itself is fine (AC7).
  select z.id, z.name, (z.archived_at is not null) as archived into v_size
  from public.sizes z
  where z.tenant_id = p_tenant_id and z.id <> p_size_id and lower(btrim(z.name)) = lower(v_name);
  if found then
    raise exception 'a size with this name exists'
      using errcode = 'TM009',
            detail = jsonb_build_object('id', v_size.id, 'name', v_size.name, 'archived', v_size.archived)::text;
  end if;

  -- The exact same name is a no-op (a retry of a rename that landed).
  update public.sizes z set name = v_name
  where z.tenant_id = p_tenant_id and z.id = p_size_id and z.name <> v_name;

  return jsonb_build_object('changedId', p_size_id);
end
$$;

-- reorder_sizes: the array is capped before the distinct count. A farm has at most 100 sizes (M8), so a longer
-- list can never be its active set.
create or replace function public.reorder_sizes(p_tenant_id uuid, p_size_ids uuid[])
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_current uuid[];
begin
  perform app.assert_tenant(p_tenant_id);
  if cardinality(p_size_ids) > 100 then
    raise exception 'malformed order' using errcode = 'TM005';
  end if;
  if p_size_ids is null
     or array_position(p_size_ids, null) is not null
     or (select count(distinct u.id) from unnest(p_size_ids) u(id)) <> cardinality(p_size_ids) then
    raise exception 'malformed order' using errcode = 'TM005';
  end if;
  perform app.lock_tenant_sizes(p_tenant_id);

  -- Exactly the farm's current active set (someone added, archived or restored in between, or an archived or
  -- foreign id was sent). No duplicates, so equal counts plus every id active is the same set.
  if cardinality(p_size_ids) <> (select count(*) from public.sizes z where z.tenant_id = p_tenant_id and z.archived_at is null)
     or exists (select 1 from unnest(p_size_ids) u(id)
                where not exists (select 1 from public.sizes z
                                  where z.tenant_id = p_tenant_id and z.id = u.id and z.archived_at is null)) then
    raise exception 'sizes changed' using errcode = 'TM012';
  end if;

  select array_agg(z.id order by z.sort_order, z.name, z.id) into v_current
  from public.sizes z where z.tenant_id = p_tenant_id and z.archived_at is null;
  if v_current = p_size_ids then
    return jsonb_build_object('changed', false);
  end if;

  update public.sizes z set sort_order = (u.pos - 1)::integer
  from unnest(p_size_ids) with ordinality u(id, pos)
  where z.tenant_id = p_tenant_id and z.id = u.id and z.sort_order <> (u.pos - 1)::integer;
  perform app.compact_size_order(p_tenant_id);

  return jsonb_build_object('changed', true);
end
$$;

-- restore_size: the order is compacted before max + 1 is computed (L-2).
create or replace function public.restore_size(p_tenant_id uuid, p_size_id uuid)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_size record;
begin
  perform app.assert_tenant(p_tenant_id);
  perform app.lock_tenant_sizes(p_tenant_id);

  select z.archived_at into v_size
  from public.sizes z where z.tenant_id = p_tenant_id and z.id = p_size_id;
  if not found then
    raise exception 'unknown size' using errcode = 'TM011';
  end if;
  if v_size.archived_at is null then
    raise exception 'size is not archived' using errcode = 'TM012';
  end if;

  perform app.compact_size_order(p_tenant_id);

  update public.sizes z
  set archived_at = null,
      sort_order = (select coalesce(max(m.sort_order), -1) + 1 from public.sizes m where m.tenant_id = p_tenant_id)
  where z.tenant_id = p_tenant_id and z.id = p_size_id;
  perform app.compact_size_order(p_tenant_id);

  return jsonb_build_object('changedId', p_size_id);
end
$$;
