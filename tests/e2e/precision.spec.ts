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
  // The far marker body arrives with task 3, so only the near placement is
  // asserted here.
  expect(info?.nearRelZ).toBeCloseTo(-1e5, 3);

  // Asserted last so a rendering failure is reported before any noise.
  expect(errors).toEqual([]);
});
