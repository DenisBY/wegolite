# Performance

This document records the frame budget Wegolite is held to, what the container measures against it, and the manual reference-desktop run that is the only evidence for a frame rate. It answers QUAL-01 and follows decisions D-10 to D-14 in `.planning/phases/07-hardening-community-release/07-CONTEXT.md`.

## Budget

Each rendered frame must stay inside these limits. Each row names the gate that enforces it.

| Quantity                      | Budget          | Source                                   | Enforced by                                                 |
| ----------------------------- | --------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Draw calls per rendered frame | at most 50      | STACK.md lines 442-443 (research target) | `tests/e2e/budget.spec.ts` (`DRAW_CALL_BUDGET`)             |
| Triangles per rendered frame  | at most 250 000 | STACK.md lines 442-443 (research target) | `tests/e2e/budget.spec.ts` (`TRIANGLE_BUDGET`)              |
| Planet noise evaluations      | at most 9       | `BUDGET_CEILING` (D-12, unchanged)       | `tests/render/planet-budget.test.ts` (`BUDGET_CEILING = 9`) |

Both draw-call and triangle comparisons are inclusive: 50 calls and 250 000 triangles pass, while 51 calls and 250 001 triangles fail. A scene that reports zero calls or zero triangles also fails, so a blank frame cannot pass the budget.

## Container measurements

These are the per-scene counts from the `budget.spec.ts` annotations, recorded on 2026-11-08 in the containerised build. They are SwiftShader counts of draw calls and triangles per rendered frame. They are not frame rates, and they say nothing about how fast a player's GPU renders these scenes.

| Scene          | Draw calls | Triangles | Recorded   |
| -------------- | ---------- | --------- | ---------- |
| Lave docked    | 9          | 38714     | 2026-11-08 |
| Lave launching | 8          | 3302      | 2026-11-08 |
| Lave in flight | 6          | 38308     | 2026-11-08 |
