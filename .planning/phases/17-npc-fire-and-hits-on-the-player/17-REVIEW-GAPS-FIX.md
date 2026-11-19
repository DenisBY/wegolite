---
phase: 17
fixed_at: 2026-11-19T00:00:00Z
review_path: .planning/phases/17-npc-fire-and-hits-on-the-player/17-REVIEW-GAPS.md
iteration: 1
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 17: Code Review Fix Report (gap closure)

**Fixed at:** 2026-11-19
**Source review:** .planning/phases/17-npc-fire-and-hits-on-the-player/17-REVIEW-GAPS.md
**Iteration:** 1

**Summary:**
- Findings in scope: 1
- Fixed: 1
- Skipped: 0

## Fixed Issues

### WR-01: The new HUD gauge probe values go stale when the HUD stops drawing, with nothing to tell a reader

**Files modified:** `src/app/probe.ts`
**Commit:** 2d22118
**Applied fix:** Documented semantics (the review's second option), per the orchestrator decision. `ctx.core.lastModel` is deliberately NOT cleared in `render-driver.ts`, because that would also reset `messageRows`, `contacts`, `compass`, `aegis`, `message` and the first-use hint gauges while docked. The field comments for `fuelText`, `fuel`, `shieldFwd`, `shieldAft` and `energyBanks` in `WegoliteHudProbe` now state that the values come from the last drawn HUD frame of the session, are 0/empty only before the session's first HUD frame, and are not reset when the HUD is hidden (docked), on a Load or on New Game. A reader needing live values must read them in flight after a drawn frame, or read `probe.combat`. The only G-17-4 mention was already on `shieldFwd` and is kept. The comment at `probe-publisher.ts:530` ("a new array, so the probe never aliases the drawn model's banks") makes no claim about staleness, so it was left as is. No CHANGELOG entry (internal comment only).

Verification: comment-only change. `docker compose run --rm lint` (eslint and prettier) and `docker compose run --rm typecheck` both ran clean. Gates ran in the main checkout (`workflow.use_worktrees` is false), so no worktree was created. No verify, verify-full or browser tests were run.

## Out of scope

IN-01, IN-02, IN-03, IN-04 and IN-05 are Info findings and were out of scope (`fix_scope: critical_warning`). They remain open in 17-REVIEW-GAPS.md.

---

_Fixed: 2026-11-19_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
