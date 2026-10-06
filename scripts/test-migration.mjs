// Migration test for feature 05 (docs/features/05-orders.md §3.7, AC43 to AC46): converts REAL pending sales.
// It needs the old schema, so it cannot be a pgTAP file. It RESETS THE LOCAL DATABASE (never run it against anything
// else; it only ever talks to the local stack):
//   1. db reset to the last feature-04 migration (M16), then seed farms with pending, complete and voided sales;
//   2. apply M17 + M18 only (through a temporary workdir holding just those migrations), assert the conversion, then
//      re-run the M18 file and assert nothing changed (idempotent);
//   3. apply M19 + M20 and assert the sales side (stock, numbers, the one date).
// Run: `bun run test:migration` (needs `bun run db:start`).
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const LAST_FEATURE_04 = '20260927065131'

function run(args, opts = {}) {
  const res = spawnSync('bunx', ['supabase', ...args], { cwd: ROOT, encoding: 'utf8', shell: true, ...opts })
  if (res.status !== 0) {
    console.error(res.stdout, res.stderr)
    throw new Error(`supabase ${args.join(' ')} failed`)
  }
  return res.stdout
}

// `supabase db query` runs one statement at a time, so SQL goes through psql inside the local database container.
const CONTAINER = `supabase_db_${/^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync(join(ROOT, 'supabase', 'config.toml'), 'utf8'))[1]}`

function queryFile(file, { json = false } = {}) {
  const sql = readFileSync(file, 'utf8')
  const input = json ? `select row_to_json(t) from (${sql}) t;` : sql
  const res = spawnSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-f', '-'], { input, encoding: 'utf8' })
  if (res.status !== 0) {
    console.error(res.stdout, res.stderr)
    throw new Error(`psql failed for ${file}`)
  }
  if (!json) return []
  const line = res.stdout.split(String.fromCharCode(10)).find(l => l.startsWith('{'))
  return [JSON.parse(line)]
}

let failures = 0
function check(ok, label) {
  console.log(`${ok ? 'ok     ' : 'NOT OK '} ${label}`)
  if (!ok) failures++
}

const files = readdirSync(MIGRATIONS).sort()
const m17 = files.find(f => f.endsWith('_orders.sql'))
const m18 = files.find(f => f.endsWith('_orders_convert_pending.sql'))
if (!m17 || !m18) throw new Error('feature 05 migrations not found')

// ---- 1. reset to M16 and seed ----
console.log('Resetting the LOCAL database to the last feature 04 migration...')
run(['db', 'reset', '--local', '--version', LAST_FEATURE_04, '--yes'])

const seed = `
insert into public.tenants (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Mig A'), ('bbbbbbbb-0000-0000-0000-00000000000b', 'Mig B'), ('cccccccc-0000-0000-0000-00000000000c', 'Mig C');
insert into public.clients (id, tenant_id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'A One'),
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', 'A Two'),
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 'B One');
insert into public.production (tenant_id, produced_on, size_id, quality, eggs)
select s.tenant_id, current_date - 10, s.id, 'good', 1000 from public.sizes s;
-- Farm A: pending 1 (one line), pending 2 (client later inactive, size later archived), pending 3 (two lines),
-- complete 4 (logged earlier, delivered later: the one-date rewrite), complete 5 (on-site), voided 6.
insert into public.sales (id, tenant_id, sale_number, client_id, type, status, sale_date, delivered_date, created_at) values
  ('a5000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 1, 'a1000000-0000-0000-0000-000000000001', 'delivery', 'pending', current_date - 5, null, now() - interval '6 hours'),
  ('a5000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', 2, 'a1000000-0000-0000-0000-000000000002', 'delivery', 'pending', current_date - 4, null, now() - interval '5 hours'),
  ('a5000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000a', 3, 'a1000000-0000-0000-0000-000000000001', 'delivery', 'pending', current_date - 3, null, now() - interval '4 hours'),
  ('a5000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-00000000000a', 4, 'a1000000-0000-0000-0000-000000000001', 'delivery', 'complete', current_date - 4, current_date - 2, now() - interval '3 hours'),
  ('a5000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-00000000000a', 5, null, 'on_site', 'complete', current_date, current_date, now() - interval '2 hours'),
  ('a5000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-00000000000a', 6, 'a1000000-0000-0000-0000-000000000001', 'delivery', 'complete', current_date - 1, current_date - 1, now() - interval '1 hours');
update public.sales set voided_at = now() where id = 'a5000000-0000-0000-0000-000000000006';
insert into public.sales (id, tenant_id, sale_number, client_id, type, status, sale_date, delivered_date) values
  ('b5000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 1, 'b1000000-0000-0000-0000-000000000001', 'delivery', 'pending', current_date - 1, null);
insert into public.sale_lines (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total)
select s.tenant_id, s.id, z.id, v.eggs, v.price, v.total
from (values
  ('a5000000-0000-0000-0000-000000000001'::uuid, 'Small', 30, 6.50::numeric, 6.50::numeric),
  ('a5000000-0000-0000-0000-000000000002'::uuid, 'Medium', 60, 6.00, 12.00),
  ('a5000000-0000-0000-0000-000000000003'::uuid, 'Small', 90, 6.50, 19.50),
  ('a5000000-0000-0000-0000-000000000003'::uuid, 'Large', 241, 6.75, 54.23),
  ('a5000000-0000-0000-0000-000000000004'::uuid, 'Small', 30, 6.50, 6.50),
  ('a5000000-0000-0000-0000-000000000005'::uuid, 'Small', 60, 6.50, 13.00),
  ('a5000000-0000-0000-0000-000000000006'::uuid, 'Large', 30, 7.00, 7.00),
  ('b5000000-0000-0000-0000-000000000001'::uuid, 'Small', 30, 6.50, 6.50)
) v(sale_id, size_name, eggs, price, total)
join public.sales s on s.id = v.sale_id
join public.sizes z on z.tenant_id = s.tenant_id and z.name = v.size_name;
update public.sale_counters set next_number = 7 where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
update public.sale_counters set next_number = 2 where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
-- An inactive client and an archived size on pending sales: both must convert as they are (AC43).
update public.clients set archived_at = now() where id = 'a1000000-0000-0000-0000-000000000002';
update public.sizes set archived_at = now() where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and name = 'Medium';
`

