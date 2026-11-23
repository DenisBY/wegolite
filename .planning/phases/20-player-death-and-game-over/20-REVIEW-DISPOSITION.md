---
phase: 20-player-death-and-game-over
review: 20-REVIEW.md
recorded: 2026-11-23
counts:
  critical: 0
  warning: 1
  info: 6
open: 7
---

# Phase 20 — Code Review Disposition

One row per finding in `20-REVIEW.md`, recording what happened to it.

| ID | Severity | Finding | Disposition | Evidence |
|----|----------|---------|-------------|----------|
| WR-01 | warning | The game-over exit (Space/click listeners) is armed only inside `overlay.show()`, which runs after `latchGameOver` and after work that can throw (`buildGameOverLines` throws on a `formatDecicredits` format change); the router has no error isolation, so a throw leaves a latched, frozen session with no exit | open | not reachable today without a harness or a future format change; candidate fix: arm the exit before the fallible work or show fallback lines first |
| IN-01 | info | Necessity: the `gameOver` guards in `chart-controller` (`setChartCamera`, `toggleChartPreset`, `handleFind`, `selectChartSystem`) and in `resume()` are already covered by `!chartOpen` / `paused` | open | kept by plan 20-06 as defence in depth; the latch-only router default skips `closeChart` |
| IN-02 | info | The lethal frame (and the context-restore frame) draws at alpha 0, so the dead camera is up to about 3 m out of step with the burst origin for one frame | open | one frame, presentation only |
| IN-03 | info | The overlay's Space handler accepts modifier chords (Ctrl+Space, Alt+Space) | open | candidate one-line fix in `src/ui/game-over.ts` |
| IN-04 | info | `src/ui/game-over.ts` is the only `src/` file with extensionless relative imports | open | style consistency |
| IN-05 | info | With traffic off, the particle textures are first requested at the death, so the bursts can be lost on a slow or failed fetch; `PLAYER_EXPLOSION_SETTINGS` duplicates generated data, guarded by a unit test | open | production default is traffic on (textures preloaded); the drift test pins the duplicate |
| IN-06 | info | `probe.dock.outcome` reports a dead player as `"inFlight"` | open | probe-only; `probe.mode` and `probe.death` report the death |

Known and tracked elsewhere (not re-reported by the reviewer): the T-20-41 `saveSkipReason` overwrite in `queueSnapshot`'s failure branches (`20-SECURITY.md` audit note) and the overlay legibility / aria-live gaps (`20-UI-REVIEW.md`).
