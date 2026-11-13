---
phase: 05-docked-economy-station-screens
plan: 02
subsystem: docked economy
tags: [economy, trade, sell, pods, capacity, market, determinism, fixtures]
requires:
  - 05-01 market generator, buy path, cargo pods and persisted marketSeed
provides:
  - planSell/applySell and the complete refusal/clamp model
  - the exact kg/g capacity rule (`otherPodsFor`, `maxAdditional`)
  - sequential stock -> affordability -> hold clamps with the last strict reason
  - safe-integer sell proceeds with an `overflow` refusal
  - session Left/Right/Shift trading for both directions
  - three REGRESSION market snapshots plus independent reference vectors
  - determinism and economy-only proofs
affects:
  - 05-03 (equipment transactions reuse the same plan/apply and notice shape)
  - 05-04 (view models read side, clamp and reason from TradePlan)
  - 05-05 (F8 sell keys, copy and the full keyboard proof)
  - 05-06 (phase gate re-runs these suites)
tech-stack:
  added: []
  patterns:
    - one pure plan re-run by every apply before money moves
    - sequential clamps that report the last strict reduction
    - implementation-generated regression fixtures separated from independent oracle vectors
key-files:
  created:
    - tests/golden/market/lave.json
    - tests/golden/market/zaonce.json
    - tests/golden/market/leesti.json
    - tests/helpers/write-market-goldens.ts
    - tests/sim/economy/determinism.test.ts
    - tests/sim/economy/reference-vectors.test.ts
  modified:
    - src/sim/economy/trade.ts
    - src/sim/economy/cargo.ts
    - src/app/game-session.ts
    - src/ui/station-model.ts
    - tests/sim/economy/trade.test.ts
    - tests/sim/economy/cargo.test.ts
    - tests/sim/economy/market.test.ts
    - .planning/PROJECT.md
decisions:
  - Selling mirrors buying at the same price; the limit is min(held, 127 - stock) and a sale never moves a price.
  - planSell refuses `overflow` before adding proceeds when credits + cost leaves the safe-integer domain.
  - Clamps are applied stock -> affordability -> hold and `clamp` reports the last step that strictly reduced the amount.
  - A zero-stock row the hold carries stays selectable, or Computers could never be sold at Lave.
  - `maxAdditional` counts the pod the held good already occupies; `alreadyHeld` is never subtracted from availablePods * P.
  - Regression goldens come only from the writer; the correctness oracle is the hand-derived reference-vectors suite.
metrics:
  duration: 9 min
  completed: 2026-11-06
status: complete
actuals:
  tokens: 19843
  tasks: 2
  commits: 2
plan_head_before: 1382dc9a09376ab174e9a7912fcc46807869d853
plan_head_after: 1caaa46a843dceb4a26a366b697455a701c289cf
---

# Phase 5 Plan 2: Sell, the Exact kg/g Hold Rule and an Independent Market Oracle Summary

Turns the wave-1 buy path into the full trading contract — selling at the same
price, sequential clamps with the binding reason, the exact pod rule for a
partially filled hold, and an `overflow` guard — then pins the economy formula
with three implementation-generated regression snapshots plus hand-derived
reference vectors the generator cannot bless.

## What Was Built

### Trade model (`src/sim/economy/trade.ts`)

- `TradeRefusal` is now `invalidPrice | zeroAmount | unknownCommodity |
  notTradeable | nothingToSell | marketFull | noStock | insufficientCredits |
  holdFull | overflow`. `invalidAmount` folded into `zeroAmount` and `noSpace`
  became `holdFull`; `unknownCommodity` is retained from wave 1 (see deviations).
- `planBuy` keeps the pinned seven-field `TradePlan` and now clamps in one pass:
  stock, then affordability, then hold, so `clamp` is the **last** limit that
  strictly reduced the request. Every price/amount is validated as a positive
  safe integer before any division or multiplication.
- `planSell` is the mirror: `min(held, 127 - stock)`, `nothingToSell` for an
  empty hold, `marketFull` at the 127 cap (including kg/g), and `overflow` when
  `credits + price * amount` would leave the safe-integer domain.
- `applyBuy`/`applySell` re-run the plan, refuse any mismatch with `undefined`
  and leave the profile object untouched; only an approved plan moves credits
  and cargo. `applySell` deletes a zero cargo entry and never changes a price.
- `BuyApply`/`SellApply` are aliases of one shared `TradeApply` shape.

