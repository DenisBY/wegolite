---
phase: 21-roster-state-shape-and-seams
plan: 15
subsystem: sim-world-debris
tags: [debris, cargo-pods, velocity, re-pin, twin-hash, FOUND-20, CBT-11, D-01, D-03, D-04]
requires:
  - phase: 21-13
    provides: shipVelocity (drift plus forward x speed), the one total-velocity definition
  - phase: 21-14
    provides: resolvePodCargoKind, drawPodContents, DebrisContent.goods and .market (inputs not yet wired)
provides:
  - debris velocity base is shipVelocity(victim) for pods, plates and wrecks
  - TrafficExtras.commodities feeding DebrisContent.goods (start-session and the Node replay)
  - buildStepOptions adds the current system's first-generation market as DebrisContent.market (firstGenerationMarket)
  - the one Phase 21 re-pin of the kill twin (Node and browser)
affects: [21-16, 21-19, phase-24]
tech-stack:
  added: []
  patterns: [one shared builder for live session and Node replay, per-system memo keyed by content object, measured re-pin with a printed segment diff]
key-files:
  created: []
  modified:
    - src/sim/world/debris.ts
    - src/sim/economy/market.ts
    - src/app/session/traffic.ts
    - src/app/session/step-options.ts
    - src/app/session/start-session.ts
    - tests/sim/world/debris.test.ts
    - tests/sim/economy/market.test.ts
    - tests/app/session/traffic.test.ts
    - tests/app/session/step-options.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/helpers/tick-script.ts
    - tests/e2e/combat.spec.ts
    - FIDELITY.md
    - CHANGELOG.md
    - .planning/PROJECT.md
key-decisions:
  - "Pod market derivation lives in sim as firstGenerationMarket, not as a second generateMarket call in the session sources, so the economy-purity guard's 'exactly three producers' invariant holds untouched"
  - "The kill twin moves once: f6927215 to 14a8a453 (both pods gain pod:\"furs\",1); D-01 alone moves nothing because both twin shooters hold at speed 0"
status: complete
commits: 4
plan_head_before: bc3bf2f2ee681315ae8719e63f34bd85f7cbf244
plan_head_after: b9e75b5c889404510f2355a1a18eef057fdaa732
actuals:
  tokens: 37000
  tasks: 3
  commits: 4
requirements-completed: [FOUND-20]
---

# Phase 21 Plan 15: Debris total velocity and live pod contents Summary

**Cargo pods, alloy plates and wreckage now leave a dying ship with its total velocity (drift plus forward x speed) plus their kick, and a pod carries a commodity and an amount weighted by the system's first-generation market; the kill twin moved exactly once (`f6927215` to `14a8a453`), measured, and the owner-reserved pins held.**

## Tracer and task results

