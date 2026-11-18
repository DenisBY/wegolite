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

import {
  CALM_HINT_GAUGES,
  createHintController,
  hintGauges,
  hintText,
} from "../../src/app/hints.js";
import type { HintContext } from "../../src/app/hints.js";
import { createBindingMap } from "../../src/input/bindings.js";
import { MAX_MESSAGE_CHARS } from "../../src/render/hud/format.js";
import type { HudBars } from "../../src/render/hud/draw.js";
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
    gauges: CALM_HINT_GAUGES,
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

  it("follows the earlier hints in the id list and keeps their order", () => {
    expect(HINT_IDS).toEqual([
      ...EARLIER,
      "aegis",
      "laserTemp",
      "shields",
      "energy",
      "cabinTemp",
      "fuel",
    ]);
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

/** Every hint that is not a gauge hint, so only a gauge hint can come back. */
const NON_GAUGE: readonly HintId[] = [
  "launch",
  "torus",
  "torusDisengage",
  "speed",
  "pitchRoll",
  "aegis",
];

const NEW_TEXTS: readonly (readonly [HintId, string])[] = [
  ["laserTemp", "LT: laser temperature — ease off before it overheats"],
  ["shields", "FWD/AFT: forward and aft shields — they recharge"],
  ["energy", "E1-E4: energy banks — they recharge over time"],
  ["cabinTemp", "CT: cabin temperature — hits past the shields heat it"],
  ["fuel", "FUEL: hyperspace fuel — refuel when docked"],
];

describe("the LT gauge hint (quick task 261118-ioj, D-03 to D-05)", () => {
  const LT = "LT: laser temperature — ease off before it overheats";
  const gauges = (laserTemp: number) => ({ ...CALM_HINT_GAUGES, laserTemp });

  it("has the D-04 text, within the message width", () => {
    expect(hintText("laserTemp", bindings)).toBe(LT);
    expect(LT.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
  });

  it("stays quiet below 0.25 and fires once at 0.25, marked seen", () => {
    const persisted: HintId[] = [];
    const hints = createHintController({
      bindings,
      seen: [...NON_GAUGE],
      onSeen: (id) => persisted.push(id),
    });
    expect(hints.maybeShow(context({ gauges: gauges(0.24) }))).toBeNull();
    expect(hints.maybeShow(context({ gauges: gauges(0.25) }))).toBe(LT);
    expect(hints.isSeen("laserTemp")).toBe(true);
    expect(persisted).toEqual(["laserTemp"]);
    expect(hints.maybeShow(context({ gauges: gauges(0.5) }))).toBeNull();
  });

  it("does not fire while docked or launching and stays unseen", () => {
    const hints = createHintController({ bindings, seen: [...NON_GAUGE] });
    expect(
      hints.maybeShow(context({ mode: "docked", gauges: gauges(0.9) })),
    ).toBeNull();
    expect(
      hints.maybeShow(context({ mode: "launching", gauges: gauges(0.9) })),
    ).toBeNull();
    expect(hints.isSeen("laserTemp")).toBe(false);
  });

  it("is never shown once its id is in the persisted seen list", () => {
    const hints = createHintController({
      bindings,
      seen: [...NON_GAUGE, "laserTemp"],
    });
    expect(hints.maybeShow(context({ gauges: gauges(0.9) }))).toBeNull();
  });

  it("never triggers on a non-finite gauge", () => {
    const hints = createHintController({ bindings, seen: [...NON_GAUGE] });
    expect(hints.maybeShow(context({ gauges: gauges(Number.NaN) }))).toBeNull();
    expect(hints.isSeen("laserTemp")).toBe(false);
  });
});

describe("hintGauges (quick task 261118-ioj, D-03)", () => {
  const bars: HudBars = {
    speed: 0.5,
    roll: 0,
    pitch: 0,
    fuel: 0.7,
    shieldFwd: 0.8,
    shieldAft: 0.6,
    energyBanks: [0.5, 1, 1, 1],
    laserTemp: 0.3,
    cabinTemp: 0.4,
  };

  it("is the calm set without bars", () => {
    expect(hintGauges(undefined)).toEqual({
      laserTemp: 0,
      cabinTemp: 0,
      shields: 1,
      energy: 1,
      fuel: 1,
    });
    expect(hintGauges(undefined)).toBe(CALM_HINT_GAUGES);
  });

  it("maps the drawn bars: lower shield, mean energy", () => {
    expect(hintGauges(bars)).toEqual({
      laserTemp: 0.3,
      cabinTemp: 0.4,
      shields: 0.6,
      energy: 0.875,
      fuel: 0.7,
    });
  });
});

describe("the other gauge hints (quick task 261118-ioj, D-03 to D-08)", () => {
  const seenAll = [...NON_GAUGE];
  const cases: readonly {
    readonly id: HintId;
    readonly key: keyof typeof CALM_HINT_GAUGES;
    readonly quiet: readonly number[];
    readonly fires: number;
  }[] = [
    { id: "shields", key: "shields", quiet: [1], fires: 0.99 },
    { id: "energy", key: "energy", quiet: [1, 0.9], fires: 0.89 },
    {
      id: "cabinTemp",
      key: "cabinTemp",
      quiet: [0.234375, 0.29],
      fires: 0.3,
    },
    { id: "fuel", key: "fuel", quiet: [1], fires: 0.9 },
  ];

  for (const { id, key, quiet, fires } of cases) {
    const text = NEW_TEXTS.find(([textId]) => textId === id)?.[1] ?? "";

    describe(id, () => {
      it("has the D-04 text, within the message width", () => {
        expect(hintText(id, bindings)).toBe(text);
        expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
      });

      it("stays quiet at calm values and fires once at its threshold", () => {
        const persisted: HintId[] = [];
        const hints = createHintController({
          bindings,
          seen: seenAll,
          onSeen: (seenId) => persisted.push(seenId),
        });
        for (const value of quiet) {
          const gauges = { ...CALM_HINT_GAUGES, [key]: value };
          expect(hints.maybeShow(context({ gauges }))).toBeNull();
        }
        const gauges = { ...CALM_HINT_GAUGES, [key]: fires };
        expect(hints.maybeShow(context({ gauges }))).toBe(text);
        expect(hints.isSeen(id)).toBe(true);
        expect(persisted).toEqual([id]);
        expect(hints.maybeShow(context({ gauges }))).toBeNull();
      });

      it("does not fire while docked or launching and stays unseen", () => {
        const hints = createHintController({ bindings, seen: seenAll });
        const gauges = { ...CALM_HINT_GAUGES, [key]: fires };
        expect(hints.maybeShow(context({ mode: "docked", gauges }))).toBeNull();
        expect(
          hints.maybeShow(context({ mode: "launching", gauges })),
        ).toBeNull();
        expect(hints.isSeen(id)).toBe(false);
      });

      it("is never shown once its id is in the seen list", () => {
        const hints = createHintController({
          bindings,
          seen: [...seenAll, id],
        });
        const gauges = { ...CALM_HINT_GAUGES, [key]: fires };
        expect(hints.maybeShow(context({ gauges }))).toBeNull();
      });

      it("never triggers on a non-finite gauge", () => {
        const hints = createHintController({ bindings, seen: seenAll });
        const gauges = { ...CALM_HINT_GAUGES, [key]: Number.NaN };
        expect(hints.maybeShow(context({ gauges }))).toBeNull();
        expect(hints.isSeen(id)).toBe(false);
      });
    });
  }

  it("triggers no gauge hint on a pristine ship in flight", () => {
    const hints = createHintController({ bindings, seen: seenAll });
    expect(hints.maybeShow(context({}))).toBeNull();
    const newGameCabin = { ...CALM_HINT_GAUGES, cabinTemp: 0.234375 };
    expect(hints.maybeShow(context({ gauges: newGameCabin }))).toBeNull();
    for (const [id] of NEW_TEXTS) expect(hints.isSeen(id)).toBe(false);
  });

  it("offers two simultaneous triggers in the D-05 order, one per frame", () => {
    const hints = createHintController({ bindings, seen: seenAll });
    const gauges = { ...CALM_HINT_GAUGES, laserTemp: 0.5, shields: 0.5 };
    expect(hints.maybeShow(context({ gauges }))).toBe(
      hintText("laserTemp", bindings),
    );
    expect(hints.maybeShow(context({ gauges }))).toBe(
      hintText("shields", bindings),
    );
    expect(hints.maybeShow(context({ gauges }))).toBeNull();
  });

  it("offers all five in the order laserTemp, shields, energy, cabinTemp, fuel", () => {
    const hints = createHintController({ bindings, seen: seenAll });
    const gauges = {
      laserTemp: 1,
      cabinTemp: 1,
      shields: 0,
      energy: 0,
      fuel: 0,
    };
    const shown = NEW_TEXTS.map(() => hints.maybeShow(context({ gauges })));
    expect(shown).toEqual(NEW_TEXTS.map(([, text]) => text));
  });
});
