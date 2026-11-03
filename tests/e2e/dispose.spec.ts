// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scene-lifecycle proof (WORLD-04, T-3-22, T-3-23).
 *
 * No screenshots: the evidence is `renderer.info` read through the probe
 * (D-08). Every case that drives `swapSystem`/`disposeSystem` must navigate to
 * `/?test=1` explicitly — `playwright.config.ts` sets a bare `baseURL`, so a
 * relative `goto("/")` would silently have no test hook at all.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { getProbe, waitForReady } from "./helpers/probe.js";

/**
 * Headless Chromium renders the procedural planet on SwiftShader, where frames
 * are far slower than wall time. The settle waits are correctness waits, not
 * performance claims (Pitfall 15).
 */
const SETTLE_MS = 400;

/** Boot with the test hook, start the game and wait for the first Lave frame. */
async function enterSystem(page: Page): Promise<void> {
  await page.goto("/?test=1");
  await waitForReady(page);
  await page.click("#title-start");
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.ready === true &&
        probe.test !== undefined &&
        probe.mode !== "menu"
      );
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(SETTLE_MS);
}

test("three system swaps keep GPU memory at the first-swap baseline", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await enterSystem(page);

  const baseline = (await getProbe(page)).memory;
  // A zero baseline would make every non-growth assertion vacuous.
  expect(baseline.geometries).toBeGreaterThan(0);
  expect(baseline.textures).toBeGreaterThan(0);
  expect(baseline.programs).toBeGreaterThan(0);

  const samples: { geometries: number; textures: number; programs: number }[] =
    [];
  for (let swap = 0; swap < 3; swap += 1) {
    await page.evaluate(async () => {
      await window.__wegolite?.test?.swapSystem();
    });
    await page.waitForTimeout(SETTLE_MS);
    samples.push((await getProbe(page)).memory);
  }

  // A leak grows monotonically; a healthy swap returns to the same baseline.
  // Program compilation is included: identical materials reuse their program
  // keys, so there is no legitimate one-time delta to excuse here.
  for (const sample of samples) {
    expect(sample.geometries).toBeLessThanOrEqual(baseline.geometries);
    expect(sample.textures).toBeLessThanOrEqual(baseline.textures);
    expect(sample.programs).toBeLessThanOrEqual(baseline.programs);
  }

  // The scene is still drawable after the swaps.
  const after = await getProbe(page);
  expect(after.calls).toBeGreaterThan(0);
  expect(after.triangles).toBeGreaterThan(0);

  // Asserted last so a rendering failure is reported before any noise.
  expect(errors).toEqual([]);
});
