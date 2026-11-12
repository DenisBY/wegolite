### Summary

Commit `83c9b5c` materially addresses the Round 1 findings on paper: it adds explicit seed vectors, live-object and ordering characterisations, gate attribution, hot-path measurement, schema/sanitiser properties, and browser/Vitest parity diagnostics. Two cross-plan contracts remain unsafe: warm in-session Loads reuse the wrong world epoch, and the “total” sanitiser does not cover every hashed/snapshotted value. **NEEDS REVISION** before execution; the required changes are local in concept but affect the phase’s core determinism and failure-propagation guarantees.

### Strengths

- The dependency chain is complete and coherent: `08-01..08-03` establish safety nets; each split/core chain converges through `08-10/08-11`, `08-12/08-13`, and `08-14`; `08-15` integrates them and `08-16` is the sole downstream probe change. Same-wave `files_modified` ownership avoids cross-track file collisions.
- `FlightState` remains the player authority and `World` remains dynamic-entity state. Static bodies reference `SystemLayout`, the player is supplied to views per call, and empty-world hashing composes with rather than modifies `serializeFlight` (`08-05`, `08-07`, `08-11`).
- The AI seam has useful structural enforcement: copied views, actor-bound controls, type-only public interfaces, narrow imports, queued cross-entity events, integer timers, and separate registry dispatch (`08-07`, `08-09`, `08-11`). These are stronger than conventions alone.
- The split preserves the actual runtime ordering found in `src/app/game-session.ts`: the pre-launch save precedes launch (`src/app/game-session.ts:2765-2795`), events are handled immediately after stepping (`src/app/game-session.ts:2837-2853`), and the arrival install/autosave order is atomic (`src/app/game-session.ts:2125-2152`). The revised plans pin those paths with behavioural tests rather than relying only on compilation.
- Snapshot discipline is unusually thorough: strict typed boundary errors, id gaps and killed-highest-id cases, key-order independence, an exhaustive entity-field table, and a 1,000-tick equality run (`08-13`). The one additive probe change is also properly sequenced after the freeze (`08-16`).

### Issues Found

#### 1. **Severity: BLOCKER** — Warm `Load` carries the previous session's epoch into a save that never contained it

- **Plan/Task:** `08-15`, Tasks 2 and 3 (also missing from the lifecycle proof in `08-13`, Task 3).
- **Description:** `createWorldLifecycle` starts at epoch 0 and `resume` deliberately leaves the current epoch unchanged (`08-15-PLAN.md:127,162-164`). Start-up constructs a fresh lifecycle, but the in-session `loadFromSave` integration only calls `resume(seed)` for in-flight saves or `end()` for docked saves (`08-15-PLAN.md:171,202`). Its mandatory test explicitly blesses “leaves epoch unchanged” (`08-15-PLAN.md:205`). That is not equivalent to a cold Continue of the same save once the current session has advanced its counter. D-03 keeps epoch out of Phase 8 saves (`08-CONTEXT.md:29-30`), while D-02 promises that reloading and launching reproduces the world (`08-CONTEXT.md:28-30`; `.planning/research/ARCHITECTURE.md:471`). The live loader is intended to follow the exact boot pipeline (`src/app/game-session.ts:1316-1324`), so retaining prior-session world state conflicts with that boundary as well.
- **Concrete failure:** Launch (epoch 1), jump (epoch 2), then use F2 to load an older v2 save. Warm Load leaves epoch 2; a cold page load of the same save creates a lifecycle at 0. The next launch produces epoch 3 in the warm path versus epoch 1 in the cold path. `worldSeedFor` therefore derives different worlds and `probe.sim.epoch` disagrees; once traffic exists, entity streams, ids, hashes, and gameplay diverge solely because Load happened in an existing tab. A docked Load has the same defect on its next launch because `end()` also preserves epoch.
- **Fix:** Introduce an explicit restore/reset operation that sets the save anchor's epoch before creating/ending the restored world. In Phase 8 that value should be whatever a fresh boot of the same v2 save would use (0 under D-03); Phase 11 can supply the persisted anchor value. Apply it only in the successful synchronous install block, for both docked and in-flight Loads, leaving failed parses untouched. Add a test comparing cold Continue versus warm in-session Load of the same blob, followed by another launch and arrival, asserting identical epoch, world seed, next id, and hashes.

