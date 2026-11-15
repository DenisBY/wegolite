---
phase: 13-views-lasers-and-shields
reviewed: 2026-11-15T00:00:00Z
depth: standard
files_reviewed: 66
files_reviewed_list:
  - src/app/dock-feedback.ts
  - src/app/game-session.ts
  - src/app/hud-model.ts
  - src/app/probe.ts
  - src/app/session/context.ts
  - src/app/session/event-router.ts
  - src/app/session/probe-publisher.ts
  - src/app/session/render-driver.ts
  - src/app/session/save-controller.ts
  - src/app/session/settings-controller.ts
  - src/app/session/sim-driver.ts
  - src/app/session/start-session.ts
  - src/app/session/station-controller.ts
  - src/app/session/step-options.ts
  - src/app/session/traffic.ts
  - src/app/session/world-lifecycle.ts
  - src/content/schemas/ship-hull.ts
  - src/content/schemas/ship-npc.ts
  - src/content/ships-hulls.ts
  - src/content/types.ts
  - src/input/actions.ts
  - src/input/bindings.ts
  - src/input/keyboard.ts
  - src/main.ts
  - src/persistence/autosave.ts
  - src/persistence/save.ts
  - src/render/bodies/laser-shots.ts
  - src/render/hud/draw.ts
  - src/render/hud/projection.ts
  - src/render/launch-camera.ts
  - src/render/system-scene.ts
  - src/settings/schema.ts
  - src/sim/ai/pilots/test-pilot.ts
  - src/sim/ai/test-spawn.ts
  - src/sim/combat/aim.ts
  - src/sim/combat/constants.ts
  - src/sim/combat/hit.ts
  - src/sim/combat/ident.ts
  - src/sim/combat/mounts.ts
  - src/sim/combat/octree.ts
  - src/sim/combat/shields.ts
  - src/sim/combat/state.ts
  - src/sim/combat/step.ts
  - src/sim/combat/weapons.ts
  - src/sim/commands.ts
  - src/sim/events.ts
  - src/sim/flight/controller.ts
  - src/sim/flight/step.ts
  - src/sim/player/outfitting.ts
  - src/sim/player/profile.ts
  - src/sim/sim.ts
  - src/sim/state.ts
  - src/sim/world/control-impl.ts
  - src/sim/world/control.ts
  - src/sim/world/entity.ts
  - src/sim/world/limits.ts
  - src/sim/world/populate.ts
  - src/sim/world/sanitize.ts
  - src/sim/world/serialize.ts
  - src/sim/world/snapshot.ts
  - src/sim/world/world.ts
  - src/ui/station-model.ts
  - src/ui/station.ts
  - tools/oolite-ingest/convert/npc-ships.ts
  - tools/oolite-ingest/convert/ship-hulls.ts
  - tools/oolite-ingest/generate.ts
findings:
  critical: 0
  warning: 1
  info: 6
  total: 7
  necessity: 0
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-11-15
**Depth:** standard
**Files Reviewed:** 66
**Status:** issues_found

## Summary

Reviewed every non-test, non-generated source file changed since `0a28a78` (66 files). The
simulation side was checked against the Oolite checkout rather than against its own comments:

- `octree.ts` against `Octree.m:336-471` and `OOVoxel.m:29-197` (visiting order, the
  centre-of-first-solid-leaf distance, the `faces > 0` branches, the offset sign, the
  `<< 8` / `<< 24` mask packing under JS int32).
- `hit.ts` and `aim.ts` against `Universe.m:5549-5640` (stage A sphere test, nearest-shrinks-endpoint,
  facing rotation table).
- `shields.ts` against `PlayerEntity.m:2575-2625` (recharge allocation, 0.25 threshold, aft-on-tie),
  `:5635-5680` (forward on `d_forward >= 0`, overflow to energy, heat gate) and `:2663-2675` (cabin
  cooling). `weapons.ts` against `fireMainWeapon` and the bookkeeping cooling.
- `ident.ts` against `firstEntityTargetedByPlayer`, `isValidTarget`, `updateTargeting` and
  `handleButtonIdent`.
- Constants against `equipment.plist` `weapon_info` and `shipdata.plist` (energy, recharge, view and
  weapon offsets).

No off-by-one, sign, ordering or NaN-path defect was found in any of those ports. Determinism holds:
no clock, random stream or container-order dependence in `src/sim/combat`; `dt` is always the fixed
step; damage is queued and applied after every shot of the tick is resolved; `fireQueue` is drained
and cleared on every `stepSim` call and is bounded and de-duplicated per actor; `canon` can never see
a non-finite value (combat state is repaired at the start of `stepPlayerCombat` and in `hashWorld`;
entity energy is repaired by `sanitizeEntity` and only ever mutated afterwards by finite, bounded
arithmetic). The v3 to v4 save migration is ordered, pure, strict-schema validated on both ends and
covers the v1 and v2 chains. The render layer (`laser-shots.ts`, `system-scene.ts`) owns and disposes
its geometry and material, preallocates its buffers, and drops non-finite or rewound-clock shots.

