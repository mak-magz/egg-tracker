-- M9 sizes_functions (docs/features/02-farm-settings.md §3.1 "M9", §3.8 D3, D4, D6, D11)
--
-- Five size writes, each ONE security invoker function = one transaction per rpc call (all-or-nothing) and RLS
-- applies exactly as for a direct query. Each takes p_tenant_id, which the repository fills from the server
-- context (TenantDb.rpc, never from the request), and first asserts it equals app.current_tenant_id() (TM006).
-- Then it takes the per-farm sizes lock, so every size write for a farm is serialised and each function sees a
-- settled list. The M8 triggers stay the guarantee for every other write path; these functions add the friendly
-- errors, idempotency and conflict detection on top.
--
-- Conflict detection (AC20, D3): no version token. Each change asserts the state it depends on, under the lock:
-- rename and archive need an ACTIVE size, restore an ARCHIVED one, reorder the EXACT active set, and every
-- change needs the size to exist.
--
-- Custom SQLSTATEs (continuing M6's TM001-TM007 and M8's TM010, TM014, TM015):
--   TM005 malformed input (null / duplicate ids in reorder, null submission id)
--   TM006 p_tenant_id is not the caller's tenant (server bug)
--   TM008 name blank (or null) or over 40 characters after normalising
--   TM009 another size of the farm (archived too) has the name, ignoring case. DETAIL = {"id","name","archived"}
--   TM010 archiving would leave no active size (also the M8 trigger)
--   TM011 the size id isn't one of this farm's sizes
--   TM012 the size isn't in the state the change needs, or reorder's ids aren't exactly the active set
--   TM013 the same submission id was used with a different name
--
-- Each function returns only what it changed; the repository re-reads the whole list (one mapper, one order).

-- add_size (AC3, AC4, AC5, AC18): { changedId, replayed }. Idempotent per submission id.
create function public.add_size(p_tenant_id uuid, p_submission_id uuid, p_name text)
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

  -- The M8 trigger assigns colour slot and position (or TM015). If anything below raises, the ledger row
  -- rolls back with the size, so a retry after a REFUSED add re-evaluates.
  insert into public.sizes (tenant_id, name) values (p_tenant_id, v_name) returning id into v_id;
  insert into public.size_submissions (tenant_id, id, size_id, name) values (p_tenant_id, p_submission_id, v_id, v_name);
  perform app.compact_size_order(p_tenant_id);

  return jsonb_build_object('changedId', v_id, 'replayed', false);
end
$$;

-- rename_size (AC4, AC6, AC7): { changedId }. Touches no egg count, colour or position.
create function public.rename_size(p_tenant_id uuid, p_size_id uuid, p_name text)
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

-- reorder_sizes (AC8-AC10): p_size_ids is the FULL wanted order of the ACTIVE sizes. { changed }.
-- A retry with the same order is a no-op; a stale list is refused (TM012), never applied as a wrong move.
create function public.reorder_sizes(p_tenant_id uuid, p_size_ids uuid[])
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_current uuid[];
begin
  perform app.assert_tenant(p_tenant_id);
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

-- archive_size (AC11-AC14): { changedId }. Sets only archived_at; nothing in production is touched.
create function public.archive_size(p_tenant_id uuid, p_size_id uuid)
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
  if v_size.archived_at is not null then
    raise exception 'size is already archived' using errcode = 'TM012';
  end if;

  -- The friendly pre-check; the M8 trigger is the guarantee for every path.
  if not exists (select 1 from public.sizes z
                 where z.tenant_id = p_tenant_id and z.id <> p_size_id and z.archived_at is null) then
    raise exception 'a farm must keep at least one active size' using errcode = 'TM010';
  end if;

  update public.sizes z set archived_at = now() where z.tenant_id = p_tenant_id and z.id = p_size_id;
  perform app.compact_size_order(p_tenant_id);

  return jsonb_build_object('changedId', p_size_id);
end
$$;

-- restore_size (AC16): { changedId }. Active again, last among the active ones; name and colour untouched.
create function public.restore_size(p_tenant_id uuid, p_size_id uuid)
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

  update public.sizes z
  set archived_at = null,
      sort_order = (select coalesce(max(m.sort_order), -1) + 1 from public.sizes m where m.tenant_id = p_tenant_id)
  where z.tenant_id = p_tenant_id and z.id = p_size_id;
  perform app.compact_size_order(p_tenant_id);

  return jsonb_build_object('changedId', p_size_id);
end
$$;

revoke execute on function public.add_size(uuid, uuid, text) from public, anon;
revoke execute on function public.rename_size(uuid, uuid, text) from public, anon;
revoke execute on function public.reorder_sizes(uuid, uuid[]) from public, anon;
revoke execute on function public.archive_size(uuid, uuid) from public, anon;
revoke execute on function public.restore_size(uuid, uuid) from public, anon;

grant execute on function public.add_size(uuid, uuid, text) to authenticated;
grant execute on function public.rename_size(uuid, uuid, text) to authenticated;
grant execute on function public.reorder_sizes(uuid, uuid[]) to authenticated;
grant execute on function public.archive_size(uuid, uuid) to authenticated;
grant execute on function public.restore_size(uuid, uuid) to authenticated;
