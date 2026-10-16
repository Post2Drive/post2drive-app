import { MARKETS, getMarket, type SupportedCountry } from "@/lib/market";

/** Only markets currently supported in the product are selectable. */
export const COUNTRIES = (Object.values(MARKETS).map((market) => ({
  code: market.country,
  name: market.label,
  currency: market.currency,
}))) as { code: SupportedCountry; name: string; currency: string }[];

/** Currency choices follow the selected market; they are not independently selectable. */
export const CURRENCIES = Object.values(MARKETS).map((market) => ({
  code: market.currency,
  label: market.currency === "GBP" ? "British Pound" : "Indian Rupee",
  symbol: market.symbol,
}));

export function currencyForCountry(countryCode: string): string {
  return getMarket(countryCode)?.currency ?? "";
}

export function symbolFor(currencyCode: string): string {
  return CURRENCIES.find((currency) => currency.code === currencyCode)?.symbol ?? currencyCode + " ";
}
