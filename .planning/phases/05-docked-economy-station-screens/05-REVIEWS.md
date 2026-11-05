---
phase: 5
reviewers: [correctness, architect-gpt, context-gemini, algorithm-kimi, adversarial-grok]
reviewed_at: 2026-11-05T20:30:29Z
plans_reviewed:
  - .planning/phases/05-docked-economy-station-screens/05-01-PLAN.md
  - .planning/phases/05-docked-economy-station-screens/05-02-PLAN.md
  - .planning/phases/05-docked-economy-station-screens/05-03-PLAN.md
  - .planning/phases/05-docked-economy-station-screens/05-04-PLAN.md
  - .planning/phases/05-docked-economy-station-screens/05-05-PLAN.md
  - .planning/phases/05-docked-economy-station-screens/05-06-PLAN.md
models:
  correctness: "opencode-go/deepseek-v4.1-flash#high"
  architect-gpt: "github-copilot/gpt-6.1-terra#xhigh"
  context-gemini: "opencode-go/gemini-4-argon#high"
  algorithm-kimi: "opencode-go/kimi-k3.1-pro#max"
  adversarial-grok: "opencode-go/grok-4.7#xhigh"
model_sources:
  correctness: "opencode.json agents.reviewer-triage-deepseek-v4-1-flash.model"
  architect-gpt: "opencode.json agents.reviewer-architect-gpt-6-1-terra.model"
  context-gemini: "opencode.json agents.reviewer-context-gemini-4-argon.model"
  algorithm-kimi: "opencode.json agents.reviewer-algorithm-kimi-k3-1-pro.model"
  adversarial-grok: "opencode.json agents.reviewer-adversarial-grok-4-7.model"
---

# Cross-AI Plan Review — Phase 5

Five independent reviewer models reviewed the six Phase 5 plans against the repository, the planning artifacts, and the upstream Oolite checkout. All five covered every plan id. These are reviews of the plans as written — the Phase 5 implementation and its tests do not exist yet, so a planned test is treated as intent, not as passing evidence.

<!-- gsd:plan-revision-conflicts:begin -->
<!-- gsd:plan-revision-conflicts:end -->


## Correctness Review (DeepSeek V4.1 Flash)

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

---


## Architecture Review (GPT-6.1 Terra)

# Phase 5 architectural plan review

The Phase 5 implementation and its proposed tests do not yet exist. Findings below distinguish the current source from planned behavior; proposed tests are not evidence that a behavior has passed.

## 05-01

### Summary
The tracer joins content generation, input, session state, and persistence in one vertical slice. Its integration with existing keyboard capture and save-failure handling needs explicit attention before implementation.

### Strengths
- The content change belongs in the existing compiler: `tools/oolite-ingest/generate.ts:112` already parses the descriptions alongside trade goods, while `tools/oolite-ingest/convert/commodities.ts:173` currently copies the unresolved name. Passing the parsed descriptions through the converter keeps generated data authoritative.
- Keeping the cargo and credit snapshot together builds on `src/persistence/autosave.ts:38` and the serialized IndexedDB writer at `src/persistence/idb-store.ts:130`, rather than introducing a second persistence path.

### Concerns
- **HIGH — Capture-phase input races the controls capture UI.** The plan moves the game keydown listener to window capture (`.planning/phases/05-docked-economy-station-screens/05-01-PLAN.md:205`). The session attaches game input before creating the controls panel (`src/app/game-session.ts:1094`, `src/app/game-session.ts:1114`); the panel installs its own window capture listener later (`src/ui/controls.ts:134`). Its `stopPropagation()` (`src/ui/controls.ts:140`) cannot undo an earlier listener on the same target. For example, capturing `KeyP` can also toggle pause and close the panel. The planned DOM-free input tests do not exercise this listener ordering.
- **HIGH — A displayed successful trade is not necessarily durable.** The plan commits the profile before the asynchronous autosave (`.planning/phases/05-docked-economy-station-screens/05-01-PLAN.md:207`). `src/app/game-session.ts:467` handles failed writes without notifying the player, and only a subset of failures sets `saveUnavailable` (`src/app/game-session.ts:472`). A quota or transaction failure can therefore leave a player believing a trade is saved while reload restores the previous balance and hold. The tracer waits for a successful commit (`05-01-PLAN.md:209`) and does not cover this failure.

### Suggestions
- Add an explicit modal/capture input context or central dispatcher that suppresses gameplay before a rebinding event is processed; test rebinding an already-bound pause or launch key in a browser.
- Expose pending and failed save status in the station UI, preserve a retry path, and test a rejected IndexedDB write and an immediate reload.

### Risk Assessment
**HIGH** — Both issues cross existing subsystem boundaries and affect established controls or progress durability.

## 05-02

### Summary
The trading expansion has a concrete pod-capacity error and a circular fidelity test strategy. Both should be corrected before its limits and goldens become contracts for later plans.

### Strengths
- Replanning before applying a trade follows the existing defense-in-depth purchase pattern: `src/app/game-session.ts:354` checks eligibility before `src/sim/player/profile.ts:131` applies the purchase.
- The plan keeps generated coefficients as inputs rather than adding a second commodity table; the current compiler already sorts and rejects duplicate sort orders (`tools/oolite-ingest/convert/commodities.ts:261`).

### Concerns
- **HIGH — The kg/g buy limit subtracts cargo already accounted for in used pods.** `.planning/phases/05-docked-economy-station-screens/05-02-PLAN.md:127` specifies `availablePods * podSize + safeMax - alreadyHeld`. With 19 t of Food and 600 kg of Gold, the 20-pod hold is full, so `availablePods = 0`; this formula clamps additional Gold to zero even though the existing Gold pod can hold up to 1,499 kg. Oolite's cargo calculation counts the existing pod (`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:9508`), and its purchase path explicitly considers space in an already-accounted-for pod (`PlayerEntity.m:10033`). Boundary tests limited to an initially empty safe will miss this case.
- **MEDIUM — Most golden rows are not independent fidelity evidence.** The fixture writer and test both call the implementation (`05-02-PLAN.md:159`); regenerating fixtures after a formula error makes them agree. The six food/computer anchors provide a partial independent check, but errors affecting other goods can still be blessed. Existing content tests explicitly pin independent anchor values for this reason (`tools/oolite-ingest/convert/commodities.test.ts:5`).

### Suggestions
- Derive the maximum additional quantity from the existing commodity's occupied pods plus free pods, or calculate the maximum final quantity and subtract the current amount. Test 499, 500, 600, 1,499 and 1,500 kg with both full and partially free holds, and equivalent gram boundaries.
- Commit an independently computed reference covering all goods and representative seeds, with provenance and a separate generator or reference calculation; retain implementation-generated goldens as regression snapshots, not the sole oracle.

### Risk Assessment
**HIGH** — The specified arithmetic refuses legitimate trades, and the planned test oracle can hide unrelated fidelity errors.

## 05-03

### Summary
The pure outfitting rules isolate tech-level and multiplicity decisions, but their deliberate no-refund policy conflicts with the content that the later UI is instructed to show.

### Strengths
- Explicit counts for missiles and berths avoid violating the current unique-equipment contract: `src/sim/player/profile.ts:135` refuses duplicate purchases and `src/persistence/save.ts:208` rejects duplicate saved keys.
- The raw-tech-level gate is consistent with the existing purchase rule (`src/sim/player/profile.ts:98`) and the compiled docking-computer price and TL (`src/content/generated/equipment.json:58`).

### Concerns
- **HIGH — Removal behavior and player-facing description disagree.** The plan charges 200 dc and removes all missiles with no refund (`.planning/phases/05-docked-economy-station-screens/05-03-PLAN.md:162`), while the generated description says the weapons are resold at full market value (`src/content/generated/equipment.json:243`). Plan 05-04 explicitly displays that description (`05-04-PLAN.md:172`). A player following the displayed text loses all missiles and pays the fee instead of receiving the promised proceeds. The no-refund policy itself is a locked decision; the misleading presentation is not necessary to implement it.

### Suggestions
- Provide an explicit, truthful application-side description for this deliberately divergent removal action, without hand-editing generated content; assert the detail and confirmation together with the exact credit delta.

### Risk Assessment
**HIGH** — A normal, irreversible purchase presents a materially false financial consequence.

## 05-04

### Summary
Pure projections are a good boundary for screen data, but the model must project the actual transaction total and the project's intentional equipment deviations truthfully.

### Strengths
- The F7 label and value projections have concrete generated inputs: `src/content/generated/labels.json:13` contains the title and `:35`–`:46` contain the population, productivity, radius and tech-level templates. `src/content/schemas/labels.ts:18` validates the record shape.
- Rendering model strings through the existing text-only UI pattern avoids interpreting content as markup; the current equipment catalogue parser validates records before use (`src/content/equipment.ts:41`).

### Concerns
- **HIGH — The planned missile-removal detail promises an outcome the rule denies.** `05-04-PLAN.md:172` takes the selected catalogue description verbatim, but `src/content/generated/equipment.json:243` promises full-value resale and `05-03-PLAN.md:162` explicitly implements no refund. This passes row/reason tests unless the description's semantics are asserted.
- **MEDIUM — Confirmation total is ambiguous for quantities greater than one.** `05-04-PLAN.md:206` uses `priceText` for both a row's unit price and the confirmation, while the sole exact confirmation anchor at `05-04-PLAN.md:214` is for one tonne. If the row value is reused, buying 12 tonnes at 3.8 Cr displays 3.8 Cr instead of the 45.6 Cr total. The locked quantity confirmation explicitly requires the total (`.planning/phases/05-docked-economy-station-screens/05-CONTEXT.md:31`).

### Suggestions
- Project a truthful removal description from an explicit app-side override and test it against the actual no-refund effect.
- Name unit price and pending total separately; construct confirmation from the approved integer `TradePlan.cost` and test multi-unit buys and sells.

### Risk Assessment
**HIGH** — Incorrect descriptions or totals can cause players to approve financially different transactions from those performed.

## 05-05

### Summary
The screen wiring exercises real browser input, but its proposed browser-shortcut proof and title-start setup are weaker than the stated no-reload and keyboard-only claims.

### Strengths
- Rechecking outfit eligibility in the session follows the existing UI-independent purchase gate (`src/app/game-session.ts:354`), while the existing pause overlay owns its own focus (`src/ui/pause.ts:82`).
- Retaining `#docked` and the message field preserves existing launch/autosave integration surfaces, which current browser tests use (`tests/e2e/autosave.spec.ts:233`).

### Concerns
- **MEDIUM — Navigation entry count does not establish that F5 did not reload.** `05-05-PLAN.md:174` proposes checking `performance.getEntriesByType("navigation").length === 1`; after a reload the new document normally also has one navigation entry. A transient reload can therefore satisfy that assertion. The configured browser is Chromium only (`playwright.config.ts:14`), so the assertion also does not establish Firefox or Safari shortcut behavior.
- **MEDIUM — Programmatic focus is not a keyboard reachability proof.** The planned test focuses `#title-start` directly before pressing Enter (`05-05-PLAN.md:174`); the existing title controller's `show()` only unhides the root (`src/ui/title.ts:156`). This verifies activation of an already-focused button, not that a keyboard user can reach it from the initial page focus. Whether the actual initial tab order is sufficient remains an open question.

### Suggestions
- Assert a document-lifetime sentinel or observe main-frame navigation, and verify station state remains intact after F5; separately exercise F3 and F7 and record the browser coverage limits.
- Start at the actual initial focus and navigate to New game using keyboard input alone; cover the existing confirmation dialog when a save is present (`src/ui/title.ts:84`).

### Risk Assessment
**MEDIUM** — The implementation may work, but the specified proof can pass without establishing its advertised browser and accessibility guarantees.

## 05-06

### Summary
The hardening plan tests important parse boundaries but leaves the writer's semantic validation and backward-build behavior inconsistent with its preservation claims.

### Strengths
- The existing store resolves writes only after the IndexedDB transaction completes (`src/persistence/idb-store.ts:154`) and serializes operations (`src/persistence/idb-store.ts:135`); waiting for `committed` is stronger than waiting for a put request.
- Unknown and duplicate-key rejection extends an established trust boundary: `src/persistence/save.ts:206` validates equipment references after strict parsing, and `src/main.ts:111` builds allow-lists from loaded content.

### Concerns
- **HIGH — Parser-only capacity checks do not protect the previous good save at write time.** The plan adds cargo allow-list and capacity checks to `parseSave` (`05-06-PLAN.md:129`), but `queueAutosave` calls `isEncodedSaveValid` (`src/persistence/autosave.ts:64`), which currently checks only size and schema (`src/persistence/save.ts:233`). If an internal state bug produces schema-valid but over-capacity cargo or an unknown key, the writer can replace a valid save with a blob the next boot marks corrupt. The proposed tests cover corrupt input on read, not semantic rejection before overwrite.
- **HIGH — New v1 fields are destructive on an older build.** The plan deliberately writes optional fields without changing the version (`05-01-PLAN.md:204`; caveat recorded in `05-06-PLAN.md:137`). The shipped old strict schema (`src/persistence/save.ts:78`) rejects those keys as `corrupt` (`src/persistence/save.ts:194`), not `future-version`. Boot makes a best-effort backup (`src/main.ts:145`), and New game can clear that corrupt primary (`src/app/game-session.ts:418`, `:484`). A rollback or stale cached build can therefore discard the only active progress copy, contrary to the future-version protection. This caveat is documented and the additive-v1 decision is recorded in `.planning/PROJECT.md:103`; resolving it requires revisiting that decision, not silently changing it.
- **MEDIUM — The proposed purity guard names the wrong relative type-door path.** `05-06-PLAN.md:202` refers to `../content/types.js`, but a file in `src/sim/economy/` or `src/sim/player/` needs `../../content/types.js`, as the analogous nested sim module demonstrates (`src/sim/flight/config.ts:15`). An exact-string allow-list would either fail legitimate imports or encourage weakening the guard. The proposed negative probe alone does not prove correct positive coverage.

### Suggestions
- Apply the same semantic checks and allow-lists to snapshots before committing, and test that an invalid snapshot leaves the prior IndexedDB bytes untouched.
- Reconsider the published wire-version decision with the owner: a versioned reader/writer or another explicit compatibility design must cause older builds to preserve, rather than classify, new saves. Add an old-build rollback test.
- Resolve import paths rather than matching one relative spelling, and add positive and negative guard cases for nested economy and player modules.

### Risk Assessment
**HIGH** — A schema-valid invalid snapshot or a rollback can compromise the only active save; existing success-path commit tests do not cover either mechanism.

## Cross-Plan Comparison

- Plans 05-03 and 05-04 separately look internally consistent, but together combine a no-refund rule with an upstream resale promise (`05-03-PLAN.md:162`, `src/content/generated/equipment.json:243`, `05-04-PLAN.md:172`). The rule and its projected copy need one explicit contract.
- Plans 05-01 and 05-06 share persistence responsibilities: an atomic snapshot prevents a split credit/cargo write, but it does not make a failed write durable or make the writer apply the parser's semantic checks (`src/persistence/autosave.ts:64`, `src/persistence/save.ts:233`).
- Plans 05-02 and 05-04 share transaction amounts: the approved total should be passed as data to the confirmation, rather than inferred from a displayed unit-price string (`05-02-PLAN.md:134`, `05-04-PLAN.md:206`).
- Plan 05-01's input-context change affects existing pause and rebinding controllers, not just the new screens (`src/app/game-session.ts:1094`, `src/ui/controls.ts:134`). Plan 05-05's screen-only browser proof should include that regression.

## Overall Risk Assessment

**HIGH.** Correct the existing-pod limit, the misleading missile-removal detail, and the persistence writer/failure contracts before treating the phase gate as proof of the economy loop. Resolve the acknowledged older-build save risk with an explicit decision. Proposed tests and unimplemented files were reviewed as plans, not reported as passing behavior.

---


## Blast-Radius Review (Gemini 4 Argon)

# Phase 5 ("Docked Economy & Station Screens") — Cross-Repository Impact Review

## 05-01

### Summary
Plan `05-01` establishes the end-to-end vertical tracer for Phase 5: extending `CommoditySchema` and `tools/oolite-ingest/convert/commodities.ts` with `peakExport`/`peakImport` and resolved display names from `descriptions.plist`, adding the `CommodityUnit` type-only door to `src/content/types.ts`, implementing the pure Oolite RANROT PRNG (`src/sim/economy/ranrot.ts`), market generator (`src/sim/economy/market.ts`), pod/hold accounting (`src/sim/economy/cargo.ts`), and buy path (`src/sim/economy/trade.ts`), extending `PlayerProfile` and `SaveV1Schema`, introducing input contexts in `src/input/{actions,keyboard}.ts`, replacing `src/ui/docked.ts` with `src/ui/station.ts`, and wiring the Lave F8 buy-confirm-autosave-reload loop in `src/app/game-session.ts`. While the content pipeline, RANROT math, and save-schema ordering are grounded in the repository's existing patterns, whole-repo blast-radius analysis reveals several concrete collisions with existing DOM/CSS selectors, Playwright locators, key-rebinding conflict detection, pause/focus-loss input handling, and existing unit tests that `05-01`'s scoped `<verify>` command does not run.

### Strengths
- **Preserves the `failure-contract.test.ts` first-issue invariant (`tools/oolite-ingest/failure-contract.test.ts:72-97, 144-170`, `tests/fixtures/schemas/commodity-invalid.json:1-40`):** In Zod 4 (`z.strictObject`), missing required field issues are emitted before `unrecognized_keys`. Step 1 explicitly updates both records in `tests/fixtures/schemas/commodity-invalid.json` with valid `peakExport`/`peakImport` integers so `schemaErrorFor("bad_field")` continues to report `commodities.bad_field.unexpectedField` as `result.error.issues[0]`.
- **Reuses already-parsed `descriptions.plist` in the content generator (`tools/oolite-ingest/generate.ts:112-126, 140`, `third_party/oolite/Config/descriptions.plist:2140-2160`):** `generateContent` already parses `Config/descriptions.plist` in its `Promise.all` for `emitLabels(descriptions)`. Passing `descriptions` into `emitCommodities(commodities, descriptions)` avoids a duplicate file read and resolves all 17 `commodity-name <key>` entries (including underscore keys `liquor_wines`, `gem_stones`, `alien_items` at `descriptions.plist:2158-2160`) at build time.
- **Maintains the `src/sim` content boundary via `src/content/types.ts` (`src/content/types.ts:19`, `eslint.config.js:93-109`, `tests/guards/content-boundary.test.ts:186-206`):** Exporting `type { CommodityUnit }` from `src/content/types.ts` allows `src/sim/economy/cargo.ts` to type `podsFor` and `holdPodsUsed` without importing `src/content/schemas/commodity.ts` (which is denied by `eslint.config.js:105`).
- **Matches upstream Oolite RANROT and market generation order (`src/sim/hash.ts:12-21`, `/home/opencode/git/oolite/src/Core/legacy_random.c:87-145`, `/home/opencode/git/oolite/src/Core/OOCommodities.m:261-278, 383-452`):** Computing quantity before price, consuming four `randf()` draws per commodity (including `alien_items`), capping stock at `127` before price generation, and wrapping intermediates in `Math.fround` reproduces the exact Oolite arithmetic.

### Concerns
- **[HIGH] Adding a `<footer>` element inside `#docked` breaks `tests/e2e/precision.spec.ts:72-74`, `tests/e2e/fallback.spec.ts:62`, and collides with the unqualified `footer` CSS rule in `index.html:311-321` (`05-01-PLAN.md:206`, `05-RESEARCH.md:885`, `05-PATTERNS.md:905-908`):**
  - `index.html:434-439` already contains a document-level `<footer>` with the trademark/non-affiliation disclaimer, styled by the bare element selector `footer { position: fixed; bottom: 0; left: 0; right: 0; ... pointer-events: none; }` at `index.html:311-321`.
  - `tests/e2e/precision.spec.ts:72-74` (while docked) runs `const footer = page.locator("footer"); await expect(footer).toContainText("unofficial fan project");`, and `tests/e2e/fallback.spec.ts:62` runs `await expect(page.locator("footer")).toBeVisible();`.
  - In Playwright, `expect(page.locator("footer")).toContainText(...)` and `expect(page.locator("footer")).toBeVisible()` enforce strict single-element resolution across the DOM (even if `#docked` is `hidden`). Introducing a second `<footer>` inside `#docked` causes both specs to fail with `Error: strict mode violation: locator('footer') resolved to 2 elements`, and applies `position: fixed; bottom: 0; font: 12px/1.4 monospace; pointer-events: none` from `index.html:311` to the station footer, overlapping the legal disclaimer. Because `05-01-PLAN.md:218` does not run `precision.spec.ts` or `fallback.spec.ts`, this regression stays hidden until `05-06`.
