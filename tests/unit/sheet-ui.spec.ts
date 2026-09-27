import { describe, expect, it } from 'vitest'
import { sheetUi } from '../../app/utils/sheet-ui'

// The Log production overlay's sheet classes as they were before feature 03 pulled them into sheetUi().
// Pulling them out must not change Production, so its width is compared to this exact string.
const PRODUCTION_SHEET_CONTENT = [
  'inset-x-0 left-0 top-auto bottom-(--sheet-kb,0px) translate-x-0 translate-y-0 w-full max-w-none',
  'rounded-t-2xl rounded-b-none ring-0 shadow-xl divide-y-0',
  'max-h-[min(88dvh,calc(var(--sheet-vvh,100dvh)-1rem))] sm:max-h-[min(88dvh,calc(var(--sheet-vvh,100dvh)-1rem))]',
  'data-[state=open]:animate-[slide-in-from-bottom_200ms_var(--ease-out)] data-[state=closed]:animate-[slide-out-to-bottom_200ms_var(--ease-out)]',
  'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
  'md:inset-x-auto md:top-1/2 md:left-1/2 md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2',
  'md:w-[calc(100vw-2rem)] md:max-w-[520px] md:rounded-2xl md:max-h-[85vh]',
  'md:data-[state=open]:animate-[scale-in_200ms_var(--ease-out)] md:data-[state=closed]:animate-[scale-out_200ms_var(--ease-out)]',
].join(' ')

describe('sheetUi', () => {
  it('520 is exactly the Log production sheet, unchanged', () => {
    expect(sheetUi(520).content).toBe(PRODUCTION_SHEET_CONTENT)
    expect(sheetUi(520).overlay).toBe('bg-[rgba(15,23,43,.5)] backdrop-blur-[4px]')
  })

  it('420 (Add client) differs only in the dialog width', () => {
    expect(sheetUi(420).content).toBe(PRODUCTION_SHEET_CONTENT.replace('md:max-w-[520px]', 'md:max-w-[420px]'))
    expect(sheetUi(420).overlay).toBe(sheetUi(520).overlay)
  })

  it('keeps the phone sheet above the keypad and reduced motion off', () => {
    const { content } = sheetUi(420)
    expect(content).toContain('bottom-(--sheet-kb,0px)')
    expect(content).toContain('var(--sheet-vvh,100dvh)')
    expect(content).toContain('motion-reduce:data-[state=open]:animate-none')
  })
})
