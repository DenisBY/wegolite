// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The browser probe helper (Pattern: e2e probe).
 *
 * Every spec waits on the probe rather than on pixels (D-08 forbids screenshot
 * evidence). `getProbe` narrows the ready/failure union so a caller can read the
 * flight fields without a cast.
 */

import type { Page } from "@playwright/test";

import type { WegoliteProbe } from "../../../src/app/probe.js";

/** Wait until the app has published a ready probe. */
export async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return probe !== undefined && probe.ready === true;
    },
    undefined,
    { timeout: 20_000 },
  );
}

/** Read the live probe, asserting it is the ready variant. */
export async function getProbe(page: Page): Promise<WegoliteProbe> {
  const probe = await page.evaluate(() => window.__wegolite);
  if (probe === undefined || probe.ready !== true) {
    throw new Error("Wegolite probe is not ready.");
  }
  return probe;
}

/** A single key press (edge actions only). */
export async function press(page: Page, code: string): Promise<void> {
  await page.keyboard.press(code);
}

/** Hold a key for `milliseconds`, then release it. */
export async function hold(
  page: Page,
  code: string,
  milliseconds: number,
): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(code);
}
