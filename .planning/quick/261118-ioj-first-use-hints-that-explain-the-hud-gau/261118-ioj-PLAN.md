---
phase: quick
plan: 261118-ioj
type: execute
wave: 1
depends_on: []
files_modified:
  - src/settings/schema.ts
  - src/app/hints.ts
  - src/app/session/render-driver.ts
  - tests/app/hints.test.ts
  - tests/settings/schema.test.ts
  - CHANGELOG.md
  - .planning/PROJECT.md
autonomous: true
requirements: [FLGT-05]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "In flight, the first frame whose drawn LT gauge is at or above 0.25 posts 'LT: laser temperature — ease off before it overheats' once on its own message row; it never shows again in the session or, once persisted in hintsSeen, in any later session (D-01, D-03, D-05)"
    - "The FWD/AFT hint posts once when either drawn shield gauge first drops below 1, the E1-E4 hint once when the drawn energy (mean of the four banks) first drops below 0.9, the CT hint once when the drawn CT gauge first reaches 0.3, and the FUEL hint once when the drawn FUEL gauge is first below 1 in flight, which on a new game is the first frame after the first jump (D-03, D-06, D-07, D-08)"
    - "A pristine ship in flight (new game, full tank, cold lasers, full shields and banks, cabin at its 60 floor, CT gauge 0.234) triggers no gauge hint, and no gauge hint shows while docked or launching (D-03)"
    - "Every new hint id is appended to HINT_IDS after 'aegis'; a stored settings blob with only the six earlier ids still validates, a blob with all eleven validates, and HINT_IDS.length stays at or below MAX_HINTS_SEEN (16) (D-05)"
    - "ALT and MISS get no hint, because both gauges are fixed placeholders in src/render/hud/draw.ts (ALT draws a constant 0.92, the pylons are always three loaded); the PROJECT.md row records the skip and the reason (D-02)"
    - "A gauge hint is posted through the existing showHint path (messages.enqueue with MESSAGE_DURATION_SECONDS on its own row), so it never delays an action reply (D-05)"
  artifacts:
    - path: src/app/hints.ts
      provides: "HintGauges, hintGauges(bars), the five gauge hint texts, thresholds and the ordered gauge-hint branch of maybeShow"
      contains: "hintGauges"
    - path: src/settings/schema.ts
      provides: "HintId union and HINT_IDS with laserTemp, shields, energy, cabinTemp, fuel appended after aegis"
      contains: "\"cabinTemp\""
    - path: tests/app/hints.test.ts
      provides: "per-trigger tests: fires once at threshold, not below, never again, never when seen, not docked or launching, text length cap"
      contains: "laserTemp"
  key_links:
    - from: src/app/session/render-driver.ts
      to: src/app/hints.ts
      via: "showHint builds HintContext.gauges with hintGauges(ctx.core.lastModel?.bars), the bars the HUD just drew"
      pattern: "hintGauges\\("
    - from: src/app/hints.ts
      to: src/settings/schema.ts
      via: "HintId union and HINT_IDS allowlist shared with the settings validator"
      pattern: "HINT_IDS"
---

<objective>
Explain Oolite's abbreviated HUD legends with one-time first-use hints, each posted the first time its gauge
starts to matter (owner decision 2026-11-18: keep FWD, AFT, FUEL, CT, LT, ALT, MISS, SPD, ROLL, PITCH, E1-E4 as
in Oolite; the hints are a Wegolite-only addition, like the aegis "S" hint of quick 261118-cyn).

Purpose: a new player sees FWD/AFT, E1-E4, CT, LT and FUEL without knowing what they mean. A hint at the moment
the gauge moves teaches it without a tutorial or a permanent overlay (the first-use hint decision, commit
`89c3b41`, D-11 of Phase 3: one short message at a time, never modal).

Output: five new hint ids appended to `HINT_IDS`; the gauge thresholds and texts in `src/app/hints.ts`; the
render driver feeding the drawn HUD bars into the hint context; unit tests per trigger and for the schema; a
PROJECT.md Key Decisions row and a CHANGELOG `[Unreleased]` Added line; `verify` green on the remote.

Decisions for this task (owner request 2026-11-18, refined during planning; cite them in commits and SUMMARY):

