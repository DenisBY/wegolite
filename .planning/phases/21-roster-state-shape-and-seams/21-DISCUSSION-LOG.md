# Phase 21: Roster, State Shape and Seams - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-11-25
**Phase:** 21-roster-state-shape-and-seams
**Areas discussed:** Debris velocity, Hash re-pin authority, Draw-call budget, Model loading

---

## Debris velocity

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with the explosions (recommended) | Debris and pods inherit ship velocity; one re-pin with the pod fields; explosion drift (render-only) fixed in the same change | ✓ |
| Yes, debris only | Hashed part only; explosion drift stays a todo | |
| No, defer | Stays in backlog; a second re-pin later; Phase 24 scoops static pods | |

**User's choice:** Yes, with the explosions.

---

## Hash re-pin authority

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, all of v2.4 (recommended) | Phase 18 conditions (measured, intended cause; Node = browser); thresholds, epoch pin and unexplained moves still go to the owner | ✓ |
| Phase 21 only | Later phases ask again | |
| No, ask each time | Checkpoint before every re-pin | |

**User's choice:** Yes, for all of v2.4.

---

## Draw-call budget

| Option | Description | Selected |
|--------|-------------|----------|
| Stop and ask (recommended) | Bring the numbers; the owner sets the budget | |
| Pre-approve up to ~80 | Raise without asking if the frame rate holds on the remote GPU; record it in Key Decisions | ✓ |
| Do not touch the budget | LOD or culling instead; never lower traffic | |

**User's choice:** Pre-approve a raise up to about 80.

Follow-up, frame-rate criterion:

| Option | Description | Selected |
|--------|-------------|----------|
| p95 frame ≤ 16.7 ms (recommended) | During the anarchy fight; a one-off number, not QUAL-01 | ✓ |
| Mean FPS ≥ 55 | Softer | |
| You decide | | |

---

## Model loading

| Option | Description | Selected |
|--------|-------------|----------|
| Background after start (recommended) | Prefetch on the menu or while docked; the ship draws when its model arrives; the sim is independent of loading | ✓ |
| On demand | Load at first appearance; possible delay | |
| You decide | | |

**User's choice:** Background prefetch after start.

## Claude's Discretion

- The comms-string subset, the field bounds in `limits.ts`, the plan split, and whether the hit-reaction stage takes the `shipHit` skip todo.

## Deferred Ideas

None.
