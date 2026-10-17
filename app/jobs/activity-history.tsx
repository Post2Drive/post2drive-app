"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { formatMarketDateTime } from "@/lib/localisation";

type Activity = {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  description: string | null;
  createdAt: string;
  actor: {
    companyName: string;
    displayId: string;
  } | null;
};

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    BID_ACCEPTED: "Bid accepted",
    DRIVER_BACKED_OUT: "Driver backed out",
    DRIVER_UNASSIGNED: "Driver unassigned",
    PICKUP_CONFIRMED: "Pickup confirmed",
    DELIVERY_MARKED: "Delivery marked",
    DELIVERY_CONFIRMED: "Delivery confirmed",
    DELIVERY_REJECTED: "Delivery rejected",
    PAYMENT_MARKED_PAID: "Payment marked paid",
    PAYMENT_RECEIVED_CONFIRMED: "Payment received confirmed",
  };

  return labels[action] || action.replace(/_/g, " ");
}

export default function ActivityHistory({
  jobId,
}: {
  jobId: string;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadActivity() {
    try {
      setLoading(true);

      const res = await fetch(
        `/api/jobs/${jobId}/activity`
      );

      const data = await res.json();

      if (res.ok) {
        setActivities(data.activities || []);
      }
    } catch {
      // Keep the job page usable if activity history fails.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      loadActivity();
    }
  }, [open, jobId]);

  return (
    <div
      style={{
        marginTop: 10,
        borderTop: "1px solid var(--color-border)",
        paddingTop: 8,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
      >
        {open
          ? "Hide activity history"
          : "View activity history"}
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            background: "#fafafa",
            borderRadius: 4,
          }}
        >
          {loading && <p>Loading activity...</p>}

          {!loading &&
            activities.length === 0 && (
              <p style={{ color: "var(--color-muted)" }}>
                No activity recorded yet.
              </p>
            )}

          {!loading &&
            activities.length > 0 && (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                }}
              >
                {activities.map((activity) => (
                  <li
                    key={activity.id}
                    style={{
                      padding: "8px 0",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <strong>
                      {actionLabel(activity.action)}
                    </strong>

                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--color-muted)",
                        marginTop: 2,
                      }}
                    >
                      {formatMarketDateTime(activity.createdAt, { country, currency })}
                    </div>

                    {activity.description && (
                      <div style={{ marginTop: 3 }}>
                        {activity.description}
                      </div>
                    )}

                    {activity.actor && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--color-muted)",
                          marginTop: 2,
                        }}
                      >
                        By {activity.actor.companyName}
                        {activity.actor.displayId
                          ? ` (${activity.actor.displayId})`
                          : ""}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}