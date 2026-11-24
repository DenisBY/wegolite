---
phase: 19
reviewers: [claude, opencode-kimi, opencode-qwen]
reviewed_at: 2026-11-21T12:54:27Z
plans_reviewed: [19-01-PLAN.md, 19-02-PLAN.md, 19-03-PLAN.md, 19-04-PLAN.md, 19-05-PLAN.md, 19-06-PLAN.md, 19-07-PLAN.md, 19-08-PLAN.md, 19-09-PLAN.md, 19-10-PLAN.md, 19-11-PLAN.md, 19-12-PLAN.md, 19-13-PLAN.md, 19-14-PLAN.md, 19-15-PLAN.md]
models:
  claude: "fable (Agent subagent)"
  opencode-kimi: "opencode-go/kimi-k3.1-pro"
  opencode-qwen: "opencode-go/qwen4-max"
model_sources:
  claude: "agent-tool"
  opencode-kimi: "cli-flag"
  opencode-qwen: "cli-flag"
---

# Cross-AI Plan Review — Phase 19

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts
<!-- gsd:plan-revision-conflicts:end -->

## Claude Review (fable)

# Phase 19 plan review (Claude, Fable 5.2)

Scope: plans 19-01 to 19-15, checked against the repository at `7341829` and the Oolite checkout (`PlayerEntity.m`, `ShipEntity.m`, `OOEquipmentType.m`, `OOCommodityMarket.m` read locally). No test was run; every finding below is from reading source.

Overall verdict: the port of the rule is accurate and the plans are executable. I found no defect that blocks the phase goal. There are four findings I would fix before execution (all MEDIUM) and a set of small ones.

Top concerns:

| # | Severity | Plan | Finding |
|---|----------|------|---------|
| 1 | MEDIUM | 19-04 | The tracer case cannot pass as written: a 320-point laser hit with both shields at 0 always empties the 256-point bank, so the laser gate suppresses the roll the case expects. |
| 2 | MEDIUM | 19-11 / 19-12 | Damage goes live one wave before it can be seen (F5) or repaired (F3), and the purchase row is already hidden by 19-05. If execution stops between waves 5 and 6, a damaged item is lost with no way back. |
| 3 | MEDIUM | 19-15 | Triggers (b) and (c) exempt the whole of `outfitting.ts`, so a first consumer that adds one exported constant there passes the tripwire silently. |
| 4 | MEDIUM | 19-04 | The ledger test's oracle is written as `() => rngNext(createRngState(seed))`, which returns the same first draw every call; the implementation text says `() => rngNext(rng)`. |
| 5 | LOW | 19-01 | `is_external_store = no` on a `_MISSILE` key: Oolite's explicit value overrides the suffix, the plan lets the suffix win. |
| 6 | LOW | 19-02 / 19-14 | `MAX_INTERNAL_DAMAGE_ROLLS = 256` is a divergence from Oolite's unbounded loop with no FIDELITY mention and no constants-ledger row. |
| 7 | LOW | 19-11 | A must-have says the Node replay builds the facts through `internalDamageFactsFor`, but `tests/helpers/tick-script.ts` is not in the plan's files. |

---

## 19-01

**Summary.** Compiles `damage_probability` into the equipment catalogue behind the strict schema, the golden and the drift gate.

**Strengths.**
- The rule matches the source. `OOEquipmentType.m:198-200` sets `_isMissileOrMine` from the `_MISSILE` / `_MINE` suffix, `:210` defaults `_damageProbability = 1.0`, `:247` reads `damage_probability` with default `(_isMissileOrMine ? 0.0 : 1.0)`, and `:504-520` returns 0 and `NO` for a missile or mine.
- The seven authored zeros are real: `third_party/oolite/Config/equipment.plist` lines 23, 32, 239, 252, 286, 383, 486, belonging to `EQ_MISSILE` (15), `EQ_CARGO_BAY` (28), `EQ_TRUMBLE` (235), `EQ_PASSENGER_BERTH` (244), `EQ_HARDENED_MISSILE` (278), `EQ_QC_MINE` (375), `EQ_OOLITE_TUTORIAL_CONTROLS` (479). The vendored file and the checkout carry the same count.
- 41 records is correct (`src/content/generated/equipment.json`), and the only hand-built `Equipment` literal outside the converter is `tests/sim/player-profile.test.ts`, as the plan says.
- `EQ_SCANNER_SHOW_MISSILE_TARGET` (plist 302) does not end in `_MISSILE`, so the suffix rule does not catch it by accident.

**Concerns.**
- LOW: the plan's rule is "suffix OR `is_external_store` true gives 0". Oolite's is `_isMissileOrMine = [extra oo_boolForKey:@"is_external_store" defaultValue:_isMissileOrMine]` (`OOEquipmentType.m:223`): an explicit `is_external_store = no` on a `_MISSILE` key makes it not a missile, and its probability is then the authored value or 1.0. The plan's synthetic case "missile suffix wins" pins the wrong side of that edge. No vendored record sets the key, so it is unobservable today.
- LOW: `oo_boolForKey` accepts more spellings than the plan's list (for example `on`, any non-zero number). The plan fails closed on those, which is safe, but the SCHEMA error should say so.

**Suggestions.** Compute `isMissileOrMine = authored is_external_store ?? suffix`, and add the case `EQ_FOO_MISSILE` with `is_external_store = no` and no `damage_probability` compiling to 1.

**Risk.** LOW.

## 19-02

**Summary.** The pure roll module, the `damage: 5` purpose, the two event kinds, the stream and factor decisions, the hull-wear todo and tripwire.

**Strengths.**
- The transcription is exact against `PlayerEntity.m:6097-6185`. I recomputed every hand case:
  - Tracer draws `[0, 37.5/38, 0.5]`: gate passes, die 37, not cargo, reversed `38 - 38 = 0 < 1`, target 0.5, accumulator 1 > 0.5. Three draws, one event.
  - `consideredCount`: `(20+21)*95/100 = 38`, `(35+21)*95/100 = 53`, `(15+21)*95/100 = 34`, `(0+21)*95/100 = 19`. All match C's unsigned truncation at `:6101`.
  - Die 34 with four items gives reversed 3 (damages), die 33 gives 4 (nothing). Correct against `:6116` and `:6130`.
  - Pick with odds 2: `u = 0.5` gives target 1.0, and `1 > 1` is false, so the second item is taken. Matches the strict `accumulator > target` at `:6137`.
- The second loop at `:6134-6141` accumulates the probability of every installed item, including non-damageable ones; the plan does the same ("sums `damageProbability` over all items in order"). This is the detail most ports get wrong.
- `PLAYER_INTERNAL_DAMAGE_FACTOR 31` is at `PlayerEntity.h:331`; factor 95 at `PlayerEntity.m:1739` and `:1063`. Both confirmed.
- Adding purpose 5 cannot move an existing stream: `forkSeed` looks the code up by key (`src/sim/rng.ts:134-142`), and `PLAYER_ID = 100` with purpose 5 is a triple no entity uses.
- One ledger call per step (`src/sim/combat/step.ts:786` is the only production call of `applyLedger`), so a per-tick seed cannot be replayed twice within a tick.

**Concerns.**
- LOW: `MAX_INTERNAL_DAMAGE_ROLLS = 256` caps a loop Oolite does not cap. It is unobservable against Oolite (more than 8,192 points past the shield kills the Oolite player, whose bank is 256), but the project records such cases (`FIDELITY.md` row E-152 is the precedent) and 19-14 gives it neither a note in E-154/E-155 nor a constants-ledger row.
- LOW: `internalDamageSeed` calls `forkSeed`, which throws a `RangeError` on a non-finite `worldSeed` (`src/sim/rng.ts:138`). The "roll is total" claim covers `rollInternalDamage` only. `createWorld` validates the seed (`src/sim/world/world.ts:219-227`), so this is unreachable, but the property test should not claim more than it tests.
- LOW: the pick order is called "exact" because Oolite's `_equipment` is an array. That holds within a session; after loading an Oolite save the equipment comes back from a dictionary. Since every compiled probability is 0 or 1, the order affects only determinism, never the distribution. The Key Decisions row should say that, not "exact".

**Suggestions.** Add the cap to the decision row and to 19-14's ledger. Keep everything else.

**Risk.** LOW.

## 19-03

**Summary.** `PlayerProfile.damagedEquipment`, the damage and cargo-loss operations, the single damageable set, the not-installed proof.

**Strengths.**
- "Not installed falls out of removing the key" is true. The two sim consumers read the set only: `src/sim/flight/step.ts:174` (compass) and `:199` (dock computer).
- Capacity is safe: `capacityPodsFor` reads `EQ_CARGO_BAY` from `profile.equipment` (`src/sim/economy/cargo.ts:117-124`), and the bay compiles to probability 0, so damage can never shrink the hold under its cargo.
- `applyEquipmentDamaged` refusing anything outside the set closes the case where the roll picks a key the repair door cannot mend.
- The D-06 audit is right: `EQ_GAL_DRIVE` and `EQ_ADVANCED_NAVIGATIONAL_ARRAY` appear only at `src/sim/player/outfitting.ts:78,80,96,98`, and every `autopilot` token in `src` is in a comment.

**Concerns.**
- LOW: the set is a literal while the roll reads the compiled probability. The guard that ties them (19-05) lands a wave later. Nothing rolls before 19-11, so the gap is harmless, but it is a gap.
- LOW: the kg example is right (`gold 2700 - 1000 = 1700`), but the plan does not state that `amount` for a kg pod can be the dregs amount (201). The 19-04 property covers it.

**Suggestions.** None beyond the above.

**Risk.** LOW.

## 19-04

**Summary.** The roll on the ledger's player branch, `CombatOptions.internalDamage`, `holdPods`, the cadence proof.

**Strengths.**
- The laser gate is right. Oolite rolls only in the `else` of `energy <= 0.0` (`PlayerEntity.m:5683-5697`); `routeDamage` floors at 0 (`src/sim/combat/shields.ts:167`), so `combat.energy > 0` is the same test. The scrape loop is unconditional (`:5746-5752`).
- `DamageResult.applied` is the remainder past the shield (`src/sim/combat/shields.ts:97-103`), which is Oolite's `amount` at the loop.
- `holdPods` matches `loadCargoPodsForType:fromManifest:` (`PlayerEntity.m:299-357`). I recomputed: gold 2700 gives 1000, 1000, 201; 500 kg gives one pod of 1; 1499 gives one pod of 1000; 1500 gives 1000 and 1; 1,200,000 g gives one pod of 700,001.
- The order claim holds: `goods` sorts by `kOOCommoditySortOrder` (`OOCommodityMarket.m:66-73, 341-350`).
- Re-deriving the list after a loss gives Oolite's remaining pods in both cases (a full pod removed from 2700 leaves 1700, giving 1000 and 201; the dregs pod removed leaves 2499, giving 1000 and 1000).
- Events are dispatched after every fixed step (`src/app/session/sim-driver.ts:205`), and options are rebuilt per step (`:159`), so the next tick's facts already reflect the commit at any frame rate.

**Concerns.**
- MEDIUM: Task 1's first behaviour cannot pass. It specifies "a laser record of 320 on the player with both shields at 0" and expects `shipHit` followed by the roll's events. `COBRA_MAX_ENERGY = 256` (`src/sim/combat/constants.ts:159`) and a fresh state starts there (`src/sim/combat/state.ts:66`), so 320 points always bring the bank to 0 and the laser gate the same task implements suppresses the roll. The next bullet ("the same record when it brings the energy to 0: `shipHit` only") describes the only outcome that record can have. An executor must either fake an unreachable `combat.energy` above 320 or, worse, loosen the gate.
- MEDIUM: the same bullet writes the oracle's stream as `() => rngNext(createRngState(internalDamageSeed(...)))`. That builds a new state on every call and returns the first draw forever. The action text has it right (`() => rngNext(rng)` with one state per call). A test copied from the behaviour text would disagree with a correct implementation.
- LOW: before Phase 20 the player survives at energy 0, so every scrape at 0 rolls while lasers do not. In Oolite that player is dead. It is the existing Phase 20 gap, but the ledger comment should name it so Phase 20 keeps both gates.

**Suggestions.** Use an amount the bank survives, for example 96 (three iterations, each gate certain) at full energy, and keep 320 only for the "empties the bank" case. Write the oracle with one `RngState` created outside the closure.

**Risk.** MEDIUM until the tracer case is corrected; LOW after.

## 19-05

**Summary.** The repair door: half price, one tech level lower, at once; a damaged item cannot be bought again.

**Strengths.**
- `Math.ceil(price / 2)` is the right reading of `tryBuyingItem`. `price /= 2.0` (`PlayerEntity.m:9116-9117`) keeps a half, `price > credits` refuses at exactly one unit short, and `credits -= price` truncates the balance. All four compiled prices are even (15000, 50000, 6500, 22500), so the rounding is unobservable and the pins 7500, 25000, 3250, 11250 are correct.
- The tech rule matches `:8270-8272` (`minTechLevel != 0 && hasEquipmentItem:damagedIdentifier` then `minTechLevel--`).
- One array for the damageable and the repairable set removes a whole class of drift, and the guard pins it to the compiled catalogue.
- `LISTED_REFUSALS` is a `Record<FitRefusal, boolean>` (`src/sim/player/outfitting.ts:157`) and `fitReason` is the only other consumer of the union (`src/ui/station-model.ts:826`), so the type checker forces both new refusals to be classified.
- The forged-key table is thorough, and `EQ_WEAPON_PULSE_LASER@repair` fails both parsers.

**Concerns.**
- LOW: `checkRepair` takes the catalogue record from its caller, so the price is only as trustworthy as that lookup. This is the same trust model as `checkFit`, so it is not new, but the test in 19-12 should assert that the controller looks the record up from `ctx.core.equipmentCatalogue` by the parsed key and never from row state.
- LOW: the note about `equipmentPriceFactor` is correct for `tryBuyingItem` (`:9115-9132`: halve, script, then factor). The listing code multiplies by the factor first and halves after (`:8395-8405`). The result is the same; the doc comment should not present one order as "Oolite's order".

**Suggestions.** None blocking.

**Risk.** LOW.

## 19-06

**Summary.** Retires the migration chain: only the current version is read, every older save is `corrupt`.

