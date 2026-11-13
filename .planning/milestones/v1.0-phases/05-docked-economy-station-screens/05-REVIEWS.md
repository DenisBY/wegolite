---
phase: 5
reviewers: [claude, opencode]
reviewed_at: 2026-11-05T22:11:00Z
plans_reviewed:
  - .planning/phases/05-docked-economy-station-screens/05-01-PLAN.md
  - .planning/phases/05-docked-economy-station-screens/05-02-PLAN.md
  - .planning/phases/05-docked-economy-station-screens/05-03-PLAN.md
  - .planning/phases/05-docked-economy-station-screens/05-04-PLAN.md
  - .planning/phases/05-docked-economy-station-screens/05-05-PLAN.md
  - .planning/phases/05-docked-economy-station-screens/05-06-PLAN.md
models:
  claude: "unknown"
  opencode: "unknown"
model_sources:
  claude: "unknown"
  opencode: "unknown"
plan_coverage:
  opencode:
    total: 6
    missing: ["05-01", "05-02", "05-03", "05-04", "05-05", "05-06"]
---

# Cross-AI Plan Review — Phase 5

<!-- gsd:plan-revision-conflicts:begin -->
<!-- gsd:plan-revision-conflicts:end -->

> Note: this pass supersedes the earlier five-reviewer `05-REVIEWS.md` (commit `dcedaa9`; recoverable via git). Only `claude` and `opencode` CLIs were installed. The `opencode` lane timed out (`spawn error: ETIMEDOUT`) and returned only progress narration, so it contributes no review.

## Claude Review

# Phase 5 Plan Review: Docked Economy & Station Screens

## How this was verified

- **Read at the current tree (`3bdefd1`):** `src/input/*`, `src/persistence/*`, `src/app/{game-session,probe,hints}.ts`, `src/ui/{controls,docked,title}.ts`, `src/main.ts`, `index.html`, the content schemas and generated data, the vendored `third_party/oolite/Config`, and the affected test specs.
- **Oolite checkout not read:** access to `/home/opencode/git/oolite` was denied in this session. Claims about `.m` and `.c` files rest on the excerpts quoted in `05-RESEARCH.md`. Findings that depend on them are marked **open question**.
- **Nothing was executed:** `docker compose run` and scratch-file writes both needed approval. Numeric results are hand-derived, and I did not recompute the market anchors. Browser-behaviour claims are marked **PLAUSIBLE**.

Plan 05-01's 39-file scope is not re-raised here, because the owner accepted it (PROJECT.md:109). D-17 and D-18 are locked, so I challenge only the claims made about them.

---

## 05-01

### Summary
The tracer delivers content fields, the pure economy buy path, the profile and save extension, input contexts, one station shell, and a keyboard buy → autosave → reload loop. The architecture is sound and it closes several real gaps. The biggest problems are one internal contradiction and an input race that matters at this project's measured frame rates.

### Strengths
- **Bubble-phase dispatch is correct.** Controls capture uses a `window` capture listener with `stopPropagation` (`src/ui/controls.ts:134-142`), and it would break if the game moved to capture.
- **`keyDown` return order is correct.** Returning `true` before the Shift filter preserves `tests/input/bindings.test.ts:220`.
- **The fixture fix is needed and sufficient.** `tests/fixtures/schemas/commodity-invalid.json` lacks peaks, and `failure-contract.test.ts:149,163` pins the first issue.
- **Shared `validateSaveSemantics` closes a real gap.** `isEncodedSaveValid` currently checks only size and schema (`src/persistence/save.ts:233-242`).
- **Name resolution matches the data.** The underscore keys exist at `descriptions.plist:2158-2160`, and `generate.ts` already has `descriptions` in scope at line 140.
- **The equal-peaks reasoning is correct.** Narcotics is the only 0/0 good (`trade-goods.plist:120-121`). Only economy 0 reaches the zero-distance case, so the synthetic economy-0 test is load-bearing.
- **The RANROT vector checks out.** I reproduced all three mix rounds and all four draws by hand: 0x2B34, 0x39F3, 0xB5DB, 0xD691.

