import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const manifestUrl = new URL('../public/manifest.webmanifest', import.meta.url)
const indexUrl = new URL('../index.html', import.meta.url)
const mainUrl = new URL('../src/main.tsx', import.meta.url)
const serviceWorkerUrl = new URL('../public/sw.js', import.meta.url)

test('XP Play exposes an installable player PWA', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))
  const index = await readFile(indexUrl, 'utf8')
  const main = await readFile(mainUrl, 'utf8')
  const serviceWorker = await readFile(serviceWorkerUrl, 'utf8')

  assert.equal(manifest.name, 'XP Play')
  assert.equal(manifest.start_url, './#/join')
  assert.equal(manifest.scope, './')
  assert.equal(manifest.display, 'standalone')
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'))
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'any'))
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'))
  assert.match(index, /manifest\.webmanifest/)
  assert.match(index, /apple-touch-icon/)
  assert.match(main, /serviceWorker\.register/)
  assert.match(serviceWorker, /addEventListener\('fetch'/)
})
