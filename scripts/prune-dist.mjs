import { readdir, rm } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const targets = [join(root, 'dist', 'avatars'), join(root, 'dist', 'themes')]
let removed = 0

async function prune(directory) {
  let entries = []
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await prune(path)
    else if (extname(entry.name).toLowerCase() === '.png') {
      await rm(path)
      removed += 1
    }
  }
}

for (const directory of targets) await prune(directory)
console.log(`Removed ${removed} unused PNG masters from the deployment bundle.`)
