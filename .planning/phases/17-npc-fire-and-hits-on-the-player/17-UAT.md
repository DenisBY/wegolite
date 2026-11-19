---
status: complete
phase: 17-npc-fire-and-hits-on-the-player
source: [17-VERIFICATION.md]
started: 2026-11-19T03:37:13Z
updated: 2026-11-19T08:37:03.300Z
---

## Current Test

[testing complete]

## Tests

### 1. Owner decides the D-07 shot period against criterion 1's "the rate of fire is Oolite's"
expected: Either accept D-07 (NPC beam and military fire every 12 ticks, about 8 % faster than literal Oolite's 13 frames at 120 Hz and than the player's 13), or switch npcRechargeTicks in src/sim/npc/fire.ts to the literal counts (60, 13, 301, 13) with one twin and browser re-pin
result: issue
reported: "вариант 2" (owner chose option 2: switch the NPC shot period to Oolite's literal frame counts 60/13/301/13; D-07 revised)
severity: major

### 2. Owner reconciles criterion 2's "in a hook-spawned fight ... an NPC shot to zero energy by another is destroyed" with D-03
expected: Either the roadmap wording is tightened to match D-03 (NPC-vs-NPC kill proved in Vitest: tests/sim/combat/npc-vs-npc.scenario.test.ts), or a hook NPC-vs-NPC variant is requested
result: pass
note: owner accepts D-03; criterion 2's wording is to be tightened in ROADMAP.md (player shields/energy in the browser spec, NPC-kills-NPC in Vitest)

### 3. Owner rules on criterion 3's "no new firing decision source ships in the production bundle"
expected: Either accept the reading "not reachable in ordinary play" (the ?test=1 seam ships behind a runtime flag, taints the session, never persists), or require the seam to be stripped from the production bundle at build time
result: pass
note: owner accepts the "not reachable in ordinary play" reading; the seam stays behind the ?test=1 runtime flag

### 4. Owner accepts or rejects the probe readout as criterion 3's "shield and energy readout on the HUD"
expected: Either accept combat.spec.ts asserting window.__wegolite.combat.fwdShield/energy plus hud.drawn, or ask for the drawn gauge values (the HUD already draws FWD/AFT bars and E1-E4 banks) to be exposed in the HUD probe and asserted
result: issue
reported: "option 2" (owner chose: expose the drawn shield and energy gauge values in the HUD probe and assert them in the browser combat spec)
severity: major

### 5. Re-run the opt-in browser combat spec once at the phase HEAD on the remote machine
expected: docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts" passes at HEAD
result: pass
source: orchestrator remote run, snapshot fb47448, exit=0, elapsed=16s, 1 passed

## Summary

total: 5
passed: 3
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-17-1
  truth: "NPC shot period equals Oolite's literal frame counts at 120 Hz (pulse 60, beam 13, mining 301, military 13), per criterion 1 'the rate of fire is Oolite's'"
  status: failed
  reason: "User reported: вариант 2 — owner chose to switch npcRechargeTicks from round(rate x 120) (60/12/300/12) to the literal counts (60/13/301/13), revising D-07"
  severity: major
  test: 1
  artifacts: []
  missing: []

- gap_id: G-17-4
  truth: "The opt-in browser spec proves the whole route from a hook-spawned shooter to the shield and energy readout drawn on the HUD (criterion 3): the drawn FWD/AFT shield bars and E1-E4 energy banks are exposed in the HUD probe and asserted to fall"
  status: failed
  reason: "User reported: option 2 — expose the drawn gauge values (model.bars.shieldFwd/shieldAft, energy banks) in the HUD probe and assert them in tests/e2e/combat.spec.ts"
  severity: major
  test: 4
  artifacts: []
  missing: []
