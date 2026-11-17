---
phase: quick
plan: 261117-glc
type: execute
wave: 1
depends_on: []
files_modified:
  - src/render/hud/draw.ts
  - tests/hud/clock-lines.test.ts
  - CHANGELOG.md
autonomous: true
requirements: []

estimate:
  tokens: 25000
  raw_tokens: 25000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "The top-left ship's clock (for example `2084005:07:39:36`) is drawn in the same 20px HUD small font as the `Hyperspace: {target system}` line under it, so both lines are the same size."
    - "Both lines start at the clock rectangle's x (60). The clock line is centred at y = 50 and the Hyperspace line at y = 70 in the 1920x1080 design space, the first and third quarters of the 40px clock rectangle, so the two 20px lines sit inside the rectangle and do not overlap."
    - "HUD_ELEMENTS keeps its eleven entries and HUD_LAYOUT.clock stays { x: 60, y: 40, width: 360, height: 40 } (D-12/A2); the existing hud-model test that pins this still passes unchanged."
    - "The centre message line is still drawn with the 20px HUD small font, as it is today."
    - "Nothing under src/sim, src/content or src/app changes; the only source file touched is src/render/hud/draw.ts."
    - "CHANGELOG.md `## [Unreleased]` has a `### Changed` entry that tells the player the top-left clock is now the same size as the Hyperspace line."
  artifacts:
    - path: "src/render/hud/draw.ts"
      provides: "drawHud draws the clock and Hyperspace lines in HUD_SMALL_FONT at the first and third quarters of HUD_LAYOUT.clock; the unused large-font export is removed"
      contains: "HUD_LAYOUT.clock.height / 4"
    - path: "tests/hud/clock-lines.test.ts"
      provides: "Unit test that runs buildHudModel -> drawHud on a recording canvas context and pins font, x and y of the clock, Hyperspace and message lines"
      contains: "HUD_SMALL_FONT"
    - path: "CHANGELOG.md"
      provides: "Unreleased -> Changed entry for the smaller clock"
      contains: "clock"
  key_links:
    - from: "tests/hud/clock-lines.test.ts"
      to: "src/render/hud/draw.ts"
      via: "drawHud(context, model) with a fillText recorder that captures this.font at call time"
      pattern: "drawHud\\("
    - from: "src/render/hud/draw.ts"
      to: "src/render/hud/draw.ts"
      via: "drawHud clock block reads HUD_LAYOUT.clock (x, y, height) instead of literal offsets"
      pattern: "HUD_LAYOUT\\.clock\\.height"
---

<objective>
Shrink the top-left HUD clock text to the size of the "Hyperspace: {target system}" line drawn under it. The owner sent a screenshot showing the clock is too large next to the Hyperspace line.

Today `drawHud` in `src/render/hud/draw.ts` (lines 741-758) draws the clock with the large HUD font at `HUD_LAYOUT.clock.y + 20`, then switches to `HUD_SMALL_FONT` (20px) for the Hyperspace line at `HUD_LAYOUT.clock.y + 38`. With `textBaseline = "middle"` the large clock line and the small line almost touch, and the Hyperspace line runs 8px below the 40px clock rectangle.

