---
phase: 12-inert-ships-and-the-world-lifecycle
reviewed: 2026-11-14T20:30:00Z
depth: standard
files_reviewed: 40
files_reviewed_list:
  - compose.yaml
  - playwright.config.ts
  - vite.config.ts
  - vite.e2e.config.ts
  - vite.seams.config.ts
  - vitest.config.ts
  - src/app/game-loop.ts
  - src/app/game-session.ts
  - src/app/hud-model.ts
  - src/app/npc-models.ts
  - src/app/session/context.ts
  - src/app/session/event-router.ts
  - src/app/session/frame-loop.ts
  - src/app/session/hyperspace-controller.ts
  - src/app/session/render-driver.ts
  - src/app/session/sim-driver.ts
  - src/app/session/start-session.ts
  - src/app/session/step-options.ts
  - src/app/session/test-flags.ts
  - src/app/session/traffic.ts
  - src/app/session/world-lifecycle.ts
  - src/content/schemas/ship-npc.ts
  - src/content/ships-npc.ts
  - src/render/bodies/npc-ships.ts
  - src/render/hud/draw.ts
  - src/render/system-scene.ts
  - src/sim/events.ts
  - src/sim/flight/step.ts
  - src/sim/flight/torus.ts
  - src/sim/hyperspace/countdown.ts
  - src/sim/sim.ts
  - src/sim/world/contacts.ts
  - src/sim/world/placement.ts
  - src/sim/world/populate.ts
  - src/sim/world/ship-field.ts
  - src/sim/world/step.ts
  - src/sim/world/world.ts
  - tools/oolite-ingest/convert/npc-ships.ts
  - tools/oolite-ingest/convert/ship-radius.ts
  - tools/oolite-ingest/generate.ts
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
  necessity: 0
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-11-14T20:30:00Z
**Depth:** standard
**Files Reviewed:** 40
**Status:** issues_found

## Summary

All 40 scoped files were read in full. The assigned focus areas were traced against the Oolite checkout at `/home/opencode/git/oolite` and, where a claim could be checked mechanically, exercised in the Docker `test` image through scratch scripts under `/tmp/wl` (not in the repository). `docker compose run --rm test npm run test:fast` passes (153 files, 3020 tests, 2 skipped).

Verified sound, with no finding:

