import { getAccountAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { marketTimeZone, isSupportedMarket, type MarketIdentity } from "@/lib/market";
import { getTimeZoneOptions } from "@/lib/localisation";
import { localDateTimeToInstant } from "@/lib/localTime";

type AccessResult = Awaited<ReturnType<typeof getAccountAccess>>;

function getDateParts(value: Date) {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth(),
    day: value.getUTCDate(),
  };
}

/**
 * Convert a Job's stored calendar date + market-local pickup time into
 * an absolute Date in the poster's market time zone.
 *
 * Job dates are stored as UTC dates representing the selected
 * calendar day. Pickup time is interpreted in the poster's local market time zone.
 *
 * We deliberately reject nonexistent or ambiguous DST times
 * rather than silently moving the pickup by an hour.
 */
export function getJobPickupAt(
  jobDate: Date,
  pickupTime?: string | null,
  market: MarketIdentity = { country: "GB", currency: "GBP" },
  pickupTimeZone?: string | null
): Date {
  const { year, month, day } = getDateParts(jobDate);
  const defaultTimeZone = marketTimeZone(market);
  const options = getTimeZoneOptions(market.country ?? "GB", defaultTimeZone);
  if (pickupTimeZone && !options.some((option) => option.value === pickupTimeZone)) {
    throw new Error("INVALID_PICKUP_TIME_ZONE");
  }
  const timeZone = pickupTimeZone || defaultTimeZone;

  const time = pickupTime?.trim() || "00:00";
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);

  if (!match) {
    throw new Error("INVALID_PICKUP_TIME");
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  const target = {
    year,
    month: month + 1,
    day,
    hour,
    minute,
  };

  return localDateTimeToInstant(target, timeZone);
}

/** Resolve pickup times using the authenticated account's stored market, never a client-supplied timezone. */
export async function getJobPickupAtForAccount(
  accountId: string,
  jobDate: Date,
  pickupTime?: string | null,
  pickupTimeZone?: string | null
): Promise<Date> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { country: true, currency: true },
  });
  if (!account || !isSupportedMarket(account)) {
    throw new Error("UNSUPPORTED_MARKET");
  }
  return getJobPickupAt(jobDate, pickupTime, account, pickupTimeZone);
}

export function pickupIsWithinAccessWindow(
  access: AccessResult,
  pickupAt: Date
) {
  if (!access.allowed) {
    return false;
  }

  if (!access.endsAt) {
    return true;
  }

  /*
   * Access ending at 10:00 means a job whose pickup is at
   * 10:00 or later cannot be newly accepted.
   *
   * The pickup must occur strictly before access expires.
   */
  return pickupAt.getTime() < access.endsAt.getTime();
}

export function pickupAccessError(
  access: AccessResult,
  pickupAt: Date
) {
  if (!access.allowed) {
    return {
      error: "Marketplace access is unavailable.",
      reason: access.reason,
      status:
        access.reason === "access_expired"
          ? 402
          : 403,
    };
  }

  if (
    access.endsAt &&
    pickupAt.getTime() >= access.endsAt.getTime()
  ) {
    return {
      error:
        "This job cannot be posted, bid on, or accepted because its pickup is after your current marketplace access ends.",
      reason: "pickup_after_access",
      status: 402,
    };
  }

  return null;
}

export function formatPickupAccessMessage(
  accessEndsAt: Date,
  market: MarketIdentity = { country: "GB", currency: "GBP" }
) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: marketTimeZone(market),
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(accessEndsAt);
}
