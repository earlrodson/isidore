import { createDb, type Db } from "@isidore/db";

let db: Db | undefined;

/** Lazily memoized so Server Component renders share one pool instead of
 * opening a new one per request. */
export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    db = createDb(url);
  }
  return db;
}
