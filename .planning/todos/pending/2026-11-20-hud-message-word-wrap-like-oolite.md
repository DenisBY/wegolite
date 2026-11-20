---
created: 2026-11-20T12:00:00.000Z
title: Word-wrap HUD messages like Oolite and use its exact witch-blocked string
area: render
severity: minor
files:
  - src/render/hud/format.ts
  - src/render/hud/messages.ts
  - src/render/hud/draw.ts
  - src/app/hud-model.ts
  - src/app/session/hyperspace-controller.ts
  - src/app/session/event-router.ts
  - tests/guards/hud-message-length.test.ts
  - tests/app/session/hyperspace-controller.test.ts
---

## Problem

Oolite never truncates a HUD message. `Universe.m:6403` (`showGUIMessage:`) hands a scrolling message to
`printLongText:` (`GuiDisplayGen.m:736-794`), which word-wraps a line wider than the message area into extra
rows. Wegolite clamps every message to one row of `MAX_MESSAGE_CHARS` (60 since the owner decisions of
2026-11-20, `src/render/hud/format.ts`) with an ellipsis (`clampMessage`, applied in `src/app/hud-model.ts`).

Consequences today:

- The four witch-blocked lines in `refusalCopy` (`src/app/session/hyperspace-controller.ts`) are Wegolite
  wordings ("Witchspace jump aborted: too close to <name>") that fit 55 characters, not Oolite's
  `witch-blocked` string "Witchspace jump aborted (too close to [blockerName])." (`descriptions.plist:503`,
  posted at `PlayerEntity.m:6554` with `[blocker name]`). The NPC ship line says "a ship" instead of the
  ship's name, because a name such as "Sidewinder Scout Ship" would not fit.
- The three messages that were cut with an ellipsis at the old budget of 55 now fit whole at 60, so the
  guard has no known exceptions any more: the docking bounce lines (`bounceMessage`,
  `src/app/session/event-router.ts`) "Too wide for the slot - roll 90 degrees to match the opening" (60) and
  "Hull contact - roll 90 degrees and line up with the slot" (56), and the pitch and roll hint with the
  default bindings (`hintText("pitchRoll")`, `src/app/hints.ts`) "Up arrow / Down arrow pitch, Left arrow /
  Right arrow roll" (58). They remain in `tests/guards/hud-message-length.test.ts` as witnesses the scan
  must still see. A hint with rebound keys can still be longer than 60, since its labels come from the
  player's bindings, and is then cut.

## Fix

1. Port `printLongText:`'s word wrap for the HUD message rows: split a message wider than the message area
   at word boundaries into extra rows, each with the message's fade time, through the existing message
   queue and `drawMessageRows`.
2. Switch the four witch-blocked lines to Oolite's exact string "Witchspace jump aborted (too close to
   [blockerName])." with the blocker's display name, including real NPC ship names in place of "a ship".
3. Drop the ellipsis clamp for messages (`clampMessage` / `MAX_MESSAGE_CHARS` in `hud-model.ts`), and remove
   the witnesses and the length checks in `tests/guards/hud-message-length.test.ts` (the guard is the
   tripwire for this todo: it fails as soon as a message, or a dynamic blocker name, outgrows one row).
4. Update the PROJECT.md rows for WORLD-10 and Phase 18 D-09 and the beacon pin in
   `tests/app/session/hyperspace-controller.test.ts`.

Owner decision 2026-11-20 (option C plus this todo, after plan 18-07): raise the limit to 55 so the beacon
line uses the plan's wording now; the word wrap and Oolite's exact string come later. Owner decision
2026-11-20 (follow-up): raise the limit to 60 so the two docking bounce lines and the default pitch and roll
hint are no longer cut; the message rows then span x 830.4 to 1665.6 of 1920 and overlap nothing new.
