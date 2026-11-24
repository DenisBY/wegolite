---
phase: 20-player-death-and-game-over
plan: 05
subsystem: ui-game-over
tags: [game-over, overlay, descriptions-plist, textContent, reload-on-input]

requires:
  - phase: 20-player-death-and-game-over
    provides: "PlayerDeathCause { damage, culprit } from plan 20-01"
provides:
  - "src/ui/game-over.ts: the game-over line model (buildGameOverLines, resolveCulpritName) and the overlay shell (createGameOverOverlay with setFilter)"
  - "index.html: the hidden #game-over overlay with four data-game-over-line elements, its CSS, and the #hud[data-dead] rule"
affects: [20-07, 20-08, 20-09, 20-10]

actuals:
  tokens: 5100
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "injected root, key target and reload so the shell is unit-tested in Node with EventTarget doubles"
    - "one AbortController per show; one guarded trigger so reload runs at most once"

key-files:
  created:
    - src/ui/game-over.ts
    - tests/ui/game-over.test.ts
  modified:
    - index.html

key-decisions:
  - "The cause line uses the name-free wording for an undefined or empty culprit name and writes a name verbatim (replace with a function, so $& or %@ in a name is not interpreted)"
  - "Line CSS selects by #game-over-title and :nth-child so the plan's count of data-game-over-line= in index.html stays at the four markup attributes"
  - "The factory looks up the four lines before it resolves window, so a missing line throws its own message even where there is no window"

requirements-completed: [DEATH-01, DEATH-06]

duration: 35min
completed: 2026-11-23
status: complete
plan_head_before: 187167433a9d0246bc4b0cdeb38dcf7c71593b11
plan_head_after: efe13a6

coverage:
  - id: D1
    description: "The line model gives Oolite's title and prompt, the cause line per damage kind and compiled culprit name (name-free fallbacks), and the score line with U+00A0 before exactly one credit sign"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/ui/game-over.test.ts#buildGameOverLines"
        status: pass
      - kind: unit
        ref: "tests/ui/game-over.test.ts#resolveCulpritName"
        status: pass
    human_judgment: false
  - id: D2
    description: "The overlay shows the four lines through textContent, takes focus, and reloads once on a fresh Space press or a click; auto-repeat and other keys do nothing; listeners exist only while shown; setFilter writes the root filter"
    requirement: DEATH-06
    verification:
      - kind: unit
        ref: "tests/ui/game-over.test.ts#the game-over overlay shell"
        status: pass
    human_judgment: false
  - id: D3
    description: "The page has the hidden #game-over overlay with four line elements and the #hud[data-dead] rule hiding the version and system lines"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/ui/game-over.test.ts#the game-over constants and markup"
        status: pass
    human_judgment: false
  - id: D4
    description: "How the overlay looks centred over the scene (layout, spacing, the click cursor) in the real page"
    verification: []
    human_judgment: true
    rationale: "Visual layout is not asserted by a unit test; 20-07 wires the overlay and 20-09 and the phase UAT (20-10) view it in the browser"
---

# Phase 20 Plan 05: Game-over view Summary

**The game-over view as a self-contained UI module: Oolite's three lines plus a cause line built from compiled names, and a shell that reloads the page on a fresh Space press or a click, with its markup and CSS in `index.html`.**

## Performance

- **Duration:** about 35 min (most of it the full `test` run under load from three sibling executors)
- **Completed:** 2026-11-23T17:44Z
- **Tasks:** 2 (4 commits: RED and GREEN per task)
- **Files changed:** 3 (2 created, 1 modified)

## Accomplishments

