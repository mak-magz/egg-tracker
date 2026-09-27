-- 050_sizes: size management rules (M8) and functions (M9). docs/features/02-farm-settings.md §3.1, §3.6.
-- Rules are exercised directly (as the farm owner, and as postgres for what an owner may not do); the five
-- functions run as the owner, exactly as the server calls them. Concurrency (two owners archiving the last two
-- sizes at once, two adds at once) can't be tested in one session: QA runs the manual recipe (§3.6 / §5).
begin;
select plan(190);

select tests.create_farm('Farm E', 'e');   -- direct writes and the colour / position rules
select tests.create_farm('Farm F', 'f');   -- last active size, bulk archive
select tests.create_farm('Farm G', 'g');   -- the 100-size cap
select tests.create_farm('Farm H', 'h');   -- the five functions
select tests.create_farm('Farm I', 'i');   -- security audit fixes (M-1, M-2, L-1, L-2)
select tests.create_farm('Farm O', 'o');   -- the ledger boundary (feature 03 QA S1)

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------
-- Runs p_sql as p_who and returns its single jsonb result. Errors propagate (use tests.try_as for SQLSTATEs).
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

-- 'ok', or '<SQLSTATE>|<detail>' (tests.try_as only returns the SQLSTATE).
create function pg_temp.try_detail(p_who text, p_sql text) returns text language plpgsql as $$
declare
  v_state  text;
  v_detail text;
begin
  begin
    perform tests.authenticate_as(p_who);
    execute p_sql;
    perform tests.clear_authentication();
    return 'ok';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_detail = pg_exception_detail;
    perform tests.clear_authentication();
    return v_state || '|' || coalesce(v_detail, '');
  end;
end
$$;

create function pg_temp.sid(p_who text, p_name text) returns uuid language sql stable as $$
  select s.id from public.sizes s where s.tenant_id = tests.tenant_id_of(p_who) and s.name = p_name
$$;

-- The farm's ACTIVE sizes by name, in order.
create function pg_temp.active_names(p_who text) returns text[] language sql stable as $$
  select coalesce(array_agg(s.name order by s.sort_order, s.name, s.id), '{}')
  from public.sizes s where s.tenant_id = tests.tenant_id_of(p_who) and s.archived_at is null
$$;

-- id:slot for every size (a colour must never move), by id (names change on rename).
create function pg_temp.slots(p_who text) returns text[] language sql stable as $$
  select coalesce(array_agg(s.id || ':' || s.color_slot order by s.id), '{}')
  from public.sizes s where s.tenant_id = tests.tenant_id_of(p_who)
$$;

-- True when sort_order is exactly 0..n-1 with no gaps, active sizes first.
create function pg_temp.is_compact(p_who text) returns boolean language sql stable as $$
  select coalesce((select array_agg(s.sort_order order by s.sort_order) from public.sizes s where s.tenant_id = tests.tenant_id_of(p_who))
                  = (select array_agg(g) from generate_series(0, (select count(*)::integer - 1 from public.sizes z where z.tenant_id = tests.tenant_id_of(p_who))) g), false)
         and not exists (select 1 from public.sizes a join public.sizes b on b.tenant_id = a.tenant_id
                         where a.tenant_id = tests.tenant_id_of(p_who) and a.archived_at is not null
                           and b.archived_at is null and a.sort_order < b.sort_order)
$$;

-- A production_days payload with each day's lines sorted by size id, so it compares counts, not line order.
create function pg_temp.day_norm(v jsonb) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('date', d ->> 'date', 'goodTotal', d -> 'goodTotal', 'rejects', d -> 'rejects',
                                      'good', (select jsonb_agg(g order by g ->> 'sizeId') from jsonb_array_elements(d -> 'good') g))
                   order by d ->> 'date')
  from jsonb_array_elements(v -> 'days') d
$$;

create function pg_temp.h_prod() returns text language sql stable as $$
  select coalesce(string_agg(p.produced_on || ':' || coalesce(p.size_id::text, 'reject') || ':' || p.eggs, ',' order by p.produced_on, p.size_id), '')
  from public.production p where p.tenant_id = tests.tenant_id_of('h')
$$;

-- ---------------------------------------------------------------------------------------------
-- app.normalize_size_name (AC4): the SQL twin of normalizeSizeName. Same fixtures as tests/unit/size-name.spec.ts.
-- ---------------------------------------------------------------------------------------------
select is(app.normalize_size_name('  Extra   Large '), 'Extra Large', 'trims and collapses runs of spaces');
select is(app.normalize_size_name(U&'Extra\0009\000A Large'), 'Extra Large', 'a tab and a newline count as whitespace');
select is(app.normalize_size_name(U&'A\000B\000CB'), 'A B', 'a vertical tab and a form feed count as whitespace');
select is(app.normalize_size_name(U&' Extra\00A0\00A0Large\00A0'), 'Extra Large', 'no-break spaces count as whitespace, whatever the locale');
select is(app.normalize_size_name(U&'Extra\2003Large'), 'Extra Large', 'U+2003 (em space) counts as whitespace');
select is(app.normalize_size_name(U&'\FEFFX\FEFF'), 'X', 'a zero-width no-break space (BOM) counts as whitespace');
select is(app.normalize_size_name(U&'Cafe\0301'), U&'Caf\00E9', 'decomposed accents are composed (NFC)');
select is(app.normalize_size_name(U&'Cafe\0301'), app.normalize_size_name(U&'Caf\00E9'),
  'composed and decomposed accents are one name');
select is(app.normalize_size_name(E' \t\n '), '', 'whitespace-only becomes an empty string');
select is(app.normalize_size_name('  pEEwee '), 'pEEwee', 'case is kept as typed');
select is(app.normalize_size_name(app.normalize_size_name(U&'  Extra\00A0 Cafe\0301 ')),
          app.normalize_size_name(U&'  Extra\00A0 Cafe\0301 '), 'the rule is idempotent');

-- ---------------------------------------------------------------------------------------------
-- Direct writes as the owner (farm E): the M8 triggers, checks and grants hold on EVERY write path.
-- ---------------------------------------------------------------------------------------------
select is(
  tests.try_as('e', format('insert into public.sizes (tenant_id, name) values (%L, %L)', tests.tenant_id_of('e'), '  Extra   Large ')),
  'ok:1', 'AC4: an owner can insert a size with just (tenant_id, name)');
select is(pg_temp.sid('e', 'Extra Large') is not null, true, 'AC4: a padded, spaced name is saved normalised ("Extra Large")');
select is(
  (select row(s.sort_order, s.color_slot)::text from public.sizes s where s.id = pg_temp.sid('e', 'Extra Large')),
  row(4, 4)::text, 'AC3, AC5: the trigger puts the new size last (position 4) with the smallest unused colour slot (4)');

