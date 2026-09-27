import { describe, expect, it } from 'vitest'
import { CLIENT_COPY } from '../../app/utils/client-copy'
import { formatPrice } from '../../shared/utils/price'

describe('CLIENT_COPY (feature 03 §2.5 "Copy")', () => {
  it('the subtitle counts customers, with the singular and zero', () => {
    expect(CLIENT_COPY.subtitle(5)).toBe('5 customers')
    expect(CLIENT_COPY.subtitle(1)).toBe('1 customer')
    expect(CLIENT_COPY.subtitle(0)).toBe('0 customers')
  })

  it('names the client in toasts and aria labels, exactly as the design says', () => {
    expect(CLIENT_COPY.toastAdded('Maple Street Market')).toBe('Added Maple Street Market')
    expect(CLIENT_COPY.toastUpdated('Maple Street Market')).toBe('Updated Maple Street Market')
    expect(CLIENT_COPY.toastMarkedInactive('Oakhill Bakery')).toBe('Marked Oakhill Bakery inactive')
    expect(CLIENT_COPY.toastMarkedActive('Oakhill Bakery')).toBe('Marked Oakhill Bakery active')
    expect(CLIENT_COPY.editAria('Linda Ferris')).toBe('Edit Linda Ferris')
    expect(CLIENT_COPY.actionsFor('Linda Ferris')).toBe('Actions for Linda Ferris')
    expect(CLIENT_COPY.markNamedActive('Oakhill Bakery')).toBe('Mark Oakhill Bakery active')
  })

  it('says why a row left the list when the status filter hides it (owner decision O3)', () => {
    expect(CLIENT_COPY.toastHiddenByFilter(CLIENT_COPY.toastMarkedInactive('Oakhill Bakery'), CLIENT_COPY.statusActive))
      .toBe('Marked Oakhill Bakery inactive. Hidden by the Active filter.')
    expect(CLIENT_COPY.toastHiddenByFilter(CLIENT_COPY.toastMarkedActive('Oakhill Bakery'), CLIENT_COPY.statusInactive))
      .toBe('Marked Oakhill Bakery active. Hidden by the Inactive filter.')
  })

  it('the mark-failed toast says which way it was going', () => {
    expect(CLIENT_COPY.markFailed('Oakhill Bakery', false)).toBe('Couldn\'t mark Oakhill Bakery inactive. Check your connection and try again.')
    expect(CLIENT_COPY.markFailed('Oakhill Bakery', true)).toBe('Couldn\'t mark Oakhill Bakery active. Check your connection and try again.')
  })

  it('shows the filtered count and the price unit; the symbol comes from the price rule, never from this file', () => {
    expect(CLIENT_COPY.showing(3, 12)).toBe('Showing 3 of 12')
    expect(CLIENT_COPY.pricePerTray(formatPrice(1250, 'PHP'))).toBe('₱1,250.00 / tray')
    expect(CLIENT_COPY.pricePerTray(formatPrice(6.5, 'USD'))).toBe('$6.50 / tray')
    expect(JSON.stringify(CLIENT_COPY)).not.toMatch(/[₱$€£]/)
  })

  it('never offers delete, and never says archive, invalid, conflict or duplicate (AC21, CL2, UX notes)', () => {
    const all = JSON.stringify(CLIENT_COPY, (_k, v) => (typeof v === 'function' ? v('X', true) : v)).toLowerCase()
    expect(all).not.toMatch(/delete|archiv|invalid|conflict|duplicate|unique/)
  })

  it('uses "trays" only as per tray and never mentions eggs (UX "Notes on the wording")', () => {
    const all = JSON.stringify(CLIENT_COPY, (_k, v) => (typeof v === 'function' ? v('X', true) : v)).toLowerCase()
    expect(all).not.toMatch(/egg/)
  })
})
