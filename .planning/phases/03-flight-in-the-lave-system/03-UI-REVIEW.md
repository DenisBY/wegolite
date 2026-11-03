# Phase 3 — UI Review

**Audited:** 2026-11-03
**Baseline:** No `03-UI-SPEC.md` exists. Audited against the locked decisions D-05..D-11 in `03-CONTEXT.md` plus the abstract 6-pillar standards.
**Screenshots:** not captured — no dev server on localhost:3000/5173/8080, and this project deliberately keeps screenshot/pixel evidence out of the verification chain (`01-CONTEXT.md`). Audit is code-only.
**Interaction captures:** off (`workflow.ui_interaction_capture` is false; no Chrome capture attempted).
**Registry audit:** skipped — no `components.json` (no shadcn).

> This is an advisory, read-only audit. It does not change product code and does not gate phase completion. The manual visual rows that the summaries deferred to `/gsd-verify-work` (HUD readability at 1280×720 / 1920×1080 / ultrawide, torus-dust legibility, planet/corona fidelity) are still outstanding and cannot be settled from source alone.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Thematic, concise copy with live-binding hints, but a stale "foundation build" string is still on screen and one teaching message hard-codes keys that rebinding invalidates. |
| 2. Visuals | 2/4 | The opaque title screen hides the starfield/Cobra menu scene, and the leftover debug overlay collides with the HUD clock in flight. |
| 3. Color | 3/4 | A coherent green-vector palette with correct semantic amber/red, undermined by five ad-hoc off-palette greens and duplicated literals with no shared tokens. |
| 4. Typography | 3/4 | Two well-chosen HUD sizes in one monospace stack, but seven undeclared DOM sizes (including an accidental 12/13 px pair) and no type scale. |
| 5. Spacing | 3/4 | A consistent 0.25 rem-ish rhythm and a fixed, aligned 1920×1080 HUD layout, with a few arbitrary values and no spacing tokens. |
| 6. Experience Design | 2/4 | Strong pause/focus/auto-pause/hints/fallback work, but Start is re-entrant during load, there is no loading feedback, and destructive reset is silent. |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **`GameSession.start()` is re-entrant while loading (BLOCKER)** — a double-click on Start (or a second click while the 15 MB of GLBs/textures load) runs two `start()` calls, each creating a HUD, a pause overlay and a `requestAnimationFrame` loop over the same state. The simulation runs at roughly double rate, listeners are duplicated, and `dispose()` cancels only the last `rafId`, leaking the other loop. Add a `started`/`starting` guard before the first `await`, and disable `#title-start` with `aria-busy="true"` until the first frame is live.
2. **The title screen never shows the menu scene it was built for (WARNING)** — `#title-screen`'s radial gradient is fully opaque (`index.html:57`), and the app only renders once in `resize()` before `start()`; after the background preload installs `createMenuScene`, no frame is drawn until the system scene replaces it. Make the gradient translucent (or drop it), and drive the menu with its own RAF until Start is pressed.
3. **Rebinding and reset give little or no feedback (WARNING)** — capture mode sets `document.body.dataset.capture` but no CSS consumes it, so the active row has no visual state; every one of the twelve buttons is announced as "Rebind"; and "Reset all settings" changes state with no confirmation or status message. Style the capturing row, add `aria-label="Rebind <action>"`, and add a `role="status"` line to the Settings panel.

---

## Detailed Findings

Severity: **BLOCKER** = must fix before shipping; **WARNING** = degrades quality or correctness but does not stop every flow; **MINOR** = polish.

### Pillar 1: Copywriting (3/4)

