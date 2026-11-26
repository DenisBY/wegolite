---
phase: 21-roster-state-shape-and-seams
plan: 14
subsystem: sim-world-debris
tags: [debris, cargo-pods, rng-fork, tripwire, FOUND-20, CBT-11]
requires:
  - phase: 21-03
    provides: podCommodity and podAmount entity fields, CARGO_KINDS, the stateless pod RNG purpose
  - phase: 21-12
    provides: per-facing fire (no dependency in code; wave order only)
provides:
  - resolvePodCargoKind, drawPodContents, PodMarketEntry, PodContents
  - DebrisContent.goods and DebrisContent.market (optional; pods anonymous without them)
  - TEST_SHOOTER_CARGO_KIND for the ?test=1 cargo shooter
  - tests/guards/pod-kind-fallback.test.ts and the Phase 22 todo
affects: [21-15, phase-22, phase-24]
tech-stack:
  added: []
  patterns: [stateless RNG fork per release, release-time resolution instead of stored state, source-text tripwire with synthetic cases]
key-files:
  created:
    - tests/sim/world/debris-pod.test.ts
    - tests/guards/pod-kind-fallback.test.ts
    - .planning/todos/pending/2026-11-25-pod-kind-live-populator.md
  modified:
    - src/sim/world/debris.ts
    - src/sim/ai/test-spawn.ts
    - tests/sim/ai/test-spawn.test.ts
key-decisions:
  - "Legal kinds keep Oolite's q&1 residual weight for export-illegal goods; the plan's 'never picks an illegal good' is true only for even stock (ported as written, see Deviations)"
  - "spawnTestShooter names the kind only for cargo above 0; an explicit cargo 0 stays the same entity as no argument"
status: complete
commits: 4
plan_head_before: b09275fd620a59fcd76b86b0c1081be5bf689358
plan_head_after: b684330dfb64aefacd6ac5605eb63dc7246b2849
actuals:
  tokens: 13600
  tasks: 2
  commits: 4
requirements-completed: [FOUND-20]
---

# Phase 21 Plan 14: Pod contents from the pod fork Summary

**A destroyed ship's cargo pods can now carry an Oolite-distributed commodity and amount drawn from the victim's own stateless `pod` fork, with the cargo kind resolved at release and every combat-stream draw proven unchanged; no live input is wired, so no pin moved.**

## Tracer and task results

| Task | Commit | What it proved |
| ---- | ------ | -------------- |
| 1 (tracer) | `f151f372` | `releaseDebris` collects every survivor's 13 draws first, then draws the contents once from `createRngState(forkSeed(world.worldSeed, victim.id, "pod"))` through `drawPodContents` and spawns each pod with `podCommodity` and `podAmount`; with or without `goods` and `market` every entity position, orientation, velocity, wreck, plate, `nextId` and the victim's final `combat` stream are identical (24 seeds); the `pod:` segment prints |
| 1 (lint fix) | `ee1ca855` | one unnecessary type assertion in the totality property |
| 2 | `348d0818` | `TEST_SHOOTER_CARGO_KIND`, the fallback tripwire with synthetic cases, the Phase 22 todo, remote 21 of 21 |
| docs | `b684330d` | corrected the Oolite line citations in the doc comments (comment-only; the remote run was taken at `348d0818`) |

## Kind resolution and the draw port, with citations

Oolite at pin `7437f22`:

