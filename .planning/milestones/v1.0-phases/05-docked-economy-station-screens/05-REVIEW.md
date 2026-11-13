---
phase: 05-docked-economy-station-screens
reviewed: 2026-11-06T13:02:47Z
depth: standard
files_reviewed: 54
files_reviewed_list:
  - eslint.config.js
  - index.html
  - src/app/game-session.ts
  - src/app/probe.ts
  - src/content/commodities.ts
  - src/content/generated/commodities.json
  - src/content/generated/manifest.json
  - src/content/labels.ts
  - src/content/schemas/commodity.ts
  - src/content/types.ts
  - src/input/actions.ts
  - src/input/bindings.ts
  - src/input/keyboard.ts
  - src/main.ts
  - src/persistence/autosave.ts
  - src/persistence/save.ts
  - src/sim/economy/cargo.ts
  - src/sim/economy/market.ts
  - src/sim/economy/ranrot.ts
  - src/sim/economy/trade.ts
  - src/sim/player/outfitting.ts
  - src/sim/player/profile.ts
  - src/ui/controls.ts
  - src/ui/docked.ts
  - src/ui/station-model.ts
  - src/ui/station.ts
  - tools/oolite-ingest/convert/commodities.ts
  - tools/oolite-ingest/generate.ts
  - tests/compliance.test.ts
  - tests/content/labels.test.ts
  - tests/e2e/autosave.spec.ts
  - tests/e2e/docking.spec.ts
  - tests/e2e/scene.spec.ts
  - tests/e2e/station.spec.ts
  - tests/guards/economy-purity.test.ts
  - tests/helpers/commodities.ts
  - tests/helpers/labels.ts
  - tests/helpers/write-market-goldens.ts
  - tests/input/bindings.test.ts
  - tests/input/station-actions.test.ts
  - tests/persistence/autosave.test.ts
  - tests/persistence/save.test.ts
  - tests/sim/economy/cargo.test.ts
  - tests/sim/economy/determinism.test.ts
  - tests/sim/economy/market.test.ts
  - tests/sim/economy/reference-vectors.test.ts
  - tests/sim/economy/trade.test.ts
  - tests/sim/player-profile.test.ts
  - tests/sim/player/outfitting.test.ts
  - tests/ui/station-market.test.ts
  - tests/ui/station-outfitting.test.ts
  - tests/ui/station-status.test.ts
  - tests/ui/station-system-data.test.ts
  - tools/oolite-ingest/convert/commodities.test.ts
findings:
  critical: 1
  warning: 2
  info: 4
  total: 7
  necessity: 0
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-11-06T13:02:47Z
**Depth:** standard
**Files Reviewed:** 54
**Status:** issues_found

## Summary

Phase 5 adds the docked economy (market generation, buy/sell planning, cargo/pod accounting), the F3/F5/F7/F8 station computer, the additive v1 save extension, and the mode-aware keyboard layer. The implementation is unusually careful: the market formula reproduces the Lave anchors exactly (independently re-derived from the Oolite C source with float32 emulation, including the `0xd3515f15` seed and the Food 38/16 / Computers 902/0 rows), the RANROT vector is correct, the save parser is strict and has a bounded-before-parse path, and every station string is written with `textContent`.

The review found one release-blocking correctness bug in the trusted buy path: the bulk (tonne) hold limit does not subtract the units of the same commodity already in the hold, so repeated one-tonne purchases can drive the hold past capacity (verified in the container). That over-capacity profile is then rejected by the save writer, so every subsequent trade reports a save failure and the progress is lost on reload. Two warnings cover a model/session definition conflict and the property test that should have caught the blocker; four info items cover a stale trust-boundary comment, dead exports, a misleading removal confirmation, and fixed sleeps in the browser proofs.

No structural findings were supplied with this review. Necessity was assessed with the rubric: the guards I examined either sit on a trust boundary (IndexedDB blob, keyboard event, content loader) or are type-exhaustiveness cases, so no necessity finding is raised (`necessity: 0`).

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: Bulk buys ignore the tonnes already held, so the hold can exceed capacity

**File:** `src/sim/economy/trade.ts:172-182` (and the re-plan in `applyBuy`, `src/sim/economy/trade.ts:299-326`)
**Issue:** For a tonne commodity the buy limit is computed as

