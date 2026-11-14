---
phase: "13"
slug: views-lasers-and-shields
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-14"
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `13-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (Node project `unit`), fast-check 4.10.2, Playwright 1.64.1 |
| **Config file** | `vitest.config.ts` (coverage floors: `src/sim/**` lines 93, statements 91, functions 97, branches 86; `src/persistence/**` lines 88; `src/content/**` lines 66) |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test` (then `lint`, `typecheck`; `verify` for browser-facing changes) |
| **Estimated runtime** | slow machine; targeted runs preferred |

---

## Sampling Rate

- **After every task commit:** targeted `vitest run` of the touched files, plus `lint` and `typecheck` for pure `src/sim` work
- **After every plan wave:** `docker compose run --rm test` (coverage floors apply), `lint`, `typecheck`, `assets:check` when content changed
- **Before `/gsd-verify-work`:** full suite green; `verify` green (browser-facing code is touched); `verify-full` only per the owner's recorded decision
- **Max feedback latency:** one targeted Vitest file per task

---

## Per-Task Verification Map

Filled by the planner per task; the requirement-to-test map is in `13-RESEARCH.md` § Validation Architecture (FOUND-17, INPUT-01, CBT-04, CBT-05, CBT-06, CBT-07, DOCK-10, determinism, opt-in smoke).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-XX-XX | — | — | see research map | — | — | unit / scenario | `docker compose run --rm test npx vitest run <file>` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sim/combat/{constants,weapons,shields,octree,hit,dock-reset}.test.ts` — new
- [ ] `tests/content/hulls.test.ts` and `tests/golden/content/hulls.json` — new artifact and golden
- [ ] `tests/persistence/save-v4.test.ts`, goldens `tests/golden/save/v4-from-v3-*.json`
- [ ] `tests/e2e/combat.spec.ts` — opt-in smoke, traffic off by default
- [ ] regenerate `tests/golden/world/inert-lave-epoch1.json` and the NPC record golden once, deliberately; never `flight-hash-pins.json`
- [ ] update pinned tests: `tests/sim/world/control.test.ts`, `tests/e2e/probe-shape.spec.ts`, `tests/ui/hud-model.test.ts`, `tests/contract/fidelity.test.ts`

---

## Manual-Only Verifications

All phase behaviors have automated verification (at least 90 % Vitest scenarios; one opt-in browser smoke).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
