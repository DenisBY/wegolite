# Phase 4: Manual Docking - Research

**Researched:** 2026-11-04
**Domain:** Deterministic docking-corridor geometry (Oolite port), elastic hull response, docking-computer purchase, versioned IndexedDB autosave
**Confidence:** HIGH for corridor semantics and aperture numbers (read from Oolite source and the vendored `.dat`); MEDIUM for hull-collision/bounce design and feel constants (no Oolite equivalent is ported); MEDIUM for save/UI wiring (repo seams read, nothing built yet)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Corridor and capture (DOCK-01, DOCK-02, DOCK-04)
- **D-01:** Port Oolite's `shipIsInDockingCorridor` rule. The corridor starts from the dock mesh aperture and expands in ×1.25 steps until the ship's bounding box fits within 90 % of the aperture width and height. The bbox is evaluated in the port's frame, so the corridor rotates with the station. — **Reversibility:** costly — the aperture semantics are the contract the sim, the renderer feedback and the e2e probes all assume; changing them later means re-deriving thresholds and rewriting the docking tests.
- **D-02:** No explicit roll threshold. The bbox in the port frame is the only roll test; a rolled ship simply presents a wider footprint and fits worse, exactly as in Oolite. — **Reversibility:** reversible.
- **D-03:** Auto-centring follows Oolite: inside the 50 % safety band (`safety = 1.5` × aperture) with the nose inside, apply a continuous proportional x/y correction toward the port centre (`correction_factor = -min.z / (max.z - min.z)`) and scrape feedback each tick; capture when `0.90 · max.z + 0.10 · min.z < 0`. — **Reversibility:** costly — capture timing and correction strength define the feel of the whole phase and are asserted by tests; changing them invalidates tuned evidence.
- **D-04:** Speed does not gate docking. A fast but well-aligned approach captures, as in Oolite; "too fast" is interpreted as "did not get aligned in time", not as a separate rule. — **Reversibility:** reversible.
- **D-05:** A simultaneous opposite-edge straddle inside the safety band (bbox `min.x < -ww && max.x > ww`, or the same on y) is a failure and bounces. Oolite's fatal collision branch is not ported, because v1 has no damage model.

### Failure, feedback and recovery (DOCK-03, DOCK-06)
- **D-06:** No invented hull-integrity or health stat in v1. A failed approach costs time and position only. Real damage arrives with the v2 energy model. — **Reversibility:** reversible.
- **D-07:** Failure physics is an elastic bounce: velocity is reflected about the contact normal with a damping factor, orientation is preserved, and control returns on the same tick. No hard stop, no teleport back to an approach point. — **Reversibility:** reversible.
- **D-08:** Feedback channels are the HUD message line plus a short camera shake and a red HUD frame flash lasting 0.3–0.5 s. No sound (out of scope) and no new particle system. All three channels must be observable from the renderer probe. — **Reversibility:** reversible.
- **D-09:** Every failure recovers to `inFlight` on the same tick. No attempt may leave the player stuck inside geometry, in a limbo mode, or unable to retry. Defensive push-out applies only if the ship somehow ends up inside the station hull.

