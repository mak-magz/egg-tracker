-- M6 production_functions (docs/features/01-production-logging.md §3.1 "M6", §3.8 D5, D6, D7, D11)
--
-- Every write is ONE security invoker function = one transaction per rpc call, so a Save is all-or-nothing
-- (AC13, AC26) and RLS applies exactly as for a direct query. Each public function takes p_tenant_id, which the
-- repository layer fills from the server context (TenantDb.rpc, never from the request), and first asserts it
-- equals app.current_tenant_id() (TM006): "RLS AND the repository filter", both must agree.
--
-- Custom SQLSTATEs (PostgREST returns them as HTTP 400 with code = the SQLSTATE; `PT...` avoided on purpose):
--   TM001 size not one of this farm's allowed sizes      TM002 date after UTC today + 1 (or null)
--   TM003 day has no production (replace/delete)          TM004 nothing above zero entered
--   TM005 malformed amounts (lengths, nulls, negatives, duplicate size)
--   TM006 p_tenant_id is not the caller's tenant (server bug)

-- ---------------------------------------------------------------------------
-- Private helpers (app schema: not exposed by PostgREST)
-- ---------------------------------------------------------------------------
create function app.assert_tenant(p_tenant_id uuid)
  returns void
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  if p_tenant_id is null or p_tenant_id is distinct from (select app.current_tenant_id()) then
    raise exception 'tenant mismatch' using errcode = 'TM006';
  end if;
end
$$;

comment on function app.assert_tenant(uuid) is 'Raises TM006 unless p_tenant_id is the signed-in user''s tenant.';

-- Days in [p_from, p_to] (null = open-ended) as ONE jsonb value (so PostgREST max_rows can't truncate it):
-- { hasAny, days: [ { date, good: [ { sizeId, eggs } ] (farm size order, eggs > 0 only), goodTotal, rejects } ] }
-- newest first. hasAny ignores the range (AC27 vs AC28).
create function app.production_days_json(p_tenant_id uuid, p_from date, p_to date)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  return (
    with d as (
      select
        p.produced_on,
        coalesce(
          jsonb_agg(jsonb_build_object('sizeId', p.size_id, 'eggs', p.eggs)
                    order by s.sort_order, s.name, s.id) filter (where p.quality = 'good'),
          '[]'::jsonb) as good,
        coalesce(sum(p.eggs) filter (where p.quality = 'good'), 0) as good_total,
        coalesce(sum(p.eggs) filter (where p.quality = 'reject'), 0) as rejects
      from public.production p
      left join public.sizes s on s.tenant_id = p.tenant_id and s.id = p.size_id
      where p.tenant_id = p_tenant_id
        and (p_from is null or p.produced_on >= p_from)
        and (p_to is null or p.produced_on <= p_to)
      group by p.produced_on
    )
    select jsonb_build_object(
      'hasAny', exists (select 1 from public.production x where x.tenant_id = p_tenant_id),
      'days', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'date', to_char(d.produced_on, 'YYYY-MM-DD'),
                  'good', d.good,
                  'goodTotal', d.good_total,
                  'rejects', d.rejects)
                order by d.produced_on desc)
         from d),
        '[]'::jsonb))
  );
end
$$;

comment on function app.production_days_json(uuid, date, date) is 'Production days in a range as one jsonb value, newest first.';

-- One day's json, or null when the day has no production.
create function app.production_day_json(p_tenant_id uuid, p_day date)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  return app.production_days_json(p_tenant_id, p_day, p_day) -> 'days' -> 0;
end
$$;

