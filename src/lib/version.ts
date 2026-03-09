import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

function readVersion(): string {
  // In bundled dist: cli.js is in dist/, package.json is one level up
  // In dev (tsx): src/lib/version.ts, package.json is two levels up
  const here = dirname(fileURLToPath(import.meta.url))
  for (const rel of ['..', '../..']) {
    try {
      const pkg = JSON.parse(readFileSync(join(here, rel, 'package.json'), 'utf-8'))
      if (pkg.name === '@piotrjura/pm') return pkg.version
    } catch {}
  }
  return '0.0.0'
}

export const PM_VERSION = readVersion()
