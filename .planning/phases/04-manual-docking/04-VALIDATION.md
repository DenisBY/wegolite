---
phase: "4"
slug: "manual-docking"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-04"
validated: "2026-11-05"
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (unit/integration, node env) + Playwright 1.64.1 (browser) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run <new test files>` |
| **Full suite command** | `docker compose run --rm verify` |
| **Estimated runtime** | ~120–300 seconds (container) |

> Evidence rule: a host Node/npm run is **not** evidence (AGENTS.md). All commands run in Docker.

---

## Sampling Rate

- **After every task commit:** Run the task's scoped `docker compose run --rm test npx vitest run …` command
- **After every plan wave:** Run `docker compose run --rm test` + `docker compose run --rm typecheck` + `docker compose run --rm lint`
- **Before `/gsd-verify-work`:** `docker compose run --rm verify` must be green
- **Max feedback latency:** ~120 seconds (scoped unit run)

---

## Per-Task Verification Map

Plan/task IDs are assigned by PLAN.md; this table is requirement-anchored and kept in sync with the executed plans.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 04-01 | 1 | DOCK-01 | T-04-01, T-04-02, T-04-33, T-04-34 | Aperture measured from the vendored dock `.dat`; emitted at the declared path with a manifest row; schema rejects non-finite/zero/subnormal dimensions | unit + drift | `docker compose run --rm assets npm run assets:check`; `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/dock-port.test.ts src/content/dock-port.test.ts` | ✅ | ✅ green |
| 04-01-T2 | 04-01 | 1 | DOCK-01 | T-04-35 | Hull/contact/Cobra boxes emitted station-local, schema-validated and byte-pinned by the golden; contact proxy covers the faceplate | unit + drift | `docker compose run --rm assets npm run assets:check`; `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/dock-port.test.ts src/content/dock-port.test.ts tests/guards/content-boundary.test.ts` | ✅ | ✅ green |
| 04-02-T1 | 04-02 | 2 | DOCK-01, DOCK-04 | T-04-06, T-04-07, T-04-36 | Aligned approach docks on the weighted plane with an exact docked pose; the arming latch is reachable after natural and skipped launches without self-docking | unit | `docker compose run --rm test npx vitest run tests/sim/dock-capture.test.ts tests/sim/launch.test.ts tests/sim/flight-cadence.test.ts tests/guards/sim-purity.test.ts tests/guards/content-boundary.test.ts` | ✅ | ✅ green |
| 04-02-T2 | 04-02 | 2 | DOCK-02 | T-04-37, T-04-38, T-04-53 | Strict lane/band/nose-gate boundaries, symmetric x/y auto-centring, computed 31.296° roll limit, bounded aperture expansion, non-vacuous 60/120/144 Hz replay | unit | `docker compose run --rm test npx vitest run tests/sim/dock-corridor.test.ts tests/sim/dock-cadence.test.ts tests/sim/dock-capture.test.ts` | ✅ | ✅ green |
| 04-02-T3 | 04-02 | 2 | DOCK-01, DOCK-02, DOCK-04 | T-04-08 | App injects validated geometry; docked panel shows; browser docks an independently derived pose; hook exists only at exact `?test=1` | integration + e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/docking.spec.ts tests/e2e/launch.spec.ts"`; `docker compose run --rm typecheck` | ✅ | ✅ green |
| 04-03-T1 | 04-03 | 3 | DOCK-03, DOCK-06 | T-04-12, T-04-39, T-04-41, T-04-42, T-04-54, T-04-55 | 15-axis SAT finds edge/face contact in the port frame; one reflected-velocity response per tick; deterministic shake/flash; `sanitizeFlightState` repairs poisoned hooks | unit | `docker compose run --rm test npx vitest run tests/sim/dock-hull.test.ts tests/app/dock-feedback.test.ts tests/sim/dock-capture.test.ts tests/sim/dock-cadence.test.ts tests/guards/sim-purity.test.ts` | ✅ | ✅ green |
| 04-03-T2 | 04-03 | 3 | DOCK-06 | T-04-13, T-04-39, T-04-40 | No-trap oracle asserts non-penetration, outward separation and retry-ability; integrated launch → clean departure → bounce → retry → dock; scrape accounting | unit (property + integration) | `docker compose run --rm test npx vitest run tests/sim/dock-no-trap.test.ts tests/sim/dock-hull.test.ts tests/sim/dock-integrated.test.ts` | ✅ | ✅ green |
| 04-03-T3 | 04-03 | 3 | DOCK-03, DOCK-06 | T-04-54 | Browser proves bounce feedback (shake > 0, flash > 0, fixed copy), expiry after 0.6 s, an immediate second bounce and a retry dock; skipped relaunch stays response-free | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/docking.spec.ts tests/e2e/hud.spec.ts"`; `docker compose run --rm typecheck` | ✅ | ✅ green |
| 04-04-T1 | 04-04 | 4 | DOCK-05 | T-04-18, T-04-19, T-04-44, T-04-46 | Shift+C (never plain C) with the computer fitted docks on the same tick with exactly +1200 s; aegis boundary inclusive; same-tick dock+launch affects one transition | unit | `docker compose run --rm test npx vitest run tests/sim/dock-computer.test.ts tests/input/bindings.test.ts tests/settings/schema.test.ts tests/sim/launch.test.ts` | ✅ | ✅ green |
| 04-04-T2 | 04-04 | 4 | DOCK-05 | T-04-20, T-04-43, T-04-45 | New game 1000 decicredits; 15000 succeeds / 14999 refused; catalogue price is the only source; Lave (raw TL 4) refuses EQ_DOCK_COMP, synthetic TL 9 accepts | unit | `docker compose run --rm test npx vitest run tests/sim/player-profile.test.ts tests/guards/content-boundary.test.ts tests/guards/sim-purity.test.ts` | ✅ | ✅ green |
| 04-04-T3 | 04-04 | 4 | DOCK-05 | T-04-23, T-04-43, T-04-44 | Four-row transition matrix (launch/manual/computer/denied) asserts mode, tick, flightTime, stationAngle and clock; panel shows live credits and a TL refusal; `probe.dock.lastClockDelta === 1200` | unit + e2e | `docker compose run --rm test npx vitest run tests/sim/dock-transitions.test.ts tests/sim/dock-computer.test.ts`; `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/docking.spec.ts tests/e2e/launch.spec.ts tests/e2e/settings.spec.ts"` | ✅ | ✅ green |
| 04-05-T1 | 04-05 | 5 | DOCK-07 | T-04-24, T-04-25, T-04-27, T-04-32 | Strict `SaveV1` parse (size cap before `JSON.parse`, integer/range bounds, allow-lists); launch/purchase snapshots; restore yields docked at the saved clock; revisions serialize | unit | `docker compose run --rm test npx vitest run tests/persistence/save.test.ts tests/persistence/autosave.test.ts tests/guards/sim-purity.test.ts` | ✅ | ✅ green |
| 04-05-T2 | 04-05 | 5 | DOCK-07 | T-04-26, T-04-28, T-04-31, T-04-47, T-04-48, T-04-49, T-04-50, T-04-51, T-04-52 | IndexedDB adapter resolves writes on `oncomplete`, serializes operations, never deletes a newer DB; boot passes all three allow-lists; future blobs are never cleared/replaced; tainted profiles skip autosave | unit + integration | `docker compose run --rm test npx vitest run tests/persistence tests/app tests/guards`; `docker compose run --rm typecheck` | ✅ | ✅ green |
| 04-05-T3 | 04-05 | 5 | DOCK-07 | T-04-26, T-04-27, T-04-31, T-04-47, T-04-48 | Real IndexedDB: committed launch write → Continue restores the exact clock; manual dock does not autosave; New game clears after commit; future bytes identical; corrupt/oversized/duplicate blobs inert; taint skip | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/autosave.spec.ts tests/e2e/launch.spec.ts tests/e2e/dispose.spec.ts tests/e2e/aspect.spec.ts"` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/sim/dock-corridor.test.ts` — aperture, port frame, lane/band, capture boundary
- [x] `tests/sim/dock-cadence.test.ts` — replay equality across 60/120/144 Hz sampling (non-vacuous: `dockCount === 1`, `scrapeTicks > 0`)
- [x] `tests/sim/dock-hull.test.ts` — box hull contact + bounce, orientation preserved
- [x] `tests/sim/dock-capture.test.ts` — 90/10 capture and docked pose
- [x] `tests/sim/dock-computer.test.ts` — aegis gate, +1200 s, no-op without equipment
- [x] `tests/sim/dock-no-trap.test.ts` — seeded property: approaches always end `inFlight` or `docked`, non-penetration and retry-ability included
- [x] `tests/sim/player-profile.test.ts` — credits/equipment purchase maths
- [x] `tests/persistence/save.test.ts` — `parseSave` accept/reject table
- [x] `tests/e2e/docking.spec.ts` — probes for capture, bounce feedback, Shift+C
- [x] `tests/e2e/autosave.spec.ts` — real IndexedDB reload → Continue
- [x] Port-frame pose helper for tests (`tests/helpers/dock-pose.ts`)
- [x] Generated-data golden for `dock-port.json` (`tests/golden/content/dock-port.json`)
- [x] `?test=1` hook extensions: `setOrientation`, `setStationAngle`, `grantEquipment`, `setCredits`, `probe.dock` (plus existing `setPosition`/`setSpeed`)
- [x] Guards stay green: `tests/guards/sim-purity.test.ts`, `tests/guards/content-boundary.test.ts`

