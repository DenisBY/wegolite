---
phase: "19"
slug: "equipment-damage-and-repair"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-21"
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `19-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (unit project, Node), fast-check 4.10.2, Playwright (opt-in browser) |
| **Config file** | `vitest.config.ts` (coverage floors: `src/sim/**` lines 93, `src/persistence/**` lines 88, `src/content/**` lines 66) |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test`, then `docker compose run --rm lint` and `docker compose run --rm typecheck` |
| **Phase gate** | `verify` and `verify-full` (persistence and money-path change) on the remote test machine via `/home/opencode/.claude/scripts/wegolite-remote-run.sh` |
| **Estimated runtime** | targeted file ~30 s; full unit suite several minutes |

---

## Sampling Rate

- **After every task commit:** the targeted `vitest run <file>` for the files touched
- **After every plan wave:** `docker compose run --rm test`, `lint`, `typecheck`
- **Before `/gsd-verify-work`:** `verify` and `verify-full` green on the remote machine
- **Not required:** the 20-seed NPC acceptance run (no change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`)

---

## Per-Task Verification Map

Task IDs are `{plan}-{task}` in wave order. Every task also runs `docker compose run --rm typecheck` (about 20 s) where its plan says so. The full suite, `lint` and the remote browser and `verify` runs sit at each plan's boundary (`<verification>`), never in a task (checker iteration 1, Nyquist 8b); the phase gate `verify-full` sits in 19-14's `<verification>`, right after its last task (checker iteration 2). List-only Playwright checks (`--list`) compile the specs and launch no browser.

| Task ID | Wave | Requirement | Threat Ref | Test Type | Automated Command (per task) | File Exists | Status |
|---------|------|-------------|------------|-----------|------------------------------|-------------|--------|
| 19-01-01 | 1 | CBT-08, CBT-12 (D-03) | T-19-01 | content build + unit | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/equipment.test.ts tests/sim/player-profile.test.ts` | ✅ extend | ✅ green |
| 19-01-02 | 1 | CBT-08, CBT-12 (D-03) | T-19-01 | golden + drift | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/equipment.test.ts tools/oolite-ingest/drift.test.ts`; `docker compose run --rm assets npm run assets:check` | ✅ extend | ✅ green |
| 19-02-01 | 1 | CBT-08 (SC1) | T-19-02 | unit, hand-derived draws | `docker compose run --rm test npx vitest run tests/sim/combat/internal-damage.test.ts tests/sim/rng.test.ts tests/guards/sim-purity.test.ts tests/guards/sim-determinism-bans.test.ts` | ✅ | ✅ green |
| 19-02-02 | 1 | CBT-08 | T-19-02, T-19-03 | unit + property (incl. the 256-iteration cap, E-167) | `docker compose run --rm test npx vitest run tests/sim/combat/internal-damage.test.ts tests/sim/combat/internal-damage.property.test.ts` | ✅ | ✅ green |
| 19-02-03 | 1 | CBT-08 (D-05) | T-19-03 | guard + contract | `docker compose run --rm test npx vitest run tests/guards/hull-wear-tripwire.test.ts tests/contract/fidelity.test.ts` | ✅ | ✅ green |
| 19-06-01 | 1 | SAVE-09 (SC4, D-11) | T-19-13, T-19-24 | unit + list-only browser | `docker compose run --rm test npx vitest run tests/persistence tests/app/session/world-lifecycle.test.ts`; `docker compose run --rm e2e npx playwright test --list tests/e2e/autosave.spec.ts -g "an older save is corrupt"` | ✅ update; `tests/helpers/save-builders.ts` ✅ | ✅ green |
| 19-06-02 | 1 | SAVE-09 (D-11) | T-19-24, T-19-28 | unit + guard (alias-tolerance tripwire) | `docker compose run --rm test npx vitest run tests/persistence tests/app/session/world-lifecycle.test.ts tests/app/session/save-controller.test.ts tests/guards/legacy-equipment-alias.test.ts` | ✅ update; `tests/guards/legacy-equipment-alias.test.ts` ✅ | ✅ green |
| 19-15-01 | 1 | CBT-12 (D-06) | T-19-27 | guard (tripwire, autopilot trigger) | `docker compose run --rm test npx vitest run tests/guards/damaged-equipment-in-use.test.ts` | ✅ | ✅ green |
| 19-15-02 | 1 | CBT-12 (D-06) | T-19-27 | guard (galactic-drive and ANA triggers) | `docker compose run --rm test npx vitest run tests/guards/damaged-equipment-in-use.test.ts` | ✅ (from 19-15-01) | ✅ green |
| 19-03-01 | 2 | CBT-12, SAVE-09 (D-11, D-03) | T-19-04 | unit + guard | `docker compose run --rm test npx vitest run tests/sim/player/damage.test.ts tests/sim/player-profile.test.ts tests/persistence/autosave.test.ts tests/sim/player/outfitting.test.ts tests/guards/damaged-equipment-in-use.test.ts` | ✅ | ✅ green |
| 19-03-02 | 2 | CBT-12 (SC2), CBT-08 (D-04) | T-19-04, T-19-05 | unit + property | `docker compose run --rm test npx vitest run tests/sim/player tests/guards/economy-purity.test.ts tests/sim/dock-computer.test.ts tests/sim/compass-beacon.test.ts` | ✅ | ✅ green |
| 19-04-01 | 2 | CBT-08 (SC1) | T-19-06, T-19-07 | unit | `docker compose run --rm test npx vitest run tests/sim/combat/ledger.test.ts tests/sim/combat/step.test.ts tests/guards/collision-player-death.test.ts tests/guards/ship-hit-consumers.test.ts` | ✅ extend | ✅ green |
| 19-04-02 | 2 | CBT-08 (D-04) | T-19-06 | unit + property | `docker compose run --rm test npx vitest run tests/sim/economy tests/guards/economy-purity.test.ts` | ✅ extend | ✅ green |
| 19-04-03 | 2 | CBT-08 (SC1) | T-19-06 | cadence | `docker compose run --rm test npx vitest run tests/sim/combat/internal-damage-cadence.test.ts` | ✅ | ✅ green |
| 19-07-01 | 2 | SAVE-09 (D-11) | T-19-25, T-19-26 | list-only browser | `docker compose run --rm e2e npx playwright test --list tests/e2e/autosave.spec.ts tests/e2e/save-load.spec.ts` | ✅ update | ✅ green |
| 19-07-02 | 2 | SAVE-09 (D-11) | T-19-26 | unit + doc grep | `docker compose run --rm test npx vitest run tests/app/session/save-controller.test.ts tests/app/session/station-controller.test.ts tests/persistence/restore-drift.test.ts` | ✅ update | ✅ green |
| 19-05-01 | 3 | CBT-12 (SC3, D-08 to D-10) | T-19-08, T-19-09 | unit | `docker compose run --rm test npx vitest run tests/sim/player/outfitting.test.ts tests/ui/station-outfitting.test.ts` | ✅ extend | ✅ green |
| 19-05-02 | 3 | CBT-12 (SC3, D-03) | T-19-08, T-19-10 | unit + guard | `docker compose run --rm test npx vitest run tests/sim/player tests/sim/player-profile.test.ts tests/ui tests/guards/damageable-equipment.test.ts tests/guards/damaged-equipment-in-use.test.ts` | ✅ extend; `tests/guards/damageable-equipment.test.ts` ✅ | ✅ green |
| 19-05-03 | 3 | CBT-12 | T-19-09, T-19-10 | property | `docker compose run --rm test npx vitest run tests/sim/player/damage.property.test.ts` | ✅ extend (from 19-03) | ✅ green |
| 19-08-01 | 3 | SAVE-09 (SC4, D-11) | T-19-11, T-19-12 | unit | `docker compose run --rm test npx vitest run tests/persistence tests/app/session/world-lifecycle.test.ts tests/app/session/save-controller.test.ts tests/app/session/station-controller.test.ts` | `save-v5.test.ts` ✅ | ✅ green |
| 19-08-02 | 3 | SAVE-09 (SC4) | T-19-11, T-19-12 | unit (worst case, older builds) | `docker compose run --rm test npx vitest run tests/persistence/save-v5.test.ts` | ✅ (from 19-08-01) | ✅ green |
| 19-09-01 | 4 | SAVE-09 (SC4) | T-19-14, T-19-15 | unit + list-only browser | `docker compose run --rm test npx vitest run tests/app/session/probe-publisher.test.ts`; `docker compose run --rm e2e npx playwright test --list tests/e2e/save-load.spec.ts -g "stays damaged after Continue"` | ✅ extend | ✅ green |
| 19-09-02 | 4 | SAVE-09 (SC4) | T-19-11, T-19-15 | unit (contract table) | `docker compose run --rm test npx vitest run tests/persistence` | ✅ extend | ✅ green |
| 19-10-01 | 4 | CBT-08 (SC1), CBT-12 (SC2) | T-19-16, T-19-17 | unit + pinned (router order, table and the two new kinds dispatched) | `docker compose run --rm test npx vitest run tests/app/session/event-router-damage.test.ts tests/app/session-order.test.ts tests/app/session/world-lifecycle.test.ts tests/app/session/event-router-ident.test.ts tests/app/session/sim-driver.test.ts tests/app/session/tick-parity.test.ts` | ✅ | ✅ green |
| 19-10-02 | 4 | CBT-12 (SC2) | T-19-16, T-19-17 | unit + guard (session-order run, not edited) | `docker compose run --rm test npx vitest run tests/app/session/event-router-damage.test.ts tests/app/session-order.test.ts tests/guards/hud-message-length.test.ts` | ✅ (from 19-10-01) / ✅ update | ✅ green |
| 19-12-01 | 5 | CBT-12 (SC3) | T-19-20 | integration (real controller) | `docker compose run --rm test npx vitest run tests/app/session/station-controller.test.ts tests/ui/station-outfitting.test.ts` | ✅ extend | ✅ green |
| 19-12-02 | 5 | CBT-12 (SC2, SC3) | T-19-20 | view-model | `docker compose run --rm test npx vitest run tests/ui` | ✅ extend | ✅ green |
| 19-12-03 | 5 | CBT-12 | T-19-21 | unit + contract | `docker compose run --rm test npx vitest run tests/app/session/probe-publisher.test.ts tests/contract/fidelity.test.ts` | ✅ extend | ✅ green |
| 19-11-01 | 6 | CBT-08 (SC1) | T-19-18, T-19-19 | unit | `docker compose run --rm test npx vitest run tests/app/session/sim-driver.test.ts tests/app/session/tick-parity.test.ts` | ✅ extend | ✅ green |
| 19-11-02 | 6 | CBT-08 | T-19-18, T-19-19 | unit | `docker compose run --rm test npx vitest run tests/app/session/step-options.test.ts tests/app/session/sim-driver.test.ts` | ✅ | ✅ green |
| 19-13-01 | 7 | CBT-08 (SC5) | T-19-22 | scenario twin | `docker compose run --rm test npx vitest run tests/app/session/tick-parity.test.ts` | ✅ extend | ✅ green |
| 19-13-02 | 7 | CBT-08 (SC5) | T-19-22 | list-only browser | `docker compose run --rm e2e npx playwright test --list tests/e2e/combat.spec.ts -g "CBT-08 end to end"` | ✅ extend | ✅ green |
| 19-14-01 | 8 | D-12 | T-19-23 | contract (verbatim) | `docker compose run --rm -v /tmp/oolite-7437f22:/oolite -e OOLITE_SRC=/oolite test npx vitest run tests/contract/fidelity.test.ts` | ✅ extend | ✅ green |
| 19-14-02 | 8 | D-05, D-07, D-12 | T-19-23 | contract (both modes) | the 19-14-01 command and `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts` | ✅ extend | ✅ green |
| 19-14-03 | 8 | phase gate | T-19-23 | guards + contract (then the release gate) | `docker compose run --rm test npx vitest run tests/guards tests/contract`; remote `verify-full` follows in the plan's `<verification>` (the phase gate, automatic, ROADMAP rule) | ✅ | ✅ green |

### Requirement-level floor

Every row below is covered by at least one task above.

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| CBT-08 (SC1) | Gate loop `(rand & 31) < amount`, `n_considered` (factor 95), die reversal, cargo branch, weighted pick, draw order, laser rolls only if energy > 0, scrape always | unit, hand-derived draws | `docker compose run --rm test npx vitest run tests/sim/combat/internal-damage.test.ts` | ✅ | ✅ green |
| CBT-08 (SC1) | Ledger emits `equipmentDamaged` / `cargoDestroyed` after `shipHit`, in order; no facts → no event | unit | `docker compose run --rm test npx vitest run tests/sim/combat/ledger.test.ts` | ✅ extend | ✅ green |
| CBT-08 (SC1) | Same fight damages the same item at 30/60/144 Hz | cadence | `docker compose run --rm test npx vitest run tests/sim/combat/internal-damage-cadence.test.ts` | ✅ | ✅ green |
| CBT-08 | Totality: NaN / negative / huge / empty / duplicate inputs | property | `docker compose run --rm test npx vitest run tests/sim/combat/internal-damage.property.test.ts` | ✅ | ✅ green |
| CBT-08 (D-01, D-12) | The 256-iteration cap, a recorded divergence (E-167): Oolite's count up to 8,192 points, 256 above it, and a later same-tick record reading the stream from where the capped one stopped (module and ledger) | unit | `docker compose run --rm test npx vitest run tests/sim/combat/internal-damage.test.ts tests/sim/combat/ledger.test.ts` | ✅ | ✅ green |
| CBT-08 | `holdPods` order and length match `holdPodsUsed` | unit + property | `docker compose run --rm test npx vitest run tests/sim/economy/` | ✅ extend | ✅ green |
| CBT-08 | Pinned constants (31, factor 95, mass term 21, `damage` purpose) | pinning | `docker compose run --rm test npx vitest run tests/sim/combat/constants.test.ts tests/sim/rng.test.ts` | ✅ extend | ✅ green |
| CBT-08 (SC5) | Hook-spawned fight: shooter destroyed with at least one debris piece, player leaves with a damaged item; all six measured literals (delay, kill offset, damaged keys, debris, entities, hash at +60) from the scan row; no save attempt on damage | scenario twin | `docker compose run --rm test npx vitest run tests/app/session/tick-parity.test.ts` | ✅ extend | ✅ green |
| CBT-08 (SC5) | Same in a real browser session, every literal of the assertion matrix and the HUD message row | browser (remote) | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts"` | ✅ extend | ✅ green |
| CBT-12 (SC2) | Damaged key leaves the installed set; dock computer refuses; compass falls back | unit | `docker compose run --rm test npx vitest run tests/sim/dock-computer.test.ts tests/sim/flight-controller.test.ts` | ✅ extend | ✅ green |
| CBT-12 (SC2) | HUD `%@ damaged.` / `%@ destroyed.` 4.5 s after clear, printed only when the commit took effect (refused cargo loss and repeated key print nothing); length guard | unit | `docker compose run --rm test npx vitest run tests/app/session/event-router-damage.test.ts tests/guards/hud-message-length.test.ts` | ✅ | ✅ green |
| CBT-12 (SC2) | Router pins: kinds, table, order (`damageFlow` before `hudMessages`), both damage kinds routed to `damageFlow` alone | pinned | `docker compose run --rm test npx vitest run tests/app/session-order.test.ts` | ✅ update | ✅ green |
| CBT-12 (SC2) | Atomic update: one `commitProfile` per event; identity on refusal | unit | `docker compose run --rm test npx vitest run tests/sim/player/damage.test.ts tests/app/session/station-controller.test.ts` | ✅ | ✅ green |
| CBT-12 (SC3) | Repair door: closed allow-list, forged keys, price `ceil(p/2)`, TL−1 rule, credits, no clock | unit | `docker compose run --rm test npx vitest run tests/sim/player/outfitting.test.ts` | ✅ extend | ✅ green |
| CBT-12 (D-03) | One damageable set: `REPAIRABLE_EQUIPMENT_KEYS` is `DAMAGEABLE_EQUIPMENT_KEYS` (damageable ⊆ repairable), equal to the compiled single-instance keys above 0, no laser record; the commit refuses any other key; the save allow-lists (`equipmentAllowLists`) and the `?test=1` grant admit no installed key the repair door cannot repair; the facts' keys above 0 are that set | guard + unit | `docker compose run --rm test npx vitest run tests/guards/damageable-equipment.test.ts tests/sim/player/damage.test.ts tests/persistence/save-v5.test.ts tests/app/session/probe-publisher.test.ts tests/app/session/step-options.test.ts` | ✅ | ✅ green |
| CBT-12 (SC3) | F3 rows: repair replaces buy row, verbatim copy, unaffordable refused with reason, confirm verb | view-model | `docker compose run --rm test npx vitest run tests/ui/station-outfitting.test.ts` | ✅ extend | ✅ green |
| CBT-12 | F5 lists damaged items first as `<name> (damaged)`, in damage order | view-model | `docker compose run --rm test npx vitest run tests/ui/station-status.test.ts` | ✅ extend | ✅ green |
| CBT-12 | Normal play: buy → damage → repair through the real controller | integration | `docker compose run --rm test npx vitest run tests/app/session/station-controller.test.ts` | ✅ extend | ✅ green |
| SAVE-09 (SC4) | v1–v3 → `corrupt` with no migration (19-06), then v5 schema strictness, `_DAMAGED` rejected, disjointness, combined cap, v4 → `corrupt`, future version (19-08, 19-09) | unit | `docker compose run --rm test npx vitest run tests/persistence/save-v4.test.ts` (19-06), then `tests/persistence/save-v5.test.ts` | ✅ | ✅ green |
| SAVE-09 (SC4) | Worst-case v5 save under `MAX_SAVE_CHARS` (65,536) at schema maxima | unit | same file | ✅ | ✅ green |
| SAVE-09 (D-11) | The deferred read-mode alias tolerance stays dead leniency: the two alias constants only in their pinned uses, the writer gate refuses an alias, the reader still accepts it; any change fails naming the todo (19-06) | guard (tripwire) | `docker compose run --rm test npx vitest run tests/guards/legacy-equipment-alias.test.ts` | ✅ | ✅ green |
| SAVE-09 (SC4) | Round trip and autosave bytes keep the damage | unit | `docker compose run --rm test npx vitest run tests/persistence/autosave.test.ts tests/persistence/restore-drift.test.ts` | ✅ update | ✅ green |
| SAVE-09 (SC4) | Continue shows the damaged item (v5 fixture); an in-session Load from an undamaged session turns `[]` into the damaged list | browser (remote) | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/save-load.spec.ts"` | ✅ extend | ✅ green |
| D-03 | `damageProbability` compiled, golden, drift | ingest | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/equipment.test.ts`; `docker compose run --rm assets npm run assets:check` | ✅ extend | ✅ green |
| D-05/D-07/D-12 | FIDELITY rows E-154 to E-170 and Key Decisions rows valid; "Repair: X" is Oolite's text (faithful E-170, the name wrapper); F5's wording (E-165) and damage order (E-169) quote the concrete F5 decision row, damaged-first is faithful (E-168); the repair-row colour a divergence row (E-166) quoting the station-palette row; the loop cap a divergence row (E-167); every new divergence row carries `Reviewers: Fable, Kimi K3.1 Pro and Qwen4 Max agree (19-REVIEWS.md)` (10 FIDELITY rows, 6 Key Decisions rows; 19-14-02 acceptance greps) | contract | `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts` | ✅ extend | ✅ green |
| Purity | New sim files obey bans; economy file list pinned | guards | `docker compose run --rm test npx vitest run tests/guards/` | ✅ update | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/sim/combat/internal-damage.test.ts`, `internal-damage-cadence.test.ts`, `internal-damage.property.test.ts` — roll, cadence, totality
- [x] `tests/sim/player/damage.test.ts` — pure profile operations
- [x] `tests/helpers/save-builders.ts` — the shared current-version save builders (19-06)
- [x] `tests/persistence/save-v5.test.ts` — the former v4 suite moved and extended at the v5 bump (19-08); the golden-chain test is removed in 19-06 and the historical goldens become rejection fixtures
- [x] `tests/app/session/event-router-damage.test.ts` — router rows, HUD copy, commit
- [x] `tests/guards/damageable-equipment.test.ts` — the one damageable set: damageable ⊆ repairable, no laser record (19-05)
- [x] `tests/guards/legacy-equipment-alias.test.ts` — the tripwire on the deferred read-mode alias tolerance, with its todo `2026-11-21-retire-legacy-equipment-alias-read-tolerance.md` (19-06)
- [x] A TL ≥ 8 system fixture for repair tests (Lave is raw TL 4)
- Framework install: none

---

## Manual-Only Verifications

All phase behaviors have automated verification. Browser specs run on the remote test machine only.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60 s for targeted runs
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-21 (validate-phase audit: 109 Vitest files / 2396 tests green in Docker, fidelity verbatim mode 9/9 with `OOLITE_SRC`; browser rows green on the remote machine: combat spec at `e2f7fa3`, `verify-full` at `75de63c`, 147 specs)

## Validation Audit 2026-11-21

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