- **Determinism and purity of `src/sim`.** `placement.ts`, `populate.ts`, `ship-field.ts`, `contacts.ts` and the new parts of `step.ts` and `world.ts` use no `Math.random`, `Date`, DOM or Three. The only transcendental call is `Math.sqrt`, which is correctly rounded. Every loop is capped: placement by `MAX_PLACEMENT_TRIES`, the AI drain by `MAX_AI_EVENT_PASSES` and `MAX_AI_EVENTS_PER_DRAIN`.
- **Populator across all 8 galaxies.** I ran `planInertPopulation` and `populateInertWorld` over all 2048 systems of `g0..g7` at 5 epochs each (10,240 worlds). There were 0 fallback placements, 12 ships spawned in every world, and the slowest world took 4 ms. The in-repo sweep covers galaxy 0 only, so this widens the evidence.
- **Placement port.** `randomSpatial`, `positionInCylinder`, `positionInShell`, `locationByCode` and `randomQuaternion` match `OOHPVector.m` lines 75-124, `Universe.m` `locationByCode` and `OOQuaternion.m` lines 41-48.
- **Mass lock and blockage.** The strict `<` outer test for ships (`PlayerEntity.m:2936`), the exempt class list (`PlayerEntity.m:3044-3061`) and the `0.1 x mass > d^2 && d^2 < range^2` blockage predicate (`ShipEntity.m:12498-12531`) are reproduced faithfully. The torus-factor divergence (ships ignored) is a recorded decision, not a defect.
- **AI-fault containment.** There is a single try/catch around the module call. `ai = null` plus one `aiFaulted` event is the only effect, and the RNG stream is written back on both paths. The drain is bounded.
- **`spawnEntity` refusal.** For nullish, wrong-typed and out-of-domain input it never advances `nextId`. `idExhausted` and `storeFull` are checked before `allocate`. The one exception is a throwing accessor (IN-03).
- **Entity-id scope.** `npcContacts`, the NPC layer, the model loader and the HUD model carry no entity id. `aiFaulted` is the only id-bearing event, and the router ignores it.
- **Deferred NPC model requests.** `request()` is a no-op until `open()`, and `open()` is called only after a drawn `inFlight` frame. The chart branch returns before `renderFrame`, so it cannot open the latch either. The loader is disposed before the cache, and late resolutions are dropped.
- **InstancedMesh lifecycle.** The layer shares cached geometry and material and disposes only instance buffers. `assembleSystemScene` registers the layer as an explicit disposer, not a blind traverse.
- **Build-time traffic define.** `vite.config.ts` carries `"true"`. `vite.e2e.config.ts` and `vite.seams.config.ts` override it to `"false"`. `pages.yml` runs `npm run build`, the production config. `build:e2e` is used only by the `e2e`, `e2e-cross`, `verify` and `verify-full` services. The identifier is replaced at build time: an existing `dist/` bundle contains `traffic:r?n.get("traffic")==="1":t`, and the source name appears only in the sourcemap.
- **Frame-loop chart branch and game-loop generation guard.** Both are consistent. A dock or arrival behind the chart calls `closeChart`, which resets the loop. `advance` detects the reset by generation and returns 0 instead of subtracting `DT` from a zeroed accumulator.
- **Content compiler radius.** `hullRadius` matches `OOMesh.m:1801-1822` (largest squared vertex distance, float32 at each step, `sqrtf`). A `model_scale_factor` is already refused by `ship-mass.ts`, which runs over the same keys first.

One Warning and four Info items follow. No Critical issue was found. No necessity findings were substantiated. The necessity rubric was read; every candidate guard either sits on a trust boundary or could not be proven impossible from the repository.

## Warnings

### WR-01: A refused `begin()` at a hyperspace arrival leaves the origin system's world alive in the destination system

**File:** `src/app/session/world-lifecycle.ts:158-173` (call site `src/app/session/hyperspace-controller.ts:239`)
**Issue:** `begin(marketSeed)` returns silently, "epoch and world unchanged", when `epoch >= MAX_LIVE_EPOCH` (0xfffffffe) or the seed is not finite. At a launch this is harmless: the world was already `end()`ed by the dock, so there is simply no world. At a hyperspace arrival the previous (origin) world is still installed, so a refused `begin` keeps it. `handleHyperspaceJumped` calls `begin(nextSeed)` and never ends the old world first, so WORLD-14 ("a jump removes every non-static entity") is not honoured on that path.

The refusal is reachable through a schema-valid save. `SaveV3Schema` allows `epoch` up to `MAX_SAVE_EPOCH = 0xfffffffe`, and `resetForRestore` accepts it because the check is `< MAX_EPOCH`. Every later `begin` is then refused.

Failure scenario: an in-flight save with `epoch: 4294967294` is loaded, so `resume` builds a world. The player jumps. `begin` is refused. The origin system's twelve ships, placed from the origin layout, stay in the destination system. They draw, show on the scanner, mass-lock the torus and block the jump, with positions that mean nothing in the new layout. `anchorNextEntityId` also stays at the old value, so the arrival autosave writes a stale anchor.

Verified with a scratch script under `/tmp/wl`: after `resetForRestore(0xfffffffe)`, `resume(5)` and `begin(7)`, `lc.world === before` and `epoch` is unchanged.

The comment at `hyperspace-controller.ts:236-238` says `begin` "cannot throw". That is true, but it is not "cannot refuse".
**Fix:** End the old world unconditionally at the jump commit, before the build, so a refusal leaves no world and no stale anchor:
```ts
// hyperspace-controller.ts, in the install block, just before begin():
ctx.core.worldLifecycle?.end();
ctx.core.worldLifecycle?.begin(nextSeed);
```
Alternatively, make `begin` clear `world` and `anchorNextEntityId` on every refusal path, so the contract holds for any caller.

