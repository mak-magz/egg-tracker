-- 060_clients: client rules (M12), functions (M13) and the currency column (M11).
-- docs/features/03-clients.md §3.1, §3.6. Rules are exercised directly (as the farm owner, and as postgres for what an
-- owner may not do); the four functions run as the owner, exactly as the server calls them. Concurrency (two adds at
-- once, two adds at 499 clients) can't be tested in one session: the manual recipe is in §4 / §5.
begin;
select plan(302);

select tests.create_farm('Farm J', 'j');   -- direct writes: names, phones, prices, column grants
select tests.create_farm('Farm K', 'k');   -- the 500 cap and the ledger cap
select tests.create_farm('Farm L', 'l');   -- the four functions
select tests.create_farm('Farm M', 'm');   -- AC27 (production untouched) and currency
select tests.create_farm('Farm N', 'n');   -- the ledger boundary (QA S1)

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

-- 'ok', or '<SQLSTATE>|<hint>|<detail>|<message>' (tests.try_as only returns the SQLSTATE).
create function pg_temp.try_detail(p_who text, p_sql text) returns text language plpgsql as $$
declare
  v_state  text;
  v_hint   text;
  v_detail text;
  v_msg    text;
begin
  begin
    perform tests.authenticate_as(p_who);
    execute p_sql;
    perform tests.clear_authentication();
    return 'ok';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_detail = pg_exception_detail,
                            v_msg = message_text;
    perform tests.clear_authentication();
    return v_state || '|' || coalesce(v_hint, '') || '|' || coalesce(v_detail, '') || '|' || v_msg;
  end;
end
$$;

-- Runs p_sql as the current role (postgres) and returns 'ok' or the SQLSTATE. A failed statement is rolled back, a
-- successful one stays in the transaction.
create function pg_temp.try_pg(p_sql text) returns text language plpgsql as $$
declare
  v_state text;
begin
  begin
    execute p_sql;
    return 'ok';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    return v_state;
  end;
end
$$;

-- SQL of a direct insert as farm p_who (the trigger normalises and validates; p_price is a numeric literal or null).
create function pg_temp.ins_sql(p_who text, p_name text, p_phone text, p_price text) returns text language sql as $$
  select format('insert into public.clients (tenant_id, name, phone, default_price) values (%L, %L, %L, %L::numeric)',
                tests.tenant_id_of(p_who), p_name, p_phone, p_price)
$$;

-- tests.try_as's 'ok:1' or the SQLSTATE of a direct insert.
create function pg_temp.ins(p_who text, p_name text, p_phone text default null, p_price text default null)
  returns text language sql as $$
  select tests.try_as(p_who, pg_temp.ins_sql(p_who, p_name, p_phone, p_price))
$$;

-- '<SQLSTATE>|<hint>' of a direct insert (or 'ok|').
create function pg_temp.ins_hint(p_who text, p_name text, p_phone text default null, p_price text default null)
  returns text language sql as $$
  select split_part(t, '|', 1) || '|' || split_part(t, '|', 2)
  from (select pg_temp.try_detail(p_who, pg_temp.ins_sql(p_who, p_name, p_phone, p_price)) as t) x
$$;

create function pg_temp.cid(p_who text, p_name text) returns uuid language sql stable as $$
  select c.id from public.clients c where c.tenant_id = tests.tenant_id_of(p_who) and c.name = p_name
$$;

create function pg_temp.n_clients(p_who text) returns bigint language sql stable as $$
  select count(*) from public.clients c where c.tenant_id = tests.tenant_id_of(p_who)
$$;

-- A client as one text (name, phone, price, inactive?, version), or 'none'.
create function pg_temp.row_of(p_id uuid) returns text language sql stable as $$
  select coalesce((select row(c.name, c.phone, c.default_price, c.archived_at is not null, c.version)::text
                   from public.clients c where c.id = p_id), 'none')
$$;

-- ---------------------------------------------------------------------------------------------
-- app.normalize_client_name / normalize_client_phone / client_text_invalid (AC10, AC12): the SQL twins of the
-- helpers in shared/utils/client-name.ts.
-- ---------------------------------------------------------------------------------------------
select is(app.normalize_client_name('  Maple   Street  Market '), 'Maple Street Market', 'AC10: trims and collapses runs of spaces in a name');
select is(app.normalize_client_name(U&'A\0009\000A B\00A0\00A0C'), 'A B C', 'AC10: tabs, newlines and no-break spaces are spaces in a name');
select is(app.normalize_client_name(U&'Cafe\0301'), app.normalize_client_name(U&'Caf\00E9'), 'AC11: composed and decomposed accents are one name (NFC)');
select is(app.normalize_client_name('  O''Brien''s  '), 'O''Brien''s', 'AC10: punctuation is kept');
select is(app.normalize_client_name('  pEEwee '), 'pEEwee', 'AC10: case is kept as typed');

select is(app.normalize_client_phone('  (555) 201-3348  '), '(555) 201-3348', 'AC12: a phone is trimmed and its inside kept');
select is(app.normalize_client_phone('+63  917 123   4567'), '+63  917 123   4567', 'AC12: inner runs of spaces in a phone are NOT collapsed');
select is(app.normalize_client_phone(U&'\00A0\FEFF 555-2013 ext 4\2003'), '555-2013 ext 4', 'AC12: NBSP, BOM and em space at the ends are trimmed');
select is(app.normalize_client_phone('   '), null, 'AC12: a blank phone becomes null');
select is(app.normalize_client_phone(''), null, 'AC12: an empty phone becomes null');
select is(app.normalize_client_phone(null), null, 'AC12: a null phone stays null');
select is(app.normalize_client_phone(U&'Cafe\0301'), U&'Caf\00E9', 'AC12: a phone is NFC-normalised');

select is(app.client_text_invalid('Sam & Dana Coyle'), false, 'AC10: an ampersand is fine');
select is(app.client_text_invalid(U&'The Green Table Caf\00E9'), false, 'AC10: an accent is fine');
select is(app.client_text_invalid(U&'Egg \+01F95A'), false, 'AC10: an emoji is fine');
select is(app.client_text_invalid(U&'a\FEFFb'), false, 'AC10: U+FEFF is whitespace (trimmed elsewhere), not "invalid"');
select is(app.client_text_invalid(U&'a\00A0b'), false, 'AC10: NBSP is whitespace, not "invalid"');
select is(
  array(select to_hex(cp) from unnest(array[1, 31, 127, 133, 159, 173, 847, 1564, 4447, 4448, 6068, 6069, 6155, 6159, 8203, 8204, 8205, 8206, 8207, 8234, 8238, 8288, 8293, 8303, 10240, 12644, 65024, 65039, 65440, 65520, 65529, 65531, 113824, 113827, 119155, 119162, 917504, 917631, 917760, 921599]) cp
        where not app.client_text_invalid(chr(cp))),
  '{}'::text[],
  'AC10: every control, invisible and blank-looking range edge is refused by client_text_invalid (QA S2: U+034F, 115F-1160, 17B4-17B5, 180B-180F, 2060-206F, 2800, 3164, FE00-FE0F, FFA0, FFF0-FFFB, 1BCA0-1BCA3, 1D173-1D17A, E0000-E0FFF)');
select is(
  array(select to_hex(cp) from unnest(array[32, 126, 160, 174, 846, 848, 1565, 4446, 4449, 6067, 6070, 6154, 6160, 8202, 8208, 8233, 8239, 8304, 10239, 10241, 12643, 12645, 65023, 65040, 65279, 65439, 65441, 65519, 65532, 113823, 113828, 119154, 119163, 921600]) cp
        where app.client_text_invalid(chr(cp))),
  '{}'::text[],
  'AC10: the characters just outside each range are allowed (U+FEFF is whitespace, trimmed elsewhere)');
select is(app.client_text_invalid(U&'\2801\2803'), false, 'QA S2: real braille (not the blank pattern) is fine');
select is(app.client_text_invalid(U&'\3163\3165'), false, 'QA S2: the Hangul letters next to the filler are fine');
select is(app.client_text_invalid(U&'a\FE0Fb'), true, 'QA S2: a variation selector inside a name is refused (decision: every default-ignorable character is refused)');

-- app.client_text_visible (audit L3): at least one letter, number, symbol or punctuation character. The twin of
-- hasVisibleClientTextChar(); tests/unit/client-name-parity.spec.ts compares the two over every code point.
select is(app.client_text_visible('Maple'), true, 'L3: letters are visible');
select is(app.client_text_visible('7'), true, 'L3: a digit is visible');
select is(app.client_text_visible('#-'), true, 'L3: symbols and punctuation are visible');
select is(app.client_text_visible(U&'\4E2D'), true, 'L3: a CJK letter is visible (found by the big class, not the ASCII one)');
select is(app.client_text_visible(U&'\+01F95A'), true, 'L3: an emoji is visible');
select is(app.client_text_visible(U&'e\0301'), true, 'L3: a letter with a combining mark is visible');
select is(app.client_text_visible('z' || repeat(chr(769), 59)), true, 'L3: a letter with 59 marks is visible (no cap on marks: not done)');
select is(app.client_text_visible(U&'\0301'), false, 'L3: a lone combining mark is not visible');
select is(app.client_text_visible(repeat(chr(769), 60)), false, 'L3: a stack of marks alone is not visible');
select is(
  array(select to_hex(cp) from unnest(array[32, 160, 768, 769, 888, 1536, 4095, 8232, 57344, 65532, 78896, 983040, 1114111]) cp
        where app.client_text_visible(chr(cp))),
  '{}'::text[],
  'L3: a space, NBSP, a mark, unassigned U+0378 and U+0FFF, U+0600, U+2028, private use, U+FFFC, U+13430 and a noncharacter are not visible');
