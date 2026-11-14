---
phase: 12-inert-ships-and-the-world-lifecycle
review: 12-REVIEW.md
recorded: 2026-11-14
---

# Phase 12 code review disposition

Review result: 0 Critical, 1 Warning, 4 Info. Every finding starts as `open`; the owner decides what is fixed.

| ID | Severity | Finding | Disposition |
|----|----------|---------|-------------|
| WR-01 | Warning | A refused `begin()` at a hyperspace arrival (epoch >= 0xfffffffe or a non-finite seed) leaves the origin world installed; the origin ships then mass-lock and block in the destination system (WORLD-14). Fix: call `worldLifecycle.end()` before `begin()` in `src/app/session/hyperspace-controller.ts`, or make `begin` clear the world and anchor on every refusal. | open |
| IN-01 | Info | A running torus drive stopped by mass lock prints "Torus disengaged" (`event-router.ts`); Oolite prints "Hyperspeed mass-locked." for that case too (`PlayerEntity.m:2755-2758`). CHANGELOG wording to adjust. | open |
| IN-02 | Info | `aiFaulted` is emitted but nothing consumes or logs it; latent until real AI modules exist. | open |
| IN-03 | Info | The "`spawnEntity` never throws" doc is false for an `init` with a throwing accessor; no real caller can produce one. | open |
| IN-04 | Info | A failed NPC model is never retried, but the ship still mass-locks, blocks jumps and shows on the scanner (invisible obstacle). | open |
