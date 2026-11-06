"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { VEHICLE_TYPES, vehicleTypeLabel } from "@/lib/vehicles";
import { minorUnitsToMajorUnits } from "@/lib/currencyMinorUnits";
import { getLocalisationProfile, formatMarketDate, getJurisdictionOptions, getJurisdictionAuthority } from "@/lib/localisation";

type Vehicle = {
  id: string;
  vehicleType: string;
  regPlate: string;
  registrationRegion: string | null;
  ownershipType: string | null;
  make: string | null;
  model: string | null;
  mamKg: number | null;
  v5cDocumentUrl: string | null;
  insuranceDocumentUrl: string | null;
  operatorLicenceNo: string | null;
  motValidUntil: string | null;
  insuranceValidUntil: string | null;
  verificationStatus: string;
  registeredKeeperType: string | null;
  registeredKeeperName: string | null;
  insurancePolicyholderName: string | null;
  insuranceCoverType: string | null;
  rejectionReason: string | null;
  correctionDeadline: string | null;
  additionalVehicleFeeMinorUnits: number | null;
};

const COVER_LABELS: Record<string, string> = {
  hire_and_reward: "Hire and reward (goods in transit for payment)",
  fleet: "Fleet policy with commercial use",
  other: "Other (for example social, domestic or business use only)",
};