select is(app.client_text_visible(''), false, 'L3: an empty text is not visible');
select is(app.client_text_visible(null), null, 'L3: null stays null (a CHECK passes it; the columns say when null is allowed)');
select is(
  (select count(*) from generate_series(1, 1114111) cp where cp not between 55296 and 57343 and app.client_text_visible(chr(cp))),
  157068::bigint,
  'L3: exactly 157,068 code points are visible (Unicode 17.0, U+FFFC excepted; regenerate the class and this number together)');

-- ---------------------------------------------------------------------------------------------
-- Direct writes as the owner (farm J): the M12 trigger, checks and grants hold on EVERY write path.
-- ---------------------------------------------------------------------------------------------
select is(pg_temp.ins('j', '  Maple   Street  Market '), 'ok:1', 'AC8: an owner can insert a client with just (tenant_id, name)');
select isnt(pg_temp.cid('j', 'Maple Street Market'), null, 'AC10: a padded, spaced name is saved normalised');
select is(
  (select row(c.phone, c.default_price, c.archived_at, c.version)::text from public.clients c where c.id = pg_temp.cid('j', 'Maple Street Market')),
  row(null, null, null, 1)::text, 'AC8: phone and price are none, active, version 1');

-- Name rules (AC10)
select is(pg_temp.ins_hint('j', '   '), 'TM017|blank', 'AC10: a blank name is refused (TM017 blank)');
select is(pg_temp.ins_hint('j', U&' \00A0\0009 '), 'TM017|blank', 'AC10: a name of only NBSP and a tab is blank');
select is(pg_temp.ins('j', repeat('x', 60)), 'ok:1', 'AC10: a 60-character name is accepted');
select is(pg_temp.ins_hint('j', repeat('y', 61)), 'TM017|too_long', 'AC10: a 61-character name is refused (TM017 too_long)');
select is(pg_temp.ins('j', repeat(U&'\+01F95A', 60)), 'ok:1', 'AC10: 60 emoji count as 60 characters (code points)');
select is(pg_temp.ins_hint('j', repeat(U&'\+01F95A', 61)), 'TM017|too_long', 'AC10: 61 emoji are refused');
select is(pg_temp.ins_hint('j', repeat('z', 201)), 'TM017|too_long', 'AC10: a raw name over 200 characters is refused before it is normalised (audit M-2)');
select is(pg_temp.ins_hint('j', repeat(' ', 300) || 'Padded'), 'TM017|too_long', 'AC10: 300 spaces before a short name are refused by the raw cap, not trimmed');
select is(pg_temp.ins('j', 'Sam & Dana Coyle'), 'ok:1', 'AC10: "Sam & Dana Coyle" saves');
select is(pg_temp.ins('j', 'O''Brien''s'), 'ok:1', 'AC10: "O''Brien''s" saves');
select is(pg_temp.ins('j', U&'The Green Table Caf\00E9'), 'ok:1', 'AC10: "The Green Table Café" saves');
select is(
  array(select c.name from public.clients c where c.tenant_id = tests.tenant_id_of('j') and c.name in ('Sam & Dana Coyle', 'O''Brien''s', U&'The Green Table Caf\00E9') order by 1),
  array['O''Brien''s', 'Sam & Dana Coyle', U&'The Green Table Caf\00E9'], 'AC10: those names are kept exactly as typed');

-- Hidden characters, by a direct insert (the bypass) and a direct update.
select is(
  array(select to_hex(cp) from unnest(array[1, 127, 133, 173, 8203, 8204, 8205, 8206, 8238, 8288, 917505]) cp
        where pg_temp.ins_hint('j', 'Hidden' || chr(cp) || 'Name') <> 'TM017|invalid'),
  '{}'::text[],
  'AC10: a direct insert with U+0001, 007F, 0085, 00AD, 200B, 200C, 200D, 200E, 202E, 2060 or E0001 in the name is refused (TM017 invalid)');
select is(pg_temp.ins('j', U&'Bom\FEFF'), 'ok:1', 'AC10: U+FEFF at the end is trimmed like a space, and the client saves');
select isnt(pg_temp.cid('j', 'Bom'), null, 'AC10: ... as "Bom"');
select is(pg_temp.ins('j', E'Tab\tSeparated'), 'ok:1', 'AC10: a tab inside a name is a space');
select isnt(pg_temp.cid('j', 'Tab Separated'), null, 'AC10: ... "Tab Separated"');
select is(
  split_part(pg_temp.try_detail('j', format('update public.clients set name = %L where id = %L', U&'Bad\200BName', pg_temp.cid('j', 'Bom'))), '|', 1),
  'TM017', 'AC10: a direct UPDATE to a name with a zero-width space is refused too');
select is(pg_temp.row_of(pg_temp.cid('j', 'Bom')), row('Bom', null, null::numeric, false, 1)::text, 'AC10: ... and the row is unchanged');

-- QA S2: characters that draw nothing (Hangul fillers, braille blank, variation selectors, ...) are refused by every
-- write path, in a name and in a phone, alone or inside text. Codes: 3164, 2800, 115F, 1160, FE0F, 034F, 17B4, 17B5,
-- FFA0, 180B, 180C, 180D, FE00, FE0E, E0100, and the joiners 200C, 200D (the owner keeps refusing those).
select is(
  array(select to_hex(cp) from unnest(array[12644, 10240, 4447, 4448, 65039, 847, 6068, 6069, 65440, 6155, 6156, 6157, 65024, 65038, 917760, 8204, 8205]) cp
        where pg_temp.ins_hint('j', chr(cp)) <> 'TM017|invalid'),
  '{}'::text[],
  'QA S2: a direct insert of a name made only of one blank-looking character is refused (TM017 invalid), not saved as an empty card');
select is(pg_temp.ins_hint('j', '  ' || chr(12644) || '  ' || chr(10240) || ' '), 'TM017|invalid', 'QA S2: spaces around blank-looking characters do not make a name (TM017 invalid)');
select is(
  array(select to_hex(cp) from unnest(array[12644, 10240, 4447, 65039, 847, 6068, 65440, 6155, 65024, 917760]) cp
        where pg_temp.ins_hint('j', 'Maple' || chr(cp) || 'Market') <> 'TM017|invalid'),
  '{}'::text[],
  'QA S2: a blank-looking character inside a name is refused too');
select is(
  array(select to_hex(cp) from unnest(array[12644, 10240, 65039, 847, 65440]) cp
        where pg_temp.ins_hint('j', 'Phone Blank Looking', chr(cp)) <> 'TM018|invalid'),
  '{}'::text[],
  'QA S2: the same characters in a phone are refused (TM018 invalid)');
select is(pg_temp.ins('j', U&'\2801\2803 Dots'), 'ok:1', 'QA S2: real braille letters (U+2801, U+2803) are still fine in a name');
select is(
  split_part(pg_temp.try_detail('j', format('update public.clients set name = %L where id = %L', chr(12644), pg_temp.cid('j', 'Bom'))), '|', 1),
  'TM017', 'QA S2: a direct UPDATE of a name to a Hangul filler is refused');
select is(
  split_part(pg_temp.try_detail('j', format('update public.clients set phone = %L where id = %L', 'x' || chr(10240), pg_temp.cid('j', 'Bom'))), '|', 1),
  'TM018', 'QA S2: a direct UPDATE of a phone with a braille blank is refused');
select is(pg_temp.row_of(pg_temp.cid('j', 'Bom')), row('Bom', null, null::numeric, false, 1)::text, 'QA S2: ... and the row is unchanged');
-- The CHECK constraints refuse them too, with the trigger off.
alter table public.clients disable trigger clients_write_guard;
select is(pg_temp.ins('j', chr(12644)), '23514', 'QA S2: the hidden-character check holds without the trigger (Hangul filler)');
select is(pg_temp.ins('j', 'Check Blank Phone', chr(10240)), '23514', 'QA S2: ... and for a phone (braille blank)');
alter table public.clients enable trigger clients_write_guard;

-- Audit L3: a name (and a phone) with no letter, number, symbol or punctuation is refused by every write path, even
-- when no character in it is on the hidden-character list. Codes: FFFC, 0301, 0600, 13430, E000, 0378, 0FFF, F0000, 10FFFF.
select is(
  array(select to_hex(cp) from unnest(array[65532, 769, 1536, 78896, 57344, 888, 4095, 983040, 1114111]) cp
        where pg_temp.ins_hint('j', chr(cp)) <> 'TM017|invalid'),
  '{}'::text[],
  'L3: a direct insert of a name made only of U+FFFC, a lone mark, U+0600, U+13430, private use, an unassigned or a noncharacter code point is refused (TM017 invalid)');
