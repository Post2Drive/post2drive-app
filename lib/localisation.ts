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
AT: {"registrationLabel":"Kennzeichen (registration plate)","registrationDocumentLabel":"Zulassungsbescheinigung","inspectionLabel":"§57a inspection (Pickerl) valid until","inspectionHelp":"Requirements depend on vehicle class and exemptions.","authorityLabel":"Provincial registration authority / authorised inspection station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  BE: {"registrationLabel":"Numéro d’immatriculation / kenteken","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Technical inspection (contrôle technique / autokeuring) valid until","inspectionHelp":"Requirements vary by vehicle class and region.","authorityLabel":"DIV / regional technical inspection service","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":true},
  BG: {"registrationLabel":"Registration plate number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Periodic technical inspection valid until","inspectionHelp":"Confirm requirements for vehicle category and use.","authorityLabel":"Traffic Police (KAT) / Ministry of Interior","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  HR: {"registrationLabel":"Registracijska oznaka","registrationDocumentLabel":"Prometna dozvola","inspectionLabel":"Technical inspection valid until","inspectionHelp":"Requirements depend on vehicle category and use.","authorityLabel":"CVH inspection network / Ministry of the Interior","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  CY: {"registrationLabel":"Registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Roadworthiness test valid until","inspectionHelp":"Confirm requirements for this vehicle class.","authorityLabel":"Department of Road Transport","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  EE: {"registrationLabel":"Registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Roadworthiness inspection valid until","inspectionHelp":"Inspection period depends on vehicle type and first registration.","authorityLabel":"Estonian Transport Administration","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  FI: {"registrationLabel":"Rekisteritunnus","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Periodic vehicle inspection valid until","inspectionHelp":"Interval depends on vehicle class, age and use.","authorityLabel":"Traficom / authorised inspection station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  FR: {"registrationLabel":"Immatriculation number","registrationDocumentLabel":"Certificat d’immatriculation (carte grise)","inspectionLabel":"Contrôle technique valid until","inspectionHelp":"Rules and intervals depend on vehicle class and use.","authorityLabel":"ANTS / competent registration authority and approved inspection centre","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  DE: {"registrationLabel":"Kennzeichen (registration plate)","registrationDocumentLabel":"Zulassungsbescheinigung Teil I","inspectionLabel":"Hauptuntersuchung (HU) valid until","inspectionHelp":"Inspection and emissions requirements depend on vehicle class; TÜV is one provider, not the sole authority.","authorityLabel":"Local Zulassungsstelle / Kraftfahrt-Bundesamt (KBA)","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  GR: {"registrationLabel":"Registration number","registrationDocumentLabel":"Vehicle registration certificate (άδεια κυκλοφορίας)","inspectionLabel":"KTEO technical inspection valid until","inspectionHelp":"Confirm the applicable schedule for this vehicle category.","authorityLabel":"Ministry of Infrastructure and Transport / KTEO inspection centre","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  IE: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Vehicle Registration Certificate (VRC)","inspectionLabel":"NCT / CVRT expiry date (as applicable)","inspectionHelp":"Use NCT for applicable private vehicles or CVRT for applicable commercial vehicles.","authorityLabel":"Road Safety Authority (RSA) / Department of Transport","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false}
IT: {"registrationLabel":"Targa (registration plate)","registrationDocumentLabel":"Documento Unico di Circolazione e di Proprietà","inspectionLabel":"Revisione (vehicle inspection) valid until","inspectionHelp":"Intervals depend on vehicle category and first registration.","authorityLabel":"Motorizzazione Civile / authorised inspection centre","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  LV: {"registrationLabel":"Registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Technical inspection valid until","inspectionHelp":"Frequency depends on vehicle type and use.","authorityLabel":"CSDD (Road Traffic Safety Directorate)","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  LT: {"registrationLabel":"Registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Technical inspection valid until","inspectionHelp":"Interval depends on vehicle category and use.","authorityLabel":"Regitra / authorised technical inspection station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  LU: {"registrationLabel":"Registration number","registrationDocumentLabel":"Certificat d’immatriculation","inspectionLabel":"Contrôle technique valid until","inspectionHelp":"Requirements depend on vehicle category and use.","authorityLabel":"SNCA / approved technical inspection body","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  MT: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Vehicle Roadworthiness Test (VRT) valid until","inspectionHelp":"Requirements depend on vehicle category, age and use.","authorityLabel":"Transport Malta","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  NL: {"registrationLabel":"Kenteken","registrationDocumentLabel":"Kentekenbewijs","inspectionLabel":"APK valid until","inspectionHelp":"Frequency depends on vehicle category, age and fuel type.","authorityLabel":"RDW (Netherlands Vehicle Authority)","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  PT: {"registrationLabel":"Matrícula (registration plate)","registrationDocumentLabel":"Documento Único Automóvel (DUA)","inspectionLabel":"Inspeção Periódica Obrigatória (IPO) valid until","inspectionHelp":"Rules depend on vehicle category and age.","authorityLabel":"IMT / approved inspection centre","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  SK: {"registrationLabel":"Registration number","registrationDocumentLabel":"Osvedčenie o evidencii vozidla","inspectionLabel":"STK / EK inspection valid until","inspectionHelp":"Technical and emissions requirements depend on vehicle class and use.","authorityLabel":"Ministry of Interior / authorised STK station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  SI: {"registrationLabel":"Registration number","registrationDocumentLabel":"Prometno dovoljenje","inspectionLabel":"Technical inspection valid until","inspectionHelp":"Period depends on vehicle class and age.","authorityLabel":"Slovenian Traffic Safety Agency / authorised inspection centre","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  ES: {"registrationLabel":"Matrícula (registration plate)","registrationDocumentLabel":"Permiso de circulación","inspectionLabel":"ITV inspection valid until","inspectionHelp":"Frequency depends on vehicle category, age and use.","authorityLabel":"DGT / authorised ITV station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false}
AD: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"ITV roadworthiness inspection valid until","inspectionHelp":"Confirm requirements for the vehicle class with the local transport authority.","authorityLabel":"Andorran Government vehicle / transport registration service","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  MC: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Certificat d’immatriculation","inspectionLabel":"Technical inspection valid until (if applicable)","inspectionHelp":"Confirm requirements for this vehicle class with the competent local authority.","authorityLabel":"Monaco Service des Titres de Circulation","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  SM: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Technical inspection valid until (if applicable)","inspectionHelp":"Confirm current inspection requirements for the vehicle class with the local authority.","authorityLabel":"San Marino Ufficio Registro Automezzi","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  VA: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Vehicle registration document (confirm issuing jurisdiction)","inspectionLabel":"Roadworthiness inspection valid until (if applicable)","inspectionHelp":"Confirm which registration and inspection regime applies; do not assume a separate Vatican commercial vehicle regime.","authorityLabel":"Relevant vehicle registration authority for the vehicle’s registration jurisdiction","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  XK: {"registrationLabel":"Registration plate number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Technical inspection valid until","inspectionHelp":"Confirm current technical inspection requirements for the vehicle class.","authorityLabel":"Kosovo Ministry of Internal Affairs / authorised inspection centre","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  ME: {"registrationLabel":"Registration plate number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Technical inspection valid until","inspectionHelp":"Requirements depend on vehicle class and use.","authorityLabel":"Montenegro Ministry of Interior / authorised inspection centre","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  CZ: {"registrationLabel":"Registration plate number","registrationDocumentLabel":"Osvědčení o registraci vozidla","inspectionLabel":"STK technical inspection valid until","inspectionHelp":"Technical inspection and emissions requirements depend on vehicle class and use.","authorityLabel":"Ministry of Transport / authorised STK station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  DK: {"registrationLabel":"Registreringsnummer","registrationDocumentLabel":"Registreringsattest","inspectionLabel":"Periodisk syn valid until","inspectionHelp":"Inspection schedule depends on vehicle type and use.","authorityLabel":"Danish Motor Vehicle Agency / Færdselsstyrelsen","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  HU: {"registrationLabel":"Registration plate number","registrationDocumentLabel":"Forgalmi engedély","inspectionLabel":"Műszaki vizsga valid until","inspectionHelp":"Technical inspection schedule depends on vehicle category and use.","authorityLabel":"Competent Government Office / authorised inspection station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false}
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
