# Country localisation audit — Post2Drive

Audit baseline: `3cbffef2242f06e63b240278f18e3d80ab4f510f` (main, 17 October 2026).
Working branch: `feature/country-localisation-audit`.

## Product rule

Keep the same core product capabilities in every market, but localise user-facing names, dates, times, money, units, contact formats, vehicle terminology, required documents, compliance rules and legal disclosures. Marketplace data remains isolated by country/currency. Never infer that a UK rule applies just because a market is outside India.

## Supported market registry

The registry currently contains 43 country/market codes:
GB, IN, AT, BE, BG, HR, CY, EE, FI, FR, DE, GR, IE, IT, LV, LT, LU, MT, NL, PT, SK, SI, ES, AD, MC, SM, VA, XK, ME, CZ, DK, HU, IS, NO, PL, RO, SE, CH, TR, US, CA, AU, NZ.

The existing registry provides a country label, currency, symbol, locale, time zone and dialing code. Those are necessary foundations, not a complete localisation implementation. Several European markets use a single euro currency but still need their own language, transport terminology, units, regulatory and legal content.

## Findings from source inspection

### Confirmed defects / localisation gaps

- Account Settings rendered India-specific data for IN and hard-coded United Kingdom / GBP / Europe/London for every other country.
- Job creation labelled every non-India marketplace as UK, described pickup times as UK GMT/BST, used UK city examples, and said listings were visible to UK users.
- The marketplace heading said “UK delivery marketplace” for every non-India country.
- Payment dates were formatted using `en-GB` regardless of account locale.
- Vehicle onboarding used V5C and MOT labels and the API required an MOT date for every non-tester account. This incorrectly applies UK assumptions to countries with different rules.
- The job and vehicle forms use UK-oriented vehicle categories/abbreviations (for example Luton van, SWB/MWB/LWB and HGV artic). These are not universally familiar.
- The vehicle data model stores UK-named fields (`v5cDocumentUrl`, `motValidUntil`) even when the user is outside the UK. UI labels can be localised, but storage/API semantics remain technical debt.
- US vehicle rules vary by state; Canadian rules vary by province/territory; Australian rules vary by state/territory. The current account model has no state/province/territory field, so a country code alone cannot safely determine the correct compliance authority or inspection requirement. These countries also span multiple time zones, so a single country-default time zone is not enough for every pickup location.
- The signup/pricing pages describe the non-India access policy as the “UK” model even where the actual intended policy is a shared commercial model, not a UK marketplace.
- Some other pages use browser-default dates, and some account/subscription code defaults to UK locale/time zone when market data is unavailable.
- Terms and Privacy pages are explicitly draft testing documents and mention review by UK and India counsel only. That is not sufficient for the full set of supported markets.

### Changes started on this branch

- Added `lib/localisation.ts` with market-aware profile/date helpers and initial vehicle terminology for GB, IN, US, CA, AU and NZ. For markets where a national authority cannot safely be inferred, it uses a generic local-authority label.
- Settings now displays the account's configured country, currency and time zone.
- Job creation and the job marketplace now use the market name/currency and account locale/time zone rather than labelling every non-India market as UK.
- Vehicle labels now adapt for GB, IN, US, CA, AU and NZ; inspection-date enforcement is no longer universally based on MOT.
- Payment and marketplace job dates now use market-aware formatting.
- Signup/pricing wording no longer presents the shared non-India access policy as a UK marketplace.

## Country and jurisdiction-specific terms to implement and verify

| Market | Terms/authority to consider | Important qualification |
|---|---|---|
| GB | DVLA, V5C/log book, MOT, vehicle registration number, HGV | Devolved rules and vehicle exemptions still matter; do not require MOT for every possible vehicle without an exemption workflow. |
| IN | State RTO / Transport Department, registration certificate (RC), fitness certificate as applicable | State and vehicle-class rules vary. |
| US | State DMV or equivalent, license plate, state inspection/emissions where applicable | Authority, inspection and emissions requirements vary by state and vehicle class. |
| CA | Provincial/territorial motor vehicle authority, licence plate, safety inspection where applicable | Rules vary by province/territory and vehicle class. |
| AU | State/territory road transport authority, registration papers, roadworthiness inspection where applicable | Terminology and checks vary by state/territory. |
| NZ | Waka Kotahi NZ Transport Agency, registration, WoF/CoF as applicable | Requirements depend on vehicle class and use. |
| EU euro-area markets | Country's official language, registration certificate terminology, periodic roadworthiness inspection, local decimal/date formats | Euro currency does not mean common language or identical transport rules. |
| Other supported European markets | Local language, currency formatting, registration/inspection terminology and applicable authority | Confirm each country with authoritative local sources before presenting a specific agency or mandatory document. |

## Required audit checklist before declaring localisation complete

- [ ] Scan every user-visible string in app pages, navigation, components, emails, notifications, errors, empty states, terms/privacy and admin flows.
- [ ] Remove false UK/India defaults in all shared screens and APIs.
- [ ] Use account-market locale, currency, time zone, decimal/date format and phone dialling code consistently.
- [ ] Decide whether the UI language is English-only or translated per market; if English-only, keep the language consistent but use locally correct terms.
- [ ] Add state/province/territory where compliance rules depend on it (at minimum US, Canada and Australia); persist and validate it server-side. Use the pickup location or an explicit region/time-zone selection for multi-time-zone countries.
- [ ] Replace UK-named vehicle fields with jurisdiction-neutral fields and migrate safely; keep backward compatibility for existing GB records.
- [ ] Define local vehicle classes/units and their canonical stored values separately from display labels. Avoid silently converting kg, miles/km or vehicle weight thresholds.
- [ ] Define document and inspection requirements by country + region + vehicle class; handle exemptions and “not applicable” safely.
- [ ] Localise dates in dashboard, jobs, payment history, profiles, incident history and subscription status; use the correct market time zone for wall-clock job times.
- [ ] Verify pricing and tax wording separately from actual payment-provider capability; checkout is currently not connected.
- [ ] Review Terms and Privacy for every launch market with qualified local counsel; do not imply legal compliance based on translation alone.
- [ ] Add tests for every supported country and subnational jurisdiction, and ensure a non-GB account never sees UK-only copy or requirements unless the feature is explicitly GB-only.
- [ ] Run typecheck, lint, unit tests, market-matrix tests and real staging smoke tests. Do not declare completion from source inspection alone.

## Completion status

**In progress — not yet safe to call fully localised.** The branch fixes several confirmed high-visibility defects, but region-level compliance, vehicle taxonomy/storage, the full-string scan, legal review and automated verification remain required before launch.
