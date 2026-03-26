#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const pluginPath = join(root, '.claude-plugin', 'plugin.json')
const plugin = JSON.parse(readFileSync(pluginPath, 'utf-8'))

if (plugin.version !== pkg.version) {
  plugin.version = pkg.version
  writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + '\n')
  console.log(`Synced plugin.json version to ${pkg.version}`)
} else {
  console.log(`Versions already in sync: ${pkg.version}`)
}
