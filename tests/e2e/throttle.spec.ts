// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tab-throttle proofs (QUAL-05, research Pattern 4).
 *
 * A hidden tab must pause the session without advancing simulated time or
 * writing a save, and a stalled main thread must never produce a catch-up burst.
 *
 * A hidden tab is simulated by overriding `document.visibilityState` and
 * dispatching the real `visibilitychange` event, and a stalled tab by a busy
 * loop on the main thread. Playwright's clock API is deliberately not installed:
 * how a faked `requestAnimationFrame` interacts with this loop is unverified (A13).
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { DT, MAX_STEPS_PER_FRAME } from "../../src/sim/time.js";
import { getProbe, waitForReady } from "./helpers/probe.js";
import { readRaw } from "./helpers/save-store.js";
import { startNewGame } from "./helpers/title.js";

test.setTimeout(600_000);

/** Two animation frames: the fixed-step bound is checked per rendered frame. */
const FRAME_SAMPLE = 2;
/** A float tolerance for the sum of fixed steps. */
const EPSILON = 1e-9;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
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

/** Await `count` real animation frames. */
async function waitFrames(page: Page, count: number): Promise<void> {
  await page.evaluate(
    (total) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const tick = (): void => {
          seen += 1;
          if (seen >= total) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    count,
  );
}

/** Dispatch the real visibility change with the given `visibilityState`. */
async function setVisibility(
  page: Page,
  state: "hidden" | "visible",
): Promise<void> {
  await page.evaluate((next) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => next,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

/** The simulated time and rendered frames across `FRAME_SAMPLE` animation frames. */
async function sampleAcrossFrames(
  page: Page,
): Promise<{ flightDelta: number; rendersDelta: number }> {
  return page.evaluate(
    (frames) =>
      new Promise<{ flightDelta: number; rendersDelta: number }>((resolve) => {
        const start = window.__wegolite;
        if (start === undefined) throw new Error("the probe is missing");
        const startFlight = start.flightTime;
        const startRenders = start.renders;
        let seen = 0;
        const tick = (): void => {
          seen += 1;
          if (seen < frames) {
            requestAnimationFrame(tick);
            return;
          }
          const end = window.__wegolite;
          if (end === undefined) throw new Error("the probe is missing");
          resolve({
            flightDelta: end.flightTime - startFlight,
            rendersDelta: end.renders - startRenders,
          });
        };
        requestAnimationFrame(tick);
      }),
    FRAME_SAMPLE,
  );
}

test("a hidden tab pauses without catching up or saving, and stays paused until the player resumes", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await waitForReady(page);
  await startNewGame(page);
  await waitForMode(page, "docked");
  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");
  await waitFrames(page, 6);

  const bytesBefore = await readRaw(page);
  const attemptsBefore = (await getProbe(page)).save?.attempts;

  await setVisibility(page, "hidden");
  await page.waitForFunction(
    () => window.__wegolite?.paused === true,
    undefined,
    {
      timeout: 15_000,
    },
  );
  const hiddenFlight = (await getProbe(page)).flightTime;
  await page.waitForTimeout(3_000);
  const hidden = await getProbe(page);
  expect(hidden.flightTime).toBe(hiddenFlight);
  expect(hidden.save?.attempts).toBe(attemptsBefore);
  expect(await readRaw(page)).toBe(bytesBefore);

  await setVisibility(page, "visible");
  await page.waitForTimeout(1_000);
  expect((await getProbe(page)).paused).toBe(true);

  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.__wegolite?.paused === false,
    undefined,
    {
      timeout: 15_000,
    },
  );
  const resumed = await sampleAcrossFrames(page);
  expect(resumed.rendersDelta).toBeGreaterThanOrEqual(1);
  // The bound below is vacuous unless the sim really advanced in the sample.
  expect(resumed.flightDelta).toBeGreaterThan(0);
  expect(resumed.flightDelta).toBeLessThanOrEqual(
    resumed.rendersDelta * MAX_STEPS_PER_FRAME * DT + EPSILON,
  );
  expect(errors).toEqual([]);
});

test("a stalled main thread runs at most MAX_STEPS_PER_FRAME fixed steps per rendered frame", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await waitForReady(page);
  await startNewGame(page);
  await waitForMode(page, "docked");
  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");
  await waitFrames(page, 6);

  // A 2 s busy loop stands in for a stalled tab. A 2 s catch-up would be 240
  // fixed steps in one rendered frame, far above the per-frame cap.
  const stalled = await page.evaluate(
    (frames) =>
      new Promise<{ flightDelta: number; rendersDelta: number }>((resolve) => {
        const start = window.__wegolite;
        if (start === undefined) throw new Error("the probe is missing");
        const startFlight = start.flightTime;
        const startRenders = start.renders;
        const until = performance.now() + 2_000;
        while (performance.now() < until) {
          // Busy wait on the main thread.
        }
        let seen = 0;
        const tick = (): void => {
          seen += 1;
          if (seen < frames) {
            requestAnimationFrame(tick);
            return;
          }
          const end = window.__wegolite;
          if (end === undefined) throw new Error("the probe is missing");
          resolve({
            flightDelta: end.flightTime - startFlight,
            rendersDelta: end.renders - startRenders,
          });
        };
        requestAnimationFrame(tick);
      }),
    FRAME_SAMPLE,
  );

  expect(stalled.rendersDelta).toBeGreaterThanOrEqual(1);
  // The bound below is vacuous unless the sim really advanced after the stall.
  expect(stalled.flightDelta).toBeGreaterThan(0);
  expect(stalled.flightDelta).toBeLessThanOrEqual(
    stalled.rendersDelta * MAX_STEPS_PER_FRAME * DT + EPSILON,
  );
  expect(errors).toEqual([]);
});
