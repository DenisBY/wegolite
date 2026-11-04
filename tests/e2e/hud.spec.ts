// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The flight HUD browser proof (FLGT-05, D-05, D-07, D-08).
 *
 * No screenshots and no pixel diffs: the spec reads the HUD canvas backing size
 * and the probe's design-space numbers in one `evaluate`, so the assertion
 * describes the same frame. The launch/flight hint lifecycle is deliberately
 * *not* asserted here — plan 03-07 owns `tests/e2e/launch.spec.ts` and the
 * `HintController`.
 */

import { expect, test } from "@playwright/test";

import { MAX_MESSAGE_CHARS } from "../../src/render/hud/format.js";
import { getProbe, waitForReady } from "./helpers/probe.js";

interface HudFrame {
  readonly canvas: { width: number; height: number } | null;
  readonly viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  readonly hud: {
    drawn: boolean;
    elements: string[];
    designScale: number;
    letterbox: [number, number];
    contacts: string[];
    compass: { target: string; forward: boolean };
    aegis: string;
    message: string;
    bounds: Record<string, readonly [number, number, number, number]>;
  };
}

async function launch(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/?test=1");
  await waitForReady(page);
  await page.click("#title-start");
  await page.click('button[data-action="launch"]');
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return (
        probe !== undefined && probe.ready === true && probe.mode === "inFlight"
      );
    },
    undefined,
    { timeout: 30_000 },
  );
}

function readHud(page: import("@playwright/test").Page): Promise<HudFrame> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#hud");
    const probe = window.__wegolite;
    if (probe === undefined || probe.ready !== true) {
      throw new Error("the probe is not ready");
    }
    return {
      canvas:
        canvas === null ? null : { width: canvas.width, height: canvas.height },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      hud: probe.hud,
    };
  });
}

test("the scanner and compass draw and the probe reports the station contact", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await launch(page);

  const frame = await readHud(page);
  expect(frame.canvas?.width ?? 0).toBeGreaterThan(0);
  expect(frame.canvas?.height ?? 0).toBeGreaterThan(0);
  expect(frame.hud.drawn).toBe(true);
  expect(frame.hud.elements).toContain("crosshair");
  expect(frame.hud.elements).toContain("scanner");
  expect(frame.hud.elements).toContain("compass");
  expect(frame.hud.contacts).toContain("station");

  // The probe is numeric: the compass target and aegis come from the same model
  // the canvas drew, not from a second code path.
  expect(frame.hud.compass.target).toBe("station");
  expect(frame.hud.aegis).toBe("dockingRange");

  const probe = await getProbe(page);
  expect(probe.hud.drawn).toBe(true);

  // Asserted last so a rendering failure is reported before any noise.
  expect(errors).toEqual([]);
});

test("the HUD set is the eleven v1 elements and letterboxes on ultrawide", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await launch(page);

  const required = [
    "crosshair",
    "scanner",
    "compass",
    "aegis",
    "speed",
    "roll",
    "pitch",
    "fuel",
    "clock",
    "condition",
    "message",
  ];
  const postV1 = [
    "shield",
    "shields",
    "energy",
    "temperature",
    "missile",
    "missiles",
    "reticle",
    "mfd",
  ];

  const initial = await readHud(page);
  expect([...initial.hud.elements].sort()).toEqual([...required].sort());
  for (const name of postV1) {
    expect(initial.hud.elements.map((id) => id.toLowerCase())).not.toContain(
      name,
    );
  }

  // 2560x1080 is wider than 16:9, so the fixed 1920x1080 design space must be
  // centred with a horizontal letterbox margin — never stretched or edge-anchored.
  await page.setViewportSize({ width: 2560, height: 1080 });
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector<HTMLCanvasElement>("#hud");
      const probe = window.__wegolite;
      return (
        canvas !== null &&
        canvas.width === 2560 &&
        probe !== undefined &&
        probe.hud.letterbox[0] > 0
      );
    },
    undefined,
    { timeout: 10_000 },
  );

  const frame = await readHud(page);
  const canvas = frame.canvas;
  if (canvas === null) throw new Error("the HUD canvas is missing");

  const dpr = Math.min(frame.viewport.devicePixelRatio, 2);
  expect(canvas.width).toBe(Math.round(frame.viewport.width * dpr));
  expect(canvas.height).toBe(Math.round(frame.viewport.height * dpr));

  const [offsetX, offsetY] = frame.hud.letterbox;
  const scale = frame.hud.designScale;
  expect(scale).toBeGreaterThan(0);
  expect(scale).toBe(Math.min(canvas.width / 1920, canvas.height / 1080));
  expect(offsetX).toBeGreaterThan(0);
  expect(offsetY).toBeGreaterThanOrEqual(0);
  expect(offsetX + 1920 * scale).toBeLessThanOrEqual(canvas.width + 1e-6);
  expect(offsetY + 1080 * scale).toBeLessThanOrEqual(canvas.height + 1e-6);

  // Every element's design-space rect stays inside the fixed design rect.
  for (const id of required) {
    const rect = frame.hud.bounds[id];
    if (rect === undefined)
      throw new Error(`the probe has no bounds for ${id}`);
    const [x, y, width, height] = rect;
    expect(x, `${id}.x`).toBeGreaterThanOrEqual(0);
    expect(y, `${id}.y`).toBeGreaterThanOrEqual(0);
    expect(x + width, `${id}.x + width`).toBeLessThanOrEqual(1920);
    expect(y + height, `${id}.y + height`).toBeLessThanOrEqual(1080);
  }

  // The footer disclaimer must remain visible above the HUD overlay.
  await expect(page.locator("footer")).toBeVisible();

  // Asserted last so a rendering failure is reported before any noise.
  expect(errors).toEqual([]);
});

test("the message line is one clamped line and expires on flightTime", async ({
  page,
}) => {
  // The queue expires on simulated time, and SwiftShader advances the fixed
  // step far slower than wall time. This is a correctness wait, not a
  // performance claim (Pitfall 15). The 300 s ceiling is deliberately generous
  // (roughly double the measured ~153 s) because a harness cadence regression
  // must fail as "stuck", not as "slow".
  test.setTimeout(330_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await launch(page);

  const initial = await readHud(page);
  expect(initial.hud.message.length).toBeGreaterThan(0);
  expect(initial.hud.message.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
  expect(initial.hud.message).not.toContain("\n");

  // The app enqueued the launch/compass messages; the queue must drain them on
  // flightTime and leave the line empty, not keep the last string forever.
  try {
    await page.waitForFunction(
      () => window.__wegolite?.hud.message === "",
      undefined,
      { timeout: 300_000 },
    );
  } catch (error) {
    // Best-effort diagnostics: a closed page or a serialisation failure must
    // degrade to "probe unavailable", never mask the timeout.
    const observed = await page
      .evaluate(() => {
        const probe = window.__wegolite;
        return probe === undefined
          ? null
          : { renders: probe.renders, flightTime: probe.flightTime };
      })
      .catch(() => null);
    const seen =
      observed === null
        ? "probe unavailable"
        : `renders=${observed.renders}, flightTime=${observed.flightTime}`;
    throw new Error(
      "the message line had not expired after 300 s (" +
        seen +
        "): " +
        (error instanceof Error ? error.message : String(error)),
      { cause: error },
    );
  }

  const after = await readHud(page);
  expect(after.hud.message).toBe("");
  expect(after.hud.drawn).toBe(true);

  // Asserted last so a rendering failure is reported before any noise.
  expect(errors).toEqual([]);
});