select is(
  tests.try_as('e', format('insert into public.sizes (tenant_id, name) values (%L, %L)', tests.tenant_id_of('e'), '   ')),
  '23514', 'AC4: a direct blank name fails the length check');
select is(
  tests.try_as('e', format('insert into public.sizes (tenant_id, name) values (%L, %L)', tests.tenant_id_of('e'), repeat('x', 40))),
  'ok:1', 'AC4: a 40-character name is accepted');
select is(
  tests.try_as('e', format('insert into public.sizes (tenant_id, name) values (%L, %L)', tests.tenant_id_of('e'), repeat('x', 41))),
  '23514', 'AC4: a 41-character name is refused');
select is(
  tests.try_as('e', format('insert into public.sizes (tenant_id, name) values (%L, %L)', tests.tenant_id_of('e'), repeat(U&'\+01F95A', 40))),
  'ok:1', 'AC4: 40 emoji count as 40 characters (code points)');
select is(
  tests.try_as('e', format('insert into public.sizes (tenant_id, name) values (%L, %L)', tests.tenant_id_of('e'), repeat(U&'\+01F95A', 41))),
  '23514', 'AC4: 41 emoji are refused');

select is(
  tests.try_as('e', format('insert into public.sizes (tenant_id, name) values (%L, %L)', tests.tenant_id_of('e'), U&'Caf\00E9')),
  'ok:1', 'a name with a composed accent is accepted');
select is(
  tests.try_as('e', format('insert into public.sizes (tenant_id, name) values (%L, %L)', tests.tenant_id_of('e'), U&'Cafe\0301')),
  '23505', 'the same name typed with a combining accent is a duplicate (NFC)');
select is(
  tests.try_as('e', format('insert into public.sizes (tenant_id, name) values (%L, %L)', tests.tenant_id_of('e'), ' LARGE ')),
  '23505', 'AC4: a direct insert whose name matches another size ignoring case is a duplicate');

select is(
  array(select s.color_slot::int from public.sizes s where s.tenant_id = tests.tenant_id_of('e') order by s.color_slot),
  array[0, 1, 2, 3, 4, 5, 6, 7], 'AC5: after 8 sizes the slots are 0..7, none repeated');

-- An owner can't choose a colour, a position, an id, an archive time or timestamps.
select is(tests.try_as('e', format('insert into public.sizes (tenant_id, name, color_slot) values (%L, ''Pick'', 9)', tests.tenant_id_of('e'))),
  '42501', 'AC5: an owner cannot choose a colour slot');
select is(tests.try_as('e', format('insert into public.sizes (tenant_id, name, sort_order) values (%L, ''Pick'', 0)', tests.tenant_id_of('e'))),
  '42501', 'an owner cannot choose a position');
select is(tests.try_as('e', format('insert into public.sizes (tenant_id, name, archived_at) values (%L, ''Pick'', now())', tests.tenant_id_of('e'))),
  '42501', 'an owner cannot insert an archived size');
select is(tests.try_as('e', format('insert into public.sizes (id, tenant_id, name) values (gen_random_uuid(), %L, ''Pick'')', tests.tenant_id_of('e'))),
  '42501', 'an owner cannot choose an id');

-- Archiving frees no colour: the next size gets a new slot.
select is(tests.try_as('e', format('update public.sizes set archived_at = now() where id = %L', pg_temp.sid('e', 'Extra Large'))),
  'ok:1', 'an owner can archive a size directly (there are others active)');
select is(
  tests.try_as('e', format('insert into public.sizes (tenant_id, name) values (%L, ''After'')', tests.tenant_id_of('e'))),
  'ok:1', 'control: a size is added after one was archived');
select is((select s.color_slot::int from public.sizes s where s.id = pg_temp.sid('e', 'After')), 8,
  'AC5: an archived size''s slot is not reused (the new size gets 8, not 4)');

-- 10th, 11th, 12th sizes: slots 9, 10, 11 (10+ repeat the palette dashed on screen, but stay distinct here).
insert into public.sizes (tenant_id, name) values (tests.tenant_id_of('e'), 'P10'), (tests.tenant_id_of('e'), 'P11'), (tests.tenant_id_of('e'), 'P12');
select is(
  array(select s.name || ':' || s.color_slot from public.sizes s
        where s.tenant_id = tests.tenant_id_of('e') and s.name in ('P10', 'P11', 'P12') order by s.name),
  array['P10:9', 'P11:10', 'P12:11'], 'AC5: a multi-row insert gets slots 9, 10, 11 (the 11th and 12th sizes)');

-- Rename directly: normalised, and a clash with another size (any case) is refused.
select is(tests.try_as('e', format('update public.sizes set name = ''  Big   One '' where id = %L', pg_temp.sid('e', 'Large'))),
  'ok:1', 'an owner can rename a size directly');
select is(pg_temp.sid('e', 'Big One') is not null, true, 'a direct rename is normalised too ("Big One")');
select is(tests.try_as('e', format('update public.sizes set name = ''small'' where id = %L', pg_temp.sid('e', 'Big One'))),
  '23505', 'a direct rename to another size''s name (any case) is a duplicate');
select is(tests.try_as('e', format('update public.sizes set name = ''BIG ONE'' where id = %L', pg_temp.sid('e', 'Big One'))),
  'ok:1', 'AC7: a case-only change to itself is allowed');

-- No delete, no truncate (AC25). No column an owner shouldn't write.
select is(tests.try_as('e', 'delete from public.sizes'), '42501', 'AC25: an owner cannot delete sizes');
select is(tests.try_as('e', 'truncate public.sizes'), '42501', 'AC25: an owner cannot truncate sizes');
select is(tests.try_as('e', format('update public.sizes set color_slot = 50 where id = %L', pg_temp.sid('e', 'Small'))),
  '42501', 'an owner cannot update color_slot (no column privilege)');
select is(tests.try_as('e', format('update public.sizes set tenant_id = %L where id = %L', tests.tenant_id_of('f'), pg_temp.sid('e', 'Small'))),
  '42501', 'an owner cannot update tenant_id (no column privilege)');
select throws_ok(format('update public.sizes set color_slot = 50 where id = %L', pg_temp.sid('e', 'Small')),
  'TM014', null, 'color_slot is immutable, even for postgres (TM014)');
select throws_ok(format('update public.sizes set tenant_id = %L where id = %L', tests.tenant_id_of('f'), pg_temp.sid('e', 'Small')),
  'TM014', null, 'tenant_id is immutable, even for postgres (TM014)');

