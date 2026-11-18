---
phase: quick
plan: 261118-emk
type: execute
wave: 1
depends_on: []
files_modified:
  - src/sim/player/outfitting.ts
  - src/ui/station-model.ts
  - src/ui/station.ts
  - src/app/session/station-controller.ts
  - index.html
  - tests/sim/player/outfitting.test.ts
  - tests/ui/station-outfitting.test.ts
  - tests/app/session/station-controller.test.ts
  - tests/e2e/station.spec.ts
  - tests/e2e/autosave.spec.ts
  - CHANGELOG.md
  - FIDELITY.md
  - .planning/PROJECT.md
autonomous: true
requirements: [ECON-05, ECON-08]

estimate:
  tokens: 130000
  raw_tokens: 130000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "At Lave (raw TL 4) a new commander's F3 lists exactly, in order: Large Cargo Bay, Missile (3/4), Remove Missile — 20 ₢, Remove Laser, Pulse Laser, Beam Laser. Docking Computers, Galactic Hyperdrive, Advanced Space Compass, Advanced Navigational Array, Passenger Berth, Mining Laser and Military Laser are not shown, because they are above the station's tech level (Oolite equipmentAllowed, PlayerEntity.m:8293-8302 at 7437f22)"
    - "A row is listed only when every rule passes except affordability. Items that are already installed, have no free pylon, need cargo space the hold lacks, would go past the 7-berth bound or have nothing to remove are hidden. Fuel is hidden at a full tank. Wegolite's own integrity refusals (Price unavailable, Not available, Not offered) are hidden too, so a row that can never be bought is never shown"
    - "An item the commander cannot afford stays listed, dimmed, with 'Not enough credits'. Y on it shows that notice, opens no prompt and writes no save. Credits never change which rows are listed: for any profile and tech level, the listed keys are the same at 0 and at 10,000,000 credits"
    - "Up and Down move over listed rows only. If a purchase hides the selected row (the fourth missile), the cursor lands on the row now at that position (Remove Missile), and one further Y only opens the [Y/N] guard and buys nothing"
    - "With nothing listed (raw TL 0, full tank, new commander) F3 shows Oolite's 'No equipment available for purchase.' (descriptions.plist equip-no-equipment-available-for-purchase, PlayerEntity.m:8511) with no selected row and an empty detail pane. Y, Up and Down do nothing: no notice, no prompt, no save"
    - "The laser facing sub-list is unchanged (Oolite shows every facing the ship has). A laser row is listed when at least one facing passes every rule except affordability. A listed laser that no facing can afford shows 'Not enough credits'"
    - "FIDELITY.md gains a faithful Mechanics row and an excerpt of PlayerEntity.m:8293-8302 taken from the pin, plus an Open items bullet for the unaffordable-row marker and bargain tech days. CHANGELOG [Unreleased] Changed describes the change. The PROJECT.md row 'Enforce the docking computer's TL 9 gate against the raw system tech level' carries an amendment, because its outcome cites a disabled TL 9 line that is now hidden"
  artifacts:
    - path: "src/sim/player/outfitting.ts"
      provides: "isListedForPurchase(check: FitCheck) and an exhaustive Record<FitRefusal, boolean> listing table (only insufficientCredits listed)"
      contains: "isListedForPurchase"
    - path: "src/ui/station-model.ts"
      provides: "buildOutfittingModel keeps only listed rows; OutfittingModel.emptyText; OUTFITTING_EMPTY_TEXT"
      contains: "OUTFITTING_EMPTY_TEXT"
    - path: "src/ui/station.ts"
      provides: "renderOutfitting writes emptyText into the outfitting-empty line and hides it when empty"
      contains: "outfitting-empty"
    - path: "index.html"
      provides: "the outfitting-empty paragraph in the F3 panel, centred"
      contains: "data-field=\"outfitting-empty\""
    - path: "src/app/session/station-controller.ts"
      provides: "confirmFit is inert on an empty F3 list"
    - path: "FIDELITY.md"
      provides: "Mechanics row plus the excerpt for PlayerEntity.m:8293-8302, and an Open items bullet"
      contains: "PlayerEntity.m:8293-8302"
  key_links:
    - from: "src/ui/station-model.ts"
      to: "src/sim/player/outfitting.ts"
      via: "buildOutfittingModel filters each checkFit / checkLaserFit result through isListedForPurchase"
      pattern: "isListedForPurchase"
    - from: "src/app/session/station-controller.ts"
      to: "src/ui/station-model.ts"
      via: "moveOutfittingSelection, ensureOutfittingSelection and confirmFit's post-purchase clamp all walk OutfittingModel.rows, which now holds listed rows only"
      pattern: "outfittingModel\\(\\)"
    - from: "src/ui/station.ts"
      to: "index.html"
      via: "requireElement('[data-field=\"outfitting-empty\"]') fed from OutfittingModel.emptyText"
      pattern: "outfitting-empty"
