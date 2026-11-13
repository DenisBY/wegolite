---
phase: "09"
slug: npc-content
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-13"
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: the `## Validation Architecture` section of `09-RESEARCH.md`. All commands run in Docker only.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (unit, Node) and Playwright 1.64.1 (Chromium) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run tools/oolite-ingest tests/content tests/compliance-assets.test.ts tests/compliance.test.ts` |
| **Full suite command** | `docker compose run --rm test` |
| **Content gate** | `docker compose run --rm assets npm run assets:check` |
| **Browser** | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/budget.spec.ts tests/e2e/npc-assets.spec.ts"` |
| **Estimated runtime** | quick ~60 s; full suite several minutes (slow machine) |

---

## Sampling Rate

- **After every task commit:** quick run command; `lint` and `typecheck` for any TypeScript task.
- **After every plan wave:** `docker compose run --rm test` and `assets:check`.
- **Phase gate:** `docker compose run --rm verify` once at the end, then the targeted `budget.spec.ts` and `npc-assets.spec.ts` run. `verify-full` only on owner request.
- **Max feedback latency:** ~120 s for the quick run.

---

## Per-Task Verification Map

Task IDs reference the plans of this phase (`09-NN-Tn` = plan 09-NN, task n). Test files are created inside the task that first needs them; there is no separate Wave 0 plan.

| Task ID | Req | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|-----|----------|-----------|-------------------|-------------|--------|
| 09-01-T1, 09-01-T2 | DATA-10 | One `ASSETS.md` row per vendored file; `CHECKSUMS.sha256` agrees; no existing vendored byte changed | unit + process | `npx vitest run tests/compliance-assets.test.ts tests/compliance.test.ts`; `git diff --numstat "$PLAN_BASE" -- third_party/oolite/CHECKSUMS.sha256` (42 added, 0 removed) | ✅ | ⬜ pending |
| 09-01-T1, 09-01-T2, 09-01-T3 | DATA-10 | Every vendored NPC file equals the checkout at 7437f22 (owner-confirmed) | manual + script | `sh /tmp/wegolite-09-01/crosscheck.sh` (`checked=42 mismatches=0`), then the T3 `checkpoint:human-verify` | scratch script (T1) | ⬜ pending |
| 09-01-T2, 09-02-T1, 09-03-T1, 09-03-T2, 09-04-T1 | DATA-10 | No drift; every emitted file regenerates byte-identical | content gate | `docker compose run --rm assets npm run assets:check` | ✅ | ⬜ pending |
| 09-02-T1, 09-03-T1 | DATA-10 | Texture closure both directions (23, then 54 names); 19 near-lossless normals, 14 alpha speculars; 16 emissive files equal the GLB emissive URIs | unit | `npx vitest run tools/oolite-ingest/convert/textures.test.ts tools/oolite-ingest/convert/texture-encode.test.ts` | ✅ (literals updated in the task) | ⬜ pending |
| 09-02-T1 | DATA-10 | The refactor leaves cobra3, coriolis and buoy GLBs byte-identical | process | `git diff --quiet "$PLAN_BASE" -- public/models/cobra3.glb public/models/coriolis.glb public/models/buoy.glb` | ✅ | ⬜ pending |
| 09-02-T2 (rows of 09-02-T1 and 09-03-T1) | DATA-10 | Each NPC GLB: committed bytes equal a fresh build, one node, parses with the independent reader, fronts every face, spans MODEL_BOUNDS, image URIs equal the owner's closure; naming rule and row-set invariants | unit | `npx vitest run tools/oolite-ingest/convert/glb.test.ts --reporter=verbose` | extend (09-02-T2) | ⬜ pending |
| 09-02-T1, 09-03-T1 | DATA-10 | One `ASSETS.md` row per public file with SHA-256 and licence (38, then 86 rows) | unit | `npx vitest run tests/compliance-assets.test.ts` | ✅ | ⬜ pending |
| 09-03-T2 | DATA-10 | `modelVendored` derives from MODEL_SOURCE_FILES; 32 usable vendored entries pinned by the golden; ships-client.json unchanged | unit/golden | `npx vitest run tools/oolite-ingest/convert/ships.test.ts tests/content/ships-client.test.ts` | ✅ (golden updated in the task) | ⬜ pending |
| 09-04-T1 | DATA-10 | No forbidden asset class (pod, missile, capsule, wreckage, asteroid, rock hermit roles; no audio file) | unit | `npx vitest run tools/oolite-ingest/convert/npc-ships.test.ts` | ❌ created by 09-04-T1 | ⬜ pending |
| 09-04-T1 | DATA-11 stage 1 | Nine records equal the hand-written golden examples; exactly six fields; `like_ship` resolved; defaults cited; glb owned by the record's key | unit/golden | `npx vitest run tools/oolite-ingest/convert/npc-ships.test.ts` | ❌ created by 09-04-T1 | ⬜ pending |
| 09-04-T2 | DATA-13 | Lazy validated NPC catalogue; nothing on the boot path imports it; sim sees types only | unit + guard | `npx vitest run tests/content/ships-npc.test.ts tests/guards/content-boundary.test.ts` | ❌ created by 09-04-T2 | ⬜ pending |
| 09-05-T1 | DATA-13 | `loadNpcModel` lazy, memoised, guarded, forgets failures, disposed once; `preload()` unchanged | unit | `npx vitest run tests/app/asset-cache-npc.test.ts tests/app/dispose.test.ts` | ❌ created by 09-05-T1 | ⬜ pending |
| 09-05-T2, 09-05-T3 | DATA-13 | Cold start requests no NPC GLB or texture (live-log control); transfer at or under 9,437,184 B | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/budget.spec.ts"` | extend (09-05-T2) | ⬜ pending |
| 09-05-T2, 09-05-T3 | DATA-13 | Each NPC GLB fetchable on demand; every referenced image decodes in Chromium | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/npc-assets.spec.ts"` | ❌ created by 09-05-T2 | ⬜ pending |
| 09-05-T3 | all | Phase gate: verify once, then the targeted browser specs | gate | `docker compose run --rm verify`, then the budget and NPC specs | ✅ | ⬜ pending |

All `npx vitest run ...` commands are prefixed with `docker compose run --rm test`.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tools/oolite-ingest/convert/npc-ships.test.ts` — DATA-10 forbidden classes, DATA-11 golden, field set, `like_ship` (09-04-T1)
- [ ] `tests/golden/content/ships-npc.json` — hand-written worked examples, never generated (09-04-T1)
- [ ] `tests/content/ships-npc.test.ts` — loader, schema refusals and boot-path guard (09-04-T2)
- [ ] `tests/app/asset-cache-npc.test.ts` — lazy load, path guard and dispose with an injected loader (09-05-T1)
- [ ] `tests/e2e/npc-assets.spec.ts` — on-demand fetch and image decode (09-05-T2)
- [ ] Extend `glb.test.ts` with a table-driven block over `NPC_SHIP_GLBS` (09-02-T2; covers 09-03's rows)
- [ ] Update `textures.test.ts` (closure size, `EMISSIVE_FILES`, the emitTextures GLB list) and `texture-encode.test.ts` (lossless and alpha counts) in 09-02-T1 and 09-03-T1
- [ ] Update `ships.test.ts` and `tests/golden/content/ships.json` for the derived `modelVendored` (09-03-T2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vendor script output matches the local Oolite checkout | DATA-10 | The script downloads from the network; AGENTS.md forbids unreviewed network fetches of Oolite files | Run the script, then compare hashes with `/home/opencode/git/oolite`; owner confirms (`checkpoint:human-verify`) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
