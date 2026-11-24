---
phase: 15-damage-ledger-and-kills
verified: 2026-11-16T21:10:00Z
status: passed
owner_acknowledged: "OD-1 and OD-2 accepted by the owner 2026-11-16 after two independent reviews (opus, fable)"
score: 4/4 must-haves verified
covered_files:
  - ".planning/phases/15-damage-ledger-and-kills/15-01-PLAN.md"
  - ".planning/phases/15-damage-ledger-and-kills/15-01-SUMMARY.md"
  - ".planning/phases/15-damage-ledger-and-kills/15-02-PLAN.md"
  - ".planning/phases/15-damage-ledger-and-kills/15-02-SUMMARY.md"
  - ".planning/phases/15-damage-ledger-and-kills/15-03-PLAN.md"
  - ".planning/phases/15-damage-ledger-and-kills/15-03-SUMMARY.md"
  - ".planning/phases/15-damage-ledger-and-kills/15-04-PLAN.md"
  - ".planning/phases/15-damage-ledger-and-kills/15-04-SUMMARY.md"
  - ".planning/phases/15-damage-ledger-and-kills/15-05-PLAN.md"
  - ".planning/phases/15-damage-ledger-and-kills/15-05-SUMMARY.md"
  - ".planning/phases/15-damage-ledger-and-kills/15-06-PLAN.md"
  - ".planning/phases/15-damage-ledger-and-kills/15-06-SUMMARY.md"
  - "src/content/generated/ships-npc.json"
  - "src/sim/combat/ledger.ts"
  - "src/sim/combat/step.ts"
  - "src/sim/world/entity.ts"
  - "src/sim/world/kill.ts"
  - "src/sim/world/populate.ts"
  - "src/sim/world/serialize.ts"
  - "src/sim/world/snapshot.ts"
  - "src/sim/world/step.ts"
covered_digest: "v4:sha256:72e137847461a5d397396de1836f2a76c871257cd49c0e0db7c0616be9508314"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 4/4
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 15: Damage Ledger and Kills Verification Report

**Phase Goal:** A ship whose energy reaches zero is destroyed and removed through one damage ledger and one idempotent kill path, the world never holds a dead entity at a tick boundary, and the NPC records and entity state carry every field the rest of the milestone needs, in one snapshot bump.
**Verified:** 2026-11-16
**Status:** passed (all four success criteria verified; OD-1 and OD-2 accepted by the owner on 2026-11-16 after two independent reviews)
**Re-verification:** Yes, delta re-verification at HEAD 28154fb after commit d380ebd (shooter position copied into the hit record) and the planning-doc commits 60e5de6 and 28154fb; no regression, no gap

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP success criterion) | Status | Evidence |
|---|-----------------------------------|--------|----------|
| 1 | A ship brought to zero energy by the player's laser or a scripted pilot's is destroyed on that tick: gone from the scanner, ident lock ended, holders told by an AI event before the tick ends; the station and the player are never removed | VERIFIED | `resolveShots` (`src/sim/combat/step.ts:360-390`) runs `applyLedger`, then `killShip` per lethal victim, `drainAiEventsNow`, a second `commitWorld` (one `entityRemoved` each) and `updateIdentTarget`. `killShip` (`src/sim/world/kill.ts`) emits `shipDestroyed`, posts `shipTargetLost` to every live holder of the victim and `shipTargetDestroyed`/`shipKilledOther` to a live NPC killer. The player, station and buoys are never in the store; the player's hit path in `applyLedger` is never lethal and floors at 0. Browser step: `tests/e2e/combat.spec.ts` passed on the remote machine (shooter leaves the scanner, lock ends). |
| 2 | One ledger applied after the world step; a snapshot at any tick boundary holds no dead entity and no queued AI event; spawn-tick kill, mutual kill and repeated kill request round-trip, proven by a random-fight property test | VERIFIED | `applyLedger` is the only damage applicator (NPC energy written only by ledger, recharge and sanitiser). `killShip` is idempotent (`store.kill` false on a second call) and total. `tests/sim/combat/kill.property.test.ts` (9 tests, 50-run seeded fast-check with non-vacuity floors, directed spawn-tick, mutual and repeated cases, totality properties) and `tests/sim/world/snapshot.test.ts` ("1,000 ticks across a kill") pass. `killEntity` has no non-test caller (`rg` over `src`). |
| 3 | New hashed fields (weapon, cargo, static health, debris motion) arrive in one snapshot v4 bump and one Lave golden regeneration; stripping the new segments re-hashes to the old golden; pristine-omit; hash replays equal at 30, 60 and 144 Hz | VERIFIED (OD-1 accepted by the owner 2026-11-16) | `WORLD_SNAPSHOT_VERSION = 4` (`snapshot.ts:88`); `Entity.velocity`, `Entity.weapon {temperature,lastShotTick,missedShots}`, `Entity.cargo` and per-world `staticHealth` with `;vel:`, `;wpn:`, `;cargo:` and `staticHealth:` segments printed only when non-pristine (`serialize.ts`). `tests/sim/world/populate.test.ts` proves `fnv1a32(stripV4(golden)) === c1068643`, then `ab72eedf` and `b23d11d8` after stripping steer and energy. Cadence at 30/60/144 Hz in `tests/sim/world/world-cadence.test.ts` and the cross-cadence kill case. Snapshot codec round trip, v3/v5 refused, sanitiser/parser agreement (378 codec tests) pass. |
| 4 | The nine NPC records carry weapon facings, `likely_cargo`, `max_cargo`, `fragment_chance` and `explosion_type` compiled from Oolite with `like_ship` resolved and provenance, behind the strict schema, golden and drift gate | VERIFIED | `src/content/generated/ships-npc.json` holds 9 records with 27 fields including `aftWeapon*`, `portWeapon*`, `starboardWeapon*`, `likelyCargo`, `maxCargo`, `fragmentChance`, `explosionType`. Spot-checked against `/home/opencode/git/oolite/Resources/Config/shipdata.plist` through `like_ship` templates: moray 5/7, mamba 3/4, shuttle max 30 match. `assets:check` reports no differences; `tests/content/ships-npc.test.ts` (32 tests) passes; NOTICE paragraph is recorded. |