select is(pg_temp.ins_hint('j', repeat(chr(769), 60)), 'TM017|invalid', 'L3: a 60-mark stack alone is refused (TM017 invalid)');
select is(pg_temp.ins_hint('j', repeat(chr(769), 61)), 'TM017|invalid', 'L3: the order holds: no visible character is reported before too long');
select is(pg_temp.ins_hint('j', 'a' || repeat(chr(769), 61)), 'TM017|too_long', 'L3: ... and a letter with 61 marks is too long, not invalid');
select is(pg_temp.ins_hint('j', '  ' || chr(57344) || '  ' || chr(769) || ' '), 'TM017|invalid', 'L3: spaces around private use and a mark do not make a name (TM017 invalid, not blank)');
select is(
  array(select to_hex(cp) from unnest(array[65532, 769, 1536, 57344, 888]) cp
        where pg_temp.ins_hint('j', 'Phone No Visible', chr(cp)) <> 'TM018|invalid'),
  '{}'::text[],
  'L3: the same characters alone in a phone are refused (TM018 invalid)');
select is(pg_temp.ins('j', U&'e\0301', '---'), 'ok:1', 'L3: a letter with a mark is a name, and a phone of only punctuation is a phone (free text, no digit needed)');
select isnt(pg_temp.cid('j', U&'\00E9'), null, 'L3: ... saved as "é" (NFC)');
select is(
  split_part(pg_temp.try_detail('j', format('update public.clients set name = %L where id = %L', chr(65532), pg_temp.cid('j', 'Bom'))), '|', 1),
  'TM017', 'L3: a direct UPDATE of a name to U+FFFC is refused');
select is(
  split_part(pg_temp.try_detail('j', format('update public.clients set phone = %L where id = %L', chr(769), pg_temp.cid('j', 'Bom'))), '|', 1),
  'TM018', 'L3: a direct UPDATE of a phone to a lone mark is refused');
select is(pg_temp.row_of(pg_temp.cid('j', 'Bom')), row('Bom', null, null::numeric, false, 1)::text, 'L3: ... and the row is unchanged');
alter table public.clients disable trigger clients_write_guard;
select is(pg_temp.ins('j', chr(65532)), '23514', 'L3: the visible-character check holds without the trigger (U+FFFC name)');
select is(pg_temp.ins('j', repeat(chr(769), 5)), '23514', 'L3: ... and for a stack of marks');
select is(pg_temp.ins('j', 'Check No Visible Phone', chr(57344)), '23514', 'L3: ... and for a private-use phone');
alter table public.clients enable trigger clients_write_guard;

-- Uniqueness (AC11): case and spacing ignored, inactive clients included, accents kept.
select is(pg_temp.ins('j', 'maple   street market'), '23505', 'AC11: a direct insert whose name matches another ignoring case and spacing is a duplicate');
select is(pg_temp.ins('j', U&'Cafe\0301 Duo'), 'ok:1', 'AC11: "Café Duo" typed with a combining accent saves');
select is(pg_temp.ins('j', U&'CAF\00C9 DUO'), '23505', 'AC11: "CAFÉ DUO" (composed, upper case) is the same name');
select is(pg_temp.ins('j', 'Cafe Trio'), 'ok:1', 'AC11: "Cafe Trio" saves ...');
select is(pg_temp.ins('j', U&'Caf\00E9 Trio'), 'ok:1', 'AC11: ... and "Café Trio" saves too: accents make different names (owner decision)');
select is(pg_temp.ins('j', U&'Caf\00E9 trio'), '23505', 'AC11: "Café trio" clashes with "Café Trio"');
select is(pg_temp.ins('k', 'Maple Street Market'), 'ok:1', 'AC28: another farm can have the same name');

-- Phone rules (AC12)
select is(pg_temp.ins('j', 'Phone One', '  (555) 201-3348  '), 'ok:1', 'AC12: a phone with spaces around it saves');
select is((select c.phone from public.clients c where c.id = pg_temp.cid('j', 'Phone One')), '(555) 201-3348', 'AC12: ... trimmed, inside unchanged');
select is(pg_temp.ins('j', 'Phone Two', '+63 917 123 4567'), 'ok:1', 'AC12: "+63 917 123 4567" saves');
select is(pg_temp.ins('j', 'Phone Three', '555-2013 ext 4'), 'ok:1', 'AC12: "555-2013 ext 4" saves');
select is(
  array(select c.phone from public.clients c where c.tenant_id = tests.tenant_id_of('j') and c.name in ('Phone Two', 'Phone Three') order by 1),
  array['+63 917 123 4567', '555-2013 ext 4'], 'AC12: those phones are stored unchanged');
select is(pg_temp.ins('j', 'Phone Blank', '   '), 'ok:1', 'AC12: a blank phone saves as no phone');
select is((select c.phone is null from public.clients c where c.id = pg_temp.cid('j', 'Phone Blank')), true, 'AC12: ... null');
select is(pg_temp.ins('j', 'Phone Thirty', repeat('1', 30)), 'ok:1', 'AC12: a 30-character phone is accepted');
select is(pg_temp.ins_hint('j', 'Phone ThirtyOne', repeat('1', 31)), 'TM018|too_long', 'AC12: a 31-character phone is refused (TM018 too_long)');
select is(pg_temp.ins_hint('j', 'Phone Long', repeat('1', 201)), 'TM018|too_long', 'AC12: a raw phone over 200 characters is refused before it is normalised');
select is(pg_temp.ins_hint('j', 'Phone Hidden', U&'555\200B1234'), 'TM018|invalid', 'AC12: a zero-width space in the phone is refused (TM018 invalid)');
select is(pg_temp.ins_hint('j', 'Phone Control', U&'555\00851234'), 'TM018|invalid', 'AC12: a control character in the phone is refused');
select is(pg_temp.ins('j', 'Phone Nbsp', U&'\00A0555-1234\00A0'), 'ok:1', 'AC12: an NBSP at the ends of a phone is trimmed');
select is((select c.phone from public.clients c where c.id = pg_temp.cid('j', 'Phone Nbsp')), '555-1234', 'AC12: ... "555-1234"');
select is(
  split_part(pg_temp.try_detail('j', format('update public.clients set phone = %L where id = %L', U&'12\200B34', pg_temp.cid('j', 'Phone One'))), '|', 1),
  'TM018', 'AC12: a direct UPDATE to a phone with a hidden character is refused');

-- Price rules (AC13)
select is(pg_temp.ins('j', 'Price Six', null, '6.5'), 'ok:1', 'AC13: a price of 6.5 saves');
select is((select c.default_price::text from public.clients c where c.id = pg_temp.cid('j', 'Price Six')), '6.50', 'AC13: ... and reads back as 6.50 (stored with 2 decimals)');
select is(pg_temp.ins('j', 'Price Top', null, '9999.99'), 'ok:1', 'AC13: 9999.99 is accepted');
select is(pg_temp.ins('j', 'Price Low', null, '0.01'), 'ok:1', 'AC13: 0.01 is accepted');
select is(pg_temp.ins('j', 'Price Zeros', null, '6.500'), 'ok:1', 'AC13: 6.500 (a third decimal that is zero) is accepted');
select is((select c.default_price::text from public.clients c where c.id = pg_temp.cid('j', 'Price Zeros')), '6.50', 'AC13: ... stored as 6.50');
select is(pg_temp.ins_hint('j', 'Price Zero', null, '0'), 'TM019|not_positive', 'AC13: 0 is refused (not_positive)');
select is(pg_temp.ins_hint('j', 'Price Neg', null, '-1'), 'TM019|not_positive', 'AC13: -1 is refused (not_positive)');
select is(pg_temp.ins_hint('j', 'Price Big', null, '10000'), 'TM019|too_large', 'AC13: 10000 is refused (too_large)');
select is(pg_temp.ins_hint('j', 'Price Big2', null, '9999.995'), 'TM019|too_large', 'AC13: 9999.995 is refused (too_large is checked before decimals)');
select is(pg_temp.ins_hint('j', 'Price Dec', null, '6.505'), 'TM019|too_many_decimals', 'AC13: 6.505 is refused, NOT rounded to 6.51 (too_many_decimals)');
select is(pg_temp.ins_hint('j', 'Price NaN', null, 'NaN'), 'TM019|too_large', 'AC13: NaN is refused');
select is(pg_temp.ins_hint('j', 'Price Inf', null, 'Infinity'), 'TM019|too_large', 'AC13: Infinity is refused');
select is(pg_temp.ins_hint('j', 'Price NegInf', null, '-Infinity'), 'TM019|not_positive', 'AC13: -Infinity is refused');
select is(
  split_part(pg_temp.try_detail('j', format('update public.clients set default_price = 6.505 where id = %L', pg_temp.cid('j', 'Price Six'))), '|', 1),
  'TM019', 'AC13: a direct UPDATE to 6.505 is refused too');
select is(
  split_part(pg_temp.try_detail('j', format('update public.clients set default_price = 0 where id = %L', pg_temp.cid('j', 'Price Six'))), '|', 1),
  'TM019', 'AC13: a direct UPDATE to 0 is refused too');