- **[WARNING] Stale foundation-build copy is user-visible.** `index.html:6` sets the document title to `Wegolite — foundation build`, and `index.html:265-269` keeps a `#overlay` whose `#title` line says `Wegolite — foundation build` and whose `#status` line is written as `Wegolite — new game: Lave` (`src/main.ts:256-259`). Only `#stats` is hidden (`src/main.ts:260-263`), so the two stale lines are drawn over the flight view. This is a Phase 1 preview marker; `tests/contract/container-contract.test.ts:218,229` and `scripts/smoke-preview.sh` still require the literal in `index.html`, so the fix should move the marker to a non-visible place (meta tag or `data-build` attribute) and update those assertions.
- **[WARNING] A teaching message hard-codes keys.** `src/app/game-session.ts:303` enqueues `"Arrows pitch and roll · W and S change speed"` after launch. `src/app/hints.ts:56-68` does this correctly with `labelFor(bindings, …)`, so after any rebind the two systems contradict each other and D-12's "every action is rebindable" contract is broken in the copy. Use `labelFor` here too.
- **[MINOR] Implementation jargon in Settings.** `index.html:317-320` tells the player "Settings are stored locally in this browser (localStorage). No account and no server." `localStorage` is a developer term; "saved in this browser" is enough.
- **[MINOR] Reset copy over-promises precision.** "Reset all settings" (`index.html:327-329`) also clears `hintsSeen` and `launchSeen` (`src/app/game-session.ts:236-249`), replaying the launch cinematic and all hints. Say so, or scope the reset to bindings.
- **[MINOR] Dead copy path.** `src/app/game-session.ts:314-316` handles `compassTargetChanged`, but the event is never emitted (`src/sim/events.ts:21` is the only occurrence). The string `Compass target: <enum>` is therefore unreachable — and would have exposed a raw enum id if it were. Remove the branch or emit the event with display-ready targets.
- **Positive:** the docked panel strings (`100.0 Cr`, `Cobra Mk III`, `7.0 LY`, `Lave`) match D-09 exactly; `hintText` is well written; the WebGL2 fallback and boot-failure copy (`src/app/fallback.ts:31-32`, `src/app/boot-failure.ts:34`) is plain, actionable and free of stack traces.

### Pillar 2: Visuals (2/4)

- **[WARNING] The menu scene is built, then never seen.** `src/render/menu-scene.ts:4-7,49-57` builds a starfield and a Cobra "slowly presented" behind the title, and plan 03-09 explicitly wired `SceneManager.enterMenu()` so "the title screen has a real scene instead of plan 01's empty one". But `#title-screen` paints an opaque `radial-gradient(...#04120a, #000 70%)` over the whole viewport (`index.html:49-60`, background at `:57`), and the only pre-Start render is the single `renderActiveScene()` inside `resize()` (`src/main.ts:170-185`), which runs before the preload promise re-enters the menu (`src/main.ts:82-88`). The Cobra is never drawn at all, and would be invisible if it were. This is a contract gap, not a taste call.
- **[WARNING] The debug overlay collides with the HUD clock.** `#overlay` sits at `top:1rem; left:1rem` at 13 px (`index.html:31-38`); the HUD clock is drawn at design `x=60, y=40..80` (`src/render/hud/draw.ts:97,386-390`). At 1280×720 the design scale is 0.667, putting the clock at roughly x 40-220, y 31-49 — directly under the overlay's second line. The two green text layers overlap at the default Playwright viewport and at 1440×900.
- **[WARNING] Capture mode has no visual state.** `src/ui/controls.ts:122-131` sets `document.body.dataset.capture = action`, but no rule in `index.html` references `[data-capture]` or `body[data-capture]`. The only cue that a row is listening is the `#controls-status` sentence, so the row being rebound is not identifiable at a glance.
- **[MINOR] Pause subpanels are siblings, not layers.** The `.pause-menu` stays fully visible and interactive while `#controls` or `#settings-panel` is open (`index.html:298-332`; `src/app/game-session.ts:226-234`). Two equally weighted bordered panels with two headings read as competing surfaces. Dim or demote the menu while a subpanel is open, or make the subpanel visually modal.
- **[MINOR] No pressed/disabled button states.** Hover and `:focus-visible` invert correctly (`index.html:78-82,140-144,189-193`), but there is no `:active` or `[disabled]` styling, and no button is ever disabled (see the Start race).
- **Positive:** the HUD composition is faithful and readable — centre crosshair, 360×80 scanner with tails, compass, aegis, signed pitch/roll bars, speed/fuel bars, clock, condition light and message line all in the `HUD_LAYOUT` table (`src/render/hud/draw.ts:78-100`), with a clear focal hierarchy.

