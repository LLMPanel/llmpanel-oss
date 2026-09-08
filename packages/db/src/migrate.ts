import { existsSync } from "node:fs"
import path from "node:path"
import { migrate } from "drizzle-orm/libsql/migrator"
import { db } from "./connection"

const MIGRATIONS_SUBPATH = path.join("packages", "db", "migrations")

/**
 * Locate the generated SQL migrations.
 *
 * Production images set `MIGRATIONS_DIR` to an absolute path, because the
 * bundled server has no source tree to look at. In development we walk up from
 * the cwd until we find the monorepo's `packages/db/migrations`, which works
 * regardless of which app started the process.
 *
 * Deliberately avoids `import.meta.url` and `__dirname` — this module is
 * consumed both as CJS (tsx in dev) and as ESM (bundled in prod), and neither
 * of those is defined in both.
 */
function resolveMigrationsFolder(): string {
  const fromEnv = process.env.MIGRATIONS_DIR
  if (fromEnv) return fromEnv

  let dir = process.cwd()
  for (;;) {
    const candidate = path.join(dir, MIGRATIONS_SUBPATH)
    if (existsSync(candidate)) return candidate

    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  throw new Error(
    `Could not locate ${MIGRATIONS_SUBPATH} above ${process.cwd()}. Set MIGRATIONS_DIR to an absolute path.`,
  )
}

/**
 * Bring the database up to the latest schema. Safe to call on every boot —
 * drizzle records applied migrations in `__drizzle_migrations` and skips them.
 */
export async function runMigrations(migrationsFolder = resolveMigrationsFolder()): Promise<void> {
  await migrate(db, { migrationsFolder })
}
