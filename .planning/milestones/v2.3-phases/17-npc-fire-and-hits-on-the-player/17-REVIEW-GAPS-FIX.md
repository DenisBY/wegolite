---
phase: 17
fixed_at: 2026-11-19T11:12:00Z
review_path: .planning/phases/17-npc-fire-and-hits-on-the-player/17-REVIEW-GAPS.md
iteration: 2
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 17: Code Review Fix Report (gap closure)

**Fixed at:** 2026-11-19
**Source review:** .planning/phases/17-npc-fire-and-hits-on-the-player/17-REVIEW-GAPS.md
**Iteration:** 2 (iteration 1 fixed WR-01 with `fix_scope: critical_warning`; iteration 2 fixed the five Info findings with `fix_scope: all`)

**Summary:**
- Findings in scope: 6 (WR-01, IN-01 to IN-05)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### WR-01: The new HUD gauge probe values go stale when the HUD stops drawing, with nothing to tell a reader

**Files modified:** `src/app/probe.ts`
**Commit:** 2d22118 (iteration 1)
**Applied fix:** Documented semantics (the review's second option), per the orchestrator decision. `ctx.core.lastModel` is deliberately NOT cleared in `render-driver.ts`, because that would also reset `messageRows`, `contacts`, `compass`, `aegis`, `message` and the first-use hint gauges while docked. The field comments for `fuelText`, `fuel`, `shieldFwd`, `shieldAft` and `energyBanks` in `WegoliteHudProbe` now state that the values come from the last drawn HUD frame of the session, are 0/empty only before the session's first HUD frame, and are not reset when the HUD is hidden (docked), on a Load or on New Game. A reader needing live values must read them in flight after a drawn frame, or read `probe.combat`. No CHANGELOG entry (internal comment only).

### IN-01: Three gate fixtures still justify their expected values by the superseded rule

**Files modified:** `tests/oracles/npc/fire/fixtures/gate.json`
**Commit:** a7c58d6
**Applied fix:** The `derivation` strings of `gate-timer-refuses-before-roll-range-and-aim`, `gate-timer-exact-period-pulse-fires` and `gate-unarmed-timer-needs-the-100-second-period` now derive 60 and 12000 by the literal frame count, with the sums the shot-timer row records (59 steps 0.49166666666666736, 60 steps 0.5000000000000007; 11999 steps 99.99166666669231, 12000 steps 100.00000000002565). The false parenthesis ("The literal Oolite frame count ... is recorded in the frame-rate rule row, not here") is gone. Since the prose now cites the per-update add, `src/Core/Entities/ShipEntity.m:2221-2221` was added to the three fixtures' `oolite` arrays, matching the beam fixtures re-derived in plan 17-11. No `input` or `expected` value changed. The oracle stays independent of `src/`.

### IN-02: Three first-shot bounds were moved from 12 to 13, but the shot period does not govern them

**Files modified:** `tests/sim/ai/test-spawn.test.ts`, `tests/sim/world/kill.test.ts`, `tests/sim/combat/npc-fire.test.ts`
**Commit:** 821b264
**Applied fix:** Claim checked against the source: `spawnEntity` sets `weapon.lastShotTick` to 0 (`src/sim/world/world.ts:576`) and the gate skips the timer when `lastShotTick` is 0 (`src/sim/npc/fire.ts`, the `timer` clause), so the first shot comes on the first tick whose range roll passes. Each file now has a module-level `FIRST_SHOT_BOUND_TICKS = 13`, with a comment that it is a roll bound and that the beam period plays no part. The first-shot loops (test-spawn, kill) and the first-shot assertion (npc-fire) use it, and the comments and the npc-fire test title ("fires within one period") no longer tie it to the period. The bound value was kept at 13 (not measured); no assertion was weakened. The npc-fire spacing assertions still use `BEAM_PERIOD`, which is the right constant there.

### IN-03: `literalShotFrames` answers silently where the oracle throws

**Files modified:** `src/sim/npc/fire.ts`
**Commit:** 8de92d5
**Applied fix:** `literalShotFrames` now throws when `Math.fround(rate)` is not finite and positive (it used to return 1), and when the loop ends without the gate opening (it used to return `MAX_SHOT_FRAMES`). Verified that it runs only at module load: its only call sites are the frozen `NPC_RECHARGE_TICKS` table (the four `LASER_STATS` rates) and `UNARMED_RECHARGE_TICKS` (100 s); `npcRechargeTicks` reads those constants. The "Total for every finite positive rate" sentence is replaced by a domain statement (finite float32 rate above 0, count below `MAX_SHOT_FRAMES`, so a rate below about 8333 s) and the reason the throw is compatible with D-17 (not on the tick path; a bad rate fails the module import). The file header's D-17 gloss now reads "every function on the tick path total". `literalShotFrames` is not exported, so, as directed, no unit test was added and it was not exported for one. Sim purity holds (no DOM or Three.js). No reachable input changes: pulse 60, beam 13, mining 301, military 13 and unarmed 12000 are unchanged (pinned by `tests/sim/npc/fire.test.ts`, which passed).

### IN-04: The "equals the oracle" check compares two copies of one loop, and its second assertion repeats the first

**Files modified:** `tests/sim/npc/fire.oracle.test.ts`
**Commit:** 3ddbbc7
**Applied fix:** Claim checked: `rechargeTicks(weapon)` is `literalShotFrames(rechargeRateF32(weapon))` in `tests/oracles/npc/fire/derive.ts`. The repeated `rechargeTicks` assertion and its now-unused import are removed. The test title is now "npcRechargeTicks(%s) has not drifted from the oracle's literal frame count", and a comment says that the port's loop is a copy of the oracle's, so the test catches drift and not a shared misreading, and that the independent pin is the hand-derived literals in `tests/sim/npc/fire.test.ts`.

### IN-05: The spec's "stated here, not imported" shield rule carries a wrong Oolite citation copied from the code under test

**Files modified:** `src/sim/combat/shields.ts`, `tests/e2e/combat.spec.ts`
**Commit:** 933b7d7
**Applied fix:** Verified in `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m` (checkout `21978c37b`, no diff against the pin `7437f22` for that file): `dialForwardShield` is 4254-4261, `dialAftShield` 4263-4270. `shields.ts` (`shieldGauge`, used for both banks by `hud-model.ts:266-267`) now cites both dials; the combat spec's `shieldDial` is used only for the forward shield and cites `dialForwardShield` at 4254-4261. Comment-only.

## Verification

All gates ran in the main checkout (`workflow.use_worktrees` is false), so no worktree was created and the results are reproducible from the tree as committed (HEAD `933b7d7`).

- Per fix: re-read of each edited section; `JSON.parse` of `gate.json`; the four sums recomputed; prettier and eslint on each changed file; targeted Vitest runs after IN-01 (fire oracle self-test, 66 passed), IN-02 (the three files, 111 passed), IN-03 (`tests/sim/npc/`, 31 files, 1031 passed) and IN-04 (`fire.oracle.test.ts`, 92 passed).
- Final, after all fixes: `docker compose run --rm lint` (eslint and `prettier --check .`) clean; `docker compose run --rm typecheck` (both tsconfigs) clean; `docker compose run --rm test npx vitest run tests/sim/npc/ tests/oracles/npc/fire/ tests/sim/ai/test-spawn.test.ts tests/sim/world/kill.test.ts tests/sim/combat/`: 49 files, 1471 tests passed. `tests/sim/combat/` was included because `src/sim/combat/step.ts` imports `fire.ts` and `shields.ts` was touched; it contains `npc-fire.test.ts`.
- Not run, as instructed: `verify`, `verify-full` and browser tests (the spec change is comment-only).
- Open: IN-03 changes `src/sim/npc/fire.ts`, so the standing D-17 / AGENTS.md rule asks for the 20-seed acceptance run (`npm run test:acceptance`) by hand on the remote test machine, with the result recorded. It was not run here. The change cannot alter behaviour (the throw branches are unreachable for the five module-load inputs, whose counts are pinned and passed), but the rerun is the orchestrator's call.

No CHANGELOG entries (nothing user-visible).

---

_Fixed: 2026-11-19_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_

## NPC acceptance run (IN-03 touched `src/sim/npc/fire.ts`)

`npm run test:acceptance` on the remote test machine at `7e7e7a6`: 1 file, 21 tests passed (20 seed epochs plus the summary), 75 s, exit 0.