- D-01: Keep the Oolite abbreviations. Add one-shot hints, English, at most `MAX_MESSAGE_CHARS` (54,
  `src/render/hud/format.ts`) characters each, in the style of the existing hints (abbreviation, colon, meaning,
  em dash, one piece of advice).
- D-02: Hints only for gauges whose drawn value is live today. Checked during planning:
  LT = `laserTempGauge` (`src/sim/combat/weapons.ts`), CT = `cabinTempGauge`, FWD/AFT = `shieldGauge`, E1-E4 =
  `energyBanks` (`src/sim/combat/shields.ts`), FUEL = live tank over `config.maxFuel` (`src/app/hud-model.ts`
  `buildBars`); all reach `HudBars` (`src/render/hud/draw.ts`). Skipped: ALT, because `drawHud` draws the ALT bar
  as a constant 0.92 placeholder (the sim has `dialAltitude` in `src/sim/combat/alert.ts`, but the gauge does not
  show it, so "the bar empties as you get close" would be false); MISS, because the pylons are a fixed
  placeholder (three loaded) and Wegolite has no missiles. SPD, ROLL and PITCH are not in the owner's set (the
  existing speed and pitch-and-roll hints cover those controls).
- D-03: Thresholds, deterministic, on the drawn gauges (0..1): LT at or above 0.25 (about 8 s of continuous pulse
  fire: 7 heat per 0.508 s shot against 6 per second cooling); either shield below 1 (any hit); energy below 0.9;
  CT at or above 0.3 (a new game reads 60 / 256 = 0.234); FUEL below 1. A non-finite value never triggers.
- D-04: Texts (counted: 52, 48, 45, 53, 42 characters):
  laserTemp "LT: laser temperature — ease off before it overheats";
  shields "FWD/AFT: forward and aft shields — they recharge";
  energy "E1-E4: energy banks — they recharge over time";
  cabinTemp "CT: cabin temperature — hits past the shields heat it";
  fuel "FUEL: hyperspace fuel — refuel when docked".
- D-05: Plumbing as for "aegis": ids appended to the `HintId` union and `HINT_IDS` after "aegis" in the order
  laserTemp, shields, energy, cabinTemp, fuel (that is also the offer order when two trigger together); each is a
  fact hint, marked seen as soon as it is shown, so `onSeen` persists it in `hintsSeen`. Wegolite has no "show
  hints" toggle (checked: `src/settings/schema.ts`, `src/ui/settings-panel.ts`, `index.html`), so the persisted
  seen list is the only off switch; do not add a toggle. Reset to defaults clears the persisted `hintsSeen`
  exactly as for the other hints, and the in-session controller keeps its seen set until reload, also as for
  the other hints; no change there. `MAX_HINTS_SEEN` stays 16 (eleven ids after this task).
- D-06: CT wording. The owner proposed "keep away from the sun", but Wegolite has no sun heat: the external
  temperature is 0 and energy damage past the shields is the only heat input (`routeDamage`, `coolCabin` in
  `src/sim/combat/shields.ts`, Phase 13 D-05). The text says what heats the cabin in Wegolite.
- D-07: Energy threshold 0.9, not "below full". A pulse shot costs 0.8 of 256 energy (0.3 %, invisible on the
  bars) and refills in 0.2 s at 4 per second, so "below full" would fire on the first shot with nothing visible
  to explain. 0.9 is 40 % of the top bank, clearly visible; it is reached by sustained beam or military fire
  (both buyable in F3) and by damage.
- D-08: FUEL moment: the first in-flight frame with the drawn FUEL gauge below 1. A new game starts on a full
  tank (`NEW_GAME_FUEL` 70), so this is the frame after the first jump, when the bar and the "LY" readout have
  just dropped; a loaded save with a part tank shows it at the first launch, which teaches equally well.
- Reachability note (record it in the SUMMARY): the FWD/AFT and CT hints, and E1-E4 with the default pulse laser,
  fire only when the player takes damage. In ordinary play nothing damages the player yet (Phase 17 keeps NPCs
  peaceful in ordinary play, Phase 18 adds collisions); the hints are live now and fire when damage first
  arrives. Unit tests drive the controller directly.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@src/app/hints.ts
@src/settings/schema.ts
@tests/app/hints.test.ts