```ts
const otherPods = otherPodsFor(profile.cargo, units, key); // excludes `key`
const spaceLimit =
  commodity.unit === "t"
    ? Math.max(0, capacityPods - otherPods)
    : maxAdditional(commodity.unit, held, otherPods, capacityPods);
```

`otherPods` deliberately excludes the commodity being bought (`otherPodsFor` skips `exceptKey`), and the tonne branch never subtracts `held`. The correct available room for additional tonnes is `capacityPods - otherPods - held`. Because the session's `stepAmount` buys one unit at a time and each fresh plan still sees `spaceLimit = 20`, the UI lets a player keep buying the same bulk good without limit: a player with enough credits buys 20 t of minerals at Lave, presses Right and Y again, and now holds 21 t in a 20 t hold. `applyBuy` re-runs the same buggy plan, so it accepts it too.

This is not only a display bug. The oversized profile is passed to `commitProfile` and `autosave`; `queueAutosave` correctly refuses it as `invalid-save` because `validateSaveSemantics` checks `holdPodsUsed(cargo) <= capacityPods`, so the in-memory hold diverges from the saved blob, the player sees "Save failed — progress not saved" after an otherwise accepted trade, and the extra cargo is lost on reload.

**Reproduction (container, read-only):**

```text
docker compose run --rm test npx tsx -e '
import { planBuy, applyBuy } from "./src/sim/economy/trade.ts";
import { newProfile } from "./src/sim/player/profile.ts";
import { emptyCargo, holdPodsUsed, capacityPodsFor } from "./src/sim/economy/cargo.ts";
const units = new Map([["food","t"]]);
const market = { systemId: "g0-s7", seed: 1, goods: [{ key: "food", price: 38, stock: 100 }] };
const commodity = { key: "food", unit: "t", tradeable: true };
let p = { ...newProfile(), credits: 100000, cargo: emptyCargo() };
for (let i = 0; i < 25; i++) {
  const req = { market, profile: p, commodity, units, amount: 1 };
  const plan = planBuy(req);
  if (!plan.ok) break;
  const applied = applyBuy(req, plan);
  if (applied === undefined) break;
  p = applied.profile;
}
console.log(p.cargo.food, holdPodsUsed(p.cargo, units), capacityPodsFor(p.equipment, p.passengerBerths));
'
```

Output: `25 25 20` (25 t of Food in a 20-pod hold).

**Fix:**

```ts
const spaceLimit =
  commodity.unit === "t"
    ? Math.max(0, capacityPods - otherPods - held)
    : maxAdditional(commodity.unit, held, otherPods, capacityPods);
```

Add unit cases that buy a bulk good that is already in the hold (including at the exact boundary), and add the hold invariant to the property test (WR-02). The same fix covers `planMax` because it delegates to `planBuy`.

### Warnings

#### WR-01: `MarketRow.selectable` and the session's navigation predicate disagree for zero-stock rows

**File:** `src/ui/station-model.ts:237` vs `src/app/game-session.ts:375-381`
**Issue:** `buildMarketModel` sets `selectable: tradeable`, so a zero-stock tradeable row (for example Computers at Lave) is reported as selectable and `tests/ui/station-market.test.ts:96-103` pins that. The session's actual navigation uses `isSelectableGood`, which returns `stock > 0 || (profile.cargo[key] ?? 0) > 0`; `ensureSelection`, `selectableKeys`, and `moveSelection` therefore skip a zero-stock row the player does not hold. The shell happens not to consume `selectable` today, so the immediate symptom is only that the player cannot move to the row the model calls selectable, but the two definitions are now a latent trap: any future UI that trusts the model flag will be inconsistent with the keyboard behaviour, and the 05-04 truth ("zero-stock tradeable rows are dimmed but selectable") is not met by the shipped UI.
**Fix:** make the session use the same predicate as the model (`commodity.tradeable === true`; `planBuy` already refuses `noStock`), or change the model to `stock > 0 || held > 0` and amend the truth/test so one predicate is the single source of truth.

#### WR-02: The money-safety property test does not assert the hold invariant, which is why CR-01 passes

