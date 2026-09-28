-- M16 sales_functions (docs/features/04-sales.md §3.1 "M16", §3.8 D5-D12)
--
-- Nine writes/reads, each ONE security invoker function = one transaction per rpc call (all-or-nothing, AC31), and
-- RLS applies exactly as for a direct query. Each takes p_tenant_id, which the repository fills from the server
-- context (TenantDb.rpc, never from the request), and first asserts it equals app.current_tenant_id() (TM006).
-- Every write takes app.lock_tenant_sales (M15), so sale-number assignment AND the stock-shortfall check for one
-- farm are always serialised together.
--
-- SQLSTATEs (continuing after TM026; TM002/TM005/TM006 reused where the meaning is identical, as clients reused
-- TM005/TM006). See M15 for TM028 (line count, also raised directly by validate_sale_lines) and TM041 (delete
-- guard, also raised directly by delete_sale):
--   TM002 sale_date or delivered_date after UTC today + 1 (HINT: sale_date | delivered_date)
--   TM005 malformed input (null submission id/version/sale id, mismatched line-array lengths, a null line field)
--   TM006 p_tenant_id is not the caller's tenant (server bug)
--   TM027 the sale isn't one of this farm's (foreign id or truly unknown -- the same answer, AC58)
--   TM029 the same size_id on two lines (validate_sale_lines)
--   TM030 a line's eggs outside 1-100,000 (validate_sale_lines)
--   TM031 a line's price invalid (HINT: not_positive | too_large | too_many_decimals) (validate_sale_lines)
--   TM032 client rule broken (HINT: required | invalid) (validate_sale_client)
--   TM033 a NEW line's size isn't active/foreign (HINT: not_found | archived) (validate_sale_lines)
--   TM034 delivered_date before sale_date (derive_sale_status)
--   TM036 update_sale / void_sale: the version isn't the one the form opened with, and the result would differ
--   TM037 completing/creating/increasing a line would take a size below 0 on hand, and p_confirm_shortfall is false
--   TM038 the same submissionId used with a different payload
--   TM039 an action not valid for this sale (defensive backstop: e.g. mark_sale_pending on an on_site sale)
--   TM042 void_sale: the sale isn't complete (a Pending sale is never voided)
--   TM043 update_sale / mark_sale_pending / mark_sale_delivered: the sale is already voided (AC68)
-- No exception message or detail below ever holds a client name, phone or price (AC59): TM037's detail is
-- {"shortfall":[{sizeId, onHandEggs, neededEggs}]} only.

