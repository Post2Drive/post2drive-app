/**
 * Market-aware wording for user-facing app labels.
 *
 * Country-level terms are used only where the system can safely determine them.
 * Vehicle compliance can be subnational (US states, Canadian provinces/territories,
 * Australian states/territories), so the UI must not imply that one national rule
 * or regulator applies everywhere.
 */
import { getMarket, marketForAccount, type MarketIdentity } from "./market.ts";

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
  jurisdictionLabel: string;
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
    inspectionRequiredAtCountryLevel: false,
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
  IE: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Vehicle Registration Certificate (VRC)","inspectionLabel":"NCT / CVRT expiry date (as applicable)","inspectionHelp":"Use NCT for applicable private vehicles or CVRT for applicable commercial vehicles.","authorityLabel":"Road Safety Authority (RSA) / Department of Transport","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  IT: {"registrationLabel":"Targa (registration plate)","registrationDocumentLabel":"Documento Unico di Circolazione e di Proprietà","inspectionLabel":"Revisione (vehicle inspection) valid until","inspectionHelp":"Intervals depend on vehicle category and first registration.","authorityLabel":"Motorizzazione Civile / authorised inspection centre","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  LV: {"registrationLabel":"Registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Technical inspection valid until","inspectionHelp":"Frequency depends on vehicle type and use.","authorityLabel":"CSDD (Road Traffic Safety Directorate)","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  LT: {"registrationLabel":"Registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Technical inspection valid until","inspectionHelp":"Interval depends on vehicle category and use.","authorityLabel":"Regitra / authorised technical inspection station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  LU: {"registrationLabel":"Registration number","registrationDocumentLabel":"Certificat d’immatriculation","inspectionLabel":"Contrôle technique valid until","inspectionHelp":"Requirements depend on vehicle category and use.","authorityLabel":"SNCA / approved technical inspection body","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  MT: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Vehicle Roadworthiness Test (VRT) valid until","inspectionHelp":"Requirements depend on vehicle category, age and use.","authorityLabel":"Transport Malta","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  NL: {"registrationLabel":"Kenteken","registrationDocumentLabel":"Kentekenbewijs","inspectionLabel":"APK valid until","inspectionHelp":"Frequency depends on vehicle category, age and fuel type.","authorityLabel":"RDW (Netherlands Vehicle Authority)","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  PT: {"registrationLabel":"Matrícula (registration plate)","registrationDocumentLabel":"Documento Único Automóvel (DUA)","inspectionLabel":"Inspeção Periódica Obrigatória (IPO) valid until","inspectionHelp":"Rules depend on vehicle category and age.","authorityLabel":"IMT / approved inspection centre","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  SK: {"registrationLabel":"Registration number","registrationDocumentLabel":"Osvedčenie o evidencii vozidla","inspectionLabel":"STK / EK inspection valid until","inspectionHelp":"Technical and emissions requirements depend on vehicle class and use.","authorityLabel":"Ministry of Interior / authorised STK station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  SI: {"registrationLabel":"Registration number","registrationDocumentLabel":"Prometno dovoljenje","inspectionLabel":"Technical inspection valid until","inspectionHelp":"Period depends on vehicle class and age.","authorityLabel":"Slovenian Traffic Safety Agency / authorised inspection centre","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  ES: {"registrationLabel":"Matrícula (registration plate)","registrationDocumentLabel":"Permiso de circulación","inspectionLabel":"ITV inspection valid until","inspectionHelp":"Frequency depends on vehicle category, age and use.","authorityLabel":"DGT / authorised ITV station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  AD: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"ITV roadworthiness inspection valid until","inspectionHelp":"Confirm requirements for the vehicle class with the local transport authority.","authorityLabel":"Andorran Government vehicle / transport registration service","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  MC: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Certificat d’immatriculation","inspectionLabel":"Technical inspection valid until (if applicable)","inspectionHelp":"Confirm requirements for this vehicle class with the competent local authority.","authorityLabel":"Monaco Service des Titres de Circulation","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  SM: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Technical inspection valid until (if applicable)","inspectionHelp":"Confirm current inspection requirements for the vehicle class with the local authority.","authorityLabel":"San Marino Ufficio Registro Automezzi","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  VA: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Vehicle registration document (confirm issuing jurisdiction)","inspectionLabel":"Roadworthiness inspection valid until (if applicable)","inspectionHelp":"Confirm which registration and inspection regime applies; do not assume a separate Vatican commercial vehicle regime.","authorityLabel":"Relevant vehicle registration authority for the vehicle’s registration jurisdiction","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  XK: {"registrationLabel":"Registration plate number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Technical inspection valid until","inspectionHelp":"Confirm current technical inspection requirements for the vehicle class.","authorityLabel":"Kosovo Ministry of Internal Affairs / authorised inspection centre","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  ME: {"registrationLabel":"Registration plate number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Technical inspection valid until","inspectionHelp":"Requirements depend on vehicle class and use.","authorityLabel":"Montenegro Ministry of Interior / authorised inspection centre","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  CZ: {"registrationLabel":"Registration plate number","registrationDocumentLabel":"Osvědčení o registraci vozidla","inspectionLabel":"STK technical inspection valid until","inspectionHelp":"Technical inspection and emissions requirements depend on vehicle class and use.","authorityLabel":"Ministry of Transport / authorised STK station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  DK: {"registrationLabel":"Registreringsnummer","registrationDocumentLabel":"Registreringsattest","inspectionLabel":"Periodisk syn valid until","inspectionHelp":"Inspection schedule depends on vehicle type and use.","authorityLabel":"Danish Motor Vehicle Agency / Færdselsstyrelsen","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  HU: {"registrationLabel":"Registration plate number","registrationDocumentLabel":"Forgalmi engedély","inspectionLabel":"Műszaki vizsga valid until","inspectionHelp":"Technical inspection schedule depends on vehicle category and use.","authorityLabel":"Competent Government Office / authorised inspection station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  IS: {"registrationLabel":"Registration number","registrationDocumentLabel":"Vehicle registration certificate","inspectionLabel":"Vehicle inspection valid until","inspectionHelp":"Inspection schedule depends on vehicle class and use.","authorityLabel":"Icelandic Transport Authority / authorised inspection station","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  NO: {"registrationLabel":"Registreringsnummer","registrationDocumentLabel":"Vognkort (vehicle registration certificate)","inspectionLabel":"EU-kontroll valid until","inspectionHelp":"Roadworthiness inspection interval depends on vehicle category and use.","authorityLabel":"Norwegian Public Roads Administration (Statens vegvesen)","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  PL: {"registrationLabel":"Numer rejestracyjny","registrationDocumentLabel":"Dowód rejestracyjny (registration certificate)","inspectionLabel":"Badanie techniczne valid until","inspectionHelp":"Inspection interval depends on vehicle class and use.","authorityLabel":"Local registration office / Central Vehicle Register (CEPiK)","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  RO: {"registrationLabel":"Număr de înmatriculare","registrationDocumentLabel":"Certificat de înmatriculare","inspectionLabel":"ITP (periodic technical inspection) valid until","inspectionHelp":"ITP interval depends on vehicle class, age and use.","authorityLabel":"Romanian Auto Registry (RAR) / competent registration authority","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  SE: {"registrationLabel":"Registreringsnummer","registrationDocumentLabel":"Registreringsbevis (registration certificate)","inspectionLabel":"Vehicle inspection valid until","inspectionHelp":"Inspection frequency depends on vehicle category and use.","authorityLabel":"Swedish Transport Agency (Transportstyrelsen)","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false},
  CH: {"registrationLabel":"Vehicle registration number","registrationDocumentLabel":"Fahrzeugausweis / permis de circulation","inspectionLabel":"MFK / contrôle technique valid until","inspectionHelp":"Registration and inspection are handled by cantons; requirements depend on vehicle class.","authorityLabel":"Cantonal road traffic office","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":true},
  TR: {"registrationLabel":"Plaka (registration plate)","registrationDocumentLabel":"Araç tescil belgesi (vehicle registration certificate)","inspectionLabel":"Vehicle inspection (TÜVTÜRK) valid until","inspectionHelp":"Inspection interval depends on vehicle category and use.","authorityLabel":"TÜVTÜRK inspection network / competent traffic registration authority","inspectionRequiredAtCountryLevel":false,"jurisdictionSelectionRequired":false}
};


export const REGION_OPTIONS: Record<string, { code: string; label: string }[]> = {
  US: [
    { code: "AL", label: "Alabama" }, { code: "AK", label: "Alaska" }, { code: "AZ", label: "Arizona" }, { code: "AR", label: "Arkansas" }, { code: "CA", label: "California" }, { code: "CO", label: "Colorado" }, { code: "CT", label: "Connecticut" }, { code: "DE", label: "Delaware" }, { code: "DC", label: "District of Columbia" }, { code: "FL", label: "Florida" }, { code: "GA", label: "Georgia" }, { code: "HI", label: "Hawaii" }, { code: "ID", label: "Idaho" }, { code: "IL", label: "Illinois" }, { code: "IN", label: "Indiana" }, { code: "IA", label: "Iowa" }, { code: "KS", label: "Kansas" }, { code: "KY", label: "Kentucky" }, { code: "LA", label: "Louisiana" }, { code: "ME", label: "Maine" }, { code: "MD", label: "Maryland" }, { code: "MA", label: "Massachusetts" }, { code: "MI", label: "Michigan" }, { code: "MN", label: "Minnesota" }, { code: "MS", label: "Mississippi" }, { code: "MO", label: "Missouri" }, { code: "MT", label: "Montana" }, { code: "NE", label: "Nebraska" }, { code: "NV", label: "Nevada" }, { code: "NH", label: "New Hampshire" }, { code: "NJ", label: "New Jersey" }, { code: "NM", label: "New Mexico" }, { code: "NY", label: "New York" }, { code: "NC", label: "North Carolina" }, { code: "ND", label: "North Dakota" }, { code: "OH", label: "Ohio" }, { code: "OK", label: "Oklahoma" }, { code: "OR", label: "Oregon" }, { code: "PA", label: "Pennsylvania" }, { code: "RI", label: "Rhode Island" }, { code: "SC", label: "South Carolina" }, { code: "SD", label: "South Dakota" }, { code: "TN", label: "Tennessee" }, { code: "TX", label: "Texas" }, { code: "UT", label: "Utah" }, { code: "VT", label: "Vermont" }, { code: "VA", label: "Virginia" }, { code: "WA", label: "Washington" }, { code: "WV", label: "West Virginia" }, { code: "WI", label: "Wisconsin" }, { code: "WY", label: "Wyoming" },
  ],
  CA: [
    { code: "AB", label: "Alberta" }, { code: "BC", label: "British Columbia" }, { code: "MB", label: "Manitoba" }, { code: "NB", label: "New Brunswick" }, { code: "NL", label: "Newfoundland and Labrador" }, { code: "NS", label: "Nova Scotia" }, { code: "NT", label: "Northwest Territories" }, { code: "NU", label: "Nunavut" }, { code: "ON", label: "Ontario" }, { code: "PE", label: "Prince Edward Island" }, { code: "QC", label: "Quebec" }, { code: "SK", label: "Saskatchewan" }, { code: "YT", label: "Yukon" },
  ],
  AU: [
    { code: "ACT", label: "Australian Capital Territory" }, { code: "NSW", label: "New South Wales" }, { code: "NT", label: "Northern Territory" }, { code: "QLD", label: "Queensland" }, { code: "SA", label: "South Australia" }, { code: "TAS", label: "Tasmania" }, { code: "VIC", label: "Victoria" }, { code: "WA", label: "Western Australia" },
  ],
  IN: [
    { code: "AP", label: "Andhra Pradesh" }, { code: "AR", label: "Arunachal Pradesh" }, { code: "AS", label: "Assam" }, { code: "BR", label: "Bihar" }, { code: "CG", label: "Chhattisgarh" }, { code: "GA", label: "Goa" }, { code: "GJ", label: "Gujarat" }, { code: "HR", label: "Haryana" }, { code: "HP", label: "Himachal Pradesh" }, { code: "JH", label: "Jharkhand" }, { code: "KA", label: "Karnataka" }, { code: "KL", label: "Kerala" }, { code: "MP", label: "Madhya Pradesh" }, { code: "MH", label: "Maharashtra" }, { code: "MN", label: "Manipur" }, { code: "ML", label: "Meghalaya" }, { code: "MZ", label: "Mizoram" }, { code: "NL", label: "Nagaland" }, { code: "OD", label: "Odisha" }, { code: "PB", label: "Punjab" }, { code: "RJ", label: "Rajasthan" }, { code: "SK", label: "Sikkim" }, { code: "TN", label: "Tamil Nadu" }, { code: "TS", label: "Telangana" }, { code: "TR", label: "Tripura" }, { code: "UP", label: "Uttar Pradesh" }, { code: "UK", label: "Uttarakhand" }, { code: "WB", label: "West Bengal" }, { code: "AN", label: "Andaman and Nicobar Islands" }, { code: "CH", label: "Chandigarh" }, { code: "DH", label: "Dadra and Nagar Haveli and Daman and Diu" }, { code: "DL", label: "Delhi" }, { code: "JK", label: "Jammu and Kashmir" }, { code: "LA", label: "Ladakh" }, { code: "LD", label: "Lakshadweep" }, { code: "PY", label: "Puducherry" },
  ],
  BE: [
    { code: "BRU", label: "Brussels-Capital Region" }, { code: "VLG", label: "Flemish Region" }, { code: "WAL", label: "Walloon Region" },
  ],
  CH: [
    { code: "AG", label: "Aargau" }, { code: "AI", label: "Appenzell Innerrhoden" }, { code: "AR", label: "Appenzell Ausserrhoden" }, { code: "BE", label: "Bern" }, { code: "BL", label: "Basel-Landschaft" }, { code: "BS", label: "Basel-Stadt" }, { code: "FR", label: "Fribourg" }, { code: "GE", label: "Geneva" }, { code: "GL", label: "Glarus" }, { code: "GR", label: "Graubünden" }, { code: "JU", label: "Jura" }, { code: "LU", label: "Lucerne" }, { code: "NE", label: "Neuchâtel" }, { code: "NW", label: "Nidwalden" }, { code: "OW", label: "Obwalden" }, { code: "SG", label: "St. Gallen" }, { code: "SH", label: "Schaffhausen" }, { code: "SO", label: "Solothurn" }, { code: "SZ", label: "Schwyz" }, { code: "TG", label: "Thurgau" }, { code: "TI", label: "Ticino" }, { code: "UR", label: "Uri" }, { code: "VD", label: "Vaud" }, { code: "VS", label: "Valais" }, { code: "ZG", label: "Zug" }, { code: "ZH", label: "Zurich" },
  ],
};


export const TIME_ZONE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  US: [
    { value: "America/New_York", label: "Eastern Time" }, { value: "America/Chicago", label: "Central Time" }, { value: "America/Denver", label: "Mountain Time" }, { value: "America/Phoenix", label: "Arizona (no seasonal clock change in most areas)" }, { value: "America/Los_Angeles", label: "Pacific Time" }, { value: "America/Anchorage", label: "Alaska Time" }, { value: "Pacific/Honolulu", label: "Hawaii Time" },
  ],
  CA: [
    { value: "America/St_Johns", label: "Newfoundland Time" }, { value: "America/Halifax", label: "Atlantic Time" }, { value: "America/Toronto", label: "Eastern Time" }, { value: "America/Winnipeg", label: "Central Time" }, { value: "America/Edmonton", label: "Mountain Time" }, { value: "America/Vancouver", label: "Pacific Time" }, { value: "America/Whitehorse", label: "Yukon Time" },
  ],
  AU: [
    { value: "Australia/Perth", label: "Western Australia Time" }, { value: "Australia/Darwin", label: "Northern Territory Time" }, { value: "Australia/Adelaide", label: "South Australia Time" }, { value: "Australia/Brisbane", label: "Queensland Time" }, { value: "Australia/Sydney", label: "New South Wales / ACT Time" }, { value: "Australia/Hobart", label: "Tasmania Time" },
  ],
};


const REGIONAL_AUTHORITIES: Record<string, Record<string, string>> = {
  US: {
    AL: "Alabama Law Enforcement Agency (ALEA)", AK: "Alaska DMV", AZ: "Arizona Motor Vehicle Division (MVD)", AR: "Arkansas DFA Revenue Office", CA: "California DMV", CO: "Colorado DMV", CT: "Connecticut DMV", DE: "Delaware DMV", DC: "District of Columbia DMV", FL: "Florida DHSMV", GA: "Georgia Department of Driver Services / Motor Vehicle Division", HI: "County DMV", ID: "Idaho Transportation Department / DMV", IL: "Illinois Secretary of State", IN: "Indiana Bureau of Motor Vehicles (BMV)", IA: "Iowa DOT", KS: "Kansas Division of Vehicles", KY: "Kentucky Transportation Cabinet", LA: "Louisiana Office of Motor Vehicles", ME: "Maine Bureau of Motor Vehicles", MD: "Maryland Motor Vehicle Administration (MVA)", MA: "Massachusetts Registry of Motor Vehicles (RMV)", MI: "Michigan Secretary of State", MN: "Minnesota Driver and Vehicle Services", MS: "Mississippi Department of Revenue", MO: "Missouri Department of Revenue", MT: "Montana Motor Vehicle Division", NE: "Nebraska DMV", NV: "Nevada DMV", NH: "New Hampshire DMV", NJ: "New Jersey Motor Vehicle Commission (MVC)", NM: "New Mexico Motor Vehicle Division", NY: "New York DMV", NC: "North Carolina DMV", ND: "North Dakota Department of Transportation", OH: "Ohio Bureau of Motor Vehicles (BMV)", OK: "Service Oklahoma", OR: "Oregon DMV", PA: "PennDOT", RI: "Rhode Island DMV", SC: "South Carolina DMV", SD: "South Dakota Department of Public Safety", TN: "Tennessee Department of Revenue / Driver Services", TX: "Texas DMV", UT: "Utah DMV", VT: "Vermont DMV", VA: "Virginia DMV", WA: "Washington State Department of Licensing", WV: "West Virginia DMV", WI: "Wisconsin DMV", WY: "Wyoming Department of Transportation",
  },
  CA: {
    AB: "Alberta registry agents / Service Alberta", BC: "ICBC (Insurance Corporation of British Columbia)", MB: "Manitoba Public Insurance (MPI)", NB: "Service New Brunswick", NL: "Newfoundland and Labrador Motor Registration Division", NS: "Nova Scotia Registry of Motor Vehicles", NT: "Northwest Territories Department of Infrastructure", NU: "Nunavut vehicle registration authority", ON: "ServiceOntario", PE: "Access PEI", QC: "Société de l’assurance automobile du Québec (SAAQ)", SK: "SGI (Saskatchewan Government Insurance)", YT: "Yukon Motor Vehicles",
  },
  AU: {
    ACT: "Access Canberra", NSW: "Service NSW", NT: "Northern Territory Motor Vehicle Registry", QLD: "Queensland Department of Transport and Main Roads", SA: "Service SA", TAS: "Service Tasmania", VIC: "VicRoads", WA: "Western Australia Department of Transport",
  },
  BE: { BRU: "Brussels-Capital Region vehicle inspection service / DIV", VLG: "Flemish vehicle inspection service / DIV", WAL: "Walloon vehicle inspection service / DIV" },
  CH: {
    AG: "Strassenverkehrsamt Aargau", BE: "Strassenverkehrsamt Bern", GE: "Office cantonal des véhicules (Geneva)", VD: "Service des automobiles et de la navigation (Vaud)", ZH: "Strassenverkehrsamt Zürich",
  },
};

export function getJurisdictionAuthority(country: string, region?: string | null, currency?: string) {
  if (region && REGIONAL_AUTHORITIES[country]?.[region]) return REGIONAL_AUTHORITIES[country][region];
  if (country === "IN" && region) {
    const state = getJurisdictionOptions(country).find((item) => item.code === region)?.label;
    return state ? `${state} Transport Department / Regional Transport Office (RTO)` : "State Transport Department / Regional Transport Office (RTO)";
  }
  const market = getMarket(country);
  return market ? getLocalisationProfile({ country, currency: currency ?? market.currency })?.authorityLabel ?? "Relevant local vehicle authority" : "Relevant local vehicle authority";
}

export function getTimeZoneOptions(country: string, defaultTimeZone?: string) {
  const configured = TIME_ZONE_OPTIONS[country];
  if (configured) return configured;
  const fallback = defaultTimeZone ?? getMarket(country)?.timeZone;
  return fallback ? [{ value: fallback, label: fallback }] : [];
}

export function getJurisdictionOptions(country: string) {
  return REGION_OPTIONS[country] ?? [];
}

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
    jurisdictionLabel: market.country === "IN" ? "State / Union Territory (RTO jurisdiction)" : market.country === "US" ? "Vehicle registration state" : market.country === "CA" ? "Vehicle registration province / territory" : market.country === "AU" ? "Vehicle registration state / territory" : market.country === "CH" ? "Vehicle registration canton" : market.country === "BE" ? "Vehicle registration region" : "Vehicle registration jurisdiction",
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


export function formatMarketCurrency(value: number | string, identity: MarketIdentity): string {
  const profile = getLocalisationProfile(identity);
  const amount = Number(value);
  if (!profile || !Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat(profile.locale, {
    style: "currency",
    currency: profile.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
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
