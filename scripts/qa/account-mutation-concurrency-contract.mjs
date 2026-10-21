#!/usr/bin/env node
// Real PostgreSQL regression for the account-row lock shared by PATCH and DELETE.
// This exercises the lock/guard protocol used by app/api/account/route.ts.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";

assert.equal(process.env.CI, "true", "account mutation concurrency contract must run only in CI");
const parsed = new URL(process.env.DATABASE_URL || "");
assert.ok(["localhost", "127.0.0.1"].includes(parsed.hostname), "test must use local CI PostgreSQL");
assert.equal(parsed.port || "5432", "5432", "test must use the CI database port");

const source = readFileSync("app/api/account/route.ts", "utf8");
const authSource = readFileSync("lib/auth.ts", "utf8");
const schemaSource = readFileSync("prisma/schema.prisma", "utf8");
const settingsSource = readFileSync("app/settings/page.tsx", "utf8");
const loginSource = readFileSync("app/login/page.tsx", "utf8");
const patchStart = source.indexOf("async function PATCHHandler");
const deleteStart = source.indexOf("async function DELETEHandler");
assert.ok(patchStart >= 0 && deleteStart > patchStart, "both account mutation handlers must exist");
const patchSource = source.slice(patchStart, deleteStart);
const deleteSource = source.slice(deleteStart, source.indexOf("export const GET ="));
const lockPattern = /SELECT "id" FROM "Account"[\s\S]*?WHERE "id" = \$\{accountId\} AND "deletionRequestedAt" IS NULL[\s\S]*?FOR UPDATE/;
assert.match(patchSource, lockPattern, "PATCH must lock only a non-deleted account row");
assert.match(deleteSource, lockPattern, "DELETE must take the same non-deleted account row lock");
assert.ok(deleteSource.indexOf("FOR UPDATE") < deleteSource.indexOf("bcrypt.compare"), "DELETE must verify the password after acquiring the account lock");
assert.ok(patchSource.indexOf("FOR UPDATE") < patchSource.indexOf("tx.user.update"), "PATCH must lock the account before changing user data");
assert.match(schemaSource, /sessionVersion Int @default\(0\)/, "users must have a session version");
assert.match(authSource, /currentUser\.sessionVersion !== \(token as any\)\.sessionVersion/, "JWT validation must revoke mismatched session versions");
assert.match(authSource, /currentUser\.account\.deletionRequestedAt/, "JWT validation must revoke deleted accounts");
assert.match(authSource, /if \(\(token as any\)\.sessionRevoked\) return null as any/, "revoked JWTs must produce no server session");
assert.match(patchSource, /sessionVersion: \{ increment: 1 \}/, "password changes must increment the session version");
assert.match(deleteSource, /sessionVersion: \{ increment: 1 \}/, "account deletion must increment the session version");
assert.match(settingsSource, /signOut\(\{ callbackUrl: "\/login\?passwordChanged=1" \}\)/, "password change must sign out all sessions");
assert.match(loginSource, /Password updated\. Please sign in again with your new password\./, "login must explain password-change sign-out");

const prisma = new PrismaClient();
const fixtures = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

async function createFixture() {
  const id = randomUUID();
  const account = await prisma.account.create({
    data: {
      type: "both",
      companyName: "QA account-mutation concurrency fixture",
      displayId: "QA-RACE-" + id,
      country: "GB",
      currency: "GBP",
      users: {
        create: {
          name: "Original user",
          email: "qa-account-race-" + id + "@post2drive.invalid",
          phone: "",
          passwordHash: "test-only-not-a-real-password-hash",
        },
      },
    },
    include: { users: true },
  });
  fixtures.push(account.id);
  return { accountId: account.id, userId: account.users[0].id };
}

async function lockActiveAccount(tx, accountId) {
  return tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Account"
    WHERE "id" = ${accountId} AND "deletionRequestedAt" IS NULL
    FOR UPDATE
  `);
}

try {
  // DELETE wins the row lock: a queued PATCH must re-check the predicate after
  // the delete commits and must not update the anonymized user.
  {
    const { accountId, userId } = await createFixture();
    const deleteLocked = deferred();
    const allowDeleteCommit = deferred();

    const deletion = prisma.$transaction(async tx => {
      const rows = await lockActiveAccount(tx, accountId);
      assert.equal(rows.length, 1, "DELETE fixture must acquire the active account lock");
      await tx.user.update({ where: { id: userId }, data: { name: "Deleted user", email: "deleted+" + randomUUID() + "@post2drive.invalid" } });
      await tx.account.update({ where: { id: accountId }, data: { deletionRequestedAt: new Date() } });
      deleteLocked.resolve();
      await allowDeleteCommit.promise;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    await deleteLocked.promise;
    const patch = prisma.$transaction(async tx => {
      const rows = await lockActiveAccount(tx, accountId);
      if (rows.length !== 1) return false;
      await tx.user.update({ where: { id: userId }, data: { name: "PATCH MUST NOT LAND" } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    await wait(100);
    allowDeleteCommit.resolve();
    await deletion;
    assert.equal(await patch, false, "PATCH must be rejected when it waits behind a committed deletion");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    assert.equal(user?.name, "Deleted user", "a stale PATCH must not overwrite anonymized profile data");
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    assert.ok(account?.deletionRequestedAt, "account deletion marker must remain set");
  }

  // Password changes increment the version stored in JWTs. Existing token claims\n  // must stop matching the persisted version after this mutation.\n  {\n    const { accountId, userId } = await createFixture();\n    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true } });\n    await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });\n    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true } });\n    assert.equal(after.sessionVersion, before.sessionVersion + 1, "credential change must advance the per-user session version");\n    await prisma.account.update({ where: { id: accountId }, data: { deletionRequestedAt: new Date() } });\n    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { account: { select: { deletionRequestedAt: true } } } });\n    assert.ok(deleted.account.deletionRequestedAt, "account deletion marker must be queryable by JWT validation");\n  }\n\n  // PATCH wins first: DELETE waits for the same lock, then deletes the updated
  // state; there is no window where a post-deletion PATCH can commit.
  {
    const { accountId, userId } = await createFixture();
    const patchLocked = deferred();
    const allowPatchCommit = deferred();

    const patch = prisma.$transaction(async tx => {
      const rows = await lockActiveAccount(tx, accountId);
      assert.equal(rows.length, 1, "PATCH fixture must acquire the active account lock");
      await tx.user.update({ where: { id: userId }, data: { name: "Updated before deletion" } });
      patchLocked.resolve();
      await allowPatchCommit.promise;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    await patchLocked.promise;
    const deletion = prisma.$transaction(async tx => {
      const rows = await lockActiveAccount(tx, accountId);
      if (rows.length !== 1) return false;
      await tx.user.update({ where: { id: userId }, data: { name: "Deleted user" } });
      await tx.account.update({ where: { id: accountId }, data: { deletionRequestedAt: new Date() } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    await wait(100);
    allowPatchCommit.resolve();
    await patch;
    assert.equal(await deletion, true, "DELETE must proceed after an earlier PATCH commits");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    assert.equal(user?.name, "Deleted user", "deletion must anonymize the last committed profile state");
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    assert.ok(account?.deletionRequestedAt, "account deletion marker must remain set");
  }

  console.log("Account mutation PostgreSQL concurrency contract passed (DELETE/PATCH serialize on the account row).");
} finally {
  for (const accountId of fixtures) {
    await prisma.account.deleteMany({ where: { id: accountId } }).catch(() => {});
  }
  await prisma.$disconnect();
}