**Strengths.**
- `corrupt` is the right classification. `canOverwrite` accepts only `absent | valid` and `canClear` adds `corrupt` (`src/app/session/save-controller.ts:97-109`), so `unreadable` would lock saving for the session and New game could not clear it.
- The change to `parseSave` is small: the existing final `else` at `src/persistence/save.ts:593-597` already returns `corrupt` for a numeric version with no schema.
- The schemas and the three migration functions are exported (`save.ts:188, 275, 316, 475, 492, 510`), so leaving them in place for Task 1 does not trip `noUnusedLocals`.
- `tests/persistence/save-golden.test.ts` tests only the chain (its three describe blocks are all migration steps), so deleting it loses no live rule.
- Reading each golden's own `version` keeps the classification case valid through the v5 bump.

**Concerns.**
- LOW: after v5 there is no captured v5 writer blob. `v2-phase10-inflight.json` was captured from the real writer before the v3 bump; nothing equivalent is planned, so the next bump (the cost-basis todo) will have no real v5 save to reject.
- LOW: `.planning/PROJECT.md:57` still lists "ordered migration" as validated, and the Key Decisions rows for v1 and v2 (`:151, :163, :175`) get no superseded note; 19-08 annotates only the v3 and v4 rows.
- LOW: the read-mode alias tolerance (`LEGACY_BERTH_ALIAS`, `LEGACY_MISSILE_ALIAS`, `save.ts:426-429, 652-659`) existed for v1 saves. Once v1 is never read, no writer can produce an alias, so the tolerance is reachable only by a hand-edited current-version save. Keeping it is declared out of scope, which is fine, but it is now dead leniency in a validator.

**Suggestions.** Capture one v5 golden in 19-08 or 19-09. Record the alias tolerance as a todo.

