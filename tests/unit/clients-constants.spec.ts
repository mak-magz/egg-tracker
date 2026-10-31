import { readFileSync } from 'node:fs'
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

describe('DEFAULT_CURRENCY matches the Control DB schema', () => {
  const controlSrc = readFileSync(join(__dirname, '..', '..', 'server', 'db', 'schema', 'control.ts'), 'utf8')

  it('equals the column default on tenants', () => {
    expect(controlSrc).toContain(`.default('${DEFAULT_CURRENCY}')`)
  })
})

describe('the client limits match the Drizzle adapter', () => {
  const adapterSrc = readFileSync(join(__dirname, '..', '..', 'server', 'db', 'adapter.ts'), 'utf8')

  it('assertClientFields and addClient enforce the exact client limits', () => {
    expect(adapterSrc).toContain('200')
    expect(adapterSrc).toContain('60')
    expect(adapterSrc).toContain('30')
    expect(adapterSrc).toContain('9999.99')
    expect(adapterSrc).toContain('>= 500')
  })
})
