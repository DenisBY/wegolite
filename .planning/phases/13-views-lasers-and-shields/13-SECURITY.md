---
phase: "13"
slug: views-lasers-and-shields
status: verified
threats_open: 0
asvs_level: 1
created: "2026-11-15"
---

# Phase 13 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Save blob (IndexedDB) to profile | Untrusted JSON parsed at boot and Load; schema v4 adds `laserMounts` | Laser mount keys, equipment keys, credits |
| Settings blob (localStorage) to bindings | Untrusted JSON; legacy bindings migrated by exact match | Key codes |
| Content artifacts to the sim | Build-time generated hull octrees and NPC combat fields loaded as JSON | Octree nodes, energy and weapon fields |
| World snapshot codec | Snapshot version 2 with energy fields; no app-side caller | Entity energy, recharge rate |
| Input to the sim | Commands (`setView`, fire) built from key events | View facing, fire edge |
| `?test=1` hook to the session | Test-only mutations that taint the session so nothing is saved | Position, credits, a test shooter |
| Sim to renderer and probe | Events and snapshots; entity ids must not leave `src/sim` | Positions, laser kind, id-free ident target |

---

## Threat Register

Thirty numbered threats (T-13-01 to T-13-30) plus T-13-SC, which repeats in every plan. All are medium or low severity, so none could block at `block_on: high`. Evidence is file:line in the auditor's report of 2026-11-15; the audit trail below records the run.

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-13-01 | Tampering | world-lifecycle `begin` refusal with a tampered epoch | medium | mitigate | `world-lifecycle.ts:164-175` clears the world and anchor on refusal | closed |
| T-13-02 | Tampering | `migrateLegacyBindings` | low | mitigate | `settings/schema.ts:284-316` rewrites exact legacy values only | closed |
| T-13-03 | Tampering | `setView` payload | low | mitigate | Closed `Facing` union, `isFacing` re-check in `combat/step.ts:139` | closed |
| T-13-04 | Tampering | `isHitByLine` / `firstShipHit` with NaN or Infinity | medium | mitigate | Finite checks in `combat/hit.ts` and `octree.ts` | closed |
| T-13-05 | Denial of service | octree recursion depth | medium | mitigate | `MAX_OCTREE_DEPTH = 7` in `octree.ts` | closed |
| T-13-06 | Denial of service | hull schema on a huge or deep tree | medium | mitigate | Iterative walker, depth 7, 16,384 nodes per hull, 16 hulls, size gate, `safeParse` | closed |
| T-13-07 | Tampering | hull record shape | low | mitigate | `z.strictObject`, positive finite numbers, node values 0, -1 or eight children | closed |
| T-13-08 | Repudiation | provenance of the derived hull file | low | mitigate | NOTICE paragraph, inputs only under `third_party/oolite`, manifest drift gate | closed |
| T-13-09 | Tampering | `routeDamage` and combat fields | medium | mitigate | `shields.ts` non-finite guard, `sanitizeCombat`, `canon` throws on non-finite | closed |
| T-13-10 | Tampering | forged `laserMounts` | medium | mitigate | `MountKeySchema` enum, strict objects, semantic `isMountKey` stage | closed |
| T-13-11 | Tampering | laser key smuggled into `equipment` | medium | mitigate | `FORBIDDEN_EQUIPMENT` in read and write mode | closed |
| T-13-12 | Denial of service | oversized v4 blob | low | mitigate | `MAX_SAVE_CHARS` checked before `JSON.parse`; worst-case test | closed |
| T-13-13 | Tampering | snapshot energy fields | medium | mitigate | Version 2 check, unknown keys rejected, bounded fields | closed |
| T-13-14 | Tampering | NaN energy reaching `canon` | medium | mitigate | `sanitize.ts` repair; `spawnEntity` refuses out-of-domain energy | closed |
| T-13-15 | Tampering | non-finite hit amount or energy | medium | mitigate | Damage queued only when finite and positive; energy floored at 0 | closed |
| T-13-16 | Tampering | forged `setView` payload | low | mitigate | Membership-based `isFacing` | closed |
| T-13-17 | Tampering | order-dependent damage | medium | mitigate | Shots sorted by shooter; hits queued then applied | closed |
| T-13-18 | Elevation of privilege | composite F3 laser key | medium | mitigate | `parseLaserFitKey`, `checkLaserFit`, re-check in `confirmLaserFit` | closed |
| T-13-19 | Tampering | credit arithmetic on purchase and refund | medium | mitigate | Cost check before mutation, safe-integer result check | closed |
| T-13-20 | Spoofing | `ShipControl.fire` for another actor | medium | mitigate | `actor(id)` guard in `control-impl.ts` | closed |
| T-13-21 | Denial of service | fire-queue flooding | low | mitigate | One entry per actor, bounded, cleared each resolve | closed |
| T-13-22 | Information disclosure | stale ident id across worlds | medium | mitigate | Id only in sim state; cleared at dock and jump; entity-id guard | closed |
| T-13-23 | Denial of service | hull chunk load failure | low | mitigate | Same `Promise.all` and failure surface as the NPC catalogue | closed |
| T-13-24 | Tampering | forged mounts reaching the sim | low | mitigate | Mounts come from the strict-parsed profile; no command carries mounts | closed |
| T-13-25 | Denial of service | message-line flood | low | mitigate | One message per kind per simulated second | closed |
| T-13-26 | Denial of service | non-finite projection or shot coordinates | low | mitigate | Null projection, skipped segments, fixed pool of 32 | closed (note below) |
| T-13-27 | Elevation of privilege | `spawnTestShooter` making test state durable | medium | mitigate | Hook is exactly `test=1`; every mutation taints; both save paths refuse tainted sessions | closed |
| T-13-28 | Information disclosure | probe exposing entity ids | low | mitigate | `probe.combat` is values only; `identLocked` is a boolean | closed |
| T-13-29 | Tampering | NPC record combat fields | low | mitigate | Strict schema, closed weapon enum, finite non-negative numbers | closed |
| T-13-30 | Tampering | ident acquisition with bad positions or a removed target | low | mitigate | `isValidTarget` and strict comparisons; invalid target dropped with `identLost` | closed |
| T-13-SC | Tampering | npm/pip/cargo installs (every plan) | low | accept | No dependency manifest changed since the phase context commit | closed (accepted) |

*Status: open · closed · open — below block_on threshold (non-blocking)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-13-01 | T-13-SC | No package was installed in any phase 13 plan; verified with `git log 2cd83b6..HEAD -- package.json package-lock.json`, which is empty | plan threat models (accept) | 2026-11-15 |

---

## Unregistered Flags and Notes

Non-blocking; none is an open threat.

1. Commit 382c5c1 (Ctrl chords): bound flight keys now pass while only Ctrl is held and are `preventDefault`ed. Text targets return first, Meta and Alt chords stay with the browser, and the chord applies only in the flight context to a bound code. Residual: a user-rebound Ctrl+R in flight is swallowed (a usability matter).
2. Player shots ride with the ship (`laser-shots.ts`): the new anchor check in `add()` covers the position and the quaternion `w` only, and `update()` applies the player pose without a finite check. A non-finite pose would draw one bad line and cannot throw; the player pose is sanitised in the sim. Optional hardening: a full quaternion and pose finite check.
3. The 200,000-byte hull size gate is enforced by a unit test; at runtime the artifact is bounded by the schema.
4. The world snapshot codec has no app-side caller, and combat state is not persisted, so no untrusted snapshot or combat field enters from persistence.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-15 | 31 | 31 | 0 | gsd-security-auditor (11 related test files, 533 tests, passed in Docker) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-15
