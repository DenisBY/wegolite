# Phase 8 Plan Review, Round 5: reviewer-correctness-opus

Lens: behavioural correctness. I checked whether the acceptance criteria, grep gates and tests can pass or fail as each plan claims, whether the game-session extraction preserves the current behaviour of `src/app/game-session.ts` (3365 lines at afc4fe0), and whether the "verbatim move" claims are true.

All evidence was read from source at afc4fe0. I ran nothing in Docker. Every `rg` baseline below was run read-only against the tree.

## Round 4 consensus check

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | NaN in `ai.params` cannot be "rejected after JSON" | **Resolved** | `08-13-PLAN.md:115`: `snapshotWorld` walks every number leaf and throws `SnapshotError("non-finite")`. `:151`: refusal rows. `:155`: post-JSON rows limited to number slots and array elements; a scalar `null` is accepted. `:154`: the generator yields `null`/`true`/`false`. `:172`: gate `fc\.(constant\|constantFrom\|boolean)\(`. `08-05-PLAN.md:148`: the `ParamValue` domain doc. |
| 2 | The `\.store\b` gate can never print nothing | **Resolved** | `08-16-PLAN.md` Task 1 acceptance: the new regex `sim/world/store\|world\??\.store\b\|\.store\??\.(live\|get\|allocate\|kill\|commit\|nextId)\b\|\bEntityStore\b`. I ran it against `src/app` and it prints nothing. The save-store uses at `game-session.ts:1167,1341,1490,3345` are `.read/.clear/.dispose` or a bare `saveBoot.store` argument, so none matches. |
| 3 | `advanceTicks` is undefined outside the manual clock | **Resolved** | `08-16-PLAN.md:126` (Task 1 step 1): both members are required and always present, and outside the manual clock the call refuses. `08-01-PLAN.md:138`: the standing contract is written into the spec header. Fixture gate: `testHookDocked.test.advanceTicks === "function"`. |
| 4 | Shared limits defined three times | **Resolved** | `08-05-PLAN.md:146` adds `limits.ts`. `:185`: the redefinition gate. I checked its baseline: no match today, and `src/sim/ai` is absent. `08-11` Task 2 acceptance and `08-13` Task 1 acceptance repeat the gate. The planned constants (`MAX_ENTITIES = 256`, `MAX_AI_QUEUE_LENGTH = 4096`, `THINK_INTERVAL_TICKS = 15`, `TICKS_PER_SECOND = 120`) do not collide with its `\b` alternation. |
| 5 | Enum leaves not checked or repaired; `registry[aiKey]` | **Resolved** | Spawn: `08-05-PLAN.md:30,211`. Sanitize rule 9: `08-11-PLAN.md` Task 2 behaviour item 9. `aiModuleFor` with `Object.hasOwn`, plus the gate `registry\[[^\]]+\]\.(think\|onEvent)`: `08-11` Task 1 acceptance. Case (d) uses four prototype names. |
| 6 | Quaternions that pass spawn or sanitize can fail the parser | **Resolved** | `MIN_QUAT_NORM_SQ = 1e-12`, plus a re-check after normalising (`08-11` rule 2). Spawn requires a unit quaternion (`08-05-PLAN.md:157`). I checked the arithmetic: `{w:7e-158}` gives normSq ≈ 4.9e-315, which is below 1e-12, so it becomes identity. `{w:1e-5}` normalises to exactly `w = 1` (`src/sim/math.ts:53-57`). `{w:1+2.5e-10}` has \|normSq−1\| = 5e-10, which is inside the 1e-9 tolerance. |
| 7 | `worldSeed` never checked as uint32 | **Resolved** | `08-05-PLAN.md:212` (`createWorld` throws RangeError). The parser half is at `08-13-PLAN.md:26,143`. |
| 8 | `createEventRouter` signature contradiction | **Resolved** | `08-10-PLAN.md:40,158`, `08-15-PLAN.md:108,133`: every mention reads `(ctx, subscribers)`. Gate: `ctx\?: SessionState` must not appear. |
| 9 | Lint guard gaps | **Resolved** | `08-03` Task 2 adds `no-eval`, `no-new-func`, `no-implied-eval`, `Intl`, `localeCompare`, the computed sort/call forms, and `sort(undefined)`. The baselines it states (`no-eval`/`no-new-func`/`localeCompare`/`Intl` = 1; `property.value=` and `no-implied-eval` = 0) match `eslint.config.js` today. `08-09` Task 3 adds `importNames` and `AI_MODULE_STATE_BANS`. `08-02` Task 3 adds the import-aware scan; `arrival.ts:30` matches its regex. |
| 10 | Restore check uses a rounded hash | **Resolved** | `08-13-PLAN.md:116`: exact `JSON.stringify(snapshotWorld(...))` and `toStrictEqual` at every checkpoint, with a gate. |
| 11 | AI event drain limits passes, not deliveries | **Resolved** | `08-11` Task 2: `MAX_AI_EVENTS_PER_DRAIN = 4096` and `MAX_AI_QUEUE_LENGTH = 4096`, with a conservation-law test row. |
| 12 | `ShipControl` accepts out-of-domain values | **Resolved** | `08-07-PLAN.md:117`: the seam ignores values outside the domain, using `limits.js`. Task 2 has the domain rows. |
| 13 | No Firefox run | **Resolved** | `08-12-PLAN.md:123,137`; `08-15-PLAN.md:216,232`. |
| 14 | Verbatim deviations, best-of-N, stale anchors | **Resolved** | `08-08-PLAN.md:146,165`; `08-12-PLAN.md:118,137`; `08-15-PLAN.md:214` (best of 3); `08-04` executor brief ("locate every site by name"). |

