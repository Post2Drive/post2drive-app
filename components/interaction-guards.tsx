"use client";

import { useEffect } from "react";
import { isRepeatActivation, keyboardInset, REPEAT_SUBMIT_MS } from "@/lib/interactionGuard";

const ACTIVATABLE = 'button, a[href], [role="button"], input[type="submit"], input[type="button"]';
const EDITABLE = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="range"]), textarea, select, [contenteditable="true"]';

/**
 * App-wide interaction safety, mounted once in the root layout.
 *
 * 1. Double activation: a double click or double tap on a button or link acts
 *    once. The second event is stopped in the capture phase, before any
 *    handler, so it cannot submit, navigate or open something twice. Forms get
 *    the same protection for repeated submits (for example a held Enter key).
 *    Controls meant to be pressed quickly opt out with data-allow-rapid.
 * 2. On-screen keyboard: the focused field is kept visible above the keyboard,
 *    fixed bottom bars are hidden while typing, and the page gains scroll room
 *    where the browser does not resize for the keyboard.
 */
export default function InteractionGuards() {
  useEffect(() => {
    const lastActivation = new WeakMap<Element, number>();
    const lastSubmit = new WeakMap<Element, number>();

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest(ACTIVATABLE) : null;
      if (!target || target.closest("[data-allow-rapid]")) return;
      const now = performance.now();
      if (isRepeatActivation(lastActivation.get(target), now)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      lastActivation.set(target, now);
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || form.closest("[data-allow-rapid]")) return;
      const now = performance.now();
      if (isRepeatActivation(lastSubmit.get(form), now, REPEAT_SUBMIT_MS)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      lastSubmit.set(form, now);
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);

    // ── On-screen keyboard ──
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let tallest = viewport ? viewport.height : window.innerHeight;
    let width = window.innerWidth;
    let revealTimer: number | undefined;

    const focusedField = (): HTMLElement | null => {
      const active = document.activeElement;
      return active instanceof HTMLElement && active.matches(EDITABLE) ? active : null;
    };

    const reveal = () => {
      const field = focusedField();
      if (!field) return;
      const visibleTop = viewport ? viewport.offsetTop : 0;
      const visibleBottom = visibleTop + (viewport ? viewport.height : window.innerHeight);
      const rect = field.getBoundingClientRect();
      // Leave room for the field's label above and its hint or error below.
      if (rect.top < visibleTop + 56 || rect.bottom > visibleBottom - 24) {
        field.scrollIntoView({ block: "center", inline: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
      }
    };

    const update = () => {
      const visualHeight = viewport ? viewport.height : window.innerHeight;
      if (window.innerWidth !== width) {
        // Rotation or window resize: forget the old "no keyboard" height.
        width = window.innerWidth;
        tallest = visualHeight;
      }
      tallest = Math.max(tallest, visualHeight);
      const inset = viewport ? keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop) : 0;
      // Browsers that resize the page for the keyboard report no inset, so also compare with the tallest height seen.
      const open = Boolean(focusedField()) && (inset > 0 || tallest - visualHeight > 120);
      root.style.setProperty("--keyboard-inset", `${inset}px`);
      root.toggleAttribute("data-keyboard-open", open);
      if (open) reveal();
    };

    const onFocusIn = () => {
      window.clearTimeout(revealTimer);
      // The keyboard animates in after focus; look again once it has settled.
      revealTimer = window.setTimeout(() => { update(); reveal(); }, 300);
    };
    const onFocusOut = () => {
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(update, 100);
    };

    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    update();

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.clearTimeout(revealTimer);
      root.style.removeProperty("--keyboard-inset");
      root.removeAttribute("data-keyboard-open");
    };
  }, []);

  return null;
}
