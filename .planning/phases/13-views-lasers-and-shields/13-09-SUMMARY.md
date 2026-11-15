---
phase: 13-views-lasers-and-shields
plan: 09
subsystem: station/outfitting
tags: [outfitting, lasers, money-path, f3, f5, facing-selection, trade-in]
status: complete
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-02 mount vocabulary (FACINGS, LASER_KEYS, NO_LASER, isFacing, isMountKey); 13-06 PlayerProfile.laserMounts and the v4 save"
provides:
  - "outfitting.ts: LASER_FIT_KEYS, isLaserFitKey, laserFitKey, parseLaserFitKey, LaserFitContext, laserPriceMap, laserFitPrice, checkLaserFit, applyLaserFit; FitRefusal gains noLaser"
  - "F3 laser rows (Remove Laser only while a laser is fitted), a facing subscreen (OutfittingModel.facingFor) and Oolite's facing labels"
  - "Station controller flow: confirm a laser row opens the facing selection, a facing row takes the two-step Y/N guard, Back closes the subscreen without leaving F3"
  - "SessionStationState.outfittingFacingFor"
  - "F5 lists each fitted laser ('Forward Pulse Laser', 'Aft Beam Laser', ...)"
affects: [13-11, 13-12, 13-15]
requirements-completed: [CBT-05]
actuals:
  tokens: 17700
  tasks: 3
  commits: 3
plan_head_before: 8662c89c39df076c0dbb38c2ba5b4e41e2b5d0ed
plan_head_after: 359c96cf8a724df1e32e4c259d7fa634dee0c063
tech-stack:
  added: []
  patterns:
    - "A second allow-listed money path beside the first: separate check/apply functions over LASER_FIT_KEYS x FACINGS, returning the same profile object on refusal"
    - "Composite F3 row key (<laser key>@<facing>) parsed through both allow-lists, with the row lookup as the first gate and parseLaserFitKey as the second"
    - "Trade-in prices come from a caller-supplied catalogue price map (LaserFitContext.laserPrices), so the sim never reads content"
key-files:
  created: []
  modified:
    - src/sim/player/outfitting.ts
    - src/ui/station-model.ts
    - src/app/session/station-controller.ts
    - src/app/session/context.ts
    - src/ui/station.ts
    - tests/sim/player/outfitting.test.ts
    - tests/ui/station-outfitting.test.ts
    - tests/ui/station-status.test.ts
    - tests/app/session/station-controller.test.ts
    - CHANGELOG.md
    - .planning/PROJECT.md
key-decisions:
  - "Lasers get their own door: checkLaserFit and applyLaserFit over LASER_FIT_KEYS x FACINGS. checkFit and applyFit are untouched and still refuse every EQ_WEAPON_* record and EQ_ECM as notOffered. PROJECT.md's money-path row is amended in place, not deleted."
  - "The trade-in price of the laser being replaced is not on the item, so the context carries it: LaserFitContext extends FitContext with a validated laserPrices map built by laserPriceMap(catalogue). A laser being replaced with no trusted price is refused as invalidPrice rather than refunded at 0."
  - "Remove Laser costs 0 whatever the record says (laserFitPrice), and a success always returns a new profile object, even at a zero net (a pulse over a pulse), so identity keeps meaning 'refused'."
  - "Affordability is the full price against the credits before any refund, as Oolite (PlayerEntity.m:9139-9217): military over a fore pulse needs 60,000, not 56,000."
  - "The facing selection is cleared in renderStation whenever the screen is not F3, so every route that leaves F3 (dock, launch, jump, load) drops it without touching those controllers."
patterns-established:
  - "outfittingFacingFor is state; the model, the controller and the Back action all read it, and a forged value that is not a laser key falls back to the main list"
