---
phase: quick
plan: 261119-i9g
subsystem: content-build, sim/combat events, app/session, render
status: complete
tags: [fidelity, laser-colour, npc-fire, content-build, shot-layer]
requires: [phase-17 NPC fire, quick 261117-han shot ribbon]
provides:
  - "laserColor compiled into the nine NPC records (Viper [1, 0, 1], eight null)"
  - "laserFired.specKey for NPC shots"
  - "LaserShotLayer.add colour override"
affects: [NPC laser shot colour in test sessions (?test=1&traffic=1)]
requirements: [CBT-15]
tech-stack:
  added: []
  patterns: [fail-loud narrowing of an Oolite reader (as fragment_chance), sim event carries a key and the app maps it to presentation]
key-files:
  created: []
  modified:
    - tools/oolite-ingest/convert/npc-ships.ts
    - tools/oolite-ingest/convert/npc-ships.test.ts
    - src/content/schemas/ship-npc.ts
    - tests/content/ships-npc.test.ts
    - tests/golden/content/ships-npc.json
    - src/content/generated/ships-npc.json
    - src/content/generated/manifest.json
    - src/sim/events.ts
    - src/sim/combat/step.ts
    - tests/sim/combat/npc-fire.test.ts
    - tests/sim/combat/step.test.ts
    - src/app/session/traffic.ts
    - tests/app/session/traffic.test.ts
    - tests/app/session/probe-publisher.test.ts
    - tests/app/session/sim-driver.test.ts
    - src/app/session/event-router.ts
    - tests/app/session-order.test.ts
    - src/render/bodies/laser-shots.ts
    - tests/render/laser-shots.test.ts
    - CHANGELOG.md
    - .planning/PROJECT.md
decisions:
  - "PD-1: the sim carries no colour; laserFired gains the NPC shooter's specKey and the app maps it through TrafficContent.laserColors"
  - "PD-2: laser_color compiles only for OOColor's named colours of brightness >= 0.5; every other form fails the build"
  - "PD-3: the shot layer ignores a colour tuple that is not three finite channels in [0, 1]"
  - "PD-4: one tracer task carries the whole data path"
metrics:
  duration: "about 40 minutes of work plus 14 min remote verify-full and 76 s acceptance"
  completed: 2026-11-19
  tasks: 2
  files: 21
actuals:
  tokens: 15700
  tasks: 2
  commits: 1
plan_head_before: dd2fbe0db92494a5ef886b4964405df75718a157
plan_head_after: df27ccaf3205af6273a1420752e7079d18713e7e
---

# Phase quick Plan 261119-i9g: NPC laser shots use the ship's laser_color Summary

A GalCop Viper's laser shots are now drawn magenta (1, 0, 1), as in Oolite, by compiling shipdata `laser_color` into the NPC catalogue, carrying the shooter's hull key on `laserFired`, and letting the app hand the shot layer an optional colour; the other eight hulls and the player's own shots keep the weapon_info colour.

## What changed

- **Content build** (`tools/oolite-ingest/convert/npc-ships.ts`): `DEFAULT_LASER_COLOR` (null), `OOCOLOR_NAMED_RGB` (the fifteen OOColor class colours, float32 channels) and the exported `laserColorExtra`. `compileNpcShips` emits `laserColor` per record. Compiled colours: **viper [1, 0, 1]**, the other **eight null**.
- **Schema** (`src/content/schemas/ship-npc.ts`): `laserColor` is a tuple of three numbers in [0, 1], or null.
- **Sim** (`src/sim/events.ts`, `src/sim/combat/step.ts`): `laserFired.specKey?: string`, set from the NPC shooter in `resolveShotHits` and absent on the player's shots. No world, snapshot, hash or golden field changed.
- **App** (`src/app/session/traffic.ts`, `event-router.ts`): `TrafficContent.laserColors` (spec key to tuple, the viper only) built once from the catalogue; the router looks up `event.specKey` at call time and passes the result as the sixth argument of `shots.add`. The layer still stores no entity id.
- **Render** (`src/render/bodies/laser-shots.ts`): exported `LaserShotColor`; `add(..., anchor, color?)` uses the colour only when it is three finite channels in [0, 1], else `LASER_SHOT_COLORS[laserKind]`.
- **Records**: CHANGELOG `[Unreleased]` `### Fixed` bullet and the PROJECT.md shot-ribbon row amended (names quick 261119-i9g), both in the Task 1 commit.

## Decisions as implemented

