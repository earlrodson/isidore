#!/usr/bin/env bun
/**
 * Drizzle snapshot — static parse of packages/db/src/schema.ts + drizzle.config.ts.
 * Run: pnpm exec bun tools/snapshot.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')
const OUT  = join(ROOT, '.claude', 'snapshot.json')
const DB_PKG = join(ROOT, 'packages', 'db')

function readFile(p: string) { try { return readFileSync(p, 'utf-8') } catch { return '' } }

function extractStack() {
  const pkg = JSON.parse(readFile(join(ROOT, 'package.json')) || '{}')
  return {
    runtime: 'pnpm',
    framework: 'Next.js (apps/web)',
    orm: 'Drizzle (packages/db)',
    commands: {
      dev:       'pnpm --filter @isidore/web dev',
      build:     'pnpm -r build',
      typecheck: 'pnpm -r typecheck',
      test:      'pnpm -r test',
      generate:  'pnpm --filter @isidore/db db:generate',
      migrate:   'pnpm --filter @isidore/db db:migrate',
      snapshot:  'pnpm run snapshot',
    },
  }
}

// Detect schema files from drizzle.config.ts or common paths
function findSchemaFiles(): string[] {
  const config = readFile(join(DB_PKG, 'drizzle.config.ts')) || readFile(join(DB_PKG, 'drizzle.config.js'))
  const schemaMatch = config.match(/schema:\s*['"]([^'"]+)['"]/)
  if (schemaMatch) {
    const p = join(DB_PKG, schemaMatch[1])
    if (existsSync(p)) return [p]
  }
  const candidates = ['src/schema.ts', 'db/schema.ts', 'src/db/schema.ts']
  return candidates.filter(p => existsSync(join(DB_PKG, p))).map(p => join(DB_PKG, p))
}

function extractDrizzleSchema(files: string[]) {
  const tables: Record<string, { columns: string[]; dialect: string }> = {}

  for (const file of files) {
    const source = readFile(file)
    const tableRe = /export const (\w+)\s*=\s*(pgTable|mysqlTable|sqliteTable|pgView|mysqlView)\(\s*['"]([^'"]+)['"]\s*,\s*\{([^}]+)\}/g
    let m: RegExpExecArray | null
    while ((m = tableRe.exec(source)) !== null) {
      const [, exportName, fn,, body] = m
      const dialect = fn.startsWith('pg') ? 'postgresql' : fn.startsWith('mysql') ? 'mysql' : 'sqlite'
      const colRe = /^\s+(\w+)\s*:/gm
      const columns: string[] = []
      let c: RegExpExecArray | null
      while ((c = colRe.exec(body)) !== null) columns.push(c[1])
      tables[exportName] = { columns, dialect }
    }
  }
  return tables
}

function keyFiles() {
  const schemaFiles = findSchemaFiles()
  const candidates = {
    config:     ['packages/db/drizzle.config.ts'],
    schema:     schemaFiles.map(f => f.replace(ROOT + '/', '')),
    client:     ['packages/db/src/index.ts'],
    migrations: ['packages/db/migrations'],
  }
  const result: Record<string, string[]> = {}
  for (const [k, paths] of Object.entries(candidates))
    result[k] = paths.filter(p => existsSync(join(ROOT, p)))
  return result
}

const schemaFiles = findSchemaFiles()
const tables = extractDrizzleSchema(schemaFiles)
const snapshot = {
  generated_at: new Date().toISOString(),
  generated_by: 'tools/snapshot.ts',
  stack: extractStack(),
  db: {
    platform: 'drizzle',
    schema_files: schemaFiles.map(f => f.replace(ROOT + '/', '')),
    tables,
  },
  key_files: keyFiles(),
  env_map: {
    development: { DATABASE_URL: 'FILL_IN' },
    staging:     { DATABASE_URL: 'FILL_IN' },
    production:  { DATABASE_URL: 'FILL_IN' },
    notes: ['Never commit real DATABASE_URL values — use .env files'],
  },
}

writeFileSync(OUT, JSON.stringify(snapshot, null, 2))
console.log(`✓ Drizzle snapshot — ${Object.keys(tables).length} tables · ${schemaFiles.length} schema files → ${OUT}`)