coverage:
  - id: D1
    description: "F3 offers Pulse (TL 3), Beam (TL 4), Mining (TL 10), Military (TL 10) and Remove Laser; choosing one opens the four-facing selection showing what is fitted, and Y confirms a facing"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/app/session/station-controller.test.ts#in normal play, buying a beam laser for the aft mount charges 10,000 decicredits and survives a save"
        status: pass
      - kind: unit
        ref: "tests/ui/station-outfitting.test.ts#laser rows and the facing selection (CBT-05)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A purchase is refused when the full price exceeds credits (before any refund); otherwise the price is paid and the replaced laser is refunded at its catalogue price; Remove Laser costs 0 and refunds; Remove Laser on an empty facing is refused"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/sim/player/outfitting.test.ts#checkLaserFit and applyLaserFit: purchase and trade-in"
        status: pass
      - kind: unit
        ref: "tests/app/session/station-controller.test.ts#laser facing selection flow"
        status: pass
    human_judgment: false
  - id: D3
    description: "The money path stays allow-listed: lasers go only through checkLaserFit/applyLaserFit, checkFit/applyFit still refuse every laser and other record as notOffered, a forged composite key or facing is refused"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/sim/player/outfitting.test.ts#the money-path boundary (T-13-18, T-13-19)"
        status: pass
      - kind: unit
        ref: "tests/sim/player/outfitting.test.ts#LASER_FIT_KEYS and the composite row key"
        status: pass
    human_judgment: false
  - id: D4
    description: "F5 lists each fitted laser as Oolite does, in forward, aft, port, starboard order"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/ui/station-status.test.ts#buildStatusModel page 1"
        status: pass
    human_judgment: false
  - id: D5
    description: "A purchase changes profile.laserMounts and the v4 save persists it"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/app/session/station-controller.test.ts#in normal play, buying a beam laser for the aft mount charges 10,000 decicredits and survives a save"
        status: pass
    human_judgment: false
  - id: D6
    description: "The facing selection's detail text renders with its line break (white-space pre-line on the detail description)"
    requirement: CBT-05
    verification:
      - kind: command
        ref: "docker compose run --rm verify (build and e2e smoke boot the station shell)"
        status: pass
    human_judgment: true
    rationale: "No DOM unit test or browser spec asserts the rendered line break; the model text is pinned, the CSS effect is not. A human opening F3 > Beam Laser should see the prompt on its own line."
duration: 17min
completed: 2026-11-15
---

# Phase 13 Plan 09: Lasers at F3 Summary

**Lasers can be bought per facing at F3 through a separate allow-listed money path with Oolite's price, tech-level and trade-in rules, a facing selection screen, and F5 listing each fitted laser.**

## Performance

- **Duration:** about 17 min of work (2026-11-15), plus a 6 min `verify` gate
- **Tasks:** 3 (1 tracer, 1 TDD-style test task, 1 auto)
- **Files:** 11 modified, none created (src: 5, tests: 4, CHANGELOG and PROJECT.md: 2)

## Accomplishments

- `outfitting.ts` gained the laser path without touching `checkFit` or `applyFit`: `LASER_FIT_KEYS` (Remove Laser, then pulse, beam, mining, military in `equipment.plist` order), `laserFitKey` and `parseLaserFitKey` (exactly `<allow-listed key>@<facing>`), `checkLaserFit` and `applyLaserFit`. Rule order: not offered, price validity, raw tech level, mount occupant and refund-price trust, `noLaser` for Remove Laser on an empty facing, then `price > credits` before any refund. Each rule cites its Oolite line.
- The F3 model appends laser rows after the visible rows. Remove Laser shows only while a laser is fitted; a laser row is confirmable when some facing could take it. With `facingFor` set, the model returns the four facing rows (`Forward (Pulse Laser)`, `Aft (None)`, ...) keyed by the composite key, each enabled by `checkLaserFit`, with the detail "<name>\nPlease select where to install this weapon.".
- The station controller opens the facing selection on confirming a laser row (no prompt yet), applies the existing two-step Y/N guard on a facing row, and on the second confirm runs `parseLaserFitKey`, `checkLaserFit`, `applyLaserFit`, records `lastTrade`, commits the profile, autosaves, and returns to the main list. Back closes the subscreen without leaving F3.
- F5 lists `Forward/Aft/Port/Starboard <laser name>` after the missile and berth lines; a new game shows "Forward Pulse Laser".
- PROJECT.md's money-path row is amended in place, and CHANGELOG `### Added` records the feature.
- The normal-play test drives the real controller through the player's actions (select Beam Laser, confirm, select aft, confirm twice): aft is the beam laser, credits fell by exactly 10,000 decicredits, and the profile round-trips through `encodeSave`, `parseSave` and `profileFromSave` (v4).

## Task Commits

1. **Task 1: Buy a beam laser for the aft mount, end to end (tracer)** - `0f4c70f` (feat)
2. **Task 2: Purchase, trade-in and refusal rules, and the money-path boundary tests** - `a0da7b8` (test)
3. **Task 3: F5 laser lines, Key Decisions amendment and CHANGELOG** - `359c96c` (feat)

**Plan metadata:** recorded in the final docs commit.

## Files Created/Modified

