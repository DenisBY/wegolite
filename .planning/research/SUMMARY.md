# Project Research Summary

**Project:** Wegolite, milestone v2.4 Pirates and Police (phases continue at 21)
**Domain:** Browser port of Oolite: system populator, hand-ported priority AI, legal status and bounties, cargo scooping, combat rating
**Researched:** 2026-11-25
**Confidence:** HIGH for Oolite behaviour and integration points (read from the checkout at pin `7437f22` and the Wegolite tree); MEDIUM for population sizes and effort; LOW for the real-Oolite census feasibility.

Detail lives in `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md` (same directory).

## Executive Summary

v2.4 turns the inert 12-ship world into Oolite's living system. Oolite builds this from three pieces. `oolite-populator.js` is arithmetic over the economy and government of systems within 7 LY (initial groups plus a 20 s repopulation tick). `oolite-priorityai.js` is a 6.8k-line priority-list AI (about 130 to 190 reachable functions, 58 `Math.random` sites) with one script per role. The engine adds a small legal and reward layer: `markAsOffender` bit-ORs, `collectBountyFor`, `markForFines`, `getFined`. Wegolite already has the substrate: a deterministic fixed-step world, native steering, the v2.3 damage ledger, pods, the fire gate, a typed AI seam and a dev-only harness that runs Oolite's own JS. So this is a port plus integration milestone. It needs **zero new dependencies** and no Docker or image change.

Recommended approach: keep priority lists as frozen typed TS tables over flat `AiComponent.params` (no closures, so state hashes and snapshots). Run one up-front bundled hashed-shape bump (world snapshot v4 to v5, later save v5 to v6) so no later phase reopens the format. Build the populator first as a pure planner verified exactly against Oolite's own script (recorded oracle fixtures). Then the AI engine (traders and pirates), then police, hunters, legal status, bounty and rating, then repopulation, then scooping. Oracles are recorded from Oolite's original JS and replayed in CI (the checkout is not needed in CI). Headless Oolite is a sanity census only, not an oracle.

Key risks, and what the roadmap must do about them:
1. The new populator and the 9-to-28-hull catalogue growth silently change the **frozen 20-seed acceptance run** and the inert goldens. Leave `populateInertWorld` and `INERT_POPULATION` byte-identical, add the new populator beside them, and pin the inert world hashes.
2. **Milestone text and Oolite disagree**: Oolite pays the bounty **at the kill**, not on docking; docking pays only fines (and the deferred pod rewards). This needs an owner answer before the law phase is planned.
3. The AI library needs **NPC removal paths** (dock, jump, land), **station behaviour** and a **hit-reaction stage** in the ledger, none of which exist. Without them traffic never turns over and legal status never triggers.
4. Population is larger than assumed (about 40 to 65 ships on average, up to about 110 at peak in an anarchy). That presses on the 256 entity cap, the 50 draw-call budget (28 hull keys) and per-tick cost.

## Key Findings

### Recommended Stack

No package changes. Everything is plain TypeScript over data that the existing `tools/oolite-ingest` pipeline compiles from plists that are already vendored. Only models and textures are new vendored bytes (9 GLBs).

