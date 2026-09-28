-- 070_sales: sale rules (M15) and the nine functions (M16). docs/features/04-sales.md §3.1, §3.6.
-- Functions run as the farm owner, exactly as the server calls them. Concurrency (two phones creating a sale at
-- once, two marking the last stock delivered at once) can't be tested in one session: the manual recipe is in §4.
begin;
select plan(84);

select tests.create_farm('Farm R', 'r');   -- sale numbers, delete (pending only), delete vs void
select tests.create_farm('Farm S', 's');   -- lines and client validation
select tests.create_farm('Farm T', 't');   -- status derivation and frozen totals
select tests.create_farm('Farm U', 'u');   -- stock, shortfall, on-hand
select tests.create_farm('Farm V', 'v');   -- idempotency and idempotent status/version

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

-- Delete sale 2 (it is pending, so Delete applies).
select is(
  pg_temp.rpc_as('r', format('select public.delete_sale(%L, %L)', (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sale2))) ->> 'saleNumber',
  '2', 'AC44: sale 2 (pending) is deleted');
select is(pg_temp.n_sales('r'), 2::bigint, 'AC5: farm R now has 2 sales (1 and 3)');

create temp table _r_sale4 as
  select (pg_temp.rpc_as('r', format(
    'select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)',
    (select tr from _r_ids), pg_temp.szid('r', 'Small'), (select cid from _r_ids))) -> 'sale') as sale;
select is((select sale ->> 'saleNumber' from _r_sale4), '4', 'AC5: a fourth sale is 4, not 2 -- the deleted number is never reused');
select is(
  (select count(*) from public.sales where tenant_id = (select tr from _r_ids) and sale_number = 2),
  0::bigint, 'AC5: sale number 2 never appears again');

-- ---------------------------------------------------------------------------------------------
-- B. Delete (pending only) vs Void (complete only, one-way) (AC44, AC67, AC68, AC53, AC54).
-- ---------------------------------------------------------------------------------------------
-- Sale 1 (still pending) -> mark delivered -> complete.
select is(
  (pg_temp.rpc_as('r', format('select public.mark_sale_delivered(%L, %L, current_date)', (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sales))) -> 'sale') ->> 'status',
  'complete', 'sale 1 marked delivered is complete');

select is(
  pg_temp.try_detail('r', format('select public.delete_sale(%L, %L)', (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sales))),
  'TM041||', 'AC44: a complete sale cannot be deleted (TM041)');

-- The delete_sale REFUSAL wrote nothing: the sale is still there, still complete.
select is(
  (select status from public.sales where id = (select (sale ->> 'id')::uuid from _r_sales)),
  'complete', 'AC45: the refused delete left the sale untouched');

-- The direct-write backstop trigger (sales_delete_guard) refuses the same delete outside the function too.
select is(
  tests.try_as('r', format('delete from public.sales where id = %L', (select (sale ->> 'id')::uuid from _r_sales))),
  'TM041', 'AC44: a direct delete of a complete sale is refused by the sales_delete_guard trigger too');

-- Void it instead. mark_sale_delivered already bumped the version from 1 to 2.
create temp table _r_void1 as
  select pg_temp.rpc_as('r', format('select public.void_sale(%L, %L, 2)', (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sales))) as r;
select is((select r -> 'sale' ->> 'status' from _r_void1), 'complete', 'AC67: status stays complete forever on a voided sale');
select isnt((select r -> 'sale' ->> 'voidedAt' from _r_void1), null, 'AC67: voidedAt is now set');
select is((select r ->> 'changed' from _r_void1), 'true', 'AC67: voiding changed the sale');

-- Voiding again is a no-op (idempotent, AC68): changed: false, no error, no version bump, whatever version is passed.
create temp table _r_void1b as
  select pg_temp.rpc_as('r', format('select public.void_sale(%L, %L, 1)', (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sales))) as r;
select is((select r ->> 'changed' from _r_void1b), 'false', 'AC68: voiding an already-voided sale is changed: false');
select is((select r -> 'sale' ->> 'version' from _r_void1b), (select r -> 'sale' ->> 'version' from _r_void1), 'AC68: the second void does not bump the version');

-- A voided sale accepts no further change of any kind (AC68): TM043 on every mutating call.
select is(
  pg_temp.try_detail('r', format('select public.update_sale(%L, %L, 2, ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)',
    (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sales), pg_temp.szid('r', 'Small'), (select cid from _r_ids))),
  'TM043||', 'AC68: update_sale on a voided sale is refused (TM043)');
select is(
  pg_temp.try_detail('r', format('select public.mark_sale_pending(%L, %L)', (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sales))),
  'TM043||', 'AC68: mark_sale_pending on a voided sale is refused (TM043)');
