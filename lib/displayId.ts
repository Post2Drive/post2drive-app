import { randomInt } from "node:crypto";

// Builds a human-readable account ID like "ACME-48213579" from a company name.
// Display IDs are labels, not security credentials. An eight-digit cryptographic
// random suffix gives a much larger namespace for large concurrent signup batches;
// the database unique constraint remains the final authority.
export function generateDisplayId(companyName: string): string {
  const letters =
    companyName
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4) || "ACCT";
  const number = randomInt(10_000_000, 100_000_000); // 8 digits; upper bound is exclusive
  return `${letters}-${number}`;
}
