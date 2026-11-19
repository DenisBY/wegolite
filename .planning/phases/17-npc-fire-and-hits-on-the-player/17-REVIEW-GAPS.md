---
phase: 17-npc-fire-and-hits-on-the-player
reviewed: 2026-11-19T10:05:26Z
depth: standard
scope: gap-closure plans 17-11, 17-12, 17-13 (commits a446957, 606e145, deef32a, 124c27e)
files_reviewed: 25
files_reviewed_list:
  - src/sim/npc/fire.ts
  - src/app/probe.ts
  - src/app/session/probe-publisher.ts
  - src/main.ts
  - tests/e2e/combat.spec.ts
  - tests/app/session/tick-parity.test.ts
  - tests/app/session/probe-publisher.test.ts
  - tests/app/probe-shape-compare.test.ts
  - tests/fixtures/probe-shape.json
  - tests/oracles/npc/fire/derive.ts
  - tests/oracles/npc/fire/fire.self.test.ts
  - tests/oracles/npc/fire/fixtures/gate.json
  - tests/oracles/npc/fire/fixtures/heat.json
  - tests/oracles/npc/frame-rate-rule.json
  - tests/sim/npc/fire.oracle.test.ts
  - tests/sim/npc/fire.test.ts
  - tests/sim/npc/fire-cadence.test.ts
  - tests/sim/npc/fire-route.test.ts
  - tests/sim/npc/hot-weapon.test.ts
  - tests/sim/combat/npc-fire.test.ts
  - tests/sim/combat/npc-vs-npc.scenario.test.ts
  - tests/sim/ai/test-spawn.test.ts
  - tests/sim/world/kill.test.ts
  - tests/sim/world/world-cadence.test.ts
  - CHANGELOG.md
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
  necessity: 0
status: issues_found
---

# Phase 17: Code Review Report, gap closure (plans 17-11 to 17-13)

**Reviewed:** 2026-11-19T10:05:26Z
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

This is a supplementary review of the four gap-closure commits (G-17-1, G-17-4). It does not replace `17-REVIEW.md` or `17-REVIEW-DISPOSITION.md`.

## Summary

No blocker was found. The gap closure does what the two gaps asked for; the one warning is about how the new probe fields behave when the HUD is not drawing, and the info items are stale prose and test wording.

What was checked, and how:

- **Shot timer against Oolite.** `literalShotFrames` in `src/sim/npc/fire.ts:143-152` matches the source: `shot_time` is an `OOTimeDelta` (double, `ShipEntity.h:186`), `weapon_recharge_rate` is a `float` (`ShipEntity.h:345`), every update adds `delta_t` before the behaviours (`ShipEntity.m:2221`), the gate refuses on `[self shotTime] < weapon_recharge_rate` (`ShipEntity.m:9946`), and `resetShotTime` is called from the laser shot at `ShipEntity.m:10463`. The checkout is at `21978c37b`; `ShipEntity.m`, `ShipEntity.h` and `equipment.plist` have no diff against the pin `7437f22`, so the cited lines hold.
- **The counts.** Recomputed in the test container: pulse 60 (sum 0.5000000000000007), beam and military 13 (sum 0.10833333333333332), mining 301 (sum 2.508333333333327), unarmed 12000. Mining is 301 only because the sum is accumulated; `k / 120` would give 300. Oolite accumulates, so 301 is the literal count.
- **Player cadence.** Untouched. The `src` diff of the range is four files (`fire.ts`, `probe.ts`, `probe-publisher.ts`, `main.ts`); `src/sim/combat/constants.ts` and `weapons.ts:51` still use the player's `rechargeTicks` with the strict `>`.
- **Module-load read of `LASER_STATS`.** New in this diff, and safe: `combat/constants.ts` imports only `ai/time.ts` and `math.ts`, so there is no import cycle back to `fire.ts`.
- **Probe gauges.** `hud.shieldFwd`, `hud.shieldAft` and `hud.energyBanks` come from `ctx.core.lastModel.bars`, the object passed to `currentHud.draw(model)` (`render-driver.ts:376-377`); `drawLeftGauges` and `drawRightGauges` draw those same fields with no condition (`draw.ts:853-869, 980`). The banks are copied, and the defaults are zeros in all three construction sites.
- **Oracle independence.** Holds. Nothing under `tests/oracles` imports from `src/` (its imports are `zod`, `vitest`, `node:*` and its own `schema.ts`), and nothing under `src/` imports the oracle.
- **Browser spec against the Node twin.** Every `TWIN_*` literal in `tests/e2e/combat.spec.ts` equals its counterpart in `tests/app/session/tick-parity.test.ts`, with the same 9-digit tolerance. The spec's `bankDial` and `shieldDial` agree with `HeadUpDisplay.m:1977-2041` and `dialForwardShield`.
- **Runs (Docker, this review).** The 15 changed Vitest files: 480 tests passed. `typecheck` and `lint`: clean. The browser spec and `verify` were not run here, as instructed; the summaries record remote passes at `124c27e`.

