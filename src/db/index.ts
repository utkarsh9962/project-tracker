import "server-only";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

// With DATABASE_URL (e.g. Supabase Postgres) we use a real Postgres server.
// Without it, an embedded Postgres (PGlite) stores data in ./.data so the app runs with zero setup.
async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    // prepare: false keeps Supabase's transaction pooler happy.
    const db = drizzle(postgres(url, { prepare: false, max: 5 }), { schema });
    await migrate(db, { migrationsFolder });
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  await mkdir(dataDir, { recursive: true });
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as DB;
}

const globalForDb = globalThis as unknown as { dbPromise?: Promise<DB> };

export function getDb(): Promise<DB> {
  globalForDb.dbPromise ??= connect().catch((err) => {
    globalForDb.dbPromise = undefined;
    throw err;
  });
  return globalForDb.dbPromise;
}

export { schema };