---

<objective>
Make F3 list only the equipment the commander can buy or fit at this station, as Oolite's `equipmentAllowed` does. Items the commander cannot afford stay listed with the "Not enough credits" marker. This is the owner decision of 2026-11-18 (locked).

Purpose: Oolite's outfitting screen never shows an item that is above the station's tech level, already fitted or impossible to add (`PlayerEntity.m:8293-8302` at pin 7437f22: `techlevel < minTechLevel`, `canAddEquipment:inContext:@"purchase"`, and `available_facings == 0` for primary weapons). Wegolite instead lists every D-11 item with a dimmed refusal ("Requires TL 9", "Pylons full", …). The credit check is not part of `isOK`, so Oolite lists items the commander cannot afford and refuses them only at purchase (`PlayerEntity.m:9134`, `:9188`).

Output: one listing predicate in the simulation, a filtered row model with Oolite's empty-state text, an inert confirm on an empty list, re-pinned unit, controller and browser tests, plus FIDELITY, CHANGELOG and PROJECT.md entries.

Reading of the owner's open checks (recorded here so the executor does not re-decide):
- Oolite does NOT dim unaffordable rows. It draws them in the item's `displayColor` or `equipment_option_color` (`PlayerEntity.m:8380-8384`) with no marker. The owner locked "stay VISIBLE with the 'Not enough credits' marker", so the current Wegolite rendering stays: dimmed, the marker, not confirmable. FIDELITY Open items records this presentation difference. Dropping the dimming would be a one-line change to `dimmed`. It is NOT made here.
- In Oolite, `available_facings == 0` means the ship has no weapon facings at all, not "every facing occupied". Lasers are never "already installed", because `hasEquipmentItem` excludes weapons (`ShipEntity.m:2796-2799`), and a fitted facing can always be traded in. The Cobra has four facings, so in practice a laser is hidden only by the tech level (or by Wegolite integrity refusals). Remove Laser stays listed only while some facing carries a laser (existing Wegolite rule, unchanged).
- Mapping of every `FitRefusal` (src/sim/player/outfitting.ts:128-140) to Oolite: notOffered (not in the shipyard options) hidden; techLevel (`techlevel < minTechLevel`) hidden; owned (`!canCarryMultiple && hasEquipmentItem`, `ShipEntity.m:2890-2891`) hidden; pylonsFull (`missiles >= max_missiles`, `ShipEntity.m:2886-2889`) hidden; cargoSpace (`availableCargoSpace < requiredCargoSpace`, `ShipEntity.m:3060`) hidden; nothingToRemove (`requires_mounted_pylon` / `requires_free_passenger_berth`) hidden; fullFuel (`requires_non_full_fuel`) hidden; maxInstances (Wegolite's 7-berth save bound, where Oolite's limit is the cargo-space condition) hidden; noLaser (Remove Laser on an empty facing) hidden; invalidPrice ("Price unavailable") and invalidCondition ("Not available") are Wegolite fail-closed integrity guards with no Oolite counterpart, hidden because the row can never be bought; insufficientCredits LISTED.
- Out of scope: Oolite's bargain tech days (`PlayerEntity.m:8274-8285`), already recorded as `.planning/todos/pending/2026-11-18-outfitting-bargain-tech-days.md`. Do not implement them.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@src/sim/player/outfitting.ts
@src/ui/station-model.ts
@tests/ui/station-outfitting.test.ts

