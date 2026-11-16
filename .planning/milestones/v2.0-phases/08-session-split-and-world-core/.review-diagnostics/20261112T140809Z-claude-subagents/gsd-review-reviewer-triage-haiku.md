# Fast Triage Review (reviewer-triage-haiku)

Scope: Phase 8 plans 08-01 to 08-16 at commit 0aa747a (Round 4). Read-only. Method: each plan's frontmatter, must_haves, task headers, acceptance criteria and Round 3 ledger were read; numeric constants, file names, symbols and line anchors were checked against the repo (`src/`, `tests/`, the Oolite checkout). Not read line by line: 08-05 Task 2 behaviour list, 08-02 Tasks 2-3 bodies, 08-15 Task 3 bodies beyond the anchored-save and lifecycle text. Those are triaged only for consistency.

Overall verdict: NEEDS REVISION. All nine Round 3 consensus items are present in the text, but three cross-plan contradictions remain (advanceTicks optional vs the probe-shape invariant; createEventRouter signature; constant ownership). They are text fixes, not architecture changes.

## Round 3 disposition check

| Round 3 finding | Status | Evidence |
|---|---|---|
| C1 08-13 post-spawn in-place mutation, counter/quat/string/key caps, restoreWorld via parser, anti-alias test | Resolved in text | 08-13-PLAN.md:133 (1+5e-10 accept row, underflow reject row, 257 entities, 101.5, 2**53), :138 (snapshot anti-alias test), :140 (sanitizer/parser agreement), :202 (restoreWorld validates through parseWorldSnapshot). Counter bounds match 08-11:166-169 and 08-05:137. |
| C2 08-15 anchored save uses SaveInputs object | Resolved | 08-15-PLAN.md:206 asserts `Object.keys(inputs).sort()` and `JSON.stringify(inputs)`. Allow-list of 14 keys equals SaveInputs (src/persistence/save.ts:301-320). Ledger at :297 still quotes the superseded `snapshotForSave(inputs)` wording (LOW). |
| C3 08-16 createTestHook sim required, probe.sim anti-mutation, liveEntityCount | Resolved in text, with a new conflict | 08-16-PLAN.md:38, :267 (required 5th param), :125 (liveEntityCount), :162 and :206 (typeof, no aliasing). New conflict on advanceTicks, see X1. |
| C4 MAX_SAVE_POSITION_MAGNITUDE 1e9 vs 1e12 | Resolved | 08-11-PLAN.md:162 and 08-05-PLAN.md:137 explain the world-local cap. src/persistence/save.ts:123 is 1e9. 08-13-PLAN.md:133 uses "(exceeding MAX_SNAPSHOT_MAGNITUDE (`1e12`))" with the 1e308 example. |
| C5 08-03 Reflect/apply/sort.call, 08-05 nextId 2**32, 08-12 addEventListener signal, stale anchors | Resolved | 08-03-PLAN.md:141-142; 08-05-PLAN.md:180 (2**32 allocate test) and :293; 08-12-PLAN.md acceptance (addEventListener count = uiController.signal count) and :250. Anchors 2738/2749/2773/2859 in 08-10-PLAN.md:258 match src/app/game-session.ts. |
| 08-13 `slices any param arrays` wording | Resolved | 08-13-PLAN.md:107 now says "copies (via `.slice()`) any param arrays". |

## Cross-plan findings