After this plan both lines use `HUD_SMALL_FONT` and sit on the first and third quarters of the unchanged clock rectangle (y = 50 and y = 70). This also matches Oolite better: `/home/opencode/git/oolite/Resources/Config/hud.plist` gives `drawClock:` a character size of 12 (width = height = 12). At the 1.75x HUD scale this port uses (D-08, the scanner's 288x64 -> 504x112), 12 units is 21px, so a 20px clock is the faithful size.

Purpose: a smaller, upstream-faithful clock that reads as one two-line block with the Hyperspace target.
Output: an edited `src/render/hud/draw.ts`, a new `tests/hud/clock-lines.test.ts`, and a CHANGELOG `Changed` entry.

Correction to the brief: the brief says the large HUD font constant is also used for the centre message line. It is not. The message line (lines 760-768) sets no font and inherits `HUD_SMALL_FONT` from the Hyperspace line. `rg -w HUD_FONT src tests` finds only the declaration (line 41) and the clock line (line 742). Once the clock switches fonts, the large constant has no readers, so this plan deletes it rather than leave dead code. The message line's size does not change.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@src/render/hud/draw.ts
@tests/hud/projection.test.ts
@tests/ui/hud-model.test.ts
@CHANGELOG.md

Reviewer and subagent brief (from AGENTS.md):
- Tests and builds run in Docker only. Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test`, `docker compose run --rm test npx vitest run <file>`, `docker compose run --rm typecheck`, `docker compose run --rm lint`. `verify` and `verify-full` run only on the remote test machine; do not run them locally.
- Scratch files live under /tmp and are mounted into the container (`-v /tmp/<dir>:/scratch`), never added to the repo.
- Use the codebase-memory MCP index (project `wegolite`) before grepping, and prefer `rg` over `grep`.
- Oolite reference: read behaviour from `/home/opencode/git/oolite` (here `Resources/Config/hud.plist`, the `drawClock:` entry). Never fetch Oolite over the network.

Interfaces the executor needs (verified in the source):
- `src/render/hud/draw.ts`: `export const HUD_SMALL_FONT` (lines 43-44, 20px monospace stack); `export const HUD_LAYOUT` with `clock: { x: 60, y: 40, width: 360, height: 40 }` (line 117); `export function drawHud(context: CanvasRenderingContext2D, model: HudModel): void` (line 725). It sets `context.textBaseline = "middle"` and calls these context methods only: arc, beginPath, clearRect, closePath, ellipse, fill, fillRect, fillText, lineTo, moveTo, restore, save, stroke, strokeRect.
- `src/app/hud-model.ts` line 188: `buildHudModel(state, layout, config, message, fuelTenths, flashAlpha = 0, hyperspaceTarget = "", npc = [], options = {})`. It returns `clockText: formatClock(state.clockSeconds)` and `hyperspaceTarget`.
- `tests/helpers/lave.ts`: `laveFixture()` returns `{ layout, config }`. `src/sim/flight/state.ts`: `initFlightState(layout)`.
- Fake-context pattern to copy: `tests/hud/projection.test.ts` lines 219-262 (its `fillRect` recorder reads `this.fillStyle` inside a `vi.fn(function (this: ...) {...})`).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Draw the clock in the Hyperspace line's 20px font, both lines inside the clock rectangle</name>
  <files>tests/hud/clock-lines.test.ts, src/render/hud/draw.ts, CHANGELOG.md</files>
  <read_first>
    - src/render/hud/draw.ts lines 36-47 (font constants), 97-120 (HUD_LAYOUT), 724-772 (drawHud)
    - tests/hud/projection.test.ts lines 1-40 (header and imports) and 200-265 (the recording fake context)
    - tests/ui/hud-model.test.ts lines 94-102 (the D-12/A2 pin on HUD_ELEMENTS and HUD_LAYOUT.clock, which must stay untouched)
    - /home/opencode/git/oolite/Resources/Config/hud.plist lines 199-206 (the `drawClock:` entry, character size 12)
    - CHANGELOG.md lines 1-26 (the Unreleased section)
  </read_first>
  <behavior>
    - Test 1: when `drawHud` draws a model built by `buildHudModel(initFlightState(fixture.layout), fixture.layout, fixture.config, "Test message", 70, 0, "Diso")`, the `fillText` call whose text equals `model.clockText` records font `HUD_SMALL_FONT`, and the call with text `Hyperspace: Diso` records the same font. At HEAD this fails, because the clock is drawn with the large font.
    - Test 2: both calls use x = `HUD_LAYOUT.clock.x`. The clock call's y is `HUD_LAYOUT.clock.y + HUD_LAYOUT.clock.height / 4` (50) and the Hyperspace call's y is `HUD_LAYOUT.clock.y + (3 * HUD_LAYOUT.clock.height) / 4` (70). At HEAD this fails (60 and 78).
    - Test 3: with the pixel size parsed from `HUD_SMALL_FONT` by a leading-digits-then-px regex (20), the line pitch (Hyperspace y minus clock y) is at least that size, the clock line's top (y - size/2) is not above `HUD_LAYOUT.clock.y`, and the Hyperspace line's bottom (y + size/2) is not below `HUD_LAYOUT.clock.y + HUD_LAYOUT.clock.height`. The lines do not overlap and stay inside the rectangle.
    - Test 4: the `Test message` fillText call still records `HUD_SMALL_FONT`, so the centre message keeps its current size.
  </behavior>
  <action>
    RED. Create `tests/hud/clock-lines.test.ts` with the same SPDX and copyright header as `tests/hud/projection.test.ts` and a short doc comment: the top-left clock and the Hyperspace target line share the 20px HUD small font and the 40px clock rectangle (owner request 261117-glc; Oolite `hud.plist` `drawClock:` character size 12 at the 1.75x HUD scale, D-08; rectangle unchanged per D-12/A2). Imports: `describe`, `expect`, `it`, `vi` from vitest; `buildHudModel` from `../../src/app/hud-model.js`; `initFlightState` from `../../src/sim/flight/state.js`; `HUD_LAYOUT`, `HUD_SMALL_FONT`, `drawHud` from `../../src/render/hud/draw.js`; `laveFixture` from `../helpers/lave.js`. Build a fake `CanvasRenderingContext2D` in the style of the projection test: each of the fourteen methods listed in the context section is a `vi.fn()`; `fillText` is `vi.fn(function (this: { font: string }, text: string, x: number, y: number) {...})` and pushes `{ text, x, y, font: this.font }` into an array; the plain properties are strokeStyle, fillStyle, lineWidth, globalAlpha, font, textAlign and textBaseline. Cast it through `unknown` as the projection test does. Find each recorded call by exact text, assert it was found, then implement the four behaviours above as `it` cases inside one `describe`. Derive every expected number from `HUD_LAYOUT.clock` and `HUD_SMALL_FONT`, with no bare 50, 70 or 20 in the assertions, so the test follows the constants. Run the targeted command below. Tests 1, 2 and 3 must fail at HEAD; Test 4 passes. Commit: `test(quick-261117-glc): pin the clock and Hyperspace lines to one font inside the clock box`.

    GREEN. In `src/render/hud/draw.ts`, in the clock block of `drawHud`, set `context.font = HUD_SMALL_FONT` once before the clock `fillText`, and drop the now-redundant second font assignment before the Hyperspace line. Draw the clock at y `HUD_LAYOUT.clock.y + HUD_LAYOUT.clock.height / 4` and the Hyperspace line at y `HUD_LAYOUT.clock.y + (3 * HUD_LAYOUT.clock.height) / 4`. Keep `textAlign = "left"`, the x of `HUD_LAYOUT.clock.x`, the fill colour and the `(Unknown)` fallback exactly as they are. Keep the D-12/A2 comment (HUD_ELEMENTS and every HUD_LAYOUT rectangle stay unchanged; the target is a second line inside the clock rectangle) and add one or two lines above the clock draw. They say the clock uses the small font because Oolite's `hud.plist` `drawClock:` character size is 12, which is about 21px at the 1.75x HUD scale (D-08), and that the two 20px lines are centred on the first and third quarters of the clock rectangle. Do not leave a comment about the old size. Then delete the large-font export at lines 41-42, the constant declared just above `HUD_SMALL_FONT`. First confirm with `rg -w` over `src`, `tests`, `docs` and `scripts` that nothing outside `drawHud`'s old clock line reads it. If anything does, keep the constant and record why in the SUMMARY. Do not change `HUD_SMALL_FONT`, `HUD_GAUGE_FONT`, `HUD_LAYOUT`, `HUD_ELEMENTS` or anything outside this block and the constant (D-12/A2). Do not set a font on the message line; it keeps inheriting `HUD_SMALL_FONT`, which Test 4 pins.

    Add to `CHANGELOG.md` under `## [Unreleased]` -> `### Changed`, after the existing entry, one player-facing bullet in the file's style (wrapped near 78 columns, plain English). It should say the ship's clock at the top left of the flight view is now drawn at the same smaller size as the Hyperspace line beneath it, closer to Oolite, and that the two lines now fit together in the top-left corner. Run the targeted test, which must pass, then commit the draw.ts and CHANGELOG change together (AGENTS.md: a user-visible change and its changelog entry go in one commit): `fix(quick-261117-glc): draw the HUD clock at the Hyperspace line's size`.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/hud/clock-lines.test.ts tests/hud/projection.test.ts tests/ui/hud-model.test.ts</automated>
    <automated>! rg -q '28px' src/render/hud/draw.ts   # 28px match count [HEAD=1 EXPECT==0]</automated>
    <automated>test "$(rg -c 'HUD_LAYOUT\.clock\.height' src/render/hud/draw.ts)" -ge 2   # [HEAD=0 EXPECT>=2]</automated>
    <automated>sed -n '/^## \[Unreleased\]/,/^## \[0/p' CHANGELOG.md | rg -ci 'clock'   # clock lines in Unreleased; at HEAD rg finds none and exits 1 [HEAD=0 EXPECT>=1]</automated>
    <automated>git diff --quiet 74aa9fb -- src/sim src/content src/app   # scope guard: stays clean before and after this change</automated>
  </verify>
  <done>
    The new test fails at HEAD on Tests 1-3 and passes after the draw.ts edit. The clock and Hyperspace `fillText` calls both record `HUD_SMALL_FONT`, at x 60 and y 50 and 70. The projection and hud-model tests still pass, the latter with HUD_LAYOUT.clock unchanged. The large-font constant is gone from draw.ts. CHANGELOG Unreleased -> Changed mentions the clock. There are two commits: test (RED), then fix (GREEN) carrying draw.ts and CHANGELOG.md together.
  </done>
</task>

<task type="auto">
  <name>Task 2: Typecheck, lint and full unit suite in Docker</name>
  <files>src/render/hud/draw.ts, tests/hud/clock-lines.test.ts, CHANGELOG.md</files>
  <read_first>
    - The diff of Task 1's two commits (`git show --stat HEAD~1 HEAD`)
  </read_first>
  <action>
    Run `docker compose run --rm typecheck`, `docker compose run --rm lint` (eslint plus `prettier --check .`, which also covers CHANGELOG.md and the new test file) and the full `docker compose run --rm test`. If prettier reports a formatting difference in one of the three files, fix it with `docker compose run --rm lint npx prettier --write <file>` for that file only, rerun lint, and commit the fix as a new commit (do not amend): `style(quick-261117-glc): format the clock change`. If typecheck reports the removed constant as still referenced, the Task 1 importer check missed something. Restore the constant, rerun, and record it in the SUMMARY. Do not run `verify` or `verify-full` locally. This change is under `src/render/`, so AGENTS.md calls for `verify` on the remote test machine. Note in the SUMMARY that the orchestrator or owner runs it remotely after the commits.
  </action>
  <verify>
    <automated>docker compose run --rm typecheck && docker compose run --rm lint && docker compose run --rm test</automated>
  </verify>
  <done>
    Typecheck, lint and the full Vitest suite (with coverage) exit 0 in Docker. Any formatting fix is committed separately. The SUMMARY lists the remote `verify` run as pending for the orchestrator or owner.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| HUD model -> canvas | `clockText` and `hyperspaceTarget` are drawn as canvas text; this plan changes only their font and y position, not their source or content |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-glc-01 | Tampering | `drawHud` clock block in src/render/hud/draw.ts | low | accept | The change is presentation only: a font and two y offsets on the 2D HUD canvas. No input parsing, persistence, network or sim state is touched; `git diff --quiet 74aa9fb -- src/sim src/content src/app` pins that. `fillText` renders text, never markup, so a system name cannot inject anything. |
</threat_model>

<verification>
- Local, Docker: `docker compose run --rm test npx vitest run tests/hud/clock-lines.test.ts tests/hud/projection.test.ts tests/ui/hud-model.test.ts`, `docker compose run --rm typecheck`, `docker compose run --rm lint` and `docker compose run --rm test` all exit 0.
- `git diff --quiet 74aa9fb -- src/sim src/content src/app` exits 0. The only source file changed is `src/render/hud/draw.ts`.
- Remote (orchestrator or owner, not the executor): `wegolite-remote-run.sh run --rm verify` after the commits, because the change is browser-facing render code (AGENTS.md change-type gate).
- Visual check (owner, optional): in flight, the top-left clock reads at the same size as the Hyperspace line, and both fit in the corner.
</verification>

<success_criteria>
- The clock text and the "Hyperspace: {target system}" text are drawn in the same 20px HUD small font, pinned by `tests/hud/clock-lines.test.ts`.
- Both lines sit inside the unchanged 40px clock rectangle at y 50 and 70 without overlapping. HUD_ELEMENTS and HUD_LAYOUT are unchanged (D-12/A2).
- The centre message line keeps the 20px font.
- The dead large-font constant is removed, or kept with a recorded reason if an importer turns up.
- The CHANGELOG Unreleased -> Changed entry is present and in the same commit as the draw.ts change.
- Typecheck, lint and the full unit suite are green in Docker.
</success_criteria>

<output>
Create `.planning/quick/261117-glc-shrink-the-top-left-hud-clock-font-to-th/261117-glc-SUMMARY.md` when done
</output>
