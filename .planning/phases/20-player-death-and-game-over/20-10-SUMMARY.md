---
phase: 20-player-death-and-game-over
plan: 10
subsystem: docs-fidelity-gates
tags: [fidelity, key-decisions, divergence-register, verify-full, acceptance, e2e-cross, close-out]

requires:
  - phase: 20-player-death-and-game-over
    provides: "20-01 death rule and measured rams; 20-04, 20-05, 20-07 game-over view; 20-08 dead scene; 20-09 twin and browser specs; 20-11 explosion kinds; 20-REVIEWS.md rounds 1 and 2"
provides:
  - "PROJECT.md Key Decisions for Phase 20: the death rule at the damage point, the player destroyable, the explosion layer (pool 16, kinds, one flash, dead-view debris drift), the playerDestroyed payload, the reload behind one latch, the game-over view, the dead presentation"
  - "FIDELITY.md rows and excerpts E-171 to E-180 for every Phase 20 mechanic and divergence DIV-1 to DIV-9, each divergence with its reviewers' cited verdicts"
  - "FIDELITY.md constants-ledger rows for the fade, the camera setback, the no-draw factor, the explosion factor and pool, and the two burst kinds"
  - "DEATH-01 requirement text reworded for the reload (D-12)"
  - "The phase gate records: remote verify-full, the 20-seed acceptance run 21 of 21, one e2e-cross run, all at the phase HEAD"
affects: [phase-20-verification, complete-milestone]

actuals:
  tokens: 16800
  tasks: 3
  commits: 2
plan_head_before: 74912713e209330af59b188e1c84442192907cbc
plan_head_after: 6de2dbcc75035e7c88f6c2cbf7ad09a0f8050ccd

tech-stack:
  added: []
  patterns:
    - "Key Decisions titles written first and pasted into FIDELITY rows by script, never retyped"
    - "Line-drift check by git diff hunk offsets between the baseline and HEAD, exact for every unchanged line"

key-files:
  created:
    - .planning/phases/20-player-death-and-game-over/20-10-SUMMARY.md
  modified:
    - FIDELITY.md
    - .planning/PROJECT.md
    - .planning/REQUIREMENTS.md
    - .planning/todos/pending/2026-11-18-mutual-kill-credit-symmetry.md
  renamed:
    - ".planning/todos/pending/2026-11-19-collision-reversal-on-player-death.md -> .planning/todos/completed/"

key-decisions:
  - "The fade row is recorded as faithful with its notes in the Mechanic cell, because the contract test accepts only the bare word faithful in the Fidelity cell"
  - "CHANGELOG needed no correction: the 20-01 and 20-07/20-08 entries already describe what ships, and 20-09 confirmed the idle-launch sentence on a traffic-on session"

requirements-completed: [DEATH-01, DEATH-06, QUAL-11]

