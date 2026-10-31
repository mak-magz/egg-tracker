import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_SIZE_NAME_INPUT_LENGTH, MAX_SIZE_NAME_LENGTH, MAX_SIZES_PER_FARM, SIZE_MESSAGES } from '../../shared/constants/sizes'

describe('sizes constants', () => {
  it('has the owner-approved limits', () => {
    expect(MAX_SIZE_NAME_LENGTH).toBe(40)
    expect(MAX_SIZES_PER_FARM).toBe(100)
  })

  it('the messages match the §2.5 copy', () => {
    expect(SIZE_MESSAGES.nameBlank).toBe('Enter a size name.')
    expect(SIZE_MESSAGES.nameTooLong).toBe('Use 40 characters or fewer.')
    expect(SIZE_MESSAGES.nameInvalid).toBe('This name has a character that isn\'t allowed.')
    expect(SIZE_MESSAGES.nameTaken('Large')).toBe('You already have a size called Large.')
    expect(SIZE_MESSAGES.nameArchived('Jumbo')).toBe('Jumbo is archived. Restore it instead.')
    expect(SIZE_MESSAGES.tooMany).toBe('You have reached the limit of 100 sizes.')
    expect(SIZE_MESSAGES.lastActive).toBe('Keep at least one size.')
    expect(SIZE_MESSAGES.changedElsewhere).toBe('Your sizes were changed somewhere else. The list is up to date now.')
  })

  it('the messages that quote a limit agree with the constants', () => {
    expect(SIZE_MESSAGES.nameTooLong).toContain(String(MAX_SIZE_NAME_LENGTH))
    expect(SIZE_MESSAGES.tooMany).toContain(String(MAX_SIZES_PER_FARM))
  })
})

describe('size limits match the Drizzle adapter', () => {
  const adapterSrc = readFileSync(join(__dirname, '..', '..', 'server', 'db', 'adapter.ts'), 'utf8')

  it('enforces MAX_SIZE_NAME_INPUT_LENGTH, MAX_SIZE_NAME_LENGTH, and MAX_SIZES_PER_FARM', () => {
    expect(MAX_SIZE_NAME_INPUT_LENGTH).toBe(200)
    expect(adapterSrc).toContain(`> ${MAX_SIZE_NAME_INPUT_LENGTH}`)
    expect(adapterSrc).toContain(`> ${MAX_SIZE_NAME_LENGTH}`)
    expect(adapterSrc).toContain(`>= ${MAX_SIZES_PER_FARM}`)
    expect(adapterSrc).toContain(`> ${MAX_SIZES_PER_FARM}`)
  })
})