Reviewer and subagent brief (verbatim from AGENTS.md; include it in any subagent prompt):

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser), `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

Working rules for this plan:
- Use the codebase-memory MCP index (project `wegolite`) before grepping (`search_graph`, `trace_path`, `get_code_snippet`). Fall back to `rg` (never `grep`) for literals and non-code files. Include both instructions in any subagent prompt.
- Read Oolite behaviour from the local checkout `/home/opencode/git/oolite`. Never fetch Oolite files over the network. Quote every FIDELITY excerpt from the pin with `git -C /home/opencode/git/oolite show 7437f22:src/Core/Entities/PlayerEntity.m`, because the checkout's HEAD is not the pin.
- Quick task 261118-cyn (flight HUD) may land before or during this one and may touch index.html, FIDELITY.md, CHANGELOG.md and .planning/PROJECT.md. Re-read every file right before editing it, keep cyn's edits intact, and take the next free FIDELITY id from the file at that moment. At planning time HEAD's highest id is E-107, so the expected id is E-108. The contract accepts `E-\d{2,3}`.
- Owner policy: targeted Vitest, typecheck and lint run in local Docker. `verify`, `verify-full` and every browser (e2e) run happen ONLY on the remote, through `/home/opencode/.claude/scripts/wegolite-remote-run.sh <docker compose args>`. The wrapper syncs the COMMITTED HEAD and wipes the remote tree on each run, so commit first. Run ONE remote run at a time, never concurrently, including runs from another quick task: check `pgrep -f wegolite-remote-run.sh` before starting. Long runs go in the background; wait for the exit line.
- Format edited Markdown, HTML and TypeScript with prettier inside the lint container (`docker compose run --rm lint npx prettier --write <files>`), never on the host.
- Known flakes (rerun once before treating a failure as real): `tools/oolite-ingest/convert/textures.test.ts` (5000 ms), e2e `launch.spec.ts:129` and `save-load.spec.ts:634`.
- The NPC acceptance run is not due: nothing under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` changes. Say so in the SUMMARY.
- Re-pin every moved pin (expected key lists, ArrowDown counts, footer strings) and give its traced cause in the commit message and the SUMMARY.
- Commit each task separately. Messages in English, ending with the attribution lines from the system reminder. Do not push.