select is(pg_temp.row_of(pg_temp.cid('j', 'Price Six')), row('Price Six', null, 6.50, false, 1)::text, 'AC13: ... and the row is unchanged');
-- The CHECK constraints are a second lock behind the trigger (with the trigger off, they still refuse).
alter table public.clients disable trigger clients_write_guard;
select is(pg_temp.ins('j', 'Check  Spaced'), '23514', 'the name check holds without the trigger (not normalised)');
select is(pg_temp.ins('j', U&'Check\200BHidden'), '23514', 'the hidden-character check holds without the trigger');
select is(pg_temp.ins('j', repeat('c', 61)), '23514', 'the name length check holds without the trigger');
select is(pg_temp.ins('j', 'Check Phone', repeat('1', 31)), '23514', 'the phone check holds without the trigger');
select is(pg_temp.ins('j', 'Check Price', null, '6.505'), '23514', 'the price check holds without the trigger (unconstrained numeric keeps 6.505)');
select is(pg_temp.ins('j', 'Check Price2', null, '10000'), '23514', 'the price range check holds without the trigger');
alter table public.clients enable trigger clients_write_guard;

-- Column grants (AC21, AC32): an owner can't choose an id, a version, or make a client born inactive; can't
-- change id, tenant_id, version or created_at; and can't delete.
select is(tests.try_as('j', format('insert into public.clients (id, tenant_id, name) values (gen_random_uuid(), %L, ''Own Id'')', tests.tenant_id_of('j'))),
  '42501', 'AC32: an owner can''t choose the id of a new client');
select is(tests.try_as('j', format('insert into public.clients (tenant_id, name, version) values (%L, ''Own Version'', 9)', tests.tenant_id_of('j'))),
  '42501', 'AC32: an owner can''t choose the version of a new client');
select is(tests.try_as('j', format('insert into public.clients (tenant_id, name, archived_at) values (%L, ''Born Inactive'', now())', tests.tenant_id_of('j'))),
  '42501', 'AC32: a client can''t be inserted already inactive');
select is(tests.try_as('j', format('update public.clients set version = 50 where id = %L', pg_temp.cid('j', 'Bom'))), '42501', 'AC19: an owner can''t set the version');
select is(tests.try_as('j', format('update public.clients set id = gen_random_uuid() where id = %L', pg_temp.cid('j', 'Bom'))), '42501', 'AC32: an owner can''t change a client''s id');
select is(tests.try_as('j', format('update public.clients set tenant_id = %L where id = %L', tests.tenant_id_of('k'), pg_temp.cid('j', 'Bom'))), '42501', 'AC28: an owner can''t change a client''s tenant_id');
select is(tests.try_as('j', format('update public.clients set created_at = now() where id = %L', pg_temp.cid('j', 'Bom'))), '42501', 'an owner can''t change created_at');
select is(tests.try_as('j', format('delete from public.clients where id = %L', pg_temp.cid('j', 'Bom'))), '42501', 'AC21: an owner can''t delete a client');
select is(tests.try_as('j', 'delete from public.clients where true'), '42501', 'AC21: an owner can''t delete all clients');
select is(tests.try_as('j', 'truncate public.clients'), '42501', 'AC21: an owner can''t truncate clients');
select is(pg_temp.row_of(pg_temp.cid('j', 'Bom')), row('Bom', null, null::numeric, false, 1)::text, 'AC21: the client is still there, unchanged');

-- Version: bumped by the trigger on a real change only; a direct update that changes nothing keeps it.
select is(tests.try_as('j', format('update public.clients set name = name where id = %L', pg_temp.cid('j', 'Bom'))), 'ok:1', 'a direct no-op update runs');
select is((select c.version from public.clients c where c.id = pg_temp.cid('j', 'Bom')), 1::bigint, 'the version does not move on a no-op update');
select is(tests.try_as('j', format('update public.clients set phone = ''555-0000'' where id = %L', pg_temp.cid('j', 'Bom'))), 'ok:1', 'a direct update of the phone runs');
select is((select c.version from public.clients c where c.id = pg_temp.cid('j', 'Bom')), 2::bigint, 'the version moves on a real change');
select is(tests.try_as('j', format('update public.clients set archived_at = now() where id = %L', pg_temp.cid('j', 'Bom'))), 'ok:1', 'a direct update of archived_at runs');
select is((select c.version from public.clients c where c.id = pg_temp.cid('j', 'Bom')), 3::bigint, 'the version moves when a client is made inactive');

-- Immutability and no delete, as postgres (which has every privilege): the triggers and keys still hold.
select is(pg_temp.try_pg(format('update public.clients set tenant_id = %L where id = %L', tests.tenant_id_of('k'), pg_temp.cid('j', 'Bom'))),
  'TM025', 'AC28: even postgres can''t move a client to another farm (TM025)');
select is(pg_temp.try_pg(format('update public.clients set id = gen_random_uuid() where id = %L', pg_temp.cid('j', 'Bom'))),
  'TM025', 'even postgres can''t change a client''s id (TM025)');
select is(pg_temp.row_of(pg_temp.cid('j', 'Bom')), row('Bom', '555-0000', null::numeric, true, 3)::text, 'the client is unchanged after the refused moves');

-- ---------------------------------------------------------------------------------------------
-- The 500-client cap (AC33) and the ledger hardening (audit M-1, L-1), farm K.
-- ---------------------------------------------------------------------------------------------
-- Farm K already has "Maple Street Market". Fill it to 499 as postgres, one statement per row so each sees the last.
do $$
declare
  v_tenant uuid := tests.tenant_id_of('k');
begin
  for i in 1..498 loop
    insert into public.clients (tenant_id, name) values (v_tenant, 'K client ' || i);
  end loop;
end
$$;
select is(pg_temp.n_clients('k'), 499::bigint, 'AC33: farm K has 499 clients');
select is(pg_temp.ins('k', 'K client 500'), 'ok:1', 'AC33: the 500th client is accepted');
select is(pg_temp.ins('k', 'K client 501'), 'TM021', 'AC33: the 501st client is refused by a direct insert (TM021)');
select is(pg_temp.n_clients('k'), 500::bigint, 'AC33: nothing was created');
select is(pg_temp.try_pg(format('insert into public.clients (tenant_id, name) values (%L, ''K as postgres'')', tests.tenant_id_of('k'))),
  'TM021', 'AC33: even postgres can''t exceed 500');
select is(
  tests.try_as('k', format('update public.clients set name = ''K renamed'' where id = %L', pg_temp.cid('k', 'K client 1'))), 'ok:1',
  'AC33: at 500 an owner can still edit a client');
select is(
  tests.try_as('k', format('update public.clients set archived_at = now() where id = %L', pg_temp.cid('k', 'K client 2'))), 'ok:1',
  'AC33: at 500 an owner can still mark a client inactive');
select is(pg_temp.ins('k', 'K client 501'), 'TM021', 'AC33: inactive clients count toward the 500');
select is(
  tests.try_as('k', format('update public.clients set archived_at = null where id = %L', pg_temp.cid('k', 'K client 2'))), 'ok:1',
  'AC33: at 500 an owner can still mark a client active');
select is(pg_temp.ins('j', 'J after K is full'), 'ok:1', 'AC33: another farm''s count is independent');

-- Function-level cap and replay at 500 are in the functions section below (they need K at 500 too).

-- Ledger hardening (audit M-1, L-1)
select is(
  tests.try_as('j', format('insert into public.client_submissions (tenant_id, id, client_id, payload_hash) values (%L, gen_random_uuid(), %L, repeat(''0'', 64))',
                           tests.tenant_id_of('k'), pg_temp.cid('k', 'K client 3'))),
  '42501', 'audit L-1: a ledger insert into another farm is refused (42501, by the guard, before that farm''s lock)');
select is(
  tests.try_as('j', format('insert into public.client_submissions (tenant_id, id, client_id, payload_hash) values (%L, gen_random_uuid(), %L, repeat(''0'', 64))',
                           tests.tenant_id_of('j'), pg_temp.cid('k', 'K client 3'))),
  '23503', 'a ledger row for own farm pointing at another farm''s client is refused by the composite FK (23503)');
select is(
  tests.try_as('j', format('insert into public.client_submissions (tenant_id, id, client_id, payload_hash) values (%L, gen_random_uuid(), %L, ''nothex'')',
                           tests.tenant_id_of('j'), pg_temp.cid('j', 'Bom'))),
  '23514', 'a payload_hash that is not 64 hex characters is refused (23514)');
select is(
  tests.try_as('j', format('insert into public.client_submissions (tenant_id, id, client_id, payload_hash, created_at) values (%L, gen_random_uuid(), %L, repeat(''0'', 64), now())',
                           tests.tenant_id_of('j'), pg_temp.cid('j', 'Bom'))),
  '42501', 'audit M-1: an owner can''t insert created_at into the ledger (column grant)');
