---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 08
subsystem: sim
tags: [steering-record, world-hash, snapshot-format-3, golden-regeneration, sanitiser]
status: complete

requires:
  - phase: 08-session-split-and-world-core
    provides: Entity, sanitizeEntity, serializeEntity, the snapshot codec and limits.ts
  - phase: 13-views-lasers-and-shields
    provides: the energy-bank precedent (snapshot version 2, one golden regeneration, strip-and-rehash proof)
provides:
  - Entity.steer, the frozen steering record (src/sim/npc/state.ts SteerComponent, SavedCondition, ACCURACY_UNRESOLVED, createSteerComponent(escortSlot))
  - SpawnInit.escortSlot (integer 0 to 15), refused with outOfDomain or malformed otherwise
  - the steering bounds in limits.ts (MAX_STEER_RATE, MIN_ACCURACY, MAX_ACCURACY, MAX_FRUSTRATION, MAX_ESCORT_SLOT, TRACKING_SAMPLES)
  - the always-present last hash segment ";steer:" and WORLD_SNAPSHOT_VERSION 3
  - inert-lave-epoch1.json regenerated once (fnv ab72eedf to c1068643)
affects: [14-09, 14-10, 14-11, 14-12, 14-13, 14-14, 14-15, 14-16, 14-17, 14-18, 14-19]

requirements-completed: []
requirements-advanced: [AI-01]

plan_head_before: 047c132a638e48c73c4a6800cff332cfaecd6f37
plan_head_after: bd3970aed638956eee238ff8668362d115126900

actuals:
  tokens: 25500
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A per-entity record hashed as one always-present, uniquely labelled last segment, so stripping it re-hashes to the previous golden"
    - "A record normalises stale optional data silently (count-0 curve samples) and repairs out-of-domain data with one counted repair per call"

key-files:
  created:
    - src/sim/npc/state.ts
  modified:
    - src/sim/world/entity.ts
    - src/sim/world/world.ts
    - src/sim/world/limits.ts
    - src/sim/world/sanitize.ts
    - src/sim/world/serialize.ts
    - src/sim/world/snapshot.ts
    - tests/sim/world/sanitize.test.ts
    - tests/sim/world/snapshot-codec.test.ts
    - tests/sim/world/snapshot.test.ts
    - tests/sim/world/populate.test.ts
    - tests/golden/world/inert-lave-epoch1.json
    - .planning/PROJECT.md

key-decisions:
  - "Hash policy: option-append, owner-chosen 2026-11-15 (always append one steering segment, regenerate the inert golden exactly once); recorded in the PROJECT.md Key Decisions row"
  - "The steering segment is LAST in the entity line under the unique label ;steer: and prints every field, escortSlot included; optional parts carry tags (t0 or t4: for the curve, sv:z or sv: for the saved condition)"
  - "Stale tracking samples at count 0 are zeroed by sanitizeEntity without a repair and never printed, so equal states hash equally"
  - "The strict v3 parser requires the canonical form at count 0 (every tick and position zero); snapshotWorld writes that form"
  - "A malformed saved condition becomes null; only its targetId is repaired field-wise to 0 (uint32 domain check, no liveness check: the sanitiser has no store)"

patterns-established:
  - "Field set frozen: a later plan that needs another SteerComponent field stops and reports it"

coverage:
  - id: D1
    description: "Every spawned ship carries a default steering record (slot 0 unless named, accuracy -100, no curve) that spawnEntity creates with fresh arrays and vectors; an out-of-range escortSlot is refused without throwing"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/world/sanitize.test.ts#the steering record at spawn and in the hash (AI-01)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/populate.test.ts#gives every inert ship the default steering record"
        status: pass
    human_judgment: false
  - id: D2
    description: "sanitizeEntity repairs every field of the record before any hash, one counted repair per call, with the signed tick domain keeping a legitimate early start clean and a count of 4 with non-strictly-decreasing ticks repaired to count 0"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/world/sanitize.test.ts#sanitizeEntity table"
        status: pass
    human_judgment: false
  - id: D3
    description: "The steering segment is hashed last under ;steer:, every field covered; the inert golden regenerated once and stripping the segment re-hashes to the previous golden ab72eedf; flight-hash-pins.json untouched"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/world/populate.test.ts#is the pre-steering world plus one steer: segment per ship"
        status: pass
      - kind: unit
        ref: "tests/sim/world/flight-hash-pins.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "WORLD_SNAPSHOT_VERSION 3 carries the record with strict keys and bounds; a version-2 snapshot is refused; restore hashes like the source also after 1,000 steps; hostile records (extra keys, non-finite, out-of-bound, count other than 0 or 4, non-decreasing ticks) are refused"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/world/snapshot-codec.test.ts#parseWorldSnapshot rejections"
        status: pass
      - kind: unit
        ref: "tests/sim/world/snapshot.test.ts#keeps a world whose ships hold a non-default steering record equal for 1,000 ticks"
        status: pass
      - kind: unit
        ref: "tests/sim/world/snapshot-codec.test.ts#sanitizer and parser agree across every entity leaf"
        status: pass
    human_judgment: false
  - id: D5
    description: "The owner's hash-policy decision and snapshot format 3 are recorded as a PROJECT.md Key Decisions row"
    verification:
      - kind: command
        ref: "rg -c 'Phase 14 plan 14-08' .planning/PROJECT.md (1)"
        status: pass
    human_judgment: false

