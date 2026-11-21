---
status: complete
phase: 12-inert-ships-and-the-world-lifecycle
source: [12-VERIFICATION.md]
started: 2026-11-14T20:06:38Z
updated: 2026-11-14T20:38:44.342Z
---

## Current Test

[testing complete]

## Tests

### 1. Launch `docker compose up preview` (production bundle, traffic on) in a browser. During the launch the ships already show on the scanner, and the DevTools Network panel shows no `models/<npc>.glb` request until the cockpit view appears; after it, the ships are drawn. Press J near a ship and read the message. Open F6 in flight.
expected: Ships on the scanner from launch; no NPC GLB request before the cockpit view; ships drawn after it; J near a ship prints "Hyperspeed mass-locked."; F6 in flight keeps the ship moving (and a running countdown running) behind the chart.
result: pass
reported: "Owner, Firefox, preview with a test save 5 km from the first ship (the plan's launch pose is 40+ km from any ship, outside the 25.6 km scanner range, so the launch-time scanner wording in the original item was corrected): 'I see one ship, yellow on the radar. «Hyperspeed mass-locked.» works. time keeps running and I keep flying'; 'yes, the model looks fine' (screenshot of the NPC model); Network panel (filter .glb, cache disabled): cobra3, coriolis and buoy at the start, then the NPC models cobramk1, adder, moray, gecko, sidewinder, viper and shuttle later, after about 5 s, all 200."

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
