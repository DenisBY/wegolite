---
phase: 19-equipment-damage-and-repair
review: 19-REVIEW.md
fix_report: 19-REVIEW-FIX.md
recorded: 2026-11-21
counts:
  critical: 1
  warning: 1
  info: 2
open: 0
---

# Phase 19 — Code Review Disposition

One row per finding in `19-REVIEW.md`, recording what happened to it.

| ID | Severity | Finding | Disposition | Evidence |
|----|----------|---------|-------------|----------|
| CR-01 | critical | `resolveInternalDamage` counted zero-probability items toward the damageable slots and the pick odds; Oolite counts only `canBeDamaged` items (`PlayerEntity.m:6119-6126`) | fixed | `b7b9ae9`; orchestrator re-checked the diff against the C; five new or changed cases fail on the old code; FIDELITY E-157 text updated; no twin literal moved |
| WR-01 | warning | `commitProfile` re-rendered the whole station view on every in-flight damage event | fixed | `37fb48c`; render only while docked, probe sync kept; station-controller cases added |
| IN-01 | info | `internalDamageWork` guards cover states the validator and schema already exclude | accepted, not applied | the module is total on malformed input by design (ROADMAP cross-cutting rule: new combat code is total and fast-check covered) |
| IN-02 | info | `MAX_SAVE_CHARS` comment called 46,796 a true upper bound | fixed | `e2f7fa3`; comment now names the schema-maxima bound and the reachable 40,605 |

Gates after the fixes: local full `test` (280 files, 7340 passed), `typecheck`, `lint`; remote `verify` at `e2f7fa3` (exit 0) and the remote combat spec (CBT-08 end to end, exit 0).
