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

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| DATA-10 | Nine GLBs emitted and parse; counts, normals and bounds match | unit | `npx vitest run tools/oolite-ingest/convert/glb.test.ts` | extend (W0) | ⬜ pending |
| DATA-10 | Texture closure both directions for 54 names; profiles hold | unit | `npx vitest run tools/oolite-ingest/convert/textures.test.ts tools/oolite-ingest/convert/texture-encode.test.ts` | update literal 21 | ⬜ pending |
| DATA-10 | One `ASSETS.md` row per file; `CHECKSUMS.sha256` agrees | unit | `npx vitest run tests/compliance-assets.test.ts` | ✅ | ⬜ pending |
| DATA-10 | No drift; NPC GLB regenerates byte-identical | content gate | `docker compose run --rm assets npm run assets:check` | ✅ | ⬜ pending |
| DATA-10 | No forbidden asset class (pod, missile, capsule, wreckage, asteroid, audio) | unit | `npx vitest run tools/oolite-ingest/convert/npc-ships.test.ts` | ❌ W0 | ⬜ pending |
| DATA-11 stage 1 | Records equal hand-written golden; exactly six fields; `like_ship` resolved | unit/golden | `npx vitest run tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts` | ❌ W0 | ⬜ pending |
| DATA-13 | Cold start fetches no NPC GLB or texture; transfer under 9,437,184 B | e2e | `budget.spec.ts` (extend) | extend | ⬜ pending |
| DATA-13 | Each NPC GLB fetchable; images decode | e2e | `tests/e2e/npc-assets.spec.ts` | ❌ W0 | ⬜ pending |
| DATA-13 | `loadNpcModel` lazy, memoised, disposed; `preload()` unchanged | unit | `npx vitest run tests/app/asset-cache-npc.test.ts` | ❌ W0 | ⬜ pending |

All `npx vitest run ...` commands are prefixed with `docker compose run --rm test`.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tools/oolite-ingest/convert/npc-ships.test.ts` — DATA-10 forbidden classes, DATA-11 golden, field set, `like_ship`
- [ ] `tests/golden/content/ships-npc.json` — hand-written worked examples (never generated)
- [ ] `tests/content/ships-npc.test.ts` — loader and boundary
- [ ] `tests/app/asset-cache-npc.test.ts` — lazy load and dispose with an injected loader
- [ ] `tests/e2e/npc-assets.spec.ts` — on-demand fetch and image decode
- [ ] Extend `glb.test.ts` with a table-driven block over the nine NPC GLBs
- [ ] Update `ships.test.ts` counts, `tests/golden/content/ships.json` and the `textures.test.ts` literal 21

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
