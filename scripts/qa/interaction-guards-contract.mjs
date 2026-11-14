#!/usr/bin/env node
// Double activation and on-screen keyboard handling are app-wide, not per screen. Hermetic.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRepeatActivation, keyboardInset, REPEAT_ACTIVATION_MS, REPEAT_SUBMIT_MS } from "../../lib/interactionGuard.ts";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
let n = 0; const ok = (c, m) => { assert.ok(c, m); n += 1; };

ok(!isRepeatActivation(undefined, 1000), "the first click always acts");
ok(isRepeatActivation(1000, 1000 + 120), "a double click (120 ms apart) is dropped");
ok(isRepeatActivation(1000, 1000 + REPEAT_ACTIVATION_MS - 1), "anything inside the window is dropped");
ok(!isRepeatActivation(1000, 1000 + REPEAT_ACTIVATION_MS), "a deliberate second press after the window acts");
ok(!isRepeatActivation(2000, 1000), "a clock that went backwards never locks a control");
ok(REPEAT_ACTIVATION_MS >= 400 && REPEAT_ACTIVATION_MS <= 800 && REPEAT_SUBMIT_MS >= REPEAT_ACTIVATION_MS, "windows cover a double tap without making the app feel stuck");
ok(keyboardInset(800, 800, 0) === 0, "no keyboard, no inset");
ok(keyboardInset(800, 500, 0) === 300, "a 300px keyboard is a 300px inset");
ok(keyboardInset(800, 760, 0) === 0, "browser toolbars are not mistaken for a keyboard");
ok(keyboardInset(800, 500, 100) === 200, "a scrolled visual viewport is accounted for");

const guard = read("components/interaction-guards.tsx");
ok(/addEventListener\("click", onClick, true\)/.test(guard) && /addEventListener\("submit", onSubmit, true\)/.test(guard), "guards run in the capture phase, before any screen's own handler");
ok(/stopImmediatePropagation\(\)/.test(guard) && /preventDefault\(\)/.test(guard), "a repeat is fully stopped: no handler, no navigation, no submit");
ok(/button, a\[href\], \[role="button"\]/.test(guard), "buttons and links are both covered");
ok(/data-allow-rapid/.test(guard), "controls meant for quick repeated presses can opt out");
ok(/new WeakMap/.test(guard), "tracking is per control, so pressing a different button is never blocked");
ok(/visualViewport/.test(guard) && /scrollIntoView\(/.test(guard) && /focusin/.test(guard), "the focused field is brought above the keyboard");
ok(/prefers-reduced-motion/.test(guard), "the reveal scroll respects reduced motion");
ok(/removeEventListener\("click", onClick, true\)/.test(guard), "listeners are removed on unmount");

const layout = read("app/layout.tsx");
ok(/<InteractionGuards \/>/.test(layout), "mounted once in the root layout, so every screen is covered");
ok(/interactiveWidget: "resizes-content"/.test(layout), "the page resizes for the keyboard on Android");
ok(/android:windowSoftInputMode="adjustResize"/.test(read("android/app/src/main/AndroidManifest.xml")), "the Android app resizes its web view for the keyboard");
const css = read("app/mobile-fit.css");
ok(/padding-bottom: var\(--keyboard-inset, 0px\)/.test(css), "scroll room exists where the browser does not resize");
ok(/html\[data-keyboard-open\] \.mobile-bottom-nav/.test(css), "the bottom bar never sits on top of a field being typed in");

const jobs = read("app/api/jobs/route.ts");
ok(/scope: "job-create-duplicate"/.test(jobs) && /duplicate: true/.test(jobs), "the server also refuses to create the same job twice");
ok(jobs.indexOf('scope: "job-create-duplicate"') < jobs.indexOf("tx.job.create("), "the duplicate check runs before the job is written");
const bid = read("app/api/jobs/[id]/bid/route.ts");
ok(/existingActiveBid/.test(bid), "a driver cannot hold two active bids on one job");
console.log(`Interaction guards contract passed: ${n} checks.`);
