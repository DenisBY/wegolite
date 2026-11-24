---
phase: 17-npc-fire-and-hits-on-the-player
plan: 13
subsystem: app-probe
tags: [hud-probe, shield-gauge, energy-banks, probe-shape, browser-spec, gap-closure]

requires:
  - phase: 17-npc-fire-and-hits-on-the-player
    provides: plan 17-12's re-pinned Node twin literals (shield after shooting, bank after shooting) that the browser assertions stay consistent with
provides:
  - WegoliteHudProbe.shieldFwd, shieldAft and energyBanks, the gauge values the HUD drew on its last frame
  - the three keys frozen in every state of tests/fixtures/probe-shape.json and pinned by probe-shape-compare.test.ts
  - the opt-in combat spec asserting the drawn gauges fall after the hook shooter's hits against Oolite's dial rules
  - ROADMAP Phase 17 criterion 2 reworded to D-03 and the decision-source row recording the owner's acceptance
affects: [G-17-4 reconciliation by /gsd-verify-work]

plan_head_before: 182b2ec853b23fd9d758e670a1eff3e9c0a4a275
plan_head_after: 124c27ede266a0b552486785b816bd6561931106

actuals:
  tokens: 11200
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "probe gauge values read from ctx.core.lastModel.bars, the HudModel object the HUD drew, with the banks copied into a new array so the probe never aliases the model"
    - "the browser spec states Oolite's dial rules itself (shield over 128, the bank split) instead of importing the HUD's gauge functions"

key-files:
  created: []
  modified:
    - src/app/probe.ts
    - src/main.ts
    - src/app/session/probe-publisher.ts
    - tests/fixtures/probe-shape.json
    - tests/e2e/combat.spec.ts
    - tests/app/probe-shape-compare.test.ts
    - tests/app/session/probe-publisher.test.ts
    - .planning/ROADMAP.md
    - .planning/PROJECT.md

key-decisions:
  - "The probe field names repeat HudBars' names (shieldFwd, shieldAft, energyBanks); energyBanks is always a four-number array (zeros before a HUD frame) so its shape is the same in every state"
  - "The spec's expectation is computed by its own copy of Oolite's dial rules (PlayerEntity.m:4268-4276, HeadUpDisplay.m:1977-2041), never by the HUD code under test (T-17-37)"

requirements-completed: [CBT-15, CBT-16]

status: complete
duration: 20 min
completed: 2026-11-19
commits: 2

coverage:
  - id: D1
    description: "The HUD probe publishes hud.shieldFwd, hud.shieldAft and hud.energyBanks from the drawn HudModel, with 0, 0 and [0, 0, 0, 0] before a frame and a copied banks array"
    requirement: CBT-16
    verification:
      - kind: unit
        ref: "tests/app/session/probe-publisher.test.ts#the HUD gauge values (G-17-4)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The probe shape is frozen: the three gauge keys are in all seven fixture states and a dropped hud.energyBanks is reported as a missing key"
    requirement: CBT-16
    verification:
      - kind: unit
        ref: "tests/app/probe-shape-compare.test.ts#pins the drawn gauge values in every state's hud entry (G-17-4)"
        status: pass
      - kind: e2e
        ref: "wegolite-remote-run.sh run --rm verify (tests/e2e/probe-shape.spec.ts, snapshot 124c27e, exit=0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The browser spec proves the whole route of criterion 3 to the drawn gauges: forward bar and E1 fall, aft bar stays full, each equal to the dial rule applied to the twin's literals and to the probe's combat values of the same frame"
    requirement: CBT-15
    verification:
      - kind: e2e
        ref: "wegolite-remote-run.sh run --rm e2e ... tests/e2e/combat.spec.ts (snapshot 124c27e, exit=0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "ROADMAP criterion 2 names where each half is proved (UAT test 2) and the decision-source row records the owner's acceptance (UAT test 3)"
    verification: []
    human_judgment: true
    rationale: "Planning-document wording; the owner's acceptance is recorded as given in UAT, no test asserts prose"
---

# Phase 17 Plan 13: the drawn shield and energy gauges in the HUD probe Summary

**The HUD probe now carries the FWD and AFT shield bars and the E1 to E4 energy banks exactly as the HUD drew them (`hud.shieldFwd`, `hud.shieldAft`, `hud.energyBanks`, read from `ctx.core.lastModel.bars`), the shape is frozen in the fixture and its compare test, and the opt-in combat spec asserts the drawn gauges fall after the hook shooter's hits against Oolite's dial rules, the twin's literals and the probe's same-frame combat values; ROADMAP criterion 2 and the decision-source row record the owner's two UAT acceptances.**

## Performance

- **Duration:** about 20 min
- **Completed:** 2026-11-19T09:55Z
- **Tasks:** 2 (tracer + auto)
- **Files modified:** 9

## Accomplishments

