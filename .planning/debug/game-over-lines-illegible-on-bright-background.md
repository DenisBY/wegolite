---
status: diagnosed
trigger: "game-over-lines-illegible-on-bright-background: All four game-over lines stay legible over any background, including a bright sun or a lit station face, through the 5 s fade."
created: 2026-11-23T22:00:00Z
updated: 2026-11-23T22:45:00Z
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
  status: diagnosed
---

## Current Focus

bug_class: Bohrbug (deterministic presentation defect; reproduces on every frame with a bright background)
hypothesis: CONFIRMED. (1) #game-over has no luminance separation (transparent background, no shadow) so light text fails over bright scenes; the fade is secondary. (2) The "clipped" credit sign is the design of U+20A2 in system monospace fonts at 16 px, not a CSS/filter clip.
test: done (CSS read, contrast arithmetic, Oolite source, scratch Firefox/Chromium renders with the owner's Windows fonts)
expecting: n/a
next_action: return ROOT CAUSE FOUND to the caller (goal find_root_cause_only); no fix applied
candidate_causes:
  - "code: #game-over CSS has background transparent and no text-shadow (confirmed)"
  - "code: the saturate() fade applied to the overlay lowers text contrast (partially: secondary, only over mid-grey)"
  - "environment: font fallback for U+20A2 to a proportional font, or a glyph overhang clipped by the filter surface (eliminated)"
  - "data/design: U+20A2 glyph design in system monospace fonts (confirmed for the clipped look)"
and_gate: "no: the two symptoms are independent; legibility needs only the missing backing, and the glyph look needs only the system font's glyph design"

## Symptoms

expected: All four lines (Game Over, cause, Score, Press Space) stay legible, in particular the cause line and the Press Space prompt. 20-UI-REVIEW.md scored 16/24 and suggested a dark translucent backing or text shadow, keeping the fade.
actual: Owner reported "Here it is against the sun" with a screenshot: all four lines in light grey over the white sun disc are barely readable, especially Score and Press Space. Over a black starfield the lines read fine. Over the grey (faded) station hull they read but with low contrast. In all screenshots the credits glyph after "100.0" (U+20A2) looks clipped at its right edge, e.g. "Score: Harmless (0), 100.0 <cr>" shows the last glyph cut.
errors: None reported.
reproduction: UAT Test 2. Die with the sun or a lit station behind the text (dev server http://192.168.178.5:5173/?test=1&traffic=1, Firefox).
started: Discovered during UAT on 2026-11-23.

## Eliminated

- hypothesis: The saturate() fade is what makes the lines illegible over the sun.
  evidence: Contrast arithmetic shows the unfaded green is worse on white (1.34:1) than the faded grey (1.67:1); the scratch render shows the current CSS illegible on the sun at saturate(1) too. The fade only lowers contrast over mid-grey (2.2 -> 1.8).
  timestamp: 2026-11-23T22:40:00Z

- hypothesis: The credit sign falls back to a non-monospace font whose wider glyph is clipped.
  evidence: Consolas, Courier New and DejaVu Sans Mono on the owner's Windows host all contain U+20A2, so no fallback happens; the glyph ink lies within its advance in all three.
  timestamp: 2026-11-23T22:35:00Z

- hypothesis: The CSS filter (or a fixed-width/overflow container) clips the glyph's ink at the line end.
  evidence: No overflow/width/text-overflow rule on #game-over or its p lines; renders with filter none and saturate() are identical in Firefox and Chromium; DPR-4 crops show the designed C-with-r shape with blank space to its right, no straight cut.
  timestamp: 2026-11-23T22:35:00Z

## Evidence

- timestamp: 2026-11-23T22:05:00Z
  checked: index.html #game-over CSS (lines 1291-1325) and markup (2135-2147)
  found: "#game-over { position:absolute; inset:0; z-index:15; display:flex; flex-direction:column; align-items:center; justify-content:center; background: transparent; color:#33ff66; font:16px/1.6 monospace; text-align:center }". No text-shadow, no -webkit-text-stroke, no panel, no backdrop. The p lines are shrink-wrapped flex items (align-items:center), margin 0, overflow visible, no width, no white-space/text-overflow rule.
  implication: The text has no luminance separation from whatever the 3D canvas shows behind it; legibility depends entirely on the scene being dark.

- timestamp: 2026-11-23T22:06:00Z
  checked: src/app/session/render-driver.ts:509-521 and src/ui/game-over.ts:210-212
  found: While dead the driver writes filter = saturate(1 - min(1, gameOverSeconds/5)) to BOTH the canvas (renderer.domElement.style.filter) and the overlay root (gameOverOverlay.setFilter -> root.style.filter). So the text is desaturated with the scene: #33ff66 under saturate(0) becomes ~rgb(200,200,200) (0.213*51 + 0.715*255 + 0.072*102 = 200.5), i.e. the "light grey" the owner sees.
  implication: The filter does apply to the text (by design, FIDELITY E-174). It changes hue, not much luminance.

- timestamp: 2026-11-23T22:08:00Z
  checked: WCAG contrast arithmetic for the text colour before/after fade against typical backgrounds
  found: Text luminance: #33ff66 L=0.732; faded grey rgb(200,200,200) L=0.578. Contrast vs white sun (L=1): green 1.34:1, grey 1.67:1. Vs mid-grey lit hull rgb(150,150,150) (L=0.305): green 2.20:1, grey 1.76:1. Vs black space: green 15.6:1, grey 12.6:1. WCAG minimum for this size is 4.5:1 (3:1 for large text).
  implication: The fade is NOT the primary cause: on the sun the full-colour green is even worse (1.34) than the faded grey (1.67). The cause is a light text colour with no dark separation drawn over a scene that can be as bright as or brighter than the text. The fade only costs contrast over mid-grey backgrounds (2.20 -> 1.76), which matches "station hull reads but with low contrast".

- timestamp: 2026-11-23T22:10:00Z
  checked: Other overlays and HUD text in this project (rg text-shadow|shadowColor|strokeText|paint-order|backdrop in src and index.html)
  found: No text-shadow or text stroke anywhere. Every other DOM overlay that sits over the 3D scene uses an opaque/translucent dark panel: #title-confirm rgba(0,0,0,0.78) + panel rgba(0,0,0,0.92); #pause rgba(0,8,3,0.94); .home-card rgba(0,10,4,0.78) + backdrop-filter blur(2px). #game-over is the only overlay with background: transparent. The HUD canvas message rows (src/render/hud/draw.ts:1081-1104) also draw plain fillText in yellow with no shadow.
  implication: The project's established pattern for text over the scene is a dark translucent backing; #game-over deviates from it.

- timestamp: 2026-11-23T22:12:00Z
  checked: Oolite reference: PlayerEntity.m:3630-3644 showGameOver, HeadUpDisplay.m:436-449 resetGuis (empty dict), GuiDisplayGen.m:1308-1358 drawGLDisplay, Resources/Textures/oolite-font.png
  found: showGameOver resets message_gui to defaults: text colour yellowColor, 480x160. drawGLDisplay draws the backdrop only "if (playerStatus != STATUS_START_GAME && playerStatus != STATUS_DEAD)", so Oolite draws NO backing behind the game-over lines. The bitmap font is plain white glyphs with no outline. Oolite therefore has the same weakness over a bright sun. Also: Oolite's game-over text colour is yellow, Wegolite uses #33ff66 (no FIDELITY row found for that colour choice; yellow L=0.93 would be even worse on white).
  implication: Any backing/shadow is a Wegolite legibility divergence that needs a FIDELITY.md row (and reviewer agreement per the fidelity rule). It does not conflict with E-174: a black shadow/panel stays black under saturate(), so the fade can stay.

- timestamp: 2026-11-23T22:30:00Z
  checked: Which fonts the owner's browser can use for U+20A2. The owner's Firefox runs on the Windows host of the remote test machine (C:\Program Files\Mozilla Firefox present). fc-list ':charset=20a2' over /mnt/c/Windows/Fonts.
  found: Consolas (consola.ttf), Courier New (cour.ttf), DejaVu Sans Mono (installed there too), Arial, Segoe UI and others all contain U+20A2. So whichever font Firefox maps the generic `monospace` to (Consolas or Courier New by default), the credit sign comes from that primary font; there is no fallback to a different font.
  implication: Font fallback is not the mechanism for the "clipped" look.

- timestamp: 2026-11-23T22:35:00Z
  checked: Scratch Playwright render on the remote machine (wegolite-cross image, Firefox and Chromium; scratch under /tmp, since deleted) of "Score: Harmless (0), 100.0<NBSP><cr>" with the exact #game-over CSS, the owner's Windows fonts loaded via @font-face, filter none / saturate(1) / saturate(0.5) / saturate(0), DPR 1 and DPR 4, clip extending 30 CSS px past the line end. Canvas measureText of U+20A2 at 160px.
  found: Ink of U+20A2 lies inside its advance in every font: Consolas ink 7..82 of advance 88; Courier New 9..89 of 96; DejaVu Sans Mono 7..87 of 96 (identical in Firefox and Chromium). At DPR 1 the glyph reads as a "C" with its right side broken off in all three fonts, in both engines, identically with filter none and with saturate(); at DPR 4 the shape is visibly the designed glyph: a C whose opening holds a small "r" (the Cr ligature), with no straight cut edge and blank space to its right.
  implication: The glyph is NOT clipped by CSS, the filter, a container width or a fallback font. The "clipped" look is the cruzeiro sign's own design in system monospace fonts at 16 px: the right half of the C is replaced by a tiny r stub that does not resolve at that size. Oolite instead draws its own bitmap glyph (oolite-font.plist:29 maps U+20A2 to the font slot holding a bold C with a clear r, Resources/Textures/oolite-font.png row 9 col 0). The same system glyph appears on every station screen that shows prices (all `monospace`), so the look is global, not game-over specific.

- timestamp: 2026-11-23T22:40:00Z
  checked: Scratch render (Firefox, DPR 1) of the four lines over a sun-like white disc, a mid-grey hull (#969696) and black space, at saturate(1) and saturate(0), for three variants: current CSS, a dark text-shadow halo, and a dark translucent panel (rgba(0,0,0,.6), padding .6em 1.4em) behind the line block.
  found: Current CSS reproduces the owner's report exactly: over the sun at saturate(0) the lines are nearly invisible light grey on white; over the hull they read with low contrast; over space they read fine. The panel variant is legible on all three backgrounds at both saturations (the black panel stays black under saturate(0), so the fade still greys the text and scene). The text-shadow halo variant is legible but visibly heavier/blotchy over the white sun.
  implication: A dark translucent backing inside #game-over (so it is filtered with the text) fixes legibility on any background while keeping the E-174 fade; it matches the project's existing overlay pattern.

## Resolution

root_cause: |
  (1) Legibility: #game-over (index.html:1296-1311) draws light text (#33ff66, relative luminance 0.73; ~rgb(200,200,200), L 0.58, after the saturate(0) fade) directly over the 3D canvas with `background: transparent` and no text-shadow, outline or panel. Legibility therefore depends on the scene being dark: contrast is 1.34:1 (green) / 1.67:1 (grey) against the sun's white disc and ~2.2:1 / 1.8:1 against a lit grey hull, against 15.6:1 / 12.6:1 over black space. The 5 s fade (render-driver.ts:512-521 writes the same saturate() to the canvas and, via setFilter, to the overlay root) does apply to the text, but it is a secondary factor: it only changes hue, slightly lowering contrast over mid-grey and slightly raising it over white. Oolite has the same weakness (GuiDisplayGen.m:1347-1349 suppresses the message backdrop while STATUS_DEAD), so the fix is a recorded legibility divergence, not a fidelity restoration.
  (2) Clipped credit sign: not a clip. U+20A2 is rendered from the primary system monospace font (Consolas/Courier New on the owner's Windows Firefox; all contain the glyph and its ink fits inside its advance), and that glyph's design, a C with a small r set in its opening, reads at 16 px as a C with its right side cut off. It is filter-, engine- and position-independent and appears on the station price screens too. Oolite avoids it by drawing its own bitmap credit glyph (oolite-font.plist:29).
fix:
verification:
files_changed: []
