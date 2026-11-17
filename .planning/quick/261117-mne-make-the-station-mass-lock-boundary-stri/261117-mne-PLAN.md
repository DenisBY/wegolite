---
phase: quick
plan: 261117-mne
type: execute
wave: 1
depends_on: []
files_modified:
  - src/sim/flight/torus.ts
  - src/sim/world/ship-field.ts
  - tests/sim/mass-lock.test.ts
  - tests/sim/torus.test.ts
  - CHANGELOG.md
  - FIDELITY.md
  - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
autonomous: true
requirements: [FLGT-04, WORLD-10]

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "massLocked() in src/sim/flight/torus.ts no longer locks at a squared station distance of exactly 655,360,000 (25,600 m): the station comparison is strict `<`, the same strict outer gate Oolite applies to every ship, stations included (PlayerEntity.m:2936, StationEntity.m:573 isShip = YES) (SB-1)."
    - "The unit tests pin the boundary on exact geometry: a station-at-origin layout with points on the +x axis, where the test itself asserts the squared distance of the 25,600 m point equals 655_360_000 before it asserts the result. They show 25,599 m and 25,599.999 m locked, and 25,600 m and 25,601 m not locked, in both tests/sim/mass-lock.test.ts and tests/sim/torus.test.ts (SB-2)."
    - "The comments now describe the strict rule. The torus.ts docstring no longer says the station boundary locks, and the ship-field.ts header no longer says the station and ship rules are deliberately different in Oolite. Both comments keep their line counts, so the FIDELITY.md anchors torus.ts:99, torus.ts:103, ship-field.ts:82 and ship-field.ts:93-94 still point at the same code (SB-3)."
    - "Nothing else changes: the planet and sun strict rules (torus.ts:111-131), the NPC ship rule (ship-field.ts:93-94), the blockage predicate (countdown.ts:86-89) and ident.ts stay untouched, and the only edits to src/sim/world/ship-field.ts are on comment lines (SB-4)."
    - "The FIDELITY.md Open items bullet for the station mass-lock boundary is resolved, after the 261117-k1l precedent. The 261117-lka ledger line and the E-07 station-branch bullet record the fix. The measurement todo no longer lists the station boundary as waiting for the owner. CHANGELOG.md [Unreleased] has a new Fixed line (SB-5)."
    - "test, lint and typecheck pass on the remote test machine against the committed HEAD. No verify, verify-full or e2e is run. The NPC acceptance run is not due, because no code under src/sim/npc/** or src/sim/world/** changes (SB-6)."
  artifacts:
    - path: "src/sim/flight/torus.ts"
      provides: "Strict station mass-lock comparison"
      contains: "stationDistanceSquared < SCANNER_MAX_RANGE * SCANNER_MAX_RANGE"
    - path: "tests/sim/mass-lock.test.ts"
      provides: "Exact-geometry station boundary pins: 25,599 and 25,599.999 locked, 25,600 and 25,601 not locked"
      contains: "655_360_000"
    - path: "tests/sim/torus.test.ts"
      provides: "The same exact-geometry station boundary pins"
      contains: "655_360_000"
    - path: "FIDELITY.md"
      provides: "The station mass-lock open item resolved, ledger and E-07 bullet updated"
      contains: "261117-mne"
    - path: "CHANGELOG.md"
      provides: "A Fixed entry under [Unreleased]"
      contains: "### Fixed"
  key_links:
    - from: "tests/sim/mass-lock.test.ts"
      to: "src/sim/flight/torus.ts"
      via: "massLocked() at the exact boundary point vec(25_600, 0, 0) with the station at the origin"
      pattern: "655_360_000"
    - from: "FIDELITY.md"
      to: "src/sim/flight/torus.ts"
      via: "The Open items bullet 'Station mass-lock boundary (resolved in quick task 261117-mne)' names torus.ts:103"
      pattern: "resolved in quick task 261117-mne"
