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
      0,
      "Diso",
    );

    expect(model.hyperspaceTarget).toBe("Diso");
  });

  it("is empty when no target is committed", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);

    expect(
      buildHudModel(state, fixture.layout, fixture.config, "").hyperspaceTarget,
    ).toBe("");
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
