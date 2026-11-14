#!/usr/bin/env node
// Provider adapters: email/SMS/payment integrations are ready to switch on by
// configuration alone, fail closed without it, and never trust unsigned input.
// Hermetic: no network, no database. Uses fake fetch and locally signed payloads.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backoffDelayMs, fetchWithRetry } from "../../lib/httpRetry.ts";
import { createMsg91SmsProvider, createSmsAdapter, createTwilioSmsProvider } from "../../lib/smsAdapters.ts";
import {
  createStripeCheckout, getStripeConfig, parseStripeWebhook, signStripePayload, verifyStripeSignature,
} from "../../lib/stripeProvider.ts";
import { subscriptionCheckoutConnected, PAYMENT_PROVIDER_CONNECTED } from "../../lib/paymentProvider.ts";
import { getProviderReadiness, productionConfigProblems } from "../../lib/providerReadiness.ts";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const noSleep = async () => {};
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks += 1; };

// ── 1. Retry helper: bounded, backs off, never retries a non-transient status ──
{
  let calls = 0;
  const res = await fetchWithRetry("https://x.invalid", {}, { sleep: noSleep, fetchImpl: async () => { calls += 1; return calls < 3 ? json({}, 503) : json({ ok: true }); } });
  eq([res.status, calls], [200, 3], "transient 503s are retried then succeed");
  calls = 0;
  const bad = await fetchWithRetry("https://x.invalid", {}, { sleep: noSleep, fetchImpl: async () => { calls += 1; return json({}, 400); } });
  eq([bad.status, calls], [400, 1], "a 400 is returned immediately, not retried");
  calls = 0;
  await assert.rejects(fetchWithRetry("https://x.invalid", {}, { retries: 2, sleep: noSleep, fetchImpl: async () => { calls += 1; throw new Error("network"); } }));
  eq(calls, 3, "network errors stop after the retry budget");
  ok(backoffDelayMs(0, 300, 4000, () => 1) === 300 && backoffDelayMs(1, 300, 4000, () => 1) === 600 && backoffDelayMs(10, 300, 4000, () => 1) === 4000, "backoff doubles and is capped");
  ok(backoffDelayMs(2, 300, 4000, () => 0) >= 600, "jitter never drops below half the step");
}

