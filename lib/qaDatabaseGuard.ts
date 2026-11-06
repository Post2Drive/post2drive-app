/**
 * Proof that the QA worker's DATABASE_URL targets the isolated QA database.
 * Fails closed: an operator must name the isolated database explicitly
 * (POST2DRIVE_QA_DATABASE_NAME) and it must be the database in DATABASE_URL.
 * Names that are common default/production databases are always refused.
 */
const FORBIDDEN_DATABASE_NAMES = new Set(["", "postgres", "railway", "template0", "template1"]);

export function databaseNameFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/^postgres(ql)?:$/.test(parsed.protocol)) return null;
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).toLowerCase();
  } catch {
    return null;
  }
}

/** Static check, run before anything touches the database. Returns an error string or null. */
export function qaDatabaseConfigError(env: Record<string, string | undefined> = process.env): string | null {
  const expected = env.POST2DRIVE_QA_DATABASE_NAME?.trim().toLowerCase();
  if (!expected) return "POST2DRIVE_QA_DATABASE_NAME must name the isolated QA database.";
  if (FORBIDDEN_DATABASE_NAMES.has(expected)) return "POST2DRIVE_QA_DATABASE_NAME names a default/shared database, not an isolated QA database.";
  const actual = databaseNameFromUrl(env.DATABASE_URL);
  if (!actual) return "DATABASE_URL must be a PostgreSQL URL that names a database.";
  if (actual !== expected) return "DATABASE_URL does not target the declared isolated QA database.";
  return null;
}

/** Live check: the connected server must report the same database name. */
export function qaLiveDatabaseMatches(currentDatabase: unknown, env: Record<string, string | undefined> = process.env): boolean {
  const expected = env.POST2DRIVE_QA_DATABASE_NAME?.trim().toLowerCase();
  return typeof currentDatabase === "string" && Boolean(expected) && currentDatabase.toLowerCase() === expected;
}