**Risk.** LOW to MEDIUM (wide test rebase; the SUMMARY's list of removed cases is the control).

## 19-07

**Summary.** Every save fixture follows the current version; SAVE-09 and criterion 4 are reworded for the corrupt path.

**Strengths.**
- Rebasing the refusal cases matters: after 19-06 a v1 blob with duplicate equipment is corrupt for its version, so the case would prove nothing.
- `SAVE_VERSION + 1` for future fixtures removes a class of silent breakage at each bump.
- No file overlaps the other wave-2 plans, and none of the three app tests holds a typed `PlayerProfile` literal that 19-03's new required field would break.

**Concerns.**
- LOW: "with unchanged inputs their bytes are unchanged" has no check. A fixture that drifts by one default would still boot.

**Suggestions.** Before the rebase, record the encoded length or a hash of `dockedSaveAt("Lave")`, and assert it after.

**Risk.** LOW.

## 19-08

**Summary.** Save schema v5 with `damagedEquipment`, the allow-lists narrowed to what F3 installs, the worst case, the decision row.

**Strengths.**
- `equipmentAllowLists` gives exactly the set the tests expect. `VISIBLE_EQUIPMENT_KEYS` (`outfitting.ts:74-85`) minus `FORBIDDEN_EQUIPMENT` (`save.ts:435-442`: `EQ_FUEL`, both removals, the lasers) leaves the bay, the four damageable keys and the two aliases.
- Narrowing `equipment` closes a real hole. Today `main.ts:192` allows every catalogue key, so a save with `EQ_ECM` (compiled probability 1) would feed the roll a key the commit refuses forever.
- The combined 64 rule is in the shared reader/writer stage, so the writer gate refuses what the reader rejects.
- The worst-case test follows the existing pattern (schema-valid only, `tests/persistence/save-v4.test.ts:610-622`), so 64 plus 16 keys is a legitimate upper bound even though the combined rule would reject it.

**Concerns.**
- LOW: the worst-case blob is deliberately invalid under the new combined rule. The test name should say it is a schema bound, or a reader will take it for a save that parses.
- LOW: narrowing the allow-list makes the writer gate refuse any profile holding a key outside the F3 set. Only the `?test=1` grant can create one, and it is not narrowed until 19-12 (three waves later). Such a session is tainted and never saves, so nothing breaks, but the two changes belong together logically.

**Suggestions.** Move the grant's `SINGLE_INSTANCE_KEYS` restriction to this plan or to 19-05 (which exports the set).

**Risk.** MEDIUM (one-way format change), well controlled.

## 19-09

**Summary.** The damaged-list contract at every boundary, the probe key, durability in the browser.

**Strengths.**
- Proving durability with an untainted fixture through `encodeSave` is the only sound route, since hook mutations block autosave.
- Every forged list is run through both `parseSave` and `isEncodedSaveValid`.
- The version table is right for `SAVE_VERSION = 5`: 4.5 is below it and corrupt, 6 is future.

**Concerns.**
- LOW: the browser test proves the list on the probe, not on screen. Criterion 2's "shown as damaged (F5)" is proven only at model level in 19-12.

**Suggestions.** Once 19-12 has landed, add one DOM assertion on F5 for the same fixture (`Docking Computers (damaged)` first in the list). It costs a few lines in an existing spec.

**Risk.** LOW.

## 19-10

**Summary.** The `damageFlow` subscriber commits each damage event once and prints Oolite's message only when the commit took effect.

**Strengths.**
- Routing both kinds to `damageFlow` alone, and gating the message on its own `commitProfile` result, is better than the research's proposal. `commitProfile` returns `false` on identity (`src/app/session/station-controller.ts:746-752`), so a refused loss prints nothing; a separate HUD subscriber could not know that.
- The message order matches Oolite: `clearPreviousMessage` then `addMessage` for 4.5 s in both branches (`PlayerEntity.m:6110-6111, 6156, 6170`).
- The list of `createEventRouter` callers is complete: `game-session.ts` and the five test files named.

**Concerns.**
- LOW: each commit runs `renderStation()` and the profile callback while in flight. One hard collision can emit up to about 24 events in a tick (every pod and every item), each re-rendering a hidden screen.
- LOW: a source assertion that the body "contains no `autosave` call" is a text check; `commitProfile` itself could gain a write later and the assertion would stay green.

**Suggestions.** Assert the save-attempt counter is unchanged after a damage event in the tick-parity harness, in addition to the text check.

**Risk.** LOW.

## 19-11

**Summary.** The per-step facts from the live profile, with an identity cache; damage becomes live.

**Strengths.**
- `capacityPodsFor` is the right input: `maxAvailableCargoSpace` is `max_cargo - equipment_weight` (`ShipEntity.m:7198-7201`), the capacity, not the free space.
- Absent catalogue means no facts and no roll, so nothing is guessed.
- The existing twins cannot move: the tick-parity harness sets `ctx.core.commodities` (`tests/app/session/tick-parity.test.ts:150`) but no equipment catalogue, and a new-game browser session has no item and no pod.

**Concerns.**
- MEDIUM: this is the switch that turns damage on, and it lands one wave before 19-12. From here until 19-12 a damaged item is invisible on F5, has no repair row, and its purchase row is already hidden by 19-05's `damaged` refusal. The plan also ships the CHANGELOG entry here. If execution stops between the two waves, or each plan is pushed and deployed on its own, the build has a mechanic that takes equipment away for good.
- LOW: the must-have "the live session and the Node replay build the facts through the same pure `internalDamageFactsFor`" has no task. `tests/helpers/tick-script.ts:306-318` builds its own options and is not in `files_modified`. The replay hashes the world only, so nothing diverges, but the claim is untrue as planned.

**Suggestions.** Swap the order: make 19-12 depend on 19-05, 19-09 and 19-10 only (its tests build damaged profiles directly and do not need live facts), and make 19-11 depend on 19-12, so damage goes live only when it is visible and repairable. Drop the replay claim or add the helper to the plan.

**Risk.** MEDIUM for the ordering; LOW for the code.

## 19-12

**Summary.** F3 "Repair: X" rows through the station controller, F5 "(damaged)" first, the test-hook guard, the decision row.

**Strengths.**
- The row text is Oolite's. `desc = " %@ "` at `PlayerEntity.m:8377`, then `DESC(@"equip-repair-@")` at `:8405`, gives ` Repair: Docking Computers `. Treating it as faithful is correct.
- The tech fixtures are right: Tibedied raw 8, Leleer raw 7, Riinus raw 9, Lave raw 4 (`src/content/generated/systems/g0.json`).
- A repair row never reaches `checkFit` / `applyFit`, and the selection is parsed through the allow-list first.
- The F5 claim is accurate: Oolite builds both groups in `reverseEquipmentEnumerator` order (`:7156`) and puts the damaged group first (`:7238-7240`).

**Concerns.**
- LOW: "existing grant cases unchanged" refers to cases that do not exist; `tests/app/session/probe-publisher.test.ts` has no `grantEquipment` case today. The four browser uses all grant `EQ_DOCK_COMP` (`tests/e2e/station.spec.ts:310, 1067`, `tests/e2e/docking.spec.ts:570, 629`), so the restriction breaks nothing.
- LOW: no browser assertion covers the F3 row or the F5 line (see 19-09).
- LOW: the decision row says "(damaged)" is "the one UI divergence", but the phase also records the repair-row colour (E-166) and the missing repair time (E-163) as divergences on the same screen. The wording should be "the one wording divergence".

**Suggestions.** Take the dependency change proposed under 19-11.

**Risk.** LOW to MEDIUM (money path through the controller; the re-check in `confirmRepair` is the control).

## 19-13

**Summary.** The CBT-08 fight in the Node twin and the browser, with measured literals.

**Strengths.**
- The scenario is feasible. The existing fight puts about 30 six-point hits through the bank; each passes the gate with probability 6/32 and then reaches an item with probability 4/38, so roughly four delays in ten produce damage and a 241-delay scan will find one.
- The selection rule is deterministic and the full table is recorded, so the literals are measured, not fitted.
- The stop condition (no row qualifies) blocks the plan and forbids widening the range.

**Concerns.**
- LOW: the literals depend on the stream seed formula. Any later change to `internalDamageSeed` re-rolls them; the standing re-pin approval should name this twin.
- LOW: the twin asserts the damaged key is absent from `equipment`, but not that the item stopped working. One Shift+C request after the fight returning `notInstalled` would join criterion 2 to criterion 5 at no cost when the dock computer is the damaged item.

**Suggestions.** As above.

**Risk.** LOW.

## 19-14

**Summary.** FIDELITY rows E-154 to E-166, the reviewers' fields, the palette decision row, `verify-full`.

**Strengths.**
- Every Oolite range is correct and within the 20-line limit: `5683-5698`, `5746-5752`, `6097-6116`, `6123-6142`, `6154-6171`, `6179-6184`, `9115-9119`, `8270-8272`, `8403-8410`, `8411`, `8568-8572`, `7200-7212`. The three source files have no diff between the pin and HEAD.
- Splitting the colour (E-166) from the repair time (E-163) keeps each divergence on one decision.
- The quoted rows exist: "Apply purchases immediately with no install delay" (`.planning/PROJECT.md:170`) and the divergence rule (`:338`).

**Concerns.**
- LOW: no row or note records the 256-iteration cap (see 19-02), and the constants ledger omits `MAX_INTERNAL_DAMAGE_ROLLS`.
- LOW: E-158 is `faithful` although the damaged key is stored in a second list instead of an `_DAMAGED` entry. I agree it is a representation and not a behaviour, but the note must sit in the Mechanic cell as planned, or a reader will not see it.
- LOW: the executor must read free-form reviews and decide whether an objection was "resolved". That judgement should not rest with the executor alone.

**Suggestions.** Have the orchestrator write a short verdict table (reviewer, D1 to D5, agree or disagree) at the top of `19-REVIEWS.md`, and let the plans copy from it.

**Risk.** LOW.

## 19-15

**Summary.** A todo and a tripwire for the D-06 clauses that have no in-use state today.

**Strengths.**
- The three clauses are real and correctly cited: the autopilot disengage is in `removeEquipmentItem` (`ShipEntity.m:3327-3330`), the jump abort at `PlayerEntity.m:3432-3440`.
- The tree is green for all three triggers today.

**Concerns.**
- MEDIUM: triggers (b) and (c) exempt all of `src/sim/player/outfitting.ts`. A first galactic-jump consumer that adds `export const GAL_DRIVE_KEY = "EQ_GAL_DRIVE"` there and imports it elsewhere passes silently. The guard then protects against the spelling, not the consumer.
- LOW: trigger (a) fires on any non-comment `autopilot` text, including a HUD string.

**Suggestions.** Pin the number of tokens in `outfitting.ts` instead of exempting the file: today each key appears twice (`:78, :96` and `:80, :98`), three times after 19-03. Any further occurrence fails and names the todo.

**Risk.** LOW.

---

## Cross-plan assessment

**Goal coverage.** All five success criteria are covered: the roll and its stream (19-02, 19-04, 19-11), the atomic commit (19-10), not-installed (19-03), F5/F3 (19-12), repair (19-05, 19-12), save v5 (19-06 to 19-09), the fight (19-13).

**Ordering.** File ownership within each wave is clean; I found no two plans in one wave editing the same file. The one ordering problem is functional, not mechanical: 19-11 before 19-12 (see 19-11).

**Fidelity of the port.** I found no wrong transcription of the roll, the pod list, the price or the tech rule. The three edges that differ from Oolite are all unreachable with current data: the `is_external_store = no` override, the 256-iteration cap, and the float32 sums.

**Security.**
- Money path: closed. Literal allow-list, strict two-part parse, re-check inside `applyRepair`, identity on refusal, price validated before and after halving.
- Save validator: tighter than today. The equipment allow-list shrinks from 41 keys to 7, the damaged list has its own allow-list, a bound of 16, a disjointness rule and a combined cap, all in the stage the writer gate shares.
- Remaining leniency: the two read-mode aliases (see 19-06).

**Missing tests.**
- No browser assertion that F5 or F3 shows the damage.
- No check that the rebased fixtures kept their bytes (19-07).
- No assertion that a damage event leaves the save-attempt counter unchanged (19-10).

**Scope.** No scope creep. The save work is larger than the feature needs because the chain is retired first, but that is an owner decision and it keeps the bump small.

**Performance.** Negligible. One hash and a few draws per hit that reaches the bank; the facts are cached by profile identity.

**Phase risk.** MEDIUM, driven by the one-way save change and the width of the test rebase, not by the simulation code.

---

## Divergence Verdicts

**D1. Stateless per-tick seeded stream instead of Oolite's global `ranrot` sequence — AGREE.**
Oolite's sequence depends on everything else that drew from the global generator and cannot be reproduced; criterion 1 requires the same fight to damage the same item at any frame rate. The distribution of each draw is unchanged (`& 31`, `% n`, `randf`). Keeping the stream out of the world state leaves every existing twin and golden untouched, and there is exactly one ledger call per step, so a tick's seed is never used twice. Condition: the decision row should also record the 256-iteration cap.

**D2. `ship_trade_in_factor` constant 95, not persisted, cosmetic branch not ported — AGREE.**
95 is Oolite's new-ship value (`PlayerEntity.m:1739`, load default `:1063`), so the odds are exact for a new ship. The cost is stated honestly: an Oolite ship wears down to 75, where `n_considered` falls from 38 to 30 and equipment damage becomes about a quarter more likely. Porting the decrement without `EQ_RENOVATION` and the fuel-price effect would add a saved field that only gets worse with no way to restore it. The todo and tripwire tie the three together.

**D3. F5 lists damaged items as `<name> (damaged)` in damage order — AGREE.**
"(N/A)" on a status screen reads as "not available", and the owner's objection is concrete. The order difference is consistent with the installed list, which already follows purchase order and not Oolite's reverse catalogue order. Damaged-first is kept, which is the part of Oolite's behaviour that carries information.

**D4. F3 repair row in the station palette, not orange — AGREE.**
It follows a standing owner decision for every row on the screen; colouring one row would be the inconsistency. The "Repair:" prefix and the detail line carry the meaning without colour. Giving it its own FIDELITY row (E-166) instead of an open item is the right record. Note: this is the weakest of the five on clarity grounds, since orange is how Oolite draws attention to a repair; it should be the first row revisited when the palette todo is taken up.

**D5. Repair applied at once, no repair time — AGREE.**
No F3 purchase advances the clock (`.planning/PROJECT.md:170`), and Oolite's repair time is the same mechanism with a different constant (`PlayerEntity.m:8407-8410`). Charging time for repairs alone would be inconsistent; the divergence belongs to the existing install-delay decision and should be lifted together with it.

---

## OpenCode Review (kimi-k3.1-pro)

## 19-01

### Summary
Compiles Oolite’s equipment `damage_probability` into a strict, generated catalogue field, with conversion tests, a golden fixture and the content drift gate.

### Strengths
- The conversion rule matches Oolite: missile/mine suffixes and external stores produce zero, otherwise the authored value is used, with default 1.0. See `/home/opencode/git/oolite/src/Core/OOEquipmentType.m:198-201`, `:207-210`, `:223`, `:247`, and `:504-521`.
- Keeping validation in both the build-time schema and `parseEquipment` gives the same fail-closed boundary to generated content and runtime loading.
- The synthetic cases are valuable because the vendored plist does not exercise `is_external_store`; they cover suffix precedence, accepted booleans, fractional probabilities and malformed values instead of merely checking the current 41 outputs.

### Concerns
- **LOW — part of the golden can certify the converter against itself.** `.planning/phases/19-equipment-damage-and-repair/19-01-PLAN.md:199` says to write fixture values “the converter produces”. Although the seven authored zeros and suffix rules are to be derived by hand first, the remaining default-1 records could simply be copied from the implementation being tested.
- **LOW — no material semantic defect found.** The strict-schema and drift-gate arrangement is otherwise proportionate to the change.

### Suggestions
- Derive the complete version-2 golden independently from the plist and Oolite’s defaults before comparing it with generated output, or at minimum independently pin a non-vacuous sample covering default, authored, suffix and external-store cases.
- Keep the generated-file count checks as secondary guards; the meaningful oracle should remain the source data and Oolite rule, not converter output.

### Risk Assessment
**LOW.** The conversion semantics are sound; the principal risk is an insufficiently independent golden rather than a design error.

---

## 19-02

### Summary
Implements the internal-damage gate loop and `takeInternalDamage` as a pure deterministic module, including its two event kinds, cargo/equipment branches, stateless tick-keyed stream and detailed boundary/property tests.

### Strengths
- The gate condition, 32-point decrement, die reversal, branch order and strict weighted-pick comparison follow `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:5686-5697` and `:6097-6185`.
- The explicit `n_considered == 0` case correctly preserves Oolite’s unusual behavior: no die draw, `damage_to = 0`, possible destruction of pod zero, and unsigned-wrap behavior when the equipment branch is considered (`PlayerEntity.m:6102`).
- Pulling the RNG through an injected `draw` function enables hand-derived draw-order tests rather than tests fitted to observed output.
- The new purpose code does not enter `ENTITY_RNG_PURPOSES`, keeping it out of per-entity stored-stream handling. The existing purpose-code structure is at `src/sim/rng.ts:74-88`.
- Working copies prevent two player hit records in one tick from repeatedly damaging the same item or destroying the same pod.

### Concerns
- **HIGH — the 256-iteration cap is an unrecorded Oolite divergence.** Oolite’s loops have no iteration cap (`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:5691-5697` and `:5746-5752`), while `.planning/phases/19-equipment-damage-and-repair/19-02-PLAN.md:33`, `:165`, and `:192` introduce `MAX_INTERNAL_DAMAGE_ROLLS = 256`. Above 8,192 damage, truncation can change which events occur and how many random draws precede a later record in the same tick. The two planned Key Decisions rows at `19-02-PLAN.md:261` cover the stream and factor 95, but not this behavioral cap.
- **MEDIUM — “exact” arithmetic claims need qualification.** Oolite uses modulo/low bits, a 16-bit `randf()` (`/home/opencode/git/oolite/src/Core/legacy_random.c:142-145`) and GLfloat accumulation in the weighted pick (`PlayerEntity.m:6122`, `:6132-6138`). Wegolite instead uses `floor(u*n)`, a float64 stream value and float64 sums. Branch and draw-order fidelity is well specified, but exact sequence or numeric parity with Oolite is not established. With the current probabilities of zero and one, weighted-sum rounding is unobservable.

### Suggestions
- Prefer preserving the uncapped loop if a justified finite input bound already guarantees a safe maximum. Otherwise record the cap as a separate reviewed divergence in PROJECT.md and FIDELITY.md, and add cases above 8,192 damage, including a second same-tick record, proving or explicitly describing the changed behavior.
- Add the cap to the constants ledger alongside the new damage purpose code.
- Change “exact odds/exact arithmetic” wording to distinguish faithful branch structure and probabilities from the intentionally different random representation. Note why current weighted-pick rounding is unobservable.

### Risk Assessment
**HIGH.** The core port is carefully specified, but the unrecorded truncation can affect simulation behavior and random-stream position and would also make the later fidelity record incomplete.

---

## 19-03

### Summary
Adds `PlayerProfile.damagedEquipment`, pure equipment-damage and cargo-loss operations, the combined 64-key invariant, and proofs that damaged docking computers and compasses are no longer treated as installed.

### Strengths
- Moving a damaged key out of `equipment` is the right minimal mechanism: existing consumers already treat membership in `options.equipment` as installation, so no third installed-state abstraction is introduced.
- Identity-on-refusal operations match the established immutable profile style in `src/sim/player/profile.ts:175-197` and `:208-222`.
- Cargo mutation is centralized through `setCargo`, preserving the existing zero-entry and null-prototype-map rules in `src/sim/economy/cargo.ts:178-189`.
- The property test covers the important cross-operation invariant: no duplicates, disjoint lists, damageable-only damaged keys, and a combined maximum of 64.

### Concerns
- **MEDIUM — Task 1 permits unbounded edits outside `files_modified`.** `.planning/phases/19-equipment-damage-and-repair/19-03-PLAN.md:169` instructs the executor to run the suite and add `damagedEquipment: []` to any additional failing literal. The research already identifies a broad required-field fallout at `19-RESEARCH.md:326-330`. An open-ended “fix whatever fails” task can touch suites owned by other wave plans and hides the real review surface.
- **LOW — the plan-local verification has an undeclared dependency.** `19-03-PLAN.md:172` and `:182` invoke `tests/guards/damaged-equipment-in-use.test.ts`, created by 19-15, but frontmatter declares only `depends_on: ["19-01"]`. The wave barrier makes this work when executing the whole phase, but not when running 19-03 independently or retrying it in isolation.

### Suggestions
- Enumerate the expected profile-literal edits in 19-03 or assign their shared builders to the appropriate owning plan. If suite execution discovers additional files, require an explicit scope update rather than silently widening the task.
- Add 19-15 to `depends_on`, or remove its guard from this plan’s standalone targeted checks and leave that guard to the wave/phase gate.
- Keep the compiled-catalogue equivalence check in 19-05 as the authority connecting the literal damageable set to `damageProbability`.

### Risk Assessment
**MEDIUM.** The profile semantics are strong, but the open-ended test migration and undeclared guard prerequisite make execution scope less controlled than the plan claims.

---

## 19-04

### Summary
Connects the internal-damage roll to the ledger for laser and scrape records, adds Oolite’s in-flight pod-list derivation, and tests frame-rate independence.

### Strengths
- The post-shield amount is the correct loop input. Laser records roll only when energy remains above zero, whereas scrape records roll unconditionally, matching `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:5683-5697` and `:5726-5752`.
- The one-stream/one-working-copy-per-ledger-call design is the correct way to handle multiple player records in deterministic ledger order.
- Optional facts preserve every existing caller and frozen test when no internal-damage data is supplied.
- The pod arithmetic is correct: for the stated holds, gold produces pods of 1000, 1000 and 201, and 1,200,000 gem-stone grams produces one 700,001 pod. This follows `PlayerEntity.m:307-353`, including the safe amount and dregs pod.
- Requiring `holdPods(...).length === holdPodsUsed(...)` ties the new list to existing capacity accounting instead of creating an unrelated cargo rule.

### Concerns
- **MEDIUM — it inherits the unrecorded 19-02 cap.** Once this plan connects real records to the roll, the cap can affect actual laser/scrape outcomes and later same-tick draws. The correct source wiring at `19-04-PLAN.md` does not resolve that semantic divergence.
- No additional material defect was found in the laser/scrape gates or pod-list expectations themselves.

### Suggestions
- Resolve the cap in 19-02 before treating this plan’s fidelity criteria as complete.
- Keep the existing twin immutability check and the explicit lethal-laser versus lethal-scrape cases; these are important protections for Phase 20 as well as Phase 19.
- Record which cadence scenario route was used and ensure its non-empty assertion cannot be satisfied solely by unrelated combat events.

### Risk Assessment
**MEDIUM.** The integration logic is faithful, but the inherited cap is now observable in real combat rather than confined to an unused module.

---

## 19-05

### Summary
Adds the closed F3 repair door, half-price calculation, one-tech-level reduction, immediate repair, purchase refusal for damaged items, forged-key tests and the catalogue/damageable-set guard.

### Strengths
- Half-price repair, TL−1, immediate refitting and replacement of the purchase row agree with `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:8270-8272`, `:8403-8411`, and `:9115-9135`.
- `ceil(price / 2)` reproduces the resulting integer-decicredit charge for the current data, including the explicit synthetic odd-price case.
- Parsing `<key>@repair` through the repairable allow-list and then re-running `checkRepair` inside `applyRepair` is the correct fail-closed money-path design.
- Making `REPAIRABLE_EQUIPMENT_KEYS` the same array object as `DAMAGEABLE_EQUIPMENT_KEYS`, rather than a second literal, prevents the repair and damage domains from drifting apart.
- The refusal order keeps `insufficientCredits` last, allowing unaffordable rows to remain listed with their reason while hiding tech/ownership mismatches.

### Concerns
- **LOW — correctness depends on the upstream catalogue and damageable-set proofs landing as planned.** The guard design addresses this, but its non-vacuity assertions must remain, especially the presence of a compiled `EQ_WEAPON_` record above zero alongside its exclusion from the repair set.
- No separate material problem was found in the price, tech, strict-parse or apply-once rules.

### Suggestions
- Preserve the explicit boundary cases for every compiled repairable item, not only `EQ_DOCK_COMP`: raw acceptable tech, one below, exact credits and one decicredit short.
- Keep the property sequence covering purchase → damage → repair → damage again, with disjointness and identity-on-refusal checks throughout.

### Risk Assessment
**LOW.** This is a well-bounded closed-set money-path addition with strong refusal and invariant coverage.

---

## 19-06

### Summary
Retires the save migration chain first, while the current version is still v4, classifies every older numeric version as `corrupt`, rebases saves tests onto shared current-version builders, and adds the browser recovery journey.

### Strengths
- The corrupt/unreadable distinction is correctly understood. Future versions remain `future-version` at `src/persistence/save.ts:557-564`; missing numeric versions are unreadable at `:566-570`; recognized unsupported versions fall to corrupt at `:573-597`.
- `corrupt` preserves recovery: `canOverwrite` and `canClear` are restricted at `src/app/session/save-controller.ts:91-107`, while the backup/clear handling is at `src/main.ts:224-234`. Classifying old saves as unreadable would cause the session-long save lockout the plan avoids.
- Doing this separately from the v5 schema addition makes the breaking change substantially easier to review.
- Keeping the 11 historical goldens as rejection fixtures is stronger than replacing them with one synthetic old blob, and the byte-identical guard prevents fixture rewriting.

### Concerns
- **LOW — stale documentation can mislead the executor.** The old-version corruption comments at `src/main.ts:226-229` and the migration-era header at `src/persistence/save.ts:25-27` need review alongside the read-path change.
- **LOW — case preservation relies heavily on SUMMARY bookkeeping.** Rejections that currently incidentally pass because a blob is old must not be allowed to mask a live-schema rule.

### Suggestions
- Require a concise preserved/rebased/removed test-case inventory in the SUMMARY, with a reason for every removal.
- Update stale comments when the migration symbols are deleted, not only the executable read path.
- Retain the explicit relabelled-current-fields case so an older `version` can never select schema acceptance by matching the new field shape.

### Risk Assessment
**LOW.** The design is coherent and the historical fixtures provide a strong rejection oracle, provided the test migration inventory is kept rigorous.

---

## 19-07

### Summary
Moves browser and app save fixtures to the shared builders, derives future versions from `SAVE_VERSION + 1`, rebases old-version refusal cases and updates SAVE-09/criterion wording to the corrupt path.

### Strengths
- The existing fixture inputs in `tests/e2e/helpers/save-fixtures.ts:42-100` and encode ordering in `src/persistence/save.ts:819-883` support the claim that equivalent `saveInputs` can preserve bytes.
- The four future-version fixtures are correctly identified and deriving them from `SAVE_VERSION + 1` removes a recurring failure mode for later bumps.
- Rebasing malformed blobs so each fails for its named defect is essential after old versions themselves become corrupt.

### Concerns
- **HIGH — two concrete v4 assertions are missed and will fail at 19-08.** `tests/e2e/save-load.spec.ts:334-340` contains `expect(blob.version).toBe(4)` and a canonical-v4 comment. `tests/app/session/station-controller.test.ts:526-544` asserts `parsed.save.version === 4`. Neither is addressed by the plan or by its object-literal grep gates, so changing `SAVE_VERSION` to 5 leaves both failing.
- **MEDIUM — the unknown-market-good case can fail for dual seed encodings first.** The original case at `tests/e2e/autosave.spec.ts:1162-1201` has `market` without `marketSeed`. Building it as `currentSave({ market })` retains the builder’s default `marketSeed`; `src/persistence/save.ts:686-711` rejects the dual encoding before reaching the unknown-good rule. That would preserve a green test while losing the intended evidence.

### Suggestions
- Convert both literal assertions and their v2/v4 prose in `tests/e2e/save-load.spec.ts:334` and `:659` to current-version language and `SAVE_VERSION`.
- Add an assertion search for `.version`).`/`save.version` patterns, not only `version: N` object literals.
- In the unknown-good fixture, explicitly remove `marketSeed` while adding only the unknown good. Keep a same-encoding valid-market control to prove the unknown key is the decisive defect.

### Risk Assessment
**HIGH.** As written, the next wave contains deterministic test failures, and one rebased security/validation case can become vacuous.

---

## 19-08

### Summary
Introduces save schema v5 and `damagedEquipment`, the shared reader/writer semantic rules, production F3/damageable allow-lists, the measured worst case, the frozen older-build classifier and the D-11 decision record.

### Strengths
- The production allow-list derivation is sound: installed equipment comes from the F3-visible set minus forbidden entries, while damaged equipment comes from the one damageable set. It also preserves the existing read-mode alias behavior at `src/persistence/save.ts:648-669` and `src/persistence/autosave.ts:215-244`.
- The required-array, damageable allow-list, uniqueness, disjointness and combined 64-key rules address forged and internally inconsistent saves.
- Reader/writer agreement is correctly anchored in the shared encoded-save gate at `src/persistence/save.ts:767-789`, not only in reader tests.
- No new write-on-damage path is introduced; `snapshotForSave` and `profileFromSave` preserve the damaged list for the established autosave triggers.
- The worst-case and frozen-classifier plans follow the existing v4 patterns rather than inventing a less precise test format.

### Concerns
- **HIGH — as sequenced, this plan executes with the two known v4 assertion failures left by 19-07.** The same assertions at `tests/e2e/save-load.spec.ts:334-340` and `tests/app/session/station-controller.test.ts:526-544` become false when `SAVE_VERSION = 5`. This is an execution blocker, not a speculative concern.
- The schema/allow-list design itself did not expose a comparable material defect in the static review.

### Suggestions
- Fix the missed assertions and the dual-seed fixture issue in 19-07 before executing this plan.
- Keep the v4-suite move atomic with the type/schema rename, as proposed; splitting those steps would produce avoidable intermediate type errors.
- Record the measured worst-case size and ensure the padded-max case and +1 unreadable case are asserted by exact status, not inferred from size comments.

### Risk Assessment
**HIGH as currently sequenced; MEDIUM after the 19-07 fixture corrections.** The underlying codec design is coherent, but the wave would not reach a green gate as written.

---

## 19-09

### Summary
Publishes the damaged list on the economy probe, supplies a production-encoded v5 browser fixture, tests Continue/Load restoration, and pins malformed damaged-list behavior at both reader and writer boundaries.

### Strengths
- Publishing a fresh array avoids exposing mutable profile state; the anti-alias test is a useful probe boundary check.
- The six economy fixture updates match the six sampled probe states, and hand-editing the sanctioned fixture without write mode minimizes accidental shape churn.
- Using production `encodeSave` avoids both hand-written impossible blobs and tainted hook sessions.
- Testing each forged input through both `parseSave` and `isEncodedSaveValid` prevents the writer from producing what the reader would reject.

### Concerns
- **MEDIUM — the in-session Load can be vacuous.** After Continue, the live profile already contains `["EQ_DOCK_COMP"]`. Loading the same blob and observing the same list does not prove a state transition unless the pre-Load state differs.
- **LOW — snapshot/encode composition is not quite the pending-autosave proof.** `snapshotForSave` followed by `encodeSave` demonstrates serializability, but not that a queued write reaches storage and can be restored as raw saved bytes.
- **LOW — the exact-cap boundary needs an explicit positive assertion.** At exactly `MAX_SAVE_CHARS`, assert `ok: true`; at +1, assert exactly `unreadable`. “Not unreadable for size” leaves other accidental outcomes insufficiently constrained.

### Suggestions
- Before Load, arrange an untainted live profile whose damaged list is empty, assert that precondition, then Load and assert `["EQ_DOCK_COMP"]` while stored bytes remain unchanged.
- For the durability case, use the in-memory save store and actual `queueAutosave` path, then restore from the stored raw bytes.
- Add the explicit exact-cap success and +1 failure assertions.

### Risk Assessment
**MEDIUM.** The validation coverage is extensive, but the browser Load scenario needs a non-vacuous initial state to prove restoration rather than mere persistence of an already-loaded value.

---

## 19-10

### Summary
Adds the `damageFlow` subscriber for atomic profile commits, routes both damage events to it alone, prints Oolite’s HUD messages only after a successful commit, and updates the router/HUD closed-set guards.

### Strengths
- Gating messages on `commitProfile` is better than inspecting post-event profile state: `commitProfile` already performs the identity check and replacement at `src/app/session/station-controller.ts:746-752`.
- The production wiring pattern fits `src/app/game-session.ts:310-323` and `:446-467`, and matches the existing gameplay-subscriber dispatch at `src/app/session/event-router.ts:624-636`.
- Routing both kinds only to `damageFlow` prevents another subscriber from announcing a refused or repeated change.
- The strings and timing agree with `third_party/oolite/Config/descriptions.plist:895-896` and `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:6105-6113`, `:6154-6171`.
- The no-autosave assertion correctly protects D-11’s “existing triggers only” rule.

### Concerns
- **MEDIUM — Task 1 breaks whole-project typechecking before Task 2 repairs the harnesses.** `EventRouterSubscribers` is a required `Record` at `src/app/session/event-router.ts:138-140`. `tests/app/session/session-order.test.ts` has four router-construction sites at `:206-212`, `:230-235`, `:295-359`, and `:607-612`, but Task 1 omits that file while requiring `docker compose run --rm typecheck`. Assigning the file only to Task 2 leaves a red typecheck at the first task boundary.

### Suggestions
- Move all four `damageFlow` subscriber stubs in `session-order.test.ts` into Task 1.
- Add valid damage events to the dispatch fixture loop at `tests/app/session/session-order.test.ts:195-217`, so the new rows are actually dispatched rather than only counted.
- Preserve the refusal tests requiring zero `clearPrevious` and zero `enqueue` calls for repeated equipment damage and refused cargo loss.

### Risk Assessment
**MEDIUM.** The runtime design is sound; the task partition has a deterministic intermediate build failure and an avoidable coverage gap.

---

## 19-11

### Summary
Builds per-step internal-damage facts from the live profile and loaded catalogues, caches them by object identity, and makes equipment/cargo damage possible in actual sessions.

### Strengths
- Facts are supplied per fixed step through `src/app/session/sim-driver.ts:159-188`, with events dispatched at `:191-204`, so successful damage commits invalidate subsequent profile-derived state.
- The cache key includes profile, equipment catalogue and commodities, correctly covering equipment, credits/cargo, capacity and catalogue changes.
- Optional-property handling is consistent with `src/app/session/step-options.ts:125-133`: absent catalogues mean absent facts, never guessed probabilities.
- Existing Node twins remain protected because the current session state has no equipment catalogue (`src/app/session/context.ts:380-382` and `tests/app/session/tick-parity.test.ts:138-153`), so their options contain no facts and no new rolls occur.

### Concerns
- **MEDIUM — the D-03 invariant is temporally false when this plan lands.** Its truth statement relies on 19-12’s future hook restriction, but 19-12 depends on 19-11. Today `src/app/session/probe-publisher.ts:324-334` grants any catalogue key, including lasers. Between these waves, a laser/ECM key can enter `profile.equipment`, receive positive compiled probability and be picked by the roll, while `applyEquipmentDamaged` refuses it. Repeated events can therefore announce no actual state change or repeatedly attempt the same invalid damage.
- **LOW — cache-invalidation tests should cover cargo as well as equipment.** Rebuilding after equipment replacement proves part of the key, but not that replacing the profile after a trade refreshes `pods`.

### Suggestions
- Move the `SINGLE_INSTANCE_KEYS`, damaged-key and combined-cap hook restrictions into 19-11 or an earlier plan; do not leave the invariant dependent on a downstream wave.
- Audit all `grantEquipment` callers when relocating the restriction. Current repository test callers found in this review grant `EQ_DOCK_COMP` or the four damageable keys, so the narrowed contract is compatible with existing normal usage, but the audit should be explicit in the plan.
- Add a cargo/profile replacement test asserting that the next step has newly derived pods, not only a test that a damaged equipment key disappears.

### Risk Assessment
**MEDIUM.** The live facts architecture is correct, but one wave exposes an invalid equipment state that the phase’s own commit operation refuses.

---

## 19-12

### Summary
Implements the visible F3 repair row and confirm flow, immediate repair through the real station controller, repair probe kind, F5 damaged list, and the test-hook profile restrictions.

### Strengths
- The composite `<key>@repair` row key is necessary: detail currently resolves the selected row key directly at `src/ui/station-model.ts:1024-1039`, and the controller currently resolves fit keys at `src/app/session/station-controller.ts:439-459`. A bare equipment key could not distinguish purchase from repair.
- Replacing the hard-coded Buy prompt at `src/app/session/station-controller.ts:692-709` with a model-provided verb preserves ordinary purchases while producing the correct repair confirmation.
- Re-check, second-Y, commit, autosave and selection clamping follow the existing purchase path at `src/app/session/station-controller.ts:476-521`.
- Repair text and pricing semantics are supported by `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:8377`, `:8403-8406`, `:8568-8572`, `:8270-8272`, `:9115-9118`, and `third_party/oolite/Config/descriptions.plist:1847`.
- The F5 requirement correctly records both differences: wording and within-group order. Oolite’s relevant enumeration/text paths are `PlayerEntity.m:7156`, `:7201-7208`, `:7238-7240`, and `descriptions.plist:1584`.

### Concerns
- **MEDIUM — the hook restriction lands too late.** The plan narrows the currently unrestricted method at `src/app/session/probe-publisher.ts:324-334`, but 19-11 already makes the new facts live. The restriction’s rationale belongs to the first wave that can roll over the granted keys, not solely to the UI wave.
- **LOW — one consistency sentence understates the F5 change.** `19-12-PLAN.md:202` describes only wording as different although the same plan deliberately changes the within-group ordering. CONTEXT and review records should consistently say “wording and damage order”.

### Suggestions
- Move the hook restriction to 19-11 or earlier and leave 19-12 to exercise its already-established contract.
- Include the caller audit in the plan. Existing current test callers identified by `rg` grant `EQ_DOCK_COMP` or the phase’s four damageable keys, so there is no demonstrated legitimate laser/ECM/FUEL grant to preserve.
- Keep the row-position, detail-copy, exact charge, tech-boundary, unaffordable and autosave-count tests together; they provide good coverage of the actual controller journey.

### Risk Assessment
**MEDIUM for wave sequencing; LOW for the F3/F5 mechanism itself.** The interface design is strong, but its supporting profile restriction belongs upstream.

---

## 19-13

### Summary
Adds the end-to-end CBT-08 Node and browser twins: grant four items, run the real shooter fight, destroy the enemy and prove player equipment damage through the live driver, facts, router and commit path.

### Strengths
- The scenario exercises the real integration seam rather than invoking the roll directly. The current harness wiring is at `tests/app/session/tick-parity.test.ts:267-324`, and the planned flow is at `19-13-PLAN.md:125-140`.
- The existing measured-twin pattern at `tests/app/session/tick-parity.test.ts:674-800` and `:820-898` is a suitable precedent.
- The deterministic 0..240 spawn-delay selection rule is reproducible, and the plan has a real blocked/escalation path if no delay qualifies (`19-13-PLAN.md:139-141`).
- The `/scratch` mount avoids adding scan artifacts to the repository (`19-13-PLAN.md:82`).
- Browser list-only validation is separated from the committed remote browser run at `19-13-PLAN.md:170-179` and `:201-208`; the checks wait on probe fields, not wall time, consistent with helpers such as `tests/e2e/combat.spec.ts:224-231`.

### Concerns
- **HIGH — the browser task does not implement the full contract stated in `must_haves`.** The top-level requirement at `19-13-PLAN.md:19-24` includes spawn delay, kill offset, damaged keys, debris and entity counts, world hash and HUD behavior. The browser behavior/acceptance text at `:156-179` names only kill offset, damaged keys, entity count and hash; it omits explicit spawn-delay, debris-count and same-tick HUD assertions.
- **HIGH — the scan cannot substantiate every “measured” literal as written.** The scan row at `19-13-PLAN.md:82` prints only delay, kill offset and damaged keys, yet `:139-141` also calls debris/entity counts and `HASH_60_AFTER_KILL` measured literals with a scan reference. Their measurement procedure is unspecified.
- **MEDIUM — “destroyed with its debris” can be satisfied vacuously.** Require at least one actual debris entity/pod as well as exact counts. The existing cargo-bearing twin can remain the cargo-pod-specific proof.
- **MEDIUM — old-literal guards protect only a subset.** The Node guard checks three existing values while existing debris/entity literals at `tests/app/session/tick-parity.test.ts:788-800` are not all covered. The browser guard checks the old hash while the broader old literal block is at `tests/e2e/combat.spec.ts:81-103`.
- **MEDIUM — world hash is not profile-damage evidence.** `src/app/session/probe-publisher.ts:183-190` hashes flight/world/combat, and `src/sim/combat/state.ts:242-253` serializes combat resources/weapons/ident, not `PlayerProfile.damagedEquipment`. Damaged-list assertions at kill and +60 must remain independent.

### Suggestions
- Add an explicit Node/browser assertion matrix covering all six scenario literals and `equipmentDamaged` plus its same-tick HUD message, with non-vacuous acceptance greps.
- Extend scan rows through kill+60 with debris/entity/hash data, or define a second selected-delay measurement step and record all resulting values in the SUMMARY.
- Require a nonzero debris count and exact browser debris counts.
- Pin the complete old literal blocks, not only representative values.
- Keep profile persistence/durability in 19-09; do not imply the world hash proves it here.

### Risk Assessment
**HIGH.** The scenario design is excellent, but the scan evidence and browser assertions currently fall short of the plan’s own end-to-end success contract.

---

## 19-14

### Summary
Writes the final FIDELITY.md and PROJECT.md records, reviewer-agreement fields, constants/open-item ledgers, and runs the phase’s full verification gate.

### Strengths
- The contract testing is real: always-on plus `OOLITE_SRC` verbatim mode, with a skipped verbatim case treated as failure (`19-14-PLAN.md:137-160`, `:186-209`). Relevant contract checks are at `tests/contract/fidelity.test.ts:203-274` and `:287-305`.
- Every planned excerpt range is within the 20-line limit: E-154..E-158 use 16, 7, 20, 20 and 18 lines; E-159..E-163 use 6, 19, 5, 3 and 8; E-164..E-166 use 5, 13 and 1.
- Most source verdicts are supported by `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:5683-5698`, `:5746-5752`, `:6097-6184`, `:8270-8272`, `:9115-9119`, `:8568-8572`, `:8403-8410`, and `:8411`.
- E-166 captures a real UI difference: Oolite sets repair-row colour at `PlayerEntity.m:8411`, while `src/ui/station.ts:296-309` gives rows only selected/dimmed treatment.
- The reviewer-field checks include positive counts and a no-`PENDING` guard (`19-14-PLAN.md:195-209`).

### Concerns
- **HIGH — the fidelity record omits the 256-roll cap.** The cap truncates Oolite’s uncapped loops and can affect both event outcomes and subsequent same-tick draws. E-154/E-155 discuss only the stream, and the ledger does not acknowledge the cap. The research’s “inert once everything is gone” assumption is not general proof of inertness.
- **MEDIUM — E-165’s excerpt does not cover its entire verdict.** `PlayerEntity.m:7200-7212` supports `_DAMAGED`/N/A presentation, but reverse enumeration is at `:7156` and damaged-first ordering at `:7238-7240`; neither appears in the excerpt.
- **MEDIUM — E-163 omits the label-wrapper evidence used to call “Repair: X” faithful.** Its range `8403-8410` excludes the `" %@ "` wrapper at `PlayerEntity.m:8377`.
- **MEDIUM — E-165 quotes the generic divergence policy rather than the concrete F5 decision.** `PROJECT.md:338` supplies the general rule, but the benefit and the wording/order choice reside in the new repair/F5 row specified at `19-12-PLAN.md:205-220`. The fidelity row should quote that concrete decision or a dedicated F5 decision row.
- **MEDIUM — reviewer agreement may remain pending until after divergent code lands.** `19-14-PLAN.md:63-65`, `19-02-PLAN.md:223,230`, and `19-12-PLAN.md:213,220` allow placeholders until wave 8. The fidelity rule requires reviewer-model agreement in plan or code review; making it an end-of-phase cleanup weakens that gate.
- **LOW — the phase-gate read list omits 19-15.** `19-14-PLAN.md:214-232` says SUMMARYs 19-01..19-13, but the phase also includes 19-15.
- **LOW — repeated shared documentation is stale.** The shared source audit assigns D-06 only to 19-03 (for example `19-01-PLAN.md:138`) even though 19-15 owns the tripwire, and `ROADMAP.md:423` still says E-154..E-165 although this plan defines E-166.

### Suggestions
- Resolve the cap as described for 19-02: remove it with a proven safe input bound, or add an explicit reviewed PROJECT/FIDELITY divergence and multi-record tests. Add the cap and damage purpose code to the constants ledger.
- Add small excerpts for `PlayerEntity.m:7156` and `:7238-7240`, or narrow E-165 so every claimed behavior has excerpt evidence.
- Add a faithful repair-label excerpt covering `PlayerEntity.m:8377-8378`; keep line 8411 exclusively for E-166.
- Quote the concrete 19-12/F5 decision, including the “N/A reads as not for sale” benefit and damage-order choice.
- Make `19-REVIEWS.md` a wave-0 prerequisite for divergence-writing tasks, or explicitly guarantee its completion before wave 1 and remove the PENDING fallback. Do not allow unresolved objections to be deferred to wave 8.
- Include the 19-15 SUMMARY in the close-gate inputs and update the repeated audit tables and ROADMAP range.

### Risk Assessment
**HIGH.** The documentation gate is rigorous in form, but several rows currently lack the evidence needed for their full verdicts, one substantive behavioral divergence is missing, and reviewer agreement can arrive after implementation.

---

## 19-15

### Summary
Records the currently inapplicable D-06 in-use clauses and adds source-tripwire tests intended to surface the first autopilot, galactic-drive or ANA consumer.

### Strengths
- Creating an explicit pending todo and a guard is preferable to silently discarding the unportable in-use clauses.
- Separating this small guard from 19-03 keeps the profile-operation plan more focused.
- The synthetic passing/failing comment-strip cases at least verify that the textual predicate can recognize its intended tokens.
- The autopilot and galactic-jump references point to the relevant Oolite mechanisms: `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.m:3327-3330`, `PlayerEntity.m:3432-3440`, and `third_party/oolite/Config/descriptions.plist:494`.

### Concerns
- **HIGH — the token guard cannot reliably detect the consumers it claims to protect.** A future implementation can re-export `EQ_GAL_DRIVE` or the ANA constant from `outfitting.ts` and call `equipment.has(alias)`, or implement autopilot under a name such as `autoDock`; every proposed scan stays green although Oolite’s damaged-item clause is now required. `19-15-PLAN.md:5-9` and `:19-38` overstate this as a mechanical first-consumer guard.
- **MEDIUM — the ANA todo lacks a concrete Oolite source range.** The interfaces/tasks at `19-15-PLAN.md:79-84` and `:129` describe the expected ANA behavior but do not provide exact Oolite chart/route lines or identify the precise affected affordances.
- **LOW — synthetic recognition tests do not establish semantic efficacy.** They prove the regex sees a token, not that a future exempted implementation preserves the damaged-item behavior.

### Suggestions
- Describe this accurately as a limited tripwire, not proof of first-consumer detection.
- Add synthetic alias/re-export and alternate-name bypass cases, then broaden the guard around central capability symbols or integration surfaces rather than relying only on bare equipment-key names.
- Supply the exact Oolite ANA source reference and expected chart/route behavior in the todo.
- When a tripwire is intentionally exempted for a legitimate implementation, require a damaged-item behavioral test at that consumer’s simulation boundary, not an exemption based only on file location.

### Risk Assessment
**HIGH.** The todo is useful, but the proposed guard provides stronger assurance than its detection model can deliver and could let precisely the future regression it is meant to catch pass unnoticed.

---

## Cross-Plan Assessment

The phase should be **REQUEST CHANGES before execution**, despite many strong individual designs.

1. **Resolve the behavioral/fidelity blocker first:** 19-02’s 256-roll cap is absent from Oolite and must either be eliminated through a justified safe design or explicitly reviewed and recorded. It also affects 19-04 and makes 19-14 incomplete.
2. **Fix deterministic persistence failures before Wave 3:** the hard-coded v4 assertions at `tests/e2e/save-load.spec.ts:334-340` and `tests/app/session/station-controller.test.ts:526-544` must move to the shared current-version approach in 19-07, and the unknown-market-good fixture must avoid the dual-seed rejection.
3. **Make profile invariants true when damage goes live:** the hook restriction belongs in or before 19-11, not downstream in 19-12.
4. **Make every task boundary typecheck:** 19-10 Task 1 needs the `session-order.test.ts` subscriber stubs immediately.
5. **Complete the CBT-08 proof:** 19-13 needs a complete measurement procedure and full Node/browser assertion parity, including debris and HUD behavior.
6. **Strengthen the fidelity evidence:** E-165 and E-163 need the cited wrapper/ordering lines, E-165 should quote the concrete F5 decision, and reviewer agreement should not remain optional until Wave 8.
7. **Treat the D-06 guard as advisory unless broadened:** the current bare-token approach cannot guarantee detection of alias or differently named consumers.
8. **Clean repeated planning artifacts:** update the D-06 audit mapping, ROADMAP’s E-154..E-166 range, superseded `unreadable` wording in CONTEXT/RESEARCH, PATTERNS’ obsolete golden-deletion recommendation, and 19-14’s omitted 19-15 SUMMARY.

This was a **static, read-only review**. No repository files were changed and no builds or tests were run; findings are based on direct source/plan inspection and source-cited reviewer analysis.

## Divergence Verdicts

### D1 — Stateless per-tick seeded damage stream
**AGREE.** A tick-keyed stream isolated from stored entity streams is appropriate for deterministic fixed-step simulation and avoids shifting existing world/entity streams and goldens. The gate/branch/draw-order design otherwise follows Oolite closely. **Qualification:** this agreement covers the stream choice, not the separate 256-iteration truncation. The cap needs removal or its own reviewed divergence record and tests.

### D2 — Constant trade-in factor 95; no cosmetic hull-wear branch
**AGREE.** Factor 95 matches Oolite’s new-ship value (`/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:1739` and `:1063`). Freezing it and omitting the cosmetic decrement is a bounded scope decision that keeps the new-ship damage probabilities meaningful while deferring renovation, wear and fuel-price behavior as one coherent later feature. The omission must remain visible in FIDELITY E-159 and its todo/tripwire.

### D3 — F5 `<name> (damaged)` in damage order
**AGREE.** “(damaged)” communicates the actual state more clearly than “(N/A)”, and damage order is deterministic and meaningful to the player. Oolite’s N/A text and reverse enumeration are confirmed by `PlayerEntity.m:7156`, `:7201-7208`, `:7238-7240`, and `descriptions.plist:1584`. The FIDELITY row must record **both** differences—wording and within-group order—and its excerpts must include those ordering lines.

### D4 — Repair row uses Wegolite’s station palette
**AGREE.** Keeping the existing station palette is consistent with the owner’s recorded UI direction and avoids a one-off orange row in an otherwise consistent interface. Oolite does set `kGuiEquipmentRepairColor` at `PlayerEntity.m:8411`, while Wegolite’s row rendering at `src/ui/station.ts:296-309` uses only selected/dimmed styling, so this is a genuine presentation divergence and should remain its own FIDELITY E-166 row, not merely an open item.

### D5 — Immediate repair with no repair time or clock advance
**AGREE.** Immediate repair matches Wegolite’s established no-install-delay purchase rule (`PROJECT.md:170`) and avoids introducing a separate station-clock/repair-time subsystem for one equipment action. Oolite’s `repairTime` and fallback `600 + price` behavior at `PlayerEntity.m:8407-8410` makes this a real divergence, correctly retained in E-163. The repair row text itself remains faithful and should have separate wrapper evidence rather than being folded into the repair-time verdict.

---

## OpenCode Review (qwen4-max)

# Cross-AI Plan Review — Phase 19: Equipment Damage and Repair

**Method.** I read every referenced repo file at HEAD `0f5cac8` (confirmed `git diff bba4068..HEAD -- src tests tools` is empty, so the plans' `bba4068` line-cites apply) and the cited Oolite source at `/home/opencode/git/oolite` (the four core files are unchanged between pin `7437f22` and checkout HEAD). Every mechanism the plans assert — guards, filters, money-path doors, the save reader/writer, the router, the twin literals, the fidelity contract — was traced against actual code, not plan prose. Findings below cite `path:line`. Where a plan claim could not be confirmed it is marked an open question. No file was modified.

## 19-01

**1. Summary.** Compiles Oolite's per-item `damage_probability` into the equipment catalogue (`EquipmentSchema.damageProbability`, `damageProbabilityOf`), behind the strict schema, a version-2 golden fixture pinning all 41 records, and the drift gate.

**2. Strengths.**
- The rule is source-exact: default 1.0 (`OOEquipmentType.m:210`), authored value (`:247`), missile/mine forced 0 (`:504-510`), `is_external_store` override (`:223`), `_MISSILE`/`_MINE` suffix (`:199-200`). The four F3 damageable items have no authored value → 1; the seven vendored zeros are at `equipment.plist` lines 23/32/239/252/286/383/486 (verified).
- Fail-closed `SCHEMA` naming the key mirrors the existing `project()` pattern (`tools/oolite-ingest/convert/equipment.ts:180-213`, `getEntry` + `EquipmentSchema.safeParse` + `contentError`). `damage_probability`/`is_external_store` live in `tuple.conditions`, exactly where `purchase_sort_order` is read.
- The 41-record count is correct: `src/content/generated/equipment.json` has 41 `"key":` lines and the golden has 41 `"techLevel":` lines; `damageProbability` is absent at HEAD (gate `HEAD=0`). `z.number().min(0)` rejects NaN/Infinity in Zod 4 as claimed.
- Synthetic `is_external_store` cases are justified — no vendored record uses it, so they are the only coverage of that branch.

**3. Concerns.**
- **LOW** — Stricter than Oolite: `oo_floatForKey` falls back to the default on a non-number, whereas the plan throws `SCHEMA`. This is a sound build-time choice for trusted, pinned vendored data, but a future vendored refresh carrying a string probability would fail the build rather than silently default. Acceptable; worth a one-line note in the converter doc.
- **LOW** — "Every laser key compiles to 1" is correct per data and correctly flagged as never read (lasers live in `laserMounts`, never `equipment`, `profile.ts:64-67`). No action needed; the plan already states it.

**4. Suggestions.** Confirm `tests/golden/content/equipment.json` has no consumer other than `equipment.test.ts` before the version bump. Keep the missile-suffix-wins-over-authored-value case (`EQ_FOO_MISSILE` 0.5 → 0) — it is the subtlest rule.

**5. Risk Assessment: LOW.**

## 19-02

**1. Summary.** Pure, total port of the gate loop and `takeInternalDamage` (`src/sim/combat/internal-damage.ts`), a stateless per-tick stream (`damage: 5`), the two events, constant factor 95, the hull-wear todo + tripwire, and two Key Decisions rows.

**2. Strengths.**
- The port matches the C exactly: gate `(ranrot_rand()&31)<amount` (`PlayerEntity.m:5690-5696`), factor 31 (`PlayerEntity.h:331`), unsigned `n_considered` (`:6101`), die only when n>0 (`:6102`), cargo-first (`:6105-6113`), reversed die (`:6115`), strict-`>` weighted pick (`:6135-6142`), draw order gate→die→pick. Scripted-draw tests that throw on an empty queue prove draw *order*, not just outcomes.
- **The unsigned-wrap edge is explicitly handled.** C `n_considered-(damage_to+1)` at n=0 wraps to `UINT_MAX`, so `UINT_MAX < damageableCounter` is false and equipment is skipped. Naive JS `0-(0+1)=-1; -1<4` is *true* and would wrongly damage an item. The plan requires "a negative reversed die … skips the equipment branch" plus the behavior case "considered 0 with pods=[] … changes nothing" — this corrects the research skeleton, which lacked the `>=0` guard. (Note `n_considered = floor((max(0,capacity)+21)*95/100) >= 19` always for the player, so n=0 is unreachable in play; this is defensive totality.)
- Stream isolation verified: `forkSeed` (`rng.ts:131-142`) mixes the purpose code, so `damage:5` is independent of `combat:3`/`ai:2`; nothing is stored or hashed, and `RNG_PURPOSE_CODES` is "looked up by key, never iterated" (`rng.ts:82-88`), so adding 5 renumbers nothing. This is why no existing twin literal moves.
- Totality: `MAX_INTERNAL_DAMAGE_ROLLS=256` clamps the DoS surface (T-19-02); `internalDamageWork` sanitises NaN/negative probabilities to 0, dedupes keys, and copies inputs.

**3. Concerns.**
- **MEDIUM (implementation trap, not a plan defect)** — The executor must add the `damageTo >= 0` guard on the reversed die. The plan prose and a behavior case require it, but the research "Code Examples" skeleton omits it; copying that skeleton verbatim would introduce a fidelity bug at the (unreachable) n=0 boundary. Flag prominently so the guard is not lost.
- **LOW** — Oolite's `if(!cargo_desc) return NO` (`:6108-6109`) and nil-pick fallthrough `if(system_key==nil) return NO` (`:6143-6146`) are not named. Both are unreachable for tradeable goods / benign; the totality property covers no-throw. Worth a comment for completeness.
- **LOW** — `randf()` precision: Oolite is 16-bit (`legacy_random.c:142-144`), Wegolite `u` is float64 (finer). The plan documents this; with all probabilities 0/1 the pick is uniform and the difference is unobservable.

**4. Suggestions.** Keep the `>=0` guard adjacent to its C citation; add a comment that `n_considered>=19` for the player so the n=0 case is understood as defensive. Name the two Oolite early-return guards in the module doc.

**5. Risk Assessment: LOW.**

## 19-03

**1. Summary.** Adds `PlayerProfile.damagedEquipment`, the pure `applyEquipmentDamaged`/`applyCargoDestroyed` (identity on refusal), the single `DAMAGEABLE_EQUIPMENT_KEYS` set, the combined 64-key cap in `purchase`, the SC2 not-installed proof, and a disjointness property.

**2. Strengths.**
- "Damaged = absent from `equipment`" leverages existing consumers with no new code: compass fallback (`flight/step.ts:168-176`) and dock-computer read (`:199`) both read `options.equipment`; `dock/computer.ts` returns `dockDenied{reason:"notInstalled"}`. Verified — no third copy of the installed check.
- `applyEquipmentDamaged` refuses any key outside `DAMAGEABLE_EQUIPMENT_KEYS`, so the damaged list can never hold a key the repair door cannot fix (the D-03 single-set invariant). `damage.ts` names no equipment key literal, keeping 19-15's tripwire green.
- The combined cap replaces the equipment-only check at `profile.ts:214`; `purchase` appends (`:221`), so insertion order equals Oolite's `_equipment` `NSMutableArray` order (`ShipEntity.h:447`) — the pick order is faithful, not merely "stable".
- `setCargo` (`cargo.ts:183-190`) drops zero entries on a null-prototype map; `applyCargoDestroyed` validates a positive safe integer no larger than held. `economy-purity` `PLAYER_FILES` (`:47-49`) plus the auto-adjusting count (`:227`) accommodate `damage.ts`; `profile.ts` already imports `cargo.ts`, so the new import is allowed.

**3. Concerns.**
- **LOW** — `profileFromSave` (`autosave.ts:215-245`) gets `damagedEquipment:[]` here (a v4 save cannot carry damage); 19-08 replaces it. Correct sequencing; the intermediate state loses nothing.
- **LOW** — The two-list "add-alongside" design is locked by D-11 and guarded by the companion property. Sound; the promote-to-one-list trigger (multi-instance damageable / partial states) is well-reasoned.

**4. Suggestions.** Ensure the property interleaves cargo loss with purchases and (after 19-05) repairs, not just damage operations.

**5. Risk Assessment: LOW.**

## 19-04

**1. Summary.** Hangs the roll off `applyLedger`'s player branch for laser (energy>0) and scrape (always), adds `CombatOptions.internalDamage`, builds Oolite's pod list (`holdPods`), and proves 30/60/144 Hz determinism.

**2. Strengths.**
- The laser gate `combat.energy>0` matches Oolite's else-of-`energy<=0` (`PlayerEntity.m:5683-5697`); scrape is unconditional (`:5746-5752`). `routeDamage` floors energy at 0 (`shields.ts:169`), so `energy===0` iff lethal — the gate is exact. `amount = DamageResult.applied` (`shields.ts:97-103`) is the post-shield remainder; a fully absorbed hit draws nothing.
- One work copy + one stream per ledger call, shared across player records in ascending shooter order (`ledger.ts:8-11`); Pitfall 6 (two records cannot double-damage) is tested.
- `holdPods` matches `loadCargoPodsForType` (`PlayerEntity.m:299-357`): t→one pod/tonne, kg/g safe stays in manifest, full pods then dregs, no empty pod on an exact multiple; `goodsSorter` ascending `sortOrder` confirmed (`OOCommodityMarket.m:341-353`). Worked examples gold 2700→[1000,1000,201] and gem_stones 1.2M→[700001] are correct.
- No facts → no roll → existing ledger tests, twins and the acceptance harness stay byte-identical (the `ledger.ts:160-179` branch is unchanged when `internalDamage` is absent). The marker sentence is preserved (`collision-player-death.test.ts:60,143-145`; `foldComments:73-81` folds whitespace, so the plan's "line breaks included" caution is stricter than needed but harmless).

**3. Concerns.**
- **LOW** — `shields.ts:191-192` doc says the internal-damage loop "is Phase 19's and is not ported"; it becomes stale once this plan ports it. The plan updates the ledger doc but not this one.
- **LOW** — `holdPodsUsed` takes a units *map* (`cargo.ts:92-97`) while `holdPods` takes a commodities array; the length-equality property must build consistent inputs. Minor test plumbing.
- **LOW** — The `podsFor` interface cite (57-63) is actually 60-67; symbols are correct.

**4. Suggestions.** Update the stale `shields.ts` doc in the same commit. Assert `holdPods(...).length === holdPodsUsed(...)` with a map built from the same commodities.

**5. Risk Assessment: LOW–MEDIUM** (the cadence test may need the explicit-`ShotRequest` fallback the plan already provides).

## 19-05

**1. Summary.** Adds the repair door (`checkRepair`/`applyRepair`) beside purchase and laser, with `REPAIRABLE_EQUIPMENT_KEYS` identical to `DAMAGEABLE_EQUIPMENT_KEYS`, `ceil(price/2)`, the TL-1 rule, immediate fit, the damaged-purchase refusal, and the D-03 guard.

**2. Strengths.**
- Mirrors the laser door exactly (`outfitting.ts:527-563`: membership parse, two-part split, re-check in apply, identity on refusal). The forged-key table is comprehensive (`EQ_ECM@repair`, laser, cargo bay, double suffix, `__proto__`).
- Prices verified against generated data: EQ_DOCK_COMP 15000/TL9 (`equipment.json:58-62`), EQ_GAL_DRIVE 50000/TL10 (`:147-151`), compass 6500/TL7, ANA 22500/TL6 → repairs 7500/25000/3250/11250 and TL floors 8/9/6/5. `ceil(price/2)` reproduces Oolite's double-halve + credit truncation (`tryBuyingItem:9115-9118,9134`); all four prices are even so rounding is unobservable.
- TL-1 matches `PlayerEntity.m:8270-8272` (only when `minTechLevel!=0`). `checkRepair` puts `insufficientCredits` last so `isListedForPurchase` (`outfitting.ts:157-170,192-194`) keeps an unaffordable row listed.
- The `damaged` refusal in `canPurchase` (after `owned`, `profile.ts:187-189`) propagates automatically through `checkFit`'s single-instance delegation (`outfitting.ts:362-365`), so the repair row replaces the purchase row as in Oolite (`PlayerEntity.m:8403-8411`).
- The D-03 guard pins `REPAIRABLE===DAMAGEABLE` (`toBe`), the set equals single-instance keys with compiled probability>0, excludes lasers, and is non-vacuous (the catalogue still compiles an `EQ_WEAPON_` record above 0). The `equipmentPriceFactor` order note (halve→script→station factor, `:9115-9132`) future-proofs a station price factor.

**3. Concerns.**
- **LOW** — Lave is raw TL4 (`g0.json` `techLevelRaw`), so no damaged item is repairable there (all floors ≥5). This is Oolite-faithful (the TL-1 rule) but a real gameplay consequence: a player who damages their docking computer at Lave must jump to repair. Not a bug; worth a CHANGELOG/player note. Repair tests correctly use Tibedied (raw 8).
- **LOW** — `repairPrice` returns 0 for an invalid price; `checkRepair` rejects `invalidPrice` before arithmetic, so the 0 is never charged. Fine.

**4. Suggestions.** Add a defense-in-depth test that a key forged into *both* lists is refused by `checkRepair`'s `owned` arm (disjointness is enforced upstream, but the door should not trust it).

**5. Risk Assessment: LOW.**

## 19-06

**1. Summary.** Retires the migration chain: `parseSave` reads only `SAVE_VERSION`, every older numeric version is `corrupt`; deletes v1–v3 schemas/migrations and `save-golden.test.ts`; introduces shared builders; rebases the save suites; proves the browser corrupt journey; adds a breaking CHANGELOG entry.

**2. Strengths.**
- `corrupt`-not-`unreadable` is critical and verified: `save-controller.ts` `canOverwrite` (absent|valid) / `canClear` (absent|valid|corrupt) — `unreadable` would lock saving for the whole session (Pitfall 2). `parseSave`'s final else (`save.ts:593-597`) already returns `corrupt` for a recognised-but-unsupported version; the plan extends this to all older versions.
- Keeping the historical goldens byte-identical as rejection fixtures is stronger than the research's "delete and write one literal"; the classification case reads each golden's `version`, so it survives the v5 bump unchanged.
- Shared builders answer Pitfall 9: `currentSave = JSON.parse(encodeSave(saveInputs()))`, so every test blob is one the production writer can write.
- Task sequencing is correct: Task 1 leaves `migrateV*`/v1–v3 schemas (still called by direct-migration tests) so `noUnusedLocals` stays green; Task 2 deletes them with their tests. No red typecheck between tasks.
- "No live rule loses its test" + a SUMMARY ledger of removed cases + the `src/persistence` 88% coverage floor + the golden byte-pin (T-19-24) are strong guards against silent test loss.

**3. Concerns.**
- **MEDIUM (execution churn, not a design defect)** — 85k tokens, 10 files + a deletion, rebasing ~3,794 lines of persistence tests. The risk is silently dropping a live-rule refusal or turning one into an accept. Mitigations are strong, but this is the phase's largest mechanical change; the checker kept it as one plan (advisory) to avoid an extra ordering edge on `save.ts`.
- **LOW** — The browser corrupt journey must assert backup byte-identical, Continue not offered, New game clears, and the next autosave commits. The plan specifies all four; the known flake `save-load.spec.ts:634` is in a different spec.

**4. Suggestions.** Run the full persistence suite + coverage at each task (not only the plan boundary) to catch a dropped rule early. Keep the removed-case ledger exhaustive and name each rebased refusal's defect.

**5. Risk Assessment: MEDIUM.**

## 19-07

**1. Summary.** Makes every save fixture follow the current version: browser fixtures and three Node app tests build from the shared builders, future-version fixtures use `SAVE_VERSION+1`, four vehicle refusal cases fail for their own defect, and SAVE-09/criterion 4 are reworded to `corrupt`.

**2. Strengths.**
- Future-version fixtures import `SAVE_VERSION` (`save.ts:64`) so they stay future under v5+; verified `save-load.spec.ts:498,832` and `autosave.spec.ts:866,1095` currently hardcode `version:5`.
- Rebasing refusal cases to current-version blobs differing only in the named defect (T-19-25) prevents a refusal passing merely because the blob is old — strong evidence discipline.
- The "Total: 28 tests" list-only gate has a pre-edit fallback (measured at `bba4068`: autosave 20 + save-load 8), robust to 19-06 landing differently.
- Requirement/roadmap wording is corrected to match the code (owner: the requirement must never contradict the code); verified `REQUIREMENTS.md:37` and `ROADMAP.md:380` currently say `unreadable`.

**3. Concerns.**
- **LOW** — `dockedSaveAt`/`inFlightSaveAt` (`save-fixtures.ts:42,66`) must produce byte-identical output for unchanged inputs so existing Continue/Load/budget specs pass. The builder defaults must exactly match the current literal fixtures (clock `CLOCK_START`, 1000 credits, fuel 70, `g0-s7`, `coriolis-station`, epoch 0, `FRESH_WORLD_NEXT_ENTITY_ID`, `DEFAULT_LASER_MOUNTS`); any default drift changes bytes.
- **LOW** — `save-builders.ts` must import no test framework (the Playwright Node runner imports it). The plan gates this; `tests/helpers/commodities.ts` is the verified analog.

**4. Suggestions.** Add an explicit byte-equality assertion (old fixture string === `encodeSave(saveInputs(...))`) for `dockedSaveAt("Lave")` *before* switching, to prove no drift.

**5. Risk Assessment: LOW–MEDIUM.**

## 19-08

**1. Summary.** Moves the save to v5 with a required `damagedEquipment` (≤16), shared reader/writer semantics (allow-list, disjoint, combined ≤64), the pure `equipmentAllowLists`, snapshot/restore plumbing, the worst-case size test, the older-build-inert classifier, and the D-11 decision row.

**2. Strengths.**
- **The worst-case shape is correct, not contradictory.** The plan specifies "schema maxima" (64 equipment + 16 damaged = 80 keys), asserted *schema-valid* and under the cap. This matches the v4 precedent (`save-v4.test.ts:608-620` asserts `SaveV4Schema.safeParse` success only — not `parseSave`/`isEncodedSaveValid`). The combined-64 rule is *semantic* (`validateSaveSemantics`), while zod bounds `equipment≤64` and `damaged≤16` independently, so the 80-key shape is schema-valid (~46.8KB < 65,536) and a conservative upper bound (every valid save is a subset). The executor must assert schema-validity only.
- **The allow-list wording is consistent.** "Five single-instance keys + two read-mode aliases" and "cargo bay + 4 damageable + EQ_MISSILE + EQ_PASSENGER_BERTH" are the same 7-key set (`VISIBLE ∩ catalogue` minus `FORBIDDEN`). Tightening `main.ts:176-200` from catalogue-wide to these 7 is intended D-03 hardening; v4 saves become corrupt anyway, and the read-mode alias tolerance (`save.ts:652-663`) is preserved.
- `damagedEquipment` is disjoint from `equipment` and never a `_DAMAGED` suffix (`FORBIDDEN_EQUIPMENT` `save.ts:435-442` has no `_DAMAGED` entry; the allow-list rejects a suffix in either field). Reader and writer share `validateSaveSemantics` (`:633-757`) and the `isEncodedSaveValid` write-mode gate (`:767-790`).
- `encodeSave` keeps `version` first (`:834`) so the 256-char sniff works; the older-build-inert case transcribes the v4 classifier with `SAVE_VERSION_V4=4` (`save-v4.test.ts:629-651` pattern); the padded worst case reads as `unreadable`, never `corrupt`.
- The builders carry the new fields once, so no browser spec or app test churns beyond pinned key sets (19-07 prepared this).

**3. Concerns.**
- **MEDIUM (execution churn)** — 80k tokens, 11 files + a move; an atomic type change (two required fields + version bump). Every file naming `SaveV4` or pinning the key set must move together so typecheck is never red at a task boundary. The shared builders minimise the blast radius, but a missed literal site is the risk.
- **LOW** — `MAX_SAVE_DAMAGED_EQUIPMENT=16` is headroom above 4 damageable items; the unscheduled cost-basis todo adds a field after v5, and 16 leaves room (research A2). Sound.
- **LOW** — `equipmentAllowLists` imports `VISIBLE_EQUIPMENT_KEYS`/`DAMAGEABLE_EQUIPMENT_KEYS` from `outfitting.ts` into `save.ts`. `save.ts` already imports from `sim/economy/cargo` and `sim/combat/mounts`, so persistence→sim imports are established; no guard conflict.

**4. Suggestions.** Grep every `SaveV4`/`laserMounts` key-set pin before the bump and run typecheck after each file group. Assert the worst case is schema-valid *only* (not `parseSave` ok) to avoid the 80-key semantic trap.

**5. Risk Assessment: MEDIUM.**

## 19-09

**1. Summary.** Exposes `economy.damagedEquipment` on the probe (additive, six fixture blocks), proves Continue/Load durability with an untainted v5 fixture, and pins the damaged-list save contract at every boundary through both reader and writer gate.

**2. Strengths.**
- Pitfall 8 is honored: the hooked fight session is tainted (`markHookMutation`), so durability is proven with an untainted `encodeSave` fixture (`save-fixtures.ts`) plus Vitest round trips, never the hook.
- The probe-shape hand-edit matches the 17-13 precedent: verified exactly six economy blocks with alphabetically sorted keys, and `damagedEquipment` sorts after `credits` (the plan's stated position). Write mode is not run; the remote probe-shape spec must pass unmodified.
- The contract table runs every forged list through *both* `parseSave` (corrupt) and `isEncodedSaveValid` (false) — reader/writer parity (T-19-15), including the D-03 rows (EQ_ECM, EQ_WEAPON_PULSE_LASER in either field). Bound cases use a synthetic 17-key allow-list so 16-pass/17-fail is testable.
- The publisher copies the list (`[...profile.damagedEquipment]`), so the page cannot mutate the profile through an alias (T-19-14).

**3. Concerns.**
- **LOW (cross-plan dependency)** — `syncEconomyProbe` returns early if `market`/`marketSeed` is undefined. The Continue/Load proof is docked (market defined), so it is fine; but 19-13 reads `economy.damagedEquipment` *in flight*, which relies on `ctx.core.market` persisting after launch. `renderStation` calls `syncEconomyProbe` and market is set at dock, so this should hold — but confirm it (see 19-13).
- **LOW** — Task 2 allows fixing a validator bug in `save.ts` (recorded in SUMMARY). Good escape hatch; scope discipline (only bugs the table exposes, never a relaxed expectation) is stated.

**4. Suggestions.** Confirm `ctx.core.market` is defined in flight so the probe publishes the damaged list for 19-13; otherwise 19-13 needs another probe field.

**5. Risk Assessment: LOW–MEDIUM.**

## 19-10

**1. Summary.** Adds a `damageFlow` subscriber that commits the profile atomically and then prints Oolite's HUD messages gated on its own commit result; routes both damage kinds to `damageFlow` alone; grows the closed sets 22→24; pins the templates and the HUD length guard.

**2. Strengths.**
- Routing both kinds to `damageFlow` *alone* (superseding the research's `["damageFlow","hudMessages"]`) is correct: `hudMessages` runs after the commit and cannot tell whether a cargo loss applied, whereas `damageFlow` knows its own `commitProfile` result. `hyperspaceRefused:["hyperspaceFlow"]` (`event-router.ts:114`) and `createHyperspaceFlow`'s `clearPrevious`+`enqueue(...,4.5)` (`:584-585`) are the exact precedent. T-19-17 (no message for refused/repeated damage) is well-grounded.
- `commitProfile` (`station-controller.ts:746-752`) returns false on identity, so `damageFlow` prints nothing on refusal — matching Oolite printing only for a real change (`PlayerEntity.m:6105-6113` pod removed, `:6163-6171` really damaged).
- Templates pinned to vendored `descriptions.plist:895-896` (verified); the HUD length guard covers every catalogue/commodity name (longest "Advanced Navigational Array damaged." = 36 < 60).
- Closed sets grow deliberately: `ROUTED_EVENT_KINDS` 22→24 (`event-router.ts:65-89`), `EVENT_SUBSCRIBER_ORDER` inserts `damageFlow` after `worldLifecycle`, and `session-order.test.ts` pins are updated (`toHaveLength(24)`, one-subscriber loop). The `EventRouterSubscribers` type forces every `createEventRouter` call site to supply `damageFlow` (the plan lists them). No `autosave` in the damage arms (D-11).

**3. Concerns.**
- **LOW** — Adding `damageFlow` to the order forces all test harnesses (session-order, world-lifecycle, tick-parity, sim-driver, event-router-ident) to add the stub; tick-parity gets only the stub line (no literal edit). Churn, but typecheck-enforced.
- **LOW** — The cargo message uses the commodity display name with a key fallback; if commodities are unloaded it falls back to the key (e.g. "gold destroyed."). In play commodities are loaded, so this is defensive only.

**4. Suggestions.** Ensure the 19-13 tick-parity recorder captures kinds handed to `damageFlow` (the `hudMessages` recorder never sees damage kinds) — the plan specifies this.

**5. Risk Assessment: LOW.**

## 19-11

**1. Summary.** Supplies read-only per-step facts (`internalDamageFactsFor`) from the live profile and loaded catalogues, identity-cached on the session core, absent until catalogues load; the first plan where damage happens in play (CHANGELOG entry).

**2. Strengths.**
- Facts are source-correct: items in `profile.equipment` order with compiled probability (0 for a missing key), `capacityPods = capacityPodsFor` (Oolite `maxAvailableCargoSpace = max_cargo - equipment_weight`, `ShipEntity.m:7198-7201` — capacity, not free space), pods = `holdPods`.
- The identity cache (the `equipmentSet()` pattern, `station-controller.ts:208-214`) keyed on profile+catalogue+commodities rebuilds only on change, so 120 Hz is cheap (T-19-18); the step after a damage commit sees the damaged key gone.
- Absent until both catalogues load → never a guessed probability (T-19-19). Existing tick-parity sessions load no `equipmentCatalogue` (verified `session()` helper) → no facts → no roll → byte-identical.
- `step-options.ts` stays Node-safe (imports only sim/content types; guard-mutation criterion) and uses the `exactOptionalPropertyTypes` omit-when-undefined pattern. The D-03 test confirms exactly the four damageable keys have probability>0 among the five F3 keys.

**3. Concerns.**
- **LOW** — The roll fires on *every* bank hit in a loaded session, even a new game (items=[], pods=[]), consuming stateless-stream draws. Verified this produces no events/profile change and leaves energy/hash literals byte-identical (the purpose-5 stream is isolated). The existing `combat.spec.ts` first test passes unchanged; the plan gates `git diff --stat bba4068 -- tests/e2e/combat.spec.ts` empty and runs the remote spec. This is the key twin-invariance risk and it is well-gated.
- **LOW** — `capacityPodsFor` is unclamped (`cargo.ts:119-125`); facts pass it raw and `consideredCount` clamps `max(0,...)`. Fine.

**4. Suggestions.** Keep the git-diff-empty gate and run the remote combat spec at the plan boundary (the plan does both).

**5. Risk Assessment: LOW–MEDIUM.**

## 19-12

**1. Summary.** Shows damage in F5 ("(damaged)" first, damage order) and offers F3 "Repair: X" through the real station controller (verb-driven prompt, `confirmRepair`), widens `lastTrade.kind` with "repair", tightens the `?test=1` grant to `SINGLE_INSTANCE_KEYS`, and records the decision + CHANGELOG.

**2. Strengths.**
- Row copy is Oolite-exact: `" Repair:%@"` (`descriptions.plist:1846`) over the `" %@ "` wrapper (`PlayerEntity.m:8377`) → `" Repair: Docking Computers "` trimmed = "Repair: Docking Computers" — not a divergence (owner 2026-11-21). Detail `"%@ (Price is for repairing...)"` (`:1847`, `PlayerEntity.m:8571-8572`). F5 "(damaged)" vs `"%@ (N/A)"` (`:1584`) is the one UI divergence; damaged-first matches `PlayerEntity.m:7238-7240`; damage-order vs Oolite's reverse-catalogue (`reverseEquipmentEnumerator:7156`) is recorded.
- `confirmRepair` parses `parseRepairFitKey` *before* the item lookup (the composite key is not in the catalogue and would otherwise hit "Not offered", per the `confirmFit` pattern); the detail branch parses the repair key too (`buildOutfittingModel`'s `byKey.get` throws `StationModelError` if absent). The verb-driven prompt replaces the hardcoded `Buy ${row.name}` (`:708`).
- TL fixtures verified against `g0.json` (`techLevelRaw`): Tibedied g0-s0=8 (dock comp repairable, not buyable), Leleer g0-s2=7 (hidden), Riinus g0-s11=9 (gal drive repairable), Lave=4 (none).
- The hook guard is safe: `applyTestEquipment` (`probe-publisher.ts:325-335`) today grants any catalogue key; verified no existing e2e grants a non-single-instance key (only EQ_DOCK_COMP in station/docking specs), so tightening breaks nothing. Pitfall 13 (no hook damages equipment) holds. `lastTrade` "repair" is an additive union widening, so the value-free probe-shape fixture is unchanged.
- The Key Decisions row's `Reviewers:` field is filled from `19-REVIEWS.md`, with a PENDING placeholder if absent and escalation on an unresolved objection (deviation Rule 4).

**3. Concerns.**
- **MEDIUM (churn)** — 70k tokens, 10 files, four source files of one user-facing change plus tests, CHANGELOG and the decision row. Keeping them together (splitting would separate the repair from its record) is reasonable but large.
- **LOW** — F5 damage-order is a divergence from Oolite's reverse-catalogue order, and Oolite's damaged-first is itself a user setting (`prioritiseDamaged`, default YES); Wegolite always prioritises damaged. Owner-approved (D-07/D-12), recorded E-165. Acceptable simplification.
- **LOW** — Ensure `ensureOutfittingSelection`/position clamp works with the composite repair key (Pitfall 7); the plan mentions clamping by position.

**4. Suggestions.** Test that a repair-row selection survives a concurrent profile change (another damage event) without throwing, and that the detail branch parses the composite key.

**5. Risk Assessment: MEDIUM.**

## 19-13

**1. Summary.** Proves CBT-08 end to end in one hook-spawned fight (Node twin + browser): grant the four F3 items, the shooter dies with its debris, the player leaves with a damaged item; scan spawn delay 0..240 and pin measured literals; existing twins untouched.

**2. Strengths.**
- SC5 runs through the real driver/router/probe/HUD; damage arrives via real hits→ledger roll→event→`damageFlow` commit (no hook shortcut), enforced by prohibitions.
- The scan procedure is exact and verified collectible (mounted `/scratch` vitest config, `root:"/app"`, `testTimeout:0`, absolute imports); 241 `SCAN-ROW` lines go into the SUMMARY; the choice rule is reproducible (smallest delay with a kill and exactly one damaged item, else at least one). An empty qualifying set ends the plan blocked with escalation (deviation Rule 4) — the plan correctly forbids widening the range or changing items/shooter/sequence to force a pass.
- Existing twin literals are pinned by guard-mutation criteria (verified `KILL_OFFSET=672`, `ENERGY_AT_KILL=83.7999999999947`, `HASH_60_AFTER_KILL='f6927215'` at `tick-parity.test.ts:674-675,800`; `TWIN_HASH_60_AFTER_KILL='f6927215'` at `combat.spec.ts:101`). Node must equal browser; a difference is reported, not re-pinned.
- The `damage` session option wires a real `commitProfile` + `createDamageFlow` behind the recorder; existing sessions stay byte-identical (no catalogue).

**3. Concerns.**
- **MEDIUM (uncertainty)** — The scan may find no delay in 0..240 with both a kill and a damaged item. Research A6 estimates ~40% chance of ≥1 equipment damage over the fight (6-point hits, gate 6/32, 4 damageable of 38); across 241 delays the probability all fail is low but nonzero, and the kill must also occur. The escalation path is good, but this is the phase's biggest unknown.
- **MEDIUM (performance)** — 241 fights × up to ~1500+ ticks in one Vitest run could be slow (`testTimeout:0`, background allowed). One-time and acceptable, but budget time.
- **LOW (cross-plan)** — The browser test reads `economy.damagedEquipment` in flight, which depends on `ctx.core.market` being defined (see 19-09). Confirm before relying on it.
- **LOW** — `DAMAGE_DEBRIS_AT_KILL`/`DAMAGE_ENTITIES_AT_KILL` may differ from the existing debris twin's (`{pods:2,plates:0,wrecks:2}`, 16) because the player now has equipment; the plan measures them fresh. Fine.

**4. Suggestions.** Run the scan in the background early and record the full table even on success; if the qualifying set is empty, escalate with the table rather than tweaking. Pre-confirm market persists in flight for the probe read.

**5. Risk Assessment: MEDIUM.**

## 19-14

**1. Summary.** Closes the phase: FIDELITY rows/excerpts E-154..E-166, constants ledger, open items, the station-palette Key Decisions row, filled `Reviewers:` fields, the corrected divergence-rule outcome, and the automatic `verify-full` phase gate.

**2. Strengths.**
- The contract is verified: `MAX_EXCERPT_LINES=20` (`fidelity.test.ts:35`) and all 13 planned ranges are ≤20; `ROW_HEADING`/`WEGOLITE_CELL` (single line must exist)/`OOLITE_CELL` regexes (`:45-47`); `faithful` is a whole-cell compare (`:259`), so parentheticals go in the Mechanic cell; divergence extracts the *first* double-quoted string (`:267`), so the backticks-for-reason mitigation is correct. Verbatim mode `it.skipIf(OOLITE_SRC==='')` (`:287`) reads the extracted pin; the plan extracts via `git archive 7437f22`.
- `FIDELITY.md` last excerpt E-153 at 2550, Constants ledger 2575, Open items 2756 → append E-154..166 between; 8 divergence + 5 faithful = 13.
- `PROJECT.md` install-delay row exists (`:170`, E-163 quotes it); the divergence-rule row (`:338`) outcome is corrected (removes `"Repair: X" with a space`, adds not-a-divergence + damage order); the palette row is confirmed absent → created (the owner's 2026-11-18 decision lived only in a todo).
- The Reviewers rule covers all 8 FIDELITY divergence rows and 4 Key Decisions rows, fills PENDING placeholders, and escalates unresolved objections; gates count ==8 and ==4 with no PENDING remaining. The phase gate `verify-full` is automatic, and the NPC scope check (`git diff bba4068..HEAD -- src/sim/npc src/sim/world ships-npc.json` empty) means the 20-seed acceptance run is not triggered.

**3. Concerns.**
- **LOW** — E-158 is marked `faithful` despite Oolite's `_DAMAGED`-key-in-list vs Wegolite's separate `damagedEquipment` list. Behaviorally equivalent (a damaged item is not installed either way; Wegolite has no scripts, so no `equipmentDamaged` script event). The `faithful` cell must be exactly `faithful` with the representation note in the Mechanic cell. Defensible, though a reviewer could argue it is a minor representational divergence.
- **LOW** — E-163's excerpt 8403-8410 correctly stops before the colour line 8411 (E-166), so its divergence rests only on install-delay; the repair-time divergence (8407-8410) is within range. Correct split.
- **LOW** — 13 excerpts copied from the pin via `git show` (never typed) and prettier re-pads the tables; mechanical but precise.

**4. Suggestions.** Read each Wegolite cell line number from the tree at execution time (not the plan); ensure the first double-quoted string in every divergence cell is the PROJECT.md quote (backtick all other strings).

**5. Risk Assessment: LOW–MEDIUM.**

## 19-15

**1. Summary.** Records the D-06 in-use clauses Wegolite cannot exercise (autopilot disengage, galactic-jump abort, ANA chart) in a todo and puts a tripwire on their first consumer.

**2. Strengths.**
- Verified green at HEAD: all `autopilot` tokens in `src` are comments (`keyboard.ts:67-68`, `actions.ts:304`, `computer.ts:7`), stripped by `withoutComments`; `EQ_GAL_DRIVE`/`EQ_ADVANCED_NAVIGATIONAL_ARRAY` appear only in `outfitting.ts`. The tripwire stays green through all waves (19-03 `damage.ts` names no literal, 19-08 imports arrays, 19-12 uses helpers).
- The deferred-work rule is honored: a todo plus a guard that fails on the first consumer, naming the Oolite clause (`ShipEntity.m:3327-3330` `disengageAutopilot`, `PlayerEntity.m:3432-3440` gal-drive abort, `descriptions.plist:494` "Autopilot disengaged.").
- The exemption is matched by repository-relative path (not base name), so a second `outfitting.ts` elsewhere is not exempt; each trigger has synthetic failing and comment-only passing inputs. The real D-06 consumers (compass fallback, dock-computer refusal) are proven in 19-03; the absent ones are recorded here — a correct split.

**3. Concerns.**
- **LOW** — The tripwire is a token scan, not a behavioral test: it flags the *appearance* of a consumer, not whether the damaged-item clause is implemented. That is the intended tripwire semantics (forces a human to read the todo). Acceptable.
- **LOW** — A case-insensitive `autopilot` token could match a future unrelated identifier (e.g. `autopilotSpeed`), a false positive for non-docking autopilot. Minor; the point is to surface the first consumer.

**4. Suggestions.** Keep the failure message pointing to the exact Oolite lines so the first-consumer implementer knows what to port.

**5. Risk Assessment: LOW.**

---

**Overall assessment (after per-plan review).** No HIGH-severity plan defect was found. The plans are unusually well-verified — the research already corrected four CONTEXT errors against source (factor 100→95, `NSDictionary`→`NSMutableArray`, `unreadable`→`corrupt`, and "Repair: X" as Oolite's own rendered text), and every mechanism I traced (money-path doors, save reader/writer parity, router closed sets, the stateless stream's twin-invariance, the fidelity contract, the tripwires) does what the plans claim. The two apparent contradictions I initially flagged in 19-08 (the 80-key worst case vs the combined-64 rule; the allow-list wording) resolve to non-issues on inspection: the worst case is schema-max (matching the v4 precedent), and the two allow-list descriptions are the same 7-key set. The genuine risks are execution churn (19-06 and 19-08 are large atomic mechanical changes) and the 19-13 scan uncertainty, all with stated mitigations and escalation paths. Dependency ordering across the 8 waves is acyclic and sound; all five ROADMAP success criteria are covered (SC1=02/04/10/11, SC2=03/10/12, SC3=05/12, SC4=06/07/08/09, SC5=13); and there is no scope creep (the allow-list and hook tightenings are in-scope D-03/Pitfall-13 hardening, and no missiles/ECM/escape-pod/bounties are added). The main implementation trap to watch is the reversed-die `>=0` guard in 19-02 (the research skeleton omits it; the plan prose and a test require it).

## Divergence Verdicts

**D1 — Stateless per-tick seeded stream (`damage: 5`, keyed by world seed + player id + tick) instead of Oolite's global `randf()`/`ranrot`. AGREE.** Verified the stream is isolated: `forkSeed` (`rng.ts:131-142`) mixes the purpose code, so purpose 5 is independent of the combat (3) and ai (2) streams; nothing is stored, hashed or saved, so existing twin literals (`tick-parity.test.ts:674-675,800`; `combat.spec.ts:81,101`) stay byte-identical, and the tick key makes it deterministic at 30/60/144 Hz. Oolite's single global `ranrot` sequence is not reproducible in a fixed-step, multi-entity, seeded-per-entity simulation anyway; the per-tick fork is the faithful-in-spirit choice that preserves determinism without shifting goldens. Concrete benefit, recorded in the 19-02 Key Decisions row and FIDELITY E-154..E-157.

**D2 — `ship_trade_in_factor` constant 95, never persisted, cosmetic hull-wear branch unported. AGREE.** Verified 95 is Oolite's new-ship value (`PlayerEntity.m:1739`) and load default (`:1063`); 100 is reached only through `EQ_RENOVATION` (`:9287-9289`, capped at 100). The factor enters `n_considered` (38, or 53 with the bay), so the cargo/equipment odds are exact for a new ship. Hull wear, `EQ_RENOVATION` and the fuel-price effect are deferred as one todo with a tripwire (`hull-wear-tripwire.test.ts`), and the choice is reversible (porting later adds one saved field and its own bump). The research correctly overturned CONTEXT's 100; recording the divergence rather than silently using 100 satisfies the fidelity rule.

**D3 — F5 lists damaged items first as `<name> (damaged)` in damage order, instead of Oolite's `%@ (N/A)` in reverse catalogue order. AGREE.** Verified `"%@ (N/A)"` at `descriptions.plist:1584` / `PlayerEntity.m:7202-7210`, damaged-first at `:7238-7240`, and reverse-catalogue order via `reverseEquipmentEnumerator` (`:7156`). The owner found "N/A" ambiguous ("not for sale"); "(damaged)" is a concrete clarity benefit, and damage order is deterministic and arguably clearer than reverse catalogue order. This is the phase's one deliberate UI divergence, recorded in FIDELITY E-165 and the 19-12 Key Decisions row with reviewer agreement.

**D4 — The F3 repair row is drawn in Wegolite's station palette, not Oolite's orange `kGuiEquipmentRepairColor`. AGREE.** Verified the orange repair-row colour at `PlayerEntity.m:8411` (and the renovation row at `:8390`). This rests on the owner's 2026-11-18 palette decision (quick 261118-cyo, todo `2026-11-17-ui-station-screen-differences-from-oolite.md`): Wegolite's station screens consistently keep their own palette. The plan creates the previously-missing Key Decisions row and FIDELITY E-166, and the port is one row class plus one CSS rule tied to the palette todo. Consistent with an existing owner decision, not a silent divergence.

**D5 — A repair is applied at once, with no repair time / clock advance. AGREE.** Verified Oolite charges `repairTime` else `600 + price` at `PlayerEntity.m:8407-8410`. This is consistent with the existing Phase-5 decision "Apply purchases immediately with no install delay" (`PROJECT.md:170`), which FIDELITY E-163 quotes; no new gameplay-clock mechanic is introduced, and the choice is reversible. Recorded as a divergence resting on the install-delay row, with the repair-time lines inside E-163's excerpt range.

All five divergences have a concrete benefit, owner/reviewer grounding, and a FIDELITY row; I agree with each.

---

## Consensus Summary

Three grounded reviewers (Claude Fable as an Agent subagent; Kimi K3.1 Pro and Qwen4 Max through opencode) read the repository and the Oolite checkout. All three confirm that the core port is correct: the gate loop, `takeInternalDamage` with its branch order, the die reversal and the strict `>` pick, `holdPods` against `loadCargoPodsForType`, `ceil(price/2)` and the TL-1 rule, factor 95, and `corrupt` for v1-v4 saves. Qwen found no HIGH defect. Fable found no HIGH defect and four MEDIUM ones. Kimi raised several HIGH findings, all about plan mechanics, not about the Oolite transcription.

### Divergence Verdicts (fidelity rule, AGENTS.md / CONTEXT D-12)

| Divergence | Fable | Kimi K3.1 Pro | Qwen4 Max | Outcome |
|---|---|---|---|---|
| D1 stateless per-tick `damage` stream (E-154..E-157) | AGREE (record the 256-roll cap) | AGREE (the cap needs its own record or removal) | AGREE | Agreed; record the cap |
| D2 factor 95 constant, no hull wear (E-159) | AGREE | AGREE | AGREE | Agreed |
| D3 F5 `(damaged)` in damage order (E-165) | AGREE | AGREE (record wording and order, excerpt the order lines) | AGREE | Agreed |
| D4 repair row in the station palette (E-166) | AGREE | AGREE | AGREE | Agreed |
| D5 repair at once, no repair time (E-163) | AGREE | AGREE | AGREE | Agreed |

The `Reviewers:` fields for these rows can cite this file: "Fable, Kimi K3.1 Pro and Qwen4 Max agree (19-REVIEWS.md)".

### Agreed Strengths
- The Oolite transcription is exact and every FIDELITY excerpt range is within 20 lines (all three).
- One damageable set shared by the roll facts, the save allow-list and the repair door closes the forged-save hole (Fable, Qwen).
- Deterministic tick-keyed stream keeps existing twin literals byte-identical (all three).

### Agreed Concerns
1. **`MAX_INTERNAL_DAMAGE_ROLLS = 256` is an unrecorded divergence** (Fable LOW, Kimi HIGH): Oolite's loops are uncapped. Either remove the cap or record it as a reviewed divergence with a Key Decisions row, a FIDELITY note, a constants-ledger row and a multi-record test.
2. **Sequencing: damage goes live before it can be handled** (Fable MEDIUM, Kimi MEDIUM): after 19-11 a damaged item is invisible on F5 with no repair row, and the test hook can still grant lasers/ECM until 19-12. Move the hook restriction to the first plan that makes facts live (or earlier) and order 19-12 before 19-11 where possible.
3. **19-15 tripwire can be bypassed** (Fable MEDIUM, Kimi HIGH): exempting all of `outfitting.ts` lets a re-exported key or alias pass. Pin token counts in that file instead of exempting it.
4. **19-13 CBT-08 twin contract** (Kimi HIGH, Qwen MEDIUM): the scan prints only delay/kill/damaged, yet debris, entity and hash literals are called "measured"; the browser task asserts fewer literals than must_haves; debris can be satisfied vacuously; the old-literal guard covers a subset. Extend the scan output through kill+60 and assert every pinned literal in both twins, with >= 1 debris piece.

### Single-reviewer findings worth acting on
- Fable: 19-04 Task 1 tracer uses a 320-point laser hit, which always empties the 256 bank, so the laser gate suppresses the roll; use a survivable amount (e.g. 96). The behaviour text's oracle `() => rngNext(createRngState(seed))` repeats the first draw; use the advancing `rngNext(rng)`.
- Kimi: two literal v4 assertions are missed by 19-07 and fail at 19-08: `tests/e2e/save-load.spec.ts:339` (`expect(blob.version).toBe(4)`) and `tests/app/session/station-controller.test.ts:542` (`expect(parsed.save.version).toBe(4)`) (orchestrator-verified).
- Kimi: 19-10 Task 1 leaves typecheck red until Task 2 (required `EventRouterSubscribers` record vs four router constructions in `session-order.test.ts`).
- Kimi: 19-09 in-session Load is vacuous when the profile already holds the damaged key; start Load from a different state.
- Kimi: E-165 excerpt should include `PlayerEntity.m:7156` and `:7238-7240`; E-163 should cite the `" %@ "` wrapper at `:8377` for the faithful label; E-165 should quote the concrete F5 decision row, not only the generic rule.
- Kimi: 19-03 Task 1 "add `damagedEquipment: []` to any other failing literal" is open-ended outside `files_modified`.
- Fable LOW: 19-01 lets the `_MISSILE` suffix win over an explicit `is_external_store = no` (Oolite `OOEquipmentType.m:223`); 19-11 must-have names `internalDamageFactsFor` in `tests/helpers/tick-script.ts`, which is not in its files.
- Qwen: research skeleton omits the `damageTo >= 0` guard; the 241-delay scan may be slow and may find nothing (escalation path exists).

### Divergent Views
- Severity: Kimi rates the cap and the 19-13 contract HIGH; Fable and Qwen rate the same areas LOW/MEDIUM. No reviewer disagrees with any of D1-D5.
