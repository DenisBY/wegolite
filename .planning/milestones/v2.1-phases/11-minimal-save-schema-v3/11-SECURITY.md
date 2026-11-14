---
phase: "11"
slug: minimal-save-schema-v3
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-14"
---

# Phase 11 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| world (src/sim) -> session lifecycle (src/app) | Per-world counter leaves the world as a plain number the save layer reads | entity-id counter (number) |
| derivation constants -> persisted saves | The mix32 derivation is one-way once the epoch is persisted | world epoch / seed derivation |
| IndexedDB blob -> parseSave | Untrusted, forged, hand-edited or other-build string enters the strict reader | save blob (JSON string, up to 65,536 chars) |
| live session -> encodeSave | Writer projects lifecycle counters into the bytes that replace the last good save | epoch, nextEntityId |
| parsed save -> world lifecycle | A persisted epoch sets the session world sequence at cold Continue and warm Load | epoch |
| this build's blob -> older build's reader | A v3 save must stay untouched by builds that cannot read it | version-first blob |
| browser IndexedDB -> boot classifier | A blob from a newer build must survive this build untouched | future-version blob |
| project records -> later phases | Phase 12 reads Key Decisions to regenerate the world | decision records |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-11-01 | Tampering | WorldLifecycle.anchorNextEntityId read mid-leg | medium | mitigate | Anchor captured once after populate: `src/app/session/world-lifecycle.ts:169,182`; cleared `:186,:190`; tests `tests/app/session/world-lifecycle.test.ts:506-625` | closed |
| T-11-02 | Information Disclosure | per-world id scope | low | mitigate | Plain-number anchor, no id-module import (`world-lifecycle.ts:62-64`); `tests/guards/entity-id-scope.test.ts:268-280` | closed |
| T-11-03 | Repudiation | silent drift of D-02 world-seed derivation | medium | mitigate | Literals `3545325333` / `0x2b4e037c` pinned in `tests/persistence/save-v3.test.ts:71-78` (commit 9ff46b7) before first v3 writer (bef250e) | closed |
| T-11-04 | Tampering | SaveV3Schema.epoch | medium | mitigate | `src/persistence/save.ts:306` `int().min(0).max(MAX_SAVE_EPOCH)`; edge table `save-v3.test.ts:333-353` | closed |
| T-11-05 | Tampering | SaveV3Schema.nextEntityId | low | mitigate | `save.ts:307-311` bounded int; edges `save-v3.test.ts:355-373`; value never used as an id | closed |
| T-11-06 | Tampering | hybrid v2 / incomplete v3 blob | medium | mitigate | Strict `z.literal(2)` v2 (`save.ts:264-265`), v3 requires both fields (`:303-312`), schema picked by version (`:506-524`); `save-v3.test.ts:375-399` | closed |
| T-11-07 | Repudiation | writer silently writes epoch 0 | medium | mitigate | Required `SaveInputs` fields (`save.ts:374,376`), required `counters` param (`autosave.ts:97`), not-ready without lifecycle (`save-controller.ts:167-169`); tests epoch 1 and 3 | closed |
| T-11-08 | Information Disclosure | world/entity state entering the save | low | mitigate | No entity key in strict schema; `world-lifecycle.test.ts:1295-1402` asserts forbidden keys absent | closed |
| T-11-09 | Denial of Service | oversized blob | medium | mitigate | `MAX_SAVE_CHARS` checked before `JSON.parse` (`save.ts:473,483`), unchanged; writer-bound test `tests/persistence/autosave.test.ts:410-449` | closed |
| T-11-10 | Tampering | lossy/skipping migration | medium | mitigate | Single ordered chain in `parseSave` (`save.ts:511,515`), pure `migrateV2ToV3` (`:440-447`); goldens `tests/persistence/save-golden.test.ts:110-180` | closed |
| T-11-11 | Tampering | warm Load / cold Continue divergence | medium | mitigate | Shared `restoreWorldAnchor` (`world-lifecycle.ts:215-223`) used at `save-controller.ts:447-452` and `start-session.ts:464-471`; parity and source-order tests `world-lifecycle.test.ts:697-727,1095-1228` | closed |
| T-11-12 | Tampering | resetForRestore refusal from valid save | medium | mitigate | Schema bound equals lifecycle domain; `save-v3.test.ts:401-411`; `begin` refuses at `MAX_LIVE_EPOCH` | closed |
| T-11-13 | Denial of Service | older build clearing a v3 save | high | mitigate | `version` written first (`save.ts:754-755`); frozen v2 classifier test `save-v3.test.ts:562-610` | closed |
| T-11-14 | Tampering | corrupt v3 blob read back | medium | mitigate | Only corrupt blobs copied by `backupCorrupt` (`src/main.ts:223-228`), never read back; classification tests `save-v3.test.ts:333-373,481-486` | closed |
| T-11-15 | Denial of Service | worst-case v3 blob over cap | medium | mitigate | D-08 test `save-v3.test.ts:495-628` (38,000 <= length < 65,536, schema valid) | closed |
| T-11-16 | Denial of Service | newer-build blob cleared in browser | high | mitigate | `tests/e2e/autosave.spec.ts:807-904,1036-1076`, `tests/e2e/save-load.spec.ts:486-516,821-832`; ran in verify-full (11-04-SUMMARY) | closed |
| T-11-17 | Repudiation | records disagree with shipped format | low | mitigate | `CHANGELOG.md:23-28`, `.planning/PROJECT.md:223,236,239,247,248`; `tests/contract/fidelity.test.ts:264-274` | closed |
| T-11-18 | Tampering | persistence change shipped without release gate | medium | mitigate | verify-full exited 0 on the final code (HEAD 0bf5dc2, code as of 831ac28, after fixes 4e93fa0 and 6728aa6): 142 Vitest files / 2,725 tests, 129 Chromium specs, 2 seams specs; recorded in `.planning/PROJECT.md` "Phase 11 gate:" | closed |
| T-11-SC | Tampering | npm/pip/cargo installs | low | accept | No phase-11 commit changes package.json / package-lock.json / Docker files | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-11-01 | T-11-SC | No package installed or changed in phase 11 (verified via git diff 8ca6fa5..HEAD); accepted at plan time in all four PLAN threat models | plan threat model | 2026-11-14 |

*Accepted risks do not resurface in future audit runs.*

---

## Informational Notes (no threat ID)

- Stale doc comments after WR-01 (4e93fa0): `src/app/session/world-lifecycle.ts:118-124` and `src/persistence/save.ts:145-146` still say `begin` can bump from 0..0xfffffffe; it is now 0..0xfffffffd.
- Review IN-02: a save at epoch 0xfffffffe restores, but the next launch creates no world; an in-flight save then falls back to nextEntityId 101. The epoch never silently drops to 0.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-14 | 19 | 18 | 1 | gsd-security-auditor (ASVS 1, block_on high, HEAD 831ac28) |
| 2026-11-14 | 19 | 19 | 0 | T-11-18 closed by verify-full on HEAD |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed (blocking threshold: high)
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-14