insert into public.production (tenant_id, produced_on, size_id, quality, eggs)
  values (tests.tenant_id_of('e'), '2026-08-01', pg_temp.sid('e', 'Small'), 'good', 10);
select throws_ok(format('delete from public.sizes where id = %L', pg_temp.sid('e', 'Small')),
  '23503', null, 'AC25: even postgres cannot delete a size that has production');

-- The ledger: an owner can add rows for their own farm.
select is(
  tests.try_as('e', format('insert into public.size_submissions (tenant_id, id, size_id, name) values (%L, gen_random_uuid(), %L, ''Small'')',
                           tests.tenant_id_of('e'), pg_temp.sid('e', 'Small'))),
  'ok:1', 'an owner can write their own farm''s size ledger');

-- ---------------------------------------------------------------------------------------------
-- The 100-size cap (TM015, farm G): archived sizes count, sizes are never deleted.
-- ---------------------------------------------------------------------------------------------
insert into public.sizes (tenant_id, name)
  select tests.tenant_id_of('g'), 'C' || g from generate_series(1, 96) g;
select is((select count(*) from public.sizes where tenant_id = tests.tenant_id_of('g')), 100::bigint,
  'D5: a farm can reach exactly 100 sizes');
select is((select count(distinct color_slot) from public.sizes where tenant_id = tests.tenant_id_of('g')), 100::bigint,
  'AC5: 100 sizes, 100 distinct colour slots');
select is(tests.try_as('g', format('insert into public.sizes (tenant_id, name) values (%L, ''C101'')', tests.tenant_id_of('g'))),
  'TM015', 'D5: the 101st size is refused (TM015)');
select throws_ok(format('insert into public.sizes (tenant_id, name) values (%L, ''C101'')', tests.tenant_id_of('g')),
  'TM015', null, 'D5: the cap holds for postgres too');
select is(
  tests.try_as('g', format('select public.add_size(%L, gen_random_uuid(), ''C101'')', tests.tenant_id_of('g'))),
  'TM015', 'D5: add_size at the cap is refused (TM015)');
select is((select count(*) from public.sizes where tenant_id = tests.tenant_id_of('g')), 100::bigint, 'still 100 sizes');

-- ---------------------------------------------------------------------------------------------
-- Last active size, directly (AC14): a statement trigger, so a bulk update can't archive everything.
-- ---------------------------------------------------------------------------------------------
select is(tests.try_as('f', 'update public.sizes set archived_at = now()'), 'TM010',
  'AC14: a bulk archive of every size is refused (TM010)');
select is((select count(*) from public.sizes where tenant_id = tests.tenant_id_of('f') and archived_at is not null), 0::bigint,
  'AC14: the refused bulk archive changed no row');
select is(tests.try_as('f', 'update public.sizes set archived_at = now() where name <> ''Jumbo'''), 'ok:3',
  'AC14: archiving 3 of 4 in one statement works');
select is(tests.try_as('f', 'update public.sizes set archived_at = now() where name = ''Jumbo'''), 'TM010',
  'AC14: archiving the last active size directly is refused (TM010)');
select is(pg_temp.active_names('f'), array['Jumbo'], 'AC14: Jumbo is still active');
select is(tests.try_as('f', 'update public.sizes set archived_at = null where name = ''Small'''), 'ok:1',
  'restoring a size directly works');
select is(tests.try_as('f', 'update public.sizes set archived_at = now() where name = ''Small'''), 'ok:1',
  'AC14: with two active, one can be archived again');

-- ---------------------------------------------------------------------------------------------
-- add_size (AC3, AC4, AC5, AC18). Farm H: Small 0, Medium 1, Large 2, Jumbo 3 (slots 0-3).
-- ---------------------------------------------------------------------------------------------
insert into public.production (tenant_id, produced_on, size_id, quality, eggs)
  select tests.tenant_id_of('h'), d.day, pg_temp.sid('h', d.size), 'good', d.eggs
  from (values (date '2026-08-01', 'Small', 10), (date '2026-08-01', 'Large', 20), (date '2026-08-01', 'Jumbo', 30),
               (date '2026-08-02', 'Small', 5), (date '2026-08-02', 'Jumbo', 7)) d(day, size, eggs);
insert into public.production (tenant_id, produced_on, quality, eggs)
  values (tests.tenant_id_of('h'), '2026-08-01', 'reject', 4);
create temp table _prod0 as select pg_temp.h_prod() as p, (select sum(eggs) from public.production where tenant_id = tests.tenant_id_of('h')) as total;

create temp table _add1 as
  select pg_temp.rpc_as('h', format('select public.add_size(%L, %L, %L)', tests.tenant_id_of('h'),
                                    '00000000-0000-4000-8000-0000000000a1', 'Peewee')) as v;
select is((select (v ->> 'replayed')::boolean from _add1), false, 'AC3: add_size adds and is not a replay');
select is(pg_temp.active_names('h'), array['Small', 'Medium', 'Large', 'Jumbo', 'Peewee'],
  'AC3: the new size is last among the active sizes');
select is((select s.color_slot::int from public.sizes s where s.id = ((select v ->> 'changedId' from _add1))::uuid), 4,
  'AC5: the new size takes the smallest unused slot (4)');
select is(pg_temp.is_compact('h'), true, 'sort_order is compact 0..n-1 after an add');

create temp table _add1b as
  select pg_temp.rpc_as('h', format('select public.add_size(%L, %L, %L)', tests.tenant_id_of('h'),
                                    '00000000-0000-4000-8000-0000000000a1', 'Peewee')) as v;
select is((select row(v ->> 'changedId', (v ->> 'replayed')::boolean)::text from _add1b),
          (select row(v ->> 'changedId', true)::text from _add1),
  'AC18: the same submissionId returns the same size with replayed = true');
select is((select count(*) from public.sizes where tenant_id = tests.tenant_id_of('h')), 5::bigint, 'AC18: a replay adds no second size');
select is(pg_temp.try_detail('h', format('select public.add_size(%L, %L, %L)', tests.tenant_id_of('h'),
                                         '00000000-0000-4000-8000-0000000000a1', 'Other')),
  'TM013|', 'the same submissionId with a different name is refused (TM013)');
select is(tests.try_as('h', format('select public.add_size(%L, %L, %L)', tests.tenant_id_of('h'),
                                   '00000000-0000-4000-8000-0000000000a1', '  PEEWEE ')),
  'ok:1', 'a replay ignores case and spacing differences in the name');

