// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The flight HUD browser proof (FLGT-05, D-05, D-07, D-08).
 *
 * No screenshots and no pixel diffs: the spec reads the HUD canvas backing size
 * and the probe's design-space numbers in one `evaluate`, so the assertion
 * describes the same frame. The launch/flight hint lifecycle is deliberately
 * *not* asserted here — plan 03-07 owns `tests/e2e/launch.spec.ts` and the
 * `HintController`.
 */

import { expect, test } from "@playwright/test";

import { getProbe, waitForReady } from "./helpers/probe.js";

interface HudFrame {
  readonly canvas: { width: number; height: number } | null;
  readonly hud: {
    drawn: boolean;
    elements: string[];
    designScale: number;
    letterbox: [number, number];
    contacts: string[];
    compass: { target: string; forward: boolean };
    aegis: string;
    message: string;
    bounds: Record<string, readonly [number, number, number, number]>;
  };
}

async function launch(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/?test=1");
  await waitForReady(page);
  await page.click("#title-start");
  await page.click('button[data-action="launch"]');
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return (
        probe !== undefined && probe.ready === true && probe.mode === "inFlight"
      );
    },
    undefined,
    { timeout: 30_000 },
  );
}

function readHud(page: import("@playwright/test").Page): Promise<HudFrame> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#hud");
    const probe = window.__wegolite;
    if (probe === undefined || probe.ready !== true) {
      throw new Error("the probe is not ready");
    }
    return {
      canvas:
        canvas === null ? null : { width: canvas.width, height: canvas.height },
      hud: probe.hud,
    };
  });
}

test("the scanner and compass draw and the probe reports the station contact", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await launch(page);

  const frame = await readHud(page);
  expect(frame.canvas?.width ?? 0).toBeGreaterThan(0);
  expect(frame.canvas?.height ?? 0).toBeGreaterThan(0);
  expect(frame.hud.drawn).toBe(true);
  expect(frame.hud.elements).toContain("crosshair");
  expect(frame.hud.elements).toContain("scanner");
  expect(frame.hud.elements).toContain("compass");
  expect(frame.hud.contacts).toContain("station");

  // The probe is numeric: the compass target and aegis come from the same model
  // the canvas drew, not from a second code path.
  expect(frame.hud.compass.target).toBe("station");
  expect(frame.hud.aegis).toBe("dockingRange");

  const probe = await getProbe(page);
  expect(probe.hud.drawn).toBe(true);

  // Asserted last so a rendering failure is reported before any noise.
  expect(errors).toEqual([]);
});
