---
phase: "08"
slug: "session-split-and-world-core"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-13"
---

# Phase 08 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> The register was authored at plan time (a `<threat_model>` block in each of the 16 plans) and verified by `gsd-security-auditor` against the implementation on 2026-11-13. Evidence (file:line) is in the auditor's report; the Mitigation column names the control.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| URL query → session | `?test=1`, `clock=manual`, `traffic=` flags parsed once at start-up | Untrusted strings; exact-match parsing only |
| Page script → test hook | `window.__wegolite` probe and `probe.test.*` methods (test sessions only) | Tick counts, hash reads; any mutation taints the session |
| Session → persistence | Autosave and manual save through `save-controller` | Game state; tainted sessions refused; world state never saved in Phase 8 |
| Restored data → world | `parseWorldSnapshot` / `restoreWorld`, restored epoch | Untrusted JSON; strict parser with limits from `limits.ts` |
| AI module → world | `src/sim/ai` modules acting through `WorldView` / `ShipControl` | Read-only copies out; bounded, actor-scoped commands in |
| Simulation source → determinism | `src/sim` code under ESLint determinism bans and the AI import zone | Source code; lint and guard tests |
| Test fixtures → gates | Probe-shape fixture, golden pins, re-pointed source scans | Fixture files; write mode gated by env var |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-08-01 | Repudiation | probe-shape fixture write mode | medium | mitigate | Writes gated on `WEGOLITE_PROBE_SHAPE_WRITE=1`; only 08-01 and 08-16 touched the fixture | closed |
| T-08-02 | Tampering | re-pointed source scans | medium | mitigate | `tests/helpers/session-source.ts` throws on a missing facade or empty file set | closed |
| T-08-40 | Tampering | `compareProbeShapes` empty-array wildcard | high | mitigate | Wildcard only for listed paths; list is empty | closed |
| T-08-03 | Repudiation | `createSeededRandom` delegation | high | mitigate | Wraps `rngNext`; literal draw vectors pinned; `arrival.ts` unchanged | closed |
| T-08-47 | Repudiation | aliased or namespace import of the closure RNG | medium | mitigate | Import-aware scans in `rng.test.ts`; lint `importNames` ban | closed |
| T-08-04 | Tampering | `worldSeedFor` / `forkSeed` inputs | medium | mitigate | RangeError on non-finite or out-of-domain inputs; `Object.hasOwn` purpose check | closed |
| T-08-05 | Repudiation | `src/sim` determinism | high | mitigate | `SIM_SYNTAX_BANS`, `SIM_GLOBAL_BANS`, `SIM_RESTRICTED_PROPERTIES` as errors; failing-probe guard test | closed |
| T-08-06 | Tampering | `eslint.config.js` rule replacement | medium | mitigate | Named constants spread into every later block; AI-zone test proves bans still fire | closed |
| T-08-48 | Repudiation | eval, locale and sort-ban bypass forms | medium | mitigate | `no-eval`, `no-new-func`, `no-implied-eval`, `Intl`/`localeCompare`/sort selectors; documented residual | closed |
| T-08-38 | Repudiation | Math.random ban bypass by aliasing | medium | mitigate | Alias and computed-member selectors; `globalThis`/`self` banned; documented residual | closed |
| T-08-59 | Spoofing | entity id held outside `src/sim` | medium | mitigate | `tests/guards/entity-id-scope.test.ts` with controls and vacuity floor | closed |
| T-08-07 | Tampering | `bindTestHook` rebinding after Load | high | mitigate | Rebind only when the hook is enabled; mutations taint; tainted sessions never save | closed |
| T-08-08 | Tampering | ctx rewrite (split step 1) | medium | mitigate | Live fields read through `ctx` at each use; no captured bindings | closed |
| T-08-09 | Denial of service | EntityStore growth | medium | mitigate | `MAX_ENTITIES = 256`; allocation refuses at the cap | closed |
| T-08-10 | Tampering | stale entity references | medium | mitigate | Monotonic ids, dead ids return undefined, counter restarts at 101 per world | closed |
| T-08-41 | Tampering | STATIC_ENTITIES mutation and invalid spawn inputs | high | mitigate | Frozen records; `isLegalSpawn` validates every field before allocation | closed |
| T-08-49 | Tampering | content-derived spawn inputs and world seeds | medium | mitigate | `limits.ts` is the single definer; enum `includes` checks; RangeError in `createWorld` | closed |
| T-08-50 | Repudiation | world hash as a divergence detector | low | mitigate | Type-tagged params, ASCII-escaped strings in `serialize.ts` | closed |
| T-08-11 | Denial of service | settings-controller resume guard | medium | mitigate | Early return on `contextLost`; unit and e2e coverage | closed |
| T-08-35 | Repudiation | split step-3 verify-full evidence | medium | mitigate | SHA 5c34578 and tree recorded in 08-06 SUMMARY; tree hash re-checked | closed |
| T-08-12 | Elevation of privilege | `createShipControl` | high | mitigate | Every method acts only on the actor id | closed |
| T-08-13 | Tampering | `WorldView` returned objects | medium | mitigate | Fresh copies of vectors, quaternions, bodies and ships | closed |
| T-08-51 | Tampering | ShipControl argument domain | medium | mitigate | uint32, magnitude, wake-tick and behaviour-id checks; bad calls ignored | closed |
| T-08-14 | Tampering | autosave guards after the move | high | mitigate | Attempt counter and contextLost/overwrite/taint skips before any write; `src/persistence` unchanged | closed |
| T-08-15 | Tampering | in-session Load rebinding the test hook | medium | mitigate | Rebind after the install block, hook-enabled only; order tested | closed |
| T-08-36 | Repudiation | split step-6 verify-full evidence | medium | mitigate | SHA b9c8f76 and tree recorded in 08-08 SUMMARY; tree hash re-checked | closed |
| T-08-42 | Tampering | post-dispose async continuation | medium | mitigate | `disposed` re-checked after every await in save-controller | closed |
| T-08-16 | Elevation of privilege | `src/sim/ai` import surface | high | mitigate | Case-sensitive allow-list regexes per depth; dynamic import banned | closed |
| T-08-17 | Repudiation | determinism inside the AI zone | high | mitigate | AI blocks spread `SIM_SYNTAX_BANS` and inherit global/property bans | closed |
| T-08-52 | Repudiation | hidden AI state | high | mitigate | `createSeededRandom` import ban; `AI_MODULE_STATE_BANS`; documented residual | closed |
| T-08-43 | Elevation of privilege | nested AI subdirectories and re-export surface | high | mitigate | Depth globs; deepest level rejects every import; frozen registry; re-export seals | closed |
| T-08-18 | Tampering | arrival install block (G-7) | high | mitigate | All throwing work before any live reference moves; failure pauses without saving | closed |
| T-08-19 | Tampering | pre-launch autosave ordering (D-17) | high | mitigate | Autosave from the drained launch before `beginLaunch`; order tested | closed |
| T-08-20 | Denial of service | AI event cycles | medium | mitigate | `MAX_AI_EVENT_PASSES = 8`; overflow dropped, counted and hashed | closed |
| T-08-53 | Denial of service | AI dispatch via corrupted or prototype `aiKey` | high | mitigate | `Object.hasOwn` dispatch; sanitizer nulls unknown keys | closed |
| T-08-54 | Denial of service | AI event fan-out inside the pass cap | medium | mitigate | Per-drain budget and queue length 4096; well-formed event check | closed |
| T-08-21 | Denial of service | NaN entity in the frame loop | high | mitigate | Never-throwing `sanitizeEntity` on every live entity before commit and hash | closed |
| T-08-22 | Elevation of privilege | event handlers | medium | mitigate | Handlers get an actor-scoped ShipControl only; FIFO queued delivery | closed |
| T-08-44 | Denial of service | quaternion overflow, negative speeds, out-of-domain leaves | high | mitigate | Sanitizer orientation, enum, non-negative, uint32 and param-cap repairs; idempotence tested | closed |
| T-08-23 | Denial of service | start-up and dispose ordering | medium | mitigate | Documented order; idempotent `dispose`; order test | closed |
| T-08-37 | Repudiation | split step-9 verify-full evidence | medium | mitigate | SHA 391e788 and tree recorded in 08-12 SUMMARY; tree hash re-checked | closed |
| T-08-24 | Tampering | `parseWorldSnapshot` and `restoreWorld` | high | mitigate | Strict parser with shared limits; typed `SnapshotError`; restore re-parses | closed |
| T-08-55 | Tampering | `snapshotWorld` turning NaN into JSON null | high | mitigate | `requireFinite` over every number leaf before output | closed |
| T-08-56 | Tampering | seed and counter domain at restore, restore precision | medium | mitigate | worldSeed and nextId bounds; single property reads; 1,000-tick equality test | closed |
| T-08-25 | Tampering | prototype pollution across snapshot objects | medium | mitigate | `asObject` rejects `__proto__`/`constructor`/`prototype` and unknown keys; null-prototype params | closed |
| T-08-26 | Spoofing | `parseTestFlags` | medium | mitigate | Exact string comparisons; parsed once | closed |
| T-08-29 | Denial of service | `advanceTicks` argument | high | mitigate | `MAX_ADVANCE_TICKS = 200000`; refusal table; residual accepted (AR-02) | closed |
| T-08-30 | Tampering | hooked state reaching a save | high | mitigate | `markHookMutation()` before the first step; tainted sessions never autosave | closed |
| T-08-31 | Denial of service | manual clock from a shared link | medium | mitigate | `manualClock` requires `?test=1`; inert otherwise | closed |
| T-08-27 | Denial of service | lifecycle inside a step | medium | mitigate | `begin`/`resume` never throw; build before commit; failed arrival returns before `begin` | closed |
| T-08-28 | Tampering | arrival save ordering | medium | mitigate | `begin` before `autosave`; order tested | closed |
| T-08-39 | Denial of service | per-tick world stepping on the hot path | medium | mitigate | Benchmark within bound (08-15 SUMMARY); hash only on demand | closed |
| T-08-33 | Tampering | world state reaching the save | medium | mitigate | Save inputs read no world; identity test with and without a world | closed |
| T-08-45 | Tampering | warm Load vs cold Continue epoch divergence, epoch overflow | high | mitigate | Epoch reset to 0 on restore in both paths; `MAX_EPOCH` guard | closed |
| T-08-57 | Denial of service | saturated or corrupt restored epoch | low | mitigate | Accept only `0..0xfffffffe`, otherwise epoch 0 | closed |
| T-08-32 | Elevation of privilege | hook surface growth | low | mitigate | Only `worldHash` and `advanceTicks` added; no spawn or traffic toggle | closed |
| T-08-34 | Repudiation | probe-shape fixture re-record | medium | mitigate | Diff is purely additive (sim, worldHash, advanceTicks, one new state) | closed |
| T-08-46 | Tampering | `window.__wegolite.sim` mutation or direct store access from `src/app` | medium | mitigate | Fresh primitive object; withdrawn otherwise; store-access gate regex empty | closed |
| T-08-58 | Denial of service | stale or menu-mode hook calls | low | mitigate | `worldHash` returns `""`; `advanceTicks` refuses and returns the tick | closed |
| T-08-SC | Tampering | npm installs (all 16 plans) | low | accept | No dependency or lockfile change in the phase (AR-01) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-08-SC | No package is installed in any Phase 8 plan; `package.json` changed only by one script string, lockfile unchanged. | Plan threat registers (08-01..08-16) | 2026-11-13 |
| AR-02 | T-08-29 (residual) | A page script under `?test=1` can call `advanceTicks` repeatedly and freeze its own tab. Self-denial-of-service on a test-only URL; the taint keeps saves safe and production sessions have no hook. | 08-14 plan (Round 4 review) | 2026-11-13 |

Documented residuals (not open threats): lint-invisible forms for T-08-38, T-08-48 and T-08-52 (`eslint.config.js` header comments), backed by the behavioural tests from plans 08-02 and 08-13.

### Unregistered items carried forward (not counted in threats_open)

- **WR-01 (latent, medium):** `invoke()` in `src/sim/world/step.ts` does not contain a throwing AI module, so a throw would drop that tick's flight events and repeat every tick. Unreachable today (the only module cannot throw). Must be decided before Phases 12, 13 and 22 register real AI. See `08-REVIEW.md`.
- **IN-02:** `spawnEntity` throws on null `ai.params` or a missing position/orientation instead of refusing; relevant once Phase 12's populator calls it from `begin`.
- **IN-08:** a refused `begin` at a saturated epoch leaves the previous world alive; relevant once Phase 11 persists the epoch.
- **Pre-existing (not a Phase 8 regression):** the manual-save overwrite-confirm path does not re-check the test taint after the dialog opens; reachable only from a `?test=1` script, and `advanceTicks` refuses while the Save/Load screen is open.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-13 | 60 | 60 | 0 | gsd-security-auditor (ASVS L1, block_on high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-13
