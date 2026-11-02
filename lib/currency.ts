import { MARKETS, LAUNCH_COUNTRIES, getMarket, type SupportedCountry } from "@/lib/market";

/** Only launch-enabled Post2Drive markets are selectable in the signup flow. */
export const COUNTRIES = Object.values(MARKETS)
  .filter((market) => LAUNCH_COUNTRIES.has(market.country))
  .map((market) => ({
    code: market.country,
    name: market.label,
    currency: market.currency,
    locale: market.locale,
    dialingCode: market.dialingCode,
  }))
  .sort((a, b) => {
    if (a.code === "GB") return -1;
    if (b.code === "GB") return 1;
    if (a.code === "IN") return -1;
    if (b.code === "IN") return 1;
    return a.name.localeCompare(b.name);
  }) as { code: SupportedCountry; name: string; currency: string; locale: string; dialingCode: string }[];

/** Friendly names for every currency used by a configured Post2Drive market. */
const CURRENCY_LABELS: Record<string, string> = {
  GBP: "British Pound",
  INR: "Indian Rupee",
  EUR: "Euro",
  PLN: "Polish Złoty",
  SEK: "Swedish Krona",
  DKK: "Danish Krone",
  RON: "Romanian Leu",
  CZK: "Czech Koruna",
  HUF: "Hungarian Forint",
  NOK: "Norwegian Krone",
  CHF: "Swiss Franc",
  TRY: "Turkish Lira",
  ISK: "Icelandic Króna",
  USD: "US Dollar",
  CAD: "Canadian Dollar",
  AUD: "Australian Dollar",
  NZD: "New Zealand Dollar",
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
