# Phase 17 — Plan Reviews

Reviewed 2026-11-18 by three independent reviewers (Fable, Opus, Sonnet) and the plan checker (iteration 2) after revision `a82ee16`. The owner was away and authorised review by Claude's own models; dispositions marked *(orchestrator)* were settled without the owner.

## Orchestrator dispositions (binding for the replan)

1. **D-07 period (Fable M1).** Fable shows D-07's rationale ("both correct to their sources") is factually wrong for three of four lasers: with `shot_time < 0.1f`, a literal Oolite NPC beam/military fires on frame 13 at 120 Hz, the same as the player port (61/13/301/13); `round(rate×120)` with `>=` gives 60/12/300/12, so NPC beam/military fire ~8 % faster. The earlier advisor said keep 12. D-07 is owner-locked and the change is cheap to make later (one line in `fire.ts` plus one re-pin), so **keep D-07 as locked** and: (a) the 17-05 gate row states the numbers plainly (NPC 60/12/300/12 vs Oolite literal and player 61-or-60/13/301/13 — take exact counts from 17-01's derivation); (b) make it **owner question #1** in 17-09's SUMMARY, with the concrete alternative (per-laser `npcRechargeTicks` equal to the literal shot frames). *(orchestrator)*
2. **Criterion 2 vs D-03 (checker blocker).** Resolved in `17-ADVISOR-NOTES.md` § Reconciliation (commit `6d126df`): D-03 governs; the hook fight proves the player's shields and energy falling; NPC-kills-NPC is proved by 17-08 Vitest scenarios. Plans should cite this reconciliation; the 17-09 owner question stays non-blocking. *(orchestrator)*
3. **Fourth guard (Sonnet MEDIUM-2).** Keep it (advisor decision 3, endorsed by Opus security review) but narrow its scan so legitimate refactors don't trip it; it stays a tripwire. *(orchestrator)*
4. **Uncommitted tree in 17-05 (Opus M4).** Pre-authorise a recovery path: if 17-05 must stop before its single D-08 commit, the executor commits the work in progress to a side branch `wip/17-05` (no push) and records it in the SUMMARY; the final D-08 commit on `main` is still one commit. *(orchestrator)*
5. **codebase-memory index stale (Opus L3).** Re-indexed by the orchestrator before execution; no plan change.

## Plan checker, iteration 2 (remaining items)

- BLOCKER criterion 2 — see disposition 2.
- WARNING 17-07 has 14 files: split into behaviour edits and fire-site consumer/runner, or justify in the objective.
- WARNING 17-02 loads `17-ADVISOR-NOTES.md` from the start (port design contaminates the independent oracle author); defer it until after fixtures are written, as 17-01 does, or cite only the needed warnings.
- WARNING Pitfall 16: a ship whose nav target is itself must be refused (no shot, no draw, no write) — add cases in fire.test.ts (17-04), npc-fire.test.ts (17-05) and a fast-check case.
- WARNING D-17: add properties for `npcOnTarget`, `rangeToTargetIn` (17-04), a bounded-push property for `requestFire` (17-06), and a property or drain-level case for `coolShips` (17-05).
- WARNING divergence 21 wording (17-07, 17-04 must_haves): the port never dodges from fly-to; Oolite dodges in the else-if (ShipEntity.m 4713-4730) when accuracy >= 9 and the target has a forward weapon at aspect > 0.99999 (or aft < -0.999). Restate; cite D-06 for the cut.
- INFO 17-03 read_first: `ROUTED_KINDS` → `ROUTED_EVENT_KINDS` (src/app/session/event-router.ts).

## Fable review (Oolite fidelity, determinism, executability) — overall risk MEDIUM

