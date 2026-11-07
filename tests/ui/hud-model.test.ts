// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The HUD target line (NAV-02, D-12).
 *
 * The committed hyperspace target is carried on the existing HUD model and
 * drawn inside the clock rectangle; the eleven-element contract is untouched.
 */

import { describe, expect, it } from "vitest";

import { buildHudModel } from "../../src/app/hud-model.js";
import { HUD_ELEMENTS, HUD_LAYOUT } from "../../src/render/hud/draw.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import { laveFixture } from "../helpers/lave.js";

describe("buildHudModel hyperspace target", () => {
  it("carries the committed target name", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);

    const model = buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "Diso",
    );

    expect(model.hyperspaceTarget).toBe("Diso");
  });

  it("is empty when no target is committed", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);

    expect(
      buildHudModel(state, fixture.layout, fixture.config, "", 70)
        .hyperspaceTarget,
    ).toBe("");
  });

  it("derives the fuel bar and text from the live tank", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);

    const half = buildHudModel(state, fixture.layout, fixture.config, "", 35);
    expect(half.bars.fuel).toBe(0.5);
    expect(half.fuelText).toBe("3.5 LY");

    const empty = buildHudModel(state, fixture.layout, fixture.config, "", 0);
    expect(empty.bars.fuel).toBe(0);
    expect(empty.fuelText).toBe("0.0 LY");

    const full = buildHudModel(state, fixture.layout, fixture.config, "", 70);
    expect(full.bars.fuel).toBe(1);
    expect(full.fuelText).toBe("7.0 LY");
  });

  it("keeps the fuel bar inside 0..1 for a non-finite or negative tank", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);

    for (const tank of [Number.NaN, Number.NEGATIVE_INFINITY, -5]) {
      const model = buildHudModel(
        state,
        fixture.layout,
        fixture.config,
        "",
        tank,
      );
      expect(model.bars.fuel).toBe(0);
      expect(model.fuelText).toBe("0.0 LY");
    }
  });

  it("does not add a twelfth HUD element or resize the clock rectangle", () => {
    expect(HUD_ELEMENTS).toHaveLength(11);
    expect(HUD_LAYOUT.clock).toEqual({
      x: 60,
      y: 40,
      width: 360,
      height: 40,
    });
  });
});