Necessity reference read; no necessity finding. No CI/CD file is in scope.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: The new HUD gauge probe values go stale when the HUD stops drawing, with nothing to tell a reader

**File:** `src/app/session/probe-publisher.ts:528-539` (source of the staleness: `src/app/session/render-driver.ts:349, 376-377`)
**Issue:** `hud.shieldFwd`, `hud.shieldAft` and `hud.energyBanks` are read from `ctx.core.lastModel`, which is assigned only inside `if (!hudHidden && draw)` and is never cleared (`context.ts:393` sets it once, at session creation). The session context and the HUD are created once per session (`game-session.ts:217`, `start-session.ts:585`), and `Hud.drawn` latches true after the first draw (`hud.ts:168`, reset only in `dispose`). So after a flight, while docked with the HUD canvas hidden, or after an in-session Load or New Game, the probe still publishes the last in-flight gauge values next to `hud.drawn: true`, while `probe.combat` is live. The documented default in `probe.ts:82-93` ("0 before a HUD frame") is true only before the first frame of the session.

A second, narrower path: `ctx.core.lastModel = model` runs even when `Hud.draw` returned early without drawing (`hud.ts:165`, a 0x0 backing store).

This does not affect the current spec, which reads the gauges in flight after two drawn frames. It is a risk for the next spec that reads them after a dock or a Load: it would compare against values the HUD is no longer drawing. The sibling fields `fuel`, `fuelText`, `compass` and `contacts` follow the same convention, so this is an inherited pattern that the diff extends to combat values. Established by reading the code; not reproduced with a test.
**Fix:** Clear the model when the HUD is hidden, so the probe falls back to its documented defaults:

```ts
// render-driver.ts, where hudHidden is computed
if (hudHidden) ctx.core.lastModel = undefined;
```

`showHint` reads `hintGauges(ctx.core.lastModel?.bars)` and already falls back to `CALM_HINT_GAUGES` on `undefined`, so check that hint behaviour while docked is what you want. If the stale-while-hidden reading is intended, say so in the `probe.ts` field comments instead ("the last drawn frame; not reset on dock or Load").

## Info

### IN-01: Three gate fixtures still justify their expected values by the superseded rule

**File:** `tests/oracles/npc/fire/fixtures/gate.json:222, 251, 920`
**Issue:** Plan 17-11 re-derived the eight beam, mining and military timer fixtures, but the pulse and unarmed ones kept their old prose because their numbers did not move. `gate-timer-refuses-before-roll-range-and-aim` says "The recorded rule (D-07) turns it into `ticksSinceShot < round(fround(0.5) x 120) = 60`"; `gate-timer-exact-period-pulse-fires` says "`round(0.5 x 120) = 60` ticks ... (The literal Oolite frame count at 1/120 s is recorded in the frame-rate rule row, not here.)"; `gate-unarmed-timer-needs-the-100-second-period` says "`round(100 x 120) = 12000`". The rule in force is the literal count, and the parenthesis at line 251 is now false. The numbers are right (60 and 12000 under both rules); only the audit text contradicts `derive.ts:134-151` and the shot-timer row.
**Fix:** Rewrite the three `derivation` strings with the sums the row already records (59 steps 0.49166666666666736, 60 steps 0.5000000000000007; 11999 steps 99.99166666669231, 12000 steps 100.00000000002565) and drop the parenthesis.

