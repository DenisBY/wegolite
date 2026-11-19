---
phase: 17
review: 17-REVIEW.md
updated: 2026-11-19
---

# Phase 17 — Code Review Disposition

| Finding | Severity | Disposition | Notes |
|---|---|---|---|
| WR-01 | warning | deferred | `targetTargetsSelf` ignores the player's ident lock; now reachable through live heat for opted-in attackers only (no effect in ordinary play). Todo `2026-11-19-player-ident-lock-in-target-targets-self.md`; owner question at sign-off. |
| WR-02 | warning | deferred | Browser spec proves criterion 3's HUD readout through the probe, not drawn gauges (the HUD has no shield/energy element). Already owner question 6 in 17-10-SUMMARY.md. |
| IN-01 | info | fixed | Stale comments in `src/sim/npc/fire.ts`, `src/sim/ai/test-spawn.ts`, `tests/e2e/combat.spec.ts`. |
| IN-02 | info | accepted | `npcFireGate` relies on the caller's `isMountKey` check; the drain is the only caller. |
| IN-03 | info | accepted | NPC energy float64 vs Oolite GLfloat; recorded here, revisit if an energy-boundary divergence appears. |
| IN-04 | info | deferred | D-07 period: owner question 1. |
| IN-05 | info | accepted | Guard blind spots; the guards are documented tripwires, not proofs. |
| IN-06 | info | accepted | Duplicate setup in `spawnAttacker`/`spawnShooter`; test-hook code, left as is. |
