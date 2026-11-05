
"use client";

import ActivityHistory from "./activity-history";
import { RATING_REASONS } from "@/lib/ratingPolicy";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { symbolFor, COUNTRIES } from "@/lib/currency";
import { formatMarketDate, formatMarketCurrency, getLocalisationProfile, getTimeZoneOptions } from "@/lib/localisation";
import { vehicleTypeLabel } from "@/lib/vehicles";
import { currencyMinorUnitScale } from "@/lib/currencyMinorUnits";

type Contact = {
  companyName: string;
  displayId?: string;
  createdAt?: string;
  users?: {
    name: string;
    phone: string;
    email: string;
  }[];
};

type Job = {
  id: string;
  pickup: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoff: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  jobDate: string;
  pickupTime: string | null;
  dropoffTime: string | null;
  pickupTimeZone?: string | null;
  dropoffTimeZone?: string | null;
  vehicleType: string;
  weightKg: number | null;
  dimensions: string | null;
  price: number;
  pricePerMile: number | null;
  currency: string;
  priceMode: string;
  notes: string | null;
  status: string;
  isCurrentUserPoster: boolean;
  isCurrentUserAcceptedDriver: boolean;
  hasAcceptedDriver: boolean;
  currentUserMarkedDelivery: boolean;
  currentUserConfirmedPickup: boolean;
  hasPreviousDrivers?: boolean;
  currentUserPreviouslyBackedOut?: boolean;
  crossBorder: boolean;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  poster: Contact;
  acceptedBy: Contact | null;
};

type Bid = {
  id: string;
  amount: number;
  bidder: {
    companyName: string;
    displayId: string;
    createdAt: string;
  };
};

const primaryButtonStyle: React.CSSProperties = {
  background: "var(--color-primary-action)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "9px 14px",
  fontWeight: 700,
};

const secondaryButtonStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "9px 14px",
  fontWeight: 600,
};

const dangerButtonStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  color: "var(--color-danger)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "9px 14px",
  fontWeight: 600,
};

// User-facing categories mapped from the underlying job statuses.
const TABS = [
  {
    key: "open",
    label: "Open",
    statuses: ["open"],
  },
  {
    key: "in_progress",
    label: "In Progress",
    statuses: [
      "accepted",
      "in_transit",
      "delivered",
    ],
  },
  {
    key: "completed",
    label: "Completed",
    statuses: ["completed"],
  },
  {
    key: "cancelled",
    label: "Cancelled",
    statuses: ["cancelled"],
  },
  {
    key: "all",
    label: "All",
    statuses: [],
  },
];

function ageText(
  createdAt?: string
) {
  if (!createdAt) return null;

  const days = Math.floor(
    (Date.now() -
      new Date(
        createdAt
      ).getTime()) /
      (1000 *
        60 *
        60 *
        24)
  );

  if (days < 1) {
    return "joined today";
  }

  if (days < 30) {
    return `${days} day${
      days === 1 ? "" : "s"
    } on platform`;
  }

  if (days < 365) {
    const months =
      Math.floor(days / 30);

    return `${months} month${
      months === 1 ? "" : "s"
    } on platform`;
  }

  const years =
    Math.floor(days / 365);

  return `${years} year${
    years === 1 ? "" : "s"
  } on platform`;
}

