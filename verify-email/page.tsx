import Link from "next/link";
import VerifyEmailForm from "./verify-email-form";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: "24px 20px" }}>
      <h1>Verify your email</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Confirm that you own the email address connected to your Post2Drive account.
      </p>
      {token ? (
        <VerifyEmailForm token={token} />
      ) : (
        <p>This link is missing its verification token. Open the full link from your email or request a new one from the login page.</p>
      )}
      <p style={{ marginTop: 24 }}><Link href="/login">← Back to login</Link></p>
    </main>
  );
}
