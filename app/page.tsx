import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    return (
      <main
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "40px 20px 80px",
        }}
      >
        <section
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            padding: 28,
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h1 style={{ margin: 0, color: "var(--color-primary)" }}>
            Hello, {session.user.name?.trim() || "there"}
          </h1>

          <p style={{ color: "var(--color-muted)", marginTop: 8 }}>
            Welcome back to Post2Drive.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 24,
            }}
          >
            <Link
              href="/jobs/new"
              style={{
                background: "var(--color-primary-action)",
                color: "#fff",
                padding: "12px 18px",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Post a Job
            </Link>

            <Link
              href="/jobs"
              style={{
                background: "var(--color-surface)",
                color: "var(--color-primary-action)",
                border: "1px solid var(--color-border)",
                padding: "12px 18px",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Find Jobs
            </Link>

            <Link
              href="/vehicles"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--color-surface)",
                color: "var(--color-primary-action)",
                border: "1px solid var(--color-border)",
                padding: "12px 18px",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Vehicles &amp; Verification
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "calc(100vh - 64px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 760,
          textAlign: "center",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 16,
          padding: "48px 28px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            color: "var(--color-primary)",
          }}
        >
          Post2Drive
        </div>

        <h1
          style={{
            fontSize: 32,
            margin: "18px 0 10px",
            color: "var(--color-text)",
          }}
        >
          Freight & Courier Exchange
        </h1>

        <p
          style={{
            maxWidth: 580,
            margin: "0 auto",
            color: "var(--color-muted)",
            lineHeight: 1.6,
            fontSize: 17,
          }}
        >
          Post transport jobs, find available work, bid, accept and manage
          deliveries from one account.
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 28,
          }}
        >
          <Link
            href="/signup"
            style={{
              background: "var(--color-primary-action)",
              color: "#fff",
              padding: "12px 22px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Create an Account
          </Link>

          <Link
            href="/login"
            style={{
              background: "var(--color-surface)",
              color: "var(--color-primary-action)",
              border: "1px solid var(--color-border)",
              padding: "12px 22px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Log In
          </Link>
          <Link href="/admin-access" style={{ background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)", padding: "12px 22px", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>Admin</Link>
        </div>
      </section>
    </main>
  );
}
