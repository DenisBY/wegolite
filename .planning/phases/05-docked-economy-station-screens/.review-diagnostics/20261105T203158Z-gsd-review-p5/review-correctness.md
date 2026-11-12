# Phase 5 — Docked Economy & Station Screens: Behavioural Correctness Review

**Reviewer scope:** behavioural fidelity against the written plans, the repository at `/home/opencode/git/wegolite`, and upstream Oolite at `/home/opencode/git/oolite`.
**Verdict summary:** Requirement coverage is complete on paper, but the phase carries three systemic risks: a very large tracer (05-01), a real kg/g capacity formula defect plus self-referential market goldens (05-02), and an incomplete save-validation invariant (05-01/05-06). Overall risk **HIGH**.

---

## 05-01

### Summary
05-01 is the phase tracer: it closes the two content gaps (`peakExport`/`peakImport`, resolved commodity names), adds the pure economy/pod/trade modules, extends `PlayerProfile` and the strict save, adds input contexts, replaces the Phase 4 docked panel with the station shell, and proves buy → autosave → reload at Lave. The architecture is coherent and the seams are real, but one task spanning content, schema, economy, profile, save, input, UI deletion and e2e is the single largest risk in the phase.

### Strengths
- The two claimed content gaps are real and correctly located: `CommoditySchema` has no peaks (`src/content/schemas/commodity.ts:25-42`), and the generated record still emits the raw token (`src/content/generated/commodities.json:11`).
- The name-resolution plan is feasible: `descriptions.plist` contains all required keys, including the underscore spellings and `alien_items` (`third_party/oolite/Config/descriptions.plist:2140-2160`).
- The plan preserves the Phase 4 evidence anchors: root `#docked` and `data-field="message"` survive (`index.html:359-386`, `src/ui/docked.ts:62-67`), so the launch/dock specs have a chance to keep passing.
- The save extension is additive and backward-compatible for old blobs: optional fields do not invalidate Phase 4 blobs under the strict schema (`src/persistence/save.ts:78-96`), and the existing duplicate-equipment rejection is retained (`src/persistence/save.ts:209-216`).
- The input-context design directly addresses the real collisions: `pause` owns `Escape` and `launch` owns `Digit1`/`F1` (`src/input/actions.ts:64-65`), and the existing shift filter is the correct insertion point (`src/input/keyboard.ts:105-112`).
- The plan correctly calls out the `applyTestEquipment` field-dropping bug in the existing session code (`src/app/game-session.ts:372-382`) and requires it to spread the profile.

### Concerns
- **HIGH — Tracer breadth.** A single task touches every layer and deletes `src/ui/docked.ts` while simultaneously rewriting content, economy, profile, save, input, shell and e2e. The 58k estimate with low confidence is not credible for a clean first pass; a partial implementation leaves the app unbootable because `src/main.ts:101` and `src/app/game-session.ts:115-116` still import the deleted panel.
- **HIGH — `isEncodedSaveValid` does not enforce the new save invariant.** The plan adds a hold-capacity check to `parseSave`, but `queueAutosave` validates snapshots with `isEncodedSaveValid`, which checks only size and the strict schema (`src/persistence/save.ts:233-240`). A bug in the new pod/trade arithmetic could therefore overwrite the last good save with a blob that `parseSave` will later reject as corrupt.
- **MEDIUM — Arrival lifecycle is ambiguous.** 05-01 says “generate the market at start while docked with arrival 0; increment the counter once per `docked` event” (`05-01-PLAN.md:207`). If the initial docked session also emits a `docked` event, the first market is arrival 1 and D-18’s “starts at 0 on a new game” is violated. Only 05-06 tests arrival after reload, not on first boot.
- **LOW — Zero-price free-goods window.** 05-01 implements `planBuy` but explicitly defers the zero/negative-amount and invalid-price guards to 05-02 (`05-01-PLAN.md:53`). With a price of 0, `Math.floor(credits / price)` yields `Infinity` and the bulk limit collapses to stock, minting free cargo until wave 2 closes the hole.
- **LOW — “Consumed in every context” contradicts the context table.** The input test requires F3/F5/F7/F8 to be “consumed in every context” (`05-01-PLAN.md:205`), while `ACTION_CONTEXTS` restricts station screens to `dockHome`/`dockScreen`. Clarify whether “consumed” means `preventDefault` only or action dispatch.