-- Shared input validation for log/replace (TM002, TM005, TM004, in that order).
create function app.check_production_input(p_day date, p_size_ids uuid[], p_eggs integer[], p_rejects integer)
  returns void
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  if p_day is null or p_day > (now() at time zone 'utc')::date + 1 then
    raise exception 'date is in the future' using errcode = 'TM002';
  end if;

  if p_size_ids is null or p_eggs is null or p_rejects is null
     or cardinality(p_size_ids) <> cardinality(p_eggs)
     or array_position(p_size_ids, null) is not null
     or array_position(p_eggs, null) is not null
     or p_rejects < 0
     or exists (select 1 from unnest(p_eggs) e where e < 0) then
    raise exception 'malformed amounts' using errcode = 'TM005';
  end if;

  if exists (select 1 from unnest(p_size_ids, p_eggs) u(size_id, eggs)
             where u.eggs > 0 group by u.size_id having count(*) > 1) then
    raise exception 'duplicate size' using errcode = 'TM005';
  end if;

  if p_rejects = 0 and not exists (select 1 from unnest(p_eggs) e where e > 0) then
    raise exception 'nothing entered' using errcode = 'TM004';
  end if;
end
$$;

-- Serialises writes to one farm-day for the length of the (short) transaction.
create function app.lock_production_day(p_tenant_id uuid, p_day date)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || to_char(p_day, 'YYYY-MM-DD'), 0));
end
$$;

revoke all on function app.assert_tenant(uuid) from public;
revoke all on function app.production_days_json(uuid, date, date) from public;
revoke all on function app.production_day_json(uuid, date) from public;
revoke all on function app.check_production_input(date, uuid[], integer[], integer) from public;
revoke all on function app.lock_production_day(uuid, date) from public;

