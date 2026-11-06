"use client";

import { useCallback, useEffect, useState } from "react";
import { vehicleTypeLabel } from "@/lib/vehicles";

type ReviewVehicle = {
  id: string;
  vehicleType: string;
  regPlate: string;
  make: string | null;
  model: string | null;
  operatorLicenceNo: string | null;
  v5cDocumentUrl: string | null;
  insuranceDocumentUrl: string | null;
  leaseAgreementUrl: string | null;
  motValidUntil: string | null;
  insuranceValidUntil: string | null;
  registeredKeeperType: string | null;
  registeredKeeperName: string | null;
  insurancePolicyholderName: string | null;
  insuranceCoverType: string | null;
  insurancePolicyNumber: string | null;
  verificationStatus: string;
  rejectionCount: number;
  createdAt: string;
  insurancePolicyReviewedAt: string | null;
  approvalProblems: string[];
  account: {
    id: string;
    displayId: string;
    companyName: string;
    planType: string;
    fleetVehicleCount: number | null;
    country: string;
    currency: string;
    vehicleCount: number;
    driverLicenceLast4: string | null;
  };
};

const COVER_LABELS: Record<string, string> = { hire_and_reward: "Hire and reward", fleet: "Fleet", other: "Other (not commercial)" };
const day = (value: string | null) => (value ? value.slice(0, 10) : "Not recorded");

function DocumentLink({ label, href }: { label: string; href: string | null }) {
  if (!href) return <li>{label}: <strong>missing</strong></li>;
  return <li><a href={href} target="_blank" rel="noopener noreferrer">{label} (opens in a new tab)</a></li>;
}

/*
 * Admin review queue. Seen many times a day, so no motion (Emil: frequency-based
 * animation decisions). Native buttons/labels, visible status messages, and the
 * server re-checks every approval rule; the list of problems here is advisory.
 */
