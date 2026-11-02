// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { expect, test } from "@playwright/test";

test("shell boots, renders the precision scene, and reports no console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");
  await page.waitForFunction(() => window.__wegolite?.ready === true, undefined, {
    timeout: 20_000,
  });

  const info = await page.evaluate(() => window.__wegolite);

  expect(info?.webgl2).toBe(true);
  expect(info?.calls ?? 0).toBeGreaterThan(0);
  expect(info?.triangles ?? 0).toBeGreaterThan(0);
  expect(info?.logDepth).toBe(true);
  expect(info?.depthBits ?? 0).toBeGreaterThanOrEqual(16);
  expect(info?.nearRelZ).toBeCloseTo(-1e5, 3);
  expect(info?.farRelZ).toBeCloseTo(-1.4e6, 3);
  expect(info?.farUlp).toBeCloseTo(0.125, 6);

  // Playwright's toContainText normalises whitespace, so Prettier wrapping the
  // sentence across source lines does not break the assertion the way a raw
  // textContent equality check would.
  const footer = page.locator("footer");
  await expect(footer).toContainText("unofficial fan project");
  await expect(footer).toContainText("trademarks of Frontier Developments plc");

  // Asserted last so a rendering failure is reported before any noise.
  expect(errors).toEqual([]);
});