-- Name clashes: any case, archived included; detail says which size.
select is(
  split_part(pg_temp.try_detail('h', format('select public.add_size(%L, %L, %L)', tests.tenant_id_of('h'),
                                            '00000000-0000-4000-8000-0000000000a2', 'large')), '|', 1),
  'TM009', 'AC4: adding "large" when "Large" exists is refused (TM009)');
select is(
  (split_part(pg_temp.try_detail('h', format('select public.add_size(%L, %L, %L)', tests.tenant_id_of('h'),
                                             '00000000-0000-4000-8000-0000000000a2', 'large')), '|', 2))::jsonb,
  jsonb_build_object('id', pg_temp.sid('h', 'Large'), 'name', 'Large', 'archived', false),
  'AC4: TM009 detail names the existing size (its own spelling) and that it is active');
select is((select count(*) from public.size_submissions where tenant_id = tests.tenant_id_of('h')
           and id = '00000000-0000-4000-8000-0000000000a2'), 0::bigint,
  'a refused add leaves no ledger row');
select is(tests.try_as('h', format('select public.add_size(%L, %L, %L)', tests.tenant_id_of('h'),
                                   '00000000-0000-4000-8000-0000000000a2', '  Extra   Large ')),
  'ok:1', 'a retry with a fixed name works, and normalises spaces');
select is(pg_temp.active_names('h'), array['Small', 'Medium', 'Large', 'Jumbo', 'Peewee', 'Extra Large'],
  'AC4: "  Extra   Large " is saved as "Extra Large", last');

select is(split_part(pg_temp.try_detail('h', format('select public.add_size(%L, gen_random_uuid(), ''   '')', tests.tenant_id_of('h'))), '|', 1),
  'TM008', 'AC4: a blank name is refused (TM008)');
select is(tests.try_as('h', format('select public.add_size(%L, gen_random_uuid(), null)', tests.tenant_id_of('h'))),
  'TM008', 'a null name is refused (TM008)');
select is(tests.try_as('h', format('select public.add_size(%L, gen_random_uuid(), %L)', tests.tenant_id_of('h'), repeat('y', 41))),
  'TM008', 'AC4: a 41-character name is refused (TM008)');
select is(tests.try_as('h', format('select public.add_size(%L, gen_random_uuid(), %L)', tests.tenant_id_of('h'), repeat('y', 40))),
  'ok:1', 'AC4: a 40-character name is accepted');
select is(tests.try_as('h', format('select public.add_size(%L, gen_random_uuid(), %L)', tests.tenant_id_of('h'), repeat(U&'\+01F95A', 41))),
  'TM008', 'AC4: 41 emoji are refused (TM008)');
select is(tests.try_as('h', format('select public.add_size(%L, null, ''Nul'')', tests.tenant_id_of('h'))),
  'TM005', 'a null submission id is refused (TM005)');
select is(pg_temp.is_compact('h'), true, 'sort_order is still compact after several adds');
select is((pg_temp.active_names('h'))[7], repeat('y', 40), 'the 40-character size is the 7th, last');

-- ---------------------------------------------------------------------------------------------
-- rename_size (AC4, AC6, AC7, AC25)
-- ---------------------------------------------------------------------------------------------
create temp table _slots_pre as select pg_temp.slots('h') as s;
select is(tests.try_as('h', format('select public.rename_size(%L, %L, ''Big'')', tests.tenant_id_of('h'), pg_temp.sid('h', 'Large'))),
  'ok:1', 'AC6: rename_size renames');
select is((pg_temp.active_names('h'))[3], 'Big', 'AC6: the renamed size keeps its place');
select is(pg_temp.h_prod(), (select p from _prod0), 'AC25: production is identical after a rename (past days show the new name)');
select is(tests.try_as('h', format('select public.rename_size(%L, %L, ''LARGE'')', tests.tenant_id_of('h'), pg_temp.sid('h', 'Big'))),
  'ok:1', 'AC7: a case-only change to itself is allowed');
select is((pg_temp.active_names('h'))[3], 'LARGE', 'AC7: it is saved as typed');
select is(tests.try_as('h', format('select public.rename_size(%L, %L, ''  Large  '')', tests.tenant_id_of('h'), pg_temp.sid('h', 'LARGE'))),
  'ok:1', 'AC7: renaming back with padding works');
select is(tests.try_as('h', format('select public.rename_size(%L, %L, %L)', tests.tenant_id_of('h'), pg_temp.sid('h', 'Extra Large'), 'Extra    Large')),
  'ok:1', 'AC7: a spacing-only change to itself is allowed (no clash with itself)');
select is((pg_temp.active_names('h'))[6], 'Extra Large', 'the name stays normalised');
select is(tests.try_as('h', format('select public.rename_size(%L, %L, ''Large'')', tests.tenant_id_of('h'), pg_temp.sid('h', 'Large'))),
  'ok:1', 'renaming to its own exact name is a no-op, not an error');
select is(split_part(pg_temp.try_detail('h', format('select public.rename_size(%L, %L, ''small'')', tests.tenant_id_of('h'), pg_temp.sid('h', 'Medium'))), '|', 1),
  'TM009', 'AC4: renaming to another size''s name (any case) is refused (TM009)');
select is(tests.try_as('h', format('select public.rename_size(%L, gen_random_uuid(), ''Zed'')', tests.tenant_id_of('h'))),
  'TM011', 'renaming an unknown size is TM011');
select is(tests.try_as('h', format('select public.rename_size(%L, %L, ''   '')', tests.tenant_id_of('h'), pg_temp.sid('h', 'Medium'))),
  'TM008', 'renaming to a blank name is TM008');
select is(pg_temp.slots('h'), (select s from _slots_pre), 'AC5: renaming never changes any size''s colour');

-- ---------------------------------------------------------------------------------------------
-- reorder_sizes (AC8-AC10, AC25): the FULL wanted order of the active sizes.
-- ---------------------------------------------------------------------------------------------
create temp table _slots1 as select pg_temp.slots('h') as s;
create function pg_temp.reorder_sql(p_names text[]) returns text language sql stable as $$
  select format('select public.reorder_sizes(%L, %L::uuid[])', tests.tenant_id_of('h'),
                (select array_agg(pg_temp.sid('h', n) order by i) from unnest(p_names) with ordinality u(n, i)))
$$;

select is(
  tests.try_as('h', pg_temp.reorder_sql(array['Jumbo', 'Small', 'Medium', 'Large', 'Peewee', 'Extra Large', repeat('y', 40)])),
  'ok:1', 'AC9: reorder_sizes applies a full order');
select is(pg_temp.active_names('h'), array['Jumbo', 'Small', 'Medium', 'Large', 'Peewee', 'Extra Large', repeat('y', 40)],
  'AC9: the new order is stored');