### Pillar 3: Color (3/4)

- **[MINOR] Off-palette greens.** Beyond the declared `#33ff66` / `#ffb000` / `#ff4444` (`src/render/hud/draw.ts:29-31`), the DOM adds `#cfc` (`index.html:35,222`), `#9f9` (`:216`), `#9a9` (`:256`) and `#8a8` (`:46`). They are close enough to read as accidental rather than intentional secondary tones.
- **[MINOR] Palette literals are duplicated without tokens.** `#33ff66` appears 16 times in `index.html` and once in `src/render/hud/draw.ts`; there are no CSS custom properties. A future palette change must touch both the DOM and the canvas module. Canvas cannot read CSS variables for free, but a single exported palette constant mirrored into `:root` would remove the drift.
- **[MINOR] Compass ahead/behind is hue-only.** `src/render/hud/draw.ts:252-255` fills the same 4 px dot with green or amber depending on `forward`. Green-vs-amber is distinguishable for most colour-vision deficiencies, but the signal is still colour-only (WCAG 1.4.1); a filled/hollow or small notch difference would make it redundant.
- **Positive:** the 60/30/10 read is correct for this aesthetic — black dominates, the single green accent carries the vector HUD, and amber/red appear only as semantic warnings (`draw.ts:335-349`). Contrast is strong throughout (`#33ff66` on black, muted greens ≥ 7:1, `#ffb3b3` on black for the failure surface).

### Pillar 4: Typography (3/4)

- **[MINOR] Seven undeclared DOM sizes.** `12` (footer, `index.html:257`), `13` (debug overlay, `:36`), `16` (pause, `:160`), `18` (docked, `:92`), `20` (title, `:59`), `24` (both panel headings, `:104,175`) and `48` (wordmark, `:64`) — plus the HUD's `28`/`20` design sizes (`src/render/hud/draw.ts:32-35`). The 12/13 px pair is accidental, and none of it is expressed as a scale.
- **[MINOR] No weight or tracking system.** Everything is the default monospace weight; only the wordmark and panel headings get `letter-spacing` (`index.html:65,105,176`). That is coherent, but it means hierarchy rests entirely on size and the 24 px heading step is the only strong one.
- **Positive:** the HUD's two sizes (28 px message/clock, 20 px labels) are consistent across every element, use one explicit stack, and scale with the design space (`hud.ts:100-105`), so the flight UI stays proportional at every window size.

### Pillar 5: Spacing (3/4)

- **[MINOR] Arbitrary values break the rhythm.** The DOM is mostly on a 0.25 rem grid (0.25/0.5/0.6/0.75/1/1.25/1.5/2/4), but `0.35rem` (footer, `index.html:254`), `2.4rem` (title button, `:69`) and `0.6rem` (`:69,132,181`) are one-offs. No spacing custom properties exist.
- **[MINOR] Panel widths are hard-coded per surface.** `22rem` (docked, `:96`), `18rem` (pause menu, `:167`), `44rem`/`92vw` (controls/settings, `:197`) and the `12rem 1fr auto` controls grid (`:205`) are independent decisions; at narrow desktop widths the grid's fixed 12 rem label column is the first thing to crowd.
- **Positive:** the HUD layout is genuinely systematic — bars align at x=220 and x=1500, the clock/condition anchors are symmetric, the message line sits 10 px below the scanner, and every rect stays inside 1920×1080 (asserted in `tests/e2e/hud.spec.ts`). Letterboxing is uniform and centred (`src/render/hud/hud.ts:87-108`), with a DPR cap of 2.

### Pillar 6: Experience Design (2/4)

