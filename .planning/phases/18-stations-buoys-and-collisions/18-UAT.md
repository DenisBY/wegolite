---
status: testing
phase: 18-stations-buoys-and-collisions
source: [18-VERIFICATION.md]
started: 2026-11-20T00:00:00Z
updated: 2026-11-20T00:00:00Z
---

## Current Test

number: 2
name: Buoy subentity detach and buoy destruction in the 3D view
expected: |
  On detachment the core mesh disappears while the hull and flashers stay; on destruction the whole buoy disappears from the 3D view
awaiting: user response

## Tests

### 1. Witchpoint beacon refusal line drawn in full
expected: Complete a witchspace jump within about 264 m of the witchpoint beacon (traffic on) and read the refusal line on the HUD. 'Witchspace jump aborted: too close to Witchpoint Beacon' is drawn in full inside the message rows (no clipping); the 60-character budget the owner set holds visually.
result: pass — owner screenshot 2026-11-20: the line is drawn in full with room to spare on the right, no overlap with the gauges.

### 2. Buoy subentity detach and buoy destruction in the 3D view
expected: In a traffic-on session, shoot the nav buoy's frangible subentity until it detaches, then destroy the buoy. On detachment the core mesh disappears while the hull and flashers stay; on destruction the whole buoy disappears from the 3D view (the scanner half is automated by statics.spec.ts).
result: [pending]

### 3. Owner reading of the Phase 18 divergences and open questions
expected: Each recorded divergence (E-131 1 m/s push, E-133 station not pushed, E-135 subentity contact once and station not a collider, E-138 drift edges, E-147 launching player not pushed, E-150 burnt-out wreck, E-151 drift pass, E-152 negative scrape, E-153 octree composition, D-08 pods/plates never block, E-126 compass cycle) is accepted or turned into a todo; the CONTEXT PD-02 figures, the collisions-on seeds question and the traffic-off raw ident key are decided (18-12-SUMMARY.md, Owner questions 1-5 and 7).
result: [pending]

## Summary

total: 3
passed: 1
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
