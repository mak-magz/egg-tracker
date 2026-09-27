-- M14 ledger_uniqueness_and_blank_names (QA findings S1 and S2 of docs/features/03-clients.md section 5)
--
-- M10 to M13 are already applied locally, so this is a NEW migration. Everything stays security invoker with
-- search_path = ''; owners still have no delete anywhere.
--
-- S1  An owner could fill their farm's add ledger through PostgREST (they have INSERT on client_submissions, and the
--     M13 functions are security invoker, so the caller needs that privilege) up to the per-farm cap (500 rows,
--     TM026). After that add_client could not write its own ledger row: every add failed with a 500, and the owner
--     could not delete the rows (no delete grant, by rule), so only an operator could repair it. Feature 02's size
--     ledger (cap 100, TM016) had the same shape.
--
--     Fix: a STRUCTURAL bound instead of a flag or a delete. A ledger row exists for exactly one client (or size),
--     because add_client (add_size) writes it for the client (size) it has just created, so the ledger gets
--     UNIQUE (tenant_id, client_id) and UNIQUE (tenant_id, size_id). Then:
--       * a farm's ledger can never hold more rows than the farm has clients (sizes), and the client (size) cap
--         already bounds that (500, 100);
--       * the row add_client writes is for a client that was created a moment ago, in the same transaction, so no
--         direct insert can already have taken its client id: the unique key can never be in the way, and neither
--         can the row cap (TM026 / TM016 stay as a backstop, but the count they see is always below the cap when
--         a client / size is being added);
--       * owners keep the ledger insert privilege (the functions need it) but the worst they can do is write one
--         row per existing client, which is harmless. Nothing to forge: no transaction-local flag, no policy that
--         depends on caller-controlled state.
--     A row whose submission id an owner squats can only affect that owner's own retries with that same random id.
--
-- S2  Visually blank names were accepted (U+3164 Hangul filler, U+2800 braille blank, U+FE0F, ...). The hidden-
--     character class of app.client_text_invalid (names AND phones) now covers every Unicode
--     Default_Ignorable_Code_Point (all of them refused, joiners included: the owner's decision stands) plus
--     U+2800, the one blank-looking character that is neither default-ignorable nor whitespace. Whitespace is
--     collapsed and trimmed before the check, so a name that passes the class always holds at least one visible
--     character (that was true only for the invisible characters; a later migration adds the general rule).
--     Existing rows are not rewritten, and that is only safe while no such row exists (nothing is deployed and the
--     local database is empty). Widening the refused set later is NOT harmless for legacy rows: the CHECK
--     constraints that call this function are re-evaluated by Postgres on EVERY update of the row, so a row that
--     already holds a newly refused character fails with 23514 (a 500) even on archive or restore, which change
--     nothing but archived_at. So any future widening of the refused set, once data exists, needs a data migration
--     that first rewrites or blocks the existing rows.
--
--     The class, kept in step with CLIENT_TEXT_INVALID_RANGES in shared/utils/client-name.ts (parity-tested):
--       U+0001-001F, 007F-009F     control characters (NUL can't exist in a Postgres text)
--       U+00AD soft hyphen, 034F combining grapheme joiner, 061C Arabic letter mark
--       U+115F-1160                Hangul choseong and jungseong fillers
--       U+17B4-17B5                Khmer inherent vowels
--       U+180B-180F                Mongolian free variation selectors, vowel separator
--       U+200B-200F                zero-width space, non-joiner, joiner, LRM, RLM
--       U+202A-202E                bidi embedding and override
--       U+2060-206F                word joiner, invisible operators, bidi isolates, deprecated format characters
--       U+2800                     braille pattern blank
--       U+3164                     Hangul filler
--       U+FE00-FE0F                variation selectors 1 to 16 (U+FE0F is the emoji presentation selector)
--       U+FFA0                     halfwidth Hangul filler
--       U+FFF0-FFFB                unassigned default-ignorables and the interlinear annotation characters
--       U+1BCA0-1BCA3              shorthand format controls
--       U+1D173-1D17A              musical symbol format controls
--       U+E0000-E0FFF              tag characters, variation selectors supplement, unassigned default-ignorables
--     U+FEFF is default-ignorable too, but it is whitespace (`\s`): a name loses it, a phone loses it at the ends.
--
-- No SQLSTATE, message or signature changes.

-- ---------------------------------------------------------------------------
-- S1. One ledger row per client / per size.
-- ---------------------------------------------------------------------------
-- An upgrade path for a database that already holds direct duplicate rows (only an attack or a test can have made
-- them): keep the oldest row of each client / size. Migrations run as postgres, which may delete.
delete from public.client_submissions a
using public.client_submissions b
where a.tenant_id = b.tenant_id
  and a.client_id = b.client_id
  and (a.created_at, a.id) > (b.created_at, b.id);

delete from public.size_submissions a
using public.size_submissions b
where a.tenant_id = b.tenant_id
  and a.size_id = b.size_id
  and (a.created_at, a.id) > (b.created_at, b.id);

-- Each unique constraint's index starts with tenant_id.
alter table public.client_submissions
  add constraint client_submissions_client_key unique (tenant_id, client_id);

alter table public.size_submissions
  add constraint size_submissions_size_key unique (tenant_id, size_id);

comment on constraint client_submissions_client_key on public.client_submissions is
  'One ledger row per client: add_client writes exactly one for the client it creates, so the ledger can never outgrow the 500-client cap or block an add (QA S1).';
comment on constraint size_submissions_size_key on public.size_submissions is
  'One ledger row per size: add_size writes exactly one for the size it creates, so the ledger can never outgrow the 100-size cap or block an add (QA S1).';

comment on function app.client_submissions_guard() is
  'Trigger: another farm''s tenant_id refused before its lock (42501); a backstop cap of 500 ledger rows per farm (TM026), which the one-row-per-client key keeps unreachable while a client is being added.';
comment on function app.size_submissions_guard() is
  'Trigger: another farm''s tenant_id refused before its lock (42501); a backstop cap of 100 ledger rows per farm (TM016), which the one-row-per-size key keeps unreachable while a size is being added.';

-- ---------------------------------------------------------------------------
-- S2. The hidden-character class, replaced (same signature and attributes, so the grants and the CHECK constraints
--     that call it stay). Postgres regex escapes: a lower-case u plus 4 hex digits, an upper-case U plus 8.
-- ---------------------------------------------------------------------------
create or replace function app.client_text_invalid(p_text text)
  returns boolean
  language sql
  immutable
  security invoker
  set search_path = ''
as $$
  select p_text ~ '[\u0001-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F-\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u2800\u3164\uFE00-\uFE0F\uFFA0\uFFF0-\uFFFB\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF]'
$$;

comment on function app.client_text_invalid(text) is
  'True when the text holds a control, invisible or blank-looking character (every Default_Ignorable_Code_Point except whitespace U+FEFF, plus U+2800). Twin of hasInvalidClientTextChar() / CLIENT_TEXT_INVALID_RANGES.';
