/** Supported Post2Drive markets. A market is defined by both country and currency. */
export const MARKETS = {
  GB: { country: "GB", currency: "GBP", label: "United Kingdom", timeZone: "Europe/London", symbol: "£", locale: "en-GB", dialingCode: "+44" },
  IN: { country: "IN", currency: "INR", label: "India", timeZone: "Asia/Kolkata", symbol: "₹", locale: "en-IN", dialingCode: "+91" },

  // EU member states whose official currency is the euro (including Bulgaria from 2026).
  AT: { country: "AT", currency: "EUR", label: "Austria", timeZone: "Europe/Vienna", symbol: "€", locale: "de-AT", dialingCode: "+43" },
  BE: { country: "BE", currency: "EUR", label: "Belgium", timeZone: "Europe/Brussels", symbol: "€", locale: "fr-BE", dialingCode: "+32" },
  BG: { country: "BG", currency: "EUR", label: "Bulgaria", timeZone: "Europe/Sofia", symbol: "€", locale: "bg-BG", dialingCode: "+359" },
  HR: { country: "HR", currency: "EUR", label: "Croatia", timeZone: "Europe/Zagreb", symbol: "€", locale: "hr-HR", dialingCode: "+385" },
  CY: { country: "CY", currency: "EUR", label: "Cyprus", timeZone: "Asia/Nicosia", symbol: "€", locale: "el-CY", dialingCode: "+357" },
  EE: { country: "EE", currency: "EUR", label: "Estonia", timeZone: "Europe/Tallinn", symbol: "€", locale: "et-EE", dialingCode: "+372" },
  FI: { country: "FI", currency: "EUR", label: "Finland", timeZone: "Europe/Helsinki", symbol: "€", locale: "fi-FI", dialingCode: "+358" },
  FR: { country: "FR", currency: "EUR", label: "France", timeZone: "Europe/Paris", symbol: "€", locale: "fr-FR", dialingCode: "+33" },
  DE: { country: "DE", currency: "EUR", label: "Germany", timeZone: "Europe/Berlin", symbol: "€", locale: "de-DE", dialingCode: "+49" },
  GR: { country: "GR", currency: "EUR", label: "Greece", timeZone: "Europe/Athens", symbol: "€", locale: "el-GR", dialingCode: "+30" },
  IE: { country: "IE", currency: "EUR", label: "Ireland", timeZone: "Europe/Dublin", symbol: "€", locale: "en-IE", dialingCode: "+353" },
  IT: { country: "IT", currency: "EUR", label: "Italy", timeZone: "Europe/Rome", symbol: "€", locale: "it-IT", dialingCode: "+39" },
  LV: { country: "LV", currency: "EUR", label: "Latvia", timeZone: "Europe/Riga", symbol: "€", locale: "lv-LV", dialingCode: "+371" },
  LT: { country: "LT", currency: "EUR", label: "Lithuania", timeZone: "Europe/Vilnius", symbol: "€", locale: "lt-LT", dialingCode: "+370" },
  LU: { country: "LU", currency: "EUR", label: "Luxembourg", timeZone: "Europe/Luxembourg", symbol: "€", locale: "fr-LU", dialingCode: "+352" },
  MT: { country: "MT", currency: "EUR", label: "Malta", timeZone: "Europe/Malta", symbol: "€", locale: "mt-MT", dialingCode: "+356" },
  NL: { country: "NL", currency: "EUR", label: "Netherlands", timeZone: "Europe/Amsterdam", symbol: "€", locale: "nl-NL", dialingCode: "+31" },
  PT: { country: "PT", currency: "EUR", label: "Portugal", timeZone: "Europe/Lisbon", symbol: "€", locale: "pt-PT", dialingCode: "+351" },
  SK: { country: "SK", currency: "EUR", label: "Slovakia", timeZone: "Europe/Bratislava", symbol: "€", locale: "sk-SK", dialingCode: "+421" },
  SI: { country: "SI", currency: "EUR", label: "Slovenia", timeZone: "Europe/Ljubljana", symbol: "€", locale: "sl-SI", dialingCode: "+386" },
  ES: { country: "ES", currency: "EUR", label: "Spain", timeZone: "Europe/Madrid", symbol: "€", locale: "es-ES", dialingCode: "+34" },

  // European microstates with formal euro monetary agreements or unilateral euro use.
  AD: { country: "AD", currency: "EUR", label: "Andorra", timeZone: "Europe/Andorra", symbol: "€", locale: "ca-AD", dialingCode: "+376" },
  MC: { country: "MC", currency: "EUR", label: "Monaco", timeZone: "Europe/Monaco", symbol: "€", locale: "fr-MC", dialingCode: "+377" },
  SM: { country: "SM", currency: "EUR", label: "San Marino", timeZone: "Europe/San_Marino", symbol: "€", locale: "it-SM", dialingCode: "+378" },
  VA: { country: "VA", currency: "EUR", label: "Vatican City", timeZone: "Europe/Vatican", symbol: "€", locale: "it-VA", dialingCode: "+39" },
  XK: { country: "XK", currency: "EUR", label: "Kosovo", timeZone: "Europe/Belgrade", symbol: "€", locale: "sq-XK", dialingCode: "+383" },
  ME: { country: "ME", currency: "EUR", label: "Montenegro", timeZone: "Europe/Podgorica", symbol: "€", locale: "sr-ME", dialingCode: "+382" },

  // Additional mainstream European markets using their local currencies.
  CZ: { country: "CZ", currency: "CZK", label: "Czechia", timeZone: "Europe/Prague", symbol: "Kč", locale: "cs-CZ", dialingCode: "+420" },
  DK: { country: "DK", currency: "DKK", label: "Denmark", timeZone: "Europe/Copenhagen", symbol: "kr", locale: "da-DK", dialingCode: "+45" },
  HU: { country: "HU", currency: "HUF", label: "Hungary", timeZone: "Europe/Budapest", symbol: "Ft", locale: "hu-HU", dialingCode: "+36" },
  IS: { country: "IS", currency: "ISK", label: "Iceland", timeZone: "Atlantic/Reykjavik", symbol: "kr", locale: "is-IS", dialingCode: "+354" },
  NO: { country: "NO", currency: "NOK", label: "Norway", timeZone: "Europe/Oslo", symbol: "kr", locale: "nb-NO", dialingCode: "+47" },
  PL: { country: "PL", currency: "PLN", label: "Poland", timeZone: "Europe/Warsaw", symbol: "zł", locale: "pl-PL", dialingCode: "+48" },
  RO: { country: "RO", currency: "RON", label: "Romania", timeZone: "Europe/Bucharest", symbol: "lei", locale: "ro-RO", dialingCode: "+40" },
  SE: { country: "SE", currency: "SEK", label: "Sweden", timeZone: "Europe/Stockholm", symbol: "kr", locale: "sv-SE", dialingCode: "+46" },
  CH: { country: "CH", currency: "CHF", label: "Switzerland", timeZone: "Europe/Zurich", symbol: "CHF", locale: "de-CH", dialingCode: "+41" },
  TR: { country: "TR", currency: "TRY", label: "Türkiye", timeZone: "Europe/Istanbul", symbol: "₺", locale: "tr-TR", dialingCode: "+90" },

  // North American and Asia-Pacific markets.
  US: { country: "US", currency: "USD", label: "United States", timeZone: "America/New_York", symbol: "$", locale: "en-US", dialingCode: "+1" },
  CA: { country: "CA", currency: "CAD", label: "Canada", timeZone: "America/Toronto", symbol: "CA$", locale: "en-CA", dialingCode: "+1" },
  AU: { country: "AU", currency: "AUD", label: "Australia", timeZone: "Australia/Sydney", symbol: "A$", locale: "en-AU", dialingCode: "+61" },
  NZ: { country: "NZ", currency: "NZD", label: "New Zealand", timeZone: "Pacific/Auckland", symbol: "NZ$", locale: "en-NZ", dialingCode: "+64" },
} as const;