## Info

### IN-01: A running torus drive stopped by mass lock still prints "Torus disengaged"; Oolite prints "Hyperspeed mass-locked."

**File:** `src/app/session/event-router.ts:258-260`
**Issue:** `torusDisengaged` is mapped to one fixed line whatever the reason. Oolite prints `jump-mass-locked` ("Hyperspeed mass-locked.") for both the refused `j` (`PlayerEntityControls.m:1174`) and a running drive that locks (`PlayerEntity.m:2755-2758`, `hyperspeed_locked = [self massLocked]`). Phase 12 fixed only the refusal. The CHANGELOG entry says "Torus disengaged" is "now shown only when a running torus drive stops", and that includes the mass-lock stop. Inert ships make this path common: flying a torus line toward a ship stops the drive at 25.6 km, and the player sees "Mass locked" then "Torus disengaged".
**Fix:** In the `torusDisengaged` arm, when `event.reason === "massLock"`, enqueue "Hyperspeed mass-locked." instead of "Torus disengaged". Update the CHANGELOG wording to match.

### IN-02: `aiFaulted` is emitted but nothing records it, so a faulted AI is invisible in production

**File:** `src/sim/world/step.ts:187-190`, `src/app/session/event-router.ts:405-409`
**Issue:** D-04 asks the step to record the fault reason "(an event or log entry)". The step emits an event, but the router drops any unrouted kind. No log line, probe field or test-hook counter carries it. A throwing AI module would silently become nullAI, with no console line or probe entry. Today no production entity has an AI, so this is latent. It becomes a debugging gap as soon as Phase 13 gives ships real modules.
**Fix:** Add a probe counter, for example `probe.sim.aiFaults`, incremented when the sim driver sees `aiFaulted`. Alternatively, route the kind to a subscriber that writes one `console.warn` per entity. Neither may store the entity id beyond the tick.

### IN-03: The "never throws" claim of `spawnEntity` is false for an `init` with a throwing accessor

**File:** `src/sim/world/world.ts:268-288`, doc at `:364-367`
**Issue:** The doc states that `spawnEntity` "never throws, whatever `init` and `tick` hold", and `isMalformedInit` is described as never throwing. It reads properties from `init` and its nested objects, so a getter that throws on `init.position` escapes. A scratch case `{ ...base, get position() { throw new Error("boom") } }` threw `Error: boom` out of `spawnEntity`. The other malformed shapes I tried returned a refusal: nullish, array, string, `Symbol` kind, BigInt param, sparse array and NaN quaternion. No in-repo caller can produce such an object. The only caller is the populator, which builds plain data. This is therefore a documentation over-claim, not a reachable bug.
**Fix:** Soften the doc to "never throws for plain data". If hostile objects are in scope, wrap the shape check in a try/catch that returns `malformed`.

### IN-04: A failed NPC model is never retried, yet its ship still mass-locks the torus, blocks jumps and shows on the scanner

**File:** `src/app/npc-models.ts:59-78`
**Issue:** A key whose load rejects is marked `failed` for the life of the session. This is intentional ("no retry storm"). The simulation does not depend on models: the ship stays in the world, locks the torus within 25.6 km and blocks a jump within its blockage radius. A single transient fetch error for one hashed GLB (the deploy-skew case) therefore leaves invisible obstacles. The player sees a scanner contact and a "too close to a ship" refusal, but no ship, with no signal why.
**Fix:** Allow one retry per key, either when the world is next created (`begin` or `resume`) or after a fixed number of frames. Alternatively, record failed keys on the probe so the cause is diagnosable. This is a design call; the current behaviour is defensible.

---

_Reviewed: 2026-11-14T20:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