Interfaces the executor extends (current signatures at HEAD):
- `checkFit(profile, item, ctx): FitCheck` (src/sim/player/outfitting.ts:274) and `checkLaserFit(profile, item, facing, ctx): FitCheck` (:562). In both, affordability is the LAST gate (`insufficientCredits` at :382 and :606). `canPurchase` (src/sim/player/profile.ts:175) checks techLevel, owned and invalidPrice before credits. The listing predicate depends on this ordering.
- `buildOutfittingModel(catalogue, profile, systemTechLevelRaw, selectedKey, unitByKey, facingFor = null): OutfittingModel` (src/ui/station-model.ts:893). The main-list loop is at :926-957, the laser loop at :964-994, and `buildFacingModel` at :1023. `OutfittingModel` (:791) has rows, detail, fuelVisible, selectedKey and facingFor. `fitReason` (:809) stays exhaustive and unchanged: the facing sub-list and the stale-confirm path still render its copy.
- Controller (src/app/session/station-controller.ts): `ensureOutfittingSelection` :258, `moveOutfittingSelection` :270 (already returns on zero rows), `confirmFit` :414 (`row === undefined` sets the notice "Not offered" at :432-437; the post-purchase clamp by position is at :491-499), and `confirmLaserFit` ends with `ensureOutfittingSelection`.
- The INTERFACES empty-text pattern to copy: `INTERFACES_EMPTY_TEXT` (src/ui/station-model.ts:1083), pinned against `third_party/oolite/Config/descriptions.plist` by `tests/ui/station-interfaces.test.ts:23-36`. The vendored plist has `"equip-no-equipment-available-for-purchase" = "No equipment available for purchase.";` at line 1845.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: List only fittable F3 rows end to end: simulation predicate, row model, empty state, inert confirm, DOM line</name>
  <files>src/sim/player/outfitting.ts, src/ui/station-model.ts, src/app/session/station-controller.ts, src/ui/station.ts, index.html, tests/sim/player/outfitting.test.ts, tests/ui/station-outfitting.test.ts, tests/app/session/station-controller.test.ts, CHANGELOG.md</files>
  <behavior>
    - isListedForPurchase: true for `{ ok: true }` and for every refusal of `insufficientCredits`. False for each of the other eleven FitRefusal values. The test walks a literal list of all twelve reasons, so a new reason fails it until it is classified.
    - Affordability is the last gate: with 0 credits, checkFit still reports techLevel (EQ_DOCK_COMP at raw 4), and at raw 11 it reports owned (EQ_CARGO_BAY already fitted), pylonsFull (4 missiles), cargoSpace (a berth with a 20 t food hold) and maxInstances (7 berths). It never reports insufficientCredits for any of these.
    - Lave (raw 4), new commander: row keys are exactly [EQ_CARGO_BAY, EQ_MISSILE, EQ_MISSILE_REMOVAL, EQ_WEAPON_NONE, EQ_WEAPON_PULSE_LASER, EQ_WEAPON_BEAM_LASER]. With fuel 34, EQ_FUEL comes first. emptyText is "".
    - The D-11 order still holds when everything is listed: raw TL 10, credits 10,000,000, fuel 34, 1 passenger berth, an empty hold and the stock fore pulse laser give exactly [EQ_FUEL, EQ_CARGO_BAY, EQ_DOCK_COMP, EQ_GAL_DRIVE, EQ_ADVANCED_COMPASS, EQ_ADVANCED_NAVIGATIONAL_ARRAY, EQ_MISSILE, EQ_PASSENGER_BERTH, EQ_PASSENGER_BERTH_REMOVAL, EQ_MISSILE_REMOVAL, EQ_WEAPON_NONE, EQ_WEAPON_PULSE_LASER, EQ_WEAPON_BEAM_LASER, EQ_WEAPON_MINING_LASER, EQ_WEAPON_MILITARY_LASER].
    - Hidden: EQ_MISSILE at 4 missiles; EQ_CARGO_BAY when owned (raw 11, rich); EQ_PASSENGER_BERTH with food 20 (no cargo space) and at 7 berths; the Mining and Military lasers at Lave; the Beam laser at raw 3.
    - Listed but refused: at Lave EQ_CARGO_BAY is listed with enabled false, dimmed true, confirmable false and reason "Not enough credits". With 3,999 credits the Pulse laser row is listed with reason "Not enough credits".
    - Credits never change membership: for each tech level in {0, 3, 4, 10} and each profile in {new commander, fuel 34, 4 missiles, 1 berth, 7 berths, food 20, every laser mount empty}, the listed keys at credits 0 equal the listed keys at credits 10,000,000.
    - Empty: raw TL 0 with a new commander (full tank) gives rows [], emptyText "No equipment available for purchase.", and detail null. OUTFITTING_EMPTY_TEXT equals the vendored descriptions.plist value of equip-no-equipment-available-for-purchase.
    - The facing sub-list is unchanged: the existing tests "opens the four facings …", "disables Remove Laser on an empty facing with 'No laser fitted'" and "disables only the facings that cannot afford the laser" pass unmodified.
    - Controller: rich commander (50,000 credits) at Lave. moveTo EQ_MISSILE, confirm twice to buy the fourth missile. Missiles become 4, the EQ_MISSILE row is gone, the selection is EQ_MISSILE_REMOVAL, and a further stationConfirm sets a pending fit for EQ_MISSILE_REMOVAL without changing the profile.
    - Controller: system techLevelRaw 0 with a full tank. After ensureOutfittingSelection the selection is "". stationConfirm, stationUp and stationDown leave stationNotice "", stationPending null and the profile object identical, with no autosave call.
  </behavior>
  <action>
Write the tests first (RED), then implement (GREEN).

1. src/sim/player/outfitting.ts (pure, no DOM, no Three.js): next to FitCheck, add a frozen table typed `Readonly<Record<FitRefusal, boolean>>` that marks only insufficientCredits as listed. The Record type forces every future refusal to be classified at compile time. Add an exported `isListedForPurchase(check: FitCheck): boolean` that returns true when check.ok, and otherwise the table value for check.reason. Its doc comment cites Oolite `equipmentAllowed` (`PlayerEntity.m:8293-8302`: tech level, `canAddEquipment:inContext:@"purchase"`, and primary weapons with no facings). It states that Oolite's list never consults credits (they are checked only in `tryBuyingItem`, `PlayerEntity.m:9134` and `:9188`). It states that the predicate relies on affordability being the last gate of checkFit, checkLaserFit and canPurchase. It explains why invalidPrice and invalidCondition are hidden: a fail-closed row can never be bought, so it is never advertised. Update the module header so it describes the F3 visibility rule. Do not change checkFit, applyFit, checkLaserFit or applyLaserFit: the money path stays the boundary (PROJECT.md "Make the D-11 peaceful set the money-path boundary").

