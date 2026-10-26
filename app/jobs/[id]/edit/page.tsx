"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { VEHICLE_TYPES } from "@/lib/vehicles";
import { getLocalisationProfile, getTimeZoneOptions } from "@/lib/localisation";

type Job = {
  id: string;
  pickup: string;
  dropoff: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  jobDate: string;
  pickupTime?: string | null;
  dropoffTime?: string | null;
  pickupTimeZone?: string | null;
  dropoffTimeZone?: string | null;
  vehicleType: string;
  weightKg?: number | null;
  dimensions?: string | null;
  price: number;
  pricePerMile?: number | null;
  currency: string;
  priceMode: "fixed" | "bid";
  notes?: string | null;
  status: string;
  posterAccountId: string;
  pickupContactName?: string | null;
  pickupContactPhone?: string | null;
  dropoffContactName?: string | null;
  dropoffContactPhone?: string | null;
};

function inputDate(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

export default function EditJobPage() {
  const params = useParams();
  const { data: session } = useSession();
  const country = (session?.user as any)?.country ?? "GB";
  const marketProfile = getLocalisationProfile({ country, currency: (session?.user as any)?.currency ?? "GBP" });
  const router = useRouter();

  const jobId = useMemo(() => {
    const value = params?.id;

    if (Array.isArray(value)) {
      return value[0] || "";
    }

    return value ? String(value) : "";
  }, [params]);

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [jobDate, setJobDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [dropoffTime, setDropoffTime] = useState("");
  const [pickupTimeZone, setPickupTimeZone] = useState(marketProfile?.timeZone ?? "UTC");
  const [dropoffTimeZone, setDropoffTimeZone] = useState(marketProfile?.timeZone ?? "UTC");
  const [vehicleType, setVehicleType] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [price, setPrice] = useState("");
  const [pricePerMile, setPricePerMile] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [priceMode, setPriceMode] = useState<"fixed" | "bid">("fixed");
  const [notes, setNotes] = useState("");
  const [pickupContactName, setPickupContactName] = useState("");
  const [pickupContactPhone, setPickupContactPhone] = useState("");
  const [dropoffContactName, setDropoffContactName] = useState("");
  const [dropoffContactPhone, setDropoffContactPhone] = useState("");

  const [pickupLat, setPickupLat] = useState("");
  const [pickupLng, setPickupLng] = useState("");
  const [dropoffLat, setDropoffLat] = useState("");
  const [dropoffLng, setDropoffLng] = useState("");

  useEffect(() => {
    if (!jobId) return;

    async function loadJob() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          cache: "no-store",
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load job.");
        }

        const loadedJob: Job = data?.job;

        if (!loadedJob) {
          throw new Error("Job was not found.");
        }

        setJob(loadedJob);

        setPickup(loadedJob.pickup || "");
        setDropoff(loadedJob.dropoff || "");
        setJobDate(inputDate(loadedJob.jobDate));
        setPickupTime(loadedJob.pickupTime || "");
        setDropoffTime(loadedJob.dropoffTime || "");
        setPickupTimeZone(loadedJob.pickupTimeZone || marketProfile?.timeZone || "UTC");
        setDropoffTimeZone(loadedJob.dropoffTimeZone || loadedJob.pickupTimeZone || marketProfile?.timeZone || "UTC");
        setVehicleType(loadedJob.vehicleType || "");
        setWeightKg(
          loadedJob.weightKg !== null &&
          loadedJob.weightKg !== undefined
            ? String(country === "US" ? loadedJob.weightKg / 0.45359237 : loadedJob.weightKg)
            : "",
        );
        setDimensions(loadedJob.dimensions || "");
        setPrice(
          loadedJob.price !== null &&
          loadedJob.price !== undefined
            ? String(loadedJob.price)
            : "",
        );
        setPricePerMile(
          loadedJob.pricePerMile !== null &&
          loadedJob.pricePerMile !== undefined
            ? String(marketProfile?.distanceUnit === "km" ? loadedJob.pricePerMile * 0.621371 : loadedJob.pricePerMile)
            : "",
        );
        setCurrency(loadedJob.currency || "GBP");
        setPriceMode(loadedJob.priceMode || "fixed");
        setNotes(loadedJob.notes || "");

        setPickupContactName(
          loadedJob.pickupContactName || "",
        );
        setPickupContactPhone(
          loadedJob.pickupContactPhone || "",
        );
        setDropoffContactName(
          loadedJob.dropoffContactName || "",
        );
        setDropoffContactPhone(
          loadedJob.dropoffContactPhone || "",
        );

        setPickupLat(
          loadedJob.pickupLat !== null &&
          loadedJob.pickupLat !== undefined
            ? String(loadedJob.pickupLat)
            : "",
        );
        setPickupLng(
          loadedJob.pickupLng !== null &&
          loadedJob.pickupLng !== undefined
            ? String(loadedJob.pickupLng)
            : "",
        );
        setDropoffLat(
          loadedJob.dropoffLat !== null &&
          loadedJob.dropoffLat !== undefined
            ? String(loadedJob.dropoffLat)
            : "",
        );
        setDropoffLng(
          loadedJob.dropoffLng !== null &&
          loadedJob.dropoffLng !== undefined
            ? String(loadedJob.dropoffLng)
            : "",
        );
      } catch (err: any) {
        setError(err?.message || "Failed to load job.");
      } finally {
        setLoading(false);
      }
    }

    loadJob();
  }, [jobId, country]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!jobId) {
      setError("Missing job ID.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        pickup: pickup.trim(),
        dropoff: dropoff.trim(),
        jobDate,
        pickupTime: pickupTime.trim() || undefined,
        dropoffTime: dropoffTime.trim() || undefined,
        pickupTimeZone,
        dropoffTimeZone,
        vehicleType,
        weightKg: weightKg.trim()
          ? Number(weightKg) * (country === "US" ? 0.45359237 : 1)
          : undefined,
        dimensions: dimensions.trim() || undefined,
        crossBorder: false,
        price: Number(price),
        pricePerMile: pricePerMile.trim()
          ? Number(pricePerMile) * (marketProfile?.distanceUnit === "km" ? 1.609344 : 1)
          : undefined,
        currency: currency.trim().toUpperCase(),
        priceMode,
        notes: notes.trim() || undefined,
        pickupContactName:
          pickupContactName.trim() || undefined,
        pickupContactPhone:
          pickupContactPhone.trim() || undefined,
        dropoffContactName:
          dropoffContactName.trim() || undefined,
        dropoffContactPhone:
          dropoffContactPhone.trim() || undefined,
        pickupLat: pickupLat.trim()
          ? Number(pickupLat)
          : undefined,
        pickupLng: pickupLng.trim()
          ? Number(pickupLng)
          : undefined,
        dropoffLat: dropoffLat.trim()
          ? Number(dropoffLat)
          : undefined,
        dropoffLng: dropoffLng.trim()
          ? Number(dropoffLng)
          : undefined,
      };

      const response = await fetch(`/api/jobs/${jobId}/edit`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Failed to update job.");
      }

      setSuccess(
        data?.bidsInvalidated
          ? "Job updated. Existing bids were invalidated because the job details changed."
          : "Job updated successfully.",
      );

      setJob(data?.job || job);

      setTimeout(() => {
        router.push("/jobs");
        router.refresh();
      }, 700);
    } catch (err: any) {
      setError(err?.message || "Failed to update job.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "30px 16px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h1 style={{ margin: "0 0 12px" }}>Edit job</h1>
        <p role="status">Loading job...</p>
      </main>
    );
  }

  if (error && !job) {
    return (
      <main
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "30px 16px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h1 style={{ margin: "0 0 16px" }}>Edit job</h1>
        <div
          style={{
            padding: 14,
            borderRadius: 8,
            background: "var(--color-danger-soft)",
            border: "1px solid var(--color-danger)",
            color: "var(--color-danger)",
            marginBottom: 16,
          }}
        >
          {error}
        </div>

        <Link href="/jobs" className="button-link button-link-secondary">Back to jobs</Link>
      </main>
    );
  }

  if (!job) {
    return (
      <main
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "30px 16px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h1 style={{ margin: "0 0 12px" }}>Edit job</h1>
        <p>Job not found.</p>
        <Link href="/jobs" className="button-link button-link-secondary">Back to jobs</Link>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "30px 16px 60px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Edit job</h1>
          <p
            style={{
              margin: "6px 0 0",
              color: "var(--color-muted)",
            }}
          >
            Update the details of your open job.
          </p>
        </div>

        <Link
          href="/jobs"
          style={{
            padding: "9px 13px",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            textDecoration: "none",
            color: "var(--color-text)",
            background: "var(--ops-surface-raised)",
          }}
         className="button-link button-link-secondary">
          Back to jobs
        </Link>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 8,
            background: "var(--color-danger-soft)",
            border: "1px solid var(--color-danger)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 8,
            background: "var(--color-positive-soft)",
            border: "1px solid var(--color-positive)",
            color: "var(--color-positive)",
          }}
        >
          {success}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: 18,
        }}
      >
        <section
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>
            Route
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 14,
            }}
          >
            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Pickup
              </div>
              <input
                value={pickup}
                onChange={(event) =>
                  setPickup(event.target.value)
                }
                required
                maxLength={300}
                style={inputStyle}
              />
            </label>

            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Drop-off
              </div>
              <input
                value={dropoff}
                onChange={(event) =>
                  setDropoff(event.target.value)
                }
                required
                maxLength={300}
                style={inputStyle}
              />
            </label>

            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Job date
              </div>
              <input
                type="date"
                value={jobDate}
                onChange={(event) =>
                  setJobDate(event.target.value)
                }
                required
                style={inputStyle}
              />
            </label>

            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Pickup time
              </div>
              <input
                type="time"
                value={pickupTime}
                onChange={(event) =>
                  setPickupTime(event.target.value)
                }
                style={inputStyle}
              />
            </label>

            {getTimeZoneOptions(country, marketProfile?.timeZone).length > 1 && (
              <label>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Pickup time zone</div>
                <select value={pickupTimeZone} onChange={(event) => setPickupTimeZone(event.target.value)} style={inputStyle} required>
                  {getTimeZoneOptions(country, marketProfile?.timeZone).map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
                </select>
              </label>
            )}
            {getTimeZoneOptions(country, marketProfile?.timeZone).length > 1 && (
              <label>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Drop-off time zone</div>
                <select value={dropoffTimeZone} onChange={(event) => setDropoffTimeZone(event.target.value)} style={inputStyle} required>
                  {getTimeZoneOptions(country, marketProfile?.timeZone).map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
                </select>
              </label>
            )}
            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Drop-off time
              </div>
              <input
                type="time"
                value={dropoffTime}
                onChange={(event) =>
                  setDropoffTime(event.target.value)
                }
                style={inputStyle}
              />
            </label>
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>
            Vehicle & cargo
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Vehicle type
              </div>
              <select
                value={vehicleType}
                onChange={(event) =>
                  setVehicleType(event.target.value)
                }
                required
                style={inputStyle}
              >
                <option value="">Select vehicle</option>

                {VEHICLE_TYPES.map((vehicle) => (
                  <option key={vehicle} value={vehicle}>
                    {vehicle}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Weight ({marketProfile?.weightUnit ?? "kg"})
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={weightKg}
                onChange={(event) =>
                  setWeightKg(event.target.value)
                }
                style={inputStyle}
              />
            </label>

            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Dimensions
              </div>
              <input
                value={dimensions}
                onChange={(event) =>
                  setDimensions(event.target.value)
                }
                maxLength={150}
                placeholder="e.g. 120 x 80 x 100 cm"
                style={inputStyle}
              />
            </label>
          </div>

          
        </section>

        <section
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>
            Pricing
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
            }}
          >
            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Price mode
              </div>
              <select
                value={priceMode}
                onChange={(event) =>
                  setPriceMode(
                    event.target.value as "fixed" | "bid",
                  )
                }
                style={inputStyle}
              >
                <option value="fixed">Fixed price</option>
                <option value="bid">Open to bids</option>
              </select>
            </label>

            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Price
              </div>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={price}
                onChange={(event) =>
                  setPrice(event.target.value)
                }
                required
                style={inputStyle}
              />
            </label>

            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Currency
              </div>
              <input
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value.toUpperCase())
                }
                maxLength={3}
                required
                style={inputStyle}
              />
            </label>

            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Price per {marketProfile?.distanceUnit ?? "mile"}
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={pricePerMile}
                onChange={(event) =>
                  setPricePerMile(event.target.value)
                }
                style={inputStyle}
              />
            </label>
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>
            Site contacts
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 18,
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: 15,
                  margin: "0 0 10px",
                }}
              >
                Pickup contact
              </h3>

              <div style={{ display: "grid", gap: 10 }}>
                <input
                  value={pickupContactName}
                  onChange={(event) =>
                    setPickupContactName(event.target.value)
                  }
                  maxLength={150}
                  placeholder="Name"
                  style={inputStyle}
                />

                <input
                  value={pickupContactPhone}
                  onChange={(event) =>
                    setPickupContactPhone(event.target.value)
                  }
                  maxLength={50}
                  placeholder="Phone"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <h3
                style={{
                  fontSize: 15,
                  margin: "0 0 10px",
                }}
              >
                Drop-off contact
              </h3>

              <div style={{ display: "grid", gap: 10 }}>
                <input
                  value={dropoffContactName}
                  onChange={(event) =>
                    setDropoffContactName(event.target.value)
                  }
                  maxLength={150}
                  placeholder="Name"
                  style={inputStyle}
                />

                <input
                  value={dropoffContactPhone}
                  onChange={(event) =>
                    setDropoffContactPhone(event.target.value)
                  }
                  maxLength={50}
                  placeholder="Phone"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>
            Map coordinates
          </h2>

          <p
            style={{
              margin: "0 0 14px",
              color: "var(--color-muted)",
              fontSize: 13,
            }}
          >
            Coordinates are optional. Leave them blank if the
            address is sufficient.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
            }}
          >
            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Pickup latitude
              </div>
              <input
                type="number"
                step="any"
                value={pickupLat}
                onChange={(event) =>
                  setPickupLat(event.target.value)
                }
                style={inputStyle}
              />
            </label>

            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Pickup longitude
              </div>
              <input
                type="number"
                step="any"
                value={pickupLng}
                onChange={(event) =>
                  setPickupLng(event.target.value)
                }
                style={inputStyle}
              />
            </label>

            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Drop-off latitude
              </div>
              <input
                type="number"
                step="any"
                value={dropoffLat}
                onChange={(event) =>
                  setDropoffLat(event.target.value)
                }
                style={inputStyle}
              />
            </label>

            <label>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Drop-off longitude
              </div>
              <input
                type="number"
                step="any"
                value={dropoffLng}
                onChange={(event) =>
                  setDropoffLng(event.target.value)
                }
                style={inputStyle}
              />
            </label>
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>
            Notes
          </h2>

          <textarea
            value={notes}
            onChange={(event) =>
              setNotes(event.target.value)
            }
            maxLength={5000}
            rows={7}
            placeholder="Special instructions, loading details, access information, etc."
            style={{
              ...inputStyle,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </section>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/jobs"
            style={{
              padding: "11px 16px",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              textDecoration: "none",
              color: "var(--color-text)",
              background: "var(--ops-surface-raised)",
            }}
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "11px 18px",
              border: "1px solid var(--color-primary-action)",
              borderRadius: 8,
              color: "#FFFFFF",
              background: "var(--color-primary-action)",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 11px",
  border: "1px solid var(--ops-border-strong)",
  borderRadius: 8,
  background: "var(--ops-surface-inset)",
  fontSize: 14,
};