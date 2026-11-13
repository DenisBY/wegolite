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
