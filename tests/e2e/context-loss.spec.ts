// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The WebGL context-loss recovery proofs (QUAL-05, D-15, D-16).
 *
 * A lost context pauses the session and blocks resume and every save. A restore
 * recreates render resources by drawing the live scene while still paused, and
 * P resumes only by player action. Research Pattern 3 and Pitfall 9 are the
 * sources: the save bytes must never change across the loss, the restore, the
 * resume or the failure surface.
 *
 * The loss is simulated with the browser's own `WEBGL_lose_context` extension,
 * so the real `webglcontextlost` and `webglcontextrestored` events drive the app.
 * Every wait is on `window.__wegolite`; there is no pixel comparison (D-08).
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  CONTEXT_LOST_NOTICE,
  CONTEXT_RESTORED_NOTICE,
  CONTEXT_RESTORE_FAILURE_COPY,
} from "../../src/app/context-recovery.js";
import { getProbe, waitForReady } from "./helpers/probe.js";
import { readRaw } from "./helpers/save-store.js";
import { startNewGame } from "./helpers/title.js";

test.setTimeout(600_000);

/** The extension handle this spec stashes on `window` between evaluations. */
interface LoseContextWindow {
  __loseContextExt?: WEBGL_lose_context | null;
}

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

/** Await `count` real animation frames, so the freeze proof is frame-based. */
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

test("a lost context pauses, a restore recreates render resources while paused, and P resumes", async ({
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
  const before = await page.evaluate(() => {
    const probe = window.__wegolite;
    if (probe === undefined || probe.ready !== true) {
      throw new Error("the probe is not ready");
    }
    const canvas = document.getElementById("view");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("the view canvas is missing");
    }
    const gl = canvas.getContext("webgl2");
    if (gl === null) throw new Error("the WebGL2 context is missing");
    const extension = gl.getExtension("WEBGL_lose_context");
    if (extension === null) {
      throw new Error("WEBGL_lose_context is unavailable");
    }
    (window as LoseContextWindow).__loseContextExt = extension;
    const snapshot = {
      flightTime: probe.flightTime,
      calls: probe.calls,
      triangles: probe.triangles,
    };
    extension.loseContext();
    return snapshot;
  });

  await page.waitForFunction(
    () =>
      window.__wegolite?.recovery?.state === "lost" &&
      window.__wegolite?.paused === true,
    undefined,
    { timeout: 15_000 },
  );
  const lost = await getProbe(page);
  const flightAtLoss = lost.flightTime;
  await expect(page.locator("[data-pause-notice]")).toHaveText(
    CONTEXT_LOST_NOTICE,
  );
  await page.waitForTimeout(1_500);
  expect((await getProbe(page)).flightTime).toBe(flightAtLoss);

  // P is refused while the context is lost: the session stays paused.
  await page.keyboard.press("KeyP");
  await page.waitForTimeout(500);
  expect((await getProbe(page)).paused).toBe(true);

  await page.evaluate(() => {
    const extension = (window as LoseContextWindow).__loseContextExt;
    if (extension === null || extension === undefined) {
      throw new Error("the lose-context extension was not stored");
    }
    extension.restoreContext();
  });
  await page.waitForFunction(
    () =>
      window.__wegolite?.recovery?.state === "live" &&
      (window.__wegolite?.calls ?? 0) > 0,
    undefined,
    { timeout: 20_000 },
  );

  const restored = await getProbe(page);
  expect(restored.triangles).toBe(before.triangles);
  expect(restored.paused).toBe(true);
  expect(restored.flightTime).toBe(flightAtLoss);
  expect(restored.recovery).toEqual({ state: "live", losses: 1, restores: 1 });
  await expect(page.locator("[data-pause-notice]")).toHaveText(
    CONTEXT_RESTORED_NOTICE,
  );
  expect(await readRaw(page)).toBe(bytesBefore);

  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    (lostFlight) => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.paused === false &&
        probe.flightTime > lostFlight
      );
    },
    flightAtLoss,
    { timeout: 15_000 },
  );
  expect(await readRaw(page)).toBe(bytesBefore);
  expect(errors).toEqual([]);
});

/** Lose the context through the stored extension, or fetch it from a live context. */
async function loseContext(page: Page): Promise<void> {
  await page.evaluate(() => {
    const stash = window as LoseContextWindow;
    if (
      stash.__loseContextExt === undefined ||
      stash.__loseContextExt === null
    ) {
      const canvas = document.getElementById("view");
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("the view canvas is missing");
      }
      const gl = canvas.getContext("webgl2");
      if (gl === null) throw new Error("the WebGL2 context is missing");
      stash.__loseContextExt = gl.getExtension("WEBGL_lose_context");
    }
    if (
      stash.__loseContextExt === null ||
      stash.__loseContextExt === undefined
    ) {
      throw new Error("WEBGL_lose_context is unavailable");
    }
    stash.__loseContextExt.loseContext();
  });
  await page.waitForFunction(
    () =>
      window.__wegolite?.recovery?.state === "lost" &&
      window.__wegolite?.paused === true,
    undefined,
    { timeout: 15_000 },
  );
}

async function restoreContext(page: Page): Promise<void> {
  await page.evaluate(() => {
    const extension = (window as LoseContextWindow).__loseContextExt;
    if (extension === null || extension === undefined) {
      throw new Error("the lose-context extension was not stored");
    }
    extension.restoreContext();
  });
  await page.waitForFunction(
    () =>
      window.__wegolite?.recovery?.state === "live" &&
      (window.__wegolite?.calls ?? 0) > 0,
    undefined,
    { timeout: 20_000 },
  );
}

test("a second loss after a restore recovers the same way, and a docked session resumes to a working station", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await waitForReady(page);
  await startNewGame(page);
  await waitForMode(page, "docked");

  const bytesBefore = await readRaw(page);
  await loseContext(page);
  await restoreContext(page);
  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.__wegolite?.paused === false,
    undefined,
    {
      timeout: 15_000,
    },
  );

  await loseContext(page);
  await restoreContext(page);
  const twice = await getProbe(page);
  expect(twice.recovery).toEqual({ state: "live", losses: 2, restores: 2 });
  expect(twice.paused).toBe(true);
  expect(await readRaw(page)).toBe(bytesBefore);

  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.__wegolite?.paused === false,
    undefined,
    {
      timeout: 15_000,
    },
  );
  await page.keyboard.press("Digit8");
  await page.waitForFunction(
    () => window.__wegolite?.station?.screen === "market",
    undefined,
    { timeout: 15_000 },
  );
  expect(await readRaw(page)).toBe(bytesBefore);
  expect(errors).toEqual([]);
});

test("no restore within 10 s shows the failure surface and keeps the save", async ({
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
  await loseContext(page);

  const failure = page.locator("#failure");
  await expect(failure).toBeVisible({ timeout: 20_000 });
  await expect(failure).toContainText(CONTEXT_RESTORE_FAILURE_COPY);
  const failed = await page.evaluate(() => window.__wegolite?.ready);
  expect(failed).toBe(false);
  expect(await readRaw(page)).toBe(bytesBefore);
  expect(errors).toEqual([]);
});