select is(pg_temp.slots('h'), (select s from _slots1), 'AC5, AC9: reordering changes no colour');
select is(pg_temp.h_prod(), (select p from _prod0), 'AC25: reordering changes no egg count');
select is(pg_temp.is_compact('h'), true, 'sort_order is compact after a reorder');
select is(pg_temp.rpc_as('h', pg_temp.reorder_sql(array['Jumbo', 'Small', 'Medium', 'Large', 'Peewee', 'Extra Large', repeat('y', 40)])),
  jsonb_build_object('changed', false), 'AC18: the same order twice is a no-op (changed = false)');
select is(tests.try_as('h', pg_temp.reorder_sql(array['Small', 'Medium', 'Large', 'Peewee', 'Extra Large', repeat('y', 40)])),
  'TM012', 'an order missing an active size is refused (TM012)');
select is(tests.try_as('h', format('select public.reorder_sizes(%L, %L::uuid[])', tests.tenant_id_of('h'),
                                   array[pg_temp.sid('h', 'Small'), pg_temp.sid('h', 'Small')])),
  'TM005', 'a duplicate id is malformed (TM005)');
select is(tests.try_as('h', format('select public.reorder_sizes(%L, array[%L, null]::uuid[])', tests.tenant_id_of('h'), pg_temp.sid('h', 'Small'))),
  'TM005', 'a null id is malformed (TM005)');
select is(tests.try_as('h', format('select public.reorder_sizes(%L, null)', tests.tenant_id_of('h'))),
  'TM005', 'a null list is malformed (TM005)');
select is(tests.try_as('h', format('select public.reorder_sizes(%L, ''{}''::uuid[])', tests.tenant_id_of('h'))),
  'TM012', 'an empty list is not the active set (TM012)');
select is(pg_temp.active_names('h'), array['Jumbo', 'Small', 'Medium', 'Large', 'Peewee', 'Extra Large', repeat('y', 40)],
  'refused reorders changed nothing');

-- ---------------------------------------------------------------------------------------------
-- archive_size (AC11-AC14, AC25) and AC13 through the new path
-- ---------------------------------------------------------------------------------------------
create temp table _slots2 as select pg_temp.slots('h') as s;
create temp table _day0 as
  select pg_temp.rpc_as('h', format('select public.production_days(%L, date ''2026-08-01'', date ''2026-08-02'')', tests.tenant_id_of('h'))) as v;

select is(tests.try_as('h', format('select public.archive_size(%L, %L)', tests.tenant_id_of('h'), pg_temp.sid('h', 'Jumbo'))),
  'ok:1', 'AC11: archive_size archives');
select is(pg_temp.active_names('h'), array['Small', 'Medium', 'Large', 'Peewee', 'Extra Large', repeat('y', 40)],
  'AC12: the archived size is no longer active, the others keep their order');
select is(pg_temp.slots('h'), (select s from _slots2), 'AC5, AC12: archiving changes no size''s colour or name');
select is((select s.archived_at is not null from public.sizes s where s.id = pg_temp.sid('h', 'Jumbo')), true, 'the size is archived, not deleted');
select is(pg_temp.is_compact('h'), true, 'sort_order is compact after an archive, archived last');
select is((select s.sort_order from public.sizes s where s.id = pg_temp.sid('h', 'Jumbo')), 6, 'the archived size sorts after every active one');
select is(pg_temp.h_prod(), (select p from _prod0), 'AC12, AC25: archiving changes no production row');
select is(pg_temp.day_norm(pg_temp.rpc_as('h', format('select public.production_days(%L, date ''2026-08-01'', date ''2026-08-02'')', tests.tenant_id_of('h')))),
  pg_temp.day_norm((select v from _day0)), 'AC12: past days keep every count, including the archived size''s (only its line moves after the active ones)');
select is(tests.try_as('h', format('select public.archive_size(%L, %L)', tests.tenant_id_of('h'), pg_temp.sid('h', 'Jumbo'))),
  'TM012', 'archiving an archived size is refused (TM012)');
select is(tests.try_as('h', format('select public.archive_size(%L, gen_random_uuid())', tests.tenant_id_of('h'))),
  'TM011', 'archiving an unknown size is refused (TM011)');
select is(tests.try_as('h', format('select public.rename_size(%L, %L, ''Jumbo2'')', tests.tenant_id_of('h'), pg_temp.sid('h', 'Jumbo'))),
  'TM012', 'renaming an archived size is refused (TM012)');
select is(tests.try_as('h', pg_temp.reorder_sql(array['Small', 'Medium', 'Large', 'Peewee', 'Extra Large', repeat('y', 40), 'Jumbo'])),
  'TM012', 'a reorder that includes an archived size is refused (TM012)');
select is(
  (split_part(pg_temp.try_detail('h', format('select public.add_size(%L, gen_random_uuid(), ''jumbo'')', tests.tenant_id_of('h'))), '|', 2))::jsonb,
  jsonb_build_object('id', pg_temp.sid('h', 'Jumbo'), 'name', 'Jumbo', 'archived', true),
  'AC4: a name matching an ARCHIVED size is refused with archived = true (points to Restore)');

-- AC13 through the new path: no new eggs on an archived size, but a day that holds it can be edited.
select is(tests.try_as('h', format('select public.log_production(%L, gen_random_uuid(), date ''2026-08-03'', array[%L]::uuid[], array[5], 0)',
                                   tests.tenant_id_of('h'), pg_temp.sid('h', 'Jumbo'))),
  'TM001', 'AC13: log_production onto an archived size is refused (TM001)');
select is(tests.try_as('h', format('insert into public.production (tenant_id, produced_on, size_id, quality, eggs) values (%L, date ''2026-08-05'', %L, ''good'', 5)',
                                   tests.tenant_id_of('h'), pg_temp.sid('h', 'Jumbo'))),
  'TM001', 'AC13: a direct insert of a NEW line for an archived size is refused (TM001)');
select is(tests.try_as('h', format('select public.replace_production_day(%L, date ''2026-08-01'', array[%L, %L, %L]::uuid[], array[11, 20, 31], 4)',
                                   tests.tenant_id_of('h'), pg_temp.sid('h', 'Small'), pg_temp.sid('h', 'Large'), pg_temp.sid('h', 'Jumbo'))),
  'ok:1', 'AC13: Edit day on a day holding an archived size still saves');
select is((select p.eggs from public.production p where p.tenant_id = tests.tenant_id_of('h') and p.produced_on = '2026-08-01' and p.size_id = pg_temp.sid('h', 'Jumbo')),
  31, 'AC13: the archived size''s line was corrected');