- `src/app/probe.ts`: three documented fields on `WegoliteHudProbe` beside `fuel`, with the failure-surface defaults 0, 0 and `[0, 0, 0, 0]`; the same defaults in the initial probe of `src/main.ts`.
- `src/app/session/probe-publisher.ts`: the hud block publishes `model.bars.shieldFwd`, `shieldAft` and a new four-element banks array from the model the render driver just drew, with the defaults when no frame has been drawn.
- `tests/fixtures/probe-shape.json`: `energyBanks` (`{"[]": ["number"]}`), `shieldAft` and `shieldFwd` in all seven states' `hud` entries, edited by hand in the sorted key order (no write mode).
- `tests/e2e/combat.spec.ts`: before the spawn the drawn forward and aft bars are 1 and E1 is above 0.9; 360 ticks after it the drawn forward bar equals the twin's `0.1333.../128` (9 digits) and the probe's forward shield over 128 (12 digits), E1 to E4 equal the bank split of the twin's 222.1833... energy (E4 to E2 full, E1 about 0.47) and of the frame's energy, E1 and the forward bar are below their pre-spawn values, and the aft bar is still 1. The spec carries its own `shieldDial` and `bankDial` with the Oolite citations; it imports nothing from the HUD. Every earlier assertion and the `hud.drawn` check are kept; the header's criterion 3 sentence and the stale comment are updated.
- Unit pins: four publisher tests (mapping with a 64/128/200 model giving 0.5, 1 and `[0.125, 1, 1, 1]`, no alias, live read per call, defaults before a frame) and two compare tests (keys in every state, a dropped `hud.energyBanks` reported as `hud.energyBanks: missing key`).
- `.planning/ROADMAP.md` Phase 17 criterion 2 rewritten per D-03 and ending `(wording tightened to D-03: owner, UAT test 2, 2026-11-19)`; `.planning/PROJECT.md` decision-source row now says the advisor's reading (advisor decision 3) was accepted by the owner 2026-11-19 (UAT test 3) and was settled by the advisor on 2026-11-18 and accepted by the owner.

## Task Commits

1. **Task 1: the drawn forward shield bar from the HUD model through the probe to the browser spec (tracer)** - `deef32a` (feat)
2. **Task 2: every drawn gauge asserted against the twin, shape and mapping pinned, criterion 2 and the decision row** - `124c27e` (test)

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md, ROADMAP.md and REQUIREMENTS.md.

## Remote runs (executed by this agent at the committed HEAD)

| Run | Command | Snapshot | Exit | Elapsed |
|-----|---------|----------|------|---------|
| combat spec after Task 1 | `wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts --reporter=list"` | `deef32a` | `exit=0` | `elapsed=14s` (1 passed) |
| `verify` after Task 2 | `wegolite-remote-run.sh run --rm verify` | `124c27e` | `exit=0` | `elapsed=188s` (unit 235 files, 6449 passed, 10 skipped; smoke e2e 27 passed including `probe-shape.spec.ts`; no flake rerun needed) |
| combat spec after Task 2 | same command as the first row | `124c27e` | `exit=0` | `elapsed=14s` (1 passed, none failed or flaky) |

## Verification

- Local Docker: `docker compose run --rm test` (full, coverage) exit 0; `lint` and `typecheck` clean; the targeted `probe-shape-compare`, `probe-publisher` and `render-driver` files green after Task 1.
- Test sensitivity: temporarily forcing `shieldFwd` to 0 and shifting the bank index in the publisher made two publisher tests fail; the file was restored with `git checkout -- <file>` before the Task 2 commit.
- Acceptance criteria: `energyBanks` in `probe.ts` 2, `model.bars.shieldFwd` in the publisher 1, `energyBanks` in `main.ts` 1, fixture `"shieldFwd": "number"` 7, `"shieldAft": "number"` 7, `"energyBanks"` 7, `hud.shieldFwd` in the spec 2, `energyBanks` in the spec 3, `hud.shieldAft` in the spec 2, `shieldFwd` in the compare test 1, gauge reads in the publisher test 11, `owner, UAT test 2, 2026-11-19` and `npc-vs-npc.scenario.test.ts` in ROADMAP 1 each, the decision row carries `accepted by the owner 2026-11-19` and no longer `not settled by the owner, raised at sign-off`, and `git diff cf136c2 -- tests/e2e/hud.spec.ts src/render/hud` is empty.
- No `verify-full`, no acceptance run (no `src/sim/**` change), per the plan.

## Decisions Made

The two in the frontmatter; both are the plan's discretion items. No CHANGELOG entry (test observability only, no player-visible change).

## Deviations from Plan

None - plan executed exactly as written. Note on the TDD flag of Task 2: the production code landed in Task 1 (the plan's tracer), so Task 2's tests were written against existing behaviour; their sensitivity was shown by the mutation check above rather than a RED commit.

## Known Stubs

None.

## Threat Flags

None. T-17-36 (values the player already sees), T-17-37 (spec's own dial rules), T-17-38 (fixture, compare test and remote `probe-shape.spec.ts`) and T-17-39 (copied banks array, unit-tested) are handled as planned.

## Issues Encountered

None. The first fixture edit assumed every `messageRows` entry was `{"[]": []}`; one state pins `["string"]`, so the edit was made with a pattern that keeps each state's own value.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

G-17-4, UAT tests 2 and 3 are closed in the plans; `/gsd-verify-work` reconciles them from the plans' `gap_ids` (`17-UAT.md` and `17-VERIFICATION.md` were not edited). All three gap-closure plans (17-11, 17-12, 17-13) are executed.

---
*Phase: 17-npc-fire-and-hits-on-the-player*
*Completed: 2026-11-19*

## Self-Check: PASSED

- `src/app/probe.ts`, `src/app/session/probe-publisher.ts`, `tests/fixtures/probe-shape.json`, `tests/e2e/combat.spec.ts` exist; `deef32a` and `124c27e` are ancestors of HEAD; `git rev-list --count 182b2ec..124c27e` is 2; lint, typecheck and the full suite were green before the commits; remote `verify` and the combat spec were green at `124c27e`.
