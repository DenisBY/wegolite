# Phase 3: Flight in the Lave System - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-03
**Phase:** 3-Flight in the Lave System
**Areas discussed:** Planet & sky visuals, HUD & scanner, Launch experience, Controls & settings

---

## Planet & sky visuals

| Option | Description | Selected |
|--------|-------------|----------|
| Procedural GLSL | One shader reads planetinfo uniforms and generates seeded noise on the GPU; per-system variation with no assets. | ✓ |
| Runtime-baked texture | Generate a DataTexture once per system; easier to debug but costs build time and GPU memory per system. | |
| Stylised banded sphere | Latitude bands and palette colours only; lowest risk but reads as a placeholder. | |

**User's choice:** Procedural GLSL
**Notes:** Lave must use its compiled planetinfo palette and seed, not a generic Earth-like planet.

| Option | Description | Selected |
|--------|-------------|----------|
| Single shader, full treatment | Surface colours, clouds, air rim and terminator in one material and one draw call. | ✓ |
| Separate cloud shell | Additional transparent spheres for clouds and atmosphere; more tuning, more depth/blending risk. | |
| Surface + terminator only | No clouds or atmosphere; safest but visibly barer than Oolite. | |

**User's choice:** Single shader, full treatment
**Notes:** Keep transparency and depth interactions with the station out of Phase 3.

| Option | Description | Selected |
|--------|-------------|----------|
| Oolite-parameterised | Emissive sun plus additive corona from corona_flare/hues/shimmer; starfield sized by sky_n_stars and seeded per system. | ✓ |
| Simple sun + uniform stars | Fixed starfield, no corona; loses the strongest sky cue and ignores compiled data. | |
| Baked skybox per system | Pre-generated skybox; cheap at runtime but adds textures and complicates parallax/twinkle. | |

**User's choice:** Oolite-parameterised
**Notes:** Star tint follows sun_color.

| Option | Description | Selected |
|--------|-------------|----------|
| Buoys + speed dust | Witchpoint beacon, nav buoy and camera-relative dust; dust is the main speed cue under torus. | ✓ |
| Buoys only | Navigation markers without motion feedback. | |
| Minimum required only | Planet, sun, Coriolis and a simple witchpoint marker; fastest but static-feeling. | |

**User's choice:** Buoys + speed dust
**Notes:** Buoys anchor compass/navigation; dust makes 32×–1024× torus legible.

---

## HUD & scanner

| Option | Description | Selected |
|--------|-------------|----------|
| Canvas2D overlay | Transparent 2D canvas above WebGL; natural for vector lines, scanner ellipse, monospace text and DPR control. | ✓ |
| DOM + SVG | HTML/SVG elements; inspectable but risks layout/paint churn on frequent updates. | |
| In-scene WebGL | HUD quads in the 3D scene; no DOM but text and resolution independence are much harder. | |

**User's choice:** Canvas2D overlay
**Notes:** One redraw path per frame.

| Option | Description | Selected |
|--------|-------------|----------|
| Classic green vector | Authentic Oolite placement and styling: crosshair, elliptical scanner with tails, compass, aegis, bars, clock, condition light, message line. | ✓ |
| Functional monochrome | Same information in a cleaner, sparser layout; less recognisable. | |
| Modern restyle | New typography and layout; not faithful. | |

**User's choice:** Classic green vector
**Notes:** Stick to the FLGT-05 subset; no shields/energy/temps/missiles/MFDs.

| Option | Description | Selected |
|--------|-------------|----------|
| Station + buoys | Plot Coriolis, nav buoy and witchpoint beacon within 25.6 km; planets excluded as in Oolite. | ✓ |
| Ships only, empty in v1 | Authentic filter but a blank scanner looks broken. | |
| Station, buoys + planet | Adds Lave when close; planet dominates the display and diverges from Oolite. | |

**User's choice:** Station + buoys
**Notes:** Gives launch and approach meaningful contacts without inventing NPCs.

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed 16:9 design space | Lay out at 1920×1080 and uniformly scale with letterboxed margins. | ✓ |
| Edge-anchored responsive | Reflow bars/readouts to window edges for any aspect ratio; more layout risk. | |
| Fixed pixel sizes | Constant CSS pixels; too small on 4K/Retina. | |

**User's choice:** Fixed 16:9 design space
**Notes:** Preserve classic proportions; ultra-wide gets margins.

---

## Launch experience

