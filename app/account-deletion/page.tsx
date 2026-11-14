import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Delete your account – Post2Drive",
  description: "How to delete your Post2Drive account and what happens to your data.",
};

export default function AccountDeletionPage() {
  return <main className="legal-page">
    <p><Link href="/">← Back</Link></p>
    <h1>Delete your Post2Drive account</h1>
    <p>You can delete your account yourself at any time, in the app or on the website. You do not need to contact us first.</p>

    <h2>How to delete</h2>
    <ol>
      <li>Sign in to Post2Drive.</li>
      <li>Open <Link href="/settings">Account settings</Link>.</li>
      <li>Go to <strong>Delete account</strong> at the bottom of the page.</li>
      <li>Enter your password, type DELETE to confirm, and submit.</li>
    </ol>
    <p>Deletion takes effect immediately. You are signed out on every device and the account cannot be restored.</p>

    <h2>What is deleted</h2>
    <p>Your personal account details are anonymised: name, email address, phone number and password. Sign-in is disabled, and verification and reset codes are removed.</p>

    <h2>What is kept</h2>
    <p>Limited job, incident, payment-status and audit records may be kept without your personal account details. They protect the other businesses you dealt with, allow disputes to be investigated, and meet legal obligations. See the <Link href="/privacy">Privacy Notice</Link> for details.</p>

    <h2>If you cannot sign in</h2>
    <p>Use <Link href="/forgot-password">Forgot password</Link> to regain access and then delete the account as above. If that is not possible, contact Post2Drive support using the details in the <Link href="/privacy">Privacy Notice</Link> and we will verify that the account is yours before deleting it.</p>
  </main>;
}
