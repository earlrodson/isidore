#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "../dist/client.js";
import { upsertRepoSecret } from "../dist/repo-secrets.js";

/**
 * Usage: node packages/db/scripts/seed-repo-secret.mjs <provider> <owner/repo> [secret]
 * Reads DATABASE_URL from apps/web/.env, generates a secret if one isn't
 * passed, upserts it into repo_secrets, and prints it so it can be reused
 * as ISIDORE_HMAC_SECRET when running the worker.
 */

const [provider, repoId, providedSecret] = process.argv.slice(2);
if (!provider || !repoId) {
  console.error(
    "Usage: node packages/db/scripts/seed-repo-secret.mjs <provider> <owner/repo> [secret]",
  );
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const envPath = join(repoRoot, "apps", "web", ".env");
const envContent = readFileSync(envPath, "utf-8");
const match = envContent.match(/^DATABASE_URL=(.*)$/m);
if (!match) {
  console.error(`DATABASE_URL not found in ${envPath}`);
  process.exit(1);
}
const databaseUrl = match[1].trim();

const secret = providedSecret ?? randomBytes(32).toString("hex");

const db = createDb(databaseUrl);
await upsertRepoSecret(db, { provider, repoId, secret });

console.log(`Seeded secret for ${provider}/${repoId}`);
console.log(`ISIDORE_HMAC_SECRET=${secret}`);
process.exit(0);
