# Phase 7: Hardening & Community Release - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 07-hardening-community-release
**Areas discussed:** Publication & hosting, Browser scope, Performance proof, Recovery & test seams, Phase 6 debt

Questions were asked in Russian at the owner's request; the decisions and this log are in English.

---

## Publication & hosting

| Option | Description | Selected |
|--------|-------------|----------|
| Publish main after audit | Push local main to DenisBY/wegolite after licence audit | ✓ |
| Separate source-only repo | Second repo with sources, referenced from NOTICE | |
| Defer publication | Release without a working source link | |

**User's choice:** Publish main after audit
**Notes:** Owner also asked for an explanation of CSP delivery (meta tag vs HTTP header). After the explanation: meta tag now, header later when the host is chosen. Release title: "Wegolite 0.1.0" (from package.json).

---

## Browser scope

| Option | Description | Selected |
|--------|-------------|----------|
| WebKit in CI + manual macOS smoke | Safari claimed with a real check | |
| WebKit in CI only | Safari claimed without manual check | |
| Remove Safari from claim | Claim Chrome and Firefox only | ✓ (confirmed) |

**User's choice:** Remove Safari from claim. Minimum versions: "current stable Chrome/Firefox and two latest Safari" was first chosen, then clarified to "Chrome and Firefox only" after the contradiction was pointed out.
**Notes:** Cross-browser gate placement: separate service `e2e-cross` plus a documented command (verify stays Chromium-only).

---

## Performance proof

| Option | Description | Selected |
|--------|-------------|----------|
| Container budgets + manual reference-machine run | Two-part proof | ✓ |
| Container budgets only | No real GPU evidence | |

**User's choice:** Container budgets + manual reference-machine run.
**Notes:** Planet shader question: owner asked for an explanation first. Explained the three paths (measure first; cheap fix that changes the look; shader rewrite that changes the look). Owner chose: measure first, do not change the look. Texture compression (KTX2/Meshopt): deferred, measure load time first. Reference machine: the owner's current desktop; specification to be supplied later.

---

## Recovery & test seams

| Option | Description | Selected |
|--------|-------------|----------|
| Recreate resources, stay paused | Recovery after WebGL context loss | ✓ |
| Show failure immediately | No recovery path | |
| Network: other origins forbidden, same-origin allowed | QUAL-08 interpretation | ✓ |
| WR-04 seam: constructor option, test-only | No URL-reachable failure injection | ✓ |
| Restore timeout | 10 s | ✓ |

**User's choice:** as listed above.
**Notes:** Restore timeout set to 10 s by the owner.

---

## Phase 6 debt

| Option | Description | Selected |
|--------|-------------|----------|
| Fix WR-05 and IN-06 in Phase 7 | | |
| Remove WR-05, defer IN-06 | | |
| Defer all Phase 6 debt, including visual debt | | ✓ |

**User's choice:** Defer all Phase 6 debt. Visual UI debt: defer entirely.

---

## Claude's Discretion

- D-19 coverage thresholds: baseline-derived, `@vitest/coverage-v8` after owner human check.
- D-20 IndexedDB testing: browser e2e only.
- D-21 journey fixture: IndexedDB fixtures, no `?test=1` at save steps.
- D-22 FIDELITY excerpts: short quoted Oolite `.m` excerpts with line references, recorded in ASSETS.md.

These were not discussed by the owner; recommended defaults were recorded as Claude's decisions.

## Deferred Ideas

- Safari support (needs a real macOS run) — future phase.
- KTX2 / Meshopt texture compression — unless the load budget fails.
- Phase 6 WR-05, IN-06, visual debt — deferred entirely.
- Host-level CSP header — when a host is chosen.
- Planet look or shader change — only after a new owner decision.