One real defect was found (input handling while the precision key is held) plus six lower-severity
items. Nothing in scope is a necessity finding; the recorded PENDING OWNER CONFIRMATION deviations
(D-03, D-04, station/buoy no-hit) are not flagged, as instructed.

## Warnings

### WR-01: A chord key is dropped while Ctrl (precision) is held, so fire, ident and the view keys cannot be pressed during precision flying

**File:** `src/input/keyboard.ts:419-424` (default `precision` binding at `src/input/actions.ts:180`, new
default `fire` at `src/input/actions.ts:211`)

**Issue:** `onKeyDown` returns early for any key event whose `ctrlKey`, `metaKey` or `altKey` is set unless
the code is itself a Control key:

```ts
if ((event.ctrlKey || event.metaKey || event.altKey) && !MODIFIER_CODES.has(event.code)) {
  return;
}
```

`precision` is bound to `ControlLeft` / `ControlRight` by default, so while precision is held every newly
pressed bound key is discarded before `state.keyDown` sees it, and its default is not prevented. Before this
phase that mostly cost the player nothing: the keys that matter with precision (the arrow keys) are the ones
already held. Phase 13 makes the fine-aim case the primary combat case: the player holds Ctrl for precision
pitch and roll and then presses `A` to fire. That `A` (a new keydown with `ctrlKey === true`) is silently
dropped, and the browser additionally treats it as Ctrl+A (select all). The same applies to `R` (ident), `U`
(untarget) and `1` to `4` (views). A key already held when Ctrl went down keeps working, which makes the failure
order-dependent and hard for a player to diagnose. The e2e coverage drives the keys without Ctrl, so this is not
caught.

**Failure scenario:** Hold ArrowUp + ControlLeft to nudge the nose onto a target, then tap `A`. No `laserFired`,
no refusal message, nothing.

**Fix:** For the `flight` context, let a bound, non-browser-critical key through while only Ctrl is held, and
call `preventDefault` for it (the page owns the keyboard during flight):

```ts
function onKeyDown(event: KeyboardEvent): void {
  if (isTextTarget(event.target)) return;
  const chord = event.ctrlKey || event.metaKey || event.altKey;
  if (chord && !MODIFIER_CODES.has(event.code)) {
    // Ctrl alone is the precision modifier; Meta/Alt chords stay with the browser.
    const precisionOnly = event.ctrlKey && !event.metaKey && !event.altKey;
    if (!(precisionOnly && state.getContext() === "flight" && state.isBound(event.code))) return;
  }
  if (state.keyDown(event.code, event.repeat, { shift: event.shiftKey })) event.preventDefault();
}
```

If the owner wants to keep the browser-chord rule absolute, move the precision default off Ctrl or bind `fire`
to a key that is not a common Ctrl shortcut, and say so in the Controls panel.

## Info

### IN-01: `computeCockpitCamera` and `COCKPIT_OFFSET` are now dead in production code

**File:** `src/render/launch-camera.ts:48` and `:168-174`

**Issue:** The only production caller of `computeCockpitCamera` (the render driver) was switched to
`computeViewCamera`. Both `computeCockpitCamera` and `COCKPIT_OFFSET` are referenced only from
`tests/render/launch-camera.test.ts` and from a comment in `src/sim/combat/constants.ts:248`. The doc comment
("the name the launch handover and its tests use") is no longer true for the handover. `VIEW_OFFSETS.fore` is a
second source of the same vector, so the two can drift (a test pins them equal today).

**Fix:** Delete `computeCockpitCamera` and derive the fore expectation in the test from `VIEW_OFFSETS.fore`
(or `computeViewCamera(..., "fore")`); remove `COCKPIT_OFFSET`.

### IN-02: Constants and helpers duplicated across layers with no single owner

**File:** `src/sim/combat/constants.ts:195` and `src/render/hud/projection.ts:27` (`SCANNER_MAX_RANGE = 25600`
twice); `src/sim/combat/aim.ts:33` and `tools/oolite-ingest/convert/ship-hulls.ts:43` (`PLAYER_HULL_KEY`);
`src/sim/world/limits.ts:56,63` and `tools/oolite-ingest/convert/npc-ships.ts:78,81` (Oolite energy defaults
200 and 1); `hasEvent` in `src/sim/combat/step.ts:89` and `src/sim/combat/ident.ts:53`; `LOCAL_FORWARD` in
`step.ts:182` and `aim.ts:53`.

