---
phase: 14-npc-flight-and-steering-fidelity-gate
reviewed: 2026-11-16T00:00:00Z
depth: standard
files_reviewed: 56
files_reviewed_list:
  - compose.yaml
  - .github/workflows/pages.yml
  - package.json
  - src/app/probe.ts
  - src/app/session/probe-publisher.ts
  - src/app/session/sim-driver.ts
  - src/app/session/step-options.ts
  - src/app/session/traffic.ts
  - src/content/schemas/ship-npc.ts
  - src/sim/ai/pilots/flight-script.ts
  - src/sim/ai/registry.ts
  - src/sim/ai/test-spawn.ts
  - src/sim/ai/types.ts
  - src/sim/flight/step.ts
  - src/sim/npc/avoid.ts
  - src/sim/npc/behaviours/attack-close.ts
  - src/sim/npc/behaviours/attack-evade.ts
  - src/sim/npc/behaviours/attack.ts
  - src/sim/npc/behaviours/avoid-collision.ts
  - src/sim/npc/behaviours/evasive.ts
  - src/sim/npc/behaviours/face-destination.ts
  - src/sim/npc/behaviours/flee.ts
  - src/sim/npc/behaviours/fly-to-destination.ts
  - src/sim/npc/behaviours/formation.ts
  - src/sim/npc/behaviours/idle.ts
  - src/sim/npc/behaviours/intercept.ts
  - src/sim/npc/behaviours/tumble.ts
  - src/sim/npc/constants.ts
  - src/sim/npc/dispatch.ts
  - src/sim/npc/enter.ts
  - src/sim/npc/escort.ts
  - src/sim/npc/flight.ts
  - src/sim/npc/proximity.ts
  - src/sim/npc/state.ts
  - src/sim/npc/stats.ts
  - src/sim/npc/target.ts
  - src/sim/npc/tracking-curve.ts
  - src/sim/npc/track.ts
  - src/sim/sim.ts
  - src/sim/world/control-impl.ts
  - src/sim/world/entity.ts
  - src/sim/world/limits.ts
  - src/sim/world/sanitize.ts
  - src/sim/world/serialize.ts
  - src/sim/world/snapshot.ts
  - src/sim/world/step.ts
  - src/sim/world/view-impl.ts
  - src/sim/world/view.ts
  - src/sim/world/world.ts
  - tests/acceptance/detectors.ts
  - tests/acceptance/npc-flight.acceptance.ts
  - tools/ai-harness/dist-check.ts
  - tools/ai-harness/host.ts
  - tools/ai-harness/load.ts
  - tools/oolite-ingest/convert/npc-ships.ts
  - vitest.acceptance.config.ts
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
  necessity: 1
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-11-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 56
**Status:** issues_found

## Summary

Scope: the native NPC steering port (`src/sim/npc/**`), its world integration (`world/step.ts`, `sanitize.ts`, `snapshot.ts`, `serialize.ts`, `limits.ts`, `entity.ts`), the app seams (`probe*`, `traffic`, `step-options`, `sim-driver`), the content converter and schema, the acceptance detectors (frozen), the dev-only AI harness and its dist check, and the build and CI wiring. No fallow structural findings were supplied. No external reviewer evidence was supplied.

I traced the places the brief names as likely trouble and found them sound:

- **NaN/Infinity.** I walked every division and `sqrt` in the steering (`track.ts`, `target.ts`, `tracking-curve.ts`, `fly-to-destination.ts`, `formation.ts`, `face-destination.ts`, `proximity.ts`, `attack*.ts`). Each is guarded by the domain (strictly decreasing tracking ticks, `desiredRange` bounded, `speed > 0` before the forward stretch) or produces only a transient NaN/Infinity that is used in a comparison and never stored (formation `eta` at speed 0). I found no path that writes a non-finite value into `Entity.steer`, `nav` or `position`.
- **Sanitiser versus snapshot parser versus hash.** Domains agree field by field (rates, sticks, accuracy sentinel, frustration, escort slot, tracking count 0 or 4 with strictly decreasing signed ticks, saved condition). `serializeSteer` prints all 16 record fields, and the count-0 canonical form agrees across sanitiser, snapshot writer, parser and hash. `sanitizeEntity` does not throw on the malformed shapes I traced (non-object record, array as record, non-object `saved`, wrong-typed tracking arrays).
- **Determinism.** No `Math.random`, `Date`, `Map`/`Set` iteration or `for...in` in `src/sim/npc`, `world` or `ai`. All passes walk ascending ids over a length snapshot. `Math.fround` is applied on exactly the two GLfloat fields the contract names.
- **Fidelity spot checks against the pinned source** (`/home/opencode/git/oolite`): `applySticks`, `avoidCollision`/`resumePostProximityAlert`, `performFlee`/`performAttack`/`performTumble`, `behaviour_fly_to_destination`, `behaviour_formation_form_up`, `behaviour_attack_fly_from_target`, `behaviour_attack_break_off_target`, `behaviour_attack_slow_dogfight`, `trackPrimaryTarget`. Control flow, draw order and thresholds match, apart from the already-recorded divergences, which I did not re-report.
- **Production bundle.** `check:dist` is wired into `verify`, `verify-full` and the Pages build, and the three markers are properties or string values that survive minification (`this.PriorityAIController =` is a property assignment in the pinned library). `tools/ai-harness` is not imported from `src/`.

