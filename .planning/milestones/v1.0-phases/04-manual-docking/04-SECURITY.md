---
phase: 04
phase_name: Manual Docking
status: secured
verdict: SECURED
threats_total: 56
register_rows: 60
threats_open: 0
blocking_open: 0
non_blocking_open: 0
asvs_level: 1
block_on: high
audited: 2026-11-05
auditor: gsd-security-auditor
---

# Phase 04 — Manual Docking: threat verification

**Scope.** Every threat in the five plan `<threat_model>` registers (`T-04-01` … `T-04-55`, plus `T-04-SC`) verified against the implemented source, not against plan intent or SUMMARY prose. `asvs_level: 1` (mitigation must be **present** in the cited file) with deeper boundary checks where the declared mitigation is a rule (gating, ordering, frames) rather than a checksum.

**Counts.** `register_rows: 60` is the number of rows across the five plan registers (`T-04-SC` appears in all five); `threats_total: 56` is the number of unique threat IDs, which is what the verdict is computed over.

**Configuration.** `security_asvs_level: 1`, `security_block_on: high` (severity order critical > high > medium > low; only `high`/`critical` open threats block).

**Verification runs (Docker only).**
- `docker compose run --rm test npx vitest run tests/persistence tests/sim tests/content src/content tools/oolite-ingest/convert/dock-port.test.ts` → **238 passed / 26 files**.
- `docker compose run --rm assets npm run assets:check` → `assets:check: no differences`.
- `docker compose run --rm e2e … tests/e2e/autosave.spec.ts tests/e2e/docking.spec.ts --workers=1` → **14 passed**. A default-worker (2) run hit three timeouts in the same specs (SwiftShader frame contention, see Observations); each failing spec is green in isolation and with one worker, so the failures are environmental, not mitigation gaps.

**Disposition note.** Threats marked `accept` in a plan are cross-plan delegations, not residual risk: each names the owning plan in the same phase. Their verdict below follows the owning plan's implementation (e.g. `T-04-03` → `04-05` `parseSave`). No accepted-risk entry without a mitigation exists, so the accepted-risk log is empty.

## 04-01 — dock geometry content build

| ID | Description | Mitigation | Evidence (file:line) | Verdict |
|----|-------------|-----------|----------------------|---------|
| T-04-01 | `dock-port.json` drift / tampering | `emitted[]` registration + manifest hash + `assets:check` + golden test | `tools/oolite-ingest/generate.ts:141-145`; `src/content/generated/manifest.json:124-128`; `tools/oolite-ingest/cli.ts:140,197,214-224`; `tools/oolite-ingest/convert/dock-port.test.ts:191`; `src/content/dock-port.test.ts:103-109` | MITIGATED |
| T-04-02 | Zero/NaN aperture hangs the ×1.25 loop | Schema requires finite, `> 0`, `≤ 1e5`; emitter loop capped with progress check; 0/−1/NaN/Infinity tests | `src/content/schemas/dock-port.ts:22-34,86-94`; `tools/oolite-ingest/convert/dock-port.ts:148-171`; `src/content/dock-port.test.ts:122-147` | MITIGATED |
| T-04-03 | Untrusted save data (IndexedDB) — *accepted here, owned by 04-05* | Strict `parseSave` + allow-lists | `src/persistence/save.ts:56-74,111-157`; `src/main.ts:123-156` | MITIGATED (delegated) |
| T-04-04 | Shift+C / keyboard — *accepted here, owned by 04-04* | Shift-required chord dispatch | `src/input/keyboard.ts:44-46,107-125`; `tests/input/bindings.test.ts:202-247` | MITIGATED (delegated) |
| T-04-05 | Save DoS / resource exhaustion — *accepted here, owned by 04-05* | Size cap before parse, field caps | `src/persistence/save.ts:36-54,118`; `tests/persistence/save.test.ts:187-207` | MITIGATED (delegated) |
| T-04-33 | Subnormal/`MAX_VALUE` geometry: no-progress loop or overflowing span | 64-iteration cap, `next > current`, finite check per step; schema range `[1e-3, 1e5]` | `tools/oolite-ingest/convert/dock-port.ts:148-171`; `src/sim/dock/corridor.ts:98-123`; `src/content/schemas/dock-port.ts:22-31`; `src/content/dock-port.test.ts:122-147`; `tools/oolite-ingest/convert/dock-port.test.ts:279-284` | MITIGATED |
| T-04-34 | Bare filename writes outside the generated root, invisible to the drift gate | `DOCK_PORT_PATH` constant, output-root containment, manifest-row assertion | `tools/oolite-ingest/convert/dock-port.ts:36`; `tools/oolite-ingest/generate.ts:85-94,147-151`; `tools/oolite-ingest/convert/dock-port.test.ts:125`; `src/content/dock-port.test.ts:103-109` | MITIGATED |
| T-04-35 | Hull-only proxy misses the faceplate (−534.298) | `contact` = union(hull, tris, faceplate); schema refine; pinned test | `tools/oolite-ingest/convert/dock-port.ts:119-131,236-240`; `src/content/schemas/dock-port.ts:123-131`; `tools/oolite-ingest/convert/dock-port.test.ts:201-228` | MITIGATED |
| T-04-SC | Supply-chain installs | No packages added in phase | `git diff 4500cfc..HEAD -- package.json package-lock.json` empty; no `idb`/`fake-indexeddb` in `package.json` | MITIGATED |

