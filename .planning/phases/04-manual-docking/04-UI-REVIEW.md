---
phase: 04
phase_name: Manual Docking
status: needs-work
overall_score: 14
overall_max: 24
blocking_count: 1
audited: 2026-11-05
baseline: >-
  No 04-UI-SPEC.md exists. Audited against the established HUD/docked visual
  language, the conventions in 03-UI-REVIEW.md, the GSD ui-brand output rules,
  and live Playwright capture in Docker.
---

# Phase 4 — UI Review

**Audited:** 2026-11-05
**Baseline:** No `04-UI-SPEC.md`. Audited against the existing green-vector HUD
and docked-panel language, `03-UI-REVIEW.md`, `references/ui-brand.md`, and
Docker Playwright evidence.
**Screenshots:** captured — 13 stills in
`.planning/ui-reviews/04-20261105-110526/` (desktop 1440x900, tablet 768x1024,
mobile 375x812, plus docked/owned/bounce/Continue states). The capture directory
is gitignored by `.planning/ui-reviews/.gitignore`.
**Interaction captures:** captured via Playwright in Docker — title (new game and
Continue), docked panel at 1440 and 1024, disabled and already-fitted purchase
states, HUD in flight, bounce red frame, pause, and the New-game transition.
The `chrome-devtools` interaction path was not used. No interaction state below
is reported from source alone.
**Registry audit:** skipped — no `components.json` (no shadcn).

> This is an advisory, read-only audit. It does not change product code and does
> not gate phase completion. The shake/flash feel (the human-judgement row in
> 04-03) and ultrawide readability remain open for `/gsd-verify-work`.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | The new docked copy is specific, but the controls list advertises a malformed "Docking computer (Shift+)" and neither save failure nor a successful purchase is ever acknowledged in words. |
| 2. Visuals | 2/4 | The docked purchase row is visually broken: the reason sits in the label column, the disabled Buy control looks fully active, and the two CTAs have no separation. The title still hides its scene behind an opaque gradient. |
| 3. Color | 3/4 | The green/black palette and the semantic red bounce frame are coherent; refusal and disabled states are not colour-differentiated from normal values. |
| 4. Typography | 3/4 | One monospace stack and no new size drift, but disabled/refusal text uses the same size, weight and colour as ordinary values. |
| 5. Spacing | 2/4 | The purchase reason breaks the two-column `dl` grid and the Buy/Launch buttons touch at exactly 0 px. |
| 6. Experience Design | 2/4 | The feedback/recovery architecture is strong, but New game permanently deletes the only save on one click with no confirmation, and slow starts or failed saves have no visible state. |

**Overall: 14/24**

Verdict: **needs work — one blocking defect.** The docking and autosave
mechanics are well proved; the new purchase surface and the title/save surfaces
are not yet ship-ready.

---

## Top 3 Priority Fixes

1. **New game irreversibly deletes the save on one click (BLOCKER).**
   `Continue` and `New game` are two identical adjacent buttons
   (`index.html:270-274`); clicking New game clears IndexedDB with no
   confirmation, no undo and no backup (`src/app/game-session.ts:450-466`,
   `:946-952`). A misclick destroys the player's only progress. Add an explicit
   confirmation when a save exists, default focus to Continue, and copy the
   blob to a one-slot backup before clearing.

2. **The title gives no save status and no busy state.**
   Boot distinguishes valid/corrupt/future/unavailable
   (`src/main.ts:136-160`) but only Continue visibility is surfaced
   (`src/main.ts:257`). A corrupt save, a future-version save (which also
   disables all writes for the session, `src/app/game-session.ts:406-416`) and a
   blocked IndexedDB all look like "no save". Meanwhile Start awaits an IDB clear
   plus asset/catalogue loads with no disabled state or `aria-busy`
   (`src/app/game-session.ts:937-987`). Show a `role="status"` save line, disable
   both buttons with "Starting…" during the await, and skip the IDB clear when
   boot status is already `absent`.

