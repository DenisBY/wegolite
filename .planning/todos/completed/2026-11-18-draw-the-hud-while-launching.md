---
created: 2026-11-18T15:00:00.000Z
title: Decide whether to draw the flight HUD while launching, as Oolite does
area: render
severity: low
files:
  - src/app/session/render-driver.ts
  - src/app/hud-model.ts
---

## Problem

Oolite renders its HUD while launching: `Universe.m:4718-4732` (at 7437f22) skips the HUD only in the dead, escape
and start-game states. `HeadUpDisplay.m:1494` and `:2756` hide only the compass and the ASC targets while the status
is `STATUS_LAUNCHING`, and the launch holds the roll at 0 (`PlayerEntity.m:6470`, "don't spin when showing the break
pattern"). Wegolite hides the flight HUD until handover (quick 261118-l26), and its launch rolls the hull with the
station (D-10, PROJECT.md "Launch roll is expressed in the station's world basis"), so showing the HUD as it is today
would show a roll bar and a compass blip that Oolite does not.

## Solution

An owner decision: whether to show the HUD during the launch view and, if so, how the roll bar reads (zero, as Oolite
shows it, or the station-rate roll Wegolite applies) and whether the compass and ASC targets are hidden while
launching, as in Oolite.

## Resolution

Owner decision 2026-11-18, implemented by quick 261118-spu:

- OD-1: the flight HUD is drawn through the launch pre-roll and the 2 s launch (scanner, bars, message rows,
  condition light, aegis strip, clock lines); the page overlay's version and system lines stay hidden.
- OD-2: the compass draws its ring and ticks but no target blip while launching and in the pre-roll
  (`HeadUpDisplay.m:1494`); Wegolite draws no ASC target line, so nothing else is hidden. The blip returns at
  handover.
- OD-3: the roll bar reads 0 while launching and in the pre-roll; the hull keeps rolling with the station (D-10
  unchanged).
- PD-1: the pre-roll HUD reads the launch start values (`preRollHudState` in `src/app/hud-model.ts`), so no HUD value
  jumps at the pre-roll to launch boundary; the live sim state is never written.

No sim file, flight hash or golden changed. Recorded in PROJECT.md (the launch view Key Decisions row) and FIDELITY.md
(E-116, E-117).