#### 2. **Severity: BLOCKER** — The total sanitiser/schema invariant excludes values that the hash serialises

- **Plan/Task:** `08-05`, Task 1; `08-09`, Task 1; `08-11`, Task 2; `08-13`, Tasks 1-2.
- **Description:** `serializeEntity` hashes every entity field and canonicalises every number (`08-05-PLAN.md:135,138`), while `canon` throws on non-finite input (`src/sim/hash.ts:29-34`). Yet `sanitizeEntity` repairs only position, orientation, destination, speed, desired speed/range, and AI timers (`08-11-PLAN.md:160-165`). It does not cover radius, owner id, spawn tick, RNG states, repairs, or numbers inside `AiComponent.params` and its arrays, even though those fields are part of the entity and snapshot (`08-13-PLAN.md:107,139-140`). The fast-check property avoids the contradiction by generating those other fields only from valid domains and never generating non-finite AI params (`08-13-PLAN.md:140`). Thus “no non-finite value can reach the hash” (`08-11-PLAN.md:179`) and “every sanitized world snapshots to JSON the parser accepts” (`08-13-PLAN.md:24`) are stronger than the actual design.
- **Concrete failure:** An AI module computes an overflowing value and stores `NaN` or `Infinity` in `ctx.ai.params`, or a spawn/content mistake produces `radius = Infinity`. The next `worldHash()` still reaches `canon` and throws, despite the per-tick sanitiser. JSON snapshotting changes the same value to `null`, after which the strict parser rejects rather than restores it. The Round 1 NaN-injection test covers position only, so this failure survives every planned proof.
- **Fix:** Make finite validity a field-complete contract, not a selected-field repair list. Validate constructor-only numeric fields at `spawnEntity`, and either validate/repair all mutable serialised numerics (including nested AI params/arrays) or explicitly exclude them from hashing/snapshot with a recorded decision. Extend the exhaustive `Record<keyof Entity, ...>` mechanism to generate invalid-domain cases for every numeric leaf, and test `stepWorld -> hashWorld` and `sanitize -> JSON -> parse` for each path. Keep constructor invariants and repair-count semantics explicit so normalisation does not silently hide corrupt content.

#### 3. **Severity: WARNING** — `08-10` and `08-15` require incompatible event-router ownership tests

- **Plan/Task:** `08-10`, Task 2; `08-15`, Task 1.
- **Description:** `08-10` requires every one of the 14 existing event kinds to have exactly one subscriber and tests one handled entry per dispatch (`08-10-PLAN.md:28,33,155,160-161,174`). `08-15` changes `launched` and `docked` into ordered fan-out to `stationFlow` plus `worldLifecycle` (`08-15-PLAN.md:130`) but simultaneously instructs the executor to preserve the one-handler-per-kind assertions unchanged (`08-15-PLAN.md:131`). Those requirements cannot all pass. Removing the assertion without replacing its routing guarantee would also permit accidental extra business side effects.
- **Fix:** Replace the invariant with an explicit ordered routing table: each kind has exactly one gameplay subscriber, and only `launched`/`docked` additionally have the whitelisted lifecycle subscriber. Update the `08-10` truth accordingly. In `08-15`, assert exact per-kind subscriber sequences for all 14 kinds, and add full side-effect logs for launched and docked proving `stationFlow` completes before `worldLifecycle`; retain the emission-order and reserved-kind pass-through tests.

#### 4. **Severity: SUGGESTION** — Do not make the whole mutable `SessionState` the permanent boundary of every extracted module