2. src/ui/station-model.ts, buildOutfittingModel:
   - Main loop: keep the existing early `continue`s (fuel at a full tank, removal rows at a zero count). After computing `check`, skip the row when `!isListedForPurchase(check)`.
   - Laser loop: compute the four facing checks as today. List the row only when `checks.some(isListedForPurchase)`. enabled/confirmable remain `checks.some(ok)`. When the row is listed but no facing is ok, the reason is fitReason of the first non-ok check that isListedForPurchase accepts (that is, "Not enough credits"), not merely the first refusal.
   - Add `emptyText: string` to OutfittingModel: OUTFITTING_EMPTY_TEXT when the main list has no rows, otherwise "". The facing model always returns "".
   - Export `OUTFITTING_EMPTY_TEXT = "No equipment available for purchase."` with a doc comment in the style of INTERFACES_EMPTY_TEXT: the source is `PlayerEntity.m:8511`, `DESC(@"equip-no-equipment-available-for-purchase")`, from the vendored `third_party/oolite/Config/descriptions.plist`, and the test pins it.
   - Rewrite buildOutfittingModel's doc comment: rows follow VISIBLE_EQUIPMENT_KEYS order but only listed rows appear (Oolite equipmentAllowed); the only disabled main-list row is an unaffordable one, which stays selectable so its detail and "Not enough credits" can be read.
   - Leave fitReason and buildFacingModel's facing rows as they are: Oolite lists every facing the ship has.

3. src/app/session/station-controller.ts, confirmFit: when the current model exists and has zero rows, clear stationPending and return without setting a notice. Re-render only if pending was set. This mirrors Oolite's `setNoSelectedRow`, where a confirm with no selectable row does nothing. Keep the existing "Not offered" path for a forged or stale key on a non-empty list (tests at station-controller.test.ts:661-696). moveOutfittingSelection, ensureOutfittingSelection and the post-purchase clamp by position need no change, because they already walk model.rows. Update the confirmFit doc comment: a purchase can now hide the selected row (the fourth missile, an owned item, a filled hold), and the clamp lands on the row now at that position, where one Y only opens the guard.

4. index.html: inside `[data-station-panel="outfitting"]`, after the `.station-outfitting` grid, add `<p class="station-outfitting-empty" data-field="outfitting-empty" hidden></p>`. Next to the `#docked .station-outfitting` rule, add a rule that centres `.station-outfitting-empty`, because Oolite centres the line (GUI_ALIGN_CENTER). src/ui/station.ts: requireElement the new paragraph (in the style of interfacesEmpty), and in renderOutfitting set its textContent to model.emptyText and `hidden = model.emptyText === ""`.

5. Tests.
   - tests/sim/player/outfitting.test.ts: add an isListedForPurchase describe block covering the behaviour bullets for the twelve-reason classification and the affordability-last ordering.
   - tests/ui/station-outfitting.test.ts: update the header comment. Replace the two "D-11 row set at Lave" key lists with the hidden-row lists from the behaviour bullets, and add the all-listed raw TL 10 order test. Turn the "short refusal reasons" describe into a "listed and hidden rows" describe that asserts absence for every hidden case and the unaffordable Cargo Bay row. Move "marks a disabled row dimmed …" and the detail-pane "disabled selected row" test from EQ_DOCK_COMP to EQ_CARGO_BAY, reading the expected description fragment and price from the generated catalogue. In "labels missiles …", drop the hidden "Missile (4/4)" assertion and pin "Missile (0/4)" at 0 missiles instead. Change the laser tech-level test to assert absence at Lave and at raw 3, and keep the rich raw-10 Military row confirmable. Add the credits-membership sweep and the empty-state test, including a plist pin read like tests/ui/station-interfaces.test.ts.
   - tests/app/session/station-controller.test.ts: add the two controller cases from the behaviour bullets inside the existing outfitting harness, setting `h.ctx.core.system = { ...h.ctx.core.system, techLevelRaw: 0 }` and then calling `h.controller.ensureOutfittingSelection()`.
   - Existing laser-purchase controller tests must pass unchanged. moveTo walks the listed rows.