- `resolvePodCargoKind(victim)`: an explicit `cargoKind` 1 to 6 wins; otherwise by role (matched by `===` and a `<family>-` prefix, never an object lookup): trader and shuttle families give `plentiful`, the pirate family gives `pirate`, anything else (the inert ships' pristine "" included) gives `scarce`. An invalid stored kind (NaN, negative, fractional, above 6, Infinity) falls back by role.
- `drawPodContents(kind, rng, goods, market, count)` ports `getContainersOfGoods` (`Universe.m:3894-3940`) and `getRandomAmountOfCommodity` (`Universe.m:3977-3996`), with the kind to rule mapping of `setCargoFlag:` (`ShipEntity.m:7347-7365`): plentiful is `scarce:NO legal:YES` (7350), scarce `scarce:YES legal:YES` (7353), contraband and pirate `scarce:YES legal:NO` (7359, 7362; the pirate's pod count `Ranrot() % (1 + num/2)` belongs to the caller, which counts survivors), medical is Narcotics with no commodity draw (7356).
  - Weights in integer arithmetic: scarce `q < 64 ? 64 - q : 0` (`3896-3901`), legal-only `q &= 1` for an export-illegal good (`3902-3906`), `q = min(q, 64)`, `q * 100 / 64` truncated (`3907-3910`).
  - Selection: `qr = 1 + (Ranrot() % total)`, first good whose running weight reaches `qr` (`3916-3926`); every pod's commodity first in capsule order, then every pod's amount (`cargoPodFromTemplate`, `3863-3873`).
  - Amounts: tonnes 1, kilograms `1 + r%6 + r%6 + r%6`, grams `4 + r%16 + r%11 + r%6`, an unknown unit 1 (`3987-3994`); `Ranrot() % N` is `floor(u * N)` as everywhere in the repo.
- The all-zero edge, ported as written (`Universe.m:3916-3919`): `NSUInteger co_type = 0; ... if (total_quantity) { qr = 1 + (Ranrot() % total_quantity); ... }`. With every weight 0 there is no draw and the commodity is the first good (index 0). Pinned by a test: the first good, and the stream state unchanged for a tonnes good.
- `uniform` needs the hull's `cargo_carried`, which no per-ship value holds, and medical with no `narcotics` good has nothing to draw: both take the scarce-legal rule, as an unknown role does (documented in the function; unreachable with the compiled catalogue, which has `narcotics`).

## The `DebrisContent` interface decision

`goods?: readonly Commodity[]` (the compiled records, type import from `src/content/types.ts` as `src/sim/economy/market.ts` does) and `market?: readonly PodMarketEntry[]` (`{ key, quantity }`, the current system's first-generation quantities, set per system by plan 21-15's one builder, never the live player-modified market, RESEARCH A6). `src/sim/combat/step.ts` `debrisContext` and `src/app/session/sim-driver.ts` are untouched. With either absent, or with no pod surviving, or with a victim id outside the fork domain, pods stay anonymous exactly as before and nothing is drawn from the fork.

## Independence and totality evidence

- Independence (T-21-28): `tests/sim/world/debris-pod.test.ts` compares every live entity (with the pod fields stripped), the victim's final `combat` stream and `nextId` over 24 seeds, with and without contents; the vacuity floor requires more than 20 pods and at least one wreck or plate across the run. `POD_DRAWS_PER_SURVIVOR` is still 13. All existing debris tests (`debris`, `debris-cadence`, `debris-cap`) and `tick-parity` pass unchanged.
- The released pods' contents equal an oracle `drawPodContents(...)` over the same fork seed, and the `pod:"<commodity>",<amount>` segment prints on each pod. A victim with cargo 0 releases nothing and `drawPodContents(..., 0)` leaves the stream untouched.
- The distribution is checked against an independent oracle written from the C (`oracleWeights`, the `qr` walk) over a fixed market for plentiful and scarce, and the kilogram and gram amounts against an oracle that draws left to right.
- Totality (T-21-36): two fast-check properties (500 runs each). `resolvePodCargoKind` over arbitrary roles (any string, `constructor`, null, numbers) and kinds (NaN, negative, fractional, Infinity, out of range) always returns an integer 1 to 6 and the stored kind when it is valid. `drawPodContents` over arbitrary goods (non-objects, bad keys, any unit, any legality), markets (null entries, NaN, negative, missing, Infinity quantities) and counts (NaN, negative, fractional, 1e9) never throws, returns at most `max(0, floor(count))` capped at `MAX_ENTITY_CARGO` entries, each commodity a key of a goods record with an integer amount in its unit's range and within `MAX_POD_AMOUNT`, nothing for an empty goods list, and is a pure function of its inputs and the seed.

## The hook kind, the tripwire and the todo

- `TEST_SHOOTER_CARGO_KIND` (`CARGO_KINDS.indexOf("plentiful")`, fixture data per decision 3) is passed with `cargo` when it is above 0. Without `cargo`, and with an explicit 0, the spawn is unchanged (no `cargoKind`, no `ck:` segment).
- `tests/guards/pod-kind-fallback.test.ts` scans comment-stripped `src/sim/**`: every `spawnEntity(...)` call and every `SpawnInit = {...}` literal with a `cargo` member must also name `cargoKind`, except `src/sim/world/populate.ts` (the frozen inert path). It passes on the tree, has a vacuity floor (the inert path and `test-spawn.ts` are both found spawning with cargo), checks the todo exists with `resolves_phase: 22`, and fails on synthetic inputs (a new `populate-system.ts`, a shorthand `{ cargo }`, a typed `SpawnInit` literal) while passing the allow-listed path, a spawn naming both, prose and a `cargo ===` comparison.
- `.planning/todos/pending/2026-11-25-pod-kind-live-populator.md` (`resolves_phase: 22`) asks Phase 22's populator to add a runtime test that no ship it places has `cargo` above 0 with `cargoKind` 0 and not to widen the guard's allow-list.

## Unchanged pins

`git diff --name-only b09275fd..HEAD -- tests/golden tests/app/session/tick-parity.test.ts tests/e2e/combat.spec.ts` prints nothing. The epoch 1-20 golden, the twin literals, the debris goldens and `flight-hash-pins.json` hold (`inert-isolation`, `tick-parity` and the debris suites pass unchanged). The cargo shooter's `ck:` segment cannot reach the kill twin because the shooter is removed at the commit and is not in the world 60 ticks after the kill.

## Gate results

| Gate | Command | Result |
| ---- | ------- | ------ |
| Targeted (Task 1) | `test npx vitest run` over `debris-pod`, `debris`, `debris-cadence`, `debris-cap`, `tick-parity` | 5 files, 142 tests passed |
| Targeted (Task 2) | `test npx vitest run` over `test-spawn`, `pod-kind-fallback`, `tick-parity`, `inert-isolation` | 4 files, 110 tests passed |
| Unit and integration | `docker compose run --rm test` | 304 of 306 files passed; the two failures were load timeouts (below); rerun alone both pass |
| Typecheck | `docker compose run --rm typecheck` | exit 0 |
| Lint | `docker compose run --rm lint` | 0 problems, Prettier clean (also after the citation edit) |
| Remote frozen run | `wegolite-remote-run.sh run --rm test npm run test:acceptance` | exit 0, 21 of 21, snapshot `348d0818` |

The two full-run failures were `tests/guards/tools-determinism.test.ts` (its 30 s lint probe timed out) and `tests/sim/combat/kill.property.test.ts` > "releaseDebris never throws..." (5 s limit; 2.0 s alone), both while other worktrees ran containers (the known sporadic load timeout). Rerun alone they passed (`tools-determinism` 5 of 5, `kill.property` 4 of 4 with `sim-determinism-bans`); no timeout was changed.

## Remote frozen run

`~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` on the remote test machine, snapshot `348d0818` (this plan changes `src/sim/world/**`): exit 0, **21 of 21 passed** (20 epochs plus the run-minimums test), 86 s. Every epoch reports `stuck 0`, `frozen 0`, `frustration 0`, `stationSphere 0`, `hullCrossingsUnexcused 0`, `repairs 0`, `aiFaulted 0`, `aiDropped 0`, `hashFailures 0`. Run totals identical to 21-03's: `stationArrivals` 40, `interceptArrivals` 40, `fleeArrivals` 40, `avoidCollisionEntries` 23, `attackTicksNearPlayer` 61,662, `stuckWindowsEvaluated` 175, `frozenWindowsEvaluated` 293. Thresholds and detectors untouched. The one later commit (`b684330d`) changed comments only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's "legal kinds never pick an export-illegal good" is stricter than Oolite**
- **Found during:** Task 1
- **Issue:** `getContainersOfGoods` applies `q &= 1` to an export-illegal good under `legal:YES` (`Universe.m:3902-3906`, "keep a very small chance, sometimes"), so an odd stock keeps weight 1 (`1 * 100 / 64`). The truth statement and a behaviour bullet say never.
- **Fix:** ported as written (the plan's own Edge truth says "ported as written" and the fidelity rule makes Oolite the default). A legal draw never picks an illegal good of even stock; an odd stock keeps its residual weight. Both are pinned by tests. No FIDELITY row is needed (no divergence); plan 21-15's row for the live wiring should quote the `q &= 1` behaviour.
- **Files modified:** `src/sim/world/debris.ts`, `tests/sim/world/debris-pod.test.ts`
- **Commit:** `f151f372`

**2. [Rule 1 - Bug] An explicit `cargo` 0 must not store a kind**
- **Found during:** Task 2
- **Issue:** "pass `cargoKind` whenever `cargo` is given" would give `spawnTestShooter(..., 0)` a `ck:` segment and break the existing invariant that an explicit 0 is the same entity as no argument (`tests/sim/ai/test-spawn.test.ts`). A cargo 0 ship releases no pod, so the kind is moot.
- **Fix:** the kind is passed for `cargo` above 0 only; a new test pins both cases.
- **Files modified:** `src/sim/ai/test-spawn.ts`, `tests/sim/ai/test-spawn.test.ts`
- **Commit:** `348d0818`

**3. [Rule 3 - Blocking] A lint error in the new test**
- `@typescript-eslint/no-unnecessary-type-assertion` on `o.unit as string | undefined`; removed. **Commit:** `ee1ca855`.

No other deviation; no pin moved; no Rule 4 question arose.

## Known Stubs

None. `DebrisContent.goods` and `.market` are intentionally unset in every live path until plan 21-15 supplies them (documented on the fields; pods stay anonymous exactly as before).

## Threat Flags

None. No new network, auth, file or schema surface; the new inputs are optional content fields, and every new function is total on malformed input (T-21-36, covered by the properties).

## Self-Check: PASSED

- Files exist: `src/sim/world/debris.ts` (`resolvePodCargoKind`, `drawPodContents` exported once each, `"pod"` fork present), `tests/sim/world/debris-pod.test.ts` (2 `fc.assert` properties), `tests/guards/pod-kind-fallback.test.ts`, `.planning/todos/pending/2026-11-25-pod-kind-live-populator.md` (`resolves_phase: 22` once).
- Commits exist in HEAD: `f151f372`, `ee1ca855`, `348d0818`, `b684330d`.
- `TEST_SHOOTER_CARGO_KIND` appears 3 times in `src/sim/ai/test-spawn.ts`.
- No file under `tests/golden`, `tests/app/session/tick-parity.test.ts` or `tests/e2e/combat.spec.ts` changed.