### Concerns

**HIGH: input context changes are latched to the render frame, so keys get dropped or misrouted.**
- Step 7 calls `setContext` only when station actions are dispatched, which happens inside `frame()` (`game-session.ts:895-969`).
- Key events run between frames. After `Digit8`, the context stays `dockHome` until the next rAF.
- A following `ArrowRight` matches nothing and is lost. A following `Escape` resolves to pause (`DEFAULT_BINDINGS.pause`, `actions.ts:64`) rather than back.
- PROJECT.md:88 records roughly 369 ms loaded frames under SwiftShader, so 05-06's sequences such as `Digit3` then seven `Down`s will race. Each `Digit*` step needs a state-based wait, and no plan says so.
- A drain can also carry queued actions across a context change (`stationBack` then `stationRight`), and the plan does not revalidate per action.
- The launch guard is order-dependent too: station actions must run before commands are handed to `stepFlight`.

**HIGH: "preserve and compose `docked.ts`" cannot be followed as written.**
- `createDockedPanel` throws at construction unless `[data-field="dockcomp"]`, `dockcomp-message` and `button[data-action="buy-dockcomp"]` exist (`src/ui/docked.ts:68-72`).
- It also needs a static launch button, and `onLaunch` attaches a listener once (lines 71, 103-110).
- Step 6 replaces that markup and rebuilds the launch button with `replaceChildren`.
- The plan says `docked.ts` stays "exercised by the existing panel tests". Those tests do not exist: `rg createDockedPanel` finds only `src/main.ts:40,101`.
- Followed literally, this crashes boot. Improvised, it leaves two controllers, which PATTERNS forbids.

**MEDIUM: `TradePlan` has no field for side or key.**
- Step 7 says the kind-less guard means "`TradePlan` gains no field". Yet 05-02 reads `pending?.side`, 05-04 must render Buy or Sell plus the commodity name, and `probe.station.pending` needs `side` and `key`.
- The research interface has neither field. The type must be pinned here, or `StationPending` needs a `MarketPrompt` wrapper.

**MEDIUM: the capture listener ignores the existing browser-chord rule.**
- `keyboard.ts:198-206` promises that a Ctrl, Meta or Alt chord is never game input and its default is never prevented.
- The new listener exits only for `dataset.capture` and text targets, so it would block Ctrl+F5 hard reload.
- It should apply the same modifier guard. Shift+F5 needs a deliberate decision.

**MEDIUM: the disclaimer will cover the station footer.**
- `<footer>` is `position: fixed` and comes after `#docked` in the DOM (`index.html:311-321,434`). `#docked` is `absolute` with no z-index, so the disclaimer paints over the bottom of the screen.
- D-02's confirmation and key-hint line sits exactly there. `#pause` has `padding: … 4rem` at the bottom, while `#docked` has no such reservation.
- `toContainText` and `toBeVisible` will not notice the overlap. Fixing it with z-index would hide the FOUND-06 disclaimer instead.

**MEDIUM: regenerating the content golden fails lint.**
- `npm run lint` runs `prettier --check .` (`package.json:16`). `.prettierignore` exempts only `tests/golden/content/dock-port.json`.
- The current `commodities.json` golden keeps `classes` on one line, so a `node -e` `JSON.stringify` rewrite would fail Prettier.
- The plan needs a Prettier step after regeneration, plus a trailing newline.

**MEDIUM: the `pause`/`stationBack` Escape exemption is incomplete.**
- The exemption is specified only for `createBindingMap` sanitising.
- With context-aware `detectConflict`, a player who moves pause off Escape can never rebind it back, because `stationBack` shares `dockScreen`. The same applies in the other direction.
- `detectConflict` needs the same exemption.

**MEDIUM: one message element has four writers.**
- The launch hint (`game-session.ts:891`), confirmations, clamp notices and the async `Save failed…` notice all target `[data-field="message"]`.
- A clamp must show the notice and the confirmation together, yet no second line is defined.
- A late save failure can overwrite an open `[Y/N]`.