create temp table _prod1 as select pg_temp.h_prod() as p;
select is((select array_agg(g ->> 'eggs' order by i) from jsonb_array_elements(
             (pg_temp.rpc_as('h', format('select public.production_days(%L, date ''2026-08-01'', date ''2026-08-01'')', tests.tenant_id_of('h'))) -> 'days' -> 0 -> 'good'))
             with ordinality e(g, i)),
  array['11', '20', '31'], 'the archived size''s line comes after the active sizes on the day');

-- Restore (AC16).
select is(tests.try_as('h', format('select public.restore_size(%L, %L)', tests.tenant_id_of('h'), pg_temp.sid('h', 'Small'))),
  'TM012', 'restoring an active size is refused (TM012)');
select is(tests.try_as('h', format('select public.restore_size(%L, gen_random_uuid())', tests.tenant_id_of('h'))),
  'TM011', 'restoring an unknown size is refused (TM011)');
select is(tests.try_as('h', format('select public.restore_size(%L, %L)', tests.tenant_id_of('h'), pg_temp.sid('h', 'Jumbo'))),
  'ok:1', 'AC16: restore_size restores');
select is(pg_temp.active_names('h'), array['Small', 'Medium', 'Large', 'Peewee', 'Extra Large', repeat('y', 40), 'Jumbo'],
  'AC16: the restored size is last among the active ones');
select is(pg_temp.slots('h'), (select s from _slots2), 'AC16: name and colour are unchanged by archive and restore');
select is(pg_temp.is_compact('h'), true, 'sort_order is compact after a restore');
select is((select s.archived_at is null from public.sizes s where s.id = pg_temp.sid('h', 'Jumbo')), true, 'AC16: the restored size is active');
select is(pg_temp.h_prod(), (select p from _prod1), 'AC16, AC25: archive and restore changed no production row (the Edit day correction is the only change)');

-- The last active size (AC14): archive one at a time down to one; the last is refused and nothing changes.
select is(tests.try_as('h', format('select public.archive_size(%L, %L)', tests.tenant_id_of('h'), pg_temp.sid('h', 'Small'))), 'ok:1', 'archive 1 of 7');
select is(tests.try_as('h', format('select public.archive_size(%L, %L)', tests.tenant_id_of('h'), pg_temp.sid('h', 'Medium'))), 'ok:1', 'archive 2 of 7');
select is(tests.try_as('h', format('select public.archive_size(%L, %L)', tests.tenant_id_of('h'), pg_temp.sid('h', 'Large'))), 'ok:1', 'archive 3 of 7');
select is(tests.try_as('h', format('select public.archive_size(%L, %L)', tests.tenant_id_of('h'), pg_temp.sid('h', 'Peewee'))), 'ok:1', 'archive 4 of 7');
select is(tests.try_as('h', format('select public.archive_size(%L, %L)', tests.tenant_id_of('h'), pg_temp.sid('h', 'Extra Large'))), 'ok:1', 'archive 5 of 7');
select is(tests.try_as('h', format('select public.archive_size(%L, %L)', tests.tenant_id_of('h'), pg_temp.sid('h', repeat('y', 40)))), 'ok:1', 'archive 6 of 7');
select is(tests.try_as('h', format('select public.archive_size(%L, %L)', tests.tenant_id_of('h'), pg_temp.sid('h', 'Jumbo'))),
  'TM010', 'AC14: archive_size on the last active size is refused (TM010)');
select is(pg_temp.active_names('h'), array['Jumbo'], 'AC14: the last size is still active, nothing changed');
select is(pg_temp.is_compact('h'), true, 'sort_order is compact with one active size');

-- =============================================================================================
-- Security audit fixes (M10 sizes_hardening): L-1, M-2, M-1, L-2. Farm I: Small, Medium, Large, Jumbo.
-- =============================================================================================
create function pg_temp.try_msg(p_who text, p_sql text) returns text language plpgsql as $$
declare
  v_state text;
  v_msg   text;
begin
  begin
    perform tests.authenticate_as(p_who);
    execute p_sql;
    perform tests.clear_authentication();
    return 'ok';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    perform tests.clear_authentication();
    return v_state || '|' || v_msg;
  end;
end
$$;

-- ---- L-1: another farm's tenant_id is refused BEFORE its advisory lock is taken. ----
-- The message is the trigger's own (the RLS WITH CHECK, which runs later, words it differently), which proves the
-- trigger fired first; the source check pins the order (refusal before the lock). QA/audit ran the two-session
-- recipe: farm B holding its lock no longer blocks A's cross-farm insert.
select is(
  pg_temp.try_msg('i', format('insert into public.sizes (tenant_id, name) values (%L, ''Pwned'')', tests.tenant_id_of('f'))),
  '42501|row is not for the caller''s farm', 'L-1: a size insert naming another farm is refused by the guard trigger, before the RLS check');
select is(
  pg_temp.try_msg('i', format('insert into public.size_submissions (tenant_id, id, size_id, name) values (%L, gen_random_uuid(), gen_random_uuid(), ''x'')', tests.tenant_id_of('f'))),
  '42501|row is not for the caller''s farm', 'L-1: a ledger insert naming another farm is refused by its guard trigger');
select lives_ok(
  format('insert into public.sizes (tenant_id, name) values (%L, ''Fixture'')', tests.tenant_id_of('f')),
  'L-1: postgres (provisioning, fixtures) can still insert into any farm');
select ok(
  position('42501' in (select p.prosrc from pg_proc p where p.oid = 'app.sizes_write_guard()'::regprocedure))
    < position('lock_tenant_sizes' in (select p.prosrc from pg_proc p where p.oid = 'app.sizes_write_guard()'::regprocedure))
  and position('42501' in (select p.prosrc from pg_proc p where p.oid = 'app.sizes_write_guard()'::regprocedure)) > 0,
  'L-1: sizes_write_guard raises 42501 before it takes the lock');
select ok(
  position('42501' in (select p.prosrc from pg_proc p where p.oid = 'app.size_submissions_guard()'::regprocedure))
    < position('lock_tenant_sizes' in (select p.prosrc from pg_proc p where p.oid = 'app.size_submissions_guard()'::regprocedure))
  and position('42501' in (select p.prosrc from pg_proc p where p.oid = 'app.size_submissions_guard()'::regprocedure)) > 0,
  'L-1: size_submissions_guard raises 42501 before it takes the lock');

-- ---- M-2: a raw name over 200 characters is refused before any work; 100 ids is the reorder limit. ----
select is(tests.try_as('i', format('select public.add_size(%L, gen_random_uuid(), %L)', tests.tenant_id_of('i'), repeat('x', 201))),
  'TM008', 'M-2: add_size refuses a 201-character name (TM008)');
