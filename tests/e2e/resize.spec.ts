// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { expect, test } from "@playwright/test";

// This regression discriminates against the CR-01 build: before the fix the
// probe publishes no `renders` field at all, so the boot assertion below fails
// immediately. A field published without the repaint stays at the boot value,
// so the first counter wait times out. Only a resize handler that actually
// renders advances `renderer.info.render.frame`.
test("resizing the window repaints at the new size and after restoring it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");
  await page.waitForFunction(
    () => window.__wegolite?.ready === true,
    undefined,
    {
      timeout: 20_000,
    },
  );

  const bootRenders = await page.evaluate(
    () => window.__wegolite?.renders ?? 0,
  );
  expect(bootRenders).toBeGreaterThan(0);

  // Read all four values inside one evaluate so the counter and the buffer
  // dimensions describe the same rendered frame, never two separate samples.
  const readBuffer = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#view");
      if (!canvas) throw new Error('expected a <canvas id="view"> in the page');
      return {
        width: canvas.width,
        height: canvas.height,
        renders: window.__wegolite?.renders ?? 0,
        devicePixelRatio: window.devicePixelRatio,
      };
    });

  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForFunction(
    (previous: number) => (window.__wegolite?.renders ?? 0) > previous,
    bootRenders,
    { timeout: 5_000 },
  );

  const resized = await readBuffer();
  expect(resized.renders).toBeGreaterThan(bootRenders);
  // The same cap and flooring `renderer.setPixelRatio` plus `setSize` apply.
  const resizedScale = Math.min(resized.devicePixelRatio, 2);
  expect(resized.width).toBe(Math.floor(900 * resizedScale));
  expect(resized.height).toBe(Math.floor(600 * resizedScale));

  // The user's "restore to original size" path: the same bug, so it must also
  // reallocate the buffer and repaint, not merely keep the previous frame.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(
    (previous: number) => (window.__wegolite?.renders ?? 0) > previous,
    resized.renders,
    { timeout: 5_000 },
  );

  const restored = await readBuffer();
  expect(restored.renders).toBeGreaterThan(resized.renders);
  const restoredScale = Math.min(restored.devicePixelRatio, 2);
  expect(restored.width).toBe(Math.floor(1280 * restoredScale));
  expect(restored.height).toBe(Math.floor(720 * restoredScale));

  // Asserted last so a rendering failure is reported before any noise.
  expect(errors).toEqual([]);
});