const initialForm = {
  vehicleType: VEHICLE_TYPES[0] as string,
  regPlate: "",
  registrationRegion: "",
  ownershipType: "owned",
  make: "",
  model: "",
  mamKg: "",
  v5cDocumentUrl: "",
  insuranceDocumentUrl: "",
  operatorLicenceNo: "",
  motValidUntil: "",
  insuranceValidUntil: "",
  registeredKeeperType: "individual",
  registeredKeeperName: "",
  leaseAgreementUrl: "",
  insurancePolicyholderName: "",
  insuranceCoverType: "hire_and_reward",
  insurancePolicyNumber: "",
};

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isTester, setIsTester] = useState(false);
  const [testerApprovalStatus, setTesterApprovalStatus] = useState<string | null>(null);
  const expiryDatesOptional = isTester || testerApprovalStatus === "pending";
  const [market, setMarket] = useState({ country: "GB", currency: "GBP" });
  const marketProfile = getLocalisationProfile(market);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [isFleet, setIsFleet] = useState(false);
  const [licence, setLicence] = useState<{ recorded: boolean; licenceLast4: string | null } | null>(null);
  const [licenceInput, setLicenceInput] = useState("");
  const [licenceStatus, setLicenceStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [licenceSaving, setLicenceSaving] = useState(false);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/vehicles");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load vehicles.");
      setVehicles(data.vehicles || []);
      if (data.market) setMarket({ country: data.market.country, currency: data.market.currency });
      setIsTester(Boolean(data.isTester));
      setIsFleet(Boolean(data.fleet));
      setTesterApprovalStatus(data.testerApprovalStatus || null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load vehicles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    fetch("/api/account/driver-licence")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) setLicence({ recorded: Boolean(data.recorded), licenceLast4: data.licenceLast4 ?? null }); })
      .catch(() => undefined);
  }, []);

  async function saveLicence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLicenceSaving(true);
    setLicenceStatus(null);
    try {
      const response = await fetch("/api/account/driver-licence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenceNumber: licenceInput }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not record the driving licence.");
      setLicence({ recorded: true, licenceLast4: data.licenceLast4 });
      setLicenceInput("");
      setLicenceStatus({ text: "Driving licence recorded.", error: false });
    } catch (err) {
      setLicenceStatus({ text: err instanceof Error ? err.message : "Could not record the driving licence.", error: true });
    } finally {
      setLicenceSaving(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, mamKg: form.mamKg ? String(Math.round(Number(form.mamKg) * (marketProfile?.weightUnit === "lb" ? 0.45359237 : 1))) : "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not register vehicle.");
      setMessage(data.message || "Vehicle submitted.");
      setForm(initialForm);
      await loadVehicles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register vehicle.");
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: 10,
    marginTop: 5,
    marginBottom: 14,
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    background: "var(--color-surface)",
    color: "var(--color-text)",
  };

  function field(
    label: string,
    name: keyof typeof initialForm,
    type = "text",
    required = false
  ) {
    return (
      <label key={name} style={{ display: "block", fontSize: 14 }}>
        {label}
        <input
          style={fieldStyle}
          type={type}
          name={name}
          autoComplete={name === "regPlate" ? "off" : undefined}
          value={form[name]}
          required={required}
          min={type === "number" ? 1 : undefined}
          onChange={(event) =>
            setForm((current) => ({ ...current, [name]: event.target.value }))
          }
        />
      </label>
    );
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}>
      <h1>Vehicle onboarding</h1>
      {isTester && <p><strong>Account status: Tester</strong> — verification checks are bypassed for testing; vehicle records remain unverified. {marketProfile?.inspectionLabel} and insurance expiry dates are optional for this test account.</p>}
      {testerApprovalStatus === "pending" && <p><strong>Tester application pending review.</strong> Add the details below for the administrator to review. Tester access is not enabled until approval. {marketProfile?.inspectionLabel} and insurance expiry dates are optional while your application is pending.</p>}
      {testerApprovalStatus === "rejected" && <p><strong>Tester application rejected.</strong> Tester access has not been enabled. Contact the Post2Drive administrator if you believe this is an error.</p>}
      <p>Add your vehicle and supporting details. Registration does not mean the vehicle is verified or eligible for jobs.</p>

      {loadError && <div role="alert" style={{ color: "var(--color-danger, #b91c1c)" }}><p>{loadError}</p><button type="button" onClick={() => void loadVehicles()} disabled={loading}>{loading ? "Retrying…" : "Retry loading vehicles"}</button></div>}
      {error && <p role="alert" style={{ color: "var(--color-danger, #b91c1c)" }}>{error}</p>}
      {loadError && <p role="alert" style={{ color: "var(--color-danger, #b91c1c)" }}>Could not refresh your vehicles: {loadError} <button type="button" onClick={() => void loadVehicles()} disabled={loading}>{loading ? "Retrying…" : "Retry"}</button></p>}
      {message && <p role="status">{message}</p>}

      {market.country !== "IN" && !isFleet && (
        <form aria-labelledby="driver-licence-heading" onSubmit={saveLicence} style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h2 id="driver-licence-heading" style={{ marginTop: 0 }}>Your driving licence</h2>
          {licence?.recorded ? (
            <p role="status">Recorded: licence ending {licence.licenceLast4}. Contact support to change it.</p>
          ) : (
            <>
              <p style={{ fontSize: 14 }}>A licence can be the driver licence on only one Post2Drive account. We store a protected fingerprint and the last 4 characters, never the full number.</p>
              <label style={{ display: "block", fontSize: 14 }}>
                Driving licence number
                <input style={fieldStyle} value={licenceInput} onChange={(event) => setLicenceInput(event.target.value)} required maxLength={24} autoComplete="off" />
              </label>
              <button type="submit" disabled={licenceSaving} style={{ padding: "11px 18px", minHeight: 44, borderRadius: 8, fontWeight: 650 }}>
                {licenceSaving ? "Saving…" : "Record driving licence"}
              </button>
            </>
          )}
          {licenceStatus && <p role={licenceStatus.error ? "alert" : "status"} style={licenceStatus.error ? { color: "var(--color-danger, #b91c1c)" } : undefined}>{licenceStatus.text}</p>}
        </form>
      )}

      <form aria-labelledby="vehicle-registration-heading" onSubmit={submit} style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 20 }}>
        <h2 id="vehicle-registration-heading" style={{ marginTop: 0 }}>Register a vehicle</h2>
        <label style={{ display: "block", fontSize: 14 }}>
          Vehicle type
          <select
            style={fieldStyle}
            value={form.vehicleType}
            onChange={(event) => setForm((current) => ({ ...current, vehicleType: event.target.value }))}
          >
            {VEHICLE_TYPES.filter((type) => type !== "Other (specify in notes)").map((type) => (
              <option key={type} value={type}>{vehicleTypeLabel(type, market.country)}</option>
            ))}
          </select>
        </label>

        {field(marketProfile?.registrationLabel ?? "Vehicle registration number", "regPlate", "text", true)}
        {getJurisdictionOptions(market.country).length > 0 && (
          <label style={{ display: "block", fontSize: 14, marginTop: 10 }}>
            {marketProfile?.jurisdictionLabel ?? "Vehicle registration jurisdiction"}
            <select style={fieldStyle} value={form.registrationRegion} required={Boolean(marketProfile?.jurisdictionSelectionRequired)} onChange={(event) => setForm((current) => ({ ...current, registrationRegion: event.target.value }))}>
              <option value="">Select jurisdiction</option>
              {getJurisdictionOptions(market.country).map((region) => <option key={region.code} value={region.code}>{region.label}</option>)}
            </select>
          </label>
        )}

        <label style={{ display: "block", fontSize: 14 }}>
          Ownership
          <select
            style={fieldStyle}
            value={form.ownershipType}
            onChange={(event) => setForm((current) => ({ ...current, ownershipType: event.target.value }))}
          >
            <option value="owned">Owned</option>
            <option value="leased">Leased</option>
            <option value="rented">Rented</option>
            <option value="other">Other</option>
          </select>
        </label>

        {field("Make", "make")}
        {field("Model", "model")}
        {field(marketProfile?.vehicleMassLabel ?? "Maximum vehicle weight", "mamKg", "number")}
        {market.country !== "IN" && <>
          {field(`${marketProfile?.registrationDocumentLabel ?? "Vehicle registration document"} URL (needed for approval)`, "v5cDocumentUrl", "url")}
          {field("Insurance document URL (needed for approval)", "insuranceDocumentUrl", "url")}
          <fieldset style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <legend style={{ fontSize: 14, fontWeight: 600 }}>Ownership and insurance</legend>
            <p style={{ fontSize: 14, marginTop: 0 }}>
              Approval needs commercial cover (hire and reward, or a fleet policy).
              {isFleet ? " For fleet accounts the registered keeper must be your company, or you must add a lease or hire agreement in the company's name, and the insurance policyholder must be the company." : ""}
            </p>
            <label style={{ display: "block", fontSize: 14 }}>
              Registered keeper is
              <select style={fieldStyle} value={form.registeredKeeperType} onChange={(event) => setForm((current) => ({ ...current, registeredKeeperType: event.target.value }))}>
                <option value="individual">An individual</option>
                <option value="company">A company</option>
              </select>
            </label>
            {field("Registered keeper name (as on the registration document)", "registeredKeeperName")}
            {field("Lease or hire agreement URL (if not kept by your company)", "leaseAgreementUrl", "url")}
            {field("Insurance policyholder name", "insurancePolicyholderName")}
            {field("Insurance policy number", "insurancePolicyNumber")}
            <label style={{ display: "block", fontSize: 14 }}>
              Insurance cover type
              <select style={fieldStyle} value={form.insuranceCoverType} onChange={(event) => setForm((current) => ({ ...current, insuranceCoverType: event.target.value }))}>
                {Object.entries(COVER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </fieldset>
          {field("Operator licence number (if applicable)", "operatorLicenceNo")}
          {field(marketProfile?.inspectionLabel ?? "Inspection valid until (if required)", "motValidUntil", "date", !expiryDatesOptional && Boolean(marketProfile?.inspectionRequiredAtCountryLevel))}
          <small>{marketProfile?.inspectionHelp}</small>
          <small>Relevant authority: {getJurisdictionAuthority(market.country, form.registrationRegion, market.currency)}.</small>
          {field("Insurance valid until", "insuranceValidUntil", "date", !expiryDatesOptional)}
        </>}

        <button type="submit" disabled={saving} style={{ padding: "11px 18px", minHeight: 44, borderRadius: 8, fontWeight: 650, cursor: saving ? "wait" : "pointer" }}>
          {saving ? "Submitting…" : "Register vehicle"}
        </button>
      </form>

      <h2 style={{ marginTop: 32 }}>Your vehicles</h2>
      {loading && <p role="status" aria-live="polite">Loading vehicles…</p>}
      {!loading && !loadError && vehicles.length === 0 && <p role="status">No vehicles registered yet.</p>}
      <div role="region" aria-label="Registered vehicles" style={{ display: "grid", gap: 12 }}>
        {vehicles.map((vehicle) => (
          <section key={vehicle.id} style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 16 }}>
            <strong>{vehicleTypeLabel(vehicle.vehicleType, market.country)} — {vehicle.regPlate}</strong>{vehicle.registrationRegion ? <span> · {getJurisdictionOptions(market.country).find((region) => region.code === vehicle.registrationRegion)?.label ?? vehicle.registrationRegion}</span> : null}
            <p>Status: <strong>{vehicle.verificationStatus}</strong></p>
            {vehicle.verificationStatus === "failed" && vehicle.rejectionReason && (
              <p role="note">Not approved: {vehicle.rejectionReason}{vehicle.correctionDeadline ? ` Correct it free of charge by ${formatMarketDate(vehicle.correctionDeadline, market)}.` : " A new check is needed."}</p>
            )}
            <p>Cover: {vehicle.insuranceCoverType ? COVER_LABELS[vehicle.insuranceCoverType] ?? vehicle.insuranceCoverType : "Not recorded"} · Keeper: {vehicle.registeredKeeperName || "Not recorded"}</p>
            {vehicle.additionalVehicleFeeMinorUnits ? <p>Additional vehicle check fee: {minorUnitsToMajorUnits(vehicle.additionalVehicleFeeMinorUnits, market.currency)} {market.currency} (payable; checkout not yet connected).</p> : null}
            <p>{[vehicle.make, vehicle.model, vehicle.mamKg ? `${marketProfile?.weightUnit === "lb" ? Math.round(vehicle.mamKg / 0.45359237).toLocaleString("en-US") + " lb GVWR" : vehicle.mamKg + " kg"}` : null].filter(Boolean).join(" · ") || "No additional vehicle details"}</p>
            <p>{marketProfile?.inspectionLabel ?? "Inspection expiry"}: {vehicle.motValidUntil ? formatMarketDate(vehicle.motValidUntil, market) : "Not recorded"}</p>
            <p>Insurance expiry: {vehicle.insuranceValidUntil ? formatMarketDate(vehicle.insuranceValidUntil, market) : "Not recorded"}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