select is(tests.try_as('j', 'delete from public.client_submissions where true'), '42501', 'an owner can''t delete ledger rows');
select is(tests.try_as('j', 'update public.client_submissions set payload_hash = repeat(''1'', 64) where true'), '42501', 'an owner can''t update ledger rows');
select is(
  tests.try_as('j', format('insert into public.client_submissions (tenant_id, id, client_id, payload_hash) values (%L, gen_random_uuid(), %L, repeat(''a'', 64))',
                           tests.tenant_id_of('j'), pg_temp.cid('j', 'Bom'))),
  'ok:1', 'an owner can insert a well-formed ledger row for own farm (the column grant is exactly what add_client writes)');
select is(pg_temp.try_pg(format('delete from public.clients where id = %L', (select s.client_id from public.client_submissions s where s.tenant_id = tests.tenant_id_of('j') limit 1))),
  '23503', 'AC21: deleting a client that a ledger row points at fails (23503): no cascade, the id always resolves');

-- QA S1: an owner can't brick Add by filling the ledger. One ledger row per client (UNIQUE (tenant_id, client_id)), so
-- the ledger can't outgrow the client count, and add_client's own row (for a client created a moment ago) never
-- meets a row or a cap that a direct insert could have used up. Farm J first (the attack as QA ran it, scaled down).
select is(
  (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'client_submissions_client_key' and c.conrelid = 'public.client_submissions'::regclass),
  'UNIQUE (tenant_id, client_id)', 'QA S1: the client ledger has one row per client (the key starts with tenant_id)');
select is(
  tests.try_as('j', format('insert into public.client_submissions (tenant_id, id, client_id, payload_hash) select %L, gen_random_uuid(), %L, repeat(''0'', 64) from generate_series(1, 493)',
                           tests.tenant_id_of('j'), pg_temp.cid('j', 'Maple Street Market'))),
  '23505', 'QA S1: filling the ledger with 493 rows for one client is refused (23505), so the attack of QA S1 no longer fills it');
select is(
  (select count(*) from public.client_submissions s where s.client_id = pg_temp.cid('j', 'Maple Street Market')), 0::bigint,
  'QA S1: ... and the refused statement wrote nothing');
-- The most an owner can do: one row per existing client.
select is(
  tests.try_as('j', format('insert into public.client_submissions (tenant_id, id, client_id, payload_hash) select %L, gen_random_uuid(), c.id, repeat(''0'', 64) from public.clients c where not exists (select 1 from public.client_submissions s where s.client_id = c.id)',
                           tests.tenant_id_of('j'))),
  'ok:' || (pg_temp.n_clients('j') - 1)::text, 'QA S1: an owner can write one ledger row for every client that has none (the most the key allows)');
select is((select count(*) from public.client_submissions s where s.tenant_id = tests.tenant_id_of('j')), pg_temp.n_clients('j'), 'QA S1: the ledger now holds exactly one row per client');
create temp table _s1 as select gen_random_uuid() as s_new, tests.tenant_id_of('j') as tj;
grant select on _s1 to authenticated;
select is(
  pg_temp.rpc_as('j', format('select public.add_client(%L, %L, ''S1 Still Works'')', (select tj from _s1), (select s_new from _s1))) ->> 'replayed', 'false',
  'QA S1: add_client still works after that attack (its ledger row is for a brand-new client)');
select is(
  pg_temp.rpc_as('j', format('select public.add_client(%L, %L, ''S1 Still Works'')', (select tj from _s1), (select s_new from _s1))) ->> 'replayed', 'true',
  'QA S1: ... and its replay still works');
select is(
  tests.try_as('j', format('insert into public.client_submissions (tenant_id, id, client_id, payload_hash) values (%L, gen_random_uuid(), %L, repeat(''0'', 64))',
                           tests.tenant_id_of('j'), pg_temp.cid('j', 'S1 Still Works'))),
  '23505', 'QA S1: a second direct row for a client that already has one is refused');

-- The boundary: a farm with 499 clients and a ledger row for each (the attacker's maximum) can still add the 500th.
do $$
declare
  v_tenant uuid := tests.tenant_id_of('n');
begin
  for i in 1..499 loop
    insert into public.clients (tenant_id, name) values (v_tenant, 'N client ' || i);
  end loop;
end
$$;
select is(
  tests.try_as('n', format('insert into public.client_submissions (tenant_id, id, client_id, payload_hash) select %L, gen_random_uuid(), c.id, repeat(''0'', 64) from public.clients c',
                           tests.tenant_id_of('n'))),
  'ok:499', 'QA S1: farm N, at 499 clients, fills its ledger with 499 rows (one per client)');
create temp table _s1n as select gen_random_uuid() as s_new, tests.tenant_id_of('n') as tn;
grant select on _s1n to authenticated;
select is(
  pg_temp.rpc_as('n', format('select public.add_client(%L, %L, ''N client 500'')', (select tn from _s1n), (select s_new from _s1n))) ->> 'replayed', 'false',
  'QA S1: ... and add_client still adds the 500th client (the ledger''s 500-row backstop is not in its way)');
select is(
  pg_temp.rpc_as('n', format('select public.add_client(%L, %L, ''N client 500'')', (select tn from _s1n), (select s_new from _s1n))) ->> 'replayed', 'true',
  'QA S1: ... and its replay works at 500 clients and 500 ledger rows');
select is(
  (select row(pg_temp.n_clients('n'), (select count(*) from public.client_submissions s where s.tenant_id = tests.tenant_id_of('n'))))::text,
  row(500::bigint, 500::bigint)::text, 'QA S1: farm N ends with 500 clients and 500 ledger rows');
select is(
  tests.try_as('n', format('insert into public.client_submissions (tenant_id, id, client_id, payload_hash) values (%L, gen_random_uuid(), %L, repeat(''0'', 64))',
                           tests.tenant_id_of('n'), pg_temp.cid('n', 'N client 1'))),
  'TM026', 'QA S1: the 500-row backstop still answers a 501st ledger row (TM026), which no client count can make legitimate');

-- The 501st ledger row (TM026): fill farm K's ledger to 500 (one row per client), then one more.
do $$
declare
  v_tenant uuid := tests.tenant_id_of('k');
  r record;
begin
  for r in select c.id from public.clients c where c.tenant_id = v_tenant loop
    insert into public.client_submissions (tenant_id, id, client_id, payload_hash)
    values (v_tenant, gen_random_uuid(), r.id, repeat('0', 64));
  end loop;
end
$$;
select is((select count(*) from public.client_submissions s where s.tenant_id = tests.tenant_id_of('k')), 500::bigint, 'farm K''s ledger holds 500 rows');
select is(
  tests.try_as('k', format('insert into public.client_submissions (tenant_id, id, client_id, payload_hash) values (%L, gen_random_uuid(), %L, repeat(''0'', 64))',
                           tests.tenant_id_of('k'), pg_temp.cid('k', 'K client 3'))),
  'TM026', 'audit M-1: the 501st ledger row of a farm is refused (TM026)');
delete from public.client_submissions where tenant_id = tests.tenant_id_of('k');

-- ---------------------------------------------------------------------------------------------
-- The four functions, as the owner (farm L), exactly as the server calls them.
-- ---------------------------------------------------------------------------------------------
create temp table _ids as
  select tests.tenant_id_of('l') as tl, tests.tenant_id_of('k') as tk, tests.tenant_id_of('m') as tm,
         gen_random_uuid() as s1, gen_random_uuid() as s2, gen_random_uuid() as s3, gen_random_uuid() as s4;
grant select on _ids to authenticated, anon;

-- add_client (AC8-AC16)
create temp table _a1 as
  select pg_temp.rpc_as('l', format('select public.add_client(%L, %L, ''  Oakhill   Bakery '', ''  (555) 375-1190 '', 235.5)', (select tl from _ids), (select s1 from _ids))) as r;
select is((select r ->> 'replayed' from _a1), 'false', 'AC8: add_client creates a client (replayed: false)');
select is(pg_temp.row_of(((select r ->> 'clientId' from _a1))::uuid), row('Oakhill Bakery', '(555) 375-1190', 235.50, false, 1)::text,
  'AC10, AC12, AC13: the client is stored normalised, with the price at 2 decimals, active, version 1');
select is(
  (select r ->> 'replayed' from (select pg_temp.rpc_as('l', format('select public.add_client(%L, %L, ''Oakhill Bakery'', ''(555) 375-1190'', 235.50)', (select tl from _ids), (select s1 from _ids))) as r) x),
  'true', 'AC15: the same submission id and payload is a replay (replayed: true)');
select is(pg_temp.n_clients('l'), 1::bigint, 'AC15: a replay creates no second client');
select is(
  (select r ->> 'clientId' from (select pg_temp.rpc_as('l', format('select public.add_client(%L, %L, ''Oakhill Bakery'', ''(555) 375-1190'', 235.5)', (select tl from _ids), (select s1 from _ids))) as r) x),
  (select r ->> 'clientId' from _a1), 'AC15: a replay returns the same client, and never fails as "already exists" (the ledger is read before the name check)');
select is(
  tests.try_as('l', format('select public.add_client(%L, %L, ''oakhill bakery'', ''(555) 375-1190'', 235.5)', (select tl from _ids), (select s1 from _ids))),
  'TM024', 'AC15: the same submission id with the name in another case is a different payload (TM024)');
select is(
  (select count(*) from public.client_submissions s where s.tenant_id = (select tl from _ids) and s.id = (select s1 from _ids)), 1::bigint,
  'AC15: one ledger row');
select is(
  (select s.payload_hash ~ '^[0-9a-f]{64}$' from public.client_submissions s where s.id = (select s1 from _ids)), true,
  'D9: the ledger holds a 64-hex hash, no name or phone');
select is(
  (select position('Oakhill' in row(s.*)::text) from public.client_submissions s where s.id = (select s1 from _ids)), 0,
  'D9: no personal data in the ledger row');
select is(
  tests.try_as('l', format('select public.add_client(%L, %L, ''Oakhill Bakery 2'', ''(555) 375-1190'', 235.50)', (select tl from _ids), (select s1 from _ids))),
  'TM024', 'AC15: the same submission id with another name is refused (TM024)');
select is(
  tests.try_as('l', format('select public.add_client(%L, %L, ''Oakhill Bakery'', ''(555) 375-0000'', 235.50)', (select tl from _ids), (select s1 from _ids))),
  'TM024', 'AC15: ... with another phone (TM024)');
select is(
  tests.try_as('l', format('select public.add_client(%L, %L, ''Oakhill Bakery'', ''(555) 375-1190'', 235.51)', (select tl from _ids), (select s1 from _ids))),
  'TM024', 'AC15: ... with another price (TM024)');
select is(
  tests.try_as('l', format('select public.add_client(%L, %L, ''Oakhill Bakery'', ''(555) 375-1190'', null)', (select tl from _ids), (select s1 from _ids))),
  'TM024', 'AC15: ... with no price (TM024)');
select is(pg_temp.n_clients('l'), 1::bigint, 'AC15: still one client after the refused replays');
select is(
  (select r ->> 'replayed' from (select pg_temp.rpc_as('l', format('select public.add_client(%L, %L, ''  Oakhill Bakery  '', ''(555) 375-1190'', 235.500)', (select tl from _ids), (select s1 from _ids))) as r) x),
  'true', 'AC15: a padded name and 235.500 are the same normalised payload (a replay)');

-- A refused add leaves no ledger row (TM020, TM017...).
select is(
  split_part(pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''OAKHILL BAKERY'')', (select tl from _ids), (select s2 from _ids))), '|', 1),
  'TM020', 'AC11: a name matching another client ignoring case is refused (TM020)');
select is(
  (select count(*) from public.client_submissions s where s.id = (select s2 from _ids)), 0::bigint, 'AC15: a refused add leaves no ledger row, so a retry re-evaluates');
select is(
  pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''oakhill   bakery'')', (select tl from _ids), (select s2 from _ids))) like 'TM020||{"id": "%", "archived": false}|a client with this name exists',
  true, 'AC29: TM020 carries the client id and archived flag only, and a fixed message');
