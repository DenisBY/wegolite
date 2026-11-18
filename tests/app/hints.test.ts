// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The torus hint and the stale mass-lock flag (launch.spec.ts:129 flake).
 *
 * `torus.massLocked` is refreshed only by an in-flight step, and the step that
 * completes a launch leaves it stale `false` inside the station lock. A render
 * frame can follow that step directly, so the controller must not spend the
 * torus hint on it: the hint would be wrong there and never come back.
 */

import { describe, expect, it } from "vitest";

import { createHintController, hintText } from "../../src/app/hints.js";
import type { HintContext } from "../../src/app/hints.js";
import { createBindingMap } from "../../src/input/bindings.js";
import { HINT_IDS } from "../../src/settings/schema.js";
import type { HintId } from "../../src/settings/schema.js";

const bindings = createBindingMap();

function context(overrides: Partial<HintContext>): HintContext {
  return {
    mode: "inFlight",
    massLocked: false,
    torusEngaged: false,
    speedInput: 0,
    pitchRollInput: false,
    flightTime: 2,
    inDockingRange: false,
    ...overrides,
  };
}

const TORUS = hintText("torus", bindings);

describe("torus hint after a launch", () => {
  it("does not take the hint on the first in-flight frame, even with a stale massLocked false", () => {
    const hints = createHintController({ bindings });
    // Docked, then the launch-completing step: inFlight, flag still false.
    expect(
      hints.maybeShow(context({ mode: "docked", flightTime: 0 })),
    ).not.toBe(TORUS);
    const first = hints.maybeShow(context({ flightTime: 2 }));
    expect(first).not.toBe(TORUS);
    expect(hints.isSeen("torus")).toBe(false);
  });

  it("offers it once a step has run and the flag is fresh and clear", () => {
    const hints = createHintController({ bindings });
    hints.maybeShow(context({ flightTime: 2 }));
    // The next step refreshed the flag: still locked, so no torus hint, and it
    // is not consumed.
    const shown: (string | null)[] = [];
    shown.push(
      hints.maybeShow(context({ flightTime: 2.01, massLocked: true })),
    );
    expect(shown).not.toContain(TORUS);
    // Later, clear of the lock: the hint comes exactly once.
    expect(hints.maybeShow(context({ flightTime: 5 }))).toBe(TORUS);
    expect(hints.maybeShow(context({ flightTime: 5.01 }))).not.toBe(TORUS);
  });

  it("is not lost when the stale frame is followed by a locked frame", () => {
    const hints = createHintController({ bindings });
    hints.maybeShow(context({ flightTime: 2 })); // stale false, first frame
    hints.maybeShow(context({ flightTime: 2.01, massLocked: true }));
    hints.maybeShow(context({ flightTime: 3, massLocked: true }));
    expect(hints.maybeShow(context({ flightTime: 6 }))).toBe(TORUS);
  });

  it("restarts the wait after leaving flight (a new launch)", () => {
    const hints = createHintController({ bindings });
    hints.maybeShow(context({ flightTime: 2 }));
    hints.maybeShow(context({ mode: "docked", flightTime: 4 }));
    // A fresh in-flight session: the first frame again carries a stale flag.
    expect(hints.maybeShow(context({ flightTime: 9 }))).not.toBe(TORUS);
    expect(hints.maybeShow(context({ flightTime: 9.01 }))).toBe(TORUS);
  });
});

describe("the safe-zone hint (quick task 261118-cyn, D-07)", () => {
  const AEGIS = "S: you are inside the station's safe zone";
  const EARLIER: readonly HintId[] = [
    "launch",
    "torus",
    "torusDisengage",
    "speed",
    "pitchRoll",
  ];

  it("is the last hint id and keeps the earlier hints and their order", () => {
    expect(HINT_IDS).toEqual([...EARLIER, "aegis"]);
    expect(hintText("aegis", bindings)).toBe(AEGIS);
  });

  it("shows once in docking range in flight, after the earlier hints, and is marked seen", () => {
    const seen: HintId[] = [];
    const hints = createHintController({
      bindings,
      seen: ["launch", "torus", "torusDisengage"],
      onSeen: (id) => seen.push(id),
    });
    const inRange = context({ massLocked: true, inDockingRange: true });
    // Speed and pitch-and-roll come first, one per frame.
    expect(hints.maybeShow(inRange)).toBe(hintText("speed", bindings));
    expect(hints.maybeShow(inRange)).toBe(hintText("pitchRoll", bindings));
    expect(hints.maybeShow(inRange)).toBe(AEGIS);
    expect(hints.isSeen("aegis")).toBe(true);
    expect(seen).toContain("aegis");
    // Never again in the session.
    expect(hints.maybeShow(inRange)).toBeNull();
    expect(hints.maybeShow(inRange)).toBeNull();
  });

  it("is not shown outside docking range or while docked", () => {
    const hints = createHintController({ bindings, seen: [...EARLIER] });
    expect(hints.maybeShow(context({ massLocked: true }))).toBeNull();
    expect(
      hints.maybeShow(
        context({ mode: "docked", inDockingRange: true, flightTime: 3 }),
      ),
    ).toBeNull();
    expect(hints.isSeen("aegis")).toBe(false);
  });

  it("is never shown once its id is in the seen list", () => {
    const hints = createHintController({ bindings, seen: [...HINT_IDS] });
    expect(
      hints.maybeShow(context({ massLocked: true, inDockingRange: true })),
    ).toBeNull();
  });
});
