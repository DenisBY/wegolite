---
phase: quick
plan: 261117-glc
subsystem: render/hud
tags: [hud, clock, font, oolite-fidelity]
requires: []
provides:
  - "Top-left clock drawn in the 20px HUD small font, same as the Hyperspace line"
affects: [src/render/hud/draw.ts]
tech-stack:
  added: []
  patterns: ["recording fake CanvasRenderingContext2D capturing this.font at fillText time"]
key-files:
  created:
    - tests/hud/clock-lines.test.ts
  modified:
    - src/render/hud/draw.ts
    - CHANGELOG.md
decisions:
  - "Removed the unused 28px HUD_FONT export; the message line never used it (it inherits HUD_SMALL_FONT)."
status: complete
commits: 2
plan_head_before: 74aa9fb201e49e501d7130b4bb483a58882a3610
plan_head_after: 00d98295cbd582382228e1ac5fc70d0129a76a50
actuals:
  tokens: 4000
  tasks: 2
  commits: 2
completed: 2026-11-17
---

# Phase quick Plan 261117-glc: Shrink the top-left HUD clock Summary

The HUD clock is now drawn in the 20px HUD small font, the same as the Hyperspace line under it. Both lines are centred on the first and third quarters of the unchanged 40px clock rectangle (y = 50 and y = 70), so they no longer touch and the Hyperspace line no longer runs outside the rectangle.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (RED) | Test pinning font, x and y of the clock, Hyperspace and message lines | 5415d17 |
| 1 (GREEN) | draw.ts font and y offsets, remove HUD_FONT, CHANGELOG entry | 00d9829 |
| 2 | Typecheck, lint and full unit suite in Docker | no commit (no changes needed) |

## Results

- RED: Tests 1-3 of `tests/hud/clock-lines.test.ts` failed at HEAD (clock y 60 vs 50, pitch 18 < 20); the message-font test passed.
- GREEN: `tests/hud/clock-lines.test.ts`, `tests/hud/projection.test.ts` and `tests/ui/hud-model.test.ts` pass (51 tests).
- Docker: `typecheck` exit 0, `lint` (eslint + prettier) exit 0, full `test` exit 0 (218 files passed).
- Scope guard: `git diff --quiet 74aa9fb -- src/sim src/content src/app` is clean; the only source file changed is `src/render/hud/draw.ts`.
- HUD_ELEMENTS and HUD_LAYOUT are unchanged (D-12/A2). The centre message keeps the 20px font.

## Deviations from Plan

None - plan executed exactly as written. `rg -nw HUD_FONT` over src, tests, docs and scripts showed only the declaration and the old clock line, so the constant was deleted as planned. No formatting commit was needed.

## Pending

- `verify` (the change is browser-facing render code under `src/render/`) must be run on the remote test machine by the orchestrator or owner. It was not run locally.
- Optional owner visual check: in flight, the clock reads at the Hyperspace line's size and both fit in the corner.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- tests/hud/clock-lines.test.ts, src/render/hud/draw.ts, CHANGELOG.md exist and are committed.
- Commits 5415d17 and 00d9829 are on main (2 commits measured from plan_head_before).
