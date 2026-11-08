# Phase 4: Manual Docking - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-04
**Phase:** 04-Manual Docking
**Areas discussed:** Docking tolerance, Cost of error, Docking computer, Autosave on start, Approach speed

---

## Docking tolerance

| Option | Description | Selected |
|--------|-------------|----------|
| Port the Oolite rule | The corridor is derived from the dock node mesh, then widened to the ship's bbox in the same ×1.25 steps up to 90 % fit. Matches the original, but requires measuring the mesh (research flag in ROADMAP). | ✓ |
| Fixed opening + tolerance | One fixed rectangle over the visible opening with a manual margin. Simpler to test, but a large or offset ship behaves differently than in Oolite. | |
| Forgiving mode | Noticeably larger than the visible opening and a huge safety zone: docking almost always succeeds. Friendly, but further from the original. | |

**User's choice:** Port the Oolite rule
**Notes:** Relies on `shipIsInDockingCorridor:` — widening the opening in ×1.25 steps, a test inside the corridor, a 50 % safety band, capture at 90 %.

---

## Roll

| Option | Description | Selected |
|--------|-------------|----------|
| As in Oolite: bbox only | No separate roll threshold: the bbox in the opening's coordinate system decides. Roll is penalised only by the ship becoming wider and fitting worse. | ✓ |
| Explicit roll tolerance | Explicit check of ±25–30° from the slot's vertical: at greater roll, an "align roll" message and scrape/bounce. Clearer to a newcomer, but it is an added rule. | |
| Ignore roll | Roll is not considered in the corridor geometry at all. Maximally simple, but matches neither Oolite nor the geometry of the opening. | |

**User's choice:** As in Oolite: bbox only
**Notes:** The model has no separate roll angle; the slot is almost square, so roll has a mild effect.

---

## Auto-alignment

| Option | Description | Selected |
|--------|-------------|----------|
| As in Oolite: correction + scrape | Continuous proportional x/y correction inside the 50 % band + scrape on every tick + capture at 90 %. | ✓ |
| Magnetic alignment without damage | In the last metres the ship is smoothly pulled toward the centre without damage; scrape only at the edge. | |
| Final snap only | Correction only in the last frame; before that, hard opening boundaries. | |

**User's choice:** As in Oolite: correction + scrape
**Notes:** It is precisely this alignment that explains why docking is possible while the station is rotating.

---

## Cost of error

| Option | Description | Selected |
|--------|-------------|----------|
| Bounce + feedback, no damage | Elastic bounce off the hull/edge of the opening + scrape flash and a message. The risk is lost time and position; no invented stats. Damage will come in v2 together with energy. | ✓ |
| Hull integrity + destruction | An integrity counter only for collisions; at zero — "ship destroyed" and loading the autosave. Gives real risk, but it is a mechanic that does not exist in Oolite without energy. | |
| Cosmetics only | Flash/shake and a message without a physical bounce. Contradicts "real feedback". | |

**User's choice:** Bounce + feedback, no damage
**Notes:** No integrity counter; risk is expressed through time and position.

---

## Bounce physics

| Option | Description | Selected |
|--------|-------------|----------|
| Elastic bounce with damping | Velocity is reflected from the normal with energy loss, orientation is kept, control returns immediately. | ✓ |
| Hard stop | Velocity is zeroed, the ship is pushed out along the normal. Predictable, but feels like sticking. | |
| Return to the approach point | Teleport to the corridor entry point with zero velocity. Safe, but breaks the sense of flight. | |

**User's choice:** Elastic bounce with damping
**Notes:** —

---

## Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Message + shake + flash | Message line + a short camera shake + a red flash of the HUD frame for 0.3–0.5 s. Cheap, no new assets, readable in the probe. | ✓ |
| Message only | Text only in the message line, like the other D-11 hints. Easy to miss in the heat of an approach. | |
| Message + sparks | Spark/particle effect at the contact point — a new particle system and extra load on the fill-bound scene. | |

**User's choice:** Message + shake + flash
**Notes:** Sound is not used in v1.

---

## Buying the docking computer

Constraint found during discussion: starting credits 100.0 Cr, price 1500.0 Cr, no income before phase 5.