What remains is one robustness inconsistency in the stats lookups, one security-posture gap in the dev harness loader, a content-versus-runtime domain mismatch that fails silently, and a set of smaller maintainability items. There are no blockers.

## Warnings

### WR-01: `massFor` returns the flight-row mass unguarded, contradicting its own doc and `statsFor`

**File:** `src/sim/npc/stats.ts:170-176`
**Issue:** The docblock (lines 160-165) says the second scan is "a copy of `massOf` ... finite-positive guard", but the first branch returns `row.mass` as is (line 174). `statsFor` refuses the very same row when `mass` is not finite or outside `0..MAX_ENTITY_MAGNITUDE` (`isUsable`, line 73), so one row is "unusable" for flight and "trusted" for proximity. A NaN or negative mass in a hand-built `StepOptions.npcFlight` row reaches `proximityAlertFor` (`proximity.ts:112`) as `otherMass`; `NaN < PROXIMITY_MIN_MASS` is false, so the body is treated as heavy and raises alerts on every ship that passes it, while Infinity does the same. The result is a silent behaviour change in a hashed field (`steer.proximityAlert`), not a throw. `flightTableFrom` passes whatever the record carries (the schema is `z.number().nonnegative()`, so Infinity is rejected there, but a table built another way is not checked).
**Fix:**
```ts
if (row !== undefined && row.specKey === specKey) {
  return Number.isFinite(row.mass) && row.mass >= 0 ? row.mass : 0;
}
```
Better, share one predicate with `isUsable` so the two lookups cannot drift.

### WR-02: `statsFor` accepts a row whose `forwardWeapon` is outside the mount vocabulary; `weaponRangeOf` then throws inside the uncontained steering

**File:** `src/sim/npc/stats.ts:67-75`, `src/sim/npc/behaviours/attack.ts:80-83`
**Issue:** `isUsable` validates the five numbers but not `forwardWeapon`. `weaponRangeOf` does `LASER_STATS[stats.forwardWeapon].range` for anything that is not `NO_LASER`. `flightTableFrom` guards with `isMountKey`, but `NpcFlightStats` is an exported interface and `StepOptions.npcFlight` is `readonly NpcFlightStats[]`, so any other producer (a test helper, a future loader, a deserialised table) can hand the step a row with an unknown key. `LASER_STATS[...]` is then `undefined` and `.range` throws a `TypeError` from `behaviourAttackTarget`, `behaviourAttackFlyToTarget`, `behaviourFlyToTargetSix` and the sniper/break-off paths. `stepWorld` deliberately has no try/catch around steering (`step.ts:100`, "steering is total"), so the throw leaves the frame loop. The stated purpose of `statsFor` ("the steering never reads a corrupt number") does not cover this field.
**Fix:** add `isMountKey(row.forwardWeapon)` to `isUsable`, or make `weaponRangeOf` total:
```ts
export function weaponRangeOf(stats: NpcFlightStats): number {
  if (stats.forwardWeapon === NO_LASER) return NO_WEAPON_RANGE;
  return Object.hasOwn(LASER_STATS, stats.forwardWeapon)
    ? LASER_STATS[stats.forwardWeapon].range
    : NO_WEAPON_RANGE;
}
```

### WR-03: The harness loader evaluates files from an environment-supplied directory with no integrity check, and the host proxy hands the sandbox host-realm constructors

