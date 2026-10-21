import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    return (
      <main id="main-content" tabIndex={-1} className="home-page home-page-authenticated">
        <section className="home-welcome">
          <p className="home-eyebrow">POST2DRIVE · YOUR WORKSPACE</p>
          <h1>Hello, {session.user.name?.trim() || "there"}.</h1>
          <p className="home-intro">Pick up where you left off. Post a delivery, find available work, or manage your vehicles and verification.</p>
          <div className="home-action-grid">
            <Link className="home-action-card home-action-primary" href="/jobs/new">
              <span className="home-action-label">FOR CUSTOMERS</span>
              <strong>Post a delivery job</strong>
              <span>Share the route and requirements to get started.</span>
              <span className="home-action-cta">Create a job <span aria-hidden="true">→</span></span>
            </Link>
            <Link className="home-action-card" href="/jobs">
              <span className="home-action-label">FOR DRIVERS</span>
              <strong>Find delivery work</strong>
              <span>Explore available jobs and review the details.</span>
              <span className="home-action-cta">Browse jobs <span aria-hidden="true">→</span></span>
            </Link>
            <Link className="home-action-card" href="/vehicles">
              <span className="home-action-label">ACCOUNT READINESS</span>
              <strong>Vehicles &amp; verification</strong>
              <span>Review your vehicle information and verification status.</span>
              <span className="home-action-cta">Manage vehicles <span aria-hidden="true">→</span></span>
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="home-eyebrow"><span className="home-eyebrow-dot" aria-hidden="true" /> FREIGHT &amp; COURIER EXCHANGE</p>
          <h1 id="home-title">Delivery work and transport jobs, <span>connected.</span></h1>
          <p className="home-intro">Post a delivery, discover available work, and manage the job from start to finish — in one place.</p>
          <div className="home-hero-actions">
            <Link className="home-button home-button-primary" href="/signup">Create an account <span aria-hidden="true">→</span></Link>
            <Link className="home-button home-button-secondary" href="/login">Log in</Link>
          </div>
          <p className="home-supporting-copy">Already have an account? Log in to continue to your workspace.</p>
        </div>
        <div className="home-route-panel" aria-label="How Post2Drive works">
          <div className="home-route-panel-top">
            <span className="home-route-label">ONE WORKFLOW</span>
            <span className="home-route-status"><span aria-hidden="true" /> From post to delivery</span>
          </div>
          <ol className="home-steps">
            <li><span className="home-step-number">01</span><span><strong>Post or discover</strong><small>Start with a delivery job or available work.</small></span></li>
            <li><span className="home-step-number">02</span><span><strong>Review the details</strong><small>Check route, requirements and job terms.</small></span></li>
            <li><span className="home-step-number">03</span><span><strong>Manage the delivery</strong><small>Follow the job through its lifecycle.</small></span></li>
          </ol>
          <div className="home-route-footer"><span aria-hidden="true">↗</span> Clear steps. One place to manage the work.</div>
        </div>
      </section>
      <section className="home-audience" aria-labelledby="home-audience-title">
        <div className="home-section-heading">
          <p className="home-eyebrow">BUILT FOR BOTH SIDES</p>
          <h2 id="home-audience-title">What brings you here?</h2>
          <p>Choose the path that matches what you need today.</p>
        </div>
        <div className="home-action-grid home-public-actions">
          <Link className="home-action-card" href="/signup">
            <span className="home-action-label">I NEED TRANSPORT</span>
            <strong>Post a job</strong>
            <span>Describe the delivery and manage the next steps from your account.</span>
            <span className="home-action-cta">Get started <span aria-hidden="true">→</span></span>
          </Link>
          <Link className="home-action-card" href="/jobs">
            <span className="home-action-label">I AM A DRIVER</span>
            <strong>Find work</strong>
            <span>Browse the job marketplace and review opportunities that fit.</span>
            <span className="home-action-cta">Explore jobs <span aria-hidden="true">→</span></span>
          </Link>
        </div>
      </section>
      <footer className="home-utility"><Link href="/pricing">Pricing</Link><span aria-hidden="true">·</span><Link href="/requirements">Requirements</Link><span aria-hidden="true">·</span><Link href="/admin-access">Operations access</Link></footer>
    </main>
  );
}
