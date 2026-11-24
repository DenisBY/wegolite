---
phase: 16-wreckage-cargo-and-the-entity-cap
plan: 09
subsystem: verification-and-records
tags: [e2e, browser-proof, world-hash, draw-calls, cold-start, fidelity, key-decisions, performance, validation, world-17, data-16]
status: complete

requires:
  - phase: 16-06
    provides: "the debris twin's pins: kill at spawn +794, 19 entities, hash a10b2dfc 60 ticks after the kill"
  - phase: 16-07
    provides: "the explosion layer (at most 2 calls, particle textures loaded on the first explosion)"
  - phase: 16-08
    provides: "the debris layer (at most 7 calls, models requested after the first in-flight latch)"
provides:
  - "combat.spec step 5: the kill's debris, the draw-call budget and the world hash proved in a real browser against the layer-free Node twin"
  - "budget.spec and traffic.spec: no debris model, debris texture or particle texture before the first in-flight frame, traffic off and on; the debris and explosion chunks only with traffic on"
  - "npc-assets.spec: the seven debris GLBs, their six images and both particle PNGs decode from the preview"
  - "PROJECT.md Key Decisions rows A to H for D16-01 to D16-26, OC-1 to OC-7 flagged; three Phase 15 rows amended"
  - "FIDELITY.md E-71 to E-88, eleven constants ledger rows, one open item"
  - "docs/PERFORMANCE.md after-a-kill scene and the 2026-11-17 cold starts; the measurement todo's wreck lifetime and debris look items; 16-VALIDATION.md signed off for every task's automated verify"
affects: [16-verify, 17, 18]

plan_head_before: dbbdd0c29ef41c4dddbd43938e6b23232fe437c2
plan_head_after: 248d9df6a223a8867ae3c0dd3449c05b4cd5842f
commits: 3

actuals:
  tokens: 41000
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A browser step that lands on a Node twin's exact tick: chunked manual ticks clamped to one tick short of the pinned kill offset, then one tick, so the kill and the fire release happen on the twin's tick"
    - "Lazy-load proof by request-log index: the log length is marked on the tick before the kill, and no debris or particle path may appear before the mark"

key-files:
  created: []
  modified:
    - tests/e2e/combat.spec.ts
    - tests/e2e/budget.spec.ts
    - tests/e2e/traffic.spec.ts
    - tests/e2e/npc-assets.spec.ts
    - .planning/PROJECT.md
    - FIDELITY.md
    - docs/PERFORMANCE.md
    - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
    - .planning/phases/16-wreckage-cargo-and-the-entity-cap/16-VALIDATION.md
    - CHANGELOG.md

key-decisions:
  - "D16-25 supported: no populator, traffic or hook path gives a ship an escort owner, so the formation reader never sees a dead leader; port escortCheckMother in the first phase that spawns escorts"
  - "D16-14 (OC-5): no code change for the doubled hit sound, because shipHit has no consumer"
  - "OC-1 to OC-7 recorded in the Key Decisions rows as pending owner confirmation; OC-7's real vendoring run was done by the orchestrator on the owner's standing instruction"

requirements-completed: []  # WORLD-17 and DATA-16 are proved by the browser step, but this plan's verification also names verify-full (OC-6), which has not run; REQUIREMENTS.md stays open and the roadmap-level completion is left to the orchestrator's verify step after the owner's go

duration: 21min
completed: 2026-11-17
---

# Phase 16 Plan 09: The browser proof and the Phase 16 records Summary

**A real browser now reproduces the Node debris twin exactly: the hook-spawned Viper with 20 cargo capsules dies on spawn +794 into 19 live entities, the frame with the explosion and the debris drawn uses 21 of the 50 allowed draw calls, and the world hash 60 ticks later is the twin's `a10b2dfc`, so the render layers do not touch the hash. Cold starts fetch no debris or particle asset, traffic off or on. Every Phase 16 decision is now a Key Decisions row, with the owner-confirmation items flagged. FIDELITY.md quotes 18 new verbatim excerpts, including Oolite's escort release.**

## Performance

- **Duration:** about 21 min
- **Started:** 2026-11-17T01:31:28Z
- **Completed:** 2026-11-17T01:52Z
- **Tasks:** 2
- **Files modified:** 10

## Task 1: the browser proof (tracer)

### What changed

- `tests/e2e/combat.spec.ts`: step 2 now calls `spawnTestShooter(20)` and reads `probe.sim.tick` at the spawn. In step 4, the 60-tick chunks are clamped so the spec reaches spawn +793, then steps one tick. The kill is therefore seen on the twin's tick and fire is released on it, as the twin does. The request-log length and the draw counters are recorded on tick +793.
- Step 5 asserts:
  - the kill lands on spawn +794;
  - `probe.sim.entities` is 19 on the kill tick;
  - no debris GLB or particle PNG was requested before the mark;
  - after `advanceTicks(60)`, the pod and plate GLBs, at least one wreck GLB and both particle PNGs have finished loading;
  - `worldHash()` equals the twin's literal `a10b2dfc`;
  - calls are above 0 and at most 50;
  - the console error list is empty.