-- create_sale (AC5, AC12-AC32, AC53, AC54): { sale, replayed }. Idempotent per submission id.
create function public.create_sale(
  p_tenant_id uuid,
  p_submission_id uuid,
  p_type text,
  p_sale_date date,
  p_size_ids uuid[],
  p_eggs integer[],
  p_prices numeric[],
  p_client_id uuid default null,
  p_delivered_date date default null,
  p_confirm_shortfall boolean default false
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_hash          text;
  v_prev          record;
  v_status        text;
  v_delivered     date;
  v_number        bigint;
  v_sale_id       uuid;
  v_eggs_per_tray integer;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_submission_id is null then
    raise exception 'submission id is required' using errcode = 'TM005';
  end if;
  if p_type is null or p_type not in ('delivery', 'on_site') then
    raise exception 'malformed type' using errcode = 'TM005';
  end if;
  if p_size_ids is null or p_eggs is null or p_prices is null
     or cardinality(p_size_ids) <> cardinality(p_eggs) or cardinality(p_size_ids) <> cardinality(p_prices) then
    raise exception 'malformed lines' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  v_hash := app.sale_payload_hash(p_type, p_client_id, p_sale_date, p_delivered_date, p_size_ids, p_eggs, p_prices);

  -- A replay (a retry after a lost response) writes nothing and returns the FIRST sale. Checked before any other
  -- validation, so a retry can never fail for the sale it just created (mirrors add_client, AC30).
  select s.sale_id, s.payload_hash into v_prev
  from public.sale_submissions s
  where s.tenant_id = p_tenant_id and s.id = p_submission_id;
  if found then
    if v_prev.payload_hash <> v_hash then
      raise exception 'submission id was used with another payload' using errcode = 'TM038';
    end if;
    return jsonb_build_object('sale', app.sale_json(p_tenant_id, v_prev.sale_id), 'replayed', true);
  end if;

  perform app.validate_sale_lines(p_tenant_id, p_size_ids, p_eggs, p_prices, '{}'::uuid[]);
  perform app.validate_sale_client(p_tenant_id, p_type, p_client_id, null);

  select d.status, d.delivered_date into v_status, v_delivered
  from app.derive_sale_status(p_type, p_sale_date, p_delivered_date) d;

  -- A brand-new complete sale (on-site, or a delivery already delivered) takes every line's eggs in FULL. Nothing
  -- is written if this raises (AC31). A pending delivery never asks (it takes nothing yet).
  if v_status = 'complete' then
    perform app.check_sale_shortfall(p_tenant_id, p_size_ids, p_eggs, p_confirm_shortfall);
  end if;

  -- Assigned under the lock already held, so two phones can never collide or skip (AC5).
  update public.sale_counters
  set next_number = next_number + 1
  where tenant_id = p_tenant_id
  returning next_number - 1 into v_number;
  if v_number is null then
    raise exception 'no sale counter for this farm' using errcode = 'TM006';
  end if;

  select coalesce(t.eggs_per_tray, 30) into v_eggs_per_tray from public.tenants t where t.id = p_tenant_id;

  insert into public.sales (tenant_id, sale_number, client_id, type, status, sale_date, delivered_date)
  values (p_tenant_id, v_number, p_client_id, p_type, v_status, p_sale_date, v_delivered)
  returning id into v_sale_id;

  insert into public.sale_lines (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total)
  select p_tenant_id, v_sale_id, u.size_id, u.eggs, round(u.price, 2), app.sale_line_total(u.price, u.eggs, v_eggs_per_tray)
  from unnest(p_size_ids, p_eggs, p_prices) u(size_id, eggs, price);

  insert into public.sale_submissions (tenant_id, id, sale_id, payload_hash)
  values (p_tenant_id, p_submission_id, v_sale_id, v_hash);

  return jsonb_build_object('sale', app.sale_json(p_tenant_id, v_sale_id), 'replayed', false);
end
$$;

-- update_sale (AC38-AC43, AC53, AC54, AC64-AC66): { sale, changed }. REPLACES the whole sale: header + every line.
create function public.update_sale(
  p_tenant_id uuid,
  p_sale_id uuid,
  p_version bigint,
  p_type text,
  p_sale_date date,
  p_size_ids uuid[],
  p_eggs integer[],
  p_prices numeric[],
  p_client_id uuid default null,
  p_delivered_date date default null,
  p_confirm_shortfall boolean default false
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur           record;
  v_cur_size_ids  uuid[];
  v_cur_eggs      integer[];
  v_cur_prices    numeric[];
  v_new_size_ids  uuid[];
  v_new_eggs      integer[];
  v_new_prices    numeric[];
  v_status        text;
  v_delivered     date;
  v_unchanged     boolean;
  v_eggs_per_tray integer;
  v_union_ids     uuid[];
  v_needed        integer[];
begin
  perform app.assert_tenant(p_tenant_id);
  if p_sale_id is null or p_version is null then
    raise exception 'sale id and version are required' using errcode = 'TM005';
  end if;
  if p_type is null or p_type not in ('delivery', 'on_site') then
    raise exception 'malformed type' using errcode = 'TM005';
  end if;
  if p_size_ids is null or p_eggs is null or p_prices is null
     or cardinality(p_size_ids) <> cardinality(p_eggs) or cardinality(p_size_ids) <> cardinality(p_prices) then
    raise exception 'malformed lines' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  select s.id, s.client_id, s.type, s.status, s.sale_date, s.delivered_date, s.version, s.voided_at
  into v_cur
  from public.sales s
  where s.tenant_id = p_tenant_id and s.id = p_sale_id;
  if not found then
    raise exception 'unknown sale' using errcode = 'TM027';
  end if;
  -- A voided sale accepts no further change of any kind (AC68). Checked before the "existing" reads below.
  if v_cur.voided_at is not null then
    raise exception 'sale is voided' using errcode = 'TM043';
  end if;

  select array_agg(l.size_id order by l.size_id), array_agg(l.eggs order by l.size_id), array_agg(l.price_per_tray order by l.size_id)
  into v_cur_size_ids, v_cur_eggs, v_cur_prices
  from public.sale_lines l
  where l.tenant_id = p_tenant_id and l.sale_id = p_sale_id;

  -- Kept, since-archived size lines are never refused (AC38, AC41): the sale's OWN size set, as it was before
  -- this edit, is passed as "existing".
  perform app.validate_sale_lines(p_tenant_id, p_size_ids, p_eggs, p_prices, coalesce(v_cur_size_ids, '{}'::uuid[]));
  perform app.validate_sale_client(p_tenant_id, p_type, p_client_id, v_cur.client_id);

  select d.status, d.delivered_date into v_status, v_delivered
  from app.derive_sale_status(p_type, p_sale_date, p_delivered_date) d;

  select array_agg(u.size_id order by u.size_id), array_agg(u.eggs order by u.size_id), array_agg(round(u.price, 2) order by u.size_id)
  into v_new_size_ids, v_new_eggs, v_new_prices
  from unnest(p_size_ids, p_eggs, p_prices) u(size_id, eggs, price);

  -- Nothing to write, whatever the version says: a retry of an edit whose reply was lost, or the same edit made
  -- elsewhere (D6). No version bump, so an open form of this sale isn't made stale by a no-op (AC40's own
  -- "nothing changed" short-circuit, backstopped here for a hand-built request).
  v_unchanged :=
    v_cur.type = p_type
    and v_cur.client_id is not distinct from p_client_id
    and v_cur.sale_date = p_sale_date
    and v_cur.status = v_status
    and v_cur.delivered_date is not distinct from v_delivered
    and v_cur_size_ids = v_new_size_ids
    and v_cur_eggs = v_new_eggs
    and v_cur_prices = v_new_prices;

  if v_unchanged then
    return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', false);
  end if;

  -- The request WOULD change something, so it must have been made from the current version (AC43).
  if p_version <> v_cur.version then
    raise exception 'sale was changed elsewhere' using errcode = 'TM036';
  end if;

  -- Per size, the delta this save NEWLY takes (new complete-eggs minus old complete-eggs), over the union of old
  -- and new size_ids (AC42): never warns for a size this save takes less from, or the same from, and a type change
  -- that flips pending<->complete moves every line's full amount as its "old" or "new" side.
  with old_lines as (
    select t.size_id, t.eggs from unnest(coalesce(v_cur_size_ids, '{}'::uuid[]), coalesce(v_cur_eggs, '{}'::integer[])) as t(size_id, eggs)
  ), new_lines as (
    select t.size_id, t.eggs from unnest(v_new_size_ids, v_new_eggs) as t(size_id, eggs)
  ), union_ids as (
    select size_id from old_lines union select size_id from new_lines
  )
  select array_agg(u.size_id order by u.size_id),
         array_agg(
           (case when v_status = 'complete' then coalesce(nl.eggs, 0) else 0 end)
           - (case when v_cur.status = 'complete' then coalesce(ol.eggs, 0) else 0 end)
           order by u.size_id)
  into v_union_ids, v_needed
  from union_ids u
  left join old_lines ol on ol.size_id = u.size_id
  left join new_lines nl on nl.size_id = u.size_id;

  perform app.check_sale_shortfall(p_tenant_id, v_union_ids, v_needed, p_confirm_shortfall);

  select coalesce(t.eggs_per_tray, 30) into v_eggs_per_tray from public.tenants t where t.id = p_tenant_id;

  delete from public.sale_lines l
  where l.tenant_id = p_tenant_id and l.sale_id = p_sale_id and l.size_id <> all (p_size_ids);

  -- Keeps a line's FROZEN total (AC55) whenever its eggs and price are unchanged, even though other lines in the
  -- same save are edited and even if the farm's eggs_per_tray changed since this line was last saved (D5).
  insert into public.sale_lines (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total)
  select p_tenant_id, p_sale_id, u.size_id, u.eggs, round(u.price, 2), app.sale_line_total(u.price, u.eggs, v_eggs_per_tray)
  from unnest(p_size_ids, p_eggs, p_prices) u(size_id, eggs, price)
  on conflict (tenant_id, sale_id, size_id) do update
  set eggs = excluded.eggs,
      price_per_tray = excluded.price_per_tray,
      line_total = case
        when sale_lines.eggs = excluded.eggs and sale_lines.price_per_tray = excluded.price_per_tray
          then sale_lines.line_total
        else excluded.line_total
      end;

  update public.sales s
  set client_id = p_client_id, type = p_type, status = v_status, sale_date = p_sale_date, delivered_date = v_delivered,
      version = s.version + 1
  where s.tenant_id = p_tenant_id and s.id = p_sale_id;

  return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', true);
end
$$;

-- mark_sale_delivered (AC33-AC37): { sale, changed }.
create function public.mark_sale_delivered(p_tenant_id uuid, p_sale_id uuid, p_delivered_date date, p_confirm_shortfall boolean default false)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur      record;
  v_size_ids uuid[];
  v_eggs     integer[];
begin
  perform app.assert_tenant(p_tenant_id);
  if p_sale_id is null then
    raise exception 'sale id is required' using errcode = 'TM005';
  end if;
  if p_delivered_date is null then
    raise exception 'delivered date is required' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  select s.status, s.sale_date, s.voided_at into v_cur
  from public.sales s where s.tenant_id = p_tenant_id and s.id = p_sale_id;
  if not found then
    raise exception 'unknown sale' using errcode = 'TM027';
  end if;
  -- Checked before the "already complete" case, so a voided sale never silently reports changed: false as if it
  -- were an ordinary already-delivered one (unreachable from the UI, AC68).
  if v_cur.voided_at is not null then
    raise exception 'sale is voided' using errcode = 'TM043';
  end if;
  -- "Treated as done" (AC37): no re-validation of the date against what's already stored.
  if v_cur.status = 'complete' then
    return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', false);
  end if;

  if p_delivered_date < v_cur.sale_date then
    raise exception 'delivered date is before the sale date' using errcode = 'TM034';
  end if;
  if p_delivered_date > (now() at time zone 'utc')::date + 1 then
    raise exception 'delivered date is in the future' using errcode = 'TM002', hint = 'delivered_date';
  end if;

  -- A pending sale has taken nothing yet: every line's FULL eggs are newly taken now.
  select array_agg(l.size_id), array_agg(l.eggs) into v_size_ids, v_eggs
  from public.sale_lines l where l.tenant_id = p_tenant_id and l.sale_id = p_sale_id;

  perform app.check_sale_shortfall(p_tenant_id, v_size_ids, v_eggs, p_confirm_shortfall);

  update public.sales s
  set status = 'complete', delivered_date = p_delivered_date, version = s.version + 1
  where s.tenant_id = p_tenant_id and s.id = p_sale_id;

  return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', true);
end
$$;

-- mark_sale_pending (AC39): { sale, changed }. Never checks shortfall: reversing only ever gives eggs back.
create function public.mark_sale_pending(p_tenant_id uuid, p_sale_id uuid)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur record;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_sale_id is null then
    raise exception 'sale id is required' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  select s.type, s.status, s.voided_at into v_cur
  from public.sales s where s.tenant_id = p_tenant_id and s.id = p_sale_id;
  if not found then
    raise exception 'unknown sale' using errcode = 'TM027';
  end if;
  if v_cur.voided_at is not null then
    raise exception 'sale is voided' using errcode = 'TM043';
  end if;
  -- Unreachable from the UI, which never offers this button for an on-site sale (AC39).
  if v_cur.type = 'on_site' then
    raise exception 'an on-site sale is always complete' using errcode = 'TM039';
  end if;
  if v_cur.status = 'pending' then
    return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', false);
  end if;

  update public.sales s
  set status = 'pending', delivered_date = null, version = s.version + 1
  where s.tenant_id = p_tenant_id and s.id = p_sale_id;

  return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', true);
end
$$;

-- delete_sale (AC44, AC45, AC53) -- PENDING ONLY: { saleId, saleNumber }. No stock recomputation needed: a
-- pending sale never held any, so there's nothing to reconcile.
create function public.delete_sale(p_tenant_id uuid, p_sale_id uuid)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur record;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_sale_id is null then
    raise exception 'sale id is required' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  select s.status, s.sale_number into v_cur
  from public.sales s where s.tenant_id = p_tenant_id and s.id = p_sale_id;
  if not found then
    raise exception 'unknown sale' using errcode = 'TM027';
  end if;
  -- Owner correction, 2026-09-27: covers a plain Complete sale AND a voided one (voided_at implies status =
  -- 'complete') with the ONE message -- "void it instead" -- never revealing which (AC44, AC54).
  if v_cur.status <> 'pending' then
    raise exception 'only a pending sale can be deleted' using errcode = 'TM041';
  end if;

  delete from public.sales s where s.tenant_id = p_tenant_id and s.id = p_sale_id;

  return jsonb_build_object('saleId', p_sale_id, 'saleNumber', v_cur.sale_number);
end
$$;

-- void_sale (AC67, AC68) -- COMPLETE ONLY, one-way: { sale, changed }. No shortfall check, ever: voiding only ever
-- gives eggs back.
create function public.void_sale(p_tenant_id uuid, p_sale_id uuid, p_version bigint)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_cur record;
begin
  perform app.assert_tenant(p_tenant_id);
  if p_sale_id is null or p_version is null then
    raise exception 'sale id and version are required' using errcode = 'TM005';
  end if;

  perform app.lock_tenant_sales(p_tenant_id);

  select s.status, s.voided_at, s.version into v_cur
  from public.sales s where s.tenant_id = p_tenant_id and s.id = p_sale_id;
  if not found then
    raise exception 'unknown sale' using errcode = 'TM027';
  end if;

  -- Idempotent regardless of p_version: once voided, a retry can only ever confirm the same terminal state.
  if v_cur.voided_at is not null then
    return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', false);
  end if;
  if v_cur.status <> 'complete' then
    raise exception 'only a complete sale can be voided' using errcode = 'TM042';
  end if;
  -- The same stale-edit code update_sale uses: the meaning is identical ("the version you have isn't current").
  if p_version <> v_cur.version then
    raise exception 'sale was changed elsewhere' using errcode = 'TM036';
  end if;

  update public.sales s
  set voided_at = now(), version = s.version + 1
  where s.tenant_id = p_tenant_id and s.id = p_sale_id;

  return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id), 'changed', true);