- `src/sim/player/outfitting.ts` - the laser allow-list, key codec, check and apply functions, `noLaser`
- `src/ui/station-model.ts` - laser rows, `buildFacingModel`, `FACING_LABELS`, F5 laser lines, `noLaser` copy
- `src/app/session/station-controller.ts` - facing selection open/close, composite-key confirm (`confirmLaserFit`), `laserFitContext`
- `src/app/session/context.ts` - `outfittingFacingFor`
- `src/ui/station.ts` - `white-space: pre-line` on the detail description so the prompt's line break shows
- `tests/sim/player/outfitting.test.ts`, `tests/ui/station-outfitting.test.ts`, `tests/ui/station-status.test.ts`, `tests/app/session/station-controller.test.ts` - the new cases
- `CHANGELOG.md`, `.planning/PROJECT.md` - the entry and the amended decision row

## Decisions Made

See `key-decisions` above. The two that later plans lean on: the laser trade-in price travels in `LaserFitContext.laserPrices` (built from the catalogue, never from the combat ledger), and the facing selection is state on the session (`outfittingFacingFor`) cleared at render time whenever the screen is not F3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The refund price is not on the item, so `FitContext` could not carry it**
- **Found during:** Task 1
- **Issue:** the plan's signature `applyLaserFit(profile, item, facing, ctx)` and "refund the catalogue price of the laser currently on that facing" need the price of a laser that is not `item`.
- **Fix:** added `LaserFitContext extends FitContext` with a validated `laserPrices` map and `laserPriceMap(catalogue)`; the controller and the model build it from the equipment catalogue. A laser being replaced with no trusted price is refused as `invalidPrice`.
- **Files modified:** `src/sim/player/outfitting.ts`, `src/ui/station-model.ts`, `src/app/session/station-controller.ts`
- **Commit:** `0f4c70f`

**2. [Rule 3 - Blocking] Existing F3 row tests pinned the old row set**
- **Found during:** Task 1 (running `tests/ui`)
- **Issue:** two tests in `tests/ui/station-outfitting.test.ts` listed the exact D-11 rows, which now carry the five laser rows after them.
- **Fix:** extended both expectations with `EQ_WEAPON_NONE` and the four lasers (Remove Laser is listed because the stock fit has a fore pulse laser). No assertion was weakened.
- **Commit:** `0f4c70f`

**3. [Rule 2 - Missing critical] Facing selection must not survive leaving F3**
- **Found during:** Task 1
- **Issue:** dock, launch, jump and load all set `stationScreen = "home"` in controllers outside this plan's file list, so a stale `outfittingFacingFor` could reopen the subscreen on the next visit to F3.
- **Fix:** `renderStation` clears it whenever the screen is not F3, and `openStationScreen` and `backToHome` clear it explicitly; no other controller was touched.
- **Commit:** `0f4c70f` (covered by the "leaving F3 by any route" test in `a0da7b8`)

**Total deviations:** 3 auto-fixed (2 Rule 3, 1 Rule 2). **Impact:** none on scope; each is the direct consequence of the plan's own rules.

Process note: the Task 3 F5 lines were first written during Task 1 and held back from that commit (the F5 tests would have failed), then re-applied unchanged in Task 3.

## Authentication Gates

None.

## Verification

- `docker compose run --rm test npx vitest run tests/sim/player/ tests/ui/ tests/app/session/station-controller.test.ts tests/compliance.test.ts` - pass (14 files, 278 tests)
- `docker compose run --rm typecheck` and `docker compose run --rm lint` - pass
- `docker compose run --rm verify` - pass (lint, typecheck, content drift, unit tests, build, e2e smoke subset: 27 Chromium tests)
- Acceptance: `export function checkLaserFit` count 1; `outfittingFacingFor` in `context.ts` count 2; the aft beam scenario passes and its title says "normal play"
- `tests/golden/flight-hash-pins.json` was not touched.

## Known Stubs

None.

## Threat Flags

None. The only trust boundary this plan adds is the composite F3 row key, covered by T-13-18 (both allow-lists, the row lookup as a first gate, forged-key tests on the sim and the controller) and T-13-19 (refusal before any mutation, integer decicredits, the same profile object on refusal, a property test that credits stay a non-negative safe integer).

## Self-Check: PASSED

- `src/sim/player/outfitting.ts`, `src/ui/station-model.ts`, `src/app/session/station-controller.ts`, `src/app/session/context.ts` and the four test files exist.
- Commits `0f4c70f`, `a0da7b8` and `359c96c` are ancestors of HEAD; the measured commit count since the plan ledger is 3.