- **[HIGH] Pause and focus-loss while inside a station section (`dockScreen`) breaks `KeyP`/`Escape` unpausing, traps `Tab` inside `#pause`, and suppresses `Enter` clicks on pause buttons (`src/main.ts:295-308`, `src/app/game-session.ts:502-530, 916-966`, `src/input/keyboard.ts:196-210`, `05-01-PLAN.md:205, 207`):**
  - `src/main.ts:295-308` calls `session.pause()` on `window` `blur` and `document` `visibilitychange` regardless of whether the player is in `flight`, `dockHome`, or `dockScreen`.
  - Step 5 sets `ACTION_CONTEXTS.pause = ["flight", "dockHome"]`, `ACTION_CONTEXTS.stationPageNext = ["dockScreen"]` (`Tab`), and `ACTION_CONTEXTS.stationConfirm = ["dockScreen"]` (`Enter`, `KeyY`), and attaches `keyboard.ts`'s `onKeyDown` in the **capture phase**.
  - When `pause()` is triggered while in `dockScreen` (or if `paused === true`):
    1. `KeyP` and `Escape` cannot unpause because `pause` is excluded from `dockScreen`; instead `Escape` queues `stationBack` while the pause overlay stays stuck open.
    2. Pressing `Tab` inside `#pause` (`src/ui/pause.ts:62-80`) hits `keyboard.ts`'s capture-phase `onKeyDown` first, which matches `stationPageNext` in `dockScreen` and calls `event.preventDefault()`, breaking focus movement in `#pause`.
    3. Pressing `Enter` on a focused button in `#pause` (e.g. `Resume`) hits `keyboard.ts`'s capture-phase `onKeyDown`, matches `stationConfirm` (`Enter`), and calls `event.preventDefault()` on `keydown`, which in HTML/Chromium suppresses the synthetic `click` activation on `<button>`.
    4. In `src/app/game-session.ts:960-966`, the `else` (`paused`) branch calls `currentInput.drainCommands()` but does not drain/discard `drainStationActions()`, so station keys pressed while paused either execute behind the pause overlay (if drained before `if (!paused)`) or queue up and fire on resume.
- **[HIGH] `detectConflict` in `src/input/bindings.ts:66-76` and `src/ui/controls.ts:185` are context-unaware and break rebinding when station `ActionId`s are added (`05-01-PLAN.md:205`, `src/input/bindings.ts:54-94`, `src/ui/controls.ts:183-205`):**
  - Step 5 adds station actions to `ActionId` and `ACTION_IDS` with default codes that intentionally share keys across disjoint `InputContext`s (`ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight` shared with `pitchForward`/`pitchBack`/`rollLeft`/`rollRight`; `Escape` shared between `pause` and `stationBack`) plus `stationSellMax`/`stationBuyMax` with empty default bindings `[]`.
  - `detectConflict(map, action, code)` in `src/input/bindings.ts:66-76` checks `for (const other of ACTION_IDS)` without checking whether `ACTION_CONTEXTS[action]` and `ACTION_CONTEXTS[other]` overlap. Consequently, `bindAction(map, "rollRight", "ArrowRight")` fails with `{ ok: false, conflict: "stationRight" }`, `bindAction(map, "pause", "Escape")` fails with `{ ok: false, conflict: "stationBack" }`, and a player who rebinds an arrow key in Controls can never rebind it back without resetting all settings.
  - Furthermore, `src/ui/controls.ts:185` iterates `for (const action of ACTION_IDS)` and renders a rebind row for every `ActionId`. Adding `stationSellMax` and `stationBuyMax` to `ACTION_IDS` with empty default bindings `[]` renders two misleading `(unbound)` rows in the Controls panel, and `src/ui/controls.ts:29-35` (`RESERVED_CODES`) blocks `F5` and `Tab` without blocking `F3`/`F7`/`F8`.
- **[HIGH] `state.keyDown("KeyC")` in `tests/input/bindings.test.ts:216-222` will break if `keyDown` returns `"consumed"` only when `firing.length > 0` (`src/input/keyboard.ts:95-125`, `05-01-PLAN.md:205`):**
  - Step 5 states: `return "consumed" only when a context-valid action fired or the code is a browser-reserved key, so Tab is not trapped outside a screen`.
  - Existing test `tests/input/bindings.test.ts:220` asserts `expect(state.keyDown("KeyC")).toBe(true)` when plain `KeyC` (without Shift) is pressed in `"flight"`, even though `dockingComputer` is in `SHIFT_REQUIRED_ACTIONS` so `firing` is empty (`[]`).
  - Additionally, `tests/input/bindings.test.ts:160-319` calls `createInputState()` without calling `setContext()`. If `createInputState()` does not default `context` to `"flight"` AND return `true` whenever `inContext.length > 0 || RESERVED_KEYS.has(code)` (checking context validity *before* `SHIFT_REQUIRED_ACTIONS` filtering), `tests/input/bindings.test.ts` fails. Notice `05-01-PLAN.md:214` does not include `tests/input/bindings.test.ts` in its `<verify>` command.
- **[MEDIUM] `tests/e2e/launch.spec.ts:141-143, 207` requires `[data-field="message"]` to update during `renderFrame(0)` and to be `""` when no hint/message is active (`src/app/game-session.ts:878-893, 1156-1167`, `05-01-PLAN.md:1648, 206, 207`):**
  - In `src/app/game-session.ts:1157-1166`, the station shell is shown before `renderFrame(0)` calls `showHint(currentState)` (`game-session.ts:873`). If `setStationMessage(hint)` does not immediately write to the DOM `[data-field="message"]` (because Step 7 says "Render only on state change"), `tests/e2e/launch.spec.ts:142` (`await expect(dockedMessage).toContainText("to launch")`) will fail.
  - Conversely, `tests/e2e/launch.spec.ts:207` asserts `await expect(page.locator('#docked [data-field="message"]')).toHaveText("")` after reload when `"launch"` is already in `hintsSeen`. Truth 6 (`05-01-PLAN.md:1648`) says "with no selection and no pending trade the footer shows only key hints"; those key hints must be written to a separate element (e.g. `[data-field="station-keys"]`), never into `[data-field="message"]`.
- **[MEDIUM] Rewriting `tests/e2e/docking.spec.ts:371-473` risks deleting the only browser test for `SHIFT_REQUIRED_ACTIONS` rebinding (`tests/e2e/docking.spec.ts:451-470`, `05-01-PLAN.md:209`):**
  - `tests/e2e/docking.spec.ts:451-470` tests opening `#pause` -> `#controls`, verifying `Docking computer` shows `Shift+C`, and rebinding it to `KeyK` (`Docking computer bound to Shift+K.`). Step 9 says to rewrite the Lave test in `docking.spec.ts` to assert home screen fields, without mentioning preserving lines 451–470.
- **[MEDIUM] `parseSave` capacity check can be bypassed by negative `capacityPodsFor` or untradeable `alien_items` in `SaveAllowLists.commodities` (`src/persistence/save.ts:206-222`, `src/main.ts:119-135`, `05-01-PLAN.md:203, 204`):**
  - If `capacityPodsFor(equipment, berths)` clamps its return value at `0` (`Math.max(0, 20 + ... - 5 * berths)`), then a forged save with `equipment: []`, `passengerBerths: 7` (35 t of berths in a 20 t hull), and `cargo: []` yields `holdPodsUsed (0) <= capacityPodsFor (0)` and is accepted as valid instead of `corrupt`.
  - If `src/main.ts` builds `allowLists.commodities` from all 17 entries of `loadCommodities()` without filtering `c.tradeable` (or if `parseSave` does not reject `alien_items`), a forged save with `cargo: [{ key: "alien_items", quantity: 5 }]` passes `parseSave` and permanently consumes 5 pods of hold space that cannot be sold on F8 and do not appear in F5's 16-row manifest.

