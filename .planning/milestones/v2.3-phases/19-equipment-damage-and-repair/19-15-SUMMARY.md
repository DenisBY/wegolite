---
phase: 19-equipment-damage-and-repair
plan: 15
subsystem: testing
tags: [guard, tripwire, d-06, equipment-damage, oolite-fidelity]
requires: []
provides:
  - "the D-06 in-use tripwire (autopilot token; EQ_GAL_DRIVE and EQ_ADVANCED_NAVIGATIONAL_ARRAY pinned to outfitting.ts)"
  - "the todo recording the three in-use clauses Wegolite cannot exercise yet"
affects: [19-03]
tech-stack:
  added: []
  patterns: ["comment-stripped source tripwire with synthetic failing inputs and pinned token counts"]
key-files:
  created:
    - tests/guards/damaged-equipment-in-use.test.ts
    - .planning/todos/pending/2026-11-21-damaged-equipment-in-use.md
  modified: []
key-decisions:
  - "outfitting.ts is pinned by OUTFITTING_KEY_PINS (2 per key), not exempt; the key match is a plain substring so a future EQ_..._DAMAGED spelling also counts"
requirements-completed: [CBT-08, CBT-12]
status: complete
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: 65f40d17f30637d5759fbb29b45165a8afe7d670
plan_head_after: da23ba1e79ddabb09ea8d5f373266acf2df69dac
duration: 45m
completed: 2026-11-21
---

# Phase 19 Plan 15: Damaged-equipment in-use tripwire Summary

A todo plus a limited source tripwire that fails, naming the todo and Oolite's clause, when the first autopilot, galactic-jump or ANA consumer lands without its damaged-item behaviour (D-06).

## What was built

**Todo** `.planning/todos/pending/2026-11-21-damaged-equipment-in-use.md` records the three clauses, each "not applicable today" with the reason and what the first consumer must do:

1. Autopilot disengages ("Autopilot disengaged.", `descriptions.plist:494`) when the docking computer is damaged while engaged: `ShipEntity.m:3327-3330`. Not applicable: Shift+C docks instantly (`src/sim/dock/computer.ts`, D-12).
2. A galactic jump aborts, and cannot start, with a damaged drive: `PlayerEntity.m:3432-3440`. Not applicable: no galactic jump exists.
3. A damaged ANA provides nothing (`ShipEntity.m:2803-2818`), so `GuiDisplayGen.m:1696`, `PlayerEntityControls.m:1895`, `PlayerEntity.m:601` and `PlayerEntity.m:11210-11244` fall back to plain behaviour. Not applicable: no chart or route consumer.

The todo also states the tripwire's limit and asks the first consumer for a damaged-item test at its own simulation boundary.

**Guard** `tests/guards/damaged-equipment-in-use.test.ts`, one pure predicate `inUseViolations(files)` over comment-stripped text (`listSrcFiles`, `withoutComments`), applied to the tree and to synthetic inputs. Every message names the todo path and the Oolite lines.

| Trigger | Fires on | Synthetic inputs |
|---------|----------|------------------|
| (a) | a non-comment `autopilot` token (any case) in any `src/**/*.ts` | an `autopilotEngaged` field (fails, line 2 reported); `"Autopilot disengaged."` string (fails); the word in `//`, `/** */` and `/* */` comments (passes) |
| (b) | a non-comment `EQ_GAL_DRIVE` outside `src/sim/player/outfitting.ts`, or a count in it other than `OUTFITTING_KEY_PINS.EQ_GAL_DRIVE` (2) | `owned.has("EQ_GAL_DRIVE")` in `src/sim/flight/galactic.ts` (fails); real `outfitting.ts` plus `export const GAL_DRIVE_KEY = "EQ_GAL_DRIVE";` (fails: "appears 3 times", "pinned at 2"); the key removed from the file (fails: 1); alias inside a comment (passes); key in a comment elsewhere (passes) |
| (c) | the same for `EQ_ADVANCED_NAVIGATIONAL_ARRAY` (pin 2) | a constant in `src/ui/chart.ts` (fails, ANA clause with all five Oolite line anchors); the `ANA_KEY` alias in `outfitting.ts` (fails); alias in a comment (passes) |

Also covered: the real `outfitting.ts` holds exactly the pinned counts (2 and 2, at `:78, 96` and `:80, 98`); a copy of `outfitting.ts` at `src/ui/outfitting.ts` gets no pin (matched by repo-relative path, not base name), so its four key lines fail; a count-failure message says when raising the pin is right (a new list entry that is not a consumer, as 19-03's damageable set) and when it is not (a consumer). The guard doc, as the todo, calls it a limited tripwire.

19-03 must raise both `OUTFITTING_KEY_PINS` entries from 2 to 3 in the commit that adds `DAMAGEABLE_EQUIPMENT_KEYS` to `outfitting.ts`.

## Deviations from Plan

None. The plan executed as written. The key match is a plain substring rather than a word-boundary match, so `EQ_GAL_DRIVE_DAMAGED` (an `_DAMAGED` twin) counts as the key; this is stricter and consistent with the plan's "token" wording (recorded under key-decisions).

## Verification

- `docker compose run --rm test npx vitest run tests/guards/damaged-equipment-in-use.test.ts`: 12 tests pass.
- `docker compose run --rm typecheck`: clean.
- `docker compose run --rm lint`: clean (eslint, prettier). A first run failed with `ENOENT .../__purity_safe_math_probe.ts` because it ran concurrently with the full test run, which creates and removes that probe file; rerun alone it passed.
- `docker compose run --rm test` (full, twice): only timeout failures unrelated to this plan (no source file changed), different files each run: run 1 `textures.test.ts` and two others; run 2 `tools-determinism.test.ts` (30 s), `tick-flyers.test.ts`, `world-lifecycle.test.ts`, `test-spawn.test.ts`, `kill.property.test.ts` (5 s). The slow remote-less container is the cause. The six affected files rerun together passed except `textures.test.ts` (a documented flake); it passed on a solo rerun (20 of 20).
- Acceptance greps: `EQ_GAL_DRIVE|EQ_ADVANCED_NAVIGATIONAL_ARRAY` 20 lines, `src/sim/player/outfitting.ts` 2, `OUTFITTING_KEY_PINS` 8, pins at 2 matched twice, `GAL_DRIVE_KEY` 2, todo name 2; both files are ASCII only.
- No remote run, no CHANGELOG entry (nothing user-visible), no source file changed.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: tests/guards/damaged-equipment-in-use.test.ts
- FOUND: .planning/todos/pending/2026-11-21-damaged-equipment-in-use.md
- FOUND: commits 56ccd6f (Task 1, the todo and trigger a), da23ba1 (Task 2, triggers b and c)