// ── 2. SMS: fail closed without credentials; correct request shape with them ──
{
  eq(createTwilioSmsProvider({}), null, "Twilio is unavailable without credentials");
  eq(createTwilioSmsProvider({ TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32), TWILIO_AUTH_TOKEN: "t" }), null, "Twilio needs a sender");
  eq(createMsg91SmsProvider({ MSG91_AUTH_KEY: "k" }), null, "MSG91 needs a template id");
  eq(createSmsAdapter("unknown-carrier", { TWILIO_ACCOUNT_SID: "x" }), null, "an unknown carrier name selects nothing");
  eq(createSmsAdapter(null, {}), null, "no carrier selected means no adapter");

  const expiresAt = new Date(Date.now() + 5 * 60_000);
  let seen = null;
  const sid = "AC" + "0123456789abcdef".repeat(2);
  const twilio = createSmsAdapter("twilio", { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+447700900000" },
    async (url, init) => { seen = { url, init }; return json({ sid: "SM123" }, 201); });
  const sent = await twilio.sendOtp({ toE164: "+447700900123", code: "482913", expiresAt });
  eq(sent, { accepted: true, providerMessageId: "SM123" }, "Twilio accepted delivery is reported");
  ok(seen.url === `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, "Twilio URL uses the account SID");
  const form = new URLSearchParams(seen.init.body);
  eq([form.get("To"), form.get("From")], ["+447700900123", "+447700900000"], "Twilio To/From are set");
  ok(form.get("Body").includes("482913") && /never share/i.test(form.get("Body")), "the text carries the code and a do-not-share warning");
  ok(seen.init.headers.Authorization === "Basic " + Buffer.from(`${sid}:tok`).toString("base64"), "Twilio uses HTTP Basic auth");

  const rejected = createSmsAdapter("twilio", { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: "tok", TWILIO_MESSAGING_SERVICE_SID: "MG1" }, async () => json({ message: "bad number" }, 400));
  eq(await rejected.sendOtp({ toE164: "+447700900123", code: "111111", expiresAt }), { accepted: false, reason: "rejected" }, "a 4xx is a rejection, not a silent success");

  const msg91 = createSmsAdapter("MSG91", { MSG91_AUTH_KEY: "key", MSG91_OTP_TEMPLATE_ID: "tpl1" }, async (url, init) => { seen = { url, init }; return json({ type: "success", request_id: "req9" }); });
  eq(await msg91.sendOtp({ toE164: "+919876543210", code: "654321", expiresAt }), { accepted: true, providerMessageId: "req9" }, "MSG91 success is reported");
  const q = new URL(seen.url).searchParams;
  eq([new URL(seen.url).origin + new URL(seen.url).pathname, q.get("mobile"), q.get("otp"), q.get("template_id"), q.get("otp_expiry")],
    ["https://control.msg91.com/api/v5/otp", "919876543210", "654321", "tpl1", "5"], "MSG91 gets our own code, the template and the number without '+'");
  ok(seen.init.headers.authkey === "key", "MSG91 auth key travels in a header, not the URL");
  const soft = createSmsAdapter("msg91", { MSG91_AUTH_KEY: "key", MSG91_OTP_TEMPLATE_ID: "tpl1" }, async () => json({ type: "error", message: "template" }));
  eq(await soft.sendOtp({ toE164: "+919876543210", code: "654321", expiresAt }), { accepted: false, reason: "rejected" }, "MSG91 200-with-error is not treated as sent");

  const selection = read("lib/smsProvider.ts");
  ok(/if \(isSmsSandboxEnabled\(\)\) return sandboxSmsProvider;\s+return createSmsAdapter\(route\.providerName\);/.test(selection), "route selection: guarded sandbox first, then the named real carrier, else null");
  ok(/DEPLOYMENT_ENVIRONMENT[^\n]*"production"\) return false/.test(selection), "the sandbox can never be selected in production");
}

// ── 3. Stripe: config, checkout request, signature verification, event mapping ──
const WHSEC = "whsec_" + "A1b2C3d4".repeat(4);
const SK_TEST = "sk_test_" + "a1B2c3D4".repeat(3);
const SK_LIVE = "sk_live_" + "a1B2c3D4".repeat(3);
{
  eq(getStripeConfig({}), null, "no keys, no Stripe");
  eq(getStripeConfig({ STRIPE_SECRET_KEY: SK_TEST }), null, "the API key alone is not enough: webhooks could not be verified");
  eq(getStripeConfig({ STRIPE_SECRET_KEY: "pk_test_" + "a".repeat(24), STRIPE_WEBHOOK_SECRET: WHSEC }), null, "a publishable key is refused");
  const cfg = getStripeConfig({ STRIPE_SECRET_KEY: SK_TEST, STRIPE_WEBHOOK_SECRET: WHSEC });
  eq([cfg.liveMode, getStripeConfig({ STRIPE_SECRET_KEY: SK_LIVE, STRIPE_WEBHOOK_SECRET: WHSEC }).liveMode], [false, true], "live/test mode comes from the key");
  ok(subscriptionCheckoutConnected({}) === false && subscriptionCheckoutConnected({ STRIPE_SECRET_KEY: SK_TEST, STRIPE_WEBHOOK_SECRET: WHSEC }) === true, "checkout is 'connected' only when fully configured");
  ok(PAYMENT_PROVIDER_CONNECTED === false, "job money between poster and driver is never processed");

  let seen = null;
  const request = { paymentId: "pay_1", accountId: "acc_1", planKey: "poster", productName: "Plan", amountMinorUnits: 1299, currency: "GBP", idempotencyKey: "p2d-checkout-pay_1", successUrl: "https://app.example/settings?payment=processing", cancelUrl: "https://app.example/settings?payment=cancelled" };
  const created = await createStripeCheckout(cfg, request, async (url, init) => { seen = { url, init }; return json({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1", expires_at: 1_900_000_000 }); });
  eq([created.ok, created.providerCheckoutId, created.redirectUrl], [true, "cs_test_1", "https://checkout.stripe.com/c/pay/cs_test_1"], "checkout session is returned");
  const form = new URLSearchParams(seen.init.body);
  eq([form.get("mode"), form.get("line_items[0][price_data][unit_amount]"), form.get("line_items[0][price_data][currency]"), form.get("metadata[paymentId]"), form.get("client_reference_id")],
    ["payment", "1299", "gbp", "pay_1", "pay_1"], "amount, currency and our payment id come from the server-side request");
  eq([seen.init.headers["Idempotency-Key"], seen.init.headers.Authorization], ["p2d-checkout-pay_1", `Bearer ${SK_TEST}`], "checkout creation is idempotent and authenticated");
  eq(await createStripeCheckout(cfg, { ...request, amountMinorUnits: 0 }, async () => { throw new Error("must not be called"); }), { ok: false, reason: "rejected" }, "a zero amount never reaches the provider");
  eq(await createStripeCheckout(cfg, request, async () => json({ id: "cs", url: "http://evil.example" })), { ok: false, reason: "temporarily_unavailable" }, "a non-https redirect is refused");
  eq(await createStripeCheckout(cfg, request, async () => json({ error: {} }, 402)), { ok: false, reason: "rejected" }, "provider refusal is surfaced as a failure");

  const now = 1_800_000_000;
  const paidBody = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_test_1", payment_status: "paid", amount_total: 1299, currency: "gbp", payment_intent: "pi_1", client_reference_id: "pay_1", metadata: { paymentId: "pay_1", accountId: "acc_1" } } } });
  const sig = signStripePayload(paidBody, WHSEC, now);
  ok(verifyStripeSignature(paidBody, sig, WHSEC, now), "a correctly signed payload verifies");
  ok(!verifyStripeSignature(paidBody.replace("1299", "1"), sig, WHSEC, now), "a tampered body fails");
  ok(!verifyStripeSignature(paidBody, sig, "whsec_" + "Z".repeat(32), now), "the wrong secret fails");
  ok(!verifyStripeSignature(paidBody, sig, WHSEC, now + 301), "a replay older than 5 minutes fails");
  ok(!verifyStripeSignature(paidBody, null, WHSEC, now) && !verifyStripeSignature(paidBody, "t=abc,v1=zz", WHSEC, now) && !verifyStripeSignature(paidBody, `t=${now}`, WHSEC, now), "missing or malformed headers fail");
  ok(verifyStripeSignature(paidBody, `t=${now},v1=${"0".repeat(64)},${sig.split(",")[1]},v0=ignored`, WHSEC, now), "any matching v1 is accepted (secret rotation); other schemes are ignored");

  eq(parseStripeWebhook(paidBody, "t=1,v1=" + "0".repeat(64), cfg, now), null, "an unsigned/forged event is never parsed");
  eq(parseStripeWebhook(paidBody, sig, cfg, now), { kind: "paid", eventId: "evt_1", paymentId: "pay_1", accountId: "acc_1", amountMinorUnits: 1299, currency: "GBP", providerPaymentId: "pi_1", providerCheckoutId: "cs_test_1", liveMode: false }, "a paid session maps to a bound 'paid' event");

  const sign = (obj) => { const body = JSON.stringify(obj); return [body, signStripePayload(body, WHSEC, now)]; };
  let [b, s] = sign({ id: "evt_2", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_2", payment_status: "unpaid", amount_total: 1299, currency: "gbp", payment_intent: "pi_2", metadata: { paymentId: "pay_2" } } } });
  eq(parseStripeWebhook(b, s, cfg, now).kind, "ignored", "a completed-but-unpaid session grants nothing");
  [b, s] = sign({ id: "evt_3", type: "checkout.session.expired", livemode: false, data: { object: { id: "cs_3", metadata: { paymentId: "pay_3" } } } });
  eq(parseStripeWebhook(b, s, cfg, now), { kind: "expired", eventId: "evt_3", paymentId: "pay_3", providerCheckoutId: "cs_3", liveMode: false }, "expiry is mapped");
  [b, s] = sign({ id: "evt_4", type: "charge.refunded", livemode: false, data: { object: { id: "ch_1", payment_intent: "pi_1", amount_refunded: 1299, refunded: true, currency: "gbp" } } });
  eq(parseStripeWebhook(b, s, cfg, now), { kind: "refunded", eventId: "evt_4", providerPaymentId: "pi_1", amountRefundedMinorUnits: 1299, fullyRefunded: true, currency: "GBP", liveMode: false }, "refunds are mapped");
  [b, s] = sign({ id: "evt_5", type: "customer.created", livemode: false, data: { object: { id: "cus_1" } } });
  eq(parseStripeWebhook(b, s, cfg, now).kind, "ignored", "unrelated event types are acknowledged and ignored");
  [b, s] = sign({ id: "evt_6", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_6", payment_status: "paid", amount_total: 1299, currency: "gbp", metadata: {} } } });
  eq(parseStripeWebhook(b, s, cfg, now), null, "a paid event that cannot be tied to one of our payments is rejected");
}

// ── 4. Routes and the ledger are wired the safe way (source-level) ──
{
  const hook = read("app/api/subscription/webhook/stripe/route.ts");
  ok(/await request\.text\(\)/.test(hook) && !/request\.json\(\)/.test(hook), "the webhook verifies the raw body, never re-serialised JSON");
  ok(/parseStripeWebhook\(rawBody, request\.headers\.get\("stripe-signature"\), config\)/.test(hook), "signature check precedes any state change");
  ok(hook.indexOf("parseStripeWebhook(") < hook.indexOf("applyVerifiedProviderEvent("), "nothing is applied before verification");
  ok(/event\.liveMode !== config\.liveMode/.test(hook), "test-mode events cannot change a live deployment (and the reverse)");
  ok(/status: 503/.test(hook) && /status: 400/.test(hook) && /status: 413/.test(hook), "unconfigured, forged and oversized requests are refused");
  ok(!/getServerSession/.test(hook), "the webhook does not depend on a browser session");

  const legacy = read("app/api/subscription/webhook/route.ts");
  ok(/DEPLOYMENT_ENVIRONMENT[\s\S]{0,80}"production"[\s\S]{0,120}status: 404/.test(legacy), "the shared-secret test hook is switched off in production");

  const sub = read("lib/subscription.ts");
  const apply = sub.slice(sub.indexOf("export async function applyVerifiedProviderEvent"));
  ok(/provider_eventId: \{ provider, eventId: event\.eventId \}/.test(apply) && /return "duplicate"/.test(apply), "redelivered events are detected through the unique ledger key");
  ok(/expectedAmountMinorUnits: event\.amountMinorUnits/.test(apply) && /expectedCurrency: event\.currency/.test(apply), "the paid amount and currency must equal the server-calculated payment");
  ok(/status: "pending"/.test(apply.slice(apply.indexOf('event.kind === "expired"'))), "only a pending payment can expire or fail");
  ok(/event\.amountRefundedMinorUnits < payment\.amountMinorUnits\) return "recorded"/.test(apply), "a partial refund does not remove access");
  ok(/subscriptionEndsAt\.getTime\(\) === payment\.accessEndsAt\.getTime\(\)/.test(apply), "a refund takes back only the access that payment added");
  const schema = read("prisma/schema.prisma");
  ok(/model PaymentProviderEvent \{[\s\S]*?@@unique\(\[provider, eventId\]\)/.test(schema), "the ledger enforces one row per provider event");
  ok(/PaymentProviderEvent_provider_eventId_key/.test(read("prisma/migrations/20261114060000_payment_provider_events/migration.sql")), "the migration creates the unique index");

  const create = read("app/api/subscription/create-payment/route.ts");
  ok(/idempotencyKey: `p2d-checkout-\$\{payment\.id\}`/.test(create), "one payment maps to one checkout, however many times Pay is pressed");
  ok(!/amountMinorUnits: (?:body|req|request)\b/.test(create) && !/readBoundedJson|request\.json|req\.json/.test(create), "the amount never comes from the browser");
  ok(/charged: false/.test(create), "starting checkout never claims a charge");
  ok(/reusable/.test(sub) && /PENDING_PAYMENT_REUSE_MS/.test(sub), "an open pending payment is reused instead of duplicated");
}

// ── 5. Readiness report and production fail-closed rules ──
{
  const base = { DEPLOYMENT_ENVIRONMENT: "production", NEXTAUTH_SECRET: "s".repeat(32), NEXTAUTH_URL: "https://app.example", POST2DRIVE_OTP_SECRET: "o".repeat(32), POST2DRIVE_LICENCE_HASH_SECRET: "l".repeat(32), DATABASE_URL: "postgresql://x", RESEND_API_KEY: "re_x", EMAIL_FROM: "Post2Drive <no-reply@example.com>", EMAIL_VERIFICATION_ENABLED: "true", POST2DRIVE_SMS_UK_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32), TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "Post2Drive" };
  eq(productionConfigProblems(base), [], "a complete production configuration has no problems (payments may stay off)");
  eq(getProviderReadiness(base), { environment: "production", email: "ready", smsUk: "ready", smsIndia: "not_configured", smsGlobal: "not_configured", payments: "not_configured", paymentsMode: null }, "readiness reports states only");
  ok(!JSON.stringify(getProviderReadiness({ ...base, STRIPE_SECRET_KEY: SK_LIVE, STRIPE_WEBHOOK_SECRET: WHSEC })).includes("sk_live"), "readiness never contains a credential");
  const problems = (extra) => productionConfigProblems({ ...base, ...extra }).join(" | ");
  ok(/QA_MODE/.test(problems({ POST2DRIVE_QA_MODE: "true" })), "QA mode blocks production");
  ok(/STAGING_TEST_PHONE/.test(problems({ POST2DRIVE_STAGING_TEST_PHONE_VERIFICATION: "true" })), "the SMS test outbox blocks production");
  ok(/test keys/.test(problems({ STRIPE_SECRET_KEY: SK_TEST, STRIPE_WEBHOOK_SECRET: WHSEC })), "Stripe test keys block production");
  ok(/partly configured/.test(problems({ STRIPE_SECRET_KEY: SK_LIVE })), "half-configured Stripe blocks production");
  ok(/NEXTAUTH_URL/.test(problems({ NEXTAUTH_URL: "http://app.example" })), "plain http blocks production");
  ok(/EMAIL_VERIFICATION_ENABLED/.test(problems({ EMAIL_VERIFICATION_ENABLED: "false" })), "email verification must be on in production");
  ok(/No SMS carrier/.test(problems({ POST2DRIVE_SMS_UK_PROVIDER: "" })), "at least one SMS carrier is required in production");
  ok(/missing or unknown/.test(problems({ POST2DRIVE_SMS_INDIA_PROVIDER: "msg91" })), "a named carrier without credentials blocks production");

  const boot = read("instrumentation.ts");
  ok(/isProductionEnvironment\(process\.env\)[\s\S]*throw new Error\("Production configuration is invalid\."\)/.test(boot), "production refuses to start when misconfigured");
  ok(/NEXT_RUNTIME !== "nodejs"/.test(boot), "startup checks run only in the Node.js server runtime");
}

console.log(`Provider adapters contract passed: ${checks} checks.`);
