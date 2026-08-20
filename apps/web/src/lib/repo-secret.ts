import { randomBytes } from "node:crypto";

/** Hex-encoded 32 bytes, matching packages/db/scripts/seed-repo-secret.mjs
 * so manually-seeded and onboarding-generated secrets have equal entropy. */
export function generateRepoSecret(): string {
  return randomBytes(32).toString("hex");
}
