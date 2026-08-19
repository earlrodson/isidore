#!/usr/bin/env bun
/**
 * Builds .claude/vectors.db — semantic search index over this codebase.
 * Run: bun tools/vector-index.ts
 * Hook: bun tools/vector-index.ts --install-hook
 */
import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, chmodSync } from 'fs'
import { join, relative } from 'path'
import { createHash } from 'crypto'

const ROOT      = join(import.meta.dir, '..')
const DB_PATH   = join(ROOT, '.claude', 'vectors.db')
const EMBED_URL = 'http://localhost:11434/api/embed'
const MODEL     = 'nomic-embed-text'
const CHUNK_LINES   = 80
const OVERLAP_LINES = 15
const BATCH_SIZE    = 20

// ── CONFIGURE: directories to index ──────────────────────────────────────────
const TARGET_DIRS = ['apps', 'packages']
const SKIP_DIRS   = new Set(['node_modules', '.next', '_generated', 'dist', 'build', '.git', 'playwright-report', 'test-results', '.turbo', 'coverage'])
const SKIP_SUFFIX = ['.d.ts', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.config.ts', '.min.js']

if (process.argv.includes('--install-hook')) {
  const hookPath = join(ROOT, '.git', 'hooks', 'post-commit')
  writeFileSync(hookPath, `#!/bin/sh\nbun tools/vector-index.ts\n`)
  chmodSync(hookPath, 0o755)
  console.log('✓ Installed post-commit hook')
  process.exit(0)
}

const db = new Database(DB_PATH)
db.run(`PRAGMA journal_mode = WAL`)
db.run(`CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file TEXT NOT NULL, chunk_idx INTEGER NOT NULL,
  start_line INTEGER NOT NULL, end_line INTEGER NOT NULL,
  content TEXT NOT NULL, embedding BLOB NOT NULL,
  file_hash TEXT NOT NULL, indexed_at INTEGER NOT NULL,
  UNIQUE(file, chunk_idx)
)`)
db.run(`CREATE INDEX IF NOT EXISTS idx_file ON chunks(file)`)
db.run(`CREATE INDEX IF NOT EXISTS idx_file_hash ON chunks(file, file_hash)`)

function walkFiles(dir: string, results: string[] = []): string[] {
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    try {
      const stat = statSync(full)
      if (stat.isDirectory()) walkFiles(full, results)
      else if ((full.endsWith('.ts') || full.endsWith('.tsx')) && !SKIP_SUFFIX.some(s => full.endsWith(s)))
        results.push(full)
    } catch {}
  }
  return results
}

function chunkFile(absPath: string, content: string) {
  const relPath = relative(ROOT, absPath)
  const lines = content.split('\n')
  const chunks: Array<{start: number; end: number; text: string}> = []
  const step = CHUNK_LINES - OVERLAP_LINES
  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(start + CHUNK_LINES, lines.length)
    chunks.push({ start: start + 1, end, text: `// ${relPath} lines ${start+1}–${end}\n${lines.slice(start, end).join('\n')}` })
    if (end >= lines.length) break
  }
  return chunks
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(EMBED_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({model: MODEL, input: texts}) })
  return ((await res.json()) as {embeddings: number[][]}).embeddings
}

function toBlob(vec: number[]): Buffer {
  const buf = Buffer.allocUnsafe(vec.length * 4)
  vec.forEach((v, i) => buf.writeFloatLE(v, i * 4))
  return buf
}

console.log('Building vector index...')
const t0 = Date.now()
const allFiles: string[] = []
for (const dir of TARGET_DIRS) walkFiles(join(ROOT, dir), allFiles)

const getHash = db.query<{file_hash: string}, [string]>('SELECT file_hash FROM chunks WHERE file = ? LIMIT 1')
const toIndex: Array<{absPath: string; relPath: string; hash: string; content: string}> = []
for (const absPath of allFiles) {
  const content = readFileSync(absPath, 'utf-8')
  const hash = createHash('sha256').update(content).digest('hex')
  const relPath = relative(ROOT, absPath)
  const row = getHash.get(relPath)
  if (!row || row.file_hash !== hash) toIndex.push({absPath, relPath, hash, content})
}
console.log(`  ${allFiles.length} files · ${toIndex.length} need indexing · ${allFiles.length - toIndex.length} unchanged`)
if (toIndex.length === 0) {
  console.log(`✓ Index up to date (${(db.query<{n:number},[]>('SELECT COUNT(*) as n FROM chunks').get())!.n} chunks)`)
  process.exit(0)
}

const pendingChunks: Array<{relPath:string;hash:string;chunkIdx:number;start:number;end:number;text:string}> = []
for (const {absPath, relPath, hash, content} of toIndex)
  chunkFile(absPath, content).forEach((c, idx) => pendingChunks.push({relPath, hash, chunkIdx: idx, start: c.start, end: c.end, text: c.text}))

const deleteFile = db.prepare('DELETE FROM chunks WHERE file = ?')
db.transaction(() => [...new Set(toIndex.map(f => f.relPath))].forEach(f => deleteFile.run(f)))()

const insert = db.prepare(`INSERT OR REPLACE INTO chunks (file,chunk_idx,start_line,end_line,content,embedding,file_hash,indexed_at) VALUES (?,?,?,?,?,?,?,?)`)
const insertBatch = db.transaction((chunks: typeof pendingChunks, vecs: number[][]) => {
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    insert.run(c.relPath, c.chunkIdx, c.start, c.end, c.text, toBlob(vecs[i]), c.hash, Date.now())
  }
})

let done = 0
for (let i = 0; i < pendingChunks.length; i += BATCH_SIZE) {
  const batch = pendingChunks.slice(i, i + BATCH_SIZE)
  insertBatch(batch, await embedBatch(batch.map(c => c.text)))
  done += batch.length
  process.stdout.write(`\r  ${done}/${pendingChunks.length} chunks embedded`)
}
const total = (db.query<{n:number},[]>('SELECT COUNT(*) as n FROM chunks').get())!.n
console.log(`\n✓ Done in ${((Date.now()-t0)/1000).toFixed(1)}s — ${pendingChunks.length} chunks added · ${total} total`)
