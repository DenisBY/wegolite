// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The engine smoke (QUAL-02, D-07, D-09).
 *
 * One browser path that any Playwright engine can run: boot, start a new game
 * into the docked Lave scene, read the WebGL2 renderer string from the game
 * canvas, and sample the frame counter across five wall-clock seconds. The spec
 * asserts the WebGL2 context, the ready probe, advancing frames and a clean
 * console, and it records the renderer and the measured cadence as test
 * annotations so each engine that runs it reports its own numbers.
 *
 * This is an engine smoke, not a browser claim. D-07 claims only current stable
 * Chrome and current stable Firefox; a green WebKit run is engine evidence and
 * is never Safari evidence. Every wait is on window.__wegolite; there is no
 * screenshot and no pixel diff (D-08).
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getProbe, waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

/** Wall-clock window over which the docked frame cadence is measured. */
const SAMPLE_MS = 5_000;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

/**
 * Read the renderer string from the game canvas's WebGL2 context. The unmasked
 * renderer is preferred; when the debug extension is absent the masked RENDERER
 * string is used. Returns null when no WebGL2 context can be read.
 */
async function readRenderer(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const canvas = document.getElementById("view");
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const gl = canvas.getContext("webgl2");
    if (gl === null) return null;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const value: unknown = debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return typeof value === "string" ? value : null;
  });
}

test("the engine creates a WebGL2 context and renders advancing frames", async ({
  page,
}) => {
  // A software rasteriser may be slow, so the bound is generous.
  test.setTimeout(180_000);
  const errors = collectErrors(page);

  await page.goto("/");
  await waitForReady(page);
  const boot = await getProbe(page);
  expect(boot.webgl2).toBe(true);

  await startNewGame(page);
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return (
        probe !== undefined && probe.ready === true && probe.mode === "docked"
      );
    },
    undefined,
    { timeout: 90_000 },
  );

  const renderer = await readRenderer(page);
  const before = await getProbe(page);
  const startedAt = await page.evaluate(() => performance.now());
  await page.waitForTimeout(SAMPLE_MS);
  const after = await getProbe(page);
  const endedAt = await page.evaluate(() => performance.now());

  const frames = after.renders - before.renders;
  const cadence = frames / ((endedAt - startedAt) / 1000);

  // Annotations are pushed before the assertions so a failing engine still
  // reports the renderer and the measured cadence.
  test
    .info()
    .annotations.push(
      { type: "engine-renderer", description: renderer ?? "unavailable" },
      { type: "engine-cadence-fps", description: cadence.toFixed(2) },
    );

  expect(after.webgl2).toBe(true);
  expect(after.mode).toBe("docked");
  expect(frames).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});