**File:** `tests/sim/economy/trade.test.ts:577-624`
**Issue:** The buy property generates `foodTonnes` and `goldKg`, applies a plan, and then checks only that each cargo quantity is a non-negative safe integer. It never asserts that the resulting hold still fits:

```ts
for (const quantity of Object.values(applied.profile.cargo)) {
  expect(Number.isSafeInteger(quantity)).toBe(true);
  expect(quantity).toBeGreaterThanOrEqual(0);
}
```

A single invariant line would have failed on the CR-01 reproduction. This is a missing assertion in the phase's primary money/hold proof, not a style issue.
**Fix:** after `applyBuy`, assert

```ts
expect(holdPodsUsed(applied.profile.cargo, units)).toBeLessThanOrEqual(
  capacityPodsFor(applied.profile.equipment, applied.profile.passengerBerths),
);
```

and add a focused case that buys one more tonne of a good already held at `capacityPods`.

### Info

#### IN-01: Stale comment says `isEncodedSaveValid` ignores the allow-lists, but it consults them

**File:** `src/persistence/save.ts:345-352` (comment) and `src/persistence/save.ts:353-370` (code)
**Issue:** The doc comment says "The allow-lists are not consulted here — they depend on boot content — only the size cap and the strict schema the parser applies first." The function now takes `allow` and calls `validateSaveSemantics(result.data, allow, "write")`, which rejects unknown equipment and commodity keys. The comment describes the pre-Phase-5 signature; a maintainer trusting it could pass an empty allow-list or remove the semantic check, defeating the writer/reader parity this phase added.
**Fix:** update the comment to state that write-mode allow-lists and hold semantics are enforced, matching `parseSave`.

#### IN-02: Dead exports introduced by the phase

**Files:**
- `src/sim/economy/cargo.ts:35` — `PASSENGER_BERTH_KEY` is exported but referenced nowhere; only `CARGO_BAY_KEY` is read by `capacityPodsFor`.
- `src/ui/station.ts:57` (and implementation at `:342`) — `StationShell.setScreen` is exposed but never called; `render()` already calls `applyScreen`.
- `src/content/commodities.ts:98-108` — `findCommodity` is never used (unlike `findEquipment`, which the profile tests exercise).

**Issue:** These are public surface with no caller, which makes the module contract look larger than the shipped behaviour and invites drift.
**Fix:** remove them, or add the call/test that makes them part of the contract.

#### IN-03: The missile-removal confirmation states only the fee, not the net trade-in

**File:** `src/app/game-session.ts:746-748` (confirmation text), `src/ui/station-model.ts:549-552` (row label), pinned by `tests/e2e/station.spec.ts:438-440`
**Issue:** For `EQ_MISSILE_REMOVAL` with three missiles the money effect is `-200 + 3 × 300 = +700` dc, but the last line before the money moves reads `Buy Remove Missile for 20.0 Cr? [Y/N]`. The row description does state the full catalogue-value re-sale (`REMOVAL_DESCRIPTIONS`), so D-15's literal requirement is satisfied and the arithmetic is correct; the confirmation nevertheless hides the direction of the transaction at the decisive moment.
**Fix:** for removal entries use net-effect copy such as `Remove all missiles: +70.0 Cr net? [Y/N]` (and update the pinned e2e line), or append the trade-in to the existing confirmation.

#### IN-04: Fixed `waitForTimeout` calls weaken the inert-key browser proofs

**Files:** `tests/e2e/station.spec.ts:579`, `:685`, `:739`, `:799`; `tests/e2e/autosave.spec.ts:359`
**Issue:** Several "the key must be inert / nothing changed" proofs sleep for a fixed 300–600 ms and then read the probe. A delayed frame on a loaded CI runner can make such an assertion pass while the queued action is still pending (a false negative), and a slow runner can also make the opposite failure timing-dependent. These are the classic flaky/false-pass pattern the project has otherwise avoided with `waitForFunction`/`expect.poll`.
**Fix:** replace the sleeps with an observable: wait for a frame/probe counter to advance (for example `probe.renders` or a small test-only counter), then assert the unchanged state; or use `expect.poll` with a bounded timeout against the specific probe field.

---

_Reviewed: 2026-11-06T13:02:47Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
