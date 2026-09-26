import { readdirSync, readFileSync } from 'node:fs'
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

describe('MAX_SIZE_NAME_LENGTH matches the database', () => {
  it('equals the sizes_name_length check', () => {
    const dir = join(__dirname, '..', '..', 'supabase', 'migrations')
    const file = readdirSync(dir).find(f => f.endsWith('_sizes.sql'))
    expect(file).toBeDefined()
    const sql = readFileSync(join(dir, file!), 'utf8')
    expect(sql).toContain(`constraint sizes_name_length check (char_length(btrim(name)) between 1 and ${MAX_SIZE_NAME_LENGTH})`)
  })
})

describe('the sizes_hardening migration matches the shared limits (security audit M-1, M-2, L-2)', () => {
  const dir = join(__dirname, '..', '..', 'supabase', 'migrations')
  const file = readdirSync(dir).find(f => f.endsWith('_sizes_hardening.sql'))
  const sql = file ? readFileSync(join(dir, file), 'utf8') : ''

  it('exists', () => {
    expect(file).toBeDefined()
  })

  it('the raw-name cap is MAX_SIZE_NAME_INPUT_LENGTH in the trigger, add_size and rename_size', () => {
    expect(MAX_SIZE_NAME_INPUT_LENGTH).toBe(200)
    const matches = sql.match(new RegExp(`char_length\\((new\\.name|p_name)\\) > ${MAX_SIZE_NAME_INPUT_LENGTH}\\b`, 'g')) ?? []
    // guard insert + guard update + add_size + rename_size
    expect(matches).toHaveLength(4)
    expect(sql).not.toMatch(/char_length\((new\.name|p_name)\) > (?!200\b)\d+/)
  })

  it('the ledger name cap is MAX_SIZE_NAME_LENGTH and the reorder array cap is MAX_SIZES_PER_FARM', () => {
    expect(sql).toContain(`check (char_length(name) <= ${MAX_SIZE_NAME_LENGTH})`)
    expect(sql).toContain(`if cardinality(p_size_ids) > ${MAX_SIZES_PER_FARM} then`)
    expect(sql).toMatch(new RegExp(`>= ${MAX_SIZES_PER_FARM} then\\s+raise exception 'too many size submissions' using errcode = 'TM016'`))
  })
})

describe('MAX_SIZES_PER_FARM matches the database', () => {
  it('equals the TM015 cap in the sizes_write_rules migration', () => {
    const dir = join(__dirname, '..', '..', 'supabase', 'migrations')
    const file = readdirSync(dir).find(f => f.endsWith('_sizes_write_rules.sql'))
    expect(file).toBeDefined()
    const sql = readFileSync(join(dir, file!), 'utf8')
    expect(sql).toMatch(new RegExp(`if v_count >= ${MAX_SIZES_PER_FARM} then\\s+raise exception 'too many sizes' using errcode = 'TM015'`))
  })
})
