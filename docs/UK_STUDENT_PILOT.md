# UK Student Pilot — Staging Runbook

## Purpose

This pilot is for usability and marketplace workflow validation with real students in the UK. It is not a test of the full identity-verification provider, company review, genuine vehicle-document checks, email delivery, or payment settlement.

## Safety boundary

- The shared pilot access code is generated from the in-app **Student Pilot** admin page.
- Code generation and redemption both require `isQaRunnerEnabled()`: the explicitly allow-listed staging environment, matching Railway environment ID, HTTPS staging host, and declared isolated QA database.
- The code is high entropy, expires after 14 days, is stored as a hash, and is shown only once. Generating a replacement invalidates the previous code.
- Each student still creates their own account with unique credentials. The cohort code avoids individual one-time codes, waiting for tester approval, and the email-verification step so the cohort can go straight into workflow testing.
- Accounts made with the shared code are marked `isTester`, given staging promotional access, and have an `approved` tester status. They are **not** marked as identity-, company-, or vehicle-verified. Tester-mode bypasses are for staging workflows only and must not be used for real deliveries.
- Do not use real identity documents, real vehicle documents, payment information, private addresses, or real delivery jobs. Use synthetic job notes and test locations.
- No database schema/migration or Railway variable changes are required by this feature. Do not deploy the branch before code review and checks.

## Issue reporting and device diagnostics

The floating **Report issue** button appears in the guarded staging environment for signed-in users. It captures a snapshot from the screen where the button was tapped and then opens the feedback form.

The snapshot includes CSS viewport and document dimensions, screen dimensions, device pixel ratio, orientation, horizontal overflow, safe-area insets, visual viewport information, browser/WebView user agent, language, time zone, online state, standalone/native-shell hints, color scheme, and reduced-motion preference. The dynamic route is anonymised by replacing long ID-like path segments.

Students can submit a category, impact level, title and reproduction steps. Submission requires consent and is rate-limited. The feedback is associated with the tester account's public display ID to help follow up. It is stored as an `AdminAuditEvent` record, avoiding a new table/migration. No screenshot is automatically uploaded; screenshot sharing should happen separately through the pilot organiser's agreed private channel after checking the image contains no sensitive information.

Admins can generate the cohort code and review feedback at **Student Pilot** in the main app's admin navigation, only while the staging guard is active.

## Suggested manual run

1. Run one student through registration/login first and confirm they enter UK/GBP with the current cohort code.
2. Give each of the participating students their own account and device. Do not share passwords.
3. Have multiple students cross-test posting, search/discovery, bidding, bid selection, pickup, in-transit, delivery marking, other-party confirmation, cancellation before pickup, and notifications.
4. Ask them to use **Report issue** while still on the screen with the problem, so the diagnostic snapshot matches that screen.
5. For each bug, record the feedback reference ID and reproduction steps. For a visual issue, ask for a screenshot separately in the private pilot channel.
6. Verify account/market isolation and negative permissions with dedicated tests. Tester mode bypasses identity/company/vehicle eligibility, so a successful tester workflow does not prove those controls work for ordinary accounts.
7. Do not run load tests with the student cohort. Use the separate controlled QA runner for that.

## What the pilot can and cannot establish

It can provide evidence about APK installation, device/layout compatibility, navigation, usability, multi-user workflow, state transitions, basic account isolation and app-reported errors. It does not establish identity-provider correctness, real UK vehicle compliance, production email delivery, payment settlement, high-load capacity, or production readiness.
