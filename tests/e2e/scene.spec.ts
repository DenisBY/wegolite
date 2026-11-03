// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Phase 3 scene proof (WORLD-01, WORLD-02, WORLD-03, FLGT-01, D-09, T-3-02).
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
  // The launch is two simulated seconds, but headless Chromium renders the
  // procedural planet on SwiftShader (~software), where the fixed-step loop
  // advances far slower than wall time. The bound is generous on purpose; it
  // is a correctness wait, not a performance claim (Pitfall 15).
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

  const info = await getProbe(page);
  expect(info.webgl2).toBe(true);
  expect(info.calls).toBeGreaterThan(0);
  expect(info.triangles).toBeGreaterThan(0);
  expect(info.logDepth).toBe(true);
  // The planet's `ShaderMaterial` and its uniforms are pinned by
  // `tests/render/planet-shader.test.ts`; the browser only has to see the body
  // at its authored position and keep drawing.
  expect(info.bodies).toContain("planet");
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

test("the docked view is exactly one status panel with the D-09 facts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");
  await waitForReady(page);
  await page.click("#title-start");

  const docked = page.locator("#docked");
  await expect(docked).toBeVisible();
  await expect(docked).toContainText("Lave");
  await expect(docked).toContainText("100.0 Cr");
  await expect(docked).toContainText("Cobra Mk III");
  await expect(docked).toContainText("7.0 LY");

  const launch = page.locator('button[data-action="launch"]');
  await expect(launch).toHaveCount(1);
  await expect(launch).toBeVisible();

  // No Phase 4/5/6 screen may be reachable in this phase.
  await expect(
    page.locator(
      '[data-screen="trade"], [data-screen="outfitting"], [data-screen="market"], [data-screen="missions"], [data-screen="status"]',
    ),
  ).toHaveCount(0);

  await expect(page.locator("#title-screen")).toBeHidden();
  await expect(page.locator("#hud")).toBeHidden();
  expect((await getProbe(page)).hud.drawn).toBe(false);

  // Asserted last so a rendering failure is reported before any noise.
  expect(errors).toEqual([]);
});

test("a missing Coriolis model shows a plain-text failure, never a blank canvas", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await page.route("**/models/coriolis.glb", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "not found",
    }),
  );

  await page.goto("/");
  await waitForReady(page);
  await page.click("#title-start");

  const failure = page.locator("#failure");
  await expect(failure).toBeVisible();
  await expect(failure).toHaveAttribute("role", "alert");
  await expect(failure).toContainText("coriolis.glb");
  await expect(page.locator("#view")).toBeHidden();
  await expect(page.locator("#hud")).toBeHidden();

  const published = await page.evaluate(() => window.__wegolite);
  expect(published?.ready).toBe(false);
  expect(published?.webgl2).toBe(false);

  // No frame may run after a failed load: the counters stay at their failure
  // values rather than advancing with a RAF loop.
  await page.waitForTimeout(300);
  const later = await page.evaluate(() => window.__wegolite);
  expect(later?.renders).toBe(0);
  expect(later?.calls).toBe(0);

  expect(pageErrors).toEqual([]);
});
