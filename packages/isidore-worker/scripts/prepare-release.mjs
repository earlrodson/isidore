#!/usr/bin/env node
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Assembles a standalone, publish-ready copy of @isidore/worker under
 * `release/` — bundling `@isidore/shared` in (no `workspace:*` reference
 * survives) — then `npm pack`s it into a .tgz. The tarball installs via a
 * plain URL (`npm install <release-asset-url>`, or `gh release download` +
 * `npx --package=./isidore-worker-*.tgz isidore-worker-ci` in CI) with no
 * monorepo, no build step, and no git-clone machinery in the consumer.
 * This resolves the AC-006 blocker in docs/features/onboarding-oauth.md —
 * see that file's Decisions & risks for why checkout-and-build-from-source
 * was the interim workaround.
 *
 * This script only writes to `release/` on disk. It never touches git
 * remotes, tags, or GitHub Releases — publishing the resulting tarball
 * (`gh release create` / `gh release upload`) is a separate, explicit step.
 */

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseDir = join(pkgDir, "release");

rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(join(releaseDir, "dist"), { recursive: true });

await build({
  entryPoints: [
    join(pkgDir, "src/index.ts"),
    join(pkgDir, "src/cli.ts"),
    join(pkgDir, "src/ci-entry.ts"),
  ],
  outdir: join(releaseDir, "dist"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // Real npm dependencies stay external (installed normally in the
  // consumer's node_modules); only workspace-internal `@isidore/shared`
  // gets inlined, since it isn't published anywhere a consumer could
  // resolve it from.
  external: ["zod", "yaml"],
});

cpSync(join(pkgDir, "resources"), join(releaseDir, "resources"), { recursive: true });

const sourcePkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8"));
const releasePkg = {
  name: sourcePkg.name,
  version: sourcePkg.version,
  type: "module",
  main: "./dist/index.js",
  bin: sourcePkg.bin,
  files: ["dist", "resources"],
  dependencies: {
    zod: JSON.parse(readFileSync(join(pkgDir, "..", "shared", "package.json"), "utf-8")).dependencies
      .zod,
    yaml: sourcePkg.dependencies.yaml,
  },
};
writeFileSync(join(releaseDir, "package.json"), `${JSON.stringify(releasePkg, null, 2)}\n`);

const packOutput = execFileSync("npm", ["pack", "--pack-destination", "..", "--json"], {
  cwd: releaseDir,
  encoding: "utf-8",
});
const [{ filename }] = JSON.parse(packOutput);
const tarballPath = join(pkgDir, filename);

console.log(`Assembled release package at ${releaseDir}`);
console.log(`Packed tarball at ${tarballPath}`);
console.log("");
console.log("Nothing was pushed anywhere — to actually publish, run e.g.:");
console.log(`  gh release create isidore-worker-v${releasePkg.version} ${tarballPath} \\`);
console.log(`    --repo <owner>/<repo> --title "isidore-worker v${releasePkg.version}"`);
