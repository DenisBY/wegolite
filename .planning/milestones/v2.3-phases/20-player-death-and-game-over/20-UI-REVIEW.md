# Phase 20 — UI Review

**Audited:** 2026-11-23
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md). Fidelity rule applied: Oolite text and behaviour are the default; divergences are judged only as recorded in FIDELITY.md (rows E-174 to E-179).
**Screenshots:** not captured by this agent (code-only audit plus the orchestrator's live Playwright check, 1280x800, GPU Chromium on the remote test machine).
**Interaction captures:** off (workflow.ui_interaction_capture is false)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Three Oolite strings are byte-faithful; the added cause line is a recorded divergence (E-175) |
| 2. Visuals | 2/4 | Four centred lines sit directly over bright station texture with no backing; cause line partly lost |
| 3. Color | 2/4 | Green #33ff66 on a bright scene has low contrast; the 5 s saturate(0) fade turns the text grey over a grey scene |
| 4. Typography | 3/4 | One monospace family, two sizes (24px title, 16px body), consistent with the HUD |
| 5. Spacing | 3/4 | Flex-centred block with explicit gaps after cause and score; clean, but the page footer stays visible under the overlay |
| 6. Experience Design | 3/4 | Death, fade, Space reload and the no-timer wait all work; no live region, no reduced-motion handling, no visible cue after the fade |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **Legibility of the four lines over the lit station** — the cause line ("Destroyed by GalCop Viper") is partly lost against bright station texture, which is the one line that tells the player why they died — **Fix:** add a backing to `#game-over` in `index.html` (a dark translucent panel behind the text block, or `text-shadow: 0 0 4px #000, 0 0 2px #000`). Keep the fade itself: FIDELITY E-174 records that the four lines fade with the scene, so the fix is contrast, not removing the saturate filter. Also consider nudging the dead aft camera (`render-driver.ts` D-01 offset) so the station is not directly behind the text block.

2. **Text greys out to unreadable by the end of the view** — after the 5 s fade both `#view` and `#game-over` are `saturate(0)`, so "Press Space" (the only input cue) is grey on a grey scene — **Fix:** give the overlay text a light-on-dark backing as in fix 1 so the prompt keeps its contrast at full saturation loss; this also covers the greyscale case. Record the backing in FIDELITY.md as a Wegolite legibility choice if it is not a pure copy of Oolite.

3. **No accessible announcement of the death** — `#game-over` is `role="dialog" aria-modal="true"` and takes focus, but no lines are in a live region and `prefers-reduced-motion` is not checked anywhere in `index.html`, so a screen reader user gets no death announcement and a 5 s full-screen fade is forced — **Fix:** add `aria-live="assertive"` (or `role="alert"`) to the root or the title line so the four lines are announced once on `show()`; consider shortening the fade only under `prefers-reduced-motion`, and record that as a divergence row in FIDELITY.md.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- `src/ui/game-over.ts:19-29`: "Game Over", "Score: %@, [credits_number] ₢", "Press Space" match Oolite's `descriptions.plist:1991-1993` (verified against FIDELITY E-175). Copy is faithful.
- Cause line (`game-over.ts:70-75`): "Destroyed by %@", "Collided with %@", "Destroyed", "Destroyed in a collision". Recorded divergence (E-175, owner choice). Wording is clear and name-free fallbacks are present.
- Deduction: the only input cue is "Press Space"; the click-anywhere exit (`game-over.ts:205`, E-177) is not advertised on screen. Acceptable under fidelity, but a player on a trackpad may not know a click works.

### Pillar 2: Visuals (2/4)
- Live evidence: the four centred lines sit directly over bright station texture from the dead aft camera; "Destroyed by GalCop Viper" is partly lost. The overlay has `background: transparent` (`index.html` ~line 1304) and no text-shadow or panel, so the text has no separation from the scene.
- Hierarchy is good: 24px title with letter-spacing, 16px body, gaps after the cause and score (`index.html` ~lines 1317-1325). This is the strongest part of the screen.
- Focal point: the block is centred, which works, but the scene behind it competes with it.

### Pillar 3: Color (2/4)
- The text colour is the HUD green `#33ff66` (`index.html` ~line 1303), a single accent, consistent with the rest of the game UI.
- Contrast is the failure: green on a bright lit station has poor contrast; the fade (`render-driver.ts:512-520`, `saturate(1 - t/5)`) then removes the hue, so the text turns grey on a grey scene and contrast drops further over the 5 s.
- The fade is faithful (E-174 records that the lines fade with the scene), so the defect is missing backing, not the fade.

### Pillar 4: Typography (3/4)
- One family (`font: 16px/1.6 monospace`), two sizes (24px title, 16px body), no weight changes. Consistent with the HUD monospace and with the other overlays.
- Minor: the title is distinguished only by size; that is adequate for four lines.

### Pillar 5: Spacing (3/4)
- Flex column, centred, `gap: 0`, explicit `margin-bottom: 1.6em` after the cause and score lines, which stand for Oolite's blank message rows (commented at `index.html` ~lines 1291-1294). Intentional and documented.
- Live evidence: the page footer (version, NOTICE/LICENSE links, non-affiliation notice) stays visible below the overlay. Not a layout break, but it competes with the death screen. Consider hiding it while `#game-over` is shown, or confirm this is intended.
- No arbitrary pixel spacing beyond the font-size-relative values.

### Pillar 6: Experience Design (3/4)
- Covered: dead state (`#hud[data-dead]` hides the HUD panels and the #title/#status lines, `index.html` ~lines 62-66), the fade, dead camera, frozen world with explosions and debris, no timer (E-176), Space reload (E-178).
- Live evidence: Space reloads to the title with Continue and New game. P, F2, Escape and H do nothing during the view. This is recorded as intended (D-07) but worth a human decision.
- Gaps:
  - No live region (see Top 3 fix 3).
  - `role="dialog" aria-modal="true"` with focus on the root but no focus management beyond that; the only key is Space.
  - No `prefers-reduced-motion` check.
  - Click anywhere on the overlay ends the view (`game-over.ts:205`); an accidental click during the fade reloads the page with no confirmation. The save stays intact (E-178), so the cost is a reload, not data loss.
- Registry: not applicable (no shadcn components.json).

---

## needs_human_review

- **Explosion look:** the player's fireball and debris were not captured live (bursts last ~1.5 s). Judge whether the burst reads as a death.
- **Fade feel:** whether a 5 s linear saturate fade over the frozen scene feels right; this is a feel judgement.
- **Dead camera framing:** whether the aft view should move so the station is not behind the text; a composition call.
- **Click-to-exit:** whether a click anywhere ending the view is acceptable or should wait until the prompt has shown.
- **Cause-line wording:** whether "Destroyed by GalCop Viper" reads well in the game's tone.

---

## Files Audited

- `src/ui/game-over.ts`
- `index.html` (`#game-over` markup ~line 2136; `#game-over` CSS ~lines 1291-1326; `#hud[data-dead]` rules ~lines 56-66)
- `src/app/session/render-driver.ts` (dead camera, fade filter at ~lines 345-520, HUD hide at ~586-588)
- `FIDELITY.md` (repo root) rows E-174 to E-179
- Phase 20 SUMMARY, PLAN and CONTEXT files (read for intent; 20-05, 20-07, 20-08 are the UI-relevant plans)
