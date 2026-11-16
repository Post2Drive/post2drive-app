// Static guards for the in-page confirmation that replaced window.confirm, which
// embedded browsers and webviews silently suppress (the click then does nothing).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };

const dialog = readFileSync("components/confirm-dialog.tsx", "utf8");
const jobs = readFileSync("app/jobs/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

ok(dialog.startsWith('"use client"'), "the dialog is a client component");
ok(/<dialog\b/.test(dialog) && /showModal\(\)/.test(dialog), "it uses the native modal <dialog>, which traps focus and makes the page behind inert");
ok(/onCancel=/.test(dialog) && /onAnswer\(false\)/.test(dialog), "Escape answers no");
ok(/autoFocus/.test(dialog) && /cancelLabel/.test(dialog), "Cancel, the safer answer, has initial focus");
ok(/aria-labelledby="confirm-dialog-message"/.test(dialog), "the dialog is named by its question");
ok(/button-link-secondary/.test(dialog), "Cancel uses the exempt class (a global rule makes every other button white text)");
ok(!/transition|keyframes|framer|\.animate\(/i.test(dialog) && !/confirm-dialog[^}]*(transition|animation)/.test(css), "the dialog adds no motion");
ok(/\.confirm-dialog::backdrop/.test(css) && /min-height:44px/.test(css.split(".confirm-dialog-button")[1] || ""), "the backdrop is styled and buttons are 44px tall");

ok(!/window\.confirm\(|[^.\w]confirm\(/.test(jobs), "the jobs page no longer calls the browser's confirm()");
ok(/await askConfirm\(confirmMsg\)/.test(jobs), "post() asks through the in-page dialog and waits for the answer");
ok(/<ConfirmDialog message=\{confirmMessage\} onAnswer=\{answerConfirm\} \/>/.test(jobs), "the jobs page renders the dialog");
ok(/actionInFlight\.current = false;\s*return false;/.test(jobs.split("askConfirm(confirmMsg)")[1]?.slice(0, 200) || ""), "declining releases the in-flight guard and stops");

console.log(`Confirm dialog contract passed (${checks} checks).`);