## 04-02 — corridor, snapshot, arming

| ID | Description | Mitigation | Evidence (file:line) | Verdict |
|----|-------------|-----------|----------------------|---------|
| T-04-06 | Expansion loop with bad aperture | `createDockGeometry` rejects non-finite/≤0; bounded expand helper with progress check | `src/sim/dock/geometry.ts:91-118,166-209`; `src/sim/dock/corridor.ts:82-123`; `tests/sim/dock-corridor.test.ts:393-410` | MITIGATED |
| T-04-07 | NaN/Infinity pose writes NaN into state | Non-finite snapshot → `outside`/no mutation; hook rejects non-finite | `src/sim/dock/corridor.ts:169-180,283`; `src/sim/dock/step.ts:146-148`; `src/app/probe.ts:229-271`; `tests/sim/dock-corridor.test.ts:287-298` | MITIGATED |
| T-04-08 | `?test` hook elevation | Exact `?test=1` gate; every mutation sets `testTainted`; published in probe; autosave refuses | `src/main.ts:1108-1120`; `src/app/game-session.ts:263-265,406-416,692`; `src/app/probe.ts:221-291`; `tests/e2e/docking.spec.ts:140-150` | MITIGATED |
| T-04-09 | Untrusted save data — *accepted here, owned by 04-05* | Strict schema + allow-lists | `src/persistence/save.ts:56-74,136-154` | MITIGATED (delegated) |
| T-04-10 | Shift+C / keyboard — *accepted here, owned by 04-04* | `REQUIRES_SHIFT` chord | `src/input/keyboard.ts:44-46,107-125` | MITIGATED (delegated) |
| T-04-11 | Resource exhaustion per tick | O(1): 8 corners, one frame, one box; allocation bound stated | `src/sim/dock/corridor.ts:186-255`; `src/sim/dock/step.ts:133-231`; `tests/sim/dock-cadence.test.ts` | MITIGATED |
| T-04-36 | Disarmed launch window clips the hull with no unstick | Disarmed branch clamps a ship past the tunnel end, positional only | `src/sim/dock/step.ts:150-157`; `tests/sim/launch.test.ts`; `tests/sim/dock-integrated.test.ts` | MITIGATED |
| T-04-37 | False roll fixture accepts a non-fitting ship | Computed boundary (±0.01 of 31.296°) with 30° pass / 35° fail | `tests/sim/dock-corridor.test.ts:349-380` | MITIGATED |
| T-04-38 | Unbounded expansion at runtime from forged geometry | 64-iteration cap, `next > current`, `DockGeometryError`, range checks | `src/sim/dock/corridor.ts:36,98-123`; `src/sim/dock/geometry.ts:28,100-108`; `tests/sim/dock-corridor.test.ts:393-410` | MITIGATED |
| T-04-53 | Band/straddle without a nose gate straddles the wings-across launch pose | `box.min.z < 0` gate before band/straddle; lane branch separate; arming past the proxy | `src/sim/dock/corridor.ts:288-312`; `src/sim/dock/step.ts:160`; `tests/sim/dock-corridor.test.ts:196-241` | MITIGATED |
| T-04-SC | Supply-chain installs | No packages added | `package.json` unchanged | MITIGATED |

## 04-03 — contact response, sanitize, feedback

