export type SuspensionAccessAccount = {
  verificationStatus: string;
};

/**
 * A suspension is an account-wide access denial. Market-specific onboarding
 * rules and tester exemptions must never override an administrative suspension.
 */
export function getSuspendedAccountAccess<T extends SuspensionAccessAccount>(account: T) {
  if (account.verificationStatus !== "suspended") return null;

  return {
    allowed: false as const,
    reason: "account_suspended" as const,
    account,
  };
}
