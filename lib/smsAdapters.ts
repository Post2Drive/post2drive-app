import type { DeliveryResult, SmsOtpMessage, SmsOtpProvider } from "@/lib/providerContracts";
import { fetchWithRetry, type FetchLike } from "./httpRetry.ts";

/**
 * Real SMS carriers. Each adapter is built only from explicit credentials and
 * returns null when any are missing, so an unconfigured route fails closed.
 * The one-time code is generated, hashed and verified by Post2Drive
 * (lib/providerLifecycle.ts); carriers only deliver it. Codes, phone numbers
 * and provider response bodies are never logged.
 */
type Env = Record<string, string | undefined>;
const value = (env: Env, key: string) => env[key]?.trim() || "";

function minutesUntil(expiresAt: Date, now: number): number {
  return Math.max(1, Math.round((expiresAt.getTime() - now) / 60_000));
}

function otpText(message: SmsOtpMessage, now: number): string {
  return `Your Post2Drive code is ${message.code}. It expires in ${minutesUntil(message.expiresAt, now)} minutes. Never share it.`;
}

/** Twilio Programmable Messaging. Sender is a Messaging Service SID or a From number/alphanumeric ID. */
export function createTwilioSmsProvider(env: Env = process.env, fetchImpl?: FetchLike): SmsOtpProvider | null {
  const accountSid = value(env, "TWILIO_ACCOUNT_SID");
  const authToken = value(env, "TWILIO_AUTH_TOKEN");
  const messagingServiceSid = value(env, "TWILIO_MESSAGING_SERVICE_SID");
  const from = value(env, "TWILIO_FROM");
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !authToken || (!messagingServiceSid && !from)) return null;

  return {
    providerId: "twilio",
    async sendOtp(message: SmsOtpMessage): Promise<DeliveryResult> {
      const form = new URLSearchParams({ To: message.toE164, Body: otpText(message, Date.now()) });
      if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid); else form.set("From", from);
      const response = await fetchWithRetry(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
        },
        // Only "try later" statuses are repeated, so one request cannot become two texts.
        { retries: 1, retryOn: [429, 503], ...(fetchImpl ? { fetchImpl } : {}) },
      );
      if (!response.ok) {
        console.error("SMS provider rejected delivery.", { provider: "twilio", status: response.status });
        return { accepted: false, reason: response.status >= 500 || response.status === 429 ? "temporarily_unavailable" : "rejected" };
      }
      let providerMessageId = "accepted";
      try {
        const payload = await response.json() as { sid?: unknown };
        if (typeof payload.sid === "string" && payload.sid.length <= 64) providerMessageId = payload.sid;
      } catch { /* accepted without a parseable id */ }
      return { accepted: true, providerMessageId };
    },
  };
}

/**
 * MSG91 SendOTP v5 (India). Needs a DLT-approved OTP template; the template id
 * comes from the MSG91 panel. Our own code is passed in, so verification stays
 * in Post2Drive and MSG91's verify endpoint is not used.
 */
export function createMsg91SmsProvider(env: Env = process.env, fetchImpl?: FetchLike): SmsOtpProvider | null {
  const authKey = value(env, "MSG91_AUTH_KEY");
  const templateId = value(env, "MSG91_OTP_TEMPLATE_ID");
  if (!authKey || !templateId) return null;

  return {
    providerId: "msg91",
    async sendOtp(message: SmsOtpMessage): Promise<DeliveryResult> {
      const query = new URLSearchParams({
        template_id: templateId,
        mobile: message.toE164.replace(/^\+/, ""),
        otp: message.code,
        otp_expiry: String(minutesUntil(message.expiresAt, Date.now())),
      });
      const response = await fetchWithRetry(
        `https://control.msg91.com/api/v5/otp?${query.toString()}`,
        { method: "POST", headers: { authkey: authKey, Accept: "application/json", "Content-Type": "application/json" } },
        { retries: 1, retryOn: [429, 503], ...(fetchImpl ? { fetchImpl } : {}) },
      );
      if (!response.ok) {
        console.error("SMS provider rejected delivery.", { provider: "msg91", status: response.status });
        return { accepted: false, reason: response.status >= 500 || response.status === 429 ? "temporarily_unavailable" : "rejected" };
      }
      // MSG91 answers 200 with {"type":"error"} for bad templates or numbers.
      let payload: { type?: unknown; request_id?: unknown } = {};
      try { payload = await response.json() as typeof payload; } catch { /* treated as not accepted below */ }
      if (payload.type !== "success") {
        console.error("SMS provider rejected delivery.", { provider: "msg91", status: response.status });
        return { accepted: false, reason: "rejected" };
      }
      const id = typeof payload.request_id === "string" && payload.request_id.length <= 64 ? payload.request_id : "accepted";
      return { accepted: true, providerMessageId: id };
    },
  };
}

export const SMS_ADAPTERS = {
  twilio: createTwilioSmsProvider,
  msg91: createMsg91SmsProvider,
} as const;

export type SmsAdapterName = keyof typeof SMS_ADAPTERS;

export function isSmsAdapterName(name: string | null | undefined): name is SmsAdapterName {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(SMS_ADAPTERS, name.toLowerCase());
}

/** Build the adapter named by a route slot (POST2DRIVE_SMS_UK_PROVIDER etc.), or null. */
export function createSmsAdapter(name: string | null | undefined, env: Env = process.env, fetchImpl?: FetchLike): SmsOtpProvider | null {
  if (!isSmsAdapterName(name)) return null;
  return SMS_ADAPTERS[name.toLowerCase() as SmsAdapterName](env, fetchImpl);
}