- **X1 (HIGH). advanceTicks optional vs the probe-shape invariant.** 08-16-PLAN.md:126 sets `advanceTicks: ctx.runtime.testFlags.manualClock ? ... : undefined`, and :221 calls it optional. But 08-01-PLAN.md:27 requires that in the docked `?test=1` state "every probe.test method reads as function", and 08-01-PLAN.md:153 checks the fixture keys. 08-16 step 4 also claims `test.advanceTicks` is an addition to the existing states. Under plain `?test=1` the key is absent, so the subtractive check and the comparator would fail or would silently record a missing key. Fix: either always publish a function (for example, one that refuses outside the manual clock), or restate the 08-01 must-have and the 08-16 subtractive check for the plain `testHookDocked` state.
- **X2 (MEDIUM). createEventRouter signature contradicts itself.** 08-10-PLAN.md:28 and :155 (and the ledger at :244) use `createEventRouter(ctx, subscribers)`. 08-10-PLAN.md:39 and :212 (the artifacts lists) still say `createEventRouter(subscribers)`. 08-15-PLAN.md:105 says `(subscribers)` and :130 says `(ctx, subscribers)`. Fix the three artifact and interface lines to match the body.
- **X3 (MEDIUM). Constant ownership is split and runs forward.** `MAX_ENTITY_MAGNITUDE` (1e12), `MAX_SNAPSHOT_STRING_LENGTH` (128), `MAX_SNAPSHOT_PARAM_LENGTH` (64) and `MAX_AI_PARAMS_KEYS` (32) are used by the wave-2 spawn validator in 08-05-PLAN.md:137 and 08-05 artifacts (:39-49 do not define them). They are provided by 08-11-PLAN.md:45 and :277 (src/sim/world/sanitize.ts) and by 08-13-PLAN.md:107 (src/sim/world/snapshot.ts, which also redefines the same names and `MAX_SNAPSHOT_MAGNITUDE = 1e12`). So 08-05 cannot import them when it runs, and two modules define the same constants. Fix: one owner, defined in 08-05 (for example in ids.ts or a constants module), imported by 08-11 and 08-13.
- **X4 (LOW). Dependency edges.** 08-11 depends_on lists only 08-09, but Task 1 calls `createWorldView` from 08-07. The dependency is transitive. Name 08-07 explicitly.

Verified in source (no findings): game-session.ts is 3365 lines with 77 closure `let`s (`^  let`), exports 9 names, `generateMarket(` 3 times, `case "docked":` once. Anchors: renderFrame 2577, drawKeys 2558, shouldDraw 2566, showHint 2680, frame 2699, refusalCopy 2044, handleHyperspaceJumped 2061, syncStatusOverlay 2160, closeSaveScreen 1899 (document access at 1906), loadFromSave 1326, clearSaveForNewGame 1482, enterSystemById 1768, onSubpanelKeyDown 2257, onLaunchKeyDown 2279-2292, pending.length sites 2738/2749/2773/2859. `createTestHook` at src/app/probe.ts:390 (4 params today). SimEvent has 14 kinds (src/sim/events.ts) and the 08-11 reserved list has 15. DT = 1/120 (src/sim/step.ts:8) and AI_THINK_INTERVAL 0.125 (src/Core/AI.h:31) give 15 ticks. `Math.round(0.1*120) = 12`, and `120*(1/120) === 1` holds. Oolite anchors OOTypes.h:168-170, Universe.m:4841-4846 and 1162, OOPlanetEntity.m:94 and OOSunEntity.m:131 match. `createSeededRandom` is defined once (src/sim/math.ts:227) and called once in src/sim (src/sim/hyperspace/arrival.ts:73). src/sim has no `Date`, timers, `process`, `Reflect`, `globalThis`, `for..in`, bare sort, or `Math.random`. market.ts:169 is a comparator sort and hash.ts:8 mentions crypto only in a comment. Files cited as existing exist (lave.ts, dock-pose.ts `laveDockGeometry`, redraw-gate.ts `IDLE_SETTLE_DRAWS`, `createMessageQueue`, `createLaunchSequence`, src/render/sync.ts:80, src/render/bodies/station.ts roll at 203-216). Files that do not exist yet (session-source.ts, context.ts, start-session.ts, tick-script.ts, rng.ts, recorded-flights.ts, world/ and ai/ trees, golden/world) are all created by the plan that cites them.

---

## 08-01

**Summary.** Split safety nets: the probe-shape comparator and spec, the fixture recorded from the monolith, and the re-pointed session-source scans.

**Strengths.** The comparator rules are explicit (empty array, null versus missing, function leaf). The fixture is recorded before any split. The fast gate gets the spec (`package.json` change, container-contract update).

