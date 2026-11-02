"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";

type Job = {
  id: string;
  title: string;
  description: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  vehicleType: string;
  status: string;
  priceType: string;
  priceAmount: number | null;
  currencyCode: string;
  collectAt: string | null;
  weightKg: number | null;
  palletCount: number | null;
  requiresTailift: boolean;
  requiresRefrigeration: boolean;
  notes: string | null;
  ownerId: string;
};

const VEHICLE_TYPES = [
  "Bicycle courier",
  "Motorcycle courier",
  "Car",
  "Small van",
  "Transit van",
  "Luton van",
  "7.5 tonne",
  "18 tonne",
  "Artic",
  "Curtainsider",
  "Flatbed",
  "Refrigerated",
  "Tipper",
  "Tanker",
  "Livestock",
  "Vehicle transporter",
  "Specialist",
  "Tempo",
  "Tata Ace",
  "Mini truck",
  "Container truck",
];

export default function EditJobPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { data: session, status: authStatus } = useSession();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fetchError, setFetchError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [priceType, setPriceType] = useState("fixed");
  const [priceAmount, setPriceAmount] = useState("");
  const [collectAt, setCollectAt] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [palletCount, setPalletCount] = useState("");
  const [requiresTailift, setRequiresTailift] = useState(false);
  const [requiresRefrigeration, setRequiresRefrigeration] = useState(false);
  const [notes, setNotes] = useState("");

  const fetchJob = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch(`/api/jobs/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFetchError(data.error || "Could not load this job.");
        return;
      }
      const data: Job = await res.json();
      setJob(data);
      setTitle(data.title);
      setDescription(data.description || "");
      setPickupAddress(data.pickupAddress);
      setDeliveryAddress(data.deliveryAddress);
      setVehicleType(data.vehicleType);
      setPriceType(data.priceType);
      setPriceAmount(data.priceAmount !== null ? String(data.priceAmount) : "");
      setCollectAt(
        data.collectAt ? new Date(data.collectAt).toISOString().slice(0, 16) : "",
      );
      setWeightKg(data.weightKg !== null ? String(data.weightKg) : "");
      setPalletCount(data.palletCount !== null ? String(data.palletCount) : "");
      setRequiresTailift(data.requiresTailift);
      setRequiresRefrigeration(data.requiresRefrigeration);
      setNotes(data.notes || "");
    } catch {
      setFetchError("Network error. Could not load this job.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (authStatus === "authenticated") fetchJob();
  }, [authStatus, fetchJob, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) { setError("Job title is required."); return; }
    if (!pickupAddress.trim()) { setError("Pickup address is required."); return; }
    if (!deliveryAddress.trim()) { setError("Delivery address is required."); return; }
    if (!vehicleType) { setError("Select a vehicle type."); return; }
    if (priceType === "fixed" && (!priceAmount || isNaN(Number(priceAmount)) || Number(priceAmount) <= 0)) {
      setError("Enter a valid fixed price.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          pickupAddress: pickupAddress.trim(),
          deliveryAddress: deliveryAddress.trim(),
          vehicleType,
          priceType,
          priceAmount: priceType === "fixed" ? Number(priceAmount) : null,
          collectAt: collectAt ? new Date(collectAt).toISOString() : null,
          weightKg: weightKg ? Number(weightKg) : null,
          palletCount: palletCount ? Number(palletCount) : null,
          requiresTailift,
          requiresRefrigeration,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save changes.");
        return;
      }
      router.push(`/jobs/${id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (authStatus === "loading" || loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <p role="status" aria-live="polite">Loading job…</p>
      </main>
    );
  }

  if (fetchError) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          role="alert"
          style={{
            padding: 14,
            borderRadius: 8,
            background: "#fff0f0",
            border: "1px solid #f5c6cb",
            color: "#721c24",
          }}
        >
          <p>{fetchError}</p>
          <button type="button" onClick={fetchJob}>Retry</button>
        </div>
      </main>
    );
  }

  if (!job) return null;

  const isOwner = (session?.user as { accountId?: string })?.accountId === job.ownerId;
  if (!isOwner) {
    return (
      <main style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
        <p>You do not have permission to edit this job.</p>
        <a href={`/jobs/${id}`}>View job</a>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "20px 16px", fontFamily: "Arial, sans-serif" }}>
      <nav style={{ marginBottom: 12 }}>
        <a href={`/jobs/${id}`} style={{ fontSize: 14, color: "#555" }}>← Back to job</a>
      </nav>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>Edit job</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Job title *</span>
            <input value={title} onChange={e => setTitle(e.target.value)} required maxLength={120}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15 }} />
          </label>
          <label>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Description</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} rows={3}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15, resize: "vertical" }} />
          </label>
          <label>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Pickup address *</span>
            <input value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} required maxLength={300}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15 }} />
          </label>
          <label>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Delivery address *</span>
            <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} required maxLength={300}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15 }} />
          </label>
          <label>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Vehicle type *</span>
            <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} required
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15 }}>
              <option value="">Select vehicle type</option>
              {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Price type *</span>
            <select value={priceType} onChange={e => setPriceType(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15 }}>
              <option value="fixed">Fixed price</option>
              <option value="negotiable">Negotiable</option>
            </select>
          </label>
          {priceType === "fixed" && (
            <label>
              <span style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Price amount *</span>
              <input type="number" min="0" step="0.01" value={priceAmount} onChange={e => setPriceAmount(e.target.value)} required
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15 }} />
            </label>
          )}
          <label>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Collection date/time</span>
            <input type="datetime-local" value={collectAt} onChange={e => setCollectAt(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15 }} />
          </label>
          <label>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Weight (kg)</span>
            <input type="number" min="0" step="0.1" value={weightKg} onChange={e => setWeightKg(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15 }} />
          </label>
          <label>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Pallet count</span>
            <input type="number" min="0" step="1" value={palletCount} onChange={e => setPalletCount(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={requiresTailift} onChange={e => setRequiresTailift(e.target.checked)} />
            <span style={{ fontSize: 14 }}>Requires tailift</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={requiresRefrigeration} onChange={e => setRequiresRefrigeration(e.target.checked)} />
            <span style={{ fontSize: 14 }}>Requires refrigeration</span>
          </label>
          <label>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Notes</span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={3}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15, resize: "vertical" }} />
          </label>
          {error && <p role="alert" style={{ color: "#c0392b", margin: 0, fontSize: 14 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="submit" disabled={saving}
              style={{ padding: "10px 22px", background: saving ? "#aaa" : "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, fontSize: 15, cursor: saving ? "not-allowed" : "pointer", fontWeight: 600 }}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <a href={`/jobs/${id}`}
              style={{ padding: "10px 16px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15, color: "#333", textDecoration: "none" }}>
              Cancel
            </a>
          </div>
        </div>
      </form>
    </main>
  );
}
