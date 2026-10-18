"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatMarketDate, formatMarketCurrency } from "@/lib/localisation";

type PaymentJob = {
  id: string;
  pickup: string;
  dropoff: string;
  price: number;
  currency: string;
  createdAt: string;
  paidMarkedAt?: string | null;
  receivedConfirmedAt?: string | null;
  acceptedBy?: {
    companyName?: string | null;
    displayId?: string | null;
  } | null;
  poster?: {
    companyName?: string | null;
    displayId?: string | null;
  } | null;
};

type PaymentData = {
  currency: string;
  country: string;
  asPoster: PaymentJob[];
  asDriver: PaymentJob[];

  posterSummary: {
    jobsDone: number;
    totalValue: number;
    markedPaid: number;
    awaitingPayment: number;
    receiptConfirmed: number;
    jobsPaid: number;
    jobsPaymentPending: number;
  };

  driverSummary: {
    jobsDone: number;
    totalReceivable: number;
    markedPaidByPoster: number;
    confirmedReceived: number;
    awaitingPaymentFromPoster: number;
    awaitingReceiptConfirmation: number;
    jobsReceived: number;
    jobsAwaitingReceipt: number;
  };
};

function money(value: number, currency: string, country: string) {
  return formatMarketCurrency(Number(value || 0), { country, currency });
}

function date(value: string | null | undefined, country: string, currency: string) {
  if (!value) return "";
  return formatMarketDate(value, { country, currency });
}

