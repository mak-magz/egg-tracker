// The farm's currency (docs/features/03-clients.md §3.1 M11, AC35 to AC37). The currency is per-farm data
// (`tenants.currency`, an ISO 4217 code); this is only the FALLBACK the formatter uses when a farm's value is
// missing or unknown, and it must equal the column default in the `tenants_currency` migration
// (tests/unit/clients-constants.spec.ts compares them once that migration exists).

/** Philippine peso, shown as ₱. The default for every farm until the owner can change it in Settings. */
export const DEFAULT_CURRENCY = 'PHP'
