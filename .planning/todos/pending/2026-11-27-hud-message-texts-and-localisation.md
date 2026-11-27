---
created: 2026-11-27T11:00:00.000Z
title: Review the flight HUD message texts against Oolite, with the localisation work
area: ui
severity: low
files:
  - src/app/session/event-router.ts
  - src/app/session/hyperspace-controller.ts
  - FIDELITY.md
---

## Problem

Several flight HUD messages are Wegolite's own wording, while Oolite has texts for the same events in
`Resources/Config/descriptions.plist` (found by the 2026-11-26 Phase 22 audit). Examples:

| Event | Wegolite today | Oolite |
|---|---|---|
| Docking computer engaged | `Docking computers engaged` | `autopilot-on`: "Autopilot engaged." |
| Countdown cancelled | `Hyperspace countdown cancelled` | `witch-user-abort`: "Witchspace jump aborted." |
| Countdown started | Wegolite text | `witch-to-x-in-y-seconds`: "Witchspace to [destination] in [seconds] s." |
| Too far | `refusalCopy("too far")` | `witch-too-far`: "Engines incapable of witchspace jump to designated destination." |
| Mass lock | `Hyperspeed mass-locked.` | `jump-mass-locked`: same text |

Also `Arrived at X`, `Launching — stand by`, `Torus engaged at N×`, `Torus disengaged`, `No docking computer fitted`,
`Compass target: X`, the scrape hint: check what, if anything, Oolite shows for each (`PlayerEntity*.m`).

## Owner direction (2026-11-27)

- Not now: do it as its own task or phase together with localisation; do not dwell on it before Phase 23.
- Lowering the barrier for new players matters: a text may differ from Oolite when it is clearer or more modern.
  Oolite's text is the default; each divergence gets a FIDELITY.md row (one grouped row for the message line is
  fine if it lists every text).
- Keep "Hyperspace" where Oolite says "Witchspace" (Wegolite's UI says Hyperspace throughout).
- Name the device "Docking computer(s)", as F3 sells it (`EQ_DOCK_COMP`), not Oolite's "Autopilot".

## Solution

When the localisation work is planned, move every message text into one table (key, text), decide each text by the
rules above, show the owner the per-message table first, and update the unit tests and specs that assert texts.