| ID | Description | Mitigation | Evidence (file:line) | Verdict |
|----|-------------|-----------|----------------------|---------|
| T-04-12 | NaN/Infinity impulse or extreme speed freezes the sim | `sanitizeFlightState` at the top of `stepFlight`, speed clamped to `maxSpeed × TORUS_MAX_FACTOR` (1024) | `src/sim/flight/step.ts:64`; `src/sim/flight/sanitize.ts:38-102`; `src/sim/flight/torus.ts:39`; `tests/sim/dock-hull.test.ts:253-277` | MITIGATED |
| T-04-13 | Scrape message flood at 120 Hz | ≥ 1 s simulated-time throttle at the app boundary | `src/app/dock-feedback.ts:43-50`; `src/app/game-session.ts:628-640` | MITIGATED |
| T-04-14 | Untrusted save data — *accepted here, owned by 04-05* | Strict `parseSave` | `src/persistence/save.ts:111-157` | MITIGATED (delegated) |
| T-04-15 | Shift+C / keyboard — *accepted here, owned by 04-04* | Shift-required chord | `src/input/keyboard.ts:44-46,107-125` | MITIGATED (delegated) |
| T-04-16 | Resource exhaustion in the property test / per tick | 15 fixed SAT axes; bounded fuzz (`numRuns: 30`, ≤ 2000 ticks) | `src/sim/dock/hull.ts:117-135,155-182`; `tests/sim/dock-no-trap.test.ts:177-180` | MITIGATED |
| T-04-17 | XSS via event copy | Fixed app-owned strings, `textContent`/canvas text only | `src/app/game-session.ts:284-296,607-614,624-639`; `src/ui/docked.ts:73-95` | MITIGATED |
| T-04-39 | Straddle tick also runs the hull predicate → double response | Strictly ordered exclusive pipeline; one response per tick | `src/sim/dock/step.ts:166-231`; `tests/sim/dock-no-trap.test.ts:211-231` | MITIGATED |
| T-04-40 | No-trap oracle accepts an embedded/endlessly bouncing ship | SAT-based non-penetration, outward separation, retry-within-30-ticks, deterministic seeds | `tests/sim/dock-no-trap.test.ts:119-182`; `src/sim/dock/hull.ts:225-230` | MITIGATED |
| T-04-41 | 1e308 speed integrates to Infinity; NaN pose poisons the hash | Repair + clamp before integration; `repairCount` asserted | `src/sim/flight/sanitize.ts:92-101`; `tests/sim/dock-hull.test.ts:254-277` | MITIGATED |
| T-04-42 | Hull-only box misses visible faceplate contact | Contact uses the emitted union box; one-frame `contactPort` | `src/sim/dock/geometry.ts:194-209`; `src/sim/dock/hull.ts:199-222`; `tests/sim/dock-hull.test.ts:114-190` | MITIGATED |
| T-04-54 | Launch departure (natural or skipped) emits a hull/straddle response | Arm only when `box.min.z > contactPort.zMax`; disarmed ticks emit nothing; straddle only at `min.z < 0` | `src/sim/dock/step.ts:150-164`; `src/sim/dock/corridor.ts:300-312`; `tests/sim/dock-integrated.test.ts`; `tests/e2e/docking.spec.ts:340-368` | MITIGATED |
| T-04-55 | Station-local contact box vs port-projected corners (466 m error) | `contactPort` converted once in `createDockGeometry`; snapshot supplies port-frame `centre`/`axes` | `src/sim/dock/geometry.ts:198-209`; `src/sim/dock/corridor.ts:228-254`; `src/sim/dock/hull.ts:199-221`; `tests/sim/dock-hull.test.ts:114-162` | MITIGATED |
| T-04-SC | Supply-chain installs | No packages added; `fast-check` already a dev dependency | `package.json` unchanged | MITIGATED |

## 04-04 — docking computer, profile, TL gate