**Concerns.**
- MEDIUM. Must-have at 08-01-PLAN.md:27 ("every probe.test method reads as function" in docked `?test=1`) conflicts with 08-16-PLAN.md:126 (advanceTicks undefined outside manual clock). See X1.
- LOW. 08-01-PLAN.md:153 hard-codes six state keys and `Object.keys(f).length===6`. That is correct for 08-01, but 08-16 adds a seventh state. Note it in 08-16's subtractive check.

**Suggestions.** Resolve X1 here (the state's `test` object shape is decided in this plan).

**Risk.** LOW.

## 08-02

**Summary.** Pinned v1 flight hashes and RNG vectors, serialisable stream state, mix32 world and fork seeds.

**Strengths.** Pins are captured from the unmodified closure before delegation. The single-caller invariant is checkable: `createSeededRandom` has one call in src/sim (arrival.ts:73). The render callers are left untouched, as the truth at 08-02-PLAN.md:34 requires.

**Concerns.**
- LOW. Must-have :27 mentions "a Lave to Leesti jump with the session's arrival draw". The fixture and helper (`tests/helpers/recorded-flights.ts`) do not exist yet. Check that the route is reachable with the existing scripted-flight helpers, or name the helper.
- LOW. Estimate 115k over the budget with `autonomous: false`. The accepted-risk note covers it.

**Suggestions.** Name the golden file path in one place (08-05 and 08-11 both cite `tests/golden/world/flight-hash-pins.json`, consistent so far).

**Risk.** MEDIUM (one-way D-02 arithmetic pinned literally; a mistake here propagates to every later plan).

## 08-03

**Summary.** Determinism lint bans in src/sim, with probes and positive controls.

**Strengths.** Every banned construct is backed by a probe and a positive control. The Round 3 Reflect/apply/sort.call/bind forms are present (08-03-PLAN.md:141-142). The repo has no current violations (I checked `.sort()`, `for..in`, `Date`, timers, `process`, `Reflect`, `globalThis`, `Math` aliasing in src/sim). `market.ts:169` is the comparator sort that must stay legal.

**Concerns.**
- LOW. Step 143 lets the executor "adjust the selector until its probe fails". The probe expectations are fixed, but the selector is not. Acceptable, but state that a selector change needs a review note.
- LOW. The `Reflect["get"]` and `.sort.apply` forms are in the acceptance count (≥31 failing cases, :161), which is a count, not a list. Consider listing the probe names.

**Suggestions.** Keep the message strings frozen as the plan says (they are reused by 08-09).

**Risk.** LOW.

## 08-04

**Summary.** Split steps 1-2: typed SessionState and extraction of the probe publisher.

**Strengths.** The anchors all match: 3365 lines, 77 lets, saveProbe 441, redrawGate 468, messages 480, launchSequence 483, commitProfile 1021, bindTestHook 1034, applyTestCredits 1050, applyTestEquipment 1055, syncSaveProbe 1067, updateProbe 2412. The pinned renderFrame signature matches game-session.ts:2577. The `withdrawProbe` wiring is explicit.

**Concerns.**
- LOW. The rejected R2-03 (narrow Pick facets) is a judgement call under D-12; it is recorded, so this is only a note.

**Suggestions.** None blocking.

**Risk.** MEDIUM (3.3k-line mechanical rewrite; guarded by the scans and the stale-capture audit).

## 08-05

**Summary.** World foundation: ids, entities, five static entities, store, world hash, D-08 proof.

**Strengths.** Fixed ids (1-5, 100, 101) are consistent with 08-07, 08-09, 08-13 and 08-15. The 256 cap counts non-dead entities. The `nextId <= 0xffffffff` guard is in the acceptance criteria. Oolite anchors OOTypes.h:168-170 and Universe.m:4841-4846 are correct.

**Concerns.**
- MEDIUM. Forward references (X3). 08-05-PLAN.md:137 validates `specKey` against `MAX_SNAPSHOT_STRING_LENGTH (128)`, `ai.params` against `MAX_AI_PARAMS_KEYS (32)`, and radius and pose against `MAX_ENTITY_MAGNITUDE (1e12)`. None of these is in the 08-05 artifacts list (:39-49). They are defined later, in 08-11 (sanitize.ts) and 08-13 (snapshot.ts). Define them in 08-05.
- LOW. The must-have at :28 is one very long clause. Split it so an executor can test each rule.

**Suggestions.** Put the caps in ids.ts (or a `limits.ts`) owned by 08-05.

**Risk.** MEDIUM.

## 08-06

**Summary.** Split steps 3-4: render driver, chart and settings controllers, with a verify-full gate on a detached worktree.

**Strengths.** The live-read rule is explicit. The redraw-gate literals are pinned. The verify-full step runs on the step's own commit.

**Concerns.**
- LOW. Worktree path `/tmp/wegolite-gate-08-06-step3` (Task 1 step 5). Acceptable under the AGENTS.md mount rule, but a worktree in the scratchpad would avoid a shared /tmp name collision.
- LOW. The listener totals (`addEventListener`/`removeEventListener`) are "recorded in the SUMMARY" rather than fixed numbers. That is intentional, but the acceptance is then self-referential.

**Suggestions.** None blocking.

**Risk.** MEDIUM.

## 08-07

**Summary.** The AI seam: type-only WorldView and ShipControl with implementations.

**Strengths.** Both interfaces are pinned by exhaustive `Record<keyof ...>` literals. The world holds no FlightState, so G-8 holds by construction. The station roll must match the renderer's base-then-roll composition, and `src/render/sync.ts:80` and `src/render/bodies/station.ts` (roll at 203-216) are the reference.

**Concerns.**
- LOW. Frontmatter depends_on lists only 08-05. This is correct for its own inputs.

**Suggestions.** None.

**Risk.** LOW.

## 08-08

**Summary.** Split steps 5-6: station controller and save controller, with a verify-full gate at step 6.

**Strengths.** The save guard order is pinned by a "loadFromSave order" test. `closeSaveScreen` (game-session.ts:1899) and its `document` access (:1906) match the plan. The loadFromSave, clearSaveForNewGame and renderStation anchors (1326, 1482, 889) match.

**Concerns.**
- LOW. The station block range "492-1020" in the interfaces section is approximate. The plan says to locate by name, so this is only a note.
- LOW. Worktree path `/tmp/wegolite-gate-08-08-step6`, as in 08-06.

**Suggestions.** None blocking.

**Risk.** MEDIUM (175k estimate; persistence-adjacent).

## 08-09

**Summary.** AI types, integer tick time base, registry, scripted test pilot, and the AI lint zone.

**Strengths.** Time constants are correct: `DT = 1/120` (src/sim/step.ts:8), `AI_THINK_INTERVAL 0.125` (src/Core/AI.h:31), so 15 ticks. `ticks(seconds) = max(1, round(seconds*120))` gives `ticks(0.1)=12`, `ticks(0.125)=15`, `ticks(0)=1`, which matches the behaviour list. The AI zone covers nested directories recursively.

**Concerns.**
- LOW. 08-09-PLAN.md:33 ("the populator never spawns the test pilot") cannot be tested in Phase 8, because the populator is Phase 12. The claim is only checkable by grep for `AI_REGISTRY` usage. State that.
- LOW. Frontmatter depends_on includes 08-07 and 08-03 but not 08-05, which the spawn-based tests use. It is transitive through 08-07.

**Suggestions.** Change :33 to a grep-based acceptance criterion.

**Risk.** LOW.

## 08-10

**Summary.** Split steps 7-8: hyperspace controller (atomic), event router, sim driver with `stepOnce`, and the pure step-options builder.

**Strengths.** The hyperspace install block is moved as one unit. `stepFlight` ends up with one call site. The 14 existing SimEvent kinds (src/sim/events.ts) match the `EVENT_KIND_SUBSCRIBER` map. The anchors (refusalCopy 2044, handleHyperspaceJumped 2061, syncStatusOverlay 2160, enterSystemById 1768) and the four `pending.length = 0` sites (2738/2749/2773/2859) are correct, so R3-01 is resolved.

**Concerns.**
- MEDIUM. Router signature contradicts itself (X2): :28 and :155 say `(ctx, subscribers)`, but :39 and :212 (artifacts) say `createEventRouter(subscribers)`.
- LOW. Two names for the order table (`EVENT_SUBSCRIBER_ORDER` and `EVENT_KIND_SUBSCRIBER`). Both are used, but the artifacts list only one of them with a clear purpose.

**Suggestions.** Fix the artifact lines. Use the same signature in 08-15.

**Risk.** MEDIUM (185k estimate; event order is a regression hazard, and the plan covers it with pinned tests).

## 08-11

**Summary.** The world step: stepWorld after stepFlight, id-ordered passes, queued AI events, per-tick sanitising, reserved SimEvent kinds.

**Strengths.** `git diff --quiet 5b189e4 -- src/sim/flight` keeps the flight step unchanged, and 5b189e4 exists in the repo. The reserved list has 15 kinds, consistent with the ARCHITECTURE §7.6 names in the plan. The `MAX_SAVE_POSITION_MAGNITUDE` clarification (:162) is present. Repair counting is pinned per field.

**Concerns.**
- MEDIUM. Duplicate constant ownership (X3): :45 and :277 (sanitize.ts) provide `MAX_SNAPSHOT_STRING_LENGTH`, `MAX_SNAPSHOT_PARAM_LENGTH` and `MAX_AI_PARAMS_KEYS`, and 08-13:107 exports the same names from snapshot.ts. Define them once.
- LOW. `MAX_ENTITY_MAGNITUDE` (1e12, here) and `MAX_SNAPSHOT_MAGNITUDE` (1e12, in 08-13) have the same value under two names. Make one an alias of the other.
- LOW. depends_on omits 08-07 (X4).

**Suggestions.** Single owner for all limits, imported by 08-13.

**Risk.** MEDIUM (140k estimate; field-complete sanitiser is wide).

## 08-12

**Summary.** Split step 9: frame loop, start-up wiring, and the facade; frame-order and dispose-order tests; verify-full on a worktree.

**Strengths.** The facade export set (9 names) matches game-session.ts:219-335. The listener registrations at game-session.ts:2268 and :2289 carry `signal: uiController.signal`, and the plan's acceptance checks that count against it, so R3-01 is resolved. The pinned-literal audit is a concrete gate.

**Concerns.**
- LOW. `wc -l < src/app/game-session.ts` below 600 is a target not tied to a rule. A facade that fails only on size would be a false failure. Keep it as a note, not a gate.
- LOW. Task 2 read_first (08-12-PLAN.md:153) points at `tests/app/dispose.test.ts` near line 687 "where codebase-memory reported parse_partial". That is a tool artifact, not a verified reference. Replace with a `rg` check.
- LOW. Worktree path, as in 08-06.

**Suggestions.** Drop the parse_partial reference.

**Risk.** MEDIUM (165k estimate; widest split step).

## 08-13

**Summary.** Snapshot codec with a 1,000-tick live-versus-restored equality, a rejection table, and edge cases.

**Strengths.** The round-trip equality is non-vacuous (the test asserts equality at the final tick). The Round 3 items are present: the quaternion tolerance rows (:133), the anti-alias test (:138), restoreWorld through parseWorldSnapshot (:202), and the `.slice()` wording at :107. The rejection table is large and each case has a named reason.

**Concerns.**
- MEDIUM. Duplicate constants (X3): :107 exports `MAX_SNAPSHOT_STRING_LENGTH`, `MAX_SNAPSHOT_PARAM_LENGTH`, `MAX_AI_PARAMS_KEYS` and `MAX_SNAPSHOT_MAGNITUDE`. Import them from the single owner instead.
- LOW. `structuredClone` is used in tests to clone the player (:22). That is fine under tsconfig.sim (src/sim is not affected), but state that it is test-only.

**Suggestions.** Import the caps.

**Risk.** MEDIUM (135k estimate; the codec must match the entity hash field for field).

## 08-14

**Summary.** `?test=1&clock=manual`: flags read once, manual frame loop, `advanceTicks(n)` on the driver.

**Strengths.** `MAX_ADVANCE_TICKS = 200_000` agrees with 08-16's "integer 1..200000". The prohibition (advanceTicks taints before the first step so no durable save is written) is explicit and tested.

**Concerns.**
- LOW. Task 1 step 6 says "game-session.ts (or wherever plan 08-12 builds the driver's deps)". Name the file. The same hedge appears in 08-16-PLAN.md:127.
- LOW. Estimate exactly at the 100k budget, so no accepted-risk note is needed.

**Suggestions.** Name the file.

**Risk.** LOW.

## 08-15

**Summary.** Integration: world lifecycle, the launch, arrival and Load bump points, the anchored-save check, and the decision record.

**Strengths.** The anchored-save test now uses the `SaveInputs` object, and its 14-key allow-list matches `SaveInputs` in src/persistence/save.ts:301-320 exactly, so R3-02 is resolved. `populateNothing` is explicit and scoped to Phase 8. The `begin` guards (`epoch < 0xffffffff`, finite marketSeed) keep `worldSeedFor` from throwing.

**Concerns.**
- MEDIUM. Router signature (X2): :105 says `createEventRouter(subscribers)`, but :130 says `createEventRouter(ctx, subscribers)`.
- LOW. The R2-04 ledger entry at :297 still quotes `snapshotForSave(inputs)`, which R3-01 superseded. Annotate it as superseded so the ledger does not contradict the body.
- LOW. The must-have at :33 ("populate runs ... in both traffic modes") depends on `populateNothing`. Say that it spawns nothing in both modes, so the statement is checkable.

**Suggestions.** Fix the router line. Annotate the superseded ledger line.

**Risk.** HIGH (integration across eight files in three layers, at wave 8, with a ten-line invariant set). The triage found only text issues.

## 08-16

**Summary.** The one deliberate probe commit: `probe.sim`, `worldHash`, `advanceTicks`, the fixture update, browser and Vitest hash parity, and the decision record.

**Strengths.** `probe.sim` is published only inside `if (currentState !== undefined)` and is a fresh plain object. Writes to `probe.sim` are tested not to affect the live world. `entities` is read through `liveEntityCount`, and there is no `.store` access from src/app. The subtractive diff check is documented with a script. Parity is asserted for the same ticks in browser and Vitest.

**Concerns.**
- HIGH. `advanceTicks` is optional and undefined outside the manual clock (X1; 08-16-PLAN.md:126, :221). This conflicts with 08-01-PLAN.md:27 and :153 and with the subtractive check, which expects `test.advanceTicks` added in `testHookDocked`. Choose one behaviour and update all three.
- LOW. Hedge "game-session.ts (or wherever plan 08-12 builds the publisher's deps)" at :127. Name the file.
- LOW. The fixture grows from six to seven states (`testHookManualDocked`, :128 and :140). That is an addition, so it is covered by D-13's "adds fields" rule, but the commit must name it, which the plan does.

**Suggestions.** Make `advanceTicks` always a function and make it throw or no-op when not under the manual clock. Then the fixture and the subtractive check hold without changes to 08-01.

**Risk.** MEDIUM.

---

## Overall

Verdict: NEEDS REVISION. Required text fixes before Wave 1 starts, or before Wave 8 for the items that touch its plans:
1. X1: make `advanceTicks` always a function (08-16:126, :221), or revise 08-01:27 and 08-16's subtractive check.
2. X2: one `createEventRouter` signature in 08-10 (:39, :212) and 08-15 (:105).
3. X3: one owner for the caps, defined in 08-05 and imported by 08-11 and 08-13.
4. Smaller items: X4 (08-11 depends_on), the superseded ledger line at 08-15:297, the file hedges in 08-14:123 and 08-16:127, and the tool-artifact reference in 08-12 Task 2.
