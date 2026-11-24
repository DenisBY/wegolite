---
created: 2026-11-19T10:00:00.000Z
title: Harden the shared guard source scanner and slim the fire-decision-source guard
area: tests
severity: minor
files:
  - tests/guards/source-scan.ts
  - tests/guards/fire-decision-source.test.ts
  - .planning/phases/17-npc-fire-and-hits-on-the-player/17-REVIEW.md
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

Phase 17 Sonnet deep review, deferred items:

- WR-03: `withoutComments` in `tests/guards/source-scan.ts` is hand-rolled and treats a regex literal as a
  string; a future `/'/` literal would blind every guard for the rest of that file. Replace with
  `ts.createSourceFile` (typescript is already a devDependency), or at least add a stray-quote regression case.
- WR-05: `tests/guards/fire-decision-source.test.ts` (~387 lines) carries weak rules (the `aiKey:` literal rule,
  the import-specifier parser). Narrowest form: builder-name scan plus "`sim/ai/test-spawn` is imported only by
  probe-publisher.ts", about 120 lines.

Both are test-infrastructure quality only; no production effect.