end
$$;

-- get_sale: { sale: <Sale> | null }.
create function public.get_sale(p_tenant_id uuid, p_sale_id uuid)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  perform app.assert_tenant(p_tenant_id);
  return jsonb_build_object('sale', app.sale_json(p_tenant_id, p_sale_id));
end
$$;

-- list_sales (AC4, AC7-AC11, AC46, AC52, AC68): { hasAny, total, sales }.
create function public.list_sales(
  p_tenant_id uuid,
  p_from date default null,
  p_to date default null,
  p_status text default null,
  p_type text default null,
  p_client_id uuid default null,
  p_limit int default 25,
  p_offset int default 0,
  p_include_voided boolean default false
)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  perform app.assert_tenant(p_tenant_id);
  return app.list_sales_json(p_tenant_id, p_from, p_to, p_status, p_type, p_client_id, p_limit, p_offset, p_include_voided);
end
$$;

-- get_on_hand (AC25, reused unchanged by Inventory later): { onHand }. Never counts a voided sale (AC67).
create function public.get_on_hand(p_tenant_id uuid, p_size_ids uuid[] default null)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  perform app.assert_tenant(p_tenant_id);
  return app.on_hand_json(p_tenant_id, p_size_ids);
end
$$;

revoke execute on function public.create_sale(uuid, uuid, text, date, uuid[], integer[], numeric[], uuid, date, boolean) from public, anon;
revoke execute on function public.update_sale(uuid, uuid, bigint, text, date, uuid[], integer[], numeric[], uuid, date, boolean) from public, anon;
revoke execute on function public.mark_sale_delivered(uuid, uuid, date, boolean) from public, anon;
revoke execute on function public.mark_sale_pending(uuid, uuid) from public, anon;
revoke execute on function public.delete_sale(uuid, uuid) from public, anon;
revoke execute on function public.void_sale(uuid, uuid, bigint) from public, anon;
revoke execute on function public.get_sale(uuid, uuid) from public, anon;
revoke execute on function public.list_sales(uuid, date, date, text, text, uuid, int, int, boolean) from public, anon;
revoke execute on function public.get_on_hand(uuid, uuid[]) from public, anon;

grant execute on function public.create_sale(uuid, uuid, text, date, uuid[], integer[], numeric[], uuid, date, boolean) to authenticated;
grant execute on function public.update_sale(uuid, uuid, bigint, text, date, uuid[], integer[], numeric[], uuid, date, boolean) to authenticated;
grant execute on function public.mark_sale_delivered(uuid, uuid, date, boolean) to authenticated;
grant execute on function public.mark_sale_pending(uuid, uuid) to authenticated;
grant execute on function public.delete_sale(uuid, uuid) to authenticated;
grant execute on function public.void_sale(uuid, uuid, bigint) to authenticated;
grant execute on function public.get_sale(uuid, uuid) to authenticated;
grant execute on function public.list_sales(uuid, date, date, text, text, uuid, int, int, boolean) to authenticated;
grant execute on function public.get_on_hand(uuid, uuid[]) to authenticated;