**Score:** 4/4 truths verified (0 present but behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sim/combat/ledger.ts` | One damage ledger | VERIFIED | 143 lines, total (skips non-finite amounts, missing, dead, static or non-ship targets); wired from `resolveShots`. |
| `src/sim/world/kill.ts` | Idempotent `killShip` with notifications | VERIFIED | Wired from `resolveShots`; killer normalised at call time. |
| `src/sim/world/step.ts` `drainAiEventsNow` | Immediate drain before second commit | VERIFIED | Truncates fireQueue, re-sanitises after the drain. |
| `src/sim/world/{entity,serialize,snapshot,sanitize,limits}.ts` | v4 fields, segments, codec, bounds | VERIFIED | Bounds in `limits.ts`; sanitiser repairs each new leaf. |
| `src/sim/world/populate.ts` | Cargo at spawn by Oolite `setCargoFlag:` rule | VERIFIED | `cargoCountAtSpawn`; Lave cargo counts pinned by hand in a test. |
| `src/content/schemas/ship-npc.ts`, `tools/oolite-ingest/convert/npc-ships.ts`, `ships-npc.json`, golden | DATA-14 fields | VERIFIED | Drift gate clean. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `resolveShots` | `applyLedger` -> `killShip` -> `drainAiEventsNow` -> `commitWorld` -> `updateIdentTarget` | direct calls, step.ts:375-388 | WIRED |
| `stepSim` | `resolveShots` (layout, `AI_REGISTRY`) | `src/sim/sim.ts` | WIRED |
| `killShip` | AI handlers | `postAiEvent` then immediate drain | WIRED |
| Populator | `Entity.cargo` | `cargoCountAtSpawn` from compiled `likelyCargo`/`maxCargo` | WIRED |

### Behavioral Spot-Checks and Gates

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Targeted Vitest (ledger, kill, property, hash, codec, snapshot, populate, ships-npc) | `docker compose run --rm test npx vitest run <8 files>` (local Docker) | 8 files, 542 passed, 1 skipped (`it.skipIf(OOLITE_SRC === "")`, an environment-gated Oolite source check) | PASS |
| Fast gate | `wegolite-remote-run.sh run --rm verify` at HEAD b4a97b9 | lint, typecheck, `assets:check` (no differences), 207 test files, 5245 passed, 10 skipped, build and e2e smoke 27 passed; exit 0 | PASS |
| Browser kill step | `wegolite-remote-run.sh run --rm e2e ... playwright test tests/e2e/combat.spec.ts` | 1 passed | PASS |
| QUAL-11 20-seed acceptance, by hand on the remote | `wegolite-remote-run.sh run --rm test npm run test:acceptance` | 21 of 21 passed, 77 s | PASS |

The local full-suite run (`docker compose run --rm test`) was started and abandoned for slowness; the remote `verify` run covers the same suite and is authoritative for the gate.

### Probe Execution

Step 7c: SKIPPED (no probe scripts declared by the phase plans).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FOUND-18 | 15-02, 15-03 | One v4 bump, one golden regeneration, strip-and-rehash, pristine-omit | SATISFIED (OD-1 accepted) | Truth 3 |
| FOUND-19 | 15-04, 15-05, 15-06 | One ledger after the world step; second commit; idempotent `killShip`; no dead entity or queued event at the boundary | SATISFIED | Truths 1, 2 |
| DATA-14 | 15-01 | NPC record weapon facings, cargo, fragment chance, explosion type with provenance | SATISFIED | Truth 4 |

No orphaned requirements: REQUIREMENTS.md maps only these three to Phase 15.

### Anti-Patterns Found

No unreferenced `TBD`/`FIXME`/`XXX` markers were found in the verified source files. No stubs: every new function is wired and exercised. Documented, accepted divergences from Oolite (recorded in PROJECT.md Key Decisions, not defects): a same-tick mutual kill is possible and credited asymmetrically by id; a ship doomed by an earlier record of the tick still receives `shipHit` for a later one; a holder can receive `shipTargetLost` twice (handlers must be idempotent).

### Human Verification Required

None. OD-1 (golden regeneration order) and OD-2 (D-05 narrowing) were the only open items; the owner accepted both on 2026-11-16 after two independent reviews (opus, fable), recorded in PROJECT.md Key Decisions and the ROADMAP plan lines.

### Re-verification Delta (d380ebd..HEAD)

| Change | Evidence | Result |
|--------|----------|--------|
| `src/sim/combat/step.ts` (d380ebd): `sourcePosition` is now a copy (`{ ...(store.get(shooter)?.position ?? ray.origin) }`) | `rg sourcePosition src`: one producer (`resolveShotHits`, step.ts:314), one consumer (`ledger.ts:102`, `sub(record.sourcePosition, player.position)`, read-only) | Behaviour-neutral; resolveShots wiring (applyLedger, killShip, drainAiEventsNow, commitWorld, updateIdentTarget, step.ts:375-388) unchanged |
| `.planning/PROJECT.md`, `.planning/ROADMAP.md` (60e5de6) | OD-1 and OD-2 marked accepted; ROADMAP "First plan" line and 15-03/15-05 plan lines reworded; Phase 16 carry-over note added | Docs only; no success criterion changed |
| Other `src/` or content files | `git diff d380ebd~1 HEAD --stat` lists only step.ts under `src/` | `ships-npc.json`, ledger, kill, world modules untouched since the first verification |
| Targeted Vitest in Docker | `docker compose run --rm test npx vitest run tests/sim/combat tests/sim/world` | 29 files, 1402 passed, 1 skipped (environment-gated Oolite source check); includes ledger, kill, kill.property, snapshot, populate, hash, world-cadence |
| Remote full `test` at 60e5de6 (reported by the orchestrator) | 207 files, 5245 tests passed | PASS |

### Gaps Summary

No gaps. Every success criterion is still backed by code and passing tests. The one source change since the first verification is behaviour-neutral. Status is `passed`; the owner acknowledgements OD-1 and OD-2 are recorded in the `owner_acknowledged` frontmatter field.

---

_Verified: 2026-11-16 (re-verified at HEAD 28154fb)_
_Verifier: Claude (gsd-verifier)_