grant execute on function app.assert_tenant(uuid) to authenticated;
grant execute on function app.production_days_json(uuid, date, date) to authenticated;
grant execute on function app.production_day_json(uuid, date) to authenticated;
grant execute on function app.check_production_input(date, uuid[], integer[], integer) to authenticated;
grant execute on function app.lock_production_day(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

-- GET days in a range. { hasAny, days }.
create function public.production_days(p_tenant_id uuid, p_from date default null, p_to date default null)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  perform app.assert_tenant(p_tenant_id);
  return app.production_days_json(p_tenant_id, p_from, p_to);
end
$$;

-- Add to the day (AC3, AC8, AC12, AC13). { day, hadBefore, replayed }.
create function public.log_production(
  p_tenant_id     uuid,
  p_submission_id uuid,
  p_day           date,
  p_size_ids      uuid[],
  p_eggs          integer[],
  p_rejects       integer
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_had      boolean;
  v_n        bigint;
  v_prev_day date;
  v_prev_had boolean;
begin
  perform app.assert_tenant(p_tenant_id);
  perform app.check_production_input(p_day, p_size_ids, p_eggs, p_rejects);
  if p_submission_id is null then
    raise exception 'submission id is required' using errcode = 'TM005';
  end if;

  perform app.lock_production_day(p_tenant_id, p_day);

  -- Idempotency: a replay writes nothing and reports the original outcome.
  v_had := exists (select 1 from public.production p where p.tenant_id = p_tenant_id and p.produced_on = p_day);
  insert into public.production_submissions (tenant_id, id, produced_on, had_before)
  values (p_tenant_id, p_submission_id, p_day, v_had)
  on conflict (tenant_id, id) do nothing;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    select s.produced_on, s.had_before into v_prev_day, v_prev_had
    from public.production_submissions s
    where s.tenant_id = p_tenant_id and s.id = p_submission_id;
    return jsonb_build_object(
      'day', coalesce(app.production_day_json(p_tenant_id, v_prev_day),
                      jsonb_build_object('date', to_char(v_prev_day, 'YYYY-MM-DD'), 'good', '[]'::jsonb,
                                         'goodTotal', 0, 'rejects', 0)),
      'hadBefore', v_prev_had,
      'replayed', true);
  end if;

  -- Every non-zero size must be an ACTIVE size of this farm.
  if exists (select 1 from unnest(p_size_ids, p_eggs) u(size_id, eggs)
             where u.eggs > 0
               and not exists (select 1 from public.sizes s
                               where s.tenant_id = p_tenant_id and s.id = u.size_id and s.archived_at is null)) then
    raise exception 'unknown size' using errcode = 'TM001';
  end if;

  insert into public.production (tenant_id, produced_on, size_id, quality, eggs)
  select p_tenant_id, p_day, u.size_id, 'good', u.eggs
  from unnest(p_size_ids, p_eggs) u(size_id, eggs)
  where u.eggs > 0
  union all
  select p_tenant_id, p_day, null, 'reject', p_rejects
  where p_rejects > 0
  on conflict (tenant_id, produced_on, quality, size_id)
  do update set eggs = public.production.eggs + excluded.eggs;

  return jsonb_build_object(
    'day', app.production_day_json(p_tenant_id, p_day),
    'hadBefore', v_had,
    'replayed', false);
end
$$;

-- Edit day: replaces the day's amounts (AC23, AC26). { day }. Naturally idempotent.
create function public.replace_production_day(
  p_tenant_id uuid,
  p_day       date,
  p_size_ids  uuid[],
  p_eggs      integer[],
  p_rejects   integer
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  perform app.assert_tenant(p_tenant_id);
  perform app.check_production_input(p_day, p_size_ids, p_eggs, p_rejects);
  perform app.lock_production_day(p_tenant_id, p_day);

  if not exists (select 1 from public.production p where p.tenant_id = p_tenant_id and p.produced_on = p_day) then
    raise exception 'day has no production' using errcode = 'TM003';
  end if;

  -- Allowed: active sizes, plus any size already on this day (so a since-archived size isn't stranded).
  if exists (select 1 from unnest(p_size_ids, p_eggs) u(size_id, eggs)
             where u.eggs > 0
               and not exists (select 1 from public.sizes s
                               where s.tenant_id = p_tenant_id and s.id = u.size_id and s.archived_at is null)
               and not exists (select 1 from public.production p
                               where p.tenant_id = p_tenant_id and p.produced_on = p_day
                                 and p.size_id = u.size_id)) then
    raise exception 'unknown size' using errcode = 'TM001';
  end if;

  delete from public.production p where p.tenant_id = p_tenant_id and p.produced_on = p_day;

  insert into public.production (tenant_id, produced_on, size_id, quality, eggs)
  select p_tenant_id, p_day, u.size_id, 'good', u.eggs
  from unnest(p_size_ids, p_eggs) u(size_id, eggs)
  where u.eggs > 0
  union all
  select p_tenant_id, p_day, null, 'reject', p_rejects
  where p_rejects > 0;

  return jsonb_build_object('day', app.production_day_json(p_tenant_id, p_day));
end
$$;

-- Delete day (AC25, AC26). { removed } = the day as it was before the delete.
create function public.delete_production_day(p_tenant_id uuid, p_day date)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_removed jsonb;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_day is null then
    raise exception 'day has no production' using errcode = 'TM003';
  end if;
  perform app.lock_production_day(p_tenant_id, p_day);

  v_removed := app.production_day_json(p_tenant_id, p_day);
  if v_removed is null then
    raise exception 'day has no production' using errcode = 'TM003';
  end if;

  delete from public.production p where p.tenant_id = p_tenant_id and p.produced_on = p_day;

  return jsonb_build_object('removed', v_removed);
end
$$;

revoke execute on function public.production_days(uuid, date, date) from public, anon;
revoke execute on function public.log_production(uuid, uuid, date, uuid[], integer[], integer) from public, anon;
revoke execute on function public.replace_production_day(uuid, date, uuid[], integer[], integer) from public, anon;
revoke execute on function public.delete_production_day(uuid, date) from public, anon;

grant execute on function public.production_days(uuid, date, date) to authenticated;
grant execute on function public.log_production(uuid, uuid, date, uuid[], integer[], integer) to authenticated;
grant execute on function public.replace_production_day(uuid, date, uuid[], integer[], integer) to authenticated;
grant execute on function public.delete_production_day(uuid, date) to authenticated;
