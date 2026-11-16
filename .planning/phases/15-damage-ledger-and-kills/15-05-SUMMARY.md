---
phase: 15-damage-ledger-and-kills
plan: 05
subsystem: sim
tags: [kill-notifications, immediate-drain, found-19, d-04, post-drain-repair, dangling-references]
status: complete

requires:
  - phase: 15-damage-ledger-and-kills
    provides: plan 15-04 killShip, applyLedger and the resolveShots kill tail (second commitWorld, ident update)
provides:
  - "killShip posts shipTargetLost to every holder of the victim and shipTargetDestroyed then shipKilledOther to a live NPC killer (D-04)"
  - "drainAiEventsNow (src/sim/world/step.ts): empty-queue early return, drain with the world step's caps and containment, fire-request discard, post-drain sanitise"
  - "resolveShots drains the kill events between the kills and the second commitWorld; it takes layout and an injectable registry"
  - "the dangling-reference inventory in killShip's doc and its real-world 120-tick case"
  - "PROJECT.md Key Decisions row 'Kill notifications and events (D-04, D-05)', D-05 narrowing marked pending owner acknowledgement (OD-2)"
affects: [15-06, 16, 17, 18]

plan_head_before: ab7818b82ba601e2fe21be66ec2dc4db5606d739
plan_head_after: fa47bfb50123e7ed343bdf99ef0494f100913c42
commits: 2

actuals:
  tokens: 13000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Post events through postAiEvent in the one kill path, deliver them with a second drain before the boundary commit, and repair handler writes with sanitizeEntity after it"
    - "Registry-injected tests drive resolveShots and drainAiEventsNow directly because stepSim always passes AI_REGISTRY"

key-files:
  created: []
  modified:
    - src/sim/world/kill.ts
    - src/sim/world/step.ts
    - src/sim/combat/step.ts
    - src/sim/sim.ts
    - tests/sim/world/kill.test.ts
    - tests/sim/combat/ident.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "The killer is told regardless of its own primary target and third parties at kill time (Oolite gates noteTargetDestroyed on the primary target and tells third parties one update later); a holder whose handler does not change its behaviour can get shipTargetLost twice, so every onEvent must be idempotent for it"
  - "D-05 is narrowed: the closed sets (event router table, subscriber order, probe shape) need no edit, because identLost is already routed and shipDestroyed and entityRemoved are reserved kinds; recorded as pending owner acknowledgement (OD-2), never approved"
  - "A fire request made by an onEvent handler during the immediate drain is discarded (fire is a think-time action)"

requirements-completed: []

duration: about 50 min including the local gate runs and the remote runs (full test 67 s, acceptance 79 s)
completed: 2026-11-16
---

# Phase 15 Plan 05: Kill notifications and the immediate drain Summary

**A ship's death now tells exactly the ships that care (every holder of the victim as target, and a live NPC killer) before the tick ends: `killShip` posts the D-04 events, `drainAiEventsNow` delivers them between the kills and the second commit, and a world snapshot at any tick boundary holds no queued AI event, fire request or dead entity.**

## Accomplishments

