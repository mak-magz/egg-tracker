-- M12 clients (docs/features/03-clients.md §3.1 "M12", §3.2, §3.8 D1, D2, D4, D8, D9)
--
-- Clients are the farm's customers (not tenants) and the first personal data in the app (names, phones). Owners
-- WRITE `clients` (the M13 functions are security invoker, so the caller needs the privilege), and the browser holds
-- the same JWT, so PostgREST can reach the table directly. Every rule that matters therefore lives here, in the
-- database, for EVERY write path (feature 02's sizes hardening lessons applied from the start):
--   * column-level grants: an owner can never write id, tenant_id on update, version, created_at, and a client is
--     born active (archived_at is not insertable);
--   * NO delete grant, NO delete policy, no delete anywhere: a client is never deleted (AC21);
--   * a BEFORE trigger: raw input caps, normalisation, validation, the 500-client cap, immutability, version bump;
--   * CHECK constraints repeating the rules, and a unique index (per farm, case and spacing ignored, accents kept).
--
-- Custom SQLSTATEs (continuing TM001-TM016; M13 raises the friendly ones from its functions):
--   TM017 name blank, too long or with a hidden character (HINT: blank | too_long | invalid); a raw name over 200
--   TM018 phone too long or with a hidden character (HINT: too_long | invalid); a raw phone over 200
--   TM019 default price not above 0, above 9999.99 or with more than 2 decimals (HINT: not_positive | too_large | too_many_decimals)
--   TM020 another client of the farm has the name (M13; DETAIL = {"id","archived"}, never the name)
--   TM021 the farm already has 500 clients (inactive included)
--   TM022 stale version on an edit that would change something (M13)
--   TM023 the id isn't one of this farm's clients (M13)
--   TM024 a submission id reused with a different payload (M13)
--   TM025 id or tenant_id changed (trigger)
--   TM026 the farm's client ledger already has 500 rows (direct inserts only)
-- Every message below is a FIXED string: no exception text ever contains a name, phone or price (AC29).

-- ---------------------------------------------------------------------------
-- 1. Helpers (schema app: not exposed by PostgREST). They run as the caller (CHECK constraints and the M13
--    functions call them), so `authenticated` may execute them; anon may not.
-- ---------------------------------------------------------------------------

-- The client name rule: the ONE existing definition of "a name" (NFC, whitespace runs collapsed, trimmed), so the
-- JavaScript/SQL parity test of sizes covers it. Twin of normalizeClientName in shared/utils/client-name.ts.
create function app.normalize_client_name(p_name text)
  returns text
  language sql
  immutable
  security invoker
  set search_path = ''
as $$
  select app.normalize_size_name(p_name)
$$;

comment on function app.normalize_client_name(text) is
  'Client-name rule (AC10): NFC, whitespace runs collapsed to one space, ends trimmed. Same rule as size names.';

-- The phone rule: NFC, then TRIM ONLY (the inside is untouched: "(555) 201-3348" saves unchanged, AC12); a blank
-- result is null. The whitespace class is the one in app.normalize_size_name, copied verbatim (parity-tested:
-- tests/unit/client-name-parity.spec.ts). Twin of normalizeClientPhone().
create function app.normalize_client_phone(p_phone text)
  returns text
  language sql
  immutable
  security invoker
  set search_path = ''
as $$
  select nullif(regexp_replace(
    normalize(p_phone, nfc),
    '^[\t\n\v\f\r    -     　﻿]+|[\t\n\v\f\r    -     　﻿]+$',
    '', 'g'), '')
$$;

comment on function app.normalize_client_phone(text) is
  'Client-phone rule (AC12): NFC, ends trimmed, inside untouched, blank becomes null. Twin of normalizeClientPhone().';

-- True when the text holds a control or invisible character (AC10, AC12; feature 02 audit L-3 / QA N1). Postgres
-- regexes have no \p{Cf}, so the class is spelled out. Its JavaScript twin is CLIENT_TEXT_INVALID_RANGES in
-- shared/utils/client-name.ts (parity-tested over every code point Postgres can hold):
--   U+0001-001F, 007F-009F  control characters (NUL can't exist in a Postgres text)
--   U+00AD soft hyphen, 061C Arabic letter mark, 180E Mongolian vowel separator
--   U+200B-200F  zero-width space, non-joiner, joiner, LRM, RLM
--   U+202A-202E  bidi embedding and override
--   U+2060-2064, 2066-206F  word joiner, invisible operators, bidi isolates, deprecated format characters
--   U+FFF9-FFFB  interlinear annotation
--   U+E0000-E007F  tag characters
-- Tab, newline, NBSP and the other spaces are NOT here: a name collapses them to spaces first, and a phone may hold
-- a plain space. U+FEFF is whitespace (`\s`), so it is trimmed rather than refused. Lone surrogates can't be stored
-- in a Postgres UTF-8 text (PostgREST refuses them earlier: PGRST102) and the zod schema refuses them too.
create function app.client_text_invalid(p_text text)
  returns boolean
  language sql
  immutable
  security invoker
  set search_path = ''
as $$
  select p_text ~ '[\u0001-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFFF9-\uFFFB\U000E0000-\U000E007F]'
$$;

comment on function app.client_text_invalid(text) is
  'True when the text holds a control or invisible character. Twin of hasInvalidClientTextChar() / CLIENT_TEXT_INVALID_RANGES.';

-- Serialises client writes for one farm for the length of the (short) transaction: the 500 count, the name check
-- and the version check can't race. The key prefix differs from 'sizes:' and the production-day key. Re-entrant.
create function app.lock_tenant_clients(p_tenant_id uuid)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('clients:' || p_tenant_id::text, 0));
end
$$;

-- A cheap cap on the RAW text before any regex runs (audit M-2). Real values are 60 and 30 characters.
create function app.assert_client_input_size(p_name text, p_phone text)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if char_length(p_name) > 200 then
    raise exception 'client name is too long' using errcode = 'TM017', hint = 'too_long';
  end if;
  if char_length(p_phone) > 200 then
    raise exception 'client phone is too long' using errcode = 'TM018', hint = 'too_long';
  end if;
end
$$;

-- The rules on the NORMALISED values. The trigger and the M13 functions both call it, so the rule has one SQL
-- definition. The HINT carries the reason; the message is a fixed string that never holds a value (AC29).
create function app.assert_client_fields(p_name text, p_phone text, p_price numeric)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if p_name is null or p_name = '' then
    raise exception 'client name is required' using errcode = 'TM017', hint = 'blank';
  end if;
  if app.client_text_invalid(p_name) then
    raise exception 'client name has a hidden character' using errcode = 'TM017', hint = 'invalid';
  end if;
  if char_length(p_name) > 60 then
    raise exception 'client name is too long' using errcode = 'TM017', hint = 'too_long';
  end if;

  if p_phone is not null then
    if app.client_text_invalid(p_phone) then
      raise exception 'client phone has a hidden character' using errcode = 'TM018', hint = 'invalid';
    end if;
    if char_length(p_phone) > 30 then
      raise exception 'client phone is too long' using errcode = 'TM018', hint = 'too_long';
    end if;
  end if;

  -- NaN sorts above every number in Postgres and -Infinity below, so they land on too_large and not_positive.
  if p_price is not null then
    if p_price <= 0 then
      raise exception 'default price must be above 0' using errcode = 'TM019', hint = 'not_positive';
    end if;
    if p_price > 9999.99 then
      raise exception 'default price is too large' using errcode = 'TM019', hint = 'too_large';
    end if;
    if p_price <> round(p_price, 2) then
      raise exception 'default price has too many decimals' using errcode = 'TM019', hint = 'too_many_decimals';
    end if;
  end if;
end
$$;

-- SHA-256 of the normalised payload, for the add ledger (audit L1: a replay whose payload differs is refused).
-- chr(31) can't appear in a valid name or phone, so the join is unambiguous; round(...)::text makes 6.5 and 6.50
-- the same payload. A hash instead of the values: no second copy of the personal data (Q11).
create function app.client_payload_hash(p_name text, p_phone text, p_price numeric)
  returns text
  language sql
  immutable
  security invoker
  set search_path = ''
as $$
  select encode(sha256(convert_to(
    p_name || chr(31) || coalesce(p_phone, '') || chr(31) || coalesce(round(p_price, 2)::text, ''),
    'UTF8')), 'hex')
$$;

revoke all on function app.normalize_client_name(text) from public;
revoke all on function app.normalize_client_phone(text) from public;
revoke all on function app.client_text_invalid(text) from public;
revoke all on function app.lock_tenant_clients(uuid) from public;
revoke all on function app.assert_client_input_size(text, text) from public;
revoke all on function app.assert_client_fields(text, text, numeric) from public;
revoke all on function app.client_payload_hash(text, text, numeric) from public;

grant execute on function app.normalize_client_name(text) to authenticated;
grant execute on function app.normalize_client_phone(text) to authenticated;
grant execute on function app.client_text_invalid(text) to authenticated;
grant execute on function app.lock_tenant_clients(uuid) to authenticated;
grant execute on function app.assert_client_input_size(text, text) to authenticated;
grant execute on function app.assert_client_fields(text, text, numeric) to authenticated;
grant execute on function app.client_payload_hash(text, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants (id) on delete cascade,
  name          text        not null,
  -- null = no phone.
  phone         text,
  -- null = no default price. The number the owner typed, PER TRAY, in the farm's currency. Unconstrained `numeric`
  -- on purpose: numeric(6,2) would silently round 6.505 to 6.51 before any check could refuse it.
  default_price numeric,
  -- null = active. The owner sees "Inactive" (CL2). A client is never deleted.
  archived_at   timestamptz,
  -- The stale-edit marker (AC19, D4): bumped by the trigger on every real change. bigint: can't overflow.
  version       bigint      not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint clients_name_normalised check (name = app.normalize_client_name(name)),
  constraint clients_name_length check (char_length(name) between 1 and 60),
  constraint clients_name_chars check (not app.client_text_invalid(name)),
  constraint clients_phone_valid check (
    phone is null
    or (phone = app.normalize_client_phone(phone) and char_length(phone) between 1 and 30 and not app.client_text_invalid(phone))
  ),
  -- Value-based: 6.500 is accepted (stored as 6.50), 6.505 refused; NaN and Infinity fail the range test. The
  -- 9999.99 bound and the 2 decimals are currency-independent (AC13); the currency follow-up re-checks them.
  constraint clients_default_price_valid check (
    default_price is null
    or (default_price > 0 and default_price <= 9999.99 and default_price = round(default_price, 2))
  ),
  constraint clients_version_positive check (version >= 1),
  -- The composite key Sales will reference: foreign key (tenant_id, client_id) references clients (tenant_id, id),
  -- with NO cascade and NO set null (a client is never deleted, and a sale's client_id must always resolve).
  constraint clients_tenant_id_id_key unique (tenant_id, id)
);

comment on table public.clients is
  'The farm''s customers (personal data). Never deleted: archived_at marks one inactive. Written only within the M12 rules.';

-- Unique per farm, ignoring case and spacing (names are stored normalised), inactive clients included (no partial
-- index). NOT accent-folded on purpose (owner decision: "Cafe" and "Café" are different names). Starts with tenant_id.
create unique index clients_tenant_name_key on public.clients (tenant_id, lower(name));

create trigger set_updated_at
  before update on public.clients
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. clients_write_guard: BEFORE INSERT OR UPDATE, every write path (trigger order is alphabetical, so it runs
--    before set_updated_at).
-- ---------------------------------------------------------------------------
create function app.clients_write_guard()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- L-1: the RLS WITH CHECK runs after this trigger, so refuse another farm's tenant_id BEFORE taking that farm's
    -- lock. Only for `authenticated`: provisioning and the test fixtures insert as postgres / service_role.
    if current_user = 'authenticated' and new.tenant_id is distinct from (select app.current_tenant_id()) then
      raise exception 'row is not for the caller''s farm' using errcode = '42501';
    end if;

    -- M-2: a cheap length check before the (regex) normalisation.
    perform app.assert_client_input_size(new.name, new.phone);
    new.name := app.normalize_client_name(new.name);
    new.phone := app.normalize_client_phone(new.phone);
    perform app.assert_client_fields(new.name, new.phone, new.default_price);
    -- Stored with exactly 2 decimals (the check already proved the value has no more): 6.5 reads back as 6.50.
    new.default_price := round(new.default_price, 2);

    -- The cap counts inactive clients too (they are never deleted). Under the lock, so two adds can't both pass.
    perform app.lock_tenant_clients(new.tenant_id);
    if (select count(*) from public.clients c where c.tenant_id = new.tenant_id) >= 500 then
      raise exception 'too many clients' using errcode = 'TM021';
    end if;
  else
    if new.tenant_id is distinct from old.tenant_id or new.id is distinct from old.id then
      raise exception 'id and tenant_id are immutable' using errcode = 'TM025';
    end if;

    if new.name is distinct from old.name or new.phone is distinct from old.phone
       or new.default_price is distinct from old.default_price then
      perform app.assert_client_input_size(new.name, new.phone);
      new.name := app.normalize_client_name(new.name);
      new.phone := app.normalize_client_phone(new.phone);
      perform app.assert_client_fields(new.name, new.phone, new.default_price);
      new.default_price := round(new.default_price, 2);
    end if;

    -- The version moves only on a real change (a no-op update must not stale anyone's open form), and only here.
    if new.name is distinct from old.name or new.phone is distinct from old.phone
       or new.default_price is distinct from old.default_price or new.archived_at is distinct from old.archived_at then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
  end if;

  return new;
end
$$;

comment on function app.clients_write_guard() is
  'Trigger: another farm''s tenant_id refused before its lock (42501), input capped, name and phone normalised, fields validated (TM017-TM019), 500-client cap (TM021), id/tenant_id immutable (TM025), version bumped on a real change.';

revoke all on function app.clients_write_guard() from public;

create trigger clients_write_guard
  before insert or update on public.clients
  for each row execute function app.clients_write_guard();

-- ---------------------------------------------------------------------------
-- 4. client_submissions: idempotency ledger for add_client (twin of size_submissions), hardened from the start.
--    It stores a HASH of the normalised payload, not the values: no second copy of the personal data (D9).
-- ---------------------------------------------------------------------------
create table public.client_submissions (
  tenant_id    uuid        not null references public.tenants (id) on delete cascade,
  -- The client's submissionId.
  id           uuid        not null,
  client_id    uuid        not null,
  -- SHA-256 of the normalised name, phone and price (app.client_payload_hash), so a replay whose payload differs is
  -- refused (TM024) instead of answered with the first client (audit L1).
  payload_hash text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Scoped to the tenant: one farm's key can never collide with, or probe, another farm's.
  constraint client_submissions_pkey primary key (tenant_id, id),
  constraint client_submissions_client_fk foreign key (tenant_id, client_id) references public.clients (tenant_id, id),
  constraint client_submissions_hash_format check (payload_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.client_submissions is 'Idempotency ledger for add_client, keyed by (tenant, client submissionId). Holds a payload hash, no personal data.';

create trigger set_updated_at
  before update on public.client_submissions
  for each row execute function app.set_updated_at();

-- Same shape as size_submissions_guard (audit M-1, L-1): the farm check comes before the lock; a farm's ledger
-- holds at most 500 rows. The cap equals the client cap: a ledger row is created only by add_client (one per created
-- client) and clients are never deleted, so the routes can never reach it; only direct inserts can.
create function app.client_submissions_guard()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if current_user = 'authenticated' and new.tenant_id is distinct from (select app.current_tenant_id()) then
    raise exception 'row is not for the caller''s farm' using errcode = '42501';
  end if;

  -- Serialise with the client writes, so two direct inserts can't both pass the count and exceed the cap.
  perform app.lock_tenant_clients(new.tenant_id);

  if (select count(*) from public.client_submissions s where s.tenant_id = new.tenant_id) >= 500 then
    raise exception 'too many client submissions' using errcode = 'TM026';
  end if;
  return new;
end
$$;

comment on function app.client_submissions_guard() is
  'Trigger: another farm''s tenant_id refused before its lock (42501); a farm''s client ledger holds at most 500 rows (TM026).';

revoke all on function app.client_submissions_guard() from public;

create trigger client_submissions_guard
  before insert on public.client_submissions
  for each row execute function app.client_submissions_guard();

-- ---------------------------------------------------------------------------
-- 5. Grants and policies (§3.2)
-- ---------------------------------------------------------------------------
revoke all on public.clients from anon, authenticated;
grant select on public.clients to authenticated;
-- Only what an owner may choose. Never id (no squatting a future Sales reference), archived_at (a client is born
-- active), version, created_at, updated_at.
grant insert (tenant_id, name, phone, default_price) on public.clients to authenticated;
-- Edit, mark inactive, mark active. Never id, tenant_id, version, created_at. updated_at is listed so the generic
-- isolation check 11 (update ... set updated_at = now()) has teeth; the trigger overwrites it.
grant update (name, phone, default_price, archived_at, updated_at) on public.clients to authenticated;
-- No delete, truncate, references or trigger privilege, and no delete policy (two locks: AC21).

alter table public.clients enable row level security;

create policy clients_select on public.clients
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy clients_insert on public.clients
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant_id()));

create policy clients_update on public.clients
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

revoke all on public.client_submissions from anon, authenticated;
grant select on public.client_submissions to authenticated;
-- Exactly what add_client writes (audit M-1).
grant insert (tenant_id, id, client_id, payload_hash) on public.client_submissions to authenticated;

alter table public.client_submissions enable row level security;

create policy client_submissions_select on public.client_submissions
  for select to authenticated
  using (tenant_id = (select app.current_tenant_id()));

create policy client_submissions_insert on public.client_submissions
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant_id()));
