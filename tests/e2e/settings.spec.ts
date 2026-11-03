// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The settings/rebinding browser proof (FLGT-06/07, D-12, D-13).
 *
 * No screenshots: the spec reads the probe and `localStorage` in one evaluate.
 * The tracer asserts the whole chain — pause → Controls → capture → save →
 * reload → the new key rolls and the old key does not — so a binding that only
 * updates an in-memory map cannot pass.
 */

import { expect, test } from "@playwright/test";

import { getProbe, waitForReady } from "./helpers/probe.js";

interface StoredSettings {
  version: number;
  bindings: Record<string, string[]>;
}

async function startAndLaunch(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto("/");
  await waitForReady(page);
  await page.click("#title-start");
  await expect(page.locator("#docked")).toBeVisible({ timeout: 30_000 });
  await page.click('button[data-action="launch"]');
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return (
        probe !== undefined && probe.ready === true && probe.mode === "inFlight"
      );
    },
    undefined,
    { timeout: 60_000 },
  );
}

async function waitForFlightAdvance(
  page: import("@playwright/test").Page,
  seconds: number,
): Promise<void> {
  const from = await page.evaluate(() => window.__wegolite?.flightTime ?? 0);
  await page.waitForFunction(
    ({ start, target }: { start: number; target: number }) =>
      (window.__wegolite?.flightTime ?? 0) >= start + target,
    { start: from, target: seconds },
    { timeout: 30_000 },
  );
}

async function storedSettings(
  page: import("@playwright/test").Page,
): Promise<StoredSettings> {
  const raw = await page.evaluate(() =>
    localStorage.getItem("wegolite.settings"),
  );
  expect(raw).not.toBeNull();
  return JSON.parse(raw ?? "{}") as StoredSettings;
}

test("rebinding roll-right persists through reload and changes the flight", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await startAndLaunch(page);

  // Open the single pause overlay and reach Controls through it.
  await page.keyboard.press("KeyP");
  await expect(page.locator("#pause")).toBeVisible();
  await page.click('#pause button[data-pause-action="controls"]');
  await expect(page.locator("#controls")).toBeVisible();

  await page.click('button[data-rebind="rollRight"]');
  await page.keyboard.press("KeyL");
  await expect(page.locator("#controls-status")).toContainText("bound to L");

  await page.click('#pause button[data-pause-action="resume"]');
  await expect(page.locator("#pause")).toBeHidden();

  // The blob is exactly one version-1 JSON object under `wegolite.settings`.
  const saved = await storedSettings(page);
  expect(saved.version).toBe(1);
  expect(saved.bindings.rollRight).toEqual(["KeyL"]);

  // Reload: the binding must come from localStorage, not the in-memory map.
  await page.reload();
  await startAndLaunch(page);

  // The old key no longer rolls, even after a quarter of simulated second.
  await page.keyboard.down("ArrowRight");
  await waitForFlightAdvance(page, 0.25);
  const oldKey = await getProbe(page);
  expect(oldKey.angular.roll).toBe(0);
  await page.keyboard.up("ArrowRight");

  // The new key rolls starboard-wing-down (positive roll rate).
  await page.keyboard.down("KeyL");
  await page.waitForFunction(
    () => (window.__wegolite?.angular.roll ?? 0) > 0.1,
    undefined,
    { timeout: 15_000 },
  );
  await page.keyboard.up("KeyL");

  // Reset restores the researched default table.
  await page.keyboard.press("KeyP");
  await expect(page.locator("#pause")).toBeVisible();
  await page.click('#pause button[data-pause-action="controls"]');
  await page.click('button[data-controls-action="reset"]');
  await expect(
    page.locator(
      '.controls-row:has([data-rebind="rollRight"]) .controls-codes',
    ),
  ).toContainText("Right arrow");

  await page.click('#pause button[data-pause-action="resume"]');
  await expect(page.locator("#pause")).toBeHidden();

  // Let the residual roll damp, then prove ArrowRight works again.
  await page.waitForFunction(
    () => Math.abs(window.__wegolite?.angular.roll ?? 1) < 1e-6,
    undefined,
    { timeout: 30_000 },
  );
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => (window.__wegolite?.angular.roll ?? 0) > 0.1,
    undefined,
    { timeout: 15_000 },
  );
  await page.keyboard.up("ArrowRight");

  // Asserted last so a rendering/input failure is reported before any noise.
  expect(errors).toEqual([]);
});

