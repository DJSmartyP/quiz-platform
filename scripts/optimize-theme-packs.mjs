import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const themesRoot = join(root, 'public', 'themes')
const sceneFiles = [
  ['background.png', 'background.webp', 1920, 1080],
  ['break.png', 'break.webp', 1920, 1080],
  ['thanks.png', 'thanks.webp', 1920, 1080],
  ['player.png', 'player.webp', 1080, 1920],
]

let written = 0
for (const theme of await readdir(themesRoot, { withFileTypes: true })) {
  if (!theme.isDirectory()) continue
  const themeRoot = join(themesRoot, theme.name)
  for (const [sourceName, targetName, width, height] of sceneFiles) {
    const source = join(themeRoot, sourceName)
    try {
      await stat(source)
    } catch {
      continue
    }
    await sharp(source)
      .resize({ width, height, fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80, effort: 6, smartSubsample: true })
      .toFile(join(themeRoot, targetName))
    written += 1
  }
}

console.log(`Optimised ${written} theme scene files.`)
