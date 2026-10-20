import Link from "next/link";
import { redirect } from "next/navigation";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Answer = Record<string, unknown>;

const questions = [
  {
    key: "role",
    title: "Which best describes you?",
    options: {
      driver: "Driver / independent operator",
      fleet: "Fleet / transport operator",
      shipper: "Business arranging deliveries",
      broker: "Broker / logistics coordinator",
    },
  },
  {
    key: "currentDiscovery",
    title: "How do you find delivery work or drivers today?",
    options: {
      whatsapp: "WhatsApp / informal groups",
      calls: "Calls and personal contacts",
      platforms: "Online platforms",
      agents: "Agents / brokers",
      other: "Other",
    },
  },
  {
    key: "biggestChallenge",
    title: "What is your biggest challenge?",
    options: {
      "consistent-work": "Finding consistent work",
      "trusted-drivers": "Finding reliable drivers",
      "empty-miles": "Reducing empty miles",
      "price-transparency": "Pricing transparency",
      "payment-delays": "Payment delays",
      other: "Other",
    },
  },
  {
    key: "preferredAccess",
    title: "Which access model would you prefer?",
    options: {
      "free-trial-weekly": "Free trial, then weekly access",
      "free-trial-payg": "Free trial, then pay as you go",
      monthly: "Free trial, then monthly subscription",
      "longer-plan": "Free trial, then discounted longer-term plan",
    },
  },
] as const;

function summarize(answers: Answer[], key: string, options: Record<string, string>) {
  const counts = new Map<string, number>();
  for (const answer of answers) {
    const value = answer[key];
    if (typeof value === "string" && value.trim() && options[value]) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return Object.entries(options)
    .map(([value, label]) => {
      const count = counts.get(value) ?? 0;
      return { value, label, count, share: total ? Math.round((count / total) * 100) : 0 };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export default async function AdminResearchPage() {
  if (!(await isTesterAdmin())) redirect("/dashboard");

  // Select only optional survey JSON; never load names, email addresses or
  // company identifiers for this aggregate-only view. Exclude deleted accounts.
  const accounts = await prisma.account.findMany({
    where: { country: "IN", currency: "INR", deletionRequestedAt: null },
    select: { marketResearch: true },
  });

  const objects: Answer[] = accounts.flatMap(({ marketResearch }) => {
    if (!marketResearch || typeof marketResearch !== "object" || Array.isArray(marketResearch)) return [];
    return [marketResearch as Answer];
  });
  const answerKeys = questions.map((question) => question.key);
  const answers = objects.filter((response) =>
    answerKeys.some((key) => typeof response[key] === "string" && (response[key] as string).trim().length > 0)
  );

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 48px" }}>
      <p><Link href="/admin">← Administration</Link> · <Link href="/admin/performance">Performance dashboard</Link></p>
      <h1>India market research</h1>
      <p style={{ color: "var(--color-muted)", maxWidth: 820 }}>
        Aggregate optional product-research answers from India-market accounts. This view excludes accounts marked for deletion and does not display individual responses or account identifiers.
      </p>
      <section aria-labelledby="research-summary-heading" style={{ marginTop: 20, border: "1px solid var(--color-border)", borderRadius: 12, padding: 18, background: "var(--color-surface)" }}>
        <h2 id="research-summary-heading" style={{ marginTop: 0 }}>Response summary</h2>
        <p><strong>{answers.length}</strong> account{answers.length === 1 ? "" : "s"} provided at least one answer to the optional survey.</p>
        {answers.length === 0 && <p role="status">No optional market-research responses yet.</p>}
      </section>
      {answers.length > 0 && questions.map((question, index) => {
        const rows = summarize(answers, question.key, question.options as unknown as Record<string, string>);
        return (
          <section key={question.key} aria-labelledby={`research-question-${index + 1}`} style={{ marginTop: 18, border: "1px solid var(--color-border)", borderRadius: 12, padding: 18, background: "var(--color-surface)" }}>
            <h2 id={`research-question-${index + 1}`} style={{ marginTop: 0, fontSize: 19 }}>{question.title}</h2>
            {rows.length === 0 ? <p role="status">No answers to this question yet.</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <caption style={{ textAlign: "left", padding: 10, color: "var(--color-muted)" }}>Responses by answer for {question.title}</caption>
                <thead><tr><th scope="col" style={{ padding: 10 }}>Answer</th><th scope="col" style={{ padding: 10 }}>Responses</th><th scope="col" style={{ padding: 10 }}>Share of answers</th></tr></thead>
                <tbody>{rows.map((row) => (
                  <tr key={row.value}>
                    <td style={{ padding: 10, borderTop: "1px solid var(--color-border)" }}>{row.label}</td>
                    <td style={{ padding: 10, borderTop: "1px solid var(--color-border)" }}>{row.count}</td>
                    <td style={{ padding: 10, borderTop: "1px solid var(--color-border)" }}>{row.share}%</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
        );
      })}
    </main>
  );
}