3. **The docked purchase control is visually and semantically broken.**
   The reason `<dd>` has no `<dt>` and auto-places in the 144 px label column
   instead of under the value (`index.html:108-113,287-289`); the disabled Buy
   button has identical colour, border, opacity and `cursor:pointer` to the
   enabled Launch button and even takes the hover fill
   (`index.html:130-144`); the buttons touch at 0 px (measured); the label stays
   "Buy docking computer" after purchase (`src/ui/docked.ts:92-96`). Put the
   reason in the value column with `aria-describedby`, add a real `:disabled`
   style and a button gap, change the owned label, and announce
   "Docking computer fitted — Shift+C docks inside the aegis". Also fix
   `ACTION_LABELS.dockingComputer` and render the Shift chord in Controls
   (`src/input/actions.ts:82`, `src/ui/controls.ts:195`) — right now the only
   place a player can learn Shift+C is by reading source.

---

## Detailed Findings

Severity: **BLOCKER** = must fix before shipping; **WARNING** = degrades quality
or task confidence but does not stop every flow; **MINOR** = polish.

### Pillar 1: Copywriting (2/4)

- **[WARNING] The docking-computer control label is malformed and hides the
  chord.** `ACTION_LABELS.dockingComputer` is `"Docking computer (Shift+)"`
  (`src/input/actions.ts:82`), a dangling parenthetical. The Controls row renders
  that label beside `labelFor(...)` = `"C"` (`src/ui/controls.ts:191-195`), so
  the panel never actually says **Shift+C**. A player who buys the computer sees
  "C", presses C in flight, and nothing happens by design
  (`src/input/keyboard.ts:44-113`). This is a task-discovery failure for
  DOCK-05.
- **[WARNING] Save failures have no user-facing copy.** `main.ts` computes
  `saveStatus` `valid | absent | corrupt | future | unavailable`
  (`src/main.ts:136-160`) and only uses it for Continue visibility
  (`:257`). Nothing tells the player "the save is corrupt", "this save is from a
  newer version and will not be overwritten", or "saving is unavailable in this
  browser". For a `future` blob every launch/purchase write is silently skipped
  for the whole session (`src/app/game-session.ts:406-416`).
- **[WARNING] A successful purchase is never acknowledged in words.** The buy
  path refreshes the fields and calls autosave
  (`src/app/game-session.ts:352-362`), but the button keeps the imperative
  "Buy docking computer" label and the only feedback is the reason turning into
  "Already fitted" (`src/ui/docked.ts:92-96`). The docked message line is still
  occupied by the launch hint. A 1500.0 Cr transaction deserves a confirmation
  line and a live-region announcement.
- **[WARNING] Stale foundation-build copy is still visible in-game.**
  `index.html:6` titles the document `Wegolite — foundation build`;
  `index.html:265-268` keeps `#overlay` with the same line; and
  `src/main.ts:333-336` writes `Wegolite — new game: Lave`. The overlay is
  visible over both the docked and flight screens (see
  `docked-desktop.png`, `hud-inflight.png`). This was carried over from Phase 3
  and remains unfixed.
- **[MINOR] ASCII hyphens break the otherwise consistent em-dash voice.**
  `"Too wide for the slot - roll 90 degrees..."`, `"Hull contact - pull away..."`
  and `"Scrape - ease toward..."` (`src/app/game-session.ts:290,293,295,635`)
  sit beside em-dash copy such as `"Launching — stand by"` and
  `"Docking Computers — 1500.0 Cr"`.
- **[MINOR] Singular/plural inconsistency.** The row label is "Docking computer"
  (`index.html:287`) while the catalogue line and panel value are "Docking
  Computers" (`src/app/game-session.ts:309`). Pick one.
