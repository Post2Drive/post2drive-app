---
name: debugging
description: Finds the cause of a specific failing behaviour, a crash, a wrong value, a test that fails. Use this whenever something is broken and the cause is not yet known — the user says it "doesn't work", pastes a stack trace or error message, reports a failing test, or describes a bug, even if they just ask you to "fix" it without asking you to investigate. Jumping to a fix without this skill is the failure it prevents. For a failure whose cause is already known and needs a written post-mortem, use root-cause-analysis. For deciding which of many reported problems to work on first, use issue-triage.
license: MIT
---

# Debug

A bug is a gap between what you believe the system does and what it does. Debugging closes
the gap by finding the smallest place where belief and behaviour diverge. You are not
looking for a fix yet — you are looking for the **divergence point**.

The failure mode this skill exists to prevent: changing code before locating the divergence
point. A fix applied to a guessed cause either does nothing or hides the symptom, and both
outcomes cost more than the time you saved.

## 1. Make it happen on demand

Get a command that fails every time you run it. Write it down verbatim.

If it is intermittent, find what varies between runs — ordering, time, concurrency, a
leftover file, a network call, and pin it. An intermittent bug is a bug with a hidden input.

**Done when:** you can produce the failure at will, or you have written down exactly why you
cannot and what you are working from instead (a single log, one user report).

## 2. State the belief

Write one sentence: what you expect to happen, and where. Be specific enough to be wrong —
"the handler receives a list of two items" is testable, "auth works" is not.

**Done when:** the sentence names a place in the code and a value or behaviour you could
observe there.

## 3. Bisect to the divergence point

Find one observation point between a place where the system is definitely correct and a place
where it is definitely wrong. Check it. That halves the search space. Repeat.

Observe, don't infer. Read the value, print it, break on it, log it. Do not reason about what
it must be — the whole reason you have a bug is that your reasoning about this code is wrong
somewhere.

Useful halving points, roughly in order of how much they narrow:
- The boundary between your code and a library or service
- The point where data changes shape (parsed, serialized, cast, normalized)
- The point where a value crosses a thread, process, or await
- The last commit where it worked (`git bisect` if the range is wide)

**Done when:** you have two adjacent points where the value is right at one and wrong at the
other.

## 4. Explain the whole symptom

Say out loud how the cause produces *everything* you observed, not just the headline error.
The stray warning, the wrong count, the second failure downstream.

If part of the symptom is unexplained, you have found *a* bug, not necessarily *the* bug.
Keep going or note the second one explicitly.

**Done when:** every observed symptom traces to the cause, or the leftovers are written down
as separate findings.

## 5. Fix at the cause

Fix where the divergence is, not where the symptom surfaced. A null check at the crash site
when the real problem is the value never being set is a symptom fix — it converts a crash into
silently wrong data, which is worse.

Then prove it: run the step 1 command. It must now pass, and it must fail again if you revert
the fix. If you cannot make it fail again, you have not proven the fix caused the pass.

**Done when:** the reproduction passes with the fix and fails without it.

## 6. Leave a test behind

A bug that reached you once will reach you again. Write the test that would have caught it,
at the divergence point, and confirm it fails against the unfixed code.

**Done when:** a committed test fails on the old code and passes on the new.

## When you are stuck

Stuck usually means a false belief you have not questioned. Try, in order:

- **Re-read the error.** All of it, including the parts you skimmed as boilerplate.
- **Check your assumption that the code you are editing is the code that runs.** Stale build,
  wrong environment, cached module, shadowed import, container not rebuilt.
- **Question the layer you trust.** You almost certainly trust something without evidence.
  Name it, then verify it.
- **Reduce.** Delete everything not needed to reproduce. The bug either survives, and is now
  much smaller — or it disappears, and the thing you deleted last is implicated.

Report the divergence point and the evidence, not just the fix. The user needs to know why it
broke to judge whether the fix is right.


---

> Upstream source: https://github.com/arjunprabhulal/agent-skills/blob/main/skills/diagnose/debugging/SKILL.md
> Imported into Post2Drive as a project-local skill; review upstream before refreshing.