select is(
  pg_temp.try_detail('r', format('select public.mark_sale_delivered(%L, %L, current_date)', (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sales))),
  'TM043||', 'AC68: mark_sale_delivered on a voided sale is refused (TM043)');
select is(
  pg_temp.try_detail('r', format('select public.delete_sale(%L, %L)', (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sales))),
  'TM041||', 'AC44: a voided sale still cannot be deleted (TM041, the same message as a plain complete sale)');

-- voided_at is one-way even through a DIRECT write (the sales_write_guard backstop, not just void_sale itself):
-- an owner cannot clear it, or move it to a different instant, via a hand-built PostgREST update.
select is(
  tests.try_as('r', format('update public.sales set voided_at = null where id = %L', (select (sale ->> 'id')::uuid from _r_sales))),
  'TM040', 'AC67/AC68: a direct write can never clear voided_at once set (TM040)');
-- A literal, different instant (not now(): within one test-file transaction, now() is pinned to the transaction
-- start, so it would equal the value void_sale already wrote earlier in this same transaction).
select is(
  tests.try_as('r', format('update public.sales set voided_at = ''2030-01-01T00:00:00Z'' where id = %L', (select (sale ->> 'id')::uuid from _r_sales))),
  'TM040', 'AC67/AC68: a direct write can never move voided_at to a different instant either (TM040)');

-- A pending sale is never voided (AC67).
select is(
  pg_temp.try_detail('r', format('select public.void_sale(%L, %L, 1)', (select tr from _r_ids), (select (sale ->> 'id')::uuid from _r_sale4))),
  'TM042||', 'AC67: voiding a pending sale is refused (TM042)');

-- Voided sales are excluded from list_sales by default, included (and marked) with include_voided.
select is(
  (pg_temp.rpc_as('r', format('select public.list_sales(%L, null, null, null, null, null, 100, 0, false)', (select tr from _r_ids))) ->> 'total')::int,
  2, 'AC68: list_sales without includeVoided counts 2 (sale 3 and sale 4; the voided sale 1 is hidden)');
select is(
  (pg_temp.rpc_as('r', format('select public.list_sales(%L, null, null, null, null, null, 100, 0, true)', (select tr from _r_ids))) ->> 'total')::int,
  3, 'AC68: list_sales with includeVoided counts all 3');
select ok(
  (pg_temp.rpc_as('r', format('select public.list_sales(%L, null, null, null, null, null, 100, 0, false)', (select tr from _r_ids))) ->> 'hasAny')::boolean,
  'AC46/AC68: hasAny ignores includeVoided/every filter');

-- delete_sale / void_sale on a foreign or already-gone id: TM027.
select is(
  pg_temp.try_detail('r', format('select public.delete_sale(%L, gen_random_uuid())', (select tr from _r_ids))),
  'TM027||', 'a delete of an unknown sale id is TM027');
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
-- D. Status derivation (AC23, AC24, AC34, AC64-AC66) and stale-edit / idempotent-status behaviour (AC37, AC40, AC43).
-- ---------------------------------------------------------------------------------------------
create temp table _t_ids as
  select tests.tenant_id_of('t') as tt, pg_temp.add_client('t', 'T Client') as cid, pg_temp.szid('t', 'Small') as small, pg_temp.szid('t', 'Medium') as medium;
grant select on _t_ids to authenticated;
-- Enough stock for the complete/on-site sales in this section (not testing shortfalls here).
select pg_temp.produce('t', 'Small', 10000);
select pg_temp.produce('t', 'Medium', 10000);