| Task | Commit | What it proved |
| ---- | ------ | -------------- |
| 1 (tracer) | `aa5e6723` | `releaseDebris` takes `shipVelocity(victim)` as the base of every pod, plate and wreck velocity (a total `debrisBaseVelocity` guards malformed victims); the guard test "debris velocity equals ship velocity plus kick" (drift (1,2,3), speed 300 gives base (1,2,-297)), a speed-0 control (drift-only, as Phase 16), a fast-check property (40 runs: drift within 3000, unit orientation, speed 0 to 1000) and the all-hulls oracle test now with speed 120 and a rotated orientation pass; no debris unit pin and no twin literal moved |
| 2 | `4b58e9da` | `TrafficExtras.commodities` becomes `DebrisContent.goods`; `buildStepOptions` adds `market` (stock per key of the system's first-generation market) once per system and content; live session and Node replay build equal `combat.debris` for Lave; the kill twin moved once and the browser twin equals it |
| 3 | `32b2c472` | FIDELITY row and excerpt E-197, E-78 rewritten, placement row now the total velocity, PROJECT.md Key Decisions debris row amended, CHANGELOG line |
| fix | `b9e75b5c` | the first remote `verify` (at `32b2c472`) failed `tests/guards/economy-purity.test.ts` (it counts `generateMarket(` producers in `src/app/session/`: 5, expected 3); the derivation moved to `firstGenerationMarket` in `src/sim/economy/market.ts` so the guard is untouched; second remote `verify` green |

## The velocity base (D-01, D-03)

`debrisBaseVelocity(victim)` calls `shipVelocity({ velocity, orientation, speed })` of plan 21-13 with each field checked (a non-object velocity or orientation, or a non-number speed counts as at rest), so release stays total on a malformed record. `scatter` (pods and plates) and the wreck velocity add their kick to that base and still pass through `clampDebrisVelocity`. The module comment that said "never its flight `speed`" is rewritten: Phase 21 D-01 supersedes Phase 16's drift-only base (`ShipEntity.m:11158-11166`). The draws are untouched: only the base of the sum changed.

## Goods and market wiring (CBT-11 pod clause, live half)

- `debrisContentFrom(catalogue, debris, commodities?)` sets `goods` (frozen copy, catalogue order) only when the catalogue is given; absent, no `goods` key (exactOptionalPropertyTypes). `start-session.ts` passes `loadedCommodities` into the same `trafficContent` call; `tests/helpers/tick-script.ts` passes the committed `commodities.json` parsed with the strict `CommoditySchema` (not `parseCommodities`, whose module uses `import.meta.glob` and would break the Playwright Node runner). `committedTrafficContent` is now exported so the test can pin live equals replay.
- `buildStepOptions` returns, when the debris content has `goods` and no `market`, a frozen copy with `market = firstGenerationMarket(system, goods).goods.map(({key, stock}) => ({key, quantity: stock}))`, memoised in a `WeakMap<DebrisContent, Map<systemId, DebrisContent>>` (same object for repeated calls). It is never the player-modified live market (RESEARCH A6); content without `goods`, or already carrying a `market`, passes through unchanged. `src/sim/combat/step.ts` and `src/app/session/sim-driver.ts` are unchanged.
- Lave's market stock is pinned in `tests/app/session/step-options.test.ts` as `16 15 20 19 28 15 37 0 10 27 0 47 58 11 21 9 0`, which equals the stock column of the committed `tests/golden/market/lave.json`.
- `tests/app/session/tick-parity.test.ts`'s own session builder now passes `commodities: catalogue` to `trafficContent`, as the boot does.

## The one re-pin (D-04, owner-sanctioned under the standing v2.4 approval)

| Pin | Old | New | File |
| --- | --- | --- | ---- |
| `HASH_60_AFTER_KILL` | `f6927215` | `14a8a453` | `tests/app/session/tick-parity.test.ts` |
| `TWIN_HASH_60_AFTER_KILL` | `f6927215` | `14a8a453` | `tests/e2e/combat.spec.ts` |

**Node equals the browser:** the remote `combat.spec.ts` (Chromium, GPU machine, `build:e2e`) passed both of its tests at `4b58e9da` and again at the final `b9e75b5c`, asserting `worldHash()` 60 ticks after the kill equals `14a8a453`, the same value the Node twin measures.

**Measured cause (the printed segment diff).** I printed `serializeWorldSection(world)` 60 ticks after the kill with the commodity catalogue withheld from the session builder (the "before", hash `f6927215`) and supplied (the "after", hash `14a8a453`), same code otherwise. `diff before after` over the 20 and 35 line world texts shows exactly two changed lines and nothing else:

```
< e114=cargo;CLASS_CARGO;"barrel";...;vel:-8.860394,-0.866424,5.410822
> e114=cargo;CLASS_CARGO;"barrel";...;vel:-8.860394,-0.866424,5.410822;pod:"furs",1
< e115=cargo;CLASS_CARGO;"barrel";...;vel:-1.200927,-0.778024,6.358194
> e115=cargo;CLASS_CARGO;"barrel";...;vel:-1.200927,-0.778024,6.358194;pod:"furs",1
```

Every position, orientation, velocity, `rng` line, the wrecks, the world header (`worldSeed`, `nextId`, `rng`, `aiDropped`) and every other entity are byte-identical, so the pod fork moves no other draw. The cargo shooter is gone from the world at that tick, so its `ck:` segment is not the cause (as the plan predicted). D-01 contributes nothing: the D-01 commit alone left `tick-parity`, the debris suites and the pins passing unchanged, because both twin shooters hold at speed 0 (`setDesiredSpeed(self, 0)`, spawned with `speed: 0`).

**Pins that held (the stop rule did not fire):** the damage twin `DAMAGE_HASH_60_AFTER_KILL` and `TWIN_DAMAGE_HASH_60_AFTER_KILL` (`5028fc8f`), `DEBRIS_AT_KILL` (2 pods, 0 plates, 2 wrecks), `ENTITIES_AT_KILL` (16), the inert epoch 1-20 pin and `inert-lave-epoch1.json`, `flight-hash-pins.json` and every debris unit golden (`git diff --name-only bc3bf2f2..HEAD` lists no file under `tests/golden`, and no thresholds or detectors). The debris unit pins did not move because every fixture victim was at speed 0 (the new `speed: 120` in the all-hulls oracle test is a new check, not a moved pin).

## FIDELITY, Key Decisions, CHANGELOG

- `FIDELITY.md`: new row "What fills a pod, live" with excerpt **E-197** (`Universe.m:3894-3912`, the scarce and `legal` weight rule), recording the release-time kind resolution (`resolvePodCargoKind`, the role mapping trader/shuttle plentiful, pirate pirate, anything else scarce legal), the scarce-legal fallback, the hook's fixture kind `TEST_SHOOTER_CARGO_KIND`, the first-generation market weights, and Oolite's `legal:YES` residual weight 1 for an odd-stock illegal good (`q &= 1`, `Universe.m:3902-3906`) ported as Oolite has it (hand-off from 21-14). E-78 is rewritten from "no commodity draw" to the port and its remaining divergence (drawn at release from a stateless fork, weighted by the first-generation market, pod role roll not taken). The placement row's "added to the victim's drift" is now the total velocity, `[self velocity]` (`ShipEntity.m:11158-11166`). `tests/contract/fidelity.test.ts` passes, including its verbatim mode against `git archive 7437f22 src` (9 of 9 with `OOLITE_SRC`).
- `.planning/PROJECT.md`: the debris Key Decisions row now says the kick is added to the victim's total velocity (Phase 21 D-01 and D-03, superseding Phase 16's drift-only base), and D16-01's "no commodity draw" is marked superseded by plans 21-14 and 21-15 with the `pod` fork, the release-time kind, the first-generation market and the one re-pin.
- `CHANGELOG.md` `[Unreleased]` `### Changed`: pods, plates and wreckage fly on with the destroyed ship's motion, and pods hold goods.

