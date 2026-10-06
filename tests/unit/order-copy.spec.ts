import { describe, expect, it } from 'vitest'
import { ORDER_COPY, sortStatusMoves, statusMoveLabel } from '../../app/utils/order-copy'
import { ORDER_MESSAGES } from '../../shared/constants/orders'
import { orderActions } from '../../shared/utils/order-status'

describe('statusMoveLabel / sortStatusMoves (flow C, row menu)', () => {
  it('forward is "Mark …", backward is "Back to …"', () => {
    expect(statusMoveLabel('requested', 'confirmed')).toBe('Mark confirmed')
    expect(statusMoveLabel('requested', 'ready')).toBe('Mark ready')
    expect(statusMoveLabel('confirmed', 'ready')).toBe('Mark ready')
    expect(statusMoveLabel('confirmed', 'requested')).toBe('Back to requested')
    expect(statusMoveLabel('ready', 'confirmed')).toBe('Back to confirmed')
    expect(statusMoveLabel('ready', 'requested')).toBe('Back to requested')
  })

  it('lists the moves in the wireframe\'s order for each status', () => {
    const menu = (from: 'requested' | 'confirmed' | 'ready') =>
      sortStatusMoves(from, orderActions({ status: from, deliveryCount: 0 }).status).map(to => statusMoveLabel(from, to))
    expect(menu('requested')).toEqual(['Mark confirmed', 'Mark ready'])
    expect(menu('confirmed')).toEqual(['Mark ready', 'Back to requested'])
    expect(menu('ready')).toEqual(['Back to confirmed', 'Back to requested'])
  })
})

describe('ORDER_COPY reuses ORDER_MESSAGES, never a second hand-typed literal, for the messages the server can also raise', () => {
  const pairs: [keyof typeof ORDER_COPY, keyof typeof ORDER_MESSAGES][] = [
    ['clientRequired', 'clientRequired'],
    ['orderDateFuture', 'orderDateFuture'],
    ['dateEmpty', 'orderDateRequired'],
    ['saveFailed', 'saveFailed'],
    ['editSaveFailed', 'editSaveFailed'],
    ['tooManySizes', 'linesMax'],
    ['addSizeLimitReached', 'linesMax'],
    ['duplicateSize', 'linesDuplicateSize'],
    ['sizesChanged', 'linesSizesChanged'],
    ['clientInactive', 'clientInvalid'],
    ['orderClosed', 'orderClosed'],
    ['cancelRefused', 'cancelRefused'],
    ['statusLocked', 'statusLocked'],
    ['closeRefused', 'closeRefused'],
    ['changedElsewhere', 'orderChanged'],
    ['deliverNone', 'deliverNone'],
    ['deliverDateFuture', 'deliveredDateFuture'],
    ['raced', 'overDelivery'],
    ['deliverFailed', 'deliverFailed'],
    ['cancelFailed', 'cancelFailed'],
    ['closeFailed', 'closeFailed'],
    ['clientLockedHelper', 'clientLocked'],
    ['dateRangeInvalid', 'endBeforeStart'],
  ]

  it.each(pairs)('ORDER_COPY.%s === ORDER_MESSAGES.%s', (copyKey, messageKey) => {
    expect(ORDER_COPY[copyKey]).toBe(ORDER_MESSAGES[messageKey])
  })
})

describe('ORDER_COPY matches §2.5\'s Copy table', () => {
  it('numbers always carry the word (Terms: "Order #12" / "Sale #12", never a bare number)', () => {
    expect(ORDER_COPY.orderTitle(12)).toBe('Order #12')
    expect(ORDER_COPY.editTitle(12)).toBe('Edit order #12')
    expect(ORDER_COPY.deliverTitle(12)).toBe('Deliver order #12')
    expect(ORDER_COPY.cancelTitle(12)).toBe('Cancel order #12?')
    expect(ORDER_COPY.closeTitle(12)).toBe('Close order #12 short?')
    expect(ORDER_COPY.saleRow(52, 'Oct 3')).toBe('Sale #52 · Oct 3')
    expect(ORDER_COPY.formerlySale(1038)).toBe('Formerly sale #1038')
  })

  it('toasts', () => {
    expect(ORDER_COPY.toastSaved(12)).toBe('Order #12 saved')
    expect(ORDER_COPY.toastUpdated(12)).toBe('Updated order #12')
    expect(ORDER_COPY.toastUpdatedFulfilled(12)).toBe('Updated order #12. It\'s fulfilled now.')
    expect(ORDER_COPY.toastStatus(12, 'Confirmed')).toBe('Order #12 is now Confirmed.')
    expect(ORDER_COPY.toastDelivered(52, 12, 'partially fulfilled')).toBe('Delivered: sale #52. Order #12 is now partially fulfilled.')
    expect(ORDER_COPY.toastCancelled(12)).toBe('Order #12 cancelled.')
    expect(ORDER_COPY.toastClosedShort(12)).toBe('Order #12 closed short.')
  })

  it('totals and the progress-adjacent strings', () => {
    expect(ORDER_COPY.orderTotal('₱78.23')).toBe('Order total ₱78.23')
    expect(ORDER_COPY.orderTotalSoFar('₱54.23')).toBe('Order total so far ₱54.23')
    expect(ORDER_COPY.orderTotalEmpty).toBe('Order total —')
    expect(ORDER_COPY.leftToDeliver('10 trays')).toBe('10 trays left')
    expect(ORDER_COPY.onlyLeft('4 trays')).toBe('Only 4 trays left to deliver.')
    expect(ORDER_COPY.atLeastDelivered('20 trays')).toBe('At least 20 trays delivered')
  })

  it('the Close short sentence for one size is exact', () => {
    expect(ORDER_COPY.closeOne('10 trays', 'Medium')).toBe('Closing short drops 10 trays of Medium. Deliveries already made stay.')
  })

  it('the status chips', () => {
    expect([ORDER_COPY.viewOpen, ORDER_COPY.viewAll, ORDER_COPY.viewFulfilled, ORDER_COPY.viewCancelled]).toEqual(['Open', 'All', 'Fulfilled', 'Cancelled'])
  })

  it('no order copy mentions pending sales (feature 05 AC37) or says "line item" / "SKU"', () => {
    const text = JSON.stringify(Object.values(ORDER_COPY).map(v => (typeof v === 'string' ? v : '')))
    expect(text).not.toMatch(/pending|line item|SKU|invalid|constraint/i)
  })
})