- **Plan/Task:** `08-04`, Task 1, propagated by `08-06`, `08-08`, `08-10`, `08-12`, `08-14`, and `08-15`.
- **Description:** The extraction moves the closure's variables into one shared object (`08-04-PLAN.md:115-119`) and every controller factory receives that same object. This removes stale lexical captures but does not constrain authority: a render/probe controller can write flight, save, or world state; a station/save controller can bypass the sim driver; and later changes can introduce hidden ordering dependencies that the type system cannot catch. The file split would otherwise look complete while retaining the monolith's coupling.
- **Fix:** Keep the concrete shared `SessionState` for behaviour-neutral extraction, but give each factory a narrow structural context facet (`Pick`/nested picks) plus explicit command/callback capabilities. In particular, reserve world mutation for lifecycle and sim-driver contexts and give read-only publishers read-oriented facades. This can be introduced without changing runtime objects or the nine-name public facade, and will make the boundary enforceable rather than merely documented.

### Missing Coverage

- **Warm-versus-cold restore equivalence:** No planned test loads the same old save through both boot Continue and in-session Load and then performs another populate. Current tests only assert the incorrect “epoch unchanged” behaviour.
- **Full numeric-domain failure propagation:** There is no NaN/Infinity case for AI params (including arrays), radius, owner id, spawn tick, stream states, repairs, or world-level numeric fields, despite those fields entering the hash/snapshot schema.
- **Non-vacuous traffic parity:** The D-05 checks use `populateNothing` or a recording callback (`08-15-PLAN.md:33,162`). They prove the lifecycle itself has no conditional, not that a real traffic-on populator and traffic-off path consume identical id/epoch sequences. Record this as a deferred integration proof or add a conditional spawning fake with the intended off-path id reservation semantics.
- **Manual-launch handshake:** The browser parity case clicks Launch and immediately calls `advanceTicks(1)` (`08-16-PLAN.md:162`) without waiting for a frame to transfer the station action into the driver's pending commands. On a slow frame the launch can be applied one tick later than the Node script, making parity timing-dependent. Wait on `probe.frames` after the click before stepping.
- **Lifecycle side effects inside tick stepping:** `08-16` explicitly leaves hyperspace parity unproven (`08-16-PLAN.md:189`). At least one successful and one failed jump through `advanceTicks` should compare tick, epoch, world identity/seed, pause state, and hash so the shared event path is proven beyond launch/fly.

### Recommendations

1. Resolve the save-anchor epoch contract first and add warm/cold equivalence tests before implementing `08-15`; otherwise later world determinism will depend on tab history.
2. Define one field-complete validity invariant across `Entity`, `hashWorld`, `sanitizeEntity`, and `WorldSnapshot`; drive invalid-domain tests from that same field map in `08-05`, `08-11`, and `08-13`.
3. Make event routing a declarative ordered table and align `08-10`/`08-15` before changing the router; test both individual arm order and whole-event side-effect order.
4. Treat shared `SessionState` as an implementation carrier, not a public capability bundle; add per-module facets as each controller is extracted rather than allowing all modules unconstrained writes.
5. Close the remaining non-vacuity gaps: a real conditional-populator parity proof when traffic exists, an explicit launch-drain wait in browser parity, and one jump lifecycle case through `advanceTicks`.

### Overall Assessment

**NEEDS REVISION.** The Round 1 architectural warnings and high-risk execution concerns are mostly resolved with concrete, source-grounded gates, and the wave/dependency plan is sound. The two blockers are nevertheless in foundational contracts: restoring a world must not depend on the previous tab's epoch, and every value admitted to the hash/snapshot path must have defined non-finite handling. The router contradiction and broad mutable context should also be corrected during revision so the split remains executable and creates maintainable boundaries.

### Reviewed Plans

- 08-01
- 08-02
- 08-03
- 08-04
- 08-05
- 08-06
- 08-07
- 08-08
- 08-09
- 08-10
- 08-11
- 08-12
- 08-13
- 08-14
- 08-15
- 08-16