**LOW: the `docked Controls rebind … no pause` title contradicts the flow.** Controls is reachable only through the pause overlay (`docking.spec.ts:452-455`). The assertion must be "the captured key does not toggle pause", and `probe.paused` remains true throughout.

**LOW: the VALIDATION parse test is not assigned.** `src/content/commodities.ts` + parse test appears in Wave 0 but has no explicit task.

### Suggestions
1. Apply station actions synchronously in the keyboard callback, or update context in the input layer, and revalidate each drained action against live state. Add a same-frame `Digit8`+`ArrowRight` and `Digit8`+`Escape` test.
2. Choose one route for `docked.ts`: delete it and move its fields into `station.ts`, or reduce it to pure home rendering with no `requireField` on removed nodes.
3. Add a bottom-padding rule plus a bounding-box assertion that `.station-footer` and `body > footer` do not intersect.

### Risk Assessment
**HIGH**, for breadth combined with the keyboard race. The direction itself is right.

---

## 05-02

### Summary
This plan completes the sell path, exact pod capacity, clamps and overflow handling, and adds regression goldens with independent vectors. The capacity arithmetic is correct. The float32 oracle and the wording of the redock acceptance are not.

### Strengths
- **`maxAdditional` is correct.** I checked 20,499, 499, 899 and 19,000 by hand, and each lands exactly on the pod boundary.
- **Goldens are labelled honestly.** They are treated as regression snapshots rather than proof.
- **Vectors (a)–(d) and (f) hold up.** Narcotics coefficients are confirmed at 512, 32 and economic 0 (`commodities.json:159-164`), and the system ids are confirmed (`g0.json:1009,7731,18091`).
- **Sequential clamping and the overflow refusal** are well specified.
- **The fast-check dependency already exists** (`package.json:32`).

### Concerns

**HIGH: the Phase 6 hand-off does not cover the exploit it describes.**
- The accepted limitation is worded as reload → redock, and "Phase 6 market persistence closes it".
- No reload is needed. With D-17, launch → dock at one station rerolls the market, so a player can buy low, relaunch, redock and sell high.
- Phase 6's criterion 4 and SAVE-06 only preserve a market across a reload. If D-17 stands, launch → redock still rerolls after Phase 6.
- The project's own research says regeneration happens "on every jump" (`FEATURES.md:299`), which conflicts with D-17's stated justification. Confirming the upstream behaviour is an **open question** because the source was unreadable.
- I am not reopening the decision. The recorded acceptance is simply narrower than the behaviour, and no Phase 6 item closes it.

**MEDIUM: vector (e) does not prove what the plan claims.**
- The plan says it "fails if the `Math.fround` grouping is removed", and the ledger calls it a bias-rounding vector.
- Hand-derived results for each implementation variant:

| Implementation | Intermediate result | Output |
|---|---|---|
| Full float32 chain | ≈ 6.99999976, a tie that rounds to 7.0 | 7 |
| Float bias, then a double chain | 6.9999998 | 6 |
| No `fround` at all | `1 - 4/7` in double; `7b` ≥ 3 | 7 |
| Quotient not frounded | b ≈ 0.42857143, `econ` rounds to 3.0 | 7 |

- The vector catches only the second variant. Removing every `fround`, or dropping the quotient rounding, passes.
- That means the quotient rounding the plan set was revised to include has no effective test.

**LOW: the golden "header comment" is impossible.** JSON cannot hold a comment, and `JSON.parse` would fail. The acceptance grep passes only through `market.test.ts`.

**LOW: `zeroAmount` has no copy.** Stepping a pending sell down to 0 yields that refusal, but 05-04's notice list has no string for it. Stepping to zero should clear `pending` silently.

### Suggestions
1. Rewrite the T-05-15 acceptance to name launch → redock without reload, and add an explicit Phase 6 decision: stop regenerating on same-system docking, or accept the farm.
2. Choose vector inputs by enumeration so each of the four variants above produces a different truncated result, then derive the expected value by hand.

### Risk Assessment
**MEDIUM.** The money path is strong. The fidelity oracle and the recorded economic claim are the weak points.

