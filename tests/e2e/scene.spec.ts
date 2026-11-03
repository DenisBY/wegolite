// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Phase 3 scene proof (WORLD-01, WORLD-02, WORLD-03, FLGT-01).
 *
 * No `?test=1`: the tracer must not depend on the test hook. The spec waits on
 * the probe, clicks the real controls, and asserts probe values — never pixels.
 */

import { expect, test } from "@playwright/test";

import { getProbe, waitForReady } from "./helpers/probe.js";

test("boots to the title, starts docked at Lave, launches and flies", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");
  await waitForReady(page);
  expect((await getProbe(page)).mode).toBe("menu");

  await page.click("#title-start");
  await expect(page.locator("#docked")).toBeVisible();
  await expect(page.locator("#title-screen")).toBeHidden();
  expect((await getProbe(page)).mode).toBe("docked");

  await page.click('button[data-action="launch"]');
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return (
        probe !== undefined && probe.ready === true && probe.mode === "inFlight"
      );
    },
    undefined,
    { timeout: 4_000 },
  );

  const info = await getProbe(page);
  expect(info.webgl2).toBe(true);
  expect(info.calls).toBeGreaterThan(0);
  expect(info.triangles).toBeGreaterThan(0);
  expect(info.logDepth).toBe(true);
  expect(info.bodies).toEqual([
    "planet",
    "sun",
    "starfield",
    "station",
    "ship",
  ]);
  expect(info.launch.count).toBe(1);

  const world = info.world;
  if (world === undefined) throw new Error("the probe published no world");
  expect(world.planet).toEqual([0, 0, -452_760]);
  expect(world.station[0]).toBeCloseTo(-49_474.32, 3);
  expect(world.station[1]).toBeCloseTo(60_752.16, 3);
  expect(world.station[2]).toBeCloseTo(-427_652.4, 3);
  expect(world.sun[0]).toBeCloseTo(-783_274.8, 2);
  expect(world.sun[1]).toBeCloseTo(-340_475.52, 2);
  expect(world.sun[2]).toBeCloseTo(-755_203.68, 2);
  expect(world.witchpoint).toEqual([0, 0, 0]);
  expect(world.maxRelativeMagnitude).toBeLessThan(2.5e6);
  expect(world.maxRelativeMagnitude).toBeGreaterThan(0);

  const hud = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#hud");
    return canvas === null
      ? null
      : { width: canvas.width, height: canvas.height };
  });
  expect(hud?.width ?? 0).toBeGreaterThan(0);
  expect(hud?.height ?? 0).toBeGreaterThan(0);
  expect(info.hud.drawn).toBe(true);

  // Asserted last so a rendering failure is reported before any noise.
  expect(errors).toEqual([]);
});