| ID | Description | Mitigation | Evidence (file:line) | Verdict |
|----|-------------|-----------|----------------------|---------|
| T-04-18 | Shift+C chord bypass (plain C, repeat, held key, rebind) | `REQUIRES_SHIFT` set + chord-aware `keyDown` + repeat guard; rebind test | `src/input/keyboard.ts:44-46,97-126`; `tests/input/bindings.test.ts:202-247`; `src/input/actions.ts:66` | MITIGATED |
| T-04-19 | Forged `installed` flag / equipment via the hook | Payload-free command; ownership from the profile through `StepOptions.equipment`; hook validates against the catalogue and taints | `src/sim/commands.ts:18-28`; `src/app/game-session.ts:369-380,902-907`; `src/sim/flight/step.ts:97-102`; `tests/sim/dock-computer.test.ts:137-153` | MITIGATED |
| T-04-20 | Credits overflow / negative / NaN | Safe non-negative integer checks before and after subtraction | `src/sim/player/profile.ts:84-86,131-145`; `tests/sim/player-profile.test.ts:168-231` | MITIGATED |
| T-04-21 | Untrusted save data — *accepted here, owned by 04-05* | Strict schema + allow-lists | `src/persistence/save.ts:111-157` | MITIGATED (delegated) |
| T-04-22 | Malformed-save DoS — *accepted here, owned by 04-05* | Size cap before parse, field caps | `src/persistence/save.ts:36-54,118` | MITIGATED (delegated) |
| T-04-23 | XSS via panel text | `textContent` only; copy from catalogue/fixed strings | `src/ui/docked.ts:73-95`; `src/app/game-session.ts:298-332` | MITIGATED |
| T-04-43 | TL 9 displayed but not enforced at Lave | `canPurchase` compares raw `system.techLevelRaw`; Lave vs synthetic TL 9 pair; e2e disabled line | `src/sim/player/profile.ts:98-120`; `src/app/game-session.ts:315,352-362`; `tests/sim/player-profile.test.ts:85-100`; `tests/e2e/docking.spec.ts:371-397` | MITIGATED |
| T-04-44 | Dock and launch in the same tick both take effect | Every mode-changing command gated on `modeAtStart`; `terminalTransition` blocks the step-5 clock | `src/sim/flight/step.ts:73-119,152-165`; `tests/sim/dock-computer.test.ts:174-220`; `tests/sim/dock-transitions.test.ts:60-160` | MITIGATED |
| T-04-45 | Negative/zero/NaN price mints credits | Price read from validated catalogue; `price <= 0`, non-integer, non-finite refused before arithmetic | `src/sim/player/profile.ts:70-74,113-118,135`; `tests/sim/player-profile.test.ts:122-166` | MITIGATED |
| T-04-46 | Shared `EDGE_COMMANDS` singleton leaks `installed` | Payload-free command; fresh object per keydown; identity test | `src/input/keyboard.ts:121-125`; `src/sim/commands.ts:22-28`; `tests/input/bindings.test.ts:217-231` | MITIGATED |
| T-04-SC | Supply-chain installs | No packages added | `package.json` unchanged | MITIGATED |

## 04-05 — save schema, IndexedDB, future-save policy

| ID | Description | Mitigation | Evidence (file:line) | Verdict |
|----|-------------|-----------|----------------------|---------|
| T-04-24 | Forged credits/clock/equipment/system/station in save | Strict zod `SaveV1` + integer/range caps + equipment/system/station allow-lists built at boot | `src/persistence/save.ts:56-74,136-156`; `src/main.ts:123-149`; `tests/persistence/save.test.ts:61-185` | MITIGATED |
| T-04-25 | Prototype pollution via `JSON.parse` | `strictObject` rejects unknown keys incl. `__proto__`; parsed data never merged | `src/persistence/save.ts:56-74,136-137`; `tests/persistence/save.test.ts:177-184` | MITIGATED |
| T-04-26 | Older build overwrites/clears a future-version save | `version > 1` → `future`; Continue hidden; clear and write skipped for the session | `src/persistence/save.ts:127-134`; `src/main.ts:142-145,257`; `src/app/game-session.ts:230-236,406-411,450-455`; `tests/e2e/autosave.spec.ts:314-360` | MITIGATED |
| T-04-27 | Malformed/oversized save hangs boot | `MAX_SAVE_CHARS` before `JSON.parse`; array/string caps; corrupt copied to `autosave.corrupt`, never read back | `src/persistence/save.ts:36-54,115-125`; `src/main.ts:145-149`; `src/persistence/idb-store.ts:264-274`; `tests/e2e/autosave.spec.ts:363-399` | MITIGATED |
| T-04-28 | IndexedDB unavailable / quota / blocked open | One shared open promise; `blocked` settles; every failure is data; frame loop never awaits | `src/persistence/idb-store.ts:70-151,230-262`; `src/persistence/store.ts:13-16,27-45`; `src/app/game-session.ts:433`; `src/persistence/autosave.ts:60-74`; `tests/persistence/autosave.test.ts:105-131` | MITIGATED |
| T-04-29 | Repeated launch writes exhaust resources | Single key overwritten; payload ≤ `MAX_SAVE_CHARS` (4096) | `src/persistence/store.ts:47-52`; `src/persistence/save.ts:36`; `src/app/game-session.ts:406-444` | MITIGATED |
| T-04-30 | Shift+C/keyboard — *accepted here, tested in 04-04* | `REQUIRES_SHIFT` chord | `src/input/keyboard.ts:44-46,107-125` | MITIGATED (delegated) |
| T-04-31 | `?test=1` hook writes saves | Hook has no store parameter; tainted profiles skip the autosave and publish `skipReason` | `src/app/probe.ts:221-291`; `src/app/game-session.ts:406-416,382-390`; `tests/e2e/autosave.spec.ts:426-454` | MITIGATED |
| T-04-32 | Host data disclosed in save | Schema has no timestamp/pose/host keys; exact key-set test | `src/persistence/save.ts:56-74,166-176`; `tests/persistence/save.test.ts:211-235` | MITIGATED |
| T-04-47 | New game / next launch destroys a newer build's save | One rule: future is never cleared or replaced; byte-identity e2e after New game **and** after launch | `src/app/game-session.ts:450-466,406-411`; `src/main.ts:142-145`; `tests/e2e/autosave.spec.ts:314-360` | MITIGATED |
| T-04-48 | Write resolves before commit; stale write resurrects a cleared blob | Resolve on `oncomplete`, reject on abort/error; single serialized queue; monotonic revision | `src/persistence/idb-store.ts:134-151,153-189,230-262`; `src/persistence/store.ts:27-32`; `tests/e2e/autosave.spec.ts:168-205` | MITIGATED |
| T-04-49 | Multi-megabyte blob parsed before the caps | Length check precedes `JSON.parse`; spy-verified; 1 MB browser injection | `src/persistence/save.ts:115-125`; `tests/persistence/save.test.ts:187-207`; `tests/e2e/autosave.spec.ts:383-399` | MITIGATED |
| T-04-50 | Allow-lists omitted at the boot call site | `parseSave` requires the allow-list record; `main.ts` passes all three built from validated sources | `src/persistence/save.ts:79-83,140-154`; `src/main.ts:115-135`; `tests/persistence/save.test.ts:117-136` | MITIGATED |
| T-04-51 | `VersionError` repaired by deleting a newer database | `VersionError` → `version` status; `deleteDatabase` never called | `src/persistence/idb-store.ts:100-108`; `rg -n "deleteDatabase" src tools tests` → comment only (`idb-store.ts:19`) | MITIGATED |
| T-04-52 | Probe-injected credits/equipment persist through autosave | Every hook mutation taints; autosave skips a tainted profile and publishes the reason | `src/app/probe.ts:229-284`; `src/app/game-session.ts:1108-1120,412-416`; `tests/e2e/autosave.spec.ts:426-454` | MITIGATED |
| T-04-SC | Supply-chain installs | No packages added; `idb`/`fake-indexeddb` rejected | `package.json` unchanged | MITIGATED |

