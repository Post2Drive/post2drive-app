import { MARKETS, getMarket, type SupportedCountry } from "@/lib/market";

/** Only configured Post2Drive markets are selectable. */
export const COUNTRIES = Object.values(MARKETS)
  .map((market) => ({
    code: market.country,
    name: market.label,
    currency: market.currency,
    dialingCode: market.dialingCode,
  }))
  .sort((a, b) => {
    if (a.code === "GB") return -1;
    if (b.code === "GB") return 1;
    if (a.code === "IN") return -1;
    if (b.code === "IN") return 1;
    return a.name.localeCompare(b.name);
  }) as { code: SupportedCountry; name: string; currency: string; dialingCode: string }[];

/** Currency choices follow the selected market; users cannot choose a mismatched currency. */
const CURRENCY_LABELS: Record<string, string> = {
  GBP: "British Pound",
  INR: "Indian Rupee",
  EUR: "Euro",
};

export const CURRENCIES = Array.from(
  new Map(Object.values(MARKETS).map((market) => [
    market.currency,
    {
      code: market.currency,
      label: CURRENCY_LABELS[market.currency] ?? market.currency,
      symbol: market.symbol,
    },
  ])).values()
);

export function currencyForCountry(countryCode: string): string {
  return getMarket(countryCode)?.currency ?? "";
}

export function symbolFor(currencyCode: string): string {
  return CURRENCIES.find((currency) => currency.code === currencyCode)?.symbol ?? currencyCode + " ";
}
