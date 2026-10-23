// Node.js fallback runner for provisioning (when bun is blocked by Windows App Control/Device Guard).
// Usage:
//   node --env-file=.env.production.local scripts/provision.mjs --farm "Magcanta Farm" --email "magcantaeggfarm@gmail.com" --password "admin1234"
import { createInterface } from 'node:readline'
import { createClient } from '@supabase/supabase-js'

function readLine(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

function readHidden(question) {
  const stdin = process.stdin
  if (!stdin.isTTY) return readLine(question)
  process.stdout.write(question)
  return new Promise((resolve) => {
    let value = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (ch) => {
      ch = String(ch)
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(value)
      }
      else if (ch === '\u0003') {
        process.exit(1)
      }
      else if (ch === '\u0008' || ch === '\u007f') {
        value = value.slice(0, -1)
      }
      else {
        value += ch
      }
    }
    stdin.on('data', onData)
  })
}

function parseArgs(args) {
  const parsed = {
    command: 'provision',
    update: false,
    yes: false,
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === 'reset-password') {
      parsed.command = 'reset-password'
    }
    else if (arg === '--farm') {
      parsed.farm = args[++i]
    }
    else if (arg === '--email') {
      parsed.email = args[++i]
    }
    else if (arg === '--password') {
      parsed.password = args[++i]
    }
    else if (arg === '--eggs-per-tray') {
      parsed.eggsPerTray = parseInt(args[++i], 10)
    }
    else if (arg === '--update') {
      parsed.update = true
    }
    else if (arg === '--yes') {
      parsed.yes = true
    }
  }
  return parsed
}

async function findUserId(admin, email) {
  const { data, error } = await admin.rpc('admin_user_id_by_email', { p_email: email })
  if (error) throw new Error(`Couldn't look up ${email}: ${error.message}`)
  return data ?? null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const url = process.env.NUXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.NUXT_SUPABASE_SECRET_KEY?.trim()

  if (!url || !secretKey) {
    console.error('Error: NUXT_PUBLIC_SUPABASE_URL and NUXT_SUPABASE_SECRET_KEY must be set in your env file.')
    process.exit(1)
  }

  if (!args.email) {
    console.error('Error: --email is required.')
    process.exit(1)
  }

  console.log(`Target: ${url}`)
  if (!args.yes && !url.includes('127.0.0.1') && !url.includes('localhost')) {
    const ans = await readLine('This is NOT the local stack. Continue? [y/N] ')
    if (ans.trim().toLowerCase() !== 'y') {
      console.log('Aborted.')
      process.exit(0)
    }
  }

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  if (args.command === 'provision') {
    if (!args.farm) {
      console.error('Error: --farm is required for provisioning.')
      process.exit(1)
    }

    let userId = await findUserId(admin, args.email)

    if (userId) {
      if (args.password) console.log('Note: the account already exists; --password was ignored.')
    }
    else {
      let password = args.password
      if (!password) {
        password = await readHidden('New password: ')
        const confirm = await readHidden('Confirm password: ')
        if (password !== confirm) {
          console.error('The passwords don\'t match.')
          process.exit(1)
        }
      }
      if (password.length < 8) {
        console.error('Password must be at least 8 characters.')
        process.exit(1)
      }

      const { data, error } = await admin.auth.admin.createUser({
        email: args.email,
        password,
        email_confirm: true,
      })
      if (error && error.code !== 'email_exists') {
        throw new Error(`Couldn't create account: ${error.message}`)
      }
      userId = data?.user?.id ?? await findUserId(admin, args.email)
      if (!userId) throw new Error('Could not find user id after creating account.')
      if (!error) console.log(`Created account ${args.email}.`)
    }

    const { data, error } = await admin.rpc('provision_farm', {
      p_user_id: userId,
      p_farm_name: args.farm,
      ...(args.eggsPerTray !== undefined ? { p_eggs_per_tray: args.eggsPerTray } : {}),
      p_update: args.update,
    })
    if (error) throw new Error(`Couldn't provision farm: ${error.message}`)
    const row = data?.[0]
    if (!row) throw new Error('provision_farm returned no row.')

    console.log(`Success! Farm "${row.farm_name}" (eggs per tray: ${row.eggs_per_tray}) provisioned for ${args.email}. Outcome: ${row.outcome}`)
  }
  else if (args.command === 'reset-password') {
    const userId = await findUserId(admin, args.email)
    if (!userId) throw new Error(`No account found for ${args.email}`)
    let password = args.password
    if (!password) {
      password = await readHidden('New password: ')
      const confirm = await readHidden('Confirm password: ')
      if (password !== confirm) {
        console.error('The passwords don\'t match.')
        process.exit(1)
      }
    }
    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) throw new Error(`Couldn't update password: ${error.message}`)
    await admin.rpc('admin_revoke_sessions', { p_user_id: userId })
    console.log(`Password updated for ${args.email}. All sessions revoked.`)
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err)
  process.exit(1)
})
