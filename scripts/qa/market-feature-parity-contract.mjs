#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARKETS, isSupportedMarket, isWeeklyPricingMarket, sameMarket } from "../../lib/market.ts";
import {
  formatMarketCurrency,
  formatMarketDate,
  getJurisdictionOptions,
  getLocalisationProfile,
  getTimeZoneOptions,
} from "../../lib/localisation.ts";
import { VEHICLE_TYPES, vehicleTypeLabel } from "../../lib/vehicles.ts";
import {
  currencyMinorUnitScale,
  majorUnitsToMinorUnits,
  minorUnitsToMajorUnits,
} from "../../lib/currencyMinorUnits.ts";

let assertions = 0;
const check = (condition, message) => {
  assertions += 1;
  assert.ok(condition, message);
};
const source = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const contains = (path, fragment, message = fragment) =>
  check(source(path).includes(fragment), `${path}: ${message}`);

const markets = Object.values(MARKETS);
check(markets.length === 43, "Expected all 43 configured markets to be covered");
const weeklyMarkets = markets.filter((market) => market.country !== "IN");

for (const market of markets) {
  const identity = { country: market.country, currency: market.currency };
  const profile = getLocalisationProfile(identity);
  check(isSupportedMarket(identity), `${market.country}: canonical market identity rejected`);
  check(profile !== null, `${market.country}: localisation profile missing`);
  check(profile?.marketplaceLabel === market.label, `${market.country}: market label mismatch`);
  check(profile?.currency === market.currency, `${market.country}: currency mismatch`);
  check(profile?.locale === market.locale, `${market.country}: locale mismatch`);
  check(profile?.timeZone === market.timeZone, `${market.country}: time zone mismatch`);
  const jurisdictionRequired = ["IN", "US", "CA", "AU", "BE", "CH"].includes(market.country);
  check(profile?.jurisdictionSelectionRequired === jurisdictionRequired, `${market.country}: jurisdiction selection policy mismatch`);
  if (jurisdictionRequired) check(getJurisdictionOptions(market.country).length > 0, `${market.country}: jurisdiction options missing`);
  check(profile?.dialingCode === market.dialingCode, `${market.country}: dialing code mismatch`);
  check(isWeeklyPricingMarket(identity) === (market.country !== "IN"), `${market.country}: unexpected paid-access policy`);
  check(Boolean(formatMarketCurrency(1234.56, identity)), `${market.country}: currency formatting failed`);
  const expectedCurrencyText = new Intl.NumberFormat(market.locale, { style: "currency", currency: market.currency }).format(1234.56);
  check(formatMarketCurrency(1234.56, identity) === expectedCurrencyText, `${market.country}: market currency output must use standard currency precision`);
  check(Boolean(formatMarketDate("2026-10-18", identity)), `${market.country}: date formatting failed`);
  check(getTimeZoneOptions(market.country, market.timeZone).some((zone) => zone.value === market.timeZone), `${market.country}: default timezone is not selectable`);
  assert.doesNotThrow(() => new Intl.DateTimeFormat(market.locale, { timeZone: market.timeZone }), `${market.country}: invalid locale/time zone`);

  // Convert prices symmetrically according to the currency's actual minor-unit
  // precision. This covers ISK and any later zero-/three-decimal currencies.
  const scale = currencyMinorUnitScale(market.currency);
  check(Number.isInteger(scale) && scale >= 1 && scale <= 1000, `${market.country}: invalid minor-unit scale`);
  const minor = majorUnitsToMinorUnits(9.99, market.currency);
  const roundTrip = minorUnitsToMajorUnits(minor, market.currency);
  const expected = Math.round(9.99 * scale) / scale;
  check(Math.abs(roundTrip - expected) < 1e-9, `${market.country}: minor-unit conversion lost precision`);

  for (const type of VEHICLE_TYPES) {
    check(Boolean(vehicleTypeLabel(type, market.country)), `${market.country}: vehicle label missing for ${type}`);
  }
  if (market.country !== "GB") {
    check(!profile.registrationDocumentLabel.includes("V5C"), `${market.country}: UK V5C terminology leaked`);
    check(!profile.inspectionLabel.startsWith("MOT"), `${market.country}: UK MOT terminology leaked`);
    check(vehicleTypeLabel("Luton van", market.country) !== "Luton van", `${market.country}: UK-only vehicle label leaked`);
  }

  const other = markets.find((candidate) => candidate.country !== market.country);
  check(other !== undefined && !sameMarket(identity, { country: other.country, currency: other.currency }), `${market.country}: data-isolation boundary failed`);
}

