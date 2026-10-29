# UK-Market Student QA Cohort — Staging Runbook

## Purpose

This is a low-cost product-testing cohort for Indian student volunteers who will test Post2Drive with the **GB / GBP market configuration**. It is separate from the genuine UK commercial launch pilot, whose purpose is to acquire real posters and drivers in two UK cities.

The volunteers may be physically in India. The test can validate market configuration, app workflows, mobile responsiveness and usability, but it does **not** simulate being physically in the UK, UK mobile-network conditions, location-based matching from UK coordinates, local vehicle compliance, real identity verification, email delivery or payment settlement.

## Access and safety boundary

- A tester admin generates a batch of one-time codes from **UK Market QA** in the main app's admin navigation.
- The codes reuse the existing `TesterAccessCode` table and single-use claim flow. The database stores SHA-256 hashes, not the plaintext codes. Each code can create one account and should be privately given to only one volunteer. Copy the generated list before closing the page; plaintext is not saved or retrievable.
- Code generation and redemption both require `isQaRunnerEnabled()`: the explicitly allow-listed staging environment, matching Railway environment ID, HTTPS staging host and declared isolated QA database. If the staging safety gate is unavailable, do not weaken it; investigate the staging setup separately.
- Codes are specifically prefixed for the QA cohort and only work for accounts selecting **GB + GBP**. Ordinary signup and ordinary one-time tester invitations keep their existing approval and email-verification requirements.
- An approved QA-code signup skips manual tester approval and email-verification delivery in the guarded staging environment. Its account is marked as a tester, **not** identity-, company- or vehicle-verified. Tester-mode eligibility bypasses are for controlled workflow testing only; never use these accounts for real deliveries.
- QA accounts are mapped to the existing `qa_test_accounts` table so their test marketplace activity is excluded from ordinary analytics. No schema or migration changes are required.
- Use synthetic jobs and test locations only. Do not enter real identity/vehicle documents, payment information, private addresses or real customer details. Do not run load tests with this cohort.

## Suggested student test plan

1. Ask each volunteer to use their own one-time code, email/password and device. Do not share accounts or passwords.
2. Confirm signup uses **United Kingdom (GB) and GBP**, even though the student is testing from India.
3. Test login/logout, dashboard navigation, profile and vehicle screens, posting a synthetic job, searching/discovering jobs, bidding, selecting a bid, accepting a fixed-price job, pickup/delivery state transitions, cancellation-before-pickup and notifications where available.
4. Test multiple screen sizes and orientations: small Android phones, larger phones, tablets and desktop browsers. Note clipped controls, horizontal scrolling, text overflow, keyboard overlap, safe-area problems and broken navigation.
5. Tap **Report issue** on the screen where the problem occurs. The form captures a layout/device snapshot and requires explicit consent before submitting it. Record the returned reference ID with the reproduction steps.
6. For visual issues, take a screenshot manually and share it separately with the organiser after checking that it contains no sensitive information. The app does not automatically take or upload screenshots.
7. Verify account/market isolation and negative permissions with dedicated tests. A successful tester workflow does not prove identity, company or vehicle-verification controls work for ordinary accounts.
8. Before any UK commercial pilot, separately validate UK-dependent behaviour with appropriately located testers and real UK conditions where needed.

## Diagnostics and privacy

The feedback report can include CSS viewport/document dimensions, physical screen dimensions, device pixel ratio, orientation, horizontal overflow, safe-area insets, visual viewport, browser/WebView user-agent information, platform, language, time zone, online state, standalone/native-shell hints, colour scheme and reduced-motion preference. The student can inspect the report and must consent before sending it.

Reports are associated with the tester account's public display ID and stored as an `AdminAuditEvent` record to avoid a schema change. The form does not upload screenshots. Do not enter passwords, personal identity numbers, real documents, payment details or another person's personal information in feedback.

## What this testing can establish

It can provide evidence about GB/GBP product configuration, installation and navigation, mobile responsiveness, usability, multi-account workflows, state transitions and app-reported errors. It cannot establish production readiness, UK physical location behaviour, genuine verification/compliance, live email/payment integration or performance under heavy load.
