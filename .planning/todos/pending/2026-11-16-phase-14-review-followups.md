---
created: 2026-11-16T09:00:00.000Z
title: Phase 14 review follow-ups (acceptance in CI, detector blind spot, dt coupling)
area: tests
severity: minor
files:
  - package.json
  - compose.yaml
  - tests/acceptance/detectors.ts
  - src/sim/world/step.ts
  - tests/acceptance/detectors.test.ts
---

## Problem

Items the Phase 14 review triage deferred (see `14-REVIEW-DISPOSITION.md`).

- IN-04 (owner decided 2026-11-16: manual rerun rule, now in `AGENTS.md`; revisit adding it to `verify-full` when a later phase changes NPC behaviour): `test:acceptance` (20 seeds) is in no gate, so a change under
  `src/sim/npc/**`, `src/sim/world/**` or `src/content/generated/ships-npc.json` can break a frozen
  threshold unseen. Either add it to `verify-full` or a scheduled run, or document that it must be rerun
  by hand after such a change.
- IN-05 (residual risk 6): the frozen detectors cannot see a permanently idle attack, escort or face
  flyer (the stuck check covers goal scripts only, and the frozen window needs a nonzero desired speed).
  A per-flyer "never left IDLE for a window while a target or leader existed" tally needs the owner's
  `Detector-change-approved-by-owner` trailer.
- IN-02: `stepWorld` accepts any positive `dt`, but the tracking-curve clock is in ticks of
  `1 / TICKS_PER_SECOND`. Add a docblock note, or assert `dt === DT` if no test passes another value.
- WINDOWS.md entry 3 (waived): the stage-A boundary test at `tests/acceptance/detectors.test.ts:164-177`
  asserts only a boolean. Strengthen it with a known-answer point when the acceptance harness is next
  opened (trailer plus a 20-epoch rerun).
