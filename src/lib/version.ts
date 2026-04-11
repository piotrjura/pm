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

const REGISTRY_URL = 'https://registry.npmjs.org/@piotrjura/pm/latest'

/** Fetch the latest published version from npm. Returns null on any failure. */
export async function checkLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(REGISTRY_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const data = await res.json() as { version?: string }
    return data.version ?? null
  } catch {
    return null
  }
}

/** Compare two semver strings. Returns true if remote is strictly newer. */
export function isNewer(current: string, remote: string): boolean {
  const parse = (v: string) => v.split('.').map(Number)
  const [cMaj, cMin, cPat] = parse(current)
  const [rMaj, rMin, rPat] = parse(remote)
  if (rMaj !== cMaj) return rMaj > cMaj
  if (rMin !== cMin) return rMin > cMin
  return rPat > cPat
}