### Cargo and pod accounting (`src/sim/economy/cargo.ts`)

- `otherPodsFor(cargo, units, exceptKey)` sums `podsFor` over every other entry;
  `holdPodsUsed` and it share one private `sumPods`.
- `maxAdditional` keeps `max(0, (capacityPods - otherPods + 1) * P -
  (P - safe - 1) - alreadyHeld - 1)` and its doc now states why the held good's
  own pod is counted: 19 t + 600 kg leaves 899 kg, 1,499 kg leaves 19,000 kg,
  an empty 20-pod hold takes 20,499 kg, a hold full of other cargo takes 499 kg.

### Session (`src/app/game-session.ts`)

- `tradeRequest`/`planFor` serve both sides; Right grows a buy and shrinks a
  sell, Left grows a sell and shrinks a buy, and reaching zero clears the
  pending trade silently (never a `zeroAmount` notice).
- `stationBuyMax`/`stationSellMax` plan the feasible maximum and strip `clamp`
  when feasible > 0; a zero-feasible max leaves `pending = null` and states the
  refusal in the notice.
- `confirmTrade` dispatches to `applyBuy`/`applySell`, then commits and
  autosaves exactly as wave 1 did.
- `ensureSelection`/`selectableKeys` now accept a zero-stock row the hold
  carries, so the canonical run (buy Computers at Zaonce, sell them at a Lave
  with zero stock) is reachable; `buildMarketModel`'s `selectable` flag agrees.
- Notice copy covers `holdFull`, `marketFull`, `nothingToSell` and `overflow`.

### Fixtures and proofs (`tests/`)

- `tests/helpers/write-market-goldens.ts` writes `tests/golden/market/
  {lave,zaonce,leesti}.json` as `{version, systemId, marketSeed, goods}` from
  the real `generateMarket` and `marketSeedForSystem`.
- `tests/sim/economy/reference-vectors.test.ts` is the oracle: stock 126/127/128
  -> 126/127/127, the 127 cap, a 42957 price above 127, the negative price and
  quantity floors, the float32 grouping that yields exactly 7, and Narcotics'
  exactly-zero bias at economy 0 (price 512 / stock 32).
- `tests/sim/economy/determinism.test.ts` proves same-seed equality, seed
  variation and that every non-economy field (name, government, tech level,
  population, productivity, radius, text) leaves the market byte-identical.
- `tests/sim/economy/market.test.ts` compares each fixture exactly, asserts the
  fixture seed equals `marketSeedForSystem`, the 17-row sortOrder and the
  Zaonce 70/8, Leesti 62/10, Computers 682/43 and 731/30 cross-checks.
- `tests/sim/economy/trade.test.ts` adds sell, clamp-order, pod-boundary and
  money-safety coverage, including fast-check properties over random
  credits/cargo/market combinations that include `MAX_SAFE_INTEGER`, price 0, a
  non-finite price and a partially filled pod.

### Decisions recorded in `.planning/PROJECT.md`

The additive optional-v1 seed/cargo fields with the atomic snapshot, the
build-time name/peak content shape, the older-build corruption caveat for an
in-place v1 extension, and the deliberate exact kg/g clamp over Oolite's
`PlayerEntity.m:10029-10062` TODO. The stable-market decision itself was already
recorded on 2026-11-06 (plan 05-01 / owner amendment) and is unchanged.

## Tasks and Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Exact capacity rule, selling, sequential clamps and safe-integer money | `b06467d` |
| 2 | Regression goldens, independent reference vectors, determinism and decisions | `1caaa46` |

## Verification

All commands ran in Docker, never on the host.

| Command | Result |
|---|---|
| `docker compose run --rm test npx vitest run tests/sim/economy/trade.test.ts tests/sim/economy/cargo.test.ts` | 46 passed |
| `docker compose run --rm test npx vitest run tests/sim/economy` | 70 passed (5 files) |
| `docker compose run --rm test npx vitest run tests/sim/economy tests/app tests/input` | 149 passed |
| `docker compose run --rm test` (full unit) | 75 files / 802 tests passed |
| `docker compose run --rm typecheck` | green (both projects) |
| `docker compose run --rm lint` | green (ESLint + Prettier) |
| `docker compose run --rm e2e npx playwright test tests/e2e/station.spec.ts` | 4 passed |
| `docker compose run --rm test npx tsx tests/helpers/write-market-goldens.ts` | wrote 3 fixtures; `prettier --check` unchanged |

