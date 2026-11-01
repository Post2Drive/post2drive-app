import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import LegalFooter from "@/components/legal-footer";

/** First screen. Signed-in users skip straight to their Home boxes. */
export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");

  return (
    <main className="landing">
      <header className="landing-bar">
        <span className="landing-brand">Post2Drive</span>
        <Link className="landing-bar-login" href="/login">Log in</Link>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <h1 id="landing-title">Loads and drivers, matched in one place.</h1>
          <p className="landing-lede">
            Businesses post delivery jobs. Couriers and hauliers pick them up. Both sides follow the job
            through to delivery.
          </p>
          <div className="landing-actions">
            <Link className="landing-button landing-button-primary" href="/signup">Create account</Link>
            <Link className="landing-button landing-button-secondary" href="/login">Log in</Link>
          </div>
          <p className="landing-note">Piloting in Manchester and Birmingham. Free early access in India.</p>
        </div>

        <figure className="load-ticket" aria-label="Example of a load listing">
          <figcaption className="load-ticket-tag">Example load</figcaption>
          <div className="load-ticket-route">
            <span className="load-ticket-stop">
              <span className="load-ticket-dot" aria-hidden="true" />
              <span><strong>Trafford Park</strong><small>Manchester</small></span>
            </span>
            <span className="load-ticket-line" aria-hidden="true" />
            <span className="load-ticket-stop">
              <span className="load-ticket-dot load-ticket-dot-end" aria-hidden="true" />
              <span><strong>Digbeth</strong><small>Birmingham</small></span>
            </span>
          </div>
          <dl className="load-ticket-facts">
            <div><dt>Vehicle</dt><dd>Luton van</dd></div>
            <div><dt>Load</dt><dd>4 pallets, 800 kg</dd></div>
            <div><dt>Collect</dt><dd>Tue, 08:00</dd></div>
          </dl>
          <div className="load-ticket-foot">
            <span>Fixed price</span>
            <strong>£240</strong>
          </div>
        </figure>
      </section>

      <section className="landing-steps" aria-labelledby="landing-steps-title">
        <h2 id="landing-steps-title">How a job moves</h2>
        <ol>
          <li><span className="landing-step-n" aria-hidden="true">1</span><div><h3>Post or find a load</h3><p>Add the route, vehicle and price, or browse loads in your market.</p></div></li>
          <li><span className="landing-step-n" aria-hidden="true">2</span><div><h3>Agree the job</h3><p>A driver accepts or bids. Contact details are shared only once you are matched.</p></div></li>
          <li><span className="landing-step-n" aria-hidden="true">3</span><div><h3>Deliver and confirm</h3><p>Pickup and delivery are confirmed by both sides, then you rate each other.</p></div></li>
        </ol>
      </section>

      <section className="landing-paths" aria-labelledby="landing-paths-title">
        <h2 id="landing-paths-title">Which side are you on?</h2>
        <div className="landing-path-grid">
          <Link className="landing-path" href="/signup">
            <h3>I have something to move</h3>
            <p>Post a delivery and choose from drivers who can take it.</p>
            <span className="landing-path-cta">Create a business account</span>
          </Link>
          <Link className="landing-path" href="/signup">
            <h3>I drive for work</h3>
            <p>See loads that fit your vehicle and your day.</p>
            <span className="landing-path-cta">Create a driver account</span>
          </Link>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
