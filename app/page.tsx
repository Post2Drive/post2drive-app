import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { ServiceTileIcon } from "@/components/service-tiles";

/** First screen: log in or create an account. Signed-in users go straight to Home. */
export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");

  return (
    <main className="service-home service-entry">
      <header className="service-home-welcome">
        <h1>Post2Drive</h1>
        <p>Freight and courier marketplace for businesses and drivers.</p>
      </header>
      <nav aria-label="Get started">
        <ul className="service-tiles">
          <li>
            <Link className="service-tile" href="/login">
              <ServiceTileIcon icon="account" />
              <span className="service-tile-label">Log in</span>
              <span className="service-tile-hint">I already have an account</span>
            </Link>
          </li>
          <li>
            <Link className="service-tile" href="/signup">
              <ServiceTileIcon icon="post" />
              <span className="service-tile-label">Create account</span>
              <span className="service-tile-hint">New business or driver</span>
            </Link>
          </li>
        </ul>
      </nav>
      <footer className="home-utility"><Link href="/pricing">Pricing</Link><span aria-hidden="true">·</span><Link href="/terms">Terms</Link><span aria-hidden="true">·</span><Link href="/privacy">Privacy</Link></footer>
    </main>
  );
}
