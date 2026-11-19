---
status: testing
phase: 17-npc-fire-and-hits-on-the-player
source: [17-VERIFICATION.md]
started: 2026-11-19T03:37:13Z
updated: 2026-11-19T03:37:13Z
---

## Current Test

number: 1
name: Owner decides the D-07 shot period against criterion 1's "the rate of fire is Oolite's"
expected: |
  Either accept D-07 (NPC beam and military fire every 12 ticks, about 8 % faster than literal Oolite's 13 frames at 120 Hz and than the player's 13), or switch npcRechargeTicks in src/sim/npc/fire.ts to the literal counts (60, 13, 301, 13) with one twin and browser re-pin
awaiting: user response

## Tests

### 1. Owner decides the D-07 shot period against criterion 1's "the rate of fire is Oolite's"
expected: Either accept D-07 (NPC beam and military fire every 12 ticks, about 8 % faster than literal Oolite's 13 frames at 120 Hz and than the player's 13), or switch npcRechargeTicks in src/sim/npc/fire.ts to the literal counts (60, 13, 301, 13) with one twin and browser re-pin
result: [pending]

### 2. Owner reconciles criterion 2's "in a hook-spawned fight ... an NPC shot to zero energy by another is destroyed" with D-03
expected: Either the roadmap wording is tightened to match D-03 (NPC-vs-NPC kill proved in Vitest: tests/sim/combat/npc-vs-npc.scenario.test.ts), or a hook NPC-vs-NPC variant is requested
result: [pending]

### 3. Owner rules on criterion 3's "no new firing decision source ships in the production bundle"
expected: Either accept the reading "not reachable in ordinary play" (the ?test=1 seam ships behind a runtime flag, taints the session, never persists), or require the seam to be stripped from the production bundle at build time
result: [pending]

### 4. Owner accepts or rejects the probe readout as criterion 3's "shield and energy readout on the HUD"
expected: Either accept combat.spec.ts asserting window.__wegolite.combat.fwdShield/energy plus hud.drawn, or ask for the drawn gauge values (the HUD already draws FWD/AFT bars and E1-E4 banks) to be exposed in the HUD probe and asserted
result: [pending]

### 5. Re-run the opt-in browser combat spec once at the phase HEAD on the remote machine
expected: docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts" passes at HEAD
result: pass
source: orchestrator remote run, snapshot fb47448, exit=0, elapsed=16s, 1 passed

## Summary

total: 5
passed: 1
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