### Suggestions
- Split 05-01: land content + pure economy + profile/save first, then the shell/input/session slice, or keep `docked.ts` until `station.ts` is fully wired.
- Extend `isEncodedSaveValid` to the same capacity/allow-list check, or make `snapshotForSave` reject an over-capacity profile before encoding.
- Add a unit test that a new game’s `arrival === 0` and the first `docked` event increments exactly once.
- Include `invalidPrice` in 05-01’s `planBuy` rather than waiting for 05-02.
- Reword the input acceptance criterion to distinguish “prevent browser default” from “fired a station action”.

### Risk Assessment
**HIGH.** The tracer is the phase’s critical path, deletes the existing panel, and changes the published save contract in one task. The `isEncodedSaveValid` gap weakens the “last good save” guarantee that the rest of the persistence plan depends on.

---

## 05-02

### Summary
05-02 expands the buy-only tracer into full trading: sell, kg/g pod limits, clamps, refusal reasons, fast-check properties, three market goldens, determinism and economy-only proofs, and PROJECT.md decisions. It covers ECON-01/02/03 well on paper, but the kg/g buy-limit expression is not the exact capacity rule, and the goldens are generated by the implementation they are meant to validate.

### Strengths
- The pod constants and boundaries match Oolite exactly: 1,000 kg/pod, 499 kg safe, 1,000,000 g/pod, 499,999 g safe (`src/sim/player/profile.ts` is unrelated; the constants live in Oolite `PlayerEntity.h:1294-1297` and are used at `PlayerEntity.m:9508-9545`).
- The sell limit `min(held, 127 - stock)` mirrors Oolite’s `trySellingCommodity` (`PlayerEntity.m:10074-10124`).
- The refusal enum covers every required rejection: `notTradeable`, `nothingToSell`, `marketFull`, `noStock`, `insufficientCredits`, `holdFull`, `invalidPrice`, `zeroAmount` (`05-02-PLAN.md:134`).
- The plan requires `applyBuy`/`applySell` to re-run the pure plan and refuse on mismatch, preserving the defence-in-depth pattern used by `buyDockComputer` (`src/app/game-session.ts:354-364`).
- `fast-check` is already a devDependency (4.10.2), so the property tests require no dependency change.

### Concerns
- **HIGH — kg/g buy limit is not the exact capacity rule.** `05-02-PLAN.md:127` specifies `min(stock, floor(credits/price), availablePods * podSize + safeMax - alreadyHeld)`. This under-allows whenever the same kg/g good is already held in a partially filled pod. With 20 t capacity, 1,499 kg of gold held and 19 free pods, the formula yields 18,000 kg additional; the actual remaining capacity is 19,000 kg (the hold can reach 20,499 kg in 20 pods). With 500 kg held and 19 free pods it yields 18,999 vs 19,500 available. The tests only cover 499/500 from empty and a full hold with zero held, so this defect is invisible.
- **MEDIUM — Goldens are self-referential.** `05-02-PLAN.md:159` states the committed fixtures are “implementation output”, and the only independent values are eight anchors (Lave/Zaonce/Leesti food/computers) that the research labels `[ASSUMED]`. A systematic formula error that reproduces the anchors — or an error in an unanchored row — passes. ECON-01’s “matching recorded fixtures” is therefore regression-pinned, not proven.
- **MEDIUM — No 127-cap coverage for kg/g goods.** The test list mentions a sell at stock 127, but not that the 127-unit cap applies to kg/g stock or that a kg/g sell at stock 127 refuses `marketFull`. ECON-01’s cap is on stock units for every good.
- **LOW — Oolite itself does not capacity-clamp kg/g when the hold is not full.** The plan’s clamp is a deliberate improvement over Oolite’s TODO (“fix brokenness here”, `PlayerEntity.m:10029-10062`); that divergence should be recorded so a future fidelity review does not “fix” it back.
- **LOW — Anchor provenance.** The anchors are research-computed and explicitly not repo output; the test should label them as cross-checks rather than absolute truth.