**File:** `tools/ai-harness/load.ts:101-104,111-130`, `tools/ai-harness/host.ts:222-286`
**Issue:** `loadAiLibrary(oolitePath, host)` reads `Resources/Scripts/oolite-priorityai.js` and `Resources/AIs/oolite-shuttleAI.js` from `OOLITE_SRC` and runs them in `node:vm`. The header calls the files "pinned", but nothing verifies that: there is no hash comparison against a recorded digest (the repository already keeps `CHECKSUMS.sha256` for vendored input), so a modified or swapped tree is evaluated as is. `vm` is not a boundary and the `track()` proxy makes escape trivial: for `key = "constructor"` or `"__proto__"` the `get` trap falls to `key in target` and returns the host-realm `Object` or `Object.prototype` (the `OBJECT_MEMBERS` set only suppresses the inventory count), and `globals` injects host classes (`Vector3D: StubVector3D`). From inside the context, `ship.constructor.constructor("return process")()` reaches the host `process`. With a trusted operator checkout this is acceptable (dev-only, documented), but the loader is also reachable from tests that run in the shared container with the working tree mounted, and the comment "no fixture, environment or network value is ever evaluated" is not quite true: the environment value chooses which code is evaluated. An empty `OOLITE_SRC` also makes `join("", relative)` resolve against the current directory.
**Fix:** verify each of the two files against a recorded SHA-256 before `runInContext` (fail closed on mismatch), refuse an empty or non-absolute `oolitePath`, and make the proxy return `undefined` for `constructor`, `__proto__` and `prototype` instead of falling through to `key in target`. State the residual risk ("a tampered `OOLITE_SRC` runs with the container's privileges") in the file header.

### WR-04: The content schema accepts flight constants the runtime then silently replaces with Oolite defaults

**File:** `src/content/schemas/ship-npc.ts:76-85`, `src/sim/npc/stats.ts:62-75`
**Issue:** The compiled `maxFlightSpeed`, `maxFlightRoll`, `maxFlightPitch` and `thrust` are `z.number().nonnegative()`, so a value of, say, `max_flight_roll = 2000` compiles and passes `assets:check`. At runtime `isUsable` rejects it (`maxFlightRoll <= MAX_STEER_RATE` = 1e3) and `statsFor` returns `OOLITE_DEFAULT_FLIGHT_STATS` for that whole ship (160 m/s, 2, 1, 15), with no diagnostic anywhere. `STEERING_ASSUMED_ABSENT_KEYS` shows the converter already fails the build when a pin bump would silently change reachability; this is the same class of silent drift on the data it just added. `maxFlightSpeed` of 0 is also accepted by the schema, while the oracle contract notes (14-FIDELITY-REPORT, "Contract limits") require it positive.
**Fix:** put the same bounds in the schema (`.max(MAX_STEER_RATE)` for roll and pitch, `.max(MAX_ENTITY_MAGNITUDE)` for the others, `.positive()` for `maxFlightSpeed`), importing the constants or restating them with a test that pins equality, so a content build fails instead of a ship quietly flying on defaults.

## Info

### IN-01: Impossible-state guard on a constant `true`

**File:** `src/sim/npc/proximity.ts:63,114`
**Category:** necessity
**Issue:** `SHIPS_ARE_CREWED` is a `const` that is `true`, never reassigned, and not configurable (no option, no data), so `if (!SHIPS_ARE_CREWED) return;` at line 114 can never take its branch. The file header says the constant is kept "so it is a visible decision", and the recorded divergence names it; the premise (no crew concept in v2.x) is judgment, not provable guard dead code, hence Info.
**Fix:** either leave it as documentation (and drop the runtime `if`, putting the comment where the branch was), or, if per-ship crew ever lands, derive the gate from a record field so the branch becomes reachable.

### IN-02: The tracking-curve clock is fixed to `TICKS_PER_SECOND` while `stepWorld` accepts any positive `dt`

**File:** `src/sim/npc/tracking-curve.ts:146-157`, `src/sim/npc/constants.ts:269`, `src/sim/world/step.ts:72-84`
**Issue:** `stepWorld(world, player, layout, dt, ...)` is exported and validates only `dt > 0` and finite. Every steering rate scales with `dt`, but `TRACKING_SAMPLE_TICKS` (60), the tick-to-seconds division in `calculateTargetPosition` and the sample gate are in ticks of `1 / TICKS_PER_SECOND`. A caller using a different `dt` (a test, a future variable-step caller) gets a reaction-time curve whose time base no longer matches the motion, with no error. The session always passes `DT`, so nothing is broken today.
**Fix:** assert `dt === DT` (or `1 / TICKS_PER_SECOND` within a tolerance) at the top of `stepWorld`, or note the coupling in its docblock.

