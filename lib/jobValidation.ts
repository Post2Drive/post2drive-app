import { VEHICLE_TYPES } from "@/lib/vehicles";
import { marketForAccount, type MarketIdentity } from "@/lib/market";
import { getTimeZoneOptions } from "@/lib/localisation";

export type NormalizedJobInput = {
  pickup: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoff: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  jobDate: Date;
  pickupTime: string | null;
  dropoffTime: string | null;
  pickupTimeZone: string;
  dropoffTimeZone: string;
  vehicleType: string;
  weightKg: number | null;
  dimensions: string | null;
  price: number;
  pricePerMile: number | null;
  notes: string | null;
  priceMode: "fixed" | "bid";
  currency: string;
  crossBorder: false;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
};

export type JobValidationResult =
  | { ok: true; data: NormalizedJobInput }
  | { ok: false; error: string };

function optionalText(value: unknown, fieldName: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${fieldName} must be text.`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) throw new Error(`${fieldName} exceeds ${maxLength} characters.`);
  return text;
}

function optionalNumber(value: unknown, fieldName: string, minimum: number, maximum?: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (!(typeof value === "number" || (typeof value === "string" && value.trim() !== ""))) {
    throw new Error(`${fieldName} must be a valid number.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${fieldName} must be a valid number.`);
  if (number < minimum) throw new Error(`${fieldName} must be at least ${minimum}.`);
  if (maximum !== undefined && number > maximum) throw new Error(`${fieldName} must not exceed ${maximum}.`);
  return number;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function optionalTime(value: unknown, fieldName: string, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`${fieldName} is required.`);
    return null;
  }
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`${fieldName} must use 24-hour HH:MM format.`);
  }
  return value;
}

export function validateJobInput(body: unknown, expectedMarket?: MarketIdentity): JobValidationResult {
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid job data." };
    const input = body as Record<string, unknown>;
    const pickup = typeof input.pickup === "string" ? input.pickup.trim() : "";
    const dropoff = typeof input.dropoff === "string" ? input.dropoff.trim() : "";
    if (!pickup) return { ok: false, error: "Pickup location is required." };
    if (!dropoff) return { ok: false, error: "Drop-off location is required." };
    if (pickup.length > 300) return { ok: false, error: "Pickup location is too long." };
    if (dropoff.length > 300) return { ok: false, error: "Drop-off location is too long." };

    const jobDate = parseDate(input.jobDate);
    if (!jobDate) return { ok: false, error: "Enter a valid calendar date." };

    const vehicleType = typeof input.vehicleType === "string" ? input.vehicleType.trim() : "";
    if (!vehicleType || !(VEHICLE_TYPES as readonly string[]).includes(vehicleType)) return { ok: false, error: "Choose a valid vehicle type." };

    const price = optionalNumber(input.price, "Price", 0.01, 100000000);
    if (price === null) return { ok: false, error: "Price must be greater than zero." };
    const weightKg = optionalNumber(input.weightKg, "Weight", 0, 1000000);
    const pricePerMile = optionalNumber(input.pricePerMile, "Price per mile", 0.01, 100000);
    const pickupLat = optionalNumber(input.pickupLat, "Pickup latitude", -90, 90);
    const pickupLng = optionalNumber(input.pickupLng, "Pickup longitude", -180, 180);
    const dropoffLat = optionalNumber(input.dropoffLat, "Drop-off latitude", -90, 90);
    const dropoffLng = optionalNumber(input.dropoffLng, "Drop-off longitude", -180, 180);
    if ((pickupLat === null) !== (pickupLng === null)) return { ok: false, error: "Pickup latitude and longitude must be provided together." };
    if ((dropoffLat === null) !== (dropoffLng === null)) return { ok: false, error: "Drop-off latitude and longitude must be provided together." };

    const pickupTime = optionalTime(input.pickupTime, "Pickup time", true);
    const dropoffTime = optionalTime(input.dropoffTime, "Drop-off time");
    const dimensions = optionalText(input.dimensions, "Dimensions", 150);
    const notes = optionalText(input.notes, "Notes", 5000);
    const pickupContactName = optionalText(input.pickupContactName, "Pickup contact name", 150);
    const pickupContactPhone = optionalText(input.pickupContactPhone, "Pickup contact phone", 50);
    const dropoffContactName = optionalText(input.dropoffContactName, "Drop-off contact name", 150);
    const dropoffContactPhone = optionalText(input.dropoffContactPhone, "Drop-off contact phone", 50);

    const priceMode = input.priceMode === "fixed" || input.priceMode === "bid" ? input.priceMode : null;
    if (!priceMode) return { ok: false, error: "Choose fixed pricing or open bidding." };
    if (input.crossBorder === true) return { ok: false, error: "Cross-border matching is not currently available. Jobs are limited to your selected market." };

    const currency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";
    const country = expectedMarket?.country ?? "GB";
    if (country === "IN" && priceMode === "bid") {
      return { ok: false, error: "Bidding is not available in India. Use fixed quote pricing." };
    }
    const defaultTimeZone = marketForAccount(expectedMarket ?? { country: "GB", currency: "GBP" })?.timeZone ?? "Europe/London";
    const timeZoneOptions = getTimeZoneOptions(country, defaultTimeZone);
    const requestedTimeZone = typeof input.pickupTimeZone === "string" ? input.pickupTimeZone.trim() : "";
    const pickupTimeZone = requestedTimeZone || defaultTimeZone;
    if (!timeZoneOptions.some((option) => option.value === pickupTimeZone)) {
      return { ok: false, error: "Choose a pickup time zone valid for your market." };
    }
    const requestedDropoffTimeZone = typeof input.dropoffTimeZone === "string" ? input.dropoffTimeZone.trim() : "";
    const dropoffTimeZone = requestedDropoffTimeZone || pickupTimeZone;
    if (!timeZoneOptions.some((option) => option.value === dropoffTimeZone)) {
      return { ok: false, error: "Choose a drop-off time zone valid for your market." };
    }
    if (expectedMarket) {
      const market = marketForAccount(expectedMarket);
      if (!market) return { ok: false, error: "Your account's country and currency are not supported." };
      if (currency !== market.currency) return { ok: false, error: `Jobs in ${market.label} must use ${market.currency}.` };
    } else if (currency !== "GBP" && currency !== "INR" && currency !== "EUR") {
      return { ok: false, error: "Choose a supported market currency (GBP, EUR or INR)." };
    }

    return { ok: true, data: {
      pickup, pickupLat, pickupLng, dropoff, dropoffLat, dropoffLng, jobDate,
      pickupTime, dropoffTime, pickupTimeZone, dropoffTimeZone, vehicleType, weightKg, dimensions, price,
      pricePerMile, notes, priceMode, currency, crossBorder: false,
      pickupContactName, pickupContactPhone, dropoffContactName, dropoffContactPhone,
    }};
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid job data." };
  }
}
