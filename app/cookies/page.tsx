import type { Metadata } from "next";
import Link from "next/link";
import { CookieSettingsButton } from "@/components/consent-banner";

export const metadata: Metadata = {
  title: "Cookie Policy – Post2Drive",
  description: "How Post2Drive uses cookies and how to manage your preferences.",
};

const essential = [
  { name: "next-auth.session-token (or __Secure- prefixed)", purpose: "Keeps you signed in.", lasts: "Until you log out, up to 30 days" },
  { name: "next-auth.csrf-token (or __Host- prefixed)", purpose: "Protects sign-in forms from cross-site request forgery.", lasts: "Browser session" },
  { name: "next-auth.callback-url (or __Secure- prefixed)", purpose: "Returns you to the right page after signing in.", lasts: "Browser session" },
  { name: "p2d_consent", purpose: "Remembers your cookie choice so we do not ask again.", lasts: "180 days" },
];

export default function CookiesPage() {
  return (
    <main className="legal-page">
      <p><Link href="/">← Back</Link></p>
      <h1>Cookies and tracking</h1>
      <p><strong>Version:</strong> 1 November 2026 · Draft for product testing</p>
      <p>
        Post2Drive uses only the cookies needed to run the service. We do not use advertising cookies,
        and we do not sell or share browsing data. Optional analytics stays off unless you choose
        &ldquo;Allow analytics&rdquo;, and you can change your choice at any time.
      </p>
      <p><CookieSettingsButton className="button-link button-link-secondary" /></p>

      <h2>Essential cookies</h2>
      <p>These are strictly necessary, so they do not need consent. Blocking them will stop sign-in working.</p>
      <div className="legal-table-wrap">
        <table>
          <thead><tr><th scope="col">Cookie</th><th scope="col">Purpose</th><th scope="col">How long</th></tr></thead>
          <tbody>
            {essential.map((row) => (
              <tr key={row.name}><td>{row.name}</td><td>{row.purpose}</td><td>{row.lasts}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Optional analytics</h2>
      <p>
        No analytics, session-replay or marketing tools are installed today. If we add one, it will be
        listed here before it goes live and will load only after you choose &ldquo;Allow analytics&rdquo;.
        Choosing &ldquo;Essential only&rdquo; keeps every optional tool switched off.
      </p>

      <h2>Feedback diagnostics</h2>
      <p>
        If you open the pilot feedback form, basic device details (screen size, browser and language) are
        held in your browser tab so they can be attached to your report. They are sent only if you submit
        the form, and cleared afterwards.
      </p>

      <h2>More information</h2>
      <p>See the <Link href="/privacy">Privacy Notice</Link> for how we use account data, and the <Link href="/terms">Terms of Service</Link>.</p>
    </main>
  );
}