select is(
  position('akhill' in pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''oakhill bakery'')', (select tl from _ids), (select s2 from _ids)))), 0,
  'AC29: TM020''s hint, detail and message never contain the name');

-- Inactive clients clash too (AC11) and the detail says so.
select ok(pg_temp.rpc_as('l', format('select public.add_client(%L, gen_random_uuid(), ''Inactive Ink'')', (select tl from _ids))) is not null, 'a client to mark inactive is added');
select ok(pg_temp.rpc_as('l', format('select public.archive_client(%L, %L)', (select tl from _ids), pg_temp.cid('l', 'Inactive Ink'))) is not null, 'and marked inactive');
select is(
  pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''INACTIVE  ink'')', (select tl from _ids), (select s2 from _ids))) like 'TM020||{"id": "%", "archived": true}|%',
  true, 'AC11: a clash with an INACTIVE client is refused (TM020), and the detail says archived: true');

-- Validation through the function (same rules as the trigger, checked before the lock)
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''   '')', (select tl from _ids), (select s2 from _ids))) like 'TM017|blank|%', true, 'AC10: add_client refuses a blank name (TM017 blank)');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, %L)', (select tl from _ids), (select s2 from _ids), repeat('a', 61))) like 'TM017|too_long|%', true, 'AC10: add_client refuses 61 characters (TM017 too_long)');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, %L)', (select tl from _ids), (select s2 from _ids), repeat('a', 300))) like 'TM017|too_long|%', true, 'AC10: add_client refuses a raw name over 200 characters');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, %L)', (select tl from _ids), (select s2 from _ids), U&'A\200BB')) like 'TM017|invalid|%', true, 'AC10: add_client refuses a hidden character (TM017 invalid)');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, %L)', (select tl from _ids), (select s2 from _ids), chr(12644))) like 'TM017|invalid|%', true, 'QA S2: add_client refuses a name that is only a Hangul filler (TM017 invalid), not "blank" and not saved');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, %L)', (select tl from _ids), (select s2 from _ids), ' ' || chr(10240) || chr(65039) || ' ')) like 'TM017|invalid|%', true, 'QA S2: ... and one of a braille blank and a variation selector between spaces');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''Blank Phone'', %L)', (select tl from _ids), (select s2 from _ids), chr(12644))) like 'TM018|invalid|%', true, 'QA S2: add_client refuses a phone that is only a Hangul filler (TM018 invalid)');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, %L)', (select tl from _ids), (select s2 from _ids), chr(65532))) like 'TM017|invalid|%', true, 'L3: add_client refuses a name that is only U+FFFC (TM017 invalid)');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, %L)', (select tl from _ids), (select s2 from _ids), repeat(chr(769), 60))) like 'TM017|invalid|%', true, 'L3: ... and one that is only a stack of combining marks');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''No Visible Phone'', %L)', (select tl from _ids), (select s2 from _ids), chr(769))) like 'TM018|invalid|%', true, 'L3: add_client refuses a phone that is only a combining mark (TM018 invalid)');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''Val Phone'', %L)', (select tl from _ids), (select s2 from _ids), repeat('1', 31))) like 'TM018|too_long|%', true, 'AC12: add_client refuses a 31-character phone (TM018)');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''Val Phone'', %L)', (select tl from _ids), (select s2 from _ids), U&'1\200B2')) like 'TM018|invalid|%', true, 'AC12: add_client refuses a hidden character in the phone (TM018 invalid)');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''Val Price'', null, 0)', (select tl from _ids), (select s2 from _ids))) like 'TM019|not_positive|%', true, 'AC13: add_client refuses a price of 0 (TM019)');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''Val Price'', null, 10000)', (select tl from _ids), (select s2 from _ids))) like 'TM019|too_large|%', true, 'AC13: add_client refuses 10000 (TM019 too_large)');
select is(pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''Val Price'', null, 6.505)', (select tl from _ids), (select s2 from _ids))) like 'TM019|too_many_decimals|%', true, 'AC13: add_client refuses 6.505 (TM019 too_many_decimals)');
select is(tests.try_as('l', format('select public.add_client(%L, null, ''No Submission'')', (select tl from _ids))), 'TM005', 'add_client refuses a null submission id (TM005)');
select is(pg_temp.n_clients('l'), 2::bigint, 'AC16: none of the refused adds created a client (only Oakhill Bakery and Inactive Ink exist)');
select is(
  pg_temp.try_detail('l', format('select public.add_client(%L, %L, ''Val Name Secret'', null, 6.505)', (select tl from _ids), (select s2 from _ids))) like '%Secret%', false,
  'AC29: a validation error message never contains the name being saved');

-- A minimal add: name only (AC9).
select is((select r ->> 'replayed' from (select pg_temp.rpc_as('l', format('select public.add_client(%L, %L, ''Linda Ferris'')', (select tl from _ids), (select s3 from _ids))) as r) x), 'false', 'AC9: a client with just a name is added');
select is(pg_temp.row_of(pg_temp.cid('l', 'Linda Ferris')), row('Linda Ferris', null, null::numeric, false, 1)::text, 'AC9: ... with no phone and no price');
select is((select r ->> 'replayed' from (select pg_temp.rpc_as('l', format('select public.add_client(%L, %L, ''Cafe Uno'')', (select tl from _ids), gen_random_uuid())) as r) x), 'false', 'AC11: "Cafe Uno" is added');
select is((select r ->> 'replayed' from (select pg_temp.rpc_as('l', format('select public.add_client(%L, %L, %L)', (select tl from _ids), gen_random_uuid(), U&'Caf\00E9 Uno')) as r) x), 'false', 'AC11: "Café Uno" is added too (accents make different names)');
select is(tests.try_as('l', format('select public.add_client(%L, %L, %L)', (select tl from _ids), gen_random_uuid(), U&'CAF\00C9 uno')), 'TM020', 'AC11: "CAFÉ uno" clashes with "Café Uno" (TM020)');

-- A replay after a rename, and after the client was made inactive, returns the client as it is now.
select is(
  (select r ->> 'clientId' from (select pg_temp.rpc_as('l', format('select public.add_client(%L, %L, ''Linda Ferris'')', (select tl from _ids), (select s3 from _ids))) as r) x),
  pg_temp.cid('l', 'Linda Ferris')::text, 'AC15: a replay of the third add returns the same client');
