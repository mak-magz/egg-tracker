import { z } from 'zod'

export const onboardingSchema = z.object({
  farmName: z.string().trim().min(1, 'Farm name is required').max(100, 'Farm name must be 100 characters or fewer'),
  eggsPerTray: z.number().int().min(1, 'Eggs per tray must be at least 1').max(100, 'Eggs per tray cannot exceed 100').default(30),
  currency: z.string().trim().length(3, 'Currency must be a 3-letter code (e.g. PHP, USD)').default('PHP'),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
