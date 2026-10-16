// Builds a human-readable account ID like "ACME-48213" from a company name.
// Uses a random suffix rather than a true sequential counter to avoid
// needing a separate counter table / concurrency handling for something
// that's just a display label, not a security-sensitive identifier.
export function generateDisplayId(companyName: string): string {
  const letters =
    companyName
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4) || "ACCT";
  const number = Math.floor(10000 + Math.random() * 90000); // 5 digits
  return `${letters}-${number}`;
}