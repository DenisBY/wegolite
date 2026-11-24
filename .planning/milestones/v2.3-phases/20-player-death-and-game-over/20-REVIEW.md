---
phase: 20-player-death-and-game-over
reviewed: 2026-11-24T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - index.html
  - src/app/session/render-driver.ts
  - src/ui/game-over.ts
  - tests/app/redraw-gate.test.ts
  - tests/app/session/render-driver.test.ts
  - tests/ui/game-over.test.ts
  - vite.config.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
  necessity: 0
status: issues_found
---

# Phase 20: Code Review Report (incremental, gap-closure plans 20-12 and 20-13)

**Reviewed:** 2026-11-24
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

This report supersedes the 94f9760 review only for these seven files, over the range `94f9760..HEAD`. The earlier dispositions in `20-REVIEW-DISPOSITION.md` still stand for everything else in the phase.

Reviewed: the coasting dead camera, the dead dust arguments and the every-frame dead redraw (20-12); the yellow lines on a translucent panel inside the faded `#game-over` root (20-13); and the unplanned `vite.config.ts` watcher change (commit 841f562).

No blocker was found.

- **Hash freeze.** The coast is a local in `renderFrame`. `add`, `scale` and `rotate` are pure, and nothing is written to `ctx.core.state` or the pose. The new test asserts the world hash, the flight hash and the pose are unchanged after frames up to 600 s.
- **Dust.** The first dead frame resets `previousCameraWorld` (line 271), so its delta is zero and its speed is 0. A moved frame gets 160 m/s and a still frame gets 0, so the frozen death speed's random-axis streaks cannot be drawn. `Dust.update` only reseeds when a delta exceeds the box size. The frame delta is clamped by `clampFrameDelta` (frame-loop.ts:132), so a hidden-tab return does not teleport the camera.
- **Pause.** The dead state cannot pause: `pause()` returns early while `gameOver` (settings-controller.ts:70) and `resume()` is a no-op. The presentation clock therefore never runs under a pause, and the camera cannot jump on a resume.
- **Redraw gate.** `deadSettled`, `movingDebrisInView`, `isDebrisInDeadView` and `NO_DRAW_DISTANCE_FACTOR` are fully removed. A repo-wide `rg` finds no remaining reference outside the planning docs and FIDELITY prose.
- **Panel and selectors.** The `#game-over p:nth-child(2|3)` margins and `#game-over-title` still match inside the panel. The click listener sits on the root, so clicks on the panel bubble to it. The e2e specs use the descendant selector `#game-over [data-game-over-line=...]`, which still resolves. Prettier and ESLint report nothing on the changed files.
- **Contrast.** Oolite yellow over a 0.6 black panel on a white sun is about 5.4:1.
- **Citations.** The FIDELITY row line references `render-driver.ts:325/328/351/437/494` match the current source.
- **Tests.** `docker compose run --rm test npx vitest run` on the three test files: 3 files, 106 tests, all pass.
- **Vite watcher.** In Vite 8.3.5 `resolveChokidarOptions` appends the user's `ignored` list to its own defaults (`.git`, `node_modules`, `test-results` and the cache dir), so `["**/.claude/**"]` adds to them and does not replace them.

## Warnings

### WR-02: The `.claude/worktrees` fix covers only the Vite watcher; `lint` (and so `verify`) still fails while an agent worktree exists

**File:** `vite.config.ts:60-64` (unaddressed siblings: `.prettierignore`, `eslint.config.js:354-359`)
**Issue:** Commit 841f562 keeps agent worktrees out of the dev watcher, but the same worktrees (`.claude/worktrees/agent-*`, untracked and listed in `.git/info/exclude`) reach the other tools. `npm run lint` is `eslint . && prettier --check .`. `.prettierignore` does not list `.claude`, and the `eslint.config.js` `ignores` array does not either. Running `docker compose run --rm lint` on this tree, with the worktree of the just-merged executor present, ended with `Code style issues found in 38 files`. Every file named was under `.claude/worktrees/agent-a401b1ac13fa0e6c3/`: generated JSON, tests and so on. `prettier --check` exits non-zero on that, so the `lint` step of `verify` and `verify-full` fails locally between the merge of an executor worktree and its cleanup. It fails for a reason unrelated to the changed code. The root cause is the one the vite comment names, so the fix is incomplete. The check I ran piped through `tail`, so the exit status itself was not observed, but prettier's documented behaviour on `--check` with findings is exit 1.
**Fix:** Ignore the directory in every tool that walks the tree.
```
# .prettierignore
.claude/worktrees
```
```js
// eslint.config.js, in the global ignores object
ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**", ".claude/**"],
```
Also check that `vitest.config.ts` `exclude` and the `tsc` `include` skip `.claude/**`. If the owner prefers to keep `.claude/` visible to some tools, narrow the Vite pattern to `**/.claude/worktrees/**`. The current `**/.claude/**` also hides `.claude/settings*.json` and any future `.claude/` content from the watcher, which is harmless but broader than the stated reason.

## Info

### IN-07: Wrong Oolite line citation for the message yellow

**File:** `src/ui/game-over.ts:20` (same citation in `FIDELITY.md:207`)
**Issue:** The comment cites `HeadUpDisplay.m:440` for `yellowColor`. In the checkout at `/home/opencode/git/oolite`, `[gui setTextColor:[OOColor yellowColor]]` is at `src/Core/HeadUpDisplay.m:443`. Line 440 is `setDrawPosition:`. The `PlayerEntity.m:3632` (`resetGuis:` with an empty `message_gui` dict) and `GuiDisplayGen.m:1344-1349` (no backdrop while `STATUS_DEAD`) citations are correct.
**Fix:** Change `:440` to `:443` in both places.

### IN-08: Dust speed while dead is a constant, not a function of the actual camera delta

**File:** `src/app/session/render-driver.ts:372-376`
**Issue:** Any non-zero camera delta passes `DEAD_COAST_SPEED_MPS` (160) as the speed, whatever its size. Real coast frames are 160 m/s times the clamped frame time, so the streak length is right. A restore or other odd frame with a large but sub-box delta would still draw the full 3.2 m streak, and a delta above the box size reseeds anyway. Nothing observable is wrong today. The `cameraMoved ? 160 : 0` form is simply a stand-in for `|delta| / dt`, and the comment correctly says so.
**Fix:** No change needed. If the coast ever gains a variable speed (for example the bursts' velocity inheritance todo), replace the constant with the real speed so the two cannot drift apart.

---

_Reviewed: 2026-11-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