### IN-03: `check:dist` conflates an uncaught filesystem error with "marker found" and follows symlinks

**File:** `tools/ai-harness/dist-check.ts:71-82,143-148`
**Issue:** `walkFiles` uses `statSync`, which follows symlinks; a symlink cycle recurses until `ELOOP` and a dangling link throws `ENOENT`. Neither is caught, so the process dies with Node's default exit code 1, the same code the file documents for "a marker was found", and prints a stack instead of a clear message. It fails closed, so the gate cannot pass wrongly, but the diagnosis is misleading. A symlink to a directory outside `dist/` would also be scanned, which is harmless but unintended.
**Fix:** use `lstatSync` and skip symlinks (or report them), wrap the walk in a try/catch that returns exit code 2 with the path, and keep exit 1 for markers only.

### IN-04: The 20-seed acceptance run is in no gate

**File:** `package.json:21`, `vitest.acceptance.config.ts:15-26`, `compose.yaml:96-139`, `.github/workflows/verify.yml`
**Issue:** `test:acceptance` is a standalone config, no Compose service runs it, and neither `verify`, `verify-full` nor the `verify` workflow calls it (the report records that plan 14-19's rerun was skipped by a path rule). ROADMAP criterion 2 therefore rests on a run at `ab7343b`; a later change to `src/sim/npc` or the content table that breaks a detector threshold is not caught by CI. This is a deliberate cost decision ("Standalone on purpose"), recorded here only because the detectors are frozen and the freeze check does not execute them either.
**Fix:** add a `verify-full`-class (or scheduled) step, for example `docker compose run --rm test npm run test:acceptance`, or record in the CI docs that the run is manual and when it must be repeated (any change under `src/sim/npc/**`, `src/sim/world/**` or `src/content/generated/ships-npc.json`).

### IN-05: The frozen detectors cannot see a permanently idle non-goal flyer

**File:** `tests/acceptance/detectors.ts:871-874,986-1014`, `src/sim/ai/pilots/flight-script.ts:271-284`
**Issue:** The stuck detector runs only for station, intercept and flee scripts (`isGoalScript`), and the frozen detector only evaluates a window in which `desiredSpeed >= FROZEN_MIN_DESIRED_SPEED` on every tick. An `attack`, `escort` or `face` flyer whose pilot reaches `finish()` on `shipTargetLost` (or whose steering drops to IDLE with `desiredSpeed` 0) is excluded from both, so it passes every per-seed threshold; only the run-wide `attackTicksNearPlayer` floor can catch it, and that is a sum over the seeds. Residual 4 in the fidelity report covers frustration only, not this. Both files are frozen: any change needs the owner's `Detector-change-approved-by-owner` trailer, so this is a note for the owner, not a proposed free edit.
**Fix:** if the owner approves a detector change, add a per-flyer "never left IDLE for a whole window while a target or leader existed" tally; otherwise record it as a known blind spot beside residual risk 4.

### IN-06: A flyer whose AI faults keeps stale steering state in the hash

**File:** `src/sim/world/step.ts:132-143,244`, `src/sim/npc/proximity.ts:230-237`, `src/sim/npc/enter.ts:55-130`
**Issue:** When a module throws, `invoke` sets `entity.ai = null`. From then on the entity is skipped by the update phase, the proximity clear (`proximity.ts:234`) and the tracking start, so `steer.proximityAlert`, `steer.entryPending`, the sticks and rates, and `saved` stay at whatever they held. This is deterministic, so replay and hash parity hold, but a ship that faulted with `entryPending = true` never completes the entry and carries a nonzero alert id forever; a later snapshot restores that exactly. Nothing reads them while `ai` is null, so it is harmless today; it becomes a surprise if a later phase gives an inert ship a new AI by writing `entity.ai` directly.
**Fix:** reset the steering record to `createSteerComponent(entity.steer.escortSlot)` at the fault site (and note it beside the nullAI hash line), or document that a re-armed ship must clear it.

---

_Reviewed: 2026-11-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