export type SupportedCountry = keyof typeof MARKETS;
export type MarketCurrency = (typeof MARKETS)[SupportedCountry]["currency"];
export type MarketIdentity = { country?: string | null; currency?: string | null };

export function getMarket(country: unknown) {
  if (typeof country !== "string") return null;
  return Object.prototype.hasOwnProperty.call(MARKETS, country)
    ? MARKETS[country as SupportedCountry]
    : null;
}

export function isSupportedMarket(value: MarketIdentity): boolean {
  const market = getMarket(value.country);
  return Boolean(market && value.currency === market.currency);
}

export function marketForCountry(country: unknown) {
  return getMarket(country);
}

export function sameMarket(a: MarketIdentity, b: MarketIdentity): boolean {
  return isSupportedMarket(a) && isSupportedMarket(b) &&
    a.country === b.country && a.currency === b.currency;
}

export function marketForAccount(value: MarketIdentity) {
  const market = getMarket(value.country);
  if (!market || value.currency !== market.currency) return null;
  return market;
}

/** The UK and euro-using markets share the same 7-day pricing model. India remains separately configured. */
export function isWeeklyPricingMarket(value: MarketIdentity): boolean {
  const market = marketForAccount(value);
  return Boolean(market && (market.country === "GB" || market.currency === "EUR"));
}

export function marketTimeZone(value: MarketIdentity): string {
  return marketForAccount(value)?.timeZone ?? MARKETS.GB.timeZone;
}