const tmp = mkdtempSync(join(tmpdir(), 'tamago-mig-'))
try {
  writeFileSync(join(tmp, 'seed.sql'), seed)
  queryFile(join(tmp, 'seed.sql'))

  const snapshotSql = `
select
  (select jsonb_agg(jsonb_build_object('t', tenant_id, 'n', sale_number, 'v', voided_at is not null, 'client', client_id, 'type', type) order by tenant_id, sale_number)
     from public.sales where status = 'complete') as complete_sales,
  (select jsonb_agg(jsonb_build_object('t', tenant_id, 'n', next_number) order by tenant_id) from public.sale_counters) as sale_counters,
  (select jsonb_agg(app.on_hand_json(id, null) order by id) from public.tenants) as on_hand,
  (select jsonb_agg(jsonb_build_object('t', s.tenant_id, 'n', s.sale_number, 'size', l.size_id, 'eggs', l.eggs, 'price', l.price_per_tray, 'total', l.line_total) order by s.tenant_id, s.sale_number, l.size_id)
     from public.sale_lines l join public.sales s on s.id = l.sale_id where s.status = 'pending') as pending_lines`
  writeFileSync(join(tmp, 'snap.sql'), snapshotSql)
  const before = queryFile(join(tmp, 'snap.sql'), { json: true })[0]

  // ---- 2. M17 + M18 only ----
  const early = join(tmp, 'early')
  mkdirSync(join(early, 'supabase', 'migrations'), { recursive: true })
  cpSync(join(ROOT, 'supabase', 'config.toml'), join(early, 'supabase', 'config.toml'))
  cpSync(join(ROOT, 'supabase', 'templates'), join(early, 'supabase', 'templates'), { recursive: true })
  for (const f of files) {
    if (f <= m18) cpSync(join(MIGRATIONS, f), join(early, 'supabase', 'migrations', f))
  }
  run(['migration', 'up', '--local', '--workdir', early])

  const afterConvertSql = `
select
  (select jsonb_agg(jsonb_build_object('t', o.tenant_id, 'order', o.order_number, 'old', o.converted_from_sale_number, 'status', o.status,
           'client', o.client_id, 'wanted', o.wanted_by, 'date', o.order_date) order by o.tenant_id, o.order_number) from public.orders o) as orders,
  (select jsonb_agg(jsonb_build_object('t', o.tenant_id, 'old', o.converted_from_sale_number, 'size', l.size_id, 'eggs', l.eggs, 'price', l.price_per_tray, 'total', l.line_total) order by o.tenant_id, o.converted_from_sale_number, l.size_id)
     from public.orders o join public.order_lines l on l.order_id = o.id) as order_lines,
  (select jsonb_agg(jsonb_build_object('t', tenant_id, 'n', next_number) order by tenant_id) from public.order_counters) as order_counters,
  (select jsonb_agg(jsonb_build_object('t', tenant_id, 'n', next_number) order by tenant_id) from public.sale_counters) as sale_counters,
  (select count(*) from public.sales where status = 'pending') as pending_left,
  (select jsonb_agg(jsonb_build_object('t', tenant_id, 'n', sale_number, 'v', voided_at is not null, 'client', client_id, 'type', type) order by tenant_id, sale_number)
     from public.sales where status = 'complete') as complete_sales,
  (select jsonb_agg(app.on_hand_json(id, null) order by id) from public.tenants) as on_hand`
  writeFileSync(join(tmp, 'after.sql'), afterConvertSql)
  const after = queryFile(join(tmp, 'after.sql'), { json: true })[0]

  const A = 'aaaaaaaa-0000-0000-0000-00000000000a'
  const B = 'bbbbbbbb-0000-0000-0000-00000000000b'
  const ordersOf = t => after.orders.filter(o => o.t === t)
  check(ordersOf(A).length === 3, 'AC43: farm A has 3 orders (3 pending sales), none lost')
  check(ordersOf(B).length === 1, 'AC43: farm B has 1 order')
  check(!after.orders.some(o => o.t === 'cccccccc-0000-0000-0000-00000000000c'), 'AC46: farm C (no pending sales) has no order')
  check(JSON.stringify(ordersOf(A).map(o => [o.order, o.old])) === JSON.stringify([[1, 1], [2, 2], [3, 3]]), 'AC45: order numbers 1..3 follow the old sale numbers, and "Formerly sale #" is kept')
  check(after.orders.every(o => o.status === 'confirmed' && o.wanted === null), 'AC43: every converted order is Confirmed with no wanted-by date')
  check(after.orders.every(o => o.client !== null), 'AC43: every order keeps its client (an inactive one too)')
  check(Number(after.pending_left) === 0, 'AC43: no pending sale is left in Sales')
  const key = l => `${l.t}|${l.n ?? l.old}|${l.size}|${l.eggs}|${l.price}|${l.total}`
  check(JSON.stringify(before.pending_lines.map(key).sort()) === JSON.stringify(after.order_lines.map(key).sort()),
    'AC43/AC51: every line has the same size, eggs, price and total as its pending sale')
  check(JSON.stringify(after.order_counters.map(c => [c.t, c.n])) === JSON.stringify([[A, 4], [B, 2], ['cccccccc-0000-0000-0000-00000000000c', 1]]),
    'AC45: order counters continue after the converted orders (A 4, B 2, C 1)')
  check(JSON.stringify(after.sale_counters) === JSON.stringify(before.sale_counters), 'AC45: sale counters are untouched, so the retired sale numbers are never reused')
  check(JSON.stringify(after.complete_sales) === JSON.stringify(before.complete_sales), 'AC44: complete and voided sales, their numbers and clients are untouched')
  check(JSON.stringify(after.on_hand) === JSON.stringify(before.on_hand), 'AC44: on hand is identical for every farm before and after')

  // M18 again: nothing to convert, nothing moves (AC46).
  queryFile(join(MIGRATIONS, m18))
  const again = queryFile(join(tmp, 'after.sql'), { json: true })[0]
  check(JSON.stringify(again) === JSON.stringify(after), 'AC46: re-running the conversion changes nothing')

  // ---- 3. M19 + M20 ----
  run(['migration', 'up', '--local'])
  const finalSql = `
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'sales' and column_name = 'status') as status_cols,
  (select sale_date = current_date - 2 and delivered_date = sale_date from public.sales where id = 'a5000000-0000-0000-0000-000000000004') as sale4_moved,
  (select jsonb_agg(jsonb_build_object('t', tenant_id, 'n', sale_number) order by tenant_id, sale_number) from public.sales) as sales,
  (select jsonb_agg(app.on_hand_json(id, null) order by id) from public.tenants) as on_hand,
  (select jsonb_agg(jsonb_build_object('t', tenant_id, 'n', next_number) order by tenant_id) from public.sale_counters) as sale_counters,
  (select app.order_json(o.tenant_id, o.id, true) ->> 'status' from public.orders o where o.converted_from_sale_number = 2 and o.tenant_id = '${A}') as order2_status,
  (select (app.order_json(o.tenant_id, o.id, true) -> 'lines' -> 0 ->> 'remainingEggs')::int from public.orders o where o.converted_from_sale_number = 2 and o.tenant_id = '${A}') as order2_remaining`
  writeFileSync(join(tmp, 'final.sql'), finalSql)
  const final = queryFile(join(tmp, 'final.sql'), { json: true })[0]
  check(Number(final.status_cols) === 0, 'M19: sales has no status column any more')
  check(final.sale4_moved === true,
    'U1: a sale logged earlier and delivered later now has its delivered date as its one date')
  check(JSON.stringify(final.sales.map(s => `${s.t}|${s.n}`)) === JSON.stringify(before.complete_sales.map(s => `${s.t}|${s.n}`)),
    'AC45: the sales that remain are exactly the complete and voided ones, with the old pending numbers retired (a gap)')
  check(JSON.stringify(final.on_hand) === JSON.stringify(before.on_hand), 'AC44: on hand is still identical after M19 and M20')
  check(JSON.stringify(final.sale_counters) === JSON.stringify(before.sale_counters), 'AC45: the next sale number is still 7 for farm A and 2 for farm B')
  check(final.order2_status === 'confirmed' && final.order2_remaining === 60, 'AC43: a converted order with an archived size and an inactive client reads as Confirmed, 60 eggs still owed')
}
finally {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nMigration test passed. Run `bun run db:reset` to put the local database back on the current schema.')