select is(tests.try_as('i', format('select public.add_size(%L, gen_random_uuid(), %L)', tests.tenant_id_of('i'), repeat(' ', 201) || 'a')),
  'TM008', 'M-2: the cap looks at the RAW name: 201 spaces plus "a" (which would normalise to "a") is refused');
select is(tests.try_as('i', format('select public.add_size(%L, gen_random_uuid(), %L)', tests.tenant_id_of('i'), repeat(' ', 190) || 'Zed')),
  'ok:1', 'M-2: a name padded with 190 spaces (under the cap) is still normalised and saved');
select is(tests.try_as('i', format('select public.add_size(%L, gen_random_uuid(), %L)', tests.tenant_id_of('i'), repeat('x', 5000000))),
  'TM008', 'M-2: add_size refuses a 5,000,000-character name (TM008)');
select is(tests.try_as('i', format('select public.rename_size(%L, %L, %L)', tests.tenant_id_of('i'), pg_temp.sid('i', 'Medium'), repeat('x', 201))),
  'TM008', 'M-2: rename_size refuses a 201-character name (TM008)');
select is(tests.try_as('i', format('select public.rename_size(%L, %L, %L)', tests.tenant_id_of('i'), pg_temp.sid('i', 'Medium'), repeat(' ', 201) || 'Q')),
  'TM008', 'M-2: rename_size looks at the raw name too');
select is(tests.try_as('i', format('select public.rename_size(%L, %L, %L)', tests.tenant_id_of('i'), pg_temp.sid('i', 'Medium'), repeat(' ', 190) || 'Zed2')),
  'ok:1', 'M-2: rename_size accepts a name padded with 190 spaces');
select is(tests.try_as('i', format('insert into public.sizes (tenant_id, name) values (%L, %L)', tests.tenant_id_of('i'), repeat('x', 201))),
  'TM008', 'M-2: a direct insert of a 201-character name is refused by the trigger (TM008), before normalising');
select is(tests.try_as('i', format('insert into public.sizes (tenant_id, name) values (%L, %L)', tests.tenant_id_of('i'), repeat('x', 5000000))),
  'TM008', 'M-2: a direct insert of a 5,000,000-character name is refused (TM008)');
select is(tests.try_as('i', format('update public.sizes set name = %L where id = %L', repeat('x', 201), pg_temp.sid('i', 'Small'))),
  'TM008', 'M-2: a direct rename to a 201-character name is refused by the trigger (TM008)');
select is(tests.try_as('i', format('select public.reorder_sizes(%L, %L::uuid[])', tests.tenant_id_of('i'),
                                   array(select gen_random_uuid() from generate_series(1, 101)))),
  'TM005', 'M-2: reorder_sizes refuses more than 100 ids before counting them (TM005)');
select is(tests.try_as('i', format('select public.reorder_sizes(%L, %L::uuid[])', tests.tenant_id_of('i'),
                                   array(select gen_random_uuid() from generate_series(1, 100)))),
  'TM012', 'M-2: 100 ids is within the limit and is judged as a stale list (TM012)');

-- ---- M-1: the ledger name is capped at 40; the insert grant is column-limited; a farm's ledger holds 100 rows. ----
select is(tests.try_as('i', format('insert into public.size_submissions (tenant_id, id, size_id, name) values (%L, gen_random_uuid(), %L, %L)',
                                   tests.tenant_id_of('i'), pg_temp.sid('i', 'Small'), repeat('x', 41))),
  '23514', 'M-1: a 41-character ledger name fails the length check');
select is(tests.try_as('i', format('insert into public.size_submissions (tenant_id, id, size_id, name) values (%L, gen_random_uuid(), %L, %L)',
                                   tests.tenant_id_of('i'), pg_temp.sid('i', 'Small'), repeat('x', 40))),
  'ok:1', 'M-1: a 40-character ledger name is accepted');
select is(tests.try_as('i', format('insert into public.size_submissions (tenant_id, id, size_id, name, created_at) values (%L, gen_random_uuid(), %L, ''x'', now())',
                                   tests.tenant_id_of('i'), pg_temp.sid('i', 'Small'))),
  '42501', 'M-1: an owner cannot choose created_at on the ledger (column grant)');
select is(tests.try_as('i', format('insert into public.size_submissions (tenant_id, id, size_id, name, updated_at) values (%L, gen_random_uuid(), %L, ''x'', now())',
                                   tests.tenant_id_of('i'), pg_temp.sid('i', 'Small'))),
  '42501', 'M-1: an owner cannot choose updated_at on the ledger (column grant)');

-- ---- L-2: sort_order is 0..100000; add_size, restore_size and a direct insert survive a size pushed to the limit. ----
select is(tests.try_as('i', format('update public.sizes set sort_order = 100001 where id = %L', pg_temp.sid('i', 'Jumbo'))),
  '23514', 'L-2: sort_order 100001 is refused');
select is(tests.try_as('i', format('update public.sizes set sort_order = -1 where id = %L', pg_temp.sid('i', 'Jumbo'))),
  '23514', 'L-2: a negative sort_order is refused');
select is(tests.try_as('i', format('update public.sizes set sort_order = 2147483647 where id = %L', pg_temp.sid('i', 'Jumbo'))),
  '23514', 'L-2: sort_order 2147483647 (the audit''s attack) is refused with a check violation, not an overflow');
select is(tests.try_as('i', format('update public.sizes set sort_order = 100000 where id = %L', pg_temp.sid('i', 'Jumbo'))),
  'ok:1', 'L-2: sort_order 100000 is the largest allowed value');
select is(tests.try_as('i', format('select public.add_size(%L, gen_random_uuid(), ''Peewee'')', tests.tenant_id_of('i'))),
  'ok:1', 'L-2: add_size still works when a size sits at sort_order 100000');
select is((pg_temp.active_names('i'))[array_length(pg_temp.active_names('i'), 1)],
  'Peewee', 'L-2: the new size is last');
select is(pg_temp.is_compact('i'), true, 'L-2: sort_order is compact again after that add_size');

select is(tests.try_as('i', format('select public.archive_size(%L, %L)', tests.tenant_id_of('i'), pg_temp.sid('i', 'Jumbo'))),
  'ok:1', 'L-2: (setup) archive Jumbo');
select is(tests.try_as('i', format('update public.sizes set sort_order = 100000 where id = %L', pg_temp.sid('i', 'Peewee'))),
  'ok:1', 'L-2: (setup) an active size is pushed to sort_order 100000');
select is(tests.try_as('i', format('select public.restore_size(%L, %L)', tests.tenant_id_of('i'), pg_temp.sid('i', 'Jumbo'))),
  'ok:1', 'L-2: restore_size still works (it compacts before computing max + 1)');
