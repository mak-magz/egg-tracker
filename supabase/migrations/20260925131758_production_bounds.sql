-- M7 production_bounds (feature 01, security audit M1). docs/features/01-production-logging.md §4 [BE].
--
-- `authenticated` can write `production` directly through PostgREST (the browser holds the owner's JWT), so the
-- bounds the RPCs and the server enforce must also hold at the TABLE level. Own farm only (RLS and the
-- composite size FK already stop cross-farm writes); this closes the remaining gaps:
--   1. eggs per row between 1 and 1,000,000 (check constraint; = MAX_EGGS_PER_LINE in shared/constants/production.ts).
--   2. produced_on not after UTC today + 1 (same backstop as the RPCs, §3.8 D7).        -> TM002
--   3. a good row's size is an ACTIVE size of the farm, unless that size already has a
--      row on the same farm-day (see "Archived sizes" below).                          -> TM001
--   4. eggs over the cap raises a friendly TM007 first (the check is the backstop).   -> TM007
-- The RPCs keep their own checks (they run first and give the same codes); this trigger is the backstop for
-- every other write path.
--
-- Archived sizes (decision): retiring a size must not strand the days that already hold it (AC41), and Edit day
-- must still be able to correct such a day. So:
--   * INSERT of a good row: the size must be active, OR the farm already has a good row for that size on that
--     day (the insert is then an upsert's "add"/"replace" to an existing line, or a duplicate that the unique key
--     rejects anyway). A NEW line for an archived size is refused.
--   * UPDATE: the size must be active only if the row's size, date, quality or tenant CHANGES (moving a line to
--     another day would create a new line there). Updating the count or the timestamp of an existing line of a
--     since-archived size is allowed. replace_production_day never changes produced_on (its upsert conflicts on
--     the same day and sets only eggs), so Edit day on a day holding an archived size still works.
-- To make Edit day compatible, replace_production_day now UPSERTS the kept lines and deletes only the removed
-- ones (instead of delete-all + insert, which would re-insert an archived size as a "new" line).

-- ---------------------------------------------------------------------------
-- 1. Per-row cap. Keep equal to MAX_EGGS_PER_LINE (shared/constants/production.ts); a unit test checks this.
-- ---------------------------------------------------------------------------
alter table public.production drop constraint production_eggs_positive;
alter table public.production
  add constraint production_eggs_range check (eggs between 1 and 1000000);

-- ---------------------------------------------------------------------------
-- 2-4. Bounds trigger
-- ---------------------------------------------------------------------------
create function app.production_bounds()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if new.produced_on > (now() at time zone 'utc')::date + 1 then
    raise exception 'date is in the future' using errcode = 'TM002';
  end if;

  if new.eggs > 1000000 then
    raise exception 'eggs over the per-line cap' using errcode = 'TM007';
  end if;

  if new.quality = 'good' and new.size_id is not null
     and (tg_op = 'INSERT'
          or new.size_id is distinct from old.size_id
          or new.produced_on is distinct from old.produced_on
          or new.quality is distinct from old.quality
          or new.tenant_id is distinct from old.tenant_id)
     and not exists (select 1 from public.sizes s
                     where s.tenant_id = new.tenant_id and s.id = new.size_id and s.archived_at is null)
     and not (tg_op = 'INSERT'
              and exists (select 1 from public.production p
                          where p.tenant_id = new.tenant_id and p.produced_on = new.produced_on
                            and p.quality = 'good' and p.size_id = new.size_id)) then
    raise exception 'size is not an active size of this farm' using errcode = 'TM001';
  end if;

  return new;
end
$$;

comment on function app.production_bounds() is
  'Trigger: future-date backstop (TM002), per-line cap (TM007) and active-size rule (TM001) for every write path.';

revoke all on function app.production_bounds() from public;

create trigger production_bounds
  before insert or update on public.production
  for each row execute function app.production_bounds();

-- ---------------------------------------------------------------------------
-- Edit day: upsert kept lines, delete removed ones (same contract, same SQLSTATEs, still one transaction).
-- ---------------------------------------------------------------------------
create or replace function public.replace_production_day(
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

  -- Remove the lines that are no longer on the day (a size or rejects set to 0 / left out).
  delete from public.production p
  where p.tenant_id = p_tenant_id and p.produced_on = p_day
    and not (
      (p.quality = 'good' and exists (select 1 from unnest(p_size_ids, p_eggs) u(size_id, eggs)
                                      where u.eggs > 0 and u.size_id = p.size_id))
      or (p.quality = 'reject' and p_rejects > 0));

  -- Set the kept and new lines to exactly the given counts.
  insert into public.production (tenant_id, produced_on, size_id, quality, eggs)
  select p_tenant_id, p_day, u.size_id, 'good', u.eggs
  from unnest(p_size_ids, p_eggs) u(size_id, eggs)
  where u.eggs > 0
  union all
  select p_tenant_id, p_day, null, 'reject', p_rejects
  where p_rejects > 0
  on conflict (tenant_id, produced_on, quality, size_id)
  do update set eggs = excluded.eggs;

  return jsonb_build_object('day', app.production_day_json(p_tenant_id, p_day));
end
$$;

-- create or replace keeps the existing grants; restate them so this file is self-describing.
revoke execute on function public.replace_production_day(uuid, date, uuid[], integer[], integer) from public, anon;
grant execute on function public.replace_production_day(uuid, date, uuid[], integer[], integer) to authenticated;