- `src/ui/game-over.ts`: `createGameOverOverlay({ root, keyTarget?, reload? })`. The factory finds the four `[data-game-over-line]` elements (throws `Wegolite: the game-over overlay is missing its "<name>" line.`). `show` writes the lines with `textContent` only, unhides and focuses the root, then attaches through one `AbortController` a keydown listener (acts on `code === "Space" && !repeat`, calls `preventDefault`) and a click listener on the root, both through one guarded trigger that calls `reload` at most once (default `window.location.reload()`). `show` is idempotent; `dispose` aborts the listeners and hides the root; `setFilter` writes `root.style.filter`, shown or not, so 20-08 can fade the text with the scene.
- `buildGameOverLines(cause, culpritName, creditsDecicredits, ratingLabel)` and `resolveCulpritName(key, catalogue, targetNames)`: the name comes from the catalogue, else the compiled static names, else `undefined`, never the key.
- `index.html`: `#game-over` (hidden, `role="dialog"`, `tabindex="-1"`, four `<p data-game-over-line>`), its CSS (absolute, centred column, transparent, `#33ff66` monospace, z-index 15 below `#pause`, `cursor: pointer`, gaps after the cause and the score), and `#hud[data-dead] ~ #overlay #title` / `#status` joined to the existing visibility rule.

## Strings and citations

| Constant | Value | Source at the pin `7437f22` / vendored copy |
|----------|-------|----------------------------------------------|
| `GAME_OVER_TITLE` | `Game Over` | `descriptions.plist:1993` (`gameoverscreen-game-over`) |
| `GAME_OVER_SCORE_TEMPLATE` | `Score: %@, [credits_number]` U+00A0 `₢` | `descriptions.plist:1991` (`gameoverscreen-score-@`); `od -c` of the vendored line shows `302 240 342 202 242` between `]` and the closing quote: `c2 a0` (U+00A0) then `e2 82 a2` (₢) |
| `GAME_OVER_PRESS_SPACE` | `Press Space` | `descriptions.plist:1992` (`gameoverscreen-press-space`) |

The source holds the template with the escape ` ` (one line in the file matches `u00A0₢`) so the character is visible in review. A test asserts the code point before the sign is 0xa0.

## Cause wording (D-03, Wegolite text, no Oolite source)

| Damage | Culprit name | Line |
|--------|--------------|------|
| laser | "Krait" | `Destroyed by Krait` |
| scrape | "Navigation Buoy" / "Witchpoint Beacon" | `Collided with Navigation Buoy` / `Collided with Witchpoint Beacon` |
| laser | none or empty | `Destroyed` |
| scrape | none or empty | `Destroyed in a collision` |

Score for a new commander: `Score: Harmless   (0), 100.0` + U+00A0 + `₢` (`formatRating(rating, 0)`; `formatDecicredits` supplies the grouped number, its trailing U+0020 and sign are cut after asserting they are there).

## Shell input rules

A fresh Space keydown (`code` "Space", `repeat` false, not rebindable) or a click on the overlay calls `reload` exactly once; after the first, further Space and clicks do nothing. A repeating Space (held from before the view) and every other key (`Escape`, `KeyP`, `F2`, `KeyA` tested) do nothing and are not prevented. Before `show` and after `dispose` nothing is listened to. There is no timer.

## Task Commits

1. **Task 1 (tracer): shell and markup** - `b6ca903` (test, red: skeleton plus 8 failing cases), `a38e20e` (feat, green)
2. **Task 2: line model** - `210918c` (test, red: skeleton exports plus 7 failing cases), `efe13a6` (feat, green)

**Plan metadata:** the commit that adds this SUMMARY (docs).

RED evidence: both red commits carry a compile skeleton so the cases fail on their planned assertions (an empty overlay does not show or reload; the stub model returns empty strings) instead of on an import error. The classifier command was not run: the plan type is `execute`, not `tdd`, and `workflow.tdd_mode` was not the governing gate.

## Verification record