-- Delivery, no delivered date -> pending, delivered_date null.
create temp table _t_pending as
  select (pg_temp.rpc_as('t', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L)', (select tt from _t_ids), (select small from _t_ids), (select cid from _t_ids))) -> 'sale') as sale;
select is((select sale ->> 'status' from _t_pending), 'pending', 'AC23: a delivery with no delivered date is created pending');
select is((select sale ->> 'deliveredDate' from _t_pending), null, 'AC23: ... with no delivered date');

-- Delivery, "Already delivered" -> complete with that date.
create temp table _t_delivered as
  select (pg_temp.rpc_as('t', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L, current_date)', (select tt from _t_ids), (select small from _t_ids), (select cid from _t_ids))) -> 'sale') as sale;
select is((select sale ->> 'status' from _t_delivered), 'complete', 'AC24: "Already delivered" creates the sale complete');
select is((select sale ->> 'deliveredDate' from _t_delivered), to_char(current_date, 'YYYY-MM-DD'), 'AC24: ... with that delivered date');

-- On-site is ALWAYS complete, delivered_date = sale_date, regardless of a passed delivered_date argument.
create temp table _t_onsite as
  select (pg_temp.rpc_as('t', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[30], array[6.5], null, current_date - 5)', (select tt from _t_ids), (select small from _t_ids))) -> 'sale') as sale;
select is((select sale ->> 'status' from _t_onsite), 'complete', 'AC24: on-site is always complete');
select is((select sale ->> 'deliveredDate' from _t_onsite), to_char(current_date, 'YYYY-MM-DD'), 'AC24: ... delivered date forced to the sale date, ignoring the argument');

-- Delivered date before the sale date: TM034. Either date in the future: TM002 with the right hint.
select is(
  pg_temp.try_detail('t', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L, current_date - 1)', (select tt from _t_ids), (select small from _t_ids), (select cid from _t_ids))),
  'TM034||', 'AC33: a delivered date before the sale date is refused (TM034)');
select is(
  pg_temp.try_detail('t', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date + 2, array[%L]::uuid[], array[30], array[6.5], %L)', (select tt from _t_ids), (select small from _t_ids), (select cid from _t_ids))),
  'TM002|sale_date|', 'AC23: a sale date more than 1 day in the future is refused (TM002 sale_date)');
select is(
  pg_temp.try_detail('t', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L, current_date + 2)', (select tt from _t_ids), (select small from _t_ids), (select cid from _t_ids))),
  'TM002|delivered_date|', 'AC33: a delivered date more than 1 day in the future is refused (TM002 delivered_date)');

-- mark_sale_delivered on an already-complete sale: changed false, no re-check of the date, no error (AC37).
create temp table _t_before as select version from public.sales where id = (select (sale ->> 'id')::uuid from _t_delivered);
select is(
  pg_temp.rpc_as('t', format('select public.mark_sale_delivered(%L, %L, current_date - 100)', (select tt from _t_ids), (select (sale ->> 'id')::uuid from _t_delivered))) ->> 'changed',
  'false', 'AC37: mark_sale_delivered on an already-complete sale is changed: false (no date re-check)');
select is(
  (select version from public.sales where id = (select (sale ->> 'id')::uuid from _t_delivered)),
  (select version from _t_before), 'AC37: ... and the version does not move');

-- update_sale with a STALE version whose RESULT matches what's stored: changed false, no error (D6).
select is(
  pg_temp.rpc_as('t', format('select public.update_sale(%L, %L, 999, ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L, current_date)',
    (select tt from _t_ids), (select (sale ->> 'id')::uuid from _t_delivered), (select small from _t_ids), (select cid from _t_ids))) ->> 'changed',
  'false', 'AC43/D6: a stale version whose result matches what''s stored still succeeds as changed: false');

-- A genuinely stale, DIFFERENT edit: TM036.
select is(
  pg_temp.try_detail('t', format('select public.update_sale(%L, %L, 999, ''delivery'', current_date, array[%L]::uuid[], array[10], array[6.5], %L, current_date)',
    (select tt from _t_ids), (select (sale ->> 'id')::uuid from _t_delivered), (select small from _t_ids), (select cid from _t_ids))),
  'TM036||', 'AC43: a genuinely stale, different edit is refused (TM036)');

-- Saving with nothing changed (correct version): changed false, no version bump either.
select is(
  pg_temp.rpc_as('t', format('select public.update_sale(%L, %L, 1, ''delivery'', current_date, array[%L]::uuid[], array[30], array[6.5], %L, current_date)',
    (select tt from _t_ids), (select (sale ->> 'id')::uuid from _t_delivered), (select small from _t_ids), (select cid from _t_ids))) ->> 'changed',
  'false', 'AC40: saving with nothing changed is changed: false (server-side backstop)');

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

-- AC25 worked example: 600 produced (20 trays), a complete 240-line, a pending 150-line -> on-hand 360 (12 trays).
select pg_temp.produce('u', 'Large', 600);
create temp table _u_complete as
  select (pg_temp.rpc_as('u', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[240], array[6.5])', (select tu from _u_ids), (select large from _u_ids))) -> 'sale') as sale;
create temp table _u_pending as
  select (pg_temp.rpc_as('u', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[150], array[6.5], %L)', (select tu from _u_ids), (select large from _u_ids), (select cid from _u_ids))) -> 'sale') as sale;

select is(
  (pg_temp.rpc_as('u', format('select public.get_on_hand(%L, array[%L]::uuid[])', (select tu from _u_ids), (select large from _u_ids))) -> 'onHand' -> 0 ->> 'eggs')::int,
  360, 'AC25: on hand is 600 - 240 (complete) = 360; the 150-egg PENDING delivery is not subtracted');

-- Completing the pending delivery drops on-hand to 210 (AC36).
select pg_temp.rpc_as('u', format('select public.mark_sale_delivered(%L, %L, current_date)', (select tu from _u_ids), (select (sale ->> 'id')::uuid from _u_pending)));
select is(
  (pg_temp.rpc_as('u', format('select public.get_on_hand(%L, array[%L]::uuid[])', (select tu from _u_ids), (select large from _u_ids))) -> 'onHand' -> 0 ->> 'eggs')::int,
  210, 'AC36: completing the pending delivery lowers on hand to 210 (once per line)');

-- Marking it back to pending puts the eggs back on hand (AC39, the reverse of AC36).
select pg_temp.rpc_as('u', format('select public.mark_sale_pending(%L, %L)', (select tu from _u_ids), (select (sale ->> 'id')::uuid from _u_pending)));
select is(
  (pg_temp.rpc_as('u', format('select public.get_on_hand(%L, array[%L]::uuid[])', (select tu from _u_ids), (select large from _u_ids))) -> 'onHand' -> 0 ->> 'eggs')::int,
  360, 'AC39: mark_sale_pending puts the eggs back on hand');
-- ... and re-completing it drops it again (no shortfall problem: back to the AC25/AC36 scenario).
select pg_temp.rpc_as('u', format('select public.mark_sale_delivered(%L, %L, current_date)', (select tu from _u_ids), (select (sale ->> 'id')::uuid from _u_pending)));

-- An on-site sale that would take a size below 0: TM037 with the shortfall detail, naming only the short size.
select is(
  split_part(pg_temp.try_detail('u', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[300], array[6.5])', (select tu from _u_ids), (select large from _u_ids))), '|', 1),
  'TM037', 'AC26: an on-site sale of 300 (on hand is 210) shortfalls (TM037)');
select is(
  (pg_temp.try_shortfall('u', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[300], array[6.5])', (select tu from _u_ids), (select large from _u_ids))) -> 'shortfall' -> 0 ->> 'onHandEggs')::int,
  210, 'AC26: the shortfall detail names the live on-hand figure (210), not a stale one');

-- The SAME call with confirm_shortfall succeeds (Record anyway).
create temp table _u_confirmed as
  select (pg_temp.rpc_as('u', format('select public.create_sale(%L, gen_random_uuid(), ''on_site'', current_date, array[%L]::uuid[], array[300], array[6.5], null, null, true)', (select tu from _u_ids), (select large from _u_ids))) -> 'sale') as sale;
select is((select sale ->> 'status' from _u_confirmed), 'complete', 'AC26: "Record anyway" (confirmShortfall) saves the sale despite the shortfall');

-- Editing a complete line DOWN never shortfalls (AC42); editing it UP past on-hand shortfalls, only for that size.
select is(
  (pg_temp.rpc_as('u', format('select public.update_sale(%L, %L, 1, ''on_site'', current_date, array[%L]::uuid[], array[50], array[6.5])', (select tu from _u_ids), (select (sale ->> 'id')::uuid from _u_confirmed), (select large from _u_ids))) ->> 'changed'),
  'true', 'AC42: reducing a complete line''s eggs never shortfalls');
select is(
  split_part(pg_temp.try_detail('u', format('select public.update_sale(%L, %L, 2, ''on_site'', current_date, array[%L]::uuid[], array[100000], array[6.5])', (select tu from _u_ids), (select (sale ->> 'id')::uuid from _u_confirmed), (select large from _u_ids))), '|', 1),
  'TM037', 'AC42: increasing that line past on hand shortfalls');

-- mark_sale_pending never checks shortfall (reversing only gives eggs back) -- covered above (AC39 test); confirm
-- once more on a fresh delivery to be explicit about "never asks".
create temp table _u_bigdelivery as
  select (pg_temp.rpc_as('u', format('select public.create_sale(%L, gen_random_uuid(), ''delivery'', current_date, array[%L]::uuid[], array[5], array[6.5], %L, current_date, true)', (select tu from _u_ids), (select large from _u_ids), (select cid from _u_ids))) -> 'sale') as sale;
select is(
  (pg_temp.rpc_as('u', format('select public.mark_sale_pending(%L, %L)', (select tu from _u_ids), (select (sale ->> 'id')::uuid from _u_bigdelivery))) ->> 'changed'),
  'true', 'AC39: mark_sale_pending succeeds with no shortfall check, whatever the size''s on hand is');

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
  select (pg_temp.rpc_as('v', format('select public.create_sale(%L, %L, ''on_site'', current_date, array[%L]::uuid[], array[99999], array[6.5], null, null, true)', (select tv from _v_ids), (select sid from _v_sub2), (select small from _v_ids)))) as r;
select is((select r ->> 'replayed' from _v_retry), 'false', 'D8: retrying with confirmShortfall under the SAME id is not treated as a replay of a different payload');

select * from finish();
rollback;