### Suggestions
- Replace the kg/g limit with a feasibility search: the largest `q >= 0` such that `podsFor(held + q) <= capacityPods`, or a closed form derived from the current remainder. Add tests with `held = 500`, `held = 1,499`, and `held = 1,499,999 g`.
- Add one independent expected table for all 17 Lave rows (from a second implementation or a recorded Oolite run) rather than relying on eight anchors.
- Add kg/g 127-cap and sell-at-127 cases.
- Document the non-full-hold clamp as a deliberate deviation from Oolite.
- Keep the golden writer, but have the test also compare against the independent table so a regenerated fixture cannot silently bless a regression.

### Risk Assessment
**MEDIUM.** The overall shape is correct and the pod boundaries are right, but the general kg/g formula is wrong in a requirement area (ECON-03) and the test suite is designed in a way that will not catch it.

---

## 05-03

### Summary
05-03 isolates outfitting into a pure module: the D-11 visible set, raw-TL gating, the five condition rules, multi-instance missiles/berths, fuel fill pricing, immediate effects, and no-refund removals. The catalogue values and the Oolite rule references are accurate; the main risks are the deliberate Oolite divergence on missile removal and missing integer guards around fuel.

### Strengths
- Raw-TL gating is correct and matches `canPurchase` (`src/sim/player/profile.ts:98-120`): Lave raw 4 must refuse TL 5+ and allow TL 4 and below.
- Catalogue prices and tech levels were verified against `src/content/generated/equipment.json`: cargo bay 4000/TL1, dock computer 15000/TL9, gal drive 50000/TL10, compass 6500/TL7, ANA 22500/TL6, missile 300/TL1, berth 8250/TL5, berth removal 1000/TL1, missile removal 200/TL1.
- The berth price correction is right: the generated record says 8250 dc (825.0 Cr), matching Oolite’s `equipment.plist`; D-14’s 82.5 Cr is the error.
- The fuel fill cost `(70 - fuel) * 2` matches `PLAYER_MAX_FUEL` and `PlayerEntity.m:8386-8387`; the plan explicitly avoids the classic “0.2 Cr row” bug.
- Multi-instance counts are the right representation: `purchase()` rejects duplicate keys (`src/sim/player/profile.ts:136`) and `parseSave` rejects duplicate equipment (`src/persistence/save.ts:209-216`), so missiles/berths must be counts rather than duplicate keys.
- No install delay/no clock advance is consistent with the docked clock being frozen (`src/sim/flight/step.ts:147-155`).

### Concerns
- **MEDIUM — No-refund removals are a real economic divergence.** Oolite’s `EQ_MISSILE_REMOVAL` refunds 300 dc per missile and charges 200 dc (`PlayerEntity.m:9326-9329,9431-9437`); 05-03 instead charges 200 dc and removes all missiles with no credit add (`05-03-PLAN.md:26,157`). The plan documents this as a locked-decision deviation, but it turns a net +70.0 Cr action in Oolite into a −20.0 Cr action in Wegolite, and ECON-05 says “removes legal items at the correct price”. Confirm the user accepts the divergence in PROJECT.md.
- **MEDIUM — Fractional fuel can produce fractional credits.** `fitPrice` / `applyFit` do not reject a non-integer `profile.fuel`; `checkFit` only refuses `fuel >= capacity` or a non-positive fill cost (`05-03-PLAN.md:122,162`). A forged in-memory profile with `fuel = 69.5` yields a fractional cost and fractional credits, which the save schema will later reject. Add an integer/bounds guard and a property case.
- **LOW — 20 t hull berth boundary is not tested.** The plan tests “berth at 7 refusal” and `availablePods === 4`, but not the 5th berth on a 20 t hull (capacity 0 after 4 berths) refusing `cargoSpace`.
- **LOW — `requires_free_passenger_berth` is reinterpreted.** Oolite uses it as “no free berth” (`passengerCount >= passengerCapacity`), not “there is a berth to remove”; the plan deliberately uses `berths > 0` for visibility (`05-03-PLAN.md:122`). Document this as a v1 simplification.
- **LOW — `fitPrice` returning 0 for invalid cost** is only safe because `checkFit` refuses `invalidPrice` first; if the check order changes, a 0 cost may leak. Keep the order pinned by a test.

