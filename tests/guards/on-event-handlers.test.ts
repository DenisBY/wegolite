// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * One `onEvent` handler tripwire (Phase 17, D-12 and D-13.3).
 *
 * Phase 15 criterion 1 has the kill path post `shipTargetLost` to every ship
 * whose target dies, and the one AI module with an `onEvent` handler today,
 * `flight-script`, takes it idempotently. Phase 17 adds no second handler: fire
 * reads its target from `nav`, and the gate and the behaviours refuse a dead or
 * missing target. A second module with an `onEvent` is the first time the
 * broadcast matters, because it could act on a `shipTargetLost` for a ship it
 * was never meant to track. Narrowing the kill-time notification needs the
 * owner's edit to Phase 15 criterion 1; that edit is not made here.
 *
 * The check is a runtime count over `AI_REGISTRY`: how many registered modules
 * define `onEvent`. It fails above one. A legitimate second handler updates
 * `MAX_ON_EVENT_HANDLERS` in the same commit as the narrowing decision.
 */

import { describe, expect, it } from "vitest";

import { AI_REGISTRY } from "../../src/sim/ai/registry.js";

const ON_EVENT_TODO =
  ".planning/todos/pending/2026-11-18-narrow-kill-time-ship-target-lost.md";

/** How many registry modules may define `onEvent`: `flight-script` only. */
const MAX_ON_EVENT_HANDLERS = 1;

const ON_EVENT_RULE = `a second AI module defines onEvent: narrow the kill-time shipTargetLost first (D-12), which needs the owner edit to Phase 15 criterion 1, see ${ON_EVENT_TODO}`;

/** A registry of modules: `think` is required so a module is never a weak type. */
type OnEventRegistry = Readonly<
  Record<string, { readonly think: unknown; readonly onEvent?: unknown }>
>;

/** Registry modules whose `onEvent` is a function. */
function onEventHandlerCount(registry: OnEventRegistry): number {
  return Object.values(registry).filter(
    (module) => typeof module.onEvent === "function",
  ).length;
}

/** The rule's message when `registry` breaks the bound, else `null`. */
function onEventViolation(registry: OnEventRegistry): string | null {
  const count = onEventHandlerCount(registry);
  return count > MAX_ON_EVENT_HANDLERS
    ? `${ON_EVENT_RULE} (found ${count})`
    : null;
}

describe("only one AI module handles events", () => {
  it("has at least one handler in AI_REGISTRY, so the bound is not vacuous", () => {
    // Vacuity floor only: an emptied registry or a lost flight-script handler
    // must not pass as "at most one". Adding an unrelated pilot is fine.
    expect(Object.keys(AI_REGISTRY).length).toBeGreaterThan(0);
    expect(
      onEventHandlerCount(AI_REGISTRY),
      `no registered AI module defines onEvent, so the one-handler bound is vacuous: see ${ON_EVENT_TODO}`,
    ).toBeGreaterThanOrEqual(1);
  });

  it("holds the bound on the real registry", () => {
    expect(onEventViolation(AI_REGISTRY), ON_EVENT_RULE).toBeNull();
  });

  it("fails for a registry of two modules that define onEvent, naming the todo and the owner edit", () => {
    const registry = {
      first: { think: () => undefined, onEvent: () => undefined },
      second: { think: () => undefined, onEvent: () => undefined },
    };

    const message = onEventViolation(registry);

    expect(onEventHandlerCount(registry)).toBe(2);
    expect(message).not.toBeNull();
    expect(message).toContain(
      ".planning/todos/pending/2026-11-18-narrow-kill-time-ship-target-lost.md",
    );
    expect(message).toContain("owner edit to Phase 15 criterion 1");
  });

  it("does not count a module without a function onEvent", () => {
    const registry = {
      first: { think: () => undefined, onEvent: () => undefined },
      second: { think: () => undefined },
      third: { think: () => undefined, onEvent: undefined },
      fourth: { think: () => undefined, onEvent: "not a function" },
    };

    expect(onEventHandlerCount(registry)).toBe(1);
    expect(onEventViolation(registry)).toBeNull();
  });
});
