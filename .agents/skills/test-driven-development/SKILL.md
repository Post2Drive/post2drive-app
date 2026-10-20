---
name: test-driven-development
description: Builds a feature or fixes a bug test-first, one small cycle at a time — failing test, minimal code to pass, repeat. Use this whenever the user asks to build something test-first, mentions TDD or red-green-refactor, or is starting a feature where the requirements are clearer than the design. Also worth proposing when a bug reproduces reliably, since the reproduction is already the first test. For writing tests against code that already exists, use unit-testing.
license: MIT
---

# Test-driven development

TDD is a design technique that produces tests as a by-product. The tests are valuable; the
design pressure is the point. Writing the test first forces you to use the interface before you
build it, and interfaces that are painful to call are painful to test — you find out in thirty
seconds instead of after the implementation is finished.

The cycle is small on purpose. If a cycle takes more than a few minutes, the step was too big.

## The loop

### Red — write a failing test

One behaviour, stated from the caller's side. Run it and **watch it fail**.

Watching it fail is not ceremony. A test that passes before the code exists is testing nothing,
and this is a genuinely common mistake — a typo'd assertion, a test the runner never collected,
a mock that satisfies itself. The failure message is also your first piece of design feedback:
if it is incomprehensible, fix the test now.

**Done when:** the test fails, and it fails for the reason you intended.

### Green — make it pass, minimally

Write the least code that passes. Hardcoding a return value is legitimate here — it is a
placeholder that the next test will force you to generalize.

Resist implementing what the next test will need. That is the discipline the whole technique
rests on: code that is not yet demanded by a test is code with no specification.

**Done when:** the new test passes and every other test still passes.

### Refactor — clean up under a green bar

Now improve the code, with tests passing the entire time. Rename, extract, remove the
duplication the last cycle introduced. Run the tests after each step.

Refactor the tests too. Test code rots faster than production code precisely because people
treat it as exempt.

**Done when:** the code says what it means and the bar is still green.

## Choosing the next test

The order of tests is the order in which you discover the design, so it matters.

- **Start with the simplest case that is still real.** Not `null`, not the empty list — a
  genuine, minimal example of the actual job.
- **Then take the case that forces a new decision.** Each test should make you write code you
  could not have written before. If a test passes immediately with no new code, you learned
  nothing — delete it or pick a better one.
- **Save error paths for after the happy path works**, but do not skip them. They are the ones
  that fail in production.
- **When stuck on a big step, back up.** Delete the test, write a smaller one. The rule is that
  you should never be more than one cycle from green.

## Bug fixing with TDD

This is where TDD pays for itself most obviously:

1. Write a test that reproduces the bug. It must fail against the current code.
2. Confirm it fails *for the right reason*, not an import error, not a typo.
3. Fix the code.
4. The test passes. Revert the fix and confirm it fails again.

Step 4 is what proves the fix caused the pass. Without it you have correlation.

## What to test, and where

Test at the boundary a caller actually uses. Tests bound to internals break on every refactor
and produce the belief that "tests slow us down", which is true of *those* tests.

- **Test:** behaviour visible through a public interface, edge cases, error handling, the bug
  you just fixed
- **Do not test:** private helpers directly, framework behaviour, getters, or that a mock was
  called — the last one asserts your own implementation back at you

Prefer real collaborators over mocks. Mock what is slow, non-deterministic, or outside your
control — clock, network, filesystem, payment provider. Every other mock is a guess about
someone else's behaviour, and it passes happily while production fails.

## When TDD is the wrong tool

Be honest about this rather than forcing it:

- **Exploratory work** where you do not yet know what you are building. Spike first, throw it
  away, then TDD the real thing.
- **Code whose output is judged rather than asserted:** visual layout, prose, a model's
  response. Test the scaffolding around it; do not pretend the judgment is an assertion.
- **Thin adapters with no logic.** A function that renames three fields does not need a test
  written first, or possibly at all.

Say so when it applies. Forcing TDD where it does not fit is how teams conclude it does not
work anywhere.


---

> Upstream source: https://github.com/arjunprabhulal/agent-skills/blob/main/skills/qa/test-driven-development/SKILL.md
> Imported into Post2Drive as a project-local skill; review upstream before refreshing.
