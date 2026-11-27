---
created: 2026-11-27T00:00:00.000Z
title: Enforce the type-assertion and behaviour-test rules with lint, not only with skills
source: Phase 22.1 execution, owner decision 2026-11-27 (skill-use audit)
area: tooling
severity: minor
files:
  - eslint.config.js
  - src/content/dock-port.ts
  - tests/content/ships-static-hulls.test.ts
---

## Problem

GSD executors now read the four forced rule skills (`typescript-best-practices`,
`principle-type-system-discipline`, `principle-boundary-discipline`,
`principle-test-behavior-not-implementation`) before they write code; a local skill-gate hook makes
`gsd-executor` and `gsd-code-fixer` read them. A read-only audit of Phase 22.1 plans 07 and 09
(rules read first, 2,468 added lines) against plan 05 (code written before reading, 376 lines) found
no evidence that reading changed the code: 5 clear violations in group A, 0 in the much smaller
group B. The agents copy neighbouring code, and the repository already holds the opposite pattern
(203 `as` casts in `src`, more than 200 `as unknown as` in `tests`).

Clear examples from the audit:

- `src/content/dock-port.ts:113`: `Object.fromEntries(entries) as Record<StationKind, DockPort>` in
  shipped code, where a typed construction over `STATION_KINDS` would do.
- `tests/sim/world/populate.test.ts:892-893`: `tight as System` right after
  `expect(tight).toBeDefined()`, a non-null assertion in disguise.
- `tests/content/ships-static-hulls.test.ts:718-730`: the test reads `station-install.ts` as text and
  asserts the position and count of `load(kind)`, so a harmless refactor breaks it and no player can
  observe what it checks.
- About 20 `JSON.parse(...) as X[]` casts in the new app-session tests, while the same commits parse
  the same data with `StaticHullArtifactSchema.parse` elsewhere.

## Solution

Make the rules mechanical where they can be, so they hold whatever the agent read:

1. Enable `@typescript-eslint/consistent-type-assertions` for `src/` (for example
   `assertionStyle: "as"` with `objectLiteralTypeAssertions: "never"`, or `"never"` with a reviewed
   allow-list), triage the 203 existing casts (fix or mark with a reasoned disable comment), and
   decide separately whether `tests/` follows.
2. Prefer schema parsing over `JSON.parse(...) as T` in tests: a lint rule
   (`no-restricted-syntax` on `TSAsExpression` whose expression is a `JSON.parse` call) or a shared
   helper.
3. Ban tests that read production source as text to assert its shape, except the existing guard
   tests that exist for that purpose (`tests/guards/**`): either a lint rule on `readFileSync` of
   `src/**` outside `tests/guards`, or a guard test listing the allowed scanners.
4. Rerun the audit on the next phase to see whether violations drop.

Not urgent: Phase 22.1 is not held for it. Run as a `/gsd-quick` after the phase.
