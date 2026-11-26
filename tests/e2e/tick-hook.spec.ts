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

import { hashFlight } from "../../src/sim/flight/state.js";
import { runTickScript } from "../helpers/tick-script.js";
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

test("a launch and 600 ticks read the same world hash in the browser and in the Node replay", async ({
  page,
}) => {
  await bootDocked(page, "/?test=1&clock=manual");
  await page.click('button[data-action="launch"]');
  // One frame after the click, so the launch command is queued before stepping.
  await waitForFrames(page, 1);

  const afterLaunch = await page.evaluate(
    () => window.__wegolite?.test?.advanceTicks(1) ?? -1,
  );
  expect(afterLaunch).toBe(1);
  await waitForFrames(page, 1);
  expect(await page.evaluate(() => window.__wegolite?.mode)).toBe("launching");

  const afterFlight = await page.evaluate(
    () => window.__wegolite?.test?.advanceTicks(600) ?? -1,
  );
  expect(afterFlight).toBe(601);
  await waitForFrames(page, 1);

  const browser = await page.evaluate(() => ({
    tick: window.__wegolite?.sim?.tick,
    mode: window.__wegolite?.mode,
    epoch: window.__wegolite?.sim?.epoch,
    worldLive: window.__wegolite?.sim?.worldLive,
    entities: window.__wegolite?.sim?.entities,
    hash: window.__wegolite?.test?.worldHash(),
  }));

  const replay = runTickScript([
    { commands: [{ kind: "launch" }], ticks: 1 },
    { commands: [], ticks: 600 },
  ]);
  expect(browser.tick).toBe(replay.state.tick);
  expect(browser.mode).toBe(replay.state.mode);
  expect(browser.hash).toBe(replay.hash);
  // With no populator the world is empty, so the hash is the flight hash: the
  // browser and Node cannot agree on the same wrong value.
  expect(replay.hash).toBe(hashFlight(replay.state));
  expect(browser.epoch).toBe(1);
  expect(browser.worldLive).toBe(true);
  expect(browser.entities).toBe(0);
});

test("traffic is off under ?test=1 and on only for a spec that opts in", async ({
  page,
}) => {
  await bootDocked(page, "/?test=1&clock=manual&traffic=1");
  expect((await sample(page)).traffic).toBe(true);
  await page.click('button[data-action="launch"]');
  await waitForFrames(page, 1);
  await page.evaluate(() => window.__wegolite?.test?.advanceTicks(1));
  await waitForFrames(page, 1);
  const flying = await sample(page);
  expect(flying.traffic).toBe(true);
  expect(flying.worldLive).toBe(true);
  // The opt-in populates the Lave through the system populator: the census's
  // epoch-1 count of 28 ships (plan 22-14, owner-sanctioned under Phase 21 D-04,
  // from the 12 inert ships of plan 12-07; WORLD-16 sanctions the opt-in).
  expect(flying.entities).toBe(28);
});

test("the clock and traffic flags are inert without ?test=1", async ({
  page,
}) => {
  // The e2e bundle defaults traffic off at build time (Key Decisions row
  // "Browser test builds default traffic off"); `traffic=1` without the hook
  // cannot turn it on, which is what this case proves.
  await bootDocked(page, "/?clock=manual&traffic=1");
  expect(await page.evaluate(() => window.__wegolite?.test)).toBeUndefined();
  const before = await sample(page);
  expect(before.clock).toBe("realtime");
  expect(before.traffic).toBe(false);
  // The realtime clock steps by itself, even while docked.
  await page.waitForFunction(
    (tick) => (window.__wegolite?.sim?.tick ?? 0) > tick,
    before.tick,
    { timeout: SLOW },
  );
});

test("under plain ?test=1 advanceTicks refuses and worldHash reads", async ({
  page,
}) => {
  await bootDocked(page, "/?test=1");
  const before = (await sample(page)).tick;
  const kinds = await page.evaluate(() => ({
    advanceTicks: typeof window.__wegolite?.test?.advanceTicks,
    worldHash: typeof window.__wegolite?.test?.worldHash,
    hash: window.__wegolite?.test?.worldHash(),
  }));
  expect(kinds.advanceTicks).toBe("function");
  expect(kinds.worldHash).toBe("function");
  expect(kinds.hash).toMatch(/^[0-9a-f]{8}$/);

  await page.evaluate(() => window.__wegolite?.test?.advanceTicks(100000));
  await waitForFrames(page, 1);
  const after = await sample(page);
  // Only the realtime docked advance of a few frames, never a 100,000-tick step.
  expect(after.tick - before).toBeLessThan(1000);
  expect(await page.evaluate(() => window.__wegolite?.test?.tainted)).toBe(
    false,
  );
});
