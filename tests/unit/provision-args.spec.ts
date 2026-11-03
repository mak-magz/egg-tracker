import { describe, expect, it } from 'vitest'
import {
  adminOutcomeMessage,
  isLocalTarget,
  outcomeMessage,
  parseProvisionArgs,
  validateEggsPerTray,
} from '../../server/cli/provision-args'

function ok(argv: string[]) {
  const r = parseProvisionArgs(argv)
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`)
  return r.value
}
function err(argv: string[]) {
  const r = parseProvisionArgs(argv)
  if (r.ok) throw new Error('expected an error')
  return r.error
}

describe('parseProvisionArgs: provision', () => {
  it('parses the full form', () => {
    expect(ok(['--farm', '  Hendricks Farm ', '--email', 'Owner@Example.com', '--password', 'longenough', '--eggs-per-tray', '30', '--update', '--yes']))
      .toEqual({ command: 'provision', farm: 'Hendricks Farm', email: 'owner@example.com', password: 'longenough', eggsPerTray: 30, update: true, yes: true })
  })

  it('supports --flag=value and leaves optional values undefined', () => {
    expect(ok(['--farm=Tiny Farm', '--email=a@b.co']))
      .toEqual({ command: 'provision', farm: 'Tiny Farm', email: 'a@b.co', password: undefined, eggsPerTray: undefined, update: false, yes: false })
  })

  it('requires --farm and --email', () => {
    expect(err(['--email', 'a@b.co'])).toMatch(/--farm is required/)
    expect(err(['--farm', 'X'])).toMatch(/--email is required/)
  })

  it('rejects a blank or too-long farm name', () => {
    expect(err(['--farm', '   ', '--email', 'a@b.co'])).toMatch(/1 to 100/)
    expect(err(['--farm', 'x'.repeat(101), '--email', 'a@b.co'])).toMatch(/1 to 100/)
    expect(ok(['--farm', 'x'.repeat(100), '--email', 'a@b.co'])).toMatchObject({ farm: 'x'.repeat(100) })
  })

  it('rejects a malformed email', () => {
    expect(err(['--farm', 'X', '--email', 'not-an-email'])).toMatch(/not a valid email/)
  })

  it('rejects a short password', () => {
    expect(err(['--farm', 'X', '--email', 'a@b.co', '--password', 'short'])).toMatch(/at least 8/)
  })

  it.each(['0', '-3', '2.5', '1e2', '', ' 30', 'thirty', '99999999999'])('rejects --eggs-per-tray %j (AC22)', (v) => {
    expect(err(['--farm', 'X', '--email', 'a@b.co', `--eggs-per-tray=${v}`])).toMatch(/whole number of 1 or more/)
  })

  it.each([['1', 1], ['12', 12], ['30', 30], ['360', 360]])('accepts --eggs-per-tray %s', (v, n) => {
    expect(validateEggsPerTray(v)).toEqual({ ok: true, value: n })
  })

  it('rejects unknown, repeated and value-less options', () => {
    expect(err(['--farm', 'X', '--email', 'a@b.co', '--tenant', 'abc'])).toMatch(/Unknown option --tenant/)
    expect(err(['--farm', 'X', '--farm', 'Y', '--email', 'a@b.co'])).toMatch(/more than once/)
    expect(err(['--farm', '--email', 'a@b.co'])).toMatch(/--farm needs a value/)
    expect(err(['--farm', 'X', '--email', 'a@b.co', '--update=yes'])).toMatch(/takes no value/)
    expect(err(['provision-all'])).toMatch(/Unknown command/)
  })

  it('shows help', () => {
    expect(ok([])).toEqual({ command: 'help' })
    expect(ok(['--help'])).toEqual({ command: 'help' })
  })
})

describe('parseProvisionArgs: admin', () => {
  it('parses admin command with password', () => {
    expect(ok(['admin', '--email', 'Admin@Tamago.Farm', '--password', 'longenough123', '--yes']))
      .toEqual({ command: 'admin', email: 'admin@tamago.farm', password: 'longenough123', yes: true })
  })

  it('parses admin command without password and default yes=false', () => {
    expect(ok(['admin', '--email', 'admin@example.com']))
      .toEqual({ command: 'admin', email: 'admin@example.com', password: undefined, yes: false })
  })

  it('requires --email', () => {
    expect(err(['admin'])).toMatch(/--email is required/)
  })

  it('rejects invalid email', () => {
    expect(err(['admin', '--email', 'not-valid'])).toMatch(/not a valid email/)
  })

  it('rejects short password', () => {
    expect(err(['admin', '--email', 'a@b.com', '--password', 'short'])).toMatch(/at least 8/)
  })

  it('rejects unknown flags for admin command', () => {
    expect(err(['admin', '--email', 'a@b.com', '--farm', 'Test Farm'])).toMatch(/Unknown option --farm/)
    expect(err(['admin', '--email', 'a@b.com', '--update'])).toMatch(/Unknown option --update/)
  })
})

describe('parseProvisionArgs: reset-password', () => {
  it('parses it', () => {
    expect(ok(['reset-password', '--email', 'A@B.co', '--password', 'longenough', '--yes']))
      .toEqual({ command: 'reset-password', email: 'a@b.co', password: 'longenough', yes: true })
    expect(ok(['reset-password', '--email', 'a@b.co']))
      .toEqual({ command: 'reset-password', email: 'a@b.co', password: undefined, yes: false })
  })

  it('validates it', () => {
    expect(err(['reset-password'])).toMatch(/--email is required/)
    expect(err(['reset-password', '--email', 'a@b.co', '--password', 'short'])).toMatch(/at least 8/)
    expect(err(['reset-password', '--email', 'a@b.co', '--farm', 'X'])).toMatch(/Unknown option --farm/)
    expect(err(['reset-password', '--email', 'a@b.co', '--keep-sessions'])).toMatch(/Unknown option --keep-sessions/)
  })
})

describe('isLocalTarget / outcomeMessage / adminOutcomeMessage', () => {
  it('recognises the local stack only', () => {
    expect(isLocalTarget('http://127.0.0.1:54321')).toBe(true)
    expect(isLocalTarget('http://localhost:54321')).toBe(true)
    expect(isLocalTarget('libsql://abc.turso.io')).toBe(false)
    expect(isLocalTarget('http://127.0.0.1.evil.com')).toBe(false)
    expect(isLocalTarget('not a url')).toBe(false)
  })

  it('prints the documented messages', () => {
    expect(outcomeMessage('created', 'o@x.co', 'Hendricks Farm', 30)).toBe('Created farm "Hendricks Farm" (eggs per tray: 30) for o@x.co.')
    expect(outcomeMessage('unchanged', 'o@x.co', 'Hendricks Farm', 30)).toBe(
      'o@x.co already has farm "Hendricks Farm" (eggs per tray: 30). No changes made. Use --update to change the farm name or eggs per tray, or reset-password to change the password.')
    expect(outcomeMessage('updated', 'o@x.co', 'H', 24)).toBe('Updated farm "H" (eggs per tray: 24) for o@x.co.')
    expect(adminOutcomeMessage('admin@tamago.farm', 'created')).toBe('Provisioned operator account for admin@tamago.farm. Custom claims: { admin: true }.')
    expect(adminOutcomeMessage('admin@tamago.farm', 'updated')).toBe('Updated operator account for admin@tamago.farm. Custom claims: { admin: true }.')
  })
})
