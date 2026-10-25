---
name: accessibility-review
description: Reviews an interface for barriers that stop people using it — keyboard operation, screen reader support, contrast, focus management, and form semantics. Use this whenever the user is building or reviewing UI, mentions accessibility, a11y, WCAG, screen readers, or keyboard navigation, and proactively when a change adds a modal, a custom control, a form, or anything interactive. For general code correctness, use code-review.
license: MIT
---

# Accessibility review

Most accessibility failures are not exotic. They are a `div` that should have been a `button`, a
form field with no label, and a modal that traps nobody's focus. Fixing the common handful gets
you most of the way, and they are cheap when caught in review and expensive later.

**The fastest useful test: put the mouse away.** If you cannot complete the flow with a keyboard,
neither can a large group of users, and no amount of ARIA fixes it.

## 1. Use the right element before adding anything

The single highest-leverage rule. A native `<button>`, `<a>`, `<input>`, or `<label>` brings
keyboard handling, focus, roles, and states for free. A `div` with a click handler brings none
of it, and reproducing them correctly takes far more code than people expect.

Check for:
- Clickable elements that are not `button` or `a`
- `a` used for actions, `button` used for navigation — this breaks user expectations about
  new tabs and back behaviour
- Custom dropdowns, checkboxes, and toggles reimplemented from scratch
- Headings chosen for size instead of structure

ARIA is the fallback when no native element fits, not an upgrade. Wrong ARIA is worse than
none, because it overrides what the browser would have reported correctly.

**Done when:** every interactive element is a native control or has a justified reason not to be.

## 2. Walk the whole flow with the keyboard

- **Can you reach everything?** Tab through the entire interface.
- **Can you see where you are?** Focus must be visible. Never remove the outline without
  replacing it with something at least as clear.
- **Is the order logical?** Tab order follows DOM order — CSS that visually reorders content
  creates a mismatch that is disorienting.
- **Can you escape?** Modals, menus, and date pickers must close on `Escape` and return focus to
  whatever opened them.
- **Are you trapped anywhere?** A focus trap is correct inside an open modal and a bug anywhere
  else.
- **Is there a skip link** past repeated navigation?

**Done when:** the primary flow completes with keyboard only, and focus is visible throughout.

## 3. Check what a screen reader would announce

You do not need to be an expert user to catch the common failures:

- **Every input has a label:** a real `<label for>`, not just placeholder text. Placeholders
  disappear on typing and are not reliably announced
- **Images have appropriate alt text:** descriptive when meaningful, empty (`alt=""`) when
  decorative. Missing is not the same as empty
- **Buttons say what they do.** Three buttons all announcing "Edit" are unusable out of context
- **Icon-only buttons have accessible names**
- **Errors are associated with their field**, not only shown in colour beside it
- **Dynamic changes are announced:** a live region for content that updates without navigation

**Done when:** every control has a name, and every state change is perceivable without sight.

## 4. Check colour and contrast

- **Contrast ratios:** 4.5:1 for normal text, 3:1 for large text and interactive boundaries.
  Measure it; do not eyeball it
- **Colour is never the only signal:** red text for an error needs an icon or wording too
- **Focus indicators meet contrast too**, in both themes
- **Test at 200% zoom** and at narrow widths — content must reflow, not clip or scroll
  horizontally

**Done when:** contrast is measured, and no state is communicated by colour alone.

## 5. Respect what the user has already asked for

- `prefers-reduced-motion` — honour it for animation and auto-scrolling. Motion causes real
  physical symptoms for some people
- `prefers-color-scheme`
- Do not disable zoom
- Do not steal focus, autoplay media, or move content under the cursor

**Done when:** user preferences are respected rather than overridden.

## 6. Automate what can be automated, then check the rest

Automated tools — axe, Lighthouse, `eslint-plugin-jsx-a11y` — catch roughly a third of issues,
and that third is worth catching for free in CI.

They cannot judge whether alt text is *meaningful*, whether focus order makes *sense*, or
whether an error message is *understandable*. A clean automated report is a starting point, not
a pass. Say so when you report one.

**Done when:** the automated check is in CI and the manual checks above have been done.

## Report

Order by whether the barrier blocks a task entirely or makes it harder — a form nobody can
submit outranks a low-contrast footer. For each: what breaks, who it affects, and the fix. Note
that automated coverage is partial, so a clean scan is not a clean bill of health.


---

> Upstream source: https://github.com/arjunprabhulal/agent-skills/blob/main/skills/review/accessibility-review/SKILL.md
> Imported into Post2Drive as a project-local skill; review upstream before refreshing.
