# Phase 17: NPC Fire and Hits on the Player - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-18
**Phase:** 17-npc-fire-and-hits-on-the-player
**Areas discussed:** The hook fight, How fire is switched on, The A7 test pilot, Carry-overs from Phases 15 and 16

The discussion was held in Russian; options are translated here.

---

## The hook fight

| Option | Description | Selected |
|--------|-------------|----------|
| Shooter + attacker | Keep the stationary gated shooter for the deterministic spec; add an attacking-NPC hook variant for manual checks and UAT | ✓ |
| Shooter only | Attacking NPCs with fire are checked in Vitest only | |
| Attacker only | Replace the shooter with a real attacker; spec less predictable | |

| Option | Description | Selected |
|--------|-------------|----------|
| NPC-vs-NPC in Vitest only | Two-pilot scenarios; 90 % rule and one browser spec | ✓ |
| Also a hook pair for UAT | A hook variant spawning two NPCs fighting | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep the range roll | Gate as in Oolite; the spec waits N ticks for the shield to drop | ✓ |
| Tune for the test | Place close or pin accuracy in test mode | |

## How fire is switched on

| Option | Description | Selected |
|--------|-------------|----------|
| In the pilot's params | Flag on the AI module params, read through SteerContext; `ai: null` can never fire; no new hashed field | ✓ |
| Field on the entity | `weaponsArmed` on Entity; breaks the frozen v4 set | |

| Option | Description | Selected |
|--------|-------------|----------|
| All in-scope hot-weapon branches | Every fireMainWeapon site and weapon_temp branch in the Phase 14 IN list | ✓ |
| Fire call only | Recorded trajectory divergence | |

| Option | Description | Selected |
|--------|-------------|----------|
| As the player's, with non-strict >= | round(rate*120); NPC gate compare from ShipEntity.m; cooling per tick | ✓ |
| Discretion | Leave to research and oracle | |

## The A7 test pilot

| Option | Description | Selected |
|--------|-------------|----------|
| Every NPC shot through the gate | No bypass; amend A7 and the Phase 13 cadence pins | ✓ |
| Keep the ungated test path | Two rules for NPC shots | |

| Option | Description | Selected |
|--------|-------------|----------|
| Every tick, as Oolite | Request each step; the gate sets the rate | ✓ |
| On think, every 15 ticks | Beam rate lower than Oolite's | |

## Carry-overs from Phases 15 and 16

The first question set (mutual-kill credit, `shipHit` consumer, `shipTargetLost` narrowing) was paused by the owner, who asked: "сейчас пользы нет, но мы потом не забудем это переделать?" ("no benefit now, but won't we forget to redo it later?"). Claude proposed a guard test per deferral that fails at the first consumer and names a todo.

| Option | Description | Selected |
|--------|-------------|----------|
| Tripwires + todos | Keep asymmetric credit (recorded divergence), HUD only, `shipTargetLost` unchanged; three guard tests and todos | ✓ |
| Redo now | Symmetric credit and narrowing now; amends Phase 15 criterion 1 | |

## Claude's Discretion

- Opt-in param and SteerContext field names; how the test pilot requests every tick; shooter distance and tick budget; the attacking-hook variant name; plan split; guard detection technique.

## Deferred Ideas

- Symmetric mutual-kill credit, player hit feedback, `shipTargetLost` narrowing (each behind a tripwire); escort release when escorts first spawn.