Reviewer and subagent brief (AGENTS.md, include verbatim in any subagent prompt):

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser), `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

Owner gate policy: `test`, `lint` and `typecheck` run in local Docker. `verify`, `verify-full` and every browser
test run only on the remote machine through `/home/opencode/.claude/scripts/wegolite-remote-run.sh <compose
args>`, which syncs the COMMITTED HEAD (commit first) and runs one job at a time; never start a second remote run
while one is in flight.

Codebase memory: use the codebase-memory MCP index (project `wegolite`) before grepping; prefer `rg` over `grep`.
Oolite reference checkout: `/home/opencode/git/oolite` (read behaviour there; never fetch Oolite over the network).

Sequencing: quick task 261118-ih8 (HUD legend font sizing in `src/render/hud/**`, plus CHANGELOG.md and
.planning/PROJECT.md) executes BEFORE this plan. Re-read every file immediately before editing it. Do not edit
anything under `src/render/hud/**`; this plan only imports the `HudBars` type from `src/render/hud/draw.ts`.

Key facts gathered during planning (no need to re-derive):

- `src/app/hints.ts`: `HintContext` (mode, massLocked, torusEngaged, speedInput, pitchRollInput, flightTime,
  inDockingRange); `hintText(id, bindings)` switch; `createHintController` with `take(id)` (announce once per
  session) and `markSeen(id)` (persist via `onSeen`); `maybeShow` returns at most one message per call and only
  in `inFlight` after the docked launch hint; the aegis block is last and calls `markSeen("aegis")` when shown.
- `src/settings/schema.ts`: `HintId` union, `HINT_IDS` array, `MAX_HINTS_SEEN = 16`, `HINT_ID_SET` allowlist
  used by the parser.
- `src/app/session/render-driver.ts` `showHint(currentState)` (about lines 346-375) builds the `HintContext`; it
  runs after `buildHudModel` stores `ctx.core.lastModel` in the same `renderFrame`, so `ctx.core.lastModel?.bars`
  is the HudBars the player sees this frame in flight.
- `HudBars` (`src/render/hud/draw.ts` about lines 260-285): `fuel`, `shieldFwd`, `shieldAft`, `energyBanks`
  ([E1..E4], each 0..1, their mean is energy over max), `laserTemp`, `cabinTemp`, plus speed/roll/pitch.
- `tests/app/hints.test.ts` has a `context(overrides)` helper and an aegis test that asserts `HINT_IDS` equals
  exactly the six earlier ids; that assertion must change to the new full list.
- `tests/settings/schema.test.ts` about lines 180-200 already checks unknown ids, `[...HINT_IDS]` and the
  17-entry cap.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: End-to-end LT hint — drawn bars to hint context to one message row</name>
  <files>src/settings/schema.ts, src/app/hints.ts, src/app/session/render-driver.ts, tests/app/hints.test.ts</files>
  <read_first>
    src/app/hints.ts (whole file), src/settings/schema.ts (lines 36-56), src/app/session/render-driver.ts
    (lines 280-377), src/render/hud/draw.ts (lines 255-300, read only), tests/app/hints.test.ts (whole file)
  </read_first>
  <behavior>
    - hintGauges(undefined) returns the calm gauges: laserTemp 0, cabinTemp 0, shields 1, energy 1, fuel 1.
    - hintGauges(bars) returns laserTemp = bars.laserTemp, cabinTemp = bars.cabinTemp, shields = the lower of
      bars.shieldFwd and bars.shieldAft, energy = mean of the four energyBanks, fuel = bars.fuel (example:
      banks [0.5, 1, 1, 1] give energy 0.875).
    - In flight with earlier hints seen, LT gauge 0.24 gives no LT hint; 0.25 gives exactly the D-04 LT text once,
      isSeen("laserTemp") becomes true and onSeen receives "laserTemp"; later frames at 0.5 return null.
    - LT 0.9 while docked or launching gives no LT hint and leaves it unseen.
    - A controller created with seen containing "laserTemp" never shows it (the persisted list is the off switch,
      D-05).
    - LT NaN never triggers.
    - The LT text length is at most MAX_MESSAGE_CHARS (import from src/render/hud/format.js in the test only).
  </behavior>
  <action>
    Per D-02, D-03, D-04 and D-05, wire one gauge hint through every layer.

    In `src/settings/schema.ts`, append "laserTemp" to the `HintId` union and to `HINT_IDS` after "aegis", and
    extend the doc comment above `HINT_IDS` to say the gauge hints of quick 261118-ioj are additive like "aegis",
    so a stored blob without them stays valid. Leave `MAX_HINTS_SEEN` at 16.

    In `src/app/hints.ts`: add an exported `HintGauges` interface (readonly laserTemp, cabinTemp, shields,
    energy, fuel, each a 0..1 drawn gauge; shields is the lower of FWD and AFT; energy is the mean of E1-E4) with
    a doc comment per field naming its HUD legend. Add an exported `CALM_HINT_GAUGES` frozen constant (0, 0, 1,
    1, 1) and an exported pure function `hintGauges(bars: HudBars | undefined): HintGauges` that returns the
    calm constant for undefined and otherwise maps the bars as in the behaviour list (type-only import of
    `HudBars` from `../render/hud/draw.js`). Add a required `gauges: HintGauges` field to `HintContext` with a doc
    comment saying it is the HUD's drawn bars of this frame, so a hint explains what the player sees. Add an
    exported `LASER_TEMP_HINT_LEVEL = 0.25` constant with a comment giving the D-03 reasoning (about 8 s of
    pulse fire). Add the "laserTemp" case to `hintText` with the exact D-04 LT text and a comment that it is
    Wegolite-only (quick 261118-ioj). In `maybeShow`, after the aegis block and still inside the in-flight
    path, add an ordered gauge-hint step: a module-level readonly table of [HintId, predicate on HintGauges]
    entries (only the laserTemp entry in this task, predicate `gauges.laserTemp >= LASER_TEMP_HINT_LEVEL`, which
    is false for NaN); for the first entry whose predicate holds and whose `take(id)` is non-null, call
    `markSeen(id)` and return the text (fact hint, like aegis). Update the module doc comment to mention the
    gauge hints. Do not change the order or behaviour of the existing hints.

    In `src/app/session/render-driver.ts` `showHint`, add `gauges: hintGauges(ctx.core.lastModel?.bars)` to the
    `HintContext` literal (import `hintGauges` as a value from `../hints.js`), with a one-line comment that the
    bars are the ones `buildHudModel` stored for this frame. Nothing else in the render driver changes; the hint
    still goes through `messages.enqueue(hint, MESSAGE_DURATION_SECONDS)` on its own row.

    In `tests/app/hints.test.ts`: add `gauges: CALM_HINT_GAUGES` to the `context()` helper defaults; change the
    aegis test that pins `HINT_IDS` so it asserts the first six ids are unchanged and in order (slice) instead of
    the whole list; add a `describe` for the LT hint covering every behaviour bullet, plus a `hintGauges` describe.
    Write the tests first (RED), then implement (GREEN).
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/app/hints.test.ts tests/settings/schema.test.ts &amp;&amp; docker compose run --rm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `rg -c '"laserTemp"' src/settings/schema.ts` [HEAD=0 EXPECT>=2]
    - `rg -c 'hintGauges\(' src/app/session/render-driver.ts` [HEAD=0 EXPECT==1]
    - `rg -c 'LT: laser temperature' src/app/hints.ts` [HEAD=0 EXPECT==1]
    - Before the first edit, record the starting commit as BASE (`git rev-parse HEAD`, written into the SUMMARY);
      `git diff --name-only "$BASE" -- src/render/hud` prints nothing
  </acceptance_criteria>
  <done>
    The LT hint fires once at 0.25 from the drawn bars through `showHint`, all hints and schema tests pass in
    Docker, typecheck is clean, and the six earlier hints behave as before. Commit:
    `feat(quick-261118-ioj): one-time hint that explains the LT gauge`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: FWD/AFT, E1-E4, CT and FUEL hints, schema test, docs and gates</name>
  <files>src/settings/schema.ts, src/app/hints.ts, tests/app/hints.test.ts, tests/settings/schema.test.ts, CHANGELOG.md, .planning/PROJECT.md</files>
  <read_first>
    src/app/hints.ts and src/settings/schema.ts as left by Task 1, tests/settings/schema.test.ts (lines 60-120,
    175-200), CHANGELOG.md (the `[Unreleased]` section), .planning/PROJECT.md (the end of the Key Decisions table,
    the "Explain the aegis S" row and any row 261118-ih8 added after it)
  </read_first>
  <behavior>
    - shields: min shield 1 gives nothing; 0.99 gives the D-04 FWD/AFT text once, marked seen, then null.
    - energy: 0.9 gives nothing; 0.89 gives the D-04 E1-E4 text once, marked seen, then null.
    - cabinTemp: 0.234375 (new-game floor) and 0.29 give nothing; 0.3 gives the D-04 CT text once, marked seen.
    - fuel: 1 gives nothing; 0.9 in flight gives the D-04 FUEL text once, marked seen; 0.5 while docked or
      launching gives nothing and leaves it unseen.
    - A pristine in-flight frame (CALM_HINT_GAUGES, and also cabinTemp 0.234375) after the earlier hints are seen
      returns null for every new id.
    - When LT and a shield trigger on the same frames, the first call returns the LT text and the next returns
      the FWD/AFT text (offer order laserTemp, shields, energy, cabinTemp, fuel).
    - Each new id in the seen list is never shown; NaN in any gauge never triggers.
    - Every new text is at most MAX_MESSAGE_CHARS.
    - HINT_IDS equals the six earlier ids followed by laserTemp, shields, energy, cabinTemp, fuel.
    - Schema: a blob whose hintsSeen holds only the six pre-task ids validates unchanged; a blob with every
      HINT_IDS entry validates; HINT_IDS.length is at most MAX_HINTS_SEEN; each new id is accepted on its own.
  </behavior>
  <action>
    Per D-03, D-04, D-05, D-06, D-07 and D-08, extend the Task 1 path to the remaining four gauges.

    In `src/settings/schema.ts`, append "shields", "energy", "cabinTemp", "fuel" (in that order, after
    "laserTemp") to the `HintId` union and `HINT_IDS`.

    In `src/app/hints.ts`, add exported `ENERGY_HINT_LEVEL = 0.9` (comment: D-07, a pulse shot is 0.3 % and
    refills in 0.2 s) and `CABIN_TEMP_HINT_LEVEL = 0.3` (comment: D-06/D-03, the 60 floor reads 0.234; Wegolite
    has no sun heat, only energy damage past the shields). Add the four `hintText` cases with the exact D-04
    texts. Extend the ordered gauge-hint table to laserTemp, shields (`shields < 1`), energy
    (`energy < ENERGY_HINT_LEVEL`), cabinTemp (`cabinTemp >= CABIN_TEMP_HINT_LEVEL`), fuel (`fuel < 1`, comment
    D-08: on a new game this is the first frame after the first jump); all comparisons are false for NaN.

    In `tests/app/hints.test.ts`, add one describe per new hint covering its behaviour bullets, the pristine-frame
    test, the same-frame order test, the NaN test, the length test, and change the `HINT_IDS` assertion to the full
    eleven-id list. In `tests/settings/schema.test.ts`, add the four schema bullets next to the existing hintsSeen
    tests (reuse the file's blob helper). Tests first (RED), then the implementation (GREEN).

    Docs (re-read both files first; 261118-ih8 edits them before this task):
    `CHANGELOG.md` `[Unreleased]` / `### Added`, one entry after the safe-zone hint entry, wording in the same
    style: the HUD keeps Oolite's abbreviations, and a one-time hint explains each gauge the first time it
    matters: LT when the laser heats up, FWD/AFT when a shield is first hit, E1-E4 when the energy banks run low,
    CT when the cabin heats, and FUEL after the first jump.
    `.planning/PROJECT.md` Key Decisions: append one row after the last row of the table, titled "Explain the HUD
    gauge abbreviations with one-time first-use hints (Wegolite-only, owner decision 2026-11-18, quick
    261118-ioj)"; rationale: Oolite's abbreviations are kept; the five hints, their thresholds and texts (D-03,
    D-04); the CT wording without the sun (D-06); the 0.9 energy threshold (D-07); the FUEL moment (D-08); ALT
    and MISS skipped because their gauges are placeholders (D-02); no show-hints toggle exists, the persisted
    seen list is the off switch (D-05); FWD/AFT, CT and E1-E4 with the pulse laser fire only once the player
    takes damage, which ordinary play does not do yet. Outcome cell: "✓ Quick 261118-ioj".

    Gates, in this order, each green before the next: `docker compose run --rm test`, `docker compose run --rm
    lint`, `docker compose run --rm typecheck`; commit (`feat(quick-261118-ioj): one-time hints for the FWD/AFT,
    E1-E4, CT and FUEL gauges` for code and tests, `docs(quick-261118-ioj): record the HUD gauge hints` for
    CHANGELOG and PROJECT.md); then on the remote `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm
    verify`; after it finishes, one more remote run of the two browser specs whose flows now post a gauge hint
    (the first jump posts FUEL, sustained fire can post LT):
    `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx
    playwright test tests/e2e/hyperspace.spec.ts tests/e2e/combat.spec.ts"`. If a spec fails because a gauge hint
    displaced an expected message row, fix the spec's wait (it must look for the row while it is drawn), never the
    hint, and record it in the SUMMARY. Record both remote results (snapshot sha, exit code, elapsed) in the
    SUMMARY together with the reachability note from the objective.
  </action>
  <verify>
    <automated>docker compose run --rm test &amp;&amp; docker compose run --rm lint &amp;&amp; docker compose run --rm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `rg -c '"(shields|energy|cabinTemp|fuel)"' src/settings/schema.ts` [HEAD=0 EXPECT>=8]
    - `rg -c 'FWD/AFT: forward and aft shields|E1-E4: energy banks|CT: cabin temperature|FUEL: hyperspace fuel' src/app/hints.ts` [HEAD=0 EXPECT==4]
    - `rg -c '261118-ioj' .planning/PROJECT.md` [HEAD=0 EXPECT>=1]
    - `rg -c 'first jump' CHANGELOG.md` [HEAD=0 EXPECT>=1]
    - `git diff --name-only "$BASE" -- src/render/hud` prints nothing (BASE recorded in Task 1)
    - Remote `verify` exit=0 and the remote hyperspace/combat spec run exit=0, both on the committed HEAD
  </acceptance_criteria>
  <done>
    Five gauge hints fire once each at their D-03 thresholds and never again, the pristine ship triggers none, the
    settings schema accepts old and new blobs, docs record the decision and the ALT/MISS skip, and test, lint,
    typecheck, remote verify and the remote hyperspace/combat specs are green.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localStorage → settings parser | the `wegolite.settings` blob, including `hintsSeen`, is attacker-controlled |
| sim/HUD values → hint controller | gauge numbers come from the app's own model; only malformed numbers are a concern |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ioj-01 | Tampering | `src/settings/schema.ts` hintsSeen | medium | mitigate | new ids enter only through the `HintId` union and `HINT_IDS` allowlist (`HINT_ID_SET`); unknown strings are still rejected and the 16-entry cap stays; schema tests in Task 2 |
| T-ioj-02 | Denial of service | `src/app/hints.ts` gauge predicates | low | mitigate | every predicate is a plain comparison that is false for NaN, so a non-finite gauge never posts or spends a hint and never throws; NaN test in Task 2 |
| T-ioj-03 | Information disclosure | hint texts | low | accept | fixed English strings, no player or entity data |
| T-ioj-SC | Tampering | npm installs | low | accept | no package is installed by this plan |
</threat_model>

<verification>
- `docker compose run --rm test`, `lint`, `typecheck` green locally in Docker.
- Remote `verify` green on the committed HEAD; remote hyperspace.spec.ts and combat.spec.ts green.
- `git diff` over the task's commits touches nothing under `src/render/hud/`.
- SUMMARY lists the five hints (id, legend, threshold, text), the skipped ALT and MISS with reasons, the D-06/D-07
  refinements of the owner's proposal, and the reachability note.
</verification>

<success_criteria>
- Each of LT, FWD/AFT, E1-E4, CT and FUEL has a one-time hint that fires on the first in-flight frame its drawn
  gauge crosses the D-03 threshold, is persisted in `hintsSeen`, and never shows again.
- No gauge hint fires for a pristine ship, while docked, or while launching.
- Older settings blobs still validate; the eleven ids fit the 16-entry cap.
- PROJECT.md row and CHANGELOG entry present; abbreviations unchanged on the HUD.
</success_criteria>

<output>
Create `.planning/quick/261118-ioj-first-use-hints-that-explain-the-hud-gau/261118-ioj-SUMMARY.md` when done
</output>