select ok(pg_temp.rpc_as('l', format('select public.update_client(%L, %L, 1, ''Linda Ferris-Long'', null, null)', (select tl from _ids), pg_temp.cid('l', 'Linda Ferris'))) is not null, 'Linda Ferris is renamed');
select is(
  (select r ->> 'clientId' from (select pg_temp.rpc_as('l', format('select public.add_client(%L, %L, ''Linda Ferris'')', (select tl from _ids), (select s3 from _ids))) as r) x),
  pg_temp.cid('l', 'Linda Ferris-Long')::text, 'AC15: a replay after a rename still returns that client (now renamed)');
select is(
  (select r ->> 'replayed' from (select pg_temp.rpc_as('l', format('select public.add_client(%L, %L, ''Linda Ferris'')', (select tl from _ids), (select s3 from _ids))) as r) x),
  'true', 'AC15: ... as a replay');

-- update_client (AC18, AC19)
create temp table _u as select pg_temp.cid('l', 'Oakhill Bakery') as id;
select is(pg_temp.row_of((select id from _u)), row('Oakhill Bakery', '(555) 375-1190', 235.50, false, 1)::text, 'starting point: version 1');
select is(
  pg_temp.rpc_as('l', format('select public.update_client(%L, %L, 1, ''Oakhill Bakery'', ''(555) 375-1190'', 235.5)', (select tl from _ids), (select id from _u))) ->> 'changed',
  'false', 'AC18: saving with nothing changed returns changed: false');
select is((select c.version from public.clients c where c.id = (select id from _u)), 1::bigint, 'AC18: ... and does not move the version');
select is(
  pg_temp.rpc_as('l', format('select public.update_client(%L, %L, 1, ''OAKHILL BAKERY'', ''(555) 375-1190'', 235.5)', (select tl from _ids), (select id from _u))) ->> 'changed',
  'true', 'AC18: changing only the capitalisation is a real change, and never clashes with its own name');
select is(pg_temp.row_of((select id from _u)), row('OAKHILL BAKERY', '(555) 375-1190', 235.50, false, 2)::text, 'AC18: ... stored, version 2');
select is(
  pg_temp.rpc_as('l', format('select public.update_client(%L, %L, 2, ''  Oakhill   Bakery  '', null, 240)', (select tl from _ids), (select id from _u))) ->> 'changed',
  'true', 'AC18: a spacing-only name change plus a cleared phone and a new price saves');
select is(pg_temp.row_of((select id from _u)), row('Oakhill Bakery', null, 240.00, false, 3)::text, 'AC18: emptying the phone stores null; the price has 2 decimals; version 3');
select is(
  pg_temp.rpc_as('l', format('select public.update_client(%L, %L, 3, ''Oakhill Bakery'', ''555-1111'', null)', (select tl from _ids), (select id from _u))) ->> 'changed',
  'true', 'AC18: emptying the price stores null');
select is(pg_temp.row_of((select id from _u)), row('Oakhill Bakery', '555-1111', null::numeric, false, 4)::text, 'AC18: ... version 4');
-- Stale versions (AC19)
select is(
  tests.try_as('l', format('select public.update_client(%L, %L, 1, ''Oakhill Bakery New'', ''555-1111'', null)', (select tl from _ids), (select id from _u))),
  'TM022', 'AC19: a stale version with different values is refused (TM022)');
select is(pg_temp.row_of((select id from _u)), row('Oakhill Bakery', '555-1111', null::numeric, false, 4)::text, 'AC19: nothing was changed by the refused edit');
select is(
  pg_temp.rpc_as('l', format('select public.update_client(%L, %L, 2, ''Oakhill Bakery'', ''555-1111'', null)', (select tl from _ids), (select id from _u))) ->> 'changed',
  'false', 'D5: a stale version whose values equal the stored ones returns changed: false (a retry of an edit whose reply was lost)');
select is(
  tests.try_as('l', format('select public.update_client(%L, %L, 99, ''Oakhill Bakery'', ''555-1111'', null)', (select tl from _ids), (select id from _u))),
  'ok:1', 'D5: ... whatever the stale version (even a version from the future) when nothing changes');
select is((select c.version from public.clients c where c.id = (select id from _u)), 4::bigint, 'D5: ... and the version stays 4');
select is(
  tests.try_as('l', format('select public.update_client(%L, %L, 4, %L, null, null)', (select tl from _ids), (select id from _u), U&'CAF\00C9 uno')),
  'TM020', 'AC11: an edit into another client''s name is refused (TM020, accents kept: "CAFÉ uno" clashes with "Café Uno")');
select is(
  tests.try_as('l', format('select public.update_client(%L, %L, 4, ''cafe uno'', null, null)', (select tl from _ids), (select id from _u))),
  'TM020', 'AC11: an edit into "cafe uno" clashes with "Cafe Uno"');
select is(pg_temp.try_detail('l', format('select public.update_client(%L, %L, 4, ''  ***  '', null, null)', (select tl from _ids), (select id from _u))) like 'ok', true, 'an edit to a punctuation-only name is a valid name');
select is(tests.try_as('l', format('select public.update_client(%L, %L, 5, ''   '', null, null)', (select tl from _ids), (select id from _u))), 'TM017', 'AC10: an edit to a blank name is refused (TM017)');
select is(tests.try_as('l', format('select public.update_client(%L, %L, 5, %L, null, null)', (select tl from _ids), (select id from _u), U&'A\200BB')), 'TM017', 'AC10: an edit to a name with a hidden character is refused');
select is(tests.try_as('l', format('select public.update_client(%L, %L, 5, %L, null, null)', (select tl from _ids), (select id from _u), chr(12644))), 'TM017', 'QA S2: an edit to a name that is only a Hangul filler is refused');
select is(tests.try_as('l', format('select public.update_client(%L, %L, 5, ''Ok Name'', %L, null)', (select tl from _ids), (select id from _u), chr(10240))), 'TM018', 'QA S2: an edit to a phone that is only a braille blank is refused');
select is(tests.try_as('l', format('select public.update_client(%L, %L, 5, %L, null, null)', (select tl from _ids), (select id from _u), chr(65532))), 'TM017', 'L3: an edit to a name that is only U+FFFC is refused');
select is(tests.try_as('l', format('select public.update_client(%L, %L, 5, ''Ok Name'', %L, null)', (select tl from _ids), (select id from _u), chr(769))), 'TM018', 'L3: an edit to a phone that is only a combining mark is refused');
select is(tests.try_as('l', format('select public.update_client(%L, %L, 5, ''Ok Name'', %L, null)', (select tl from _ids), (select id from _u), repeat('9', 31))), 'TM018', 'AC12: an edit to a 31-character phone is refused');
select is(tests.try_as('l', format('select public.update_client(%L, %L, 5, ''Ok Name'', null, 6.505)', (select tl from _ids), (select id from _u))), 'TM019', 'AC13: an edit to a price of 6.505 is refused');
select is(tests.try_as('l', format('select public.update_client(%L, %L, null, ''Ok Name'', null, null)', (select tl from _ids), (select id from _u))), 'TM005', 'a null version is malformed (TM005)');
select is(tests.try_as('l', format('select public.update_client(%L, null, 1, ''Ok Name'', null, null)', (select tl from _ids))), 'TM005', 'a null client id is malformed (TM005)');
select is(tests.try_as('l', format('select public.update_client(%L, gen_random_uuid(), 1, ''Ok Name'', null, null)', (select tl from _ids))), 'TM023', 'an unknown client id is TM023');
select ok(pg_temp.rpc_as('l', format('select public.update_client(%L, %L, 5, ''Oakhill Bakery'', ''555-1111'', null)', (select tl from _ids), (select id from _u))) is not null, 'Oakhill Bakery gets its name back (version 6)');

-- archive_client / restore_client (AC20, AC21)
select is(pg_temp.row_of((select id from _u)), row('Oakhill Bakery', '555-1111', null::numeric, false, 6)::text, 'starting point: version 6');
select is(pg_temp.rpc_as('l', format('select public.archive_client(%L, %L)', (select tl from _ids), (select id from _u))) ->> 'changed', 'true', 'AC20: mark inactive changes the client');
select is(pg_temp.row_of((select id from _u)), row('Oakhill Bakery', '555-1111', null::numeric, true, 7)::text, 'AC20, AC21: only archived_at and the version changed; name, phone and price are kept');
select is(pg_temp.rpc_as('l', format('select public.archive_client(%L, %L)', (select tl from _ids), (select id from _u))) ->> 'changed', 'false', 'AC20: a second mark-inactive is changed: false');
select is((select c.version from public.clients c where c.id = (select id from _u)), 7::bigint, 'D6: ... with no version bump');
select is(
  tests.try_as('l', format('select public.update_client(%L, %L, 7, ''Oakhill Bakery'', ''555-2222'', null)', (select tl from _ids), (select id from _u))), 'ok:1',
  'AC18: an inactive client can be edited');