---

## 05-03

### Summary
This is a clean pure rule module with a visible-set refusal, fail-closed conditions and truthful removal semantics. The catalogue claims hold, and the main issue is a second, diverging rule path.

### Strengths
- **Prices, TLs and conditions match `equipment.json`.** That covers 4000/1, 15000/9, 300/1, 200/1, 8250/5 and 1000/1.
- **The condition parser fits the data.** Flags are `"true"` strings and `requires_cargo_space` is the number `5` (`equipment.json:312`), so the fail-closed reader will not refuse real rows.
- **Check ordering handles the full-tank case.** `fullFuel` comes before the zero-cost price check.
- **The overrides are necessary.** The generated copy really does promise resale (`equipment.json:243`).
- **The 20 t and 35 t berth boundaries are correct.**

### Concerns

**MEDIUM: `canPurchase` and `purchase` become dead production code.**
- Their only callers are the Phase 4 paths that 05-01 removes (`game-session.ts:317,359,363`).
- CONTEXT and PROJECT.md:97 say Phase 5 reuses `canPurchase` unchanged. Instead, `checkFit` re-implements it with a different check order.
- T-04-43's tests would then guard a rule nothing ships. Either delegate from `checkFit` or delete the functions and record why.

**LOW: the Fuel row has no browser proof.** Nothing in Phase 5 lowers fuel, and `setFuel` from VALIDATION was dropped, so the row is never reachable in play or e2e. Unit coverage is the whole proof, and that should be stated.

**LOW: `Requires TL 9` reads wrongly beside F7.** A system displayed as TL 9 is raw 8, so it refuses an item whose reason says "Requires TL 9". The copy is locked, but this belongs in FIDELITY notes so a future fix does not touch the gate.

### Suggestions
1. Decide the `canPurchase` question inside this plan, and update the PROJECT.md row either way.

### Risk Assessment
**LOW.**

---

## 05-04

### Summary
These are pure view models with correct field shapes and truthful totals. Label keys and tokens match `labels.json`. The problems are in the verification gates.

### Strengths
- **Every template token is real:** `[population|multiply:0.1|precision:1]`, `[productivity]`, `[radius]`, `[techLevel]`, `[system]` (`labels.json:13,36-46`).
- **The Lave index lookups are correct:** economy 5 and government 3.
- **`Labels` is already on the type door** (`src/content/types.ts:22`).
- **Separate `confirmText` and `noticeText` are the right model.**
- **The one-pass replacer** avoids `$` interpretation.

### Concerns