All 14 are resolved in the plan text.

## New findings (summary)

1. **MEDIUM (`08-15` Task 1 step 4 vs `08-01` Task 2 step 4 and `tests/guards/economy-purity.test.ts:201-207,350-352`): the `worldLifecycle` subscriber can land inside the cut of the economy-purity "docked arm".**
   - `switchCaseBody` cuts from `case "docked":` to the next `\n\s*case\s+["']` in that file, or to the end of the file.
   - In 08-10's `event-router.ts`, `docked` is the last case of the stationFlow switch (source order is launched, launchComplete, docked; see `game-session.ts:2296-2353`). The cut therefore runs into whatever code follows, up to the first `case` label of the next switch.
   - 08-15 places the `worldLifecycle` subscriber "right after `stationFlow`" and calls `begin(ctx.core.marketSeed)` only "when `ctx.core.marketSeed` is a number". The natural spelling, `typeof ctx.core.marketSeed === "number"`, matches the guard's `/\bmarketSeed\s*=/`, because `\s*=` matches the first `=` of `===`. So does `const marketSeed = ctx.core.marketSeed`.
   - If that code sits physically between the stationFlow switch and the hudMessages switch, `docked).not.toMatch(/\bmarketSeed\s*=/)` fails. It is a false failure: the docked arm itself never re-seeds.
   - The executor may not edit the scan (FOUND-10 prohibition), so they must find the cause.
   - **Fix:** in 08-15, require the `worldLifecycle` subscriber to be declared after every other subscriber's `case` labels (or before the stationFlow switch). Alternatively, read the seed with a spelling that cannot match, for example `const seed = ctx.core.marketSeed; if (seed !== undefined) …begin(seed)`. Add an acceptance line: `docker compose run --rm test npx vitest run tests/guards/economy-purity.test.ts` passes, and the SUMMARY names where the subscriber sits relative to the `case "docked":` arm.

2. **MEDIUM (`08-06` Task 2 step 5 and `must_haves` truth 4): "closing the chart requests a redraw" is false for the function being moved.**
   - `closeChart` (`game-session.ts:1851-1860`) never calls `redrawGate.request()`.
   - The five request sites are `:1041` (hook taint), `:2740` (chart-open freeze branch in `frame()`), `:2751` (save-screen freeze), `:3255` (`resize`) and `:3361` (`shown`). The comment in `tests/app/redraw-gate.test.ts:139-141` confirms this list.
   - The redraw after the chart closes comes from the freeze branch requesting on every open-chart frame.
   - The planned unit test therefore has two possible outcomes:
     - (a) It passes vacuously. A fresh `createRedrawGate` returns `true` on its first `next()`, because `seen === undefined` (`src/app/redraw-gate.ts`).
     - (b) If the test first settles the gate, it fails against the verbatim body.
   - An executor who "fixes" this by adding a request in `closeChart` breaks the pinned count of five.
   - **Fix:** rewrite the row as "`closeChart` sets `chartOpen` false, restores the input context and resets the loop". Move the redraw property to `08-12`'s frame-order test: a chart-open frame calls `redrawGate.request()`, so the first frame after closing draws.