export default function PaymentsPage() {
  const [data, setData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      setError("");

      const response = await fetch("/api/payments", {
        cache: "no-store",
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result?.error || "Could not load payments.",
        );
      }

      setData(result);
    } catch (err: any) {
      setError(
        err?.message || "Could not load payment information.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markPaid(jobId: string) {
    setBusy(jobId);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/jobs/${jobId}/payment/mark-paid`,
        {
          method: "POST",
        },
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result?.error || "Could not mark payment as paid.",
        );
      }

      setMessage(
        "Payment marked as paid. The platform does not verify the actual transfer.",
      );

      await load();
    } catch (err: any) {
      setError(err?.message || "Could not mark payment as paid.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmReceived(jobId: string) {
    setBusy(jobId);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/jobs/${jobId}/payment/confirm-received`,
        {
          method: "POST",
        },
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "Could not confirm payment received.",
        );
      }

      setMessage(
        "Payment receipt confirmed for reconciliation.",
      );

      await load();
    } catch (err: any) {
      setError(
        err?.message || "Could not confirm payment received.",
      );
    } finally {
      setBusy(null);
    }
  }

  const totalJobs = useMemo(() => {
    if (!data) return 0;

    return Math.max(
      data.posterSummary.jobsDone,
      data.driverSummary.jobsDone,
    );
  }, [data]);

  if (loading) {
    return (
      <main style={pageStyle}>
        <p>Loading payments...</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={pageStyle}>
        <Link href="/jobs" className="button-link button-link-secondary">← Back to jobs</Link>

        <h1>Payments</h1>

        <div style={errorStyle}>
          {error || "Payment information is unavailable."}
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <Link href="/jobs" className="button-link button-link-secondary">← Back to jobs</Link>

          <h1 style={{ marginBottom: 6 }}>Payments</h1>

          <p style={{ color: "var(--color-muted)", marginTop: 0 }}>
            Payment tracking only. The platform does not process,
            hold, verify or guarantee money transfers.
          </p>
        </div>

        <button
          onClick={load}
          style={secondaryButton}
        >
          Refresh
        </button>
      </div>

      {message && (
        <div style={successStyle}>
          {message}
        </div>
      )}

      {error && (
        <div style={errorStyle}>
          {error}
        </div>
      )}

      <section style={summaryGrid}>
        <SummaryCard
          label="Jobs done"
          value={String(totalJobs)}
        />

        <SummaryCard
          label="Poster payments pending"
          value={String(
            data.posterSummary.jobsPaymentPending,
          )}
          subtext={money(data.posterSummary.awaitingPayment, data.currency, data.country)}
        />

        <SummaryCard
          label="Driver payments received"
          value={String(data.driverSummary.jobsReceived)}
          subtext={money(data.driverSummary.confirmedReceived, data.currency, data.country)}
        />

        <SummaryCard
          label="Awaiting driver confirmation"
          value={String(
            data.driverSummary.jobsAwaitingReceipt,
          )}
          subtext={money(data.driverSummary.awaitingReceiptConfirmation, data.currency, data.country)}
        />
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionHeading}>As poster</h2>

        <div style={summaryLine}>
          <span>
            Jobs done: <strong>{data.posterSummary.jobsDone}</strong>
          </span>

          <span>
            Total value:{" "}
            <strong>
              {money(data.posterSummary.totalValue, data.currency, data.country)}
            </strong>
          </span>

          <span>
            Marked paid:{" "}
            <strong>
              {money(data.posterSummary.markedPaid, data.currency, data.country)}
            </strong>
          </span>

          <span>
            Payment pending:{" "}
            <strong>
              {money(data.posterSummary.awaitingPayment, data.currency, data.country)}
            </strong>
          </span>
        </div>

        {data.asPoster.length === 0 ? (
          <Empty text="No completed jobs as poster yet." />
        ) : (
          <div style={listStyle}>
            {data.asPoster.map((job) => (
              <div key={job.id} style={jobCard}>
                <div style={jobTop}>
                  <div>
                    <strong>
                      {job.pickup} → {job.dropoff}
                    </strong>

                    <div style={muted}>
                      Completed job · {date(job.createdAt, data.country, data.currency)}
                    </div>
                  </div>

                  <strong>
                    {money(job.price, job.currency, data.country)}
                  </strong>
                </div>

                <div style={muted}>
                  Driver:{" "}
                  {job.acceptedBy?.companyName ||
                    job.acceptedBy?.displayId ||
                    "Assigned driver"}
                </div>

                <div style={statusRow}>
                  {job.paidMarkedAt ? (
                    <span style={paidBadge}>
                      ✓ Marked paid ·{" "}
                      {date(job.paidMarkedAt, data.country, data.currency)}
                    </span>
                  ) : (
                    <button
                      onClick={() => markPaid(job.id)}
                      disabled={busy === job.id}
                      style={primaryButton}
                    >
                      {busy === job.id
                        ? "Updating..."
                        : "Mark as paid"}
                    </button>
                  )}

                  {job.receivedConfirmedAt ? (
                    <span style={receivedBadge}>
                      ✓ Driver confirmed receipt
                    </span>
                  ) : (
                    <span style={pendingBadge}>
                      Driver receipt not confirmed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionHeading}>As driver</h2>

        <div style={summaryLine}>
          <span>
            Jobs done: <strong>{data.driverSummary.jobsDone}</strong>
          </span>

          <span>
            Total receivable:{" "}
            <strong>
              {money(data.driverSummary.totalReceivable, data.currency, data.country)}
            </strong>
          </span>

          <span>
            Received confirmed:{" "}
            <strong>
              {money(data.driverSummary.confirmedReceived, data.currency, data.country)}
            </strong>
          </span>

          <span>
            Awaiting poster payment:{" "}
            <strong>
              {money(data.driverSummary.awaitingPaymentFromPoster, data.currency, data.country)}
            </strong>
          </span>
        </div>

        {data.asDriver.length === 0 ? (
          <Empty text="No completed jobs as driver yet." />
        ) : (
          <div style={listStyle}>
            {data.asDriver.map((job) => (
              <div key={job.id} style={jobCard}>
                <div style={jobTop}>
                  <div>
                    <strong>
                      {job.pickup} → {job.dropoff}
                    </strong>

                    <div style={muted}>
                      Completed job · {date(job.createdAt, data.country, data.currency)}
                    </div>
                  </div>

                  <strong>
                    {money(job.price, job.currency, data.country)}
                  </strong>
                </div>

                <div style={muted}>
                  Poster:{" "}
                  {job.poster?.companyName ||
                    job.poster?.displayId ||
                    "Poster"}
                </div>

                <div style={statusRow}>
                  {job.paidMarkedAt ? (
                    <span style={paidBadge}>
                      ✓ Poster marked paid ·{" "}
                      {date(job.paidMarkedAt, data.country, data.currency)}
                    </span>
                  ) : (
                    <span style={pendingBadge}>
                      Payment not yet marked paid
                    </span>
                  )}

                  {job.receivedConfirmedAt ? (
                    <span style={receivedBadge}>
                      ✓ You confirmed receipt ·{" "}
                      {date(job.receivedConfirmedAt, data.country, data.currency)}
                    </span>
                  ) : (
                    <button
                      onClick={() => confirmReceived(job.id)}
                      disabled={
                        busy === job.id ||
                        !job.paidMarkedAt
                      }
                      style={{
                        ...primaryButton,
                        opacity: !job.paidMarkedAt ? 0.5 : 1,
                      }}
                      title={
                        !job.paidMarkedAt
                          ? "The poster must first mark the payment as paid."
                          : ""
                      }
                    >
                      {busy === job.id
                        ? "Updating..."
                        : "Confirm received"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div style={summaryCard}>
      <div style={muted}>{label}</div>
      <div
        style={{
          fontSize: 25,
          fontWeight: 700,
          marginTop: 5,
        }}
      >
        {value}
      </div>

      {subtext && (
        <div
          style={{
            color: "var(--color-muted)",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          {subtext}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 20,
        color: "var(--color-muted)",
        border: "1px dashed var(--color-border)",
        borderRadius: 8,
        marginTop: 12,
      }}
    >
      {text}
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 1000,
  margin: "0 auto",
  padding: "24px 16px 60px",
  fontFamily: "Arial, sans-serif",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
  margin: "22px 0",
};

const summaryCard: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: 16,
  background: "var(--color-surface)",
};

const sectionStyle: React.CSSProperties = {
  marginTop: 22,
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  padding: 18,
  background: "var(--color-surface)",
};

const sectionHeading: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 19,
};

const summaryLine: React.CSSProperties = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  color: "var(--color-text)",
  fontSize: 14,
  paddingBottom: 14,
  borderBottom: "1px solid var(--color-border)",
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 14,
};

const jobCard: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 9,
  padding: 14,
};

const jobTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const muted: React.CSSProperties = {
  color: "var(--color-muted)",
  fontSize: 13,
  marginTop: 5,
};

const statusRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  marginTop: 12,
};

const primaryButton: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid var(--color-primary-action)",
  borderRadius: 7,
  background: "var(--color-primary-action)",
  color: "#FFFFFF",
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 7,
  background: "var(--color-surface)",
  color: "var(--color-text)",
  cursor: "pointer",
};

const paidBadge: React.CSSProperties = {
  padding: "6px 9px",
  borderRadius: 12,
  background: "var(--color-positive-soft)",
  color: "var(--color-positive)",
  fontSize: 13,
};

const receivedBadge: React.CSSProperties = {
  padding: "6px 9px",
  borderRadius: 12,
  background: "var(--color-positive-soft)",
  color: "var(--color-positive)",
  fontSize: 13,
};

const pendingBadge: React.CSSProperties = {
  padding: "6px 9px",
  borderRadius: 8,
  background: "#FFFFFF",
  border: "1px solid var(--color-warning)",
  borderLeft: "4px solid var(--color-warning)",
  color: "var(--color-text)",
  fontSize: 13,
};

const successStyle: React.CSSProperties = {
  padding: 11,
  marginTop: 14,
  borderRadius: 8,
  background: "var(--color-positive-soft)",
  border: "1px solid var(--color-positive)",
  color: "var(--color-positive)",
};

const errorStyle: React.CSSProperties = {
  padding: 11,
  marginTop: 14,
  borderRadius: 8,
  background: "var(--color-danger-soft)",
  border: "1px solid var(--color-danger)",
  color: "var(--color-danger)",
};