export default function VehicleReviewAdminPage() {
  const [vehicles, setVehicles] = useState<ReviewVehicle[]>([]);
  const [message, setMessage] = useState<{ text: string; error: boolean }>({ text: "Loading vehicles awaiting review…", error: false });
  const [busyId, setBusyId] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/vehicles", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load vehicles.");
      setVehicles(data.vehicles || []);
      setMessage({ text: (data.vehicles || []).length ? "" : "No vehicles are awaiting review.", error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Unable to load vehicles.", error: true });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function review(vehicle: ReviewVehicle, decision: "approve" | "reject") {
    setBusyId(vehicle.id);
    setMessage({ text: "", error: false });
    try {
      const response = await fetch("/api/admin/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: vehicle.id, decision, reason: reasons[vehicle.id] || "" }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error([data.error || "Unable to save review.", ...(data.problems || [])].join(" "));
      }
      setVehicles((current) => current.filter((item) => item.id !== vehicle.id));
      setMessage({ text: `${vehicle.regPlate}: ${decision === "approve" ? "approved" : "rejected"}. The account was notified and the decision audit logged.`, error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Unable to save review.", error: true });
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Vehicle review</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
        Open each document and check it against the details below before approving. Approval needs commercial cover; fleet
        vehicles also need the company as keeper (or a lease in its name) and as insurance policyholder.
      </p>
      {message.text ? (
        <p role={message.error ? "alert" : "status"} className="my-4 text-sm" style={message.error ? { color: "var(--color-danger)" } : undefined}>
          {message.text}
        </p>
      ) : null}
      <div className="mt-6 space-y-4">
        {vehicles.map((vehicle) => {
          const fleet = vehicle.account.planType === "fleet" || (vehicle.account.fleetVehicleCount ?? 0) >= 2 || vehicle.account.vehicleCount >= 2;
          const reasonId = `reason-${vehicle.id}`;
          const problemsId = `problems-${vehicle.id}`;
          return (
            <section key={vehicle.id} aria-labelledby={`vehicle-${vehicle.id}`} className="rounded border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
              <h2 id={`vehicle-${vehicle.id}`} className="font-semibold">
                {vehicle.regPlate} · {vehicleTypeLabel(vehicle.vehicleType, vehicle.account.country)}{vehicle.make || vehicle.model ? ` · ${[vehicle.make, vehicle.model].filter(Boolean).join(" ")}` : ""}
              </h2>
              <p className="mt-1 text-sm">
                {vehicle.account.companyName} ({vehicle.account.displayId}) · {fleet ? "Fleet" : "Individual driver"} · {vehicle.account.vehicleCount} vehicle{vehicle.account.vehicleCount === 1 ? "" : "s"} · {vehicle.account.country}/{vehicle.account.currency}
              </p>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div><dt className="inline font-medium">Keeper: </dt><dd className="inline">{vehicle.registeredKeeperName || "Not recorded"} ({vehicle.registeredKeeperType || "type not given"})</dd></div>
                <div><dt className="inline font-medium">Policyholder: </dt><dd className="inline">{vehicle.insurancePolicyholderName || "Not recorded"}</dd></div>
                <div><dt className="inline font-medium">Cover: </dt><dd className="inline">{vehicle.insuranceCoverType ? COVER_LABELS[vehicle.insuranceCoverType] ?? vehicle.insuranceCoverType : "Not recorded"}</dd></div>
                <div><dt className="inline font-medium">Policy number: </dt><dd className="inline">{vehicle.insurancePolicyNumber || "Not recorded"}{vehicle.insurancePolicyReviewedAt ? ` (policy already reviewed ${day(vehicle.insurancePolicyReviewedAt)})` : ""}</dd></div>
                <div><dt className="inline font-medium">Insurance expiry: </dt><dd className="inline">{day(vehicle.insuranceValidUntil)}</dd></div>
                <div><dt className="inline font-medium">MOT / inspection expiry: </dt><dd className="inline">{day(vehicle.motValidUntil)}</dd></div>
                <div><dt className="inline font-medium">Driver licence: </dt><dd className="inline">{fleet ? "Declared per job by the fleet" : vehicle.account.driverLicenceLast4 ? `ending ${vehicle.account.driverLicenceLast4}` : "Not recorded"}</dd></div>
                <div><dt className="inline font-medium">Previous rejections: </dt><dd className="inline">{vehicle.rejectionCount}</dd></div>
              </dl>
              <ul className="mt-3 list-disc pl-5 text-sm">
                <DocumentLink label="Registration document" href={vehicle.v5cDocumentUrl} />
                <DocumentLink label="Insurance document" href={vehicle.insuranceDocumentUrl} />
                {vehicle.leaseAgreementUrl ? <DocumentLink label="Lease / hire agreement" href={vehicle.leaseAgreementUrl} /> : null}
              </ul>
              {vehicle.approvalProblems.length > 0 ? (
                <div id={problemsId} className="mt-3 rounded p-3 text-sm" style={{ background: "var(--color-warning-soft)", color: "var(--color-text)" }}>
                  <p className="font-medium">Cannot be approved yet:</p>
                  <ul className="list-disc pl-5">{vehicle.approvalProblems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
                </div>
              ) : null}
              <label htmlFor={reasonId} className="mt-3 block text-sm">Rejection reason (sent to the account)</label>
              <textarea id={reasonId} maxLength={1000} rows={2} value={reasons[vehicle.id] || ""}
                onChange={(event) => setReasons((current) => ({ ...current, [vehicle.id]: event.target.value }))}
                className="mt-1 w-full rounded border px-3 py-2" style={{ borderColor: "var(--color-border)" }} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={Boolean(busyId) || vehicle.approvalProblems.length > 0}
                  aria-describedby={vehicle.approvalProblems.length > 0 ? problemsId : undefined}
                  onClick={() => void review(vehicle, "approve")}
                  className="rounded px-3 py-2 text-sm disabled:opacity-50" style={{ minHeight: 44, background: "var(--color-primary-action)", color: "#fff" }}>
                  Approve
                </button>
                <button type="button" disabled={Boolean(busyId) || (reasons[vehicle.id] || "").trim().length < 5}
                  onClick={() => void review(vehicle, "reject")}
                  className="rounded border px-3 py-2 text-sm disabled:opacity-50" style={{ minHeight: 44, borderColor: "var(--color-border)" }}>
                  Reject with reason
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
