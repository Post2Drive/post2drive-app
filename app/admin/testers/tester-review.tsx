"use client";

import { formatMarketDate, formatMarketDateTime, getLocalisationProfile, getJurisdictionOptions, getJurisdictionAuthority } from "@/lib/localisation";
import { vehicleTypeLabel } from "@/lib/vehicles";

import { useCallback, useEffect, useState } from "react";

type AccessCode = {
  id: string; createdAt: string; claimedAt: string | null; claimedByAccountId: string | null;
  claimedByAccount: {
    id: string; companyName: string; companyNumber: string | null; isSoleTrader: boolean;
    country: string; currency: string; planType: string; fleetVehicleCount: number | null;
    users: { name: string; email: string; phone: string; role: string }[];
  } | null;
};

type Application = {
  id: string;
  companyName: string;
  companyNumber: string | null;
  isSoleTrader: boolean;
  country: string;
  currency: string;
  planType: string;
  fleetVehicleCount: number | null;
  createdAt: string;
  verificationStatus: string;
  users: { name: string; email: string; phone: string; role: string; emailVerifiedAt: string | null }[];
  vehicles: {
    id: string; vehicleType: string; regPlate: string; registrationRegion: string | null; ownershipType: string | null;
    make: string | null; model: string | null; mamKg: number | null;
    v5cDocumentUrl: string | null; insuranceDocumentUrl: string | null;
    operatorLicenceNo: string | null; motValidUntil: string | null;
    insuranceValidUntil: string | null; verificationStatus: string;
  }[];
};

