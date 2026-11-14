---
status: testing
phase: 12-inert-ships-and-the-world-lifecycle
source: [12-VERIFICATION.md]
started: 2026-11-14T20:06:38Z
updated: 2026-11-14T20:06:38Z
---

## Current Test

number: 1
name: Production preview with traffic on: scanner, deferred model requests, drawn ships, mass-lock message, F6 behind the chart
expected: |
  Ships on the scanner from launch; no NPC GLB request before the cockpit view; ships drawn after it;
  J near a ship prints "Hyperspeed mass-locked."; F6 in flight keeps the ship moving (and a running
  countdown running) behind the chart.
awaiting: user response

## Tests

### 1. Launch `docker compose up preview` (production bundle, traffic on) in a browser. During the launch the ships already show on the scanner, and the DevTools Network panel shows no `models/<npc>.glb` request until the cockpit view appears; after it, the ships are drawn. Press J near a ship and read the message. Open F6 in flight.
expected: Ships on the scanner from launch; no NPC GLB request before the cockpit view; ships drawn after it; J near a ship prints "Hyperspeed mass-locked."; F6 in flight keeps the ship moving (and a running countdown running) behind the chart.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