select is(pg_temp.rpc_as('l', format('select public.restore_client(%L, %L)', (select tl from _ids), (select id from _u))) ->> 'changed', 'true', 'AC20: mark active changes the client');
select is(pg_temp.row_of((select id from _u)), row('Oakhill Bakery', '555-2222', null::numeric, false, 9)::text, 'AC20: ... active again, name, phone and price kept (version 9)');
select is(pg_temp.rpc_as('l', format('select public.restore_client(%L, %L)', (select tl from _ids), (select id from _u))) ->> 'changed', 'false', 'AC20: a second mark-active is changed: false');
select is((select c.version from public.clients c where c.id = (select id from _u)), 9::bigint, 'D6: ... with no version bump');
select is(tests.try_as('l', format('select public.archive_client(%L, gen_random_uuid())', (select tl from _ids))), 'TM023', 'an unknown id: archive_client TM023');
select is(tests.try_as('l', format('select public.restore_client(%L, gen_random_uuid())', (select tl from _ids))), 'TM023', 'an unknown id: restore_client TM023');
select is(tests.try_as('l', format('select public.archive_client(%L, null)', (select tl from _ids))), 'TM005', 'a null id: archive_client TM005');
select is(tests.try_as('l', format('select public.restore_client(%L, null)', (select tl from _ids))), 'TM005', 'a null id: restore_client TM005');
select is(pg_temp.n_clients('l'), 5::bigint, 'AC21: no client was ever removed (Oakhill, Inactive Ink, Linda, Cafe Uno, Café Uno)');

-- Other farm's client id, same answer as an unknown one (AC28): farm L with farm K's client.
select is(tests.try_as('l', format('select public.archive_client(%L, %L)', (select tl from _ids), pg_temp.cid('k', 'K client 3'))), 'TM023', 'AC28: farm K''s client id is "unknown" to farm L (archive)');
select is(tests.try_as('l', format('select public.update_client(%L, %L, 1, ''x'', null, null)', (select tl from _ids), pg_temp.cid('k', 'K client 3'))), 'TM023', 'AC28: ... (update)');
select is(tests.try_as('l', format('select public.restore_client(%L, %L)', (select tl from _ids), pg_temp.cid('k', 'K client 3'))), 'TM023', 'AC28: ... (restore)');

-- 500 through the functions, farm K (currently 500 clients; its ledger was emptied above).
create temp table _k as select gen_random_uuid() as s_add, gen_random_uuid() as s_over;
select is(tests.try_as('k', format('select public.add_client(%L, %L, ''K over the limit'')', (select tk from _ids), (select s_over from _k))), 'TM021', 'AC33: add_client refuses the 501st client (TM021)');
select is((select count(*) from public.client_submissions s where s.id = (select s_over from _k)), 0::bigint, 'AC33: ... and leaves no ledger row');
select is(pg_temp.n_clients('k'), 500::bigint, 'AC33: ... and creates nothing');
select is(pg_temp.rpc_as('k', format('select public.update_client(%L, %L, 2, ''K client 1 again'', null, null)', (select tk from _ids), pg_temp.cid('k', 'K renamed'))) ->> 'changed', 'true', 'AC33: at 500, update_client still works');
select is(pg_temp.rpc_as('k', format('select public.archive_client(%L, %L)', (select tk from _ids), pg_temp.cid('k', 'K client 4'))) ->> 'changed', 'true', 'AC33: at 500, archive_client still works');
select is(pg_temp.rpc_as('k', format('select public.restore_client(%L, %L)', (select tk from _ids), pg_temp.cid('k', 'K client 4'))) ->> 'changed', 'true', 'AC33: at 500, restore_client still works');
-- A replay still works when the farm is at 500: the cap and the name check are never reached. (Clients are never
-- deleted, so no slot can be freed: the ledger row is put in place as postgres, as add_client would have written it.)
delete from public.client_submissions where tenant_id = (select tk from _ids);
insert into public.client_submissions (tenant_id, id, client_id, payload_hash)
  values ((select tk from _ids), (select s_add from _k), pg_temp.cid('k', 'K client 3'), app.client_payload_hash('K client 3', null, null));
select is(
  pg_temp.rpc_as('k', format('select public.add_client(%L, %L, ''K client 3'')', (select tk from _ids), (select s_add from _k))) ->> 'replayed', 'true',
  'AC15, AC33: a replay of an earlier add works even when the farm is at 500 (the cap and the name check are never reached)');

-- ---------------------------------------------------------------------------------------------
-- AC27: no client operation touches production, sizes or any egg count (farm M).
-- ---------------------------------------------------------------------------------------------
insert into public.production (tenant_id, produced_on, size_id, quality, eggs)
  select tests.tenant_id_of('m'), date '2026-02-01', s.id, 'good', 90 from public.sizes s where s.tenant_id = tests.tenant_id_of('m') and s.name = 'Large';
insert into public.production (tenant_id, produced_on, quality, eggs) values (tests.tenant_id_of('m'), date '2026-02-01', 'reject', 4);
create temp table _m_before as
  select (select md5(string_agg(p::text, '|' order by p.id)) from public.production p where p.tenant_id = tests.tenant_id_of('m')) as prod,
         (select md5(string_agg(z::text, '|' order by z.id)) from public.sizes z where z.tenant_id = tests.tenant_id_of('m')) as sizes,
         (select md5(string_agg(x::text, '|' order by x.id)) from public.production_submissions x where x.tenant_id = tests.tenant_id_of('m')) as subs;
select ok(pg_temp.rpc_as('m', format('select public.add_client(%L, gen_random_uuid(), ''M Client'', ''555'', 6.5)', tests.tenant_id_of('m'))) is not null, 'AC27: a client is added');
select ok(pg_temp.rpc_as('m', format('select public.update_client(%L, %L, 1, ''M Client 2'', null, 7)', tests.tenant_id_of('m'), pg_temp.cid('m', 'M Client'))) is not null, 'AC27: edited');
select ok(pg_temp.rpc_as('m', format('select public.archive_client(%L, %L)', tests.tenant_id_of('m'), pg_temp.cid('m', 'M Client 2'))) is not null, 'AC27: marked inactive');
select ok(pg_temp.rpc_as('m', format('select public.restore_client(%L, %L)', tests.tenant_id_of('m'), pg_temp.cid('m', 'M Client 2'))) is not null, 'AC27: marked active');
select is(
  (select row(md5(string_agg(p::text, '|' order by p.id)))::text from public.production p where p.tenant_id = tests.tenant_id_of('m')),
  (select row(prod)::text from _m_before), 'AC27: production rows are byte-identical after every client operation');
select is(
  (select md5(string_agg(z::text, '|' order by z.id)) from public.sizes z where z.tenant_id = tests.tenant_id_of('m')),
  (select sizes from _m_before), 'AC27: sizes are identical after every client operation');
select is(
  (select md5(string_agg(x::text, '|' order by x.id)) from public.production_submissions x where x.tenant_id = tests.tenant_id_of('m')),
  (select subs from _m_before), 'AC27: the production ledger is identical too');

-- ---------------------------------------------------------------------------------------------
-- Currency (M11, AC35): per-farm data, PHP by default, not writable by an owner, format-checked.
-- ---------------------------------------------------------------------------------------------
select is((select t.currency from public.tenants t where t.id = tests.tenant_id_of('m')), 'PHP', 'AC35: a new farm has PHP with no extra step');
select is(
  (select row(a.attnotnull, pg_get_expr(d.adbin, d.adrelid))::text from pg_attribute a join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.tenants'::regclass and a.attname = 'currency'),
  row(true, '''PHP''::text')::text, 'AC35: currency is not null with default PHP');
select is(pg_temp.try_pg(format('update public.tenants set currency = %L where id = %L', 'php', tests.tenant_id_of('m'))), '23514', 'the currency check refuses lower case');
select is(pg_temp.try_pg(format('update public.tenants set currency = %L where id = %L', 'US', tests.tenant_id_of('m'))), '23514', 'the currency check refuses two letters');
select is(pg_temp.try_pg(format('update public.tenants set currency = %L where id = %L', 'USDX', tests.tenant_id_of('m'))), '23514', 'the currency check refuses four letters');
select is(pg_temp.try_pg(format('update public.tenants set currency = %L where id = %L', '', tests.tenant_id_of('m'))), '23514', 'the currency check refuses an empty string');
select is(pg_temp.try_pg(format('update public.tenants set currency = null where id = %L', tests.tenant_id_of('m'))), '23502', 'the currency can''t be null');
select is(pg_temp.try_pg(format('update public.tenants set currency = %L where id = %L', 'USD', tests.tenant_id_of('m'))), 'ok', 'postgres can set another currency (this is how a test farm is switched)');
select is((select t.currency from public.tenants t where t.id = tests.tenant_id_of('m')), 'USD', 'AC37: the currency is data');
select is(tests.try_as('m', format('update public.tenants set currency = ''EUR'' where id = %L', tests.tenant_id_of('m'))), '42501', 'AC35: an owner can''t change the currency (no update privilege on tenants)');
select is(tests.try_as('m', 'select currency from public.tenants'), 'ok:1', 'an owner reads the currency of its own farm');
select is((select t.currency from public.tenants t where t.id = tests.tenant_id_of('m')), 'USD', 'the currency is still USD');
select is((select t.currency from public.tenants t where t.id = tests.tenant_id_of('l')), 'PHP', 'AC35: another farm is unaffected');

select * from finish();
rollback;