export default function TesterReview() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [newCode, setNewCode] = useState("");
  const [generatingCode, setGeneratingCode] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/testers");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load applications.");
      setApplications(data.applications || []);
      setAccessCodes(data.accessCodes || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(accountId: string, decision: "approve" | "reject") {
    const prompt = decision === "approve"
      ? "Approve this tester? Their normal promotional trial starts now."
      : "Reject this tester application? The single-use code remains consumed.";
    if (!window.confirm(prompt)) return;
    setBusyId(accountId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/testers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Review failed.");
      setMessage(decision === "approve" ? "Tester approved; trial has started." : "Tester application rejected.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed.");
    } finally {
      setBusyId("");
    }
  }

  async function generateCode() {
    setGeneratingCode(true);
    setError("");
    setMessage("");
    setNewCode("");
    try {
      const response = await fetch("/api/admin/testers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-code" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate a code.");
      setNewCode(data.code);
      setMessage("Tester code generated. Copy it now; the code itself will not be shown again.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate a code.");
    } finally {
      setGeneratingCode(false);
    }
  }

  const panel: React.CSSProperties = { border: "1px solid var(--color-border)", borderRadius: 12, padding: 18, marginBottom: 16 };
  const label: React.CSSProperties = { color: "var(--color-muted)", fontSize: 13 };

  return <section>
    <p style={label}>Review the submitted account, contact details and vehicle information before granting tester access. Approval starts the standard promotion; rejection does not restore the single-use code.</p>
    <article style={panel}>
      <h2 style={{ marginTop: 0 }}>Individual tester codes</h2>
      <p style={label}>Generate a code and share it with any tester. Each code can be used once. After signup, this history shows the actual details entered by the person who redeemed it. The raw code is shown only immediately after generation.</p>
      <button type="button" disabled={generatingCode} onClick={() => void generateCode()}>{generatingCode ? "Generating…" : "Generate tester code"}</button>
      {newCode && <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--color-border)", borderRadius: 8 }}>
        <p><strong>Copy this code now</strong></p>
        <code style={{ fontSize: 18, fontWeight: 700 }}>{newCode}</code>
        <button type="button" style={{ marginLeft: 12 }} onClick={() => { void navigator.clipboard.writeText(newCode); }}>Copy code</button>
      </div>}
      <h3>Code history</h3>
      <p style={label}>Unused codes have no signup details yet. When a code is redeemed, the account details entered during signup appear here. Raw codes are never stored in plain text.</p>
      {accessCodes.length === 0 ? <p>No codes generated yet.</p> : <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr>{["Status", "Signup details / redeemed by", "Code created", "Code redeemed"].map((heading) => <th key={heading} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid var(--color-border)" }}>{heading}</th>)}</tr></thead>
          <tbody>{accessCodes.map((code) => <tr key={code.id}>
            <td style={{ padding: "10px 8px", verticalAlign: "top", borderBottom: "1px solid var(--color-border)" }}><strong>{code.claimedAt ? "Redeemed" : "Unused"}</strong></td>
            <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--color-border)" }}>{code.claimedByAccount ? <>
              <strong>{code.claimedByAccount.users.map((user) => user.name).join(", ") || "Name not recorded"}</strong>
              {code.claimedByAccount.users.map((user) => <div key={user.email} style={label}>{user.email} · {user.phone} · {user.role}</div>)}
              <div>{code.claimedByAccount.companyName}{code.claimedByAccount.isSoleTrader ? " (sole trader)" : ""}</div>
              <div style={label}>{code.claimedByAccount.companyNumber ? `Company no. ${code.claimedByAccount.companyNumber} · ` : ""}{code.claimedByAccount.country} · {code.claimedByAccount.currency} · {code.claimedByAccount.planType === "fleet" ? `Fleet (${code.claimedByAccount.fleetVehicleCount ?? "—"} vehicles)` : "Individual"} · ID {code.claimedByAccount.id}</div>
            </> : code.claimedByAccountId ? `Account ID: ${code.claimedByAccountId}` : "Not used yet"}</td>
            <td style={{ padding: "10px 8px", verticalAlign: "top", borderBottom: "1px solid var(--color-border)" }}>{new Date(code.createdAt).toLocaleString("en-GB")}</td>
            <td style={{ padding: "10px 8px", verticalAlign: "top", borderBottom: "1px solid var(--color-border)" }}>{code.claimedAt ? new Date(code.claimedAt).toLocaleString("en-GB") : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </article>
    {error && <p role="alert" style={{ color: "var(--color-danger, #b91c1c)" }}>{error}</p>}
    {message && <p role="status">{message}</p>}
    {loading && <p>Loading applications…</p>}
    {!loading && applications.length === 0 && <p>No pending tester applications.</p>}
    {applications.map((app) => <article key={app.id} style={panel}>
      <h2 style={{ marginTop: 0 }}>{app.companyName}</h2>
      <p><strong>Submitted:</strong> {formatMarketDateTime(app.createdAt, { country: app.country, currency: app.currency })} · <strong>Plan:</strong> {app.planType}{app.fleetVehicleCount ? ` (${app.fleetVehicleCount} vehicles)` : ""}</p>
      <p><strong>Company number:</strong> {app.companyNumber || "Not supplied"} · <strong>Sole trader:</strong> {app.isSoleTrader ? "Yes" : "No"}</p>
      <p><strong>Location/currency:</strong> {app.country} / {app.currency} · <strong>Account verification:</strong> {app.verificationStatus}</p>
      <h3>Contact details</h3>
      {app.users.map((user) => <p key={user.email}>{user.name} · {user.email} · {user.phone} · {user.role} · Email: {user.emailVerifiedAt ? "Verified" : "Not verified"}</p>)}
      <h3>Vehicles</h3>
      {app.vehicles.length === 0 && <p>No vehicle submitted yet.</p>}
      {app.vehicles.map((v) => <div key={v.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10, marginTop: 10 }}>
        <p><strong>{vehicleTypeLabel(v.vehicleType, app.country)} — {v.regPlate}</strong>{v.registrationRegion ? ` · ${getJurisdictionOptions(app.country).find((region) => region.code === v.registrationRegion)?.label ?? v.registrationRegion}` : ""} · {v.ownershipType || "Ownership not specified"} · Status: {v.verificationStatus}</p>
        <p>{[v.make, v.model, v.mamKg ? `${app.country === "US" ? Math.round(v.mamKg / 0.45359237).toLocaleString("en-US") + " lb GVWR" : v.mamKg + " kg"}` : null].filter(Boolean).join(" · ") || "No extra details"}</p>
                <p>Registration authority: {getJurisdictionAuthority(app.country, v.registrationRegion, app.currency)}</p>
        <p>{getLocalisationProfile({ country: app.country, currency: app.currency })?.inspectionLabel ?? "Inspection"}: {v.motValidUntil ? formatMarketDate(v.motValidUntil, { country: app.country, currency: app.currency }) : "Not supplied"} · Insurance: {v.insuranceValidUntil ? formatMarketDate(v.insuranceValidUntil, { country: app.country, currency: app.currency }) : "Not supplied"}</p>
        {v.v5cDocumentUrl && <p><a href={v.v5cDocumentUrl} target="_blank" rel="noreferrer">Open registration document</a></p>}
        {v.insuranceDocumentUrl && <p><a href={v.insuranceDocumentUrl} target="_blank" rel="noreferrer">Open insurance document</a></p>}
        {v.operatorLicenceNo && <p>Operator licence: {v.operatorLicenceNo}</p>}
      </div>)}
      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button disabled={!!busyId} onClick={() => void decide(app.id, "approve")}>{busyId === app.id ? "Processing…" : "Approve tester"}</button>
        <button disabled={!!busyId} onClick={() => void decide(app.id, "reject")}>{busyId === app.id ? "Processing…" : "Reject application"}</button>
      </div>
    </article>)}
  </section>;
}
