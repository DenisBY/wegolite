---
phase: 21-roster-state-shape-and-seams
plan: 18
subsystem: render
tags: [draw-calls, D-05, deferred, QUAL-09]
status: deferred
requires:
  - phase: 21-17
    provides: "per-hull atlas merge; anarchy at 39 / 42 calls"
provides:
  - "nothing shipped; plan deferred by orchestrator decision (2026-11-26)"
affects: [21-19]
---

# Plan 21-18: deferred, not executed

## Decision

The orchestrator deferred plan 21-18 (D-05 fix 2, variant family instancing with a
`gl_InstanceID` variant shader) on 2026-11-26, while the owner was offline. Under
the owner's standing instruction for unattended runs, an independent reviewer
(Fable subagent, neutral brief) was consulted and recommended deferring.

## Why

- D-05 makes both fixes a precondition for a budget **raise**. After fix (1)
  (plan 21-17) the remote full anarchy measures 39 calls (worst case) and 42
  (after the kill) against `DRAW_CALL_BUDGET` 50, so no raise is needed and the
  precondition is never triggered.
- The anarchy spec already draws all 29 hull keys at one instanced call each,
  so more ships, police and repopulation in later v2.4 phases add no calls.
  Missiles stay at zero (Phase 22); lasers, explosions and debris are pooled or
  instanced.
- The plan rated its own confidence low (custom shader patch, extra samplers
  against the WebGL2 16-unit minimum, a new program cache key) and would save
  about 10 calls that no budget needs.
- It does nothing for texture memory, the real open cost of fix (1) (601 to
  1,023 MiB summed per record); that gets its own todo.

This departs from the letter of D-05 ("the spike follows D6's order of fixes"),
so plan 21-19 records it in the dated note under D-05 and in Key Decisions,
flagged for owner review.

## Tripwire

Plan 21-19 asserts the anarchy calls, before and after the kill, against
`DRAW_CALL_BUDGET` in `tests/e2e/anarchy.spec.ts`. It also records an upper
bound with all seven debris models present. If either goes over 50, the
deferred work comes back: todo
`.planning/todos/pending/2026-11-26-npc-variant-family-instancing.md`.

## Deferred work

- `.planning/todos/pending/2026-11-26-npc-variant-family-instancing.md`: this plan
- `.planning/todos/pending/2026-11-26-npc-atlas-texture-memory.md`: the texture-memory cost of 21-17

## Self-Check: PASSED (deferral recorded; no code changed)
