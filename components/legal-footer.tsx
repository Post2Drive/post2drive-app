import Link from "next/link";
import { CookieSettingsButton } from "@/components/consent-banner";

export default function LegalFooter() {
  return (
    <footer className="legal-footer">
      <nav aria-label="Legal and pricing">
        <Link href="/pricing">Pricing</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/cookies">Cookies</Link>
        <CookieSettingsButton className="legal-footer-button" />
      </nav>
      <p>© {new Date().getFullYear()} Post2Drive</p>
    </footer>
  );
}