- HIGH H1 (17-02 T2): proposed self-test reads the Oolite checkout (17-02:163 "a source scan of the cited methods in the Oolite checkout is acceptable"). The checkout is not mounted in the test container (compose.yaml:24-26) and tests/guards/oracle-independence.test.ts:41-54,135-145 rejects string literals matching `src/` paths. Fix: contract item 4 becomes a recorded literal table `{ method, fireLine, nextDrawLine | null }` in `fire-sites.self.test.ts` written from the source, plus a SUMMARY statement; no test reads a file outside the repo.
- HIGH H2 (17-04 T3, 17-07 T2): tests/sim/npc/oracle-coverage.test.ts:95-104 requires every `*.oracle.test.ts` in tests/sim/npc to be in ORACLE_GROUPS; plan 17-04:221 puts fire fixtures in `FIRE_ORACLE_GROUPS` and says leave Phase 14 checks untouched → red suite. Fix: in 17-04 amend that one check to the union of ORACLE_GROUPS and FIRE_ORACLE_GROUPS test files, explicitly; keep the Phase 14 fixture-file equality (61-65). Also 17-01: reference.self.test.ts:415-430,507-511 fails on a `confirmedBy` id outside fixtures dirs — keep the `allFixtureIds()` extension in the same commit as the rows.
- MEDIUM M1 (D-07; 17-01, 17-04, 17-05): `weapon_recharge_rate` is float (ShipEntity.h:345), `shot_time` double (:186); `shot_time < 0.1f` → NPC beam/military fire on frame 13 at 120 Hz, the same as the player's strict `>` port (src/sim/combat/weapons.ts:51, constants.ts:44-46 documents 61/13/301/13). Pulse NPC 60 exact; mining 301. So `round(rate×120)` with `>=` makes NPC beam/military 8 % faster than Oolite and than the player. D-07's rationale "both correct to their sources" is factually wrong for 3 of 4 lasers. Fix: decision row states numbers; owner question #1 with the concrete alternative — a per-laser `npcRechargeTicks` = literal shot frames (60/13/301/13), a one-line change in fire.ts plus one re-pin; ask the owner before 17-05's re-pin if possible.
- MEDIUM M2 (17-01 brief): "identical to the pin 7437f22 for cited files" is false for PlayerEntityControls.m (strict compare at :1185 at the pin, :1187 at checkout HEAD). Amend: cite the pin and read with `git show 7437f22:…`.
- MEDIUM M3 (17-05 T1): HEAD's hook shooter has `nav.targetId = NO_ENTITY` (test-spawn.ts:92-93 sets only ai.params.targetId; test-pilot.ts:123-137 hold calls setTarget only on lost-target). State this in the behaviour list; add a test `nav.targetId === PLAYER_ID` after the first stepped tick.
- MEDIUM M4 (17-05/17-06): make the drain refuse `shooter.ai === null` explicitly (no draw) — a think throw nulls `ai` without resetting steer (step.ts:309-314), so the accuracy sentinel is not a full guarantee. Add to npc-fire.test.ts.
- LOW L1: rate-rule.oracle.test.ts PORTED excludes 9912-9993 and 2214-2221 and reads only Phase 14 dirs; extend it with the fire manifest in 17-05 or record the gap.
- LOW L2 (17-05): coolShips must sit before resolveShotHits' empty-shot early return (combat/step.ts:279-280), right after rechargeShips.
- LOW L3 (17-07): fly-to hot branch uses the raw `aim_tolerance` field → name `aimToleranceOf(accuracy)`, not currentAimTolerance.
- LOW L4 (17-06): sniper fire call goes after the if/else, not inside the else (Oolite 4454 outside 4414 if/else) — keep.
- LOW L6 (17-05): the one-commit override must be honoured by the executor; `-0` is cosmetic since serialize.ts:160-168 uses `!== 0`.

## Opus review (executability, integration, D-08 inventory, security) — overall risk MEDIUM