- `tests/e2e/budget.spec.ts`: a new `debrisAssetPaths()` reads `ships-debris.json`, each GLB's JSON chunk and `explosions.json`, and adds the flash texture. The vacuity guards expect 7 GLBs, 6 textures and the 2 particle PNGs. The traffic-off cold start requests none of these paths and neither the `ships-debris` nor the `explosions` chunk.
- `tests/e2e/traffic.spec.ts`: in the traffic-on cold start, both chunks are requested at boot and counted in the cold-start bytes, and no debris or particle path is requested before the first in-flight frame (vacuity guards as above).
- `tests/e2e/npc-assets.spec.ts`: the in-page fetch-and-decode routine is now a named function shared by two tests. The new second test checks each of the seven debris GLBs (status, magic, version, declared length), decodes all six unique images and decodes both particle PNGs.

### Remote results

- **First run**, through `wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test <the four specs> --reporter=list"` at committed HEAD **178bdf5**: **exit 0**, 9 of 9 passed, **63 s**. Step 5 passed on the first attempt: the browser kill tick, entity count and hash equal the twin's pins. No pinned literal was edited.
- **Second run**, the same four specs with `--reporter=json` at **178bdf5**, to read the annotations: **exit 0**, 9 of 9 passed (expected 9, unexpected 0, flaky 0), **61 s**.

| Measurement (annotation) | Value |
|---|---|
| Combat scene on the tick before the kill (shooter alive) | 19 calls, 51,614 triangles |
| Combat scene 60 ticks after the kill (explosion cloud, 3 pods, 1 plate and the remaining wrecks drawn) | **21 calls**, **51,423 triangles** |
| Traffic-off cold start to the first in-flight frame | **8,866,124 bytes** (ceiling 9,437,184) |
| Traffic-on cold start to the first in-flight frame | **8,878,213 bytes** (ceiling 9,437,184) |
| `ships-debris-*.js` and `explosions-*.js` chunks (traffic on, on the wire) | 512 and 352 bytes |
| Traffic-on scene, models held and loaded (unchanged) | 9 calls, 39,192 triangles; 17 calls, 49,095 triangles |
| Static scenes (Lave and Diso, unchanged) | 13, 8, 10, 13, 10 calls |

## Task 2: records, fidelity map, measurements, sign-off

### PROJECT.md

Eight Key Decisions rows were added after the Phase 15 rows. Each begins with the exact text the plan requires:

- (A) "Destroyed ships explode into Oolite's debris on their own combat stream, in one fixed order": D16-01, 12, 13, 15, 16, 17, 18, 19 and 24; OC-1.
- (B) "Debris is shed per piece at the entity cap: pods and plates below 0.95 x 256, wreckage below 0.50 x 256": D16-05 and D16-06, the dropped frame-time and visibility terms, the counting differences, and at least 12 slots kept for ships.
- (C) "Wreckage burns down by Oolite's heat damage, about E/1000 seconds (LOW confidence)": D16-11, the burn-down table, and the measurement todo.
- (D) "The explosion's blast pushes debris only": D16-04 and D16-20; OC-4.
- (E) "Debris is not a target in Phase 16": D16-03 and D16-26; OC-3.
- (F) "Debris assets are vendored from the local Oolite checkout and compiled with only what is drawn": D16-02, 07, 08, 22 and 23; OC-7.
- (G) "Explosions and debris live only in the render layer": D16-08, 10, 21 and 09; OC-2. OC-6 is flagged here because `verify-full` for this render phase waits for the owner.
- (H) "Phase 15 carry-overs closed in Phase 16": D16-14 with OC-5, D16-25, the hook cargo route and the router widening.

Three Phase 15 Outcomes were amended:

- snapshot v4: plan 16-06 used the cargo route;
- the kill path: the doubled hit sound was checked, OC-5;
- kill notifications: plan 16-07 routed `shipDestroyed` without the id, the OD-2 follow-through.

Greps: "Phase 16 plan" on 11 lines; "OC-[1-7] pending owner confirmation" on 7 lines.

### The escort release (D16-25): supported

The Oolite side was read at the pinned commit:

- `escortCheckMother` (`ShipEntityAI.m:1591-1605`, 15 lines);
- `acceptAsEscort:`, which refuses a leader that is not `STATUS_IN_FLIGHT` (`ShipEntity.m:11926-11934`, 9 lines);
- `becomeExplosion` setting `STATUS_DEAD` (`ShipEntity.m:7924`);
- `escortAI.plist`, whose `UPDATE` actions call `escortCheckMother` with pauses of 15, 7.5 and 2.5 s.