Additional phase coverage created during execution:

- [x] `tools/oolite-ingest/convert/dock-port.test.ts` — emitter measurement, golden equality, degeneracy/proxy rejects
- [x] `src/content/dock-port.test.ts` — generated values, manifest row, loader, schema reject table
- [x] `tests/sim/dock-integrated.test.ts` — launch → departure → bounce → retry → dock gate plus skipped-launch negative
- [x] `tests/sim/dock-transitions.test.ts` — launch/manual/computer/denied clock matrix
- [x] `tests/app/dock-feedback.test.ts` — envelope determinism/expiry and scrape throttle
- [x] `tests/persistence/autosave.test.ts` — snapshot, queue failure, revision ordering, restore

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Camera shake and red frame flash read as clear feedback rather than visual noise | DOCK-03 / DOCK-06 | Amplitude/timing feel is qualitative; automated probes only assert presence and expiry | Launch, fly off-axis into the Coriolis, confirm shake + flash + message; confirm they clear within ~0.5 s and a second attempt is possible immediately |
| Docking-computer line reads well beside credits/ship/fuel and the Launch control | DOCK-05 | Automated tests pin the exact string, disabled state and reason; visual layout quality is a human judgement | Dock, inspect the Docked panel: "Docking Computers — 1500.0 Cr (TL 9)", disabled at Lave with "Requires TL 9", and "Already fitted" after granting |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-05 (Docker-only evidence)

