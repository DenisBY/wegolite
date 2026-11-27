---
created: 2026-11-27T10:00:00.000Z
title: Record the inert Galactic Hyperdrive and Advanced Navigational Array in FIDELITY with a tripwire
area: equipment
severity: low
files:
  - FIDELITY.md
  - src/content/generated/equipment.json
---

## Problem

F3 sells the Galactic Hyperdrive (5,000 credits) and the Advanced Navigational Array, but neither does anything:
Wegolite has no galactic jump and no route planner that uses the array. Owner decision 2026-11-27 (ROADMAP D15):
keep both on sale, since nobody plays the alpha and keeping them saves re-adding them later. The fidelity rule
needs the divergence recorded.

## Solution

Add a FIDELITY.md row: both items are sold and fitted as in Oolite but have no effect until the galactic jump and
the array's route display exist. Add a tripwire guard test that fails as soon as code starts consuming
`EQ_GAL_DRIVE` or `EQ_ADVANCED_NAVIGATIONAL_ARRAY` (for example a galactic-jump command), so the row is
revisited then. A quick task.
