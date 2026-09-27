import assert from 'node:assert/strict'
import { readdir, stat, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

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
    const player = new URL(`../public/themes/${theme}/player.webp`, import.meta.url)
    assert.ok((await stat(player)).size > 1_000, `${theme}/player.webp is empty or missing`)
  }
  assert.ok(css.includes('var(--theme-player)'), 'player screens do not use the portrait theme scene')
  assert.match(css, /\.theme-celebration\{[^}]*--theme-font:'Bungee Shade'/)
})

test('avatar manifests use compact transparent WebP display assets', async () => {
  const avatarsRoot = new URL('../public/avatars/', import.meta.url)
  const packs = await readdir(avatarsRoot, { withFileTypes: true })
  for (const pack of packs.filter(entry => entry.isDirectory())) {
    const manifestUrl = new URL(`${pack.name}/manifest.json`, avatarsRoot)
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))
    for (const avatar of manifest.avatars || []) {
      assert.match(avatar.src, /\.webp$/, `${avatar.id} still points at a large PNG`)
      const displayAsset = new URL(`../public/${avatar.src}`, import.meta.url)
      assert.ok((await stat(displayAsset)).size > 1_000, `${avatar.src} is empty or missing`)
      assert.equal((await sharp(fileURLToPath(displayAsset)).metadata()).hasAlpha, true, `${avatar.src} lost transparency`)
    }
  }
})
