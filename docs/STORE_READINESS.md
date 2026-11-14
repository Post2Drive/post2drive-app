# Store readiness: Google Play and Apple App Store

**Status (14 Nov 2026).** Android: packaging is ready for a signed Play upload once the owner items below are done. iOS: **not started** (no iOS project exists). Checked automatically by `npm run qa:store-readiness`.

Store policies change. Re-read the linked pages before each submission.

## What is already in place

| Area | State |
|---|---|
| Secrets in the repository | None. Tracked files and git history scanned for provider keys, private keys, keystores, `.env` and service files; `.gitignore` blocks them; CI secret scan and CodeQL run on every change. |
| Dependencies | `npm audit`: 0 known vulnerabilities (14 Nov 2026). Dependabot is enabled. |
| Target Android version | `targetSdkVersion 36`, which is what Play requires for new apps and updates. |
| Permissions | `INTERNET` only. No location, camera, contacts, storage or notification permission. |
| Backups | App data is excluded from cloud backup and device transfer, so a sign-in session cannot be restored onto another phone. |
| Network | HTTPS only; plain-http is off; no extra hosts load inside the app. |
| Exported components | Launcher activity only. |
| Release build | Not debuggable; signed from CI secrets; version code/name supplied per release (`.github/workflows/android-release.yml`). |
| Account deletion | In-app (Account settings → Delete account) and a public page, `/account-deletion`, linked from every footer. Both stores require this. |
| Privacy notice, terms, cookies | Pages exist at `/privacy`, `/terms`, `/cookies`. **Still drafts**: they need the legal operator's name, address and contact, and a lawyer's review. |
| On-screen keyboard, double taps | Fields stay visible above the keyboard; a double tap acts once. |

## Owner steps for Google Play

1. **Play Console account** (one-off fee) in the name of the company that will operate Post2Drive, with identity verification completed.
2. **Production site** on its own domain. The release workflow refuses staging, test and `*.up.railway.app` addresses.
3. **Upload key**: create a keystore once, keep it and its passwords somewhere safe outside the repo, and add four repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Enrol in Play App Signing.
   ```
   keytool -genkeypair -v -keystore post2drive-upload.jks -alias post2drive -keyalg RSA -keysize 4096 -validity 10000
   ```
4. **Build**: GitHub → Actions → "Build signed Android release (Google Play)" → enter the production URL, a version code (higher each time) and a version name. Download the `.aab`.
5. **Store listing**: app name, short and full description, icon (512×512), feature graphic (1024×500), phone screenshots, category (Business), contact email, privacy policy URL (`https://<site>/privacy`).
6. **App content forms**:
   - Data safety: account details (name, email, phone, business name), job and vehicle details, and app activity are collected for app functionality and account management; encrypted in transit; users can request deletion; nothing is sold. Update this the day analytics or any SDK is added.
   - Data deletion URL: `https://<site>/account-deletion`.
   - Content rating questionnaire, target audience (18+, business users), ads declaration (none), government/financial/health declarations as asked.
   - App access: give reviewers a working test login (poster and driver) and note that sign-up needs phone and email verification.
7. **Testing track first**: new personal developer accounts must run a closed test before production access; an organisation account can go to production directly. Start with internal testing either way.

## Open risks to decide before submitting

1. **Subscription payments inside the app.** Play's Payments policy requires Play's billing system for in-app purchases of digital features and services, and names business software and subscription services as examples; physical goods and services are exempt. Post2Drive's plan fee is access to marketplace software, so taking it by Stripe **inside the Play-distributed app** is a policy risk. Apple has the equivalent rule (3.1.1), with exceptions that may or may not fit (3.1.3(b) multiplatform services, 3.1.3(c) enterprise services). Options: (a) no purchase inside the store apps, pay on the website only ("consumption-only"); (b) join the stores' alternative-billing / external-link programmes where available; (c) use store billing in the apps. This is a commercial and legal decision. **Decision (14 Nov 2026): option (a), website-only payments.** Inside the store app the Pay button is never shown, checkout cannot be started, and the wording does not point to a place to pay (`lib/nativeApp.ts`, checked by `qa:store-readiness`). Users pay on the website in a browser; the app shows plan status only. Renewal reminders that carry a payment link must go by email or SMS, not as an in-app link.
2. **Web-wrapper review risk.** The app is a WebView around the website. Apple's guideline 4.2 rejects apps that are not meaningfully more than a repackaged website; Play is more tolerant but expects a stable, complete app. Native value that would help: push notifications for job matches and delivery steps, biometric unlock, share/deep links, an offline screen.
3. **Draft legal pages.** A store reviewer or a user can open them; they currently say "draft".
4. **Real-device test pass** on at least one small Android phone and one recent one (sign-up, phone code, post, bid, accept, pickup, deliver, payment tally, delete account, keyboard on every form).

## Apple App Store: what is needed (not started)

- Apple Developer Program membership (annual fee) for the operating company; a D-U-N-S number for an organisation account.
- A Mac with Xcode, or a macOS CI runner, to build and sign. It cannot be built on the Windows laptop.
- Add the iOS project (`@capacitor/ios`, `npx cap add ios`), app icons and launch screen, bundle id `com.post2drive.app`, signing certificates and provisioning profile, privacy manifest, App Privacy "nutrition label".
- Decide the payments question above and add enough native functionality to pass guideline 4.2.
- Account deletion in-app is already satisfied; no third-party social login is used, so Sign in with Apple is not required.
- Reviewer demo accounts and notes, screenshots for the required iPhone sizes, TestFlight round before submission.

## Sources (read 14 Nov 2026)

- Google Play target API level requirement: https://support.google.com/googleplay/android-developer/answer/11926878
- Google Play Payments policy: https://support.google.com/googleplay/android-developer/answer/9858738 and https://support.google.com/googleplay/android-developer/answer/10281818
- Apple App Review Guidelines (3.1.1, 3.1.3, 4.2, 5.1.1(v)): https://developer.apple.com/app-store/review/guidelines/
