import { describe, expect, it } from 'vitest'
import {
  REJECT_COLOR,
  REJECT_HEX_DARK,
  REJECT_HEX_LIGHT,
  rejectColorHex,
  SIZE_HEX_DARK,
  SIZE_HEX_LIGHT,
  SIZE_PALETTE,
  sizeColor,
  sizeColorHex,
} from '../../app/utils/size-colors'

describe('sizeColor (UX R2)', () => {
  it('keeps the design colours for the seeded slots 0-3', () => {
    expect(sizeColor(0).class).toContain('text-blue-600')
    expect(sizeColor(1).class).toContain('text-yellow-600')
    expect(sizeColor(2).class).toContain('text-green-600')
    expect(sizeColor(3).class).toContain('text-slate-600')
  })

  it('gives six distinct colours to a six-size farm (AC38)', () => {
    const classes = [0, 1, 2, 3, 4, 5].map(s => sizeColor(s).class)
    expect(new Set(classes).size).toBe(6)
  })

  it('uses the 600 shade in light mode (lime 700) and 400 in dark mode', () => {
    for (const cls of SIZE_PALETTE) {
      expect(cls).toMatch(/^text-\w+-(600|700) dark:text-\w+-400$/)
    }
  })

  it('never uses red for a size; rejects are always the error colour', () => {
    for (const cls of SIZE_PALETTE) expect(cls).not.toMatch(/red|error/)
    expect(REJECT_COLOR).toBe('text-error')
  })

  it('repeats the palette from slot 10 with a dashed line', () => {
    expect(sizeColor(9)).toEqual({ class: SIZE_PALETTE[9], dashed: false })
    expect(sizeColor(10)).toEqual({ class: SIZE_PALETTE[0], dashed: true })
    expect(sizeColor(23)).toEqual({ class: SIZE_PALETTE[3], dashed: true })
  })

  it('depends only on the slot, not on list position', () => {
    expect(sizeColor(4)).toEqual(sizeColor(4))
    expect(sizeColor(-1)).toEqual(sizeColor(0))
  })
})

describe('sizeColorHex and rejectColorHex (Chart.js canvas)', () => {
  it('returns light palette hex when isDark is false', () => {
    expect(sizeColorHex(0, false)).toEqual({ hex: SIZE_HEX_LIGHT[0], dashed: false })
    expect(sizeColorHex(1, false)).toEqual({ hex: SIZE_HEX_LIGHT[1], dashed: false })
    expect(sizeColorHex(2, false)).toEqual({ hex: SIZE_HEX_LIGHT[2], dashed: false })
    expect(sizeColorHex(3, false)).toEqual({ hex: SIZE_HEX_LIGHT[3], dashed: false })
    expect(rejectColorHex(false)).toBe(REJECT_HEX_LIGHT)
  })

  it('returns dark palette hex when isDark is true', () => {
    expect(sizeColorHex(0, true)).toEqual({ hex: SIZE_HEX_DARK[0], dashed: false })
    expect(sizeColorHex(1, true)).toEqual({ hex: SIZE_HEX_DARK[1], dashed: false })
    expect(rejectColorHex(true)).toBe(REJECT_HEX_DARK)
  })

  it('flags dashed for slot 10+ in hex mode', () => {
    expect(sizeColorHex(9, false).dashed).toBe(false)
    expect(sizeColorHex(10, false)).toEqual({ hex: SIZE_HEX_LIGHT[0], dashed: true })
    expect(sizeColorHex(10, true)).toEqual({ hex: SIZE_HEX_DARK[0], dashed: true })
  })

  it('never uses red for a size hex; rejects are red hex', () => {
    for (const hex of SIZE_HEX_LIGHT) expect(hex.toLowerCase()).not.toBe(REJECT_HEX_LIGHT.toLowerCase())
    for (const hex of SIZE_HEX_DARK) expect(hex.toLowerCase()).not.toBe(REJECT_HEX_DARK.toLowerCase())
    expect(rejectColorHex(false)).toBe('#dc2626')
    expect(rejectColorHex(true)).toBe('#f87171')
  })
})
