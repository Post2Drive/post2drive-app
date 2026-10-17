/**
 * Market-aware wording for user-facing app labels.
 *
 * Country-level terms are used only where the system can safely determine them.
 * Vehicle compliance can be subnational (US states, Canadian provinces/territories,
 * Australian states/territories), so the UI must not imply that one national rule
 * or regulator applies everywhere.
 */
import { marketForAccount, type MarketIdentity } from "./market.ts";

export type LocalisationProfile = {
  country: string;
  currency: string;
  locale: string;
  timeZone: string;
  dialingCode: string;
  marketplaceLabel: string;
  registrationLabel: string;
  registrationDocumentLabel: string;
  inspectionLabel: string;
  inspectionHelp: string;
  authorityLabel: string;
  inspectionRequiredAtCountryLevel: boolean;
  jurisdictionSelectionRequired: boolean;
  weightUnit: "kg" | "lb";
  vehicleMassLabel: string;
  distanceUnit: "km" | "mile";
};

const VEHICLE_TERMS: Record<string, Pick<LocalisationProfile,
  "registrationLabel" | "registrationDocumentLabel" | "inspectionLabel" |
  "inspectionHelp" | "authorityLabel" | "inspectionRequiredAtCountryLevel" |
  "jurisdictionSelectionRequired"
>> = {
  GB: {
    registrationLabel: "Vehicle registration number",
    registrationDocumentLabel: "V5C log book / registration document",
    inspectionLabel: "MOT valid until",
    inspectionHelp: "Enter the MOT expiry date where an MOT is required. Exempt vehicles need manual review.",
    authorityLabel: "DVLA",
    inspectionRequiredAtCountryLevel: false,
    jurisdictionSelectionRequired: false,
  },
  IN: {
    registrationLabel: "Vehicle registration number",
    registrationDocumentLabel: "Registration certificate (RC)",
    inspectionLabel: "Fitness certificate valid until (if applicable)",
    inspectionHelp: "Requirements depend on vehicle class and applicable RTO rules. Add the relevant validity date if applicable.",
    authorityLabel: "Regional Transport Office (RTO) / State Transport Department",
    inspectionRequiredAtCountryLevel: false,
    jurisdictionSelectionRequired: true,
  },
  US: {
    registrationLabel: "License plate number",
    registrationDocumentLabel: "Vehicle registration document",
    inspectionLabel: "State inspection valid until (if required)",
    inspectionHelp: "Inspection and emissions rules vary by state and vehicle type. Confirm the requirements for the vehicle's registration state.",
    authorityLabel: "State DMV or equivalent motor vehicle agency",
    inspectionRequiredAtCountryLevel: false,
    jurisdictionSelectionRequired: true,
  },
  CA: {
    registrationLabel: "Licence plate number",
    registrationDocumentLabel: "Provincial or territorial vehicle registration",
    inspectionLabel: "Safety inspection valid until (if required)",
    inspectionHelp: "Safety inspection and registration rules vary by province or territory and vehicle type.",
    authorityLabel: "Provincial or territorial motor vehicle authority",
    inspectionRequiredAtCountryLevel: false,
    jurisdictionSelectionRequired: true,
  },
  AU: {
    registrationLabel: "Registration number",
    registrationDocumentLabel: "Vehicle registration certificate / papers",
    inspectionLabel: "Roadworthiness inspection valid until (if required)",
    inspectionHelp: "Inspection and roadworthiness requirements vary by state or territory and vehicle type.",
    authorityLabel: "State or territory road transport authority",
    inspectionRequiredAtCountryLevel: false,
    jurisdictionSelectionRequired: true,
  },
  NZ: {
    registrationLabel: "Registration number plate",
    registrationDocumentLabel: "Vehicle registration papers",
    inspectionLabel: "WoF / CoF expiry date (as applicable)",
    inspectionHelp: "Use the applicable Warrant of Fitness (WoF) or Certificate of Fitness (CoF) expiry date.",
    authorityLabel: "Waka Kotahi NZ Transport Agency",
    inspectionRequiredAtCountryLevel: true,
    jurisdictionSelectionRequired: false,
  },
};

export function getLocalisationProfile(identity: MarketIdentity): LocalisationProfile | null {
  const market = marketForAccount(identity);
  if (!market) return null;
  const terms = VEHICLE_TERMS[market.country] ?? {
    registrationLabel: "Vehicle registration number",
    registrationDocumentLabel: "Vehicle registration document",
    inspectionLabel: "Roadworthiness inspection valid until (if required)",
    inspectionHelp: "Inspection and roadworthiness requirements depend on local law, vehicle type and the registration jurisdiction. Confirm requirements with the relevant local authority.",
    authorityLabel: "Local vehicle registration / transport authority",
    inspectionRequiredAtCountryLevel: false,
    jurisdictionSelectionRequired: false,
  };
  return {
    country: market.country,
    currency: market.currency,
    locale: market.locale,
    timeZone: market.timeZone,
    dialingCode: market.dialingCode,
    marketplaceLabel: market.label,
    ...terms,
    weightUnit: market.country === "US" ? "lb" : "kg",
    distanceUnit: market.country === "US" || market.country === "GB" ? "mile" : "km",
    vehicleMassLabel: market.country === "US" ? "Gross Vehicle Weight Rating (GVWR, lb)" : market.country === "GB" ? "Maximum authorised mass (kg)" : market.country === "IN" ? "Gross vehicle weight (kg)" : "Maximum vehicle weight (kg)",
  };
}

export function formatMarketDate(value: Date | string | number, identity: MarketIdentity, options?: Intl.DateTimeFormatOptions): string {
  const profile = getLocalisationProfile(identity);
  const dateOnly = typeof value === "string" &&
    (/^\d{4}-\d{2}-\d{2}$/.test(value) || /T00:00:00(?:\.000)?Z$/.test(value));
  const date = value instanceof Date ? value : new Date(value);
  if (!profile || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(profile.locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    // Calendar dates (job dates / expiry dates) must not shift across time zones.
    timeZone: dateOnly ? "UTC" : profile.timeZone,
    ...options,
  }).format(date);
}

export function formatMarketDateTime(value: Date | string | number, identity: MarketIdentity): string {
  const profile = getLocalisationProfile(identity);
  const date = value instanceof Date ? value : new Date(value);
  if (!profile || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(profile.locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: profile.timeZone,
  }).format(date);
}
