import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CLIENT_MESSAGES,
  CLIENT_PRICE_DECIMALS,
  MAX_CLIENT_NAME_LENGTH,
  MAX_CLIENT_PHONE_LENGTH,
  MAX_CLIENT_PRICE,
  MAX_CLIENT_TEXT_INPUT_LENGTH,
  MAX_CLIENTS_PER_FARM,
} from '../../shared/constants/clients'
import { DEFAULT_CURRENCY } from '../../shared/constants/currency'

const dir = join(__dirname, '..', '..', 'supabase', 'migrations')

function migration(suffix: string): string {
  const file = readdirSync(dir).find(f => f.endsWith(suffix))
  expect(file, `the ${suffix} migration`).toBeDefined()
  return readFileSync(join(dir, file!), 'utf8')
}

describe('clients constants', () => {
  it('has the owner-approved limits', () => {
    expect(MAX_CLIENT_NAME_LENGTH).toBe(60)
    expect(MAX_CLIENT_PHONE_LENGTH).toBe(30)
    expect(MAX_CLIENT_TEXT_INPUT_LENGTH).toBe(200)
    expect(MAX_CLIENTS_PER_FARM).toBe(500)
    expect(MAX_CLIENT_PRICE).toBe(9999.99)
    expect(CLIENT_PRICE_DECIMALS).toBe(2)
  })

  it('the default currency is the Philippine peso', () => {
    expect(DEFAULT_CURRENCY).toBe('PHP')
  })

  it('the raw-input cap is above every real limit', () => {
    expect(MAX_CLIENT_TEXT_INPUT_LENGTH).toBeGreaterThan(MAX_CLIENT_NAME_LENGTH)
    expect(MAX_CLIENT_TEXT_INPUT_LENGTH).toBeGreaterThan(MAX_CLIENT_PHONE_LENGTH)
  })

  it('the messages match the §2.5 copy', () => {
    expect(CLIENT_MESSAGES.nameBlank).toBe('Enter a name.')
    expect(CLIENT_MESSAGES.nameTooLong).toBe('Use 60 characters or fewer.')
    expect(CLIENT_MESSAGES.nameInvalid).toBe('This name has a hidden character. Try typing it instead of pasting.')
    expect(CLIENT_MESSAGES.nameTaken('Maple Street Market')).toBe('You already have a client called Maple Street Market.')
    expect(CLIENT_MESSAGES.nameInactive('Oakhill Bakery')).toBe('Oakhill Bakery is on your list, but marked inactive. Mark it active instead.')
    expect(CLIENT_MESSAGES.nameInactiveEdit('Oakhill Bakery')).toBe('Oakhill Bakery is on your list, but marked inactive. Pick another name, or mark it active from the list.')
    expect(CLIENT_MESSAGES.nameTakenServer).toBe('That name already exists.')
    expect(CLIENT_MESSAGES.phoneTooLong).toBe('Use 30 characters or fewer.')
    expect(CLIENT_MESSAGES.phoneInvalid).toBe('This phone number has a hidden character. Try typing it instead of pasting.')
    expect(CLIENT_MESSAGES.priceNotANumber).toBe('Use numbers only, like 250.00.')
    expect(CLIENT_MESSAGES.priceNotPositive).toBe('Enter a price above 0, or leave it blank.')
    expect(CLIENT_MESSAGES.priceTooManyDecimals).toBe('Use 2 decimals at most, like 6.50.')
    expect(CLIENT_MESSAGES.priceTooLarge('₱9,999.99')).toBe('The most you can enter is ₱9,999.99.')
    expect(CLIENT_MESSAGES.limitReached).toBe('You\'ve reached the limit of 500 clients. You can still edit the ones you have.')
    expect(CLIENT_MESSAGES.changedElsewhere).toBe('This client was changed somewhere else. The list is up to date now.')
  })

  it('the messages that quote a limit agree with the constants', () => {
    expect(CLIENT_MESSAGES.nameTooLong).toContain(String(MAX_CLIENT_NAME_LENGTH))
    expect(CLIENT_MESSAGES.phoneTooLong).toContain(String(MAX_CLIENT_PHONE_LENGTH))
    expect(CLIENT_MESSAGES.limitReached).toContain(String(MAX_CLIENTS_PER_FARM))
    expect(CLIENT_MESSAGES.priceTooLargeServer).toContain(MAX_CLIENT_PRICE.toLocaleString('en-US', { minimumFractionDigits: 2 }))
    expect(CLIENT_MESSAGES.priceTooManyDecimals).toContain(`${CLIENT_PRICE_DECIMALS} decimals`)
  })

  it('no fixed message contains a currency symbol (the form adds it from the farm)', () => {
    for (const m of [CLIENT_MESSAGES.priceNotANumber, CLIENT_MESSAGES.priceNotPositive, CLIENT_MESSAGES.priceTooManyDecimals, CLIENT_MESSAGES.priceTooLargeServer]) {
      expect(m).not.toMatch(/[₱$€]/)
    }
  })
})

