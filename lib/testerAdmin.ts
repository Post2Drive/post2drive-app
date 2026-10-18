import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const OPS_QA_ADMIN_COOKIE = "p2d_ops_qa_admin";
export const OPS_QA_ADMIN_SESSION_SECONDS = 8 * 60 * 60;

function adminSessionSecret() {
  const secret = process.env.OPS_DASHBOARD_BRIDGE_SECRET || process.env.NEXTAUTH_SECRET || "";
  return secret.length >= 32 ? secret : null;
}

function signature(username: string, email: string, expiresAt: string, secret: string) {
  return createHmac("sha256", secret)
    .update("post2drive-qa-admin-v1:" + username + ":" + email + ":" + expiresAt)
    .digest("hex");
}

function safeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createOpsQaAdminSessionToken(rawEmail: string) {
  const username = process.env.OPS_DASHBOARD_USERNAME?.trim();
  const email = rawEmail.trim().toLowerCase();
  const secret = adminSessionSecret();
  if (!username || !email || !secret) return null;
  const expiresAt = String(Date.now() + OPS_QA_ADMIN_SESSION_SECONDS * 1000);
  return {
    value: expiresAt + "." + Buffer.from(email).toString("base64url") + "." + signature(username, email, expiresAt, secret),
    maxAge: OPS_QA_ADMIN_SESSION_SECONDS,
  };
}

export async function hasOpsQaAdminSession(rawEmail?: string | null) {
  const username = process.env.OPS_DASHBOARD_USERNAME?.trim();
  const email = rawEmail?.trim().toLowerCase();
  const secret = adminSessionSecret();
  if (!username || !email || !secret) return false;
  const cookieStore = await cookies();
  const value = cookieStore.get(OPS_QA_ADMIN_COOKIE)?.value || "";
  const [expiresAt, encodedEmail, suppliedSignature, extra] = value.split(".");
  if (!expiresAt || !encodedEmail || !suppliedSignature || extra !== undefined || !/^\d{13}$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= Date.now()) return false;
  let tokenEmail = "";
  try { tokenEmail = Buffer.from(encodedEmail, "base64url").toString("utf8"); } catch { return false; }
  if (tokenEmail !== email) return false;
  return safeEqualHex(suppliedSignature, signature(username, email, expiresAt, secret));
}

export async function isTesterAdmin() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  const allowedEmails = (process.env.POST2DRIVE_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (email && allowedEmails.includes(email)) return true;
  return hasOpsQaAdminSession(email);
}
