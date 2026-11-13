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