Acceptance checks: `rg -n "toFixed|Math\.round" src/sim/economy/trade.ts` is
empty; the golden JSON files each hold 17 goods and only `version`, `systemId`,
`marketSeed`, `goods`; `REGRESSION`/`not correctness proof` appear in the writer
and the market test while the JSON stays comment-free; the reference vectors are
labelled independent with provenance and never call the generator for an
expected value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] A zero-stock row the hold carries is selectable**
- **Found during:** wiring the sell path.
- **Issue:** `ensureSelection`/`selectableKeys` only accepted `good.stock > 0`, so
  the canonical run was impossible: Lave has 0 Computers in stock, and the 2 t
  just bought at Zaonce could never be selected or sold.
- **Fix:** a row is reachable when `stock > 0` **or** `profile.cargo[key] > 0`;
  the same predicate backs `buildMarketModel`'s `selectable` flag so the view
  model and the session cannot disagree.
- **Files modified:** `src/app/game-session.ts`, `src/ui/station-model.ts`.
- **Note:** `src/ui/station-model.ts` is outside the plan's `files_modified`; the
  one-line change keeps the model's flag truthful and is otherwise unused by the
  shell.

**2. [Plan instruction deviation] `unknownCommodity` is retained**
- **Found during:** rewriting `TradeRefusal`.
- **Issue:** the plan's enumerated enum omits `unknownCommodity`, but wave 1
  emitted it for a market row the catalogue does not describe, and that fault is
  distinct from `notTradeable`. Dropping it would either lose the distinction or
  force a false reason.
- **Fix:** keep it as a documented superset; every switch that reads a reason has
  a `default`, and the buy test still pins it.
- **Files modified:** `src/sim/economy/trade.ts`.

**3. [Plan instruction interpretation] A refused `applySell` returns `undefined`, not a duplicate profile**
- **Found during:** implementing the overflow guard.
- **Issue:** the plan says an overflow "returns the same profile", while wave 1's
  `applyBuy` contract returns `undefined` on any refusal.
- **Fix:** `planSell` refuses `overflow` before any arithmetic (so the footer
  never confirms an impossible sale) and `applySell` returns `undefined`,
  leaving the caller's profile object identical. Tests assert the identity is
  untouched. This keeps one apply contract for both sides.
- **Files modified:** `src/sim/economy/trade.ts`, `tests/sim/economy/trade.test.ts`.

**4. [Rule 3 - Blocking] The golden writer validates through `CommoditySchema`, not `parseCommodities`**
- **Found during:** running `npx tsx tests/helpers/write-market-goldens.ts`.
- **Issue:** `src/content/commodities.ts` calls `import.meta.glob` at module
  scope, which only Vite/Vitest provide; importing it under `tsx` throws
  `(intermediate value).glob is not a function`, so the plan's exact command
  could not run.
- **Fix:** the writer reads the committed JSON and validates each record with the
  same `CommoditySchema` the loader uses, plus the duplicate-key check. The
  committed catalogue is still validated through the real loader by the content
  tests and `assets:check`.
- **Files modified:** `tests/helpers/write-market-goldens.ts`.

No authentication gates and no package installs occurred. The plan estimated
34k tokens and 2 tasks; the realized diff is ~19.8k tokens over 2 task commits.

## Known Stubs

None. F3/F5/F7 and the full sell copy/keyboard proof remain later plans by
design; the sell path itself is complete and tested. The generic clamp and
refusal strings are app-owned and fixed, and plan 05-05 owns their final wording.

## Threat Flags

None beyond the plan's threat register. `planSell`/`applySell` are covered by
T-05-17 and T-05-21 (same plan-then-apply path, safe-integer assertion and the
`MAX_SAFE_INTEGER - proceeds` boundary), the goldens by T-05-18 (writer-only,
independent oracle separated) and the kg/g rule by T-05-20 (the five exact pod
cases).

## Self-Check

- Created files exist: `tests/golden/market/{lave,zaonce,leesti}.json`,
  `tests/helpers/write-market-goldens.ts`, `tests/sim/economy/determinism.test.ts`,
  `tests/sim/economy/reference-vectors.test.ts` — all present.
- Commits exist: `b06467d` and `1caaa46` are ancestors of HEAD; the two task
  commits sit between `1382dc9` and `1caaa46`.
- Measured commits: `git rev-list --count 1382dc9..1caaa46` = 2, matching
  `actuals.commits`.
- Verification: full unit suite, typecheck, lint and the station e2e spec pass.