**Issue:** Each pair is currently equal and some are pinned by a test, but the failure mode is silent.
Notably, a drift in the player hull key would not fail loudly: `firstShipHit` treats a target with no hull entry
as "not loaded" (`hit.ts:95-96`), so the Cobra would simply become un-hittable and NPC shots would draw and miss.

**Fix:** Import `SCANNER_MAX_RANGE` into `constants.ts` from one side (or have `projection.ts` import the sim
constant), export a single `hasEvent` from `src/sim/events.ts`, and have the ingest tool import
`PLAYER_HULL_KEY` and the energy defaults from the sim module it already mirrors (or add a build-time assertion
that the generated hull file contains `PLAYER_HULL_KEY`, which `assets:check` can run).

### IN-03: `hashWorld` repairs the combat state in place, so a read-only probe call mutates simulation state

**File:** `src/sim/world/serialize.ts:165-168`, called from `src/app/session/probe-publisher.ts:172-176`

**Issue:** `hashWorld(player, world, combat)` calls `sanitizeCombat(combat)` before hashing. A caller that only
wants a digest (the `?test=1` `worldHash()` hook) therefore can change the live combat state, and the repair
count returned by `sanitizeCombat` is discarded, so a poisoned value is healed with no trace (`sanitizeEntity`
at least counts into `repairs`). In practice `stepPlayerCombat` already repaired the state earlier in the tick, so
this is a no-op today, but the accessor's contract ("hash") hides the write.

**Fix:** Hash a repaired copy (`const safe = { ...combat, laserTemp: {...}, shotTicks: {...} }; sanitizeCombat(safe)`),
or make `hashWorld` require an already-repaired state and `throw`/return a sentinel when `canon` would; keep the
mutation in `stepPlayerCombat`.

### IN-04: Legacy binding migration is exact-match, so near-legacy tables silently leave `ident` or `eject` unbound

**File:** `src/settings/schema.ts:277-317` (`sameCodes`, the `pause` and `targetStation` branches)

**Issue:** The migration only fires for `pause` equal to `["KeyP", "Escape"]` in that order and `targetStation`
equal to `["KeyR"]` exactly. A stored table that differs trivially keeps its old key and the new action then loses
the shared code in `createBindingMap` (later `ACTION_IDS` entry loses):

- `targetStation: ["KeyR", "KeyT"]` keeps `KeyR`; `ident` (default `KeyR`, same `flight` context) comes out `[]`.
- `pause: ["Escape", "KeyP"]` keeps Escape on pause; `eject` comes out `[]`.
- A player who moved roll to WASD (`rollLeft: ["KeyA"]`) gets `fire: []`.

This is the documented trade-off ("the new action simply stays unbound where its default key is taken") and no
customised key is lost, so it is not a data-loss bug. But the new action that the whole phase is about ends up
unbound with no notice outside the Controls panel.

**Fix:** Compare as sets (`pause` contains exactly `KeyP` and `Escape` in any order), and when a new action's
default is dropped because a stored binding owns it, surface one `hintsSeen`-style message ("Fire is unbound:
`A` is used by Roll left") instead of staying silent.

### IN-05: `spawnShooter` taints the session before it knows the spawn will succeed, contradicting its doc

**File:** `src/app/session/probe-publisher.ts:196-198` (doc at `:178-181`)

**Issue:** The doc says anything that cannot spawn "returns false and changes nothing, taint included". The guards
before `markHookMutation()` do hold that, but `spawnTestShooter(...)` can still return `false` (a scan class outside
the closed vocabulary, or a full world refusing the spawn via `spawnEntity(...).ok`) after the session is already
tainted, so autosave is suppressed for a call that changed nothing. Test hook only.

**Fix:** Call `markHookMutation()` only after a successful spawn is certain, or accept the over-taint and correct the
doc to "tainted whenever the guards pass".

### IN-06: The hull artifact size bound is documented as enforced but is only a test assertion

**File:** `src/content/schemas/ship-hull.ts:42-47`, `src/content/ships-hulls.ts:41-47`

**Issue:** `MAX_HULL_ARTIFACT_BYTES` is described as the bound that stops "a runaway artifact" and the loader doc
claims the schema bounds a hostile chunk, but `loadShipHulls` parses `await load()` with no length check; the
constant is only referenced by `tests/content/ships-hulls.test.ts`. The tree itself is bounded (nodes, depth, hull
count), so there is no resource exposure, only a misleading comment. Separately, `cachedCatalogue ??=` memoises a
rejected promise, so a transient failure cannot be retried within the page (acceptable while a failure is a boot
failure screen).

**Fix:** Reject `raw.length > MAX_HULL_ARTIFACT_BYTES` before `JSON.parse` in the loader, or reword both comments to
say the byte ceiling is a build-time test only.

---

_Reviewed: 2026-11-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
