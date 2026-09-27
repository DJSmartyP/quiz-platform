import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const reviewRoot = join(root, 'review', 'theme-backgrounds')
const themesRoot = join(root, 'public', 'themes')
const avatarsRoot = join(root, 'public', 'avatars')

const themeIds = (await readdir(reviewRoot, { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)

for (const themeId of themeIds) {
  const sourceDir = join(reviewRoot, themeId)
  const targetDir = join(themesRoot, themeId)
  const scenes = [
    ['question.png', 'background.webp', 1920, 1080],
    ['break.png', 'break.webp', 1920, 1080],
    ['finale.png', 'thanks.webp', 1920, 1080],
    ['player-mobile.png', 'player.webp', 1080, 1920],
  ]
  for (const [sourceName, targetName, width, height] of scenes) {
    await sharp(join(sourceDir, sourceName))
      .resize({ width, height, fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80, effort: 6, smartSubsample: true })
      .toFile(join(targetDir, targetName))
  }
}

const packDirs = (await readdir(avatarsRoot, { withFileTypes: true })).filter(entry => entry.isDirectory())
for (const packDir of packDirs) {
  const manifestPath = join(avatarsRoot, packDir.name, 'manifest.json')
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    let changed = false
    for (const avatar of manifest.avatars || []) {
      if (extname(avatar.src).toLowerCase() !== '.png') continue
      const sourcePath = join(root, 'public', avatar.src)
      const targetPath = sourcePath.slice(0, -4) + '.webp'
      await sharp(sourcePath)
        .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 86, alphaQuality: 100, effort: 6, smartSubsample: true })
        .toFile(targetPath)
      avatar.src = avatar.src.slice(0, -4) + '.webp'
      changed = true
    }
    if (changed) await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

const totalBytes = async directory => {
  let total = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    total += entry.isDirectory() ? await totalBytes(path) : (await stat(path)).size
  }
  return total
}

console.log(`Optimised ${themeIds.length * 4} theme scenes.`)
console.log(`Theme assets: ${(await totalBytes(themesRoot) / 1024 / 1024).toFixed(1)} MB`)
console.log(`Avatar assets (including preserved PNG sources): ${(await totalBytes(avatarsRoot) / 1024 / 1024).toFixed(1)} MB`)