// Feature/API parity: shared marketplace capabilities use canonical market
// validation, while only genuine commercial/legal differences remain market-gated.
contains("app/api/signup/route.ts", "marketForAccount({ country, currency })", "signup must accept canonical identities for every configured market");
contains("app/api/jobs/route.ts", "isSupportedMarket(account)", "job posting must validate the stored account market");
contains("app/api/jobs/route.ts", "validateJobInput(body, account)", "job posting must use market-aware validation");
contains("app/api/vehicles/route.ts", "getLocalisationProfile({ country: account.country, currency: account.currency })", "vehicle registration must use market-specific terminology/rules");
contains("lib/auth.ts", "select: { deletionRequestedAt: true }", "JWT refresh must re-check persisted account deletion state");
contains("lib/auth.ts", "token.accountDeleted = !account || Boolean(account.deletionRequestedAt);", "JWT refresh must mark missing or deletion-requested accounts as revoked");
contains("lib/auth.ts", "if (token.accountDeleted) return null as any;", "revoked JWTs must not produce an authenticated session");
contains("app/api/vehicles/route.ts", "if (!account || account.deletionRequestedAt) return null;", "vehicle reads and writes must reject accounts pending deletion");
contains("app/api/jobs/[id]/bid/route.ts", "requireJobMarketAccess", "bidding must enforce same-market boundaries");
contains("app/api/jobs/[id]/accept/route.ts", "requireJobMarketAccess", "job acceptance must enforce same-market boundaries");
contains("app/api/subscription/create-payment/route.ts", "createPendingSubscriptionPayment", "all eligible markets need the shared subscription request path");
contains("lib/subscription.ts", "isWeeklyPricingEligible(account)", "paid access eligibility must use the shared market policy");
contains("app/api/promotion/status/route.ts", "paidPlan:\n      isWeeklyPricingEligible(account)", "paid plan details must not be hidden from eligible non-GB markets");
contains("app/api/promotion/status/route.ts", "active:\n        ukEligible &&\n        promotion.active", "the GB-only launch promotion must remain GB-only");
contains("app/api/account/access/route.ts", "minorUnitsToMajorUnits(priceMinorUnits, access.account.currency)", "access API must convert minor units using the account currency");
contains("lib/subscription.ts", "majorUnitsToMinorUnits(price, currency)", "subscription price must use currency-specific minor units");
contains("components/subscription-pricing.tsx", "checkout is not connected", "pricing must not imply that real checkout is live");
contains("components/subscription-status.tsx", "No payment provider is connected yet", "pending payment must not imply a real charge was taken");
contains("components/subscription-status.tsx", "const showPlanPrice = formattedPrice !== null", "expired paid markets must see their configured plan price");
contains("components/subscription-status.tsx", "{showPlanPrice && (", "pricing visibility must not be limited to the UK trial");

// User-facing job form must not offer an India workflow that server validation rejects.
contains("app/jobs/new/page.tsx", 'country !== "IN" && <option value="bid">', "India job creation must hide open bidding");
contains("app/jobs/new/page.tsx", 'country === "IN" && form.priceMode !== "fixed"', "India job creation must guard against bid mode");
contains("app/jobs/new/page.tsx", 'country === "IN" ? "Fixed quote" : "Fixed price"', "India review summary must describe fixed-quote pricing accurately");
contains("app/jobs/new/page.tsx", "currencyMinorUnitScale(currency)", "job price input must use the selected currency precision");
contains("app/jobs/page.tsx", 'accountCountry !== "IN" &&', "India marketplace must not expose bid actions");
contains("app/jobs/page.tsx", "currencyMinorUnitScale(job.currency)", "bid input must respect the job currency precision");
contains("app/vehicles/page.tsx", "required={Boolean(marketProfile?.jurisdictionSelectionRequired)}", "required vehicle jurisdictions must be enforced in the user-facing form");
contains("app/vehicles/page.tsx", "getJurisdictionOptions(market.country)", "vehicle onboarding must use market-specific jurisdiction choices");
contains("app/vehicles/page.tsx", "marketProfile?.inspectionHelp", "inspection expiry fields must explain market-specific requirements");
contains("app/vehicles/page.tsx", "!expiryDatesOptional && Boolean(marketProfile?.inspectionRequiredAtCountryLevel)", "inspection expiry requirements must respect market rules and tester exceptions");
contains("app/vehicles/page.tsx", 'field("Insurance valid until", "insuranceValidUntil", "date", !expiryDatesOptional)', "insurance expiry must be required for non-test accounts");
contains("app/vehicles/page.tsx", "getJurisdictionAuthority(market.country, form.registrationRegion, market.currency)", "vehicle onboarding must show the applicable jurisdiction authority");
contains("app/vehicles/page.tsx", "const [loadError, setLoadError] = useState(\"\")", "vehicle list loading failures must be isolated from submission errors");
contains("app/vehicles/page.tsx", "setLoadError(\"\")", "vehicle list retry must clear a previous load error");
contains("app/vehicles/page.tsx", "onClick={() => void loadVehicles()}", "vehicle list loading failures must offer an explicit retry");

