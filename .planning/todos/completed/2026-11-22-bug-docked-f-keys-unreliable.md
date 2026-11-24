---
created: 2026-11-22T00:00:00.000Z
title: "Bug: F2-F6 and F8 on the docked screens mostly do nothing, and when they act the result is unexpected"
source: Phase 19 UAT (owner report, 2026-11-22)
area: input
severity: major
type: bug
files:
  - src/input/actions.ts
  - src/input/bindings.ts
  - src/ui/docked.ts
  - src/app/session/station-controller.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

Owner report, docked, dev build: the function keys F2, F3, F4, F5, F6 and F8 "almost don't work, and when
they do, not the way you expect". The tab strip advertises them (`F2 Save/Load`, `F3 Outfitting`,
`F4 Interfaces`, `F5 Status`, `F6 Chart`, `F8 Market`), so a press must open that screen every time.

Not yet reproduced or diagnosed. Things to check first:

- Which context consumes the key. The same codes are bound in several places (`stationOutfitting` F3 vs the
  in-flight `viewPort` F3, `stationInterfaces` F4 vs `viewStarboard` F4, `saveLoad` F2 vs `viewAft` F2,
  `chart` F6), and the result depends on the active context table in `src/input/actions.ts`.
- Whether the browser gets the key first (F5 reload, F3/F6 browser shortcuts) despite `RESERVED_F_KEYS`, and
  whether focus on a tab-strip button or the chart's search box swallows it.
- Whether the press fires on screens other than Home (Market, Outfitting, Status, Save/Load, Chart).

## Done when

- From every docked screen, each advertised F-key opens its screen on the first press, in Chromium and Firefox.
- A browser spec presses each key from each docked screen and asserts the screen shown.

## Resolution (2026-11-24)

Fixed in debug session `docked-f-keys` (`.planning/debug/resolved/docked-f-keys.md`). Three independent
gaps: `ACTION_CONTEXTS` made F2/F3/F4/F5/F8 live only in `dockHome`/`dockScreen` and F6 not in
`saveScreen`, so on the chart and the Save/Load screen the reserved key was swallowed and nothing fired;
and with the chart's Find planet box focused, `onKeyDown` dropped the key and the reserved-key guard let
it reach the browser (F5 could reload the page). The six keys are now live on every docked screen, the
chart and Save/Load included (F2 is ignored on its own screen, as Oolite ignores it on
`GUI_SCREEN_OPTIONS`), and outside flight they go through one synchronous sink (`navigateByKey` in
`src/app/session/station-controller.ts`) that closes the open overlay and opens the target in press
order; F1 to F8 are never text input. FIDELITY.md E-183 (faithful to `pollDockedControls`).
`tests/e2e/station-fkeys.spec.ts` presses each key once from each docked screen and from the focused
search box, in Chromium and Firefox.