3. **LOW (`08-04` Task 1 step 1 and the interfaces block): the context field list misses two closure-level `let`s.**
   - The list of 75 names omits `equipmentSetSource` and `equipmentSetCache` (`game-session.ts:576-577`).
   - The interfaces block says "77 closure-level lets 365-490", but 75 are in 356-490 and two are at 576-577.
   - The `! rg -q "^  let "` gate (baseline 77, confirmed) forces both to move. The plan's fallback ("if a let is missing, add it") covers this, so the risk is low.
   - **Fix:** name both, in the core group (or as a memo inside the station controller, which 08-08 says "keeps its caching"), and correct the anchor text.

4. **LOW (`08-04` Task 1): a local `ctx` shadows the new session `ctx`.**
   - `confirmFit` (`game-session.ts:769`) and the `onRefuel` callback (`:3232`) declare `const ctx = fitContext();` after reads of session fields in the same block (`stationScreen`, `equipmentCatalogue`, `profile`, `stationPending`).
   - After the rewrite to `ctx.station.*` and `ctx.core.*`, those reads refer to the block-scoped FitContext and hit the TDZ, so typecheck fails with TS2448/TS2339. The plan does not name the collision.
   - This is a forced rename inside a "verbatim" body.
   - **Fix:** tell the executor to rename the local (for example `fit`) and list it in the SUMMARY.

5. **LOW (`08-04` Task 2 step 2): the order wording is reversed relative to the source.**
   - The plan says the hook callback "keeps `redrawGate.request();` and the taint assignment in that order".
   - The source order is the taint first (`testTainted = true`, `:1039`) and then the request (`:1041`).
   - **Fix:** say "the taint assignment, then `redrawGate.request();`".

6. **LOW (`08-12` Task 1 acceptance, last bullet): the listener gate counts every mention of `uiController.signal`.**
   - The gate requires the count of `addEventListener(` to equal the count of `uiController\.signal` across the facade and the session modules.
   - Today both counts are 2 (`:2268-2271`, `:2289-2292`). Any doc comment, or any extra use of `uiController.signal` (for example passing it to a sub-panel), breaks the equality even though every listener is correct.
   - **Fix:** count `signal: (deps\.|ctx\.runtime\.)?uiController\.signal` and compare that with `addEventListener(`.

7. **LOW (`08-14` Task 2, the "manual-clock frame" row): the "no drainCommands" assertion is vacuous.**
   - At frame-loop level, `drainCommands` is called only by the sim driver (since 08-10) and by the paused or freeze branches. With a sim-driver double, a normal realtime frame records no `drainCommands` either.
   - The meaningful assertion is "no `advanceFrame`".
   - **Fix:** keep the `advanceFrame` and alpha-1 assertions and drop the `drainCommands` claim. Alternatively, drive the real sim driver in that row.

8. **Note (`08-08` Task 2 guard iii, no change needed):** the new `disposed` early return at the top of `queueSnapshot`'s `.then` skips `manualSavePending = false` and the committed counters after dispose. Today those still update (`game-session.ts:1168-1194`), and only `renderStation` is guarded. Nothing reads them after dispose (`probe.save` is deleted at `:3343`). The plan already records this as a deliberate deviation, which is correct.

---

## 08-01

**Summary:** The probe-shape pin and the session-source helper (step 0).

**Strengths:**
- Every scan baseline holds:
  - `readFileSync("src/app/game-session.ts"` occurs once in `redraw-gate.test.ts` (`:113`).
  - `"src", "app", "game-session.ts"` occurs twice in `economy-purity.test.ts` (`:312`, `:322`).
  - `case "docked":` occurs once (`:2321`).
  - `renderFrame(alpha, shouldDraw())` occurs once (`:2863`).
- The 21 optional `WegoliteProbe` keys in the audit gate match `src/app/probe.ts` exactly.
- Cutting the docked arm from the one file that holds the label is correct for the step-0 tree.

**Concerns:**
- LOW: the economy-purity scan of `sessionSource()` and the redraw-gate scan do not strip comments. A later module doc comment that mentions `performance.now`, `renderFrame(alpha, …)` or `generateMarket(` changes the verdict. This is pre-existing behaviour, but the split adds about ten new files.

