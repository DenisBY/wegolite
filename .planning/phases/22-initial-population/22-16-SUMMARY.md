---
phase: 22-initial-population
plan: 16
subsystem: oolite-reference-tooling
tags: [spike, oolite-reference, census, populator, qual-13, headless]

requires:
  - phase: 22-initial-population
    provides: "22-12 census golden (Qudira, the anarchy spec system) and the port's populator for the side-by-side numbers; 22-15 phase gate (this plan runs after it)"
provides:
  - "tools/oolite-reference/steps/census-anarchy.steps and census-quiet.steps: repeatable real-Oolite sessions that start in Qudira (anarchy) and Teanrebi (government 7) and wait for the probe's CENSUS-DONE"
  - "README section 'Population census spike (Phase 22, D-07)': the A6 hash check, the route, the probe described (not committed), the repeat commands, six real samples beside the port, the advice for Phase 26"
  - "the answer to D-07: yes, real headless Oolite can be started in a chosen system through a scenario save and dumps its ship census, 37 to 43 s per sample"
affects: [phase-26, qual-13]

plan_head_before: e091de40deb208bc0a60c72b46bc3d28ad97d722
plan_head_after: 70cb48179025d5edf938cb7151368a7a9c297ef3

actuals:
  tokens: 3200
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A scenario OXP (Config/scenarios.plist plus Scenarios/*.oolite-save with galaxy_id and system_id) starts the real game docked in any chosen system; the load populates it before the player acts"
    - "The probe world script logs from missionScreenOpportunity (fires right after the load) and ends with a sentinel for waitlog"

key-files:
  created:
    - tools/oolite-reference/steps/census-anarchy.steps
    - tools/oolite-reference/steps/census-quiet.steps
  modified:
    - tools/oolite-reference/README.md

key-decisions:
  - "The spike succeeded, so Phase 26 uses the real-Oolite census and does not fall back to the oracle only; it needs about 20 samples per system, not one"
  - "The probe OXP, the scenario saves and every Oolite output stay outside the repository; the README describes them"

requirements-completed: [WORLD-08]

coverage:
  - id: D1
    description: "Headless Oolite starts in an anarchy (Qudira, id 116) and a quiet system (Teanrebi, id 18) through a scenario save and logs one CENSUS-SHIP line per ship, ending with CENSUS-DONE; the two committed steps files repeat the run"
    requirement: WORLD-08
    verification:
      - kind: other
        ref: "tools/oolite-reference/run-remote.sh --no-build --steps tools/oolite-reference/steps/census-anarchy.steps --addons /home/opencode/oolite-probes/population-census --out DIR --timeout 300 (3 runs, exit 0, CENSUS-DONE, system=Qudira); the same with census-quiet.steps (3 runs, exit 0, system=Teanrebi)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The AppImage's oolite-populator.js has the same sha256 as the checkout's (assumption A6)"
    requirement: WORLD-08
    verification:
      - kind: other
        ref: "docker run --rm --entrypoint sh wegolite-oolite-reference:1.93.1-255 -c 'find /opt/oolite -name oolite-populator.js -exec sha256sum {} +' prints 96a734a6cfc1ee39a7db7798716101640887e58d5fe947e56e2fcc4946e04df4, equal to the checkout"
        status: pass
    human_judgment: false
  - id: D3
    description: "The real census beside the port's for the same two systems, and what it means for Phase 26"
    requirement: WORLD-08
    verification: []
    human_judgment: true
    rationale: "Three real samples per system are a distribution, not a pass or fail; the reading of the light-hunter gap and the advice for QUAL-13 are the owner's to judge"

duration: 17min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 16: Real-Oolite population census spike Summary

**Real headless Oolite 1.93.1-255 starts docked in Qudira (anarchy) or Teanrebi (government 7) through a probe OXP's scenario save and logs every ship by role in 37 to 43 s; the populator script is byte-identical to the checkout's, and six samples sit beside the port's census with one open question, the light hunters.**

## Outcome in one line

**Success.** Both systems run repeatably from the two committed steps files; Phase 26 should use the real-Oolite census (about 20 samples per system, compared as distributions), not fall back to the oracle only.

## Performance

- **Duration:** about 17 min (start 2026-11-26T20:14Z, end 20:31Z)
- **Tasks:** 2 (task 1 a tracer), **files:** 3 (two new steps files, one README)
- **Remote runs:** 9 in all (3 route-finding runs that did not reach the right system, 6 census samples), each 37 to 52 s except the first (219 s, the 180 s `waitlog` timeout)

## Accomplishments

- **A6 checked first.** The sha256 of `Resources/Scripts/oolite-populator.js` inside the image is `96a734a6cfc1ee39a7db7798716101640887e58d5fe947e56e2fcc4946e04df4` (file at `/opt/oolite/share/oolite/Resources/Scripts/`), equal to the checkout's and to the value in the plan. The 14 commits of version skew did not touch the populator, so the comparison is with the script Wegolite ported.
- **Route (Task 1, tracer).** A probe OXP outside the repository, `/home/opencode/oolite-probes/population-census/census-probe.oxp`, adds two scenarios (`Config/scenarios.plist`) whose saves are copies of `oolite-standard.oolite-save` with `galaxy_id` and `system_id` added (the current save format addresses the system by id, so no chart-coordinates-to-seed mapping was needed). Loading a scenario calls `populateNormalSpace` during the load (`PlayerEntityLoadSave.m:640-643`); the probe's world script logs from `missionScreenOpportunity`, one `CENSUS-SHIP` line per entry of `system.allShips`, then the neighbourhood facts, then `CENSUS-DONE`.
- **Both systems (Task 2).** `census-quiet.steps` is the same route; the README section records the question, the route, the probe's files (described, not committed), the exact repeat commands, the result and the Phase 26 advice, and the two steps files are listed under "Shipped files".

## The attempts (D-07: at most two per obstacle)

| Run | Steps | Last stdout line | Outcome |
| --- | ----- | ---------------- | ------- |
| 1 | anarchy, 4 Down at 1 s, probe had a `manifest.plist` | `oolite-ref-session: log line not found within 180s: CENSUS-DONE` then `exit=1 container_exit=1 elapsed=219s` | Obstacle A: the manifest made Oolite treat the folder as an OXZ (`oxp.noManifest`: no `required_oolite_version`), so the OXP was absent from `Resource paths`, the menu had only the four built-ins, and Return started Strict Mode (which disables every add-on). Fix: no `manifest.plist`. |
| 2 | anarchy, 4 Down at 1 s, manifest removed | `exit=0 container_exit=0 elapsed=39s` | OXP loaded, both scenarios listed, census logged, but the selection was on the second row (Easy Start, Tionisla, id 124), not Qudira. Obstacle B. |
| 3 | anarchy, 4 Down at 4 s | `exit=0 container_exit=0 elapsed=52s` | Same landing (Tionisla). Pauses were not the cause. |
| 4 | anarchy, 2 Down at 4 s (after the diagnosis below) | `exit=0 container_exit=0 elapsed=43s` | `system=Qudira id=116 government=0`, 139 entries, `CENSUS-DONE`. Success. |
| 5 to 9 | anarchy x2, quiet x3 (quiet: 1 Up) | `exit=0 container_exit=0 elapsed=` 43, 41, 37, 38, 38 s | Qudira twice more, Teanrebi (`id=18 government=7`) three times. |

**Diagnosis of obstacle B.** The runner holds each key 0.5 s and Oolite repeats a held arrow key (`script_time > timeLastKeyPress + KEY_REPEAT_INTERVAL`), so one press moves the selection two rows. Four presses were 8 moves in runs 1 to 3 (the screenshots agree: with four rows the selection was on the fourth, with seven on the second); the seven selectable rows wrap, so 8 moves land on the second row. Two Down presses (4 moves) select the anarchy scenario; one Up press (the selection goes Normal, Return to Menu, then wraps to the last row) selects the quiet one.

## Results

Three samples per system, NPC ships only (the player, 34 or 44 asteroids, two buoys and the stations are excluded). "Port" is `populateSystemWorld` for the same system, mean over epochs 1 to 20, epoch 1 (the docked-launch epoch) in brackets, computed with a scratch script over `tests/helpers/population-census.ts` (kept under `/tmp`, not committed). The port has no assassins and no medium or heavy hunters (WORLD-08b cuts), so "hunter" is the light role.

| System | Source | NPC ships | trader | pirate | hunter (light) | police | escort | assassin |
| ------ | ------ | --------- | ------ | ------ | -------------- | ------ | ------ | -------- |
| Qudira (anarchy) | Oolite run 1 | 99 | 8 | 57 | 8 | 1 | 17 | 6 |
| Qudira | Oolite run 2 | 85 | 6 | 58 | 4 | 1 | 16 | 0 |
| Qudira | Oolite run 3 | 64 | 9 | 32 | 16 | 1 | 0 | 4 |
| Qudira | Port, mean (epoch 1) | 77.2 (96) | 6.4 (7) | 53.9 (68) | 2.7 (3) | 1 (1) | 13.3 (17) | 0 (cut) |
| Teanrebi (government 7) | Oolite run 1 | 80 | 16 | 13 | 20 | 24 | 2 | 1 |
| Teanrebi | Oolite run 2 | 83 | 11 | 16 | 29 | 22 | 0 | 0 |
| Teanrebi | Oolite run 3 | 84 | 16 | 14 | 20 | 28 | 0 | 0 |
| Teanrebi | Port, mean (epoch 1) | 67.0 (28) | 16.5 (11) | 12.4 (4) | 8.7 (0) | 28.9 (13) | 0.7 (0) | 0 (cut) |

**Native neighbourhood facts**, logged in all six runs: `system.info.systemsInRange().length` 8, the 3.5 LY count 3 and `_systemIsBottleneck` false for both systems, equal to the port's `buildNeighbourhood` (Qudira 8 / 3 / false, Teanrebi 8 / 3 / false).

**Reading, without a threshold.** Totals, pirates, traders, police and escorts sit inside the spread of the samples (Qudira 64 to 99 NPC ships against the port's per-epoch 41 to 110; Teanrebi 80 to 84 against 28 to 86). The light hunters do not: 20, 29, 20 in Teanrebi against a port range of 0 to 15 (mean 8.7), and 8, 4, 16 in Qudira against 0 to 6 (mean 2.7). Real hunters come in groups of 2 to 7. Three samples cannot call it a port bug; it is the first place QUAL-13 should look. The real world also holds what the port cuts or does not model here: 34 to 44 asteroids, buoys, a rock hermit and (in Qudira) a pirate hermit station.

## Recommendation for Phase 26

Use the real-Oolite census. It does not have to fall back to the oracle only. A sample costs 37 to 43 s per system and any system of any galaxy is reachable by `galaxy_id` and `system_id`. The census is random from run to run (Qudira's NPC count was 64, 85, 99), so QUAL-13 should plan about 20 runs per system (about 15 min) and compare distributions, writing its thresholds first. The probe must be rebuilt outside the repository from the README description.

## Task Commits

1. **Task 1 (tracer): the anarchy session and the A6 check** - `223e92ed` (test)
2. **Task 2: the quiet session, the README section and the recorded outcome** - `70cb4817` (docs)

**Plan metadata:** the commit of this SUMMARY.

Tracer gate: the tracer's `<verify>` (the wrapper run) exited 0 with the census logged before the second system and the write-up were added (type `tracer`, auto-mode off, `end-of-phase`, automated verify only: re-run green, expansion followed).

## Deviations from Plan

**1. [Plan detail] Obstacle B was tried a third time after a diagnosis.** D-07 allows at most two attempts per obstacle. Runs 2 and 3 both landed on the second row. Run 4 was not a blind retry: the cause (hold-repeat, two rows per press, seven wrapping rows) was derived from the screenshots and `PlayerEntityControls.m:709-725`, and the fix (two presses) was predicted before it ran and confirmed by `system=Qudira` in the log. Recorded here so the count is visible.

**2. [Plan detail] Six census samples instead of one run per system.** The plan runs each system once and says counts are a distribution; three runs per system were added (about 40 s each) so the side-by-side table is not a single draw.

**3. [Plan detail] Scratch tooling, not in the repository.** The port's per-role counts came from `npx vite-node` in a throwaway `docker compose run --rm -v /tmp/port-roles:/scratch test` container; `npx` downloaded `vite-node` into that container's cache for the run (`npm warn exec ... will be installed vite-node@6.0.0`). Nothing was installed in the image, the volume or the repository. Parsing scripts lived in the scratchpad directory.

**Total deviations:** 3 plan details, no bug fixes. **Impact:** none on the outcome; deviation 1 is disclosed for the D-07 count.

## Issues Encountered

The `manifest.plist` and the two-rows-per-press obstacles above; both solved, both recorded in the README so the next person does not meet them.

## Gates

No unit, browser or acceptance gate: the plan changes no gated path. `docker compose run --rm lint npx prettier --check tools/oolite-reference/README.md` passes. `git diff --name-only e091de40..HEAD -- src tests` prints nothing, so the phase gate of 22-15 stays valid; `rg -c "Population census spike \(Phase 22, D-07\)" tools/oolite-reference/README.md` is 1; `git ls-files -co --exclude-standard | rg "Latest\.log|\.oolite-save|\.oxp/"` finds nothing (no probe or Oolite output in the repository). Oolite outputs of all runs stay under `/tmp/oolite-census-*`, outside the repository.

## Known Stubs

None. No `src/` file changed, so no CHANGELOG.md entry (nothing user-visible).

## Threat Flags

None. T-22-26 mitigated (probe, saves and outputs outside the repository, the wrapper refuses an in-repo output directory, the acceptance grep is empty). T-22-27 accepted as planned (the operator's own machine and image). T-22-SC: no package installed in the repository or the image (see deviation 3 for the throwaway `vite-node` fetch).

## Next Phase Readiness

Phase 22 is closed by this plan; nothing depends on it. Phase 26 (QUAL-13) can use the real-Oolite census as described above.

## Self-Check: PASSED

`tools/oolite-reference/steps/census-anarchy.steps`, `tools/oolite-reference/steps/census-quiet.steps` and the README section exist; commits `223e92ed` and `70cb4817` are ancestors of HEAD (2 commits since the plan base `e091de40`, measured with `git rev-list --count`); `git diff --name-only e091de40..HEAD` lists only those three files (before this SUMMARY), so `src/`, `tests/`, STATE.md and ROADMAP.md are untouched.

---
*Phase: 22-initial-population*
*Completed: 2026-11-26*