### Docking computer (DOCK-05)
- **D-10:** The docking computer is bought from one line in the existing docked panel: `Docking Computers — 1500.0 Cr`, with the TL 9 requirement and the credit deduction enforced against the player's real credits in decicredits. The default new game starts at 100.0 Cr and therefore cannot afford it — that is faithful Oolite economy, not a bug. The e2e grants credits through the existing probe/dev seam to exercise the purchase. Phase 5 replaces this line with the outfitting screen.
- **D-11:** `Shift+C` engages only inside `stationAegisRange` (51 200 units, 2 × scanner range, matching Oolite's `AEGIS_*`). Outside it the action produces a message, no docking and no clock change.
- **D-12:** Activation is instant with no animation: the same tick transitions `mode → docked`, shows the docked panel, advances the clock by 20 minutes and posts "Docking computers engaged". No timers, no scripted fly-in, no fade.

### Persistence (DOCK-07)
- **D-13:** On launch, write a versioned JSON save to IndexedDB containing the schema version, mode, clock, credits, owned equipment, and the system/station identity. The docked pose is derived from the layout on restore rather than stored as float position/quaternion. — **Reversibility:** costly — the save schema becomes a public contract that Phase 6 must migrate; shipping it unversioned would force a destructive migration.
- **D-14:** On boot, if a save exists the title screen offers Continue and New game. Continue restores the docked state; New game clears the save and starts fresh at Lave. D-09 of Phase 3 (start screen leading straight to the dock) is extended, not replaced.
- **D-15:** Phase 6 owns flight-state persistence, market state, migrations and the F2 save screen. Phase 4 saves only what a docked resume needs.

### the agent's Discretion
- How the dock aperture is measured from the `coriolis.glb` dock node (this is the ROADMAP research flag) and how numeric jitter around the measured plane is handled.
- The bounce restitution coefficient, camera-shake amplitude and flash timing within the stated 0.3–0.5 s, provided the probe can observe them.
- Save key naming, internal validation, and how a corrupt or future-version save is rejected, within the versioned-JSON requirement.
- Where the new `dockingComputer` action is surfaced in the controls/settings list.

### Deferred Ideas (OUT OF SCOPE)
- Outfitting screen with real equipment browsing and installation — Phase 5; the Phase 4 single purchase line is replaced there.
- Trading, market prices and cargo — Phase 5.
- Full flight-state persistence, market persistence, save migrations and the F2 save screen — Phase 6 (D-15).
- Damage, energy banks, shields, destruction and respawn — v2 combat model; Phase 4 deliberately has no damage stat.
- Oolite-faithful docking-computer autopilot fly-in instead of instant docking — rejected for DOCK-05 in this phase; may return as an option later.
- Sound and music for scrape/impact feedback — out of scope for v1.
- NPC traffic and docking queues — out of scope for v1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCK-01 | The docking corridor is derived from the Coriolis dock geometry and matches the visible opening | Aperture measured from vendored `oolite_coriolis_dock.dat`: 103.4123 × 241.888 × 250 (§Aperture Measurement). Recommend build-time emit into generated JSON. |
| DOCK-02 | The station spins at the Oolite rate, and docking tolerates station roll with x/y auto-centring | Roll rate is **0.1256637 rad/s** (50 s period), not 0.08 (§Pitfall 1). Port frame follows `stationBaseQuat · axisAngle(z, stationAngle)`. Oolite auto-centring semantics cited line-by-line. |
| DOCK-03 | Off-axis contact produces scrape damage or bounce feedback, using the v1 collision-only hull model | Hull is a 1000×1000×~996 box (vendored `.dat`); bounce needs a transient impulse vector because `FlightState.speed` is scalar (§Hull collision + bounce). |
| DOCK-04 | Crossing 90% past the dock plane while aligned transitions cleanly into docked mode | `0.90·max.z + 0.10·min.z < 0` (DockEntity.m:711, :766). `stepDocking` runs after position + station-angle update in `stepFlight`. |
| DOCK-05 | A docking computer can be bought (TL 9, 1500 Cr) and grants instant docking on `Shift+C` with +20 min clock | `EQ_DOCK_COMP` price 15000 decicredits, TL 9 verified. **Lave raw TL is 4 → purchase is TL-gated at Lave (§Open Question 1).** Keyboard layer has no modifier chord support today (§Shift+C). |
| DOCK-06 | A failed docking attempt never traps the player; recovery to flight with clear feedback | No `limbo` mode; bounce + push-out in same tick; feedback via sim events → app-side `DockFeedback` → probe. |
| DOCK-07 | The game autosaves on launch so the docked state is always resumable | New `src/persistence/` module: port + IndexedDB adapter + pure validator; hook on the `launched` sim event. No new dependency. |
</phase_requirements>

## Summary

The visible Coriolis opening is the bounding box of the **separate** `oolite_coriolis_dock.dat` mesh, and Oolite's port dimensions are exactly that bbox size (`DockEntity.m:1044-1045`). Measured from the vendored file it is **103.4123 (x) × 241.888 (y) × 250 (z)**, with the mouth plane at the mesh's z = 0 and the tunnel extending 250 m inward. The slot is therefore **tall** (x < y); a Cobra (130 × 34.97 wide-flat bbox) fits only when rolled roughly 90° so its wings run along the slot's long axis. Oolite's launch code applies exactly that 90° twist; Wegolite's Phase 3 launch does not (§Pitfall 5). The aperture is deterministic input data, so it should be **measured at build time from the `.dat` (already parsed by `tools/oolite-ingest`) and emitted into generated JSON**, then consumed by `src/sim/` as plain numbers — no runtime GLB inspection, no hard-coded literal in sim code.

The Oolite algorithm (`DockEntity.m:604-774`) is small and fully read. The three things CONTEXT.md does not spell out and the planner must decide: (1) Oolite's y-axis auto-centring guard on line 752 is **inconsistent with the x guard** on line 748 (looks like an upstream bug); (2) Oolite's non-lane failure is ordinary octree collision, which Wegolite does not have — a hull collision shape and a bounce impulse must be introduced (the hull is a plain box, so this is cheap); (3) the flight model stores a scalar `speed`, so "reflect velocity about the contact normal while keeping orientation" needs a small transient `impulse` vector in `FlightState`.

Two issues need user attention before planning: **the docking computer is TL-gated and Lave's raw tech level is 4** (Oolite compares raw system TL ≥ equipment TL), so D-10 as written cannot complete a purchase at Lave without a test seam; and **CONTEXT.md's "0.08 rad/s" station roll is the authored right-angles/second value** — the real rate the code already uses is 0.1256637 rad/s.

**Primary recommendation:** Add one pure module `src/sim/dock/` (port frame, corridor classifier, hull collision, computer dock), driven from a new `stepDocking` call in `stepFlight` after the station-angle update; emit aperture + hull + ship-bbox numbers from `tools/oolite-ingest` into a new generated file; keep feedback (message/shake/flash) in an app-side `DockFeedback` driven by new `SimEvent`s and published to `window.__wegolite`; write the save through a small injected-port IndexedDB module with an in-memory fake in Vitest (no `fake-indexeddb`/`idb` dependency).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dock aperture/hull/ship-bbox measurement | Build (`tools/oolite-ingest`) | — | Deterministic function of vendored `.dat`; already parsed + bounds-asserted there; keeps sim free of asset parsing |
| Port frame, corridor classification, capture, auto-centre | `src/sim/dock/` (pure) | — | Must be deterministic at 1/120 s and unit-testable; sim purity rule |
| Hull collision + bounce impulse | `src/sim/dock/` + `FlightState` | — | Position/velocity are sim state; feedback is not |
| Computer dock (`Shift+C`) | `src/sim` command → `stepFlight` | `src/input` (chord), app (message) | Mode + clock are sim state and change on the same tick (D-12) |
| Credits / equipment / TL gate | `src/sim/player/` (pure) | `src/content` (equipment JSON loader) | Pure rule over injected catalogue data; hash-neutral |
| Message line, camera shake, red flash | App/render (`src/app/dock-feedback.ts`, HUD draw, camera) | probe | Presentation only; never in `src/sim/` |
| Autosave / restore | `src/persistence/` (IndexedDB adapter) | app session | Browser API; validator is pure and Node-testable |
| Title Continue/New game, docked purchase line | `src/ui/` DOM (`textContent` only) | app session | Existing panel pattern |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (no new runtime dependency) | — | Phase 4 is pure TS over existing `three@0.187.0`, `zod@4.6.7` | [VERIFIED: package.json:25-28 `"three": "0.187.0"`, `"zod": "4.6.7"`] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` (existing) | 4.6.7 | Validate the parsed save blob and the new generated `dock-port.json` | Same pattern as `src/content/schemas/*` |
| `vitest` (existing) | 5.0.5 | Unit tests incl. in-memory `SaveStore` fake | [VERIFIED: package.json devDependencies] |
| `@playwright/test` (existing) | 1.64.1 | Real-IndexedDB reload proof in the container | [VERIFIED: package.json devDependencies] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written ~60-line IDB adapter + in-memory port fake | `idb` | Seam flagged **SUS (too-new)** by the legitimacy gate; wrapper buys little for one object store |
| In-memory port fake in Vitest | `fake-indexeddb` (devDependency) | Seam flagged **SUS (too-new)**; would need `checkpoint:human-verify`. Not needed — the adapter is ~25 lines of IDB glue proved by Playwright |
| 8-corner AABB for ship footprint | Full 1548-vertex Cobra mesh | AABB is what D-01 says ("bounding box"); mesh vertices are Oolite's actual behaviour (`findBoundingBoxRelativeToPosition`) and slightly more permissive when rolled — optional later refinement |

**Installation:** none.

**Version verification:** no packages added. Legitimacy gate was run only to evaluate the two optional IDB helpers (below) and both were rejected.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| fake-indexeddb | npm | latest 6.2.7 published 2026-10-30 | ~11.1M/wk | github.com/dumbmatter/fakeIndexedDB | SUS (`too-new`) | **Not recommended** (not needed). If the planner insists: devDependency only + `checkpoint:human-verify` before install |
| idb | npm | latest published 2026-10-06 | ~35.6M/wk | github.com/jakearchibald/idb | SUS (`too-new`) | **Not recommended** (not needed) |

[VERIFIED: `gsd-tools query package-legitimacy check --ecosystem npm fake-indexeddb idb` run this session; both verdict `SUS`, reason `too-new`, `postinstall: null`.] Both names were selected from training knowledge, so they are `[ASSUMED]` as recommendations regardless of registry existence.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** fake-indexeddb, idb — neither is part of the recommended plan.

## Aperture Measurement (ROADMAP research flag)

**Recommendation: measure at build time from the vendored `.dat`, emit into generated JSON, consume as numbers in `src/sim/`.** Evidence:

- Oolite itself derives the port from the dock mesh bbox: `DockEntity.m:1044-1045` — `BoundingBox bb = [self boundingBox];` / `port_dimensions = make_vector(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);` [VERIFIED: /home/opencode/git/oolite/src/Core/Entities/DockEntity.m:1044-1045]
- Vendored dock mesh header: `// model size: 103.412 x 241.888 x 250.000` [VERIFIED: third_party/oolite/Models/oolite_coriolis_dock.dat:5]. Vertex min/max computed this session from all 244 vertices: x ∈ [-53.4118, 50.0005], y ∈ [-120.944, 120.944], z ∈ [-250.0, 0.0] [VERIFIED: computed from third_party/oolite/Models/oolite_coriolis_dock.dat].
- The ingest tool already records the same extents and fails the build on drift: `"oolite_coriolis_dock.dat": { x: 103.4123, y: 241.888, z: 250 },` [VERIFIED: tools/oolite-ingest/convert/dat.ts:121], enforced by `assertBounds(mesh, modelBounds(name), file)` [VERIFIED: tools/oolite-ingest/generate.ts:185] and exposed by `boundingBox(mesh)` [VERIFIED: tools/oolite-ingest/convert/dat.ts:709].
- Dock subentity placement (authored frame): `subentity_key = "oolite_coriolis_dock"; … position = (0, 0, 500.2561); is_dock = true;` [VERIFIED: /home/opencode/git/oolite/Resources/Config/shipdata.plist:1758-1761]. `deriveSystemLayout` uses `Math.abs(dockPosition[2])` as `dockOffset` [VERIFIED: src/sim/world/layout.ts:165]. The mouth plane is the mesh's z = 0; the tunnel runs 250 m *behind* it.
- The GLB already carries the dock translation and a separate `dock` node ("The Phase 2 GLB already separates the four coplanar layers … already carries the dock translation at local `-500.2561`; re-adding either would double the offset", src/render/bodies/station.ts:7-9). Runtime GLB inspection is therefore **unnecessary and more fragile** than the `.dat` (node transforms, float32 quantisation, Z-negation). Never derive the aperture from the hull box: hull is `x∈[-500,500] y∈[-500,500] z∈[-500,495.918]` [VERIFIED: computed from third_party/oolite/Models/oolite_coriolis.dat].
- Ship footprint: the committed golden already records Cobra bounds in the **Wegolite frame** — `"converted": { "min": [-65, -13.968799591064453, -43.46549987792969], "max": [65, 20.9960994720459, 37.907100677490234] }` [VERIFIED: tests/golden/content/ship-bounds.json:9-12]. Nose is local −Z (min z = −43.4655).

**Derived numbers (hand-computed from the above + DockEntity.m:632-654, rounded):**

| Quantity | Value |
|----------|-------|
| Port dims `(ww, hh, dd)` before expansion | 103.4123, 241.888, 250 |
| `rotatedPort` (`ww >= hh ? NO : YES`) | YES (slot is tall) |
| Cobra bbox extents (x, y, z) | 130, 34.965, 81.372 |
| `rotatedShip` | NO (130 ≥ 34.965) → `rotationsMatch` false → compare ship **y** vs `ww·0.90`, ship **x** vs `hh·0.90` |
| Expansion loops | None fire (34.965 ≤ 93.07; 130 ≤ 217.70) |
| Half-aperture after `*= 0.5` | `ww = 51.706`, `hh = 120.944` |
| Safety band (×1.5) | 77.56 × 181.42 half-extents |
| Roll tolerance (approx., AABB-corner model) | x-extent in port frame ≈ 130·sinφ + 35·cosφ ≤ 103.4 → φ ≲ 35° from "wings along slot" `[ASSUMED: planner should compute exactly in a unit test]` |

**Where measurement lives:** add a pure emitter in `tools/oolite-ingest/convert/` (e.g. `dock-port.ts`) that reads the three meshes `readModels` already loads (`generate.ts:171-190`) and emits `src/content/generated/dock-port.json` (canonical JSON, registered in the manifest like the other emitters, `generate.ts:133-139`). Emit, **already in the Wegolite frame (Z negated, same as GLB conversion, glb.ts:19)**: `port` {width, height, depth, centre offset not needed (Oolite tests against the port origin, see Pitfall 6)}, `hull` half-extents, `cobra` bbox. A drift test then pins it (existing `drift.test.ts` pattern, `npm run assets:check`). `src/content/` exposes it through a typed loader; **`src/sim/` must not import generated content** (tests/helpers/lave.ts:7-8 explains the existing rule) so the app passes the numbers into a `DockGeometry` value that `src/sim/dock/` accepts as an argument.

## Oolite Corridor Algorithm (as read)

All citations: `/home/opencode/git/oolite/src/Core/Entities/DockEntity.m` [VERIFIED: Read this session].

| Step | Lines | Verbatim | Notes |
|------|-------|----------|-------|
| Frame | 621-624 | `Quaternion q0 = quaternion_multiply(orientation, [station orientation]);` `vi = vector_right_from_quaternion(q0)`, `vj = …up…`, `vk = …forward…` | Port quat × station quat; roll is inherent |
| Ship bbox in port frame | 626-629 | `HPVector port_pos = [self absolutePositionForSubentity];` `arbb = [ship findBoundingBoxRelativeToPosition:port_pos i:vi j:vj k:vk];` | Mesh-vertex projection, relative to the **port origin** |
| Port dims | 632-634 | `ww = port_dimensions.x; hh = …y; dd = …z` | |
| Orientation match | 636-639 | `rotatedPort = (ww >= hh) ? NO : YES;` `rotatedShip = …` | |
| Expansion | 641-651 | `while (shipbb.max.x - shipbb.min.x > ww * 0.90) ww *= 1.25;` (and y/hh; swapped when rotations mismatch) | Uses the ship's **local** bbox (`[ship boundingBox]`), not the port-frame one |
| Halve | 653-654 | `ww *= 0.5; hh *= 0.5;` | |
| Past-end reject | 691-693 | `if (arbb.max.z < -dd) { return NO; }` | Ship entirely beyond the 250 m tunnel |
| In-lane | 695 | `(arbb.max.x < ww) && (arbb.min.x > -ww) && (arbb.max.y < hh) && (arbb.min.y > -hh)` | Strict inequalities |
| Capture (in-lane) | 711 | `if (0.90 * arbb.max.z + 0.10 * arbb.min.z < 0.0) // we're 90% in docking position!` → `pullInShipIfPermitted` | |
| Launching shortcut | 718 | `if ([ship status] == STATUS_LAUNCHING) {` → `return YES` | Launch never fights the corridor |
| Safety band | 724-726 | `GLfloat safety = 1.0 + (50.0 / 100.0);` `(arbb.min.x > -safety * ww) && (arbb.max.x < safety * ww) && …y…` | |
| Nose inside | 727 | `if (arbb.min.z < 0.0) // got our nose inside` | Correction only runs once the nose crosses the plane |
| Straddle (fatal in Oolite) | 730-734 | `if ((arbb.min.x < -ww && arbb.max.x > ww) \|\| (arbb.min.y < -hh && arbb.max.y > hh)) { … return NO;` | CONTEXT D-05 turns this into a bounce |
| Correction factor | 737 | `GLfloat correction_factor = -arbb.min.z / (arbb.max.z - arbb.min.z);` | Proportion of ship inside, 0..1 |
| Damage + events | 740-742 | `[ship takeScrapeDamage:5 * [UNIVERSE getTimeDelta] * [ship flightSpeed] from:station];` + `shipCollided` script events | **Not ported** (no damage model). Oolite has **no per-tick text message** here — scrape feedback in Oolite is sound + damage (`PlayerEntity.m:5701-5745`). The scrape *message* cadence is a Wegolite invention (see Pitfall 8) |
| Delta | 744-746 | `delta.x = 0.5f * (arbb.max.x + arbb.min.x) * correction_factor;` (same for y) | Centre-of-bbox offset × proportion inside |
| x guard | 748-751 | `if (arbb.max.x < ww && arbb.min.x > -ww) { delta.x = 0.0f; }` | Correct: no x correction when x is inside |
| **y guard** | 752-753 | `if (arbb.max.y > hh && arbb.min.y > -hh) {` → `delta.y = 0.0f` | **Inconsistent** with x guard (`>` vs `<`); likely upstream bug |
| Apply | 758-762 | `pos.x -= delta.y * vj.x + delta.x * vi.x;` … `[ship setPosition:pos];` | Position shift each tick, no velocity change |
| Capture (band) | 766 | `if (0.90f * arbb.max.z + 0.10f * arbb.min.z < 0.0f) {` → pull in | |
| Result | 770 / 773 | `return YES; // okay NOW we're in the docking corridor!` / `return NO;` | |
| Launch twist | 824-826 | `if ((port_dimensions.x < port_dimensions.y) ^ (bb.max.x - bb.min.x < bb.max.y - bb.min.y)) { quaternion_rotate_about_axis(&q1, launchVector, M_PI * 0.5); // to account for the slot being at 90 degrees to vertical` | Oolite rolls the Cobra 90° at launch |

**Omitted by CONTEXT.md (deliberately or not):** docking-clearance message (681-685), `allow_docking`/launch-only-dock scrape-and-bounce branch (696-708, irrelevant for the Coriolis `allow_docking` true), fatal straddle (734), shield/hull damage (740), `shipCollided` events. **Oolite's non-lane failure is ordinary octree collision** in `ShipEntity.m` (~11060-11135): elastic exchange along the contact vector plus `takeScrapeDamage`. Recommendation: do not port the octree; use the box hull below.

**Recommendation on the y-guard bug:** port **symmetrically** (`if (arbb.max.y < hh && arbb.min.y > -hh) delta.y = 0`) and record the deviation in a code comment + `.planning/PROJECT.md` Key Decisions. Faithful reproduction would disable y auto-centring exactly when the ship protrudes above the top edge. This is a user-visible fidelity choice → raised as Open Question 3.

## Architecture Patterns

### System Architecture Diagram

```
 Build time                         Runtime (app)                              Runtime (sim, 1/120 s)
 ----------                         -------------                              ----------------------
 third_party/oolite/Models/*.dat ─► tools/oolite-ingest ─► generated/dock-port.json
   (dock, hull, cobra bounds)                                  │
                                                               ▼  typed loader (src/content)
                                           DockGeometry (plain numbers) ─────────────┐
 keyboard (Shift+C chord) ─► Command{dockingComputer} ──┐                              ▼
 UI Launch button ───────► Command{launch} ──────────────┼─► stepFlight(state, layout, config, intent, commands, dt)
                                                         │     1 drain commands (launch / dockingComputer)
                                                         │     2 attitude, torus, speed/position   (inFlight only)
                                                         │     3 station angle, flightTime, clock
                                                         │     4 stepDocking(state, layout, geometry):    ◄── NEW, after 3
                                                         │          port frame = f(stationBaseQuat, stationAngle)
                                                         │          classify: none │ lane │ band(+auto-centre) │ capture │ straddle
                                                         │          hull collision (outside lane) → bounce impulse + push-out
                                                         ▼
                                           SimEvent[]: docked{via} │ scrape │ bounce │ dockDenied{reason}
                                                         │
                         ┌───────────────────────────────┴──────────────────────────────┐
                         ▼                                                              ▼
              handleEvent (game-session)                                    persistence (on `launched`)
              ├ messages.enqueue(...)                                       SaveV1 → zod-validated → IDB put
              ├ DockFeedback.trigger(shake, flash)  (flightTime clock)      boot: read → validate → title Continue
              ├ docked.show / hide, purchase line
              └ probe.dock {…}  (window.__wegolite)
```

### Recommended Project Structure
```
src/sim/dock/
├── geometry.ts        # DockGeometry type + assertFinite guard (numbers only)
├── port-frame.ts      # portFrame(layout, stationAngle) → {origin,i,j,k}
├── corridor.ts        # classifyCorridor(frame, geometry, pose) → outcome + correction
├── hull.ts            # box-hull collision → {normal, depth} | null; push-out
├── step.ts            # stepDocking(state, layout, geometry) → SimEvent[]
└── computer.ts        # dockWithComputer(state, layout) (aegis gate, +1200 s)
src/sim/player/profile.ts      # {credits:int decicredits, equipment:string[]}, canPurchase(), purchase()
src/persistence/save.ts        # SaveV1 type, zod schema, parseSave(), encode (pure)
src/persistence/idb-store.ts   # SaveStore port + IndexedDB adapter; memory-store.ts for tests
src/app/dock-feedback.ts       # shake/flash envelopes on the sim flightTime clock
src/content/dock-port.ts       # typed loader for generated/dock-port.json
tools/oolite-ingest/convert/dock-port.ts
```

### Pattern 1: Port frame in the Wegolite coordinate system
**What:** Wegolite negated Z, so the dock/outward normal is station-local **−Z**. Station orientation at time *t* is exactly what the renderer uses: `mul(layout.stationBaseQuat, axisAngle(0, 0, 1, stationAngle))` [VERIFIED: src/render/bodies/station.ts:209-212]. Use `i = rotate(q,(1,0,0))`, `j = rotate(q,(0,1,0))`, `k = rotate(q,(0,0,-1))` (outward). Port origin = `station.position + k·dockOffset`, which equals `dockMouthPosition(layout)` [VERIFIED: src/sim/flight/state.ts:119-124] because the roll axis passes through it. The ship's port-frame bbox is `dot(corner − origin, i/j/k)` over the 8 corners of the Wegolite-frame Cobra AABB rotated by the ship quaternion. Oolite's `k` points *out*; capture condition `0.9·max.z + 0.1·min.z < 0` therefore holds unchanged with `z = dot(·, k)`.
**Example:**
```typescript
// Source: derived from DockEntity.m:621-629 + src/render/bodies/station.ts:209-212 (this repo)
const q = mul(layout.stationBaseQuat, axisAngle(0, 0, 1, state.stationAngle));
const i = rotate(q, vec(1, 0, 0));
const j = rotate(q, vec(0, 1, 0));
const k = rotate(q, vec(0, 0, -1)); // outward; Wegolite dock/forward is local -Z
const origin = add(layout.station.position, scale(k, layout.dockOffset));
```

### Pattern 2: `stepDocking` placement and mode ordering
**What:** In `stepFlight`, run docking **after** step 5 (station angle/flightTime/clock) and **only when `state.mode === "inFlight"`** and not `launchedThisStep` [step order: src/sim/flight/step.ts:57-133]. The port frame must use the *post-increment* `stationAngle` or the corridor lags the visible slot by one tick. On capture: `mode = "docked"`, `speed = 0`, `rollRate = pitchRate = 0`, `position = dockMouthPosition(layout)`, `orientation = layout.stationBaseQuat`, push `{kind:"docked", via:"manual"}`. Clock does **not** advance on a manual dock (only launch +600 s, computer dock +1200 s). `state.stationAngle` is left as-is; `beginLaunch` resets it to 0 anyway [VERIFIED: src/sim/flight/launch.ts:55 `state.stationAngle = 0;`]. Because the existing roll update is gated on `modeAtStart !== "docked"` [step.ts:115], docking this tick still advances the angle once — harmless.
**Why mode lives in sim, transitions in `advanceMode`:** extend `ModeTransition` in `src/app/mode.ts:18` (`"launch" | "launchComplete"`) with `"dock"`; the table there is a presentation mirror, not an authority (`mode.ts:11-12`). The authoritative write is in `stepDocking`/`computer.ts`.

### Pattern 3: Hull collision + bounce (the part Oolite does not give us)
**What:** The Coriolis hull is a box in station-local coords (±500 on x/y; z from −495.918…+500 in the authored frame, i.e. mirrored in Wegolite). Transform the ship's 8 AABB corners into station-local coordinates; if any corner is inside the hull box **and the ship is not classified lane/band**, resolve along the axis of least penetration: normal = that face's world normal, push position out by the penetration depth, apply an impulse `v' = v − (1+e)(v·n)n` and then `speed` is recomputed. Because `FlightState.speed` is scalar along forward [VERIFIED: src/sim/flight/speed.ts `state.position = add(state.position, scale(forward, state.speed * dt))`], add to `FlightState`: `impulse: Vec3` (world m/s, exponentially damped, e.g. τ ≈ 0.6 s) integrated into `position` each inFlight tick, plus integer counters `bounceCount`, `scrapeTicks`, `dockCount` for hash/probe. `speed` is multiplied by a damping factor (e.g. 0.35) at contact; orientation is untouched (D-07). Restitution `e` ≈ 0.5, impulse floor ≥ 8 m/s so a zero-speed brush still separates (Oolite's own "must provide at least 1 m/s" rule, ShipEntity.m ~11100-11103) `[ASSUMED: tuning values]`.
**Trap-state guard (D-09):** if a corner is deep inside the box (penetration > half-extent along every axis) push out along the **outward dock normal** if inside the tunnel footprint, else along the nearest face. Never leave `mode` anywhere but `inFlight`.
**Oolite caveat:** Oolite hulls use an octree and tunnel walls are collidable; the box model with an aperture exception (lane/band ⇒ corridor-protected) gives the same macro behaviour for the single Coriolis. The tunnel interior (z 0…−250 from the mouth) must not be hull-collidable inside the lane/band footprint or the ship would bounce on its way in.

### Pattern 4: Feedback outside the sim
**What:** `SimEvent` gains `{kind:"scrape"}` (once per tick while auto-centring), `{kind:"bounce", speed:number}`, `{kind:"docked", via}`, `{kind:"dockDenied", reason:"outsideAegis"|"notInstalled"}` [event union at src/sim/events.ts:34-40; events carry no copy]. `handleEvent` (src/app/game-session.ts:291-321) maps them: message via `messages.enqueue` (4 s sim-clock expiry, queue cap 4 — src/render/hud/messages.ts), a **throttled** scrape message (≥ 1.0 s of `flightTime` between enqueues, else the 4-slot queue floods at 120 Hz), `DockFeedback.trigger(...)`. **Do not use `HintController`** for these: it is once-per-install teaching persisted in settings (`hints.ts:1-12,73-114`). `DockFeedback` keeps `{shakeUntil, flashUntil, amplitude}` on the **sim `flightTime`** (pause-safe, deterministic) and exposes `shakeOffset(flightTime)` and `flashAlpha(flightTime)`. Camera shake is added where the cockpit camera pose is computed (`computeCockpitCamera(pose.position, pose.orientation)`, src/app/game-session.ts:445) as a small deterministic sinusoid (no `Math.random`); the red frame flash is a new field on the HUD model drawn by `drawHud` (src/render/hud/draw.ts:352). Publish `probe.dock = { outcome, scrapeCount, bounceCount, dockCount, shake: number, flash: number, lastMessage }` (new optional field on `WegoliteProbe`, src/app/probe.ts:81-124) so e2e asserts numbers, never pixels. Flash 0.4 s, shake 0.35 s, amplitude ~0.6 m camera offset `[ASSUMED: tuning]`.

### Anti-Patterns to Avoid
- **A trigger sphere / distance check for capture** — contradicts DOCK-01; use the port-frame bbox.
- **Computing the port frame from the previous tick's `stationAngle`** — one-tick lag; run after step 5.
- **Mutating `state.mode` from `game-session.ts`** — all docking transitions happen inside `stepFlight` so replay/hash stay authoritative.
- **Putting shake/flash/message state into `FlightState`** — pollutes hashing and `src/sim/` purity; keep in `src/app/`.
- **Storing the docked pose (float position/quaternion) in the save** — D-13: derive from the layout.
- **Importing generated JSON in `src/sim/`** — violates the content-boundary guard; inject numbers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dock/hull/ship bounds | Hand-typed constants in sim | Build-time emit from `.dat` through existing `boundingBox`/`assertBounds` | Drift protection already exists (`dat.ts:709`, `generate.ts:185`) |
| Quaternion/vector maths | New helpers | `src/sim/math.ts` (`mul`, `axisAngle`, `rotate`, `normalize`, `add`, `scale`, `sub`, `vec`, `moveToward`, `clamp`) | Already used by launch/speed (launch.ts:17, speed.ts) |
| Save validation | Ad-hoc `typeof` checks | `zod` strict object (same dependency as content schemas) + explicit `version` literal | Corrupt/foreign blobs rejected the way `settings/schema.ts` does |
| Canonical hashing | `JSON.stringify` | `canon`/`fnv1a32` in `src/sim/hash.ts`, extend `serializeFlight` | Pattern C is already enforced (state.ts:91-96) |
| Message queue / expiry | New timers | `createMessageQueue` (sim-clock expiry) | Pause-safe by construction |
| IndexedDB helpers | `idb`/`fake-indexeddb` | A tiny `SaveStore` port + ~25 line adapter + in-memory implementation | Both helper packages are `SUS (too-new)`; one object store needs no wrapper |

**Key insight:** every "new" mechanic here is a thin layer over existing seams (layout frame, `stepFlight` order, event→message path, settings-store pattern). The only genuinely new maths is the OBB-vs-box hull response.

## Integration Seams (exact current APIs)

| File | Signature / anchor | Lines |
|------|--------------------|-------|
| `src/sim/world/layout.ts` | `interface SystemLayout { planet, sun, station, navBuoy, witchpoint: Body; stationToPlanet: Vec3; stationBaseQuat: Quat; stationRollRadPerSec: number; dockOffset: number; scannerRange; stationAegisRange; planetAegisRange; sunDir; rotationSpeed }`; `deriveSystemLayout(system: System, stationDef: ShipDef): SystemLayout` | 47-68, 122-125 |
| `src/sim/world/layout.ts` | `const STATION_AEGIS_RANGE = 51_200;` `const SCANNER_RANGE = 25_600;` `const STATION_RADIUS = 500;` | 71-76 |
| `src/sim/flight/state.ts` | `type FlightMode = "docked" \| "launching" \| "inFlight";` `interface FlightState {tick, mode, clockSeconds, flightTime, position, orientation, speed, pitchRate, rollRate, torus, stationAngle, launchElapsed, launchCount, compassMode, compassTarget}`; `initFlightState(layout)`, `poseOf`, `serializeFlight`, `hashFlight`, `dockMouthPosition(layout)`, `CLOCK_START = 2_084_004 * 86_400` | 18, 29-51, 60, 63-84, 95-116, 119-124 |
| `src/sim/flight/step.ts` | `stepFlight(state, layout, config, intent, commands: readonly Command[], dt): SimEvent[]` — command switch at 58-84; mode at 87-90; per-mode motion 95-110; station roll/clock gated `modeAtStart !== "docked"` at 115-128 | 37-134 |
| `src/sim/flight/launch.ts` | `beginLaunch(state, layout, config): boolean` (`+= 600` clock, dock-mouth pose, `speed = config.launchSpeed`, `stationAngle = 0`), `completeLaunch`, `stepLaunch`, `LAUNCH_DURATION = 2` | 38-57, 60-65, 72-96 |
| `src/sim/commands.ts` | `type Command = {kind:"launch"} \| {kind:"skipLaunch"} \| {kind:"toggleTorus"} \| {kind:"setPaused";paused} \| {kind:"cycleCompass"} \| {kind:"targetStation"}` | 13-19 |
| `src/sim/events.ts` | `SimEvent` union: `launched`, `launchComplete`, `torusEngaged{factor}`, `torusDisengaged{reason}`, `massLockChanged{locked}`, `compassTargetChanged{target}` | 34-40 |
| `src/app/mode.ts` | `advanceMode(mode, transition: "launch" \| "launchComplete")`, `screenForMode(mode)` | 18, 22-35 |
| `src/app/game-session.ts` | `createGameSession(options): GameSession`; `handleEvent` 291-321; `updateProbe` 323-414; `renderFrame` 416-501 (`hudCanvas.hidden = isDocked` at 473-475); `frame` 521-587 (per-step controller choice + `stepFlight` at 555-577); `start()` 589-717 (`initFlightState` at 627, `title.hide(); docked.show(system.name); docked.onLaunch(...)` at 709-713); test hook only under `?test=1` at 705-707 | as listed |
| `src/app/hints.ts` | `HintContext`, `hintText(id,bindings)`, `createHintController` — once-per-install, persisted; **not** the channel for scrape/bounce | 28-130 |
| `src/ui/docked.ts` | `DOCKED_CREDITS = "100.0 Cr"` (constant, **no real credits state exists**), `DockedPanel {show(systemName), hide(), setMessage(text), onLaunch(handler), dispose()}`, `requireField(root, field)` via `[data-field]`, Launch via `[data-action="launch"]` | 13-15, 17-24, 26-78 |
| `index.html` | `#docked` panel: fields `system`, `credits`, `ship`, `fuel`, `message`, button `data-action="launch"` | 274-288 |
| `src/ui/title.ts` | `TitleScreen {show, hide, onStart(handler), dispose}`; single `#title-start` button | 90-129 |
| `src/main.ts` | `title.onStart(() => { void session.start(); })` | 195-197 |
| `src/input/actions.ts` | `ActionId` union (12 ids), `ACTION_IDS`, `DEFAULT_BINDINGS` (frozen `Record<ActionId, readonly string[]>`), `ACTION_LABELS` | 142-211 |
| `src/input/keyboard.ts` | `EDGE_COMMANDS: Partial<Record<ActionId, Command>>`; `keyDown(code, repeat)` has **no modifier argument**; `onKeyDown` drops any Ctrl/Meta/Alt chord except `ControlLeft/Right`, Shift is not filtered | 29-34, 80-94, 152-177 |
| `src/content/ships.ts` | `loadShipCatalogue()`, `findShip`, `playerShip(catalogue)`, `stationShip(catalogue)` (`oolite_template_cobra3-player`, `coriolis-station`) | 21-22, 33-74 |
| `src/content/schemas/equipment.ts` | `techLevel: z.number().int()`; **no equipment loader exists in `src/content/`** (only the schema) | 24 |
| `src/settings/store.ts` | `loadSettings(storage = localStorage)`, `saveSettings`, `resetSettings`; key `wegolite.settings` + `wegolite.settings.corrupt`; newer version ⇒ defaults without overwrite | 41-106 |
| `src/app/probe.ts` | `WegoliteProbe` (additive optional fields), `createTestHook(state, scenes)` → `{setPosition, setSpeed, swapSystem, disposeSystem}` only under `?test=1` | 81-124, 156-172 |

**Quoted discrete values:** `const STATION_AEGIS_RANGE = 51_200;` [VERIFIED: src/sim/world/layout.ts:76]; `export type FlightMode = "docked" | "launching" | "inFlight";` [VERIFIED: src/sim/flight/state.ts:18]; `state.clockSeconds += 600;` [VERIFIED: src/sim/flight/launch.ts:48]; `export const DOCKED_CREDITS = "100.0 Cr";` [VERIFIED: src/ui/docked.ts:13]; `"key": "EQ_DOCK_COMP", "name": "Docking Computers", "price": 15000, "priceUnit": "decicredits", "techLevel": 9` [VERIFIED: src/content/generated/equipment.json:58-62]; `stationRoll: 0.08` and `isDock: true … position: [0, 0, 500.2561]` [VERIFIED: src/content/generated/ships.json coriolis-station shipDef, read this session]; `expect(layout.stationRollRadPerSec).toBe(0.125_663_706_143_591_74);` [VERIFIED: tests/sim/layout.test.ts:102].

## Shift+C, Credits and Purchase

- **Keyboard:** bindings are `KeyboardEvent.code` strings with no chord notion [src/input/keyboard.ts:80-94]. Add `dockingComputer` to `ActionId`, `ACTION_IDS`, `DEFAULT_BINDINGS` (`["KeyC"]`), `ACTION_LABELS`, and `EDGE_COMMANDS` (`{kind:"dockingComputer"}`), then make the *keyboard layer* require Shift for that one action: extend `InputState.keyDown(code, repeat?, mods?: {shift: boolean})` and a small `REQUIRES_SHIFT: ReadonlySet<ActionId>`; `onKeyDown` already lets Shift through. Plain `C` without Shift must not fire. Rebinding UI (`src/ui/controls.ts`) stays code-only, so the Shift requirement is documented in the action label ("Docking computer (Shift+)"). Existing tests that count actions must be updated (`tests/input/bindings.test.ts`, `tests/settings/schema.test.ts` — settings blobs from older builds lack the new action key; `mergeDefaults` must supply it, settings.ts:184-198 pattern).
- **Credits:** there is **no credits state anywhere** — only the constant `DOCKED_CREDITS`. Introduce `PlayerProfile {credits: number /* integer decicredits */; equipment: readonly string[]}` in `src/sim/player/profile.ts` (not in `FlightState`, so `hashFlight`/cadence tests stay untouched). New game: `credits = 1000` (100.0 Cr, CONTEXT "Specifics"). `formatCredits(decicredits)` = `(d/10).toFixed(1) + " Cr"`. Docked panel gets one extra row `[data-field="dockcomp"]` + `[data-action="buy-dockcomp"]` (extend `requireField` pattern, `textContent` only).
- **Equipment data:** no loader exists; add `src/content/equipment.ts` mirroring `ships.ts` (lazy `?raw` JSON + zod `EquipmentSchema`). `EQ_DOCK_COMP` values quoted above.
- **TL gate:** Oolite compares the **raw** system tech level to the equipment TL: `if (localtl < effectivetl) { return false; }` with `localtl = system.info.techlevel` [VERIFIED: /home/opencode/git/oolite/Resources/Scripts/oolite-conditions.js:80-91]. Lave's `techLevelRaw` is **4** [VERIFIED: computed from src/content/generated/systems/g0.json, id `g0-s7`, `techLevelRaw: 4`; the schema stores the raw value with no +1: src/content/schemas/system.ts:20-21]. Therefore a faithful TL-9 gate **refuses the purchase at Lave**. See Open Question 1.

## Persistence (IndexedDB)

**State of the repo:** no IndexedDB code exists [VERIFIED: `rg -n indexedDB src tests` → no matches; ran this session]. Settings are a `localStorage` versioned blob [src/settings/store.ts:1-15]; saves must use a **different** store and key (store.ts header: "IndexedDB stays reserved for game saves").

**Recommended minimal design**
- DB `wegolite`, version 1, one object store `saves`, one record key `"autosave"` (`[ASSUMED]` naming — discretion item).
- `SaveV1 = { version: 1, mode: "docked", clockSeconds: number, credits: number /* integer decicredits */, equipment: string[], system: { id: "g0-s7" }, station: { key: "coriolis-station" } }`. Stored as a **plain JSON string** (not a structured-clone object) so validation is one `JSON.parse` + zod, mirroring `loadSettings`. No float pose, no timestamps/host data.
- Pure `parseSave(raw: unknown): {ok:true; save} | {ok:false; reason:"corrupt"|"future-version"}` in `src/persistence/save.ts`: strict zod object, `version` literal 1, `clockSeconds` finite and ≥ `CLOCK_START`, `credits` safe non-negative integer, `equipment` ≤ N known keys from the equipment catalogue, system id must exist in the loaded galaxy. `version > 1` → `future-version`, **left untouched in IDB** (never overwritten — same rule as settings, store.ts:58-65); corrupt → treated as no save and (best-effort) copied to key `"autosave.corrupt"`.
- `SaveStore` port `{ read(): Promise<string | null>; write(json: string): Promise<void>; clear(): Promise<void> }`. `IndexedDbSaveStore` opens lazily, wraps each request in a Promise, and **swallows/ reports** failures (private mode, quota): a failed write must never break the game (store.ts:91-95 precedent). `MemorySaveStore` in `src/persistence/` for Vitest and e2e-independent unit tests.
- **Hook:** write on the `launched` event in `handleEvent` (src/app/game-session.ts:293-298). The save payload uses the state *after* `beginLaunch` (clock already +600 s) but declares `mode: "docked"` — i.e. "resume docked at this clock". The write is fire-and-forget (`void store.write(...)`) and must not block the frame loop.
- **Restore:** boot reads the save before the title is shown (async, with the store injected); title gets a second button `#title-continue` (hidden when no valid save). **Keep `#title-start` as "New game"**: existing specs click it on fresh contexts [tests/e2e/aspect.spec.ts:43, dispose.spec.ts:29,115, launch.spec.ts:100]. Note `launch.spec.ts:96-102` reloads *after a launch*, so with autosave present that spec must still pass: `#title-start` = New game clears the save and starts fresh, which matches the spec's expectation (docked, `launch.seen` true because `launchSeen` is in `localStorage`). Continue = `initFlightState(layout)` then overwrite `clockSeconds`, plus profile restore.
- **Interaction with localStorage settings:** none beyond sharing boot; New game does **not** touch `wegolite.settings` (bindings/hints survive).
- **Vitest strategy:** unit-test `parseSave` (table-driven: valid, wrong version, future version, NaN clock, negative credits, unknown equipment, extra keys, truncated JSON), the autosave-on-`launched` mapping with `MemorySaveStore`, and Continue/New-game state derivation. **Real IndexedDB is proved only in Playwright** (reload within the container, `window.__wegolite.mode === "docked"` and `clock` equal to the saved clock). No new dependency.

