import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: [{ emit: "event", level: "error" }] });
prisma.$on("error", () => {
  console.error("Read-only provisioning database client error.", { errorName: "PrismaClientError" });
});
const ROLE = "post2drive_ops_readonly";
const PASSWORD = process.env.OPS_DASHBOARD_DB_PASSWORD;

function quoteIdentifier(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}
function quoteLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to provision the staging read-only role.");
  process.exit(1);
}
if (!PASSWORD || PASSWORD.length < 32) {
  console.error("OPS_DASHBOARD_DB_PASSWORD must be set to a secret of at least 32 characters.");
  process.exit(1);
}

try {
  const [connection] = await prisma.$queryRaw`SELECT current_database() AS name, current_user AS username`;
  if (!connection?.name) throw new Error("Could not identify the connected database.");
  const roleExists = await prisma.$queryRaw`SELECT rolname FROM pg_roles WHERE rolname = ${ROLE}`;
  const roleOptions = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS";
  const roleSql = roleExists.length
    ? `ALTER ROLE ${quoteIdentifier(ROLE)} ${roleOptions} PASSWORD ${quoteLiteral(PASSWORD)}`
    : `CREATE ROLE ${quoteIdentifier(ROLE)} ${roleOptions} PASSWORD ${quoteLiteral(PASSWORD)}`;
  await prisma.$executeRawUnsafe(roleSql);

  await prisma.$executeRawUnsafe(
    `GRANT CONNECT ON DATABASE ${quoteIdentifier(connection.name)} TO ${quoteIdentifier(ROLE)}`
  );
  await prisma.$executeRawUnsafe(
    `GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(ROLE)}`
  );
  await prisma.$executeRawUnsafe(
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM ${quoteIdentifier(ROLE)}`
  );
  await prisma.$executeRawUnsafe(
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${quoteIdentifier(ROLE)}`
  );
  await prisma.$executeRawUnsafe(
    `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(ROLE)}`
  );
  await prisma.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM ${quoteIdentifier(ROLE)}`
  );
  await prisma.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${quoteIdentifier(ROLE)}`
  );
  await prisma.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${quoteIdentifier(ROLE)}`
  );

  const [privileges] = await prisma.$queryRaw`
    SELECT
      r.rolcanlogin AS can_login,
      r.rolsuper AS is_superuser,
      r.rolcreatedb AS can_create_database,
      r.rolcreaterole AS can_create_roles,
      r.rolbypassrls AS bypasses_rls,
      (SELECT count(*)::int FROM pg_tables t
        WHERE t.schemaname = 'public'
          AND has_table_privilege(r.rolname, quote_ident(t.schemaname) || '.' || quote_ident(t.tablename), 'SELECT')
      ) AS readable_tables,
      (SELECT count(*)::int FROM pg_tables t
        WHERE t.schemaname = 'public'
          AND (
            has_table_privilege(r.rolname, quote_ident(t.schemaname) || '.' || quote_ident(t.tablename), 'INSERT')
            OR has_table_privilege(r.rolname, quote_ident(t.schemaname) || '.' || quote_ident(t.tablename), 'UPDATE')
            OR has_table_privilege(r.rolname, quote_ident(t.schemaname) || '.' || quote_ident(t.tablename), 'DELETE')
            OR has_table_privilege(r.rolname, quote_ident(t.schemaname) || '.' || quote_ident(t.tablename), 'TRUNCATE')
          )
      ) AS writable_tables
    FROM pg_roles r WHERE r.rolname = ${ROLE}
  `;
  if (!privileges?.can_login || privileges.is_superuser || privileges.can_create_database ||
      privileges.can_create_roles || privileges.bypasses_rls || Number(privileges.writable_tables) !== 0) {
    throw new Error("Read-only role verification failed; writable privileges or elevated role attributes remain.");
  }

  console.log(JSON.stringify({
    status: "verified",
    database: connection.name,
    connectedAs: connection.username,
    role: ROLE,
    canLogin: privileges.can_login,
    superuser: privileges.is_superuser,
    canCreateDatabase: privileges.can_create_database,
    canCreateRoles: privileges.can_create_roles,
    bypassesRls: privileges.bypasses_rls,
    readableTables: Number(privileges.readable_tables),
    writableTables: Number(privileges.writable_tables)
  }));
} catch (error) {
  console.error("Read-only database role provisioning failed.", { errorName: error instanceof Error ? error.name : "UnknownError" });
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
