export type JobStatus =
  | "open"
  | "accepted"
  | "in_transit"
  | "delivered"
  | "completed"
  | "cancelled";

export const JOB_STATUS_LABELS: Record<
  JobStatus,
  string
> = {
  open: "Open",
  accepted: "Accepted",
  in_transit: "In transit",
  delivered: "Delivery awaiting confirmation",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function canConfirmPickup(
  status: JobStatus
) {
  return status === "accepted";
}

export function canMarkDelivered(
  status: JobStatus
) {
  return status === "in_transit";
}

export function canConfirmDelivered(
  status: JobStatus
) {
  return status === "delivered";
}

export function canRejectDelivered(
  status: JobStatus
) {
  return status === "delivered";
}

export function canPosterCancel(
  status: JobStatus
) {
  return (
    status === "open" ||
    status === "accepted"
  );
}

export function canUnassign(
  status: JobStatus
) {
  return status === "accepted";
}

export function canDriverCancel(
  status: JobStatus
) {
  return status === "accepted";
}

export function isInvolvedStatus(
  status: JobStatus
) {
  return (
    status === "accepted" ||
    status === "in_transit" ||
    status === "delivered" ||
    status === "completed"
  );
}