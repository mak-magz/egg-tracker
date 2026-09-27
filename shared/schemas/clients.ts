// Clients API schemas (zod 4), docs/features/03-clients.md §3.3.
// Relative imports so it runs outside Nuxt too. Unknown keys (a smuggled tenant_id, active, archivedAt, version on
// an add) are stripped by zod's default object behaviour, so they never reach the repository.
// Messages come from CLIENT_MESSAGES so the form and the API say the same thing, and NONE of them echoes the input (AC29).
import { z } from 'zod'
import {
  CLIENT_MESSAGES,
  MAX_CLIENT_NAME_LENGTH,
  MAX_CLIENT_PHONE_LENGTH,
  MAX_CLIENT_TEXT_INPUT_LENGTH,
} from '../constants/clients'
import {
  clientNameLength,
  hasInvalidClientTextChar,
  hasVisibleClientTextChar,
  normalizeClientName,
  normalizeClientPhone,
} from '../utils/client-name'
import { checkPriceNumber } from '../utils/price'

/**
 * A client name: normalised (NFC, spaces collapsed and trimmed), then 1 to 60 characters with no control or invisible
 * character and at least one letter, number, symbol or punctuation character (audit L3; the same "hidden character"
 * message). Never truncates.
 */
export const clientNameSchema = z
  .string({ error: CLIENT_MESSAGES.nameBlank })
  // A raw cap before normalising, like the database's (audit M-2): megabytes never reach the regex.
  .max(MAX_CLIENT_TEXT_INPUT_LENGTH, { error: CLIENT_MESSAGES.nameTooLong })
  .transform(normalizeClientName)
  .superRefine((name, ctx) => {
    if (name === '') {
      ctx.addIssue({ code: 'custom', message: CLIENT_MESSAGES.nameBlank })
    }
    else if (hasInvalidClientTextChar(name) || !hasVisibleClientTextChar(name)) {
      ctx.addIssue({ code: 'custom', message: CLIENT_MESSAGES.nameInvalid })
    }
    else if (clientNameLength(name) > MAX_CLIENT_NAME_LENGTH) {
      ctx.addIssue({ code: 'custom', message: CLIENT_MESSAGES.nameTooLong })
    }
  })

/** A phone: trimmed only, blank becomes null, at most 30 characters, no control or invisible character, at least one visible one (audit L3). Any format is fine. */
export const clientPhoneSchema = z
  .string({ error: CLIENT_MESSAGES.phoneInvalid })
  .max(MAX_CLIENT_TEXT_INPUT_LENGTH, { error: CLIENT_MESSAGES.phoneTooLong })
  .transform(normalizeClientPhone)
  .superRefine((phone, ctx) => {
    if (phone === null) return
    if (hasInvalidClientTextChar(phone) || !hasVisibleClientTextChar(phone)) {
      ctx.addIssue({ code: 'custom', message: CLIENT_MESSAGES.phoneInvalid })
    }
    else if ([...phone].length > MAX_CLIENT_PHONE_LENGTH) {
      ctx.addIssue({ code: 'custom', message: CLIENT_MESSAGES.phoneTooLong })
    }
  })

/** A default price: a finite number above 0, at most 9,999.99, at most 2 decimals. The server's messages carry no currency symbol. */
export const clientPriceSchema = z
  .number({ error: CLIENT_MESSAGES.priceNotANumber })
  .superRefine((price, ctx) => {
    const problem = checkPriceNumber(price)
    if (problem === 'not_positive') ctx.addIssue({ code: 'custom', message: CLIENT_MESSAGES.priceNotPositive })
    else if (problem === 'too_large') ctx.addIssue({ code: 'custom', message: CLIENT_MESSAGES.priceTooLargeServer })
    else if (problem === 'too_many_decimals') ctx.addIssue({ code: 'custom', message: CLIENT_MESSAGES.priceTooManyDecimals })
  })

const idSchema = z.uuid({ error: CLIENT_MESSAGES.changedElsewhere })

/** POST /api/clients. An omitted (or null) phone or price means none. */
export const addClientBodySchema = z.object({
  submissionId: z.uuid(),
  name: clientNameSchema,
  phone: clientPhoneSchema.nullish(),
  defaultPrice: clientPriceSchema.nullish(),
})

/**
 * PUT /api/clients/:id. It REPLACES the three fields, so all three keys are required and `null` clears one: a body
 * that forgets `phone` is a 400 and never an accidental clear.
 */
export const updateClientBodySchema = z.object({
  version: z.number({ error: CLIENT_MESSAGES.changedElsewhere })
    .int({ error: CLIENT_MESSAGES.changedElsewhere })
    .min(1, { error: CLIENT_MESSAGES.changedElsewhere })
    .max(Number.MAX_SAFE_INTEGER, { error: CLIENT_MESSAGES.changedElsewhere }),
  name: clientNameSchema,
  phone: clientPhoneSchema.nullable(),
  defaultPrice: clientPriceSchema.nullable(),
})

/** Route params for /api/clients/:id, /api/clients/:id/archive and /api/clients/:id/restore. */
export const clientIdParamsSchema = z.object({ id: idSchema })

export type AddClientBody = z.infer<typeof addClientBodySchema>
export type UpdateClientBody = z.infer<typeof updateClientBodySchema>
export type ClientIdParams = z.infer<typeof clientIdParamsSchema>
