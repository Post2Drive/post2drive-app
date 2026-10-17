"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { symbolFor } from "@/lib/currency";
import { VEHICLE_TYPES, vehicleTypeLabel } from "@/lib/vehicles";
import { getLocalisationProfile, getTimeZoneOptions } from "@/lib/localisation";

function parseCoords(
  input: string
): { lat: string; lng: string } | null {
  if (!input) return null;

  const atMatch =
    input.match(
      /@(-?\d+\.\d+),(-?\d+\.\d+)/
    );

  if (atMatch) {
    return {
      lat: atMatch[1],
      lng: atMatch[2],
    };
  }

  const plainMatch =
    input.match(
      /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/
    );

  if (plainMatch) {
    return {
      lat: plainMatch[1],
      lng: plainMatch[2],
    };
  }

  return null;
}

export default function NewJobPage() {
  const router = useRouter();
  const { data: session } =
    useSession();

  const currency =
    (session?.user as any)
      ?.currency || "GBP";

  const country =
    (session?.user as any)
      ?.country || "GB";

  const accountName =
    (session?.user as any)
      ?.name || "";

  const accountPhone =
    (session?.user as any)
      ?.phone || "";

  const symbol =
    symbolFor(currency);

  const marketProfile = getLocalisationProfile({ country, currency });
  const timeZoneLabel = marketProfile?.timeZone ?? "your market time zone";
  const steps = country === "IN"
    ? ["Route & schedule", "Vehicle & pricing", "Contacts & review"]
    : ["Route & schedule", "Vehicle & pricing", "Contacts & instructions", "Review & post"];

  const [form, setForm] =
    useState({
      pickup: "",
      pickupPin: "",
      dropoff: "",
      dropoffPin: "",
      jobDate: "",
      pickupTime: "",
      dropoffTime: "",
      pickupTimeZone: "Europe/London",
      vehicleType:
        "Car",
      weightKg: "",
      dimensions: "",
      price: "",
      notes: "",
      priceMode: "fixed",
      pickupContactName: "",
      pickupContactPhone: "",
      dropoffContactName: "",
      dropoffContactPhone: "",

      pickupSameAsAccount:
        false,

      dropoffSameAsAccount:
        false,

      dropoffSameAsPickup:
        false,
    });

  useEffect(() => {
    if (marketProfile?.timeZone) {
      setForm((current) => ({ ...current, pickupTimeZone: marketProfile.timeZone }));
    }
  }, [country, marketProfile?.timeZone]);

  const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(false);
  const [step, setStep] = useState(0);

  function update(
    field: keyof typeof form,
    value: string | boolean
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (!form.pickup.trim()) return "Enter the pickup location.";
      if (!form.dropoff.trim()) return "Enter the drop-off location.";
      if (!form.jobDate) return "Choose the delivery date.";
      if (!form.pickupTime) return "Choose the pickup time.";
      if (form.pickupPin && !parseCoords(form.pickupPin)) return 'Pickup pin was not recognised. Enter latitude,longitude or paste a Google Maps link.';
      if (form.dropoffPin && !parseCoords(form.dropoffPin)) return 'Drop-off pin was not recognised. Enter latitude,longitude or paste a Google Maps link.';
    }
    if (step === 1) {
      if (!(VEHICLE_TYPES as readonly string[]).includes(form.vehicleType)) return "Choose a supported vehicle type.";
      const price = Number(form.price);
      if (!form.price.trim() || !Number.isFinite(price) || price <= 0) return "Enter a price greater than zero.";
      if (form.priceMode !== "fixed" && form.priceMode !== "bid") return "Choose fixed pricing or open bidding.";
      if (form.weightKg.trim() && (!Number.isFinite(Number(form.weightKg)) || Number(form.weightKg) < 0)) return `Enter a valid weight in ${marketProfile?.weightUnit ?? "kg"}.`;
    }
    if (step === 2) {
      for (const [label, value] of [["Pickup contact name", form.pickupContactName], ["Drop-off contact name", form.dropoffContactName]] as const) {
        if (value.length > 150) return `${label} must be 150 characters or fewer.`;
      }
      if (form.notes.length > 5000) return "Notes must be 5,000 characters or fewer.";
    }
    return null;
  }

  function handleNext() {
    const validationError = validateStep();
    if (validationError) { setError(validationError); return; }
    setError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }
  function useAccountForPickup(
    checked: boolean
  ) {
    setForm(
      (current) => ({
        ...current,

        pickupSameAsAccount:
          checked,

        pickupContactName:
          checked
            ? accountName
            : current.pickupContactName,

        pickupContactPhone:
          checked
            ? accountPhone
            : current.pickupContactPhone,
      })
    );
  }

  function useAccountForDropoff(
    checked: boolean
  ) {
    setForm(
      (current) => ({
        ...current,

        dropoffSameAsAccount:
          checked,

        dropoffSameAsPickup:
          checked
            ? false
            : current.dropoffSameAsPickup,

        dropoffContactName:
          checked
            ? accountName
            : current.dropoffContactName,

        dropoffContactPhone:
          checked
            ? accountPhone
            : current.dropoffContactPhone,
      })
    );
  }

  function usePickupForDropoff(
    checked: boolean
  ) {
    setForm(
      (current) => ({
        ...current,

        dropoffSameAsPickup:
          checked,

        dropoffSameAsAccount:
          checked
            ? false
            : current.dropoffSameAsAccount,

        dropoffContactName:
          checked
            ? current.pickupContactName
            : current.dropoffContactName,

        dropoffContactPhone:
          checked
            ? current.pickupContactPhone
            : current.dropoffContactPhone,
      })
    );
  }

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    if (step < steps.length - 1) {
      handleNext();
      return;
    }

    setLoading(true);
    setError("");

    const pickupCoords =
      parseCoords(
        form.pickupPin
      );

    const dropoffCoords =
      parseCoords(
        form.dropoffPin
      );

    if (
      form.pickupPin &&
      !pickupCoords
    ) {
      setLoading(false);
      setError(
        'Could not read pickup pin. Use latitude,longitude or a Google Maps link.'
      );
      return;
    }

    if (
      form.dropoffPin &&
      !dropoffCoords
    ) {
      setLoading(false);
      setError(
        'Could not read drop-off pin. Use latitude,longitude or a Google Maps link.'
      );
      return;
    }

    const payload = {
      ...form,
      weightKg: form.weightKg ? Number(form.weightKg) * (marketProfile?.weightUnit === "lb" ? 0.45359237 : 1) : "",
      crossBorder: false,
      pickupLat:
        pickupCoords?.lat,

      pickupLng:
        pickupCoords?.lng,

      dropoffLat:
        dropoffCoords?.lat,

      dropoffLng:
        dropoffCoords?.lng,

      currency,

      pickupContactName:
        form.pickupSameAsAccount
          ? accountName
          : form.pickupContactName,

      pickupContactPhone:
        form.pickupSameAsAccount
          ? accountPhone
          : form.pickupContactPhone,

      dropoffContactName:
        form.dropoffSameAsAccount
          ? accountName
          : form.dropoffSameAsPickup
          ? form.pickupContactName
          : form.dropoffContactName,

      dropoffContactPhone:
        form.dropoffSameAsAccount
          ? accountPhone
          : form.dropoffSameAsPickup
          ? form.pickupContactPhone
          : form.dropoffContactPhone,
    };

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "The job could not be published. Please review the details and try again.");
        return;
      }
      router.push(country === "IN" ? "/requirements" : "/jobs");
    } catch {
      setError("A network error prevented the job from being published. Your details are still here; check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 840, margin: "0 auto", padding: "28px 16px 64px" }}>
      <header style={{ marginBottom: 22 }}>
        <p style={{ color: "var(--color-positive)", fontWeight: 800, fontSize: 12, letterSpacing: ".09em", marginBottom: 6 }}>
          {`${marketProfile?.marketplaceLabel ?? "LOCAL"} MARKETPLACE · ${currency}`}
        </p>
        <h1 style={{ margin: "0 0 8px" }}>Post a delivery job</h1>
        <p style={{ margin: 0, color: "var(--color-muted)" }}>
          Add the essentials, review the details, then publish to the {marketProfile?.marketplaceLabel ?? "selected"} marketplace.
        </p>
      </header>

      <nav aria-label="Job posting progress" style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 8, marginBottom: 22 }}>
        {steps.map((label, index) => (
          <div key={label} aria-current={index === step ? "step" : undefined} style={{ minWidth: 0 }}>
            <div style={{ height: 5, borderRadius: 999, background: index <= step ? "var(--color-primary)" : "var(--color-border)", marginBottom: 7 }} />
            <p style={{ margin: 0, fontSize: 12, color: index === step ? "var(--color-text)" : "var(--color-muted)", fontWeight: index === step ? 800 : 500 }}>{index + 1}. {label}</p>
          </div>
        ))}
      </nav>

      <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 18, border: "1px solid var(--color-border)", borderRadius: 16, padding: 20, background: "var(--color-surface)" }}>
        {step === 0 && <section style={{ display: "grid", gap: 16 }}>
          <div><h2 style={{ margin: "0 0 5px", fontSize: 20 }}>Where and when?</h2><p style={{ margin: 0, color: "var(--color-muted)", fontSize: 14 }}>Use an address or place name. Map pins are optional, but help drivers find the exact entrance.</p></div>
          <label>Pickup location *<input required maxLength={300} value={form.pickup} onChange={(e) => update("pickup", e.target.value)} placeholder={country === "IN" ? "e.g. Gachibowli, Hyderabad" : "e.g. pickup address or business park"} /></label>
          <label>Pickup map pin (optional)<input value={form.pickupPin} onChange={(e) => update("pickupPin", e.target.value)} placeholder="Latitude,longitude or Google Maps link" /><small>Paste a Google Maps URL or latitude,longitude coordinates.</small></label>
          <label>Drop-off location *<input required maxLength={300} value={form.dropoff} onChange={(e) => update("dropoff", e.target.value)} placeholder={country === "IN" ? "e.g. Hitech City, Hyderabad" : "e.g. delivery address or city centre"} /></label>
          <label>Drop-off map pin (optional)<input value={form.dropoffPin} onChange={(e) => update("dropoffPin", e.target.value)} placeholder="Latitude,longitude or Google Maps link" /></label>
          <div className="signup-fields">
            <label>Pickup date *<input required type="date" value={form.jobDate} onChange={(e) => update("jobDate", e.target.value)} /></label>
            <label>Pickup time *<input required type="time" value={form.pickupTime} onChange={(e) => update("pickupTime", e.target.value)} /><small>Enter the time at the pickup location ({form.pickupTimeZone || timeZoneLabel}).</small></label>
            {getTimeZoneOptions(country, marketProfile?.timeZone).length > 1 && (
              <label>Pickup time zone
                <select value={form.pickupTimeZone} onChange={(e) => update("pickupTimeZone", e.target.value)} required>
                  {getTimeZoneOptions(country, marketProfile?.timeZone).map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
                </select>
                <small>Choose the time zone where the pickup takes place.</small>
              </label>
            )}
            <label>Estimated drop-off time (optional)<input type="time" value={form.dropoffTime} onChange={(e) => update("dropoffTime", e.target.value)} /><small>Use the selected pickup time zone unless the delivery is in another zone.</small></label>
          </div>
        </section>}

        {step === 1 && <section style={{ display: "grid", gap: 16 }}>
          <div><h2 style={{ margin: "0 0 5px", fontSize: 20 }}>What needs moving?</h2><p style={{ margin: 0, color: "var(--color-muted)", fontSize: 14 }}>Choose the vehicle capacity and explain the price clearly.</p></div>
          <label>Required vehicle type *<select value={form.vehicleType} onChange={(e) => update("vehicleType", e.target.value)}>{VEHICLE_TYPES.map((vehicle) => <option key={vehicle} value={vehicle}>{vehicleTypeLabel(vehicle, country)}</option>)}</select></label>
          <div className="signup-fields">
            <label>Estimated weight ({marketProfile?.weightUnit ?? "kg"})<input type="number" min="0" max="1000000" step="0.01" value={form.weightKg} onChange={(e) => update("weightKg", e.target.value)} placeholder="Optional" /></label>
            <label>Dimensions<input maxLength={150} value={form.dimensions} onChange={(e) => update("dimensions", e.target.value)} placeholder={country === "US" ? "e.g. 14 ft × 7 ft × 8 ft" : "e.g. 4.2 m × 2.1 m × 2.4 m"} /></label>
          </div>
          <label>How will you set the price? *<select value={form.priceMode} onChange={(e) => update("priceMode", e.target.value)}><option value="fixed">Fixed price — the amount shown is the offer</option><option value="bid">Open to bids — drivers can submit offers</option></select></label>
          <label>{form.priceMode === "bid" ? `Guide price (${symbol.trim()}) *` : `Total job price (${symbol.trim()}) *`}<input required inputMode="decimal" type="number" min="0.01" max="100000000" step="0.01" value={form.price} onChange={(e) => update("price", e.target.value)} placeholder={country === "IN" ? "e.g. 2500" : "e.g. 85.00"} /><small>Currency is fixed to {currency}; jobs are not shared between markets.</small></label>
          {form.priceMode === "bid" && <p style={{ margin: 0, borderRadius: 10, padding: 12, background: "var(--color-primary-soft)", fontSize: 13 }}>This is a guide price, not a guaranteed final payment. You'll review driver bids before accepting one.</p>}
        </section>}

        {step === 2 && <section style={{ display: "grid", gap: 16 }}>
          <div><h2 style={{ margin: "0 0 5px", fontSize: 20 }}>{country === "IN" ? "Contacts, notes & review" : "Site contacts & instructions"}</h2><p style={{ margin: 0, color: "var(--color-muted)", fontSize: 14 }}>Add only the contact details needed to coordinate this delivery. These are separate from your account contact.</p></div>
          <fieldset style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 14, display: "grid", gap: 12 }}>
            <legend style={{ padding: "0 6px", fontWeight: 750 }}>Pickup contact (optional)</legend>
            <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}><input type="checkbox" checked={form.pickupSameAsAccount} onChange={(e) => useAccountForPickup(e.target.checked)} /> Use my account contact</label>
            <label>Name<input maxLength={150} value={form.pickupContactName} disabled={form.pickupSameAsAccount} onChange={(e) => update("pickupContactName", e.target.value)} placeholder="Site contact name" /></label>
            <label>Phone<input maxLength={50} value={form.pickupContactPhone} disabled={form.pickupSameAsAccount} onChange={(e) => update("pickupContactPhone", e.target.value)} placeholder="Site contact phone" /></label>
          </fieldset>
          <fieldset style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 14, display: "grid", gap: 12 }}>
            <legend style={{ padding: "0 6px", fontWeight: 750 }}>Drop-off contact (optional)</legend>
            <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}><input type="checkbox" checked={form.dropoffSameAsAccount} onChange={(e) => useAccountForDropoff(e.target.checked)} /> Use my account contact</label>
            <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}><input type="checkbox" checked={form.dropoffSameAsPickup} onChange={(e) => usePickupForDropoff(e.target.checked)} disabled={form.dropoffSameAsAccount} /> Same as pickup contact</label>
            <label>Name<input maxLength={150} value={form.dropoffContactName} disabled={form.dropoffSameAsAccount || form.dropoffSameAsPickup} onChange={(e) => update("dropoffContactName", e.target.value)} placeholder="Site contact name" /></label>
            <label>Phone<input maxLength={50} value={form.dropoffContactPhone} disabled={form.dropoffSameAsAccount || form.dropoffSameAsPickup} onChange={(e) => update("dropoffContactPhone", e.target.value)} placeholder="Site contact phone" /></label>
          </fieldset>
          <label>Delivery instructions (optional)<textarea maxLength={5000} rows={4} value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Access information, loading details, timing constraints…" /><small>{form.notes.length}/5,000 characters</small></label>
          {country === "IN" && <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 14 }}><h3 style={{ margin: "0 0 10px" }}>Review your requirement</h3><ReviewSummary form={form} currency={currency} symbol={symbol} date={form.jobDate} timeZoneLabel={form.pickupTimeZone || timeZoneLabel} country={country} /></div>}
        </section>}

        {step === 3 && country !== "IN" && <section style={{ display: "grid", gap: 16 }}>
          <div><h2 style={{ margin: "0 0 5px", fontSize: 20 }}>Review before publishing</h2><p style={{ margin: 0, color: "var(--color-muted)", fontSize: 14 }}>Confirm the details before this job becomes visible to eligible users in your market.</p></div>
          <ReviewSummary form={form} currency={currency} symbol={symbol} date={form.jobDate} timeZoneLabel={timeZoneLabel} country={country} />
          <div style={{ borderRadius: 10, padding: 12, background: "var(--color-primary-soft)", fontSize: 13 }}>Your listing is confined to {marketProfile?.marketplaceLabel ?? "your selected market"} ({currency}). Cross-market matching is disabled.</div>
        </section>}

        {error && <p role="alert" style={{ margin: 0, color: "var(--color-danger, #b42318)", fontWeight: 650 }}>{error}</p>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderTop: "1px solid var(--color-border)", paddingTop: 16, marginTop: 2 }}>
          {step > 0 ? <button className="button-link button-link-secondary" type="button" disabled={loading} onClick={() => { setError(""); setStep((current) => current - 1); }}>Back</button> : <button className="button-link button-link-secondary" type="button" disabled={loading} onClick={() => router.push(country === "IN" ? "/requirements" : "/jobs")}>Cancel</button>}
          {step < steps.length - 1 ? <button className="button-link" type="button" onClick={handleNext}>Continue</button> : <button className="button-link" type="submit" disabled={loading}>{loading ? "Publishing…" : "Publish job"}</button>}
        </div>
      </form>
    </main>
  );
}

