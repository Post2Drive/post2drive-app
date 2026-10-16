"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { VEHICLE_TYPES } from "@/lib/vehicles";

type Vehicle = {
  id: string;
  vehicleType: string;
  regPlate: string;
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
};

const initialForm = {
  vehicleType: VEHICLE_TYPES[0],
  regPlate: "",
  ownershipType: "owned",
  make: "",
  model: "",
  mamKg: "",
  v5cDocumentUrl: "",
  insuranceDocumentUrl: "",
  operatorLicenceNo: "",
  motValidUntil: "",
  insuranceValidUntil: "",
};

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isTester, setIsTester] = useState(false);
  const [testerApprovalStatus, setTesterApprovalStatus] = useState<string | null>(null);
  const expiryDatesOptional = isTester || testerApprovalStatus === "pending";
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/vehicles");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load vehicles.");
      setVehicles(data.vehicles || []);
      setIsTester(Boolean(data.isTester));
      setTesterApprovalStatus(data.testerApprovalStatus || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load vehicles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
      <p><Link href="/settings" className="button-link button-link-secondary">← Back to settings</Link></p>
      <h1>Vehicle onboarding</h1>
      {isTester && <p><strong>Account status: Tester</strong> — verification checks are bypassed for testing; vehicle records remain unverified. MOT and insurance expiry dates are optional for this test account.</p>}
      {testerApprovalStatus === "pending" && <p><strong>Tester application pending review.</strong> Add the details below for the administrator to review. Tester access is not enabled until approval. MOT and insurance expiry dates are optional while your application is pending.</p>}
      {testerApprovalStatus === "rejected" && <p><strong>Tester application rejected.</strong> Tester access has not been enabled. Contact the Post2Drive administrator if you believe this is an error.</p>}
      <p>Add your vehicle and supporting details. Registration does not mean the vehicle is verified or eligible for jobs.</p>

      {error && <p role="alert" style={{ color: "var(--color-danger, #b91c1c)" }}>{error}</p>}
      {message && <p role="status">{message}</p>}

      <form onSubmit={submit} style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 20 }}>
        <label style={{ display: "block", fontSize: 14 }}>
          Vehicle type
          <select
            style={fieldStyle}
            value={form.vehicleType}
            onChange={(event) => setForm((current) => ({ ...current, vehicleType: event.target.value }))}
          >
            {VEHICLE_TYPES.filter((type) => type !== "Other (specify in notes)").map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>

        {field("Registration plate", "regPlate", "text", true)}

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
        {field("Maximum authorised mass (kg)", "mamKg", "number")}
        {field("V5C document URL (optional)", "v5cDocumentUrl", "url")}
        {field("Insurance document URL (optional)", "insuranceDocumentUrl", "url")}
        {field("Operator licence number (if applicable)", "operatorLicenceNo")}
        {field("MOT valid until", "motValidUntil", "date", !expiryDatesOptional)}
        {field("Insurance valid until", "insuranceValidUntil", "date", !expiryDatesOptional)}

        <button type="submit" disabled={saving} style={{ padding: "11px 18px", minHeight: 42, borderRadius: 8, fontWeight: 650, cursor: saving ? "wait" : "pointer" }}>
          {saving ? "Submitting…" : "Register vehicle"}
        </button>
      </form>

      <h2 style={{ marginTop: 32 }}>Your vehicles</h2>
      {loading && <p>Loading vehicles…</p>}
      {!loading && vehicles.length === 0 && <p>No vehicles registered yet.</p>}
      <div style={{ display: "grid", gap: 12 }}>
        {vehicles.map((vehicle) => (
          <section key={vehicle.id} style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 16 }}>
            <strong>{vehicle.vehicleType} — {vehicle.regPlate}</strong>
            <p>Status: <strong>{vehicle.verificationStatus}</strong></p>
            <p>{[vehicle.make, vehicle.model, vehicle.mamKg ? `${vehicle.mamKg} kg MAM` : null].filter(Boolean).join(" · ") || "No additional vehicle details"}</p>
            <p>MOT expiry: {vehicle.motValidUntil ? new Date(vehicle.motValidUntil).toLocaleDateString() : "Not recorded"}</p>
            <p>Insurance expiry: {vehicle.insuranceValidUntil ? new Date(vehicle.insuranceValidUntil).toLocaleDateString() : "Not recorded"}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