test("pause freezes the clock and resume never replays hidden time", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await startAndLaunch(page);

  await page.keyboard.press("KeyP");
  await expect(page.locator("#pause")).toBeVisible();

  const frozen = await getProbe(page);
  expect(frozen.paused).toBe(true);
  const clock = frozen.clock;
  const flightTime = frozen.flightTime;

  await page.waitForTimeout(600);
  const still = await getProbe(page);
  expect(still.clock).toBe(clock);
  expect(still.flightTime).toBe(flightTime);

  await page.keyboard.press("KeyP");
  await expect(page.locator("#pause")).toBeHidden();
  await page.waitForFunction(
    (before: number) => (window.__wegolite?.clock ?? 0) > before,
    clock,
    { timeout: 15_000 },
  );

  const after = await getProbe(page);
  expect(after.paused).toBe(false);
  // The 600 ms pause must not be replayed as simulation time.
  expect(after.clock - clock).toBeLessThan(1);

  expect(errors).toEqual([]);
});

test("blur and visibility hidden auto-pause and clear held input", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await startAndLaunch(page);

  // Hold a key, then lose focus without a keyup.
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => (window.__wegolite?.angular.roll ?? 0) > 0.1,
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
  });
  await expect(page.locator("#pause")).toBeVisible();
  const paused = await getProbe(page);
  expect(paused.paused).toBe(true);
  const clock = paused.clock;
  await page.waitForTimeout(400);
  expect((await getProbe(page)).clock).toBe(clock);

  // Resume while the physical key is still down: clearAll must have removed it,
  // so the roll rate damps to zero instead of staying at maximum.
  await page.keyboard.press("KeyP");
  await expect(page.locator("#pause")).toBeHidden();
  await page.waitForFunction(
    () => window.__wegolite?.paused === false,
    undefined,
    { timeout: 15_000 },
  );
  await page.waitForFunction(
    () => Math.abs(window.__wegolite?.angular.roll ?? 1) < 1e-6,
    undefined,
    { timeout: 30_000 },
  );
  await page.keyboard.up("ArrowRight");

  // The same rule applies to visibilitychange -> hidden.
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => (window.__wegolite?.angular.roll ?? 0) > 0.1,
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#pause")).toBeVisible();
  expect((await getProbe(page)).paused).toBe(true);
  await page.keyboard.up("ArrowRight");
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "visibilityState");
  });

  expect(errors).toEqual([]);
});

test("the overlay traps focus and Escape backs out one level", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await startAndLaunch(page);

  await page.keyboard.press("KeyP");
  await expect(page.locator("#pause")).toBeVisible();
  await page.click('#pause button[data-pause-action="controls"]');
  await expect(page.locator("#controls")).toBeVisible();

  // Escape backs out to the pause menu; it must not resume.
  await page.keyboard.press("Escape");
  await expect(page.locator("#controls")).toBeHidden();
  await expect(page.locator("#pause")).toBeVisible();
  expect((await getProbe(page)).paused).toBe(true);

  // Tab stays inside the overlay.
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
  }
  const focusInside = await page.evaluate(() => {
    const pause = document.getElementById("pause");
    return pause !== null && pause.contains(document.activeElement);
  });
  expect(focusInside).toBe(true);

  // P still toggles pause inside a subpanel.
  await page.click('#pause button[data-pause-action="settings"]');
  await expect(page.locator("#settings-panel")).toBeVisible();

  // The settings panel's reset-all removes the one blob (the launch save).
  await page.click('[data-settings-action="reset"]');
  expect(
    await page.evaluate(() => localStorage.getItem("wegolite.settings")),
  ).toBeNull();

  await page.keyboard.press("KeyP");
  await expect(page.locator("#pause")).toBeHidden();
  expect((await getProbe(page)).paused).toBe(false);

  expect(errors).toEqual([]);
});