6. CHANGELOG.md, under `## [Unreleased]` → `### Changed`, in the same commit: Outfitting (F3) now lists only the equipment you can buy or fit at this station, as in Oolite. Items above the system's tech level, already fitted, or with no room (full pylons, a full tank, no cargo space) are no longer shown. Items you cannot afford stay listed, dimmed, with "Not enough credits". When nothing can be offered the screen reads "No equipment available for purchase.".

7. Format with `docker compose run --rm lint npx prettier --write` on every edited file. Run the verify chain below. Commit: `feat(quick-261118-emk): list only the F3 equipment that can be fitted here, as Oolite`. The body names the listing table, the empty state, the inert confirm and every re-pinned test with its cause (rows above TL and otherwise unfittable rows are no longer emitted).
  </action>
  <verify>
    <automated>cd /home/opencode/git/wegolite && docker compose run --rm test npx vitest run tests/sim/player/outfitting.test.ts tests/ui/station-outfitting.test.ts tests/ui/station-interfaces.test.ts tests/app/session/station-controller.test.ts tests/guards/economy-purity.test.ts && docker compose run --rm typecheck && docker compose run --rm lint && test "$(rg -c 'isListedForPurchase' src/sim/player/outfitting.ts || echo 0)" -ge 2 && test "$(rg -c 'isListedForPurchase' src/ui/station-model.ts || echo 0)" -ge 2 && test "$(rg -c -F 'No equipment available for purchase.' src/ui/station-model.ts || echo 0)" -ge 1 && test "$(rg -c -F 'data-field="outfitting-empty"' index.html || echo 0)" -eq 1 && test "$(rg -c 'outfitting-empty' src/ui/station.ts || echo 0)" -ge 1 && test "$(rg -c -F 'No equipment available for purchase.' CHANGELOG.md || echo 0)" -ge 1  # gates: predicate defined+documented [HEAD=0 EXPECT>=2]; model uses it in both loops [HEAD=0 EXPECT>=2]; empty text literal present [HEAD=0 EXPECT>=1]; DOM line [HEAD=0 EXPECT==1]; renderer wires it [HEAD=0 EXPECT>=1]; CHANGELOG entry [HEAD=0 EXPECT>=1]</automated>
  </verify>
  <done>Every behaviour bullet is a passing test. At Lave the model emits exactly six rows. Credits never change membership. Raw TL 0 with a full tank yields Oolite's empty line. The controller clamps after a purchase hides a row and is inert on an empty list. The facing sub-list tests pass unchanged. Typecheck and lint are clean. Committed with the CHANGELOG line.</done>
</task>

<task type="auto">
  <name>Task 2: Re-pin the F3 browser journeys, record fidelity and the decision amendment, and run the remote gates</name>
  <files>tests/e2e/station.spec.ts, tests/e2e/autosave.spec.ts, FIDELITY.md, .planning/PROJECT.md</files>
  <action>
1. tests/e2e/station.spec.ts. The test "F3 is a two-pane keyboard outfitting screen with a guarded two-state confirm" starts at :479. At Lave the listed rows are now Cargo Bay, Missile (3/4), Remove Missile, Remove Laser, Pulse, Beam.
   - Keep the "no Fuel row" and Cargo Bay assertions ("Large Cargo Bay", "Not enough credits", class dimmed). Move the opacity 0.6 check to the Cargo Bay row.
   - Replace the Docking Computers assertions with toHaveCount(0) for EQ_DOCK_COMP, EQ_GAL_DRIVE, EQ_ADVANCED_COMPASS, EQ_ADVANCED_NAVIGATIONAL_ARRAY, EQ_PASSENGER_BERTH, EQ_WEAPON_MINING_LASER and EQ_WEAPON_MILITARY_LASER. Assert `[data-outfitting-rows] [data-equipment-key]` has count 6, and assert the outfitting-empty line is hidden.
   - The disabled-row Y check now uses the row selected at open (Cargo Bay). KeyY gives a footer status of "Not enough credits" with tone notice, credits stay 1000 and no save is written.
   - Reach Remove Missile with two ArrowDowns instead of 1 + 6.
   - After the removal, the cursor clamps by position onto Remove Laser. Replace the single ArrowUp with two ArrowUps to Cargo Bay: Missile (0/4) is affordable at 1700 dc, but the 4000 dc Cargo Bay is not. Keep the frame-wait and assert that the footer shows "Not enough credits", no [Y/N], tone notice, credits 1700, missiles 0 and committed+1. Rewrite the stale comments about the passenger berth to match.
   - In the later market-then-F3 journey (:880-915), replace the 7 ArrowDowns with 2. Replace the ArrowUp + TL-refusal footer check with two ArrowUps to Cargo Bay and "Not enough credits" (credits 1662 < 4000). Keep the credits and committed assertions.

