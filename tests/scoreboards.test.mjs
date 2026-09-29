import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Host and Main Screen scoreboards show a fitted top ten with medal places', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/brand.css', import.meta.url), 'utf8')

  assert.match(app, /ranked\(game\.players\)\.slice\(0,10\)\.map/)
  assert.match(app, /rankedRound\(game,q\.round\):ranking\)\.slice\(0,10\)\.map/)
  assert.match(app, /scoreboard-row place-/)
  assert.match(app, /rank-row place-/)
  assert.match(css, /\.screen-ranks \.place-1/)
  assert.match(css, /\.screen-ranks \.place-2/)
  assert.match(css, /\.screen-ranks \.place-3/)
  assert.match(css, /@media\(max-height:760px\)/)
})