duration: 100min
completed: 2026-11-15
---

# Phase 14 Plan 08: The steering record on every ship Summary

**Every dynamic entity now carries one frozen plain-data steering record (`Entity.steer`), hashed as an always-present last `;steer:` segment, repaired by the sanitiser before every hash and snapshotted under `WORLD_SNAPSHOT_VERSION` 3, with the inert Lave golden regenerated exactly once (fnv `ab72eedf` to `c1068643`) and proven to differ only by that segment.**

## Performance

- **Duration:** about 100 minutes (the checkpoint wait before it is not counted)
- **Completed:** 2026-11-15
- **Tasks:** 2 of 2 (Task 0 was the owner's blocking-human decision, resolved before this run; Task 1 a tracer)
- **Files:** 1 created, 12 modified

## Owner decision (Task 0)

Option-append, given by the owner in person on 2026-11-15. Always append one steering segment to every entity's hash text; bump `WORLD_SNAPSHOT_VERSION` 2 to 3; regenerate `tests/golden/world/inert-lave-epoch1.json` exactly once and prove that stripping the new segment re-hashes to the previous golden; `tests/golden/world/flight-hash-pins.json` stays untouched. Rationale: a uniform, injective hash text, the Phase 13 precedent, no second pristine field list and no `escortSlot` collision. Recorded in the PROJECT.md Key Decisions row "Hash the steering record as one always-present segment, snapshot format 3 and a second deliberate regeneration of the inert golden".

## Accomplishments

- `src/sim/npc/state.ts`: `SteerComponent` (rates `flightRoll`, `flightPitch`, `stickRoll`, `stickPitch`; `accuracy` with the -100 `ACCURACY_UNRESOLVED` sentinel; `frustration`, `successFactor`, `pitchingOver`, `jink`, `proximityAlert`, `escortSlot`, `trackingCount`, `trackingTicks`, `trackingPositions`, `saved`, `entryPending`), `SavedCondition`, and `createSteerComponent(escortSlot)` returning a fresh record with no shared arrays or vectors.
- `spawnEntity` sets `steer` and validates the optional `SpawnInit.escortSlot` (safe integer 0 to 15) with the existing refusal reasons (`outOfDomain` for a number outside the domain, `malformed` for a non-number), never throwing.
- `sanitizeEntity` repairs every field in the same pass, counting once per call. Tracking: a count other than 0 or 4, a tick that is not a safe integer within MAX_UINT32, an unbounded or mis-shaped sample, or four ticks that are not strictly decreasing becomes the empty curve (count 0, every tick and position zero) as one repair; stale in-domain samples at count 0 are zeroed without a repair. A malformed `saved` becomes null; `proximityAlert` and `saved.targetId` get the uint32 domain check only. A non-object `steer` is replaced by the default record.
- `serializeEntity` appends `;steer:` last. Format: `rate:<roll>,<pitch>,<stickRoll>,<stickPitch>,acc:<n>,fr:<frustration>,<successFactor>,po:<0|1>,jk:<x>,<y>,<z>,pa:<id>,es:<slot>,<t0 | t4:<4 ticks>,<4 positions>>,<sv:z | sv:<behaviour>,<id>,<range>,<speed>,<x>,<y>,<z>>,ep:<0|1>`. The text holds no `;`.
- `WORLD_SNAPSHOT_VERSION` 3: strict-key parser with bounds from `limits.ts`, signed tick domain, `trackingCount` 0 or 4 with strictly decreasing ticks when 4, canonical zero samples at count 0, the closed `BEHAVIOUR_IDS` vocabulary for `saved.behaviour`. `snapshotWorld` writes -0 as 0, writes a non-existent curve in canonical form and refuses a non-finite record value. `restoreWorld` restores fresh objects.
- Tests: about 110 new sanitiser rows and spawn/hash cases, about 100 new codec rejection and round-trip cases, a codec `steer` row with a mutation per field group, the sanitiser-parser agreement property extended with steering fields (300 runs), a 1,000-tick live-versus-restored proof over a world with a non-default record, and the strip-and-rehash test.

## Task Commits

1. **Task 1 (tracer): a spawned ship carries its steering record into the world hash** - `36d1abd` (feat). Restore gives every entity the default record and the codec table lists `steer` with no mutation, so the commit is green on its own.
2. **Task 2: snapshot format 3 and the Key Decisions row** - `3c0c1a7` (feat)
3. **Sanitiser tracking check without per-call closures** - `bd3970a` (perf)

Tracer feedback gate: auto mode is on, so the tracer's `<verify>` (the seven listed vitest files and typecheck) was passed at the Task 1 commit and the plan expanded (`⚡ Tracer verified end-to-end — expanding`).

## Golden regeneration and the strip-and-rehash proof

- Regenerated exactly once through `tests/helpers/write-inert-world-golden.ts` in the test container, then `prettier --write tests/golden/world`.
- Old fnv `ab72eedf`, new fnv `c1068643`, 12 ships, same seed 726532988.
- `tests/sim/world/populate.test.ts#is the pre-steering world plus one steer: segment per ship` strips every `;steer:` segment (`/;steer:[^;\n]*/g`) from the new section and checks `fnv1a32` equals `ab72eedf`; the `en:` test strips `;steer:` and `;en:` and still reaches `b23d11d8`. So no population draw moved.
- `tests/golden/world/flight-hash-pins.json`: no diff against the plan base (`git diff 047c132..HEAD` prints nothing for it). `tests/acceptance/thresholds.ts` untouched.

## Verification

- Targeted (the plan's list, plus step, ship-field, spawn-refusal, view): `docker compose run --rm test npx vitest run tests/sim/world/`: 15 files, 947 passed, 1 skipped.
- Full `docker compose run --rm test`: 176 files, 4113 passed, 10 skipped, exit 0, coverage floors held (run after Task 1 and again at the end).
- `docker compose run --rm typecheck`: clean after each task. `docker compose run --rm lint` (eslint and prettier): clean after each task.
- Acceptance: `test -f src/sim/npc/state.ts` ok; `rg -c createSteerComponent src/sim/world/world.ts` = 2; `rg -c 'WORLD_SNAPSHOT_VERSION = 3' src/sim/world/snapshot.ts` = 1; `rg -c 'Phase 14 plan 14-08' .planning/PROJECT.md` = 1; the Task 1 commit passes its listed tests and typecheck on its own.
- No `verify`, `verify-full` or browser gate: the plan changes only `src/sim` and tests (gate policy). The browser-versus-Node parity specs (`tick-hook.spec.ts`, `traffic.spec.ts`) compare a live browser hash with a live Node replay hash and pin no literal value, so no pinned parity hash moved; they were not run.

### Runtime change from the larger hash text and the per-tick sanitiser

Same test files, baseline `047c132` mounted from a scratch copy, three runs each, median of per-test durations:

| Test | Before | After |
|------|--------|-------|
| `snapshot.test.ts` 1,000-tick live-versus-restored | 215 ms | 254 ms (+18%) |
| `traffic-variants.test.ts` flight hash on every tick | 169 ms | 191 ms (+13%) |
| `world-lifecycle.test.ts` heavy cases | 49 to 617 ms | within noise (49 to 452 ms) |
| `hash.test.ts`, `populate.test.ts`, `world-cadence.test.ts` | 369, 352, 11 ms | 328, 384, 11 ms |

The first measurement, before the sanitiser used a single index loop, showed +34% on the 1,000-tick case; `bd3970a` brought it to +18%. The full suite stays at about 2m42 (162 s). New test files were not slowed beyond the added cases (`snapshot-codec.test.ts` 216 to 322 tests).

## Decisions Made

- Strict canonical form at count 0 in the parser (all-zero samples). A forged snapshot that carries stale samples is refused with reason `range`; `snapshotWorld` always writes the canonical form, so a round trip never trips it.
- The sanitiser normalises in-domain stale samples at count 0 silently rather than counting them: a later steering that resets a curve by setting `trackingCount = 0` must not raise `repairs` every time. An out-of-domain value at count 0 (NaN tick, wrong shape) still counts.
- `saved`: any invalid part other than the id (non-object, unknown behaviour, non-finite or negative range or speed, unbounded destination) discards the whole condition to null; the id alone becomes 0.
- No CHANGELOG entry: the record is internal, no snapshot is persisted yet and nothing steers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] A shared `TRACKING_SAMPLES` bound and shape defence**
- **Found during:** Task 1
- **Issue:** The plan lists the bounds but the count 4 and the sample count appear in the sanitiser, serializer and parser; a literal 4 in three modules is the drift the shared-limits module exists to prevent. `sanitizeEntity` also must never throw for any field value, so a `steer`, `jink`, tick array or position that is not the right shape needed handling.
- **Fix:** Added `TRACKING_SAMPLES` (4) to `limits.ts` with the format-change note, and shape checks in `cleanSteer`, `cleanTracking` and `cleanSaved` (a non-object or mis-shaped value is repaired, counted once).
- **Files modified:** `src/sim/world/limits.ts`, `src/sim/world/sanitize.ts`
- **Commit:** `36d1abd`

**2. [Rule 1 - Bug] Existing version-3 rejection row and energy strip test pinned the old shape**
- **Found during:** Tasks 1 and 2
- **Issue:** `snapshot-codec.test.ts` rejected "version 3" (now the accepted version) and `populate.test.ts` stripped only `;en:` from the new section (the segment moved to follow `;steer:`).
- **Fix:** The row is now "version 2" plus "version 4"; the energy strip test removes `;steer:` first. Both are required by the plan's "update the tests that pin version 2".
- **Commits:** `36d1abd`, `3c0c1a7`

**3. [Rule 3 - Performance] The first sanitiser was +34% on the 1,000-tick test**
- **Fix:** One index loop instead of four `every` passes (`bd3970a`); behaviour unchanged, tests green.

**Total deviations:** 3 auto-fixed (1 missing-critical, 1 bug, 1 performance). **Impact:** none on scope; the record's field set is exactly the plan's.

## Authentication Gates

None.

## Issues Encountered

None. The plan's Task 1 and Task 2 split was kept by holding back the snapshot codec edits until Task 1 was committed (no `git stash`).

## Threat Flags

None. T-14-12, T-14-13 and T-14-45 are mitigated as planned: strict keys and bounds from `limits.ts`, a closed behaviour vocabulary, version 3 refusing version-2 shapes, `sanitizeEntity` repairing every field before every hash, and a started curve needing strictly decreasing ticks in both the sanitiser and the parser.

## Known Stubs

None. The record's values are real defaults; nothing steers yet, which the plan states.

## Facts for later plans

- The record's field set is FROZEN. `Entity.steer` field names are binding: `flightRoll`, `flightPitch`, `stickRoll`, `stickPitch`, `accuracy`, `frustration`, `successFactor`, `pitchingOver`, `jink`, `proximityAlert`, `escortSlot`, `trackingCount`, `trackingTicks`, `trackingPositions`, `saved`, `entryPending`. `flightSpeed` is `Entity.speed`; yaw is not modelled.
- `trackingTicks` and `trackingPositions` are fixed four-tuples (`TrackingTicks`, `TrackingPositions`), newest first. A started curve is `trackingCount === 4` with `ticks[0] > ticks[1] > ticks[2] > ticks[3]`; resetting a curve is `trackingCount = 0` (stale samples are normalised away by the next `sanitizeEntity` without a repair, and are not hashed). `startTrackingCurve` may write negative ticks early in a world.
- `accuracy` starts at `ACCURACY_UNRESOLVED` (-100); a resolved value must lie in -5 to 10 or the sanitiser puts the sentinel back and counts a repair.
- Property tests of plans 14-09, 14-12 and 14-13 must draw only domain-valid records (accuracy in -5 to 10 or the sentinel, count 0 or 4 with strictly decreasing ticks, slot 0 to 15, rates within 1e3), so "sanitizeEntity repairs nothing" holds.
- `proximityAlert` and `saved.targetId` are checked as uint32 only; liveness is the steering's check through the view.
- The golden is now `c1068643`; `ab72eedf` is the pre-steering value and `b23d11d8` the pre-energy value. A fourth field group would move the snapshot shape and the golden again.
- `ShipControl.setTarget` resetting `trackingCount` to 0 and the lazy accuracy draw remain plan 14-12 and 14-09 work.

## Self-Check: PASSED

- Created and modified files exist (`src/sim/npc/state.ts`, the nine modified source and test files, the golden, `.planning/PROJECT.md`).
- Commits `36d1abd`, `3c0c1a7`, `bd3970a` are ancestors of HEAD; `git show --diff-filter=D` on each prints no deleted file.
- `commits: 3` is measured with `git rev-list --count 047c132..bd3970a`.
