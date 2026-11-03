// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Phase 3 boot contract (WORLD-01, WORLD-02).
 *
 * This spec replaces the Phase 1/2 near/far marker proof. The three retired
 * probe fields (`nearRelZ`, `farRelZ`, `farUlp`) are asserted **absent** so a
 * stale success value cannot survive the retirement; the numeric precision proof
 * now lives in `world.maxRelativeMagnitude` (asserted in `scene.spec.ts`) and in
 * the float32 ULP assertion at the real sun distance in plan 04.
 *
 * The system scene exists only after Start, so the draw-call and triangle
 * counters are read once the docked panel is up.
 */

import { expect, test } from "@playwright/test";

import { getProbe, waitForReady } from "./helpers/probe.js";

test("boots, starts Lave, renders the system scene, and reports no console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");
  await waitForReady(page);
  await page.click("#title-start");
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return (
        probe !== undefined && probe.ready === true && probe.mode === "docked"
      );
    },
    undefined,
    { timeout: 20_000 },
  );

  const info = await getProbe(page);

  expect(info.webgl2).toBe(true);
  expect(info.calls).toBeGreaterThan(0);
  expect(info.triangles).toBeGreaterThan(0);
  expect(info.logDepth).toBe(true);
  expect(info.depthBits).toBeGreaterThanOrEqual(16);

  // The surviving Phase 1/2 fields stay put while Phase 3 adds its own: the
  // eager galaxy is the whole 256-record chunk and seven galaxies are split.
  expect(info.homeSystems).toBe(256);
  expect(info.codeSplitGalaxies).toBe(7);

  // The additive Phase 3 probe is present after Start, not merely declared.
  expect(info.mode).toBe("docked");
  expect(info.world).toBeDefined();
  expect(info.world?.planet).toHaveLength(3);
  expect(info.hud).toBeDefined();
  expect(Array.isArray(info.hud.elements)).toBe(true);

  // The Phase 1 precision probe is retired, not merely unused.
  expect(info).not.toHaveProperty("nearRelZ");
  expect(info).not.toHaveProperty("farRelZ");
  expect(info).not.toHaveProperty("farUlp");

  // Playwright's toContainText normalises whitespace, so Prettier wrapping the
  // sentence across source lines does not break the assertion the way a raw
  // textContent equality check would.
  const footer = page.locator("footer");
  await expect(footer).toContainText("unofficial fan project");
  await expect(footer).toContainText("trademarks of Frontier Developments plc");

  // Asserted last so a rendering failure is reported before any noise.
  expect(errors).toEqual([]);
});