function navLink(
  address: string,
  lat: number | null,
  lng: number | null,
  originAddress?: string,
  originLat?: number | null,
  originLng?: number | null
) {
  const destination =
    lat != null &&
    lng != null
      ? `${lat},${lng}`
      : encodeURIComponent(
          address
        );

  const origin =
    originLat != null &&
    originLng != null
      ? `${originLat},${originLng}`
      : originAddress
      ? encodeURIComponent(
          originAddress
        )
      : "";

  const originParam = origin
    ? `&origin=${origin}`
    : "";

  return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${destination}&travelmode=driving`;
}

export default function JobsPage() {
  const { data: session } =
    useSession();

  const [jobs, setJobs] =
    useState<Job[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] = useState("");

  const [message, setMessage] =
    useState("");

  // Prevent repeated clicks from dispatching duplicate lifecycle mutations.
  const actionInFlight = useRef(false);
  const bidInFlight = useRef(false);
  const ratingInFlight = useRef(false);

  const [bidAmounts, setBidAmounts] =
    useState<
      Record<string, string>
    >({});

  const [openBids, setOpenBids] =
    useState<
      Record<string, Bid[]>
    >({});

  const [tab, setTab] =
    useState("open");

  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "pickup" | "price">("newest");

  const [
    ratingInputs,
    setRatingInputs,
  ] = useState<
    Record<
      string,
      {
        stars: string;
        comment: string;
        reasonCode?: string;
      }
    >
  >({});

  const [
    ratedJobs,
    setRatedJobs,
  ] = useState<
    Record<string, boolean>
  >({});

  const accountId =
    (session?.user as any)
      ?.accountId;


  const accountCountry =
    (session?.user as any)
      ?.country;

  const marketProfile = getLocalisationProfile({ country: accountCountry || "GB", currency: (session?.user as any)?.currency || "GBP" });

  const countryName =
    COUNTRIES.find(
      (c) =>
        c.code ===
        accountCountry
    )?.name ||
    accountCountry;

  // Every verified account can post, bid and fulfil jobs.
  const canAccept = true;
  const canPost = true;

  async function loadJobs() {
    setLoading(true);
    setLoadError("");
    try {
      const res =
        await fetch(
          "/api/jobs"
        );

      const data =
        await res.json();

      if (!res.ok) {
        setLoadError(data.error || "Could not load jobs. Try again.");
        return;
      }

      setJobs(data.jobs || []);
    } catch {
      setLoadError("Could not load jobs. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobs();
  }, []);

  async function post(
    path: string,
    confirmMsg?: string
  ) {
    if (actionInFlight.current) {
      setMessage("Another job action is still in progress. Please wait.");
      return false;
    }
    actionInFlight.current = true;

    if (
      confirmMsg &&
      !window.confirm(
        confirmMsg
      )
    ) {
      actionInFlight.current = false;
      return false;
    }

    setMessage("");

    try {
      const res =
        await fetch(path, {
          method: "POST",
        });

      const data =
        await res.json();

      if (!res.ok) {
        setMessage(
          data.error ||
            "Something went wrong."
        );

        return false;
      }

      return true;
    } catch {
      setMessage(
        "Something went wrong."
      );

      return false;
    } finally {
      actionInFlight.current = false;
    }
  }

  async function handleAccept(
    jobId: string
  ) {
    if (
      await post(
        `/api/jobs/${jobId}/accept`
      )
    ) {
      setMessage(
        "Job accepted."
      );

      loadJobs();
    }
  }

  async function handleCancel(
    jobId: string,
    status: string
  ) {
    const question =
      status === "accepted"
        ? "This job has already been accepted by a driver. Are you sure you want to cancel it entirely?"
        : "Are you sure you want to cancel this job?";

    if (
      await post(
        `/api/jobs/${jobId}/cancel`,
        question
      )
    ) {
      setMessage(
        "Job cancelled."
      );

      loadJobs();
    }
  }

  async function handleUnassign(
    jobId: string
  ) {
    if (
      await post(
        `/api/jobs/${jobId}/unassign`,
        "Remove the current haulier and reopen this job for someone else?"
      )
    ) {
      setMessage(
        "Haulier removed — job is open again for other hauliers."
      );

      loadJobs();
    }
  }

  async function handleConfirmPickup(
    jobId: string
  ) {
    if (
      await post(
        `/api/jobs/${jobId}/confirm-pickup`
      )
    ) {
      setMessage(
        "Pickup confirmed — job is now in transit."
      );

      loadJobs();
    }
  }

  async function handleMarkDelivered(
    jobId: string
  ) {
    if (
      await post(
        `/api/jobs/${jobId}/mark-delivered`,
        "Mark this job as delivered? The other party will need to confirm it."
      )
    ) {
      setMessage(
        "Marked as delivered — waiting for the other party to confirm."
      );

      loadJobs();
    }
  }

  async function handleConfirmDelivered(
    jobId: string
  ) {
    if (
      await post(
        `/api/jobs/${jobId}/confirm-delivered`
      )
    ) {
      setMessage(
        "Delivery confirmed — job completed."
      );

      loadJobs();
    }
  }

  async function handleRejectDelivered(
    jobId: string
  ) {
    if (
      await post(
        `/api/jobs/${jobId}/reject-delivered`,
        "Say this job was NOT actually delivered? It will return to in-transit so delivery can be attempted again."
      )
    ) {
      setMessage(
        "Delivery disputed — job is back in transit."
      );

      loadJobs();
    }
  }

  async function handleDriverCancel(
    jobId: string
  ) {
    if (
      await post(
        `/api/jobs/${jobId}/driver-cancel`,
        "Back out of this job? It will go back to open for another haulier."
      )
    ) {
      setMessage(
        "You've backed out of this job."
      );

      loadJobs();
    }
  }

  async function handleBid(
    jobId: string
  ) {
    if (bidInFlight.current) {
      setMessage("A bid submission is already in progress. Please wait.");
      return;
    }
    bidInFlight.current = true;
    setMessage("");

    try {
      const amount =
        bidAmounts[jobId];

      if (!amount) {
        setMessage(
          "Enter a bid amount."
        );

        return;
      }

      const res =
        await fetch(
          `/api/jobs/${jobId}/bid`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                amount,
              }),
          }
        );

      const data =
        await res.json();

      if (!res.ok) {
        setMessage(
          data.error ||
            "Could not place bid."
        );

        return;
      }

      setMessage(
        "Bid placed."
      );

      setBidAmounts({
        ...bidAmounts,
        [jobId]: "",
      });
    } catch {
      setMessage("Could not place bid.");
    } finally {
      bidInFlight.current = false;
    }
  }

  async function loadBids(
    jobId: string
  ) {
    try {
      const res = await fetch(`/api/jobs/${jobId}/bids`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data.error || "Could not load bids.");
        return;
      }

      setOpenBids((current) => ({
        ...current,
        [jobId]: data.bids || [],
      }));
    } catch {
      setMessage("Network error. Could not load bids.");
    }
  }

  async function handleAcceptBid(
    jobId: string,
    bidId: string
  ) {
    if (
      await post(
        `/api/jobs/${jobId}/bids/${bidId}/accept`
      )
    ) {
      setMessage(
        "Bid accepted."
      );

      loadJobs();
    }
  }

  async function submitRating(
    jobId: string
  ) {
    if (ratingInFlight.current) {
      setMessage("A rating submission is already in progress. Please wait.");
      return;
    }
    ratingInFlight.current = true;
    setMessage("");

    try {
      const input =
        ratingInputs[jobId] || {
          stars: "5",
          comment: "",
        };

      const res =
        await fetch(
          "/api/ratings",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                jobId,
                stars:
                  input.stars,
                comment:
                  input.comment,
                reasonCode:
                  input.reasonCode || undefined,
              }),
          }
        );

      const data =
        await res.json();

      if (!res.ok) {
        setMessage(
          data.error ||
            "Could not submit rating."
        );

        return;
      }

      setMessage(
        "Rating submitted."
      );

      setRatedJobs({
        ...ratedJobs,
        [jobId]: true,
      });
    } catch {
      setMessage("Could not submit rating.");
    } finally {
      ratingInFlight.current = false;
    }
  }

  const activeTab =
    TABS.find(
      (t) => t.key === tab
    ) || TABS[0];

  const tabJobs =
    activeTab.statuses.length === 0
      ? jobs
      : jobs.filter((job) => activeTab.statuses.includes(job.status));

  const vehicleOptions = Array.from(new Set(tabJobs.map((job) => job.vehicleType))).sort();

  const activeVehicle = vehicleOptions.includes(vehicleFilter) ? vehicleFilter : "all";

  const pickupKey = (job: Job) => `${job.jobDate.slice(0, 10)}T${job.pickupTime || "23:59"}`;

  const visibleJobs = tabJobs
    .filter((job) => activeVehicle === "all" || job.vehicleType === activeVehicle)
    .map((job, index) => ({ job, index }))
    .sort((left, right) => {
      if (sortBy === "pickup") {
        return pickupKey(left.job).localeCompare(pickupKey(right.job)) || left.index - right.index;
      }
      if (sortBy === "price") {
        return right.job.price - left.job.price || left.index - right.index;
      }
      return left.index - right.index;
    })
    .map(({ job }) => job);

  return (
    <main className="marketplace-page"
      style={{
        width: "100%",
        maxWidth: 760,
        minWidth: 0,
      }}
    >
      <h1 style={{ margin: "0 0 12px", minWidth: 0, overflowWrap: "anywhere" }}>{countryName} delivery marketplace</h1>

      <div
        className="marketplace-job-tabs"
        role="group"
        aria-label="Filter jobs by status"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          borderBottom: "1px solid var(--color-border)",
          marginBottom: 12,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            style={{
              minHeight: 44,
              padding: "10px 14px",
              border: "none",
              borderBottom: tab === t.key
                ? "2px solid var(--color-primary-action)"
                : "2px solid transparent",
              background: tab === t.key
                ? "var(--color-action-soft)"
                : "transparent",
              color: tab === t.key
                ? "var(--color-primary-action)"
                : "var(--color-text)",
              borderRadius: "8px 8px 0 0",
              fontWeight: tab === t.key ? 700 : 500,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <p role="status" aria-live="polite">{message}</p>
      )}

      {accountCountry && (
        <p
          style={{
            color: "var(--color-muted)",
            fontSize: 14,
          }}
        >
          Loads in {countryName} only, plus jobs you posted or accepted.
        </p>
      )}

      {loadError && (
        <div role="alert" aria-live="assertive">
          <p>{loadError}</p>
          <button type="button" onClick={() => void loadJobs()} disabled={loading}>
            {loading ? "Retrying…" : "Retry loading jobs"}
          </button>
        </div>
      )}

      {loading && (
        <p role="status" aria-live="polite">Loading jobs…</p>
      )}

      {!loading && !loadError && tabJobs.length > 0 && (
        <div className="load-board-controls">
          <label>
            <span>Vehicle</span>
            <select value={activeVehicle} onChange={(event) => setVehicleFilter(event.target.value)}>
              <option value="all">All vehicles</option>
              {vehicleOptions.map((type) => (
                <option key={type} value={type}>{vehicleTypeLabel(type, accountCountry)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as "newest" | "pickup" | "price")}>
              <option value="newest">Newest first</option>
              <option value="pickup">Pickup soonest</option>
              <option value="price">Price: high to low</option>
            </select>
          </label>
          <p className="load-board-count" aria-live="polite">
            {visibleJobs.length} {visibleJobs.length === 1 ? "load" : "loads"}
          </p>
        </div>
      )}

      {!loading && !loadError && visibleJobs.length === 0 && (() => {
        // Distinguish why the list is empty so the user knows what to do next.
        const noJobsAtAll = jobs.length === 0;
        const filterActive = activeVehicle !== "all";
        const isOpenTab = tab === "open";
        const isIndia = accountCountry === "IN";

        if (noJobsAtAll && isOpenTab) {
          return (
            <div role="status" className="jobs-empty-state">
              <p><strong>No loads posted yet in your market.</strong></p>
              <p>{isIndia
                ? "Be the first to post a delivery or wait for loads to appear. India marketplace is in early access."
                : "Be the first to post a delivery job, or check back soon as the marketplace grows."}</p>
              <Link href="/jobs/new" style={primaryButtonStyle}>Post a load</Link>
            </div>
          );
        }

        if (noJobsAtAll) {
          return (
            <div role="status" className="jobs-empty-state">
              <p>No jobs here yet. Head to the <button type="button" onClick={() => setTab("open")} style={{ background: "none", border: "none", color: "var(--color-primary-action)", cursor: "pointer", fontWeight: 600, padding: 0 }}>Open</button> tab to browse or post loads.</p>
            </div>
          );
        }

        if (filterActive) {
          return (
            <p role="status">No {activeVehicle} jobs in this category. <button type="button" onClick={() => setVehicleFilter("all")} style={{ background: "none", border: "none", color: "var(--color-primary-action)", cursor: "pointer", fontWeight: 600, padding: 0 }}>Show all vehicles</button></p>
          );
        }

        return <p role="status">No jobs in this category.</p>;
      })()}

      <ul
        style={{
          listStyle: "none",
          padding: 0,
        }}
      >
        {visibleJobs.map(
          (job) => {
            const isOwner = job.isCurrentUserPoster;
            const isAcceptedDriver = job.isCurrentUserAcceptedDriver;
            const involved = isOwner || isAcceptedDriver;
            const canRate =
              (isOwner && (job.hasAcceptedDriver || Boolean(job.hasPreviousDrivers))) ||
              isAcceptedDriver ||
              Boolean(job.currentUserPreviouslyBackedOut);
            const iMarkedDelivered = job.currentUserMarkedDelivery;

            const matched =
              job.status !==
                "open" &&
              job.status !==
                "cancelled";

            return (
              <li
                key={job.id}
                className="marketplace-job-card"
                data-status={job.status}
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 10,
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div className="load-card-head">
                  <div className="load-card-route">
                    <div className="load-card-tags">
                      <span className={`load-status load-status-${job.status}`}>
                        {job.status.replace("_", " ")}
                      </span>
                      {job.crossBorder && (
                        <span className="load-tag">Cross-border</span>
                      )}
                    </div>
                    <h2 className="load-card-title" aria-label={`${job.pickup} to ${job.dropoff}`}>
                      {job.pickup} <span aria-hidden="true">→</span> {job.dropoff}
                    </h2>
                  </div>

                  <div className="load-card-price">
                    <strong>
                      {accountCountry === "IN" && job.price <= 0 ? "Negotiable" : formatMarketCurrency(job.price, { country: accountCountry || "GB", currency: job.currency })}
                    </strong>
                    {job.pricePerMile && (
                      <small>
                        {formatMarketCurrency(marketProfile?.distanceUnit === "km" ? job.pricePerMile * 0.621371 : job.pricePerMile, { country: accountCountry || "GB", currency: job.currency })}/{marketProfile?.distanceUnit ?? "mile"}
                      </small>
                    )}
                    {accountCountry !== "IN" && job.priceMode === "bid" && (
                      <small>Guide price · open to bids</small>
                    )}
                    {accountCountry === "IN" && job.price <= 0 && (
                      <small>Contact poster</small>
                    )}
                  </div>
                </div>

                <p className="load-card-facts">
                  <span>{vehicleTypeLabel(job.vehicleType, accountCountry)}</span>
                  {job.weightKg ? (
                    <span>{accountCountry === "US" ? (job.weightKg / 0.45359237).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " lb" : job.weightKg + " kg"}</span>
                  ) : null}
                  {job.dimensions ? <span>{job.dimensions}</span> : null}
                </p>

                <p className="load-card-facts">
                  <span>{formatMarketDate(job.jobDate, { country: accountCountry, currency: job.currency })}</span>
                  {job.pickupTime && (
                    <span>
                      Pickup {job.pickupTime}
                      {job.pickupTimeZone && job.pickupTimeZone !== marketProfile?.timeZone
                        ? ` (${getTimeZoneOptions(accountCountry || "GB", marketProfile?.timeZone).find((zone) => zone.value === job.pickupTimeZone)?.label ?? job.pickupTimeZone})`
                        : ""}
                    </span>
                  )}
                  {job.dropoffTime && (
                    <span>
                      Drop-off {job.dropoffTime}
                      {(job.dropoffTimeZone ?? job.pickupTimeZone) && (job.dropoffTimeZone ?? job.pickupTimeZone) !== marketProfile?.timeZone
                        ? ` (${getTimeZoneOptions(accountCountry || "GB", marketProfile?.timeZone).find((zone) => zone.value === job.dropoffTimeZone)?.label ?? job.dropoffTimeZone ?? job.pickupTimeZone})`
                        : ""}
                    </span>
                  )}
                </p>

                {involved && (job.status !== "open" || job.hasAcceptedDriver) && (
                  <div style={{ marginTop: 10 }}>
                    <Link
                      href={`/jobs/${job.id}/incidents`}
                      className="button-link button-link-secondary"
                    >
                      Report an issue / incident history
                    </Link>
                  </div>
                )}

                {job.notes && (
                  <p className="load-card-notes">{job.notes}</p>
                )}

                <p
                  style={{
                    margin: "14px 0 0",
                    color: "var(--color-muted)",
                    fontSize: 13,
                  }}
                >
                  Posted by{" "}
                  <Link href={`/profile/${job.poster.displayId}`}>
                    {job.poster.companyName}
                    {job.poster.displayId
                      ? ` (${job.poster.displayId})`
                      : ""}
                  </Link>

                  {ageText(job.poster.createdAt)
                    ? ` · ${ageText(job.poster.createdAt)}`
                    : ""}

                  {job.status === "delivered" &&
                    (iMarkedDelivered
                      ? " · You marked this — waiting for the other side"
                      : " · The other side marked this — your turn to confirm")}
                </p>

                {!matched && (
                  <p className="job-route-links">
                    <a
                      href={navLink(
                        job.pickup,
                        job.pickupLat,
                        job.pickupLng
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Preview route to
                      pickup
                    </a>

                    <a
                      href={navLink(
                        job.dropoff,
                        job.dropoffLat,
                        job.dropoffLng,
                        job.pickup,
                        job.pickupLat,
                        job.pickupLng
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Preview pickup →
                      drop-off
                    </a>
                  </p>
                )}

                {canAccept &&
                  !isOwner &&
                  job.status ===
                    "open" &&
                  job.priceMode ===
                    "fixed" && (
                    <button
                      type="button"
                      onClick={() =>
                        handleAccept(job.id)
                      }
                      style={primaryButtonStyle}
                    >
                      Accept this job
                    </button>
                  )}

                {canAccept &&
                  !isOwner &&
                  job.status ===
                    "open" &&
                  accountCountry !== "IN" &&
                  job.priceMode ===
                    "bid" && (
                    <div
                      style={{
                        display:
                          "flex",
                        gap: 8,
                        alignItems:
                          "center",
                      }}
                    >
                      <input
                        type="number"
                        min={1 / currencyMinorUnitScale(job.currency)}
                        step={1 / currencyMinorUnitScale(job.currency)}
                        placeholder={`Your bid (${symbolFor(
                          job.currency
                        ).trim()})`}
                        style={{
                          width: 120,
                        }}
                        value={
                          bidAmounts[
                            job.id
                          ] || ""
                        }
                        onChange={(e) =>
                          setBidAmounts({
                            ...bidAmounts,
                            [job.id]:
                              e.target
                                .value,
                          })
                        }
                      />

                      <button
                      type="button"
                        onClick={() =>
                          handleBid(job.id)
                        }
                        style={primaryButtonStyle}
                      >
                        Place bid
                      </button>
                    </div>
                  )}

                {isOwner &&
                  job.status ===
                    "open" && (
                    <div
                      style={{
                        display:
                          "flex",
                        gap: 8,
                        flexWrap:
                          "wrap",
                      }}
                    >
                      <Link
                        href={`/jobs/${job.id}/edit`}
                        className="button-link button-link-secondary">
                        Edit job
                      </Link>

                      <button
                        type="button"
                        className="button-danger-quiet"
                        onClick={() =>
                          handleCancel(
                            job.id,
                            job.status
                          )
                        }
                      >
                        Cancel job
                      </button>
                    </div>
                  )}

                {isOwner &&
                  job.status ===
                    "accepted" && (
                    <>
                      <button
                        type="button"
                        className="button-link button-link-secondary"
                        onClick={() =>
                          handleUnassign(
                            job.id
                          )
                        }
                      >
                        Remove this driver,
                        keep job open
                      </button>

                      <button
                        onClick={() =>
                          handleCancel(
                            job.id,
                            job.status
                          )
                        }
                        type="button"
                        className="button-danger-quiet"
                        style={{
                          marginLeft: 8,
                        }}
                      >
                        Cancel job entirely
                      </button>
                    </>
                  )}

                {isOwner &&
                  accountCountry !== "IN" &&
                  job.priceMode ===
                    "bid" &&
                  job.status ===
                    "open" && (
                    <div
                      style={{
                        marginTop: 8,
                      }}
                    >
                      <button
                      type="button"
                        onClick={() =>
                          loadBids(
                            job.id
                          )
                        }
                      >
                        View bids
                      </button>

                      {openBids[
                        job.id
                      ] && (
                        <ul>
                          {openBids[
                            job.id
                          ].length ===
                            0 && (
                            <li>
                              No active
                              bids yet.
                            </li>
                          )}

                          {openBids[
                            job.id
                          ].map(
                            (bid) => (
                              <li
                                key={
                                  bid.id
                                }
                              >
                                {
                                  bid
                                    .bidder
                                    .companyName
                                }{" "}
                                (
                                {
                                  bid
                                    .bidder
                                    .displayId
                                }
                                ) —{" "}
                                {formatMarketCurrency(bid.amount, { country: accountCountry || "GB", currency: job.currency })}

                                {ageText(
                                  bid
                                    .bidder
                                    .createdAt
                                )
                                  ? ` · ${ageText(
                                      bid
                                        .bidder
                                        .createdAt
                                    )}`
                                  : ""}{" "}

                                <button
                      type="button"
                                  onClick={() =>
                                    handleAcceptBid(
                                      job.id,
                                      bid.id
                                    )
                                  }
                                >
                                  Accept
                                </button>
                              </li>
                            )
                          )}
                        </ul>
                      )}
                    </div>
                  )}

                {matched &&
                  involved && (
                    <div
                      style={{
                        marginTop: 18,
                        background: "var(--ops-surface-inset)",
                        border: "1px solid var(--color-border)",
                        padding: 16,
                        borderRadius: 12,
                      }}
                    >
                      {isOwner &&
                        job.acceptedBy && (
                          <p>
                            <strong>
                              Driver (
                              {
                                job
                                  .acceptedBy
                                  .displayId
                              }
                              ):
                            </strong>{" "}
                            {
                              job
                                .acceptedBy
                                .users?.[0]
                                ?.name
                            }{" "}
                            —{" "}
                            {
                              job
                                .acceptedBy
                                .users?.[0]
                                ?.phone
                            }{" "}
                            —{" "}
                            {
                              job
                                .acceptedBy
                                .users?.[0]
                                ?.email
                            }
                          </p>
                        )}

                      {isAcceptedDriver && (
                        <p>
                          <strong>
                            Poster (
                            {
                              job.poster
                                .displayId
                            }
                            ):
                          </strong>{" "}
                          {
                            job.poster
                              .users?.[0]
                              ?.name
                          }{" "}
                          —{" "}
                          {
                            job.poster
                              .users?.[0]
                              ?.phone
                          }{" "}
                          —{" "}
                          {
                            job.poster
                              .users?.[0]
                              ?.email
                          }
                        </p>
                      )}

                      {(job.pickupContactName ||
                        job.pickupContactPhone) && (
                        <p>
                          <strong>
                            Pickup site
                            contact:
                          </strong>{" "}
                          {
                            job.pickupContactName ||
                            ""
                          }{" "}
                          {
                            job.pickupContactPhone ||
                            ""
                          }
                        </p>
                      )}

                      {(job.dropoffContactName ||
                        job.dropoffContactPhone) && (
                        <p>
                          <strong>
                            Drop-off site
                            contact:
                          </strong>{" "}
                          {
                            job.dropoffContactName ||
                            ""
                          }{" "}
                          {
                            job.dropoffContactPhone ||
                            ""
                          }
                        </p>
                      )}

                      <p>
                        <a
                          href={navLink(
                            job.pickup,
                            job.pickupLat,
                            job.pickupLng
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Navigate to
                          pickup
                        </a>

                        {" · "}

                        <a
                          href={navLink(
                            job.dropoff,
                            job.dropoffLat,
                            job.dropoffLng,
                            job.pickup,
                            job.pickupLat,
                            job.pickupLng
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Navigate pickup →
                          drop-off
                        </a>
                      </p>

                      {job.status ===
                        "accepted" && (
                        <>
                          <button
                      type="button"
                            onClick={() =>
                              handleConfirmPickup(
                                job.id
                              )
                            }
                          >
                            Confirm pickup
                          </button>

                          {isAcceptedDriver && (
                            <button
                      type="button"
                              onClick={() =>
                                handleDriverCancel(
                                  job.id
                                )
                              }
                              style={{
                                marginLeft: 8,
                              }}
                            >
                              Back out before
                              pickup
                            </button>
                          )}
                        </>
                      )}

                      {job.status ===
                        "in_transit" && (
                        <button
                      type="button"
                          onClick={() =>
                            handleMarkDelivered(
                              job.id
                            )
                          }
                        >
                          Mark as delivered
                        </button>
                      )}

                      {job.status ===
                        "delivered" &&
                        !iMarkedDelivered && (
                          <>
                            <button
                      type="button"
                              onClick={() =>
                                handleConfirmDelivered(
                                  job.id
                                )
                              }
                            >
                              Confirm delivery
                            </button>

                            <button
                      type="button"
                              onClick={() =>
                                handleRejectDelivered(
                                  job.id
                                )
                              }
                              style={{
                                marginLeft: 8,
                              }}
                            >
                              Not delivered yet
                            </button>
                          </>
                        )}

                      {job.status ===
                        "delivered" &&
                        iMarkedDelivered && (
                          <p
                            style={{
                              color:
                                "var(--color-muted)",
                            }}
                          >
                            Waiting for
                            confirmation
                            from the other
                            side.
                          </p>
                        )}
                    </div>
                  )}

 {involved && (
                  <ActivityHistory jobId={job.id} />
                )}

                {canRate && (
                  <div>
                    {job.status === "completed" && (
                      <p style={{ color: "green" }}>
                        ✓ Delivered
                      </p>
                    )}

                    {involved &&
                      !ratedJobs[
                        job.id
                      ] && (
                        <div
                          style={{
                            display:
                              "flex",
                            gap: 8,
                            alignItems:
                              "center",
                          }}
                        >
                          <select
                            value={
                              ratingInputs[
                                job.id
                              ]?.stars ||
                              "5"
                            }
                            onChange={(e) =>
                              setRatingInputs({
                                ...ratingInputs,
                                [job.id]: {
                                  ...(ratingInputs[
                                    job.id
                                  ] || {
                                    comment:
                                      "",
                                  }),
                                  stars:
                                    e.target
                                      .value,
                                },
                              })
                            }
                          >
                            {[
                              5,
                              4,
                              3,
                              2,
                              1,
                            ].map(
                              (n) => (
                                <option
                                  key={
                                    n
                                  }
                                  value={
                                    n
                                  }
                                >
                                  {"★".repeat(
                                    n
                                  )}
                                </option>
                              )
                            )}
                          </select>

                          <select
                            aria-label="Reason (required for 1–2 stars or if the job did not complete)"
                            value={ratingInputs[job.id]?.reasonCode || ""}
                            onChange={(e) =>
                              setRatingInputs({
                                ...ratingInputs,
                                [job.id]: {
                                  ...(ratingInputs[job.id] || { stars: "5", comment: "" }),
                                  reasonCode: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="">Reason (if needed)</option>
                            {Object.entries(RATING_REASONS).map(([code, label]) => (
                              <option key={code} value={code}>{label}</option>
                            ))}
                          </select>

                          <input
                            type="text"
                            placeholder="Optional comment"
                            value={
                              ratingInputs[
                                job.id
                              ]?.comment ||
                              ""
                            }
                            onChange={(e) =>
                              setRatingInputs({
                                ...ratingInputs,
                                [job.id]: {
                                  ...(ratingInputs[
                                    job.id
                                  ] || {
                                    stars:
                                      "5",
                                  }),
                                  comment:
                                    e.target
                                      .value,
                                },
                              })
                            }
                          />

                          <button
                      type="button"
                            onClick={() =>
                              submitRating(
                                job.id
                              )
                            }
                          >
                            Submit rating
                          </button>
                        </div>
                      )}

                    {ratedJobs[
                      job.id
                    ] && (
                      <p
                        style={{
                          color:
                            "var(--color-muted)",
                        }}
                      >
                        Thanks for rating
                        this job.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          }
        )}
      </ul>
    </main>
  );
}