select is((pg_temp.active_names('i'))[array_length(pg_temp.active_names('i'), 1)], 'Jumbo', 'L-2: the restored size is last among the active ones');
select is(pg_temp.is_compact('i'), true, 'L-2: sort_order is compact after the restore');

select is(tests.try_as('i', format('update public.sizes set sort_order = 100000 where id = %L', pg_temp.sid('i', 'Small'))),
  'ok:1', 'L-2: (setup) another size is pushed to sort_order 100000');
select is(tests.try_as('i', format('insert into public.sizes (tenant_id, name) values (%L, ''Direct'')', tests.tenant_id_of('i'))),
  'ok:1', 'L-2: a direct insert still works (the trigger caps its position at 100000)');
select is((select s.sort_order from public.sizes s where s.id = pg_temp.sid('i', 'Direct')), 100000,
  'L-2: the direct insert got the capped position');
select is(tests.try_as('i', format('select public.add_size(%L, gen_random_uuid(), ''After'')', tests.tenant_id_of('i'))),
  'ok:1', 'L-2: add_size works after that too');
select is(pg_temp.is_compact('i'), true, 'L-2: sort_order is compact again');

-- ---- M-1 + QA S1 (feature 03 QA): one ledger row per size, so an owner can't fill the ledger and brick add_size. ----
-- Before, the ledger was only capped (100 rows): an owner could write 100 rows through PostgREST and then add_size could
-- not write its own ledger row (a 500 for that farm, with no way to delete the rows). Now UNIQUE (tenant_id, size_id):
-- the ledger can't outgrow the size count, and add_size's row is always for a size created a moment ago.
select is(
  (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'size_submissions_size_key' and c.conrelid = 'public.size_submissions'::regclass),
  'UNIQUE (tenant_id, size_id)', 'QA S1: the size ledger has one row per size (the key starts with tenant_id)');
select is(tests.try_as('i', format('insert into public.size_submissions (tenant_id, id, size_id, name) select %L, gen_random_uuid(), %L, ''fill'' from generate_series(1, 100)',
                                   tests.tenant_id_of('i'), pg_temp.sid('i', 'Small'))),
  '23505', 'QA S1: filling the ledger with 100 rows for one size is refused (23505)');
select ok(tests.try_as('i', format('insert into public.size_submissions (tenant_id, id, size_id, name) select %L, gen_random_uuid(), s.id, ''fill'' from public.sizes s where s.tenant_id = %L and not exists (select 1 from public.size_submissions x where x.size_id = s.id)',
                                   tests.tenant_id_of('i'), tests.tenant_id_of('i'))) like 'ok:%',
  'QA S1: an owner can write one ledger row for every size that has none (the most the key allows)');
select is((select count(*) from public.size_submissions where tenant_id = tests.tenant_id_of('i')),
          (select count(*) from public.sizes where tenant_id = tests.tenant_id_of('i')),
  'QA S1: the ledger now holds exactly one row per size');
create temp table _s1 as select '00000000-0000-4000-8000-0000000000c1'::uuid as s_new;
grant select on _s1 to authenticated;
select is(pg_temp.rpc_as('i', format('select public.add_size(%L, %L, ''Still Works'')', tests.tenant_id_of('i'), (select s_new from _s1))) ->> 'replayed', 'false',
  'QA S1: add_size still works after that attack (its ledger row is for a brand-new size)');
select is(pg_temp.rpc_as('i', format('select public.add_size(%L, %L, ''Still Works'')', tests.tenant_id_of('i'), (select s_new from _s1))) ->> 'replayed', 'true',
  'QA S1: ... and its replay still works');
select is(tests.try_as('i', format('insert into public.size_submissions (tenant_id, id, size_id, name) values (%L, gen_random_uuid(), %L, ''x'')',
                                   tests.tenant_id_of('i'), pg_temp.sid('i', 'Small'))),
  '23505', 'QA S1: a second direct row for a size that already has one is refused');

-- The boundary: a farm at 99 sizes with a ledger row for each (the attacker's maximum) can still add the 100th.
insert into public.sizes (tenant_id, name)
  select tests.tenant_id_of('o'), 'O' || g from generate_series(1, 95) g;
select is((select count(*) from public.sizes where tenant_id = tests.tenant_id_of('o')), 99::bigint, 'QA S1: farm O has 99 sizes');
select is(tests.try_as('o', format('insert into public.size_submissions (tenant_id, id, size_id, name) select %L, gen_random_uuid(), s.id, ''fill'' from public.sizes s where s.tenant_id = %L',
                                   tests.tenant_id_of('o'), tests.tenant_id_of('o'))),
  'ok:99', 'QA S1: ... and fills its ledger with 99 rows (one per size)');
create temp table _s1o as select '00000000-0000-4000-8000-0000000000c2'::uuid as s_new;
grant select on _s1o to authenticated;
select is(pg_temp.rpc_as('o', format('select public.add_size(%L, %L, ''Hundredth'')', tests.tenant_id_of('o'), (select s_new from _s1o))) ->> 'replayed', 'false',
  'QA S1: add_size still adds the 100th size (the ledger''s 100-row backstop is not in its way)');
select is(pg_temp.rpc_as('o', format('select public.add_size(%L, %L, ''Hundredth'')', tests.tenant_id_of('o'), (select s_new from _s1o))) ->> 'replayed', 'true',
  'QA S1: ... and its replay works at 100 sizes and 100 ledger rows');
select is((select count(*) from public.size_submissions where tenant_id = tests.tenant_id_of('o')), 100::bigint, 'QA S1: farm O ends with 100 ledger rows');
select is(tests.try_as('o', format('insert into public.size_submissions (tenant_id, id, size_id, name) values (%L, gen_random_uuid(), %L, ''x'')',
                                   tests.tenant_id_of('o'), (select s.id from public.sizes s where s.tenant_id = tests.tenant_id_of('o') limit 1))),
  'TM016', 'QA S1: the 100-row backstop still answers a 101st ledger row (TM016) for an owner');
select throws_ok(format('insert into public.size_submissions (tenant_id, id, size_id, name) values (%L, gen_random_uuid(), %L, ''x'')',
                        tests.tenant_id_of('o'), (select s.id from public.sizes s where s.tenant_id = tests.tenant_id_of('o') limit 1)),
  'TM016', null, 'M-1: and for postgres');
select is((select count(*) from public.size_submissions where tenant_id = tests.tenant_id_of('f')), 0::bigint, 'M-1: another farm''s ledger is not affected by the cap');

select * from finish();
rollback;
