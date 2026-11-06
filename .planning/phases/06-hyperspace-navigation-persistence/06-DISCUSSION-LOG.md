# Phase 6: Hyperspace, Navigation & Persistence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-06
**Phase:** 6-Hyperspace, Navigation & Persistence
**Areas discussed:** Chart screen & target UX, Jump countdown & arrival, Save v2 & market persistence, F2 save/load UX

---

## Chart screen & target UX

### Where does F6 open the chart, and what happens to flight?

| Option | Description | Selected |
|--------|-------------|----------|
| Everywhere, flight pauses | F6 works in flight and docked; flight simulation is suspended while the chart is open. | ✓ |
| Everywhere, flight continues | Chart is an overlay but the ship keeps flying underneath. | |
| Station only | Target selection only while docked. | |
| Flight only | Chart only after launch. | |

**User's choice:** Everywhere, flight pauses.
**Notes:** Matches Oolite's chart access and avoids collisions while the player is reading the chart.

### How does the player move the chart selection and switch range?

| Option | Description | Selected |
|--------|-------------|----------|
| Arrows + Tab | Directional nearest-system selection, Tab toggles short/long. | |
| Arrows + F6 | F6 also toggles range. | |
| Free cursor | Arrows pan a cursor; Enter picks the nearest system. | |
| Mouse + keyboard | Click selects, arrows also work, Tab toggles range. | ✓ |

**User's choice:** Mouse + keyboard.
**Notes:** Desktop-first; the chart remains fully keyboard-operable.

### When is an unreachable target blocked?

| Option | Description | Selected |
|--------|-------------|----------|
| Selection allowed, jump refused | Any system can be targeted; jump refuses with `too far` or `insufficient fuel`. | ✓ |
| Refuse at selection | Unreachable systems cannot be committed as a target. | |
| 7 LY allowed, fuel checked later | Distance gates selection, fuel gates the jump. | |
| Fuel-only gating | Only fuel blocks selection. | |

**User's choice:** Selection allowed, jump refused.
**Notes:** Oolite-like; gives the player distance and fuel information before refusing the jump.

### What is drawn on the chart?

| Option | Description | Selected |
|--------|-------------|----------|
| All pairs + radius | All <= 7 LY edges, fuel circle, current-to-target line. | ✓ |
| Current system only | Only edges from the current system. | |
| All pairs, no radius | Full graph but no fuel circle. | |
| All pairs + automatic route | Full graph plus route search. | |

**User's choice:** All pairs + radius.
**Notes:** Route planning is Advanced Navigational Array functionality and stays deferred.

---

## Jump countdown & arrival

### Where does the countdown live and what aborts it?

| Option | Description | Selected |
|--------|-------------|----------|
| In the simulation, H again | Fixed-step sim state; a second H press aborts; abort is free. | ✓ |
| In the simulation, any input | Any flight input aborts. | |
| App-owned timer, H again | Countdown outside the simulation. | |
| Dedicated abort key | Only Esc or a dedicated key cancels. | |

**User's choice:** In the simulation, H again.
**Notes:** Keeps determinism and matches Oolite's countdown status.

### Can the player control the ship during the countdown?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, controls live | Pitch/roll/speed/torus stay live; only H cancels. | ✓ |
| Yes, but input aborts | Any control input cancels the jump. | |
| Full control lock | Ship flies straight until the jump or cancel. | |
| Speed/torus locked | Steering allowed, speed changes blocked. | |

**User's choice:** Yes, controls live.
**Notes:** Oolite does not freeze the ship during STATUS_WITCHSPACE_COUNTDOWN.

### When is fuel spent and the clock advanced?

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic on completion | Revalidate, deduct exact cost, advance clock, then change system. | ✓ |
| Reserve at start | Deduct at countdown start and refund on cancel. | |
| Spend at start | Deduct immediately and never refund. | |
| Per tick | Deduct proportionally over the countdown. | |

**User's choice:** Atomic on completion.
**Notes:** Cancellation must be free; the formula deducts exactly once.

### How does the ship arrive, and when is the arrival autosave taken?

| Option | Description | Selected |
|--------|-------------|----------|
| Oolite-like deterministic | Scanner-range offset from the witchpoint via a stable hash, tiny tilt, speed 50; build scene then autosave. | ✓ |
| Exact witchpoint, 50 m/s | Origin position, facing planet, speed 50. | |
| Exact witchpoint, 0 m/s | Origin position, facing planet, stopped. | |
| Exact Oolite randomness | Random offset and orientation through a PRNG. | |

