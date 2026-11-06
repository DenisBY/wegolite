# Phase 6 — UI Review

**Audited:** 2026-11-06
**Baseline:** Abstract 6-pillar standards. No `06-UI-SPEC.md` exists for this phase; the audit also uses the established green-vector HUD / station-shell visual language, the `03`/`04` UI reviews, and the phase's own D-01–D-25 contract.
**Screenshots:** not captured — no Wegolite dev server on `5173`/`8080`. Port `3000` answered `200` but serves an unrelated Grafana instance, not this app, so it was rejected as a capture target. This is a **code-only audit**; the visual findings below are derived from markup, CSS, canvas code and geometry, not pixel measurements.
**Interaction captures:** off (`workflow.ui_interaction_capture` is false).
**Registry audit:** skipped — no `components.json` (no shadcn).

> Read-only audit. No product code was changed. Desktop web only per `AGENTS.md`; mobile/tablet breakpoints were not scored.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | The new flight/save copy is specific and player-readable, but the chart never names the active range or the committed target, the countdown does not advertise its abort, and a corrupt/future save is reduced to "read-only". |
| 2. Visuals | 2/4 | The fixed chart footer physically covers 11–20% of the plot (59 systems at 1280×720); the debug overlay collides with the new HUD target line; selection and target markers are nearly the same yellow disc. |
| 3. Color | 2/4 | The 60/30/10 palette is coherent, but dimmed/unreachable labels are 2.61:1 on black, the fuel circle is 2.75:1, and success and failure notices share the same amber. |
| 4. Typography | 3/4 | One monospace stack and no new size drift; the chart's 12 px labels are below the 15–18 px UI floor, and the Save/Load title is duplicated. |
| 5. Spacing | 2/4 | The chart footer is `position: fixed` and removes itself from the flex flow, so the canvas is sized underneath it; the HUD target line sits on the floor of a 40 px clock rectangle. |
| 6. Experience Design | 2/4 | The overwrite confirmation's safe-focus design is defeated by the global Enter binding, the modal does not trap Save/Load, and the chart/flight feedback has no accessible live region. |

**Overall: 14/24**

Verdict: **needs work — two blockers.** The hyperspace core, persistence pipeline and probe coverage are strong, and the new screens use the right shell language. The chart's layout undermines its own "whole galaxy" contract, and the F2 overwrite dialog does not safely protect the only save.

---

## Top 3 Priority Fixes

1. **The overwrite confirmation can still overwrite on a stray Enter (BLOCKER).**
   `confirmOverwrite()` deliberately focuses `Cancel` (`src/ui/save-load.ts:276-280`), but Enter is globally bound to `saveScreenConfirm` (`src/input/actions.ts:191`) and the session writes whenever the dialog is open (`src/app/game-session.ts:1575-1578`). The window listener calls `preventDefault()` (`src/input/keyboard.ts:409-411`), so the native Cancel activation is suppressed and the frame drain writes the only save. The same modal keeps `Save`, `Load` and arrow actions live (`src/app/game-session.ts:1566-1579`), so `L` can load behind the confirmation. **Impact:** a player who presses Enter expecting the focused Cancel to win can replace the only autosave. **Fix:** while confirming, bind confirm to `Y` only and let Enter activate the focused native button; gate every `saveScreen*` action behind `!isConfirming()` except Confirm/Cancel/Return; add a test that presses Enter with Cancel focused and asserts the bytes are unchanged.

2. **The chart's fixed footer covers the bottom of the galaxy and intercepts clicks (BLOCKER).**
   `.station-footer` is `position: fixed` (`index.html:309-319`); `#chart .station-footer` only moves it to `bottom: 2rem` (`index.html:357-359`), while `#chart-canvas { flex: 1 }` (`index.html:350-355`) is sized to the full remaining height. The four-line footer is ~108 px tall, so at 1280×720 the top of the footer is y≈580 while the long-range plot runs to y≈708: **128 px (20%) of the plot, ~51 chart-y units, 59 of 256 systems are painted under an opaque footer and cannot be clicked**. At 1440×900 and 1920×1080 the loss is ~11% (~32 systems). **Impact:** systems in the southern band cannot be seen or mouse-selected; the "long range shows the entire galaxy" contract is physically unmet. **Fix:** make the chart footer an in-flow flex item (`position: static; flex: 0 0 auto`) and let `#chart-canvas` measure only the plot area, then re-check the projection at 1280×720 and 1920×1080.