## Gate results

| Gate | Command | Result |
| ---- | ------- | ------ |
| Targeted | debris, debris-pod, debris-cadence, debris-cap, inert-isolation, flight-hash-pins, tick-parity, step-options, traffic (Docker) | all pass |
| Typecheck, lint | `docker compose run --rm typecheck` / `lint` | exit 0, Prettier clean (final tree) |
| Remote combat twin | `wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts"` | 2 passed at `4b58e9da` and at `b9e75b5c` |
| Remote verify | `wegolite-remote-run.sh run --rm verify` | first run at `32b2c472`: 1 failed (economy-purity, fixed in `b9e75b5c`); second run at `b9e75b5c`: exit 0, 28 e2e passed |
| Remote frozen run | `wegolite-remote-run.sh run --rm test npm run test:acceptance` | snapshot `b9e75b5c`: exit 0, **21 of 21 passed**, 86 s (this plan changes `src/sim/world/**`) |
| Local unit run | `docker compose run --rm test` | see "Local full run" below |

### Local full run

The first full run (at `32b2c472`, machine under load from other worktrees, 605 s) had 4 failures: `economy-purity` (real, fixed in `b9e75b5c`) and three 5 s load timeouts (`collision-buoy`, `kill.property` and one more) that pass when rerun alone, as in earlier waves; no timeout was changed. The rerun at the final tree `b9e75b5c` passed: **306 of 306 files, 8568 passed, 10 skipped**, 325 s.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The pod market derivation tripped the economy-purity guard**
- **Found during:** Task 3 (first remote `verify`)
- **Issue:** `tests/guards/economy-purity.test.ts` requires exactly three `generateMarket(` producers in `src/app/session/`; the plan's `buildStepOptions` call plus its doc comment made five.
- **Fix:** added `firstGenerationMarket(system, commodities)` in `src/sim/economy/market.ts` (`generateMarket` at `marketSeedForSystem(system.id)`, a read-only view never installed) and used it from `step-options.ts`; the guard is untouched. The `marketSeedForSystem` name stays in `step-options.ts` in its docs; the acceptance criterion `rg -c "marketSeedForSystem" src/app/session/step-options.ts` is met by the comment, the call itself lives in `market.ts`.
- **Files modified:** `src/sim/economy/market.ts`, `src/app/session/step-options.ts`, `tests/sim/economy/market.test.ts`
- **Commit:** `b9e75b5c`

