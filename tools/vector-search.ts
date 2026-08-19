#!/usr/bin/env bun
/**
 * Semantic search over the codebase vector index.
 * Usage: bun tools/vector-search.ts "<query>" [--top N] [--json]
 */
import { Database } from 'bun:sqlite'
import { join } from 'path'
import { existsSync } from 'fs'

const ROOT    = join(import.meta.dir, '..')
const DB_PATH = join(ROOT, '.claude', 'vectors.db')
const args    = process.argv.slice(2)
const jsonOut = args.includes('--json')
const topIdx  = args.indexOf('--top')
const TOP_K   = topIdx >= 0 ? parseInt(args[topIdx + 1] ?? '5') : 5
const query   = args.filter(a => !a.startsWith('--')).join(' ').trim()

if (!query) { console.error('Usage: bun tools/vector-search.ts "<query>" [--top N] [--json]'); process.exit(1) }
if (!existsSync(DB_PATH)) { console.error('Index not built. Run: bun tools/vector-index.ts'); process.exit(1) }

const embedRes = await fetch('http://localhost:11434/api/embed', {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({model: 'nomic-embed-text', input: [query]})
})
const queryVec = ((await embedRes.json()) as {embeddings: number[][]}).embeddings[0]

const db = new Database(DB_PATH, {readonly: true})
type Row = {file:string; start_line:number; end_line:number; content:string; embedding:Uint8Array}
const rows = db.query<Row,[]>('SELECT file,start_line,end_line,content,embedding FROM chunks').all()

function cosine(a: number[], b: Uint8Array): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let dot=0, na=0, nb=0
  for (let i=0; i<a.length; i++) {
    const bv = view.getFloat32(i*4, true)
    dot += a[i]*bv; na += a[i]*a[i]; nb += bv*bv
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

const scored = rows.map(r => ({...r, score: cosine(queryVec, r.embedding)}))
scored.sort((a,b) => b.score - a.score)
const seen = new Set<string>()
const results = []
for (const r of scored) {
  if (results.length >= TOP_K) break
  if (!seen.has(r.file)) { seen.add(r.file); results.push(r) }
}

if (jsonOut) {
  console.log(JSON.stringify(results.map(r => ({
    file: r.file, start_line: r.start_line, end_line: r.end_line,
    score: parseFloat(r.score.toFixed(4)),
    excerpt: r.content.split('\n').slice(1, 25).join('\n')
  })), null, 2))
} else {
  console.log(`\nQuery: "${query}"  |  top ${results.length} results\n`)
  for (const r of results) {
    console.log(`${r.file}:${r.start_line}–${r.end_line}  [${r.score.toFixed(3)}] ${'█'.repeat(Math.round(r.score*20))}`)
    console.log(r.content.split('\n').slice(1, 16).join('\n'))
    console.log('…\n')
  }
}