| Option | Description | Selected |
|--------|-------------|----------|
| Docked, launch prompt | Title/start, then docked at Lave's Coriolis with a minimal station panel and Launch action. | ✓ |
| Straight into flight | Spawn outside the station; skips the docked state and makes launch/+10 min artificial. | |
| Title → scripted launch | Start button plays launch immediately with no docked interaction. | |

**User's choice:** Docked, launch prompt
**Notes:** Matches Oolite and gives FLGT-01 a real trigger.

| Option | Description | Selected |
|--------|-------------|----------|
| Short scripted exit, skippable | ~2 seconds of break pattern/tunnel, station-roll exit, then control; any key skips after first view. | ✓ |
| Instant handover | Cut straight to flight; simplest but loses the Coriolis departure moment. | |
| Extended cinematic | Longer tunnel/station flyby; impressive once but slows every new game. | |

**User's choice:** Short scripted exit, skippable
**Notes:** Apply +10 minutes and launchRoll = -station roll exactly once.

| Option | Description | Selected |
|--------|-------------|----------|
| Message-line prompts | Contextual HUD hints for launch, torus and speed, dismissed after first use. | ✓ |
| One-time controls overlay | Dismissible full binding list; clear but un-Oolite and duplicates settings. | |
| No in-game guidance | README/settings only; most authentic but first-time players may get stuck. | |

**User's choice:** Message-line prompts
**Notes:** Keep guidance inside the existing message line.

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal status + Launch | Single docked panel with system, credits, ship, fuel and Launch. | ✓ |
| Read-only station stubs | Status/market/equipment tabs without transactions; risks Phase 5 scope. | |
| Launch prompt only | Just "Press 1 to launch"; no ship/credit context. | |

**User's choice:** Minimal status + Launch
**Notes:** No trade or outfitting until Phase 5.

---

## Controls & settings

| Option | Description | Selected |
|--------|-------------|----------|
| All implemented actions | Rebind every Phase 3 action through one semantic map, with conflict detection and reset. | ✓ |
| Flight-critical only | Rebind pitch/roll/speed/torus only; launch/pause stay fixed. | |
| Full future action set | Pre-bind docking/hyperspace/trade/view actions that Phase 3 cannot exercise. | |

**User's choice:** All implemented actions
**Notes:** No untestable future bindings.

| Option | Description | Selected |
|--------|-------------|----------|
| localStorage | One versioned JSON blob for bindings and preferences; synchronous and simple. | ✓ |
| IndexedDB | Same store as future saves; async startup for small preferences. | |
| Session only | In-memory; fails FLGT-06 persistence. | |

**User's choice:** localStorage
**Notes:** IndexedDB remains reserved for game saves.

| Option | Description | Selected |
|--------|-------------|----------|
| Pause overlay | Resume/Controls/Settings in one overlay, reachable docked and in flight, freezes simulation. | ✓ |
| Docked only | Settings only at the station; cannot fix bindings mid-flight. | |
| Title screen only | Configure before starting; inaccessible during play. | |

**User's choice:** Pause overlay
**Notes:** Single home for rebinding and preferences.

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-pause + clear input | Pause and release held keys on blur and visibilitychange. | ✓ |
| Clear input only | Release keys but keep simulating; clock drifts while away. | |
| Tab hide only | Pause on hidden tab but not simple blur; still clear input. | |

**User's choice:** Auto-pause + clear input
**Notes:** Matches Oolite focus-loss behaviour and prevents stuck keys.

---

## the agent's Discretion

- Planet noise function, octaves, tessellation, and exact palette values within the captured parameters.
- HUD palette, font, line weights, scanner projection maths.
- Dust count, size, lifetime, reseeding.
- Corona shape/falloff and additive blending.
- Launch animation easing within the ~2 second skippable window.
- Default bindings, conflict-resolution UX and capture flow.
- Torus feedback text/visuals using the researched formula.
- Module layout within existing layers.
- Test mechanics for disposal and WebGL2 fallback.

## Deferred Ideas

- Docking mechanics (Phase 4).
- Trading, outfitting, market screens, economy (Phase 5).
- Hyperspace and galaxy chart (Phase 6).
- Combat, NPC traffic, missions (not in v1).
- External/aft views, mouse flight, planet landing, mid-flight saves (beyond v1).
- Scanner zoom and full-Oolite HUD elements (post-v1).
- Baked planet textures, KTX2, additional ship GLBs (later asset/performance work).
- Read-only/interactive station screens beyond minimal docked status.
