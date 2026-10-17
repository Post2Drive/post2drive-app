# Post2Drive Vibrant Design System

**Scope:** All customer-facing app routes and the separate operations/analytics dashboard. This changes presentation only; country, currency, pricing, authorisation, workflow, and data rules must remain owned by application logic.

## Design intent

Use a bright, confident freight-tech look: crisp white surfaces over a cool, light canvas, vivid blue navigation/actions, and semantic accent colours that make operational states easy to scan. The interface should feel colourful and energetic without turning every surface into a saturated block.

Use the same semantic colour meanings in every market. Country-specific accents are limited to small contextual highlights; do not make functionality or status depend on the user's country.

## Core palette

| Token / use | Hex | Meaning |
|---|---|---|
| Brand cobalt / primary action | `#315CFF` | Primary CTAs, active navigation, links, main chart line |
| Primary hover | `#2449E8` | Hover/focus state for primary actions |
| Ink / primary text | `#172543` | Main headings and readable copy |
| Canvas | `#F4F7FF` | Overall app background |
| Surface | `#FFFFFF` | Main cards, forms, content panels |
| Teal | `#008B78` | In-transit, workflow activity, positive progress |
| Green | `#24884D` | Completed/delivered/verified states |
| Violet | `#7850D4` | Analytics, fulfilment insights, secondary data groups |
| Cyan | `#087EA4` | Access, payment-related information, technical signals |
| Orange | `#D75F1A` | Promotion, onboarding, attention-oriented highlights |
| Amber | `#A95D00` | Warnings and items needing review |
| Coral/red | `#C9324F` | Errors, cancellations, destructive actions, critical incidents |
| Pink | `#BC367B` | Secondary KPI accent; avoid using as the sole meaning cue |
| Border | `#DCE5F2` | Card and table separation |
| Muted text | `#66758D` | Supporting metadata and secondary labels |

## Soft accent surfaces

Use these for tinted cards, tags and backgrounds while keeping text readable.

| Accent | Soft background |
|---|---|
| Cobalt | `#EDF1FF` |
| Teal | `#E3F8F2` |
| Green | `#E8F8ED` |
| Violet | `#F0EBFF` |
| Cyan | `#E5F7FC` |
| Orange | `#FFF0E4` |
| Amber | `#FFF3D9` |
| Coral/red | `#FFE9ED` |
| Pink | `#FCEAF4` |

## Application rules

- **Primary action:** cobalt with white text. Only one dominant primary action per interaction area.
- **Secondary action:** white or pale-blue surface with a blue border; avoid making every button look primary.
- **KPI cards:** cycle through cobalt, teal, violet, green, coral, cyan, orange and pink accents. The number and label use that card's accent; the card background remains a pale tint.
- **Job lifecycle:** open = cobalt; accepted = teal; in transit = violet/cyan; delivered = teal; completed = green; cancelled = coral/red. Preserve explicit text labels and icons; colour alone must not carry meaning.
- **Warnings and incidents:** amber for caution/review; coral/red for errors, cancellation and destructive confirmation.
- **Analytics:** use violet, cyan and teal alongside cobalt to distinguish chart series. Legends and labels must remain visible without relying on colour alone.
- **Pricing:** every tier gets a distinct top accent and a soft tint; the displayed currency remains driven by the selected market data. India pricing continues to follow its separately configured policy.
- **Forms:** light inset fields, visible focus rings, and clear success/error messaging. Do not recolour or hide validation states.
- **Navigation:** white/translucent surface, clearly highlighted active page, and a high-contrast mobile bottom nav.
- **Tables:** light-blue header row, very subtle zebra stripes, and pale-blue hover state.
- **Country support:** GB remains subtly cobalt; IN uses an orange highlight; EUR markets use violet. All workflow/state meanings and core controls remain consistent in every country. Unknown or future country codes safely fall back to the core palette.

## Implementation

- Shared app tokens and component styling: `app/globals.css`.
- Consumer dashboard: `app/dashboard/page.tsx` uses semantic section classes and `data-market` / `data-currency` presentation attributes only.
- Market pricing cards: `components/subscription-pricing.tsx`.
- Separate operations dashboard and admin login page: embedded CSS in `ops-dashboard/server.mjs`.

## Quality checks

Before merging, run the existing CI validation and confirm that the colour-only changes do not affect API or market behaviour. Visually spot-check dashboard, marketplace/job lists, post-job form, pricing, payments, vehicles, account settings, sign-in/sign-up, and operations/analytics sections at desktop and mobile widths. Verify readable contrast, keyboard focus, and the reduced-motion preference.

Do not treat this styling change as launch approval. It makes no claim that payments, email verification, data ownership or production-readiness gates are resolved.
