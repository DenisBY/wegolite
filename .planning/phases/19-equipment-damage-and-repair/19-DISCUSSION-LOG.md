# Phase 19: Equipment Damage and Repair - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-21
**Phase:** 19-equipment-damage-and-repair
**Areas discussed:** Cargo loss, Hull wear and trade-in, Breakdown while in use, Texts

---

## Cargo loss

| Option | Description | Selected |
|--------|-------------|----------|
| Port it | Same roll, a container really leaves the hold, HUD message, same event and atomic profile update; odds match Oolite | ✓ |
| Keep the roll, leave cargo alone | Equipment odds exact, cargo outcome is a no-op; divergence row | |
| Drop the branch | Pick equipment directly; odds diverge silently | |

**User's choice:** Port it

## Hull wear and trade-in

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed 100, not persisted | Cosmetic branch not ported; divergence row; todo with EQ_RENOVATION | ✓ |
| Port and persist | Extra v5 field, EQ_RENOVATION at F3, fuel price; beyond CBT-12 | |

**User's choice:** Fixed 100, not persisted

## Breakdown while in use

| Option | Description | Selected |
|--------|-------------|----------|
| As Oolite | Autopilot disengages, galactic jump aborts, compass falls back to basic, ANA route goes | ✓ |
| Only "not installed" | A running autopilot or countdown finishes; diverges | |

**User's choice:** As Oolite

## Texts

First question (verbatim Oolite strings vs own wording) went unanswered. The owner asked how our own wording would be clearer. Answer: only F5 "(N/A)" is truly ambiguous. The missing space in "Repair:X" is an Oolite alignment artefact and gets fixed either way.

| Option | Description | Selected |
|--------|-------------|----------|
| All verbatim, including (N/A) | No divergence | |
| Verbatim, but "(damaged)" in F5 | One UI divergence row | ✓ |

**User's choice:** Verbatim, but "(damaged)" in F5

## Claude's Discretion

Stream keying, weighted-pick order, event names and payloads, randf mapping, plan split, the CBT-08 fight scenario.

## Deferred Ideas

Hull wear, EQ_RENOVATION and the fuel-price effect, as one later piece of work.
