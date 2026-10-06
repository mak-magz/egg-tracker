-- 070_sales: sale rules (M15) and the sale functions (M16, reworked by M19 of feature 05: no pending, no delete, one date).
-- docs/features/04-sales.md §3.1, §3.6; docs/features/05-orders.md AC37-AC42.
-- Functions run as the farm owner, exactly as the server calls them. Concurrency (two phones creating a sale at
-- once) can't be tested in one session: the manual recipe is in §4.
begin;
select plan(84);

select tests.create_farm('Farm R', 'r');   -- sale numbers, void-only
select tests.create_farm('Farm S', 's');   -- lines and client validation
select tests.create_farm('Farm T', 't');   -- dates, stale edits and frozen totals
select tests.create_farm('Farm U', 'u');   -- stock, shortfall, on-hand
select tests.create_farm('Farm V', 'v');   -- idempotency
select tests.create_farm('Farm W', 'w');   -- on-hand example and type change

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------
create function pg_temp.rpc_as(p_who text, p_sql text) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  perform tests.authenticate_as(p_who);
  execute p_sql into v;
  perform tests.clear_authentication();
  return v;
end
$$;

-- 'ok', or '<SQLSTATE>|<hint>|<detail>' (tests.try_as only returns the SQLSTATE).
create function pg_temp.try_detail(p_who text, p_sql text) returns text language plpgsql as $$
declare
  v_state  text;
  v_hint   text;
  v_detail text;
begin
  begin
    perform tests.authenticate_as(p_who);
    execute p_sql;
    perform tests.clear_authentication();
    return 'ok';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_detail = pg_exception_detail;
    perform tests.clear_authentication();
    return v_state || '|' || coalesce(v_hint, '') || '|' || coalesce(v_detail, '');
  end;
end
$$;

