import { getStripeConfig } from "./stripeProvider.ts";
import { createSmsAdapter, isSmsAdapterName } from "./smsAdapters.ts";

/**
 * One place that answers "which outside services are switched on?" from
 * configuration alone. Returns names and states only, never values.
 */
type Env = Record<string, string | undefined>;
const value = (env: Env, key: string) => env[key]?.trim() || "";
const isProduction = (env: Env) => value(env, "DEPLOYMENT_ENVIRONMENT").toLowerCase() === "production";

export type Readiness = "ready" | "not_configured" | "misconfigured";

export interface ProviderReadinessReport {
  environment: string;
  email: Readiness;
  smsUk: Readiness;
  smsIndia: Readiness;
  smsGlobal: Readiness;
  payments: Readiness;
  paymentsMode: "live" | "test" | null;
}

function smsSlot(env: Env, slotVariable: string): Readiness {
  const name = value(env, slotVariable);
  if (!name) return "not_configured";
  if (!isSmsAdapterName(name)) return "misconfigured";
  return createSmsAdapter(name, env) ? "ready" : "misconfigured";
}

export function getProviderReadiness(env: Env = process.env): ProviderReadinessReport {
  const emailKey = value(env, "RESEND_API_KEY");
  const emailFrom = value(env, "EMAIL_FROM");
  const stripeKey = value(env, "STRIPE_SECRET_KEY");
  const stripeHook = value(env, "STRIPE_WEBHOOK_SECRET");
  const stripe = getStripeConfig(env);
  return {
    environment: value(env, "DEPLOYMENT_ENVIRONMENT") || "unset",
    email: emailKey && emailFrom ? "ready" : emailKey || emailFrom ? "misconfigured" : "not_configured",
    smsUk: smsSlot(env, "POST2DRIVE_SMS_UK_PROVIDER"),
    smsIndia: smsSlot(env, "POST2DRIVE_SMS_INDIA_PROVIDER"),
    smsGlobal: smsSlot(env, "POST2DRIVE_SMS_GLOBAL_PROVIDER"),
    payments: stripe ? "ready" : stripeKey || stripeHook ? "misconfigured" : "not_configured",
    paymentsMode: stripe ? (stripe.liveMode ? "live" : "test") : null,
  };
}

/**
 * Settings that must hold before real users are served. Each entry is a
 * plain sentence naming a variable, never its value. Empty means safe.
 * Only enforced when DEPLOYMENT_ENVIRONMENT is "production".
 */
export function productionConfigProblems(env: Env = process.env): string[] {
  const problems: string[] = [];
  const longEnough = (key: string) => value(env, key).length >= 32;
  const report = getProviderReadiness(env);

  if (!longEnough("NEXTAUTH_SECRET")) problems.push("NEXTAUTH_SECRET must be at least 32 characters.");
  if (!value(env, "NEXTAUTH_URL").startsWith("https://")) problems.push("NEXTAUTH_URL must be an https:// address.");
  if (!longEnough("POST2DRIVE_OTP_SECRET")) problems.push("POST2DRIVE_OTP_SECRET must be at least 32 characters.");
  if (!longEnough("POST2DRIVE_LICENCE_HASH_SECRET")) problems.push("POST2DRIVE_LICENCE_HASH_SECRET must be at least 32 characters.");
  if (!value(env, "DATABASE_URL")) problems.push("DATABASE_URL is missing.");

  // Test switches that must never be on for real users.
  if (value(env, "POST2DRIVE_QA_MODE") === "true") problems.push("POST2DRIVE_QA_MODE must not be enabled in production.");
  if (value(env, "POST2DRIVE_STAGING_TEST_PHONE_VERIFICATION") === "true") problems.push("POST2DRIVE_STAGING_TEST_PHONE_VERIFICATION must not be enabled in production.");
  if (value(env, "POST2DRIVE_TESTER_CODE")) problems.push("POST2DRIVE_TESTER_CODE must not be set in production.");

  if (report.email !== "ready") problems.push("Email is not ready: set RESEND_API_KEY and EMAIL_FROM.");
  if (value(env, "EMAIL_VERIFICATION_ENABLED") !== "true") problems.push("EMAIL_VERIFICATION_ENABLED must be true in production.");
  if (report.smsUk === "misconfigured" || report.smsIndia === "misconfigured" || report.smsGlobal === "misconfigured") {
    problems.push("An SMS provider slot names a carrier whose credentials are missing or unknown.");
  }
  if (report.smsUk !== "ready" && report.smsIndia !== "ready") problems.push("No SMS carrier is ready for UK or India numbers.");
  if (report.payments === "misconfigured") problems.push("Stripe is partly configured: set both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.");
  if (report.payments === "ready" && report.paymentsMode !== "live") problems.push("Stripe test keys must not be used in production.");
  return problems;
}

export { isProduction as isProductionEnvironment };
