import type { DeliveryResult, TransactionalEmailMessage, TransactionalEmailProvider } from "@/lib/providerContracts";

/**
 * Resend adapter. Configuration is read only when sending; no credentials are
 * embedded in source. Callers may inject a provider in tests. No mock fallback
 * is ever selected implicitly.
 */
export function getTransactionalEmailProvider(): TransactionalEmailProvider | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;

  return {
    providerId: "resend",
    async send(message: TransactionalEmailMessage): Promise<DeliveryResult> {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });

      if (!response.ok) {
        // Never log provider response bodies: they can contain personal data.
        console.error("Transactional email provider rejected delivery.", {
          provider: "resend",
          status: response.status,
        });
        return { accepted: false, reason: "temporarily_unavailable" };
      }

      let providerMessageId = "accepted";
      try {
        const payload = await response.json() as { id?: unknown };
        if (typeof payload.id === "string" && payload.id.length <= 200) {
          providerMessageId = payload.id;
        }
      } catch {
        // A successful provider response is accepted even if it omits a parseable id.
      }
      return { accepted: true, providerMessageId };
    },
  };
}

export async function deliverTransactionalEmail(
  message: TransactionalEmailMessage,
  provider: TransactionalEmailProvider | null = getTransactionalEmailProvider(),
): Promise<DeliveryResult> {
  if (!provider) return { accepted: false, reason: "not_configured" };
  try {
    return await provider.send(message);
  } catch {
    // Do not leak provider exceptions, addresses, message bodies, or tokens.
    return { accepted: false, reason: "temporarily_unavailable" };
  }
}