-- The parsed shortfall detail (TM037's DETAIL, {"shortfall":[...]}) of a raised call, or null if it didn't raise.
create function pg_temp.try_shortfall(p_who text, p_sql text) returns jsonb language plpgsql as $$
declare
  v_detail text;
begin
  begin
    perform tests.authenticate_as(p_who);
    execute p_sql;
    perform tests.clear_authentication();
    return null;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    perform tests.clear_authentication();
    return v_detail::jsonb;
  end;
end
$$;

create function pg_temp.szid(p_who text, p_name text) returns uuid language sql stable as $$
  select s.id from public.sizes s where s.tenant_id = tests.tenant_id_of(p_who) and s.name = p_name
$$;

create function pg_temp.n_sales(p_who text) returns bigint language sql stable as $$
  select count(*) from public.sales where tenant_id = tests.tenant_id_of(p_who)
$$;

-- Adds a client directly (as postgres: the trigger still normalises and validates; RLS doesn't apply to postgres).
create function pg_temp.add_client(p_who text, p_name text) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.clients (tenant_id, name) values (tests.tenant_id_of(p_who), p_name) returning id into v_id;
  return v_id;
end
$$;

-- Logs GOOD production directly for a size (bypassing the RPC: this file only needs rows in `production`).
create function pg_temp.produce(p_who text, p_size_name text, p_eggs integer, p_day date default current_date) returns void language plpgsql as $$
begin
  insert into public.production (tenant_id, produced_on, size_id, quality, eggs)
  values (tests.tenant_id_of(p_who), p_day, pg_temp.szid(p_who, p_size_name), 'good', p_eggs)
  on conflict (tenant_id, produced_on, quality, size_id) do update set eggs = public.production.eggs + excluded.eggs;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- A. Sale numbers (AC5): per farm, assigned in the order logged, unique, never reused.
-- ---------------------------------------------------------------------------------------------
create temp table _r_ids as select tests.tenant_id_of('r') as tr, pg_temp.add_client('r', 'R Client') as cid;
grant select on _r_ids to authenticated;
-- Enough stock so the AC44/AC67/AC68 mechanics below never have to think about a shortfall.
select pg_temp.produce('r', 'Small', 10000);

create temp table _r_sales as
  select (pg_temp.rpc_as('r', format(
    'select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)',
    (select tr from _r_ids), pg_temp.szid('r', 'Small'), (select cid from _r_ids))) -> 'sale') as sale;

select is((select sale ->> 'saleNumber' from _r_sales), '1', 'AC5: a farm''s first sale is 1');

create temp table _r_sale2 as
  select (pg_temp.rpc_as('r', format(
    'select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)',
    (select tr from _r_ids), pg_temp.szid('r', 'Small'), (select cid from _r_ids))) -> 'sale') as sale;
select is((select sale ->> 'saleNumber' from _r_sale2), '2', 'AC5: the second sale is 2');

create temp table _r_sale3 as
  select (pg_temp.rpc_as('r', format(
    'select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)',
    (select tr from _r_ids), pg_temp.szid('r', 'Small'), (select cid from _r_ids))) -> 'sale') as sale;
select is((select sale ->> 'saleNumber' from _r_sale3), '3', 'AC5: the third sale is 3');

-- Sales are void-only (AC40): no delete function, no delete grant, no delete policy.
select ok(to_regprocedure('public.delete_sale(uuid,uuid)') is null, 'AC40: there is no delete_sale function any more');
select ok(to_regprocedure('public.mark_sale_delivered(uuid,uuid,date,boolean)') is null
      and to_regprocedure('public.mark_sale_pending(uuid,uuid)') is null, 'AC37: there is no mark-delivered or mark-pending function any more');
select is(
  tests.try_as('r', format('delete from public.sales where id = %L', (select (sale ->> 'id')::uuid from _r_sale2))),
  '42501', 'AC40: a direct delete of a sale is denied by privilege, for the owner of the farm too');
select is(pg_temp.n_sales('r'), 3::bigint, 'AC40: all three sales are still there');

create temp table _r_sale4 as
  select (pg_temp.rpc_as('r', format(
    'select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)',
    (select tr from _r_ids), pg_temp.szid('r', 'Small'), (select cid from _r_ids))) -> 'sale') as sale;
select is((select sale ->> 'saleNumber' from _r_sale4), '4', 'AC5: a fourth sale is 4');
select ok(not ((select sale from _r_sale4) ? 'status') and not ((select sale from _r_sale4) ? 'deliveredDate'),
  'AC37: a sale has no status and no deliveredDate in its JSON');
select is((select sale ->> 'orderId' from _r_sale4), null, 'a direct sale has no orderId');
select is((select sale ->> 'orderNumber' from _r_sale4), null, 'a direct sale has no orderNumber');

-- ---------------------------------------------------------------------------------------------
-- B. Void (one-way, AC40, AC67, AC68, AC53, AC54).
-- ---------------------------------------------------------------------------------------------
create temp table _r_void1 as
  select pg_temp.rpc_as('r', format('select public.void_sale(%L, %L, 1)', (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sales))) as r;
select isnt((select r -> 'sale' ->> 'voidedAt' from _r_void1), null, 'AC67: voidedAt is now set');
select is((select r ->> 'changed' from _r_void1), 'true', 'AC67: voiding changed the sale');
select is((select r -> 'order' from _r_void1), 'null'::jsonb, 'AC35: voiding a direct sale returns order: null');

-- Voiding again is a no-op (idempotent, AC68): changed: false, no error, no version bump, whatever version is passed.
create temp table _r_void1b as
  select pg_temp.rpc_as('r', format('select public.void_sale(%L, %L, 99)', (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sales))) as r;
select is((select r ->> 'changed' from _r_void1b), 'false', 'AC68: voiding an already-voided sale is changed: false');
select is((select r -> 'sale' ->> 'version' from _r_void1b), (select r -> 'sale' ->> 'version' from _r_void1), 'AC68: the second void does not bump the version');

-- A stale version on a live sale: TM036.
select is(
  pg_temp.try_detail('r', format('select public.void_sale(%L, %L, 99)', (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sale4))),
  'TM036||', 'AC43: voiding with a stale version is refused (TM036)');

-- A voided sale accepts no further change of any kind (AC68): TM043.
select is(
  pg_temp.try_detail('r', format('select public.update_sale(%L, %L, 2, ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)',
    (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sales), pg_temp.szid('r', 'Small'), (select cid from _r_ids))),
  'TM043||', 'AC68: update_sale on a voided sale is refused (TM043)');

-- voided_at is one-way even through a DIRECT write (the sales_write_guard backstop, not just void_sale itself).
select is(
  tests.try_as('r', format('update public.sales set voided_at = null where id = %L', (select (sale ->> 'id')::uuid from _r_sales))),
  'TM040', 'AC67/AC68: a direct write can never clear voided_at once set (TM040)');
-- A literal, different instant (not now(): within one test-file transaction, now() is pinned to the transaction start).
select is(
  tests.try_as('r', format('update public.sales set voided_at = ''2030-01-01T00:00:00Z'' where id = %L', (select (sale ->> 'id')::uuid from _r_sales))),
  'TM040', 'AC67/AC68: a direct write can never move voided_at to a different instant either (TM040)');

-- Voided sales are excluded from list_sales by default, included with include_voided.
select is(
  (pg_temp.rpc_as('r', format('select public.list_sales(%L, null, null, null, null, 100, 0, false)', (select tr from _r_ids))) ->> 'total')::int,
  3, 'AC68: list_sales without includeVoided counts 3 (the voided sale 1 is hidden)');
select is(
  (pg_temp.rpc_as('r', format('select public.list_sales(%L, null, null, null, null, 100, 0, true)', (select tr from _r_ids))) ->> 'total')::int,
  4, 'AC68: list_sales with includeVoided counts all 4');
select ok(
  (pg_temp.rpc_as('r', format('select public.list_sales(%L, null, null, null, null, 100, 0, false)', (select tr from _r_ids))) ->> 'hasAny')::boolean,
  'AC46/AC68: hasAny ignores includeVoided/every filter');

-- void_sale on an unknown id: TM027.
select is(
  pg_temp.try_detail('r', format('select public.void_sale(%L, gen_random_uuid(), 1)', (select tr from _r_ids))),
  'TM027||', 'a void of an unknown sale id is TM027');

-- ---------------------------------------------------------------------------------------------
-- C. Lines (AC15, AC16, AC17, AC20, AC29-AC31, AC38, AC41, AC54) and client rules (AC13, AC32, AC41, AC54).
-- ---------------------------------------------------------------------------------------------
create temp table _s_ids as
  select tests.tenant_id_of('s') as ts,
         pg_temp.add_client('s', 'S Active Client') as active_cid,
         pg_temp.szid('s', 'Small') as small,
         pg_temp.szid('s', 'Medium') as medium,
         pg_temp.szid('s', 'Large') as large;
grant select on _s_ids to authenticated;
-- Enough stock for the on-site/complete cases in this section (they aren't testing shortfalls).
select pg_temp.produce('s', 'Small', 10000);
select pg_temp.produce('s', 'Medium', 10000);

-- Mark a second client inactive, for the client rules below.
create temp table _s_inactive as select pg_temp.add_client('s', 'S Inactive Client') as cid;
grant select on _s_inactive to authenticated;
update public.clients set archived_at = now() where id = (select cid from _s_inactive);

-- 0 lines: TM028.
select is(
  pg_temp.try_detail('s', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[]::uuid[], array[]::integer[], array[]::numeric[])', (select ts from _s_ids))),
  'TM028||', 'AC15: 0 lines is refused (TM028)');

-- 21 lines: TM028. (21 distinct fresh uuids -- these aren't real sizes, but cardinality is checked before size lookup.)
select is(
  pg_temp.try_detail('s', format(
    'select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, (select array_agg(gen_random_uuid()) from generate_series(1,21)), (select array_agg(30) from generate_series(1,21)), (select array_agg(6.5::numeric) from generate_series(1,21)))',
    (select ts from _s_ids))),
  'TM028||', 'AC15: 21 lines is refused (TM028)');

-- Duplicate size: TM029.
select is(
  pg_temp.try_detail('s', format(
    'select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L, %L]::uuid[], array[30, 10], array[6.5, 6.5])',
    (select ts from _s_ids), (select small from _s_ids), (select small from _s_ids))),
  'TM029||', 'AC16: the same size twice in one sale is refused (TM029)');

-- Eggs out of range: TM030.
select is(
  pg_temp.try_detail('s', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[0], array[6.5])', (select ts from _s_ids), (select small from _s_ids))),
  'TM030||', 'AC20: 0 eggs on a line is refused (TM030)');
select is(
  pg_temp.try_detail('s', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[100001], array[6.5])', (select ts from _s_ids), (select small from _s_ids))),
  'TM030||', 'AC20: 100,001 eggs on a line is refused (TM030)');

-- Price rules: TM031 with the right hint.
select is(
  pg_temp.try_detail('s', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[30], array[0])', (select ts from _s_ids), (select small from _s_ids))),
  'TM031|not_positive|', 'AC19: a price of 0 is refused (not_positive)');
select is(
  pg_temp.try_detail('s', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[30], array[-1])', (select ts from _s_ids), (select small from _s_ids))),
  'TM031|not_positive|', 'AC19: a negative price is refused (not_positive)');
select is(
  pg_temp.try_detail('s', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[30], array[10000])', (select ts from _s_ids), (select small from _s_ids))),
  'TM031|too_large|', 'AC19: 10,000 is refused (too_large)');
select is(
  pg_temp.try_detail('s', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[30], array[6.505])', (select ts from _s_ids), (select small from _s_ids))),
  'TM031|too_many_decimals|', 'AC19: 6.505 is refused, not rounded (too_many_decimals)');

-- Sizes: an ARCHIVED size on a NEW line is refused (TM033 archived); a foreign farm's size is TM033 not_found.
create temp table _s_archived as select pg_temp.szid('s', 'Jumbo') as jumbo;
grant select on _s_archived to authenticated;
update public.sizes set archived_at = now() where id = (select jumbo from _s_archived);
select is(
  pg_temp.try_detail('s', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[30], array[6.5])', (select ts from _s_ids), (select jumbo from _s_archived))),
  'TM033|archived|', 'AC17: a new line naming an archived size is refused (TM033 archived)');
select is(
  pg_temp.try_detail('s', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[30], array[6.5])', (select ts from _s_ids), gen_random_uuid())),
  'TM033|not_found|', 'AC17/AC58: a size that does not exist at all is TM033 not_found');

-- Client rules: a delivery with no client is refused (TM032 required); on-site with no client succeeds.
select is(
  pg_temp.try_detail('s', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5])', (select ts from _s_ids), (select small from _s_ids))),
  'TM032|required|', 'AC13: a delivery with no client is refused (TM032 required)');

create temp table _s_onsite as
  select (pg_temp.rpc_as('s', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[30], array[6.5])', (select ts from _s_ids), (select small from _s_ids))) -> 'sale') as sale;
select is((select sale ->> 'clientId' from _s_onsite), null, 'AC13: an on-site sale with no client is a walk-in (client_id null)');

-- A newly chosen inactive client is refused (TM032 invalid); a foreign client id gets the SAME message.
select is(
  pg_temp.try_detail('s', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)', (select ts from _s_ids), (select small from _s_ids), (select cid from _s_inactive))),
  'TM032|invalid|', 'AC13: a newly chosen INACTIVE client is refused (TM032 invalid)');
select is(
  pg_temp.try_detail('s', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)', (select ts from _s_ids), (select small from _s_ids), gen_random_uuid())),
  'TM032|invalid|', 'AC58: a foreign client id gets the SAME message as inactive (no distinguishing hint)');

-- An existing sale keeps its own inactive client across an edit (AC41): create with the active client, archive it,
-- then edit the sale (only the price) with that same, now-inactive client -- it succeeds.
create temp table _s_kept as
  select (pg_temp.rpc_as('s', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)', (select ts from _s_ids), (select small from _s_ids), (select active_cid from _s_ids))) -> 'sale') as sale;
update public.clients set archived_at = now() where id = (select active_cid from _s_ids);
select is(
  pg_temp.rpc_as('s', format('select public.update_sale(%L, %L, 1, ''delivery'', current_date, array[%L]::uuid[], array[30], array[7.00], %L)',
    (select ts from _s_ids), (select (sale ->> 'id')::uuid from _s_kept), (select small from _s_ids), (select active_cid from _s_ids))) -> 'sale' ->> 'clientId',
  (select active_cid from _s_ids)::text, 'AC41: an existing sale keeps its now-inactive client across an edit');

-- An existing sale keeps its own since-archived size across an edit (AC38, AC41): create with Jumbo BEFORE it was
-- archived is not possible here (it's already archived), so instead verify the OPPOSITE direction directly: a size
-- active at creation, archived afterwards, stays valid on an edit that does not touch that line's size.
create temp table _s_keepsize as
  select pg_temp.szid('s', 'Medium') as med;
grant select on _s_keepsize to authenticated;
create temp table _s_archsale as
  select (pg_temp.rpc_as('s', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[30], array[6.5])', (select ts from _s_ids), (select med from _s_keepsize))) -> 'sale') as sale;
update public.sizes set archived_at = now() where id = (select med from _s_keepsize);
select is(
  pg_temp.rpc_as('s', format('select public.update_sale(%L, %L, 1, ''on_site'', current_date, array[%L]::uuid[], array[40], array[6.5])',
    (select ts from _s_ids), (select (sale ->> 'id')::uuid from _s_archsale), (select med from _s_keepsize))) -> 'changed',
  'true', 'AC38/AC41: an edit that keeps a since-archived size''s line (just changing eggs) succeeds');

-- ---------------------------------------------------------------------------------------------
-- D. One date (AC38, decision U1), stale-edit and unchanged behaviour (AC40, AC43).
-- ---------------------------------------------------------------------------------------------
create temp table _t_ids as
  select tests.tenant_id_of('t') as tt, pg_temp.add_client('t', 'T Client') as cid, pg_temp.szid('t', 'Small') as small, pg_temp.szid('t', 'Medium') as medium;
grant select on _t_ids to authenticated;
-- Enough stock for the sales in this section (not testing shortfalls here).
select pg_temp.produce('t', 'Small', 10000);
select pg_temp.produce('t', 'Medium', 10000);

create temp table _t_delivery as
  select (pg_temp.rpc_as('t', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date - 3, array[%L]::uuid[], array[30], array[6.5], %L)', (select tt from _t_ids), (select small from _t_ids), (select cid from _t_ids))) -> 'sale') as sale;
select is((select sale ->> 'saleDate' from _t_delivery), to_char(current_date - 3, 'YYYY-MM-DD'), 'AC38: a sale has one date, the day the eggs left (a past date is allowed)');
select is(
  (select to_char(delivered_date, 'YYYY-MM-DD') from public.sales where id = (select (sale ->> 'id')::uuid from _t_delivery)),
  to_char(current_date - 3, 'YYYY-MM-DD'), 'decision U3: delivered_date is a generated copy of sale_date');
select is(
  tests.try_as('t', format('insert into public.sales (tenant_id, sale_number, type, sale_date, delivered_date) values (%L, 998, ''on_site'', current_date, current_date)', (select tt from _t_ids))),
  '428C9', 'decision U3: an owner cannot write delivered_date (generated column)');
select is(
  tests.try_as('t', format('update public.sales set delivered_date = current_date where id = %L', (select (sale ->> 'id')::uuid from _t_delivery))),
  '428C9', 'decision U3: ... or update it');

-- The sale date in the future: TM002.
select is(
  pg_temp.try_detail('t', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date + 2, array[%L]::uuid[], array[30], array[6.5], %L)', (select tt from _t_ids), (select small from _t_ids), (select cid from _t_ids))),
  'TM002|sale_date|', 'AC23: a sale date more than 1 day in the future is refused (TM002 sale_date)');

-- update_sale with a STALE version whose RESULT matches what's stored: changed false, no error (D6).
select is(
  pg_temp.rpc_as('t', format('select public.update_sale(%L, %L, 999, ''delivery'', current_date - 3, array[%L]::uuid[], array[30], array[6.5], %L)',
    (select tt from _t_ids), (select (sale ->> 'id')::uuid from _t_delivery), (select small from _t_ids), (select cid from _t_ids))) ->> 'changed',
  'false', 'AC43/D6: a stale version whose result matches what''s stored still succeeds as changed: false');

-- A genuinely stale, DIFFERENT edit: TM036.
select is(
  pg_temp.try_detail('t', format('select public.update_sale(%L, %L, 999, ''delivery'', current_date - 3, array[%L]::uuid[], array[10], array[6.5], %L)',
    (select tt from _t_ids), (select (sale ->> 'id')::uuid from _t_delivery), (select small from _t_ids), (select cid from _t_ids))),
  'TM036||', 'AC43: a genuinely stale, different edit is refused (TM036)');

-- Saving with nothing changed (correct version): changed false, no version bump either.
select is(
  pg_temp.rpc_as('t', format('select public.update_sale(%L, %L, 1, ''delivery'', current_date - 3, array[%L]::uuid[], array[30], array[6.5], %L)',
    (select tt from _t_ids), (select (sale ->> 'id')::uuid from _t_delivery), (select small from _t_ids), (select cid from _t_ids))) ->> 'changed',
  'false', 'AC40: saving with nothing changed is changed: false (server-side backstop)');

-- Changing the date alone is a plain edit and bumps the version.
select is(
  pg_temp.rpc_as('t', format('select public.update_sale(%L, %L, 1, ''delivery'', current_date - 2, array[%L]::uuid[], array[30], array[6.5], %L)',
    (select tt from _t_ids), (select (sale ->> 'id')::uuid from _t_delivery), (select small from _t_ids), (select cid from _t_ids))) -> 'sale' ->> 'version',
  '2', 'a date-only edit bumps the version');

-- ---------------------------------------------------------------------------------------------
-- E. Frozen totals (AC22, AC55): a line's price and total, once saved, never move because of another line's
-- edit, and never move because the farm's tray size changes later.
-- ---------------------------------------------------------------------------------------------
create temp table _t2 as
  select (pg_temp.rpc_as('t', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L, %L]::uuid[], array[241, 120], array[6.75, 6.00])',
    (select tt from _t_ids), (select small from _t_ids), (select medium from _t_ids))) -> 'sale') as sale;

select is(
  (select l ->> 'lineTotal' from jsonb_array_elements((select sale -> 'lines' from _t2)) l where l ->> 'sizeId' = (select small::text from _t_ids)),
  '54.23', 'AC22: 241 eggs at 6.75/tray (30/tray) is 54.225, rounded half up to 54.23');
select is(
  (select l ->> 'lineTotal' from jsonb_array_elements((select sale -> 'lines' from _t2)) l where l ->> 'sizeId' = (select medium::text from _t_ids)),
  '24.00', 'AC22: 120 eggs (4 trays) at 6.00/tray is 24.00');
select is((select sale ->> 'saleTotal' from _t2), '78.23', 'AC22: the sale total is the sum of the rounded line totals');

-- Edit line 1's price only; line 2's total is BYTE-IDENTICAL to before.
create temp table _t2before as select l ->> 'lineTotal' as total from jsonb_array_elements((select sale -> 'lines' from _t2)) l where l ->> 'sizeId' = (select medium::text from _t_ids);
create temp table _t2edit as
  select (pg_temp.rpc_as('t', format('select public.update_sale(%L, %L, 1, ''on_site'', current_date, array[%L, %L]::uuid[], array[241, 120], array[7.00, 6.00])',
    (select tt from _t_ids), (select (sale ->> 'id')::uuid from _t2), (select small from _t_ids), (select medium from _t_ids))) -> 'sale') as sale;
select is(
  (select l ->> 'lineTotal' from jsonb_array_elements((select sale from _t2edit) -> 'lines') l where l ->> 'sizeId' = (select medium::text from _t_ids)),
  (select total from _t2before), 'AC55: editing line 1''s price leaves line 2''s frozen total byte-identical');

-- Change the farm's tray size; a re-saved UNCHANGED line keeps its original total, a changed line uses the new size.
update public.tenants set eggs_per_tray = 24 where id = (select tt from _t_ids);
create temp table _t2edit2 as
  select (pg_temp.rpc_as('t', format('select public.update_sale(%L, %L, 2, ''on_site'', current_date, array[%L, %L]::uuid[], array[241, 96], array[7.00, 6.00])',
    (select tt from _t_ids), (select (sale ->> 'id')::uuid from _t2edit), (select small from _t_ids), (select medium from _t_ids))) -> 'sale') as sale;
select is(
  (select l ->> 'lineTotal' from jsonb_array_elements((select sale from _t2edit2) -> 'lines') l where l ->> 'sizeId' = (select small::text from _t_ids)),
  (select l ->> 'lineTotal' from jsonb_array_elements((select sale from _t2edit) -> 'lines') l where l ->> 'sizeId' = (select small::text from _t_ids)),
  'AC55: an unchanged line (same eggs, same price) keeps its total after the farm''s tray size changes');
select is(
  (select l ->> 'lineTotal' from jsonb_array_elements((select sale from _t2edit2) -> 'lines') l where l ->> 'sizeId' = (select medium::text from _t_ids)),
  '24.00', 'AC55: a line whose eggs changed (120 -> 96, same 4 trays at the new 24/tray size) uses the new tray size and lands on the same total here, still frozen going forward');

-- ---------------------------------------------------------------------------------------------
-- F. Stock and shortfall (AC25, AC26, AC34-AC37, AC42, AC53) and on-hand (AC25, feature 06 reuse).
-- ---------------------------------------------------------------------------------------------
create temp table _u_ids as
  select tests.tenant_id_of('u') as tu, pg_temp.add_client('u', 'U Client') as cid, pg_temp.szid('u', 'Large') as large, pg_temp.szid('u', 'Small') as small, pg_temp.szid('u', 'Jumbo') as jumbo;
grant select on _u_ids to authenticated;

-- AC41 worked example (no pending sale any more): 600 produced (20 trays), ONE sale of 240 -> on hand 360 (12 trays).
select pg_temp.produce('u', 'Large', 600);
create temp table _u_complete as
  select (pg_temp.rpc_as('u', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[240], array[6.5])', (select tu from _u_ids), (select large from _u_ids))) -> 'sale') as sale;
select is(
  (pg_temp.rpc_as('u', format('select public.get_on_hand(%L, array[%L]::uuid[])', (select tu from _u_ids), (select large from _u_ids))) -> 'onHand' -> 0 ->> 'eggs')::int,
  360, 'AC41: on hand is 600 - 240 = 360');

-- Every sale takes stock now, delivery included (there is no pending to ignore).
create temp table _u_delivery as
  select (pg_temp.rpc_as('u', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[150], array[6.5], %L)', (select tu from _u_ids), (select large from _u_ids), (select cid from _u_ids))) -> 'sale') as sale;
select is(
  (pg_temp.rpc_as('u', format('select public.get_on_hand(%L, array[%L]::uuid[])', (select tu from _u_ids), (select large from _u_ids))) -> 'onHand' -> 0 ->> 'eggs')::int,
  210, 'AC37: a delivery sale lowers on hand at once, to 210');

-- A sale that would take a size below 0: TM037 with the shortfall detail, for EVERY new sale (AC38).
select is(
  split_part(pg_temp.try_detail('u', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[300], array[6.5])', (select tu from _u_ids), (select large from _u_ids))), '|', 1),
  'TM037', 'AC26: an on-site sale of 300 (on hand is 210) shortfalls (TM037)');
select is(
  split_part(pg_temp.try_detail('u', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[300], array[6.5], %L)', (select tu from _u_ids), (select large from _u_ids), (select cid from _u_ids))), '|', 1),
  'TM037', 'AC38: a delivery sale of 300 shortfalls too -- the warning applies to every new sale');
select is(
  (pg_temp.try_shortfall('u', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[300], array[6.5])', (select tu from _u_ids), (select large from _u_ids))) -> 'shortfall' -> 0 ->> 'onHandEggs')::int,
  210, 'AC26: the shortfall detail names the live on-hand figure (210), not a stale one');

-- The SAME call with confirm_shortfall succeeds (Record anyway).
create temp table _u_confirmed as
  select (pg_temp.rpc_as('u', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[300], array[6.5], null, true)', (select tu from _u_ids), (select large from _u_ids))) -> 'sale') as sale;
select is((select sale ->> 'saleNumber' from _u_confirmed), '3', 'AC26: "Record anyway" (confirmShortfall) saves the sale despite the shortfall');

-- Editing a line DOWN never shortfalls (AC42); editing it UP past on-hand shortfalls, only for that size.
select is(
  (pg_temp.rpc_as('u', format('select public.update_sale(%L, %L, 1, ''on_site'', current_date, array[%L]::uuid[], array[50], array[6.5])', (select tu from _u_ids), (select (sale ->> 'id')::uuid from _u_confirmed), (select large from _u_ids))) ->> 'changed'),
  'true', 'AC42: reducing a line''s eggs never shortfalls');
select is(
  split_part(pg_temp.try_detail('u', format('select public.update_sale(%L, %L, 2, ''on_site'', current_date, array[%L]::uuid[], array[100000], array[6.5])', (select tu from _u_ids), (select (sale ->> 'id')::uuid from _u_confirmed), (select large from _u_ids))), '|', 1),
  'TM037', 'AC42: increasing that line past on hand shortfalls');

-- Voiding gives the eggs back: on hand 600 - 240 - 150 - 50 = 160; void the 240-sale -> 400. Never asks about stock.
select is(
  (pg_temp.rpc_as('u', format('select public.get_on_hand(%L, array[%L]::uuid[])', (select tu from _u_ids), (select large from _u_ids))) -> 'onHand' -> 0 ->> 'eggs')::int,
  160, 'on-hand: 600 produced - 240 - 150 - 50 = 160');
select pg_temp.rpc_as('u', format('select public.void_sale(%L, %L, 1)', (select tu from _u_ids), (select (sale ->> 'id')::uuid from _u_complete)));
select is(
  (pg_temp.rpc_as('u', format('select public.get_on_hand(%L, array[%L]::uuid[])', (select tu from _u_ids), (select large from _u_ids))) -> 'onHand' -> 0 ->> 'eggs')::int,
  400, 'AC41: voiding the 240-egg sale gives its eggs back (160 -> 400)');

-- On-hand matches a hand-computed sum for several sizes, including one with zero production and one archived.
select pg_temp.produce('u', 'Small', 90);
update public.sizes set archived_at = now() where id = (select jumbo from _u_ids);
select is(
  (pg_temp.rpc_as('u', format('select public.get_on_hand(%L, array[%L]::uuid[])', (select tu from _u_ids), (select small from _u_ids))) -> 'onHand' -> 0 ->> 'eggs')::int,
  90, 'on-hand: Small (90 produced, no sales) is 90');
select is(
  (pg_temp.rpc_as('u', format('select public.get_on_hand(%L, array[%L]::uuid[])', (select tu from _u_ids), (select jumbo from _u_ids))) -> 'onHand' -> 0 ->> 'eggs')::int,
  0, 'on-hand: an archived size with nothing produced or sold is 0, not an error');

-- ---------------------------------------------------------------------------------------------
-- G. Idempotency (AC30, AC38, AC54): create_sale replays cleanly per submission id.
-- ---------------------------------------------------------------------------------------------
create temp table _v_ids as
  select tests.tenant_id_of('v') as tv, pg_temp.szid('v', 'Small') as small;
grant select on _v_ids to authenticated;
select pg_temp.produce('v', 'Small', 100);
create temp table _v_sub as select gen_random_uuid() as sid;
grant select on _v_sub to authenticated;

create temp table _v_first as
  select (pg_temp.rpc_as('v', format('select public.create_sale(%L, %L, ''on_site'', current_date, array[%L]::uuid[], array[30], array[6.5])', (select tv from _v_ids), (select sid from _v_sub), (select small from _v_ids)))) as r;
select is((select r ->> 'replayed' from _v_first), 'false', 'AC30: the first create_sale is not a replay');

create temp table _v_replay as
  select (pg_temp.rpc_as('v', format('select public.create_sale(%L, %L, ''on_site'', current_date, array[%L]::uuid[], array[30], array[6.5])', (select tv from _v_ids), (select sid from _v_sub), (select small from _v_ids)))) as r;
select is((select r ->> 'replayed' from _v_replay), 'true', 'AC30: the same submission id and payload is a replay');
select is(
  (select r -> 'sale' ->> 'id' from _v_replay), (select r -> 'sale' ->> 'id' from _v_first),
  'AC30: a replay returns the SAME sale, with one sale number');
select is(pg_temp.n_sales('v'), 1::bigint, 'AC30: a replay creates no second sale');

-- The same submission id with a DIFFERENT payload: TM038.
select is(
  pg_temp.try_detail('v', format('select public.create_sale(%L, %L, ''on_site'', current_date, array[%L]::uuid[], array[99], array[6.5])', (select tv from _v_ids), (select sid from _v_sub), (select small from _v_ids))),
  'TM038||', 'AC30: the same submission id with a different payload is refused (TM038)');

-- A submission whose create_sale RAISED (a shortfall without confirm) leaves no ledger row and no sale; a retry
-- with confirmShortfall under the SAME id succeeds normally (the payload hash excludes the confirm flag, D8).
create temp table _v_sub2 as select gen_random_uuid() as sid;
grant select on _v_sub2 to authenticated;
select is(
  split_part(pg_temp.try_detail('v', format('select public.create_sale(%L, %L, ''on_site'', current_date, array[%L]::uuid[], array[99999], array[6.5])', (select tv from _v_ids), (select sid from _v_sub2), (select small from _v_ids))), '|', 1),
  'TM037', 'a create that shortfalls without confirm raises, and writes nothing');
select is(
  (select count(*) from public.sale_submissions where id = (select sid from _v_sub2)), 0::bigint,
  'AC30/D8: the failed attempt left no ledger row');
create temp table _v_retry as
  select (pg_temp.rpc_as('v', format('select public.create_sale(%L, %L, ''on_site'', current_date, array[%L]::uuid[], array[99999], array[6.5], null, true)', (select tv from _v_ids), (select sid from _v_sub2), (select small from _v_ids)))) as r;
select is((select r ->> 'replayed' from _v_retry), 'false', 'D8: retrying with confirmShortfall under the SAME id is not treated as a replay of a different payload');

-- ---------------------------------------------------------------------------------------------
-- H. AC41 as written (600, one sale of 240 -> 12 trays; void -> 20 trays) and the type change (AC42): a plain
-- edit that moves no stock and never warns, even when on hand is exactly 0.
-- ---------------------------------------------------------------------------------------------
create temp table _w_ids as
  select tests.tenant_id_of('w') as tw, pg_temp.add_client('w', 'W Client') as cid, pg_temp.szid('w', 'Large') as large, pg_temp.szid('w', 'Small') as small;
grant select on _w_ids to authenticated;
select pg_temp.produce('w', 'Large', 600);
create temp table _w_sale as
  select (pg_temp.rpc_as('w', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[240], array[6.5])', (select tw from _w_ids), (select large from _w_ids))) -> 'sale') as sale;
select is(
  (pg_temp.rpc_as('w', format('select public.get_on_hand(%L, array[%L]::uuid[])', (select tw from _w_ids), (select large from _w_ids))) -> 'onHand' -> 0 ->> 'eggs')::int / 30,
  12, 'AC41: with one sale of 240 the hint shows 12 trays (360)');
select pg_temp.rpc_as('w', format('select public.void_sale(%L, %L, 1)', (select tw from _w_ids), (select (sale ->> 'id')::uuid from _w_sale)));
select is(
  (pg_temp.rpc_as('w', format('select public.get_on_hand(%L, array[%L]::uuid[])', (select tw from _w_ids), (select large from _w_ids))) -> 'onHand' -> 0 ->> 'eggs')::int / 30,
  20, 'AC41: voiding that sale shows 20 trays (600)');

-- Small: 30 eggs produced, a delivery sale of all 30 takes on hand to exactly 0.
select pg_temp.produce('w', 'Small', 30);
create temp table _w_tc as
  select (pg_temp.rpc_as('w', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)', (select tw from _w_ids), (select small from _w_ids), (select cid from _w_ids))) -> 'sale') as sale;
create temp table _w_tc2 as
  select pg_temp.rpc_as('w', format('select public.update_sale(%L, %L, 1, ''on_site'', current_date, array[%L]::uuid[], array[30], array[6.5])',
    (select tw from _w_ids), (select (sale ->> 'id')::uuid from _w_tc), (select small from _w_ids))) as r;
select is((select r ->> 'changed' from _w_tc2), 'true', 'AC42: Delivery -> On-site is a plain edit: no shortfall warning with on hand at 0');
select is((select r -> 'sale' ->> 'type' from _w_tc2), 'on_site', 'AC42: ... the type changed');
select is((select r -> 'sale' ->> 'saleNumber' from _w_tc2), (select sale ->> 'saleNumber' from _w_tc), 'AC42: ... and the sale number is unchanged');
select is(
  (pg_temp.rpc_as('w', format('select public.get_on_hand(%L, array[%L]::uuid[])', (select tw from _w_ids), (select small from _w_ids))) -> 'onHand' -> 0 ->> 'eggs')::int,
  0, 'AC42: ... and stock did not move');
select is(
  pg_temp.try_detail('w', format('select public.update_sale(%L, %L, 2, ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5])',
    (select tw from _w_ids), (select (sale ->> 'id')::uuid from _w_tc), (select small from _w_ids))),
  'TM032|required|', 'AC42: On-site -> Delivery needs a client');
select is(
  pg_temp.rpc_as('w', format('select public.update_sale(%L, %L, 2, ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)',
    (select tw from _w_ids), (select (sale ->> 'id')::uuid from _w_tc), (select small from _w_ids), (select cid from _w_ids))) -> 'sale' ->> 'type',
  'delivery', 'AC42: ... and works with a client, with no stock warning');

select * from finish();
rollback;
