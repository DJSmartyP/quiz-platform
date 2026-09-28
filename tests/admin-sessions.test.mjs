import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the sole administrator can inventory, close and delete Host sessions', async () => {
  const live = await readFile(new URL('../src/live.ts', import.meta.url), 'utf8')
  const dashboard = await readFile(new URL('../src/AdminDashboard.tsx', import.meta.url), 'utf8')
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')

  assert.match(live, /export async function listAdminSessions/)
  assert.match(live, /export async function closeAdminSession/)
  assert.match(live, /export async function deleteAdminSession/)
  assert.match(dashboard, /<h2>Live sessions<\/h2>/)
  assert.match(dashboard, /Close session/)
  assert.match(dashboard, /Permanently delete session/)
  assert.match(rules, /allow get, list: if isHost\(code\) \|\| isAdmin\(\)/)
  assert.match(rules, /isAdmin\(\) && request\.resource\.data\.hostUid == resource\.data\.hostUid/)
})
