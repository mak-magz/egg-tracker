// Twin-rule guard for sales (docs/features/04-sales.md §2.5 "Copy", §3.3), in the pattern of
// client-name-parity.spec.ts: the two copies of a message that must say the same thing (the UI's `SALE_COPY`
// and the shared, server-facing `SALE_MESSAGES`) are compared here so that editing one without the other fails
// this test, instead of silently drifting the way QA S2 found. `SALE_COPY`'s overlapping keys now literally
// re-export `SALE_MESSAGES` (see sale-copy.ts), so most of these assertions are a same-reference check; they
// still guard against a future edit that reintroduces a second, hand-typed literal.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SALE_MESSAGES } from '../../shared/constants/sales'
import { SALE_COPY } from '../../app/utils/sale-copy'

describe('SALE_COPY reuses SALE_MESSAGES, never a second hand-typed literal, for every message the server can also raise', () => {
  const pairs: [keyof typeof SALE_COPY, keyof typeof SALE_MESSAGES][] = [
    ['clientRequired', 'clientRequired'],
    ['quantityRequired', 'quantityRequired'],
    ['priceNotANumber', 'priceNotANumber'],
    ['priceNotPositive', 'priceNotPositive'],
    ['priceTooManyDecimals', 'priceTooManyDecimals'],
    ['saleDateFuture', 'saleDateFuture'],
    ['dateEmpty', 'saleDateRequired'],
    ['deliveredDateFuture', 'deliveredDateFuture'],
    ['saveFailed', 'saveFailed'],
    ['addSizeLimitReached', 'linesMax'],
    ['serverTooManySizes', 'linesMax'],
    ['serverDuplicateSize', 'linesDuplicateSize'],
    ['serverSizesChanged', 'linesSizesChanged'],
    ['serverClientInactive', 'clientInvalid'],
    ['serverNotPending', 'notPending'],
    ['serverNotComplete', 'notComplete'],
    ['serverVoided', 'voided'],
    ['changedElsewhere', 'saleChanged'],
    ['deleteFailed', 'deleteFailed'],
    ['voidFailed', 'voidFailed'],
  ]

  it.each(pairs)('SALE_COPY.%s === SALE_MESSAGES.%s', (copyKey, messageKey) => {
    expect(SALE_COPY[copyKey]).toBe(SALE_MESSAGES[messageKey])
  })
})

describe('SALE_MESSAGES matches §2.5\'s Copy table verbatim (the ones the FE dev\'s own note flagged as reworded)', () => {
  it('client inactive/gone', () => {
    expect(SALE_MESSAGES.clientInvalid).toBe('This client is inactive now. Choose another client.')
  })

  it('sale date: future (AC23)', () => {
    expect(SALE_MESSAGES.saleDateFuture).toBe('The sale date can\'t be in the future. Pick today or earlier.')
  })

  it('delivered date: future', () => {
    expect(SALE_MESSAGES.deliveredDateFuture).toBe('The delivered date can\'t be in the future. Pick today or earlier.')
  })

  it('sale not Pending (AC44)', () => {
    expect(SALE_MESSAGES.notPending).toBe('This sale is no longer pending. Void it instead.')
  })

  it('sale not Complete (AC67)', () => {
    expect(SALE_MESSAGES.notComplete).toBe('This sale isn\'t complete anymore. The list is up to date now.')
  })

  it('sale is voided (AC67, AC68)', () => {
    expect(SALE_MESSAGES.voided).toBe('This sale is voided and can\'t be changed.')
  })

  it('too many sizes / same size twice / size gone (unchanged, already matched)', () => {
    expect(SALE_MESSAGES.linesMax).toBe('A sale can have up to 20 sizes.')
    expect(SALE_MESSAGES.linesDuplicateSize).toBe('Each size can be in a sale once. Change its quantity instead.')
    expect(SALE_MESSAGES.linesSizesChanged).toBe('Your sizes have changed. Close this form and open it again.')
  })
})

describe('SaleForm.vue and sale-errors.ts read ApiErrorData.fields through SALE_FIELDS, not a hand-typed literal', () => {
  const readSrc = (relPath: string) => readFileSync(join(__dirname, '..', '..', relPath), 'utf8')

  it('SaleForm.vue imports SALE_FIELDS and applyServerFields indexes fields[] by it, not a literal .saleDate/.clientId/.deliveredDate/.lines', () => {
    const src = readSrc('app/components/SaleForm.vue')
    expect(src).toMatch(/import\s*\{[^}]*SALE_FIELDS[^}]*\}\s*from\s*['"]#shared\/constants\/sales['"]/)
    const fnStart = src.indexOf('function applyServerFields')
    expect(fnStart).toBeGreaterThan(-1)
    const fnEnd = src.indexOf('\n}', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    expect(fn).not.toMatch(/fields\.(type|clientId|saleDate|deliveredDate|lines)\b/)
    for (const key of ['type', 'clientId', 'saleDate', 'deliveredDate', 'lines']) {
      expect(fn).toContain(`SALE_FIELDS.${key}`)
    }
  })

  it('sale-errors.ts reads the sale-changed fields through SALE_FIELDS, not literal .version/.id', () => {
    const src = readSrc('app/utils/sale-errors.ts')
    expect(src).toMatch(/import\s*\{[^}]*SALE_FIELDS[^}]*\}\s*from\s*['"]#shared\/constants\/sales['"]/)
    expect(src).not.toMatch(/fields\.(version|id)\b/)
    expect(src).toContain('SALE_FIELDS.version')
    expect(src).toContain('SALE_FIELDS.id')
  })
})
