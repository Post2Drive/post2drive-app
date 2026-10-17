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
- US vehicle rules vary by state; Canadian rules vary by province/territory; Australian rules vary by state/territory. Region selection exists for US, Canada, Australia, India, Belgium and Switzerland, but the available options are not a substitute for official, vehicle-class-specific compliance rules. A country code alone cannot safely determine every compliance authority or inspection requirement. US, Canada and Australia have multi-zone selection; New Zealand, Spain, Portugal, France and Denmark also need destination-specific time zones for islands/overseas territories.
- The signup/pricing pages describe the non-India access policy as the “UK” model even where the actual intended policy is a shared commercial model, not a UK marketplace.
- Some other pages use browser-default dates, and some account/subscription code defaults to UK locale/time zone when market data is unavailable.
- Terms and Privacy pages are explicitly draft testing documents and mention review by UK and India counsel only. That is not sufficient for the full set of supported markets.

### Changes started on this branch

- Added `lib/localisation.ts` with a market profile for all 43 supported markets, market-specific registration/inspection terminology and authority references, locale-aware date/currency formatting, distance units, region options and time-zone options. These strings are implementation guidance and still need local legal/transport-authority verification before launch.
- Settings now displays the account's configured country, currency and time zone.
- Job creation and the job marketplace now use the market name/currency and account locale/time zone rather than labelling every non-India market as UK.
- Vehicle category labels now adapt across the supported markets. Registration jurisdiction is captured for India, US, Canada, Australia, Belgium and Switzerland; the API validates the selected jurisdiction. Blanket MOT/inspection expiry enforcement was removed because exemptions and vehicle classes vary.
- Payment and marketplace job dates/currency values now use market-aware formatting. Notification, activity and incident timestamps use the account market time zone. Multi-time-zone job posting supports explicit time-zone selection for the US, Canada, Australia, New Zealand, Spain, Portugal, France and Denmark; the selected IANA zone is persisted for job scheduling. These options cover configured destinations, not every possible local jurisdiction or territory.
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
- [x] Add registration jurisdiction fields and validated state/province/territory/canton options for US, Canada, Australia, India, Belgium and Switzerland. [ ] Expand region-specific compliance rules after confirming official requirements by vehicle class.
- [ ] Replace UK-named vehicle fields with jurisdiction-neutral fields and migrate safely; keep backward compatibility for existing GB records.
- [ ] Define local vehicle classes/units and their canonical stored values separately from display labels. Avoid silently converting kg, miles/km or vehicle weight thresholds.
- [ ] Define document and inspection requirements by country + region + vehicle class; handle exemptions and “not applicable” safely.
- [x] Localise dates in dashboard, jobs, payment history, profiles, notification centre and incident/activity history. [x] Add explicit pickup time-zone selection for multi-time-zone markets. [x] Add a separate drop-off time-zone field through job creation/editing, validation, persistence and marketplace display, with legacy records defaulting to the pickup zone. [ ] Verify the new migration and browser behaviour in staging; this field alone does not provide a drop-off date or UTC conversion.
- [ ] Verify pricing and tax wording separately from actual payment-provider capability; checkout is currently not connected.
- [ ] Review Terms and Privacy for every launch market with qualified local counsel; do not imply legal compliance based on translation alone.
- [ ] Add tests for every supported country and subnational jurisdiction, and ensure a non-GB account never sees UK-only copy or requirements unless the feature is explicitly GB-only.
- [ ] Run typecheck, lint, unit tests, market-matrix tests and real staging smoke tests. Do not declare completion from source inspection alone.

## Completion status

**In progress — code-level localisation is substantially broader, but not yet launch-certified.** All supported markets now have explicit registration/inspection terminology and market-aware vehicle labels; key UI surfaces use local date, currency, weight, distance and time-zone conventions. Region selection is persisted for vehicles; pickup and drop-off time-zone fields are now wired in source. Remaining gates: CI/build and staging migration/browser verification, full app-wide string review, subnational vehicle-class compliance rules, and qualified legal review in each launch market.
