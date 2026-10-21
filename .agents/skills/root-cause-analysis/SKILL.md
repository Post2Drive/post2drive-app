---
name: root-cause-analysis
description: Runs a blameless postmortem after an incident — what broke, why it broke, why it was not caught, and what changes as a result. Use this whenever the user mentions a postmortem, retro, incident review, "five whys", or a root cause analysis, and also when a serious failure has been fixed but never written up. Blamelessness here is a mechanism for getting accurate information, not a courtesy. For the live incident, use incident-response; for finding the cause of a bug, use debugging.
license: MIT
---

# Root cause analysis

A postmortem is a written argument that a *class* of failure is now less likely. It is not a
timeline, not an apology, and not a record of who was on shift.

If it ends with "we will be more careful", nothing changed and the incident will recur, because
care is not a control.

## Blamelessness is a mechanism, not manners

The reason to write blamelessly is instrumental: **people who expect blame withhold information,
and incomplete information produces wrong conclusions.** The engineer who ran the command knows
more about what happened than anyone else. If naming them costs them, you lose that.

So the rule is: **name systems, not people.**

> "The deploy tool accepted a production target without confirmation"
>, not "Priya deployed to prod by mistake"

Both describe the same event. Only one produces an honest report next time, and only one points
at something you can fix.

This also means **human error is never a root cause.** It is where the analysis starts. Someone
did the wrong thing — now ask why the system made that easy, why nothing caught it, and why the
blast radius was that large.

## 1. Impact, in numbers

Who was affected, how many, for how long, and what they could not do. Numbers, not adjectives.

If you do not know the number, write "unknown" and note what would have told you. **A missing
measurement is itself a finding**, and usually an important one.

**Done when:** impact is quantified or its unmeasurability is recorded.

## 2. Timeline, anchored on three moments

Include only events that change a reader's understanding. Start at the change that introduced the
fault, not at the alert.

Mark these explicitly, because the gaps between them are findings in their own right:

- **Introduced:** when the fault entered the system
- **Detected:** when a human first knew
- **Resolved:** when impact ended

A long introduced→detected gap is a **monitoring** finding. A long detected→resolved gap is a
**tooling or runbook** finding. Name them as such rather than leaving the reader to notice.

**Done when:** all three moments have times and the gaps are called out.

## 3. Root cause and contributing factors

Most incidents have no single cause. They have a trigger and a set of conditions that let it
matter, and treating one as *the* cause hides the rest.

Separate them:

- **Trigger:** what set it off. Often mundane, and rarely the interesting part
- **Root causes:** the conditions without which the trigger would have been harmless. Usually
  two or three
- **Contributing factors:** things that made it worse or longer: a missing alert, an unclear
  runbook, a dashboard showing the wrong panel

Keep asking why until the next answer would be a system you control and could change. That is
where to stop. Going further reaches "because the business wanted the feature", which is true
and useless.

**Done when:** each cause bottoms out at something changeable.

## 4. Why it was not caught

Do this section properly — it is the one that generalises beyond this incident. Walk each layer
that should have stopped it and say why it did not:

- Types, lints, compile-time checks
- Tests — was there no test, or a test that passed anyway?
- Code review — was the risk visible in the diff?
- Staging or canary — did it run there, and did it behave differently?
- Alerting — did anything fire? Too late, to the wrong place, or not at all?

"No test existed" is a weak answer. "The suite mocked the queue, so backpressure was unreachable
in tests" is a finding you can act on.

**Done when:** every layer is accounted for, including the ones that worked.

## 5. Action items that will actually happen

Each needs an **owner**, a **date**, and a **tracked ticket**. An action item without all three
is a wish.

Sort by what they do:
- **Prevent** recurrence
- **Detect** faster next time
- **Mitigate** faster next time

All three are legitimate. Do not let detection work be presented as prevention.

Reject aspirations. "Improve testing" is not an action; "add an integration test running the
consumer against a real queue at 10x normal depth" is.

**Cap the list.** A postmortem with fourteen action items produces zero. Three that ship beat
fourteen that do not, and the completion rate is the honest measure of whether this process is
real.

**Done when:** every item has an owner, a date, and a ticket.

## 6. Review it, then publish it widely

The document has two audiences, and the second is the larger one:

- **The team**, in a review — read it together, challenge the causal chain, check the actions
  are real
- **Everyone else**, afterwards — much of the value is other teams recognising the same latent
  problem in their own systems

Publish beyond the team by default. A postmortem archive people actually read is one of the
strongest reliability investments available, and it only works if the writing is blameless
enough that publishing is safe.

**Done when:** it has been reviewed and shared beyond the people involved.

## Before publishing

- Could a reader outside the team follow the cause chain without asking questions?
- Does every "why" bottom out at a changeable system rather than a person?
- Is the detection gap addressed, not just the cause?
- Would the engineer at the centre of this be comfortable with how they are described?
- Is there at least one action that would have prevented *this specific* incident?

Write for the person who joins in a year and hits something similar. They need the mechanism and
the reasoning, not reassurance.


---

> Upstream source: https://github.com/arjunprabhulal/agent-skills/blob/main/skills/sre/root-cause-analysis/SKILL.md
> Imported into Post2Drive as a project-local skill; review upstream before refreshing.
