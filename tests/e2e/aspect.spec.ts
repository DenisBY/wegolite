// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The aspect regression proof (WORLD-02, G-03-2, D-08).
 *
 * The defect: every camera is constructed at `aspect = 1` and only
 * `window.resize` used to repair it, so starting at 2222x1000 rendered the 3D
 * layer stretched by 2.22 while the HUD stayed round. `tests/e2e/hud.spec.ts`
 * resized *after* Start, which incidentally repaired the camera — that is why
 * the committed suite never saw it.
 *
 * Therefore: **never call `setViewportSize` after Start in this spec.** The
 * viewport is set before `goto`, and the evidence is the probe's live
 * `aspect` read in the same `evaluate` as `innerWidth/innerHeight`. No
 * screenshots (D-08).
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { waitForReady } from "./helpers/probe.js";

interface AspectFrame {
  readonly aspect: number | undefined;
  readonly width: number;
  readonly height: number;
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

/** Set the viewport, load, press Start and wait for the first docked frame. */
async function startDocked(page: Page, query = "/"): Promise<void> {
  await page.goto(query);
  await waitForReady(page);
  await page.click("#title-start");
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.ready === true &&
        probe.mode === "docked" &&
        typeof probe.aspect === "number"
      );
    },
    undefined,
    { timeout: 30_000 },
  );
}

/** Read the live aspect and the viewport in one sample. */
function readAspect(page: Page): Promise<AspectFrame> {
  return page.evaluate(() => ({
    aspect: window.__wegolite?.aspect,
    width: window.innerWidth,
    height: window.innerHeight,
  }));
}

function expectAspect(frame: AspectFrame, expected: number): void {
  if (frame.aspect === undefined)
    throw new Error("the probe published no aspect");
  expect(Math.abs(frame.aspect - frame.width / frame.height)).toBeLessThan(
    1e-6,
  );
  expect(Math.abs(frame.aspect - expected)).toBeLessThan(1e-6);
}

test("starts at 2222x1000 with a 2.222 projection and no resize", async ({
  page,
}) => {
  const errors = collectErrors(page);

  // Before navigation: a resize after Start would repair the camera and hide
  // the defect this spec exists to catch.
  await page.setViewportSize({ width: 2222, height: 1000 });
  await startDocked(page);

  const frame = await readAspect(page);
  expect(frame.width).toBe(2222);
  expect(frame.height).toBe(1000);
  expectAspect(frame, 2222 / 1000);

  expect(errors).toEqual([]);
});

test("a 16:9 start projects at 1.777, so the fix is not ultrawide-specific", async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await startDocked(page);

  const frame = await readAspect(page);
  expect(frame.width).toBe(1920);
  expect(frame.height).toBe(1080);
  expectAspect(frame, 16 / 9);

  expect(errors).toEqual([]);
});

test("a ?test=1 scene swap re-applies the viewport", async ({ page }) => {
  const errors = collectErrors(page);

  await page.setViewportSize({ width: 2222, height: 1000 });
  await startDocked(page, "/?test=1");

  expectAspect(await readAspect(page), 2222 / 1000);

  // `swapSystem()` rebuilds the active scene through `enterSystem`, waits one
  // animation frame and renders again, so the read below describes the swapped
  // camera rather than the previous one.
  await page.evaluate(async () => {
    await window.__wegolite?.test?.swapSystem();
  });

  expectAspect(await readAspect(page), 2222 / 1000);
  expect(errors).toEqual([]);
});