**User's choice:** Oolite-like deterministic.
**Notes:** The user asked how Oolite does it first. Verified: random scanner-range offset, near-identity orientation, speed `min(maxFlightSpeed, 50)`, no arrival autosave. The deterministic derivation and arrival autosave are deliberate deviations.

---

## Save v2 & market persistence

### Which markets are stored in v2?

| Option | Description | Selected |
|--------|-------------|----------|
| All visited systems | Map of every visited system's goods snapshot. | Initially selected, then superseded |
| Current system only | One snapshot for the system the player is in, replaced on every jump. | ✓ |
| Current plus last N | Bounded recent-history cache. | |
| Seed only, no stock | Regenerate goods from seeds. | |

**User's choice:** Current system only, after a follow-up question about repeat arrivals.
**Notes:** The owner interpreted SAVE-02's "per-system market snapshots" as the snapshot belonging to the current system. Each arrival generates a fresh market and replaces the snapshot, matching Oolite and keeping the save bounded.

### How should SAVE-03 restore an in-flight save and when is the launch autosave taken?

| Option | Description | Selected |
|--------|-------------|----------|
| Full state, save after exit | Persist mode/pose/speed/rates/torus/clock/system; autosave after the two-second launch exit. | ✓ |
| Full state, save at start | Autosave at `launched`, restoring the launch cinematic. | |
| Full state, normalise | Autosave at `launched` but store an in-flight pose. | |
| Docked only | Only save while docked. | |

**User's choice:** Full state, save after exit.
**Notes:** Oolite cannot save in flight; this is a deliberate extension required by SAVE-03.

### Should v2 persist the jump target?

| Option | Description | Selected |
|--------|-------------|----------|
| Target yes, countdown no | Persist target system id; never persist an active countdown. | ✓ |
| Do not persist | Reset to unknown after load, like Oolite. | |
| Target and countdown | Persist both. | |
| Target only when docked | Conditional target persistence. | |

**User's choice:** Target yes, countdown no.
**Notes:** F5 already has a "Hyperspace System" line; keeping it consistent after reload is a local improvement over Oolite.

### What happens to the market on a repeat arrival?

| Option | Description | Selected |
|--------|-------------|----------|
| Kept forever | First-visit seed and snapshot persist across revisits. | |
| Regenerated every jump | Fresh market on every arrival, like Oolite. | Implemented via current-only |
| Kept only for the session | Stable until page reload. | |
| Current only | Snapshot belongs to the current system and is replaced on arrival. | ✓ |

**User's choice:** Current only.
**Notes:** This resolved the conflict with PROJECT.md D-18/ROADMAP "freshly generated market on arrival": repeat visits re-roll, but a reload of the current system never does.

---

## F2 save/load UX

### Where does F2 lead and how does manual saving relate to autosave?

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone screen, one slot | Full-screen Save/Load while docked; Save writes the autosave key after confirmation. | ✓ |
| Station computer section | Save/Load as another station-computer panel. | |
| Separate manual slot | New `manual` IndexedDB key beside `autosave`. | |
| Named slots | Multiple commander files. | |

**User's choice:** Standalone screen, one slot.
**Notes:** Matches the requirement that F2 works while docked without expanding storage.

### What does Load do?

| Option | Description | Selected |
|--------|-------------|----------|
| In-session, no reload | Validate, rebuild scene/state in place and continue. | ✓ |
| Page reload | Set a flag and reload into Continue. | |
| Continue button only | Tell the player to reload and use the title. | |
| In-session docked only | Only docked saves load in place. | |

**User's choice:** In-session, no reload.
**Notes:** Reuses `restoreFromSave` and `SceneManager.enterSystem`; failed loads must not disturb the live session.

### Is F2 available in flight?

| Option | Description | Selected |
|--------|-------------|----------|
| Station only | F2 opens Save/Load only while docked. | ✓ |
| Everywhere, Save disabled | Load available in flight, Save disabled. | |
| Everywhere, including Save | Save anywhere. | |
| Only through pause | F2 routes through the pause overlay in flight. | |

**User's choice:** Station only.
**Notes:** Exactly matches SAVE-05. In-flight recovery after a real reload still goes through Continue.

---

## the agent's Discretion

- Chart colours, marker shapes, label placement and short-range zoom factor.
- Deterministic hash-to-offset mapping and jitter magnitude.
- Exact v2 field names and nesting.
- Save-size bound (65,536 proposed) and F2 markup.
- How the chart suspends the simulation without showing the pause overlay.

## Deferred Ideas

- Advanced Navigational Array route plotting and chart filters.
- Galactic Hyperdrive and the 8-galaxy ring.
- Oolite-style random witchpoint jitter.
- Persisting an active countdown / save-anywhere.
- Multiple named save slots and save export/import.
