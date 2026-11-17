---
phase: "16"
slug: wreckage-cargo-and-the-entity-cap
status: draft  # every task verified; the remote verify-full (OC-6) is pending the owner's go, so the phase is not closed
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-16"
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. The full design is in `16-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5, fast-check 4.10.2; Playwright 1.64.1 for browser specs |
| **Config file** | `vitest.config.ts`, `vitest.acceptance.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test` (plus `lint`, `typecheck`; `assets npm run assets:check` for content plans) |
| **Estimated runtime** | minutes (slow machine; see gate policy) |

---

## Sampling Rate

- **After every task commit:** the targeted `npx vitest run <file>`
- **After every plan wave:** `test`, `lint`, `typecheck` for sim plans; add `assets:check` for content plans; `verify` for app and render plans (remote machine)
- **Before `/gsd-verify-work`:** full suite green; `verify-full` on the remote machine when the owner confirms (render change); by-hand 20-seed acceptance run after the last plan touching `src/sim/world/**` or `ships-npc.json`
- **Max feedback latency:** targeted file run, minutes

---

## Per-Task Verification Map

Filled in by the planner from `16-RESEARCH.md` § Phase Requirements to Test Map.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01 T1 | 01 | 1 | DATA-16 | T-16-01, T-16-02 | local vendoring copies pinned blobs, verifies every digest, refuses a changed committed digest | script (scratch run and two refusal runs) | `sh -n scripts/vendor-oolite.sh`; `docker compose run --rm -v /tmp/vendor-dry-16:/work -v /tmp/oolite-pin-16:/oolite-pin:ro -e OOLITE_LOCAL=/oolite-pin/Resources -e OOLITE_PINNED_SHA256=/oolite-pin/pinned.sha256 assets sh /work/scripts/vendor-oolite.sh` | n/a (script) | ✅ green |
| 16-01 T2 | 01 | 1 | DATA-16 | T-16-03 | the owner runs or authorises the real vendoring run (OC-7) | checkpoint:human-action | none (human step; Task 3 checks the result) | n/a | ✅ done by the orchestrator on the owner's standing instruction; T3 checked the result (OC-7 pending owner confirmation) |
| 16-01 T3 | 01 | 1 | DATA-16 | T-16-01 | the 14 files equal the pinned blobs; no committed digest changed | compliance, drift | `docker compose run --rm test npx vitest run tests/compliance-assets.test.ts tests/compliance.test.ts`; `docker compose run --rm assets npm run assets:check` | exists | ✅ green |
| 16-02 T1 | 02 | 1 | WORLD-17 (CBT-08 staged) | T-16-05, T-16-07 | pods in domain, no sanitiser repair, no id leaves the sim | unit (oracle from the C), tracer through `stepSim` | `docker compose run --rm test npx vitest run tests/sim/world/debris.test.ts tests/sim/world/kill.test.ts tests/sim/combat/step.test.ts tests/sim/combat/kill.property.test.ts tests/sim/world/world-cadence.test.ts` | ❌ W0 (debris.test.ts) | ✅ green |
| 16-02 T2 | 02 | 1 | WORLD-17 (CBT-08 staged), QUAL-11 (standing) | T-16-04, T-16-06 | per-piece cap at 243.2, draws independent of the cap, total on degenerate content | unit, property; by-hand acceptance (remote) | `docker compose run --rm test npx vitest run tests/sim/world/debris.test.ts tests/sim/world/debris-cap.test.ts tests/sim/world/spawn-refusal.test.ts tests/sim/world/kill.test.ts tests/sim/world/sanitize.test.ts` | ❌ W0 (debris-cap.test.ts) | ✅ green |
| 16-03 T1 | 03 | 2 | DATA-16 | T-16-08, T-16-09 | strict catalogue schema, GLB path pattern, drift gate | content, golden | `docker compose run --rm assets`; `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/debris.test.ts tools/oolite-ingest/convert/glb.test.ts tools/oolite-ingest/convert/textures.test.ts tests/content/ships-debris.test.ts tests/compliance-assets.test.ts tests/compliance.test.ts`; `docker compose run --rm assets npm run assets:check` | ❌ W0 (debris.test.ts, ships-debris.test.ts) | ✅ green |
| 16-03 T2 | 03 | 2 | DATA-16 | T-16-10 | the legacy material rule is limited to the five wreck keys | content, golden | `docker compose run --rm test npx vitest run tools/oolite-ingest tests/content tests/compliance-assets.test.ts tests/compliance.test.ts`; `docker compose run --rm assets npm run assets:check` | ❌ W0 | ✅ green |
| 16-04 T1 | 04 | 2 | WORLD-17 (CBT-08 staged) | T-16-11, T-16-12 | burn-down floored at 0 in the write; fixed octant draw budget | unit (oracle, burn-down table 7..82 ticks) | `docker compose run --rm test npx vitest run tests/sim/world/debris.test.ts tests/sim/world/debris-cap.test.ts tests/sim/combat/octree.test.ts tests/sim/world/step.test.ts tests/sim/world/kill.test.ts` | exists after 16-02 | ✅ green |
| 16-04 T2 | 04 | 2 | WORLD-17 (CBT-08 staged) | T-16-13, T-16-14 | blast clamped per component; ships and player unpushed; debris out of the pilot scan | unit | `docker compose run --rm test npx vitest run tests/sim/world/debris.test.ts tests/sim/ai/test-pilot.test.ts tests/sim/ai/test-spawn.test.ts tests/sim/world/world-cadence.test.ts tests/sim/world/populate.test.ts` | exists, extend | ✅ green |
| 16-04 T3 | 04 | 2 | WORLD-17, QUAL-11 (standing) | T-16-06 | 30/60/144 Hz equality with every piece kind; boundary invariants with debris | cadence, fast-check; by-hand acceptance (remote) | `docker compose run --rm test npx vitest run tests/sim/world/debris-cadence.test.ts tests/sim/combat/kill.property.test.ts` | ❌ W0 (debris-cadence.test.ts) | ✅ green |
| 16-05 T1 | 05 | 3 | DATA-16, WORLD-17 | T-16-15, T-16-17 | strict explosion schema; sim cannot import the loader | content, golden, lint guard | `docker compose run --rm assets`; `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/explosions.test.ts tools/oolite-ingest/convert/textures.test.ts tests/content/explosions.test.ts tests/guards/content-boundary.test.ts tests/compliance-assets.test.ts tests/compliance.test.ts`; `docker compose run --rm assets npm run assets:check` | ❌ W0 (explosions tests) | ✅ green |
| 16-05 T2 | 05 | 3 | DATA-16, QUAL-11 (standing) | T-16-16 | finite box with min <= max | content, golden; by-hand acceptance (remote) | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts tests/content/ships-hulls.test.ts tests/app/session/traffic.test.ts`; `docker compose run --rm assets npm run assets:check` | exists, extend | ✅ green |
| 16-06 T1 | 06 | 4 | WORLD-17 | T-16-18, T-16-20 | hook taints before the world is touched; no id in traffic content | app (Vitest twin through the real driver, router and hook) | `docker compose run --rm test npx vitest run tests/app/session/tick-parity.test.ts tests/app/session/traffic.test.ts tests/app/session/sim-driver.test.ts tests/app/session/probe-publisher.test.ts tests/app/probe-shape-compare.test.ts tests/guards/entity-id-scope.test.ts` | exists, extend | ✅ green |
| 16-06 T2 | 06 | 4 | WORLD-17, DATA-16 | T-16-19 | live session and Node replay build the same content | app; `verify` (remote) | `docker compose run --rm test npx vitest run tests/app/session tests/sim/ai/test-spawn.test.ts tests/guards` | exists, extend | ✅ green |
| 16-07 T1 | 07 | 5 | WORLD-17 | T-16-21, T-16-24 | the router arm never reads the id; no sim stream in the render | render, app | `docker compose run --rm test npx vitest run tests/render/explosion-layer.test.ts tests/app/session-order.test.ts tests/app/session/render-driver.test.ts tests/guards/entity-id-scope.test.ts` | ❌ W0 (explosion-layer.test.ts) | ✅ green |
| 16-07 T2 | 07 | 5 | WORLD-17 | T-16-22, T-16-23 | fixed pool, two draw objects, lazy textures, disposal | render; `verify` (remote) | `docker compose run --rm test npx vitest run tests/render/explosion-layer.test.ts tests/app/dispose.test.ts tests/render tests/app/session-order.test.ts` | exists after T1 | ✅ green |
| 16-08 T1 | 08 | 6 | WORLD-17 | T-16-25, T-16-26, T-16-27 | id-free contacts; one call per model primitive; validated GLB paths | render, app | `docker compose run --rm test npx vitest run tests/sim/world/contacts.test.ts tests/render/debris-layer.test.ts tests/render/npc-ships.test.ts tests/app/session/render-driver.test.ts tests/app/npc-models.test.ts tests/guards/entity-id-scope.test.ts` | ❌ W0 (debris-layer.test.ts) | ✅ green |
| 16-08 T2 | 08 | 6 | WORLD-17, QUAL-11 (standing) | T-16-27 | tumble is a pure render function | render; `verify` and by-hand acceptance (remote) | `docker compose run --rm test npx vitest run tests/render/debris-layer.test.ts tests/app/dispose.test.ts tests/render tests/sim/world/contacts.test.ts` | exists after T1 | ✅ green |
| 16-09 T1 | 09 | 7 | WORLD-17, DATA-16 | T-16-28, T-16-30 | cold start fetches no debris or particle asset; hash equal with the layers on (browser) and off (Node twin) | browser (remote) | `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts tests/e2e/budget.spec.ts tests/e2e/traffic.spec.ts tests/e2e/npc-assets.spec.ts"` | exists, extend | ✅ green (remote, 9 of 9 at 178bdf5) |
| 16-09 T2 | 09 | 7 | WORLD-17, DATA-16 | T-16-29 | every divergence quotes a Key Decisions row; verbatim excerpts | contract; `verify-full` (remote, owner go, OC-6) | `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts tests/compliance.test.ts` (and with `OOLITE_SRC`) | exists, extend | ✅ green (contract structural and verbatim); `verify-full` ⬜ pending the owner's go (OC-6) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/sim/world/debris.test.ts` (16-02 T1), `debris-cap.test.ts` (16-02 T2), `debris-cadence.test.ts` (16-04 T3), with the fixture `tests/helpers/debris-fixture.ts` (16-02 T1)
- [x] Hand-computed fixtures per rule (n_alloys per hull, lifetime table 7/22/37/52/67/82 ticks, kick examples 3.3747 and 6458.5 m/s, the 23462.7 m/s plate clamped) with the C source line beside each number (16-02, 16-04)
- [x] `tests/render/debris-layer.test.ts` (16-08), `explosion-layer.test.ts` (16-07), disposal cases in `tests/app/dispose.test.ts` (16-07, 16-08)
- [x] Content tests for `ships-debris` and `explosions` (schema bounds, golden, drift): `tools/oolite-ingest/convert/debris.test.ts`, `tests/content/ships-debris.test.ts` (16-03), `tools/oolite-ingest/convert/explosions.test.ts`, `tests/content/explosions.test.ts` (16-05)
- [x] Extensions: `kill.property.test.ts` (16-04), `tests/app/session-order.test.ts` (16-07), `tests/app/session/tick-parity.test.ts` (16-06), `combat.spec.ts`, `budget.spec.ts`, `traffic.spec.ts`, `npc-assets.spec.ts` (16-09)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 20-seed NPC acceptance run (21 of 21) | QUAL-11 | in no gate by decision (Phase 14 IN-04) | `docker compose run --rm test npm run test:acceptance` on the remote machine after plans touching `src/sim/world/**` or `ships-npc.json` |
| Vendoring of debris assets from the local Oolite checkout | DATA-16 | script runs against the host checkout | human checkpoint per plan |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validation strategy signed off after plan 16-09 for every task's automated verify (each plan's targeted runs, the full suite and the remote `verify` recorded in its SUMMARY; the four browser specs passed remotely, 9 of 9 at `178bdf5`; the fidelity contract passed in both modes), 2026-11-17. Not signed off: the remote `verify-full` for this render phase has NOT run; it waits for the owner's go (OC-6, ROADMAP gate rule), with the command `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify-full`. This is not an owner decision: OC-1 to OC-7 stay pending owner confirmation (PROJECT.md Key Decisions, the Phase 16 rows).