The Wegolite side was checked read-only:

```
$ rg -n "ownerId|escortSlot" src/sim/world/populate.ts src/app/session/traffic.ts src/sim/ai/test-spawn.ts
(no output, exit 1)
```

Across `src/`, outside tests, `ownerId` is set only from `SpawnInit.ownerId` (`world.ts:534`), and no non-test caller passes it. No spawn path creates an escort, so the formation reader (`src/sim/npc/behaviours/formation.ts:53`) is never reached with a dead leader. D16-25 stands, as recorded in row H and in FIDELITY rows E-87 and E-88. The port of `escortCheckMother` belongs to the first phase that spawns escorts.

### FIDELITY.md

- 19 Mechanics rows and 18 excerpts, E-71 to E-88. Every excerpt was generated from `git -C /home/opencode/git/oolite show 7437f22:<path>`. The excerpts cover:
  - pod survival, pod placement, `add_debris` and the wreckage gate;
  - wreck count and placement, the `n_alloys` start, the plates and pod contents;
  - `addWreckageFrom:`, heat damage, momentum, the blast amount and `randomFullNodeFrom`;
  - the particle cap, the explosion flash, `performTumble`, `escortCheckMother` and `acceptAsEscort`.
- Each divergence row quotes rows A to H.
- 11 constants ledger rows and one open item on the unmeasured wreck lifetime and debris look.
- The escort-release excerpt check prints 15 and 9 lines.

### Other files

- `docs/PERFORMANCE.md`:
  - the scene row "Lave in flight, traffic on, after a kill (debris and explosion live)" (21 calls, 51,423 triangles, 2026-11-17);
  - the layer bounds (debris at most 7 calls, explosion at most 2);
  - the 2026-11-17 cold starts with the two new chunks.
- The measurement todo gains two items:
  - the wreck lifetime: log a wreck's `energy` and `temperature` in the OXP and compare with row C's formula;
  - the explosion and debris look, compared side by side.
- `16-VALIDATION.md`:
  - every per-task status is set and the Wave 0 and sign-off boxes are ticked;
  - `nyquist_compliant: true` and `wave_0_complete: true`;
  - `status` stays `draft`, with a comment that the remote `verify-full` (OC-6) is pending;
  - the approval line says `verify-full` has not run and that OC-1 to OC-7 stay pending.

## Task Commits

1. **Task 1: the browser proof (tracer)**: `178bdf5` (test)
2. **Task 2: decisions, fidelity map, measurements, sign-off**: `9b47831` (docs)
3. **Task 1 follow-up: the literal `spawnTestShooter(20)` named in a comment** (the acceptance grep and the artifact contract look for it): `248d9df` (test). Comment only, so the browser runs at `178bdf5` stand. The remote `verify` ran at `9b47831`, before this commit.

Tracer gate: Task 1's `<verify>` (typecheck, lint, and the remote run of the four specs) passed end to end before Task 2 started.

## Gates

| Gate | Where and how | Result |
|---|---|---|
| `typecheck` | local, Docker | no `error TS` |
| `lint` | local, Docker, after each task | eslint clean, prettier clean |
| Fidelity contract, structural | `tests/contract/fidelity.test.ts` with `tests/compliance.test.ts` | 2 files, 24 passed, 1 skipped (the verbatim case, by design) |
| Fidelity contract, verbatim | `-v /tmp/oolite-src-16:/oolite-src:ro -e OOLITE_SRC=/oolite-src`, an extraction of `git archive 7437f22 src` | 9 of 9 passed, verbatim case included |
| Full suite with coverage | `docker compose run --rm test` | exit 0; 216 files, 5,545 passed, 10 skipped, no coverage threshold error. `tests/guards/harness-isolation.test.ts` did not fail |
| Remote `verify` | `wegolite-remote-run.sh run --rm verify` at **9b47831** | exit 0, **149 s**: lint, typecheck, `assets:check` (no differences), 216 unit files (5,545 passed, 10 skipped), build, `check:dist` (123 files, no harness marker), e2e smoke 27 of 27 |
| Remote browser specs | the four specs (Task 1) at **178bdf5** | exit 0 twice, 9 of 9 each time |
| **Remote `verify-full`** | not run | **NOT RUN: pending the owner's go (OC-6)** |
| 20-seed acceptance run | not needed | nothing under `src/sim/npc/**` or `src/sim/world/**` and no `ships-npc.json` change; no frozen detector or threshold touched |

The remote `verify-full` was not run. The owner has not given the go (OC-6, ROADMAP gate rule: "run only when the owner confirms"). Once the owner confirms, run:

```
/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify-full
```

Record the result, the elapsed time, the HEAD and the owner's confirmation in the phase verification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Accuracy] The changelog entry overstated the wreck burn-out time**
- **Found during:** Task 2, while writing row C
- **Issue:** the Unreleased entry from plan 16-08 said the wreckage "burns out after about a second". A wreck's energy is half its lifetime, so at most 675. The longest burn-down is 82 ticks (0.68 s): the burn-down table pinned in plan 16-04 and `(1000 - sqrt(1e6 - 20 E)) / 10`. Plan 16-08's deviation note used 1350 (the full lifetime) where the energy is 675.
- **Fix:** "burns out within a second".
- **Files modified:** `CHANGELOG.md`
- **Commit:** `9b47831`

**2. [Scope] Extra excerpts beyond the plan's list**
- Two excerpts were added that the interfaces block did not list:
  - E-76 (`ShipEntity.m:7915-7916`, `speed_low` and the `n_alloys` start);
  - E-82 (`ShipEntity.m:8123-8126`, the blast's `0.125 x mass` within `2.5 x radius`).
- Two Mechanics rows share E-72: the placement, and the compiled bounding box in `src/content/schemas/ship-npc.ts`.
- The contract allows both, and they give the ledger constants an excerpt.

**3. [Scope] Step 4's chunking changed, not only extended**
- The plan said "keep steps 1 to 4". Step 4 still advances in 60-tick chunks with the 1,500-tick bound, but it now stops one tick short of the twin's kill offset and steps one tick. Without this, the kill is observed at the next chunk boundary (+842) with fire held 48 ticks past the kill, which is not the twin's sequence. Step 4's assertions are unchanged.

**4. [Owner gate] verify-full not run, VALIDATION status left draft**
- The plan's Task 2 ends with the remote release gate after the owner's go, and asks for `status: complete` in 16-VALIDATION.md. Per the orchestrator's instruction (the owner has not given the go), `verify-full` was not run, and `status` stays `draft` with an explanatory comment. `nyquist_compliant` and `wave_0_complete` are true, because they describe task verification, not the release gate.

## Owner confirmation (pending, all recorded in Key Decisions)

| ID | Item | Row |
|---|---|---|
| OC-1 | No commodity draw; every pod is an anonymous `barrel` cargopod | A |
| OC-2 | Tumble from the orientation and flight time, not the entity id | G |
| OC-3 | Debris is not a laser, ident or ram target in Phase 16 | E |
| OC-4 | The blast pushes debris only | D |
| OC-5 | Doubled hit sound: no change (`shipHit` has no consumer) | H, and the Phase 15 kill-path row |
| OC-6 | `verify-full` at the phase end: **not run, waiting for the owner's go** | G |
| OC-7 | The real vendoring run was done by the orchestrator on the owner's standing instruction, not by the owner | F |

D16-25 was supported, not corrected, so no new owner-confirmation item was added.

## Requirements

WORLD-17 (drawn within the budget, hash unaffected) and DATA-16 (vendored assets loaded lazily, every asset decodes) are proved by the browser step. They stay open in REQUIREMENTS.md because this plan's verification also names `verify-full`, which has not run. Marking them complete is left to the orchestrator's verify step after the owner's go.

## Known Stubs

None.

## Threat Flags

None. No `src` change. The threats in the plan's register are mitigated as planned:

- T-16-28: no debris or particle asset before the first in-flight frame, with traffic off and on, under the unchanged ceiling.
- T-16-29: every divergence quotes a Key Decisions row, verified structurally and verbatim.
- T-16-30: the browser hash with the layers on equals the layer-free twin.

## Issues Encountered

- The first remote run used the list reporter, which does not print annotations. A second run of the same four specs with `--reporter=json` at the same HEAD gave the calls, triangles and bytes. Both runs passed.
- On the wire, `ships-debris-*.js` measures 512 bytes against a raw 1.86 kB chunk, while `explosions-*.js` measures 352 bytes, its raw size. This suggests the server compresses only responses above a size threshold. The value recorded is Playwright's `responseBodySize`, the same measure as the cold-start total.

## Self-Check: PASSED

- FOUND: tests/e2e/combat.spec.ts (`spawnTestShooter(20)`, `SHOOTER_CARGO = 20`, `worldHash`)
- FOUND: tests/e2e/budget.spec.ts (`ships-debris.json`), tests/e2e/npc-assets.spec.ts (`ships-debris.json`), tests/e2e/traffic.spec.ts (`oolite-particle`)
- FOUND: FIDELITY.md E-71 to E-88; .planning/PROJECT.md rows A to H
- FOUND: 178bdf5, 9b47831, 248d9df in HEAD's history
