# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## docked-f-keys — docked F-keys dead on the chart and Save/Load screens; a second F6 returned to the previous screen

- **Date:** 2026-11-24
- **Error patterns:** F-key does nothing, F2 F3 F4 F5 F6 F8 inert, key swallowed, reserved F-key, preventDefault, input context, ACTION_CONTEXTS, chart overlay, save screen overlay, text field focus, F5 reload, F6 toggle back, previous screen
- **Root cause(s):** `ACTION_CONTEXTS` (src/input/actions.ts) made F2/F3/F4/F5/F8 live only in `dockHome`/`dockScreen` and F6 not in `saveScreen`, so `keyDown` found no live action on the chart and Save/Load screens and reported the reserved F-key handled with nothing fired; `applyChartAction("chart")` closed an open chart and restored the screen under it; `onKeyDown` dropped every key from a text field and the reserved-key guard exempted text fields, so with the chart's Find planet box focused an F-key did nothing and could reach the browser (F5 reload)
- **Fix:** the six docked screen keys are live in the `chart` and `saveScreen` contexts and, outside flight, go through one synchronous sink (`navigateByKey`, src/app/session/station-controller.ts) that closes the open overlay and opens the target in press order; F6 on an open chart is a no-op (owner decision 2026-11-24, FIDELITY E-184); F1-F8 are never text input
- **Files changed:** src/input/actions.ts, src/input/keyboard.ts, src/app/session/station-controller.ts, src/app/session/chart-controller.ts, src/app/session/start-session.ts, src/app/session/frame-loop.ts, src/app/game-session.ts, playwright.config.ts, tests/e2e/station-fkeys.spec.ts, tests/input/bindings.test.ts, tests/input/station-actions.test.ts, tests/app/session/station-controller.test.ts, tests/app/session/chart-controller.test.ts, tests/guards/dead-mode-gates.test.ts, FIDELITY.md, CHANGELOG.md, README.md
- **Why not caught:** no browser spec pressed the F-keys from the overlays (chart, Save/Load) or from a focused text field; the unit tests pinned the narrow context table as intended, so the gap was encoded as the specification. Pattern to check first next time: an input action that "does nothing" on one screen is usually missing from that screen's context in `ACTION_CONTEXTS`, and a reserved F-key is then silently preventDefaulted
- **Recurrence guard:** tests/e2e/station-fkeys.spec.ts (each key from each docked screen and the focused search box, F4 -> F6 -> F6, Chromium and Firefox); tests/app/session/station-controller.test.ts "navigateByKey: the docked screen keys from every screen (docked-f-keys)"; tests/input/bindings.test.ts ACTION_CONTEXTS pins
---