- `killShip` (`src/sim/world/kill.ts`): after `shipDestroyed`, one bounded ascending pass over the live ships posts `shipTargetLost` (no payload) to each live non-dead ship other than the victim whose `nav.targetId` is the victim; then, when the normalised killer is neither `NO_ENTITY` nor `PLAYER_ID`, `shipTargetDestroyed` and `shipKilledOther` with `a` the victim. Everything goes through `postAiEvent`; no other ship's `nav` or `steer` is written (pinned by a deep-equal case). A killer destroyed earlier in the pass was normalised to `NO_ENTITY` and is told nothing; non-ship kinds post nothing.
- `drainAiEventsNow` (`src/sim/world/step.ts`): returns at once on an empty queue; otherwise builds the view lazily as `stepWorld` does, runs the existing private `drainAiEvents` (same 8-pass and 4096-event caps, same `aiDropped` accounting, same containment in `invoke`), truncates `world.fireQueue` back to its entry length (T-15-13) and runs `sanitizeEntity` over every live non-dead entity (T-15-20). Its doc states the late tracking curve of a `setTarget` made there and the idempotence rule for handlers.
- `resolveShots` (`src/sim/combat/step.ts`) gains `layout` and `registry = AI_REGISTRY`, calls the drain between the kills and the second `commitWorld`, and documents the event order `laserFired*`, `shipHit*`, `shipDestroyed*`, `aiFaulted*`, `entityRemoved*`, then the ident events. `stepSim` passes `layout`; the direct call in `ident.test.ts` does too.
- `killShip`'s doc now carries the dangling-reference inventory (`nav.targetId`, `steer.proximityAlert`, `steer.saved.targetId`, an escort's `ownerId`, a test pilot's `params.targetId`, each with the function that tolerates a removed id) and states that it never rewrites another ship's reference.
- Tests (`tests/sim/world/kill.test.ts`, 16 cases added to 15-04's 19, 35 in the file): ordered delivery to holders and killer with nobody else notified; a killer that also held the victim; the player as killer; non-ship kinds; a dead killer; a mutual kill (nothing delivered, `aiDropped` unchanged); empty-queue drain leaves the hash equal; nav/steer of other ships deep-equal; a handler's `ctl.fire` discarded while an earlier entry is kept and `snapshotWorld` succeeds; a fan-out past the queue cap (queue pre-filled to cap minus one, 7 posts, 1 stored, `aiDropped` 6, no throw); the Pitfall 9 pair (kill-time `shipTargetLost`, then the steering's own after `FLEE_TARGET` meets the gone target); `resolveShots` through an injected registry (event order, delivery before the commit, an `aiFaulted` between `shipDestroyed` and `entityRemoved`); a test shooter's lethal shot through `stepSim` itself (empty `aiQueue` and `fireQueue`, no dead entity, snapshot succeeds); the post-drain repair (`NaN` written into `ai.params.x` is repaired with exactly one `repairs` increment while an in-domain writer gets none); and the 120-tick dangling-reference case (flight-script victim, escort follower with `ownerId`, attacker, proximity-alert holder with `saved.targetId`, and a test pilot with `scanRange` 100 holding the dead id: no throw, no `aiFaulted`, every survivor's `repairs` unchanged, the attacker `done`, the pilot back in seek within one think interval with `targetId` `NO_ENTITY` and never holding the dead id again, boundary holds every tick).
- Two mutation checks confirmed the tests bite: removing the `drainAiEventsNow` call in `resolveShots` fails three cases, and replacing the post-drain `sanitizeEntity` fails the repair case.

## plan-15-04 kill.test.ts cases that needed a drain (R2-7)

None. Every 15-04 case kills ships that have no AI, and none calls `snapshotWorld` or asserts an empty queue after a kill with a live NPC killer. The file header now says so.

## Task Commits

1. **Task 1: notifications, `drainAiEventsNow`, `resolveShots` drain, Key Decisions row (tracer)** - `68da4c0` (feat)
2. **Task 2: post-drain repair, dangling-reference inventory and real-world case** - `fa47bfb` (feat)

The tracer gate: Task 1's six-file Vitest verify (6 files, 201 tests) and typecheck were green before expansion.

## Gates

- Local, container: the six Task 1 files pass; `kill.test.ts` 35 tests pass; `lint` and `typecheck` clean after the final edit. The full local `docker compose run --rm test` run twice with 205 of 206 files and 5231 tests passing, the one failure being `tests/guards/tools-determinism.test.ts` "Math.sin fails lint with the determinism reason", a 30 s timeout of an ESLint probe under full-suite load on the slow local machine (it passes alone in 8 s and is unrelated to this plan). A failed file stops the coverage report, so the coverage thresholds were checked on the remote machine instead:
- Remote, committed HEAD `fa47bfb`:
  - `wegolite-remote-run.sh run --rm test`: exit 0, 206 files, 5232 passed, 10 skipped, coverage thresholds met, elapsed 67 s.
  - `wegolite-remote-run.sh run --rm test npm run test:acceptance`: exit 0, 21 of 21 cases pass, elapsed 79 s. All 20 seeds `repairs` 0, `aiFaulted` 0, `aiDropped` 0, `hashFailures` 0; `ACCEPTANCE-TOTALS` (stationArrivals 40, interceptArrivals 40, fleeArrivals 40, avoidCollisionEntries 23, attackTicksNearPlayer 61662, stuckWindowsEvaluated 175, frozenWindowsEvaluated 294) identical to the 15-02, 15-03 and 15-04 runs; no flyer dies (nothing fires in the frozen worlds).
- No `verify` run: no browser-facing code changed, and in ordinary play no ship has an AI, so the drain changes nothing a browser can see (plan gate policy).
- Acceptance checks: `drainAiEventsNow` export, the `drainAiEventsNow(` call, `shipKilledOther`, "Kill notifications and events", "narrows D-05" and "OD-2" greps all present; `git diff --quiet c9cf622 -- src/app/session/event-router.ts tests/fixtures/probe-shape.json` exits 0; `sanitizeEntity(` appears twice in `world/step.ts`; no module under `world/`, `npc/` or `ai/` imports `combat/step.js`; the `killEntity(` guard prints nothing; `scanRange` appears in `kill.test.ts`; the NPC energy-write check prints exactly `ledger.ts`, `step.ts`, `sanitize.ts`.

## Deviations from Plan

None - plan executed exactly as written.

Notes (no behaviour change): `CHANGELOG.md` is untouched because nothing here is user-visible (in ordinary play no ship has an AI). A sentence was added to the `stepSim` doc about the layout parameter.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or trust-boundary file access. T-15-11 (fan-out counted in `aiDropped`), T-15-13 (fire queue truncated), T-15-20 (post-drain repair) and T-15-21 (dangling references) are mitigated as the plan states, each with a pinning case.

## Owner-decision state

- OD-2 (D-05 narrowing: the closed sets need no edit): still pending owner acknowledgement. The Key Decisions row says so; the router table, subscriber order and probe shape are unchanged.
- OD-1 (golden regeneration order): unchanged, still pending.
- FOUND-19 is also declared by plan 15-06, so it is not marked complete here (shared-ID gate).

## Self-Check: PASSED

- Modified files exist: `src/sim/world/kill.ts`, `src/sim/world/step.ts`, `src/sim/combat/step.ts`, `src/sim/sim.ts`, `tests/sim/world/kill.test.ts`, `tests/sim/combat/ident.test.ts`, `.planning/PROJECT.md`.
- Commits `68da4c0` and `fa47bfb` are ancestors of HEAD; `commits: 2` is measured from the plan-head ledger (`ab7818b..HEAD`).
