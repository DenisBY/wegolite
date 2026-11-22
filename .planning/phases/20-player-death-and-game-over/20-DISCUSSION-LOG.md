# Phase 20: Player Death and Game Over - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-22
**Phase:** 20-player-death-and-game-over
**Areas discussed:** Death screen, Same-tick death, Where the reload leads, Milestone close-out
**Folded todos:** collision reversal on player death, CI e2e timeout margins, mutual-kill credit (reviewed; no consumer added)

---

## Death screen

| Option | Description | Selected |
|--------|-------------|----------|
| Like Oolite | Aft view set back 100 m, large explosion, B&W fade over 5 s, HUD hidden, sim frozen | ✓ |
| Explosion + overlay | Forward view, explosion, DOM overlay, no fade | |
| Freeze frame + screen | Minimal full-screen Game Over | |

| Option | Description | Selected |
|--------|-------------|----------|
| Oolite's three lines | Game Over / Score / Press Space | |
| Oolite + cause of death | Plus a "Destroyed by ..." line (divergence) | ✓ |
| Game Over + Press Space only | No score line | |

| Option | Description | Selected |
|--------|-------------|----------|
| Space or 30 s | Oolite's kDeadResetTime | |
| Space only | No timer (divergence) | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Damage type + name | "Destroyed by Krait", "Collided with Navigation Buoy" | ✓ |
| Type only | "Killed by laser fire" | |

| Option | Description | Selected |
|--------|-------------|----------|
| Immediately, fresh press | Like Oolite; a held key does not count | ✓ |
| After the 5 s fade | Another divergence | |

| Option | Description | Selected |
|--------|-------------|----------|
| Space only, fixed | Like Oolite; everything else ignored | |
| Space + mouse click | Browser convenience, small divergence | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Close the chart/screen, show the explosion | Like Oolite (VIEW_AFT) | ✓ |
| Overlay over the chart | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Show as is (rating + kills from current state) | "Harmless   (0)" until LAW-* adds a tally | ✓ |
| Credits only | Divergence | |
| Add a kill counter in Phase 20 | Scope expansion: save bump, credit consumer | |

**Notes:** The owner asked which phase would bring the kill counter. Answer: none yet. `ship_kills` was deferred with LAW-01..07 (legal status, police, bounties, combat rating) in the Phase 16 carry-over, for a later milestone.

---

## Same-tick death

| Option | Description | Selected |
|--------|-------------|----------|
| Both die | NPC through the kill path, player dies the same tick | ✓ |
| By update order | Port Oolite's order, costly | |

| Option | Description | Selected |
|--------|-------------|----------|
| The source of the lethal blow | Oolite's getDestroyedBy:whom, the ledger record that reached zero | ✓ |
| The largest damage | Divergence | |

---

## Where the reload leads

| Option | Description | Selected |
|--------|-------------|----------|
| Title with Continue | As in the roadmap; divergence from Oolite's direct load | ✓ |
| Load the save directly | Like Oolite; needs a flag across the reload | |

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing special without a save | The title shows only New game | ✓ |
| A warning on game over | | |

---

## Milestone close-out

| Option | Description | Selected |
|--------|-------------|----------|
| The phase does the docs, the release is separate | Version bump and tag in /gsd-complete-milestone | ✓ |
| Everything in the phase, including the release | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Two specs, as in the roadmap | death-and-reload, game-over-guard; races in Vitest | ✓ |
| One combined spec | | |

---

## Claude's Discretion

- The cause-line wording and the text layout; the B&W fade technique; the `FlightMode "dead"` inventory and save-latch design; the dead-hash scheme.
- Edge ticks taken from the research without asking: no death on the dock tick, no damage on the jump tick, a death cancels the hyperspace countdown, a launching player clamps.

## Deferred Ideas

- Kill tally and combat rating, with LAW-* (later milestone).
- Release: /gsd-complete-milestone.
