---
phase: 8
reviewers: [reviewer-architect-kimi-k3-1-pro, reviewer-correctness-glm-5-3, reviewer-algorithm-deepseek-v4-pro, reviewer-adversarial-grok-4-7, reviewer-context-gemini-4-argon, reviewer-triage-glm-5-3-flash]
reviewed_at: 2026-11-12T12:01:15Z
plans_reviewed: [08-01-PLAN.md, 08-02-PLAN.md, 08-03-PLAN.md, 08-04-PLAN.md, 08-05-PLAN.md, 08-06-PLAN.md, 08-07-PLAN.md, 08-08-PLAN.md, 08-09-PLAN.md, 08-10-PLAN.md, 08-11-PLAN.md, 08-12-PLAN.md, 08-13-PLAN.md, 08-14-PLAN.md, 08-15-PLAN.md, 08-16-PLAN.md]
models:
  reviewer-architect-kimi-k3-1-pro: "opencode-go/kimi-k3.1-pro"
  reviewer-correctness-glm-5-3: "opencode-go/glm-5.3"
  reviewer-algorithm-deepseek-v4-pro: "opencode-go/deepseek-v4-pro"
  reviewer-adversarial-grok-4-7: "opencode-go/grok-4.7"
  reviewer-context-gemini-4-argon: "opencode-go/gemini-4-argon"
  reviewer-triage-glm-5-3-flash: "opencode-go/glm-5.3-flash"
model_sources:
  reviewer-architect-kimi-k3-1-pro: "config"
  reviewer-correctness-glm-5-3: "config"
  reviewer-algorithm-deepseek-v4-pro: "config"
  reviewer-adversarial-grok-4-7: "config"
  reviewer-context-gemini-4-argon: "config"
  reviewer-triage-glm-5-3-flash: "config"
skipped_reviewers:
  claude: "Skipped per user instruction (Claude models rate-limited for 2 hours)"
---

# Cross-AI Plan Review — Phase 8 (Round 3)

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts
<!-- gsd:plan-revision-conflicts:end -->

## Architecture Review (reviewer-architect-kimi-k3-1-pro)

### Summary

Commit `45c689b` resolves most Round 2 architectural findings: the probe comparator is strict, warm and cold restores now share an epoch anchor, router fan-out is explicit, RNG entry points are bounded, `world.rng` participates in empty-world identity, and the wave graph remains acyclic with disjoint same-wave ownership.

**Overall result: NEEDS REVISION.** One foundational contract remains inconsistent: `sanitizeEntity`, `spawnEntity`, and `parseWorldSnapshot` still do not admit the same state domain, so the promised sanitizer-to-snapshot property is false. There is also a mandatory save assertion using the wrong API and an unsound optional hook dependency. No new circular dependencies or wave-boundary violations were found.

This was a read-only plan/source review; no Docker test gate was run.

### Round 2 Resolution Verification

| Round 2 area | Verdict | Evidence |
|---|---|---|
| `compareProbeShapes` empty-array wildcard | **Resolved** | `08-01-PLAN.md:28,132-136` requires empty-to-empty equality, reports empty/non-empty drift in both directions, and starts the path-specific exception list empty. |
| Warm `Load` versus cold `Continue` epoch parity | **Resolved functionally** | `08-15-PLAN.md:127,171,202-207`. A cold Continue creates a fresh lifecycle at epoch 0; warm Load calls `resetForRestore(0)` before `resume`. Tests cover subsequent launch/arrival, seed, epoch, and `nextId`. The prose saying cold boot explicitly calls reset is loosely worded, but fresh construction is equivalent in Phase 8. |
| `sanitizeEntity` / `parseWorldSnapshot` alignment | **Not fully resolved — Blocker 1 below** | Numeric coverage was substantially expanded in `08-11-PLAN.md:161-170` and `08-13-PLAN.md:133-140`, but valid domains still disagree for counters, strings, arrays, and some spawn fields. |
| Router ownership and `[stationFlow, worldLifecycle]` fan-out | **Resolved** | `08-10-PLAN.md:155-161` passes `ctx` and introduces an ordered tuple table. `08-15-PLAN.md:130-131` defines exactly 12 single-subscriber kinds plus the two ordered pairs and requires full side-effect ordering logs. `08-12` does not disturb that contract. |
| Shared mutable `SessionState` facets | **Disposition recorded** | `08-04-PLAN.md:240` explicitly rejects per-controller facets under D-12 rather than silently ignoring the suggestion. |
| `worldSeedFor` / `forkSeed` bounds | **Resolved** | `08-02-PLAN.md:197` documents caller guards; `08-05-PLAN.md:136` refuses invalid/exhausted `nextId`; `08-15-PLAN.md:127,165` makes `begin` total at the epoch boundary. |
| `isNeverSpawned` and `world.rng` | **Resolved** | `08-05-PLAN.md:33,137-139,182` includes the initial-stream check in the single predicate, serializes a drawn stream even without an entity, and tests that boundary. Snapshot encoding is a plain uint32 in `08-13-PLAN.md:23,107,139`. |
| Non-dead entity cap | **Resolved** | `08-05-PLAN.md:136,180,186` consistently uses `!e.dead`, including killed-but-uncommitted replacement spawns. |
| Recursive AI zone and registry/static immutability | **Resolved** | `08-09-PLAN.md:181-189` covers deeper nesting and export bridges; registry freezing is at `08-09-PLAN.md:119,150`; static freezing is at `08-05-PLAN.md:137,183`. |
| Async disposal and frame-loop lifecycle | **Resolved** | Save continuations are guarded in `08-08-PLAN.md:142-149`; swap RAF teardown is covered in `08-12-PLAN.md:117,160-161`; `advanceTicks` refuses disposed sessions in `08-14-PLAN.md:122,154`; lifecycle end is included in `08-15-PLAN.md:163,171`. |
| Lazy `WorldView`, pending freezes, diagnostics | **Resolved** | Lazy construction is the default in `08-11-PLAN.md:33,126`; all four pending-clear sites are pinned in `08-10-PLAN.md:156-159` and `08-12-PLAN.md:120,159`; player-first divergence reporting is in `08-13-PLAN.md:108`. |
| Browser launch handshake and jump lifecycle | **Resolved within the declared scope** | `08-16-PLAN.md:161-164` adds the frame wait and a Vitest jump case, while explicitly deferring full populated browser jump parity to Phase 12. The stale assumption at `08-16-PLAN.md:190` should be read against that newer text. |
| Dependencies and module layering | **Resolved** | `08-05` now depends on `08-03`; `08-15` now depends on `08-13`. The DAG remains linear within each track and acyclic across tracks, with no same-wave `files_modified` collisions. |
| Conditional-populator parity | **Explicitly deferred** | `08-15-PLAN.md:302` assigns real traffic-on/off reservation semantics to Phase 12, which owns the real populator. |

### Plan-by-Plan Assessment (08-01 through 08-16)

| Plan | Assessment | Architectural result |
|---|---|---|
| **08-01** | Empty-array drift is now detected bidirectionally; optional and volatile exceptions require evidence. Session-source scans remain order-independent. | **Ready** |
| **08-02** | Seed arithmetic is pinned before delegation, draw count is corrected to eight, and fixed-step callers are assigned explicit range guards. | **Ready** |
| **08-03** | Probe naming/cleanup and parallel-scan behavior are aligned; reflection, alias, timer, and Frame-scan gaps are addressed without weakening positive controls. | **Ready** |
| **08-04** | Shared `SessionState` remains a deliberate mechanical-extraction carrier. `withdrawProbe` gives later probe teardown one owner, and coverage inspection is assigned. | **Ready** |
| **08-05** | Id, cap, stream, and static-table contracts are much stronger, but `spawnEntity` does not enforce the complete snapshot domain, including string lengths and all id/counter bounds. | **Revision required with Blocker 1** |
| **08-06** | Listener registration stays out of Node-instantiated controller factories; render identity and redraw behavior remain live-read based. | **Ready** |
| **08-07** | The copied-view/actor-control boundary remains narrow, with no new coupling introduced by Round 2. | **Ready** |
| **08-08** | DOM access and all three asynchronous save continuations have explicit Node/disposal handling; the boot/load ordering remains characterized. | **Ready** |
| **08-09** | Recursive import enforcement, sealed re-export paths, frozen registry entries, and wake-before-think coverage close the identified AI seam gaps. | **Ready** |
| **08-10** | Router `ctx` wiring supports the later integration without facade edits. The tuple table and freeze-drain preservation align with `08-12` and `08-15`. | **Ready** |
| **08-11** | Lazy views and broader numeric repairs are correct directions, but the sanitizer still claims a total parser-compatible output domain it does not establish. | **Revision required — Blocker 1** |
| **08-12** | Frame phase order, four pending-clear sites, swap cancellation, listener ownership, and idempotent teardown are consistent with earlier and later plans. | **Ready** |
| **08-13** | Parser hardening and deep-copy proofs are strong, but the strict parser exposes remaining domain mismatches rather than forming a total contract with `08-05`/`08-11`. | **Revision required — Blocker 1** |
| **08-14** | Manual stepping reuses the realtime drain, refuses disposed sessions before taint/drain, and covers both pause and chart early stops. | **Ready** |
| **08-15** | Epoch and router findings are resolved, but the mandatory anchored-save assertion calls `snapshotForSave` with an already-built `SaveInputs`, contrary to its actual signature. | **Revision required — Issue 2** |
| **08-16** | Live probe reads, immutability, launch draining, and jump-lifecycle coverage are aligned. The optional `sim` parameter conflicts with required `worldHash` on the returned hook type. | **Ready with warning — Issue 3** |

### Strengths

- The nine-wave dependency graph is acyclic, and same-wave app/core file ownership remains disjoint.
- `FlightState` remains the player authority; static entities reference `SystemLayout`; dynamic state stays in `World`. No new Three.js or DOM dependency enters `src/sim`.
- Launch, docking, arrival, restore, and disposal now have a coherent lifecycle with explicit failure behavior and per-world id resets.
- Routing is declarative and ordered, with tests of actual side-effect completion rather than only subscriber counts.
- RNG state, entity ordering, world-stream identity, and snapshot encoding form a substantially stronger determinism foundation.
- Probe, frame-order, save-order, disposal, and AI-zone tests target cross-file behavior rather than isolated module shape.

### Issues Found

#### 1. **BLOCKER — Sanitized/spawned state is still not guaranteed to satisfy the snapshot parser**

- **Plans/Tasks:** `08-05` Task 1; `08-11` Task 2; `08-13` Tasks 1–2.
- **References:** `08-05-PLAN.md:137`; `08-11-PLAN.md:32,161-170`; `08-13-PLAN.md:26,107,133,140`.
- **Description:** The revised sanitizer covers many numeric leaves, but its output domain is not the parser's input domain:
  - `repairs` accepts any non-negative safe integer in `08-11:169`, including values above the parser's `1e12` scalar cap in `08-13:26`. A repair at `Number.MAX_SAFE_INTEGER` can also increment into an unsafe integer.
  - `specKey`, AI parameter keys/strings, and parameter arrays have parser length caps in `08-13:107,133`, but neither `spawnEntity` nor `sanitizeEntity` enforces or repairs those domains.
  - `spawnEntity` checks `ownerId` and `tick` only for safe/non-negative values in `08-05:137`, whereas the sanitizer applies a uint32 upper bound in `08-11:166`. Thus spawn, subsequent sanitization, and restoration do not share one invariant.
- **Concrete failure:** Spawn an otherwise valid entity with a 129-character `specKey`, or set `entity.repairs = 1e13`, or install a 65-element AI parameter array. `sanitizeEntity` returns without repairing the value. `snapshotWorld` emits it, but `parseWorldSnapshot` rejects it. This directly falsifies “every sanitized world snapshots to JSON that `parseWorldSnapshot` accepts” and leaves the declared arbitrary-numeric property without a valid implementation for the `repairs` example.
- **Minimal direction:** Define one field-complete serialized-domain table covering numeric bounds **and** string/array limits for every entity and world-level field. Use it to drive spawn validation, sanitizer behavior, parser validation, and property generation. Add directed cases for `repairs = 1e13`, repair-counter overflow, over-uint32 spawn ids/ticks, long `specKey`/param strings, and oversized param arrays. If some fields are intentionally non-repairable, reject them at their mutation/spawn boundary instead of claiming total sanitizer-to-parser compatibility.

#### 2. **HIGH — The anchored-save test calls `snapshotForSave` with the wrong input**

- **Plan/Task:** `08-15`, Task 3, anchored-save describe and corresponding truth.
- **References:** `08-15-PLAN.md:35,206`; actual signature at `src/persistence/autosave.ts:66-74`; existing builder at `src/app/game-session.ts:1131-1152`.
- **Description:** `buildSnapshotInputs()` already returns `SaveInputs`. The plan then specifies `Object.keys(snapshotForSave(inputs))` and `JSON.stringify(snapshotForSave(inputs))`. The real `snapshotForSave` requires `(state, profile, system, station, market, commodities, targetSystemId?)`, not one `SaveInputs` argument.
- **Concrete failure:** Implemented literally, the mandatory test does not typecheck. Forced through a cast, it reads `profile.cargo` from an undefined second argument and fails instead of proving save isolation. An executor may silently substitute a different assertion and lose the intended top-level-key check.
- **Minimal direction:** Assert `Object.keys(inputs).sort()` against the exact v2 allow-list and use `JSON.stringify(inputs)` for the backstop scan. Keep `buildSnapshotInputs` unchanged and retain the deep-equality check with and without a live world.

#### 3. **WARNING — Optional `sim` contradicts required `WegoliteTestHook.worldHash`**

- **Plan/Task:** `08-16`, Task 1 step 1.
- **References:** `08-16-PLAN.md:125`; existing factory construction at `src/app/probe.ts:390-460`.
- **Description:** The plan makes `createTestHook`’s fifth `sim` argument optional while making `worldHash` required on `WegoliteTestHook`. It only supplies that method from `sim`.
- **Concrete failure:** A caller omitting `sim` receives an object statically typed as having `worldHash`, but no such function exists at runtime. Implementing the planned object literally also creates a TypeScript construction problem unless the executor adds a cast or changes the interface.
- **Minimal direction:** Since every `?test=1` hook is required to expose `worldHash`, make `sim` required and update all factory call sites. Alternatively, split the legacy and sim-aware return types; do not leave a required method backed by an optional dependency.

### Recommendations

