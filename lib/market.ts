/** Supported Post2Drive markets. A market is defined by both country and currency. */
export const MARKETS = {
  GB: {
    country: "GB",
    currency: "GBP",
    label: "United Kingdom",
    timeZone: "Europe/London",
    symbol: "£",
    locale: "en-GB",
  },
  IN: {
    country: "IN",
    currency: "INR",
    label: "India",
    timeZone: "Asia/Kolkata",
    symbol: "₹",
    locale: "en-IN",
  },
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

export function marketTimeZone(value: MarketIdentity): string {
  return marketForAccount(value)?.timeZone ?? MARKETS.GB.timeZone;
}