### Suggestions
- Record the missile-removal economics in one authoritative PROJECT.md row with the Oolite net-refund arithmetic, so the deviation is explicit rather than implied.
- Add `Number.isSafeInteger(profile.fuel)` and `0 <= fuel <= 70` guards to `checkFit`/`fitPrice`, or reject the profile as invalid.
- Add the 20 t 5th-berth `cargoSpace` case and a 35 t 7th-berth success case.
- Add a test that `fitPrice` is called only after `checkFit` approves.

### Risk Assessment
**MEDIUM.** The rules and prices are accurate, and the catalogue wins over the prose. The deliberate removal refund deviation and the missing fractional-fuel guard are the two areas that could produce a requirement-level dispute.

---

## 05-04

### Summary
05-04 moves all four screens into pure view models and adds the labels loader. It correctly pins Lave’s numbers, uses `labels.json` templates without a template engine, and keeps `textContent`/DOM concerns out of the models. The main issues are formatting inconsistencies between the models and the plans that consume them.

### Strengths
- The Lave values are correct and verified: economy 5 → Rich Agricultural, government 3 → Dictatorship, raw TL 4 → displayed 5, population 25 → 2.5 Billion, productivity 7000 M₢, radius 4116 km, and the exact description (`src/content/generated/systems/g0.json`, Lave record).
- Every `sysdata-*` key the plan uses exists in `src/content/generated/labels.json:4-40`, including `sysdata-distance`, all four value templates, and the title template.
- The labels schema is strict and fixed-length (`src/content/schemas/labels.ts:18-26`), so a malformed generated record fails loudly.
- The market model specification matches D-08/D-09: 17 rows in `sortOrder`, zero stock dimmed with `—`, Alien Items non-selectable with stock `—`, `Ex` from `legalityExport`, held 0 as `—`.
- The outfitting model delegates to `checkFit`/`fitPrice` rather than re-implementing the rules, which keeps ECON-05 decisions in one place.
- The status model keeps kg/g out of the ton total and uses `holdPods` for the load line, matching the pod accounting.

### Concerns
- **MEDIUM — Removal labels use two different price formats.** 05-04 says the removal rows use “the D-15 short labels with the formatted price” (`05-04-PLAN.md:165,172`), and `priceText` is `formatCredits(cost)`, which always emits one decimal (`src/sim/player/profile.ts:64-67`). That produces `Remove Missile — 20.0 Cr` and `Remove Passenger Berth — 100.0 Cr`, while D-15 and 05-05 assert `Remove Missile — 20 Cr` (`05-05-PLAN.md:25,133,143`). One of the tests will fail, or the implementer will invent a second formatter.
- **MEDIUM — F5 page 2 must exclude Alien Items.** The plan says “16 tradeable commodities” (`05-04-PLAN.md:127`), but the loaded array has 17 records with `alien_items` marked `tradeable: false` (`src/content/generated/commodities.json`: the final record). Iterating all records would render 17 manifest rows and fail the requirement.
- **LOW — Old Phase 4 blobs can double-count missiles/berths.** The Phase 4 `?test=1` hook grants any catalogue key and saves it (`src/app/game-session.ts:372-382`); a blob with `EQ_MISSILE` or `EQ_PASSENGER_BERTH` in `equipment` will be shown both as a key name and as `Missile ×N`/`Passenger Berth ×N`, while capacity ignores the key. Normalize or filter these keys in `profileFromSave`.
- **LOW — “Nine labeled fields” includes the title.** The prose says nine fields but the table lists a title plus eight data fields; align the count so tests do not encode the ambiguity.
- **LOW — Cash text exactness.** `Cash: <formatCredits>. Load ...` yields a double period if the template already ends with `Cr.`; specify the exact concatenation and assert it once.