2. tests/e2e/autosave.spec.ts, "an accepted buy and removal each write exactly one autosave" (:1385). After the first F3 ArrowDown, which writes nothing, one more ArrowDown reaches Remove Missile (previously six more). After the removal, the ArrowUp + TL-refusal check becomes two ArrowUps to Cargo Bay with "Not enough credits". Credits and committed stay unchanged. Update the stale comments.

3. FIDELITY.md, re-read first (see the 261118-cyn rule). Take the next free id N at that moment (expected E-108).
   - Mechanics table row, column-aligned with its neighbours. Mechanic: "Outfitting list: F3 lists an item only when the station offers it, the tech level allows it and it can be added now (pylons, cargo space, fuel, already fitted, something to remove); an item the commander cannot afford is still listed (equipmentAllowed, ECON-05)". Wegolite: `src/sim/player/outfitting.ts:<line of the isListedForPurchase declaration>`. Oolite (7437f22): `src/Core/Entities/PlayerEntity.m:8293-8302`. Fidelity: faithful. Excerpt: N.
   - Under `## Excerpts`, a heading `### N src/Core/Entities/PlayerEntity.m:8293-8302` and an objc block holding exactly lines 8293-8302, copied verbatim from `git -C /home/opencode/git/oolite show 7437f22:src/Core/Entities/PlayerEntity.m`. That is the `if (isOK) {` block through its closing brace, 10 lines.
   - Under `## Open items`, a bullet "**Outfitting list presentation (N).**" saying four things. List membership follows equipmentAllowed. Oolite draws an unaffordable item in its normal option colour (`PlayerEntity.m:8380-8384`) and refuses it only at purchase (`PlayerEntity.m:9134`), where Wegolite dims it and shows "Not enough credits" (owner decision 2026-11-18, quick task 261118-emk). Wegolite's integrity refusals (an invalid price or a malformed condition) hide the row, as a failing condition does in Oolite. Oolite's bargain tech days (`PlayerEntity.m:8274-8285`) are not modelled; see todo `.planning/todos/pending/2026-11-18-outfitting-bargain-tech-days.md`. Verify each cited line range against the pin before writing it.
   - The E-13 row (TL 9 gate) keeps its excerpt. Its behaviour is unchanged: the gate now hides the line instead of disabling it.

4. .planning/PROJECT.md: in the Key Decisions row that starts "Enforce the docking computer's TL 9 gate against the raw system tech level", append to its Outcome cell: "Amended by quick task 261118-emk (owner decision 2026-11-18): F3 hides the item below TL 9, as Oolite's equipmentAllowed does (PlayerEntity.m:8293-8302), instead of showing a disabled line; the raw-TL gate itself is unchanged." Do not add a new Key Decisions row. The FIDELITY row is faithful, so no divergence needs one.

5. Format with prettier in the lint container (the FIDELITY.md table re-aligns). Run the local chain: `docker compose run --rm test`, `docker compose run --rm lint`, `docker compose run --rm typecheck`. The FIDELITY contract runs inside test. Commit: `test(quick-261118-emk): re-pin the F3 journeys and record Oolite's outfitting list`. The body lists each moved ArrowDown count and footer string with its cause.

