import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authOptions } from "../lib/auth";

if (process.env.CI !== "true") throw new Error("Auth session revocation regression must run in CI.");
const databaseUrl = new URL(process.env.DATABASE_URL || "");
assert.ok(["localhost", "127.0.0.1"].includes(databaseUrl.hostname), "test must use local CI PostgreSQL");
const prisma = new PrismaClient();
const accountIds: string[] = [];

async function fixture(label: string) {
  const id = randomUUID();
  const account = await prisma.account.create({
    data: {
      type: "both",
      companyName: "QA auth-session fixture",
      displayId: `QA-AUTH-${label}-${id}`,
      country: "GB",
      currency: "GBP",
      users: {
        create: {
          name: "QA session user",
          email: `qa-auth-${label}-${id}@post2drive.invalid`,
          phone: "",
          passwordHash: "test-only-not-a-real-password-hash",
        },
      },
    },
    include: { users: true },
  });
  accountIds.push(account.id);
  return { account, user: account.users[0] };
}

const jwtCallback = authOptions.callbacks?.jwt;
const sessionCallback = authOptions.callbacks?.session;
assert.ok(jwtCallback && sessionCallback, "JWT and session callbacks must exist");

async function tokenFor(user: { id: string; accountId: string; sessionVersion: number; country: string; currency: string }) {
  return jwtCallback!({
    token: {},
    user: { id: user.id, accountId: user.accountId, sessionVersion: user.sessionVersion, country: user.country, currency: user.currency, accountType: "both" },
  } as any) as Promise<any>;
}

async function isSessionRevoked(token: any) {
  const checked = await jwtCallback!({ token } as any) as any;
  const session = await sessionCallback!({
    session: { user: { name: "QA session user", email: "qa@example.invalid" }, expires: new Date(Date.now() + 60_000).toISOString() },
    token: checked,
  } as any);
  return { checked, session };
}

try {
  // Credential change: an already-issued token must be revoked when its
  // version no longer matches the database.
  {
    const { account, user } = await fixture("password-change");
    const token = await tokenFor({ id: user.id, accountId: account.id, sessionVersion: user.sessionVersion, country: account.country, currency: account.currency });
    assert.equal((await isSessionRevoked(token)).session?.user?.id, user.id, "freshly issued token should remain valid before credential change");
    await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    const result = await isSessionRevoked(token);
    assert.equal(result.checked.sessionRevoked, true, "old JWT must be marked revoked after sessionVersion changes");
    assert.equal(result.session, null, "revoked JWT must not yield a server session");
  }

  // Account deletion: even if the token version has not changed, the
  // persisted deletion marker must revoke the JWT.
  {
    const { account, user } = await fixture("deletion");
    const token = await tokenFor({ id: user.id, accountId: account.id, sessionVersion: user.sessionVersion, country: account.country, currency: account.currency });
    await prisma.account.update({ where: { id: account.id }, data: { deletionRequestedAt: new Date() } });
    const result = await isSessionRevoked(token);
    assert.equal(result.checked.sessionRevoked, true, "deleted account must revoke an existing JWT");
    assert.equal(result.session, null, "deleted account JWT must not yield a server session");
  }

  // Legacy tokens without a version fail closed and require a fresh sign-in.
  {
    const result = await isSessionRevoked({ id: "legacy-token-without-session-version" });
    assert.equal(result.checked.sessionRevoked, true, "legacy token without a session version must fail closed");
    assert.equal(result.session, null, "legacy token must not yield a server session");
  }

  console.log("Auth session revocation regression passed: password change, account deletion and legacy JWT fail-closed behavior.");
} finally {
  for (const accountId of accountIds) {
    await prisma.account.deleteMany({ where: { id: accountId } }).catch(() => {});
  }
  await prisma.$disconnect();
}
