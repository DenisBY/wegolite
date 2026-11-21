---
phase: "14"
slug: npc-flight-and-steering-fidelity-gate
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on (high)
threats_open: 0
asvs_level: 1
register_authored_at_plan_time: true
created: "2026-11-16"
---

# Phase 14 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Audit run 2026-11-16 by `gsd-security-auditor` (read-only; ran no tests) over the threat models of plans 14-01 to 14-19, the 19 SUMMARY threat-flag sections and the implementation. Verdict: SECURED.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| oracle trees vs port | `tests/oracles/**` expectations must stay independent of `src/` | fixture JSON, derived expectations |
| content build vs steering | compiled flight constants cross from Oolite plists into the sim | float32 flight fields |
| dev-only AI harness vs app | `tools/ai-harness` (Node `vm` over Oolite JS) must never reach `src/`, `public/` or `dist/` | harness code, markers |
| snapshot / replay vs world | hostile or malformed snapshots carry the `Entity.steer` record | steering state, tracking curve |
| test hook vs real game | `?test=1` flyer spawner must never create durable state | spawned entities, probe |
| acceptance harness vs thresholds | thresholds committed before the port, frozen after | thresholds, detectors |

---

## Threat Register

52 distinct IDs plus the repeated supply-chain row. Severity split: 11 high, 24 medium, 17 low. All `mitigate` except T-14-SC (`accept`). Evidence (file:line) is in the audit report summarised in the trail below.

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-14-01 | Tampering | `tests/oracles/**` expectations | high | mitigate | tolerance rule in `reference.self.test.ts`; only plans 14-01/02/06 touched the tree | closed |
| T-14-02 | Tampering | oracle importing Wegolite code | medium | mitigate | `oracle-independence.test.ts` import allowlist and non-vacuity cases | closed |
| T-14-03 | Tampering | pursuit expectations | high | mitigate | same guard scans recursively; `derive.ts` self-contained | closed |
| T-14-04 | Tampering | contract drift between oracle trees | medium | mitigate | `OracleFileSchema.safeParse` on every file, strict objects | closed |
| T-14-05 | Tampering | malformed flight fields | medium | mitigate | `floatExtra` finite check, strict schema, `assets:check` drift gate (see WR-04) | closed |
| T-14-06 | Tampering | pin bump adds assumed-absent keys | medium | mitigate | `STEERING_ASSUMED_ABSENT_KEYS` build refusal | closed |
| T-14-07 | Elevation of privilege | `vm` running Oolite JS | medium | mitigate | `runInContext` 2000 ms timeout, one context per script, documented not a security boundary (see WR-03) | closed |
| T-14-08 | Tampering | path injection through `OOLITE_SRC` | low | mitigate | fixed relative file list; `:ro` mount is operator convention (partly verified) | closed |
| T-14-09 | Information disclosure | harness reaching the app | high | mitigate | `harness-isolation.test.ts` scans `src/`, `public/`, `index.html`, `vite*.config.ts` | closed |
| T-14-10 | Information disclosure | harness in the bundle | high | mitigate | `check:dist` in `verify`, `verify-full`, Pages build; exit 2 on missing/empty dist | closed |
| T-14-11 | Repudiation | thresholds tuned after results | medium | mitigate | `thresholds.ts` has one commit (b33e72f) before the port | closed |
| T-14-12 | Tampering | hostile snapshot with steering state | medium | mitigate | strict snapshot parser, bounds from `limits.ts`, v3 only | closed |
| T-14-13 | Tampering | NaN steering state reaching the hash | medium | mitigate | `sanitizeEntity` before commit and hash; `spawnEntity` escort-slot domain | closed |
| T-14-14 | Denial of service | `steerShip` throwing or NaN | high | mitigate | totality property, zero guards, sanitise-before-hash, acceptance zero repairs (residual WR-02, IN-04) | closed |
| T-14-15 | Tampering | forged behaviour id through `perform` | low | mitigate | `BEHAVIOUR_IDS.includes` in `control-impl.ts` | closed |
| T-14-16 | Denial of service | NaN from degenerate geometry | medium | mitigate | zero guard, labelled `d_forward` clamp, zero-safe normalise | closed |
| T-14-17 | Denial of service | AI event flood | low | mitigate | queue cap 4096, `aiDropped` counted, `MAX_AI_DROPPED = 0` | closed |
| T-14-18 | Denial of service | steering cost growth | low | mitigate | one steer per AI entity per tick, `MAX_ENTITIES = 256` | closed |
| T-14-19 | Tampering | forged flight row, impossible limits | low | mitigate | `statsFor` / `isUsable` fall back to Oolite defaults; table travels in `StepOptions` (gaps WR-01, WR-02) | closed |
| T-14-20 | Tampering | mutation through `BodyView.radius` | low | mitigate | `view-impl.ts` copies bodies; copy-guarantee tests | closed |
| T-14-21 | Tampering | stale or forged target id | low | mitigate | `target.ts` validity rules; view answers only live ids | closed |
| T-14-22 | Tampering | draw from another stream or global | medium | mitigate | only `ctx.draw` over the actor's combat stream; eslint ban on `Math.random`/`Date.now` in `src/sim`; draw-count check | closed |
| T-14-23 | Tampering | forged accuracy | low | mitigate | accuracy bounded [-5, 10] in limits, sanitiser, snapshot | closed |
| T-14-24 | Elevation of privilege | attack steering firing weapons | medium | mitigate | no `fireQueue` writes in `src/sim/npc`; tests assert `fireQueue` is empty | closed |
| T-14-25 | Denial of service | proximity pass cost | low | mitigate | one pass per tick, early return, bounded by `MAX_ENTITIES` | closed |
| T-14-26 | Tampering | stale leader or alert id | low | mitigate | store lookups, stale alert cleared, no-leader path | closed |
| T-14-27 | Tampering | forged flight-script params | low | mitigate | closed `AI_KEYS`, `isLegalAi`/`isLegalParam`, unknown script goes idle | closed |
| T-14-28 | Elevation of privilege | test pilot reachable in play | medium | mitigate | pilot created only by `test-spawn.ts`; populator test asserts `ai` null | closed |
| T-14-29 | Elevation of privilege | test state made durable | medium | mitigate | hook only on exact `test=1`; `markHookMutation()` before spawn; tainted sessions refuse to save | closed |
| T-14-30 | Information disclosure | probe exposing entity ids | low | mitigate | hook returns boolean only; entity-id scope guard | closed |
| T-14-31 | Repudiation | thresholds or harness edited, seed dropped | medium | mitigate | single commits on frozen files, no post-freeze edits of pilot/spawner | closed |
| T-14-32 | Denial of service | acceptance run cost | low | mitigate | standalone `test:acceptance`, outside `verify`; per-epoch timeout | closed |
| T-14-33 | Repudiation | divergence without record, bad excerpt | medium | mitigate | `fidelity.test.ts` row, length, quote and verbatim checks (verbatim pass documented, not rerun by the audit) | closed |
| T-14-34 | Elevation of privilege | agent or auto-advance chose the oracle | high | mitigate | `checkpoint:decision gate="blocking-human"`, no `auto_select`; see the delegation note below | closed |
| T-14-35 | Repudiation | report claims unproduced results | medium | mitigate | report cites remote snapshot hashes beside results; five figures cross-checked | closed |
| T-14-36 | Tampering | simulation-only pursuit expectation | medium | mitigate | every check re-derived through `derive.ts` | closed |
| T-14-37 | Denial of service | marker also in shipped content | high | mitigate | three harness-only markers; `.map` skipped; markers proven absent from content, `src/`, `public/` | closed |
| T-14-38 | Denial of service | NaN from tracking curve | high | mitigate | strictly decreasing signed ticks, count 0 or 4, sanitiser and parser domain | closed |
| T-14-39 | Tampering | escort refresh writes a non-follower | low | mitigate | writes only live steered followers' `nav.destination` | closed |
| T-14-40 | Tampering | partial spawn leaves untracked ships | low | mitigate | capacity and class validation before spawning; taint first | closed |
| T-14-41 | Repudiation | `crossDtTolerance` chosen after results | medium | mitigate | value committed (ae0f4c9) before the rate grid | closed |
| T-14-42 | Repudiation | run passes without exercising situations | high | mitigate | designed near pass, run minimums, stuck windows, no-AI control (residuals: no head-on closure, WINDOWS.md #3, IN-05) | closed |
| T-14-43 | Tampering | `accepted-crossings.ts` hides crossings | medium | mitigate | frozen empty list, unchanged since b33e72f | closed |
| T-14-44 | Repudiation | harness changed after freeze, self-issued trailer | medium | mitigate | no commit carries the owner-approval trailer | closed |
| T-14-45 | Denial of service | non-decreasing ticks, divide by zero | medium | mitigate | snapshot and sanitiser domain checks | closed |
| T-14-46 | Tampering | ship targets itself | low | mitigate | `setTarget` ignores own id; invalid for steering | closed |
| T-14-47 | Tampering | player radius from lazy hull data | medium | mitigate | `PLAYER_COLLISION_RADIUS_M` passed explicitly, pinned to compiled hull row | closed |
| T-14-48 | Tampering | `tests/oracles/**` expectations (14-06) | high | mitigate | same evidence as T-14-01 | closed |
| T-14-49 | Tampering | oracle importing Wegolite code (14-06) | medium | mitigate | same evidence as T-14-02 | closed |
| T-14-50 | Tampering | stale or forged alert id | low | mitigate | `avoid.ts` clears stale or own-id alert | closed |
| T-14-51 | Repudiation | run passes without exercising situations (14-17) | high | mitigate | same artifacts as T-14-42 | closed |
| T-14-52 | Tampering | `accepted-crossings.ts` hides crossings (14-17) | medium | mitigate | same evidence as T-14-43 | closed |
| T-14-SC | Tampering | npm/pip/cargo installs (19 plans) | low | accept | `package.json` has only two new script entries; lockfile, Dockerfile, `.env.example` unchanged | closed |

*Status: open · closed · open — below high threshold (non-blocking)*

### Note on T-14-34 (read before relying on SECURED)

The register control is present: `14-19-PLAN.md` carries a `checkpoint:decision` with `gate="blocking-human"` and no `auto_select`. The checkpoint answers (plans 14-17 and 14-19) were given by a three-reviewer panel (Fable, Opus, Sonnet) on the owner's delegation, not by the owner reading the run. The auditor could not independently verify the delegation from agent-written text. The delegation is recorded here from the owner's own words in the session of 2026-11-15/16: "can you ask fable instead of me? I don't understand what is going on in 14-19" (translated) and "can you ask several models to be sure" (translated). The panel decisions are reversible (no data, no publication; gaps would become gap-closure plans). The owner can ratify or overturn them; overturning would reopen T-14-34 and block this gate.

### Review findings touching registered mitigations (advisory, open in `14-REVIEW-DISPOSITION.md`)

WR-01 and WR-02 (T-14-14, T-14-19), WR-03 (T-14-07, T-14-08), WR-04 (T-14-05, T-14-19), IN-03 (T-14-10, T-14-37), IN-04 (T-14-14, T-14-17, T-14-32, T-14-42, T-14-51), IN-05 and WINDOWS.md #3 (T-14-31, T-14-42, T-14-51). None leaves a declared mitigation element missing; each is a hardening or evidence-strength item for the owner to triage.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-14-01 | T-14-SC | No new dependency was added by phase 14; the only `package.json` change is two script entries (`check:dist`, `test:acceptance`). Supply-chain risk for installs is accepted as in every plan register. | plan registers (19 plans), recorded by the orchestrator | 2026-11-16 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-16 | 53 (52 IDs + T-14-SC) | 53 | 0 | gsd-security-auditor (ASVS 1, block_on high), written by the orchestrator |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-16 (T-14-34 caveat above: panel decisions on the owner's delegation, ratification by the owner pending)