---

## Validation Result

| Requirement | Coverage | Evidence |
|-------------|----------|----------|
| DOCK-01 | ✅ | 04-01 T1/T2 (emitter, manifest, golden, drift) + 04-02 T1/T2/T3 (`dock-corridor`, independent-pose e2e); `assets:check: no differences` |
| DOCK-02 | ✅ | 04-02 T1/T2 (`dock-corridor` lane/band/roll invariance/31.296° limit, `dock-cadence`, capture station-angle delta) + `tests/sim/layout.test.ts` (roll = 2π/50 s) |
| DOCK-03 | ✅ | 04-03 T1/T3 (`dock-hull` SAT, `dock-feedback` envelopes/throttle, browser shake+flash+copy) |
| DOCK-04 | ✅ | 04-02 T1/T2/T3 (`dock-capture` weighted plane + exact pose, `dock-corridor`, `dock-transitions`, independent-pose e2e) |
| DOCK-05 | ✅ | 04-04 T1/T2/T3 (`dock-computer`, `player-profile`, `bindings`, `settings`, `dock-transitions`, browser TL refusal and Shift+C +1200 s) |
| DOCK-06 | ✅ | 04-03 T1/T2/T3 (`dock-no-trap` property + adversarial seeds, `dock-integrated` chain and skipped launch, browser bounce/retry) |
| DOCK-07 | ✅ | 04-05 T1/T2/T3 (`save`/`autosave` unit, real-IndexedDB reload, future byte identity, corrupt/oversized/duplicate inertness, taint skip) |

**Tests run (Docker only):**

- Scoped unit: 19 files / 215 tests passed.
- Full unit suite: 68 files / 678 tests passed.
- Scoped e2e (`docking.spec.ts` + `autosave.spec.ts`): 14/14 passed on the final run.
- `docker compose run --rm assets npm run assets:check`: `no differences`.
- `docker compose run --rm typecheck`: clean.

**Residual gap:** none functional — every DOCK-01..DOCK-07 requirement has a failing-capable automated check that passes. Test-infrastructure caveat: the e2e suite showed intermittent cold-run timeouts (5/14 on the first cold run; each failing case passed in isolation, and the final full 2-worker run passed 14/14). This is load/timing flakiness in the browser gate, not missing coverage; the unit-level proofs for the same behaviors are deterministic. No tests were added because no requirement lacked coverage; only this validation record changed.