- **[BLOCKER] `start()` is re-entrant while the first call is awaiting.** `src/app/game-session.ts:581-583` guards only on `state !== undefined`, but `state` is not assigned until line 610, after `await assets.preload()` (585) and `await loadShipCatalogue()` (595). `#title-start` stays enabled (`index.html:270-273`) and `src/main.ts:191-193` calls `void session.start()` on every click, so a double-click during load runs the whole setup twice: two `createHud` calls, two pause overlays (duplicate listeners), two `requestAnimationFrame(frame)` loops over one state (≈2× simulation rate), and a `rafId` overwritten so `dispose()` cancels only one loop (`:697,753`). This is reachable on a cold load, where the preload window is hundreds of milliseconds and the button gives no feedback.
- **[WARNING] No loading state after Start.** Nothing changes on screen between the click and `title.hide()` (`:690`); no spinner, no disabled control, no `aria-busy`. On a slow preview the natural user response is to click again — which triggers the blocker above.
- **[WARNING] Reset-all is silent and unconfirmed.** `#settings-panel` has no status element (`index.html:315-332`), and `src/ui/settings-panel.ts:39-51` wires the button straight to `resetAllSettings()`. The player gets no acknowledgement that bindings, hints and the launch intro were reset. The Controls panel does this correctly (`src/ui/controls.ts:228`).
- **[WARNING] No reduced-motion path for the launch flash.** `src/render/break-pattern.ts:182-186` paints a full-screen white flash at 0.9 alpha for 0–0.2 s, then a 1.4 s tunnel and fade. There is no `prefers-reduced-motion` branch in `index.html` or the renderer. The sequence is skippable only after the first viewing (D-10), which is exactly when a photosensitive player cannot avoid it.
- **[MINOR] A context loss while paused hides the error behind the overlay.** `#pause` has `z-index: 20` (`index.html:148-151`) while `#failure` has none (`:231-242`). `showBootFailure` hides the canvas and HUD but not the pause overlay (`src/main.ts:234-242`, `src/app/boot-failure.ts:31-41`), so the player sees a dead pause menu instead of "The WebGL2 context was lost."
- **[MINOR] All flight information is `aria-hidden`.** `index.html:264` marks the HUD canvas `aria-hidden="true"` and the DOM alternatives do not exist; the message line, clock, fuel and speed are canvas-only. This is inherent to a faithful vector HUD, but the teaching messages (D-11) deserve a live-region mirror.
- **Positive:** the experience architecture is otherwise strong — one pause overlay reachable docked and in flight, focus moved to Resume on open and returned to `#view` on close, a working Tab trap (`src/ui/pause.ts:50-98`), Escape backing out one level, P toggling from any level, auto-pause plus input clearing on blur/visibility/pointer-lock/fullscreen (`src/main.ts:198-230`), settings that never throw on corrupt or quota-blocked storage (`src/settings/store.ts:41-73`), a visible WebGL2/GLB failure surface, and hint dismissal driven by first successful use (`src/app/hints.ts:92-121`).

---

## Manual / Visual Gaps Carried Forward

These are not scored as defects because they cannot be judged from source; they remain for `/gsd-verify-work`:

- HUD readability at 1280×720, 1920×1080 and an ultrawide window (the 03-VALIDATION HUD row, explicitly left outstanding in `03-05-SUMMARY.md:276-283`).
- Torus/dust legibility at speed (`03-04-SUMMARY.md:165-168`).
- Planet/corona "reads as Oolite" fidelity (`03-03-SUMMARY.md:120-121`, `03-01-SUMMARY.md:151-152`).

---

## Files Audited

- `index.html` (all inline CSS and DOM roots)
- `src/main.ts`
- `src/app/game-session.ts`, `hud-model.ts`, `hints.ts`, `scene-manager.ts`, `game-loop.ts`, `boot-failure.ts`, `fallback.ts`
- `src/ui/title.ts`, `docked.ts`, `pause.ts`, `controls.ts`, `settings-panel.ts`
- `src/render/hud/hud.ts`, `draw.ts`, `format.ts`, `messages.ts`, `projection.ts`
- `src/render/menu-scene.ts`, `break-pattern.ts`, `sync.ts`
- `src/settings/schema.ts`, `store.ts`
- `src/input/actions.ts`, `bindings.ts`, `keyboard.ts`
- `tests/e2e/hud.spec.ts`, `settings.spec.ts`, `scene.spec.ts`; `tests/contract/container-contract.test.ts`
- Phase artifacts: `03-CONTEXT.md`, the nine `03-0*-PLAN.md` / `03-0*-SUMMARY.md` pairs, `03-VALIDATION.md`