3. **The chart does not expose its range or committed target, and H is silently inert while it is open (WARNING).**
   The footer has only target/distance/fuel/keys fields (`index.html:747-751`); `renderReadout()` writes the **selected** system into `chart-target`, never the committed target (`src/ui/chart.ts:139-152`). There is no short/long range badge, and the hard-coded hint says only "Tab: range" (`src/ui/chart.ts:28-29`). `hyperspace` is scoped to `flight` only (`src/input/actions.ts:309`), so pressing H on the chart does nothing and produces no copy. **Impact:** after committing a target and selecting another system, no text identifies the target; players cannot tell which range they are in or that they must close the chart before jumping. **Fix:** add a visible "Short range"/"Long range" label, show the committed target separately from the selection, add a "close, then H" affordance (or let H close-and-jump), and make the readout `role="status"`.

---

## Detailed Findings

Severity: **BLOCKER** = must fix before shipping; **WARNING** = degrades quality or task confidence; **MINOR** = polish.

### Pillar 1: Copywriting (3/4)

- **[WARNING] The chart never says which range is active.** `KEY_HINT` says "Tab: range" (`src/ui/chart.ts:28-29`) but the header is only "Galactic chart" / "F6" (`index.html:743-744`) and the four footer fields (`index.html:747-751`) contain no range value. The projection changes scale, but the player must infer whether they are in the fixed short window or the whole galaxy. Every Oolite chart surface names the projection; this one does not.
- **[WARNING] `chart-target` is the selection, not the target.** `renderReadout()` sets `selectedId = view.selectedId ?? view.currentId` (`src/ui/chart.ts:140`) and writes that name into `[data-field="chart-target"]` (`:146-147`). After Enter commits Diso and the player clicks another system, the footer shows the new selection while the committed target survives only as an amber dot and dashed line. The field name promises a target readout the UI never delivers.
- **[WARNING] The countdown does not advertise that H aborts it.** The HUD line is exactly `Hyperspace to <name> in <seconds> seconds` (`src/app/game-session.ts:1952` and `:2177`). D-06 gives the player a zero-cost abort on a second H, but nothing on screen says so; the only place H is explained is the pause Controls list, which does not mention the second press. Add a short "H again to abort" suffix (it fits inside the 54-character message limit).
- **[WARNING] A corrupt, future or unavailable save is reduced to "read-only".** Both the station footer and the F2 screen collapse every non-writable state to `Saving is disabled — this save is read-only` (`src/app/game-session.ts:813-815`, `:1524-1527`). The specific reasons already exist in `statusSkipReason()` (`:946-955`) but are only published to the probe. A player with a corrupt or newer-version blob is not told why saving is off or what will happen on the next launch. Surface `corrupt` / `future` / `unavailable` in the visible copy.
- **[WARNING] Stale foundation-build copy is still visible in flight.** The document title is `Wegolite — foundation build` (`index.html:6`) and the always-on `#overlay` renders `Wegolite — foundation build` at top-left (`index.html:623-625`); `src/main.ts:372-375` replaces it with `Wegolite — new game: Lave`. The previous review flagged this and it remains in the flight surface.
- **[MINOR] The F2 screen advertises a key that cannot close it.** The Save/Load header shows `F2` (`index.html:757`), but `saveLoad` is scoped to `dockHome`/`dockScreen` only (`src/input/actions.ts:307`), so the `case "saveLoad"` close branch (`src/app/game-session.ts:1553-1556`) can never run while the screen is open. The chart's F6 toggles; F2 does not. Add `saveScreen` to the `saveLoad` context or remove the badge.
- **[MINOR] Duplicated Save/Load title and "[Y/N]".** The header says "Save / Load" and the section repeats it as an `h2` (`index.html:756-760`); the confirm detail and the footer both end in `[Y/N]` (`index.html:786-789`, `src/ui/save-load.ts:234`).
- **[MINOR] Key hints do not track rebinding.** `KEY_HINT` (`src/ui/chart.ts:28-29`) and `KEY_HINTS` (`src/ui/save-load.ts:76-77`) are hard-coded strings, unlike the flight hints that use `labelFor()` (`src/app/hints.ts`). After a rebind, the on-screen hints lie. This follows the older station-shell pattern but is now repeated in two new screens.
- **Positive:** the new copy that exists is specific and player-readable: `Hyperspace to Diso in 15 seconds`, `Hyperspace countdown cancelled`, `No target selected` / `Destination is too far` / `Insufficient fuel` (`src/app/game-session.ts:1658-1666`), `Arrived at Diso`, `Autosave · Lave · 00:00:00`, `Saved at …`, and the distinct load-failure strings (`:1119-1131`). No enum leaks into the UI.

### Pillar 2: Visuals (2/4)

