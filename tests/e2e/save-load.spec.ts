// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The F2 Save/Load browser proof (SAVE-01, SAVE-04, SAVE-05).
 *
 * Every case boots the real app in a fresh Playwright context and waits on
 * `window.__wegolite`; no assertion reads a pixel. The screen is docked-only,
 * so the flight case launches first. IndexedDB is the only durable surface and
 * the isolation cases compare raw bytes across a failed load.
 *
 * Headless Chromium runs on SwiftShader, so every wait is a correctness wait on
 * the simulation probe with a generous bound.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getProbe, waitForReady } from "./helpers/probe.js";

test.setTimeout(360_000);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

async function boot(page: Page, query = "/"): Promise<void> {
  await page.goto(query);
  await waitForReady(page);
}

async function startNewGame(page: Page): Promise<void> {
  await page.click("#title-start");
  await expect(page.locator("#title-confirm")).toBeHidden();
  await expect(page.locator("#docked")).toBeVisible();
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
    { timeout: 60_000 },
  );
}

async function waitForDocked(page: Page): Promise<void> {
  await waitForMode(page, "docked");
  await expect(page.locator("#docked")).toBeVisible();
}

test("F2 opens the Save/Load screen only while docked and closes on Return/Escape", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await waitForDocked(page);

  // Docked-only: nothing is shown before F2.
  await expect(page.locator("#save-load")).toBeHidden();
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeVisible();
  await expect(page.locator("#save-load-screen")).toBeFocused();

  // One slot line, three semantic rows and no second <footer>.
  await expect(page.locator('[data-field="save-load-slot"]')).toHaveText(
    /^Autosave · Lave · \d{7}:\d{2}:\d{2}:\d{2}$/,
  );
  for (const row of ["save", "load", "return"]) {
    await expect(page.locator(`[data-save-action="${row}"]`)).toBeVisible();
  }
  await expect(page.locator("#save-load footer")).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(1);
  const probe = await getProbe(page);
  expect(probe.saveScreen?.open).toBe(true);
  expect(probe.saveScreen?.row).toBe("save");

  // Escape closes without pausing: Escape in saveScreen is Return, not pause.
  await page.keyboard.press("Escape");
  await expect(page.locator("#save-load")).toBeHidden();
  await expect(page.locator("#pause")).toBeHidden();
  expect((await getProbe(page)).paused).toBe(false);

  // The Return row closes it equally, and the station screen regains focus.
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeVisible();
  await page.click('[data-save-action="return"]');
  await expect(page.locator("#save-load")).toBeHidden();
  await expect(page.locator("#docked")).toBeVisible();
  await expect(page.locator("#station-screen")).toBeFocused();
  expect(errors).toEqual([]);
});

test("F2 is inert while paused and in flight", async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await waitForDocked(page);

  // Paused: the input layer resolves only `pause`, and the open sink repeats
  // the guard, so no z-index-10 overlay appears beneath the pause overlay.
  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.__wegolite?.paused === true,
    undefined,
    {
      timeout: 30_000,
    },
  );
  await expect(page.locator("#pause")).toBeVisible();
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeHidden();
  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.__wegolite?.paused === false,
    undefined,
    {
      timeout: 30_000,
    },
  );

  // In flight: F2 is docked-only.
  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeHidden();
  expect((await getProbe(page)).saveScreen?.open).toBe(false);
  expect(errors).toEqual([]);
});
