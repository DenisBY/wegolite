---
status: complete
phase: 13-views-lasers-and-shields
source: [13-VERIFICATION.md]
started: 2026-11-15T00:00:00Z
updated: 2026-11-15T10:23:49.046Z
---

## Current Test

[testing complete]

## Tests

### 1. Fly in each of the four views (1/2/3/4) in a real WebGL session
expected: Fore, aft, port and starboard read correctly: not mirrored, not clipped by the Cobra hull or the near plane, correct cockpit offset
result: pass
note: |
  Confirmed by the owner in a real browser. Also checked by Claude with screenshots: with the station behind the ship, it appears at the left edge in the port view and the right edge in the starboard view, so the side views are not mirrored; no hull or clipping is visible.

### 2. Fire each laser type (buy at F3) and watch the shot
expected: A 1-px line from the mount to the hit point or full range is visible for about 0.09 s, with a sensible colour per laser (pulse red, beam yellow, mining blue, military magenta)
result: pass
note: |
  Owner flew it in a real browser: all four colours matched; Mining fires once per 2.5 s (Oolite recharge_rate, correct). The owner found that a side-mounted laser drew several lines fanning out to the right edge. Cause: the shot stayed fixed in the world while the ship flew on, whereas Oolite keeps the player's shot on the ship (OOLaserShotEntity.m:152-162). Fixed in commit aa038e1 (player shots ride with the ship). Re-checked by Claude with headless-Chromium screenshots on the remote test machine (software WebGL): a starboard Beam laser draws one line from the bottom centre to the vanishing point, also while the ship flies at speed 0.3. Mining and Military were not re-driven (they need TL 10, Lave is TL 5); the owner confirmed their colours earlier.

### 3. Press R with a ship in the sights (traffic on) in several window shapes
expected: The ident frame sits on the locked ship and the message line reads 'Ident system locked onto <name>.'
result: pass
note: |
  Checked by Claude with screenshots in four window shapes (1280x720, 800x800, 1600x600, 640x900): the corner-bracket frame sits on the locked GalCop Viper in each, and the message line reads "Ident system locked onto GalCop Viper." Software WebGL, not the owner's GPU.

### 4. F3 > a laser: read the facing prompt
expected: The facing prompt appears on its own line (CSS white-space: pre-line)
result: pass
note: |
  Checked by Claude with a screenshot of the F3 facing selection: "Beam Laser" on one line, "Please select where to install this weapon." on the next, with the four facing rows listed.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
