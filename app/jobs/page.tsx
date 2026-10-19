
"use client";

import ActivityHistory from "./activity-history";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import SignOutButton from "@/app/sign-out-button";
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
  posterId: string;
  acceptedById: string | null;
  previousDriverIds?: string[];
  deliveryMarkedById: string | null;
  pickupConfirmedById: string | null;
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

  const [message, setMessage] =
    useState("");

  // Prevent repeated clicks from dispatching duplicate lifecycle mutations.
  const actionInFlight = useRef(false);

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

  const [
    ratingInputs,
    setRatingInputs,
  ] = useState<
    Record<
      string,
      {
        stars: string;
        comment: string;
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
    try {
      setLoading(true);

      const res =
        await fetch(
          "/api/jobs"
        );

      const data =
        await res.json();

      if (!res.ok) {
        setMessage(
          data.error ||
            "Could not load jobs."
        );
        return;
      }

      setJobs(
        data.jobs || []
      );
    } catch {
      setMessage(
        "Could not load jobs."
      );
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
    if (actionInFlight.current) return false;
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
    setMessage("");

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
  }

  async function loadBids(
    jobId: string
  ) {
    const res =
      await fetch(
        `/api/jobs/${jobId}/bids`
      );

    const data =
      await res.json();

    if (res.ok) {
      setOpenBids({
        ...openBids,
        [jobId]:
          data.bids || [],
      });
    } else {
      setMessage(
        data.error ||
          "Could not load bids."
      );
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
    setMessage("");

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
  }

  const activeTab =
    TABS.find(
      (t) => t.key === tab
    ) || TABS[0];

  const visibleJobs =
    activeTab.statuses
      .length === 0
      ? jobs
      : jobs.filter((job) =>
          activeTab.statuses.includes(
            job.status
          )
        );

  return (
    <div className="marketplace-page" style={{ width: "100%", maxWidth: 1200, margin: "0 auto", padding: 24, boxSizing: "border-box" }}>
      <div className="marketplace-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div className="marketplace-heading" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, flex: "1 1 320px", minWidth: 0 }}>
        <h1 style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{countryName} delivery marketplace</h1>
        {accountCountry === "IN" && <Link className="button-link button-link-secondary" href="/requirements">My Requirements</Link>}
      </div>

        <div className="marketplace-header-actions" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
          {canPost && (
            <Link href="/jobs/new" className="button-link button-link-secondary">
              + Post a job
            </Link>
          )}

          <Link href="/payments" className="button-link button-link-secondary">
            Payments
          </Link>


          <SignOutButton />
        </div>
      </div>

      <div
        className="marketplace-job-tabs"
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--color-border)",
          marginBottom: 12,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() =>
              setTab(t.key)
            }
            style={{
              padding:
                "6px 12px",
              border: "none",
              borderBottom:
                tab === t.key
                  ? "2px solid var(--color-primary-action)"
                  : "2px solid transparent",
              background:
                "transparent",
              color: "var(--color-text)",
              fontWeight:
                tab === t.key
                  ? 700
                  : 400,
              cursor:
                "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <p>{message}</p>
      )}

      {accountCountry && (
        <p
          style={{
            color: "var(--color-muted)",
            fontSize: 14,
          }}
        >
          Showing open jobs in {countryName}. Only listings posted within your selected country and currency are shown. Jobs you have posted or already accepted also remain visible here.
        </p>
      )}

      {loading && (
        <p>Loading...</p>
      )}

      {!loading &&
        visibleJobs.length ===
          0 && (
          <p>
            No jobs in this
            category.
          </p>
        )}

      <ul
        style={{
          listStyle: "none",
          padding: 0,
        }}
      >
        {visibleJobs.map(
          (job) => {
            const isOwner =
              job.posterId ===
              accountId;

            const isAcceptedDriver =
              job.acceptedById ===
              accountId;

            const involved =
              isOwner ||
              isAcceptedDriver;

            const previousDriverIds = job.previousDriverIds ?? [];
            const canRate =
              (isOwner &&
                (Boolean(job.acceptedById) || previousDriverIds.length > 0)) ||
              isAcceptedDriver ||
              previousDriverIds.includes(accountId);

            const iMarkedDelivered =
              job.deliveryMarkedById ===
              accountId;

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
                  borderRadius: 14,
                  padding: 20,
                  marginBottom: 14,
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: "var(--color-text)",
                        lineHeight: 1.35,
                      }}
                    >
                      {job.pickup} → {job.dropoff}
                    </div>

                    {job.crossBorder && (
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 7,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: "var(--color-primary-soft)",
                          color: "var(--color-primary-action)",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Cross-border
                      </span>
                    )}
                  </div>

                  <span
                    style={{
                      padding: "5px 10px",
                      borderRadius: 999,
                      background:
                        job.status === "open"
                          ? "var(--color-positive-soft)"
                          : job.status === "completed"
                          ? "var(--color-positive-soft)"
                          : job.status === "cancelled"
                          ? "var(--color-danger-soft)"
                          : "var(--color-warning-soft)",
                      color:
                        job.status === "open"
                          ? "var(--color-positive)"
                          : job.status === "completed"
                          ? "var(--color-positive)"
                          : job.status === "cancelled"
                          ? "var(--color-danger)"
                          : "var(--color-warning)",
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "capitalize",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {job.status.replace("_", " ")}
                  </span>
                </div>

                {involved && (job.status !== "open" || Boolean(job.acceptedById)) && (
                  <div style={{ marginTop: 12 }}>
                    <Link
                      href={`/jobs/${job.id}/incidents`}
                      style={{
                        display: "inline-block",
                        padding: "8px 11px",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        color: "var(--color-text)",
                        textDecoration: "none",
                      }}
                    >
                      Report an issue / incident history
                    </Link>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 14,
                    color: "var(--color-text)",
                    fontSize: 14,
                  }}
                >
                  <span>{vehicleTypeLabel(job.vehicleType, accountCountry)}</span>
                  <span>·</span>
                  <strong>
                    {formatMarketCurrency(job.price, { country: accountCountry || "GB", currency: job.currency })}
                  </strong>

                  {job.pricePerMile && (
                    <>
                      <span>·</span>
                      <span>
                        {formatMarketCurrency(marketProfile?.distanceUnit === "km" ? job.pricePerMile * 0.621371 : job.pricePerMile, { country: accountCountry || "GB", currency: job.currency })}/{marketProfile?.distanceUnit ?? "mile"}
                      </span>
                    </>
                  )}

                  <span>·</span>

                  <span>
                    {formatMarketDate(job.jobDate, { country: accountCountry, currency: job.currency })}
                  </span>

                  {job.pickupTime && (
                    <>
                      <span>·</span>
                      <span>Pickup {job.pickupTime} ({getTimeZoneOptions(accountCountry || "GB", marketProfile?.timeZone).find((zone) => zone.value === job.pickupTimeZone)?.label ?? job.pickupTimeZone ?? marketProfile?.timeZone})</span>
                    </>
                  )}

                  {job.dropoffTime && (
                    <>
                      <span>·</span>
                      <span>Drop-off {job.dropoffTime} ({getTimeZoneOptions(accountCountry || "GB", marketProfile?.timeZone).find((zone) => zone.value === job.dropoffTimeZone)?.label ?? job.dropoffTimeZone ?? job.pickupTimeZone ?? marketProfile?.timeZone})</span>
                    </>
                  )}
                </div>

                {accountCountry !== "IN" && job.priceMode === "bid" && (
                  <p
                    style={{
                      margin: "10px 0 0",
                      color: "var(--color-primary-action)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Guide price · open to bids
                  </p>
                )}

                {(job.weightKg || job.dimensions) && (
                  <p
                    style={{
                      margin: "12px 0 0",
                      color: "var(--color-muted)",
                      fontSize: 13,
                    }}
                  >
                    {job.weightKg ? `${accountCountry === "US" ? (job.weightKg / 0.45359237).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " lb" : job.weightKg + " kg"}` : ""}
                    {job.weightKg && job.dimensions ? " · " : ""}
                    {job.dimensions || ""}
                  </p>
                )}

                {job.notes && (
                  <p
                    style={{
                      margin: "12px 0 0",
                      color: "var(--color-text)",
                      lineHeight: 1.5,
                    }}
                  >
                    {job.notes}
                  </p>
                )}

                <p
                  style={{
                    margin: "14px 0 0",
                    color: "var(--color-muted)",
                    fontSize: 13,
                  }}
                >
                  Posted by{" "}
                  <Link href={`/profile/${job.posterId}`}>
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
                  <p
                    style={{
                      fontSize: 13,
                    }}
                  >
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
                        style={{
                          display:
                            "inline-block",
                          padding:
                            "6px 10px",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                          color: "var(--color-text)",
                          textDecoration:
                            "none",
                        }}
                       className="button-link button-link-secondary">
                        Edit job
                      </Link>

                      <button
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
                              onClick={() =>
                                handleConfirmDelivered(
                                  job.id
                                )
                              }
                            >
                              Confirm delivery
                            </button>

                            <button
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
    </div>
  );
}