-- M11 tenants_currency (docs/features/03-clients.md §3.1 "M11", AC35 to AC37, CL12)
--
-- The farm's currency is per-farm DATA, like eggs_per_tray: an ISO 4217 code, PHP (the Philippine peso, shown as
-- the peso sign) by default. Adding a column with a constant NOT NULL DEFAULT fills every existing farm with 'PHP'
-- in the same statement, so there is no separate backfill and no window with nulls. provision_farm inserts
-- without naming the column, so a newly provisioned farm gets PHP with no extra step.
--
-- The check is a FORMAT check (three capital letters), not a list: the app decides which codes it can show
-- (the formatter falls back to PHP for an unknown one), so the follow-up settings feature needs no migration to
-- offer another currency.
--
-- Grants and policies do NOT change: `tenants` stays select-only for owners (no write grant, no write policy),
-- so an owner still can't change the currency (AC35); the new column is covered by the table-level select and the
-- existing tenants_select_own policy (a farm never sees another farm's row).
-- The default 'PHP' must equal DEFAULT_CURRENCY in shared/constants/currency.ts (tests/unit/clients-constants.spec.ts).
alter table public.tenants
  add column currency text not null default 'PHP',
  add constraint tenants_currency_format check (currency ~ '^[A-Z]{3}$');