function ReviewSummary({ form, currency, symbol, date, timeZoneLabel, country }: { country: string; form: { pickup: string; pickupPin: string; dropoff: string; dropoffPin: string; pickupTime: string; dropoffTime: string; vehicleType: string; weightKg: string; dimensions: string; price: string; priceMode: string; pickupContactName: string; pickupContactPhone: string; dropoffContactName: string; dropoffContactPhone: string; notes: string }; currency: string; symbol: string; date: string; timeZoneLabel: string }) {
  const profile = getLocalisationProfile({ country, currency });
  const entries: [string, string][] = [
    ["Route", `${form.pickup} → ${form.dropoff}`],
    ["Date", date || "Not selected"],
    ["Pickup", `${form.pickupTime || "Not selected"} (${timeZoneLabel})`],
    ["Drop-off", form.dropoffTime ? `${form.dropoffTime} (${timeZoneLabel})` : "Not specified"],
    ["Vehicle", vehicleTypeLabel(form.vehicleType, country)],
    ["Weight", form.weightKg ? `${form.weightKg} ${profile?.weightUnit ?? "kg"}` : "Not specified"],
    ["Dimensions", form.dimensions || "Not specified"],
    ["Pricing", `${symbol}${Number(form.price || 0).toLocaleString(profile?.locale ?? "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency} · ${form.priceMode === "bid" ? "Guide price / open to bids" : "Fixed price"}`],
    ["Pickup contact", form.pickupContactName || "Not specified"],
    ["Drop-off contact", form.dropoffContactName || "Not specified"],
    ["Instructions", form.notes || "None"],
  ];
  return <dl style={{ display: "grid", gridTemplateColumns: "minmax(110px, 0.7fr) minmax(0, 1.7fr)", gap: "10px 14px", margin: 0 }}>
    {entries.map(([label, value]) => <div key={label} style={{ display: "contents" }}><dt style={{ color: "var(--color-muted)", fontSize: 13 }}>{label}</dt><dd style={{ margin: 0, fontSize: 14, overflowWrap: "anywhere" }}>{value}</dd></div>)}
  </dl>;
}