### Suggestions
- Choose one removal price format. If D-15’s integer examples are authoritative, add a separate `formatWholeCredits` helper; otherwise update D-15/05-05 to `20.0 Cr`/`100.0 Cr`.
- Add an explicit assertion that F5 page 2 has 16 rows and no `alien_items`, while F8 has 17 rows including the dimmed Alien Items row.
- Filter `EQ_MISSILE`/`EQ_PASSENGER_BERTH` from `equipment` during restore, or render the counts only.
- Pin the exact cash/load string in one test helper.

### Risk Assessment
**LOW-MEDIUM.** The models are well-shaped and the Lave data is right. The formatting and 16-vs-17 ambiguities are cheap to fix but will cause avoidable test failures if left.

---

## 05-05

### Summary
05-05 wires F3/F5/F7 into the shell, adds the session’s screen/page/selection/confirm state machine, the F3 purchase/removal autosave path, and the keyboard-only browser proof including the F5 no-reload assertion. The planned key model matches the context design, and the Lave F3 expectations are arithmetically right. The risk is concentrated in formatting assumptions and in the e2e’s dependence on the title/confirmation flow.

### Strengths
- The Lave F3 expectations are correct: new game 1000 dc, cargo bay 4000 dc → `Not enough credits`; dock computer TL 9 vs raw 4 → `Requires TL 9`; missiles 3/3 → `Pylons full`; Remove Missile 200 dc → 800 dc / 80.0 Cr and 0 missiles.
- The row navigation count is right: at a new game Fuel is hidden and Remove Passenger Berth is absent, so seven Downs from row 0 lands on Remove Missile (row index 7).
- Direct screen switching is consistent with `ACTION_CONTEXTS` allowing station screens in both `dockHome` and `dockScreen`.
- `#title-start` is a real `<button>` (`index.html:335`), so “focus and press Enter” is keyboard-viable; the existing `tests/e2e/helpers/title.ts` uses a click, but the plan’s keyboard path is not blocked by the markup.
- The F5 no-reload assertion using `performance.getEntriesByType("navigation").length === 1` is the right probe-only evidence shape.
- The plan correctly identifies that disabled F3 rows must never reach `applyFit` and that a refused confirm must leave the reason visible.

### Concerns
- **MEDIUM — Same removal-label ambiguity as 05-04.** The e2e asserts `Remove Missile — 20 Cr` (`05-05-PLAN.md:25,133,143`), while the model’s `priceText` is `formatCredits` → `20.0 Cr`. The test must use whichever format the model actually emits.
- **MEDIUM — New-game confirmation is not in the keyboard loop.** A fresh browser context has no save, but any reused context with a committed save shows `#title-confirm` after `#title-start`. The plan says “focus `#title-start` and press Enter” but does not handle the confirm prompt; the loop can stall before the first station key. Add the prompt to the keyboard sequence or use a guaranteed-fresh context.
- **LOW — `Tab` as page-next may interact with focus traversal.** The plan says activation stays in the action layer, but `Tab` is also the browser’s focus key. Assert that `Tab` is consumed in `dockScreen` and does not move focus out of the section root.
- **LOW — “Second KeyY” in 05-06 is out of step with 05-05’s one-confirm design** (cross-referenced in 05-06 below); 05-05 itself is consistent.
- **LOW — F7 “nine fields” ambiguity** is inherited from 05-04; keep the e2e assertions on the label/value pairs rather than a count.

### Suggestions
- Fix the removal label format in one place before writing the e2e.
- Add the `#title-confirm` branch to the keyboard start helper and assert it is keyboard-dismissed.
- Add an assertion that `Tab` does not change `document.activeElement` outside the station section.
- Keep the F3 row-index assertion derived from the visible row keys (filtered by the same visibility rules), not a hard-coded “seven Downs”, so a visibility change fails meaningfully.

### Risk Assessment
**MEDIUM.** The screen wiring is sound and the Lave arithmetic is right. The formatting mismatch and the title-confirmation gap are likely to cost a test cycle, but they do not undermine the architecture.