## Common Pitfalls

### Pitfall 1: Station roll rate is 0.1256637 rad/s, not 0.08
**What goes wrong:** CONTEXT.md "Specifics" says "The station rotates at 0.08 rad/s". `station_roll = 0.08` is authored in right-angles/second; the sim already converts it (`stationRollRadPerSec: (stationRoll * Math.PI) / 2`, layout.ts:181; pinned to `0.125_663_706_143_591_74` / 50 s period in tests/sim/layout.test.ts:102-103). Tuning auto-centring against 0.08 would under-estimate the port's edge speed by ~57 %.
**How to avoid:** always read `layout.stationRollRadPerSec`. Port-edge speed at the far corner of the safety band ≈ ω·r ≈ 0.1257 × ~190 m ≈ 24 m/s.
**Warning signs:** a hard-coded `0.08` anywhere in `src/sim/dock/` or tests.

### Pitfall 2: Station roll frame vs ship frame
**What goes wrong:** the port frame rotates with `stationAngle`; the ship frame does not (the player's roll is independent). An approach flown "level" in the world is progressively mis-rolled relative to the slot.
**How to avoid:** project **in the port frame** only; never compare ship world axes to station base axes. Test with `stationAngle` ≠ 0 (e.g. 0, π/4, π/2, π).

### Pitfall 3: Float jitter around the capture plane
**What goes wrong:** the capture test is `0.9·max.z + 0.1·min.z < 0` on a value that crosses zero at ~3 m/tick.
**How to avoid:** the sim is deterministic float64; compute everything from **relative** vectors (`corner − port origin`), never from absolute world positions (|station| ≈ 8×10⁴…10⁵ m); no epsilon in the sim (strict `< 0`, Oolite does the same). Tests use a ±1e-9 tolerance only when constructing boundary poses. Speed is capped at 350 u/s ⇒ 2.9 m/tick ≪ the 81 m ship length, so the plane cannot be tunnelled; but the `?test=1` `setSpeed` hook can inject arbitrary speed — clamp inside `stepDocking` tests, not in the hook.

### Pitfall 4: Mode transition ordering
**What goes wrong:** docking inside the per-step callback while `renderFrame`/`showHint` read `state.mode` the same frame can show the flight HUD over the docked panel or fire the "launch" hint twice.
**How to avoid:** all state writes happen in `stepFlight`; the app reacts to the `docked` event in `handleEvent` (call `docked.show(system.name)`, `hudCanvas.hidden = true`, reset input via `input.clearAll()`, `launchSequence.reset()`). `renderFrame` already derives `hudCanvas.hidden` from `mode` (game-session.ts:473-475) — keep it the single source. Reset `currentPose`/`previousPose` to the docked pose on dock (else `interpolatePose` smears the camera across the teleport).

### Pitfall 5: Phase 3 launch does not apply Oolite's 90° twist
**What goes wrong:** `beginLaunch` sets `orientation = layout.stationBaseQuat` (launch.ts:50) and `tests/sim/launch.test.ts:112` expects exactly that (`expect(state.orientation).toEqual(fixture.layout.stationBaseQuat)`). Oolite rolls the Cobra 90° when `(port x < port y) XOR (ship x < ship y)` (DockEntity.m:824-826), which is true here. After launch the player therefore leaves the station with wings **across** the tall slot — and the first thing they must learn for re-docking is "roll 90°".
**How to avoid:** do **not** silently change launch orientation in Phase 4 (would break the pinned Phase 3 test and the launch camera). Teach the roll via an on-approach message. Raise as Open Question 2.

### Pitfall 6: Port origin is not the dock-mesh bbox centre
**What goes wrong:** the dock mesh x range is [-53.4118, 50.0005] (centre −1.706). Oolite tests lane membership against the **port origin** (`DockEntity.m:695`: `arbb.max.x < ww … arbb.min.x > -ww`), not the bbox centre.
**How to avoid:** treat the aperture as symmetric ±`width/2` about the origin (exactly Oolite). Do not "centre" using the mesh bbox.

### Pitfall 7: Auto-centring is a continuous positional shift
**What goes wrong:** the correction (DockEntity.m:758-762) adds `delta` to position **every tick** and changes no velocity. At 120 Hz the pull is much stronger than Oolite's variable frame rate if `delta` is not tied to `dt`; Oolite's own `delta` is per-call (frame-rate dependent!).
**How to avoid:** D-03 says "continuous proportional correction": apply `delta` per fixed tick (as ported, 1/120 s steps) and verify in a test that docking success is **cadence independent** (the sim step is fixed, so `flight-cadence.test.ts`-style 60/144 Hz replays hash-equal). Also: the `delta` depends on the bbox centre offset × proportion-inside, which is 0 until the nose crosses the plane (`min.z < 0`), so there is no pre-plane pull — hence the player must be in the *band* when the nose arrives.

### Pitfall 8: Scrape message flooding
**What goes wrong:** Oolite emits per-tick scrape *damage + sound*, not text. Enqueuing one message per tick overflows the 4-slot queue (messages.ts, cap 4) and the line flickers.
**How to avoid:** emit a `scrape` sim event each correcting tick, but throttle the *message* to ≥ 1 s of `flightTime` and let shake/flash be edge-triggered (restart envelopes only when idle).

### Pitfall 9: Trap states
**What goes wrong:** a ship stationary inside the lane (speed 0) with the nose past the plane never meets the 90 % condition; or a ship teleported inside the hull box.
**How to avoid:** the player can always accelerate forward (speed cap min 0, speed.ts clamp) and pitch/roll out; in the band they are pulled to centre; outside lane/band a face contact bounces. Add the defensive push-out for any state with corners inside the hull box outside the corridor footprint, and a property test: *from any initial pose near the station, ≤ N ticks of any input never leaves `mode` ≠ `inFlight` unless captured*.

### Pitfall 10: Hash and golden churn
**What goes wrong:** extending `serializeFlight` changes every `hashFlight` value. The Phase 1 golden is a **separate** sim state (`tests/golden/kinematic-probe.json`, src/sim/state.ts) and is unaffected, and the two flight tests that call `hashFlight` compare runs against each other (tests/sim/flight-cadence.test.ts:95, flight-controller.test.ts:87) — no literal hash is pinned [VERIFIED: `rg` for 8-hex literals returned none]. Append new lines at the **end** of `serializeFlight` (`impulse`, `dockCount`, `bounceCount`) and extend `initFlightState`.

### Pitfall 11: Generated-content drift gates
**What goes wrong:** adding `generated/dock-port.json` without registering it in the manifest/drift check fails `assets:check` and the content-boundary guard.
**How to avoid:** add the emitter to `generateContent` (generate.ts:133-139) and regenerate with `docker compose run --rm assets`; verify with `docker compose run --rm assets npm run assets:check`.

## Code Examples

### Corridor classification (pure; reference shape for the planner)
```typescript
// Source: DockEntity.m:632-773 (this research) — Wegolite frame, port origin as centre.
export type CorridorOutcome =
  | { kind: "outside" }
  | { kind: "lane" }                               // in lane, nose not yet at capture
  | { kind: "band"; deltaX: number; deltaY: number }  // auto-centre + scrape
  | { kind: "straddle" }                           // D-05: bounce
  | { kind: "capture" };

export function apertureHalfExtents(
  port: { width: number; height: number },
  shipLocal: { width: number; height: number },     // local bbox extents x,y
): { ww: number; hh: number } {
  let ww = port.width;
  let hh = port.height;
  const rotatedPort = ww < hh;
  const rotatedShip = shipLocal.width < shipLocal.height;
  const [a, b] = rotatedPort === rotatedShip
    ? [shipLocal.width, shipLocal.height]
    : [shipLocal.height, shipLocal.width];
  while (a > ww * 0.9) ww *= 1.25;
  while (b > hh * 0.9) hh *= 1.25;
  return { ww: ww * 0.5, hh: hh * 0.5 };
}
```
(`while` is bounded because `port.width > 0` — assert it at geometry construction, otherwise a 0 aperture loops forever: a hang, not an error.)

### Computer dock
```typescript
// D-11/D-12: same-tick transition; the aegis gate uses the existing layout constant.
if (lengthSquared(sub(state.position, layout.station.position)) <= layout.stationAegisRange ** 2) {
  state.mode = "docked"; state.speed = 0;
  state.position = dockMouthPosition(layout);
  state.orientation = layout.stationBaseQuat;
  state.clockSeconds += 20 * 60;               // exactly 1200 s
  events.push({ kind: "docked", via: "computer" });
} else {
  events.push({ kind: "dockDenied", reason: "outsideAegis" });
}
```
(Uses `aegisStatus(position, layout) === "dockingRange"` from src/sim/world/aegis.ts:34-52 instead of re-deriving; require equipment ownership in the **app** before pushing the command, and also guard in the sim so a stray command is a no-op.)

### Save validation skeleton
```typescript
// Source: pattern of src/settings/schema.ts + zod 4.6.7 (project dependency)
const SaveV1 = z.strictObject({
  version: z.literal(1),
  mode: z.literal("docked"),
  clockSeconds: z.number().finite().min(CLOCK_START),
  credits: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  equipment: z.array(z.string().max(64)).max(64),
  system: z.strictObject({ id: z.string().max(16) }),
  station: z.strictObject({ key: z.string().max(64) }),
});
```

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| Oolite autopilot fly-in (docking computer) | Instant dock + 20 min clock (D-12) | Phase 4 decision | No scripted path code; deferred idea preserved |
| Oolite damage on scrape | Time/position cost + bounce | D-06 | No hull stat; no damage test surface |
| Hand-typed corridor numbers | Build-time measured, drift-checked JSON | This research | Aperture change fails `assets:check` |

**Deprecated/outdated:** the Phase 1 "probe" sim state is separate from flight state; do not extend `src/sim/state.ts` for docking.

## Runtime State Inventory

Not a rename/refactor/migration phase — section omitted. (New persisted state: IndexedDB `wegolite`/`saves`/`autosave`, owned by this phase; `wegolite.settings` in localStorage is unchanged.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Roll tolerance ≈ 35° from "wings along slot" under the AABB-corner model | Aperture Measurement | Feel of "correctly rolled"; compute exactly in a unit test |
| A2 | Bounce restitution ≈ 0.5, speed damping 0.35, impulse τ ≈ 0.6 s, impulse floor 8 m/s | Pattern 3 | Feel only; D-07 gives the shape, CONTEXT delegates constants |
| A3 | Flash 0.4 s, shake 0.35 s, amplitude ≈ 0.6 m | Pattern 4 | Must stay within the 0.3–0.5 s stated range |
| A4 | AABB-corner ship footprint is acceptable vs Oolite's mesh-vertex bbox | Standard Stack | Slightly stricter than Oolite when rolled |
| A5 | Box hull ±500 (authored z −500…495.918, faceplate to ±500) is a good-enough collision shape | Pattern 3 | Edge-case clipping at faceplate; verify visually via probe positions |
| A6 | Save key/DB names (`wegolite`/`saves`/`autosave`) | Persistence | Cosmetic; discretion item |
| A7 | Throttle scrape message to ≥ 1 s of `flightTime` | Pitfall 8 | UX only |
| A8 | Save clock = post-launch clock (+600 s already applied) | Persistence | Resumed clock differs by 10 min from a "pre-launch" interpretation |

## Open Questions (RESOLVED)

> All five were settled by the Phase 4 plan set (revision round 2). The adopted answer is recorded per item so this artifact agrees with the plans it seeds.

1. **TL gate vs Lave (blocks DOCK-05 purchase UX). — RESOLVED: enforce the faithful gate.**
   - Adopted: `canPurchase(profile, item, techLevelRaw)` refuses when `techLevelRaw < item.techLevel`; Lave (raw TL 4) refuses `EQ_DOCK_COMP`, the panel shows the disabled line with "Requires TL 9", and the unit test covers Lave vs a synthetic TL 9 system. The raw value is the session's loaded `System.techLevelRaw` (`src/main.ts:100,149`), not a `SystemLayout` field. The e2e exercises the refusal and uses `grantEquipment("EQ_DOCK_COMP")` / `setCredits(n)` for the Shift+C path. Owned by `04-04-PLAN.md` Task 2/Task 3.
2. **Launch orientation twist (Pitfall 5). — RESOLVED: leave Phase 3 launch untouched and teach the 90-degree roll.** `beginLaunch` keeps `orientation = layout.stationBaseQuat`; `tests/sim/launch.test.ts` is unmodified; `04-03`'s straddle copy ("Too wide for the slot - roll 90 degrees") teaches the correction. Owned by `04-02-PLAN.md` (assumptions, Task 1) and `04-03-PLAN.md` Task 1.
3. **Oolite y-guard bug (DockEntity.m:752). — RESOLVED: symmetric fix with a recorded deviation.** `if (box.max.y < hh && box.min.y > -hh) delta.y = 0`, a code comment citing DockEntity.m:752, and a PROJECT.md Key Decisions row. Owned by `04-02-PLAN.md` Task 2.
4. **Station roll wording in CONTEXT ("0.08 rad/s"). — RESOLVED: it is 0.08 right-angles per second, i.e. 0.1256637 rad/s.** The implementation reads `layout.stationRollRadPerSec`; no `0.08` literal is allowed in `src/sim/dock`. Owned by `04-02-PLAN.md` (prohibitions and acceptance).
5. **Save clock semantics (A8) and which transitions autosave. — RESOLVED: save the post-launch clock (+600 s already applied); launch and a successful purchase autosave; manual or computer docking does not.** Owned by `04-05-PLAN.md` Task 2/Task 3 (and `04-04-PLAN.md` for the purchase seam).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | All tests (AGENTS.md non-negotiable) | ✓ | 29.8.2 | — |
| Docker Compose | `docker compose run --rm test/e2e/verify/assets` | ✓ | 5.6.0 | — |
| Host Node/npm | Not authoritative (do not use for evidence) | not probed | — | Containers |
| Playwright browsers | e2e (IndexedDB reload) | baked in the Playwright image per AGENTS.md; not probed from host | — | — |

**Missing dependencies with no fallback:** none identified.

## Validation Architecture

> `workflow.nyquist_validation: true` [VERIFIED: .planning/config.json].

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (node env, `unit` project) + Playwright 1.64.1 (e2e) [VERIFIED: package.json, vitest.config.ts] |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `docker compose run --rm test` (scope with `npx vitest run tests/sim/dock-*.test.ts` inside the container) |
| Full suite command | `docker compose run --rm verify` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCK-01 | Aperture from emitted JSON equals 103.4123×241.888×250; half-extents 51.706/120.944 for the Cobra; no hand-typed constants | unit + drift | `docker compose run --rm assets npm run assets:check`; `tests/sim/dock-corridor.test.ts` | ❌ Wave 0 |
| DOCK-02 | Port frame follows `stationAngle`; auto-centring pulls a band ship toward origin; replay equal at 60/120/144 Hz | unit (property) | `tests/sim/dock-corridor.test.ts`, `tests/sim/dock-cadence.test.ts` | ❌ Wave 0 |
| DOCK-03 | Off-axis/rolled ship bounces; impulse reflects about face normal; orientation unchanged; straddle bounces | unit | `tests/sim/dock-hull.test.ts` | ❌ Wave 0 |
| DOCK-04 | Capture exactly when `0.9·max.z + 0.1·min.z < 0`; docked pose = `dockMouthPosition`; mode `docked` same tick | unit | `tests/sim/dock-capture.test.ts` | ❌ Wave 0 |
| DOCK-05 | Shift+C chord gating; aegis gate; +1200 s; purchase maths in decicredits; TL refusal | unit | `tests/input/bindings.test.ts` (extend), `tests/sim/dock-computer.test.ts`, `tests/sim/player-profile.test.ts` | ❌ Wave 0 |
| DOCK-06 | No trap state: fuzzed approach poses always end `inFlight` or `docked`; probe exposes shake/flash/message | unit (fast-check, existing dep) + e2e | `tests/sim/dock-no-trap.test.ts`, `tests/e2e/docking.spec.ts` | ❌ Wave 0 |
| DOCK-07 | `parseSave` accept/reject table; autosave on `launched`; Continue restores docked clock; real IDB reload | unit + e2e | `tests/persistence/save.test.ts`, `tests/e2e/autosave.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the new unit file(s) for the touched module in the container.
- **Per wave merge:** `docker compose run --rm test` + `docker compose run --rm typecheck` + `docker compose run --rm lint`.
- **Phase gate:** `docker compose run --rm verify` green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/sim/dock-*.test.ts`, `tests/sim/player-profile.test.ts`, `tests/persistence/save.test.ts`, `tests/e2e/docking.spec.ts`, `tests/e2e/autosave.spec.ts`
- [ ] Shared fixture: Lave layout via `tests/helpers/lave.ts` (exists) + a helper that constructs a ship pose in the **port frame** (so tests state "nose 5 m past plane, rolled 90°" rather than world coordinates)
- [ ] Generated-data golden for `dock-port.json` (pattern: `tests/golden/content/ship-bounds.json`)
- [ ] Extend `?test=1` hook: `setOrientation`, `setStationAngle`, `grantEquipment`, `setCredits` (mutate live state only — existing rule, probe.ts:16-17) and probe field `probe.dock`
- [ ] Guard tests that must stay green: `tests/guards/sim-purity.test.ts` (no Three/DOM in `src/sim/`), `tests/guards/content-boundary.test.ts` (no generated-content import in sim)

**e2e probes (no pixels):** `probe.dock.outcome`, `probe.dock.shake > 0` / `flash > 0` right after a bounce and `== 0` after 0.6 s of `flightTime`, `probe.hud.message` text, `probe.mode`, `probe.clock` delta = 1200 for the computer dock, `probe.position`/`probe.orientation` unchanged in orientation after bounce.

## Security Domain

> `security_enforcement` enabled, ASVS level 1, block on high [VERIFIED: .planning/config.json].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | single-player, no accounts |
| V3 Session Management | no | — |
| V4 Access Control | partial | `?test=1` hook is the only privileged surface; keep it mutating live state only, never saves/arbitrary code (probe.ts:16-17) |
| V5 Input Validation | **yes** | zod strict validation of the IndexedDB blob and `dock-port.json`; `textContent` only in DOM (Pitfall 16); allow-listed action ids |
| V6 Cryptography | no | no secrets; do not invent save "signing" (non-goal) |
| V8 Data Protection | yes (light) | no timestamps/host data in the save; no PII |
| V12 Files/Resources | partial | IDB quota/availability failures caught, never fatal |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered/corrupt save poisons state (NaN clock, negative/huge credits, unknown equipment) | Tampering | `parseSave`: strict schema, finite/integer/range checks, allow-listed equipment keys; reject → no save |
| Future-version save overwritten by older build | Tampering/Repudiation | `version > 1` ⇒ do not write/clear; surface as no-Continue |
| XSS via equipment/system names rendered in docked panel | Elevation | `textContent` only; names come from the catalogue, not the save |
| Prototype pollution via `JSON.parse` of save | Tampering | zod strict object (no passthrough); `Object.create(null)` pattern from settings/schema.ts:97 if building maps |
| `?test=1` hook abused to mutate credits/equipment in production | Elevation | Hook exists only with the query param and mutates live state only — no persistence from the hook (a granted credit must not be written unless the player launches normally; document as test-only) |
| Infinite loop in aperture expansion from zero/NaN geometry | DoS | assert `width > 0 && height > 0 && finite` in `DockGeometry` construction (`assertFinite` pattern, layout.ts:92-104) |
| Save write failure blocks the frame loop | DoS | fire-and-forget Promise with caught rejection |

## Sources

### Primary (HIGH confidence)
- `/home/opencode/git/oolite/src/Core/Entities/DockEntity.m` lines 604-774 (corridor), 804-826 (launch twist), 1039-1058 (port dimensions) — Read this session.
- `/home/opencode/git/oolite/src/Core/Entities/StationEntity.m:703-716` (station delegates to each dock subentity).
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:5701-5745` (scrape damage = shields/sound only) and `ShipEntity.m` ~11060-11135 (generic collision exchange).
- `/home/opencode/git/oolite/Resources/Config/shipdata.plist:1758-1761, 4752-4773` (dock subentity, dock model).
- `/home/opencode/git/oolite/Resources/Scripts/oolite-conditions.js:70-95` (TL purchase gate); `third_party/oolite/Config/equipment.plist:90-96` (`9, 15000, "Docking Computers", "EQ_DOCK_COMP"`).
- `/home/opencode/git/wegolite/third_party/oolite/Models/oolite_coriolis_dock.dat`, `oolite_coriolis.dat`, `oolite_cobra3.dat` (vertex bounds computed this session).
- Repo files read this session: src/sim/world/layout.ts, src/sim/flight/{state,step,launch,speed}.ts, src/sim/{commands,events,loop}.ts, src/sim/world/aegis.ts, src/app/{game-session,mode,hints,probe,boot,hud-model}.ts, src/ui/{docked,title}.ts, src/input/{actions,keyboard}.ts, src/settings/store.ts, src/content/ships.ts, src/render/bodies/station.ts, src/render/hud/messages.ts, tools/oolite-ingest/{generate.ts,convert/dat.ts}, tests/golden/content/ship-bounds.json, tests/sim/layout.test.ts, tests/e2e/launch.spec.ts, index.html, package.json, vitest.config.ts, tsconfig.sim.json, .planning/config.json.
- `gsd-tools query package-legitimacy check` output for `fake-indexeddb`, `idb`.

### Secondary (MEDIUM confidence)
- `.planning/phases/04-manual-docking/04-CONTEXT.md`, `.planning/REQUIREMENTS.md` (DOCK-01..07), `.planning/ROADMAP.md` §Phase 4.

### Tertiary (LOW confidence)
- Tuning constants (restitution, damping, shake/flash amplitude, roll tolerance) — `[ASSUMED]`, see Assumptions Log.

## Project Constraints (from AGENTS.md)

- Everything runs in Docker; a host test run is not evidence. Commands: `docker compose run --rm test | e2e | verify | lint | typecheck | assets`.
- No `npm install` on the host; dependency changes require image rebuild + `docker compose down --volumes` (none planned).
- `src/sim/` is pure TypeScript — no Three.js, no DOM; deterministic 1/120 s fixed timestep; content data is compiled from Oolite configs at build time, never hand-edited.
- No database; IndexedDB only for saves; no server storage.
- GPL-2.0-or-later code; Oolite-derived data stays CC BY-NC-SA 3.0 — the new `dock-port.json` is derived from vendored `.dat`; record provenance in `NOTICE`/`ASSETS.md` (generated data derived from the pinned snapshot).
- Record significant decisions (aperture-from-`.dat`, y-guard deviation, save schema v1) in `.planning/PROJECT.md` Key Decisions.
- Use codebase-memory MCP and `rg` over `grep` when exploring; include Oolite reference path `/home/opencode/git/oolite` in subagent prompts.
- Start file-changing work through a GSD command (this phase: `/gsd-execute-phase`).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; legitimacy gate run on the only candidates.
- Oolite algorithm and aperture numbers: HIGH — source and mesh read this session.
- Architecture (hull/bounce/feedback/persistence): MEDIUM — new design over verified seams; tuning constants assumed.
- Pitfalls: HIGH for items 1, 2, 5, 6, 10; MEDIUM for 7, 8, 9.

**Research date:** 2026-11-04
**Valid until:** 2026-12-04 (stable; re-check only if the Oolite snapshot pin or `layout.ts` changes)
