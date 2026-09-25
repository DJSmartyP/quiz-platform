import assert from 'node:assert/strict'
import { stat, readFile } from 'node:fs/promises'
import { test } from 'node:test'

const themes = [
  'quiz-show', 'western', 'neon-sci-fi', 'arcane-fantasy', 'monster-mash', 'celebration',
  'retro-sports', 'pixel-cinema', 'world-tour', 'synthwave-festival', 'deep-sea', 'detective-noir',
]

test('every selectable theme has its definition, CSS tokens and complete scene artwork', async () => {
  const [model, css] = await Promise.all([
    readFile(new URL('../src/model.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/brand.css', import.meta.url), 'utf8'),
  ])

  for (const theme of themes) {
    assert.match(model, new RegExp(`['"]?${theme}['"]?\\s*:`), `${theme} is missing its theme definition`)
    assert.ok(css.includes(`.theme-${theme}{`), `${theme} is missing its CSS theme tokens`)
    for (const scene of ['background', 'break', 'thanks']) {
      for (const extension of ['png', 'webp']) {
        const file = new URL(`../public/themes/${theme}/${scene}.${extension}`, import.meta.url)
        assert.ok((await stat(file)).size > 1_000, `${theme}/${scene}.${extension} is empty or missing`)
      }
    }
  }
})
