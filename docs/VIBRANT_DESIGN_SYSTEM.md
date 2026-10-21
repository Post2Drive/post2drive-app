# Post2Drive Solid Corporate Colour System

**Scope:** All customer-facing app routes and the separate operations/analytics dashboard, consistently across all supported countries. Presentation changes only; localisation, currency, pricing, authorisation, workflow and data rules remain in application logic.

## Design direction

Use a clean white interface with solid, saturated, professional corporate colours. No dull greys as large backgrounds, no muddy gradients, and no country-specific colour meaning. Keep all main copy black or very dark for legibility. Use each colour as a clear accent, chart series, status, navigation marker, or card border—not as a full-page flood of colour.

## Seven-colour palette

| Colour | Hex | Meaning |
|---|---|---|
| Blue | `#2457D6` | Primary actions, active navigation, open jobs, links |
| Red | `#D62828` | Errors, cancellations, blocked items, critical alerts |
| Green | `#18864B` | Completed/delivered jobs, verified, successful outcomes |
| Black | `#171717` | Main text, headings, strong contrast, core navigation |
| Yellow | `#F2C300` | Warnings, review-needed states, highlights; use black text |
| Purple | `#6D28D9` | Analytics, accepted work, insights and secondary data series |
| Orange | `#E87500` | In-transit, attention items, onboarding and operational activity |
| Cyan (supplementary) | `#0096C7` | Extra chart series, vehicle/route datasets when more than seven categories are visible |
| Magenta (supplementary) | `#C0268D` | Additional distinct data series in dense analytics; not used for success/error states |

## Interface rules

- **Backgrounds:** solid white for the page, cards, panels, tables, forms, menus and dialogs.
- **Text:** black/dark copy by default. White text on blue, red, green, purple and orange solid buttons. Yellow always uses black text.
- **Buttons:** blue is the primary action. Use outline/white surfaces for secondary actions; red is reserved for destructive actions.
- **KPI cards:** white cards with strong coloured top rules and black labels/values. Rotate through all seven colours without reducing contrast.
- **Status semantics:** open = blue; accepted = purple; in transit = orange; delivered/completed = green; cancelled = red; review/warning = yellow; unknown/neutral = black or outlined.
- **Charts:** use actual data only. Use labelled horizontal bars for status counts, pie/donut charts for part-to-whole breakdowns, and line charts for time-series data. Include visible legends, values, accessible descriptions and readable axes. Never use colour as the only signal. The core seven colours cover normal UI states; add cyan and magenta only when a graph has enough distinct categories to benefit from the extra separation.
- **Country consistency:** same colour semantics for every market. Country, locale and currency can change labels and formatting only; they do not alter status colours or business logic.
- **Accessibility:** high contrast, visible keyboard focus, responsive chart layouts and reduced-motion support.

## Implemented areas

- Shared tokens and global app styling in `app/globals.css`.
- Customer dashboard cards and job pipeline chart in `app/dashboard/page.tsx`.
- Separate operations dashboard in `ops-dashboard/server.mjs`.
- Shared pricing and subscription components retain the app's shared tokens.
- Visual QA should cover desktop and mobile, including login/sign-up, jobs, job creation, dashboard, payments, vehicles, account settings, pricing, and operations analytics.

Do not treat styling changes as production-readiness approval. Run CI and visual checks before merging or deploying.


## Contrast audit rules

- Normal body and control text use dark ink on white. The saturated colours are accents, not text colours for every surface.
- Blue, red, purple and magenta may use white text on solid fills where the component needs an inverse button label. Green uses white text only at the approved dark-green brand shade.
- Yellow, orange and cyan do not carry small wording on white or saturated fills: use black text and keep these colours to borders, bars, and indicators.
- The operations dashboard header controls, filters, pills, notices, table headings, legends and metadata must keep contrast independently of market filters.
- Status meaning must remain readable when a colour is not distinguishable; preserve explicit words, numbers, border/rail cues and accessible chart labels.