**2. [Rule 3 - Blocking] The tick-parity session builder had to supply the goods**
- The kill twin only moves when its own `trafficContent` call gets `commodities` (the live boot does; the test builder is a copy of it). Added `commodities: catalogue` there; this is the input change the re-pin follows from.
- **Commit:** `4b58e9da`

**3. [Rule 1 - Bug] The old test "adds the victim's drift velocity, never its flight speed" asserted the superseded contract**
- Replaced by the D-01 guard, a speed-0 control and the property (Task 1); `killAndOracle` now feeds the oracle the total velocity, written from the C and not by calling `shipVelocity`.
- **Commit:** `aa5e6723`

Task 1's prettier drift in `debris.ts` (a long comment line) was formatted in the Task 2 commit. No Rule 4 question arose; no checkpoint was needed.

## Known Stubs

None. `DebrisContent.goods` and `.market` are now supplied by every live path (the session and the Node replay); a missing catalogue still yields anonymous pods by design (documented on the fields).

## Threat Flags

None. No new network, auth, file or schema surface. T-21-27 (pod contents depending on the live market) is mitigated by `firstGenerationMarket` and pinned by the live-equals-replay test and the "never of the live market or the profile" test; T-21-29 (a re-pin hiding an unintended move) by the printed segment diff above, the held pins, Node equals browser, and the comments naming 21-15.

## Hand-offs

- 21-16 / 21-19: nothing else in this plan moves a pin; `HASH_60_AFTER_KILL` and `TWIN_HASH_60_AFTER_KILL` are now `14a8a453` and must not move again in Phase 21.
- A new system's market for a pod draw is always `marketSeedForSystem(system.id)` stock, never `arrivalMarketSeed`'s: after a hyperspace jump the live market differs from the pod market by design (RESEARCH A6, FIDELITY E-197 row).

## Self-Check: PASSED

- Files exist: `src/sim/world/debris.ts` (`shipVelocity` present, "never its flight `speed`" absent), `src/sim/economy/market.ts` (`firstGenerationMarket`), `src/app/session/step-options.ts`, `src/app/session/traffic.ts`, `tests/helpers/tick-script.ts`, FIDELITY E-197.
- Commits exist in HEAD: `aa5e6723`, `4b58e9da`, `32b2c472`, `b9e75b5c`.
- `HASH_60_AFTER_KILL = "f6927215"` is gone from both twin files; `"5028fc8f"` appears once in each; `21-15` appears in both; `rg -c "added to the victim's drift" FIDELITY.md` is 0; `resolvePodCargoKind` appears in FIDELITY.md.