| Option | Description | Selected |
|--------|-------------|----------|
| Mini-purchase in the docked panel | A single line "Docking Computers — 1500.0 Cr" with a check of TL 9, credits and deduction; in e2e the credits are granted through the existing probe/dev-seam. The default product stays at 100 Cr. | ✓ |
| Full purchase in phase 5 | In phase 4 only the behaviour and the equipment flag; DOCK-05 is not closed in its own phase. | |
| Mini-outfitting now | A full outfitting screen — phase 5 scope and duplicated work. | |

**User's choice:** Mini-purchase in the docked panel
**Notes:** Phase 5 will replace the line with the outfitting screen.

---

## Shift+C conditions

| Option | Description | Selected |
|--------|-------------|----------|
| From any point, instantly | Pressing from any point in the system: immediately docked + 20 minutes. Exactly as in DOCK-05. | |
| Only within the station zone | Works only inside the station's aegis (51 200); otherwise a "too far" message. | ✓ |
| Requires visibility/heading | Requires the absence of torus/mass-lock and an approximate heading toward the station. | |

**User's choice:** Only within the station zone
**Notes:** Uses the existing `stationAegisRange = 51 200` (2 × scanner range).

---

## Transition on Shift+C

| Option | Description | Selected |
|--------|-------------|----------|
| Instant, no animation | In the same tick: mode → docked, panel, clock +20 minutes, message. Easy to verify in e2e. | ✓ |
| Instant + fade | A 0.3 s fade overlaid to cut the frame splice. | |
| Scripted approach | A short ~2 s approach (mirror of launch), skippable with a key. Contradicts "instantly". | |

**User's choice:** Instant, no animation
**Notes:** —

---

## Approach speed

| Option | Description | Selected |
|--------|-------------|----------|
| As in Oolite: speed does not matter | Speed in the corridor is not checked: only geometry decides. A fast, steady approach docks. | ✓ |
| 0.5 max speed threshold | Above 175 u/s — bounce with scrape feedback and a "Too fast to dock" message. | |
| Do not capture at speed | The ship passes through the opening until it sheds speed. | |

**User's choice:** As in Oolite: speed does not matter
**Notes:** "Too fast" from criterion 3 is interpreted as "did not manage to align".

---

## Autosave scope

| Option | Description | Selected |
|--------|-------------|----------|
| Autosave + restore | Write to IndexedDB on start and restore the docked state on page load. DOCK-07 is genuinely verified in this phase. | ✓ |
| Write only | We write the save but do not read it until phase 6. "Resumable" remains unverified. | |
| Defer to phase 6 | The requirement is not closed in its own phase; ROADMAP must be edited. | |

**User's choice:** Autosave + restore
**Notes:** Phase 6 adds flight, market, migrations and F2.

---

## What goes into the save

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal player state | Schema version, mode, clock, credits, equipment, system/station. Pose is derived from the layout. | ✓ |
| Full FlightState snapshot | The entire FlightState; phase 6 will get more ready-made, but right now it is dead weight. | |
| Full snapshot, docked restore | Full FlightState, but only the docked part is restored. | |

**User's choice:** Minimal player state
**Notes:** No saved float quaternions.

---

## Loading: save or new game

| Option | Description | Selected |
|--------|-------------|----------|
| Continue / New game on the title screen | When a save exists, the title screen offers Continue and New game; Continue restores docked, New game erases the save. | ✓ |
| Silent auto-restore | The game silently loads the save; there is no new game until phase 6. | |
| Always a new game | Restoration only through an explicit mechanism in phase 6. | |

**User's choice:** Continue / New game on the title screen
**Notes:** Extends phase 3 D-09, does not replace it.

---

## the agent's Discretion

- The method of measuring the opening from `coriolis.glb` (ROADMAP research flag) and the tolerance for numerical noise at the plane.
- The bounce restitution coefficient, the shake amplitude and the flash timing within 0.3–0.5 s.
- The save key name, internal validation, and handling of a corrupted/future save.
- The place of the new `dockingComputer` action in the control list.

## Deferred Ideas

- Outfitting screen and trading — phase 5.
- Full flight persistence, market, migrations, F2 — phase 6.
- Damage, energy, shields, destruction — model v2.
- Autopilot docking-computer approach as in Oolite — instead of instant docking, perhaps later.
- Scrape/impact sound — out of v1.
- NPC traffic and docking queues — out of v1.
