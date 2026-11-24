---
phase: "18"
slug: "stations-buoys-and-collisions"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-19"
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from `18-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (+ fast-check 4.10.2); Playwright 1.64.1 for browser specs |
| **Config file** | `vitest.config.ts`, `vitest.acceptance.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test` (unit); `docker compose run --rm verify` / `verify-full` on the remote machine |
| **Content drift** | `docker compose run --rm assets npm run assets:check` |
| **Acceptance** | `npm run test:acceptance` on the remote machine, by hand (QUAL-11) |
| **Estimated runtime** | quick ~30–90 s; unit suite several minutes |

---

## Sampling Rate

- **After every task commit:** targeted `docker compose run --rm test npx vitest run <file>` for the touched module, plus `typecheck` and `lint`
- **After every plan wave:** `docker compose run --rm test` plus `assets:check`
- **Before `/gsd-verify-work`:** `verify` (and `verify-full` for render/persistence-adjacent changes) and the acceptance rerun, owner-run on the remote machine
- **Max feedback latency:** ~90 seconds for targeted runs

---

## Per-Task Verification Map

Filled by the planner/executor per task. Requirement-to-test map from research:

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| DATA-15 | Static hull artifact: strict schema, four hulls with subentities, radii match, size gates, digest golden, drift gate | unit + golden + drift | `docker compose run --rm test npx vitest run tests/content/ships-static-hulls.test.ts`; `docker compose run --rm assets npm run assets:check` | ✅ | ✅ green |
| DATA-15 | Loader never in the boot path; budget within ceiling | static guard + browser | `tests/content/ships-static-hulls.test.ts`; `budget.spec.ts` (remote) | ✅ | ✅ green |
| CBT-17 | Subentity rule at the dock mouth, independent oracle | oracle + unit | `docker compose run --rm test npx vitest run tests/sim/combat/hit.test.ts tests/oracles/combat` | ✅ | ✅ green |
| CBT-17 | Station absorbs; buoy 250 energy, destroyed at 0; hash pristine-omit; sanitiser | unit | `docker compose run --rm test npx vitest run tests/sim/combat/ledger.test.ts tests/sim/world/sanitize.test.ts tests/sim/world/hash.test.ts` | ✅ | ✅ green |
| CBT-17 | Ident locks station/buoys/pods/plates, lock ends on buoy destruction | unit + app | `docker compose run --rm test npx vitest run tests/sim/combat/ident.test.ts tests/app/session-order.test.ts` | ✅ | ✅ green |
| CBT-17 | Destroyed buoy gone from view, scanner, blockage; compass fallback | unit + browser | `docker compose run --rm test npx vitest run tests/sim/hyperspace-blockage.test.ts tests/ui/hud-model.test.ts` | ✅ | ✅ green |
| CBT-17 (D-09) | No arrival/launch overlaps a buoy hull across 2,048 layouts | unit | `docker compose run --rm test npx vitest run tests/sim/hyperspace-arrival.test.ts` | ✅ | ✅ green |
| CBT-18 | `isHitByOctree` against an independent oracle + brute-force property | oracle + property | `docker compose run --rm test npx vitest run tests/oracles/combat tests/sim/combat/octree.test.ts` | ✅ | ✅ green |
| CBT-18 | `collideWithShip` worked table; once per contact; separating ignored; station damage-free | unit + scenario | `docker compose run --rm test npx vitest run tests/sim/combat/collide.test.ts` | ✅ | ✅ green |
| CBT-18 | Player scrape (no heat), drift braking, collision kill → debris | unit | `docker compose run --rm test npx vitest run tests/sim/combat/shields.test.ts tests/sim/world/debris.test.ts` | ✅ | ✅ green |
| Crit. 5 | Non-colliding worlds hash as before; collision scenario equal at 30/60/144 Hz | cadence + pins | `docker compose run --rm test npx vitest run tests/sim/world/world-cadence.test.ts tests/sim/world/flight-hash-pins.test.ts` | ✅ | ✅ green |
| CBT-18 (review WR-02) | Response oracle hand anchors independent of `reference.ts`: cleanup band, torus 32, NPC fmaxf clamp, aft-overflow and negative scrape, unfloored blast d2, otherParent receiver | oracle | `docker compose run --rm test npx vitest run tests/oracles/combat/response/` | ✅ | ✅ green |
| CBT-18 (review IN-08) | Player drift braking replayed through the real `stepFlight` for the four thrust-factor-1 rows | oracle + integration | `docker compose run --rm test npx vitest run tests/sim/player-braking.oracle.test.ts` | ✅ | ✅ green |
| CBT-17/18 (review IN-05) | Buoy proximity alert/onset/closest-approach pinned; populated-world collision reports pinned per seed, epoch 202 must keep ship-ship and ship-buoy contacts | unit + scenario | `docker compose run --rm test npx vitest run tests/sim/npc/buoy-proximity.test.ts tests/sim/combat/collision-traffic.scenario.test.ts` | ✅ | ✅ green |
| QUAL-11 | 21/21 acceptance after plans touching `src/sim/world/**` | acceptance | `npm run test:acceptance` (remote) | ✅ | manual-only (remote, by decision) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/oracles/combat/` — independent oracle (Oolite C quoted per fixture, no `src` import; follows `tests/guards/oracle-independence.test.ts`)
- [x] `tests/content/ships-static-hulls.test.ts` and `tests/golden/content/ships-static-hulls.json`
- [x] `tests/sim/combat/collide.test.ts`
- [x] Layout sweep test over `src/content/generated/systems/g0..g7.json` for arrival, launch and buoy clearance
- [x] Benchmark guard or `docs/PERFORMANCE.md` entry for the pair loop at 256 entities
- [x] Update pinned member lists (`tests/sim/world/view.test.ts`, `tests/sim/world/ship-field.test.ts`) if `ShipField`, `WorldView` or `BodyView` gain members

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 20-seed NPC acceptance run | QUAL-11 | Not in any gate by decision; remote machine only | `npm run test:acceptance` on the remote machine; record in SUMMARY |
| Browser specs (hud, budget, seams) | CBT-17, DATA-15 | Browser tests run on the remote machine only | Owner runs `verify`/`verify-full` remotely |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-20 (validate-phase audit)

### Open notes (not Nyquist gaps)

- WR-02: the response-fixture generator is still out of tree; a regeneration is not reviewable as a diff. The new hand anchors make a silent `reference.ts` change fail.
- IN-05: epoch 101 of `collision-traffic.scenario.test.ts` measures zero contacts, kills and buoy alerts over 4,000 ticks; its pin records that openly. Only epoch 202 exercises the collision stage. Making 101 meaningful is a scenario design decision.
- IN-05: `chainEliminated` in `src/sim/npc/collision-chain.ts` stays exported for tests only (src change, out of scope).
- IN-08: the torus-factor braking rows are not driven through the real step (the step owns and grows the torus factor); `tests/sim/flight-drift.test.ts` covers that path.

## Validation Audit 2026-11-20

| Metric | Count |
|---|---|
| Gaps found | 3 |
| Resolved | 3 |
| Escalated | 0 |
