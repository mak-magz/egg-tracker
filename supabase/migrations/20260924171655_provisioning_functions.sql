-- M3 provisioning_functions (docs/features/00-project-scaffold.md §3.2, §3.6)
-- Called ONLY by the local provisioning CLI (server/cli/provision.ts) with the secret/service-role key.
-- EXECUTE is revoked from public/anon/authenticated (Supabase grants it on new public functions by default).

-- ---------------------------------------------------------------------------
-- admin_user_id_by_email: auth user id for an email (case-insensitive), or null.
-- ---------------------------------------------------------------------------
create function public.admin_user_id_by_email(p_email text)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- admin_revoke_sessions: signs a user out everywhere. Deleting sessions cascades to refresh tokens.
-- Returns the number of sessions deleted.
-- ---------------------------------------------------------------------------
create function public.admin_revoke_sessions(p_user_id uuid)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from auth.sessions s where s.user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- provision_farm: creates (or reports / updates) the farm for a user, in one transaction.
--   no membership           -> insert tenant + membership           -> 'created'
--   membership, p_update=f  -> nothing changes                       -> 'unchanged'
--   membership, p_update=t  -> update name (+ eggs_per_tray if given) -> 'updated'
-- When p_eggs_per_tray is null the INSERT omits the column, so the column default applies
-- (the default lives in exactly one place). unique(memberships.user_id) settles concurrent runs:
-- the loser errors and its tenant insert rolls back with it.
-- ---------------------------------------------------------------------------
create function public.provision_farm(
  p_user_id       uuid,
  p_farm_name     text,
  p_eggs_per_tray integer default null,
  p_update        boolean default false
)
  returns table (tenant_id uuid, farm_name text, eggs_per_tray integer, outcome text)
  language plpgsql
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant  uuid;
  v_outcome text;
begin
  if p_user_id is null then
    raise exception 'provision_farm: p_user_id is required' using errcode = '22004';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'provision_farm: no auth user %', p_user_id using errcode = '23503';
  end if;

  select m.tenant_id into v_tenant
  from public.memberships m
  where m.user_id = p_user_id;

  if v_tenant is not null then
    if coalesce(p_update, false) then
      update public.tenants t
        set name = btrim(p_farm_name),
            eggs_per_tray = coalesce(p_eggs_per_tray, t.eggs_per_tray)
        where t.id = v_tenant;
      v_outcome := 'updated';
    else
      v_outcome := 'unchanged';
    end if;
  else
    if p_eggs_per_tray is null then
      insert into public.tenants (name) values (btrim(p_farm_name))
        returning id into v_tenant;
    else
      insert into public.tenants (name, eggs_per_tray) values (btrim(p_farm_name), p_eggs_per_tray)
        returning id into v_tenant;
    end if;
    insert into public.memberships (tenant_id, user_id) values (v_tenant, p_user_id);
    v_outcome := 'created';
  end if;

  return query
    select t.id, t.name, t.eggs_per_tray, v_outcome
    from public.tenants t
    where t.id = v_tenant;
end
$$;

-- ---------------------------------------------------------------------------
-- Service-role only.
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_user_id_by_email(text) from public, anon, authenticated;
revoke execute on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
revoke execute on function public.provision_farm(uuid, text, integer, boolean) from public, anon, authenticated;

grant execute on function public.admin_user_id_by_email(text) to service_role;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;
grant execute on function public.provision_farm(uuid, text, integer, boolean) to service_role;
