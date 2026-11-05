---
phase: 04-manual-docking
plan: 06
subsystem: ui/input
tags: [docking, accessibility, css, aria, chords, rebinding]
requires:
  - phase: 04-manual-docking
    provides: docked panel line/disabled/reason view and the semantic action map
provides:
  - disabled docked purchase control with dimmed style, not-allowed cursor and no active-fill hover
  - purchase refusal in the value cell, linked to the Buy control by aria-describedby
  - shared SHIFT_REQUIRED_ACTIONS metadata and a chordLabel formatter
  - Controls row and rebind status that print Shift+C / Shift+K
affects: [04-manual-docking, ui-controls, input-bindings]
actuals:
  tokens: 3545
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Action metadata lives in actions.ts; the input resolver and display formatter read one shift set"
    - "Native disabled remains the activation gate; CSS and ARIA only describe the state"
key-files:
  created: []
  modified:
    - index.html
    - src/ui/docked.ts
    - src/input/actions.ts
    - src/input/keyboard.ts
    - src/input/bindings.ts
    - src/ui/controls.ts
    - tests/input/bindings.test.ts
    - tests/e2e/docking.spec.ts
key-decisions:
  - "The refusal reason is a span inside the docking-computer value dd, so grid auto-placement can never drop it into the label column"
  - "SHIFT_REQUIRED_ACTIONS is exported from actions.ts and consumed by both the keyboard resolver and bindings.chordLabel"
  - "chordLabel adds the modifier only for display; bindings still store plain KeyboardEvent.code values"
patterns-established:
  - "Presentation contract pinned by computed style, ARIA and bounding-box assertions rather than text alone"
requirements-completed: [DOCK-05]
coverage:
  - id: D1
    description: "Disabled Buy docking-computer control is visually distinct: dimmed border/text, reduced opacity, not-allowed cursor, and no active fill on hover."
    requirement: DOCK-05
    verification:
      - kind: e2e
        ref: "tests/e2e/docking.spec.ts#the docked panel shows real credits and refuses the TL 9 computer at Lave"
        status: pass
    human_judgment: false
  - id: D2
    description: "Refusal reason renders beside the docking-computer line in the value cell, is described by the Buy control, and a visible gap separates Buy from Launch."
    requirement: DOCK-05
    verification:
      - kind: e2e
        ref: "tests/e2e/docking.spec.ts#the docked panel shows real credits and refuses the TL 9 computer at Lave"
        status: pass
    human_judgment: false
  - id: D3
    description: "Controls shows 'Docking computer' with 'Shift+C', and rebinding to K reports 'Docking computer bound to Shift+K.'"
    requirement: DOCK-05
    verification:
      - kind: unit
        ref: "tests/input/bindings.test.ts#renders the Shift chord for a shift-required action"
        status: pass
      - kind: e2e
        ref: "tests/e2e/docking.spec.ts#the docked panel shows real credits and refuses the TL 9 computer at Lave"
        status: pass
    human_judgment: false
duration: 15min
completed: 2026-11-05
status: complete
plan_head_before: 2f5bc3ffc2d398d3ab172bb8b274ec4774af790f
plan_head_after: e70dc78d71cb147c91676b7099c92b449030fbb4
---

# Phase 4 Plan 6: Disabled Docking-Computer Presentation and Chord Labelling Summary

**A disabled docked purchase control now reads as unavailable, states its refusal in the value cell, and the Controls screen and rebind feedback print Shift+C / Shift+K from shared action metadata.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-11-05T13:22:51Z
- **Completed:** 2026-11-05T13:38:48Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Restructured the docked purchase row: the reason is a `span#dockcomp-message.docked-reason` inside the docking-computer `dd`, both action buttons sit in one `.docked-actions` flex column with a visible gap, and the reason is linked to the Buy control by `aria-describedby`.
- Added `#docked button:disabled` styling (dimmed border/text, reduced opacity, `not-allowed`) and scoped the hover/focus fill to `:not(:disabled)`, leaving native `disabled` as the only activation gate.
- Exported `SHIFT_REQUIRED_ACTIONS` from `actions.ts`, consumed it in `keyboard.ts` (removing the module-private `REQUIRES_SHIFT`), and added `chordLabel` so `labelFor` and the rebind status render `Shift+C` / `Shift+K`.
- Pinned the contract at both layers: unit assertions for the chord formatter and ordinary labels, and e2e assertions for computed style, hover behaviour, ARIA linkage, row placement, positive button gap, Controls row text and rebind feedback.

## Task Commits

Each task was committed atomically:

1. **Task 1: Restructure the docked purchase row and give the disabled state a real visual contract** - `1365e12` (fix)
2. **Task 2: Expose the shift requirement, render Shift+C in Controls, and pin the presentation contract** - `e70dc78` (feat)

**Plan metadata:** committed separately as `docs(04-06): complete disabled docking-computer presentation plan`

## Files Created/Modified

- `index.html` - reason span in the value cell, action wrapper, `:disabled` and scoped hover/focus rules
- `src/ui/docked.ts` - conditional `aria-describedby`; module comment updated
- `src/input/actions.ts` - `SHIFT_REQUIRED_ACTIONS` export and clean `"Docking computer"` label
- `src/input/keyboard.ts` - shared shift set consumed by chord resolution; private set removed
- `src/input/bindings.ts` - `chordLabel` and shift-aware `labelFor`
- `src/ui/controls.ts` - rebind status uses `chordLabel`
- `tests/input/bindings.test.ts` - chord formatter contracts
- `tests/e2e/docking.spec.ts` - computed-style, ARIA, layout, Controls and rebind-status assertions

## Decisions Made

- Placed the refusal as a `span` inside the existing value `dd` rather than a sibling `dd`, so the two-column grid cannot auto-place it in the label column and the ARIA relationship stays adjacent.
- Treated the Shift requirement as action metadata exported from `actions.ts`; `keyboard.ts` and `bindings.ts` read the same set, so display and enforcement cannot drift.
- Kept native `disabled` as the sole activation gate; CSS and ARIA describe the state without replacing it.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Prettier reflowed an over-long `toHaveText("Shift+C")` assertion into a multi-line form that no longer matched the plan's acceptance grep. Fixed by assigning the cell locator to a `const` first, so the assertion stays on one line and Prettier remains clean.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-04-2 is closed at the presentation layer: the disabled control is visually distinct, its reason is adjacent and described, and the chord is discoverable in Controls.
- `docker compose run --rm verify` is green: lint, typecheck, asset drift, 687 unit/integration tests and 46 browser tests.
- No new dependency and no change to the purchase decision, price or tech-level gate.

---

*Phase: 04-manual-docking*
*Completed: 2026-11-05*

## Self-Check: PASSED

- Both task commits exist on the branch (`1365e12`, `e70dc78`).
- Every modified file listed in the frontmatter exists on disk.
- `docker compose run --rm verify` passed after the final task commit.