### Suggestions
- Use `<div class="station-footer">` (or `<div role="contentinfo">` / scoped class) instead of `<footer>` inside `#docked`, and scope `index.html:311` to `body > footer` so `page.locator("footer")` in `tests/e2e/precision.spec.ts:72` and `tests/e2e/fallback.spec.ts:62` continues to resolve to a single element.
- In `src/app/game-session.ts` and `src/input/keyboard.ts`, make pause orthogonal to `InputContext`: when `paused === true`, do not consume `Tab` or `Enter` in `keyboard.ts` (`onKeyDown` should let `Escape`/`KeyP` toggle pause in all contexts including `dockScreen`, or `session.pause()` should suspend station key consumption and `frame()`'s `paused` branch must call `currentInput.drainStationActions()`).
- In `src/input/keyboard.ts`, initialize `context = "flight"` by default in `createInputState`, and return `true` from `keyDown` when `inContext.length > 0 || RESERVED_F_KEYS.has(code)` (before filtering `SHIFT_REQUIRED_ACTIONS`) so `tests/input/bindings.test.ts:220` (`state.keyDown("KeyC") === true`) stays green.
- Make `detectConflict` in `src/input/bindings.ts:66-76` only report a conflict when two actions share at least one `InputContext`, and do not expose `stationSellMax`/`stationBuyMax` as `(unbound)` rows in `src/ui/controls.ts:185`.
- Add `tests/input/bindings.test.ts`, `tests/settings/schema.test.ts`, `tests/e2e/precision.spec.ts`, and `tests/e2e/fallback.spec.ts` to `05-01-PLAN.md`'s `<verify>` commands.
- Keep `capacityPodsFor(equipment, berths)` unclamped (`20 + (hasCargoBay ? 15 : 0) - 5 * berths`) and require `capacityPods >= 0 && holdPodsUsed <= capacityPods` in `parseSave`; exclude `alien_items` (`!c.tradeable`) from `SaveAllowLists.commodities` (or reject untradeable cargo in `parseSave`).

### Risk Assessment
**HIGH** — `05-01` touches 33 files across every architectural layer in a single task, and without the adjustments above it will break `tests/e2e/precision.spec.ts:72`, `tests/e2e/fallback.spec.ts:62`, `tests/input/bindings.test.ts:220`, key rebinding in `src/input/bindings.ts:66`, and pause/blur behavior while inside a station screen.

---

## 05-02

### Summary
Plan `05-02` expands the trading layer to cover selling (`planSell`/`applySell`), `kg`/`g` pod and "safe" boundary arithmetic (`499`/`500` kg and `499,999`/`500,000` g), clamp and refusal reporting, fast-check property tests, implementation-generated golden fixtures for Lave (`g0-s7`), Zaonce (`g0-s129`), and Leesti (`g0-s55`), determinism/economy-only proofs, and `.planning/PROJECT.md` decision records. Verified against `/home/opencode/git/oolite/src/Core/OOCommodities.m` and `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m`, the computed anchor values in Task 2 (`Lave food 38/16, computers 902/0; Zaonce food 70/8, computers 682/43; Leesti food 62/10, computers 731/30`) match the exact `Math.fround` + RANROT + `fnv1a32` implementation. However, Task 1's description of plain `stationRight`/`stationLeft` conflicts with D-06 and `05-06` Task 2, and `TradePlan`'s optional properties need explicit care under `tsconfig.json`'s `"exactOptionalPropertyTypes": true`.

### Strengths
- **Verified fidelity anchors match the exact `OOCommodities.m` float32 + RANROT calculation (`05-02-PLAN.md:2065`, `/home/opencode/git/oolite/src/Core/OOCommodities.m:261-278, 383-452`, `third_party/oolite/Config/trade-goods.plist:1-317`):** Executing the exact `Math.fround` formula with `fnv1a32("g0-s7:0") = 0xd3515f15`, `fnv1a32("g0-s129:0") = 0xb2a31a0a`, and `fnv1a32("g0-s55:0") = 0xdccb7b32` produces `food 38/16, computers 902/0` at Lave, `food 70/8, computers 682/43` at Zaonce, and `food 62/10, computers 731/30` at Leesti.
- **Exact Oolite pod and "safe" arithmetic (`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.h:1294-1297`, `PlayerEntity.m:9508-9545, 10033-10050`, `05-02-PLAN.md:2033-2034`):** Using `Math.trunc((podSize - safe - 1 + quantity) / podSize)` and `availablePods * podSize + safeMax - alreadyHeld` faithfully reproduces Oolite's 499 kg / 499,999 g zero-pod safe, including buying up to 499 kg of gold when all 20 cargo pods are full.
- **Committed fixture generator (`tests/helpers/write-market-goldens.ts`, `05-02-PLAN.md:2065`):** Generating `tests/golden/market/{lave,zaonce,leesti}.json` from `generateMarket` rather than hand-copying markdown tables prevents transcription drift while pinning the seed and all 17 rows.

### Concerns
- **[HIGH] Contradictory specification of plain `stationRight`/`stationLeft` between `05-02` Task 1 (`05-02-PLAN.md:2040`) and `05-06` Task 2 (`05-06-PLAN.md:3059, 3068`) / D-06 (`05-CONTEXT.md:170`):**
  - `05-02-PLAN.md:2040` states: `"Wire the session's sell and maximum paths: plain stationRight plans a buy of one, plain stationLeft plans a sell of one, stationBuyMax plans the feasible maximum buy and stationSellMax the feasible maximum sell"`.
  - However, D-06 (`05-CONTEXT.md:170`) states `"arrow keys change by one unit"` (e.g. `Buy 12 t Food for 45.6 Cr? [Y/N]`), `05-01-PLAN.md:207` states `"plain right/left steps one unit"`, and `05-06-PLAN.md:3059, 3068` explicitly tests: `"two ArrowRight presses then KeyY buy 2 t Food, so probe.economy.cargo.food === 2"`.
  - If `05-02` Task 1 overwrites `game-session.ts` so plain `stationRight` always calls `planBuy(..., 1)` instead of stepping the pending buy amount (`(pending?.side === "buy" ? pending.amount : 0) + 1`), then pressing `ArrowRight` twice will only ever plan `1 t`, breaking multi-unit purchases and failing `05-06` Task 2.
- **[MEDIUM] `stationBuyMax` / `stationSellMax` vs `plan.clamp` semantics are underspecified (`05-02-PLAN.md:2040`, `05-04-PLAN.md:2571, 2575`):**
  - If `stationBuyMax` (`Shift+Right`) calls `planBuy(market, profile, commodity, Infinity)` (or `127`), `requested` exceeds `feasible` (`16` for Lave Food), so `planBuy` sets `plan.clamp = "noStock"`.
  - In `05-04-PLAN.md:2571`, `buildMarketModel` defines `pendingText` as `"the exact D-06 confirmation for the pending side/key/amount, or the refusal/clamp copy"`. If `plan.clamp` is set on `Shift+Right` and replaces the confirmation text, pressing `Shift+Right` will show `"Only 16 t available"` instead of `"Buy 16 t Food for 60.8 Cr? [Y/N]"`.
  - Similarly, when a request *is* clamped (`ok: true`, `amount > 0`, `clamp !== undefined`), the player still needs to see the `[Y/N]` confirmation for the clamped amount alongside the clamp explanation.
- **[MEDIUM] Clamp priority order when multiple limits bind or when `requested > feasible > 0` (`05-02-PLAN.md:2033, 2040`, `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:10023-10050`):**
  - `05-02-PLAN.md:2040` says `"Clamp in a fixed order and report which limit bound the result"`. In `PlayerEntity.m:10023-10050`, Oolite clamps sequentially: first to `stock` (`noStock`), then if `purchase * price > credits` to `floor(credits / price)` (`insufficientCredits`), then if `purchase` exceeds hold space to `availableSpace` (`holdFull`).
  - If an implementer checks `stock === 0`, `credits < price`, `holdLimit === 0` in one order for `ok: false` (`amount === 0`) but uses `Math.min` for `amount > 0` without tracking which step strictly reduced `amount` last, a request of `10 t` when `stock = 8` and `affordable = 2` could wrongly report `clamp: "noStock"` instead of `clamp: "insufficientCredits"`.
- **[LOW] `TradePlan` optional fields under `"exactOptionalPropertyTypes": true` (`tsconfig.json:10`, `05-RESEARCH.md:712-717`, `05-02-PLAN.md:1942`):**
  - `tsconfig.json:10` enables `"exactOptionalPropertyTypes": true`. Declaring `readonly refusal?: TradeRefusal; readonly clamp?: TradeRefusal;` without `| undefined` causes `tsc` to reject `{ ok: true, amount, cost, clamp }` when `clamp` has type `TradeRefusal | undefined`.

### Suggestions
- Clarify in `05-02` Task 1 that `stationRight` increments a pending buy by `+1` (or starts a buy of `1` when `pending === null`, or decrements a pending sell by `-1`), and `stationLeft` increments a pending sell by `+1` (or starts a sell of `1` when `pending === null`, or decrements a pending buy by `-1`), so `ArrowRight, ArrowRight, KeyY` buys 2 units as required by `05-06` Task 2.
- Specify that `stationBuyMax` / `stationSellMax` computes the feasible maximum and plans that exact amount (so `clamp` is `undefined` on `Shift+Arrow` when `feasible > 0`, and only `feasible === 0` reports the refusal reason), while stepping `ArrowRight`/`ArrowLeft` *above* `feasible` sets `clamp` and displays both the clamp reason and the `[Y/N]` confirmation.
- Explicitly state the sequential clamp reduction rule (`stock` -> `insufficientCredits` -> `holdFull`, where a later limit only overwrites `clamp` if it strictly reduces the running amount further).
- Declare `readonly refusal?: TradeRefusal | undefined; readonly clamp?: TradeRefusal | undefined;` on `TradePlan` (or use a discriminated union) to satisfy `tsconfig.json:10` (`exactOptionalPropertyTypes: true`).

### Risk Assessment
**MEDIUM** — The pure economy math and golden fixtures are well-specified and verified against Oolite source, but the `stationRight`/`stationLeft` stepping discrepancy with `05-06` and the `clamp` vs `pendingText` interaction will cause integration friction if not clarified before execution.

---

## 05-03

### Summary
Plan `05-03` implements `src/sim/player/outfitting.ts` as a pure simulation module governing the F3 outfitting screen: the 10-item `VISIBLE_EQUIPMENT_KEYS` peaceful set (D-11), raw tech-level gating (`System.techLevelRaw`), the five v1 condition rules (`requires_empty_pylon`, `requires_mounted_pylon`, `requires_free_passenger_berth`, `requires_cargo_space`, `requires_non_full_fuel`), dynamic fuel pricing (`(70 - fuel) * 2` dc), multi-instance counts for missiles (`0..3`) and passenger berths (`0..7`), immediate effects on `PlayerProfile`, and charge-only removal entries (`EQ_MISSILE_REMOVAL`, `EQ_PASSENGER_BERTH_REMOVAL`). The module boundaries and condition coercions match `src/content/generated/equipment.json` and `src/sim` purity rules well, with minor edge cases around defensive condition parsing and `.planning/PROJECT.md` cross-plan edits.

### Strengths
- **Defensive coercion of `Equipment.conditions` matches actual generated JSON types (`src/content/generated/equipment.json:27-30, 102-107, 225-229, 306-313, 322-327`, `05-03-PLAN.md:2261`):** Verified against `src/content/generated/equipment.json`, boolean-like flags are emitted as strings (`"requires_empty_pylon": "true"`, `"requires_mounted_pylon": "true"`, `"requires_free_passenger_berth": "true"`, `"requires_non_full_fuel": "true"`) while numeric values are emitted as numbers (`"requires_cargo_space": 5`, `"damage_probability": 0`). Coercing both string/boolean flags and `Number(c["requires_cargo_space"] ?? 0)` avoids a subtle type mismatch.
- **Correct resolution of the D-14 Passenger Berth price discrepancy (`src/content/generated/equipment.json:315-319`, `/home/opencode/git/oolite/Resources/Config/equipment.plist:242-245`, `05-03-PLAN.md:2291, 2297`):** `equipment.json:317` and upstream `equipment.plist` both price `EQ_PASSENGER_BERTH` at `8250` decicredits (`825.0 Cr`). Task 2 rightly uses the compiled catalogue price (`8250` dc) rather than D-14's prose typo (`82.5 Cr`) and documents the correction in `.planning/PROJECT.md`.
- **Clean separation between single-instance `equipment: readonly string[]` and multi-instance counters (`src/sim/player/profile.ts:136-137`, `src/persistence/save.ts:208-214`, `05-03-PLAN.md:2192, 2261`):** Keeping `missiles` and `passengerBerths` as integer counters on `PlayerProfile` preserves `profile.ts`'s and `save.ts`'s duplicate-key rejection on `profile.equipment`.

### Concerns
- **[MEDIUM] `checkFit` check order for removal items (`EQ_MISSILE_REMOVAL`, `EQ_PASSENGER_BERTH_REMOVAL`) vs `techLevel` (`src/content/generated/equipment.json:237-249, 321-334`, `05-03-PLAN.md:2254-2257, 2261`):**
  - Both `EQ_MISSILE_REMOVAL` and `EQ_PASSENGER_BERTH_REMOVAL` have `techLevel: 1` in `src/content/generated/equipment.json:248, 333`.
  - In Galaxy 0 (`src/content/generated/systems/g0.json`), several systems have `techLevelRaw: 0` (displayed TL 1).
  - Under Task 1's check order (`invalidPrice` -> `fullFuel` -> `techLevel` -> `owned` -> `multiplicity` -> `conditions` -> `credits`), at a `techLevelRaw === 0` system when `missiles === 0` or `passengerBerths === 0`, `checkFit` will return `refusal: "techLevel"` (`Requires TL 1`) instead of `"nothingToRemove"` if called before visibility filtering, and when `missiles > 0` at a `techLevelRaw === 0` system, the visible removal row will be dimmed with `"Requires TL 1"`. That is consistent with `techLevel: 1` in the catalogue, provided `buildOutfittingModel` (`05-04`) hides removal rows by checking `profile.missiles > 0` / `profile.passengerBerths > 0` directly rather than checking `checkFit(...) !== "nothingToRemove"`.
- **[LOW] `fitPrice` for `EQ_FUEL` when `profile.fuel > ctx.fuelCapacity` or `profile.fuel < 0` (`05-03-PLAN.md:2253-2254`):**
  - Task 1 states: `fitPrice(profile, item, ctx) returns item.price for a non-fuel item and (ctx.fuelCapacity - profile.fuel) * item.price for fuel; invalid cost returns 0.`
  - If `profile.fuel === ctx.fuelCapacity` (`70`), `(70 - 70) * 2` is `0`. `checkFit` must check `item.key === "EQ_FUEL"` (or `requires_non_full_fuel`) and return `"fullFuel"` *before* checking whether `fitPrice <= 0` returns `"invalidPrice"`, otherwise a full fuel tank (`fitPrice === 0`) will refuse as `"invalidPrice"` instead of `"fullFuel"`.
  - Look at `05-03-PLAN.md:2261`: `"Implement fitPrice and checkFit with the fixed check order above: invalid key/price, fuel/full tank, raw tech level..."`. Checking `item.price` validity (catalogue unit price `2 > 0`) in step 1 and then `profile.fuel >= ctx.fuelCapacity -> "fullFuel"` in step 2 before computing `cost = fitPrice(...)` avoids returning `"invalidPrice"` at `fuel === 70`.
- **[LOW] Unknown equipment keys outside `VISIBLE_EQUIPMENT_KEYS` passed to `checkFit` / `applyFit` (`05-03-PLAN.md:2261, 2297`):**
  - Task 1 says: `"Identify single-instance keys explicitly (cargo bay, docking computer, galactic hyperdrive, advanced compass, ANA) and multi-instance keys explicitly (missile, passenger berth, both removal entries)."`
  - What if a test or caller passes one of the other 31 equipment records from `equipment.json` (e.g. `EQ_ECM` or `EQ_ESCAPE_POD`, which are not in `VISIBLE_EQUIPMENT_KEYS`) to `checkFit` or `applyFit`? If `checkFit`/`applyFit` only branches on the 10 known keys without a fallback or visibility guard, an unlisted key could either be treated as a no-op or fail to append. Either refuse keys not in `VISIBLE_EQUIPMENT_KEYS` or treat any non-multi-instance key as single-instance in `equipment` while `VISIBLE_EQUIPMENT_KEYS` controls F3 visibility.

### Suggestions
- In `checkFit` (`src/sim/player/outfitting.ts`), validate `item.key` and `isValidPrice(item.price)` first, then check `item.key === "EQ_FUEL"` (`!Number.isSafeInteger(profile.fuel) || profile.fuel < 0 || !Number.isSafeInteger(ctx.fuelCapacity) -> "invalidPrice"`, `profile.fuel >= ctx.fuelCapacity -> "fullFuel"`), so a full tank (`fuel === 70`, where `fitPrice === 0`) always returns `"fullFuel"` and never `"invalidPrice"`.
- Ensure `checkFit` and `applyFit` handle keys outside `VISIBLE_EQUIPMENT_KEYS` deterministically (either refusing unlisted combat/defensive items or treating all non-multi keys uniformly as single-instance `equipment` entries).

### Risk Assessment
**LOW** — `src/sim/player/outfitting.ts` is self-contained, pure, and well-isolated, with clear unit and property tests.

---

## 05-04

### Summary
Plan `05-04` adds the `src/content/labels.ts` loader and completes `src/ui/station-model.ts` with pure view-model builders for all four station screens: `buildStatusModel` (F5 pages 1 and 2), `buildSystemDataModel` (F7), `buildOutfittingModel` (F3), and `buildMarketModel` (F8, extended with `pending`). Testing the screen projections in Node without a DOM is a strong architectural fit for the repository. However, there are several internal inconsistencies in `05-04-PLAN.md`: an acceptance criterion on the wrong test file, conflicting counts of F7 fields/labels, and a mismatch between `05-01`/`05-02` (`session.pending` is `null` on a zero-feasible refusal) and `05-04` Task 3 (`buildMarketModel` deriving refusal copy from `pending`).

### Strengths
- **Follows the `src/content/equipment.ts` loader pattern and `src/app/hud-model.ts` pure view-model pattern (`src/content/equipment.ts:18-109`, `src/app/hud-model.ts:114-141`, `05-04-PLAN.md:2503-2505`):** Exporting both `parseLabels` (for Node tests using `readFileSync` in `tests/helpers/labels.ts`) and cached `loadLabels` (for Vite runtime `?raw` glob) matches the repo's exact content boundary conventions.
- **Explicit token replacement for F7 `sysdata-*` templates (`src/content/generated/labels.json:13-47`, `05-04-PLAN.md:2505`):** Replacing the exact tokens `[system]`, `[population|multiply:0.1|precision:1]`, `[productivity]`, `[radius]`, and `[techLevel]` against `labels.formatTemplates` satisfies D-05 (`labels.json` provenance) without introducing a general `[key|modifier]` parser.
- **Separates outfitting row `label` from confirmation `name` (`05-04-PLAN.md:2534, 2541`):** Carrying both `label: "Remove Missile — 20 Cr"` (for the row list, per D-15) and `name: "Remove Missile"` (for the footer prompt `Buy Remove Missile for 20.0 Cr? [Y/N]`, per D-16) prevents duplicating the price in the confirmation prompt (`Buy Remove Missile — 20 Cr for 20.0 Cr?`).

### Concerns
- **[HIGH] `buildMarketModel` `pending` parameter cannot produce refusal copy if `session.pending` is `null` on zero-feasible requests (`05-01-PLAN.md:207`, `05-02-PLAN.md:2040`, `05-04-PLAN.md:2571, 2575`, `05-05-PLAN.md:2677`):**
  - `05-01-PLAN.md:207` and `05-02-PLAN.md:2040` both require: `"a zero-feasible request leaves no pending and states why"`. `05-05-PLAN.md:2677` and `05-RESEARCH.md:1508` likewise require `probe.station.pending` to be `null` when no confirmation is open.
  - Yet `05-04-PLAN.md:2571, 2575` states that `buildMarketModel` takes `pending` and sets `pendingText` to `"the exact D-06 confirmation for the pending side/key/amount, or the refusal/clamp copy"`.
  - If `session.pending` is `null` when `plan.ok === false` (zero feasible), passing `session.pending` (`null`) into `buildMarketModel` gives `buildMarketModel` no way to know that a refusal occurred or which `TradeRefusal` reason to format! Conversely, if `session.pending` is non-null on a refusal, pressing `KeyY` (`stationConfirm`) or reading `probe.station.pending` sees a pending trade when none is confirmable.
  - Furthermore, when a trade is *clamped* (`plan.ok === true`, `plan.amount > 0`, `plan.clamp !== undefined`), the player needs to see *both* why it clamped (e.g. `Only 16 t available`) *and* the confirmation prompt (`Buy 16 t Food for 60.8 Cr? [Y/N]`), whereas returning only one string in `pendingText` hides either the clamp reason or the `[Y/N]` prompt.
- **[MEDIUM] Swapped assertion in Task 1 `<acceptance_criteria>` (`05-04-PLAN.md:2516-2517`):**
  - Line 2516 states: ``- `tests/ui/station-status.test.ts` asserts `2.5 Billion`, `Page 1/2` and the manifest units for t/kg/g.``
  - `2.5 Billion` is Lave's **F7 System Data** population string (tested in `tests/ui/station-system-data.test.ts`), not an F5 Status string! F5 Status (`tests/ui/station-status.test.ts`) has `7.0 Light Years` and `100.0 Cr`. An automated check or executor grepping `tests/ui/station-status.test.ts` for `2.5 Billion` will either fail or put an F7 assertion in the F5 test file.
- **[MEDIUM] Inconsistent F7 field count between Truth 5 (`05-04-PLAN.md:2399`) and Task 1 `<behavior>` (`05-04-PLAN.md:2499`):**
  - Truth 5 (`2399`) says `"the title and six field labels come from the compiled sysdata-* templates"`, whereas Task 1 `<behavior>` (`2499`) says `"buildSystemDataModel(system, labels) returns the nine labeled fields plus the verbatim description"`, and Task 1 `<acceptance_criteria>` (`2513`) checks `sysdata-(eco|govt|tl|pop|prod|radius|distance|data-on-system)`.
  - In `src/content/generated/labels.json:13-47` and `05-RESEARCH.md:958-967`, there is 1 title (`sysdata-data-on-system`: `"Data on Lave"`), **7** `sysdata-*` field labels (`sysdata-eco`, `sysdata-govt`, `sysdata-tl`, `sysdata-pop`, `sysdata-prod`, `sysdata-radius`, `sysdata-distance`), plus the inhabitants parenthetical `(Human Colonials)` (`sysdata-line-8` has no label column in Oolite), plus `description`. If a test expects `fields` to have length 9 while the implementation puts `title` on a separate property and has 7 or 8 `fields` entries, tests and `station.ts` will disagree on the shape of `SystemDataModel`.
- **[LOW] F5 equipment list rendering when `profile.equipment` is empty (`05-04-PLAN.md:2395, 2397, 2496`):**
  - At a new game at Lave, `profile.equipment` is `[]`, `profile.missiles` is `3`, and `profile.passengerBerths` is `0`.
  - Truth 3 (`05-04-PLAN.md:2397`) says `"an empty equipment list renders no equipment line"`, while Task 1 `<behavior>` (`2496`) says `"Equipment the owned catalogue names plus Missile ×N and Passenger Berth ×N"`.
  - Clarify that "empty equipment list" means `profile.equipment.length === 0 && profile.missiles === 0 && profile.passengerBerths === 0` (whereas a new game with `missiles: 3` lists `Missile ×3`).

### Suggestions
- Export a pure `formatTradeFeedback(side: TradeSide, commodity: Commodity, plan: TradePlan): { confirmText: string | null; noticeText: string }` from `src/ui/station-model.ts` (or pass both `pending` and `notice` into `buildMarketModel`), so:
  - when `plan.ok === false`, `session.pending` remains `null` and `noticeText` holds the refusal reason (`"Only 0 t available"`, `"Not enough credits"`, `"Hold full"`, `"Nothing to sell"`, etc.);
  - when `plan.ok === true`, `session.pending` holds `{ side, key, amount: plan.amount, cost: plan.cost }`, `confirmText` holds `"Buy N u Name for X.Y Cr? [Y/N]"`, and if `plan.clamp !== undefined`, `noticeText` also holds the clamp reason (e.g. `"Only 16 t available — Buy 16 t Food for 60.8 Cr? [Y/N]"`).
- Fix `05-04-PLAN.md:2516-2517` so `2.5 Billion` is asserted in `tests/ui/station-system-data.test.ts` and `7.0 Light Years` / `100.0 Cr` in `tests/ui/station-status.test.ts`.
- Define the exact return interface of `buildSystemDataModel(system, labels)` (e.g. `{ title: string; fields: readonly { label: string; value: string }[]; description: string }` with the 8 rows Economy, Government, Tech Level, Population, Inhabitants `(Human Colonials)`, Gross productivity, Average radius, Distance) so Truth 5, Task 1 `<behavior>`, and `05-05` Task 2 agree on the exact field count.

### Risk Assessment
**MEDIUM** — Pure view models in Node are low-risk in isolation, but the `pending` vs refusal-copy contract and the `buildSystemDataModel` field count need alignment so `05-04` and `05-05` integrate cleanly.

---

## 05-05

### Summary
Plan `05-05` wires the F3 Outfitting, F5 Status (two pages), and F7 System Data render branches into `src/ui/station.ts` and `src/app/game-session.ts`, completes the `probe.station` and `probe.economy` observability fields in `src/app/probe.ts`, updates `tests/e2e/scene.spec.ts`, and proves the keyboard-only station loop and `F5` no-reload behavior in `tests/e2e/station.spec.ts`. The row indexing on F3 at Lave (`ArrowDown` 7 times from index 0 `EQ_CARGO_BAY` to index 7 `EQ_MISSILE_REMOVAL` when Fuel and Berth Removal are hidden) is verified accurate against `VISIBLE_EQUIPMENT_KEYS`. However, there is an intra-plan task ordering bug in `05-05` where Task 1's verification asserts `probe.economy.missiles === 0` before Task 2 adds `probe.economy.missiles`, and the two-step `stationConfirm` flow on F3 needs explicit specification.

### Strengths
- **F3 row count and cursor navigation math at Lave are exact (`05-03-PLAN.md:2252`, `05-05-PLAN.md:2781`):** With `VISIBLE_EQUIPMENT_KEYS` containing 10 keys, at a Lave new game (`fuel: 70`, `missiles: 3`, `passengerBerths: 0`), `EQ_FUEL` and `EQ_PASSENGER_BERTH_REMOVAL` are omitted, leaving exactly 8 visible rows (indices `0..7`): `EQ_CARGO_BAY` (0), `EQ_DOCK_COMP` (1), `EQ_GAL_DRIVE` (2), `EQ_ADVANCED_COMPASS` (3), `EQ_ADVANCED_NAVIGATIONAL_ARRAY` (4), `EQ_MISSILE` (5), `EQ_PASSENGER_BERTH` (6), `EQ_MISSILE_REMOVAL` (7). Starting at index 0, seven `ArrowDown` presses land on index 7 (`Remove Missile — 20 Cr`), and buying it reduces `1000` dc by `200` dc to `800` dc (`80.0 Cr`) and removes the row.
- **Preserves `tests/e2e/scene.spec.ts:126-141` boot invariants (`tests/e2e/scene.spec.ts:126-141`, `05-05-PLAN.md:2820, 2832`):** Keeping `data-screen="home"` as the sole `<section>` attribute at boot ensures `[data-screen="market"]`, `[data-screen="outfitting"]`, and `[data-screen="status"]` have count `0` at boot, satisfying `scene.spec.ts:136-140`.

### Concerns
- **[HIGH] Intra-plan task ordering bug: Task 1 asserts `probe.economy.missiles === 0` (`05-05-PLAN.md:2786, 2792`), but `probe.economy.missiles` is not added until Task 2 (`05-05-PLAN.md:2820`):**
  - `05-01-PLAN.md:208` adds only the tracer subset to `probe.economy` (`credits`, `cargo`, `arrival`, `market`) and explicitly defers `fuel`, `missiles`, `passengerBerths`, `holdPods`, `capacityPods`, `lastTrade`, `page`, `pending`, and `message` to `05-05`.
  - In `05-05-PLAN.md`, Task 1's `<acceptance_criteria>` (`line 2792`) requires: `The e2e asserts probe.economy.credits === 800, probe.economy.missiles === 0 and probe.save.committed increased by exactly one`, and Task 1's `<verify>` (`line 2786`) runs `npx playwright test tests/e2e/station.spec.ts`.
  - However, expanding `src/app/probe.ts` with `probe.economy.missiles` (and the other deferred probe fields) is placed in **Task 2** (`line 2820`)! Running Task 1's `<verify>` before Task 2 will fail with `probe.economy.missiles` being `undefined` (and a TypeScript error in `station.spec.ts`).
- **[MEDIUM] Two-step `stationConfirm` (`Enter`/`KeyY`) state machine on F3 Outfitting is implicit in Task 1 (`05-05-PLAN.md:2775, 2781` vs `05-06-PLAN.md:3061, 3068`):**
  - In `05-01-PLAN.md:205`, `stationConfirm` is bound to `["Enter", "KeyY"]`.
  - On F8 Market, `ArrowLeft`/`ArrowRight` opens the pending confirmation and `stationConfirm` (`Enter`/`KeyY`) commits it (one press of `KeyY`).
  - On F3 Outfitting, `ArrowLeft`/`ArrowRight` are not used; instead `05-06-PLAN.md:3061, 3068` specifies `"Digit3, Down seven times, KeyY, KeyY (remove the missile)"` — two presses of `stationConfirm` (`Enter` or `KeyY`), where the first press when `pending === null` opens `Buy Remove Missile for 20.0 Cr? [Y/N]` in the footer, and the second press when `pending !== null` calls `applyFit`!
  - `05-05-PLAN.md:2775` says `"Confirm on an enabled row sets the exact footer line Buy <name> for <priceText>? [Y/N] ... N cancels; Y calls applyFit"`, which makes it sound like `Enter` and `KeyY` are separate actions when in fact both codes map to the single `stationConfirm` `ActionId` in `src/input/actions.ts`! If the session does not implement `stationConfirm` on F3 as a two-state toggle (`pending === null` -> open pending prompt; `pending !== null` -> commit `applyFit`), pressing `KeyY` once will either immediately buy without confirmation or never commit on the second `KeyY`.
- **[MEDIUM] Starting from the title screen via keyboard (`#title-start` focused + `Enter`) interacts with `keyboard.ts`'s capture-phase `keydown` listener if `input.attach()` or `Enter` handling is mis-ordered (`05-05-PLAN.md:2820, 2831`, `src/app/game-session.ts:1095`, `src/input/keyboard.ts:196-210`):**
  - Task 2 (`05-05-PLAN.md:2820, 2831`) starts the game in `tests/e2e/station.spec.ts` by focusing `#title-start` and pressing `Enter`.
  - At the title screen (before `session.start()`), `input.attach()` has not yet been called (`src/app/game-session.ts:1095`), so `Enter` clicks `#title-start` normally.
  - However, once `session.start()` runs, `input.attach()` is active. If the player is on the station `home` screen (`context === "dockHome"`) and focuses `<button data-action="launch">Launch</button>` and presses `Enter`, `ACTION_CONTEXTS.stationConfirm` (`["Enter", "KeyY"]`) MUST be `["dockScreen"]` only (never `"dockHome"`), otherwise `keyboard.ts` will call `event.preventDefault()` on `Enter` in `dockHome` and block `<button data-action="launch">` from activating via `Enter`!
- **[LOW] Home screen fuel format vs F5 Status fuel format (`tests/e2e/scene.spec.ts:129`, `05-04-PLAN.md:2496`):**
  - `tests/e2e/scene.spec.ts:129` asserts `await expect(docked).toContainText("7.0 LY")` on the home screen, whereas F5 Status page 1 renders `"7.0 Light Years"`. `src/ui/station.ts`'s `home` branch must continue rendering `"7.0 LY"` (`${(profile.fuel / 10).toFixed(1)} LY`) so `scene.spec.ts:129` passes.

### Suggestions
- Move the completion of `WegoliteStationProbe` and `WegoliteEconomyProbe` (`page`, `pending`, `message`, `fuel`, `missiles`, `passengerBerths`, `holdPods`, `capacityPods`, `lastTrade`) in `src/app/probe.ts` and `src/app/game-session.ts` from Task 2 into **Task 1** of `05-05-PLAN.md` (or into `05-01-PLAN.md`), so Task 1's `probe.economy.missiles === 0` assertion compiles and passes when Task 1 is verified.
- Explicitly state in `05-05-PLAN.md` Task 1 that because `Enter` and `KeyY` both map to `stationConfirm`, on F3 `stationConfirm` when `pending === null` opens the `Buy <name> for <priceText>? [Y/N]` prompt (for an enabled row), and `stationConfirm` when `pending !== null` executes `applyFit` and clears `pending`.

### Risk Assessment
**MEDIUM** — The Task 1 vs Task 2 probe field ordering bug and the `stationConfirm` (`Enter`/`KeyY`) two-step state machine on F3 will cause immediate test failures during Task 1 execution unless corrected.

---

## 05-06

### Summary
Plan `05-06` hardens the save parser and autosave round-trip (`src/persistence/save.ts`, `src/persistence/autosave.ts`), adds browser-level persistence tests (`tests/e2e/autosave.spec.ts`) and the continuous keyboard-only station loop (`tests/e2e/station.spec.ts`), adds a source-scanning purity guard (`tests/guards/economy-purity.test.ts`), updates `.planning/PROJECT.md`, and runs the full `docker compose run --rm verify` phase gate. While the overall verification strategy is thorough, Task 3's specification of `tests/guards/economy-purity.test.ts` gets the relative import path to `src/content/types.ts` wrong (`../content/types.js` instead of `../../content/types.js`), `eslint.config.js` is missing restrictions for the new `src/content/{commodities,labels,equipment,dock-port,systems}.ts` loaders, and Task 1 duplicates work already specified in `05-01`.

### Strengths
- **Serialises guard probe writes with `withProbeLock` and `__purity_*` naming (`tests/guards/probe-lock.ts`, `tests/guards/sim-purity.test.ts:62-80`, `tests/compliance.test.ts:70`, `05-06-PLAN.md:3094`):** Using `withProbeLock` and a `__purity_*.ts` filename avoids racing `tsc -p tsconfig.sim.json` in parallel Vitest workers (TS6053) and aligns with `tests/compliance.test.ts:70`, which only skips `__purity_*` files when checking SPDX headers.
- **Proves market non-persistence (D-19) via observable stock restoration (`05-06-PLAN.md:2922, 3064, 3068`):** Buying 2 t Food and selling 1 t back leaves Lave Food stock at `15` and cargo at `1 t`; reloading and choosing Continue restores `cargo.food === 1` and reduced credits while `arrival === 0` regenerates Lave Food stock to `16`, directly proving D-17/D-19 without inspecting internal state.
- **Exercises both unit and real IndexedDB paths for old v1 blobs and over-capacity corruption (`tests/persistence/save.test.ts`, `tests/e2e/autosave.spec.ts`, `05-06-PLAN.md:3029`):** Verifying that a Phase 4 field-less v1 blob offers Continue with defaults (`fuel: 70, missiles: 3, passengerBerths: 0, cargo: {}`) while a 21 t Food blob on a 20 t hull is backed up to `autosave.corrupt` and classified `corrupt` closes the persistence security loop.

### Concerns
- **[HIGH] Wrong relative import path `../content/types.js` in Task 3's `tests/guards/economy-purity.test.ts` specification (`05-06-PLAN.md:3094`, `05-PATTERNS.md:1096` vs `src/sim/world/layout.ts:29`):**
  - Task 3 (`05-06-PLAN.md:3094`) instructs `tests/guards/economy-purity.test.ts` to fail on `"a runtime import from src/content other than a type-only import of ../content/types.js"`.
  - However, `src/sim/economy/{ranrot,market,cargo,trade}.ts` and `src/sim/player/outfitting.ts` live at depth 3 (`src/sim/<subdir>/*.ts`), two directories below `src/`! Their actual relative specifier to `src/content/types.ts` is `"../../content/types.js"` (identical to `src/sim/world/layout.ts:29`: `import type { ShipDef, System } from "../../content/types.js";`).
  - If `economy-purity.test.ts` literally enforces `"../content/types.js"`, it will fail on the valid `import type { ... } from "../../content/types.js"` statements in `src/sim/economy/{cargo,market,trade}.ts` and `src/sim/player/outfitting.ts`!
- **[MEDIUM] `eslint.config.js:89-109` does not restrict `src/sim/**` from importing `src/content/{commodities,labels,equipment,dock-port,systems}.ts` (`eslint.config.js:89-109`, `tests/guards/content-boundary.test.ts:151-207`, `05-06-PLAN.md:3094`):**
  - `eslint.config.js:90-108` only blocks `**/content/ships*`, `**/content/index*`, `**/content/schemas/**`, and `**/content/generated/**` inside `src/sim/**/*.ts`.
  - A runtime import of `../../content/commodities.js`, `../../content/labels.js`, or `../../content/equipment.js` inside `src/sim/` is **not** flagged by ESLint's `no-restricted-imports` rule! Updating `eslint.config.js` alongside `economy-purity.test.ts` ensures `npm run lint` enforces the same boundary as the test.
- **[MEDIUM] `CargoEntrySchema` allows `quantity: 0` (`min(0)`) while `snapshotForSave` omits zero entries, breaking exact round-trip equality (`05-RESEARCH.md:1047`, `05-06-PLAN.md:2918, 3023`):**
  - `05-RESEARCH.md:1047` defines `quantity: z.number().int().min(0).max(MAX_SAVE_CARGO_QUANTITY)`.
  - `05-06-PLAN.md:3023` states: `"snapshotForSave emits cargo sorted by commodity sortOrder, omits zero entries"`, while Truth 2 (`05-06-PLAN.md:2918`) states: `"A v1 blob with cargo/fuel/missiles/passengerBerths round-trips exactly through encodeSave, parseSave, snapshotForSave and profileFromSave"`.
  - If `CargoEntrySchema` allows `quantity: 0` (`.min(0)`), a blob with `{ key: "food", quantity: 0 }` is accepted by `parseSave`, puts `0` into `profile.cargo` (unless filtered in `profileFromSave`), and is then omitted by `snapshotForSave`, breaking round-trip canonicality. Since zero entries are never written by `snapshotForSave`, `CargoEntrySchema.quantity` should be `.min(1)`.
- **[LOW] Duplication of save implementation and `.planning/PROJECT.md` decision rows between `05-01`/`05-02`/`05-03` and `05-06` (`05-01-PLAN.md:204`, `05-02-PLAN.md:2065`, `05-03-PLAN.md:2261, 2297`, `05-06-PLAN.md:3020-3029, 3094`):**
  - `05-01` Step 4 already specifies implementing the full `SaveV1Schema` extension, `SaveAllowLists.commodities`, duplicate/unknown rejection, and `holdPodsUsed <= capacityPodsFor` check, and `05-02`/`05-03` already record the Phase 5 decisions in `.planning/PROJECT.md`. Task 1 of `05-06` re-specifies the same save implementation and `.planning/PROJECT.md` rows.

### Suggestions
- Fix the allowed type-only import pattern in `05-06-PLAN.md:3094` (`tests/guards/economy-purity.test.ts`) to allow `import type { ... } from "../../content/types.js"` (as well as `"../content/types.js"` for top-level `src/sim/*.ts` files).
- Extend `eslint.config.js:93-109` (`no-restricted-imports` in `src/sim/**/*.ts`) to also deny `**/content/commodities*`, `**/content/labels*`, `**/content/equipment*`, `**/content/dock-port*`, and `**/content/systems*` so ESLint and `economy-purity.test.ts` agree.
- Set `CargoEntrySchema.shape.quantity` to `z.number().int().min(1).max(MAX_SAVE_CARGO_QUANTITY)` in `src/persistence/save.ts`, and include a test case in `tests/persistence/save.test.ts` for `passengerBerths: 5` without `EQ_CARGO_BAY` (`cargo: []`) being rejected as `corrupt`.

### Risk Assessment
**MEDIUM** — The `../content/types.js` vs `../../content/types.js` path error in `economy-purity.test.ts` is a guaranteed test failure if implemented as written, and `docker compose run --rm verify` in `05-06` will surface any unresolved cross-plan regressions from `05-01`..`05-05`.

---

## Cross-Plan Comparison

1. **DOM/CSS & Playwright Selector Blast Radius (`05-01`, `05-05`, `05-06` vs `index.html:311, 434`, `tests/e2e/precision.spec.ts:72`, `tests/e2e/fallback.spec.ts:62`):**
   - `05-01` and `05-05` add a `<footer>` landmark inside `#docked`. Because `index.html:434` already has a top-level `<footer>` styled by `footer { position: fixed; bottom: 0; ... }` (`index.html:311`), adding a second `<footer>` breaks Playwright's strict single-element resolution on `page.locator("footer")` in `tests/e2e/precision.spec.ts:72` and `tests/e2e/fallback.spec.ts:62`. Neither spec is run in `05-01`..`05-05`'s scoped `<verify>` blocks, delaying discovery until `05-06`'s `verify` gate.
2. **Input Contexts vs Pause Overlay, Controls Rebinding, and Existing Input Tests (`05-01`, `05-05`, `05-06` vs `src/main.ts:295-308`, `src/app/game-session.ts:502-530, 960-966`, `src/input/bindings.ts:66-76`, `src/ui/controls.ts:185`, `tests/input/bindings.test.ts:220`):**
   - `05-01` introduces `InputContext` (`flight`, `dockHome`, `dockScreen`) and station `ActionId`s in `src/input/{actions,keyboard}.ts`, but does not update `src/input/bindings.ts:66-76` (`detectConflict` treats shared defaults like `ArrowRight` and `Escape` across disjoint contexts as conflicts) or `src/ui/controls.ts:185` (which renders `(unbound)` rows for `stationSellMax`/`stationBuyMax`).
   - When `window` blurs while in `dockScreen`, `src/main.ts:298` calls `session.pause()`, opening `#pause` while `context` is still `"dockScreen"` — where `pause` (`KeyP`/`Escape`) is disabled and capture-phase `Tab` (`stationPageNext`) and `Enter` (`stationConfirm`) call `event.preventDefault()`, breaking `#pause` interaction.
3. **F8 Quantity Stepping & `pending` / `clamp` / `refusal` State Machine Split Across `05-01`, `05-02`, `05-04`, and `05-06`:**
   - `05-01-PLAN.md:207` ("plain right/left steps one unit") and `05-06-PLAN.md:3059, 3068` ("two ArrowRight presses then KeyY buy 2 t Food") conflict with `05-02-PLAN.md:2040` ("plain `stationRight` plans a buy of one, plain `stationLeft` plans a sell of one").
   - `05-01-PLAN.md:207` and `05-02-PLAN.md:2040` require `session.pending` to be `null` on a zero-feasible refusal, whereas `05-04-PLAN.md:2571, 2575` expects `buildMarketModel` to produce refusal copy from its `pending` parameter.
4. **Probe Field Split & Task Ordering (`05-01` Step 8 vs `05-05` Tasks 1 and 2):**
   - `05-01` defines a partial `probe.station` / `probe.economy` shape, and `05-05` Task 1 asserts `probe.economy.missiles === 0` in `station.spec.ts` before `05-05` Task 2 adds `missiles` to `probe.economy`.
5. **Save-Schema Work Duplicated Across `05-01` Step 4 and `05-06` Task 1 (plus `05-PATTERNS.md:579` drift):**
   - `05-01` Step 4 and `05-06` Task 1 both specify the same `SaveV1Schema` optional fields, `SaveAllowLists.commodities: ReadonlyMap<string, CommodityUnit>`, and `holdPodsUsed <= capacityPodsFor` check, while `05-PATTERNS.md:579` still says `commodities: ReadonlySet<string>`.

---

## Overall Risk Assessment

**HIGH** — The domain math (Oolite RANROT, float32 market generation, pod/safe boundaries, raw tech-level gating, and integer decicredit accounting) is thoroughly researched and verified against `/home/opencode/git/oolite`. However, whole-repository impact analysis shows three high-severity integration hazards that will break the build or existing tests if executed verbatim: (1) adding a second `<footer>` inside `#docked` breaks `tests/e2e/precision.spec.ts:72` and `tests/e2e/fallback.spec.ts:62` under Playwright strict mode and collides with `index.html:311`'s global `footer` CSS rule; (2) the new `InputContext` and `ActionId` additions in `src/input/{actions,keyboard}.ts` conflict with `src/input/bindings.ts:66` (`detectConflict`), `src/ui/controls.ts:185`, `tests/input/bindings.test.ts:220`, and `#pause` overlay keyboard handling when pausing from `dockScreen`; and (3) cross-plan mismatches between `05-02`/`05-04`/`05-05`/`05-06` (`stationRight` stepping, `buildMarketModel` refusal state when `pending === null`, `05-05` Task 1 vs Task 2 `probe.economy.missiles` ordering, and `../content/types.js` vs `../../content/types.js` in `economy-purity.test.ts`). Resolving these specific seams before execution will reduce the phase risk to **LOW–MEDIUM**.

---


## Algorithm & Performance Review (Kimi K3.1 Pro)

# Phase 5 Algorithm & Performance Review

This is a plan review checked against the current Wegolite source and the upstream Oolite checkout. The Phase 5 implementation files do not yet exist, so statements about them assess the proposed algorithms and test oracles, not completed implementation behavior. I verified the existing schema, content, input, session, save, and autosave seams cited below. Where a plan leaves an implementation detail unspecified, I identify it as an open question rather than claiming a present code defect.

## 05-01

### Summary

The tracer chooses the right vertical path: compiled commodity data → deterministic market → pure buy/cargo rules → one profile snapshot → reload. It also correctly identifies the two blocking content omissions and the input-context conflict. Its main weakness is evidence quality: Wave 1 can pass with an incorrect economy because its browser expectation is derived from the same generated market it is supposed to verify, while the independent economy tests arrive only in 05-02. The breadth of the single tracer also makes that weakly verified state unusually large.

### Strengths

- **The content changes address real blockers, not speculative fields.** `CommoditySchema` currently has averages and coefficients but no peaks (`src/content/schemas/commodity.ts:25-42`), and the converter does not project them (`tools/oolite-ingest/convert/commodities.ts:173-222`). Oolite reads `peak_export` and `peak_import` to compute bias (`/home/opencode/git/oolite/src/Core/OOCommodities.m:432-450`), so `05-01-PLAN.md:203` adds data the formula genuinely requires. The current generated name is still the token `[commodity-name food]` (`src/content/generated/commodities.json:8-12`), so build-time resolution is also necessary.
- **The deterministic seed and draw-order design matches the relevant upstream mechanics.** The plan requires quantity before price, four draws per good including Alien Items, float32 operations, truncating casts, and a stock-only 127 cap (`05-01-PLAN.md:203`). Those correspond to Oolite’s generation order and cap (`/home/opencode/git/oolite/src/Core/OOCommodities.m:253-278`) and quantity/price functions (`:383-411`). The in-repo FNV function already supplies stable 32-bit hexadecimal hashes using `Math.imul` (`src/sim/hash.ts:12-20`), and upstream RANROT has the specified wrapping state updates and three seed-mix rounds (`/home/opencode/git/oolite/src/Core/legacy_random.c:87-118`), with 16-bit `randf()` granularity at `:142-145`.
- **The profile migration correctly calls out a real field-loss hazard.** Existing `purchase`, `setCredits`, and the session’s test-equipment hook construct profiles containing only `credits` and `equipment` (`src/sim/player/profile.ts:131-156`; `src/app/game-session.ts:372-381`). Merely adding fields to the TypeScript interface would therefore drop cargo/fuel/counts on the next operation. The explicit field-spreading requirement in `05-01-PLAN.md:204` preserves the invariant instead of relying on the compiler to catch runtime reconstruction.
- **The input context is the right fix for two actual binding collisions.** Escape is already bound to pause and Digit1/F1 to launch (`src/input/actions.ts:55-70`), while the current dispatcher fires every ordinary action associated with a code (`src/input/keyboard.ts:95-124`). Context filtering in `05-01-PLAN.md:205` can therefore prevent Escape from meaning both pause and back, and can make Digit1 inert inside a section without destroying the existing flight bindings.
- **The reload proof waits for durability rather than merely requesting a write.** The tracer explicitly waits for `probe.save.committed` before reloading (`05-01-PLAN.md:209`). That aligns with the existing asynchronous completion path, where `autosave()` queues work and updates the committed counter in a promise callback (`src/app/game-session.ts:458-476`), and with IndexedDB’s transaction-completion durability boundary (`src/persistence/idb-store.ts:154-189`).

### Concerns

- **MEDIUM — Wave 1’s economy oracle is self-derived and can certify a wrong generator.** The e2e reads the price from `probe.economy.market` and expects the confirmation to contain that same price (`05-01-PLAN.md:209`). Thus an incorrect formula, bias sign, random stream, or truncation rule still produces internally consistent UI text and a successful buy/reload. The scoped Wave 1 test command covers persistence, profile, input, and converter tests but no `tests/sim/economy` suite (`05-01-PLAN.md:213-218` in the task verification area; the plan’s listed economy tests are owned by 05-02). Independent food/computer anchors and formula tests do not protect the Wave 1 merge.
- **LOW — The single tracer has a large blast radius before those independent checks exist.** Its file list spans content generation, four economy modules, profile/save contracts, keyboard dispatch, a replacement station DOM controller, session orchestration, probes, and browser tests, and it deletes `src/ui/docked.ts` (`05-01-PLAN.md:8-47`). This is intentional vertical-slice design, but it means a formula or transaction mistake can be embedded simultaneously in the persisted profile, UI, and session before 05-02 supplies the numerical oracle. This is a scope/integration risk, not a request to split the vertical path into horizontal layers.

### Suggestions

- Add a minimal independent Wave 1 numeric gate: Lave arrival-0 Food must be 38 dc/16 units and Computers 902 dc/0, plus one direct quantity-before-price RNG vector and one `planBuy` exact-balance case. Keep the broader fixtures in 05-02.
- Have the e2e assert at least one literal trusted price/stock pair in addition to the self-derived confirmation. The probe remains useful for state transitions, but should not be the sole source of expected numerical output.
- Do not treat Wave 1 as economically validated until 05-02’s independent formula tests are also green; make that dependency explicit in the Wave 1 summary.

### Risk Assessment

**MEDIUM.** The architecture and integration seams are well chosen, but the first merge’s numerical evidence is largely circular. The risk is mitigated by 05-02’s planned anchors, not eliminated within 05-01 itself.

## 05-02

### Summary

This plan contains the phase’s most important arithmetic and its most serious defect. The market-generation structure and immutable same-price trade model are faithful to Oolite, but the prescribed kg/g maximum-buy formula omits pods already occupied by the commodity being purchased. It wrongly refuses legal purchases from a partially filled existing pod, including a simple full-hold case. The float32 guidance also has a smaller bias-rounding discrepancy, and the golden/boundary evidence needs to be strengthened so it can catch both classes of error.

### Strengths

- **The same-price, stock-only trade invariant matches upstream.** Oolite reads one `pricePerUnit` for both buying and selling (`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:10003-10005` and `:10084-10086`), subtracts stock and adds cargo on buy (`:10055-10057`), and adds stock and subtracts cargo on sell (`:10112-10114`). The plan’s requirement that apply operations change only the selected good’s stock and never its price (`05-02-PLAN.md:130-134`) is therefore the correct invariant.
- **The 127-unit selling limit is sourced correctly.** Upstream clamps a sale to `capacity - market_quantity` and refuses a non-positive result (`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:10091-10110`). The planned `min(held, 127 - stock)` and `marketFull` refusal (`05-02-PLAN.md:125-130`) preserve that behavior without introducing a price response.
- **The static pod-conversion boundaries are the right ones.** Oolite computes kg/g hold use as `floor((500 + quantity)/1000)` and `floor((500000 + quantity)/1000000)` respectively (`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:9524-9540`). Testing 499/500, 1499/1500, and the equivalent gram boundaries (`05-02-PLAN.md:127-134`) directly targets the off-by-one points rather than testing only round thousands.
- **The refusal/defence-in-depth direction is sound.** Re-planning on apply, returning the original objects on refusal, deleting zero cargo entries, and using a null-prototype runtime cargo map (`05-02-PLAN.md:130-134`) are appropriate safeguards. The existing save parser likewise treats duplicate equipment as ambiguous rather than choosing one silently (`src/persistence/save.ts:206-214`).

### Concerns

- **HIGH — The kg/g buy-limit formula is arithmetically wrong once the held good already consumes a pod.** The plan mandates `availablePods * podSize + safeMax - alreadyHeld` (`05-02-PLAN.md:127` and `:134`). Let 20 t of hold capacity be fully accounted for by 19 t of bulk cargo plus 600 kg of gold. The gold already uses one pod because `floor((500 + 600)/1000) = 1`, so `availablePods = 0`. The planned limit is `0 * 1000 + 499 - 600 = -101`, clamped to zero: every further gold purchase is refused. Yet increasing gold from 600 kg through 1,499 kg still uses that same one pod; Oolite’s full-hold branch explicitly allows buying into an already-accounted-for pod (`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:10030-10049`). The same defect rejects gram purchases from 500,000 g onward under the corresponding conditions. The property assertions listed in the plan check non-negativity and stock bounds, so systematic under-purchasing can pass them.
- **MEDIUM — The supplied float32 bias example omits rounding of the division itself.** The research’s concrete implementation returns `f(-(1 - imDiff / distance))` or `f(1 - exDiff / distance)` (`.planning/phases/05-docked-economy-station-screens/05-RESEARCH.md:964-970`). Oolite first performs a float division and only then promotes the result for the `1.0 - quotient` expression (`/home/opencode/git/oolite/src/Core/OOCommodities.m:447-450`). Thus the quotient needs its own `Math.fround` before the subtraction. A scratch enumeration of the valid small-integer economy/peak combinations found 208 combinations where the two bias values differ by one float32 ULP. The proposed Lave/Zaonce/Leesti arrival-0 anchor rows did not change after truncation in that calculation, which is precisely why this remains a medium fidelity risk rather than a demonstrated fixture failure. It also shows why those anchors cannot prove the claimed “every intermediate” rule in `05-02-PLAN.md:31`.
- **MEDIUM — Most market goldens are regression snapshots, not independent correctness evidence.** The writer calls `generateMarket`, and the test compares `generateMarket` with the resulting file (`05-02-PLAN.md:159`). That detects later drift but cannot establish that the original implementation was right. Only the listed food/computer values for three systems provide independent anchors; the other goods and later draw positions have no independent expected values. In addition, the must-haves claim explicit 126/127/128, negative-price, RANROT-granularity, and float-grouping proofs (`05-02-PLAN.md:30-31`), but Task 2’s concrete test action names fixture comparison, seed/order, six anchors, and determinism rather than assigning each of those boundary cases (`:159`). These should be executable tests, not truths inferred from the presence of goldens.
- **MEDIUM — Malformed quantities and sell-side credit overflow are not fully specified despite the safe-integer claim.** The explicit invalid-input list covers zero/negative/fractional/non-finite prices, while requested amount handling is only broadly described as zero/negative guards (`05-02-PLAN.md:129-134`). It does not explicitly define `NaN`, `Infinity`, or fractional requested quantities. More importantly, a sale can have valid safe-integer price, amount, and proceeds yet make `credits + proceeds` exceed `Number.MAX_SAFE_INTEGER`; the current save schema accepts balances up to that boundary (`src/persistence/save.ts:69-86`). The plan says balances remain safe but does not name a refusal/clamp or an exact boundary test for this case (`05-02-PLAN.md:129-134`). Whether generic fast-check generators cover near-limit balances and malformed requests is an open question, so these cases need explicit contracts.

### Suggestions

- Replace the kg/g limit with one derived from the post-trade pod delta. If `heldPods = podsFor(unit, alreadyHeld)`, the maximum final quantity using the existing and free pods is `(heldPods + availablePods) * podSize + safeMax`, so the additional feasible amount is `max(0, (heldPods + availablePods) * podSize + safeMax - alreadyHeld)`, before applying stock, affordability, and requested-amount limits. Equivalently, compute the candidate then reject/clamp until `podsFor(unit, candidate) - heldPods <= availablePods`.
- Add explicit `planBuy` tests for: full hold + 499 kg → one more unit refuses; full hold + 600 kg → up to 899 more kg succeeds; full hold + 1,499 kg → refuses; and the corresponding 600,000 g/1,499,999 g cases. Also test one free pod with 600 kg already held so the formula cannot merely special-case zero free pods.
- Compute `q = Math.fround(Math.fround(numerator) / Math.fround(distance))`, then perform the double-shaped subtraction and final `Math.fround`, with direct bias unit tests for 1/3, 1/7, and negative-bias branches.
- Add synthetic coefficient tests that independently force stock 126/127/128, negative quantity/price, an uncapped price above 127, and a truncation case sensitive to float32 grouping. Add a known-state RANROT vector rather than checking only repeatability.
- Define requested quantities as positive safe integers and add `NaN`/Infinity/fraction/negative tests. For sales, either clamp to the safe-credit headroom or add a fixed overflow refusal, and test both `Number.MAX_SAFE_INTEGER - price` exact success and one-decicredit overflow refusal.

### Risk Assessment

**HIGH.** The mandated kg/g formula breaks a core ECON-03 scenario and can be shipped while all listed invariant properties remain green. Correcting it is a prerequisite for phase approval. The bias and test-oracle issues are smaller but important because the current anchors do not expose them.

## 05-03

### Summary

The pure outfitting module is a good separation of policy from rendering. Raw tech-level gating, explicit multi-instance counts, fuel fill pricing, immediate effects, and deliberate no-refund removals are all tied to real catalogue/source values. The principal gap is that `checkFit` does not itself enforce membership in the peaceful visible set; the UI filters rows, but the supposedly trusted pure rule API can approve an off-catalogue-scope item unless an additional guard is specified.

### Strengths

- **Raw tech-level gating avoids the displayed-value off-by-one.** The plan compares `ctx.techLevelRaw` directly with `item.techLevel` and allows equality (`05-03-PLAN.md:119-122`). Existing `canPurchase` applies the same raw-value rule (`src/sim/player/profile.ts:98-119`), while the catalogue carries concrete raw levels such as Docking Computers TL 9 (`src/content/generated/equipment.json:53-62`). Display raw+1 therefore remains a presentation-only concern.
- **The catalogue price correction is right.** `EQ_PASSENGER_BERTH` is 8250 integer decicredits, not 825 (`src/content/generated/equipment.json:305-319`), and `PROJECT.md:104` already records why the prose’s 82.5 Cr was wrong. Fuel’s catalogue unit price is 2 dc (`src/content/generated/equipment.json:100-115`), so multiplying by the missing tenths gives the intended fill cost rather than displaying a misleading 0.2 Cr total.
- **Counts are the correct representation for missiles and berths.** The current unique-equipment purchase path refuses duplicate keys (`src/sim/player/profile.ts:131-144`) and the save parser rejects duplicates (`src/persistence/save.ts:206-214`). Encoding three missiles by appending the same key would therefore fail both operations and persistence. The explicit counts in `05-03-PLAN.md:150-164` avoid that structural conflict and make capacity arithmetic direct.
- **The no-refund behavior is an explicit, testable deviation rather than an accidental money loop.** The plan charges 200 dc and sets missiles to zero without adding sale proceeds (`05-03-PLAN.md:150-168`). That is deliberately different from upstream’s trade-in path (`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:9431-9437`) and is pinned with exact deltas, so reviewers and Phase 6 will not mistake it for an omitted credit operation.

### Concerns

- **MEDIUM — `checkFit` does not enforce the visible-set invariant at the trusted rule boundary.** The enumerated checks cover key/price validity, full fuel, tech level, ownership, instance caps, the five conditions, and credits (`05-03-PLAN.md:119-122`), but none refuses an item absent from `VISIBLE_EQUIPMENT_KEYS`, and `FitRefusal` has no `notOffered`/equivalent reason. For example, a valid `EQ_ECM` record with sufficient synthetic TL and credits can satisfy every listed check even though combat/defensive items are required never to appear or be purchasable. The later session resolves a selected visible row, which mitigates normal UI use (`05-05-PLAN.md:133`), but it does not prove the pure `applyFit` defence claimed by this plan. Unknown-key behavior in `applyFit` is consequently an open implementation question: it might charge without an effect or install an out-of-scope item if a default branch is used.
- **LOW — The availability context trusts caller-supplied derived capacity.** `FitContext.availablePods` is passed into the pure module rather than recomputed from the profile (`05-03-PLAN.md:119-122`). The later session correctly plans to rebuild it from `availablePods` before apply (`05-05-PLAN.md:133`), so the normal path is safe, but a direct caller can pair a profile with stale or excessive available space. This is an API-hardening open question, not a demonstrated UI exploit.

### Suggestions

- Add a `notOffered` refusal and make both `checkFit` and `applyFit` reject every key not in `VISIBLE_EQUIPMENT_KEYS`. Test at least `EQ_ECM`, a laser, and an arbitrary valid catalogue record, asserting identical profile/object and zero credit delta.
- Make unknown-key behavior explicit with a total switch over all ten offered keys and a refusal default; avoid a catch-all “append equipment” branch.
- Either recompute capacity inside `applyFit` from the same `unitByKey` data or document that `FitContext` is trusted derived input and have the session construct it once for both the final check and apply. Add an exactly-5-free-pods berth success and 4-free-pods refusal through the full session context, not only synthetic numbers.

### Risk Assessment

**MEDIUM.** The economic rules and numeric constants are mostly strong, but the pure apply layer does not yet enforce the phase’s peaceful-set invariant independently of the UI. That gap is straightforward to close before implementation.

## 05-04

### Summary

The view-model plan keeps display arithmetic and content selection out of the DOM and gives the four screens focused Node-test surfaces. The label schema and generated values support the proposed F5/F7 projections, and the market/manifest unit handling correctly avoids summing kg/g into tons. The notable numerical weakness is reuse of floating `formatCredits` for every money string even though the save contract permits the full safe-integer range; an integer quotient/remainder formatter is the more robust match to the phase’s exact-decicredit invariant.

### Strengths

- **The generated labels contain the actual templates the builders need.** Economy and government arrays have the expected eight entries (`src/content/generated/labels.json:2-11` and `:48-56`), and `sysdata-*` supplies the title, distance/economy/government/tech/population/productivity/radius labels and four value templates (`:12-46`). The schema validates fixed array lengths and string templates (`src/content/schemas/labels.ts:18-26`), so the proposed loader failure on malformed/missing content has a real validation boundary.
- **Explicit token replacement is appropriately bounded.** `formatTemplates` is an open string record (`src/content/schemas/labels.ts:25`), so treating it as a general Oolite template language would add unnecessary complexity and failure modes. The planned fixed replacements and missing-key `StationModelError` (`05-04-PLAN.md:125-136`) are sufficient for the compiled values and avoid eval/dynamic prose.
- **The unit model preserves cargo semantics.** Commodity records carry their own `unit` (`src/content/schemas/commodity.ts:19-30`), with gold explicitly `kg` in generated content (`src/content/generated/commodities.json:317-340`). Requiring separate t/kg/g manifest cells and computing only `holdPodsUsed` for the load total (`05-04-PLAN.md:125-136` and `:198-206`) prevents a 1000×/1,000,000× display or capacity error.
- **The row models keep integers available alongside display text.** The market model retains integer `price` while adding `priceText` (`05-04-PLAN.md:206`). This avoids reparsing a localized/formatted string in the trade path and preserves the one trusted numeric market value.
- **Work is bounded and event-driven.** The proposed models allocate at most 17 market rows, 16 manifest rows, and ten outfitting rows on state changes, not per animation frame (`05-04-PLAN.md:231-237`; `05-05-PLAN.md:133`). At these fixed sizes, linear catalogue lookups are preferable to introducing caches whose invalidation would add complexity without a demonstrated hot-path need.

### Concerns

- **MEDIUM — `formatCredits` is not an exact integer formatter over the full accepted credit domain.** The plan uses it for F5 cash, equipment costs, market cash, and every confirmation (`05-04-PLAN.md:127`, `:166`, and `:206`). Its implementation divides by ten and calls `toFixed(1)` (`src/sim/player/profile.ts:60-68`), while the save accepts any non-negative integer through `Number.MAX_SAFE_INTEGER` (`src/persistence/save.ts:69-86`). Safe integer storage does not make arbitrary decimal division by ten exact in binary floating point; extreme valid restored balances can therefore be rendered differently from their exact decicredit quotient/remainder. Ordinary Lave values are not affected, but the plan’s claim of exact safe-integer formatting is broader than those ordinary fixtures. The research already gives the integer alternative `${Math.trunc(dc/10)}.${dc % 10} Cr` (`05-RESEARCH.md:600`).
- **LOW — Exact template behavior remains an implementation open question despite good test intent.** The plan says each missing key throws, but the schema permits arbitrary template strings (`src/content/schemas/labels.ts:25`). Tests need to distinguish “the expected token was replaced” from “`String.replace` silently returned the original malformed template.” The listed tests check the compiled happy path and missing keys (`05-04-PLAN.md:134-143`), but an unexpected-token test is not explicitly named. This is a small coverage gap, not evidence that the proposed happy-path values are wrong.

### Suggestions

- Introduce a validated `formatDecicredits` using integer quotient/remainder and use it consistently for price, cash, and confirmation text. Pin `0`, `1`, `9`, `10`, `38`, a large ordinary balance, `Number.MAX_SAFE_INTEGER`, and nearby values with independently constructed expected strings.
- Retain the existing `formatCredits` only as a wrapper around that exact helper if API stability is useful; do not keep two formatting algorithms.
- Add one malformed-template test containing an unknown token and assert a visible model error rather than silent passthrough. Keep the fixed token list; do not respond by building a general template engine.

### Risk Assessment

**MEDIUM.** The model structure, content sources, units, and bounded rendering work are sound. The risk is confined mainly to extreme-balance numeric presentation and minor template negative coverage; it does not undermine the core economy algorithm.

## 05-05

### Summary

This plan completes the actual station interactions and correctly routes F3 purchases through the pure rules before commit/autosave. Its keyboard design is generally sound, but two state/evidence gaps matter: the F5 navigation-entry count is not a reliable no-reload proof, and station actions need explicit paused-frame draining or suppression. The asynchronous save assertions also need polling to avoid timing-dependent false results.

### Strengths

- **The F3 apply path repeats the rule check immediately before mutation.** The session builds a fresh `FitContext`, re-runs `checkFit`, calls `applyFit`, and only then commits and autosaves (`05-05-PLAN.md:133`). That mirrors the existing defence-in-depth purchase path, which re-runs `canPurchase` rather than trusting a disabled button (`src/app/game-session.ts:354-364`). It also provides the right place to recompute available pods after any prior trade/fit.
- **The proposed Lave expectations are numerically consistent with current content.** A new profile has 1000 dc (`src/sim/player/profile.ts:31-32` and `:56-58`), missile removal costs 200 dc (`src/content/generated/equipment.json:237-248`), and Docking Computers are TL 9/15000 dc (`:53-62`). Thus the planned 800 dc post-removal assertion and TL/credit reasons (`05-05-PLAN.md:133-144`) use real values rather than UI-invented fixtures.
- **The shell lifecycle avoids real listener and hot-path traps.** Rebuilding only on state change, keeping one `AbortController`, using `textContent`, and moving focus without scroll are explicit requirements (`05-05-PLAN.md:133` and `:172`). The existing panel demonstrates the same abort-on-dispose pattern (`src/ui/docked.ts:77-124`), so there is a working local lifecycle idiom to extend.
- **The direct screen-switch and page-clamp rules are deterministic.** F5 resets to page 1, next/previous stop at the two boundaries, and opening another section resets selection/pending (`05-05-PLAN.md:160-172`). These are small total state transitions that can be tested without relying on DOM focus or frame cadence.

### Concerns

- **MEDIUM — `performance.getEntriesByType("navigation").length === 1` does not prove that F5 did not reload.** The assertion appears as the primary browser-reserved-key proof (`05-05-PLAN.md:168`, `:172`, and `:182`). A document reached by a reload ordinarily still has one navigation entry for the current document; the count is not a persistent reload counter. Immediate text/probe checks can also race a navigation unless the test waits for a stable post-key state. The capture-phase cancellation may work, but this assertion is not reliable evidence that it did.
- **MEDIUM — Station-action behavior while paused is unspecified and can mutate beneath the overlay or replay on resume.** The current frame loop drains ordinary commands in the paused branch so paused keys cannot queue for resume (`src/app/game-session.ts:916-965`). The new station queue is dispatched separately before the fixed step (`05-01-PLAN.md:207`), but 05-05’s full F3/F5/F7 switching behavior never says to drain or suppress it while paused (`05-05-PLAN.md:160-176`). After Escape pauses on docked home, pressing Digit8 can therefore either open F8 beneath the pause overlay if station actions are dispatched unconditionally, or remain queued and open unexpectedly on resume if they are only dispatched in the unpaused branch. Blur-triggered pause inside a section reaches the same state.
- **LOW — Immediate `probe.save.committed` assertions can race the actual transaction.** `autosave()` is fire-and-forget and increments `saveCommitted` only in the `queueAutosave(...).then` callback (`src/app/game-session.ts:461-476`). The F3 test says to assert that committed advanced by one after the key sequence (`05-05-PLAN.md:133-144`) but does not explicitly repeat 05-01’s wait. A direct immediate assertion can fail on a correct write or pass before a second unexpected write arrives.

### Suggestions

- Before pressing F5, install a document-local sentinel (or a sessionStorage reload counter through `addInitScript`). After the key, wait for the expected F5 page/state and assert the sentinel is unchanged; additionally inspect the current navigation entry’s `type` where useful. Keep the existing rendered-text assertions, but do not use navigation-entry count as the reload detector.
- Extend the paused branch to drain `drainStationActions()` just as it drains commands, and clear station queues on pause/context transitions. Alternatively, suppress all docked station dispatch while `paused`. Add browser tests for Digit8/F3/F5/F7 while paused, asserting neither immediate screen changes nor deferred changes after resume.
- Use `expect.poll` or the project’s probe wait helper for every committed-write count, then perform any navigation/reload only after the expected revision has committed.

### Risk Assessment

**MEDIUM.** The purchase/navigation architecture is sound, but the keyboard acceptance evidence can miss a reload and paused input has an unhandled queue state. These are observable user-facing risks, though localized and straightforward to test.

## 05-06

### Summary

The closing plan correctly emphasizes old-blob compatibility, strict corruption handling, atomic profile snapshots, canonical cargo order, and the full keyboard loop. The existing serialized IndexedDB queue is a strong base for the one-write claims. Three hardening gaps remain: writer-side validation does not run the new semantic checks, non-ownable/multi-instance equipment keys are not excluded from the legacy equipment array, and the final keyboard matrix does not close the paused-station-action case introduced earlier.

### Strengths

- **The parse-side capacity checks target the real pod boundaries.** The plan rejects `holdPodsUsed > capacityPodsFor`, accepts 20 t + 499 kg, rejects 20 t + 500 kg, and accounts for cargo bay/berth capacity (`05-06-PLAN.md:127-137`). Those are the correct consequences of Oolite’s per-good pod conversion (`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:9524-9544`) and the planned `20 + 15*cargoBay - 5*berths` capacity rule.
- **Optional fields preserve the actual old-v1 read path.** The current schema is strict (`src/persistence/save.ts:78-96`), so adding required fields would indeed reject every Phase 4 blob. The optional/default approach in `05-06-PLAN.md:127-137` keeps the existing parse order and gives field-less saves deterministic new-game cargo/fuel/missile/berth values without inventing a migration.
- **The underlying store serializes operations and commits only completed transactions.** Every operation is chained onto one promise queue (`src/persistence/idb-store.ts:130-151`), writes use a readwrite transaction and resolve on completion (`:154-189` and `:231-245`), and monotonic revisions reject stale operations. This supports the plan’s one-snapshot-per-action ordering much more strongly than a simple fire-and-forget `put` would.
- **The reload scenario distinguishes persisted cargo from regenerated stock correctly.** Buying two and selling one Food changes stock from 16 to 15 while leaving one in cargo; a reload that restores cargo but shows 16 stock demonstrates the intended Phase 5 market regeneration (`05-06-PLAN.md:167-176`). The arithmetic is consistent and avoids claiming that market persistence exists before Phase 6.
- **The purity guard has a real race-aware local pattern to copy.** Existing guard probes serialize writes with `withProbeLock` because `tsconfig.sim.json` scans `src/sim/**` (`tests/guards/probe-lock.ts:1-16` and `:34-61`; `tests/guards/sim-purity.test.ts:58-80`). Reusing that pattern in the new economy guard avoids flaky parallel typechecks rather than adding a superficial source scan with a new race.

### Concerns

- **MEDIUM — Writer-side validation does not enforce the new duplicate/allow-list/capacity invariants.** `queueAutosave` calls `isEncodedSaveValid` before writing (`src/persistence/autosave.ts:64-77`), but that function only parses JSON and runs `SaveV1Schema.safeParse` (`src/persistence/save.ts:225-242`). The new unknown/duplicate cargo and hold-capacity rules are assigned to `parseSave` (`05-06-PLAN.md:127-137`), whose allow-list/capacity stages are separate from the schema, just as current equipment allow-lists are (`src/persistence/save.ts:204-220`). Consequently, an internal bug or direct caller that produces duplicate cargo or an over-capacity snapshot can pass writer validation, replace the last good blob, and only be classified corrupt on the next boot. The plan’s “hardened save” work therefore hardens the reader but not the claimed fail-closed writer boundary.
- **MEDIUM — The canonical count representation is not enforced for keys inside `equipment`.** The boot allow-list is built from every equipment record (`src/main.ts:119-135`), and current parse validation rejects only duplicates or unknown keys (`src/persistence/save.ts:206-214`). The new profile instead requires missiles/berths to be counts and removal/fuel entries not to be owned equipment (`05-06-PLAN.md:132-137`; `05-03-PLAN.md:150-164`). A forged v1 blob with `equipment: ["EQ_PASSENGER_BERTH"]` and `passengerBerths: 0` is known, unique, and within capacity, so the described checks accept it even though the catalogue marks berths multi-instance and cargo-consuming (`src/content/generated/equipment.json:305-319`). It can render a berth in F5 without the corresponding 5 t capacity reduction; removal and fuel keys create similar impossible owned states. The plan does not name a rejection test for this representation violation.
- **MEDIUM — The final keyboard proof omits the paused queue case, allowing the 05-05 gap to survive the phase gate.** The continuous test covers trade, fit, F5/F7, Escape, launch, reserved F5, and Digit1 inside a section (`05-06-PLAN.md:167-184`), but never presses station keys while the pause overlay is open and then resumes. Since the existing paused branch explicitly drains ordinary commands (`src/app/game-session.ts:960-965`), station actions need equivalent negative proof; otherwise a queued or underneath-overlay action can pass every listed acceptance criterion.
- **LOW — The phrase “round-trips exactly” needs a canonical-input qualification.** The schema allows zero cargo quantities while snapshots omit zero entries (`05-06-PLAN.md:127-137`). Thus a noncanonical blob containing a zero-quantity entry can parse successfully but re-encode without that entry. This is reasonable canonicalization, but it is not byte-/entry-exact round-tripping. The test should either restrict the exact-round-trip claim to canonical valid inputs or reject zero entries explicitly; current text leaves that expectation ambiguous.

### Suggestions

- Extract one shared semantic validator for a fully decoded v1 save and call it from both boot parsing and the writer’s pre-commit check. Supply the writer with the same validated equipment/commodity maps, or explicitly validate canonical snapshot invariants before `store.write`; add duplicate-cargo and over-capacity writer tests proving the previous blob remains untouched.
- Add a persistent-equipment allow rule: reject `EQ_MISSILE`, `EQ_PASSENGER_BERTH`, both removal entries, and `EQ_FUEL` in the unique `equipment` array, while continuing to allow legitimate unique installed modules. Test mixed valid/invalid arrays so this cannot be implemented as an overly broad equipment rejection.
- Add paused-key/resume cases to the continuous browser matrix and assert zero profile, screen, and autosave changes both while paused and after resume.
- Define round-trip equality over canonical saves: positive quantities only, unique keys, sortOrder ordering. Either make zero quantities invalid at parse or state and test that they canonicalize away.

### Risk Assessment

**MEDIUM.** The atomic queue and parse-side boundary design are strong, but semantic validation is not yet end-to-end. A malformed internal snapshot can still overwrite good state, and forged legacy-equipment shapes can violate the new capacity/count invariants without being rejected.

## Cross-Plan Comparison

- **The kg/g defect is upstream of every later plan.** 05-02’s buy-limit formula governs session trades used by 05-05/05-06, while 05-04 only renders the resulting cargo and 05-06 validates static hold usage. The 499/500 save tests in 05-06 do not exercise purchasing from an existing partially occupied pod, so they cannot catch the 600 kg/full-hold failure. The correction and its direct `planBuy` tests therefore belong in 05-02 before downstream plans treat the trade module as trusted.
- **Numerical evidence is too often generated by the code under review.** 05-01 derives its expected confirmation from the live market, 05-02 writes goldens with `generateMarket`, and 05-04 builds expected rows from that generated market. These are valuable integration/regression tests, but independent correctness comes only from literal anchors and direct arithmetic boundary tests. The six food/computer anchors should be expanded into independent full-fixture or targeted reference vectors, especially for bias rounding and later RNG positions.
- **The pure-rule/UI split is good only if the pure boundary is total.** 05-03 and 05-05 correctly re-run checks before apply, but `checkFit` currently lacks a visible-set refusal. Similarly, 05-06 correctly validates untrusted reads but does not reuse those semantics before writes. Both are instances of the same principle: a disabled row or a well-behaved caller is not the invariant; the trusted mutation/serialization boundary must enforce it.
- **The asynchronous persistence base is stronger than the new validation around it.** The existing store’s serialized transactions and revision checks (`src/persistence/idb-store.ts:130-151`, `:231-261`) support rapid successive trades without interleaved writes. Plans 05-01/05-05/05-06 should exploit that base with polling assertions and shared semantic writer validation rather than adding new save concurrency machinery.
- **Keyboard coverage needs state-matrix thinking, not only happy-path key sequences.** Context filtering handles the known Escape/Digit1 collisions, but pause is a fourth input state in practice even if it is not an `InputContext` variant. The final test matrix should include `flight`, `dockHome`, `dockScreen`, and paused-over-each-docked-state, plus actual reload detection rather than navigation-entry counting.
- **Hot-path performance is appropriately restrained.** Fixed 17-good generation occurs on docking, view models allocate small bounded arrays on state changes, and rendering is explicitly not per frame. There is no evidence that additional caching, decimal libraries, generalized templates, or DOM diffing would improve correctness; adding them would be premature complexity.

## Overall Risk Assessment

**Provisional HIGH.** The architecture is fundamentally viable: deterministic seeded generation, integer decicredits, pure trade/outfitting rules, small event-driven view models, and serialized atomic saves are the right choices. However, 05-02 currently mandates an incorrect kg/g capacity formula that rejects legal purchases from an already occupied pod, directly violating ECON-03. Until that formula is corrected and protected by held-600-kg/full-hold and equivalent gram tests, the phase should not be approved.

After that blocker is fixed, the residual risk is **MEDIUM**: float32 bias rounding needs exact treatment; independent test oracles need strengthening; fit and save boundaries need total invariant enforcement; writer-side validation must share parse semantics; and keyboard tests must cover pause and prove no reload with a real sentinel. None of those requires redesigning the phase, but each has a concrete path by which the current plans could pass their stated tests while preserving incorrect behavior.

---


## Adversarial Review (Grok 4.7)

# Adversarial review: Phase 5 plans (Docked Economy & Station Screens)

Reviewer: Grok 4.7. Scope is the six plans in the review request, checked against the repository at `/home/opencode/git/wegolite` and the Oolite checkout. Phase 5 modules (`src/sim/economy/**`, `src/ui/station.ts`) are not in the tree yet; findings are about what the plans claim versus what the current code actually does, and about guards the plans name but never put in an action, test, or writer path.

No repository files were modified.

## 05-01

### Summary

The tracer is the right shape — one buy that crosses content, a pure market, the profile, a strict save, and a keyboard shell — and it names several real trust boundaries (IndexedDB, content strings, key codes). It is also one low-confidence task that rewrites the keyboard capture contract, the profile object, and the save writer without a mechanical check that those contracts still hold. Two guards the plan treats as closed are not in the steps that an implementer will follow: the equal-peak bias return that keeps narcotics from becoming `NaN`, and the existing fail-closed writer check that must learn the new cargo invariant. Moving `keydown` to the capture phase, as written, breaks a safety property the controls panel already documents.

### Strengths

- The save read path is already a real trust boundary, and the plan extends it instead of inventing a second parser. `parseSave` rejects before `JSON.parse` on size, distinguishes `corrupt` from `unreadable`, and allow-lists equipment, systems, and stations (`src/persistence/save.ts:160-222`). Optional cargo/fuel/missiles/berths on the existing `z.strictObject` (`src/persistence/save.ts:78-96`) is the only way a Phase 4 blob stays readable. An entry array plus a commodity allow-list matches the existing duplicate-key rejection (`src/persistence/save.ts:206-214`) and avoids a wire object whose keys are attacker-chosen.
- The plan names the profile literals that would silently drop cargo. `purchase` returns `{ credits, equipment }` (`src/sim/player/profile.ts:141-144`), `setCredits` does the same (`src/sim/player/profile.ts:151-156`), `applyTestEquipment` rebuilds that pair (`src/app/game-session.ts:372-381`), and restore uses `(credits, equipment) => ({ credits, equipment })` (`src/app/game-session.ts:1054-1058`). A missed spread here is a hold wipe on the next autosave, not a type error. Putting those call sites in the action is the right fix.
- Commodity names are still raw tokens (`src/content/generated/commodities.json:11`, `"name": "[commodity-name food]"`), and `CommoditySchema` has no peaks (`src/content/schemas/commodity.ts:25-42`). The plan's content change is necessary, and it correctly updates `tests/fixtures/schemas/commodity-invalid.json` so the strict-schema first-issue contract does not move. That fixture currently has neither peak field (lines 3-20 and 22-39).
- `src/content/types.ts:19-25` re-exports `Commodity` but not `CommodityUnit`. The type-only door is the only legal way for `podsFor` to name a unit; the sim ESLint zone already denies `content/schemas/**` (`eslint.config.js:100-109`). The plan's re-export is the correct seam.
- Station text is specified as `textContent`, matching `src/ui/docked.ts:12` and the boot-failure surface (`src/app/boot-failure.ts:31-34`). The launch command stays payload-free; the sim already ignores `launch` unless `modeAtStart === "docked"` (`src/sim/flight/step.ts:87-88`), so a section cannot launch unless something queues the command while still docked.
- `fast-check` is already a devDependency (`package.json:32`). The phase does not need a new package for the later property tests.

### Concerns

- **HIGH — Capture-phase `keydown` breaks the existing swallow contract, so a rebind key also runs the game.** `createKeyboardInputSource` registers `keydown` in the bubble phase (`src/input/keyboard.ts:229-235`). The controls panel's documented invariant is the opposite: capture on `window`, `preventDefault` + `stopPropagation`, "so the game's own key listener never sees the key being assigned" (`src/ui/controls.ts:8-11`, `134-142`). That works only because `stopPropagation` stops the event from reaching the bubble phase. It does not stop another capture listener on the same `window`. Registration order today is: subpanel Escape (`src/app/game-session.ts:563-577`), launch-skip (`src/app/game-session.ts:585-598`), then `input.attach()` during `start()` (`src/app/game-session.ts:1094-1095`), and only later the rebind listener (controls panel is constructed at `src/app/game-session.ts:1114`, and its capture listener is added on demand). If step 5 moves the game listener to capture, it runs before the rebind listener. `stopPropagation` in `onCaptureKeyDown` cannot rewind that. Escape sets `pauseToggle` immediately inside `keyDown` (`src/input/keyboard.ts:114-117`), and the frame loop resumes on that edge (`src/app/game-session.ts:916-918`). One Escape during rebind therefore cancels capture and unpauses. The same ordering defeats the subpanel handler, which also only `stopPropagation`s (`src/app/game-session.ts:569-570`): Escape would close Controls and toggle pause in one key. Preconditions: docked or in flight, pause open, Controls or a rebind capture active. Impact: the key the player is assigning also fires its current binding; the pause stack collapses. The plan's acceptance test never opens Controls.
- **HIGH — The equal-peak guard is not in the action, and narcotics will divide by zero.** `economicBias` must return `0` when `exDiff === imDiff` before dividing by `distance`. Narcotics is that case in the pinned plist: `peak_export = 0`, `peak_import = 0` (`/home/opencode/git/oolite/Resources/Config/trade-goods.plist:116-121`). Step 3 says "Math.fround around every intermediate in the C grouping" and never mentions the early return. An implementer who writes the two-branch form from the research snippet without the equality test gets `0/0` → `NaN`, then `Math.trunc(NaN)` → `NaN` prices and stock. `05-01`'s `planBuy` as written does `floor(credits / price)` with no `invalidPrice` refusal (that enum arrives in `05-02`). A `NaN` price makes the feasible amount `NaN` and `credits - NaN` is `NaN`, which `formatCredits` renders as `"NaN Cr"` (`src/sim/player/profile.ts:66-67`) and which `isEncodedSaveValid` will refuse — so the session keeps a poisoned balance that cannot be saved. The tracer e2e only buys Food, whose peaks differ, so it stays green. Preconditions: any market generation, including the first Lave dock. Impact: one commodity's price is non-finite; buying or selling it can poison credits.
- **HIGH — `isEncodedSaveValid` will not learn the new invariant, so a bad snapshot replaces the last good save.** The writer gate is schema-only and explicitly does not consult allow-lists (`src/persistence/save.ts:225-241`). `queueAutosave` treats that function as "what this build's parser would reject" (`src/persistence/autosave.ts:71-76`). The plan puts the capacity check, the commodity allow-list, and duplicate-key rejection only in `parseSave`. A schema-valid over-capacity blob (17 entries, quantities ≤ 36_000_000, keys that happen to be real commodities, hold pods above capacity) passes the writer, overwrites the previous blob, and on the next boot is `corrupt`. `canClear` includes `corrupt` (`src/app/game-session.ts:418-420`), and New game may then delete it after the backup. Preconditions: any writer bug, or a profile that `applyBuy` / a test grant left over capacity. Impact: data loss of the last good save, which the existing comment says must not happen. The plan never mentions `isEncodedSaveValid` or `SaveInputs`.
- **MEDIUM — Launch from a section is gated only by the new context filter.** The sim applies `launch` whenever mode is `docked` (`src/sim/flight/step.ts:87-88`). It has no screen concept. The button path does not go through the input layer at all: `docked.onLaunch` pushes `{ kind: "launch" }` (`src/app/game-session.ts:1159-1161`). The plan rebuilds the section with `replaceChildren` and re-attaches the handler, but it never says the session must ignore a launch command unless `screen === "home"`. A leftover button, a handler on persistent chrome, or a context stuck on `dockHome` launches the ship from F8. Digit1 is tested; Space/Enter on a focused `<button>` is not. Tab is deliberately not consumed on the home screen, so focus can reach a launch button. If that button is not removed when the section changes, native activation bypasses `ACTION_CONTEXTS`.
- **MEDIUM — Station actions are not Commands, and the pause drain will not see them.** While paused, the frame loop discards `drainCommands()` and `pending` (`src/app/game-session.ts:960-964`). Step 7 says to dispatch `drainStationActions()` "before the fixed step" and does not say "only when `!paused`". The pause overlay's key handler only traps Tab (`src/ui/pause.ts:62-82`); it does not stop other keys. If station dispatch runs while paused, Digit8 opens the market under the overlay and KeyY can confirm a trade the player cannot see. Preconditions: docked home, Escape pauses, station dispatch not pause-gated. Impact: a purchase commits and autosaves while the game is supposed to be frozen.
- **MEDIUM — Same-context double fire is loadable from settings, and the plan does not close it.** `createBindingMap` copies codes and does not run `detectConflict` (`src/input/bindings.ts:54-62`). `detectConflict` is only the rebind UI (`src/input/bindings.ts:84-93`). A `localStorage` settings blob is untrusted. Today it can already assign one code to two actions. After this plan, ArrowRight can be both `stationRight` and `stationConfirm` in `dockScreen`, and `keyDown` fires every context-matching action (`src/input/keyboard.ts:114-123`). One key then both steps the quantity and confirms. The context filter, which the research says is what prevents double-firing, does not help when both actions are legal in the same context. Defaults are safe; a tampered or partially merged blob is not.
- **MEDIUM — `parseSave` must not throw, and the plan does not say so.** The boot `catch` maps every throw to `unavailable` (`src/main.ts:168-171`). `unavailable` is not clearable and not overwritable (`src/app/game-session.ts:409-420`). If the new capacity helper throws on a missing unit instead of returning `corrupt`, a hostile or merely odd blob locks Continue, New game, and every later autosave until the origin's IndexedDB is deleted by hand. Existing `parseSave` returns a reason and does not throw (`src/persistence/save.ts:160-222`). The plan should require the same.
- **LOW — Acceptance checks are narrower than the threats they name.** `rg innerHTML src/ui/station.ts` does not see `insertAdjacentHTML`, `outerHTML`, or a helper in `game-session.ts`. There is no `rg` for leftover `{ credits, equipment }` literals. `CommoditySchema.priceAverage` is `z.number().int()` with no magnitude cap (`src/content/schemas/commodity.ts:31`); `Number.isInteger(1e21)` is true, so a corrupted generated file can carry a non-safe coefficient. That file is the same trust level as the bundle, so this is defense in depth, not the primary boundary.

### Suggestions

- Do not move the action `keydown` listener to capture. Add a separate capture listener whose only job is `preventDefault` for `F3`/`F5`/`F7`/`F8`, and make it return immediately when `document.body.dataset.capture` is set or the controls/settings panel is open. Keep action dispatch on bubble so `src/ui/controls.ts:141-142` still wins.
- Put the equal-peak return in `market.ts` as an explicit branch, and add a unit test that narcotics bias is `0` and that a generated narcotics price is a safe integer. Do not rely on a self-written golden.
- Extend `isEncodedSaveValid` (or a sibling used by `queueAutosave`) with the same allow-list and `holdPodsUsed <= capacityPodsFor` check `parseSave` uses, and pass the allow-lists into the writer. Add a test that an over-capacity snapshot does not replace a good blob.
- Ignore station drains and the launch button unless `!paused && mode === "docked" && screen === "home"` for launch, and `screen` matches the action for trades. Assert that in the session, not only in the input unit test.
- On load, drop any code bound to two actions whose `ACTION_CONTEXTS` overlap. Add a fixture settings blob that binds `stationConfirm` to `ArrowRight` and assert a single right-arrow does not commit.

### Risk Assessment

**HIGH.** The buy tracer can be made safe, but the keyboard change as specified regresses a working control, the money path can ingest `NaN` before the later refusal enum exists, and the writer gate that currently protects the last good save is not part of the task.

## 05-02

### Summary

This plan is the one that actually defines sell-side money, pod boundaries, and the refusal enum. Those rules are specific and testable. The risk is that the proof is partly circular, and the overflow and zero-price guards are outcome sentences rather than operations the apply path is required to perform before arithmetic.

### Strengths

- Sell limits match the Oolite outcome the research quotes: `min(held, 127 - stock)`, price unchanged, stock increased. Refusing `marketFull` at stock 127 and `nothingToSell` at held 0 is the right pair of edges. Clamping instead of rejecting the whole request matches D-06 and is specified as `ok: true` plus a `clamp` reason, which is testable.
- The kg/g limit `availablePods * podSize + safeMax - alreadyHeld` is the rule that makes a full 20 t hold still accept 499 kg. Hardcoding the pod constants is correct. The generated `podConversion` must not be used as the pod size: gold's compiled value is `kilogramsPerUnit: 1` (`src/content/generated/commodities.json:324-329`), which is "1 unit is 1 kg", not "1000 kg per pod". An implementer who divides by that field will be off by three orders of magnitude. The plan's explicit constants avoid that trap.
- `applyBuy` / `applySell` re-run the plan and return the original objects on mismatch. That is the same pattern as `buyDockComputer` re-checking `canPurchase` (`src/app/game-session.ts:354-363`). A stale footer cannot mint credits if this is actually implemented.
- `fast-check` is already installed (`package.json:32`). Requiring a property that credits stay a non-negative safe integer and stock stays in `0..127` is the right shape. `grantCredits` already refuses a non-safe sum via `setCredits` (`src/sim/player/profile.ts:163-168`); the sell path should call that pattern rather than raw addition.
- Anchors (Lave food 38/16, computers 902/0, and the Zaonce/Leesti pairs) are an external check the self-written golden does not provide. The instruction not to edit an anchor to match a wrong generator is the right process rule.

### Concerns

- **HIGH — The golden process cannot catch the narcotics `NaN`, and the anchors do not include it.** Task 2 writes fixtures by calling `generateMarket` and then compares the test to those fixtures. A stable bug is pinned, not detected. The six anchors are food and computers only. Narcotics is the commodity whose peaks are equal (`trade-goods.plist:120-121`). Nothing in this plan's action or acceptance criteria says "bias is 0 when peaks match" or "every price and stock is a safe integer". `JSON.stringify(NaN)` is `null`; if both the writer and the test go through JSON, a `NaN` price becomes a matching `null` and the suite stays green. Preconditions: the `05-01` generator omitted the equality branch. Impact: the phase gate certifies a market that can poison credits.
- **MEDIUM — Sell addition can leave the safe-integer range, and the action never names the check.** `SaveV1Schema` accepts `credits` up to `Number.MAX_SAFE_INTEGER` (`src/persistence/save.ts:76`, `86`). A hostile IndexedDB blob can set that balance today; Phase 5 will still accept it. `MAX_SAFE_INTEGER + price` is not a safe integer. Task 1 says "add proceeds only after approval" and "credits are never negative or non-safe", but it does not say "if `credits + cost` is not a safe integer, refuse and return the same profile". The fast-check description says "random credits", which will not hit the top of the range unless the generator is required to include it. `price * amount` has the same hole for a zero or non-finite price if the refusal is coded after the division. `floor(credits / 0)` is `Infinity`; `min(stock, Infinity, pods)` is `stock`; cost is `0` or `NaN`. The formula is allowed to return a `0` price ("if base < 0 return 0"). Preconditions: a save at max credits, or a generated price of `0`. Impact: in-memory unsafe credits; the writer then refuses the snapshot (`z.number().int().max(MAX_SAVE_CREDITS)`), so the player sees a balance the reload will not keep.
- **MEDIUM — `05-02` does not say the session must refuse a trade when not docked.** The sell wiring is "plain `stationLeft` plans a sell of one". If `05-01` dispatches station actions whenever the context says so, and a tampered binding or a flight-context mistake delivers `stationSellMax` in flight, this plan's session change will apply it. There is still only one system in this phase, so the profit is the reroll described under `05-06`, not a cross-galaxy cheat. The missing mode check is what makes that path reachable from a bad binding.
- **LOW — The property test is an untyped promise.** "Imports from `fast-check`" can be satisfied by a generator that only draws small integers. The acceptance criteria do not require a case at `credits === Number.MAX_SAFE_INTEGER`, `price === 0`, or `price` non-finite. Those three are the ones that mint or poison.

### Suggestions

- Before any division or multiplication, refuse unless `price` is a positive safe integer and `amount` is a non-negative safe integer. Refuse the sell when `credits + cost` is not a safe integer, by the same predicate `isSafeCredits` already uses. Add those three cases as ordinary tests, not only as a property.
- Assert in `market.test.ts` that every fixture price and stock is `Number.isSafeInteger` and `>= 0`, and that narcotics (or any good with equal peaks) has a finite bias of `0`. Generate that assertion from the commodity records, not from the golden file.
- Keep the implementation-generated golden, but do not let it be the only proof of the formula. The anchors are the proof; extend them with narcotics and with one kg good and one g good so a unit mix-up fails.

### Risk Assessment

**MEDIUM.** The sell and pod rules are the right contract, and the phase does not ship on `05-01` alone. The proof can still certify a `NaN` market and an overflowing sell unless those cases are written as ordinary assertions.

## 05-03

### Summary

Isolating equipment rules in a pure module before any DOM exists is the right split, and the no-refund / raw-tech-level / no-`eval` prohibitions are explicit. The condition reader is fail-open on the schema the catalogue actually has, and `applyFit` is not required to refuse keys outside the peaceful set, so a confused caller can persist combat equipment through the same autosave as a legal purchase.

### Strengths

- Gating on `techLevelRaw` matches the rule `canPurchase` already implements (`src/sim/player/profile.ts:98-107`: refuse when `techLevelRaw < item.techLevel`, equality allowed). The plan's equal-versus-one-above pair is the test that stops a `+1` display value from being passed in by mistake. Lave's raw value is 4; a displayed 5 must not buy a TL 5 berth.
- Refusing `eval`, `new Function`, and `condition_script` is load-bearing. The generated fuel row carries `"condition_script": "oolite-conditions.js"` (`src/content/generated/equipment.json:102-106`). Evaluating that string would be code execution from content. The acceptance `rg` for those tokens is the right check.
- Removal is specified as a charge, not a refund: missile removal subtracts 200 dc and sets the count to 0; berth removal subtracts 1000 dc and decrements by one. The identity check on refusal (`toBe` the same object) matches `purchase` (`src/sim/player/profile.ts:131-140`). A UI that compares identity cannot miss a partial apply.
- Missile and berth counts stay out of `equipment`. That preserves `parseSave`'s duplicate-key rejection (`src/persistence/save.ts:206-214`). Encoding counts as repeated keys would force that check to be loosened, which the plan correctly forbids.
- The fuel row price is specified as `(70 - fuel) * 2` dc, not the 2 dc unit price. That is the classic display bug, and the 72 / 140 cases pin it.

### Concerns

- **HIGH — Condition coercion is fail-open, and the schema allows the values that skip the hold check.** `EquipmentConditionsSchema` is `z.record(z.string(), z.unknown())` (`src/content/schemas/equipment.ts:18`). The plan says accept `"true"` / `true` and `Number(...)` for `requires_cargo_space`, then refuse only when `requiredSpace > 0 && availablePods < requiredSpace`. `Number({})` and `Number("5t")` are `NaN`, and `NaN > 0` is false, so the check is skipped. A missing or garbage `requires_cargo_space` buys a berth without spending 5 t. `applyFit` then increments `passengerBerths`. Capacity becomes `20 + bay - 5 * berths` and can go negative while cargo is unchanged. The in-memory profile is now over capacity. `05-01` autosaves it. `isEncodedSaveValid` does not know about capacity (`src/persistence/save.ts:233-241`), so the bad blob replaces the good one; the next boot, if `05-06`'s check exists, classifies it `corrupt` and New game can clear it. Preconditions: a catalogue row whose `requires_cargo_space` is not a finite non-negative integer, or an implementer who treats any non-numeric value as "no requirement". The committed berth row is well-formed, so this is a content-tamper and a future-ingest bug, not a save-file bug. Impact is still a persisted illegal hold and loss of the previous save.
- **MEDIUM — `applyFit` is not bound to `VISIBLE_EQUIPMENT_KEYS`.** The visible set is a UI filter. `checkFit` as specified will accept any `Equipment` record that passes tech level, credits, and the five conditions. `applyTestEquipment` already grants any catalogue key (`src/app/game-session.ts:372-376`) and taints so it does not save. A station call does save. If `05-05` resolves the selected row by a `data-key` read from the DOM, or if a later caller passes `EQ_ECM`, the purchase persists. Combat equipment is hidden, not unpurchasable, at the only function that moves credits. The plan says "do not read the catalogue by key inside the module", which prevents a lookup, not a forged argument.
- **MEDIUM — The fuel product is not required to be a safe integer before subtraction.** `fitPrice` for fuel is `(fuelCapacity - fuel) * item.price`. The plan says "invalid cost returns 0" without defining invalid as "not a positive safe integer". `EQ_FUEL.price` is 2 today (`src/content/generated/equipment.json:111`). The schema cap on equipment price is none (`src/content/schemas/equipment.ts:25`, `z.number().int()`). A huge but integer price makes the product unsafe; subtracting it from credits yields an unsafe balance. `canPurchase` already rejects prices above `MAX_EQUIPMENT_PRICE` (`src/sim/player/profile.ts:23`, `70-73`). This module should use that predicate on both the catalogue price and the computed fill cost, and the plan does not say to.
- **LOW — Check order disagrees with `canPurchase` on `invalidPrice` versus tech level.** `canPurchase` reports tech level first (`src/sim/player/profile.ts:103-114`). `checkFit` reports invalid key/price first. Not a vulnerability. It will make the F3 reason for a corrupt row differ from the Phase 4 line, which the e2e used to assert. Worth one sentence so the two gates are not "fixed" back together later by dropping the price check.

### Suggestions

- If `requires_cargo_space` is present and `Number` of it is not a safe integer in `0..35`, return `invalidPrice` (or a dedicated refusal), do not treat it as zero. Same for a flag that is present and neither `"true"` nor `true`.
- First line of `applyFit` / `checkFit`: if `item.key` is not in `VISIBLE_EQUIPMENT_KEYS`, return the same profile and `invalidPrice`. That makes the peaceful set a money-path invariant, not a rendering choice.
- Reuse `isValidPrice` for the catalogue price and for the fuel product. Assert `applyFit` of a synthetic price of `Number.MAX_SAFE_INTEGER` returns the same object.

### Risk Assessment

**MEDIUM.** The rules that are fully specified (raw TL, no refund, no script eval, count fields) are sound. The hole is the fail-open reader on a schema that already stores `unknown`, combined with an apply function that will persist whatever record it is given.

## 05-04

### Summary

The view-model split is the right place to pin copy, and the prohibitions on a template language, generated prose, and DOM access are concrete. The security of this plan is almost entirely whether those strings are later written with `textContent` and whether token replacement can be turned into a second expansion pass. The models themselves do not touch IndexedDB or the keyboard.

### Strengths

- Labels already exist as data, not prose (`src/content/schemas/labels.ts:18-26`). Reading `formatTemplates` by a fixed key and throwing `StationModelError` on a miss is the right failure: a missing label fails the boot the way a missing equipment record does (`src/app/game-session.ts:1016-1020`), instead of rendering an empty economy. Boot failure is `textContent` (`src/app/boot-failure.ts:34`), so a zod message in that path is not an HTML sink.
- F7 tech level is specified as `techLevelRaw + 1` at render only. The outfitting model is told to build `FitContext` from the raw value. That is the split that keeps Lave (raw 4) from selling TL 5 items while the screen shows "Tech Level 5".
- Manifest units are specified per commodity, and the plan forbids summing kg/g into tons. Gold's unit in the generated file is `"kg"` with a misleading `podConversion` (`src/content/generated/commodities.json:324-329`). Pinning `kg` / `g` in the status test is what stops a later "fix" that displays gold as tons.
- The outfitting model is required to mark unavailable rows disabled and to keep a detail for a disabled selection. That is the data `05-05` must consult. Reasons are a fixed map from `FitRefusal`, not a string from the catalogue conditions, so a hostile condition value cannot become footer HTML if the shell uses `textContent`.
- No loader import and no DOM import is an acceptance `rg`. The sim/content boundary stays intact.

### Concerns

- **MEDIUM — Token replacement is specified as `String.replace`, which interprets `$` in the replacement.** The action says replace `[system]` with the name and the four value tokens with computed strings. `String.prototype.replace` treats `$'`, `$&`, and `` $` `` in the replacement as patterns. System names and descriptions come from generated JSON, not from the save — the save only carries an allow-listed id (`src/persistence/save.ts:215-217`), and the name is looked up from content. A tampered `g0.json` is the same trust level as the bundle. The practical bug is smaller and does not need a tampered file: if the implementation replaces the system token first, and a name ever contains a later token, a second pass expands it. The plan says "exactly one documented token" but does not say "one pass, replacer function, no `RegExp` built from file data". `LabelsSchema.formatTemplates` is an unbounded `z.record` (`src/content/schemas/labels.ts:25`). A huge template is a DOM allocation, not an injection, if the shell uses `textContent`. If anyone uses the expanded string as HTML, it is XSS. This plan cannot prevent that; `05-05` must.
- **MEDIUM — "A confirm cannot reach apply" is not a property of this module.** Truth 9 says a disabled row cannot reach `applyFit`. `buildOutfittingModel` only returns `enabled: false`. Nothing in this plan wires the session. The guard is entirely in `05-05`. If that task checks the model flag and `05-03`'s `applyFit` does not re-check visibility, a stale `enabled: true` from a previous render is enough. The model plan should not be read as having closed ECON-08.
- **LOW — The status-test acceptance criterion asserts an F7 string.** The criteria say `tests/ui/station-status.test.ts` asserts `2.5 Billion`. That figure is population on F7, not an F5 field. The system-data test is required to assert other Lave values but the criterion that would fail a wrong population formatter is pointed at the wrong file. A green status test does not prove the population line.
- **LOW — `SystemSchema` is a loose object and `description` is an uncapped string** (`src/content/schemas/system.ts:36-64`). Rendering it is fine with `textContent`. A multi-megabyte description is a local DoS of the docked frame. Content is bundled; severity stays low. The plan does not cap the string it copies into the model.

### Suggestions

- Replace tokens with a function replacer or `split`/`join`, never with a replacement string, and never compile a `RegExp` from labels JSON. Do the four substitutions independently so a value cannot contain another token.
- Move the `2.5 Billion` assertion to `station-system-data.test.ts`. Assert the status test does not contain a population line, so the two screens cannot be mixed.
- Have the outfitting model expose `confirmable: enabled === true` and have the session test import that predicate rather than re-implementing the reason strings.

### Risk Assessment

**MEDIUM.** The models are the safest layer in the phase if the shell obeys them. The replacement footgun and the mis-aimed population assertion are real, but they do not by themselves mint credits or parse HTML.

## 05-05

### Summary

This plan turns the tracer shell into the four-screen computer and is where keyboard capture, focus, and the F3 money path meet the DOM. The row model and the fit rules are assumed to hold. The new risks are native button activation, the pause/rebind interaction inherited from `05-01`, and an F-key test that can be passed by enabling station actions in flight.

### Strengths

- F3 confirm is specified to re-run `checkFit` against `system.techLevelRaw`, `FUEL_CAPACITY`, `MAX_MISSILES`, and `availablePods`, then `applyFit`, and to autosave only when the profile object changes. That re-check is what makes a stale "enabled" row safe, if it is actually coded. The Lave e2e (cargo bay short of credits, dock computer `Requires TL 9`, missile `3/3`, remove missile to 800 dc) is a real browser proof of the raw-TL rule, which a unit test with a synthetic TL 9 cannot replace.
- Autosave is required to be absent from `openScreen` / `refreshStation`. The existing attempt counter (`src/app/game-session.ts:436-448`) makes a screen-change write visible. The e2e assertion that `probe.save.committed` rises by exactly one on the removal is the right evidence.
- `innerHTML` is forbidden again, and boot failure already uses `textContent` (`src/app/boot-failure.ts:34`). Descriptions and system text are the XSS sink; keeping them on `textContent` closes it for content strings.
- Direct F-key switching and "Digit1 inert in a section" are end-to-end requirements, not only input-unit requirements. The sim will launch if the command is queued (`src/sim/flight/step.ts:87-88`), so this e2e is the proof that matters.
- The F5 navigation-count assertion is the right shape for "the browser did not reload". It does not prove Firefox or Safari; the plan already treats Digit keys as the reliable path. That is an accepted residual, not a hidden one.

### Concerns

- **HIGH — The capture-phase change from `05-01` is what this plan's F5 proof depends on, and it still fights the rebind listener.** This plan does not revisit `src/ui/controls.ts`. It tells the implementer to keep the capture listener and to prove F5 does not reload. The way to satisfy both the `05-01` test ("F-keys consumed in every context") and this e2e is a capture listener that `preventDefault`s those codes always. That listener, registered at `input.attach()` (`src/app/game-session.ts:1094-1095`), runs before the rebind listener (`src/ui/controls.ts:134-142`). F5 is in the rebind reserved set (`src/ui/controls.ts:29-35`) so the panel will refuse to bind it, but the game listener has already run and, if "consumed" was implemented as "action fires", has opened the status screen during a rebind. Escape still unpauses, as described under `05-01`. This plan's e2e never opens Controls, so the regression ships green.
- **HIGH — Native activation of a `<button>` is outside `ACTION_CONTEXTS`.** Launch today is a click handler that pushes a command (`src/app/game-session.ts:1159-1161`). The plan puts a Launch button in the home section. Tab is not consumed on home (page actions are `dockScreen` only), so Tab focuses that button and Enter/Space activate it. That is allowed on home. It is not allowed in a section, and the plan does not forbid row elements from being `<button>` or `<a>`. If F3 rows are buttons, Enter activates the focused row and also fires `stationConfirm` if the action layer sees Enter. Two applies, or an apply of a disabled row that the click handler does not know is disabled. The e2e uses `page.keyboard` and never focuses a row, so it will not catch this. Preconditions: rows or the launch control are focusable elements that remain in the DOM off the screen that should own them. Impact: launch from a section, or a purchase that skipped the footer confirm.
- **MEDIUM — "F-keys are consumed in every context" can be passed by dispatching them in flight.** The `05-01` test wording is "consumed". This plan's action says the capture listener cancels reserved codes. An implementer can add `flight` to `ACTION_CONTEXTS` for `stationStatus` so that `keyDown` returns true and `preventDefault` runs. F5 in flight then opens the station UI while `state.mode` is `inFlight`. `encodeSave` always writes `mode: "docked"` (`src/persistence/save.ts:80`, `269-272`). A trade applied from that UI autosaves a docked blob. Reload resumes docked with the cargo. The sim will not launch from flight (`src/sim/flight/step.ts:87-88`), so the symptom is a station opened in space, not a second launch. The plan never says "F8 in flight does not change `probe.station.screen` and does not change cargo".
- **MEDIUM — Disabled-row confirm is a session `if`, and `applyFit` will not save it.** Task 1 says confirm on a disabled row leaves the reason and never calls `applyFit`. The acceptance `rg` shows the symbols exist; it does not show the branch. `05-03` does not refuse a hidden key. A single missed `if` persists a TL-illegal purchase. The Lave e2e asserts the dock computer is disabled; it should also press KeyY on that row and assert credits unchanged. The plan does not require that press.
- **MEDIUM — Pause still does not cover this dispatch.** Opening F3 is a station action, not a `Command`. The pause drain (`src/app/game-session.ts:960-964`) will not suppress it unless this plan puts the dispatch inside `if (!paused)`. The overlay does not `inert` `#docked` (`src/ui/pause.ts:42-106` only hides and traps Tab). A trade under the overlay autosaves.
- **LOW — Focus on the section root does not by itself keep keys in the action layer.** `tabindex="-1"` and `.focus({ preventScroll: true })` are right for announcement. A click on the canvas, which this phase still leaves in the DOM under the station, moves focus to the canvas. The plan says not to rely on roving focus, and the action listener is on `window`, so keys should still arrive. That is true only if the listener is not removed or gated on `document.activeElement`. The plan does not say "the window listener ignores focus target except for text fields". The existing `isTextTarget` early return (`src/input/keyboard.ts:172-180`, `197`) must stay, or a capture listener will also swallow the rebind... which is not a text field. Do not treat "focus the section" as the keyboard model.

### Suggestions

- Render rows as non-focusable elements (`div` / `tr`), never `button`. Keep the Launch control as the only button, create it only while `screen === "home"`, and still ignore the launch command unless the session screen is home.
- Split "cancel the browser default" from "dispatch the action" in the e2e: after F5 in flight, assert `performance.getEntriesByType("navigation").length === 1` and `probe.mode` still in flight and `probe.station` absent or `screen` unchanged.
- Press KeyY on the disabled dock-computer row and assert `probe.economy.credits` and `probe.save.committed` are unchanged. That is the guard the `rg` does not prove.
- Dispatch station actions only inside the `!paused` branch, next to `drainCommands`.

### Risk Assessment

**HIGH.** The screen wiring is straightforward. The keyboard and focus model, as specified on top of the current listeners, can launch, confirm, or unpause from a key the plan thinks it has exclusive ownership of. The e2e suite described here will not open the controls panel or focus a button, so it will not see those paths.

## 05-06

### Summary

This plan is the phase's security close: hostile saves, one-write trades, a keyboard loop, and a purity scan. Several of its truths restate guards that earlier plans were supposed to implement, and the backstop ("verify and, where missing, add") is real for the parser bounds. It does not extend the writer gate, it does not make `parseSave` non-throwing, and its headline claim that reload cannot duplicate money is false under the arrival rules `05-01` is required to implement.

### Strengths

- The reject table is the right list for a hostile blob: unknown key, duplicate key, negative or fractional quantity, 18 entries, fuel 71, missiles 4, berths 8, and hold pods over capacity. The 499 kg versus 500 kg pair, the cargo-bay 25 t pair, and the berth −5 t pair are the boundaries that a `>` versus `>=` mistake will get wrong. Putting them in both the unit suite and a browser over-capacity case (21 t Food → `probe.save.status === "corrupt"`, backup present, no Continue) matches how boot already treats `corrupt` (`src/main.ts:145-150`).
- Old blobs stay valid because the fields are optional. That matches `z.strictObject` today (`src/persistence/save.ts:78-96`): a Phase 4 blob has no extra keys, so it still parses. Defaults of empty cargo, fuel 70, missiles 3, berths 0 match `newProfile` as `05-01` defines it. A field-less blob must not be treated as "zero missiles" or the player loses the starting pylons on Continue.
- Taint is already implemented and is the right control for `?test=1`. `autosave` returns before `snapshotForSave` when `testTainted` (`src/app/game-session.ts:445-448`). The hook sets that flag on accepted mutations (`src/app/probe.ts:278-289`) and does not itself write. Requiring the station loop to use real keypresses rather than `test.setCredits` keeps the e2e on the path that is allowed to persist. A plain `?test=1` boot is not tainted; that is why the existing e2e can autosave. The plan states this and should not "fix" it by tainting the boot.
- The purity guard is redundant with ESLint for direct `Math.random` / `Date.now` / DOM globals (`eslint.config.js:113-144`), and that redundancy is useful if someone disables the lint rule. Requiring `withProbeLock` and a `__purity_*` name matches the existing sim-purity probe so a guard test cannot race `tsc` or fail the SPDX scan. Counting files so a new economy module cannot hide is the right shape.
- Market stock is specified as not persisted. The reload assertion (stock 15 before, 16 after, `arrival === 0`) will actually prove regeneration. That proof is also the proof of the arbitrage below; the plan should not describe it only as a safety property.

### Concerns

- **HIGH — "Reloading cannot duplicate money" is not what the atomic snapshot guarantees.** Truth 6 and T-05-15 say one snapshot prevents a reload from duplicating credits. The snapshot does prevent a split write (credits committed, cargo not, or the reverse). It does not prevent this loop, which the plans require:
  1. Dock. `05-01` generates arrival 0 and increments on every later `docked` event. D-17 regenerates the market on that event. Phase 4 already launches and docks.
  2. Launch and redock until a good is cheap. Buy it. Autosave writes credits and cargo, not the market (`05-01` step 7, D-19).
  3. Reload. Arrival resets to 0 (`05-01` step 7, D-18). The arrival-0 market is regenerated, which this plan's own e2e asserts (Food stock returns to 16).
  4. Sell at the arrival-0 price. If that price is higher than the price paid on arrival N, credits increase. Repeat.
  Optional stopping on independent rolls has positive expected value. No hostile blob is required. Oolite regenerates on `setSystemTo` (system change), which this phase cannot even reach; regenerating on every redock is stronger than that and is what makes a single station a slot machine. The threat register does not list it. The e2e that checks "stock is 16 again" certifies the mechanism. Preconditions: a player who can launch and dock, which Phase 4 already shipped. Impact: unbounded credit gain, contradicting the phase's "cannot duplicate money" close.
- **HIGH — The capacity backstop is still only on the read path.** Task 1 says verify `parseSave` and add the check if it is missing. It does not mention `isEncodedSaveValid` (`src/persistence/save.ts:233-241`) or `queueAutosave` (`src/persistence/autosave.ts:71-76`). A blob the reader will call `corrupt` can still be the blob the writer just committed, replacing a good save. The browser test writes an over-capacity blob by hand and expects `corrupt`. It does not start from a valid save, apply a buggy trade, and assert the previous blob is still the one in the store. That is the data-loss case.
- **MEDIUM — A throw in the new check locks the origin.** As under `05-01`: `main.ts:168-171` maps a throw to `unavailable`, and `canClear` / `canOverwrite` refuse to touch it (`src/app/game-session.ts:409-420`). Task 1's behavior list says "return corrupt". It does not say "never throw", and the unit table will not catch a throw if the test uses a helper that already returned. A capacity function that throws on an unknown unit (the unit map and the key allow-list disagree) locks Continue and New game. The over-capacity e2e uses a known key, so it stays green.
- **MEDIUM — Negative capacity is only rejected if the comparison does not clamp.** Seven berths and no cargo bay is `20 - 35 = -15`. `holdPodsUsed([]) > -15` is true, so an unclamped comparison rejects an empty hold, which is what the research asked for. If `capacityPodsFor` returns `max(0, capacity)` first, `0 > 0` is false and the save loads with seven berths and zero capacity. The action says `holdPodsUsed > capacityPodsFor` and does not say "do not clamp before the comparison". The 499/500 kg cases do not catch this. A hostile blob with `passengerBerths: 7` and no `EQ_CARGO_BAY` is the trigger.
- **MEDIUM — The purity scan does not see the bypasses that matter, and the plan presents it as the determinism close.** A source `rg` for `Math.random` misses `globalThis["Math"]["random"]`. ESLint's `no-restricted-properties` (`eslint.config.js:120-126`) misses that too. That is an existing limitation; calling the new test a proof that "the new economy is independently guarded" overclaims it. The scan also does not read `game-session.ts`, which is where `Date` and the DOM are allowed and where a market seed could be taken from `Date.now()` without the guard noticing. Arrival is specified as a session counter, which is fine, but the guard does not lock that.
- **LOW — Settings written by this phase become `corrupt` on an older build.** `parseSettings` fails the whole blob on an unknown action id (`src/settings/schema.ts:105-106`), and the store then backs it up and returns defaults (`src/settings/store.ts:67-70`). `saveSettings` writes every action (`src/settings/store.ts:85-90`). After Phase 5 persists bindings, a downgrade wipes controls settings. Not a save-game hole. The plan records the save forward-compat caveat and not this one.

### Suggestions

- Narrow truth 6 to the property that is actually true: one snapshot cannot split credits from cargo. Separately, either stop regenerating the market on a redock of the same system (match `setSystemTo`, not every `docked` event) or persist the arrival seed with the cargo so a reload cannot sell arrival-N cargo at arrival-0 prices. D-18 forbids persisting the counter; the honest fix inside that decision is to stop claiming reload is economically idempotent, and to regenerate only when the system id changes. Phase 5 has no hyperspace, so a stable market for the stay is the safe default.
- Pass allow-lists into the writer check. Test: valid save in the store, in-memory profile forced over capacity, `autosave()`, store bytes unchanged, `reason === "invalid-save"`.
- Add `expect(() => parseSave(hostile, allow)).not.toThrow()` for every reject row, and a row with seven berths, no cargo bay, and empty cargo that must be `corrupt`.
- Point the purity comment at ESLint as the primary control. Add one session test that market generation is called with the session counter and not with `Date.now()`.

### Risk Assessment

**HIGH.** The reject table is the best save hardening in the phase, and it should land. The plan's own success sentence — reload cannot duplicate money, and a bad snapshot cannot destroy a good one — is not implemented by the tasks as written.

## Cross-Plan Comparison

The six plans agree on the right architecture: pure economy, session-owned market, optional v1 fields, entry-array cargo, `textContent`, raw tech level, no condition scripts, no new packages. Those choices match the code that already exists (`parseSave`, `canPurchase`, `buyDockComputer`'s re-check, the sim ESLint zone, the boot-failure `textContent` path). The disagreements are about which plan is supposed to close a guard, and about claims that are stronger than the mechanism.

The keyboard contract is specified in `05-01`, proved only for Digit1/Escape/F5 in `05-05` and `05-06`, and never reconciled with `src/ui/controls.ts` or `src/app/game-session.ts:563-577`. `05-05` depends on `05-01`'s capture listener to satisfy the no-reload e2e. That is a cross-plan hazard: the proof encourages the dangerous implementation.

Money safety is split so that `05-01` ships a buy path without `invalidPrice`, `05-02` adds the refusal, `05-03` adds a second money path (`applyFit`) with a fail-open condition reader, and `05-06` asserts the composition. `05-05` does not depend on `05-02`. A wave that stops after `05-05` has F3 purchases and F8 buys without the sell-side safe-integer refusal, and with the narcotics `NaN` still possible. The phase gate is `05-06`, so this is a sequencing hazard rather than a ship hazard, but only if `05-02`'s checks are actually in `planBuy` and not only in `planSell`.

The save invariant is split the other way. `05-01` adds the fields and says `parseSave` rejects over-capacity. `05-06` repeats that and will add it if missing. Neither task extends `isEncodedSaveValid`. Both cite the existing comment that a snapshot the parser would reject must not be written. The citation is accurate (`src/persistence/autosave.ts:71-76`); the function they cite does not perform the new check (`src/persistence/save.ts:233-241`). That is a guard claimed by reference to code that will not do the new job.

The economy-integrity claim is the sharpest cross-plan contradiction. `05-01` resets arrival to 0 and regenerates on every dock, because D-18 and D-17 say so. `05-06` treats the resulting stock change on reload as proof that money was not duplicated. The stock change is the price change. Cargo persists across it. The two plans together implement a credit farm and then describe it as the mitigation for T-05-15.

Profile field preservation is named in `05-01` and assumed afterwards. `05-03` and `05-05` spread `...profile` in the new apply path. They will not fix `setCredits` or the restore factory if `05-01` missed them. A single leftover literal at `src/app/game-session.ts:1057` or `src/app/game-session.ts:378-381` writes an empty hold on Continue or on a test grant that later becomes untainted. The later plans have no `rg` for that literal.

`05-04` is the only plan that does not move money or the save schema. Its output is only safe if `05-05` writes it with `textContent` and if token replacement cannot be re-expanded. Those are obligations `05-04` states and `05-05` only partially checks (`rg innerHTML` on one file).

Dependency order is otherwise sound: content and the buy path before goldens, rules before the F3 screen, models before DOM, save hardening after the fields exist. The missing edges are not missing tasks so much as tasks that stop at the read path, the happy key, and a self-generated fixture.

## Overall Risk Assessment

**HIGH.**

The phase can be implemented without a remote exploit: there is no server, the save is local, and the XSS control (`textContent`) is repeated often enough that a careful implementer will follow it. The high risk is local and concrete. A capture-phase keyboard listener, as `05-01` requires and `05-05` depends on, breaks the rebind and subpanel swallow that `src/ui/controls.ts:8-11` documents, because those listeners use `stopPropagation` on the same `window` and are registered later than `input.attach()`. A reload after a redock, which `05-01` and `05-06` both require, keeps cargo bought at one seed and sells it at another, so the claim that reload cannot duplicate money is false. The writer gate that is supposed to stop a bad snapshot from replacing a good save does not see cargo capacity, and no plan adds that check. Narcotics' equal peaks are in the pinned plist and in neither the generator steps nor the golden anchors, so a `NaN` price can pass the fixture process `05-02` calls a proof.

The save reject table, the optional v1 fields, the entry-array cargo, the raw tech-level gate, the no-refund removal, and the taint flag are the right controls and should not be weakened while the gaps above are closed. Until the keyboard listener stays on bubble (with a narrow F-key `preventDefault`), the writer check shares the capacity rule, equal peaks are an ordinary test, and the arrival/redock rule is either changed or honestly excluded from the money-duplication claim, the phase should not be treated as having closed its threat register.

---

## Consensus Summary

### Agreed Strengths

- **The sim boundary is respected.** Every reviewer found the plans keep `src/sim/` free of Three.js and the DOM, with rendering, input, and UI downstream through commands/events, and 05-06 adds a guard for the new economy modules. The pure economy/trade/outfitting split is the right shape and is unit-testable without a browser.
- **The Oolite numbers were independently checked and are right.** Reviewers confirmed the RANROT generator, the economy/price formula shape, the 127-unit stock cap, integer decicredits, the pod constants, and the Lave system data against `/home/opencode/git/oolite` and the pinned configs. Equipment prices and raw tech levels also match (`EQ_CARGO_BAY` 4000, docking computer 15000/TL 9, galactic drive 50000, advanced compass 6500, ANA 22500, missile 300, passenger berth 8250).
- **Content stays generated, not hand-edited.** 05-01 extends the existing compiler (`tools/oolite-ingest/generate.ts:112`, `tools/oolite-ingest/convert/commodities.ts:173`) to resolve commodity names and peaks, and 05-04 loads labels through a validated zod schema rather than embedding strings in UI code.
- **Persistence reuses the strong existing base.** The plans build on the serialized, transaction-committing IndexedDB store (`src/persistence/idb-store.ts:130-154`) and the strict save schema with unknown/duplicate rejection (`src/persistence/save.ts:78-96`, `:204-220`) instead of adding a second persistence path or a database.
- **Defense in depth is retained at the session boundary.** Re-planning and re-checking eligibility before mutating the profile mirrors the existing purchase pattern (`src/app/game-session.ts:354`, `src/sim/player/profile.ts:131`).
- **Content is rendered as text.** The plans consistently use `textContent` and pure view models, so generated labels and descriptions are not interpreted as markup.

### Agreed Concerns

Concerns raised by two or more independent reviewers, in priority order.

1. **The kg/g purchase limit is arithmetically wrong when the held commodity already occupies a pod (05-02).** The plan mandates `availablePods * podSize + safeMax - alreadyHeld` (`05-02-PLAN.md:127`, `:134`). With 19 t of bulk cargo plus 600 kg of gold in a 20-pod hold, the gold already consumes one pod, so `availablePods = 0` and the limit becomes `499 - 600 < 0`: every further gold purchase is refused even though the same pod can hold up to 1,499 kg. Oolite's purchase path explicitly considers space in an already-accounted-for pod (`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:10030-10049`, hold math at `:9508-9544`). Raised HIGH by architect, algorithm, and correctness reviewers; the planned 499/500-from-empty and full-hold-with-zero-held cases cannot catch it. Feasibility should be derived from `podsFor(held + requested) <= capacity` (or a maximum-final-quantity calculation), with `held > 0` boundary tests at 499/500/600/1499/1500 kg and the gram equivalents.

2. **The writer-side save gate is not extended, so a schema-valid bad snapshot can replace the last good save (05-01/05-06).** The new capacity, commodity allow-list, and duplicate-key rules are assigned to `parseSave`, but `queueAutosave` validates with `isEncodedSaveValid` (`src/persistence/autosave.ts:71-76`), which only checks size and the zod shape (`src/persistence/save.ts:225-241`). An internal bug that produces over-capacity cargo or a non-canonical key can therefore pass the writer, overwrite a good blob, and only be classified `corrupt` on the next boot; `canClear` then permits New game to delete it. Raised by architect, algorithm, adversarial, and correctness reviewers. The same semantic checks must run before commit, and a test must prove a rejected snapshot leaves the previous IndexedDB bytes untouched.

3. **Moving game input to the capture phase breaks existing swallow contracts (05-01/05-05).** The controls panel relies on capture + `preventDefault` + `stopPropagation` so the game's bubble-phase listener never sees a key being rebound (`src/ui/controls.ts:8-11`, `:134-142`). The game attaches its input earlier (`src/app/game-session.ts:1094-1095`) than the rebind listener, so a capture-phase game listener runs first and `stopPropagation` in the rebind handler cannot undo it: Escape during rebind both cancels capture and toggles pause, and the same ordering defeats the subpanel handler (`src/app/game-session.ts:563-577`). Raised by architect, blast-radius, and adversarial reviewers; the planned DOM-free input tests never open Controls. A central context/modal dispatcher that suppresses gameplay before rebind capture is needed.

4. **The proposed no-reload proof cannot detect a reload (05-05/05-06).** `performance.getEntriesByType("navigation").length === 1` is normally true for the newly loaded document as well, so a transient reload satisfies it (`05-05-PLAN.md:168`, `:172`, `:182`). Raised by architect, algorithm, correctness, and blast-radius reviewers. Use a document-lifetime sentinel or main-frame navigation observation, and assert the station state survived.

5. **Most market goldens are self-referential, so they cannot prove ECON-01 fidelity (05-02).** The fixture writer and the test both call `generateMarket` (`05-02-PLAN.md:159`), so regenerating after a formula error makes them agree; only the food/computer anchors are independent. Raised by architect, algorithm, adversarial, and correctness reviewers. Add an independently computed reference (with provenance and a separate generator) for all goods and representative seeds, keep the generated goldens as regression snapshots, and make the claimed 126/127/128, non-finite-price, RANROT, and float-grouping proofs explicit tests.

6. **Station actions are not drained or suppressed while paused (05-01/05-05/05-06).** The frame loop drains ordinary commands in the paused branch (`src/app/game-session.ts:916-965`) but the new `drainStationActions()` is dispatched before the fixed step without a `!paused` condition. After Escape in `dockScreen`, Digit8 can open the market beneath the overlay (or a queued action can fire on resume), and KeyY can confirm a trade the player cannot see. Also breaks pause from a section because `pause` is not valid in `dockScreen` and capture-phase Tab/Enter `preventDefault` interferes with `#pause` focus/activation. Raised by algorithm, adversarial, blast-radius, and correctness reviewers. The final keyboard matrix must include paused-over-each-docked-state.

7. **The peaceful visible set is not enforced at the pure rule boundary (05-03/05-05).** `checkFit` validates price, fuel, tech level, ownership, counts, conditions, and credits but has no refusal for a key outside `VISIBLE_EQUIPMENT_KEYS`, and `FitRefusal` has no `notOffered` reason (`05-03-PLAN.md:119-122`). `EQ_ECM` with sufficient synthetic TL and credits can satisfy every listed check; the session's row resolution mitigates normal UI use but does not close the pure API. Raised by algorithm, adversarial, and correctness reviewers. `applyFit`/`checkFit` should refuse unoffered keys directly.

8. **The economy-purity guard names the wrong relative import path (05-06).** The plan allows a type-only import of `../content/types.js` (`05-06-PLAN.md:202`), but `src/sim/economy/*` and `src/sim/player/outfitting.ts` are two levels below `src/`, so the correct specifier is `../../content/types.js` (as in `src/sim/world/layout.ts:29`). An exact-string allow-list would reject legitimate imports and invite weakening the guard. Raised by architect, blast-radius, and correctness reviewers. The scan should resolve module paths rather than match one spelling, and include positive and negative nested-module cases.

9. **Confirmation semantics are underspecified: unit price vs total, and `pending === null` on refusal (05-01/05-02/05-04).** The market model takes `pending` and formats `pendingText` from it, yet a zero-feasible request must leave `session.pending` null while still showing the refusal/clamp reason. Separately, `priceText` is used for both a row's unit price and the confirmation, while D-06 requires the total (`Buy 12 t Food for 45.6 Cr?`). Raised by architect, blast-radius, and correctness reviewers. Pass the approved integer `TradePlan.cost` as the confirmation total, and keep refusal/clamp copy in a separate field from the `[Y/N]` prompt.

10. **05-01 is a maximum-blast-radius tracer executed at low confidence (05-01).** One plan spans content generation, four economy modules, profile/save contracts, keyboard dispatch, a replacement station DOM controller, session orchestration, probes, browser tests, and deletion of `src/ui/docked.ts` — with no `tests/sim/economy` suite in its scoped verification. Raised by architect, correctness, algorithm, and blast-radius reviewers, though they disagree on whether to split it (see Divergent Views). At minimum its verification must include independent economy tests before downstream plans treat the trade module as trusted.

11. **The displayed missile-removal description contradicts the no-refund rule (05-03/05-04).** The generated description promises the weapons are resold at full market value (`src/content/generated/equipment.json:243`), 05-04 displays the catalogue description verbatim (`05-04-PLAN.md:172`), and 05-03 deliberately charges 200 dc and refunds nothing (`05-03-PLAN.md:162`). A player following the text loses all missiles and pays the fee. Raised by architect, correctness, and blast-radius reviewers. The no-refund policy is a locked decision; the presentation is not — add an explicit truthful app-side description and assert the detail with the exact credit delta.

12. **Additive v1 fields are destructive on an older build (05-01/05-06).** Writing new optional keys without a version change is rejected by the shipped strict schema as `corrupt` (`src/persistence/save.ts:78`, `:194`), not `future-version`; boot only makes a best-effort backup and New game can clear the corrupt primary. Raised by architect and adversarial reviewers (adversarial also notes the settings schema analogue). This needs an explicit owner decision, not a silent change.

13. **Reload/redock market regeneration makes a single station a credit slot machine (05-01/05-06).** Arrival resets to 0 on reload and the market regenerates on every dock, while cargo and credits persist; buy at a low arrival-N price, reload, sell at the arrival-0 price (`05-01-PLAN.md` step 7, D-17/D-18). The e2e that asserts "Food stock returns to 16" certifies the mechanism while 05-06 claims reload cannot duplicate money. Raised HIGH by the adversarial reviewer and independently noted by the correctness reviewer (arrival can also double-increment if start-while-docked emits a `docked` event). Either change the regeneration rule or remove the money-duplication claim.

14. **DOM changes collide with existing browser tests (05-01/05-05).** Adding a second `<footer>` inside `#docked` breaks the bare `page.locator("footer")` strict-mode assertions in `tests/e2e/precision.spec.ts:72-74` and `tests/e2e/fallback.spec.ts:62`, and inherits the global `footer { position: fixed; ... }` rule at `index.html:311-321`. Separately, `tests/e2e/launch.spec.ts:141-143,207` requires `[data-field="message"]` to update synchronously and to be empty when no hint is active, so key hints need their own field. Raised by blast-radius and correctness reviewers; the affected specs are outside the early waves' scoped `<verify>` blocks, so the breakage surfaces only at the 05-06 phase gate.

### Divergent Views

- **Split 05-01 or keep the vertical slice.** The architecture reviewer recommends splitting the tracer; the algorithm reviewer explicitly says the breadth is intentional vertical-slice design and is not a request to split. The other three flag the breadth as risk without prescribing a split. Resolution: keep the tracer, but add independent economy tests to its verify block rather than deferring all numerical oracles to 05-02.
- **Severity of 05-03/05-04.** The architecture reviewer rates both HIGH because the misleading removal description and confirmation total can cause financially different transactions from those shown. The blast-radius reviewer rates 05-03 LOW and 05-04 MEDIUM, and the correctness reviewer rates 05-04 LOW-MEDIUM, treating most findings as specification precision rather than user-visible harm. The specific copy and total issues are agreed; only their severity is disputed.
- **Reload arbitrage.** The adversarial reviewer treats the dock/reload price reset as a HIGH, unbounded credit exploit. The other reviewers either accept arrival reset as intended fidelity or only flag the arrival double-increment edge; the threat register does not list the arbitrage. This deserves an explicit product decision rather than silent acceptance.
- **Narcotics equal peaks.** The adversarial reviewer alone identifies that `peak_export == peak_import == 0` for narcotics (`/home/opencode/git/oolite/Resources/Config/trade-goods.plist:116-121`) requires an early `bias = 0` return, or the formula produces `0/0 → NaN` prices. The architecture and algorithm reviewers discuss the surrounding float32 rounding but not this guard. The claim is concrete and checkable; it should be treated as a requirement even though only one reviewer raised it.
- **The `<footer>` collision.** Only the blast-radius reviewer traced the Playwright strict-mode and global CSS consequences. It is verifiable at `index.html:311/434` and the cited specs, so it should be fixed regardless of the single-reviewer count.
- **Residual risk after fixes.** The blast-radius reviewer projects LOW-MEDIUM once the listed seams are aligned; the algorithm reviewer projects MEDIUM after the kg/g formula is corrected; the architecture and adversarial reviewers hold HIGH until the persistence writer, keyboard contract, and reload rule are resolved. The difference is about how much of the save/integrity contract must be closed before the phase gate.

---
