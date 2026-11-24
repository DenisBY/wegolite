---
phase: 20-player-death-and-game-over
review: 20-REVIEW.md
recorded: 2026-11-24
counts:
  critical: 0
  warning: 2
  info: 8
open: 10
---

# Phase 20 — Code Review Disposition

One row per finding, recording what happened to it. WR-01 and IN-01..IN-06 come from the original phase review (commit 94f9760, preserved in git history); WR-02, IN-07 and IN-08 come from the incremental gap-closure review of plans 20-12 and 20-13 that is now `20-REVIEW.md` (renumbered by the orchestrator so IDs stay unique).

| ID | Severity | Finding | Disposition | Evidence |
|----|----------|---------|-------------|----------|
| WR-01 | warning | The game-over exit (Space/click listeners) is armed only inside `overlay.show()`, which runs after `latchGameOver` and after work that can throw (`buildGameOverLines` throws on a `formatDecicredits` format change); the router has no error isolation, so a throw leaves a latched, frozen session with no exit | open | not reachable today without a harness or a future format change; candidate fix: arm the exit before the fallible work or show fallback lines first |
| IN-01 | info | Necessity: the `gameOver` guards in `chart-controller` (`setChartCamera`, `toggleChartPreset`, `handleFind`, `selectChartSystem`) and in `resume()` are already covered by `!chartOpen` / `paused` | open | kept by plan 20-06 as defence in depth; the latch-only router default skips `closeChart` |
| IN-02 | info | The lethal frame (and the context-restore frame) draws at alpha 0, so the dead camera is up to about 3 m out of step with the burst origin for one frame | open | one frame, presentation only |
| IN-03 | info | The overlay's Space handler accepts modifier chords (Ctrl+Space, Alt+Space) | open | candidate one-line fix in `src/ui/game-over.ts` |
| IN-04 | info | `src/ui/game-over.ts` is the only `src/` file with extensionless relative imports | open | style consistency |
| IN-05 | info | With traffic off, the particle textures are first requested at the death, so the bursts can be lost on a slow or failed fetch; `PLAYER_EXPLOSION_SETTINGS` duplicates generated data, guarded by a unit test | open | production default is traffic on (textures preloaded); the drift test pins the duplicate |
| IN-06 | info | `probe.dock.outcome` reports a dead player as `"inFlight"` | open | probe-only; `probe.mode` and `probe.death` report the death |
| WR-02 | warning | `vite.config.ts` ignores `.claude/**` for the dev watcher only; `prettier --check .` and ESLint do not ignore `.claude/worktrees`, so `lint` (and `verify`) fails locally while an agent worktree directory exists | open | not introduced by 20-12/20-13 (from 841f562); observed during this review with two merged-but-undeleted worktree dirs present, since removed; candidate fix: add `.claude/` to `.prettierignore` and the ESLint ignores |
| IN-07 | info | `src/ui/game-over.ts:20` and `FIDELITY.md:207` cite `HeadUpDisplay.m:440` for the message yellow; the colour is at `:443` | open | citation-only fix |
| IN-08 | info | The dead dust speed is the constant 160 (or 0), not derived from the measured camera delta | open | correct for the fixed-speed coast; revisit only if the coast becomes variable |

Known and tracked elsewhere (not re-reported by the reviewer): the T-20-41 `saveSkipReason` overwrite in `queueSnapshot`'s failure branches (`20-SECURITY.md` audit note) and the overlay legibility / aria-live gaps (`20-UI-REVIEW.md`).