6. Remote gates, after committing, one at a time, quoting every `exit=` line in the SUMMARY:
   - `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test --project=chromium tests/e2e/station.spec.ts tests/e2e/autosave.spec.ts tests/e2e/station-tabs.spec.ts"`
   - then `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify` in the background, waiting for its exit line.

   This is browser-facing UI with no render, input, persistence or network-guard change, so verify-full is not due. Fix a failure in a new commit and rerun its gate. Rerun a known flake once.
  </action>
  <verify>
    <automated>cd /home/opencode/git/wegolite && docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts tests/ui/station-outfitting.test.ts && docker compose run --rm lint && test "$(rg -c -F 'PlayerEntity.m:8293-8302' FIDELITY.md || echo 0)" -ge 2 && test "$(rg -c '261118-emk' FIDELITY.md || echo 0)" -ge 1 && test "$(rg -c '261118-emk' .planning/PROJECT.md || echo 0)" -ge 1 && test "$(rg -c 'outfitting-empty' tests/e2e/station.spec.ts || echo 0)" -ge 1  # gates: FIDELITY cell + excerpt heading [HEAD=0 EXPECT>=2]; Open items bullet [HEAD=0 EXPECT>=1]; PROJECT.md amendment [HEAD=0 EXPECT>=1]; e2e asserts the hidden empty line [HEAD=0 EXPECT>=1]. Then the remote chain in the action: targeted e2e exit=0, verify exit=0.</automated>
  </verify>
  <done>The three F3 browser journeys pass on the remote against the six-row Lave list, with the inert-Y checks on the unaffordable Cargo Bay. The remote verify exits 0. FIDELITY.md has a faithful row, a pin-verbatim excerpt and the Open items bullet, and the fidelity contract passes. The PROJECT.md TL 9 row carries the amendment. Both commits are on main, unpushed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| keyboard/tab input → station controller | A row key in `stationSelection` is a plain string and could be stale or forged |
| row model → money path | The listing filter is presentation. checkFit/applyFit and checkLaserFit/applyLaserFit stay the purchase boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-emk-01 | Tampering | confirmFit with a forged or stale key naming a hidden item | medium | mitigate | confirmFit still requires the key to be a row of the current (filtered) model, so a hidden key gives "Not offered" before any apply. applyFit/applyLaserFit re-run checkFit/checkLaserFit. The existing forged-key controller tests (station-controller.test.ts:661-696) stay green |
| T-emk-02 | Elevation of Privilege | treating the filter as the boundary | medium | mitigate | No change to checkFit, applyFit, checkLaserFit or applyLaserFit. The money-path boundary row in PROJECT.md stays authoritative, and the isListedForPurchase doc comment states that it is presentation only |
| T-emk-03 | Denial of Service | empty F3 list | low | mitigate | confirmFit returns early on zero rows. moveOutfittingSelection already returns. The controller test pins no notice, no pending and no autosave |
| T-emk-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs in this plan, so the legitimacy gate has nothing to check |
</threat_model>

<verification>
- Local Docker: `docker compose run --rm test`, `docker compose run --rm lint`, `docker compose run --rm typecheck` all exit 0.
- Remote (committed HEAD, one at a time): the targeted F3 e2e run (station, autosave, station-tabs specs) exits 0, then `verify` exits 0.
- The SUMMARY states that the NPC acceptance run is not due, quotes every exit line, and lists every re-pinned test with its cause.
- The SUMMARY flags for the owner that Oolite does not dim unaffordable rows (normal option colour, no marker). Wegolite keeps the dim + "Not enough credits" per the locked decision; switching to the normal colour would be a one-line change to `dimmed`.
</verification>

<success_criteria>
- F3 at Lave shows six rows (Cargo Bay, Missile (3/4), Remove Missile, Remove Laser, Pulse, Beam). Nothing above TL, already fitted, or impossible to add is listed, and unaffordable items stay listed with "Not enough credits".
- Credits never change which rows are listed (sweep test). Every FitRefusal is classified at compile time.
- Raw TL 0 with a full tank shows "No equipment available for purchase.", and confirm and arrows are inert.
- Buying the fourth missile moves the cursor to Remove Missile with no accidental purchase.
- The laser facing sub-list behaves exactly as before.
- FIDELITY (faithful row + excerpt + Open items), CHANGELOG [Unreleased] Changed, and the PROJECT.md amendment are in place. Local test/lint/typecheck and remote targeted e2e + verify are green.
</success_criteria>

<output>
Create `.planning/quick/261118-emk-hide-outfitting-items-that-cannot-be-bou/261118-emk-SUMMARY.md` when done
</output>