---

<objective>
Make the station's mass-lock boundary strict, as in Oolite. Change `<=` to `<` in `massLocked()` (`src/sim/flight/torus.ts:103`), correct the two comments that describe the inclusive rule, re-pin the boundary tests on exact geometry, and close the FIDELITY.md open item that quick task 261117-lka measured. A Coriolis at exactly 25,600 m is not locked in Oolite but locked in Wegolite.

Owner decision (2026-11-17, locked): the station comparison becomes strict. Evidence, confirmed by two independent reviewers and re-read by the planner in `/home/opencode/git/oolite`:
- `src/Core/Entities/PlayerEntity.m:2936`: `if (scannedEntity->zero_distance < SCANNER_MAX_RANGE2 || !scannedEntity->isShip)` is the outer gate, and `checkEntityForMassLock` runs only behind it.
- `src/Core/Entities/StationEntity.h:51`: `@interface StationEntity : ShipEntity`. `StationEntity.m:573`: `isShip = YES`. A station therefore passes through the strict outer gate.
- `PlayerEntity.m:3037`: the inner `ent->zero_distance <= SCANNER_MAX_RANGE2` can never change a ship's result.
- 655,360,000 = 25,600^2 is exact in float32 and float64.

Scope (SB), cited where implemented:
- SB-1: the operator change in `torus.ts:103`. Nothing else in `massLocked()` changes.
- SB-2: exact-geometry boundary pins in both test files, including a sub-metre 25,599.999 m locked pin.
- SB-3: comment corrections in `torus.ts` (docstring, about line 94) and `ship-field.ts` (lines 18-20), with unchanged line counts.
- SB-4: leave alone, because the reviewers confirmed they are correct: the planet and sun rules (`torus.ts:111-131`), the NPC ships (`ship-field.ts:93-94`), the blockage (`src/sim/hyperspace/countdown.ts:86-89`) and `src/sim/combat/ident.ts` (`<=`/`>`).
- SB-5: documentation. FIDELITY.md (ledger line, E-07 bullet, Open items bullet), the measurement todo, and a CHANGELOG Fixed line.
- SB-6: gate policy. This is a pure `src/sim` change, so it needs only `test`, `lint` and `typecheck`, run remotely through `/home/opencode/.claude/scripts/wegolite-remote-run.sh` on the committed HEAD. No `verify`, `verify-full` or `e2e`. The 20-seed NPC acceptance run is due only for code changes under `src/sim/npc/**` or `src/sim/world/**`. `src/sim/world/ship-field.ts` changes only on comment lines, so the run is skipped. Task 2 proves that the diff touches comments only.

Parallel work: quick task 261117-mng runs at the same time on the same working tree (`tools/oolite-reference/`). Stage ONLY this plan's files, by explicit path. Never use `git add -A`, `git add .` or `git commit -a`. Do not touch `tools/oolite-reference/` or `.planning/quick/261117-iuw-*/` (an untracked REVIEW.md there belongs to someone else). Do not edit `.planning/STATE.md`; the quick workflow updates it.

Purpose: 261117-lka found that Wegolite agrees with Oolite in 18 of 20 trials. One more is the recorded buoy divergence (E-22), and this station boundary is the only unexplained DIFFERS.
Output: one operator, two corrected comments, four re-pinned boundary cases in each of the two test files, the FIDELITY.md and todo updates, and a CHANGELOG line, in two commits.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/quick/261117-lka-measure-mass-lock-range-and-jump-blockag/261117-lka-SUMMARY.md

