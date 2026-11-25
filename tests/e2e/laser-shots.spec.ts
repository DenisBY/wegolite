// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The browser proof for quick 261117-han: the laser shot layer's custom
 * `ShaderMaterial` compiles and links in WebGL2, and a live shot costs exactly
 * one draw call, gone once the shot expires.
 *
 * The evidence is `renderer.info` read through the probe (`calls`), with no
 * screenshots and no pixel reads (D-08). Three reports a shader compile or
 * link failure as a console error, so the spec also fails on any console or
 * page error. It exists because Node tests cannot compile GLSL, and no other
 * spec renders a live shot deterministically: the verify subset fires
 * nothing, and `combat.spec.ts` only renders a live shot by chance.
 *
 * The ship launches with NPC traffic off and a manual clock
 * (`?test=1&clock=manual`), parks, and fires one fore pulse shot. Every
 * assertion is a count or a value read from the probe; the wait timeouts are
 * correctness bounds, never assertions.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

/** A correctness bound, not a performance claim (the SwiftShader loop is slow). */
const SLOW = 30_000;
/**
 * The test budget. The default 30 s covered the whole spec with no margin: on
 * the GitHub runner (SwiftShader) it took 22.1 s for 0.8.0 and timed out at
 * 30 s for 0.8.1. The launch here is stepped on the manual clock, not waited
 * for, so no FIRST_LAUNCH_WAIT_MS is added.
 */
test.setTimeout(120_000);
/** Traffic off (the browser-test bundle's default) and a manual clock. */
const SHOTS_URL = "/?test=1&clock=manual";
/** The launch handover is 240 ticks (two seconds); this is comfortably past it. */
const LAUNCH_TICKS = 300;
/**
 * Ticks the fire key may be held until the shot is fired. A correctness
 * bound: the pulse laser's period is 61 ticks, so this fires one shot only.
 */
const FIRE_BOUND_TICKS = 5;
/** 15 ticks at 120 Hz are 125 ms of flight time, past the 90 ms shot life. */
const EXPIRY_TICKS = 15;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

/** Wait until the session loop has run at least `count` more frames. */
async function waitForFrames(page: Page, count: number): Promise<void> {
  const start = await page.evaluate(() => window.__wegolite?.frames ?? 0);
  await page.waitForFunction(
    (target) => (window.__wegolite?.frames ?? 0) >= target,
    start + count,
    { timeout: SLOW },
  );
}

/** Step `n` manual ticks, then let a frame publish the probe. */
async function advance(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) => window.__wegolite?.test?.advanceTicks(count),
    n,
  );
  await waitForFrames(page, 2);
}

/** The draw calls of the last rendered frame. */
async function drawCalls(page: Page): Promise<number> {
  return page.evaluate(() => window.__wegolite?.calls ?? -1);
}

/** The fore laser's temperature: above 0 once a shot is fired. */
async function laserTemp(page: Page): Promise<number> {
  return page.evaluate(() => window.__wegolite?.combat?.laserTemp ?? -1);
}

test("a fired laser shot compiles and costs exactly one draw call while live", async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto(SHOTS_URL);
  await waitForReady(page);
  await startNewGame(page);
  await page.waitForFunction(
    () =>
      window.__wegolite?.mode === "docked" &&
      window.__wegolite.sim !== undefined,
    undefined,
    { timeout: SLOW },
  );

  // Launch, fly the scripted exit out and park, so nothing else in the scene
  // changes between the reads.
  await page.click('button[data-action="launch"]');
  await waitForFrames(page, 1);
  await advance(page, 1);
  await advance(page, LAUNCH_TICKS);
  await page.waitForFunction(
    () => window.__wegolite?.mode === "inFlight",
    undefined,
    { timeout: SLOW },
  );
  await page.evaluate(() => window.__wegolite?.test?.setSpeed(0));

  // 1. The parked scene draws a fixed, non-zero number of calls (vacuity and
  // stability guard).
  await waitForFrames(page, 2);
  const baseline = await drawCalls(page);
  await waitForFrames(page, 2);
  expect(await drawCalls(page), "parked calls are stable").toBe(baseline);
  expect(baseline, "parked calls (vacuity guard)").toBeGreaterThan(0);
  expect(await laserTemp(page), "LT before firing").toBe(0);

  // 2. One fore pulse shot: hold A tick by tick until it fires, then release.
  await page.keyboard.down("KeyA");
  for (let tick = 0; tick < FIRE_BOUND_TICKS; tick += 1) {
    await advance(page, 1);
    if ((await laserTemp(page)) > 0) break;
  }
  await page.keyboard.up("KeyA");
  await waitForFrames(page, 2);
  expect(await laserTemp(page), "LT after firing").toBeGreaterThan(0);
  expect(await drawCalls(page), "calls with one live shot").toBe(baseline + 1);

  // 3. Past the 0.09 s life the shot is gone and so is its call.
  await advance(page, EXPIRY_TICKS);
  await waitForFrames(page, 2);
  expect(await drawCalls(page), "calls after the shot expired").toBe(baseline);

  // 4. No shader compile or link error, and no other error.
  expect(errors).toEqual([]);
});
