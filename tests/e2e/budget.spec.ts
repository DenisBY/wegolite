// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The per-scene draw-call and triangle budget (QUAL-01, D-10, D-12).
 *
 * This spec gates deterministic budgets only. It never asserts a frame time:
 * a wall-clock frame rate inside the container measures SwiftShader, not a
 * player's GPU (research Pitfall 1), so 60 fps is claimed only from the manual
 * reference-desktop run recorded in docs/PERFORMANCE.md (D-10b). The planet
 * noise-evaluation budget is gated separately by tests/render/planet-budget.test.ts
 * (D-12).
 *
 * The probe publishes `renderer.info.render.calls` and `.triangles` for the most
 * recently rendered frame (src/app/game-session.ts). A scene is read only after
 * three further rendered frames, so the counters describe a settled scene. Every
 * comparison is inclusive: 50 calls and 250 000 triangles pass, 51 and 250 001
 * fail.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { systemByName } from "./helpers/chart.js";
import { dockedSaveAt } from "./helpers/save-fixtures.js";
import { writeRaw } from "./helpers/save-store.js";
import { getProbe, press, waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

test.setTimeout(300_000);

/** Draw calls per rendered frame (STACK.md lines 442-443, research target). */
const DRAW_CALL_BUDGET = 50;
/** Triangles per rendered frame (STACK.md lines 442-443, research target). */
const TRIANGLE_BUDGET = 250_000;
/** Rendered frames to wait for after a scene is reached, so counters settle. */
const SETTLE_FRAMES = 3;
/** The Diso system, reached through an IndexedDB save fixture. */
const DISO_ID = systemByName("Diso").id;
/** One MiB, the rounding unit of the first-load ceiling. */
const MIB = 1_048_576;
/**
 * Regression ceiling for the cold-start transfer to the first in-flight frame
 * (T-07-14, D-14). The measured baseline was 20 996 848 bytes (20.03 MiB) on
 * 2026-11-08, rounded up to the next MiB.
 */
const FIRST_LOAD_BYTES_CEILING = 21 * MIB;

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

/**
 * Assert one scene is inside the budget. The mode check ties the counters to the
 * scene the annotation names, so a scene cannot pass by reading another mode.
 */
async function expectWithinBudget(
  page: Page,
  scene: string,
  mode: string,
): Promise<void> {
  const before = (await getProbe(page)).renders;
  await page.waitForFunction(
    (wait: { since: number; frames: number }) => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.ready === true &&
        probe.renders >= wait.since + wait.frames
      );
    },
    { since: before, frames: SETTLE_FRAMES },
    { timeout: 60_000 },
  );
  const probe = await getProbe(page);
  test.info().annotations.push({
    type: `budget-${scene}`,
    description: `${probe.calls} calls, ${probe.triangles} triangles`,
  });
  expect(probe.mode, `${scene}: flight mode`).toBe(mode);
  expect(probe.calls, `${scene}: draw calls (vacuity guard)`).toBeGreaterThan(
    0,
  );
  expect(
    probe.triangles,
    `${scene}: triangles (vacuity guard)`,
  ).toBeGreaterThan(0);
  expect(probe.calls, `${scene}: draw-call budget`).toBeLessThanOrEqual(
    DRAW_CALL_BUDGET,
  );
  expect(probe.triangles, `${scene}: triangle budget`).toBeLessThanOrEqual(
    TRIANGLE_BUDGET,
  );
}

test("Lave docked, launching and in-flight scenes stay within the draw-call and triangle budget", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await waitForReady(page);
  await startNewGame(page);
  await waitForMode(page, "docked");
  await expectWithinBudget(page, "lave-docked", "docked");
  await press(page, "Digit1");
  await waitForMode(page, "launching");
  await expectWithinBudget(page, "lave-launching", "launching");
  await waitForMode(page, "inFlight");
  await expectWithinBudget(page, "lave-in-flight", "inFlight");
  expect(errors).toEqual([]);
});

test("a second system's docked and in-flight scenes stay within the budget", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await waitForReady(page);
  await writeRaw(page, dockedSaveAt("Diso"));
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  await page.click("#title-continue");
  await waitForMode(page, "docked");
  expect((await getProbe(page)).systemId).toBe(DISO_ID);
  await expectWithinBudget(page, "diso-docked", "docked");
  await press(page, "Digit1");
  await waitForMode(page, "inFlight");
  expect((await getProbe(page)).systemId).toBe(DISO_ID);
  await expectWithinBudget(page, "diso-in-flight", "inFlight");
  expect(errors).toEqual([]);
});

test("a cold start to the first in-flight frame stays under the first-load bytes ceiling", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;
  const transferred: Promise<number>[] = [];
  page.on("requestfinished", (request) => {
    if (new URL(request.url()).origin !== origin) return;
    transferred.push(request.sizes().then((sizes) => sizes.responseBodySize));
  });
  await page.goto("/");
  await waitForReady(page);
  await startNewGame(page);
  await waitForMode(page, "docked");
  await press(page, "Digit1");
  await waitForMode(page, "inFlight");
  const total = (await Promise.all(transferred)).reduce(
    (sum, bytes) => sum + bytes,
    0,
  );
  test.info().annotations.push({
    type: "first-load-bytes",
    description: `${total} bytes (ceiling ${FIRST_LOAD_BYTES_CEILING})`,
  });
  expect(total, "first-load bytes").toBeGreaterThan(0);
  expect(total, "first-load bytes ceiling").toBeLessThanOrEqual(
    FIRST_LOAD_BYTES_CEILING,
  );
});