Reviewer and subagent brief (quoted from AGENTS.md; it applies to this executor and to anyone it spawns):

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser), `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

Use the codebase-memory MCP index (project `wegolite`) before grepping, and use `rg`, not `grep`. The Oolite reference checkout is `/home/opencode/git/oolite`. Read Oolite behaviour from there; never fetch Oolite files over the network.

Remote runs: `/home/opencode/.claude/scripts/wegolite-remote-run.sh <compose args>` syncs the COMMITTED HEAD to `~/wegolite-remote` on opencode@192.168.178.51 and runs `docker compose <args>` there, so commit first. The wrapper deletes and recreates that one remote directory, so two wrapper runs at once clobber each other. The parallel task 261117-mng may also use it. Before each wrapper call, check `pgrep -af wegolite-remote-run.sh`. If another run is active, wait until it exits, using a Monitor until-loop rather than a foreground sleep, and run your own calls strictly one at a time. The synced HEAD may include 261117-mng's commits. If a gate fails only on that task's files (`tools/oolite-reference/`), record it in the SUMMARY and do not fix it.

Current code, as read at HEAD a498409:
- `src/sim/flight/torus.ts:92-104`: the `massLocked` docstring, whose station bullet at line 94 calls the comparison `<=` and says the boundary itself locks. Line 99 is `export function massLocked(position: Vec3, layout: SystemLayout): boolean {`, and line 103 is `if (stationDistanceSquared <= SCANNER_MAX_RANGE * SCANNER_MAX_RANGE) {`.
- `src/sim/world/ship-field.ts:14-20`: the mass-lock paragraph of the file header. Lines 18-20 end with a sentence saying the station keeps an inclusive `<=` in `torus.ts` and that the two rules are deliberately different in Oolite. That sentence is wrong.
- `tests/sim/mass-lock.test.ts`: header line 10 states the station rule as `d^2 <= 25,600^2` and says the boundary itself locks. Lines 58-77 hold `describe("station boundary")` / `it("locks at 25,599 and 25,600 m, clears at 25,601 m")`, a loop over `[25_599, true], [25_600, true], [25_601, false]` that places points at `sub(layout.station.position, scale(layout.stationToPlanet, distance))`. The file already has `FAR = vec(1e9, 0, 0)` and an `isolated(overrides)` helper (lines 39-55) that moves every body to FAR. It imports `add, length, scale, sub, vec` from `../../src/sim/math.js`.
- `tests/sim/torus.test.ts:118-134`: `describe("mass lock boundaries")` / `it("locks the station at 25,599 and 25,600 m and clears at 25,601 m")`, the same loop and geometry. It imports `add, identity, length, scale, sub, vec` from `../../src/sim/math.js` and has no `isolated` helper.
- `src/sim/math.ts:135`: `export function lengthSquared(v: Vec3): number`.
- `tests/sim/world/ship-field.test.ts:98-110` already pins the NPC rule at exactly 25,600 m on axis-aligned geometry, the pattern to copy.
- FIDELITY.md line 1566 is the 261117-lka ledger line for the station trial ("Wegolite gives locked, LOCKED, unlocked. DIFFERS ... Not fixed: ..."). Line 1577 is the Open items bullet "**Torus mass lock, station branch (E-07).**" ("so the inclusive `<=` differs from Oolite at that one distance"). Line 1578 is the Open items bullet "**Station mass-lock boundary (measured in quick task 261117-lka).**". Line 1594 is the precedent for a resolved item: "**Coriolis and buoy layout radii (resolved in quick task 261117-k1l).**". Row 23 anchors `src/sim/flight/torus.ts:99` and row 48 anchors `src/sim/world/ship-field.ts:82`. The fidelity contract test checks that each anchored line exists, so keep the line counts.
- `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md`: lines 31-36 are the mass-lock bullet, which ends "Reported to the owner, no code changed.". Lines 79-81 open with "Open: ..." and contain "Waiting for the owner: the station mass-lock boundary at exactly 25,600 m ... two comments.".
- `CHANGELOG.md`: `## [Unreleased]` has `### Added` (line 9) and `### Changed` (line 22) and no `### Fixed`. `## [0.4.0] - 2026-11-16` starts at line 41.
- `.planning/` is prettier-ignored. FIDELITY.md and CHANGELOG.md are checked by `lint` (`eslint . && prettier --check .`).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Strict station boundary end-to-end: operator, comments, exact pins, CHANGELOG (SB-1, SB-2, SB-3, SB-4)</name>
  <files>src/sim/flight/torus.ts, src/sim/world/ship-field.ts, tests/sim/mass-lock.test.ts, tests/sim/torus.test.ts, CHANGELOG.md</files>
  <behavior>
    - With the station at the origin and every other body at FAR, `massLocked(vec(d, 0, 0), stationOnly)` is true for d = 25_599 and d = 25_599.999, and false for d = 25_600 and d = 25_601.
    - For the boundary point, `lengthSquared(sub(vec(25_600, 0, 0), stationOnly.station.position))` is exactly 655_360_000. This proves the case sits on the boundary and is not a float-rounded neighbour of it.
    - With the real Lave layout (direction away from the planet, as today), 25,599 m is still locked and 25,601 m is still clear.
    - RED argument: the boundary point's squared distance is asserted to be exactly 655_360_000, so the old `<=` returns true there. The flipped pin therefore fails against the old operator and passes only with `<`.
  </behavior>
  <action>
Record the base commit first: `git rev-parse HEAD > /tmp/261117-mne-base`. Shell state does not persist between commands, so every later gate reads it back with `BASE=$(cat /tmp/261117-mne-base)`. Report it in the SUMMARY as plan_head_before.

1. Tests (RED shape first), `tests/sim/mass-lock.test.ts`:
   - Header line 10: state the station rule as `d^2 < 25,600^2`, strict like every ship, because a station is a ship and Oolite's outer gate at PlayerEntity.m:2936 decides. Say a station exactly 25,600 m away does not lock. Keep it to one line.
<!-- planner-discipline-allow: boundary itself locks -->
<!-- planner-discipline-allow: [25_600, true] -->
   - In `describe("station boundary")`, keep the Lave-geometry loop but drop the `[25_600, true]` entry. Through the `stationToPlanet` unit vector, its float64 squared distance is not guaranteed to be exactly 655,360,000, so it cannot pin the boundary. Rename the `it` to say it locks at 25,599 m and clears at 25,601 m on Lave's geometry.
   - Add a second `it` in the same describe for the exact boundary. Build `stationOnly = isolated({ station: { position: vec(0, 0, 0), radius: layout.station.radius } })`. First assert `lengthSquared(sub(vec(25_600, 0, 0), stationOnly.station.position))` toBe `655_360_000`. Then loop over `[25_599, true], [25_599.999, true], [25_600, false], [25_601, false]`, asserting `massLocked(vec(distance, 0, 0), stationOnly)` with the same message style (`station distance ${String(distance)} m`). Name it, for example, "locks strictly inside 25,600 m and clears at exactly 25,600 m (squared distance 655,360,000)". Add `lengthSquared` to the math.js import.
   - `tests/sim/torus.test.ts`: make the same two changes to `it("locks the station at 25,599 and 25,600 m and clears at 25,601 m")`. Drop 25,600 from the Lave loop, rename it, and add the exact-boundary `it` in `describe("mass lock boundaries")`. The file has no `isolated` helper. Build the station-only layout inline from `layout`: spread `layout`, then set `station` to the origin with `layout.station.radius`, and `planet`, `sun`, `navBuoy` and `witchpoint` to `{ position: vec(1e9, 0, 0), radius: 1 }`. Copy the shape of `isolated()` in mass-lock.test.ts, and add a `SystemLayout` type import only if the type checker needs it. Assert the same 655_360_000 equality and the same four cases. Add `lengthSquared` to the math.js import.
2. Operator (GREEN), `src/sim/flight/torus.ts:103`: change `<=` to `<`, so the line reads `if (stationDistanceSquared < SCANNER_MAX_RANGE * SCANNER_MAX_RANGE) {`. Nothing else in `massLocked()` changes (SB-4).
3. Comments (SB-3; keep each comment's line count so lines 99 and 103 do not move):
<!-- planner-discipline-allow: boundary itself locks -->
   - `torus.ts` docstring station bullet (line 94): replace it with ONE line that says the station locks strictly inside 25,600 m of the centre (`<`, PlayerEntity.m:2936). Keep it within about 80 columns. The ship-field.ts header carries the reason.
<!-- planner-discipline-allow: deliberately different -->
   - `src/sim/world/ship-field.ts` lines 19-20: keep line 18 as is (it ends "...a ship at exactly 25,600 m does not"). Replace exactly these two lines with two new comment lines. Line 19 still opens with "lock.", and the replacement sentence reads roughly: "A station is a ship too (StationEntity.m:573), so the same strict gate decides for it, and the station rule in `torus.ts` is `<` as well." Use the same ` * ` prefix and about 80 columns. If two lines are not enough, shorten the sentence; do not add a line. Change no code line in this file (SB-4).
4. `CHANGELOG.md`: under `## [Unreleased]`, add a `### Fixed` group after the `### Changed` group's last bullet and before `## [0.4.0] - 2026-11-16`, with one user-visible bullet. For example: "The station's mass lock now ends strictly inside the scanner range, as in Oolite: a ship exactly 25,600 m from the station centre is no longer mass-locked, so the torus drive engages there." Wrap it like the neighbouring bullets, because prettier checks it.
5. Do not touch the planet or sun rules, `ship-field.ts:93-94`, `src/sim/hyperspace/countdown.ts`, `src/sim/combat/ident.ts`, `tools/oolite-reference/` or `.planning/quick/261117-iuw-*/`.
6. Commit with explicit paths only: `git add src/sim/flight/torus.ts src/sim/world/ship-field.ts tests/sim/mass-lock.test.ts tests/sim/torus.test.ts CHANGELOG.md`. Use the message `fix(quick-261117-mne): make the station mass-lock boundary strict like Oolite`, ending with the attribution trailer from the session's system reminder.
7. Tracer check: after the commit, and after `pgrep -af wegolite-remote-run.sh` shows no other run, run the targeted test remotely (see verify). If the 25,600 case still reports locked, the geometry is not exact. Fix the test geometry, never the expectation.
  </action>
  <verify>
    <automated>cd /home/opencode/git/wegolite && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npx vitest run tests/sim/mass-lock.test.ts tests/sim/torus.test.ts tests/sim/world/ship-field.test.ts</automated>
    <automated>cd /home/opencode/git/wegolite && test "$(rg -c 'stationDistanceSquared <= SCANNER_MAX_RANGE' src/sim/flight/torus.ts || echo 0)" = 0 && test "$(rg -c 'stationDistanceSquared < SCANNER_MAX_RANGE \* SCANNER_MAX_RANGE' src/sim/flight/torus.ts)" = 1   # [HEAD=1 EXPECT==0] for the `<=` line, [HEAD=0 EXPECT==1] for the `<` line</automated>
    <automated>cd /home/opencode/git/wegolite && test "$(rg -c 'boundary itself locks' src/sim/flight/torus.ts tests/sim/mass-lock.test.ts | wc -l)" = 0 && test "$(rg -c 'deliberately different' src/sim/world/ship-field.ts || echo 0)" = 0 && test "$(rg -c '\[25_600, true\]' tests/sim/mass-lock.test.ts tests/sim/torus.test.ts | wc -l)" = 0   # matching files [HEAD=2 EXPECT==0], [HEAD=1 EXPECT==0], matching files [HEAD=2 EXPECT==0]</automated>
    <automated>cd /home/opencode/git/wegolite && test "$(rg -l '655_360_000' tests/sim/mass-lock.test.ts tests/sim/torus.test.ts | wc -l)" = 2 && test "$(rg -l '25_599\.999' tests/sim/mass-lock.test.ts tests/sim/torus.test.ts | wc -l)" = 2 && awk '/^## \[0\.4\.0\]/{exit} /^### Fixed/{f=1} END{exit !f}' CHANGELOG.md   # matching files [HEAD=0 EXPECT==2], matching files [HEAD=0 EXPECT==2], [HEAD: no Fixed heading before [0.4.0] (awk exits 1) EXPECT: one inside Unreleased (exit 0)]</automated>
    <automated>cd /home/opencode/git/wegolite && test "$(awk 'NR==99' src/sim/flight/torus.ts | rg -c 'export function massLocked')" = 1 && test "$(awk 'NR==103' src/sim/flight/torus.ts | rg -c 'stationDistanceSquared <')" = 1   # line anchors unchanged [HEAD: 99 and 103 hold these lines]</automated>
  </verify>
  <done>The remote targeted run of mass-lock.test.ts, torus.test.ts and ship-field.test.ts passes on the committed HEAD. torus.ts:103 is strict. Both test files pin 25,599 and 25,599.999 locked and 25,600 and 25,601 not locked on exact geometry, with the 655_360_000 equality asserted. Both comments are corrected without moving torus.ts:99/103. CHANGELOG has the Fixed line. The commit contains exactly the five listed files.</done>
</task>

<task type="auto">
  <name>Task 2: Record the fix in FIDELITY.md and the measurement todo, then run the full sim gates remotely (SB-4, SB-5, SB-6)</name>
  <files>FIDELITY.md, .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md</files>
  <action>
1. FIDELITY.md (SB-5). Edit the existing text in place, and keep the measured facts, which were true at 42c4394:
   - Line 1566, the 261117-lka ledger line for the station trial: keep the measured trial ("Oolite gives locked, unlocked, unlocked") and the cause. Mark the Wegolite result as the one at 42c4394. Change "Wegolite's station rule is inclusive" to the past tense. Replace the closing "Not fixed: ..." sentence with a statement that quick task 261117-mne fixed it on the owner's decision of 2026-11-17: `src/sim/flight/torus.ts:103` is now strict `<`, so Wegolite now gives locked, unlocked, unlocked, SAME.
   - Line 1577, the "**Torus mass lock, station branch (E-07).**" bullet: keep "E-07 quotes the planet branch only" and "not covered by an excerpt", which are still true. Replace the clause saying the inclusive comparison differs from Oolite with a statement that the station check is strict `<` since quick task 261117-mne, as Oolite's outer gate (`PlayerEntity.m:2936`) is for every ship. Keep "25,599 m locks and 25,601 m does not".
   - Line 1578: retitle it "**Station mass-lock boundary (resolved in quick task 261117-mne).**", after the 261117-k1l precedent at line 1594, and rewrite the body as a resolved record. 261117-lka measured that Oolite does not lock a station at exactly 25,600 m (squared distance 655,360,000, exact), because the outer gate `zero_distance < SCANNER_MAX_RANGE2` (`src/Core/Entities/PlayerEntity.m:2936`) is strict for every ship, and a station is a ship (`StationEntity.m:573`, `isShip = YES`). The inner `<=` at `:3037` never decides for a ship. On the owner's decision of 2026-11-17, `src/sim/flight/torus.ts:103` uses `<`. `tests/sim/mass-lock.test.ts` and `tests/sim/torus.test.ts` pin 25,599 and 25,599.999 m locked and 25,600 and 25,601 m clear on exact geometry. The `src/sim/world/ship-field.ts` header comment was corrected.
   - Then run `rg -n "261117-lka|inclusive" FIDELITY.md`. Correct any other sentence that still says Wegolite's station rule is inclusive or that the station item waits for the owner. Leave the unrelated aegis and dock-computer `<=` rules alone; they are correct.
   - Keep every table row and anchor unchanged. FIDELITY.md is checked by prettier, so do not hand-wrap long bullet lines differently from their neighbours.
2. `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md` (SB-5):
<!-- planner-discipline-allow: Reported to the owner, no code -->
<!-- planner-discipline-allow: Waiting for the owner: the -->
   - Lines 31-36, the mass-lock bullet: keep the 261117-lka result and replace "Reported to the owner, no code changed." with "Fixed in quick task 261117-mne (2026-11-17, owner decision): `torus.ts:103` is now strict `<`, so the station trial now agrees with Oolite."
   - Lines 79-81: remove the "Waiting for the owner: the station mass-lock boundary ..." sentence, and add that the station mass-lock boundary measured in 261117-lka was fixed in quick task 261117-mne. Keep "No mass difference is waiting for the owner." and the rest of the paragraph. The todo stays in `pending/`, because step 4 and the Phase 16 items remain open.
3. Commit with explicit paths only: `git add FIDELITY.md .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md`. Use the message `docs(quick-261117-mne): record the strict station mass-lock boundary in FIDELITY.md`, with the attribution trailer.
4. SB-4 proof, with `BASE=$(cat /tmp/261117-mne-base)`: `git diff -U0 "$BASE" HEAD -- src/sim/world/ship-field.ts` must change only comment lines, with equal added and deleted counts, and `git diff --stat "$BASE" HEAD` must list exactly the seven files in this plan's `files_modified`, plus any 261117-mng commits under `tools/oolite-reference/` that landed in between. Name any such commits in the SUMMARY. Because no code under `src/sim/world/**` or `src/sim/npc/**` changed, the NPC acceptance run is not due. Say so in the SUMMARY.
5. Gates (SB-6). Run these on the remote test machine, one at a time, each after `pgrep -af wegolite-remote-run.sh` shows no other run: `run --rm test`, then `run --rm lint`, then `run --rm typecheck`. Record each exit code, the elapsed time and the snapshot SHA in the SUMMARY. Do not run `verify`, `verify-full` or `e2e`. If lint fails only on prettier formatting of FIDELITY.md or CHANGELOG.md, fix it in a follow-up commit (explicit paths, `docs(quick-261117-mne): ...`) and rerun lint.
  </action>
  <verify>
    <automated>cd /home/opencode/git/wegolite && test "$(rg -c 'Station mass-lock boundary \(resolved in quick task 261117-mne\)' FIDELITY.md)" = 1 && test "$(rg -c 'Station mass-lock boundary \(measured in quick task 261117-lka\)' FIDELITY.md || echo 0)" = 0 && test "$(rg -c '261117-mne' FIDELITY.md)" -ge 3   # [HEAD=0 EXPECT==1], [HEAD=1 EXPECT==0], [HEAD=0 EXPECT>=3]</automated>
    <automated>cd /home/opencode/git/wegolite && T=.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md && test "$(rg -c 'Waiting for the owner: the' "$T" || echo 0)" = 0 && test "$(rg -c '261117-mne' "$T")" -ge 2 && test "$(rg -c 'Reported to the owner, no code' "$T" || echo 0)" = 0   # [HEAD=1 EXPECT==0], [HEAD=0 EXPECT>=2], [HEAD=1 EXPECT==0]</automated>
    <automated>cd /home/opencode/git/wegolite && BASE=$(cat /tmp/261117-mne-base) && D=$(git diff -U0 "$BASE" HEAD -- src/sim/world/ship-field.ts) && NS=$(git diff --numstat "$BASE" HEAD -- src/sim/world/ship-field.ts) && NT=$(git diff --numstat "$BASE" HEAD -- src/sim/flight/torus.ts) && test "$(printf '%s\n' "$D" | rg '^[+-] ' | rg -v '^[+-] \*' | wc -l)" = 0 && printf '%s\n' "$NS" | awk '{ok=($1==$2 && $1>0)} END{exit !ok}' && printf '%s\n' "$NT" | awk '{ok=($1==$2 && $1>0)} END{exit !ok}'   # comment-only, line-count-preserving change to src/sim/world [EXPECT 0 non-comment lines, added==deleted]; torus.ts keeps its line count
    <automated>cd /home/opencode/git/wegolite && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm lint && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm typecheck</automated>
  </verify>
  <done>FIDELITY.md marks the station mass-lock boundary resolved in 261117-mne, updates the ledger line and the E-07 bullet, and leaves no sentence saying the station rule is inclusive or waiting for the owner. The measurement todo records the fix and stays pending. The ship-field.ts diff is comment-only. test, lint and typecheck pass remotely on the final committed HEAD, and the SUMMARY records the results.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local host -> remote test machine (ssh) | wegolite-remote-run.sh archives the committed HEAD to `~/wegolite-remote` and runs docker compose there; one shared remote directory |
| shared working tree -> commits | quick task 261117-mng edits `tools/oolite-reference/` in the same tree at the same time |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-mne-01 | Tampering (cross-task commit) | git staging in the shared tree | medium | mitigate | Both commits stage explicit paths only (Task 1 step 6, Task 2 step 3). `git add -A`, `git add .` and `git commit -a` are forbidden. Task 2 step 4 checks `git diff --stat "$BASE" HEAD` against `files_modified`. |
| T-mne-02 | Tampering (gate evidence) | the shared remote `~/wegolite-remote` directory | medium | mitigate | Each wrapper call waits until `pgrep -af wegolite-remote-run.sh` shows no other run, and calls run one at a time, so a parallel sync cannot replace the tree mid-run. The SUMMARY records the snapshot SHA of each run. |
| T-mne-03 | Tampering (false pass) | the 25,600 m pin | medium | mitigate | The pin uses station-at-origin, axis-aligned geometry and asserts the squared distance equals 655_360_000 before asserting the result, so a rounded neighbour of the boundary cannot pass or fail it by accident (SB-2). |
| T-mne-04 | Tampering (scope creep) | other mass-lock and blockage predicates | low | mitigate | SB-4 lists the untouched predicates. Task 2 proves the ship-field.ts diff is comment-only, so the NPC acceptance run is not due. |
| T-mne-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs in this plan. |
</threat_model>

<verification>
- Task 1: the remote targeted run of the three test files passes on the committed HEAD, and the operator, comment, pin and CHANGELOG gates pass.
- Task 2: the FIDELITY.md and todo gates pass, the ship-field.ts diff is comment-only, and remote `test`, `lint` and `typecheck` pass on the final committed HEAD.
- No `verify`, `verify-full`, `e2e` or NPC acceptance run was started (SB-6).
</verification>

<success_criteria>
- A station at exactly 25,600 m (squared distance 655,360,000) no longer mass-locks the player. 25,599.999 m still does. Wegolite now matches the 261117-lka measurement in all three station trials.
- The comments, the FIDELITY.md ledger and Open items, the measurement todo and the CHANGELOG describe the strict rule.
- No other predicate changed, and only this plan's files were committed.
</success_criteria>

<output>
Create `.planning/quick/261117-mne-make-the-station-mass-lock-boundary-stri/261117-mne-SUMMARY.md` when done. Include:
- plan_head_before (`$BASE`) and plan_head_after, and the commit SHAs with their file lists.
- The old and new operator line, and the old and new comment text in torus.ts and ship-field.ts.
- The four exact-geometry pin cases per test file and the Lave-geometry cases kept.
- Each remote gate run (targeted test, test, lint, typecheck) with its exit code, elapsed time and snapshot SHA.
- A statement that the NPC acceptance run was not due (ship-field.ts comment-only, no src/sim/npc/** change), and any 261117-mng commits that were in the synced snapshot.
</output>