- Targeted: `tests/ui/game-over.test.ts` 21 cases pass; with `tests/ui/station-status.test.ts` 44 pass; `typecheck` exit 0; `lint` (eslint and prettier) exit 0.
- Acceptance greps: `export function createGameOverOverlay` 1; `location.reload` 1; `innerHTML|insertAdjacentHTML` absent; `id="game-over"` 1; `data-game-over-line=` 4; `#hud[data-dead] ~ #overlay` 2; `setFilter` 2 (>= 2); `export function (buildGameOverLines|resolveCulpritName)` 2; `u00A0₢` 1 in the source; the test file holds "Collided with Navigation Buoy", "Harmless   (0), 100.0" and the 0xa0 assertion.
- Remote `verify` (`wegolite-remote-run.sh run --rm verify`): `snapshot=efe13a6`, `exit=0`, `elapsed=200s`; 282 test files and 7392 tests passed (10 skipped), lint and prettier clean, 28 Chromium e2e smoke specs passed.
- Local full `docker compose run --rm test` at `efe13a6`, run while three sibling executors shared the machine: 10 files reported failures, every one a 5000 ms timeout in a file this plan does not touch (`oracle-independence`, `tools-determinism`, `tick-flyers`, `world-lifecycle`, `kill.property`, `attack-dispatch`, `hot-weapon`, and others). Reruns of the named files passed (`tools-determinism`, `world-lifecycle` and `attack-dispatch` passed with `--testTimeout=60000`), and the unloaded remote `verify` ran the same full unit suite green at the same HEAD. No coverage-threshold line appeared.

## Decisions Made

- The score's number is `formatDecicredits` without its `" ₢"` suffix; a missing suffix throws rather than printing a malformed line.
- The overlay's line lookup runs before the `window` default resolves, so the missing-line message is reachable in Node.
- The click and Space listeners are attached only inside `show`, after the root is focused (T-20-15, T-20-16).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The CSS used `[data-game-over-line="..."]` selectors, which raised the `data-game-over-line=` count in `index.html` from the expected 4 to 7**
- **Found during:** Task 1 acceptance run
- **Fix:** the title style uses `#game-over-title`, the two spacing rules use `#game-over p:nth-child(2)` and `(3)`; the count is 4
- **Files modified:** `index.html`
- **Committed in:** `a38e20e`

**2. [Rule 1 - Bug] `createGameOverOverlay` resolved `window` before looking up the lines, so a Node test of the missing-line message threw `window is not defined`**
- **Found during:** Task 1 green run
- **Fix:** the lookup runs first; the test also passes an injected key target
- **Committed in:** `a38e20e`

**Total deviations:** 2 auto-fixed (both Rule 1). **Impact:** none on scope.

### Process notes

- The sandbox refused a `git rev-parse --git-dir` compound command, so the per-plan `gsd-plan-head-before` ledger file was not written. `plan_head_before` is the verified spawn base `187167433a9d0246bc4b0cdeb38dcf7c71593b11` and `commits` is the measured count of `git log` over that range (4 task commits).
- The Write tool turned ` ` typed in file content into a literal U+00A0 character; the source was corrected with a script so the escape is present (`rg -c 'u00A0₢' src/ui/game-over.ts` prints 1).
- No CHANGELOG entry, by the plan: the module is not wired (20-07), so nothing on screen changes.

## Issues Encountered

Full-suite timeouts under load (see the verification record); no real failure.

## Known Stubs

None. `createGameOverOverlay` is not yet called by the session; that wiring is 20-07's scope, recorded in the plan.

## Threat Flags

None. Lines are written with `textContent` (T-20-14, `rg 'innerHTML|insertAdjacentHTML'` finds nothing), listeners attach only at `show` and `repeat` is ignored with a one-shot trigger (T-20-15), and `preventDefault` plus focus handle Space (T-20-16).

## Next Phase Readiness

20-07 can construct the overlay from `#game-over` and call `show(buildGameOverLines(...))`; 20-08 can call `setFilter` with the canvas's saturate string and set `data-dead` on `#hud`.

---
*Phase: 20-player-death-and-game-over*
*Completed: 2026-11-23*

## Self-Check: PASSED

`src/ui/game-over.ts` and `tests/ui/game-over.test.ts` exist; commits `b6ca903`, `a38e20e`, `210918c`, `efe13a6` are ancestors of HEAD; every acceptance criterion of Tasks 1 and 2 was run and passed.
