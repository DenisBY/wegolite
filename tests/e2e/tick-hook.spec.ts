// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The manual clock and the tick hook in a real page (Phase 8, plan 08-16; D-09,
 * D-10, D-13; FOUND-14).
 *
 * SwiftShader runs the simulation far slower than wall time, so a spec that
 * waits on seconds is slow and flaky. Under `?test=1&clock=manual` the session
 * never self-steps and `probe.test.advanceTicks(n)` steps exactly `n` fixed
 * ticks. Every wait here is `page.waitForFunction` on probe fields (frames,
 * sim.tick, mode); no wall-time wait is used (PITFALLS 11).
 */

import { expect, test, type Page } from "@playwright/test";

import { waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

/** A correctness bound, not a performance claim (the SwiftShader loop is slow). */
const SLOW = 30_000;

/** Wait until the session loop has run at least `count` more frames. */
async function waitForFrames(page: Page, count: number): Promise<void> {
  const start = await page.evaluate(() => window.__wegolite?.frames ?? 0);
  await page.waitForFunction(
    (target) => (window.__wegolite?.frames ?? 0) >= target,
    start + count,
    { timeout: SLOW },
  );
}

/** Start a New game at `url` and wait for the docked session to publish `sim`. */
async function bootDocked(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForReady(page);
  await startNewGame(page);
  await page.waitForFunction(
    () =>
      window.__wegolite?.mode === "docked" &&
      window.__wegolite.sim !== undefined,
    undefined,
    { timeout: SLOW },
  );
}

interface SimSample {
  readonly tick: number;
  readonly frames: number;
  readonly clock: string;
  readonly traffic: boolean;
  readonly worldLive: boolean;
  readonly entities: number;
}

async function sample(page: Page): Promise<SimSample> {
  return page.evaluate(() => {
    const probe = window.__wegolite;
    if (probe?.sim === undefined) throw new Error("probe.sim is not published");
    return {
      tick: probe.sim.tick,
      frames: probe.frames,
      clock: probe.sim.clock,
      traffic: probe.sim.traffic,
      worldLive: probe.sim.worldLive,
      entities: probe.sim.entities,
    };
  });
}

test("the manual clock never self-steps; advanceTicks steps exactly n ticks", async ({
  page,
}) => {
  await bootDocked(page, "/?test=1&clock=manual");
  const before = await sample(page);
  expect(before.clock).toBe("manual");
  expect(before.traffic).toBe(false);
  expect(before.worldLive).toBe(false);
  expect(before.entities).toBe(0);

  // The loop keeps running frames, but the manual clock never steps.
  await waitForFrames(page, 30);
  const idle = await sample(page);
  expect(idle.frames - before.frames).toBeGreaterThanOrEqual(30);
  expect(idle.tick).toBe(before.tick);

  const advanced = await page.evaluate(
    () => window.__wegolite?.test?.advanceTicks(5) ?? -1,
  );
  expect(advanced).toBe(before.tick + 5);
  await waitForFrames(page, 1);
  expect((await sample(page)).tick).toBe(before.tick + 5);

  // A zero and a fraction are refused with the tick unchanged.
  const refused = await page.evaluate(() => [
    window.__wegolite?.test?.advanceTicks(0) ?? -1,
    window.__wegolite?.test?.advanceTicks(1.5) ?? -1,
  ]);
  expect(refused).toEqual([before.tick + 5, before.tick + 5]);
  await waitForFrames(page, 1);
  expect((await sample(page)).tick).toBe(before.tick + 5);
});