---

## 05-06

### Summary
05-06 closes the phase with save hardening (old blobs, forged cargo, over-capacity, one-write-per-action), the full keyboard-only loop, the economy-purity guard, and the `docker compose run --rm verify` gate. It is the right final plan, but it inherits the `isEncodedSaveValid` gap and contains a confusing double-confirm step that can mask an unintended second purchase.

### Strengths
- The reject table is comprehensive and aligned with the existing strict parser: unknown commodity key, duplicate cargo key, negative/fractional/overflow quantity, 18 entries, fuel 71, missiles 4, berths 8, and over-capacity (`05-06-PLAN.md:27,129`).
- The 499/500 kg, cargo-bay 25 t, and berth-reduces-capacity cases are the exact boundaries that matter (`05-06-PLAN.md:130`).
- The old-blob browser case correctly expects defaults of empty cargo, fuel 70, missiles 3, berths 0 (`05-06-PLAN.md:25,137`), matching the proposed `profileFromSave`.
- The one-write-per-action proof and the “screen changes write nothing” assertion protect the existing `attempts`/`writes`/`committed` test contract (`tests/e2e/autosave.spec.ts:347-349`).
- The purity guard uses the established `withProbeLock`/`__purity_` convention (`tests/guards/probe-lock.ts`, `tests/compliance.test.ts:71`).
- The reload case correctly proves market regeneration: buy 2 and sell 1 leaves stock 15, while the reloaded arrival-0 market shows 16.

### Concerns
- **HIGH — `isEncodedSaveValid` still bypasses the capacity/allow-list check.** `queueAutosave` rejects only size/schema failures (`src/persistence/save.ts:233-240`), so the new `holdPodsUsed <= capacityPodsFor` invariant is enforced on read but not on write. A trade-path bug can replace the last good save with a blob that boot later calls `corrupt`. The plan’s task 1 focuses on `parseSave` and does not explicitly extend the writer-side validator.
- **MEDIUM — “Two KeyY presses apply it” is wrong and unsafe.** `05-06-PLAN.md:169` says two Y presses remove the missile. The first Y removes the last row; the second lands on the clamped row. At Lave that row is Passenger Berth, which is disabled at raw TL 4, so the test passes by accident. On a TL 5+ system the second Y could buy a berth. Use one Y, or explicitly assert the second Y is a no-op.
- **MEDIUM — The purity guard does not scan `src/sim/player/profile.ts`.** The guard covers `src/sim/economy/**` and `outfitting.ts`, but `profile.ts` is part of the economy state and could reintroduce a DOM/global-RNG import. Add it to the scanned set.
- **MEDIUM — The pending-state transition after a committed trade is under-specified.** The reload assertion depends on ArrowLeft starting a *sell* of 1 after a buy of 2. If Left instead decrements the pending buy, the loop buys 1 and the stock/credit assertions diverge. Add a unit test for “after commit, Left starts a sell” and “row change clears pending”.
- **LOW — `autosave()` also fires on launch** (`src/app/game-session.ts:609`). The final `Digit1` in the loop increments `probe.save.committed`; per-action assertions must be taken before the launch or explicitly account for it.
- **LOW — The e2e seeds an over-capacity blob and expects a corrupt backup.** Confirm the existing boot path copies a corrupt blob before New game clears it; `parseSave` classifies it, but the backup/clear behaviour lives in the title flow.

### Suggestions
- Extend `isEncodedSaveValid` to take the commodity unit map/capacity and run the same invariant as `parseSave`, or make `snapshotForSave` fail closed on an over-capacity profile.
- Replace the second `KeyY` with a single confirm and add an explicit “second Y does nothing” assertion.
- Add `src/sim/player/profile.ts` to `tests/guards/economy-purity.test.ts`.
- Add the post-commit Left/Right transition unit test before relying on it in the e2e.
- Capture `committed` immediately before and after each accepted action, then assert the launch write separately.

### Risk Assessment
**MEDIUM-HIGH.** The persistence test matrix and keyboard loop are strong, but the writer-side validation gap is a real defence-in-depth failure, and the double-confirm step is the kind of test that passes for the wrong reason.