### IN-02: Three first-shot bounds were moved from 12 to 13, but the shot period does not govern them

**File:** `tests/sim/ai/test-spawn.test.ts:310`, `tests/sim/world/kill.test.ts:702`, `tests/sim/combat/npc-fire.test.ts:404`
**Issue:** These bound the tick of a freshly spawned shooter's first shot by the beam period ("within 13 ticks of the spawn", `<= BEAM_PERIOD`). A new ship has `lastShotTick` 0 (`world.ts:576`), and the gate skips the timer for 0 (`fire.ts:242-247`), so the first shot comes on the first tick whose range roll passes. The period plays no part, and the first-shot tick is the same before and after the change. The amendment therefore loosened three bounds for no reason, and the comments now state a link that does not exist (`kill.test.ts:697-699`: "within the first 13 ticks (the beam period, D-07 revised)"). No assertion is wrong; the tests just say less than they claim.
**Fix:** Name the bound for what it is (a roll bound, for example `FIRST_SHOT_BOUND_TICKS`) and remove the reference to the period from the three comments, or pin the measured first-shot tick.

### IN-03: `literalShotFrames` answers silently where the oracle throws

**File:** `src/sim/npc/fire.ts:143-152`
**Issue:** For a rate the loop never reaches (`Infinity`, or any rate above about 8333 s) the port returns `MAX_SHOT_FRAMES` (1,000,000), and for `NaN` or a non-positive rate it returns 1, so a bad `rechargeRate` would become a ship that fires every tick, or almost never, with no error. The oracle's twin throws (`derive.ts:170`). Not reachable today: the only inputs are the four `LASER_STATS` rates and the literal 100, evaluated once at module load, and `constants.test.ts` pins the rates to `equipment.json`. The comment "Total for every finite positive rate" is accurate about returning, not about returning the right count.
**Fix:** Because this runs at module load and not in the tick, a throw is compatible with D-17. Either throw when the loop ends without opening or when the rate is not finite and positive, or state in the comment that an out-of-range rate is capped rather than counted.

### IN-04: The "equals the oracle" check compares two copies of one loop, and its second assertion repeats the first

**File:** `tests/sim/npc/fire.oracle.test.ts:440-449`
**Issue:** `fire.ts:143-152` is a line-for-line copy of the oracle's `literalShotFrames` (`derive.ts:164-171`), so this test cannot catch a misreading shared by both; it only catches the two drifting apart. The independent evidence for the counts is the hand-derived literals in `fire.test.ts:275-279` and `fire.self.test.ts:1341-1358`, which is enough. Separately, `rechargeTicks(weapon)` is defined as `literalShotFrames(rechargeRateF32(weapon))` (`derive.ts:149-151`), so the assertion at line 447 is the one at 444-446 again.
**Fix:** Drop line 447. Optionally say in the test title that it guards drift between port and oracle, and that the literals in `fire.test.ts` are the independent pin.

### IN-05: The spec's "stated here, not imported" shield rule carries a wrong Oolite citation copied from the code under test

**File:** `tests/e2e/combat.spec.ts:109`
**Issue:** The comment cites `dialForwardShield` at `PlayerEntity.m:4268-4276`. At the pin and in the checkout `dialForwardShield` is `PlayerEntity.m:4254-4261`; lines 4268-4276 are the tail of `dialAftShield` and `dialEnergy`. The same wrong range is in `src/sim/combat/shields.ts:188` (from plan 13-05), which is where the spec's wording came from. The rule the spec states (shield over maximum, clamped to 0..1) is correct against the real lines, so the assertion is sound; only the reference is wrong, in both places.
**Fix:** Change both citations to `PlayerEntity.m:4254-4261` (and `4263-4270` for the aft dial if it is cited).

---

_Reviewed: 2026-11-19T10:05:26Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