**MEDIUM: an acceptance command cannot run.**
- Task 1's `rg -n "eval\(|…|replace\(.*[$][&0-9\x60'] src/ui/station-model.ts` opens a double quote and never closes it. Any shell rejects it, so the gate cannot pass as written.
- A gate edited in a hurry usually ends up vacuous.

**LOW: one gate cannot fail.** `String\.replace\(` in Task 3 will never match, because real code calls `text.replace(`.

**LOW: unknown-token test placement.** The acceptance puts a `StationModelError` case in `tests/content/labels.test.ts`, which then depends on the UI module. It belongs in `station-system-data.test.ts`.

### Suggestions
1. Fix the quoting, and match `\.replace\(` with a `$` replacement argument.

### Risk Assessment
**LOW.**

---

## 05-05

### Summary
This plan delivers the F3, F5 and F7 wiring, the two-state confirm, and non-focusable rows. Lave's expected rows follow correctly from the catalogue, and the keyboard start handles `#title-confirm`. The central no-reload proof probably cannot fail.

### Strengths
- **The expected Lave rows are right.** `Not enough credits`, `Requires TL 9`, `Pylons full`, 800 dc and 0 missiles all follow from the data.
- **Third-Y safety works.** Selection clamps to the disabled Passenger Berth row, so a third Y does nothing.
- **Probe fields ship with the task that asserts them,** which fixes an earlier ordering bug.
- **The `data-screen` choice keeps `scene.spec.ts:136-140` valid,** because the attribute is `home` at boot.

### Concerns

**HIGH (PLAUSIBLE, not run): the sentinel cannot detect a reload.**
- `page.keyboard.press` sends input through CDP to the renderer, and Chromium's browser-level accelerators are not normally triggered that way. F5 may therefore never reload, with or without `preventDefault`.
- If so, `window.__stationSentinel` passes even when the capture listener is deleted. The sentinel replaced a navigation count as the "real" proof, with the same weakness.
- Direct evidence is available: a test `window` bubble listener can record `event.defaultPrevented` for each key. It runs after the capture listener and fails if that listener is removed.
- Run one negative control with `preventDefault` disabled before trusting either form.

**MEDIUM: the disabled-state proof is lost.**
- 05-01 deletes the computed-style assertions from `docking.spec.ts:416-449`, which came from the G-04-2 gap (disabled controls looking enabled).
- F3 and F8 dimming is asserted only as model flags, so a missing CSS rule would pass everything.
- Add one computed-style check on a dimmed row.

**LOW: the home fuel figure stays constant.** `DOCKED_FUEL` is `"7.0 LY"` (`docked.ts:19`) while saves now carry `fuel`. Derive it from `profile.fuel`; `scene.spec.ts:129` still passes.

**LOW: grep gate depends on naming.** `probe\.economy\.(fuel|…)` assumes that exact spelling, but the existing pattern is a local object (`saveProbe.status`, `game-session.ts:385`).

### Suggestions
1. Replace the sentinel with the `defaultPrevented` assertion, and keep a reload check only as a secondary signal.

### Risk Assessment
**MEDIUM.** The feature wiring is low risk, but the proof of ECON-09's riskiest behaviour is weak.

---

## 05-06

### Summary
This plan delivers the reject table, writer parity, the failed-write path, the keyboard loop and the purity guard. Most of it is well aimed, and the failure-injection path works as described. The durability claim is narrower than what players experience.

### Strengths
- **The injected failure traces correctly.** `put` throws inside `work`, `runTransaction` aborts and rejects, `enqueue` reports the message, and `isStoreUnavailable` stays false (`idb-store.ts:179-188,135-146`).
- **The test does not overclaim.** The stock 15 → 16 assertion is honest evidence of regeneration, and the plan no longer claims reload is economically safe.
- **The loop arithmetic and row count hold.** The credits path ends at 762 dc, and seven `Down`s reach Remove Missile.
- **The guard's module-path resolution and `withProbeLock` use** are correct, and the ESLint gap is real (`eslint.config.js:88-109` covers ships, not equipment or the new loaders).

### Concerns

**MEDIUM: trades can be silently non-durable.**
- The `Save failed` notice is wired to the `queueAutosave` result only.
- `autosave()` returns early when `canOverwrite` is false (`game-session.ts:440-444`). That covers `future`, `unreadable` and `unavailable`, including private-mode IndexedDB.
- Those players trade with no warning and lose everything on reload. For them the notice matters most.

**MEDIUM: the legacy equipment alias adds risk for a case that cannot occur.**
- Phase 4 can only ever write `EQ_DOCK_COMP` (`game-session.ts:354-364`), and hook mutations are tainted and never saved.
- The alias exists for blobs no build produced, and it creates the read/write mode split.
- It also has an ordering bug. Capacity is validated before folding, so a forged blob with 20 t of cargo plus `EQ_PASSENGER_BERTH` passes `parseSave`. It then restores at capacity 15, and every later autosave returns `invalid-save`.
- Removing the alias removes both problems. Keeping it means validating capacity after normalisation.

**LOW: the allow-list accepts combat equipment.** `equipment` is the whole catalogue, so a forged `EQ_ECM` restores and is re-saved even though it is `notOffered`. It is inert in v1, but it will not be once combat ships.

**LOW: the behaviour and action blocks disagree.** One says KeyP inside F8; the key order does it from home. "Enter activates the focused button" may also open a panel rather than resume.

**LOW: a queued write can be dropped on `pagehide`.** Queued writes fall back to `disposed` (`idb-store.ts:140`), so an action right before closing may be lost. This is residual and worth noting.

### Suggestions
1. Show one persistent "Saves disabled" notice for any session where `canOverwrite` is false.
2. Delete the alias and treat those keys as `corrupt`, or validate after normalisation.

### Risk Assessment
**MEDIUM.**

---

## Cross-plan summary

| Priority | Issue | Plans |
|---|---|---|
| 1 | Frame-latched input context | 05-01, 05-05, 05-06 |
| 2 | `docked.ts` composition contradiction | 05-01 |
| 3 | Redock hand-off not closed by Phase 6 | 05-02, 05-06 |
| 4 | F-key sentinel likely vacuous (run a negative control) | 05-05, 05-06 |
| 5 | Float32 vector does not discriminate | 05-02 |
| 6 | Silent non-durable saves | 05-06 |
| 7 | Footer overlap | 05-01 |
| 8 | Lint and gate failures: golden formatting, unterminated `rg` | 05-01, 05-04 |

Dependency order and wave sequencing are sound, and all nine ECON requirements are covered. Items 1–4 should be resolved before execution starts. The rest can be fixed inside the owning plans.

**Open questions:**
- Does upstream Oolite regenerate the market on same-system docking? This needs the checkout, and it decides whether D-17's stated rationale holds.
- Does Playwright's F5 reload in this container? The negative control will settle that.
- Do the market anchors reproduce from the implementation? I did not recompute them.

---

## OpenCode Review

> [reviewed-without-source-citations] This reviewer declared source-grounded evidence but cited no file:line source evidence, so it reviewed the pasted plan text only — down-weight its verdict in the Consensus Summary.

I'll start by orienting myself in the repo, then verify the plans' claims against actual source with parallel exploration.
I'll verify the plans against the actual source. Let me first check the codebase-memory index and dispatch parallel verification agents while I run numeric checks myself.
Good — `fast-check` is already installed, so that concern is resolved. Now the remaining verification agents plus my own numeric checks.
Now let me verify the plan's most fragile numeric claims — the pinned RANROT vector, the independent reference vectors, and the Lave market anchors — by recomputing them from source.
The RANROT vector, seeds, and bias constant all check out. Now the Lave market anchors and 05-02's "independent reference vectors" — these are the highest-risk claims.


_Lane stderr: `[spawn error: ETIMEDOUT]` — no review content was produced._

---

## Consensus Summary

Only one lane produced a real review (Claude, source-grounded with file:line citations, no repo-execution, Oolite checkout unreadable in that session). The OpenCode lane timed out and carries the `[reviewed-without-source-citations]` marker, so there is no multi-reviewer consensus in this pass; the findings below are single-reviewer and should be weighed against the earlier five-reviewer review in git history.

### Agreed Strengths
- None (single usable reviewer). Claude's noted strengths: correct bubble-phase dispatch, `maxAdditional` pod-capacity arithmetic, equipment catalogue/TL/price claims, valid RANROT vector, correct failure-injection trace in 05-06.

### Agreed Concerns
- None by 2+ reviewers. Claude's highest-priority concerns:
  1. HIGH — input context changes latched to render frame (05-01/05-05/05-06): dropped/misrouted keys at ~369 ms SwiftShader frames.
  2. HIGH — "preserve and compose `docked.ts`" would throw at construction (`src/ui/docked.ts:68-72`) (05-01).
  3. HIGH — Phase 6 hand-off doesn't cover launch → redock market reroll exploit (05-02/05-06).
  4. HIGH (plausible) — F-key `__stationSentinel` can't detect reload via CDP key press; use `defaultPrevented` assertion + negative control (05-05).
  5. MEDIUM — float32 vector (e) doesn't discriminate `fround` variants (05-02); silent non-durable saves when `canOverwrite` false (05-06); legacy equipment alias ordering bug (05-06); footer overlap; Prettier failure on regenerated golden; unterminated `rg` gate (05-04).

### Divergent Views
- None observable. Open questions from Claude: does upstream Oolite regenerate markets on same-system docking; does Playwright F5 reload in the container; do market anchors reproduce.
