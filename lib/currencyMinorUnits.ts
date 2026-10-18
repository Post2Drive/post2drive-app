export function currencyMinorUnitScale(currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError("Invalid currency code.");
  return 10 ** new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
}

export function majorUnitsToMinorUnits(amount: number, currency: string): number {
  if (!Number.isFinite(amount)) throw new RangeError("Amount must be finite.");
  return Math.round(amount * currencyMinorUnitScale(currency));
}

export function minorUnitsToMajorUnits(amountMinorUnits: number, currency: string): number {
  if (!Number.isSafeInteger(amountMinorUnits)) throw new RangeError("Minor-unit amount must be a safe integer.");
  return amountMinorUnits / currencyMinorUnitScale(currency);
}
