"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES, currencyForCountry, symbolFor } from "@/lib/currency";

const TERMS_VERSION = "2026-10-16";
type ResearchAnswers = { role: string; currentDiscovery: string; biggestChallenge: string; preferredAccess: string };

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", companyName: "",
    planType: "individual", fleetVehicleCount: "1", isSoleTrader: false,
    country: "", currency: "", referralCode: "", testerCode: "",
    termsAccepted: false, marketResearch: {
      role: "", currentDiscovery: "", biggestChallenge: "", preferredAccess: "",
    } as ResearchAnswers,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [testerApplicationPending, setTesterApplicationPending] = useState(false);
  const [emailVerificationPending, setEmailVerificationPending] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  const isIndia = form.country === "IN";
  const isUk = form.country === "GB";
  const selectedCountry = COUNTRIES.find((country) => country.code === form.country);
  const marketLabel = selectedCountry?.name ?? "Selected market";
  const marketDisplay = form.country ? `${marketLabel} · ${form.currency}` : "Choose your market";
  const hasWeeklyPricing = Boolean(selectedCountry && !isIndia);
  const priceSymbol = symbolFor(form.currency);
  const vehicleCount = Number(form.fleetVehicleCount);
  const selectedPlan = vehicleCount === 1 ? "individual" : "fleet";
  function formatMarketPrice(amount: number) {
    return new Intl.NumberFormat(selectedCountry?.locale ?? "en-GB", {
      style: "currency", currency: form.currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);
  }
  const steps = useMemo(() => isIndia
    ? ["Business setup", "Vehicles & capacity", "Your account", "Market research (optional)", "Review & agree"]
    : ["Business setup", "Vehicles & capacity", "Your account", "Plan & review"], [isIndia]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function changeCountry(country: string) {
    setForm((current) => ({ ...current, country, currency: currencyForCountry(country), referralCode: "", testerCode: "" }));
  }
  function canAdvance() {
    if (step === 0 && !form.country) return "Choose your market to continue.";
    if (step === 0 && !form.isSoleTrader && !form.companyName.trim()) return "Enter your registered company name, or select sole trader.";
    if (step === 1 && (!Number.isInteger(vehicleCount) || vehicleCount < 1 || vehicleCount > 55)) return "Enter a vehicle count from 1 to 55. Fleets with 56+ vehicles need custom pricing.";
    if (step === 2) {
      if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || form.password.length < 8) return "Complete all account fields. Password must contain at least 8 characters.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Enter a valid email address.";
    }
    return "";
  }

  async function handleSubmit() {
    setError("");
    const validationError = canAdvance();
    if (validationError) { setError(validationError); return; }
    if (!form.termsAccepted) { setError("Please accept the Terms and Privacy Notice to create an account."); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        planType: selectedPlan,
        fleetVehicleCount: String(vehicleCount),
        companyName: form.companyName.trim() || (form.isSoleTrader ? form.name.trim() : ""),
        termsVersion: TERMS_VERSION,
        marketResearch: isIndia ? form.marketResearch : undefined,
      };
      const res = await fetch("/api/signup", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not create your account. Please try again."); return; }
      if (data.emailVerificationPending) {
        setEmailVerificationPending(true);
        setVerificationEmailSent(Boolean(data.verificationEmailSent));
        setSignupEmail(form.email.trim());
      }
      if (data.testerApplicationPending) { setTesterApplicationPending(true); return; }
      if (data.emailVerificationPending) return;
      router.push("/login");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally { setLoading(false); }
  }

  async function resendVerification() {
    setResendingVerification(true); setResendMessage("");
    try {
      const response = await fetch("/api/email/verification/resend", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: signupEmail }),
      });
      const data = await response.json().catch(() => ({}));
      setResendMessage(data.message || (response.ok ? "Check your inbox for a verification email." : "Could not resend the email."));
    } catch { setResendMessage("Could not resend the email. Please try again."); }
    finally { setResendingVerification(false); }
  }

  function next() {
    setError("");
    const issue = canAdvance();
    if (issue) { setError(issue); return; }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  return <main className="auth-page"><section className="signup-shell">
    <div className="signup-heading">
      <p className="signup-eyebrow">POST2DRIVE · EARLY ACCESS</p>
      <h1>Create your account</h1>
      <p>One account to post delivery jobs, find opportunities, bid and manage work. Choose your market first; each market stays separate.</p>
    </div>
    {testerApplicationPending || emailVerificationPending ? <div className="signup-alert" role="status">
      {testerApplicationPending ? <><h2>Tester application submitted</h2><p>Your details are saved for administrator review. Tester access starts only after approval.</p></> : <><h2>Check your email</h2><p>{verificationEmailSent ? `We sent a verification link to ${signupEmail}. The link expires in 24 hours and can only be used once.` : `Your account was created, but delivery to ${signupEmail} could not be confirmed. Request another link below.`}</p><button type="button" onClick={() => void resendVerification()} disabled={resendingVerification}>{resendingVerification ? "Sending…" : "Resend verification email"}</button>{resendMessage && <p>{resendMessage}</p>}</>}
      <p><a href="/login">Continue to login</a></p>
    </div> : <form className="signup-form" onSubmit={(e) => { e.preventDefault(); if (step < steps.length - 1) next(); else void handleSubmit(); }}>
      <div className="signup-step-header">
        <div><span>STEP {step + 1} OF {steps.length}</span><h2>{steps[step]}</h2></div>
        <span className="signup-step-market">{marketDisplay}</span>
      </div>
      <div className="signup-progress" aria-label={`Step ${step + 1} of ${steps.length}`}><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>

      {step === 0 && <div className="signup-fields">
        <label>Choose your market<select required value={form.country} onChange={(e) => changeCountry(e.target.value)}><option value="" disabled>Choose a country</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select><small>This determines your marketplace, currency and local time zone. Cross-market matching is disabled.</small></label>
        <label>Account type<select value={form.isSoleTrader ? "sole" : "company"} onChange={(e) => update("isSoleTrader", e.target.value === "sole")}><option value="company">Registered business</option><option value="sole">Sole trader / individual operator</option></select></label>
        <label>{form.isSoleTrader ? "Trading name (optional)" : "Registered company name"}<input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} required={!form.isSoleTrader} maxLength={120} placeholder={form.isSoleTrader ? "You can use your own name" : "Name registered to your business"} /></label>
        <div className="signup-note"><strong>{form.country ? `${marketLabel} marketplace` : "Select a market"}</strong><p>{!form.country ? "Choose a country to see the correct marketplace, currency and access options." : isIndia ? "Browse India-only delivery opportunities using INR. A short optional market-research step helps shape the experience." : isUk ? "Use this country's marketplace with GBP pricing. Market-specific access and promotion rules are shown before you commit." : form.currency === "EUR" ? "Use this country's separate marketplace with EUR pricing. The available weekly-access and fleet tiers will be shown before you commit." : "Use the selected Post2Drive marketplace. Pricing and access terms will be shown before any payment."}</p></div>
      </div>}

      {step === 1 && <div className="signup-fields">
        <label>How many vehicles will use this account?<input type="number" min="1" max="55" step="1" required value={form.fleetVehicleCount} onChange={(e) => { const v = e.target.value; setForm((current) => ({ ...current, fleetVehicleCount: v, planType: Number(v) === 1 ? "individual" : "fleet" })); }} /></label>
        <div className="signup-plan-card"><span className="signup-plan-label">YOUR PLAN TYPE</span><h3>{selectedPlan === "individual" ? "Individual · 1 vehicle" : "Fleet · 2–55 vehicles"}</h3>{hasWeeklyPricing ? <><p className="signup-plan-price">{formatMarketPrice(selectedPlan === "individual" ? 9.99 : vehicleCount <= 5 ? 16.99 : vehicleCount <= 15 ? 24.99 : vehicleCount <= 30 ? 36.99 : 49.99)} / 7 days</p><small>Prices shown for your selected market. Unlimited legitimate marketplace activity; no per-job charges. No payment is taken at signup and checkout is not yet connected.</small></> : <><p>{isIndia ? "India pricing will be confirmed before any paid plan becomes available." : `Pricing for ${marketLabel} will be confirmed before any paid plan becomes available.`}</p><small>Creating an account does not charge you.</small></>}</div>
        <p className="signup-muted">One account supports both posting and fulfilling jobs. Vehicle count determines the account plan—not whether you are a driver or a business posting deliveries. Fleets above 55 vehicles require custom pricing.</p>
      </div>}

      {step === 2 && <div className="signup-fields">
        <label>Your full name<input required autoComplete="name" maxLength={100} value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
        <label>Email address<input required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={(e) => update("email", e.target.value)} /></label>
        <label>Phone number<input required type="tel" autoComplete="tel" maxLength={50} placeholder={`${selectedCountry?.dialingCode ?? "+"} …`} value={form.phone} onChange={(e) => update("phone", e.target.value)} /></label>
        <label>Password<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={(e) => update("password", e.target.value)} /><small>Use at least 8 characters. Never reuse a password from another service.</small></label>
        {isUk && <div className="signup-fields"><label>Personal tester invitation code (optional)<input type="password" autoComplete="off" maxLength={100} value={form.testerCode} onChange={(e) => setForm((current) => ({ ...current, testerCode: e.target.value, referralCode: e.target.value ? "" : current.referralCode }))} placeholder="Provided directly by Post2Drive" /></label>{!form.testerCode && <label>Referral code (optional)<input maxLength={32} value={form.referralCode} onChange={(e) => setForm((current) => ({ ...current, referralCode: e.target.value, testerCode: e.target.value ? "" : current.testerCode }))} /></label>}</div>}
      </div>}

      {isIndia && step === 3 && <div className="signup-fields">
        <div className="signup-note"><strong>Optional product research</strong><p>Your answers help us prioritise India-market features. Skipping this step will not affect your account.</p></div>
        <label>Which best describes you?<select value={form.marketResearch.role} onChange={(e) => update("marketResearch", { ...form.marketResearch, role: e.target.value })}><option value="">Prefer not to say</option><option value="driver">Driver / independent operator</option><option value="fleet">Fleet / transport operator</option><option value="shipper">Business that arranges deliveries</option><option value="broker">Broker / logistics coordinator</option></select></label>
        <label>How do you find delivery work or drivers today?<select value={form.marketResearch.currentDiscovery} onChange={(e) => update("marketResearch", { ...form.marketResearch, currentDiscovery: e.target.value })}><option value="">Skip</option><option value="whatsapp">WhatsApp / informal groups</option><option value="calls">Calls and personal contacts</option><option value="platforms">Online platforms</option><option value="agents">Agents / brokers</option><option value="other">Other</option></select></label>
        <label>What is your biggest challenge?<select value={form.marketResearch.biggestChallenge} onChange={(e) => update("marketResearch", { ...form.marketResearch, biggestChallenge: e.target.value })}><option value="">Skip</option><option value="consistent-work">Finding consistent work</option><option value="trusted-drivers">Finding reliable drivers</option><option value="empty-miles">Reducing empty miles</option><option value="price-transparency">Pricing transparency</option><option value="payment-delays">Payment delays</option><option value="other">Other</option></select></label>
        <label>Which access model would you prefer?<select value={form.marketResearch.preferredAccess} onChange={(e) => update("marketResearch", { ...form.marketResearch, preferredAccess: e.target.value })}><option value="">Skip</option><option value="free-trial-weekly">Free trial, then weekly access</option><option value="free-trial-payg">Free trial, then pay as you go</option><option value="monthly">Free trial, then monthly subscription</option><option value="longer-plan">Free trial, then discounted longer-term plan</option></select></label>
      </div>}

      {step === steps.length - 1 && <div className="signup-fields">
        <div className="signup-review-grid"><div><span>MARKET</span><strong>{marketDisplay}</strong></div><div><span>BUSINESS</span><strong>{form.isSoleTrader ? (form.companyName.trim() || form.name || "Sole trader") : form.companyName}</strong></div><div><span>ACCOUNT PLAN</span><strong>{selectedPlan === "individual" ? "Individual · 1 vehicle" : `Fleet · ${form.fleetVehicleCount} vehicles`}</strong></div><div><span>EMAIL</span><strong>{form.email}</strong></div></div>
        {isUk && <div className="signup-note"><strong>Promotion is not guaranteed</strong><p>Entering an invitation code creates a tester application. Access and any promotional trial begin only after approval. Paid subscription checkout is not activated by this signup.</p></div>}
        <label className="signup-checkbox"><input type="checkbox" checked={form.termsAccepted} onChange={(e) => update("termsAccepted", e.target.checked)} /><span>I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and acknowledge the <a href="/privacy" target="_blank" rel="noreferrer">Privacy Notice</a>.</span></label>
        <p className="signup-muted">Your account will be created in {isIndia ? "the India marketplace with INR" : `the ${marketLabel} marketplace with ${form.currency}`}. Each country market keeps public job listings separate.</p>
      </div>}

      {error && <p className="signup-error" role="alert">{error}</p>}
      <div className="signup-actions">{step > 0 && <button className="signup-secondary" type="button" disabled={loading} onClick={() => { setError(""); setStep((current) => current - 1); }}>Back</button>}{step < steps.length - 1 ? <button type="submit">Continue</button> : <button type="submit" disabled={loading}>{loading ? "Creating account…" : "Create account"}</button>}</div>
      <p className="signup-login-link">Already registered? <a href="/login">Log in</a></p>
    </form>}
    <p className="signup-footnote">By continuing, you can review the plan details and terms before creating your account. Account creation itself does not take payment.</p>
  </section></main>;
}
