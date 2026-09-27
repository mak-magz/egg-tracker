-- M13 clients_functions (docs/features/03-clients.md §3.1 "M13", §3.8 D3, D4, D5, D6, D9)
--
-- Four client writes, each ONE security invoker function = one transaction per rpc call (all-or-nothing), and RLS
-- applies exactly as for a direct query. Each takes p_tenant_id, which the repository fills from the server context
-- (TenantDb.rpc, never from the request), and first asserts it equals app.current_tenant_id() (TM006). Then it takes
-- the per-farm clients lock, so every client write for a farm is serialised (two adds can't both pass the 500 count
-- or take the same name; a version check can't race an update). The M12 trigger and constraints stay the guarantee
-- for every other write path; these functions add the friendly errors, idempotency and conflict detection.
--
-- No exception message or detail below ever holds a name, phone or price (AC29): the messages are fixed strings and
-- TM020's DETAIL is {"id","archived"} only. The repository reads the other client's name BY ID for the 409 body.
--
-- SQLSTATEs (see M12 for TM017-TM019, TM021, TM025, TM026):
--   TM005 malformed input (null submission id, client id or version)
--   TM006 p_tenant_id is not the caller's tenant (server bug)
--   TM020 another client of the farm (inactive too) has the name, ignoring case and spacing. DETAIL = {"id","archived"}
--   TM022 update_client: the version isn't the one the form was opened with and the request would change something
--   TM023 the id isn't one of this farm's clients (another farm's id looks exactly the same)
--   TM024 the same submission id was used with a different payload
--
-- Each function returns only what it changed; the repository re-reads that one client through one mapper.

-- add_client (AC8-AC16, AC33): { clientId, replayed }. Idempotent per submission id.
create function public.add_client(
  p_tenant_id uuid,
  p_submission_id uuid,
  p_name text,
  p_phone text default null,
  p_default_price numeric default null
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_name  text;
  v_phone text;
  v_price numeric;
  v_hash  text;
  v_prev  record;
  v_match record;
  v_id    uuid;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_submission_id is null then
    raise exception 'submission id is required' using errcode = 'TM005';
  end if;

  -- Cheap cap before any work (the regex), then the rules on the normalised values (TM017-TM019).
  perform app.assert_client_input_size(p_name, p_phone);
  v_name := app.normalize_client_name(p_name);
  v_phone := app.normalize_client_phone(p_phone);
  perform app.assert_client_fields(v_name, v_phone, p_default_price);
  v_price := round(p_default_price, 2);
  v_hash := app.client_payload_hash(v_name, v_phone, v_price);

  perform app.lock_tenant_clients(p_tenant_id);

  -- A replay (a retry after a lost response) writes nothing and returns the first client. It is checked BEFORE the
  -- name, so a retry can never fail as "already exists" for the client it just created (AC15).
  select s.client_id, s.payload_hash into v_prev
  from public.client_submissions s
  where s.tenant_id = p_tenant_id and s.id = p_submission_id;
  if found then
    if v_prev.payload_hash <> v_hash then
      raise exception 'submission id was used with another payload' using errcode = 'TM024';
    end if;
    return jsonb_build_object('clientId', v_prev.client_id, 'replayed', true);
  end if;

  select c.id, (c.archived_at is not null) as archived into v_match
  from public.clients c
  where c.tenant_id = p_tenant_id and lower(c.name) = lower(v_name);
  if found then
    raise exception 'a client with this name exists'
      using errcode = 'TM020',
            detail = jsonb_build_object('id', v_match.id, 'archived', v_match.archived)::text;
  end if;

  -- The M12 trigger enforces the 500 cap (TM021). If anything below raises, the ledger row rolls back with the
  -- client, so a retry after a REFUSED add re-evaluates.
  insert into public.clients (tenant_id, name, phone, default_price)
  values (p_tenant_id, v_name, v_phone, v_price)
  returning id into v_id;
  insert into public.client_submissions (tenant_id, id, client_id, payload_hash)
  values (p_tenant_id, p_submission_id, v_id, v_hash);

  return jsonb_build_object('clientId', v_id, 'replayed', false);
end
$$;

-- update_client (AC18, AC19): { clientId, changed }. REPLACES the three fields (null clears phone or price).
create function public.update_client(
  p_tenant_id uuid,
  p_client_id uuid,
  p_version bigint,
  p_name text,
  p_phone text default null,
  p_default_price numeric default null
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_name  text;
  v_phone text;
  v_price numeric;
  v_cur   record;
  v_match record;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_client_id is null or p_version is null then
    raise exception 'client id and version are required' using errcode = 'TM005';
  end if;

  perform app.assert_client_input_size(p_name, p_phone);
  v_name := app.normalize_client_name(p_name);
  v_phone := app.normalize_client_phone(p_phone);
  perform app.assert_client_fields(v_name, v_phone, p_default_price);
  v_price := round(p_default_price, 2);

  perform app.lock_tenant_clients(p_tenant_id);

  select c.name, c.phone, c.default_price, c.version into v_cur
  from public.clients c
  where c.tenant_id = p_tenant_id and c.id = p_client_id;
  if not found then
    raise exception 'unknown client' using errcode = 'TM023';
  end if;

  -- The name is compared exactly (case-sensitive) for "did it change": a capitalisation change is a real change.
  if v_cur.name = v_name and v_cur.phone is not distinct from v_phone and v_cur.default_price is not distinct from v_price then
    -- Nothing to write, whatever the version says: a retry of an edit whose reply was lost, or the same edit made
    -- elsewhere (D5). No version bump, so an open form of this client isn't made stale by a no-op.
    return jsonb_build_object('clientId', p_client_id, 'changed', false);
  end if;

  -- The request would change something, so it must have been made from the current version (AC19).
  if v_cur.version <> p_version then
    raise exception 'client was changed elsewhere' using errcode = 'TM022';
  end if;

  -- Another client only: a case- or spacing-only change to its own name is fine (AC11, AC18).
  select c.id, (c.archived_at is not null) as archived into v_match
  from public.clients c
  where c.tenant_id = p_tenant_id and c.id <> p_client_id and lower(c.name) = lower(v_name);
  if found then
    raise exception 'a client with this name exists'
      using errcode = 'TM020',
            detail = jsonb_build_object('id', v_match.id, 'archived', v_match.archived)::text;
  end if;

  -- The M12 trigger normalises again, validates, and bumps the version.
  update public.clients c
  set name = v_name, phone = v_phone, default_price = v_price
  where c.tenant_id = p_tenant_id and c.id = p_client_id;

  return jsonb_build_object('clientId', p_client_id, 'changed', true);
end
$$;

-- archive_client (AC20): { clientId, changed }. "Mark inactive". Sets only archived_at. Always allowed (AC34: never
-- looks at sales). Already inactive counts as done (D6): nothing is written and the version doesn't move.
create function public.archive_client(p_tenant_id uuid, p_client_id uuid)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur record;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_client_id is null then
    raise exception 'client id is required' using errcode = 'TM005';
  end if;
  perform app.lock_tenant_clients(p_tenant_id);

  select c.archived_at into v_cur
  from public.clients c where c.tenant_id = p_tenant_id and c.id = p_client_id;
  if not found then
    raise exception 'unknown client' using errcode = 'TM023';
  end if;
  if v_cur.archived_at is not null then
    return jsonb_build_object('clientId', p_client_id, 'changed', false);
  end if;

  update public.clients c set archived_at = now() where c.tenant_id = p_tenant_id and c.id = p_client_id;
  return jsonb_build_object('clientId', p_client_id, 'changed', true);
end
$$;

-- restore_client (AC20): { clientId, changed }. "Mark active". Name, phone and price untouched. Can't clash on name
-- (names are unique across inactive clients too), so there is no TM020 here.
create function public.restore_client(p_tenant_id uuid, p_client_id uuid)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur record;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_client_id is null then
    raise exception 'client id is required' using errcode = 'TM005';
  end if;
  perform app.lock_tenant_clients(p_tenant_id);

  select c.archived_at into v_cur
  from public.clients c where c.tenant_id = p_tenant_id and c.id = p_client_id;
  if not found then
    raise exception 'unknown client' using errcode = 'TM023';
  end if;
  if v_cur.archived_at is null then
    return jsonb_build_object('clientId', p_client_id, 'changed', false);
  end if;

  update public.clients c set archived_at = null where c.tenant_id = p_tenant_id and c.id = p_client_id;
  return jsonb_build_object('clientId', p_client_id, 'changed', true);
end
$$;

revoke execute on function public.add_client(uuid, uuid, text, text, numeric) from public, anon;
revoke execute on function public.update_client(uuid, uuid, bigint, text, text, numeric) from public, anon;
revoke execute on function public.archive_client(uuid, uuid) from public, anon;
revoke execute on function public.restore_client(uuid, uuid) from public, anon;

grant execute on function public.add_client(uuid, uuid, text, text, numeric) to authenticated;
grant execute on function public.update_client(uuid, uuid, bigint, text, text, numeric) to authenticated;
grant execute on function public.archive_client(uuid, uuid) to authenticated;
grant execute on function public.restore_client(uuid, uuid) to authenticated;