---

## Cross-Plan Comparison

- **Coverage:** every requirement ECON-01..09 has an owning plan and at least one test type:
  - ECON-01 — 05-01 builds the market, 05-02 pins goldens/determinism (fidelity caveat: self-generated fixtures).
  - ECON-02 — 05-01 buy path, 05-02 sell/same-price/no-price-move.
  - ECON-03 — 05-01 pod helpers, 05-02 boundaries (defect in the general kg/g limit).
  - ECON-04 — 05-01/05-04/05-05/05-06 rows, units, confirmation, keyboard.
  - ECON-05 — 05-03 rules, 05-04 rows/reasons, 05-05 install/remove path.
  - ECON-06 — 05-04 two-page model, 05-05 screen.
  - ECON-07 — 05-04 label/value model, 05-05 screen.
  - ECON-08 — 05-02 clamps/refusals, 05-03 refusal enum, 05-06 save rejects.
  - ECON-09 — 05-01 input contexts, 05-05 keyboard-only e2e, 05-06 full loop/no-reload.
- **Dependency ordering:** 05-01 is the sole tracer and blocks all later waves; 05-02 and 05-03 are correctly sequenced after it; 05-04/05-05 are pure-model before shell; 05-06 closes persistence and the gate. The ordering is sound, but the critical path has no parallel fallback if 05-01 slips.
- **Shared seam risk:** 05-01 and 05-06 both assume the save writer validates the new invariant. Neither plan explicitly extends `isEncodedSaveValid`; this is the highest-leverage cross-plan fix.
- **Shared format risk:** 05-04 and 05-05 disagree on whether removal prices are `20 Cr` or `20.0 Cr`; this is a plan-to-test contract mismatch, not just a cosmetic issue.
- **Shared test-oracle risk:** 05-02’s implementation-generated goldens, 05-04’s exact Lave strings, and 05-05’s exact F3 strings all derive from the same research. A research arithmetic error can therefore propagate through the phase without an independent check.
- **Deliberate deviations are mostly documented:** missile removal no-refund (05-03), berth 8250 vs 82.5 Cr (05-03), missile cap 3 vs Oolite 4 (05-03), market non-persistence (05-06), older-build forward incompatibility (05-02). The no-refund one deserves explicit user sign-off because it changes the economic outcome, not just the data shape.
- **Strengths across plans:** all keep `src/sim` DOM/Three-free, all use `textContent`, all avoid new dependencies, and all use container-only evidence (`docker compose run --rm test/e2e/verify`).

## Overall Risk Assessment

**Overall: HIGH.**

Requirement coverage is complete and the architecture is faithful to the existing seams, but three issues dominate:

1. **05-01 is a maximum-blast-radius tracer.** One task rewrites content, economy, profile, save, input, UI and e2e, and deletes the existing panel. A partial pass can leave the app unbootable.
2. **The save invariant is enforced on read but not on write.** `isEncodedSaveValid` (`src/persistence/save.ts:233-240`) does not run the new capacity/allow-list check, so the “never replace the last good save” guarantee is incomplete.
3. **The kg/g capacity formula is wrong in the general case.** `availablePods * podSize + safeMax - alreadyHeld` (`05-02-PLAN.md:127`) under-allows when the same kg/g good is already held, and the planned tests do not cover that case.

Secondary risks: self-referential market goldens, the `20 Cr` vs `20.0 Cr` contract mismatch, the double-confirm in 05-06, and the missing first-boot `arrival === 0` assertion.

Recommended next reviewer: **correctness/algorithm**, focused on the kg/g buy-limit derivation, the save writer/parser invariant parity, and the arrival-counter lifecycle. Then **architect**, focused on splitting 05-01 to reduce the tracer’s blast radius.

**Per-plan risk levels:** 05-01 **HIGH**, 05-02 **MEDIUM**, 05-03 **MEDIUM**, 05-04 **LOW-MEDIUM**, 05-05 **MEDIUM**, 05-06 **MEDIUM-HIGH**.