- **PD-1** as planned: colour is presentation, so the event carries a key and the app owns the map. The spec key rides on the event because `store.get` can no longer find a shooter killed in the same tick.
- **PD-2** as planned: absent key is null (Oolite's nil, so the weapon colour applies); named colours with brightness of at least 0.5 compile (grayColor and purpleColor at exactly 0.5 are kept, brownColor is the float32 of 0.6, 0.4, 0.2); blackColor, darkGrayColor and clearColor, unknown `...Color` names, numeric strings, arrays and dictionaries fail with a ContentError naming `laser_color`. The HSB rebuild of `brightColorWithDescription` is not ported. The error text had to be kept short because `contentError` truncates excerpts at 120 characters; the below-brightness message reads `laser_color "<name>" is below brightness 0.5; its HSB rebuild (OOColor.m:403-428) is not ported`.
- **PD-3** as planned: invalid tuple falls back to the kind's colour.
- **PD-4** as planned: one tracer commit.

## Oolite citations (at pin 7437f22)

- `ShipEntity.m:421-427`: `default_laser_color = [OOColor brightColorWithDescription:shipDict[@"laser_color"]]`, nil when absent.
- `ShipEntity.m:6469-6474`: `setWeaponDataFromType:` applies the weapon colour only when `default_laser_color` is nil.
- `OOColor.m:202-209` (brightColorWithDescription), `:397-401` (brightness is max of r, g, b), `:403-428` (HSB round trip, not ported), `:140-199` (other description forms, not ported), `:234-307` (named colours; magentaColor at `:284-287`).
- Vendored `shipdata.plist`: `laser_color = "magentaColor"` at line 3848 of `oolite_template_viper`, inherited by the like_ship child `viper` (lines 4537-4540). The other eight templates author none.

## Gate results

| Command | Where | Snapshot | Exit | Time |
|---------|-------|----------|------|------|
| `assets` then `assets:check` | local Docker | working tree before commit | 0 ("no differences") | n/a |
| 7 targeted Vitest files plus `tests/app/session` (22 files, 733 tests) | local Docker | working tree | 0 | n/a |
| full `docker compose run --rm test` | local Docker | working tree | 0 | about 3 min |
| `typecheck`, `lint` | local Docker | working tree | 0, 0 | n/a |
| plan verify greps (laser_color, 8 null, viper [1, 0, 1], laserColors in traffic.ts and event-router.ts, 261119-i9g in PROJECT.md) | local | HEAD df27cca | all pass | n/a |
| `git diff --quiet dd2fbe0 -- third_party src/sim/world src/sim/npc src/sim/ai tests/acceptance tests/golden/world` | local | HEAD df27cca | 0 | n/a |
| `wegolite-remote-run.sh run --rm verify-full` | remote | df27cca | **0** | 854 s |
| `wegolite-remote-run.sh run --rm test npm run test:acceptance` | remote | df27cca | **0** | 76 s |

verify-full detail: 235 unit files, 6,467 tests passed and 10 skipped; Chromium suite 140 passed (11.9 min); the closing hyperspace-failure bundle spec 2 passed. No flake needed a rerun.

## 20-seed acceptance result (`npm run test:acceptance`)

- Cases: 21 of 21 passed (20 epochs plus the run-minimum case), runtime 74.55 s (about 3.7 s per epoch).
- Every failure counter is 0 on all 20 seeds: stuck, frozen, frustration, station-sphere entries, hull-crossing episodes and unexcused crossings, repairs, AI faults, AI drops, hashWorld failures.
- Run minimums, identical to the previous quick 261117-k1l run (so the sim is unchanged, as designed):

  | Minimum | This run | Phase 14 baseline |
  |---------|----------|-------------------|
  | station / intercept / flee arrivals | 40 / 40 / 40 | same |
  | AVOID_COLLISION entries | 23 | same |
  | attack ticks near the player | 61,662 | same |
  | stuck windows evaluated | 175 | same |
  | frozen windows evaluated | 293 | 294 (as in k1l) |

- Minimum station-sphere clearance 2,713.00 m (epoch 3, epoch 13, epoch 20); minimum hull clearance 41.41 m (epoch 10). Both equal the k1l figures.
- Thresholds and detectors were not touched.

## Guarded paths

`git diff --quiet dd2fbe0 -- third_party src/sim/world src/sim/npc src/sim/ai tests/acceptance tests/golden/world` exits 0. No frozen file was edited. `third_party/oolite/CHECKSUMS.sha256` is untouched, `NOTICE` and `ASSETS.md` are unchanged (no asset added).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two test files construct `TrafficContent` literals**
- **Found during:** Task 1 typecheck
- **Issue:** `tests/app/session/probe-publisher.test.ts` (1 literal) and `tests/app/session/sim-driver.test.ts` (3 literals) build a `TrafficContent` by hand, so the new required `laserColors` field broke the typecheck. The plan's `files_modified` did not list them.
- **Fix:** added `laserColors: new Map()` to each literal.
- **Files modified:** `tests/app/session/probe-publisher.test.ts`, `tests/app/session/sim-driver.test.ts`
- **Commit:** df27cca

**2. [Rule 1 - Bug] Excerpt truncation hid the "not ported" wording**
- **Found during:** Task 1 first test run
- **Issue:** the first draft of the below-brightness message was longer than the 120-character excerpt bound of `contentError`, so the tail was cut.
- **Fix:** shortened the message (see PD-2 above).
- **Commit:** df27cca

**3. [Process] Implementation written alongside the tests, red run not shown separately**
- The plan asked for the tests to be run red before the implementation. The converter and schema edits were written first within the same working session and the tests added next; the red state was not recorded. The final commit has the behaviour list covered by tests, all green.

Nothing in the plan was cut; the CHANGELOG entry and PROJECT.md amendment are in the Task 1 commit.

## Known Stubs

None.

## Threat Flags

None. The threat register's mitigations are all in place: T-i9g-01 (build refuses every other form, pinned by the refusal tests), T-i9g-02 (schema bounds and the shot-layer guard, pinned by schema and render tests), T-i9g-03 (the router passes a tuple, never the shooter id; the "never stores the shooter's id or the hull key" test is green), T-i9g-04 (guarded-path diff and the acceptance run).

## Seeing the fix by hand

Open `/?test=1&traffic=1`, then run `window.__wegolite.test.spawnTestAttacker()` in the console. The Viper attacker's beams are magenta; your own beam stays yellow (beam laser) or the colour of your fitted laser.

## Commits

- df27cca: `fix(quick-261119-i9g): draw NPC laser shots in the ship's authored laser_color` (single code commit; the SUMMARY and STATE are left to the orchestrator's docs commit)

## Self-Check: PASSED

Created and modified files exist, commit df27cca is an ancestor of HEAD, verify-full and the acceptance run both ran against snapshot df27cca with exit 0.