coverage:
  - id: D1
    description: "Key Decisions rows and amendments for Phase 20, DEATH-01 text reworded for the reload (D-12), E-45 rewritten for the amended title"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/contract/fidelity.test.ts (always-on and verbatim modes at the extracted pin 7437f22)"
        status: pass
    human_judgment: false
  - id: D2
    description: "FIDELITY rows and excerpts E-171 to E-180 for every Phase 20 mechanic and divergence, constants-ledger rows, interim E-132 row faithful"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/contract/fidelity.test.ts (both modes)"
        status: pass
      - kind: other
        ref: "sh scratchpad/fidelity-drift/check.sh prints only the two rows rewritten on purpose"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every divergence row cites explicit accepting verdicts from 20-REVIEWS.md (rounds 1 and 2) and no unresolved objection"
    requirement: DEATH-01
    verification:
      - kind: manual_procedural
        ref: "the DIV-1 to DIV-9 checklist below, re-read against the file at 4e28360 and c467a50 before any row was written"
        status: pass
    human_judgment: false
  - id: D4
    description: "QUAL-11: the frozen 20-seed acceptance run is 21 of 21 at the phase HEAD"
    requirement: QUAL-11
    verification:
      - kind: integration
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance (snapshot 6de2dbc, exit=0, 21 passed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Criterion 5: verify-full exits 0 at the phase HEAD with death-and-reload and game-over-guard in it; one e2e-cross run recorded"
    requirement: DEATH-06
    verification:
      - kind: e2e
        ref: "wegolite-remote-run.sh run --rm verify-full (snapshot 6de2dbc, exit=0, Vitest 7549 passed, Playwright 150 + 2 passed)"
        status: pass
      - kind: e2e
        ref: "wegolite-remote-run.sh run --rm e2e-cross (snapshot 6de2dbc, exit=0, 2 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "How the death looks and reads in Chromium and Firefox: the explosion, the one flash, the small bursts, wreckage drifting, the fade, the four lines over a bright station face, the idle-launch death"
    verification: []
    human_judgment: true
    rationale: "Visual and cross-browser judgment that no test asserts; the end-of-phase UAT items are listed below"

duration: 29min
completed: 2026-11-23
status: complete
---

# Phase 20 Plan 10: Close-out Summary

**Phase 20's decisions, divergences and gates are on record: four new Key Decisions rows and three amended ones, FIDELITY rows E-171 to E-180 with the DIV-1 to DIV-9 reviewer verdicts cited, 33 drifted line cells re-pointed, the collision-reversal todo closed, and `verify-full`, the 20-seed acceptance run (21 of 21) and one `e2e-cross` run all green at the phase HEAD.**

## Performance

- **Duration:** about 29 min of agent time (the three remote runs took 887 s, 84 s and 63 s)
- **Started:** 2026-11-23T19:37:14Z
- **Completed:** 2026-11-23T20:07Z
- **Tasks:** 3 (two commits; Task 3 is a gate run that changes no file)
- **Files modified:** 5 (plus this SUMMARY); one rename

## Task Commits

1. **Task 1: Key Decisions rows, REQUIREMENTS wording, E-45 rewrite, the death-rule row and E-171 (tracer)** - `f3e0e5c` (docs)
2. **Task 2: the remaining FIDELITY rows, excerpts E-172 to E-180, ledger rows, drift re-pointing, the todos** - `6de2dbc` (docs)
3. **Task 3: the phase gate** - no commit; the records are below

**Plan metadata:** the commit that adds this SUMMARY (docs).

## DIV-1 to DIV-9 agreement checklist (built before any row; read from `20-REVIEWS.md` at `4e28360` and `c467a50`)

Round 1 anchors (`@4e28360`): the per-reviewer "Divergence verdicts" sections at Fable L324-333, Sonnet L590-599, Kimi K3.1 Pro L907-916 (DIV-n at Fable L325+n, Sonnet L591+n, Kimi L908+n) and the Consensus table L926-935 (DIV-n at L927+n). Round 2 anchors (`@c467a50`): `## Round 2` L954, Fable L981-983, Sonnet L995-997, DeepSeek v4.1 Flash L1009-1011, consensus L1018-1020. The file is unchanged between `c467a50` and HEAD.

| DIV | Decision | Fable | Sonnet | Kimi K3.1 Pro | DeepSeek v4.1 Flash | Key Decisions title the row quotes |
|-----|----------|-------|--------|---------------|---------------------|------------------------------------|
| DIV-1 | launching player never dies | ACCEPT L326 | ACCEPT L592 | ACCEPT L909 | - | the energy-floor row (T-floor) |
| DIV-2 | explosion particle form (D-01, D-01a) | OBJECT L327, resolved by the owner decision of 2026-11-22 (20-CONTEXT.md D-01); round 2 ACCEPT L982 | ACCEPT L593; round 2 L996 | ACCEPT L910 | round 2 ACCEPT L1010 (consensus L1019) | the dead-presentation row (T-pres) |
| DIV-3 | cause line (D-02) | ACCEPT L328 | ACCEPT L594 | ACCEPT L911 | - | the game-over view row (T-view) |
| DIV-4 | no 30 s restart (D-06) | ACCEPT L329 | ACCEPT L595 | ACCEPT L912 | - | T-view |
| DIV-5 | fresh Space and click (D-07) | ACCEPT L330 | ACCEPT L596 | ACCEPT L913 | - | T-view |
| DIV-6 | reload to the title (D-12) | ACCEPT L331 | ACCEPT L597 | ACCEPT L914 | - | the reload row (T-reload) |
| DIV-7 | frozen world (D-01c, D-01d) | ACCEPT L332; round 2 L983 | ACCEPT L598; round 2 L997 | ACCEPT L915 | round 2 ACCEPT L1011 (consensus L1020) | T-pres |
| DIV-8 | no equipment removal | ACCEPT L333 | ACCEPT L599 | ACCEPT L916 | - | T-pres |
| DIV-9 | one flash (D-01b) | round 2 ACCEPT L981 | round 2 ACCEPT L995 | - (round 1 never saw DIV-9) | round 2 ACCEPT L1009 (consensus L1018) | T-pres |

No unresolved objection remains (DIV-2's is resolved by the owner decision; DIV-7's round-2 condition "state how the redraw is bounded" is met by the D-01d visibility bound, so the acceptance stands with no new verdict). The precondition held; nothing halted.

The titles (pasted by script from `PROJECT.md`, each asserted present and free of quotes and pipes):

- T-floor: `Decide the player's death where the damage is applied, and floor the banks at 0 for display (Phase 20, D-04, D-11)`
- T-payload: `The playerDestroyed payload carries the cause and never an entity id (Phase 20, D-04, D-09)`
- T-reload: `Game over is a page reload behind one session latch, ahead of every save path (Phase 20, D-12, DEATH-06)`
- T-view: `The game-over view shows Oolite's three lines and a cause line, and ends on a fresh Space or a click, with no timer (Phase 20, D-02, D-06, D-07)`
- T-pres: `The dead presentation: the aft view, the explosion, the fade and the frozen world (Phase 20, D-01 to D-01d)`

## Key Decisions (`.planning/PROJECT.md`)

- **Rewritten:** the energy-floor row (new title T-floor; the ledger decides the death where the damage is applied, only while `inFlight`; the banks floor at 0 for display; a launching bank floors instead of dying, with Fable's citations `PlayerEntity.m:5604-5611`, `:6189-6190`, `ShipEntity.m:11646-11649`).
- **Amended:** the collisions row (the player is `destroyable`; the tripwire sentence replaced by its retirement; the idle-launch sentence now says the player is destroyed, with the 20-01 and 20-09 measurements); the explosions-and-debris row (title unchanged; pool of 16, seed variant, burst kind, no flash, the player's eight adds with one flash, the dead-view debris drift with no time limit, the redraw bounded by visibility); the two stale "until Phase 20" mentions in the kill-path row and the internal-damage cap row (Rule 2, listed under deviations).
- **New:** T-payload, T-reload (with the service-worker network dependency), T-view, T-pres.
- **`REQUIREMENTS.md`:** DEATH-01 now says the page reloads to the title, which offers Continue from the last save, and cites `(D-12)`; no checkbox or traceability change.

## FIDELITY rows and excerpts

| Row (Mechanic, short) | Wegolite cell | Oolite cell | Fidelity | Excerpt |
|-----------------------|---------------|-------------|----------|---------|
| E-45 overflow to the energy bank (rewritten) | `shields.ts:170` (the floor's code line; was a doc line at 152) | `PlayerEntity.m:5666-5677` | divergence (DIV-1), quotes T-floor | E-45 |
| death rule at the damage point (DIV-1) | `ledger.ts:237` | `PlayerEntity.m:5683-5689` | divergence, T-floor | E-171 |
| mutual kill, both die (D-09) | `step.ts:852` | `PlayerEntity.m:5683-5689` | faithful | E-171 |
| dead view aft, 100 m setback, HUD hidden | `render-driver.ts:403` | `PlayerEntity.m:6202-6209` | faithful | E-172 |
| the player's explosion (DIV-2) | `event-router.ts:871` | `ShipEntity.m:8308-8320` | divergence, T-pres | E-173 |
| one flash (DIV-9) | `event-router.ts:880` | `ShipEntity.m:8308-8320` | divergence, T-pres | E-173 |
| the fade (linear 5 s, text with the scene) | `render-driver.ts:513` | `PlayerEntity.m:3566-3585` | faithful | E-174 |
| four lines and the cause line (DIV-3) | `game-over.ts:119` | `PlayerEntity.m:3630-3644` | divergence, T-view | E-175 |
| no 30 s auto-restart (DIV-4) | `frame-loop.ts:124` | `PlayerEntity.m:3551-3564` | divergence, T-view | E-176 |
| fresh Space or click (DIV-5) | `game-over.ts:188` | `PlayerEntityControls.m:4016-4027` | divergence, T-view | E-177 |
| reload instead of the direct load (DIV-6) | `game-over.ts:173` | `Universe.m:2961-2968` | divergence, T-reload | E-178 |
| the frozen world (DIV-7) | `sim.ts:84` | `PlayerEntity.m:2450-2453` | divergence, T-pres | E-179 |
| no equipment removal (DIV-8) | `death.ts:64` | `PlayerEntity.m:6220-6220` | divergence, T-pres | E-180 |
| E-132 interim row, now faithful | `collide.ts:440` | `ShipEntity.m:11111-11112` | faithful | E-132 |

All Oolite cells are `src/Core/...:a-b` ranges and every excerpt was copied from the extracted pin tree (never typed); the plist strings are cited inline as `third_party/oolite/Config/descriptions.plist:1991-1993` and `Resources/Config/descriptions.plist:1990-1993` (line 1990 is the escape-pod string, the same lines in both copies). Constants-ledger rows added: `GAME_OVER_FADE_SECONDS`, `DEAD_CAMERA_SETBACK_M`, `NO_DRAW_DISTANCE_FACTOR`, `PLAYER_EXPLOSION_FACTOR`, `EXPLOSION_POOL` (Wegolite's own), and one row per burst kind (`SMALL_BURST_*`, `BIG_BURST_*`, with their `OOParticleSystem.m` lines). The DIV-2 row names the per-particle fade, the colours, the particle counts (29 and 15 at r = 72.7: `0.2 r` truncates to 14 and 14 or-ed with 3 is 15), the velocity drift and the texture; the DIV-9 row says Oolite's player death shows no flash and cites the reduced-detail precedent `ShipEntity.m:7945-7953`; the DIV-7 row lists the moving and still layers, the debris that never burns out or collides, the fireball in place against Oolite's coasting camera, and the visibility bound. The unmodelled `releaseCargoPodsDebris` and `noteKilledBy:` are in the explosion row.

Each divergence row's `Reviewers:` field names only the models whose verdicts are in the checklist, with the line anchors above. The contract test passes in both modes (always-on, and verbatim at the pin extracted with `git archive 7437f22 src Resources/Config`).

## The E-45 rewrite and the drift table

E-45 was rewritten in Task 1, the task that deleted its quoted title: the reason now says the bank floors at 0 for display while the ledger decides the death (in flight this matches `getDestroyedBy:`, `PlayerEntity.m:6198`), quotes T-floor and cites DIV-1.

The drift check compares, for every row of `git show a5a03ce:FIDELITY.md` whose Mechanic cell is unchanged and whose Wegolite file Phase 20 edited, the trimmed source line the old cell named with the line the current cell names. It first printed 34 rows; the mapping used `git diff -U0 a5a03ce HEAD` hunk offsets, exact for every unchanged line. 32 cells moved to the line that now holds the same text; two are rewritten on purpose:

| Row | Old cell and text | New cell and text | Why |
|-----|-------------------|-------------------|-----|
| E-45 overflow to the energy bank | `shields.ts:152` `* heats the cabin by ENERGY_DAMAGE_TO_HEAT_FACTOR per point while it is` (a doc line) | `shields.ts:170` `state.energy = Math.max(0, state.energy - remaining);` | the row's reason is the floor, so the cell is the floor's code line |
| Flight HUD drawn while launching (FLGT-05) | `render-driver.ts:368` `const hudHidden = currentState.mode === "docked" && !preRolling;` | `render-driver.ts:570` `const hudHidden = (currentState.mode === "docked" && !preRolling) \|\| dead;` | 20-08 added the dead branch to the statement the row cites; the row already says only dead, the escape sequence and game start skip the HUD |

The 32 re-pointed cells (old line to new line): `arrival.ts` 125 to 127; `flight/step.ts` 272 to 275, 213 to 216, 454 to 457; `shields.ts` 175 to 176, 205 to 207; `combat/step.ts` 342 to 343, 577 to 578, 370 to 371, 321 to 322, 667 to 668, 807 to 821; `ledger.ts` 173 to 184, 221 to 249 (two rows); `explosions.ts` 112 to 126, 115 to 129; `event-router.ts` 357 to 383; `chart-controller.ts` 199 to 203; `render-driver.ts` 268 to 423; `collide.ts` 755 to 747, 283 to 272, 323 to 312, 620 to 612, 716 to 708, 479 to 468, 436 to 425, 628 to 620, 731 to 723, 458 to 447, 642 to 634; `response.ts` 315 to 317. After the edit the check prints only the two rows above.

The mechanics and ledger tables were re-padded by `prettier --write` (about 190 rows of whitespace-only change) because the new rows are wider than the old widest cell; the diff of `FIDELITY.md` is large for that reason, the content change is the rows and excerpts above.

## Todos, CHANGELOG, NOTICE and ASSETS

- `2026-11-19-collision-reversal-on-player-death.md` moved with `git mv` to `.planning/todos/completed/` with a `## Resolution (2026-11-23)` section (fixed in 20-01's death commit `b10e191`; the energy-bank-only detail kept). The pending copy is gone; this is the one planned deletion from `pending/`.
- `2026-11-18-mutual-kill-credit-symmetry.md` stays pending with a `## Phase 20 check (2026-11-23)` section: checked (D-09), no kill-credit consumer added, open for LAW-*.
- **CHANGELOG:** no correction. `## [Unreleased]` already holds 20-01's `Changed` line (including the idle-launch sentence) and 20-07's `Added` game-over entry with 20-08's explosion, aft view and "black and white" fade sentence. The idle-launch sentence holds for the production default: 20-01 measured contact at tick 6450 (dam1 427.948 against 128 shield plus 256 bank) and 20-09's scratch run through the real driver with traffic on died at tick 6456. No version edit, no section move.
- **NOTICE and ASSETS:** the phase adds no asset (the strings cite the already listed vendored `descriptions.plist`; the explosion reuses listed textures); `git diff --name-only a5a03ce HEAD -- public third_party NOTICE ASSETS.md` is empty, so no provenance row was added.
- `git diff --name-only a5a03ce HEAD -- package.json package-lock.json tests/acceptance` is empty.

## Gate records (all at snapshot `6de2dbc`, the Task 2 commit and the last code or doc change; the SUMMARY commit adds only this file)

| Run | Command | Result |
|-----|---------|--------|
| `verify-full` | `wegolite-remote-run.sh run --rm verify-full` | `exit=0 elapsed=887s snapshot=6de2dbc`; Vitest 288 files, 7549 passed, 10 skipped; Playwright 150 passed (12.3 min) plus 2 passed in the second stage; `death-and-reload.spec.ts` (two tests, 7.3 s and 6.1 s) and `game-over-guard.spec.ts` (22.4 s) passed; no failure and no flake rerun |
| acceptance | `wegolite-remote-run.sh run --rm test npm run test:acceptance` | `exit=0 elapsed=84s snapshot=6de2dbc`; 21 of 21 passed (20 epochs plus the aggregate), thresholds and detectors untouched |
| `e2e-cross` | `wegolite-remote-run.sh run --rm e2e-cross` | `exit=0 elapsed=63s snapshot=6de2dbc`; Firefox: `core-loop` (48.2 s) and `engine` (9.8 s) passed |

Trigger-path check: `git diff --name-only a5a03ce HEAD -- src/sim/npc src/sim/world src/content/generated/ships-npc.json` prints exactly `src/sim/world/contacts.ts` (20-08, D-01c, the read-only copied velocity); the acceptance run above is the AGENTS.md rerun after it. Local gates for this plan: `lint` exit 0; the contract test passes in both modes; no `src/` file changed, so no local `test` or `typecheck` run is owed (the remote `verify-full` ran both).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Two stale "until Phase 20" sentences in other Key Decisions rows**
- **Found during:** Task 1 (`rg` for the retired marker and the floor phrases)
- **Issue:** the kill-path row said the player's energy "still floors at 0 until Phase 20", and the internal-damage cap row said the cap is observable "only through the Phase 20 gap (Wegolite's player survives at energy 0)"; both became false with the death.
- **Fix:** reworded to the shipped behaviour (the floor is for display and the death is decided at the damage point; the cap is observable only through the roll count of a hit that also kills the player).
- **Files modified:** `.planning/PROJECT.md`
- **Verification:** `rg` for the old phrases prints nothing; the contract test passes.
- **Committed in:** `f3e0e5c`

**2. [Rule 3 - Blocking] Prettier re-padded the whole FIDELITY tables**
- **Found during:** Task 1 (`prettier --check` is part of `lint`)
- **Issue:** the new rows are wider than the tables' widest cell, so prettier re-aligns every row.
- **Fix:** ran `prettier --write FIDELITY.md` in the container; the contract test and `lint` pass.
- **Files modified:** `FIDELITY.md`
- **Committed in:** `f3e0e5c`, `6de2dbc`

**Total deviations:** 2 auto-fixed (Rule 2, Rule 3). **Impact:** documentation consistency and formatting only; no scope creep.

### Process notes

- The scratch drift script, the extracted pin tree and the generator scripts lived under the session scratchpad instead of `/tmp/fidelity-drift` and `/tmp/oolite-7437f22` (the harness directs scratch files there); nothing was added to the repository.
- The contract test takes the first double-quoted substring of a divergence cell as the decision, so no divergence text carries another double quote, and the `|` of Oolite's bitwise-or in the burst counts is written in words (a pipe would split the table cell).
- The fade row is `faithful`; its notes (shader-detail condition, the CSS fallback not needed in the live Chromium check, Firefox a UAT item) sit in the Mechanic cell, since the Fidelity cell must be exactly the word `faithful`.
- A per-plan commit ledger was written to the git directory and `commits: 2` is measured from it (`git rev-list --count 74912713..HEAD` at SUMMARY time; the SUMMARY commit makes 3).

## End-of-phase UAT items for the human (not run here)

Use the production default (traffic on). The idle-launch buoy death must be tried without `?test=1`, or with `?test=1&traffic=1`; never `?test=1` alone, which turns traffic off and removes every player collision.

1. **Die in flight in Chromium and Firefox** (for example the 350 m/s buoy ram, or a hook-spawned Viper's laser): the view turns aft, the explosion plays (four small and four big bursts, one flash at the start), the HUD and the title and status texts disappear, the picture and the four lines fade to grey over about five seconds, nothing else on the page moves the sim; Space or a click returns to the title with Continue; Continue resumes the last save. The orchestrator's live Chromium check already saw the four lines (`Game Over`, `Destroyed by GalCop Viper`, `Score: Harmless (0), 100.0 ₢`, `Press Space`), `saturate(0)` after the fade, the tick frozen, redraw idle, P, F2, Escape and H doing nothing, no save write and a fresh Space reloading to the title with Continue.
2. **The explosion's look (owner judgement, recorded as observations, not tuned here):** whether the one flash (Oolite's ordinary flash: 1x the collision radius, about 73 m, seen from 100 m, growing by about 10.9 km/s for 0.4 s, alpha peaking at 0.5) fills the view and hides the eight bursts, and whether the four small bursts (particles of 8 to 32 m with the cloud texture) read as fast sparks or as small puffs.
3. **Legibility of the four lines over a bright station face:** the live screenshot showed `Destroyed by GalCop Viper` partly lost against the lit station; judge whether the lines are legible enough or need a backing.
4. **Wreckage from earlier kills** keeps drifting and tumbling with no time limit while ships, buoys, the station and the dust stand still (D-01c, D-01d).
5. **The CSS fade in both browsers** (assumption A1): whether the saturate filter shows on the WebGL canvas in Chromium and Firefox; the named fallback is a full-screen `backdrop-filter: saturate(s)` layer between `#view` and `#game-over`.
6. **The four-line layout and wording.**
7. **The idle launch:** launch and touch nothing; about 54 s of sim time later (more than a minute of wall time on a slow machine) the ship rams the navigation buoy and is destroyed, as 20-01's pinned scenario says and the CHANGELOG line states.

## Known Stubs

None.

## Threat Flags

None. Documentation and gate runs only; no endpoint, auth path, file access or schema change.

## Next Phase Readiness

All three plan tasks are done and the phase's code and documentation are complete. The phase verification can check DEATH-01, DEATH-06 and QUAL-11 against the records above; the UAT items need a human.

## Self-Check: PASSED

- Files exist: `FIDELITY.md`, `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/todos/completed/2026-11-19-collision-reversal-on-player-death.md`, `.planning/todos/pending/2026-11-18-mutual-kill-credit-symmetry.md`; the pending copy of the collision-reversal todo is absent (the one planned deletion).
- Commits `f3e0e5c` and `6de2dbc` are ancestors of HEAD; both contract-test modes, `lint`, the drift check and every Task 1 and Task 2 acceptance grep were run and passed; the three remote runs exited 0 at `6de2dbc`.

---
*Phase: 20-player-death-and-game-over*
*Completed: 2026-11-23*
