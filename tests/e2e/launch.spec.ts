// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The launch in the browser (D-10, FLGT-01).
 *
 * The camera *pose* is decided by `tests/render/launch-camera.test.ts`; a
 * pixel-free browser check cannot tell an offset camera from one at the origin.
 * This spec therefore asserts only what the browser owns: the mode timeline,
 * the exactly-once +600 s adjustment, the Cobra toggle and the absence of
 * console/page errors.
 *
 * Headless Chromium renders the procedural planet on SwiftShader and the fixed
 * step loop advances slower than wall time, so every wait is on the probe and
 * every bound is generous (Pitfall 15).
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getProbe, press, waitForReady } from "./helpers/probe.js";

test.setTimeout(120_000);

async function bootToDocked(page: Page): Promise<void> {
  await page.goto("/?test=1");
  await waitForReady(page);
  await page.click("#title-start");
  await expect(page.locator("#docked")).toBeVisible();
  expect((await getProbe(page)).mode).toBe("docked");
}

async function waitForMode(page: Page, mode: string): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const probe = window.__wegolite;
      return (
        probe !== undefined && probe.ready === true && probe.mode === expected
      );
    },
    mode,
    { timeout: 30_000 },
  );
}

test("the first launch plays the full cinematic and hands over to the cockpit", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await bootToDocked(page);
  const before = await getProbe(page);
  const clockBefore = before.clock;
  expect(before.launch.count).toBe(0);
  expect(before.launch.seen).toBe(false);

  await page.click('button[data-action="launch"]');
  await waitForMode(page, "launching");

  const during = await getProbe(page);
  expect(during.launch.count).toBe(1);
  // D-10: the Cobra is visible during the scripted exit.
  expect(during.shipVisible).toBe(true);
  expect(during.clock - clockBefore).toBeGreaterThanOrEqual(600);
  expect(during.clock - clockBefore).toBeLessThan(602);

  await waitForMode(page, "inFlight");
  const after = await getProbe(page);
  expect(after.shipVisible).toBe(false);
  expect(after.launch.seen).toBe(true);
  // The +600 s adjustment happens exactly once; the two seconds of launching
  // add a little simulated flight time on top.
  expect(after.clock - clockBefore).toBeGreaterThanOrEqual(600);
  expect(after.clock - clockBefore).toBeLessThan(610);

  // The first viewing is never skippable: launchSeen was false at launch start.
  expect(errors).toEqual([]);
});

test("a launch after the first viewing skips on any key", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  // First viewing: play in full so `launchSeen` is persisted at handover.
  await bootToDocked(page);
  await page.click('button[data-action="launch"]');
  await waitForMode(page, "inFlight");

  // Reload: the new game is docked again, but `launchSeen` survived in settings.
  await page.reload();
  await waitForReady(page);
  await page.click("#title-start");
  await expect(page.locator("#docked")).toBeVisible();
  const reloaded = await getProbe(page);
  expect(reloaded.mode).toBe("docked");
  expect(reloaded.launch.seen).toBe(true);
  const clockBefore = reloaded.clock;

  await page.click('button[data-action="launch"]');
  await waitForMode(page, "launching");
  await press(page, "Space");

  await waitForMode(page, "inFlight");
  const after = await getProbe(page);
  expect(after.launch.count).toBe(1);
  expect(after.clock - clockBefore).toBeGreaterThanOrEqual(600);
  // A skip must not replay the two scripted seconds; a small number of steps
  // before the key landed is expected.
  expect(after.clock - clockBefore).toBeLessThan(604);
  expect(errors).toEqual([]);
});