- **[BLOCKER] The chart footer occludes the plot.** See Priority Fix 2. Measured from the CSS: ~108 px footer + 32 px bottom offset covers 128 px of a 640 px long-range plot at 1280×720 (20%, 59 systems), 78 px at 1440×900 (11%), and 108 px at 1920×1080 (11%). The footer is opaque (`background: #000`, `index.html:316`) and above the canvas in paint order, so both sight and pointer hits are lost.
- **[WARNING] The new HUD target line collides with the debug overlay at common 16:9 sizes.** `HUD_LAYOUT.clock` is `{ x: 60, y: 40, width: 360, height: 40 }` (`src/render/hud/draw.ts:97`); the clock baseline is `+20` and the target line baseline is `+38` (`:410-426`). `#overlay` sits at `top: 1rem; left: 1rem` with two 13 px lines (`index.html:31-38`, `:623-626`). At 1280×720 (the project's Playwright viewport, `playwright.config.ts:17`) the HUD scale is 0.667 with no letterbox: the overlay's second line lands at y≈47 and the target line at y≈52, so the debug text sits on top of the clock/target. The same near-collision occurs at 1366×768 and 1600×900. Hide/remove the debug overlay in production and move the clock cluster away from the top-left corner.
- **[WARNING] Selection and target markers are nearly indistinguishable.** Target is `#ffb000`, selection is `#ffd966` (`src/ui/chart-draw.ts:30-31`), and both are 4.5 px discs (`:49-52`). With 256 labels in long range, the only difference between "the system I am pointing at" and "the system I committed" is a small hue shift; labels are all the same green or the same dim green (`:139-143`). Add a shape/ring/halo cue or an explicit label colour for current/target/selected.
- **[MINOR] Commit feedback is only a colour and a dashed line.** `chartConfirm` commits and repaints (`src/app/game-session.ts:1629-1635`); there is no text acknowledgement ("Target set: Diso"). The dashed amber current-to-target line and the marker colour change are the only cues. The footer `chart-target` does not explicitly say "target" (see Copywriting).
- **[MINOR] The chart canvas uses the default arrow cursor.** There is no `cursor: crosshair` or pointer affordance on `#chart-canvas` (`index.html:350-355`), so the chart does not look clickable.
- **Positive:** the header/footer shell, the white current marker (5 px), the amber target and the green reachable markers form a clear hierarchy; the dashed amber current-to-target line is visually distinct from graph edges; unreachable systems remain drawn rather than removed.

### Pillar 3: Color (2/4)

- **[WARNING] Dimmed labels and unreachable markers fail contrast.** `CHART_UNREACHABLE_COLOR` and `CHART_DIMMED_LABEL_COLOR` are both `#2a5a35` (`src/ui/chart-draw.ts:32,34`), which is **2.61:1** against `#000`; the fuel circle `#245f30` is **2.75:1** (`:26`). The labels are 12 px (`:23-24`), so the dimmed state is below the 4.5:1 body-text threshold and close to the 3:1 non-text floor. D-04 requires unreachable systems to be marked "without hiding their names"; at this contrast the names are effectively hidden on a typical desktop monitor. Raise the dimmed label to a ≥4.5:1 token (and keep the marker dimmer, or use a hollow ring).
- **[WARNING] Success and failure notices share the same amber.** `Saved at …` and `Save failed — progress not saved` both render in `#ffd966` (`index.html:428-432`, `:443-445`; copy at `src/app/game-session.ts:1014,1021`). The palette already has a semantic red (`HUD_RED = #ff4444`, `src/render/hud/draw.ts:31`) and a green base; a failure/success distinction would be free.
- **[MINOR] Sixteen hard-coded colours and duplicated literals.** `chart-draw.ts:25-34` adds ten JS constants; `index.html` repeats `#33ff66`, `#1a5a2c`, `#ffd966` and `#2a5a35` in CSS, with the older off-palette `#cfc`, `#9f9`, `#9a9`, `#8a8` still present. There is no shared token layer, so a palette change must be made in two languages and two files. This is pre-existing architecture, but Phase 6 extends it rather than containing it.
- **Positive:** the 60/30/10 read is right — black dominates, one green accent carries the vector UI, amber is reserved for target/attention and white for "you are here". The new chart palette does not overuse the accent.

### Pillar 4: Typography (3/4)

- **[WARNING] The chart's 12 px labels are below the rest of the UI.** `CHART_FONT` is `12px ui-monospace…` (`src/ui/chart-draw.ts:23-24`), while the station shell uses 18 px base, 24 px headings and 15 px footer copy. In long range the 12 px labels plus the 2.61:1 dim colour are the hardest text in the product. Consider 13–14 px for labels, or at least a higher-contrast dim token.
- **[MINOR] The Save/Load screen repeats its own title.** Header "Save / Load" (`index.html:756`) + `h2` "Save / Load" (`:760`); one of the two is enough.
- **[MINOR] Controls labels are implementation language.** `ACTION_LABELS` exposes "Chart commit", "Save/load confirm", "Save/load up/down" (`src/input/actions.ts:226-239`). These appear in the pause Controls panel, which is the discovery path for F6/H/F2. Use "Set hyperspace target", "Confirm overwrite", etc.
- **Positive:** Phase 6 adds no new font sizes or weights. The chart reuses the monospace stack; the save/load screen reuses the 18/24/15 px shell scale; the HUD uses the existing 28/20 px pair. There is no phase-specific typography drift.

### Pillar 5: Spacing (2/4)

- **[BLOCKER] The fixed chart footer is outside the flex flow.** `.station-footer` is `position: fixed` (`index.html:309-319`); `#chart-canvas` takes `flex: 1` (`:350-355`) and `#chart .station-footer` only changes `bottom` (`:357-359`). The canvas therefore measures the whole remaining height and the footer paints over it. This is the same defect as Priority Fix 2, recorded here as the spacing root cause. The station shell avoids it with `padding-bottom: 14rem` on `#station-screen` (`:145-149`); the chart has no equivalent reserve.
- **[WARNING] The HUD's second line sits on the floor of a 40 px clock rectangle.** `clock` is `height: 40` (`src/render/hud/draw.ts:97`); the target baseline is `y + 38` (`:426`), so a 20 px font's descenders extend to about `y + 43`, past the published rectangle. It currently overlaps the debug overlay at 720p (Visuals finding) and leaves no vertical breathing room. Either grow the clock rect (the plan allows a second line, not a fixed 40 px height) or move the target line outside it.
- **[MINOR] The document disclaimer is hidden behind both new overlays.** `body > footer` is fixed at `bottom: 0` with no z-index (`index.html:607-616`); `#chart`/`#save-load` are opaque `inset: 0` overlays with `z-index: 10` (`:339-347`, `:380-389`). The 2 rem footer offset leaves a gap that shows nothing, because the overlay background paints over the disclaimer. Either keep the disclaimer visible (lower the overlay to `inset: 0 0 2rem`) or use the gap.
- **MINOR:** The chart footer uses four stacked 1.5 em lines; the save/load footer uses two. The inconsistent footer height is what turns a small overlap into a large one.
- **Positive:** the save/load screen's `1rem / 1.5rem / 2rem` rhythm and `0.5rem` row gap are consistent with the station shell; the confirmation panel's `1.5rem 2rem` padding and `1rem` action gap match the title dialog.

### Pillar 6: Experience Design (2/4)

- **[BLOCKER] The overwrite dialog is not a safe modal.** See Priority Fix 1. The global action layer keeps `saveScreenSave`, `saveScreenLoad`, `saveScreenUp/Down` live while `isConfirming()` (`src/app/game-session.ts:1566-1579`); only `Tab` is trapped (`src/ui/save-load.ts:173-193`). Pressing `L` behind the confirmation loads the save and tears down the dialog; pressing `S` re-enters `manualSave`. The safe-focus comment at `src/ui/save-load.ts:278` is contradicted by the Enter binding at `src/input/actions.ts:191`. This is a destructive-action protection failure, not a polish issue.
- **[WARNING] The chart and Save/Load overlays are not announced as dialogs.** `#chart` is a plain `div` with no `role`, `aria-modal` or focus target (`index.html:741-745`); its canvas has no accessible name (`:746`). `#save-load-screen` does receive focus (`src/ui/save-load.ts:246`), but the rows are `div`s with no `role="button"`, `tabindex` or `aria-selected` (`index.html:762-766`). The chart readout (`[data-field="chart-*"]`) is not a live region; changing it with arrow keys announces nothing. Add `role="dialog"`/`aria-labelledby`, a focus target, `aria-live="polite"` on the readout, and real buttons/roles for the Save/Load rows.
- **[WARNING] All in-flight Phase 6 feedback lives on an `aria-hidden` canvas.** The HUD canvas is `aria-hidden="true"` (`index.html:622`), yet countdown, cancellation, refusal and arrival are only painted there (`src/app/game-session.ts:1949-1963`, `:2174-2178`). A screen-reader player cannot learn that a 15-second countdown is running or that a jump was refused. Mirror the message line into a visually hidden DOM live region (the station shell already uses `role="status"` for its confirmation).
- **[WARNING] The chart can select a system that is outside the visible window.** `moveChartSelection()` searches the whole galaxy via `nearestInDirection` (`src/app/game-session.ts:1601-1610`), but short range paints and hit-tests only `marker.visible` (`src/ui/chart-draw.ts:123-125`, `src/ui/chart-model.ts:329-343`). Repeated arrow presses can move the selection off-window: the footer readout changes but no marker is highlighted, so the player cannot see where the selection went. Restrict arrow navigation to visible markers in short range, or pan/indicate the off-window selection.
- **[WARNING] In-session Load has no busy state.** `loadFromSave()` awaits the IndexedDB read and parse (`src/app/game-session.ts:1148-1180`) without a "Loading…" notice or disabled row. The UI freezes only for the read; on a slow store the player sees an unchanged screen and may press Load again (the `loadingSave` guard ignores it). Set a notice/`aria-busy` and disable the row during the read.
- **[MINOR] The Save/Load rows have no hover/focus affordance.** They are `div`s with `cursor: pointer` (`index.html:762-766`) but only `data-selected` styling (`:423-426`); the mouse can click but gets no hover feedback, and the keyboard highlight is invisible to AT.
- **[MINOR] The F2 header affordance is inert.** Covered under Copywriting; in experience terms, the player learns "F2" from the header and then cannot dismiss the screen with it.
- **Positive:** the destructive Save is confirmed; a failed Load shows specific copy and leaves the session/scene/bytes untouched; absent/corrupt/future/unreadable states each have copy; F2 is correctly docked-only and inert in flight/paused; the overwrite dialog focuses Cancel and traps Tab; Save and Load reuse one pipeline; the chart freezes the sim without the pause overlay and paints only on change.

---

## Evidence Notes

- **No screenshot or interaction evidence.** The project's own browser gate is probe-based, not visual: `tests/e2e/hyperspace.spec.ts` and `save-load.spec.ts` assert probe values, `data-paints` and DOM text, and `playwright.config.ts` sets `screenshot: "off"`. No Phase 6 browser assertion covers the chart footer geometry, the document-footer visibility, or the HUD/overlay collision, which is why these defects survive a 73/73 green run.
- The chart-footer geometry was computed from the actual CSS at the project's Playwright viewport: 55.6 px header + 664.4 px canvas, 108.2 px four-line footer, `bottom: 2rem`; long-range `k = 5` at 1280×720 → 640 px plot, 128 px covered (20%, 51.2 chart-y units). Galaxy 0 has 59 records with `chartY < 51` and 32 with `chartY < 27`.
- Contrast values were computed from the literal hex colours with the WCAG relative-luminance formula: `#2a5a35` on `#000` = 2.61:1, `#245f30` = 2.75:1, `#1a5a2c` = 2.54:1, `#ffd966` = 15.37:1, `#33ff66` = 15.64:1.

---

## Files Audited

- `index.html` — `#chart`/`#save-load` markup and CSS, `.station-header`/`.station-footer`, `#overlay`, document `<footer>`
- `src/ui/chart.ts` — overlay shell, readout, key hint, paint lifecycle
- `src/ui/chart-draw.ts` — palette, marker shapes, paint order, repaint policy
- `src/ui/chart-model.ts` — projection, markers, edges, labels, hit-test, readout
- `src/ui/save-load.ts` — screen chrome, rows, overwrite dialog, focus trap, key hints
- `src/app/game-session.ts` — chart open/close/selection/commit, hyperspace copy, save/load notices, slot line, F2/F6 gating, HUD message override
- `src/app/hud-model.ts` — `hyperspaceTarget`
- `src/render/hud/draw.ts` — clock rect and the new `Hyperspace:` line
- `src/render/hud/hud.ts` — uniform HUD scaling/letterboxing
- `src/ui/station-model.ts` — F5 "Hyperspace System" row
- `src/input/actions.ts`, `src/input/keyboard.ts`, `src/input/bindings.ts` — chart/save-screen contexts, defaults, Escape/F2 handling
- `src/ui/controls.ts`, `src/app/hints.ts` — discovery path and live-binding hint convention
- `playwright.config.ts` — 1280×720 reference viewport
- Phase artifacts: `06-CONTEXT.md`, `06-01`…`06-06` `PLAN.md`/`SUMMARY.md`
- Prior reviews: `.planning/phases/04-manual-docking/04-UI-REVIEW.md`, `.planning/phases/03-flight-in-the-lave-system/03-UI-REVIEW.md`
