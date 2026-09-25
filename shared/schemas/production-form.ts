// The Log/Edit production FORM schema, in trays + loose per line (feature 01 §3.4, AC9–AC11, UX States).
// The API schema (./production.ts) validates egg counts; this one validates what the owner typed and
// converts it through the one quantity helper. Relative imports so tests run it outside Nuxt.
import { z } from 'zod'
import type { IsoDate, ProductionAmounts, ProductionDay } from '../types/api'
import { MAX_EGGS_PER_LINE, PRODUCTION_FIELDS, PRODUCTION_MESSAGES } from '../constants/production'
import { compareIsoDates, isIsoDate } from '../utils/local-date'
import { splitEggs, toEggs } from '../utils/quantity'

export type ProductionFormMode = 'log' | 'edit'

/** One trays + loose line. Blank (null) counts as 0. */
export interface QuantityFields {
  trays: number | null
  loose: number | null
}

export interface ProductionFormState {
  date: IsoDate
  /** Keyed by size id, one entry per size line shown. */
  lines: Record<string, QuantityFields>
  rejects: QuantityFields
}

export interface ProductionFormOptions {
  eggsPerTray: number
  /** The size lines the form shows (active sizes, plus any size already on an edited day). */
  sizeIds: readonly string[]
  /** The device's local date (todayLocal()). */
  today: IsoDate
  mode: ProductionFormMode
}

/** Form paths, so the form and the server-error mapping agree. */
export const PRODUCTION_FORM_PATHS = {
  date: PRODUCTION_FIELDS.date,
  amounts: PRODUCTION_FIELDS.amounts,
  line: (sizeId: string, part: keyof QuantityFields) => `lines.${sizeId}.${part}`,
  rejects: (part: keyof QuantityFields) => `rejects.${part}`,
} as const

const blankToZero = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : v)

function wholeCount() {
  return z.number({ error: PRODUCTION_MESSAGES.notWholeNumber })
    .int({ error: PRODUCTION_MESSAGES.notWholeNumber })
    .min(0, { error: PRODUCTION_MESSAGES.notWholeNumber })
}

function lineSchema(eggsPerTray: number) {
  return z.object({
    trays: z.preprocess(blankToZero, wholeCount()),
    loose: z.preprocess(blankToZero, wholeCount().max(eggsPerTray - 1, { error: PRODUCTION_MESSAGES.looseTooHigh(eggsPerTray) })),
  }).superRefine((v, ctx) => {
    if (v.trays * eggsPerTray + v.loose > MAX_EGGS_PER_LINE) {
      ctx.addIssue({ code: 'custom', message: PRODUCTION_MESSAGES.tooLarge, path: ['trays'] })
    }
  })
}

function lineEggs(line: QuantityFields | undefined, eggsPerTray: number): number {
  const t = line?.trays ?? 0
  const l = line?.loose ?? 0
  return Number.isInteger(t) && Number.isInteger(l) && t >= 0 && l >= 0 ? toEggs(t, l, eggsPerTray) : 0
}

export function createProductionFormSchema({ eggsPerTray, sizeIds, today, mode }: ProductionFormOptions) {
  const line = lineSchema(eggsPerTray)
  const date = z
    .string({ error: PRODUCTION_MESSAGES.dateRequired })
    .refine(isIsoDate, { error: PRODUCTION_MESSAGES.dateRequired, abort: true })
    .refine(d => mode === 'edit' || compareIsoDates(d, today) <= 0, { error: PRODUCTION_MESSAGES.futureDate })

  return z.object({
    date,
    lines: z.object(Object.fromEntries(sizeIds.map(id => [id, line]))),
    rejects: line,
  }).superRefine((v, ctx) => {
    // Log: nothing entered is an error (AC10). Edit: all zero routes to the delete dialog (AC24).
    if (mode !== 'log') return
    const any = sizeIds.some(id => lineEggs(v.lines[id], eggsPerTray) > 0) || lineEggs(v.rejects, eggsPerTray) > 0
    if (!any) ctx.addIssue({ code: 'custom', message: PRODUCTION_MESSAGES.nothingEntered, path: [PRODUCTION_FORM_PATHS.amounts] })
  })
}

/** Form state -> API amounts in eggs. Zero lines are left out (Edit: a size set to 0 is removed). */
export function toProductionAmounts(state: ProductionFormState, eggsPerTray: number, sizeIds: readonly string[]): ProductionAmounts {
  return {
    good: sizeIds
      .map(sizeId => ({ sizeId, eggs: lineEggs(state.lines[sizeId], eggsPerTray) }))
      .filter(g => g.eggs > 0),
    rejects: lineEggs(state.rejects, eggsPerTray),
  }
}

export function isEmptyAmounts(amounts: ProductionAmounts): boolean {
  return amounts.rejects === 0 && amounts.good.every(g => g.eggs === 0)
}

function toFields(eggs: number, eggsPerTray: number): QuantityFields {
  if (eggs <= 0) return { trays: null, loose: null }
  const { trays, loose } = splitEggs(eggs, eggsPerTray)
  return { trays: trays || null, loose: loose || null }
}

/** A blank form, or (Edit) one pre-filled with a day's totals split at the current tray size. */
export function createProductionFormState(
  opts: { date: IsoDate, sizeIds: readonly string[], eggsPerTray: number, day?: ProductionDay | null },
): ProductionFormState {
  const byId = new Map((opts.day?.good ?? []).map(g => [g.sizeId, g.eggs]))
  return {
    date: opts.date,
    lines: Object.fromEntries(opts.sizeIds.map(id => [id, toFields(byId.get(id) ?? 0, opts.eggsPerTray)])),
    rejects: toFields(opts.day?.rejects ?? 0, opts.eggsPerTray),
  }
}