**Suggestions:** Add one line to the executor brief of each split plan: "do not quote pinned literals in comments".

**Risk:** LOW.

## 08-02

**Summary:** Flight-hash pins, `RngState`, mix32, and the `createSeededRandom` delegation.

**Strengths:**
- The interfaces quote `createSeededRandom` exactly (`src/sim/math.ts:227-237`).
- `arrival.ts:73` is the only call outside `math.ts`, and `arrival.ts:15` has no parenthesis, so the gate prints one line.
- The "1,000 distinct" rows are guaranteed, not probabilistic: `mix32` is a bijection in each argument, and the composition of bijections in epoch, then id, then purpose is a bijection.
- `LAUNCH_DURATION = 2` (240 steps) and `"g0-s55"` (Leesti) are confirmed.

**Concerns:** None new.

**Risk:** LOW.

## 08-03

**Summary:** Determinism lint bans and the entity-id scope guard.

**Strengths:**
- The stated baselines hold, and no file in `src/sim` uses `globalThis`, `self`, `process`, timers, `for..in`, bare sort, `Date` or `Reflect` (rg confirms). The new bans therefore cannot fail on existing code.
- My count of the listed probes is 43, which meets the ≥ 42 floor.
- The real-tree floor of 50 is met: there are 90 `.ts` files outside `src/sim`, and none names `EntityId`.

**Concerns:** None new.

**Risk:** LOW.

## 08-04

**Summary:** Split steps 1 and 2 (context and probe publisher).

**Strengths:**
- The export baseline of 9 and the closure-level `let` baseline of 77 are confirmed.
- `updateProbe` publishes `spanY: 2 * chartCamera.spanX` (`:2427`) and `probe.test.tainted = testTainted` (`:2487`), so the publisher unit-test rows are satisfiable.
- `setSpeed(NaN)` returns before tainting (`probe.ts:407`).

**Concerns:** Findings 3 and 4 (LOW: missing `let`s, `ctx` shadowing) and finding 5 (LOW: reversed order wording).

**Suggestions:** As in those findings.

**Risk:** LOW.

## 08-05

**Summary:** The world core: ids, limits, store, world, serialize.

**Strengths:**
- `OOBehaviour.tbl` has 39 entries and `OOScanClass.tbl` has 16 (checked in the Oolite checkout).
- The limit redefinition gate has a clean baseline.
- The spawn rows agree with sanitize and the parser.

**Concerns:** None new.

**Risk:** LOW.

## 08-06

**Summary:** Split steps 3 and 4 (render driver, chart and settings controllers).

**Strengths:**
- The render-driver unit rows match the real gate semantics (`redraw-gate.ts` `next`/`drawn`/`request`).
- There are two `addEventListener` sites today, both at closure level, and they correctly stay in place.

**Concerns:**
- MEDIUM, finding 2: the `closeChart` redraw row is vacuous or impossible.
- LOW: the `focusLost` row ("pauses only when pauseOnFocusLoss is on") omits that `settings === undefined` also pauses (`:1527`). A test that leaves `settings` undefined will see a pause.

**Suggestions:** As in finding 2. Set `ctx.runtime.settings` explicitly in the `focusLost` row.

**Risk:** MEDIUM until reworded.

## 08-07

**Summary:** The `WorldView` and `ShipControl` seam.

**Strengths:**
- `mul` and `axisAngle` exist in `math.ts`.
- The renderer composes base and roll in that order (`src/render/bodies/station.ts:211-214`).
- Using three.js in tests has precedent (`tests/sim/aegis.test.ts`).

**Concerns:** None new.

**Risk:** LOW.

## 08-08

**Summary:** Split steps 5 and 6 (station and save controllers).

**Strengths:**
- The guard order in `autosave` (`:1208-1236`) is attempts, then contextLost, then canOverwrite, then tainted. This matches the truth.
- The post-read `disposed || !saveScreenOpen` check exists (`:1344`).
- The deviations are recorded.

**Concerns:**
- LOW: the "tainted" row needs a fake `saveStatus` for which `canOverwrite` is true. Otherwise the skip reason is the status reason, not "tainted".
- Finding 8 is a note only.

**Risk:** LOW.

## 08-09

**Summary:** The AI zone and the test pilot.

