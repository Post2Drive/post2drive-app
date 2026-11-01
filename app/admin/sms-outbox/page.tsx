import { redirect } from "next/navigation";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { isSmsSandboxEnabled } from "@/lib/smsProvider";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "SMS test outbox · Post2Drive" };

/** Staging-only: shows codes the sandbox adapter would have texted. */
export default async function SmsOutboxPage() {
  if (!(await isTesterAdmin())) redirect("/dashboard");

  if (!isSmsSandboxEnabled()) {
    return (
      <main className="legal-page">
        <h1>SMS test outbox</h1>
        <p>Test mode is off, so codes are not stored here. Real text messages are used instead, once a provider is connected.</p>
      </main>
    );
  }

  const messages = await prisma.smsSandboxMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, phoneMasked: true, code: true, createdAt: true, expiresAt: true },
  });
  const now = Date.now();

  return (
    <main className="legal-page sms-outbox">
      <h1>SMS test outbox</h1>
      <p>Staging test mode: no text messages are sent. These are the codes that would have been sent, newest first.</p>
      {messages.length === 0 ? (
        <p>No codes yet. Ask a tester to tap “Send code” on their Account page.</p>
      ) : (
        <div className="legal-table-wrap">
          <table>
            <thead><tr><th scope="col">Phone</th><th scope="col">Code</th><th scope="col">Sent</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  <td>{m.phoneMasked}</td>
                  <td><strong style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.15em" }}>{m.code}</strong></td>
                  <td>{m.createdAt.toISOString().slice(11, 16)} UTC</td>
                  <td>{m.expiresAt.getTime() > now ? "Valid" : "Expired"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