describe('DEFAULT_CURRENCY matches the M11 tenants_currency migration', () => {
  const sql = migration('_tenants_currency.sql')

  it('equals the column default, and the column is not null', () => {
    const m = /add column currency text not null default '([A-Z]{3})'/.exec(sql)
    expect(m, 'the currency column definition').not.toBeNull()
    expect(m![1]).toBe(DEFAULT_CURRENCY)
  })

  it('is format-checked (three capital letters), not list-checked', () => {
    expect(sql).toContain('constraint tenants_currency_format check (currency ~ \'^[A-Z]{3}$\')')
  })

  it('adds no grant, so owners still cannot write the currency (AC35)', () => {
    expect(sql.replace(/^--.*$/gm, '')).not.toMatch(/\bgrant\b/i)
    expect(sql).not.toMatch(/create policy/i)
  })
})

describe('the client limits match the M12 clients migration', () => {
  const sql = migration('_clients.sql')

  it('the name and phone lengths and the price bound equal the CHECK constraints', () => {
    expect(sql).toContain(`char_length(name) between 1 and ${MAX_CLIENT_NAME_LENGTH}`)
    expect(sql).toContain(`char_length(phone) between 1 and ${MAX_CLIENT_PHONE_LENGTH}`)
    expect(sql).toContain(`default_price <= ${MAX_CLIENT_PRICE}`)
    expect(sql).toContain(`default_price = round(default_price, ${CLIENT_PRICE_DECIMALS})`)
    expect(sql).toContain('default_price > 0')
  })

  it('assert_client_fields uses the same numbers', () => {
    expect(sql).toContain(`char_length(p_name) > ${MAX_CLIENT_NAME_LENGTH}`)
    expect(sql).toContain(`char_length(p_phone) > ${MAX_CLIENT_PHONE_LENGTH}`)
    expect(sql).toContain(`p_price > ${MAX_CLIENT_PRICE}`)
    expect(sql).toContain(`p_price <> round(p_price, ${CLIENT_PRICE_DECIMALS})`)
  })

  it('the raw-input cap is MAX_CLIENT_TEXT_INPUT_LENGTH for the name and the phone', () => {
    expect(sql).toContain(`char_length(p_name) > ${MAX_CLIENT_TEXT_INPUT_LENGTH}`)
    expect(sql).toContain(`char_length(p_phone) > ${MAX_CLIENT_TEXT_INPUT_LENGTH}`)
  })

  it('the client cap and the ledger cap are MAX_CLIENTS_PER_FARM', () => {
    expect(sql).toMatch(new RegExp(`>= ${MAX_CLIENTS_PER_FARM} then\\s+raise exception 'too many clients' using errcode = 'TM021'`))
    expect(sql).toMatch(new RegExp(`>= ${MAX_CLIENTS_PER_FARM} then\\s+raise exception 'too many client submissions' using errcode = 'TM026'`))
  })

  it('no other numeric limit is hard-coded in the M12 or M13 migrations', () => {
    const rules = sql.replace(/^\s*--.*$/gm, '')
    const funcs = migration('_clients_functions.sql').replace(/^\s*--.*$/gm, '')
    // The only bounds are the ones above; the functions delegate to assert_client_fields, so they name none.
    expect(funcs).not.toMatch(/char_length\([^)]*\)\s*[<>]=?\s*\d/)
    expect(funcs).not.toMatch(/9999|>= 500/)
    expect(rules.match(/9999\.99/g)).toHaveLength(2)
  })
})