- HIGH H1 (17-04, 17-07): same as Fable H2 — `tests/sim/npc/oracle-coverage.test.ts:95-104` and `:75-92` (`fixtureFilesFor`, oracle-groups.ts:88-92) fail on the new fire oracle files. Explicitly allow amending to `ORACLE_GROUPS ∪ FIRE_ORACLE_GROUPS` with a `fireFixtureFilesFor` twin; list oracle-coverage.test.ts as modified. No plan may add 2214-2218, 9946, 9949 to `rate-rule.oracle.test.ts` PORTED (it resolves only through ORACLE_GROUPS).
- MEDIUM M1 (17-05): D-08 inventory misses `tests/sim/world/world-cadence.test.ts:627-890` KillScenario (fire test pilot preset to `hold`, `weapon = { temperature: 12.5, lastShotTick: 7, missedShots: 2 }`, R2-11b "never calls setTarget", asserts `viperNeverTargetedSidewinder` at :798/:890, 2 kills at :877). Add as "amend": the Viper now holds the Sidewinder and is posted `shipTargetLost` at the kill (no handler); restate the `lastShotTick: 7` timer consequence and the "fourth beam" comment at :734.
- MEDIUM M2 (17-07 T1): deleting `NPC_WEAPON_TEMP` in Task 1 breaks typecheck (attack-evade.ts:43,184 still uses it, owned by Task 2). Move the deletion to Task 2 or add attack-evade's break-off read to Task 1.
- MEDIUM M3 (17-02 T2): same as Fable H1 — remove the Oolite-checkout scan option; a cited literal table (method, call line, last line) instead. Reviewer confirmed: evasive 4035 is the last statement; sniper 4454-4458, six 4575-4579, fly-to 4711-4730 have no draw after the call.
- MEDIUM M4 (17-05): twin energy budget not analysed — reviewer estimates the Viper (180 energy, recharge 4/s, beam 0.5 cost, 6 damage, 12-tick period) now dies on the player's ~12th pulse (~spawn+672) not the 14th (794, tick-parity.test.ts:695); bank at kill plausibly ~20-30 vs floor 16 (:698-701). Measure the gated twin early (scratch under /tmp, mounted) or state the expected offset and margin; recovery path per disposition 4.
- MEDIUM M5 (17-01, 17-02): oracle independence leaks — ROADMAP plan list mentions "12 versus 13 ticks"; both oracle plans embed the all-plans Artifacts table naming fire.ts/npcFireGate/coolShips; 17-02 includes ADVISOR-NOTES. Tell 17-01/17-02 authors not to read ROADMAP's plan list (or strip the numbers from that line), remove the cross-plan artifacts table from their briefs (keep only their own artifacts), have 17-02 cite only needed warnings, and record the drain-site exclusion (steering fixtures exclude the gate draw) as an oracle assumption in COVERAGE/SUMMARY.
- LOW L1: Oolite computes dq, aim, aim*aim, astq as GLfloat (ShipEntity.m:9855-9909); make the astq-equality fixture hold in both widths or record a divergence.
- LOW L2: wave 1 shares the tree — narrow 17-01's verify to `tests/oracles/npc/fire tests/oracles/npc/reference.self.test.ts` (and 17-03's to its own guards) so mid-edit files of parallel plans don't redden it.
- LOW L4 (17-07, 17-06): hot-weapon tracer target dies before the weapon heats (USABLE after ~84 beam shots, ~500 damage); state a high `maxEnergy` (≤ MAX_ENTITY_ENERGY 1e6) for the target; in 17-06 "Adder's energy falls by 6 per hit" ignores rechargeShips.
- LOW L5 (17-08): mutual kill "on the first tick both pass the gate" depends on roll draws; loop to the first tick where both fire and assert there, or choose seeds explicitly (accuracy not pinned, D-04).
- LOW L6 (17-05): NPC shot candidates exclude station/buoys, so a station strike counts as a miss (+1) whereas Oolite counts any ShipEntity; record as a divergence until Phase 18.
- LOW L7 (17-03): shipHit/shipTargetDestroyed/shipKilledOther appear in combat/step.ts:362-380 comments only; guards strip comments — note for the executor.
- LOW L8: 17-VALIDATION.md map is stale (npc-fire.test.ts vs npc-vs-npc.scenario.test.ts; missing fire-sites.oracle.test.ts); 17-09 must replace rows, not tick them.

## Sonnet review (scope and simplicity) — overall risk LOW

- MEDIUM-1 (17-05 T3 vs 17-09 T2): remote `verify` runs twice. Drop the full `verify` from 17-05 (keep the targeted combat.spec.ts remote run and the acceptance run); run `verify` once, in 17-09 (D-18; AGENTS.md gate-by-change-type; slow-machine policy).
- MEDIUM-2 (17-03 T2): the fourth guard `fire-decision-source.test.ts` (advisor decision 3, not asked by D-13/D-14) is an allowlist scan that breaks on legitimate refactors. Suggest dropping the static scan, keeping a runtime assertion that every populated ship has `ai: null`; or label it optional.
- MEDIUM-3 (17-04, 17-01, 17-02): three test layers on the gate port. Restrict 17-04 hand tests to what the oracle cannot express (totality on malformed input, no-draw ordering on a real entity); keep the property suite (D-17, Pitfall 16); avoid duplicating oracle boundary cases.
- LOW-1 (17-08 T2): mid-fight snapshot case overlaps Phase 15's snapshot-boundary property; fold into the property run or cut to a weapon-record equality assertion (float32 temperature survives JSON).
- LOW-2 (17-01 T3): keep the shot-timer frame-rate row (real divergence); cooling/roll rows restate "tick-based"; drop the "write literals before opening the advisor notes" ceremony.
- LOW-3 (all): brittle bookkeeping acceptance checks (awk on CHANGELOG group order, `rg -c "24 thinks"`, `git show --name-only HEAD` list, COVERAGE.md in .planning). Replace with behaviour-level checks ("entry under the right group", "A7 row amended").
- LOW-4 (17-05, 17-09): one CHANGELOG line for the whole phase in 17-09 rather than two edits plus order checks.
- LOW-5 (17-03 guard 1): scanning the bare identifier `killer` is too broad; scan `shipTargetDestroyed`, `shipKilledOther` and `.killer` on `shipDestroyed` events only.

## Plan-Revision Conflicts

<!-- gsd:plan-revision-conflicts:start -->
<!-- gsd:plan-revision-conflicts:end -->
