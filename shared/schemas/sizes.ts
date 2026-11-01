// Sizes API schemas (zod 4), docs/features/02-farm-settings.md §3.3.
// Relative imports so it runs outside Nuxt too. Unknown keys (a smuggled tenant_id, colorSlot, sortOrder,
// archived) are stripped by zod's default object behaviour, so they never reach the repository.
// Messages come from SIZE_MESSAGES so the form and the API say the same thing.
import { z } from 'zod'
import { MAX_SIZE_NAME_INPUT_LENGTH, MAX_SIZE_NAME_LENGTH, MAX_SIZES_PER_FARM, SIZE_FIELDS, SIZE_MESSAGES } from '../constants/sizes'
import { hasInvalidSizeNameChar, normalizeSizeName, sizeNameLength } from '../utils/size-name'

/** A size name: normalised (NFC, spaces collapsed and trimmed), then 1 to 40 characters with no control character or lone surrogate. Never truncates. */
export const sizeNameSchema = z
  .string({ error: SIZE_MESSAGES.nameBlank })
  // A raw cap before normalising, like the database's (audit M-2): megabytes never reach the regex.
  .max(MAX_SIZE_NAME_INPUT_LENGTH, { error: SIZE_MESSAGES.nameTooLong })
  .transform(normalizeSizeName)
  .superRefine((name, ctx) => {
    if (name === '') {
      ctx.addIssue({ code: 'custom', message: SIZE_MESSAGES.nameBlank })
    }
    else if (hasInvalidSizeNameChar(name)) {
      ctx.addIssue({ code: 'custom', message: SIZE_MESSAGES.nameInvalid })
    }
    else if (sizeNameLength(name) > MAX_SIZE_NAME_LENGTH) {
      ctx.addIssue({ code: 'custom', message: SIZE_MESSAGES.nameTooLong })
    }
  })

export const sizeDefaultPriceSchema = z
  .union([z.number().positive().max(9999.99), z.null()])
  .optional()

/** POST /api/sizes */
export const addSizeBodySchema = z.object({
  submissionId: z.uuid(),
  name: sizeNameSchema,
  defaultPrice: sizeDefaultPriceSchema,
})

/** PATCH /api/sizes/:id */
export const renameSizeBodySchema = z.object({
  name: sizeNameSchema,
  defaultPrice: sizeDefaultPriceSchema,
})

/** PUT /api/sizes/order: the wanted full order of the active sizes, and the size that was moved. */
export const reorderSizesBodySchema = z
  .object({
    sizeId: z.uuid({ error: SIZE_MESSAGES.changedElsewhere }),
    order: z
      .array(z.uuid({ error: SIZE_MESSAGES.changedElsewhere }), { error: SIZE_MESSAGES.changedElsewhere })
      .min(1, { error: SIZE_MESSAGES.changedElsewhere })
      .max(MAX_SIZES_PER_FARM, { error: SIZE_MESSAGES.changedElsewhere }),
  })
  .superRefine((v, ctx) => {
    const ids = v.order.map(id => id.toLowerCase())
    if (new Set(ids).size !== ids.length || !ids.includes(v.sizeId.toLowerCase())) {
      ctx.addIssue({ code: 'custom', message: SIZE_MESSAGES.changedElsewhere, path: [SIZE_FIELDS.order] })
    }
  })

/** Route params for /api/sizes/:id, /api/sizes/:id/archive and /api/sizes/:id/restore. */
export const sizeIdParamsSchema = z.object({ id: z.uuid({ error: SIZE_MESSAGES.changedElsewhere }) })

export type AddSizeBody = z.infer<typeof addSizeBodySchema>
export type RenameSizeBody = z.infer<typeof renameSizeBodySchema>
export type ReorderSizesBody = z.infer<typeof reorderSizesBodySchema>
export type SizeIdParams = z.infer<typeof sizeIdParamsSchema>