1. Resolve the shared state-domain contract before executing `08-05`, `08-11`, or `08-13`; otherwise their central sanitizer/snapshot proof is not implementable as specified.
2. Correct the `08-15` anchored-save assertions to operate directly on `SaveInputs`, preserving the intended no-world-fields guarantee.
3. Make the sim-aware hook dependency and return type consistent in `08-16`, preferring a required `sim` argument over an unsound cast.
4. After these plan edits, run the prescribed Docker gates at the owning plan boundaries; host results should not be treated as evidence.

### Overall Assessment

**NEEDS REVISION.** Round 2’s epoch, router, RNG-bound, world-stream, lifecycle, probe, and dependency findings are substantively addressed. The remaining blocker is architectural rather than cosmetic: three modules that are supposed to share one serialized-state invariant still define different valid domains. Once that contract and the two smaller API/test inconsistencies are corrected, the plan set should be structurally ready for execution.

---

## Behavioral Correctness Review (reviewer-correctness-glm-5-3)

### Summary

Commit `45c689b` genuinely incorporates every Round 2 behavioral-correctness finding verified in this review. All six focus items are resolved in executable plan text — not just disposition-ledger prose — and each was re-verified against the updated tasks, behaviors, acceptance gates, and the live source anchors they cite. The two Round 2 BLOCKER-class findings that touched neighboring areas (empty-array probe wildcard in `08-01`; warm-Load/cold-Continue epoch divergence in `08-15`) plus the sanitize/parser numeric-domain BLOCKER (`08-05`/`08-11`/`08-13`) are all translated into code contracts with named tests. I found **no BLOCKER and no HIGH**. I found four WARNINGs — all of them precision gaps in *test specification* around the newly hardened contracts (a vacuous-property risk in `08-13`'s fast-check, two residual sanitize↔parse alignment edges, and one untested guard in `08-05`) — and four INFOs. Each is a one-to-three-sentence plan edit.

### Round 2 Resolution Verification

| # | Round 2 finding | Verdict | Evidence at `45c689b` |
|---|---|---|---|
| 1 | `compareProbeShapes` empty-array wildcard blinds the FOUND-10 freeze (`08-01`, adversarial BLOCKER; L162 suggestion on optional-key audit) | **RESOLVED** | `08-01` Task 1 steps 1–2, must_haves, threat `T-08-40`: wildcard removed ("empty `"[]"` matches only an empty `"[]"` set"), both-direction unit cases (`[]` vs `["a"]` and reverse), `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS = []` allow-list with per-entry reason and mandatory SUMMARY listing with `--repeat-each=3` failure output. Acceptance gates `rg -c "PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS"` in both helper and unit test. The jammed two-criteria line in the old acceptance block was also correctly split. |
| 2 | `withSimProbe` `__purity_` prefix + SPDX header; `tests/sim/rng.test.ts` / `sim-purity.test.ts` parallel-walk races (`08-03`, `08-02`, `08-09`; context/adversarial WARNING) | **RESOLVED** | `08-03` Task 1 step 2: basename normalization to `__purity_` + two-line SPDX prepend (verified `tests/compliance.test.ts:74` skips exactly `entry.name.startsWith("__purity_")`); step 3: `listTsFiles` skips `__purity_*` and tolerates transient `ENOENT`, block-comment stripping and brace-matched `*Frame*` scan with unit tests; Task 2 adds `Reflect.get`, `sort.call/apply/bind`, `queueMicrotask`, `self` bans + probes (23→27 probe count arithmetic checks out). `08-02` Task 3 step 3: the `src/sim` recursive scan skips `__purity_` entries and ignores `ENOENT`. `08-09` probes all use `__purity_` names. |
| 3 | Unguarded `document`/`window` in Node Vitest (`08-06`, `08-08`, `08-10`, `08-12`, `08-15`; context WARNING) | **RESOLVED** | Verified in source that the four unguarded sites exist: `syncHeaderCredits` (`game-session.ts:862`, `document.querySelector`), `closeSaveScreen` (`:1906`, `document.getElementById("station-screen")`), `syncStatusOverlay` (`:2161`, `document.getElementById("status")`), and the two construction-time `window.addEventListener("keydown", …, { capture: true, signal })` at `:2268`/`:2289`. Guards specified: `08-08` Task 1 step 1 (syncHeaderCredits) and Task 2 step 1 (closeSaveScreen), `08-10` Task 1 step 1 (syncStatusOverlay, needed for `08-15`'s Node `handleHyperspaceJumped` test), `08-06` Task 2 step 2 (factories register nothing; registrations stay in `game-session.ts` until `08-12`), `08-12` Task 1 step 2 (both registrations + `onLaunchKeyDown` move into `start-session.ts` behind `typeof window !== "undefined"`). Verified `vitest.config.ts:74` is `environment: "node"`. One timing nuance remains (INFO-2). |
| 4 | Event-router 14-kind mapping vs `[stationFlow, worldLifecycle]` fan-out; `ctx` wiring; `08-15` `files_modified` mismatch (`08-10`, `08-12`, `08-15`; architect WARNING/HIGH, context WARNING) | **RESOLVED** | `08-10` Task 2 step 2: `createEventRouter(ctx, subscribers)` takes `ctx` now; `EVENT_KIND_SUBSCRIBER` becomes a declarative kind→ordered-subscriber-tuple map, all 14 kinds at length 1; the previously contradictory "exactly one subscriber" assertion was rewritten table-driven ("recorded handling subscriber list equals `EVENT_KIND_SUBSCRIBER[kind]`"). `08-15` Task 1 step 4 wires the `worldLifecycle` subscriber *inside* `event-router.ts` via `ctx.core.worldLifecycle` — and `src/app/session/event-router.ts` **is** in `08-15`'s `files_modified` (with `start-session.ts`, `hyperspace-controller.ts`, `save-controller.ts`, `sim-driver.ts`, `context.ts`), so `game-session.ts` need not change. Task 1 step 5 asserts 12 kinds × length 1 + the exact ordered pair for `launched`/`docked` with full side-effect ordering logs proving `stationFlow` completes before `worldLifecycle`. |
| 5 | `sanitizeEntity`/`parseWorldSnapshot` numeric parity; warm-Load vs cold-Continue epoch parity (`resetForLoad`); `isNeverSpawned` `world.rng.s === seed` (`08-05`, `08-11`, `08-13`, `08-15`) | **RESOLVED, with residuals (W1–W4 below)** | **Sanitize/parser:** `08-11` Task 2 `<behavior>` rows 1–8 are field-complete over numeric leaves (quaternion `!Number.isFinite(normSq) \|\| !(normSq > 0)` matching `src/sim/flight/sanitize.ts:57-59`, negative/`>1e12` speeds, `radius`, `ownerId`/`spawnTick`/`targetId`, rng states, `repairs`, `ai.params` numbers and arrays), `08-05` step 5 validates constructor fields at spawn, `08-13` hardens the parser (safe-integer `nextId` in `101..0xffffffff`, `1e12` magnitude cap, string/array length caps, unknown keys, `__proto__`/`constructor`/`prototype` everywhere, no nested param objects), deep-copies in `restoreWorld` with a post-restore mutation test, and extends the fast-check to all numeric leaves. **Epoch parity:** `08-15` adds `resetForRestore(epoch = 0)` (clamped to `[0, 0xffffffff]`), called inside `loadFromSave`'s synchronous install block before `resume(nextSeed)`; `end()` preserves epoch for normal dock→launch while Load resets; the mandatory Node test drives warm-Load-at-epoch-2 vs a fresh `createWorldLifecycle` cold stand-in through both a subsequent arrival and a subsequent launch, asserting identical epoch/worldSeed/nextId; failed parse touches nothing; the Phase 11 `resetForRestore(save.epoch)` hand-off is recorded in the doc comment, must_haves, and the PROJECT.md row. **`isNeverSpawned`:** now `nextId === 101 && live.length === 0 && world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world")`, with a flip test (drawing `world.rng` emits `worldSeed=`/`nextId=`/`rng=` and breaks hashFlight identity) and a restored never-spawned world staying never-spawned under the predicate. |
| 6 | `probe.sim` guard when `currentState === undefined` (`08-16`; context SUGGESTION) | **RESOLVED** | `08-16` Task 1 step 2: `probe.sim` published **inside** `if (currentState !== undefined)`, `delete probe.sim` when undefined and in `withdrawProbe()` (centralised in `08-04`), `\| sim \|` audit row (state-determined; absent in `menu`), `startNewGame(page)` called before reading `probe.sim` in tick-hook case (c), plus the probe-immutability tests and the `rg "world/store" src/app` gate (threat `T-08-46`). |

### Plan-by-Plan Assessment (08-01 through 08-16)

| Plan | Wave | Round 2 items addressed | New findings this round | Status |
|------|------|------------------------|------------------------|--------|
| **08-01** | 1 | R2-01 (BLOCKER, empty-array wildcard), R2-02 (optional-key audit evidence) | none | **READY** |
| **08-02** | 1 | R2-01 (`__purity_` scan skip), R2-02 (RangeError doc + fixed-step caller guards), R2-03 (eight draws — verified against `arrival.ts:72-104`, exactly 8: radial, w, x, y, z, tiltX, tiltY, tiltZ; frozen-baseline note) | none | **READY** |
| **08-03** | 1 | R2-01 (prefix+SPDX), R2-02 (Reflect.get / sort.call / queueMicrotask / `self` bans, block comments, brace-matched Frame scan) | none | **READY** |
| **08-04** | 2 | R2-01 (coverage-threshold check), R2-02 (`withdrawProbe`); R2-03 (Pick-facet) rejected per locked D-12 with the rationale recorded | INFO-2 (withdrawProbe wiring ownership ambiguity) | **READY** |
| **08-05** | 2 | R2-01 (spawn validation, BLOCKER), R2-02 (`isNeverSpawned` rng check, serializeWorldSection prose, non-dead cap, plain-uint32 `rng`), R2-03 (`nextId ≤ 0xffffffff` guard), R2-04 (freeze, store-internal doc, `depends_on: ["08-02","08-03"]`) | W4 (allocate's uint32 refusal untested; property bound is a fast-check artifact) | **READY** (with W4) |
| **08-06** | 3 | R2-01 (no listener registration in factories; `onLaunchKeyDown` named) | INFO-2 (registration timing) | **READY** |
| **08-07** | 3 | none required (all six reviewers); algorithm's forward-looking scan note rejected for Phase 8 with reason | none | **READY** |
| **08-08** | 4 | R2-01 (`typeof document` guards), R2-02 (post-`await` `disposed` short-circuits in `loadFromSave`, `clearSaveForNewGame`, `queueSnapshot`, with Node test (e)) | none | **READY** |
| **08-09** | 4 | R2-01 (recursive AI-zone globs + depth-3 catch-all + nested probes + export-surface seal), R2-02 (`Object.freeze(AI_REGISTRY)`/`TEST_PILOT`), R2-03 (wake-before-think test) | none | **READY** |
| **08-10** | 5 | R2-01 (ctx-first router + `EVENT_KIND_SUBSCRIBER`, HIGH), R2-02 (`syncStatusOverlay` guard), R2-03 (`pending.length = 0` 4-site source check) | INFO-3 (stale line anchors `:2744/:2755/:2852`; actual `2738/2749/2859` — structural claim verified) | **READY** |
| **08-11** | 5 | R2-01 (field-complete sanitizeEntity, BLOCKER), R2-02 (lazy `createWorldView` as default), R2-03 (wake-earlier-than-think `stepWorld` case) | W2 (string-leaf parity overclaim) | **READY** (with W2) |
| **08-12** | 6 | R2-01 (`pending` freeze-branch tests + audit row), R2-02 (`onLaunchKeyDown` + registrations in `start-session.ts`), R2-03 (`swapSystem` rAF tracking + disposed guard; timer gate) | INFO-2 (registration timing) | **READY** |
| **08-13** | 6 | R2-01 (fast-check over all numeric leaves, BLOCKER), R2-02 (parser hardening + deep copy), R2-03 (plain-uint32 `rng` + player-first mismatch reporter) | W1 (vacuous-property risk), W3 (quaternion tolerance unpinned), INFO-1 ("slices" ambiguity) | **READY** (with W1/W3) |
| **08-14** | 7 | R2-01 (`disposed` checked first, before taint and drain), R2-02 (chart-open early-stop variant) | none | **READY** |
| **08-15** | 8 | R2-01 (`resetForRestore(0)` warm/cold equivalence, BLOCKER), R2-02 (router fan-out wiring, HIGH), R2-03 (`begin` epoch-overflow guard, HIGH), R2-04 (dispose `end()` idempotence, save key allow-list, `depends_on: ["08-14","08-11","08-13"]`); R2-05 (non-vacuous populator parity) honestly deferred to Phase 12 | none | **READY** |
| **08-16** | 9 | R2-01 (`probe.sim` guard + `withdrawProbe` + audit row + `startNewGame`), R2-02 (probe immutability, store-import gate, setSpeed-still-taints), R2-03 (frame-wait handshake, Vitest jump-parity case, PROJECT.md deferral of full browser jump parity, tick-script supersedes recorded-flights note) | INFO-4 (entity-count mechanism touches `store.live` indirectly) | **READY** |

### Strengths

- **The three Round 2 blockers are fixed at the contract level, not the prose level.** The empty-array rule is now an explicit allow-list defaulting to empty with mandatory failure evidence; `resetForRestore` is a real lifecycle operation with warm-vs-cold equivalence tests through both a subsequent arrival and a subsequent launch; sanitize/parser agreement is a field table (8 rows) plus an all-numeric-leaves property, spawn-time validation, and a hardened parser — each with named tests.
- **The `isNeverSpawned` extension is self-consistent end to end.** The predicate uses the world's own `worldSeed` (so restored never-spawned worlds stay never-spawned), the flip test pins the draw-without-spawn case, and `serializeWorldSection`'s previously self-contradictory sentence is now split into two unambiguous statements with the plain-uint32 `rng` encoding pinned on both the hash and codec sides (`snapshot.rng === world.rng.s` asserted).
- **The epoch design's boundary arithmetic is correct.** `begin` refuses at `epoch === 0xffffffff` (so used epochs are always `≤ 0xffffffff`, inside `worldSeedFor`'s domain); `resume` accepts `≤ 0xffffffff`; `resetForRestore` clamps invalid inputs to 0; the overflow test uses `resetForRestore(0xffffffff)` to reach the boundary legally. `end()` preserving epoch vs `resetForRestore(0)` resetting it separates "normal dock→launch keeps advancing" from "Load re-anchors".
- **The router redesign eliminates the Round 2 contradiction by construction**: making the assertion table-driven in `08-10` means `08-15`'s fan-out update cannot break it, and passing `ctx` in `08-10` means `08-15` never touches `game-session.ts`.
- **Cross-plan consistency held under the edits**: `08-09`'s new export-surface seal matches `08-07`'s type-only `view.ts`/`control.ts` design; `08-05`'s spawn validation, `08-11`'s sanitize rows, and `08-13`'s parser caps agree numerically (`1e12` magnitude, positive radius, non-negative speeds, uint32 streams); the `pending.length = 0` audit partitions the four live sites across `frame-loop.ts` and `sim-driver.ts`; `08-16`'s jump-parity case uses verified identifiers (`g0-s55`, `beginHyperspace`).

### Issues Found

**BLOCKER** — none.

**HIGH** — none.

**WARNING**

1. **`08-13-PLAN.md:140` — the fast-check property's injection mechanism is unspecified, and the spawn validation added in this same commit makes the naive implementation vacuous.** The property "builds a world with arbitrary entities whose every numeric leaf — … `radius` (including `0`, negative, `NaN`, `Infinity`), `ownerId`, `spawnTick`, … — is drawn from arbitrary `fc.double()` values". But `08-05` step 5 now makes `spawnEntity` **refuse** those values (non-finite/≤0/>1e12 radius, invalid tick/ownerId, non-finite pose) without allocating. An executor who builds entities through `spawnEntity` with the generated values gets refused spawns, an empty world, `hashWorld === hashFlight`, a trivial round trip — 200 green runs proving nothing. **Fix:** specify that entities are spawned with valid constructor fields and the arbitrary values are then assigned directly to the mutable fields (only `id`/`kind` are readonly in `Entity`), matching `08-11`'s "injected into an entity mid-run" language; state it for both the property and the converse unsanitized-NaN refusal check.

2. **`08-11-PLAN.md:32` / `08-13-PLAN.md:26,107` — sanitize↔parse parity is numeric-complete but not string-complete, and the must_have overclaims.** The truth says "every sanitized world snapshots to JSON that `parseWorldSnapshot` accepts", but the hardened parser also rejects `specKey`/param strings over 128 chars and param arrays over 64 elements, while neither `spawnEntity` validation (radius/tick/ownerId/pose only) nor `sanitizeEntity` (rows 1–8, numeric only) bounds any string leaf. **Fix:** either validate `specKey`/param-string length at spawn and repair in sanitize, or scope the claim to numeric leaves and record the string-leaf decision in `08-11`'s Key Decisions.

3. **`08-13-PLAN.md:26` — the parser's "non-unit quaternion" tolerance is unpinned, and no planned test can catch an over-strict implementation.** `sanitizeEntity` leaves quaternions with `|normSq − 1| ≤ SANITIZE_QUAT_TOLERANCE` (1e-9) bit-identical (not renormalised), so a sanitized entity can legitimately carry a quaternion that is not exactly unit. If the executor implements parse's unit check tighter than 1e-9, sanitized worlds would be refused — and the fast-check property will rarely generate a within-tolerance-but-not-exactly-unit quaternion by chance. **Fix:** pin parse's quaternion tolerance to `≥ SANITIZE_QUAT_TOLERANCE` (reuse the exported constant) and add one acceptance row (a quaternion with `normSq = 1 + 5e-10` parses) beside the existing zero-norm rejection row.

4. **`08-05-PLAN.md:136,186` — the `allocate` refusal at `nextId > 0xffffffff` is present but unproven, and the property asserts a bound that is not a system invariant.** The guard is the load-bearing defence for the "no `RangeError` inside a fixed step" invariant, yet the Task 2 behavior list has no test constructing a store at `nextId = 0xffffffff + 1` and asserting refusal. Meanwhile the property asserts `nextId < FIRST_DYNAMIC_ID + 65536`, which holds only because fast-check command chains are short. **Fix:** replace the artifact bound with a dedicated behavior row for the uint32 refusal (`createEntityStore({ nextId: 2 ** 32, entities: [] })` → `allocate` returns `undefined`, `nextId` unchanged), and drop or reword the 65536 bound.

**INFO**

1. **`08-13-PLAN.md:107` — "slices any param arrays" is ambiguous.** The behavior table *rejects* arrays exceeding `MAX_SNAPSHOT_PARAM_LENGTH (64)`; the action text says parse "slices any param arrays". Reword to "copies (via `.slice()`) any param arrays".
2. **`08-04-PLAN.md` Task 2 step 1 / `08-12-PLAN.md` Task 1 step 2 — two small sequencing ambiguities in the new wiring.** (a) Clarify whether `08-04` wires `withdrawProbe()` into `game-session.ts` immediately or waits for `08-12`. (b) Clarify that `window.addEventListener` registrations in `08-12` stay at lifecycle construction time.
3. **`08-10-PLAN.md:156` (and the matching `08-12` audit text) — stale line anchors.** The freeze-branch `pending.length = 0` sites are cited as `:2744`, `:2755`, `:2852`; the actual occurrences are `game-session.ts:2738` (chart freeze), `:2749` (save-screen freeze), `:2773` (drain), `:2859` (paused).
4. **`08-16-PLAN.md` Task 1 step 2 — the `entities` count reads `store.live` indirectly.** A one-line `liveEntityCount(world)` helper in `src/sim/world/world.ts` would keep app code off store internals entirely.

### Recommendations

1. **(Before executing `08-13`)** Apply W1: specify post-spawn direct-mutation injection for the fast-check property and the converse NaN check.
2. **(Before executing `08-13`/`08-11`)** Apply W3 and W2: pin the parser's quaternion tolerance to `SANITIZE_QUAT_TOLERANCE` with one acceptance row, and either bound the string leaves or scope the "every sanitized world snapshots…" claim to numeric leaves with a recorded decision.
3. **(Before executing `08-05`)** Apply W4: add the `allocate`-at-`0xffffffff` refusal behavior row and drop the `FIRST_DYNAMIC_ID + 65536` property bound.
4. **(During execution)** Resolve INFO-1/2 with one-word/one-sentence plan edits and refresh the stale `pending.length` line anchors in `08-10`/`08-12`.

### Overall Assessment

**READY.** All six Round 2 behavioral-correctness focus items are verifiably resolved at `45c689b` — each fix is a concrete contract with a named test and an acceptance gate, the cross-plan edits stayed mutually consistent, and the deferrals are recorded with owners. The four WARNINGs are specification-precision gaps in the newly added test designs — most notably the vacuous-property risk in `08-13` — and all four are cheap pre-execution plan-text edits. No structural rework is needed; proceed to execution after applying W1–W4.

---

## Algorithm & Determinism Review (reviewer-algorithm-deepseek-v4-pro)

### Summary

Commit `45c689b` adds a per-plan **"Round 2 — 820a435" disposition ledger** to all 16 plans and materially rewrites the four plans at the core of the determinism contract (`08-05`, `08-11`, `08-13`, `08-15`). Every Round 2 finding in the algorithm/determinism focus area is genuinely addressed with executable plan text, test cases, and threat rows — not prose. The two Round 2 BLOCKERs (field-complete `sanitizeEntity` numeric domain; warm-Load vs cold-Continue epoch divergence) are both resolved with concrete mechanisms (`sanitizeEntity` field-complete table; `resetForRestore(0)`). The three HIGH items (uint32 `RangeError` totality, `isNeverSpawned`/world-rng co-commitment, non-dead `MAX_ENTITIES` cap) are resolved. I found **no BLOCKER and no HIGH**. One **WARNING** remains: the coordinate/radius magnitude clamp is specified as `1e12` while the plan claims it "matches `MAX_SAVE_POSITION_MAGNITUDE`", which is actually `1e9` (`src/persistence/save.ts:123`). A few INFO-level numeric-precision notes round out the review.

### Round 2 Resolution Verification

**1. Quaternion `normSq` / coordinate clamp / non-negative speeds / `ai.params` recursive sanitization (`08-11`, `08-13`, `08-05`) — RESOLVED, one residual WARNING.**

- Quaternion norm check now reads `!Number.isFinite(normSq) || !(normSq > 0)` (`08-11-PLAN.md:163`), which catches `normSq === 0` (underflow) and `normSq === Infinity` (the `1e200` overflow case) and matches `src/sim/flight/sanitize.ts:57-59` (`!(orientationLengthSquared > 0) || !Number.isFinite(orientationLengthSquared)`). Near-unit quaternions renormalize under `SANITIZE_QUAT_TOLERANCE = 1e-9` (`08-11-PLAN.md:163`).
- Non-negative speed/desiredSpeed/desiredRange enforced: `!Number.isFinite(v) || v < 0 || v > 1e12 → 0` (`08-11-PLAN.md:164`).
- `ai.params` recursive finite sanitization added (numbers and number-array elements, copy-on-write) (`08-11-PLAN.md:168`), plus `radius`/`ownerId`/`spawnTick`/`rng`/`repairs` repair rules (`08-11-PLAN.md:165-168`).
- `spawnEntity` constructor-boundary validation added (`08-05-PLAN.md:137`, threat `T-08-41`).
- **WARNING:** the magnitude bound is `1e12`, but the plan parenthetical `(MAX_ENTITY_MAGNITUDE = 1e12, matching MAX_SAVE_POSITION_MAGNITUDE)` is factually wrong — see Issues #1.

**2. Warm Load vs cold Continue epoch reset (`08-15`, tested in `08-15`) — RESOLVED.**

- `resetForRestore(epoch = 0)` added to the `WorldLifecycle` interface (`08-15-PLAN.md` Task 1 step 1); `loadFromSave` calls `resetForRestore(0)` inside the synchronous install block before `resume(nextSeed)`/`end()` (`08-15-PLAN.md` Task 3 step 2).
- Cold-boot-Continue equivalence tested: the `load` describe now starts from `epoch === 2` and asserts warm Load produces `epoch === 0` then `epoch === 1` on the next launch/arrival, *identical to a cold Continue* (`08-15-PLAN.md` Task 3 step 3 case (i)/(ii)).

**3. `worldSeedFor`/`forkSeed` uint32 `RangeError` + `begin` epoch saturation + `nextId` safe-integer bound (`08-02`, `08-05`, `08-15`) — RESOLVED.**

- `08-02` documents that fixed-step callers guard before calling (`08-02-PLAN.md` Task 3 step 1).
- `08-05` `store.allocate` refuses `nextId > 0xffffffff`; property test asserts `nextId < FIRST_DYNAMIC_ID + 65536` (`08-05-PLAN.md` Task 2 `<behavior>`, threat `T-08-41`).
- `08-15` `begin` guards `epoch < 0xffffffff` before `epoch += 1`, and `resetForRestore(0xffffffff)` + `begin` refusal is a tested row (`08-15-PLAN.md` Task 1 step 1, Task 2 `<behavior>`).

**4. `isNeverSpawned` & `world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world")` co-commitment + plain `uint32` rng encoding (`08-05`, `08-11`, `08-13`) — RESOLVED.**

- `isNeverSpawned(world)` now includes `world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world")` (`08-05-PLAN.md:137`), and the doc comment states the co-commitment invariant.
- A test explicitly asserts that drawing `world.rng` on an empty world flips `isNeverSpawned` and emits the section (`08-05-PLAN.md` Task 2 `<behavior>`).
- `WorldSnapshot.rng` pinned to plain `uint32` `number` = `world.rng.s`, with `snapshot.rng === world.rng.s` asserted (`08-13-PLAN.md:107`, `08-13-PLAN.md` Task 2 `<behavior>`); `serializeWorldSection` emits `rng=<uint32>`.

**5. `MAX_ENTITIES = 256` counting non-dead entities (`08-05`, `08-11`, `08-13`) — RESOLVED.**

- `08-05` Task 2 `<behavior>` now tests that killing 3 entities in a world at 256 non-dead before `commit()` frees 3 slots so 3 new spawns succeed in the same tick (bringing `live.length` to 259 and non-dead count to 256); property test asserts non-dead count `live.filter(e => !e.dead).length` never exceeds `MAX_ENTITIES`.

**6. Hot-path allocations + `canon`/`-0`/NaN/Infinity across `stepWorld` — RESOLVED.**

- Lazy `createWorldView` is now the **default** (`08-11-PLAN.md` Task 1 step 1, must_haves truth), not gated behind a benchmark failure.
- `canon` (`src/sim/hash.ts:29-35`) throws on non-finite and normalizes `-0 → 0`; the field-complete sanitizer guarantees every hashed/snapshotted leaf is finite before `canon` runs.
- `08-13`'s 1,000-tick reporter checks `hashFlight(livePlayer)` vs `hashFlight(restoredPlayer)` **before** `entityHashes` (`08-13-PLAN.md` Task 1 step 2).

### Plan-by-Plan Assessment (08-01 through 08-16)

| Plan | Round 2 algorithm/determinism/numeric findings | Resolved at `45c689b`? | Residual note |
|------|-----------------------------------------------|------------------------|---------------|
| **08-01** | probe-shape empty-array wildcard (adversarial BLOCKER) + optional-key audit | ✅ ADOPTED (`T-08-40`, `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS = []`, SUMMARY justification) | Not in numeric focus; no residual |
| **08-02** | RNG draw count (9→8), `__purity_` scan race, `RangeError` doc, stream-independence (deferred) | ✅ ADOPTED (draw count, `__purity_` skip + `ENOENT`, `RangeError` guard docs); independence REJECTED as non-blocker | none material |
| **08-03** | `Reflect.get`, `.sort.call/.apply`, `queueMicrotask`, `self`, Frame-scan widen, `__purity_` | ✅ ADOPTED (`SIM_GLOBAL_BANS`/`SIM_SYNTAX_BANS` extended, block-comment strip, full brace-matched `*Frame*` scan) | none material |
| **08-04** | coverage floors; `withdrawProbe`; Pick-facet (deferred per D-12) | ✅ ADOPTED (coverage check recorded; `withdrawProbe`); facet REJECTED per D-12 | none material |
| **08-05** | spawn validation, `isNeverSpawned` rng check, `nextId` bound, `Object.freeze`, `depends_on` | ✅ ADOPTED (all) | residual WARNING #1 (`radius <= 1e12` at `:137`) |
| **08-06** | `window.addEventListener` out of controller factories | ✅ ADOPTED | none material |
| **08-07** | (none) — `scan` O(n²) forward note deferred | ✅ RECORDED (explicit "No action for Phase 8") | none (correct deferral) |
| **08-08** | `document` guards; post-`await` `disposed` short-circuits | ✅ ADOPTED (`syncHeaderCredits`, `closeSaveScreen`, `loadFromSave`/`clearSaveForNewGame`/`queueSnapshot`) | none material |
| **08-09** | recursive AI-zone globs, seal allowed-module exports, `Object.freeze` registry, wake-before-think | ✅ ADOPTED (depth-1/2/3 blocks, `__purity_` probes, export-surface scan, frozen registry, wake test) | none material |
| **08-10** | `ctx` into `createEventRouter`, `syncStatusOverlay` document guard, `pending.length = 0` ×4 | ✅ ADOPTED (all) | none material |
| **08-11** | field-complete sanitize, lazy `createWorldView` default, wake-before-think | ✅ ADOPTED (all) | residual WARNING #1 (`MAX_ENTITY_MAGNITUDE = 1e12` at `:162`) |
| **08-12** | `pending` ×4 audit, `onLaunchKeyDown`/window listeners, `swapSystem` raf + no timers, read `dispose.test.ts:687` | ✅ ADOPTED (all) | none material |
| **08-13** | numeric-domain alignment + all-leaf `fc` injection, parser hardening + deep copy, `rng` uint32 + player-first reporter | ✅ ADOPTED (all) | residual WARNING #1 (`MAX_SNAPSHOT_MAGNITUDE = 1e12` at `:107`) + INFO #2 |
| **08-14** | `disposed` refusal in `advanceTicks`; chart-open early-stop test | ✅ ADOPTED (all) | none material |
| **08-15** | `resetForRestore(0)`, `ctx` router wiring, `begin` epoch guard, dispose `end()` idempotent, v2 key allow-list, `depends_on`; traffic parity deferred | ✅ ADOPTED (all; traffic parity DEFERRED to Phase 12) | none material |
| **08-16** | `probe.sim` guard + `startNewGame`, store-import ban + probe immutability + taint, frame-wait + jump-parity + supersede note | ✅ ADOPTED (all) | jump browser-parity deferred to Phase 12 (recorded in `PROJECT.md`) |

### Strengths

- **The two Round 2 BLOCKERs are closed with real mechanisms, not assertions.** `sanitizeEntity` is now *field-complete* — it names `radius`, `ownerId`, `spawnTick`, `targetId`, `rng.ai`/`rng.combat`, `repairs`, AI timers, and `ai.params` numbers **and number-array elements** with exact repair values and repair-count semantics (`08-11-PLAN.md:162-168`). `resetForRestore(0)` is a dedicated lifecycle operation with warm/cold equivalence tests that start from `epoch === 2` (`08-15-PLAN.md` Task 3 step 3).
- **The quaternion overflow fix is numerically correct.** `!Number.isFinite(normSq) || !(normSq > 0)` is the v1 flight sanitizer's shape (`src/sim/flight/sanitize.ts:57-59`), distinguishing degenerate (`0`) from overflow (`Infinity`) without an epsilon, and the `1e200` injection is explicitly named as the overflow case.
- **Totality of the fixed-step path is now end-to-end.** `store.allocate` (`nextId > 0xffffffff`), `spawnEntity` (safe-integer `tick`/`ownerId`, finite pose/norm), and `begin` (`epoch < 0xffffffff`) together make the `worldSeedFor`/`forkSeed` `RangeError` structurally unreachable inside `stepSim`, and each guard has a test row.
- **The `isNeverSpawned`/world-rng co-commitment is both documented and mechanically enforced** via `world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world")`, with a direct "draw rng on empty world flips the predicate" test.
- **The non-dead `MAX_ENTITIES` semantics are pinned with the exact trap case** (256 non-dead + 3 killed-uncommitted ⇒ 3 same-tick spawns succeed, `live.length` 259, non-dead 256, 4th refused).
- **Lazy `createWorldView` is now the default**, not a benchmark-failure fallback; the NPC-free hot path allocates zero `WorldView`/`ShipControl` closures per tick.

### Issues Found

#### 1. **Severity: WARNING** — World coordinate/radius magnitude bound is `1e12`, but the plan claims it "matches `MAX_SAVE_POSITION_MAGNITUDE`", which is `1e9`

- **Plan/Task:** `08-11` Task 2 (`08-11-PLAN.md:162-168`), `08-05` Task 1 (`08-05-PLAN.md:137`), `08-13` Task 1 (`08-13-PLAN.md:107`).
- **Description:** `08-11-PLAN.md:162` writes: `(MAX_ENTITY_MAGNITUDE = 1e12, matching MAX_SAVE_POSITION_MAGNITUDE)`. The live constant is `MAX_SAVE_POSITION_MAGNITUDE = 1e9` (`src/persistence/save.ts:123`). `1e12` is 1000× looser.
- **Direction:** Either (a) align all three to `MAX_SAVE_POSITION_MAGNITUDE` (`1e9`, imported or re-stated), or (b) correct the parenthetical to record an explicit decision: "a world-local cap, chosen 1e12 (> `MAX_SAVE_POSITION_MAGNITUDE` = 1e9, which governs only the player's `FlightState` position in the save, not NPC entity coordinates)".

#### 2. **Severity: INFO** — `08-13` rejection-test parenthetical conflates the threshold with the injected value

- **Plan/Task:** `08-13` Task 2 `<behavior>` (`08-13-PLAN.md:133`).
- **Description:** "a position or radius exceeding `MAX_SNAPSHOT_MAGNITUDE` (`1e308`)" reads as if `1e308` is the threshold; the threshold is `1e12` (`08-13-PLAN.md:107`) and `1e308` is the *injected test value*.
- **Direction:** Reword to "a position or radius of `1e308` (exceeding `MAX_SNAPSHOT_MAGNITUDE` = `1e12`)".

#### 3. **Severity: INFO** — Update-phase `speed = max(0, nav.desiredSpeed)` is not a NaN defense (`Math.max(0, NaN) === NaN`)

- **Plan/Task:** `08-11` Task 1 step 1 (Update phase).
- **Description:** The placeholder integrator's `max(0, nav.desiredSpeed)` clamps negatives but passes `NaN` through. Safe because `spawnEntity` validation (`08-05`), `parseWorldSnapshot` (`08-13`), and `sanitizeEntity` exclude/repair NaN, but worth a one-line comment noting the real NaN/range defense is spawn validation + sanitize.

#### 4. **Severity: INFO** — `repairs` self-repair yields a counter of `1` for a call that only repaired `repairs`

- **Plan/Task:** `08-11` Task 2 `<behavior>` step 8 (`08-11-PLAN.md`).
- **Description:** "if `!Number.isSafeInteger(entity.repairs) || entity.repairs < 0`, reset base to 0 and mark repaired; then repairs grows by exactly 1 per call that made at least one repair". Ensure the sanitize table test's repairs-delta column states the expected value (`1`) explicitly.

### Recommendations

1. **(Before execution, WARNING #1)** Reconcile the `1e12` vs `1e9` coordinate/radius magnitude bound in `08-05`/`08-11`/`08-13`: either align to `MAX_SAVE_POSITION_MAGNITUDE = 1e9` or replace the "matching `MAX_SAVE_POSITION_MAGNITUDE`" parenthetical with a recorded decision that `1e12` is an intentional world-local cap for NPC coordinates.
2. **(Trivial)** Fix the `08-13-PLAN.md:133` "(1e308)" parenthetical to avoid an executor misreading the threshold as `1e308`.
3. **(Trivial)** Add a comment at the `08-11` Update-phase clamp noting the real NaN/range defense is spawn validation + sanitize, not `max(0, …)`.
4. **(No change needed, but verify at execution)** Confirm the sanitize-table repairs-delta column pins the `repairs`-self-repair row to `1` (not `0`).

### Overall Assessment

**READY** for the algorithm, determinism, numeric stability, and performance focus area. Commit `45c689b` absorbs the Round 2 algorithm/determinism findings: the field-complete sanitizer, `resetForRestore(0)` warm/cold epoch equivalence, `RangeError` totality, `isNeverSpawned`/world-rng co-commitment, non-dead `MAX_ENTITIES` semantics, and lazy view construction are all specified with concrete, testable mechanisms and test rows. The single WARNING — the `1e12` vs `1e9` magnitude-bound citation mismatch — is a documentation/consistency defect with no Phase 8 functional impact, and should be corrected before execution.

---

## Adversarial & Trust-Boundary Review (reviewer-adversarial-grok-4-7)

### Summary

Commit `45c689b` writes the Round 2 adversarial fixes into the plans, not only into disposition tables. The empty-array wildcard is gone. `sanitizeEntity` now matches `sanitizeFlightState`'s quaternion rule and rejects negative speeds. `nextId` must be a safe integer. Async dispose paths and `advanceTicks` check `disposed`. `STATIC_ENTITIES` and `AI_REGISTRY` are frozen. The probe-shape freeze can see a dropped array.

What is not closed is the boundary those fixes were meant to make safe. `parseWorldSnapshot`'s rejection table is narrower than its must_haves. `restoreWorld` still accepts a typed object without re-running the parser. The named caps `MAX_AI_PARAMS_KEYS`, `MAX_AI_PARAMS_DEPTH`, and an `Object.prototype.hasOwnProperty` / `Object.hasOwn` check are absent. The `probe.sim` immutability test does not fail if `entities` is the live array. The listener-count gate Round 2 asked to replace is still the gate.

### Round 2 Resolution Verification

| Round 2 item | Plans | Status |
|---|---|---|
| `compareProbeShapes` empty-array wildcard (BLOCKER, L369) | `08-01` | **Resolved.** Empty matches empty only. `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS` starts empty. Both directions are unit-tested (`08-01-PLAN.md:28`, `:132`, `:136`). |
| Quaternion overflow/underflow, negative speed/range, field-complete numeric sanitize (BLOCKER, L61 / L491) | `08-11`, `08-13` | **Resolved for numerics.** `!Number.isFinite(normSq) \|\| !(normSq > 0)`, negative or `> 1e12` speeds/ranges, radius, ids-as-counters, rng, repairs, and numeric `ai.params` leaves (`08-11-PLAN.md:161-170`). Fast-check injects `1e200`, `NaN`, and negatives (`08-13-PLAN.md:140`). |
| `Number.isSafeInteger(nextId)` plus `> maxId` | `08-13` | **Resolved.** `101.5` and `2 ** 53 + 3` are rejection rows (`08-13-PLAN.md:26`, `:133`). |
| String/array length caps, magnitude cap, unknown keys, `__proto__` | `08-13` | **Partial.** Caps exist under other names (`MAX_SNAPSHOT_STRING_LENGTH = 128`, `MAX_SNAPSHOT_PARAM_LENGTH = 64`, `MAX_SNAPSHOT_MAGNITUDE = 1e12`). `MAX_AI_PARAMS_KEYS` and `MAX_AI_PARAMS_DEPTH` do not. `__proto__` rejection is specified for "any object" in must_haves and tested only on entity and `ai.params`. |
| `Object.prototype.hasOwnProperty` | `08-13` | **Not adopted.** No plan names `Object.hasOwn` or `Object.prototype.hasOwnProperty.call`. |
| `world.rng.s === world.seed` when `entities.length === 0` | `08-05` | **Resolved, with the correct predicate.** `isNeverSpawned` requires `world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world")` plus `nextId === 101` plus an empty live list (`08-05-PLAN.md:33`, `:137`). |
| Deep copy in `restoreWorld` and `serializeWorld` / `snapshotWorld` | `08-13` | **Partial.** `restoreWorld` deep-copy is specified and the post-restore mutation test is real (`08-13-PLAN.md:107`, `:138`). `snapshotWorld` is told to deep-copy, but no test mutates that object and reads the live world. |
| `restoreWorld` must not be a second unchecked entry | `08-13` | **Not adopted.** Round 2 L387 asked for re-validation or "parser output only". The function takes `WorldSnapshot` and copies it (`08-13-PLAN.md:107`). |
| `Reflect.get`, `sort.call/apply/bind`, `queueMicrotask`, `self`, `declaredFrameTypes` | `08-03`, `08-09` | **Mostly resolved.** Direct forms are banned and `.call` is probed (`08-03-PLAN.md:141-145`). `.apply`/`.bind` are in the selector and not in the probe list. `Reflect["get"]` and `Reflect.apply(Array.prototype.sort, …)` are unbanned and not listed as residuals. AI-zone globs are recursive and fail-closed at depth ≥ 3 (`08-09-PLAN.md:181-184`). |
| `__purity_` probe prefix | `08-02`, `08-03`, `08-09` | **Resolved.** |
| Post-`await` dispose on load / clear / autosave | `08-08` | **Resolved.** (`08-08-PLAN.md:144`, `:149`) |
| `swapSystem` rAF | `08-12` | **Resolved.** Id tracked, cancelled, callback checks `disposed` (`08-12-PLAN.md:27`, `:117`, `:160`). |
| `advanceTicks` refuses when `disposed` | `08-14` | **Resolved.** Checked first, before taint and drain (`08-14-PLAN.md:29`, `:122`). |
| `dispose` calls `worldLifecycle.end()` idempotently | `08-15` | **Resolved** in `08-15`'s own test (`08-15-PLAN.md:38`, `:163`). |
| Replace listener-count gate with a `signal` assertion | `08-12` | **Not adopted.** Counts remain the gate (`08-12-PLAN.md:118`, `:142`). |
| `Object.freeze` on `STATIC_ENTITIES` and `AI_REGISTRY` | `08-05`, `08-09` | **Resolved.** Records are primitives, so shallow freeze is enough (`08-05-PLAN.md:34`, `:137`, `:183`; `08-09-PLAN.md:31`, `:119`). |
| `probe.sim` must not be a mutation handle | `08-16` | **Partial.** Action text says a local number (`08-16-PLAN.md:126`). The test assigns over the property (`08-16-PLAN.md:162`), which passes even if the previous value was `store.live`. |
| Anchored-save substring check | `08-15` | **Resolved as specified.** `Object.keys` allow-list is the gate; the substring check is a backstop (`08-15-PLAN.md:206`). |
| `setTimeout` / `setInterval` / `queueMicrotask` in `src/app/session` | `08-12` | **Resolved** as an `rg` gate (`08-12-PLAN.md:141`). |

### Plan-by-Plan Assessment (08-01 through 08-16)

| Plan | Trust-boundary verdict |
|---|---|
| `08-01` | Closed. Empty-array wildcard removed. `sim` is state-determined, not optional, so a dropped `probe.sim` still fails the shape spec. |
| `08-02` | No new untrusted parser. `__purity_` skip and `ENOENT` tolerance close the parallel-probe race. `forkSeed` `RangeError` is documented and guarded by later callers. |
| `08-03` | Direct bans landed. Computed `Reflect["get"]` and `Reflect.apply(sort)` remain. See WARNING 1. |
| `08-04` | No new untrusted input. `SessionRuntime.disposed` is the flag later plans check. Context is a typed bag of existing `let`s. |
| `08-05` | Freeze and `isNeverSpawned` rng check are real. `createEntityStore(init)` accepts a caller-supplied entity list with no validation (`08-05-PLAN.md:136`). That is the sink `restoreWorld` uses. |
| `08-06` | Verbatim extraction. No new boundary. Window listeners are pinned later in `08-12`. |
| `08-07` | `copyVec` / `copyQuat` at every view return closes the AI seam. Session code is outside that seam and still holds `World`. |
| `08-08` | Post-`await` `disposed` checks on `loadFromSave`, `clearSaveForNewGame`, and `queueSnapshot` are specified and test-backed. |
| `08-09` | `AI_REGISTRY` and `TEST_PILOT` frozen. Nested AI imports fail closed at depth ≥ 3. Export-surface scan covers the four allowed modules. |
| `08-10` | No new untrusted parser. Router ignores unknown kinds. Reserved payloads are not emitted here. |
| `08-11` | Numeric sanitize contract matches the flight sanitizer and the fast-check. Structural `ai.params` (key count, nested arrays, prototype keys, long strings) are not repaired, so the "every sanitized world parses" sentence is false outside the numeric generator. |
| `08-12` | `swapSystem` rAF hole is closed. Listener-count gate is not. See WARNING 2. |
| `08-13` | Main remaining hole. Parser must_haves over-claim the TDD table. `restoreWorld` does not re-validate. See HIGH 1. |
| `08-14` | `advanceTicks` refuses `disposed` first, caps `n` at 200_000, read-once URL flags, exact `"1"` / `"manual"`. |
| `08-15` | Warm Load resets epoch to 0 before `resume`. `end()` is on the dispose path and a second `dispose` is idempotent. Save keys are an allow-list. `src/persistence` stays unchanged. |
| `08-16` | `probe.sim` is specified as numbers and booleans, deleted on dispose, absent in menu. The anti-mutation test does not lock that. See WARNING 3. |

### Strengths

- The FOUND-10 comparator no longer treats `[]` as equal to a populated array. That was the Round 2 blocker, and the replacement is testable in both directions.
- Numeric domain alignment between `sanitizeEntity` and `parseWorldSnapshot` is now explicit, including the `1e200` quaternion case that overflows `normSq` to `Infinity`, matching `src/sim/flight/sanitize.ts:56-59`.
- Dispose continuations that already exist in `game-session.ts:1167-1197` and `:3284-3294` are named, not left to a verbatim move. `advanceTicks` checks `disposed` before taint.
- `isNeverSpawned` includes the world-stream seed, so an empty entity list cannot hide a drawn `world.rng`.
- Static records are primitives and are frozen at runtime. A write to `world.statics[0].scanClass` throws in module strict mode. Restored worlds share that frozen table, which is safe.
- AI import zone is fail-closed below depth 2, and the allowed modules are sealed against `export … from`.
- Phase 8 saves still cannot carry a world snapshot. The anchored-save check is now `Object.keys` against the v2 allow-list, not only a substring search.

### Issues Found

#### HIGH

**1. `parseWorldSnapshot` / `restoreWorld` still admit tampered snapshots the rejection table does not name**

- Plans: `08-13` Task 1–2 (`08-13-PLAN.md:26`, `:107`, `:133`, `:138`, `:202-203`); sink in `08-05` (`08-05-PLAN.md:136`); structural gap in `08-11` (`08-11-PLAN.md:168`).
- What the TDD table actually rejects: bad `nextId`, magnitude, negative speeds, the all-zero quaternion, string length 128, array length 64, one nested object, unknown keys on root/entity/nav/ai, and `__proto__` on an entity or `ai.params`.
- What a faithful executor can therefore accept:
  - Entity id `101.5` or `2 ** 53`. "Below 101" and "strictly ascending" do not require a safe integer. `forkSeed` throws `RangeError` on a non-integer id (`08-02-PLAN.md:197`).
  - Unbounded `ai.params` key cardinality (`MAX_AI_PARAMS_KEYS` is absent).
  - Nested arrays (`[[1]]`). The rejection row is a nested object `{ a: 1 }`, not `[[1]]`. `sanitizeEntity` only repairs number elements one level down (`08-11-PLAN.md:168`).
  - Underflow quaternion `{ w: 1e-200, x: 1e-200, y: 1e-200, z: 1e-200 }` where components are finite and under `1e12` and `normSq` underflows to `0`.
  - `__proto__` / `constructor` / `prototype` on `position`, `orientation`, `rng`, `nav`, or the root, and no requirement to use `Object.hasOwn` / `Object.prototype.hasOwnProperty.call`.
  - `restoreWorld(crafted)` skips re-validation and only deep-copies (`08-13-PLAN.md:107`).
  - `snapshotWorld` alias in the other direction: mutating `snapshotWorld(world).entities[0].position` is not tested against the live world.
- Mitigation: extend the rejection table with non-integer entity ids, a key-count cap (`MAX_AI_PARAMS_KEYS`), nested arrays, an underflow quat, and `__proto__` on every nested object including vectors. Pin enumeration to `Object.hasOwn`. Make `restoreWorld` call the same validators or accept only a value the parser just returned. Add a test that mutates the object `snapshotWorld` returns and asserts `entityHashes(live)` is unchanged. Update T-08-24.

#### WARNING

**1. The new determinism selectors are bypassed by forms `08-03` already knows how to ban**

- Plans: `08-03` Task 2 (`08-03-PLAN.md:141-145`); inherited by `08-09` and not re-probed.
- `MemberExpression[object.name="Reflect"][property.name="get"]` does not match a computed `Reflect["get"]`, and `Reflect.apply(Array.prototype.sort, xs, [])` is not `sort.call`. The probe list includes `Array.prototype.sort.call` and not `.apply` or `.bind`.
- Mitigation: ban computed `Reflect["get"]` the same way computed `Math` is banned, ban `Reflect.apply`, and add failing probes for `.apply`, `.bind`, `Reflect["get"]`, and `Reflect.apply(Array.prototype.sort, …)` — or list those forms next to the accepted residual.

**2. The listener-count gate still cannot see an unpaired abort signal**

- Plan: `08-12` Task 1 (`08-12-PLAN.md:28`, `:118`, `:142`).
- Mitigation: assert every `addEventListener` under `src/app/session` is passed an abort signal, or record each site in the teardown list by identity, not by count.

**3. `probe.sim` anti-mutation test does not catch a leaked store, and `World.store` is reachable without importing `store.js`**

- Plans: `08-16` Task 1–2 (`08-16-PLAN.md:33`, `:126`, `:162`); `08-05` (`08-05-PLAN.md:136-137`).
- Mitigation: assert `typeof probe.sim.entities === "number"` and that no `probe.sim` property is object-identical to `store.live` or any entity.

#### INFO

- `world.rng.s === world.seed` is the wrong check; the plan's `forkSeed(world.worldSeed, NO_ENTITY, "world")` predicate is the right one.
- `MAX_DESIRED_HEADING_ID_LENGTH` has no field to apply to in Phase 8.
- `08-15` has a substring backstop for `"epoch"` / `"entities"`; the `Object.keys` allow-list is the real gate.
- Depth ≥ 3 AI files cannot import the legal seam (`08-09-PLAN.md:184`), which is fail-closed.
- Reserved event strings (`specKey`, `commodity`, `commsMessage.params`) have no length cap (`08-11-PLAN.md:207-210`); nothing emits or renders them in Phase 8.

### Recommendations

1. Before `08-13` is executed, widen the rejection table until it matches the must_haves, add `MAX_AI_PARAMS_KEYS` and a nested-array rejection, pin `Object.hasOwn`, and make `restoreWorld` re-validate. Add the `snapshotWorld` anti-alias test. Update T-08-24 so the threat row is not the old contract.
2. In `08-03`, probe `Reflect["get"]`, `Reflect.apply(Array.prototype.sort, …)`, `.apply`, and `.bind`, or list them as accepted residuals in the same comment as the Math-alias residual.
3. In `08-12`, replace the listener-count equality check with a signal assertion.
4. In `08-16`, assert `typeof probe.sim.entities === "number"` and that the published object shares no identity with `store.live`.

### Overall Assessment

**NEEDS REVISION** before `08-13` and `08-16` execute. Waves 1–4 are not blocked by these findings.

Round 2's blocker (the probe-shape wildcard) and the numeric sanitize/parser mismatch are genuinely fixed in the plan text, with tests an executor cannot satisfy by accident. The remaining gaps are in `08-13`'s TDD rejection table (`restoreWorld` re-validation, non-integer entity ids, `MAX_AI_PARAMS_KEYS`, nested arrays, `Object.hasOwn`, `snapshotWorld` anti-alias test) and `08-16`'s `typeof probe.sim.entities === "number"` check.

---

## Broad-Context & Blast-Radius Review (reviewer-context-gemini-4-argon)

### Summary

Commit `45c689b` cleanly and completely resolves all Round 2 findings from `08-REVIEWS.md` across all 16 Phase 8 plans (`08-01` through `08-16`), including all three Round 2 consensus blockers (`08-01` empty-array probe-shape wildcard, `08-11`/`08-13`/`08-05` field-complete numeric sanitization and quaternion overflow handling, and `08-15` warm-`Load` vs cold-`Continue` epoch equivalence via `resetForRestore(0)`) and all four Round 2 blast-radius warnings (`__purity_` probe filename prefixing + SPDX headers in `08-03`/`08-02`/`08-09`; recursive AI-zone ESLint globs and allowed-seam export sealing in `08-09`; headless Node `typeof document !== "undefined"` / `typeof window !== "undefined"` guards across `08-06`/`08-08`/`08-10`/`08-12`/`08-15`; and `createEventRouter(ctx, subscribers)` wiring plus `depends_on` frontmatter completion in `08-05`/`08-10`/`08-15`).

Whole-repository verification against the live tree confirms that `45c689b` introduces **zero** new cross-module contract conflicts, **zero** same-wave `files_modified` collisions across Waves 1–9, and **zero** BLOCKER, HIGH, or WARNING issues. All 16 plans (`08-01` through `08-16`) are **READY** for execution.

### Round 2 Resolution Verification

1. **`tests/compliance.test.ts` SPDX header requirement & `tests/sim/rng.test.ts` / `tests/guards/sim-purity.test.ts` `__purity_` exclusion (`08-02`, `08-03`, `08-09`) — RESOLVED:**
   - `08-03-PLAN.md` (Task 1 steps 2–4, lines 105–109; `files_modified` line 11) now requires `withSimProbe` in `tests/guards/sim-probe.ts` to normalize every probe basename to start with `__purity_` (matching `tests/compliance.test.ts:74` `if (entry.name.startsWith("__purity_")) continue;`) and automatically prepend the two-line GPL-2.0-or-later SPDX header.
   - `08-03-PLAN.md` (Task 1 step 3, lines 106–108) updates `listTsFiles` in `tests/guards/sim-purity.test.ts:86-97` to skip `__purity_*` entries and ignore transient `ENOENT`, and widens `declaredFrameTypes` (`tests/guards/sim-purity.test.ts:114-127`) to strip `/* ... */` block comments and scan the full brace-matched `*Frame*` declaration body.
   - `08-02-PLAN.md` (Task 3 step 3, line 201) updates `describe("only serialisable streams in src/sim")` in `tests/sim/rng.test.ts` to skip any file or directory entry whose basename starts with `__purity_` and ignore transient `ENOENT` during parallel Vitest worker execution.
   - `08-09-PLAN.md` (Task 3 step 2, line 187) uses `__purity_`-prefixed probe names for all AI-zone negative probes.

2. **Recursive globs (`src/sim/ai/**/*.ts`, `src/sim/**/*.ts`) across purity and architecture guards (`08-03`, `08-09`) — RESOLVED:**
   - `08-09-PLAN.md` (Task 3 step 1, lines 181–185) replaces the non-recursive AI-zone globs in `eslint.config.js` with three blocks that partition `src/sim/ai/**/*.ts` completely (`src/sim/ai/*.ts`, `src/sim/ai/*/*.ts`, `src/sim/ai/*/*/**/*.ts`), all spreading `SIM_SYNTAX_BANS` + `ImportExpression` and inheriting `SIM_GLOBAL_BANS` and `SIM_RESTRICTED_PROPERTIES`.
   - `08-09-PLAN.md` (Task 3 step 2, lines 187–188) tests depth-1 (`ai/`), depth-2 (`ai/pilots/` and `ai/nested/`), and depth-3 (`ai/pilots/roles/`), and seals `src/sim/world/ids.ts`, `src/sim/math.ts`, `src/sim/world/view.ts`, and `src/sim/world/control.ts` against `export ... from` re-exports.

3. **Headless Vitest `document` / `window` guards across extracted session modules (`08-06`, `08-08`, `08-10`, `08-12`, `08-15`) — RESOLVED:**
   - `08-06-PLAN.md` (Task 2 step 2, line 149) keeps both `window.addEventListener("keydown", ...)` registrations (`onSubpanelKeyDown` and `onLaunchKeyDown`) out of `createSettingsController` / `createChartController` construction.
   - `08-08-PLAN.md` (Task 1 step 1, line 105; Task 2 step 1, lines 142–144) adds `if (typeof document === "undefined") return;` at the top of `syncHeaderCredits()` and `closeSaveScreen()`, and adds post-`await` `if (ctx.runtime.disposed) return;` guards to `loadFromSave`, `clearSaveForNewGame`, and `queueSnapshot`.
   - `08-10-PLAN.md` (Task 1 step 1, line 121) adds `if (typeof document === "undefined") return;` at the top of `syncStatusOverlay()`.
   - `08-12-PLAN.md` (Task 1 step 2, line 117) places `onLaunchKeyDown` and both `window.addEventListener("keydown", ...)` calls in `src/app/session/start-session.ts` guarded by `if (typeof window !== "undefined")` and carrying `{ capture: true, signal: uiController.signal }`.

4. **`files_modified` and `depends_on` frontmatter accuracy across parallel waves (`08-05`, `08-10`, `08-15`) — RESOLVED:**
   - `08-05-PLAN.md` frontmatter (line 6) declares `depends_on: ["08-02", "08-03"]`.
   - `08-10-PLAN.md` (Task 2 step 2, line 155) defines `createEventRouter(ctx: SessionState, subscribers: EventRouterSubscribers)` so `src/app/game-session.ts` passes `ctx` in Wave 5, and `08-15-PLAN.md` (Task 1 step 4, line 130) wires the `worldLifecycle` subscriber inside `src/app/session/event-router.ts` (which is in `08-15`'s `files_modified`) without touching `src/app/game-session.ts`.
   - `08-15-PLAN.md` frontmatter (line 6) declares `depends_on: ["08-14", "08-11", "08-13"]`.

5. **E2E and unit test consumer compatibility (`window.__wegolite`, `SaveState`, `FlightState`, `createGameSession`) — RESOLVED:**
   - `08-01-PLAN.md` removes the empty-array wildcard in `compareProbeShapes`.
   - `08-04-PLAN.md` adds `withdrawProbe()` to `createProbePublisher`, which `08-12` calls in `dispose()` and `08-16` extends with `delete probe.sim`.
   - `08-11-PLAN.md` and `08-13-PLAN.md` align `sanitizeEntity` and `parseWorldSnapshot` across numeric leaves of `Entity` and `World`.
   - `08-15-PLAN.md` adds `resetForRestore(0)` to `WorldLifecycle` and calls it in `loadFromSave`'s synchronous install block before `resume(nextSeed)` or leaving `world === undefined`.
   - `08-16-PLAN.md` publishes `probe.sim` inside `if (currentState !== undefined)` in `updateProbe()`, adds `| sim |` to the optional-key audit table in `tests/e2e/probe-shape.spec.ts`, calls `await startNewGame(page)` in `tests/e2e/tick-hook.spec.ts` case (c), waits one frame after clicking Launch before calling `advanceTicks(1)`, and adds a Vitest scripted-jump parity case under `advanceTicks`.

### Plan-by-Plan Assessment (08-01 through 08-16)

| Plan ID | Wave | `depends_on` | Track / Scope | Round 2 Dispositions in `45c689b` | Blast-Radius & Cross-Module Verdict |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`08-01`** | 1 | `[]` | Split safety net (`probe-shape.spec.ts`, `session-source.ts`) | Removed empty-array wildcard in `compareProbeShapes`; added `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS = []` and SUMMARY justification rule | **READY** — Disjoint Wave 1 files; strict probe freeze across all 6 states. |
| **`08-02`** | 1 | `[]` | Core RNG (`src/sim/rng.ts`, `math.ts`, flight hash pins) | `__purity_` skip + `ENOENT` guard in `tests/sim/rng.test.ts` file walk; `drawWitchpointExit` 8-draw doc fix; `RangeError` caller-guard doc; `recorded-flights.ts` baseline header | **READY** — Bit-exact `createSeededRandom` delegation; `arrival.ts` untouched. |
| **`08-03`** | 1 | `[]` | Core determinism lint (`eslint.config.js`, `sim-probe.ts`, `sim-purity.test.ts`) | `withSimProbe` enforces `__purity_` prefix + SPDX header; `Reflect.get`, `.sort.call`/`.apply`, `self`, `queueMicrotask` bans; block-comment stripping + full-body `*Frame*` scan in `sim-purity.test.ts` | **READY** — Safe under parallel Vitest worker runs with `tests/compliance.test.ts`. |
| **`08-04`** | 2 | `["08-01"]` | Split steps 1–2 (`context.ts`, `probe-publisher.ts`) | Added `withdrawProbe()` to `createProbePublisher`; added `vitest.config.ts` coverage-glob verification note for `src/app/session/**` | **READY** — Disjoint from `08-05`; preserves all 9 exports of `src/app/game-session.ts`. |
| **`08-05`** | 2 | `["08-02", "08-03"]` | Core store & world (`ids.ts`, `entity.ts`, `store.ts`, `world.ts`, `serialize.ts`) | Added `"08-03"` to `depends_on`; `Object.freeze` on `STATIC_ENTITIES`; `spawnEntity` numeric validation; non-dead `MAX_ENTITIES` cap test; `world.rng.s` check in `isNeverSpawned` | **READY** — Disjoint from `08-04`; D-06 per-world IDs and D-08 hash identity enforced. |
| **`08-06`** | 3 | `["08-04"]` | Split steps 3–4 (`render-driver.ts`, `chart-controller.ts`, `settings-controller.ts`) | Kept `window.addEventListener` registrations (`onSubpanelKeyDown`, `onLaunchKeyDown`) out of factory construction so Node unit tests never touch `window` | **READY** — Disjoint from `08-07`; worktree-isolated Step 3 `verify-full` gate. |
| **`08-07`** | 3 | `["08-05"]` | Core AI seam (`view.ts`, `control.ts`, `view-impl.ts`, `control-impl.ts`) | Recorded Round 2 ledger confirming no changes needed (`scan` linear cost scoped to Phase 10 broadphase) | **READY** — Disjoint from `08-06`; defensive copies and `Record<keyof ...>` seam pins intact. |
| **`08-08`** | 4 | `["08-06"]` | Split steps 5–6 (`station-controller.ts`, `save-controller.ts`) | Added `typeof document === "undefined"` guards in `syncHeaderCredits` and `closeSaveScreen`; added post-`await` `ctx.runtime.disposed` short-circuits in `loadFromSave`, `clearSaveForNewGame`, and `queueSnapshot` | **READY** — Disjoint from `08-09`; worktree-isolated Step 6 `verify-full` gate. |
| **`08-09`** | 4 | `["08-07", "08-03"]` | Core AI (`time.ts`, `registry.ts`, `test-pilot.ts`, `ai-zone.test.ts`) | Recursive AI-zone ESLint blocks (`ai/*.ts`, `ai/*/*.ts`, `ai/*/*/**/*.ts`); sealed exports of `ids.ts`/`math.ts`/`view.ts`/`control.ts`; `Object.freeze` on `AI_REGISTRY` and `TEST_PILOT`; early-wake test | **READY** — Disjoint from `08-08`; closes nested subdirectory and re-export bypasses. |
| **`08-10`** | 5 | `["08-08"]` | Split steps 7–8 (`hyperspace-controller.ts`, `event-router.ts`, `sim-driver.ts`, `step-options.ts`) | Added `typeof document === "undefined"` guard in `syncStatusOverlay`; passed `ctx` to `createEventRouter(ctx, subscribers)`; defined tuple-valued `EVENT_KIND_SUBSCRIBER`; pinned 4 `pending.length = 0` sites | **READY** — Disjoint from `08-11`; prepares `event-router.ts` for `08-15` without facade edits. |
| **`08-11`** | 5 | `["08-09"]` | Core world step (`step.ts`, `sim.ts`, `sanitize.ts`, `events.ts`) | Field-complete `sanitizeEntity` across all numeric leaves + `!Number.isFinite(normSq) \|\| !(normSq > 0)` quaternion check; default lazy `createWorldView` in `stepWorld`; early-wake test | **READY** — Disjoint from `08-10`; zero `WorldView` allocation on the NPC-free hot path. |
| **`08-12`** | 6 | `["08-10"]` | Split step 9 (`frame-loop.ts`, `start-session.ts`, `game-session.ts` facade) | Placed `onLaunchKeyDown` and `typeof window !== "undefined"`-guarded `window.addEventListener` calls in `start-session.ts`; tracked/guarded `swapSystem` rAF on `disposed`; tested `pending` clearing in freeze branches; banned timers in `src/app/session` | **READY** — Disjoint from `08-13`; worktree-isolated Step 9 `verify-full` gate and `< 600` line facade budget. |
| **`08-13`** | 6 | `["08-11"]` | Core world snapshot (`snapshot.ts`, `snapshot-codec.test.ts`, `world-cadence.test.ts`) | Plain `uint32` `snapshot.rng`; hardened `parseWorldSnapshot` (safe-int `nextId`, `1e12` magnitude cap, string/array caps, unknown-key and `__proto__`/`constructor`/`prototype` rejection); deep-copy `restoreWorld`; full-leaf `fast-check` arbitrary; player-first mismatch reporter | **READY** — Disjoint from `08-12`; `sanitizeEntity` and `parseWorldSnapshot` numeric domains match. |
| **`08-14`** | 7 | `["08-12"]` | Manual clock & test flags (`test-flags.ts`, `sim-driver.ts`, `frame-loop.ts`) | `advanceTicks(n)` refuses when `ctx.runtime.disposed` is true (before taint and drain) and stops early if a step sets `disposed`, `paused`, or opens an overlay (including chart-open early-stop test) | **READY** — Single-plan wave; probe shape remains untouched until `08-16`. |
| **`08-15`** | 8 | `["08-14", "08-11", "08-13"]` | World lifecycle integration (`world-lifecycle.ts`, `sim-driver.ts`, `event-router.ts`, `save-controller.ts`, `hyperspace-controller.ts`, `start-session.ts`) | Added `"08-13"` to `depends_on`; added `resetForRestore(0)` called by `loadFromSave` for warm/cold restore equivalence; guarded `epoch < 0xffffffff` in `begin`; updated `EVENT_KIND_SUBSCRIBER` for `launched`/`docked`; added v2 save key allow-list check and `dispose()` `end()` test | **READY** — Single-plan wave; `files_modified` matches every touched file without editing `src/app/game-session.ts`. |
| **`08-16`** | 9 | `["08-15"]` | Additive probe & tick-hook parity (`probe.ts`, `probe-publisher.ts`, `tick-script.ts`, `tick-parity.test.ts`, `tick-hook.spec.ts`) | Published `probe.sim` inside `if (currentState !== undefined)` and deleted in `withdrawProbe()`; added `\| sim \|` audit row; gated `src/app` against importing `world/store.js`; waited 1 frame after Launch click in e2e parity; called `startNewGame` in case (c); added Vitest jump-parity case | **READY** — Single-plan wave; single additive D-13 probe commit verified by subtractive diff. |

### Strengths

- **Complete traceability of Round 1 and Round 2 review feedback:** Every plan from `08-01` through `08-16` carries both `### Round 1 — 10b4108` and `### Round 2 — 820a435` disposition tables mapping each specialist finding to concrete task actions, `must_haves.truths`, `<acceptance_criteria>`, and `<threat_model>` rows (`T-08-40` through `T-08-46`).
- **End-to-end contract alignment across module boundaries:**
  - **Save-anchor & lifecycle epoch invariant (`08-02` -> `08-05` -> `08-08` -> `08-15` -> `08-16`):** `resetForRestore(0)` in `loadFromSave` guarantees that a warm in-session `Load` and a cold boot `Continue` of any v2 save produce identical `epoch` (`0` at restore, `1` on the next launch or arrival) and identical `worldSeedFor(marketSeed, epoch)`, while `src/persistence/**` and v2 save bytes remain untouched.
  - **Node Vitest vs Browser DOM isolation (`08-04` -> `08-06` -> `08-08` -> `08-10` -> `08-12` -> `08-15` -> `08-16`):** All extracted session controllers can be instantiated and exercised in Node (`vitest.config.ts` `environment: "node"`) without `window` or `document` globals, while `updateProbe()` only publishes `probe.sim` when `currentState !== undefined` and `withdrawProbe()` cleans up `probe.sim`, `probe.test`, `probe.save`, and `probe.saveScreen` on `dispose()`.

### Issues Found

None. No BLOCKER, HIGH, WARNING, or INFO blast-radius defects remain in `08-01-PLAN.md` through `08-16-PLAN.md` at commit `45c689b`.

### Recommendations

1. **Execute waves in strict topological order (`Wave 1` -> `Wave 9`):** Keep the detached-worktree `verify-full` gates at `08-01` (baseline), `08-06` (Step 3), `08-08` (Step 6), and `08-12` (Step 9), and the main-tree `verify-full` gates at `08-15` and `08-16`, as specified.
2. **Pause at `08-02` Task 2 (`checkpoint:decision`):** Confirm the owner's `option-a` (`fmix32`/`mix32`) selection before executing `08-02` Task 3 and downstream core-track plans (`08-05`, `08-07`, `08-09`, `08-11`, `08-13`, `08-15`, `08-16`).

### Overall Assessment

**READY** — All 16 Phase 8 plans (`08-01` through `08-16`) at commit `45c689b` have resolved every Round 1 and Round 2 blast-radius and cross-module contract concern.

---

## Fast Triage Review (reviewer-triage-glm-5-3-flash)

### Summary

Commit `45c689b` ("docs(08): incorporate round-2 review feedback into phase 08 plans", +377/−114 across all 16 plans) genuinely resolves **all 10 Round 2 consensus findings** (3 Blockers, 3 Highs, 4 Warnings) with concrete, mechanically-checkable plan machinery — not cosmetic ledger rows. Every disposition table entry traced maps to a real edit in the same plan's tasks, must-haves, acceptance criteria, or threat model. The dependency frontmatter graph is now complete and acyclic (the two Round-2 `depends_on` gaps in `08-05` and `08-15` are fixed). I found **no blocker and no high**; residual findings are 4 INFO-level citation/wording drifts that do not change any gate's behavior, plus one minor WARNING-level factual mis-statement about a constant that should get a one-word fix before `08-11` executes. **Verdict: READY** — proceed to execution; optionally apply the single-constant wording patch and the line-number drift corrections as a tiny doc commit.

### Round 2 Resolution Verification

| # | R2 Finding (severity, plans) | Verification @ `45c689b` | Status |
|---|---|---|---|
| 1 | **BLOCKER** — `sanitizeEntity` not field-complete; quaternion `normSq` overflow (`1e200`); negative speeds; `ai.params` numerics (08-05/08-11/08-13) | 08-11 Task 2 now has an 8-row field-complete table: `MAX_ENTITY_MAGNITUDE = 1e12` on position/destination, `!Number.isFinite(normSq) \|\| !(normSq > 0)` → repair to `identity()` (matches `src/sim/flight/sanitize.ts:55-59` pattern), negative/`>1e12` speeds→0, `radius`→1, `ownerId`/`spawnTick`/`targetId`/`rng` safe-integer+uint32 repairs, recursive `ai.params` numbers and array elements (copied arrays), and `repairs` base-reset semantics. 08-05 `spawnEntity` validates constructor-only fields (radius `>0 && finite && ≤1e12`, safe-integer non-negative `tick`/`ownerId`, finite pose) without advancing `nextId`. 08-13 fast-check now injects `NaN`/`±Infinity`/`-0`/`1e200`/negatives across **all** numeric leaves and asserts `hashWorld` does not throw + `parseWorldSnapshot` accepts | ✅ RESOLVED |
| 2 | **BLOCKER** — warm in-session `Load` vs cold boot `Continue` epoch divergence (08-15) | New `resetForRestore(epoch?=0)` op on `WorldLifecycle`; `loadFromSave` calls it inside the synchronous install block, only after a successful read/parse, then `resume(nextSeed)` for inFlight/launching (docked leaves `world === undefined`). Mandatory Node test (i)–(iii) proves warm Load after epoch 2 produces `epoch 0` → `1` on next arrival/launch with identical `worldSeedFor`, identical to cold Continue; failed parse leaves epoch 2 and world untouched. PROJECT.md Key Decisions row + `T-08-45` record the Phase 11 `SAVE-07` hand-off (`resetForRestore(save.epoch)`) | ✅ RESOLVED |
| 3 | **BLOCKER** — `compareProbeShapes` empty-array wildcard blinds the FOUND-10 freeze (08-01) | Wildcard removed: empty `"[]"` matches empty only; non-empty sets must match in both directions; new `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS = []` (starts empty, allow-list with reason + SUMMARY justification); unit test now reports `[]` vs `["a"]` **and** `["a"]` vs `[]`; old bogus "reports nothing" case deleted; acceptance `rg` added; threat `T-08-40` recorded | ✅ RESOLVED |
| 4 | **HIGH** — event-router 1-vs-2 subscriber contradiction + `ctx` wiring + `08-15` `files_modified` (08-10/08-15) | 08-10 changes signature to `createEventRouter(ctx, subscribers)` and replaces the "exactly one subscriber" test with a declarative `EVENT_KIND_SUBSCRIBER: Record<string, readonly string[]>` tuple map (14 kinds → `[subscriber]`); 08-15 wires `worldLifecycle` inside `event-router.ts` via `ctx.core.worldLifecycle` (no `game-session.ts` edit needed, consistent with its `files_modified`), maps `launched`/`docked` to `["stationFlow", "worldLifecycle"]`, and adds full side-effect-order logs (stationFlow completes before lifecycle) | ✅ RESOLVED |
| 5 | **HIGH** — `worldSeedFor`/`forkSeed` uint32 `RangeError` vs "never throw inside a fixed step" (08-02/08-05/08-15) | 08-02 doc comments name the guarding callers; 08-05 `store.allocate` refuses `!Number.isSafeInteger(nextId) \|\| nextId > 0xffffffff` (leaves `nextId` unchanged); 08-15 `begin` checks `epoch >= 0 && epoch < 0xffffffff` and non-finite seed → refuse without throwing; `resume` checks `epoch <= 0xffffffff`. Behavior test: `resetForRestore(0xffffffff)` then `begin(s)` changes nothing, no `RangeError` | ✅ RESOLVED |
| 6 | **HIGH** — `isNeverSpawned` world-stream co-commitment, plain-uint32 `rng` encoding, non-dead `MAX_ENTITIES` cap (08-05/08-13) | `isNeverSpawned` now also requires `world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world")` with doc comment on the draw⟹spawn co-commitment; serialize prose split into two unambiguous sentences (`rng=<uint32>` = `world.rng.s`, matching entity streams); dedicated test: `rngNext(world.rng)` on an empty world flips the predicate and emits the three header lines; cap explicitly non-dead (`live.filter(e => !e.dead).length`), with the 256-non-dead + kill-3-before-commit + spawn-3-same-tick case; fast-check asserts non-dead count and `nextId < FIRST_DYNAMIC_ID + 65536`; 08-13 pins `snapshot.rng === world.rng.s` + world-level codec rows | ✅ RESOLVED |
| 7 | **WARNING** — `withSimProbe` `__purity_` prefix + SPDX, rng-scan `ENOENT` skip, recursive AI-zone globs, `Reflect.get`/`.sort.call`/`queueMicrotask`/`self` bans, Frame-scan widening (08-03/08-09/08-02) | `withSimProbe` normalizes basenames to `__purity_` and prepends the two-line SPDX header; `listTsFiles` skips `__purity_*` and tolerates transient `ENOENT`; `rng.test.ts` scan skips `__purity_*`; AI-zone blocks now `src/sim/ai/*.ts`, `src/sim/ai/*/*.ts`, and a depth≥3 catch-all that rejects all imports; nested probes `ai/nested/__purity_ban_store.ts` and `ai/pilots/roles/__purity_ban_store.ts`; new export-surface seal describe over `ids.ts`/`math.ts`/`view.ts`/`control.ts`; `SIM_GLOBAL_BANS` += `queueMicrotask`, `self`; `SIM_SYNTAX_BANS` += `Reflect.get` and `sort\|toSorted` via `call\|apply\|bind` with failing probes; `sim-purity.test.ts` strips block comments and scans the full brace-matched `*Frame*` body with a >30-line unit test | ✅ RESOLVED |
| 8 | **WARNING** — unguarded `document`/`window` in Node Vitest; `onLaunchKeyDown` omitted from inventories (08-06/08-08/08-10/08-12) | `syncHeaderCredits` (08-08), `closeSaveScreen` (08-08), `syncStatusOverlay` (08-10) each get `typeof document === "undefined"` guards; `window.addEventListener` registrations stay in `game-session.ts` during 08-06 and move to `start-session.ts` in 08-12 with `typeof window !== "undefined"` guards and `{ capture: true, signal: uiController.signal }`; `onLaunchKeyDown` explicitly listed in both 08-06 and 08-12 | ✅ RESOLVED |
| 9 | **WARNING** — snapshot parser hardening, post-`dispose` async guards, static/registry/probe immutability (08-13/08-08/08-12/08-14/08-15/08-05/08-09/08-16) | `parseWorldSnapshot`: safe-integer `nextId` in `101..0xffffffff` and `> maxId`, `1e12` magnitude cap, `MAX_SNAPSHOT_STRING_LENGTH = 128`/`MAX_SNAPSHOT_PARAM_LENGTH = 64`, unknown-own-key and `__proto__`/`constructor`/`prototype` rejection on **every** object, no nested objects in `ai.params`; `restoreWorld` deep-copies all nested objects (post-restore mutation test added). `loadFromSave`/`clearSaveForNewGame`/`queueSnapshot` short-circuit on `ctx.runtime.disposed` after each await; `swapSystem`'s untracked rAF is now tracked/cancelled and guarded; `advanceTicks` refuses when `disposed` (before taint/drain) and stops early on dispose; `STATIC_ENTITIES` + records `Object.freeze`d, `AI_REGISTRY` + `TEST_PILOT` frozen; `dispose()` calls `withdrawProbe()`; probe-mutation test; `src/app` gated against importing `src/sim/world/store.js`; anchored-save check upgraded from substring to `Object.keys` v2 allow-list; `08-15` `depends_on` += `08-13` | ✅ RESOLVED |
| 10 | **WARNING** — freeze-branch `pending` clear test, lazy `WorldView` by default, player-first mismatch reporting, `probe.sim` menu-mode guard, `depends_on` gaps (08-10/08-12/08-11/08-13/08-16/08-05/08-15) | 08-10 pins `pending.length = 0;` ×4 and adds the drain/refusal cases; 08-12 adds it to the pinned-literal audit and to the frame-phase-order test; 08-11 makes lazy `createWorldView` the **default** (`view ??= …` only when an AI timer/event is due); 08-13's 1,000-tick reporter compares `hashFlight(livePlayer)` vs `hashFlight(restoredPlayer)` first; `probe.sim` published inside `if (currentState !== undefined)`, deleted when undefined and by `withdrawProbe()`, `\| sim \|` row added to the audit table, `startNewGame(page)` added to tick-hook case (c); `08-05` `depends_on: ["08-02","08-03"]` and `08-15` `depends_on: ["08-14","08-11","08-13"]` | ✅ RESOLVED |

### Plan-by-Plan Assessment (08-01 through 08-16)

| Plan | Wave / deps | Round-2 items | Triage verdict |
|---|---|---|---|
| 08-01 | 1 / [] | R2-01 (BLOCKER wildcard), R2-02 (SUMMARY justification) | ✅ Clean. Wildcard removed both directions; acceptance greps added; also fixed the run-on acceptance-criterion line from the prior commit. |
| 08-02 | 1 / [] | R2-01 (scan race), R2-02 (RangeError callers), R2-03 (eight draws + frozen-baseline note); R2-04 rejected w/ reason | ✅ Clean. Draw count corrected to eight (matches `arrival.ts:72-104`); `__purity_` skip + `ENOENT` tolerance in the `src/sim` scan; guard-caller doc note names the exact enforcing plans. |
| 08-03 | 1 / [] | R2-01 (`__purity_`+SPDX), R2-02 (reflection/sort.call/queueMicrotask/self bans + Frame widening), R2-03 (destructuring note) | ✅ Clean. Adds `tests/guards/sim-purity.test.ts` to `files_modified` consistently with its new Task 1 step 3. Minor residual: `xs.sort.call(...)` identifier-object form still unprobed (INFO below). |
| 08-04 | 2 / [08-01] | R2-01 (coverage-floor check), R2-02 (`withdrawProbe`); Pick facets rejected per D-12 | ✅ Clean. `withdrawProbe` created here and consumed by 08-12/08-16 consistently. |
| 08-05 | 2 / [08-02, **08-03**] | R2-01 (spawn validation), R2-02 (isNeverSpawned/rng/cap), R2-03 (nextId guard), R2-04 (freeze + depends_on) | ✅ Clean. All four adopted; `depends_on` gap fixed. Spawn validation domain (1e12) matches 08-11/08-13. |
| 08-06 | 3 / [08-04] | R2-01 (no `window` listeners at construction; `onLaunchKeyDown` stays) | ✅ Clean. Consistent with 08-12's move-into-`start-session.ts` hand-off. |
| 08-07 | 3 / [08-05] | (none) + 1 rejected forward-looking note | ✅ Clean — correctly untouched; no plan drift introduced. |
| 08-08 | 4 / [08-06] | R2-01 (document guards), R2-02 (disposed short-circuits) | ✅ Clean. Disposal tests (e) named; threat `T-08-42` added; anchors match real source (`saveBoot.store.read()`, `store.clear(currentRevision)`). |
| 08-09 | 4 / [08-07, 08-03] | R2-01 (recursive globs + export seal), R2-02 (frozen registry), R2-03 (wake-before-think case) | ✅ Clean. Depth-3 catch-all is stricter than requested (all imports rejected) but closes the bypass; wake case integrated and cross-referenced to 08-11. |
| 08-10 | 5 / [08-08] | R2-01 (ctx + tuple map), R2-02 (syncStatusOverlay guard), R2-03 (pending ×4) | ✅ Clean, but line citations `:2744`/`:2755`/`:2852` are off by 6–7 lines (actual 2738/2749/2859 — INFO). |
| 08-11 | 5 / [08-09] | R2-01 (field-complete sanitize), R2-02 (lazy view default), R2-03 (wake case) | ✅ Clean. 8-row table is exact and self-consistent. One wording mis-statement: `MAX_ENTITY_MAGNITUDE = 1e12` claimed to "match `MAX_SAVE_POSITION_MAGNITUDE`", which is actually **1e9** (`src/persistence/save.ts:123`) — WARNING. |
| 08-12 | 6 / [08-10] | R2-01 (pending pin + dispose.test.ts read), R2-02 (onLaunchKeyDown/window guards), R2-03 (swapSystem rAF + timer gate) | ✅ Clean. Timer acceptance grep (`setTimeout\|setInterval\|queueMicrotask` at zero) added. |
| 08-13 | 6 / [08-11] | R2-01 (aligned parser + full-leaf fast-check), R2-02 (hardened boundary), R2-03 (uint32 rng + player-first reporter) | ✅ Clean. `MAX_SNAPSHOT_MAGNITUDE = 1e12` consistent with 08-11. Ambiguous parenthetical "(1e308)" in the rejection list (INFO). |
| 08-14 | 7 / [08-12] | R2-01 (disposed refusal), R2-02 (chart-open early-stop case) | ✅ Clean. Both variants in `<behavior>`; `disposed` checked first. |
| 08-15 | 8 / [08-14, 08-11, **08-13**] | R2-01 (resetForRestore — BLOCKER), R2-02 (ctx wiring + routing table), R2-03 (epoch overflow), R2-04 (dispose end()/allow-list/depends_on); R2-05 deferred to Phase 12 | ✅ Clean. `begin`/`resume` guard domains consistent with 08-02's contract; warm/cold equivalence test is mandatory and concrete. |
| 08-16 | 9 / [08-15] | R2-01 (probe.sim guard + `\| sim \|` + startNewGame), R2-02 (store-import gate + mutation test + setSpeed taint recheck), R2-03 (frame-wait + jump parity + PROJECT.md deferral + tick-script supersession note) | ✅ Clean. Subtractive fixture-diff proof unchanged; jump-lifecycle Vitest case added with exact epoch/seed assertions. |

### Strengths

- **The dispositions are load-bearing, not cosmetic.** Every R2 ledger row points at specific task steps, must-have truths, acceptance `rg`/`node -e` gates, and new threat IDs (`T-08-40`…`T-08-46`) that a verifier can check mechanically at execution time.
- **Cross-plan contracts are now consistent end-to-end:** the numeric domains (`1e12` magnitude, uint32 streams, safe-integer ids, `normSq` rule) agree across 08-05/08-11/08-13; the lifecycle guard contract in 08-15 matches 08-02's documented callers; `withdrawProbe` is defined in 08-04 and consumed in 08-12/08-16; `EVENT_KIND_SUBSCRIBER` is introduced in 08-10 in exactly the shape 08-15 extends.
- **Warm/cold restore equivalence is now proven, not assumed** — the round-2 BLOCKER got both the operation and a mandatory three-part Node test plus a PROJECT.md hand-off for Phase 11.

### Issues Found

- **WARNING** — **Plan/Task:** 08-11, Task 2 sanitize row 1 (`08-11-PLAN.md:162`). **Description:** The row states `MAX_ENTITY_MAGNITUDE = 1e12` "matching `MAX_SAVE_POSITION_MAGNITUDE`", but the actual constant in `src/persistence/save.ts:123` is `1e9`. **Fix:** One-word edit: change "matching" to "superset of (`MAX_SAVE_POSITION_MAGNITUDE` = 1e9; sim cap deliberately wider at 1e12)" or drop the reference.
- **INFO** — **Plan/Task:** 08-10 Task 2 step 3; 08-12 Task 1 step 4. **Description:** Line citations for the `pending.length = 0` sites are `:2744`/`:2755`/`:2852`, whereas actual lines are 2738, 2749, 2773, 2859. **Fix:** Update the three citations.
- **INFO** — **Plan/Task:** 08-13, Task 2 behavior list (`08-13-PLAN.md:133`). **Description:** "a position or radius exceeding `MAX_SNAPSHOT_MAGNITUDE` (`1e308`)" reads as if the cap were 1e308; the parenthetical is the *test's exceeding input value* (the cap is 1e12). **Fix:** Reword to "exceeding `MAX_SNAPSHOT_MAGNITUDE` (e.g. `1e308`)".
- **INFO** — **Plan/Task:** 08-03, Task 2 step 1. **Description:** Add one clause to the residual-forms comment naming the identifier-receiver `.sort.call` form (`xs.sort.call(xs2)`).
- **INFO** — **Plan/Task:** 08-09, Task 3 step 1 (depth≥3 block). **Description:** The depth-3 catch-all rejects *all* imports rather than providing an allow-list. Safe for Phase 8; optionally note in the block comment that depth-3 AI modules are intentionally banned pending an explicit allow-list.

### Recommendations

1. (Optional, 1-line) Fix the `MAX_SAVE_POSITION_MAGNITUDE` mis-statement in `08-11-PLAN.md:162` before Wave 5 executes (see WARNING above).
2. (Optional, 3-line) Correct the three stale `game-session.ts` line citations in 08-10/08-12 and the `1e308` parenthetical in 08-13 — pure doc hygiene, no gate changes.
3. Proceed to execution.

### Overall Assessment

**READY.** Commit `45c689b` closes all 10 Round-2 consensus findings (3 Blockers, 3 Highs, 4 Warnings) with concrete, verifiable plan machinery and consistent cross-plan contracts; the only findings are one minor WARNING-level wording error and four INFO-level citation/wording drifts, none of which change any gate's behavior.

---

## Consensus Summary

Six independent, source-grounded specialist reviewers (`reviewer-architect-kimi-k3-1-pro` on Kimi K3.1 Pro, `reviewer-correctness-glm-5-3` on GLM-5.3, `reviewer-algorithm-deepseek-v4-pro` on DeepSeek V4 Pro, `reviewer-adversarial-grok-4-7` on Grok 4.7, `reviewer-context-gemini-4-argon` on Gemini 4 Argon, and `reviewer-triage-glm-5-3-flash` on GLM-5.3-Flash) reviewed all 16 Phase 8 plans (`08-01` through `08-16`) at commit `45c689b` following Round 2 replanning. Claude lanes were skipped per user request due to rate limits.

All 6 reviewers confirmed that **all 10 Round 2 consensus findings** (3 Blockers, 3 Highs, and 4 Warnings from commit `820a435`) are substantively resolved in commit `45c689b` with executable task specifications, tests, acceptance criteria, threat-model entries (`T-08-40` through `T-08-46`), and `### Round 2 — 820a435` disposition tables across all 16 plans. Four reviewers (`reviewer-correctness-glm-5-3`, `reviewer-algorithm-deepseek-v4-pro`, `reviewer-context-gemini-4-argon`, and `reviewer-triage-glm-5-3-flash`) returned **READY**, while two (`reviewer-architect-kimi-k3-1-pro` and `reviewer-adversarial-grok-4-7`) returned **NEEDS REVISION** on residual boundary/domain alignment and test-specification edges in `08-05`, `08-11`, `08-13`, `08-15`, and `08-16`.

### Agreed Strengths

- **Complete resolution of Round 2 blockers and architectural seams (`45c689b`)**:
  - **Strict probe-shape comparator (`08-01`)**: The empty-array wildcard in `compareProbeShapes` is removed (`[]` matches only `[]`, with `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS = []` starting empty and tested in both directions).
  - **Warm `Load` vs cold `Continue` epoch equivalence (`08-15`)**: `resetForRestore(epoch = 0)` on `WorldLifecycle` is invoked inside `loadFromSave`'s synchronous install block before `resume(nextSeed)` / `end()`, with mandatory Node tests proving warm `Load` after `epoch = 2` and cold `Continue` produce identical `epoch` (`0` -> `1`) and `worldSeedFor` on the next arrival or launch, and with the Phase 11 `SAVE-07` (`resetForRestore(save.epoch)`) hand-off recorded in `PROJECT.md`.
  - **Declarative event-router fan-out & `ctx` wiring (`08-10`, `08-15`)**: `createEventRouter(ctx, subscribers)` takes `ctx` in Wave 5 and asserts a declarative `EVENT_KIND_SUBSCRIBER` tuple map (12 single-subscriber kinds plus ordered `["stationFlow", "worldLifecycle"]` fan-out on `launched` and `docked`), eliminating the Round 2 test/file-ownership conflict.
  - **Fixed-step RNG totality & empty-world co-commitment (`08-02`, `08-05`, `08-13`, `08-15`)**: `store.allocate` (`nextId <= 0xffffffff`), `spawnEntity` constructor validation, and `worldLifecycle.begin` (`epoch < 0xffffffff`) prevent `worldSeedFor`/`forkSeed` `RangeError` throws inside a fixed step; `isNeverSpawned` checks `world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world")`; `snapshot.rng` is pinned to plain `uint32`; and `MAX_ENTITIES = 256` explicitly counts `!e.dead` entities.
  - **Guard, Node-DOM, and lifecycle hardening (`08-02`, `08-03`, `08-05`, `08-06`, `08-08`, `08-09`, `08-10`, `08-11`, `08-12`, `08-14`, `08-15`, `08-16`)**: `withSimProbe` enforces `__purity_` prefixes and GPL SPDX headers; AI-zone ESLint globs partition `src/sim/ai/**/*.ts` recursively and seal allowed-seam exports; `syncHeaderCredits`, `closeSaveScreen`, `syncStatusOverlay`, and `window.addEventListener` registrations are guarded for headless Node Vitest runs; post-`await` `disposed` guards, `swapSystem` rAF cancellation, `advanceTicks` disposed refusal, `Object.freeze` on `STATIC_ENTITIES` and `AI_REGISTRY`, and default lazy `createWorldView` are all in place.

### Agreed Concerns

#### Priority 1 — Residual Domain, Boundary, and Test-Contract Gaps (Address Before Executing Owning Plans)

1. **BLOCKER / HIGH (`08-05` Task 1, `08-11` Task 2, `08-13` Tasks 1–2) — Residual domain alignment between `spawnEntity`, `sanitizeEntity`, `parseWorldSnapshot`, and `restoreWorld`, plus non-vacuous `fast-check` post-spawn mutation** *(converged across `architect` [Blocker 1], `adversarial` [High 1], and `correctness` [Warnings 1, 2, 3])*:
   - **Post-spawn injection in `08-13` Task 2's `fast-check` property (`correctness` W1)**: Because `08-05` Task 1 step 5 makes `spawnEntity` refuse invalid constructor fields (`radius <= 0 || !Number.isFinite(radius)`, invalid `tick`/`ownerId`, non-finite pose), passing arbitrary `fc.double()` values directly to `spawnEntity` will cause every spawn to be refused and reduce the 200-run property to an empty world. Specify explicitly in `08-13` Task 2 (`08-13-PLAN.md:140`) that the generator spawns entities with valid constructor args and then **mutates every numeric leaf in place** on the live `Entity` before running `sanitizeEntity` -> `snapshotWorld` -> `parseWorldSnapshot` (and before the converse unsanitized-NaN check).
   - **Counter, quaternion-tolerance, string/array, and key-count alignment across `08-05` / `08-11` / `08-13` (`architect` Blocker 1, `adversarial` High 1, `correctness` W2 & W3)**:
     - **`repairs` counter & spawn IDs/ticks**: `08-11:169` allows any non-negative safe integer for `repairs` (and incrementing at `MAX_SAFE_INTEGER` overflows safe integer range), whereas `08-13:26` caps scalars at `1e12` and counters at `0xffffffff`; similarly `08-05:137` checks `tick`/`ownerId` only for non-negative safe integers while `08-11:166` caps them at `0xffffffff`. Bound `repairs`, `spawnTick`, and `ownerId` (`-1` or `0..0xffffffff`, saturating `repairs` at `0xffffffff`) identically across `spawnEntity`, `sanitizeEntity`, and `parseWorldSnapshot`.
     - **Quaternion unit tolerance in `parseWorldSnapshot` (`correctness` W3)**: `sanitizeEntity` leaves quaternions with `|normSq - 1| <= SANITIZE_QUAT_TOLERANCE (1e-9)` untouched. Pin `parseWorldSnapshot`'s unit-norm check to tolerance `>= SANITIZE_QUAT_TOLERANCE` and add one acceptance row (`normSq = 1 + 5e-10` accepted) plus an underflowed non-zero quaternion rejection row (`{w: 1e-200, x: 1e-200, y: 1e-200, z: 1e-200}` rejected).
     - **String/array/key caps & structural `ai.params` (`architect` Blocker 1, `adversarial` High 1, `correctness` W2)**: Add `MAX_AI_PARAMS_KEYS = 32` and reject nested arrays (`[[1]]`), non-integer entity IDs (`101.5`, `2 ** 53`), and `__proto__`/`constructor`/`prototype` on **every** object (root, entity, `position`, `orientation`, `rng`, `nav`, `destination`, `ai`, `ai.params`, using `Object.hasOwn`) in `08-13` Task 2's rejection table. In `08-05` `spawnEntity` validate `specKey.length <= MAX_SNAPSHOT_STRING_LENGTH (128)`, and in `08-11` `sanitizeEntity` either enforce/repair `specKey`/param string lengths (`<= 128`), param array lengths (`<= 64`), and param key counts (`<= 32`) or explicitly scope the `08-11`/`08-13` must-have truth to numeric leaves.
     - **`restoreWorld` validation & `snapshotWorld` anti-alias test (`adversarial` High 1)**: Have `restoreWorld` validate its input through `parseWorldSnapshot` (or share the validator) so `restoreWorld` is not an unchecked second entry point, and add a unit test in `08-13` mutating `snapshotWorld(world).entities[0].position.x` and asserting `entityHashes(world)` is unchanged.

2. **HIGH (`08-15` Task 3, `08-15-PLAN.md:35,206`) — Anchored-save test calls `snapshotForSave(inputs)` with a `SaveInputs` object instead of positional arguments** *(flagged by `architect` [High 2])*:
   - `buildSnapshotInputs()` (`src/app/game-session.ts:1131-1152`) returns a `SaveInputs` object (`{ state, profile, system, station, market, commodities, targetSystemId }`), whereas `snapshotForSave` (`src/persistence/autosave.ts:66-74`) takes 7 positional arguments `(state, profile, system, station, market, commodities, targetSystemId?)`. Calling `snapshotForSave(inputs)` in `08-15` Task 3 will fail `typecheck` or crash at runtime reading `profile.cargo` from an `undefined` second argument.
   - **Required fix**: In `08-15` Task 3 (`08-15-PLAN.md:35,206`), assert `Object.keys(inputs).sort()` and `JSON.stringify(inputs)` directly on the `SaveInputs` object returned by `buildSnapshotInputs()` (or pass the positional fields of `inputs` into `snapshotForSave`).

#### Priority 2 — Targeted Warnings & Documentation Hygiene

3. **WARNING (`08-16` Task 1, `08-16-PLAN.md:125,162`; `08-05` Task 1) — `createTestHook` optional `sim` parameter vs required `WegoliteTestHook.worldHash`, and `probe.sim` anti-mutation assertion** *(flagged by `architect` [Warning 3], `adversarial` [Warning 3], and `correctness` [Info 4])*:
   - `08-16` Task 1 step 1 makes the 5th `sim` parameter of `createTestHook` optional while making `worldHash(): number` required on `WegoliteTestHook`. Make `sim` required on `createTestHook` and update all factory call sites so the return type is sound without casts.
   - In `08-16` Task 2 step 3 (`08-16-PLAN.md:162`), assert `typeof probe.sim.entities === "number"` and that no property on `probe.sim` aliases `world.store` or any entity object (and optionally expose `liveEntityCount(world)` from `src/sim/world/world.ts` so `probe-publisher.ts` does not read `world.store.live` directly).

4. **WARNING (`08-11` Task 2, `08-11-PLAN.md:162`; `08-13` Task 2, `08-13-PLAN.md:107,133`) — `MAX_SAVE_POSITION_MAGNITUDE` citation (`1e12` vs `1e9`) and parenthetical clarity** *(converged across `algorithm` [Warning 1, Info 2], `triage` [Warning 1, Info 2], and `correctness` [Info 1])*:
   - `08-11-PLAN.md:162` states `(MAX_ENTITY_MAGNITUDE = 1e12, matching MAX_SAVE_POSITION_MAGNITUDE)`, whereas `MAX_SAVE_POSITION_MAGNITUDE` in `src/persistence/save.ts:123` is `1e9`. Either align all three plans (`08-05`, `08-11`, `08-13`) to `1e9` or clarify the parenthetical in `08-11` that `1e12` is a world-local NPC cap wider than player save position's `1e9`.
   - In `08-13-PLAN.md:133`, reword `"exceeding MAX_SNAPSHOT_MAGNITUDE (1e308)"` to `"exceeding MAX_SNAPSHOT_MAGNITUDE (e.g. 1e308)"`, and in `08-13-PLAN.md:107` reword `"slices any param arrays"` to `"copies (via .slice()) any param arrays"`.

5. **WARNING (`08-05` Task 2, `08-03` Task 2, `08-10` Task 2, `08-12` Task 1) — Guard/test precision items** *(flagged by `correctness` [Warning 4, Info 2–3], `adversarial` [Warnings 1–2], and `triage` [Info 1, 3])*:
   - In `08-05` Task 2 (`08-05-PLAN.md:186`), add a dedicated unit test row asserting `createEntityStore({ nextId: 2 ** 32, entities: [] }).allocate(...)` returns `undefined` with `nextId` unchanged, and drop or qualify the `nextId < FIRST_DYNAMIC_ID + 65536` fast-check bound.
   - In `08-03` Task 2 (`08-03-PLAN.md:141-145`), either add selectors/probes for computed `Reflect["get"]`, `Reflect.apply`, and `.sort.apply`/`.bind` or list them in the documented-residuals comment alongside `xs.sort.call`.
   - In `08-12` Task 1 (`08-12-PLAN.md:118,142`), assert every `addEventListener` in `src/app/session` passes `signal: uiController.signal` (or is paired in `dispose`), and refresh the stale `game-session.ts` line anchors (`:2738/:2749/:2773/:2859` instead of `:2744/:2755/:2852`) in `08-10` and `08-12`.

### Divergent Views

- **Whether to run another full review round vs applying targeted plan edits before executing owning waves**: Four reviewers (`correctness`, `algorithm`, `context`, `triage`) judged the 16-plan set `READY` to start Wave 1 immediately after applying small text clarifications, while `architect` and `adversarial` marked `NEEDS REVISION` specifically for the `08-05`/`08-11`/`08-13` domain/snapshot boundary, `08-15`'s `snapshotForSave(inputs)` call signature, and `08-16`'s `createTestHook` parameter optionality. **Resolution**: None of the Round 3 findings affect Waves 1–4 (`08-01`..`08-04`, `08-06`..`08-09`, except the minor residual comment in `08-03` and the `08-05` `specKey`/`ownerId`/`tick` upper-bound alignment). Incorporating the 5 targeted items above into `08-03`, `08-05`, `08-10`, `08-11`, `08-12`, `08-13`, `08-15`, and `08-16` closes every remaining reviewer concern without altering any architectural or wave-dependency boundary.
