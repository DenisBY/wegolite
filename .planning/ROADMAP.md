# Roadmap: Wegolite

## Milestones

- ✅ **v1.0 Wegolite v1 Core Loop** — Phases 1-7 (shipped 2026-11-08 as `v0.1.0`; archived 2026-11-10)
  - Full phase details: [.planning/milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
  - Requirements: [.planning/milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md)
  - Open at archive: QUAL-01 (60 fps evidence on the reference desktop), deferred by the owner on 2026-11-08 and again on 2026-11-13; it stays with the unscheduled performance phase (former Phase 23, see "Later (unscheduled)")
- ✅ **v2.0 Foundation** — Phase 8 (shipped 2026-11-13; no release tag, the latest release is `v0.3.0`)
  - Full phase details: [.planning/milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md) (also holds the former Phases 9-23 plan)
  - Requirements: [.planning/milestones/v2.0-REQUIREMENTS.md](milestones/v2.0-REQUIREMENTS.md) (also holds the 55 requirements of the former v2.1 Combat & Traffic plan and their phase mapping)
  - Open at archive: review WR-01 (contain a throwing AI module; now FOUND-15 in Phase 12); e2e flakes under load (D-2)
- ✅ **v2.1 World Population Base** — Phases 9-12 (shipped 2026-11-14; no release tag, the latest release is `v0.3.0`)
  - Full phase details: [.planning/milestones/v2.1-ROADMAP.md](milestones/v2.1-ROADMAP.md)
  - Requirements: [.planning/milestones/v2.1-REQUIREMENTS.md](milestones/v2.1-REQUIREMENTS.md)
  - Audit: [.planning/milestones/v2.1-MILESTONE-AUDIT.md](milestones/v2.1-MILESTONE-AUDIT.md) (tech_debt: 12/12 requirements, no blockers)
  - Open at archive: review WR-01 (a refused `begin()` at arrival leaves the origin world installed; now FOUND-17 in Phase 13), buoys not yet blocking hyperspace, the deferred real-Oolite mass check; all three are todos
- ✅ **v2.2 Weapons and NPC Flight** — Phases 13-14 (shipped 2026-11-16; no release tag, the latest release is `v0.3.0`)
  - Full phase details: [.planning/milestones/v2.2-ROADMAP.md](milestones/v2.2-ROADMAP.md)
  - Requirements: [.planning/milestones/v2.2-REQUIREMENTS.md](milestones/v2.2-REQUIREMENTS.md)
  - Audit: [.planning/milestones/v2.2-MILESTONE-AUDIT.md](milestones/v2.2-MILESTONE-AUDIT.md) (tech_debt: 10/10 requirements, no blockers)
  - Open at archive: lasers and ident do not yet hit stations or buoys (now CBT-17 in Phase 18); Phase 14 review follow-ups (acceptance run in no gate, frozen-detector blind spot, `dt` coupling), all todos
- ✅ **v2.3 Combat and Death** — Phases 15-20 (shipped 2026-11-24; released as `v0.8.0`, tagged 2026-11-24, the latest release; the quick tasks since it sit under `[Unreleased]`)
  - Full phase details: [.planning/milestones/v2.3-ROADMAP.md](milestones/v2.3-ROADMAP.md)
  - Requirements: [.planning/milestones/v2.3-REQUIREMENTS.md](milestones/v2.3-REQUIREMENTS.md)
  - Audit: [.planning/milestones/v2.3-MILESTONE-AUDIT.md](milestones/v2.3-MILESTONE-AUDIT.md) (tech_debt: 16/16 requirements, no blockers)
  - Open at archive: the docked F-key bug from the Phase 19 UAT (major, undiagnosed) and the F6 toggle bug; review warnings of Phases 18 and 20; recorded Oolite divergences of Phases 18 and 19; all todos

## Phases

<details>
<summary>✅ v1.0 Wegolite v1 Core Loop (Phases 1-7) — SHIPPED 2026-11-08, ARCHIVED 2026-11-10</summary>

- [x] Phase 1: Foundation, Containers & Compliance (7/7 plans) — completed 2026-11-02
- [x] Phase 2: Data Pipeline & Content Compiler (9/9 plans) — completed 2026-11-03
- [x] Phase 3: Flight in the Lave System (14/14 plans) — completed 2026-11-04
- [x] Phase 4: Manual Docking (8/8 plans) — completed 2026-11-05
- [x] Phase 5: Docked Economy & Station Screens (6/6 plans) — completed 2026-11-06
- [x] Phase 6: Hyperspace, Navigation & Persistence (17/17 plans) — completed 2026-11-07
- [x] Phase 7: Hardening & Community Release (12/12 plans) — completed 2026-11-08; QUAL-01 deferred by the owner

Total: 73 of 73 plans complete. Phase directories now live in `.planning/milestones/v1.0-phases/`.

</details>

<details>
<summary>✅ v2.0 Foundation (Phase 8) — SHIPPED 2026-11-13</summary>

- [x] Phase 8: Session Split and World Core (16/16 plans) — completed 2026-11-13; v1 play unchanged on a multi-entity world (stable ids, seeded streams, a world hash, the typed AI seam and a tick-stepping test hook)

Scope: narrowed on 2026-11-13 from Phases 8-23 to Phase 8 alone (PROJECT.md Key Decisions). Requirements FOUND-10 to FOUND-14, 5/5 complete. The AI seam, the snapshot codec and the reserved events are provisional until later phases exercise them; Phase 12 is the first. Phase directory now lives in `.planning/milestones/v2.0-phases/`.

</details>

<details>
<summary>✅ v2.1 World Population Base (Phases 9-12) — SHIPPED 2026-11-14</summary>

- [x] Phase 9: NPC Content (5/5 plans) — completed 2026-11-14
- [x] Phase 10: Ship Mass (4/4 plans) — completed 2026-11-14
- [x] Phase 11: Minimal Save Schema v3 (4/4 plans) — completed 2026-11-14
- [x] Phase 12: Inert Ships and the World Lifecycle (14/14 plans) — completed 2026-11-14

Total: 27 of 27 plans complete. Requirements 12/12. Phase directories now live in `.planning/milestones/v2.1-phases/`.

</details>

<details>
<summary>✅ v2.2 Weapons and NPC Flight (Phases 13-14) — SHIPPED 2026-11-16</summary>

- [x] Phase 13: Views, Lasers and Shields (16/16 plans) — completed 2026-11-15
- [x] Phase 14: NPC Flight and Steering Fidelity Gate (19/19 plans) — completed 2026-11-16

Total: 35 of 35 plans complete. Requirements 10/10. Phase directories now live in `.planning/milestones/v2.2-phases/`.

</details>

<details>
<summary>✅ v2.3 Combat and Death (Phases 15-20) — SHIPPED 2026-11-24</summary>

- [x] Phase 15: Damage Ledger and Kills (6/6 plans) — completed 2026-11-16
- [x] Phase 16: Wreckage, Cargo and the Entity Cap (9/9 plans) — completed 2026-11-17
- [x] Phase 17: NPC Fire and Hits on the Player (13/13 plans) — completed 2026-11-19
- [x] Phase 18: Stations, Buoys and Collisions (22/22 plans) — completed 2026-11-20
- [x] Phase 19: Equipment Damage and Repair (15/15 plans) — completed 2026-11-22
- [x] Phase 20: Player Death and Game Over (13/13 plans) — completed 2026-11-24

Total: 78 of 78 plans complete. Requirements 16/16. Phase directories now live in `.planning/milestones/v2.3-phases/`.

</details>

## Later (unscheduled)

The former plan's labels (Phases 15-23 of the v2.1 Combat & Traffic plan) are history only: v2.3 reused the numbers 15-20 for its own phases. v2.3 takes destruction and player death from the former Phase 15 and the NPC fire gate from the former CBT-15 as an engine capability. Still unscheduled, in no particular order, and given fresh phase numbers when their milestone starts: hazards (sun, planet, heat and alert condition: DEATH-03, DEATH-05, DOCK-08) and docking-slot scrape damage (DOCK-09); bounties, salvage, scooping and the escape pod; audio and music; priority AI, peaceful traffic and the station queue; police, legal status and fines; pirates, hunters and rescue; missiles, ECM and defensive equipment; full traffic, asteroids and mining; performance hardening with traffic and QUAL-01. Their phase details stay in `.planning/milestones/v2.0-ROADMAP.md`, and their requirements, with IDs and the former phase mapping, in `.planning/milestones/v2.0-REQUIREMENTS.md`. When their milestone starts, the milestone workflow re-states them and re-checks them against what Phases 9-20 proved. AI-12 (collect, tractored, mining and land on planet, split from AI-01 in v2.2) stays deferred with them. The deferred requirement IDs are listed under v2 Requirements in `.planning/milestones/v2.3-REQUIREMENTS.md` (the live REQUIREMENTS.md is recreated by the next milestone).

Pending todos (37 in `.planning/todos/pending` on 2026-11-24; 39 were acknowledged at the v2.3 close and listed in STATE.md Deferred Items) can run as quick tasks or join a phase by owner decision. The docked F-key bugs (`2026-11-22-bug-docked-f-keys-unreliable.md`, `2026-11-22-bug-f6-toggles-back-to-previous-screen.md`, now in `.planning/todos/completed`) were fixed by debug session docked-f-keys and released in `v0.8.0`.

## Progress

**Execution order:** the next milestone continues from Phase 21.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 8. Session Split and World Core | v2.0 | 16/16 | Complete | 2026-11-13 |
| 9. NPC Content | v2.1 | 5/5 | Complete    | 2026-11-14 |
| 10. Ship Mass | v2.1 | 4/4 | Complete    | 2026-11-14 |
| 11. Minimal Save Schema v3 | v2.1 | 4/4 | Complete    | 2026-11-14 |
| 12. Inert Ships and the World Lifecycle | v2.1 | 14/14 | Complete    | 2026-11-14 |
| 13. Views, Lasers and Shields | v2.2 | 16/16 | Complete    | 2026-11-15 |
| 14. NPC Flight and Steering Fidelity Gate | v2.2 | 19/19 | Complete    | 2026-11-16 |
| 15. Damage Ledger and Kills | v2.3 | 6/6 | Complete    | 2026-11-16 |
| 16. Wreckage, Cargo and the Entity Cap | v2.3 | 9/9 | Complete    | 2026-11-17 |
| 17. NPC Fire and Hits on the Player | v2.3 | 13/13 | Complete    | 2026-11-19 |
| 18. Stations, Buoys and Collisions | v2.3 | 22/22 | Complete    | 2026-11-20 |
| 19. Equipment Damage and Repair | v2.3 | 15/15 | Complete    | 2026-11-22 |
| 20. Player Death and Game Over | v2.3 | 13/13 | Complete    | 2026-11-24 |

## Backlog

### Phase 999.1: Narrow renderer interface and WebGPU migration estimate (BACKLOG)

**Goal:** Reduce the cost of a possible future move from `THREE.WebGLRenderer` (WebGL2) to `THREE.WebGPURenderer` (WebGPU with its built-in WebGL2 fallback) without migrating anything now. Two parts, both to be scheduled after Phase 8 so they do not collide with the `game-session.ts` split:

1. Type the renderer through a narrow interface (`render`, `setSize`, `info`, plus whatever the probe memory read needs) instead of `THREE.WebGLRenderer`. Current direct uses: `src/app/boot.ts`, `src/app/scene-manager.ts`, `src/app/game-session.ts`, `src/app/probe.ts` (`readMemory`), `src/render/exposure.ts`, and after the split `src/app/session/render-driver.ts`, `probe-publisher.ts`, `context.ts`.
2. Estimate the real migration scope before any decision. Custom GLSL today: `src/render/shaders/planet.glsl.ts`, `src/render/bodies/planet.ts`, `atmosphere.ts` and `nebulae.ts` (`ShaderMaterial` / `onBeforeCompile`). `WebGPURenderer` does not accept GLSL, so each needs a TSL (or WGSL) port. The Playwright probes and WebGL memory counters would also need a backend-neutral path. Optional spike: a throwaway branch with `WebGPURenderer` for one effect only.

**Requirements:** TBD
**Plans:** 0 plans

Constraints and notes:
- The stack decision (Three.js, WebGL2) stays in force; adopting `WebGPURenderer` needs an explicit Key Decisions row in `.planning/PROJECT.md` first.
- Three.js is at 0.187.0. `WebGLRenderer` is WebGL2 only; only `WebGPURenderer` selects a backend (WebGPU, else WebGL2, or `forceWebGL: true`).

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
