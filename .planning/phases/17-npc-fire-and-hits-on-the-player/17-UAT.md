---
status: complete
phase: 17-npc-fire-and-hits-on-the-player
source: [17-VERIFICATION.md]
started: 2026-11-19T03:37:13Z
updated: 2026-11-19T11:33:39.048Z
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
  status: resolved
  resolved_by: 17-12-PLAN.md
  resolved_at: 2026-11-19
  reason: "User reported: вариант 2 — owner chose to switch npcRechargeTicks from round(rate x 120) (60/12/300/12) to the literal counts (60/13/301/13), revising D-07"
  severity: major
  test: 1
  root_cause: "Owner decision, not a defect: D-07 used round(weapon_recharge_rate x 120); Oolite compares the accumulated double shot_time against the float weapon_recharge_rate (ShipEntity.m:9946, ShipEntity.h:345), so beam/military fire on frame 13 and mining on 301 (17-01 derivation)"
  artifacts:
    - path: "src/sim/npc/fire.ts"
      issue: "npcRechargeTicks returns round(rate x 120) = 60/12/300/12"
    - path: "tests/app/session/tick-parity.test.ts"
      issue: "Node twin literals (kill offset, bank at kill, debris, hash) pinned for the 12-tick period"
    - path: "tests/e2e/combat.spec.ts"
      issue: "browser literals pinned for the 12-tick period"
    - path: ".planning/PROJECT.md"
      issue: "the 'NPC fire gate' Key Decisions row records D-07's 12-tick rule as a divergence"
  missing:
    - "npcRechargeTicks returns Oolite's literal frame counts (60/13/301/13), using the 17-01 oracle derivation (literalShotFrames) as the authority"
    - "Re-measure and re-pin the Node twin and the browser spec; amend tests that assert 12-tick spacing (fire-cadence, npc-vs-npc, hot-weapon, test-pilot, fire tests)"
    - "Update the PROJECT.md gate row and CONTEXT D-07 note: D-07 revised by the owner 2026-11-19 (UAT test 1)"
    - "Remote QUAL-11 acceptance and remote combat spec after the change"
  debug_session: ""

- gap_id: G-17-4
  truth: "The opt-in browser spec proves the whole route from a hook-spawned shooter to the shield and energy readout drawn on the HUD (criterion 3): the drawn FWD/AFT shield bars and E1-E4 energy banks are exposed in the HUD probe and asserted to fall"
  status: resolved
  resolved_by: 17-13-PLAN.md
  resolved_at: 2026-11-19
  reason: "User reported: option 2 — expose the drawn gauge values (model.bars.shieldFwd/shieldAft, energy banks) in the HUD probe and assert them in tests/e2e/combat.spec.ts"
  severity: major
  test: 4
  root_cause: "The HUD draws FWD/AFT shield bars and E1-E4 energy banks (src/render/hud/draw.ts:843-980, fed by src/app/hud-model.ts:266-268) but the HUD probe exposes no gauge values, so tests/e2e/combat.spec.ts can only assert the sim combat state and hud.drawn"
  artifacts:
    - path: "src/app/hud-model.ts"
      issue: "gauge values (bars.shieldFwd/shieldAft, energy banks) computed but not published to the probe"
    - path: "src/app/probe.ts"
      issue: "HUD probe has no shield/energy gauge fields"
    - path: "tests/fixtures/probe-shape.json"
      issue: "probe shape must list the new HUD gauge fields"
    - path: "tests/e2e/combat.spec.ts"
      issue: "asserts combat.fwdShield/energy and hud.drawn, not the drawn gauges"
  missing:
    - "Publish the drawn gauge values (forward/aft shield fraction, energy banks) in the HUD probe from the same model the renderer draws"
    - "Update the probe-shape fixture and probe-shape-compare test"
    - "combat.spec.ts asserts the HUD gauge values fall after the hook shooter's hits, consistent with the twin's shield/energy literals"
    - "Remote verify (browser-facing change) and remote combat spec"
  debug_session: ""