## SUMMARY.md `## Threat Flags`

All five `04-0*-SUMMARY.md` files were read; **none contains a `## Threat Flags` section**, so there is no unregistered attack surface reported by the executors. Reverse-check of implementation-only surfaces against the register found no new unowned surface: the only additions are the five `probe.save` / `probe.test` fields, all covered by T-04-31/T-04-52/T-04-08.

`unregistered_flag`: none.

## Observations (non-blocking — NOT counted in `threats_open`)

1. **E2E contention (environmental).** `tests/e2e/autosave.spec.ts` + `docking.spec.ts` with the default 2 workers produced three 30 s timeouts (`future-version`, `tainted`, `bounce` message line). Re-running each spec alone, and both together with `--workers=1`, is 14/14 green. This matches the accepted SwiftShader cadence issue in `PROJECT.md:89` (simulated-`flightTime` waits on a CPU rasteriser). No product or security change; severity **low**, no action.
2. **Non-string IndexedDB value is not treated as future/inert.** A value that is not a string fails the read as `save-shape` (`src/persistence/idb-store.ts:207-214`), leaving boot status `unavailable` (`src/main.ts:116,136-160`); a later New game calls `clear()` (`src/app/game-session.ts:450-458`), which would delete that key. T-04-26/T-04-47's declared vector is a JSON **string** with `version > 1` (D-13), which is detected and preserved, so this is outside the declared mitigation — but if a future build ever changes its storage type, its blob would be destroyed. Severity **low**, recommend treating a non-string value as `future` before Phase 6. Does not block ship.
3. **`encodeSave` does not re-assert the schema's `.int()` clock.** `clockSeconds` accumulates `+dt` while in flight, so a purchase autosave after a *manual* dock (reachable only in a TL ≥ 9 system, i.e. Phase 5) would write a blob this build's own `parseSave` rejects as `corrupt` on reload. Durability edge case, not a security control; severity **low**, recommend rounding/validating at `encodeSave` before Phase 5.

## Verdict

**SECURED** — 56/56 declared threats verified present in the implemented source at the declared boundary; 0 open, 0 blocking. Three low-severity non-security observations recorded above.