contains("app/jobs/page.tsx", "const actionInFlight = useRef(false)", "lifecycle UI must guard against duplicate in-flight actions");
contains("app/jobs/page.tsx", "if (actionInFlight.current) {", "repeated lifecycle clicks must not dispatch a second mutation");
contains("app/jobs/page.tsx", "finally {\n      actionInFlight.current = false;", "lifecycle action lock must be released after success or failure");
contains("app/jobs/page.tsx", "const bidInFlight = useRef(false)", "bid submission must guard against duplicate in-flight requests");
contains("app/jobs/page.tsx", "if (bidInFlight.current) {", "repeated bid clicks must not submit a second bid");
contains("app/jobs/page.tsx", "finally {\n      bidInFlight.current = false;", "bid submission lock must be released after success or failure");
contains("app/jobs/page.tsx", "const ratingInFlight = useRef(false)", "rating submission must guard against duplicate in-flight requests");
contains("app/jobs/page.tsx", "if (ratingInFlight.current) {", "repeated rating clicks must not submit a second rating");
contains("app/jobs/page.tsx", "finally {\n      ratingInFlight.current = false;", "rating submission lock must be released after success or failure");
contains("app/dashboard/page.tsx", "This is a planning price only. Payment checkout is not connected yet", "dashboard must not imply an operational renewal checkout");


// Account settings should give recoverable feedback and prevent repeated submissions.
contains("app/settings/page.tsx", "const [saveBusy, setSaveBusy] = useState(false)", "profile save must expose an in-flight state");
contains("app/settings/page.tsx", "disabled={saveBusy}", "profile save must be disabled while saving");
contains("app/settings/page.tsx", "Network error. Your settings could not be saved.", "profile save must report network failures");
contains("app/settings/page.tsx", "const [passwordBusy, setPasswordBusy] = useState(false)", "password update must expose an in-flight state");
contains("app/settings/page.tsx", "disabled={passwordBusy}", "password update must be disabled while submitting");
contains("app/settings/page.tsx", "required\n            autoComplete=\"current-password\"", "password change must require the current password");
contains("app/settings/page.tsx", "required\n            minLength={8}\n            autoComplete=\"new-password\"", "password change must require a minimum-length new password");
contains("app/settings/page.tsx", "Could not load account settings.", "account settings load failure must be visible and recoverable");


contains("app/jobs/page.tsx", "Another job action is still in progress. Please wait.", "duplicate lifecycle clicks must explain why another action was ignored");
contains("app/jobs/page.tsx", "A bid submission is already in progress. Please wait.", "duplicate bid submissions must provide visible feedback");
contains("app/jobs/page.tsx", "A rating submission is already in progress. Please wait.", "duplicate rating submissions must provide visible feedback");
contains("app/jobs/page.tsx", "Network error. Could not load bids.", "bid loading must handle network failures without an unhandled rejection");
contains("app/jobs/page.tsx", "setOpenBids((current) => ({", "bid loading must merge results without overwriting another job's bid state");

// These are explicit cross-market exceptions, not feature parity gaps: India
// pricing is separate, the UK trial is UK-only, and compliance can vary locally.
contains("lib/promotion.ts", "if (!isUkAccount(account))", "UK promotion rules must remain explicit");
contains("app/terms/page.tsx", "Draft for product testing", "terms must not be presented as launch-approved");
contains("app/privacy/page.tsx", "Draft for product testing", "privacy notice must not be presented as launch-approved");

console.log(JSON.stringify({
  status: "passed",
  supportedMarkets: markets.length,
  weeklyPaidMarkets: weeklyMarkets.length,
  indiaSeparatePricing: true,
  currencyPrecisionCases: markets.length,
  assertions,
  scope: "shared feature gates, localization, country/currency isolation, local formatting, vehicle terminology, subscription visibility and currency minor units",
  nonParityBlockers: [
    "A real payment provider / checkout is not connected; pending payment rows do not charge or activate access.",
    "Market-specific authenticated staging campaigns and independent local legal/compliance review remain launch gates."
  ]
}, null, 2));
