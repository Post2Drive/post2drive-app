import type { DeliveryResult, SmsOtpMessage, SmsOtpProvider } from "@/lib/providerContracts";
import { isStagingTestPhoneVerificationEnabled, maskPhone, type PhoneRouteResult } from "@/lib/phoneVerification";
import { prisma } from "@/lib/prisma";

/**
 * Staging-only adapter. It sends nothing: the code is written to a test
 * outbox that only administrators can read. It is selectable only when
 * POST2DRIVE_STAGING_TEST_PHONE_VERIFICATION=true AND the isolated staging QA
 * guard is on, and never when DEPLOYMENT_ENVIRONMENT is "production".
 */
export const sandboxSmsProvider: SmsOtpProvider = {
  providerId: "sandbox-outbox",
  async sendOtp(message: SmsOtpMessage): Promise<DeliveryResult> {
    const row = await prisma.smsSandboxMessage.create({
      data: { phoneMasked: maskPhone(message.toE164), code: message.code, expiresAt: message.expiresAt },
      select: { id: true },
    });
    return { accepted: true, providerMessageId: row.id };
  },
};

export function isSmsSandboxEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DEPLOYMENT_ENVIRONMENT?.trim().toLowerCase() === "production") return false;
  return isStagingTestPhoneVerificationEnabled();
}

/**
 * Pick the adapter for a phone route. Real carriers (for example MSG91 for
 * India, Twilio for the UK) are added here as they are integrated; until
 * then only the guarded sandbox can deliver, and every other case returns
 * null so callers fail closed with "not available yet".
 */
export function getSmsOtpProvider(route: PhoneRouteResult): SmsOtpProvider | null {
  if (!route.supported) return null;
  if (isSmsSandboxEnabled()) return sandboxSmsProvider;
  return null;
}