- **Positive:** the docked values (`Lave`, `100.0 Cr`, `Cobra Mk III`, `7.0 LY`),
  the D-10 line `Docking Computers — 1500.0 Cr (TL 9)`, the refusal reasons
  ("Requires TL 9", "Already fitted", "Not enough credits") and the bounce copy
  are specific and player-readable. The fixed dockDenied copy names the two
  causes ("No docking computer fitted", "Too far from the station to engage
  docking computer") rather than leaking enums.

### Pillar 2: Visuals (2/4)

- **[WARNING] The disabled Buy control is visually indistinguishable from the
  enabled Launch control.** Measured computed styles at 1440×900: both are
  `color: rgb(51,255,102)`, transparent background, same green border, opacity
  `1`, and `cursor: pointer`; the disabled flag is the only difference
  (`index.html:130-144`, `src/ui/docked.ts:95`). At 1024×700 the disabled button
  even receives the `:hover` fill because the rule does not exclude
  `:disabled` — see `docked-1024.png` and `docked-disabled-focus.png`. A player
  reasonably concludes the purchase is available.
- **[WARNING] The purchase reason is in the wrong visual column.** The third
  `<dd>` starts a new `dl` grid row in column 1 (`index.html:108-113,287-289`),
  so "Requires TL 9" / "Already fitted" is rendered at x=474 in a 144 px cell,
  while every value is at x=642. It reads as an unlabeled field of its own and
  is detached from the row and the button it explains. The `dd` also has no
  preceding `dt`, which is invalid `dl` grouping and will be announced awkwardly.
- **[WARNING] Buy and Launch touch with a 0 px gap.** The measured rectangle gap
  is exactly `0`; their 1 px borders fuse into a single line and the two actions
  read as one segmented control rather than a secondary and a primary action
  (`index.html:130-138`, no margin rule). The disabled secondary "Buy" is also
  placed above the primary "Launch" and has equal visual weight.
- **[WARNING] The title screen still hides the menu scene it builds.** The
  screenshot `title-new-game.png` shows only the opaque radial gradient; no
  starfield and no Cobra. The canvas is covered by
  `background: radial-gradient(circle at 50% 40%, #04120a, #000 70%)`
  (`index.html:49-60`). This is the Phase 3 finding, unchanged and still a
  contract gap for the title surface Phase 4 extended with Continue.
- **[WARNING] The debug overlay is still drawn over the docked and flight
  screens.** `#overlay` at `top:1rem; left:1rem` (`index.html:31-38`) displays
  the two stale lines in the top-left of `docked-desktop.png` and
  `hud-inflight.png`. At 1280×720 the HUD clock is at roughly x 40-280, y 27-53
  (`src/render/hud/draw.ts:97`), so the overlay and clock occupy the same corner.
- **[MINOR] The reason row reserves blank space when there is nothing to say.**
  `.docked-message` has `min-height: 1.7em` and `margin-bottom: 1rem`
  (`index.html:123-128`); on a purchasable item the empty reason `<dd>` still
  occupies about 47 px inside the grid, producing a hole between the row and the
  hint.
- **Positive:** the docked panel has a clear heading, readable 18 px values and
  a centred 558 px panel that fits 1024×700 and 1440×900. The red bounce frame is
  drawn last, over the HUD, and is clearly visible in `hud-bounce-frame.png`
  (`src/render/hud/draw.ts:353-374,427-428`). The HUD composition itself remains
  legible and hierarchical.

### Pillar 3: Color (3/4)

- **[WARNING] Refusal and disabled states are not colour-differentiated.** The
  reason inherits `#33ff66` (`index.html:123-128`) and the disabled button keeps
  the same green border and text (`:130-144`). Green is the palette's normal
  information colour; there is no amber/dim state for "cannot do this", so the
  only real signal is the small reason string.
- **[MINOR] Off-palette greens and duplicated palette literals persist.** The DOM
  still uses `#cfc`, `#9f9`, `#9a9` and `#8a8` (`index.html:35,46,216,222,256`)
  alongside the declared `#33ff66`/`#ffb000`/`#ff4444`
  (`src/render/hud/draw.ts:29-31`). There are no CSS custom properties, so the
  palette still has to be changed in two places.
- **[MINOR] The bounce frame re-declares the palette red as a literal.** 
  `rgba(255, 68, 68, ...)` in `drawFlash` (`src/render/hud/draw.ts:359`) duplicates
  `HUD_RED = "#ff4444"` (`:31`). A token/constant would prevent drift.
- **Positive:** the 60/30/10 read is correct — black dominates, one green accent
  carries the vector HUD, and amber/red remain semantic. The red frame uses the
  same semantic red as the condition light, and contrast of green on black and
  the muted docked labels is strong.

### Pillar 4: Typography (3/4)

- **[WARNING] State text has no typographic hierarchy.** The purchase reason,
  the normal values and the labels all use the same 18 px monospace weight
  (`index.html:92,123-128`); "Requires TL 9" is not dimmed, small, italic or
  otherwise distinguished. Combined with the colour finding, the refusal is
  typographically invisible as a refusal.
- **[MINOR] There is still no type scale.** The UI uses 12/13/16/18/20/24/48 px
  DOM sizes (`index.html:36,59,64,92,104,160,257`) plus the HUD's 20/28 px design
  sizes (`src/render/hud/draw.ts:32-35`). Phase 4 adds no new sizes, but it does
  not reduce the undeclared set.
- **Positive:** one explicit monospace stack is used for every new surface; the
  HUD sizes and the docked 18/24 px pair are consistent; there is no Phase 4
  typography drift.

### Pillar 5: Spacing (2/4)

- **[WARNING] The purchase reason breaks the two-column grid.** The `dl` is
  `grid-template-columns: auto 1fr` (`index.html:108-113`); the extra `<dd>` is
  auto-placed in column 1 and measured at 144 px wide versus the 324 px value
  column. Longer reasons ("Not enough credits", "Equipment unavailable") will
  wrap or overflow inside that narrow label cell, while the value column stays
  empty on that row. The empty 47 px reserved row (above) compounds this.
- **[WARNING] The CTAs have no spacing between them.** Measured
  `launch.top - buy.bottom = 0`. The two full-width buttons stack border-to-
  border (`index.html:130-138`), which looks like a fused two-row control and
  makes a Launch misclick easier.
- **[MINOR] The docked panel's vertical rhythm is accidental.** The reason's
  `1rem` bottom margin, the `dl`'s `1.5rem` bottom margin and the message's
  `1.7em` min-height (`index.html:108-128`) combine into an irregular gap before
  the hint and buttons. The older arbitrary `0.35rem`/`2.4rem`/`0.6rem` values
  also remain (`:69,254`).
- **Positive:** the panel padding is a consistent `1.5rem 2rem`, the data grid
  uses `0.25rem 1.5rem`, the panel is centred at both tested desktop sizes, and
  the HUD layout remains systematic and inside its design rects.

### Pillar 6: Experience Design (2/4)

- **[BLOCKER] New game is a one-click, irreversible save delete.** The title
  presents two identical adjacent buttons. Clicking New game
  (`index.html:273`) calls `session.start()` (`src/main.ts:263-265`), which
  awaits `clearSaveForNewGame()` before the first asset load
  (`src/app/game-session.ts:946-952`); that method deletes the blob with no
  confirmation, no undo and no backup (`:450-466`). Verified in the live browser:
  zero dialogs fired and `probe.save.status` became `absent` immediately after
  the click. The save is the only copy of progress in v1.
- **[WARNING] The start transition has no loading state and can block for
  seconds.** `title.onStart` leaves both buttons enabled and there is no
  `aria-busy`, spinner or text change (`src/ui/title.ts:38-64`,
  `index.html:270-274`). The start path awaits an IndexedDB clear, asset
  preload, the ship catalogue, the equipment catalogue and the dock-port load
  (`src/app/game-session.ts:946-1015`). In the Docker e2e rerun, four cases
  timed out waiting 5 s for `#docked` after `#title-start`; the same clicks
  succeeded in the live capture with a generous wait. This also affects a cold
  or slow machine. Skip the clear when `saveStatus === "absent"` and show a
  disabled "Starting…" state.
- **[WARNING] A failed or future save is indistinguishable from no save.** The
  title only hides/shows Continue (`src/main.ts:257`). A corrupt blob, a
  future-version blob (writes disabled for the session,
  `src/app/game-session.ts:406-416`) and an unavailable IndexedDB all present as
  the same "New game" screen. The player gets no warning that progress will not
  persist.
- **[WARNING] Bounce and scrape feedback are inaccessible to assistive
  technology.** The HUD canvas is `aria-hidden="true"` (`index.html:264`); the
  bounce message and red frame are painted on it
  (`src/app/game-session.ts:624-640`, `src/render/hud/draw.ts:427-428`). Nothing
  mirrors "Hull contact…" or "Scrape…" to a DOM live region, so a screen-reader
  player receives no failure feedback in flight.
- **[WARNING] No reduced-motion path for the new shake and flash.** The bounce
  runs a 0.35 s camera shake and a 0.4 s red frame
  (`src/app/dock-feedback.ts:25-29,105-120`) with no `prefers-reduced-motion`
  branch; the inherited launch flash has the same gap. A still cannot show the
  shake, but the code path is unconditional.
- **[WARNING] The Shift+C affordance is not surfaced in the docked or flight
  UI.** The purchase line never says how to use the computer, and the docked
  panel's own "Already fitted" reason does not either. The only in-flight denial
  copy is "No docking computer fitted" (`src/app/game-session.ts:607-613`),
  which does not mention the chord. See the copy finding for the broken
  Controls label.
- **[MINOR] The docked panel does not take focus or announce itself.** `#docked`
  is a plain `div` (`index.html:275`) and `title.hide()` leaves focus on the
  now-hidden New game button (`src/ui/title.ts:41-42`). Keyboard players can
  still press 1/F1, but the panel is not a dialog and has no focus entry.
- **Positive:** the rest of the experience architecture is strong. Every bounce
  returns to `inFlight` on the same tick; scrape messages are throttled to one
  per simulated second; priority messages pre-empt teaching copy; the docked,
  computer-dock and denied paths each have distinct copy; autosave resolves on
  the IndexedDB transaction `oncomplete` with a monotonic revision; New game
  clears before starting; a tainted `?test=1` profile never persists; and the
  probe exposes `dock` and `save` counters for the e2e.

---

## Playwright / Docker Evidence

Command run in the project image:

```text
docker compose run --rm e2e sh -lc "npm run build && npx playwright test \
  tests/e2e/docking.spec.ts tests/e2e/autosave.spec.ts --reporter=line"
```

Result: **10 passed, 4 failed in 2.9 min** (two workers, SwiftShader). All four
failures were waits, not content mismatches:

- `autosave.spec.ts:289` New game clears a committed save — timed out after 5 s
  waiting for `#docked` after `#title-start` on a fresh context.
- `docking.spec.ts:215` bounce/retry — timed out after 30 s in
  `waitForMode("inFlight")`.
- `docking.spec.ts:399` Shift+C — timed out after 5 s waiting for `#docked` in
  `bootToDocked`.
- `docking.spec.ts:454` Shift+C beyond aegis — same 5 s `bootToDocked` timeout.

The same browser flows completed in the independent capture run with 60 s waits.
Read this as evidence that the start path is now slow enough to exceed the
tests' default 5 s visibility expectation under load, and that the title exposes
no busy state — not as a copy or docking-rule regression. The 5 s waits should
be made robust, and the IDB clear should be skipped for `absent`.

---

## Manual / Visual Gaps Carried Forward

These cannot be settled from stills or source and remain for `/gsd-verify-work`:

- Shake amplitude/duration and flash feel at 1280×720, 1920×1080 and ultrawide
  (04-03's D6 human-judgement row).
- Whether the 0.35 s / 0.6 m cockpit shake reads as a bounce rather than camera
  noise against the station interior.
- Console/tearing/DID NOT PERFORM: no motion capture or audio (sound is out of
  scope).

---

## Files Audited

- `index.html` (all inline CSS and DOM roots, especially `#title-screen`,
  `#docked`, `#overlay`)
- `src/main.ts` (boot save read, title wiring, status line)
- `src/app/game-session.ts` (docked purchase, bounce/scrape, save skip, start)
- `src/app/dock-feedback.ts` (shake/flash envelopes)
- `src/app/hints.ts`, `src/app/hud-model.ts`
- `src/ui/title.ts`, `src/ui/docked.ts`, `src/ui/controls.ts`
- `src/input/actions.ts`, `src/input/keyboard.ts`, `src/input/bindings.ts`
- `src/render/hud/draw.ts`, `src/render/hud/messages.ts`,
  `src/render/launch-camera.ts`
- `tests/e2e/docking.spec.ts`, `tests/e2e/autosave.spec.ts`
- Captures: `.planning/ui-reviews/04-20261105-110526/` (13 PNGs)
- Phase artifacts: `04-CONTEXT.md`, `04-01`…`04-05` `PLAN.md`/`SUMMARY.md`,
  `04-VALIDATION.md`, `04-PATTERNS.md`
- Reference: `03-UI-REVIEW.md`, `references/ui-brand.md`

**Files that should be fixed:** `index.html`, `src/main.ts`,
`src/app/game-session.ts`, `src/ui/title.ts`, `src/ui/docked.ts`,
`src/ui/controls.ts`, `src/input/actions.ts`; optional reduced-motion touch in
`src/app/dock-feedback.ts` / `src/render/hud/draw.ts`; and the 5 s e2e waits in
`tests/e2e/docking.spec.ts` / `tests/e2e/autosave.spec.ts`.