**Strengths:**
- `AI_THINK_INTERVAL 0.125` (`oolite/src/Core/AI.h:31`) × 120 = 15.
- The positive control `as const` arrays parse as `TSAsExpression` and escape the state-ban selectors as intended.
- The depth-3 glob `src/sim/ai/*/*/**/*.ts` matches depth 3 and deeper only.

**Concerns:** None new.

**Risk:** LOW.

## 08-10

**Summary:** Split steps 7 and 8 (hyperspace controller, router, sim driver, step-options).

**Strengths:**
- The 14 kinds and the four subscriber groups match the `handleEvent` arms (`:2294-2410`).
- The `pending.length = 0;` count of 4 is right (`:2738`, `:2749`, `:2773`, `:2859`).
- `stepFlight(` has one call site (`:2837`).
- The arrival failure path leaves profile, market, seed and target untouched (`:2105-2124`).

**Concerns:**
- Finding 1 originates here. Because `docked` ends up last in the stationFlow switch, any code placed after that switch falls into the economy-purity cut until the next `case` label. 08-10 itself is safe, since nothing market-related lives there yet.

**Suggestions:** Pin in 08-10 that the stationFlow switch is followed directly by a subscriber that has `case` labels, or note the constraint for 08-15.

**Risk:** LOW.

## 08-11

**Summary:** `stepWorld`, AI events, sanitize, and the reserved events.

**Strengths:**
- The sanitize table rows agree with the parser domain in every leaf I traced (magnitude, tolerance, enums, timers).
- The wake case arithmetic (T+2 → `nextThinkTick` T+17) is consistent with 08-09's re-arm rule.

**Concerns:** None new.

**Risk:** LOW.

## 08-12

**Summary:** Split step 9 (frame loop, start-session, facade).

**Strengths:**
- The frame-order assertions match `frame()` (`:2699-2864`): pause toggle, chart drain, save drain, freeze branches with `pending.length = 0`, station actions, sim, then render. The paused branch does render.
- After `dispose`, `swapSystem`'s second `renderFrame(0)` is already a no-op (`state = undefined`, `:3337`), so the guard is safe.

**Concerns:**
- LOW, finding 6: the `uiController.signal` count equality.

**Risk:** LOW.

## 08-13

**Summary:** The snapshot codec and the cadence test.

**Strengths:**
- The parser, sanitize and spawn domains are mutually consistent, including the acceptance of `nextId = 2**32` and the tolerance row.
- The cadence replay follows the tick-indexed precedent (`tests/sim/flight-cadence.test.ts:3-10`).

**Concerns:** None new.

**Risk:** LOW.

## 08-14

**Summary:** Test flags, the manual clock and `advanceTicks`.

**Strengths:**
- There is exactly one `new URLSearchParams` today (`:3185`).
- Moving the flag read earlier is behaviour-neutral, because `testHookEnabled` is otherwise read only in `loadFromSave` (`:1418`).
- Taint equivalence holds through `updateProbe`'s `probe.test.tainted = testTainted`.

**Concerns:**
- LOW, finding 7: the `drainCommands` assertion is vacuous.

**Risk:** LOW.

## 08-15

**Summary:** World lifecycle integration.

**Strengths:**
- The epoch sequence `[1,1,2,3,3]` and the reset-on-load semantics are internally consistent.
- `marketSeed` is always set at boot (`:3026`).

**Concerns:**
- MEDIUM, finding 1: placing the subscriber against the economy-purity docked-arm cut.

**Risk:** MEDIUM until the placement or spelling rule is added.

## 08-16

**Summary:** The deliberate probe commit and tick parity.

**Strengths:**
- The narrowed store gate is clean at HEAD.
- The flag inertness row matches the 08-14 table (`?clock=manual&traffic=0` gives `{false, false, true}`).
- The `advanceTicks` contract is consistent with 08-01.

**Concerns:** None new.

**Risk:** LOW.

---

## Overall Risk Assessment: LOW-MEDIUM

All 14 Round 4 items are resolved. Two new MEDIUM findings are targeted text edits:
- 08-15/08-10: the subscriber placement can trigger a false failure of a frozen scan.
- 08-06: the `closeChart` redraw test is vacuous or impossible.

Five LOW wording and gate-precision items remain. There are no wave, ownership or layering problems.

**Verdict: NEEDS REVISION** (minor: two text edits before 08-06 and 08-15 execute).
