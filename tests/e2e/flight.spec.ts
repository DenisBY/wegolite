// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The torus drive in the browser (FLGT-04, T-3-07).
 *
 * `?test=1` publishes the `setPosition`/`setSpeed` hook; the spec teleports to
 * the mass-lock-free point pinned in `tests/sim/torus.test.ts` so it never has
 * to fly 70 s out of the station lock. Every assertion reads the probe, never a
 * pixel (D-08).
 *
 * The teleport point is `station - stationToPlanet * 120,000`:
 * `(-121635.10236631197, 149362.2388458207, -391031.7034580281)`. The unit test
 * rejects the `+` sign (which would put the ship 3,433 m inside the planet)
 * before this spec can run.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getProbe, hold, press, waitForReady } from "./helpers/probe.js";

const TORUS_TEST_POINT = [
  -121_635.102_366_311_97, 149_362.238_845_820_7, -391_031.703_458_028_1,
] as const;

/** Boot, start at Lave, launch, and wait for the cockpit handover. */
async function bootToFlight(page: Page): Promise<void> {
  await page.goto("/?test=1");
  await waitForReady(page);
  await page.click("#title-start");
  await expect(page.locator("#docked")).toBeVisible();
  await page.click('button[data-action="launch"]');
  // Headless Chromium renders the procedural planet on SwiftShader, so the
  // fixed-step loop runs slower than wall time. This is a correctness wait, not
  // a performance claim (Pitfall 15).
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

test("press J away from Lave, cross the system under torus, and disengage on input", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await bootToFlight(page);

  // Teleport clear of the station lock and set the normal top speed so the
  // spec does not spend a minute crawling out of the 25.6 km sphere.
  await page.evaluate((point: readonly number[]) => {
    const probe = window.__wegolite;
    if (probe?.test === undefined) throw new Error("the ?test hook is missing");
    probe.test.setPosition(point[0] ?? 0, point[1] ?? 0, point[2] ?? 0);
    probe.test.setSpeed(350);
  }, TORUS_TEST_POINT);

  // The next flight step recomputes mass lock at the new position.
  await page.waitForFunction(
    () => window.__wegolite?.torus.massLocked === false,
    undefined,
    { timeout: 10_000 },
  );

  await press(page, "j");
  await page.waitForFunction(
    () => window.__wegolite?.torus.engaged === true,
    undefined,
    { timeout: 10_000 },
  );

  const engaged = await getProbe(page);
  expect(engaged.torus.factor).toBeGreaterThanOrEqual(32);
  expect(engaged.torus.factor).toBeLessThanOrEqual(1024);
  expect(engaged.speed).toBeGreaterThan(350);

  // Let the drive build real hyperspeed, so the later deceleration check has
  // room to observe a gradual ramp rather than a single frame at the target.
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return probe !== undefined && probe.speed > 5000;
    },
    undefined,
    { timeout: 20_000 },
  );

  // Any pitch input disengages. Hold long enough for at least one rendered
  // frame to sample the key (SwiftShader frames are ~8 fps).
  await hold(page, "ArrowDown", 300);
  await page.waitForFunction(
    () => window.__wegolite?.torus.engaged === false,
    undefined,
    { timeout: 10_000 },
  );

  const disengaged = await getProbe(page);
  // No snap to 350: the speed is still above the normal cap and below the
  // hyperspeed target.
  expect(disengaged.speed).toBeGreaterThan(350);
  expect(disengaged.speed).toBeLessThan(350 * 1024);

  // It decelerates the rest of the way rather than staying at hyperspeed.
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return probe !== undefined && probe.speed <= 350.000_1;
    },
    undefined,
    { timeout: 30_000 },
  );
  const settled = await getProbe(page);
  expect(settled.speed).toBeCloseTo(350, 1);
  expect(settled.torus.engaged).toBe(false);

  // Asserted last so a rendering failure is reported before any noise.
  expect(errors).toEqual([]);
});
