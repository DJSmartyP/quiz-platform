import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Main Screen shows a fitted top ten while the Host retains the full leaderboard', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/brand.css', import.meta.url), 'utf8')

  assert.match(app, /<h3>Full leaderboard<\/h3>/)
  assert.match(app, /ranked\(game\.players\)\.map\(player/)
  assert.match(app, /rankedRound\(game, question\.round\) : overallRanking\)\.slice\(0, 10\)/)
  assert.match(app, /scoreboard-row place-/)
  assert.match(app, /rank-row place-/)
  assert.match(app, /entries\.length > 5 \? 'two-columns' : 'one-column'/)
  assert.match(app, /path="\/scoreboard-preview\/:count"/)
  assert.match(css, /\.screen-ranks \.place-1/)
  assert.match(css, /\.screen-ranks \.place-2/)
  assert.match(css, /\.screen-ranks \.place-3/)
  assert.match(css, /@media\(max-height:760px\)/)
  assert.match(css, /\.screen-ranks\.two-columns\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(css, /grid-template-rows:repeat\(5,minmax\(0,1fr\)\);grid-auto-flow:column/)
})