**Core technologies (unchanged, with their v2.4 role):**
- TypeScript strict 6.0.2: all sim, ingest and oracle code. New AI modules stay inside the AI lint zone (depth 2 under `src/sim/ai/`, allow-listed imports).
- zod 4.6.7: widened strict NPC record schema (bounty, auto_ai, has_scoop, escorts, counts_as_kill, ...), save schema v6, role-categories, ai-map and comms schemas.
- Vitest + fast-check: replay of recorded oracles; property tests (legal status never decreases except by the three Oolite rules, rating monotone in kills, spawning an unrelated ship never moves another ship's draws).
- Vite 8.3.8 and the existing lazy-chunk pattern: new catalogue stays in the traffic-only lazy set; first-load ceiling (9 MiB) must not move.
- tsx + `tools/ai-harness`: becomes a **recorder** (`record.ts`, `populator.ts`, `reach.ts`). Fixtures commit under `tests/oracles/{ai,population}/`. Keep the `OOLITE_SRC` mount; do **not** vendor Oolite's scripts.
- Three.js 0.187: no new API; the risk is draw calls (one `InstancedMesh` per (model, primitive)).

**Content inputs (all plists already vendored):** `shipdata` (+overrides) widened from 9 to **28 records** (verified by resolving `like_ship` over the populator roles; a 9-record catalogue skews every composition figure), `autoAImap` (role to AI key), `role-categories`, `descriptions` comms subset, `trade-goods`, `planetinfo`. Lift the converter's `aft_weapon_type` refusal (six of the 28 hulls need it). One GLB per record key, not per model.

### Expected Features

**Must have (table stakes; acceptance fails without them):**
- DATA-20 record fields, role categories, AI map, comms strings.
- POP-01..04: initial population by Oolite's rates, per-ship kit (weapons level, skill, bounty values; missiles inert), repopulation every 20 s with witchpoint arrivals and caps, pack leader/follower groups.
- AI-01..08: priority controller, library subset, trader, pirate family, police, standard event handlers, autonomous fire via the existing gate, comms to the player.
- NPC-LIFE-01/02: NPC exits (dock, jump, land) and station launches (stand-in).
- LAW-01..07: integer legal status (Clean 0, Offender 1 to 50, Fugitive 51+, halve on arrival, zero on galactic jump), offence broadcast, police response, fine at main-station dock, docking check (docking computer and instruction text; manual docking is not refused by Oolite), station marks, kill bounty.
- SCP-01/03: player scooping with Fuel Scoops (F3), NPC scooping for the pirate loot loop.
- RAT-01: kill tally and rating on F5, saved (save v6).

**Should have (differentiators, recommended in):**
- POP-05 light bounty hunters (law of Anarchy and Feudal, where police rate is zero).
- RAT-02 "Right On, Commander!" every 256 kills; SCP-02 scoop HUD light if the layout fits.

**Defer (v2.5+):**
- Dynamic player roles (LAW-08), station defence ships (AI-09), jettison (SCP-04), trader opportunist and assassins (AI-10), medium/heavy hunter packs, missiles and ECM, escape pods and insurance, scavengers and shuttles, sun scooping, contraband penalties, rock hermits, asteroids, aegis raiders, Thargoids.

### Architecture Approach

The priority AI is code-as-data: frozen tree tables selected by `params.tree`, a single `think` evaluator, handler sets as data, per-ship state as about 24 flat `params` keys (limit 32, enforced by a unit test), caches recomputed per think. The populator runs inside `stepWorld` as a new phase after the final AI drain and before sanitise, driven by a hashed `World.populator` record and stateless forked RNG per roll. Player standing (legal bounty, kills) is **sim-owned and hashed** (inside the combat state, pristine-omit), not a profile mirror; the profile gets credits and the hold only. A new `retireShip` is the only non-lethal removal path. Groups are `Entity.groupId` plus a small `World.groups` table; membership is derived by scan.

**Major components:**
1. `src/sim/ai/priority/` (engine, trees per role, conditions, behaviours, responses, params) with `ai/facts.ts` injected content facts.
2. `src/sim/world/populator/` (`facts`, `plan`, `spawn`, `repopulate`), beside the untouched inert populator.
3. `src/sim/world/{retire,scoop}.ts`, `npc/behaviours/collect.ts` (new native COLLECT_TARGET and tractor stage).
4. `src/sim/combat/offence.ts` plus a ledger **hit-reaction stage** (aggressor and offence broadcast for every laser hit including the lethal one; `noteTakingDamage` draw; retaliation only if energy remains).
5. `src/sim/player/standing.ts` (`markOffender` OR, `ratingFor`, `collectBountyFor`, halve on arrival), station responder record (`World.station`, not a dynamic entity).
6. App flows: `standing-flow`, `scoop-flow`, event-router additions (append to `EVENT_SUBSCRIBER_ORDER`, never insert).
7. Oracle tooling: AI trace recorder, populator recorder, reachability checklist (`reachable.json`).

### Critical Pitfalls

1. **Frozen acceptance and inert goldens share the production populate path and the NPC catalogue (C1).** Keep `populateInertWorld`, `INERT_POPULATION`, `createInertPopulate` untouched with an explicit nine-key record list; add a measured-before/equal-after hash pin for `laveInertWorld` epochs 1 to 20; new traffic acceptance is a **new file**, never an edit to `thresholds.ts`.
2. **Piecemeal hashed fields (C2).** One field-design plan first: snapshot v5, pristine-omit segments, `Entity.bounty/groupId/cargoKind/podCommodity/podAmount`, per-facing weapons, `World.groups/populator/station`, `PlayerStanding` in the hashed combat line; save v6 gets only `legalStatus` and `shipKills`.
3. **Closure state and draw order in the AI port (C3, C4, C5).** Typed `params` only; evaluate entries in `_reconsiderList` order and keep short-circuit order so draw counts match; resolve `accuracy` at spawn (the lazy sentinel -100 breaks `reconsiderNow`); strict-greater wake conversion; verify with recorded oracle traces comparing decisions, parameter writes, draw indices and wake times (not frames).
4. **Damage path lacks the AI-visible side effects (C6) and the legal rules live in AI scripts (C7).** The doomed-target todo must not skip the offence broadcast; legal status is an integer OR-ed by AI handlers (`| 7`, `| 15`, `| 63`, `| 8`) and engine marks (`| 64`); reproduce or record the `bounty & 7 != 7` precedence bug, never fix it silently.
5. **No removal path, silent idle fallbacks, entity cap (C10, C11, C12).** Add `retireShip` and a reachability tripwire (every behaviour a ported tree can request exists in `BEHAVIOUR_ROUTES` or is a recorded cut); make group spawns atomic; decide pod lifetime and a populator ceiling from measured data; soak-test a full anarchy with ten kills.

Also: three tripwires fire in this milestone (`kill-credit-consumers`, `ship-hit-consumers`, `on-event-handlers`) and must be handled in the first plan that crosses them; the missiles/ECM todo asks for a guard that fails if an NPC with `missiles > 0` reaches an AI.

## Open decisions for the owner

Deduplicated across all four files. Each has a recommendation; BLOCKING items must be answered before the named phase is planned.

| # | Decision | Recommendation | Blocks |
|---|----------|----------------|--------|
| D1 | **Bounty at kill vs on docking.** Milestone text says "paid on docking"; Oolite credits `10 x bounty` at the kill (`PlayerEntity.m:6042-6092`) and pays only fines at docking. | Follow Oolite: credit at the kill with the "Bounty / Total" message; treat "on docking" as the fine and the fugitive refusal. Rewrite the acceptance sentence. Payment on docking would need `standing.pendingBounty`, a divergence row and two reviewer agreements. | **BLOCKING** Phase 21 (roadmap and requirements text), Phase 24 |
| D2 | **Main-station responder / station AI.** `AuthorityPredicate` makes the station an authority; without it nothing marks offenders near the station and attacking it has no response. | Minimal responder only: one hashed `World.station` record (alert level, offence receiver marking `\| 63`, hit-station marking `\| 64/96`, police launch through the D3 stand-in). Defer defence ships and full `oolite-stationAI.js` (AI-09). Do not promote the Coriolis to a dynamic entity. Record in Key Decisions and `FIDELITY.md`. | Phase 21 (record shape), Phase 24 |
| D3 | **NPC docking / departure / launch stand-in.** Traders end by docking or jumping, police and hunters return to dock, repopulation launches from the station. None exists. | Simplified stand-in with a `FIDELITY.md` row: approach dock mouth then `retireShip` (docked), witchpoint then retire (jumped), planet range then retire (landed); station launches spawn at the dock mouth, pirates from the planet by position. One seam so Oolite's docking port can replace it later. Never use `killShip` for departures. | Phase 23 |
| D4 | **Repopulation.** Initial-only vs the 20 s timer. | Include it (about 280 lines of `random < rate` arrivals) inside `stepWorld`, armed from a forked stream, with a populator ceiling. Without it a cleared system stays empty and "pirates attack unprompted" fails after the first fight. | Phase 25 |
| D5 | **Hull catalogue growth and aft weapons.** 9 compiled hulls vs the 28 records the populator roles resolve to; six need aft weapons. | Grow to 28 records (18 models, 9 new GLBs) and lift the `aft_weapon_type` refusal as planned work (per-facing weapon type and temperature in the one snapshot bump; aft branch in attack and the fire gate). Otherwise police vanish at TL 10+, packs are all small ships and the Oolite comparison is meaningless. Fallback if schedule forces it: nine hulls plus aft-free freighters, compare by role class, record every fallback. | **BLOCKING** Phase 21 |
| D6 | **Draw-call budget.** 28 hull keys, each with several primitives, against the 50-call budget in `budget.spec.ts`. | Measure a full anarchy in a render spike in Phase 21 before the populator ships. Fixes in order: merge primitives per hull at build time, share textures across variants, then an owner-recorded budget raise. Do not hide it by lowering traffic. | Phase 21 (spike), Phase 22 |
| D7 | **Pod commodity, lifetime and hold model.** Pods are anonymous; scavengers (the pod cleaners) are deferred; Oolite keeps scooped pods in a separate list until docking. | (a) Pods carry commodity and amount from a forked `"pod"` stream (one measured debris re-pin, in the Phase 21 bump). (b) Scooped pods merge into `profile.cargo` at scoop time via `cargoScooped` (no new save field; `FIDELITY.md` row; saved `heldPods` array is the fallback). (c) Add a pod expiry or debris-before-ships eviction rule, decided from soak data and recorded, since nothing else removes pods. | Phase 21 (fields), Phase 26 |
| D8 | **Player role static vs dynamic.** Oolite drifts player roles with play; used for pirate victim choice and police forgiveness. | Static `player-unknown`, recorded divergence. Consequence: first laser hit on a clean ship is an offence with no forgiveness. Dynamic roles (LAW-08) later. | Phase 24 |
| D9 | **Light hunters.** Owner list omits them; for governments 0 and 1 the police rate becomes light hunters. | Include light bounty hunters only (about 90 percent shared with the police AI). Exclude medium/heavy hunter packs and the leader AI. Otherwise Anarchy and Feudal have no law away from the station. | Phase 24 |
| D10 | **Jettison / cargo demand.** Pirates say "Your cargo or your life" but there is no jettison to pay them. | No jettison in v2.4. Keep Oolite's demand line, record the divergence (demand only resolved by killing the pirate or fleeing), add a todo plus tripwire for SCP-04. A minimal `j` jettison is a cheap stretch in Phase 26 if the owner prefers. | Phase 23 (comms), Phase 26 |
| D11 | **Mutual kill credit symmetry** (todo `2026-11-18-mutual-kill-credit-symmetry`; first consumer trips `kill-credit-consumers`). | Settle in Phase 24's first plan with a test per case. Player collects only if alive (`PlayerEntity.m:6044`); credit the damage dealer from the ledger record, not an AI event; symmetric credit for the consumers added here (bounty, tally, "attacked police" mark); NPC-vs-NPC id-order asymmetry accepted and recorded only if no consumer can observe it. Narrowing the kill-time `shipTargetLost` needs the owner's edit of the Phase 15 criterion; ask in the same breath. | Phase 24 |
| D12 | **Acceptance run in a gate.** The 20-seed run is in no gate by decision (IN-04); v2.4 touches `src/sim/npc/**`, `src/sim/world/**`, `ships-npc.json`. | Keep the frozen run manual on the remote machine after each qualifying plan, recorded in the plan SUMMARY. Do not add to `verify-full` yet. Add a **new** traffic acceptance scenario (separate file) at Phase 27; revisit gating after. Ask once, early, whether the collisions-on and idle-flyer variants (todos IN-05, collisions-on) may be added as new files. | Phase 21 (ask), Phase 27 |
| D13 | **Afterburner / fuel injection.** Five hulls (asp, ferdelance, krait, viper-interceptor, cobramk1-alt) have injectors; interceptor AIs speed up with them; v2.2 cut the afterburner. | Keep the cut and record the narrower pursuit speed for those hulls. Port only if the Oolite comparison shows interceptors escaping in a way that changes outcomes. | Phase 23 |

Defaults the roadmapper may assume without asking: missiles forced to zero at spawn for every NPC with a tripwire guard; NPC `has_escape_pod` false; scavengers and shuttles removed from the populator table; sun-skim conditions false; equal-priority populator entries run in the script's insertion order; comms-text expansion in the UI only, never in the sim.

## Implications for Roadmap

### Phase 21: Roster, state shape, seams
**Rationale:** Everything depends on the 28 hulls and one bundled hashed-shape bump (v2.3 lesson: freeze the data shape up front).
**Delivers:** Widened NPC schema and converters (bounty, auto_ai, has_scoop, escorts, counts_as_kill, role-categories, ai-map, comms), 9 new vendored GLBs with provenance, aft-weapon refusal lifted; snapshot v5 with every new field pristine-omit; `PlayerStanding` in combat state; `retireShip`; ledger hit-reaction stage and `offence.ts`; AI vocabulary and `WorldView`/`ShipControl` widening with pin tests; pod identity; inert-world isolation and hash pin; draw-call spike; guards updated.
**Addresses:** DATA-20, groundwork for POP, AI, LAW, SCP, RAT.
**Avoids:** C1, C2, C9, C11 (design), M6 (pod fields).

### Phase 22: Populator, initial population
**Rationale:** Pure arithmetic with exact oracle support; composition is verified without AI noise and the AI phase gets real ships.
**Delivers:** `populator/{facts,plan,spawn}.ts`, neighbourhood builder, group builders (traders, couriers, smugglers, independent pirates, packs, hunters, police), kit helpers, `WITCHPOINT` location, populator recorder and `tests/oracles/population/*`, `createSystemPopulate` beside the inert closure; ships still `ai: null`. Boxed spike on a real-Oolite census (start-system choice).
**Avoids:** C1, C4 (forked streams), M7, C12 (atomic groups).

### Phase 23: Priority AI engine, traders and pirates
**Rationale:** Foundation of every role; traders and pirates first because police react to offences and standing.
**Delivers:** Engine, params, handler sets, comms channels, groups and escorts, trader, pirate (4 variants) and escort trees, NPC exit stand-ins via `retireShip`, `COLLECT_TARGET` stub, autonomous fire, generalised harness recorder and reachability checklist, comms text via UI expander.
**Addresses:** AI-01..03, 04, 06..08; NPC-LIFE-01.
**Avoids:** C3, C4, C5, C10, M1..M3.

### Phase 24: Police, hunters, legal status, bounty, rating (save v6)
**Rationale:** Needs the attack events and the engine; legal rules are AI handlers plus a small engine layer.
**Delivers:** Police and light-hunter trees, station responder, `standing.ts`, offence marks, police response by status and government, kill bounty and tally, rating and "Right On", fine at main-station docking, docking-computer refusal for fugitives, halving on arrival, save v6, `standingFlow`, F5 panel, scanner kinds, HUD message prioritisation. First plan settles D11.
**Addresses:** AI-05, LAW-01..07, RAT-01..02, POP-05.
**Avoids:** C6, C7, C8, M4, M9.

### Phase 25: Repopulation and station launches
**Rationale:** Arrivals and exits are AI behaviours; the population must turn over and stay bounded.
**Delivers:** `repopulate.ts`, witchpoint arrivals, station and planet launches, police launch for station marks, populator ceiling from measured data, pod and debris cap rule, 100-ship soak recorded.
**Addresses:** POP-03, NPC-LIFE-02, LAW-06.
**Avoids:** C12, M5.

### Phase 26: Loot and scooping
**Rationale:** Needs pod identity (21), pirates that collect (23) and the hold; a golden-moving change belongs late and once.
**Delivers:** `scoop.ts` tractor stage, collision scoop branch, F3 Fuel Scoops (damageable, installed-list check), `scoop-flow`, hold fact, pirate `CollectSalvage`, scanner pods, render, optional scoop light, optional jettison if D10 flips.
**Addresses:** SCP-01..03.
**Avoids:** M6, m6.

### Phase 27: Integration, acceptance, release gate
**Delivers:** New traffic acceptance scenario over 20 seeds (thresholds committed before the run), anarchy pirate-attack and "fire on a trader, police attack" scenarios, Playwright journey, reference census and behaviour probe comparison, real-Oolite JS hash check against the checkout, `FIDELITY.md` rows, `verify-full`, frozen acceptance rerun by hand, milestone audit before close.
**Avoids:** M8, M10, headless-Oolite comparison traps.

### Phase Ordering Rationale
- Content and the hash bundle first, else each later phase pays a second snapshot bump and golden regeneration.
- Populator before AI (STACK and ARCHITECTURE agree; FEATURES preferred AI first on scripted scenes, resolved by doing scripted-scene tests inside Phase 23).
- Police and law after traders and pirates: legal marking depends on the hit-reaction stage, AI handlers and the station responder.
- Repopulation after AI and exits exist; scooping last among features because it moves debris goldens. Scooping can run in parallel with 24 and 25 once Phase 21 pod fields land.

### Research Flags
Needs `/gsd-plan-phase --research-phase`:
- **Phase 21:** aft-weapon lift (per-facing temperature, attack and fire gate), 28-record converter widening, draw-call options, consolidated field design. Highest design risk.
- **Phase 22:** `systemsInRange` neighbourhood and `bottleneck` over the galaxy graph; recorder stub scope; real-Oolite start-system spike (LOW feasibility).
- **Phase 23:** condition-by-condition port with draw-order checks, harness stub growth per role, `reconsiderNow` and wake semantics, synchronous vs queued reactions, scan order and 32-ship cap.
- **Phase 24:** legal flows and station responder, docking-check scope (manual docking is not refused), D11 credit cases.
- **Phase 26:** tractor force constants and `canScoop` geometry (player underside rule), hold capacity in pods.

Standard patterns (skip research): **Phase 25**, **Phase 27** (except the Oolite comparison design).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new packages; integration points cited by file and line at the pin. Population-size numbers MEDIUM (scratch runs, stubbed host). |
| Features | HIGH | Rule numbers read from source; derived expected counts MEDIUM. Hidden dependencies (NPC exits, station, hulls) well established. |
| Architecture | HIGH | Verified in repo; hit-reaction, standing and snapshot design consistent across files. Station record and group table MEDIUM-HIGH. |
| Pitfalls | HIGH | Facts read from both trees. Effort and performance projections MEDIUM; "AppImage JS equals checkout JS" unverified. |

**Overall confidence:** HIGH for scope and ordering; MEDIUM for effort and for population and draw-call budgets.

### Gaps to Address
- **Population size and entity budget:** sources disagree (about 40, 30 to 60, up to 110 live ships; about 65 mean in anarchy, 79 to 111 max). Compute the distribution over all 2,048 systems in Phase 22, then set the populator ceiling and pod rule from data.
- **Draw-call budget with 28 hulls:** unmeasured; Phase 21 spike (D6).
- **Real-Oolite comparison:** start-system selection via OXP scenario save unproven; reference JS may differ from the checkout (hash the AppImage scripts first); no seed means 20 to 30 runs per scenario with thresholds written first; game time slower than wall time. The player-attack acceptance is an in-Wegolite test, with Oolite giving rates only.
- **Station responder scope** (D2): how much of `launchPolice` is in v2.4 is a Phase 24 plan-level decision.
- **Recorder stub cost per role:** the spike reached one role; budget one stub session per role AI, with a hand-trace fallback.
- **Hash re-pin approval:** confirm the Phase 18 standing approval covers the one v2.4 re-pin (inert world and debris pods).
- **Process carry-overs:** docked F-key bug still open (UAT passes F5, F8, F3); e2e specs run traffic-off by default, check no spec sees an unrequested pirate.

## Sources

### Primary (HIGH)
- Oolite checkout `/home/opencode/git/oolite`, pin `7437f22`: `Resources/Scripts/{oolite-populator,oolite-priorityai,oolite-global-prefix}.js`, `Resources/AIs/oolite-*AI.js`, `Resources/Config/{shipdata,autoAImap,role-categories,descriptions,equipment,planetinfo}.plist`, `src/Core/Universe.{h,m}`, `src/Core/Entities/{ShipEntity,PlayerEntity,StationEntity,PlayerEntityContracts}.m`, `src/Core/OOConstToString.m`.
- Wegolite tree at `df4d01b0`: `.planning/PROJECT.md`, `AGENTS.md`, `src/sim/*`, `src/content`, `src/persistence/save.ts`, `tools/{oolite-ingest,ai-harness,oolite-reference}`, `tests/{guards,acceptance,oracles}`, the pending todos cited in PITFALLS.md.

### Secondary (MEDIUM)
- Scratch runs of the real populator script over galaxy-0 governments, regex reachability count over the priority library, `like_ship` resolver for the 28 keys (not committed; the recorders re-derive them); derived counts and odds in FEATURES.md R1.4 and R2.3.

### Tertiary (LOW)
- Real-Oolite census feasibility and equality of AppImage scripts with the checkout; both need a boxed spike.

---
*Research completed: 2026-11-25*
*Ready for roadmap: yes (blocking owner answers: D1, D5)*
