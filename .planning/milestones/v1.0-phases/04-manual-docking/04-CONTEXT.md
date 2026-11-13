# Phase 4: Manual Docking - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Phase Boundary

The player can fly a Cobra into the visible Coriolis opening by hand and dock, or fail and recover. Delivered in this phase:

- A docking corridor derived from the actual dock mesh and the ship's bounding box (not a trigger sphere), matching the visible aperture.
- Station-roll tolerance through x/y auto-centring, with scrape feedback while the player is being pulled in.
- 90 % past-plane capture into a clean `docked` mode.
- Elastic bounce, scrape message, camera shake and HUD flash on a failed approach; no damage stat, no trap states.
- A docking computer bought from a single line in the docked panel, and instant docking on `Shift+C` inside the station aegis with +20 minutes of clock.
- An IndexedDB autosave written on launch, restored through Continue / New game on the title screen.

Not in this phase: trade, market, the outfitting screen, flight-state persistence, save migrations, the F2 save screen, damage/energy/shields, sound, NPC traffic, missions, OXPs.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/ROADMAP.md` §Phase 4 (lines 142–153) — goal, DOCK-01..07 mapping, the five success criteria and the "measure the dock mesh" research flag.
- `.planning/REQUIREMENTS.md` — DOCK-01..07 verbatim; note that shields, energy banks and combat are out of scope for v1.
- `.planning/PROJECT.md` §Key Decisions — manual docking with a buyable computer; no screenshot evidence, probe assertions only; SwiftShader cadence accepted as a known issue.

### Prior phase context
- `.planning/phases/03-flight-in-the-lave-system/03-CONTEXT.md` — D-01..D-15, including the minimal docked panel (D-09), the scripted launch (D-10), the message-line-only teaching (D-11) and the localStorage-vs-IndexedDB split (D-12).
- `.planning/phases/03-flight-in-the-lave-system/03-VERIFICATION.md` — what the flight phase already proves about pose, mode and probes.

### Oolite behaviour (read-only checkout)
- `/home/opencode/git/oolite/src/Core/Entities/DockEntity.m` — `shipIsInDockingCorridor:` (~line 604): aperture expansion, in-lane test, 50 % safety band, scrape correction, 90 % capture; `pullInShipIfPermitted:`; `launchShip:`.
- `/home/opencode/git/oolite/Resources/Config/shipdata.plist` — `oolite_coriolis_dock` subentity definition.

### Content and assets
- `src/content/generated/equipment.json` — `EQ_DOCK_COMP`: 15 000 decicredits (1 500.0 Cr), tech level 9.
- `src/content/generated/ships.json` — `coriolis-station`: `station_roll = 0.08`, `rotating: true`, and the `is_dock` subentity position that `dockOffset` comes from.
- `third_party/oolite/` — the licence-audited vendored input, including the station model used for the aperture measurement.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sim/world/layout.ts` — `SystemLayout` already exposes `stationBaseQuat`, `stationToPlanet`, `stationRollRadPerSec`, `dockOffset`, `scannerRange` and `stationAegisRange`; the corridor frame is derivable without new world data.
- `src/sim/flight/state.ts` — `FlightMode` and `dockMouthPosition(layout)` already define the docked pose; `serializeFlight`/`hashFlight` give a canonical text encoding to extend for the save.
- `src/app/mode.ts` — `advanceMode` is the single place to add `dock`/`undock` transitions instead of mutating `mode` ad hoc.
- `src/ui/docked.ts` — the docked panel already binds `[data-field]` and `[data-action]` with `textContent`; the purchase line extends the same panel.
- `src/input/actions.ts` — add a `dockingComputer` action to the existing semantic action map and defaults.
- `src/content/ships.ts` — `playerShip()` and `stationShip()` give the catalogue entries needed for bbox and dock measurement.
- `src/sim/flight/launch.ts` — the launch sequence is the natural hook for writing the autosave.

### Established Patterns
- `src/sim/` is pure TypeScript: no Three.js, no DOM, deterministic, fixed 1/120 s step. Docking geometry and capture belong there; feedback and UI stay downstream through events/probes.
- No screenshot or pixel-diff assertions; e2e asserts `window.__wegolite` probes and console errors.
- State mutations go through typed transitions, and every numeric field is `assertFinite`-guarded in the layout.
- Text reaches the DOM only through `textContent` (Pitfall 16).

### Integration Points
- `src/app/game-session.ts` — owns the docked/in-flight screen switch, the HUD canvas visibility and the docked panel lifecycle; the restore path and the Shift+C transition both land here.
- `src/render/bodies/station.ts` — holds the dock node and its transform; the aperture measurement reads from the same model.
- `src/app/hints.ts` — message-line hints, the channel for scrape and "too far" feedback.
- `src/settings/store.ts` — the existing versioned-JSON storage pattern to mirror for the IndexedDB save (separate store, separate key).
- No IndexedDB code exists yet anywhere in `src/`; this phase introduces the first one.

</code_context>

<specifics>
## Specific Ideas

- Corridor capture is Oolite's weighted plane test: `0.90 · max.z + 0.10 · min.z < 0`.
- Aperture expansion is `while (ship bbox width > ww · 0.90) ww *= 1.25`, and the same for height; then `ww *= 0.5; hh *= 0.5`.
- Safety band is `1.5 ×` the aperture; correction factor is `-min.z / (max.z - min.z)`.
- Station aegis is 51 200 units (2 × the 25 600 scanner range) — reuse the existing constant, do not invent a new radius.
- Docking computer: 15 000 decicredits = 1 500.0 Cr, TL 9, from `equipment.json`.
- New game starts at 100.0 Cr (1 000 decicredits) and 7.0 LY of fuel; the computer is deliberately unaffordable until trade exists.
- Clock advances by exactly 20 minutes on a computer dock, and by exactly 10 minutes on launch (Phase 3 D-10).
- The station rotates at 0.08 rad/s about its local Z; the corridor frame must follow it, which is what makes auto-centring necessary.
- Coriolis dock mesh sits 0.2561 m outside the hull and is a separate node — do not derive the aperture from the hull box.

</specifics>

<deferred>
## Deferred Ideas

- Outfitting screen with real equipment browsing and installation — Phase 5; the Phase 4 single purchase line is replaced there.
- Trading, market prices and cargo — Phase 5.
- Full flight-state persistence, market persistence, save migrations and the F2 save screen — Phase 6 (D-15).
- Damage, energy banks, shields, destruction and respawn — v2 combat model; Phase 4 deliberately has no damage stat.
- Oolite-faithful docking-computer autopilot fly-in instead of instant docking — rejected for DOCK-05 in this phase; may return as an option later.
- Sound and music for scrape/impact feedback — out of scope for v1.
- NPC traffic and docking queues — out of scope for v1.

</deferred>

---

*Phase: 04-Manual Docking*
*Context gathered: 2026-11-04*
