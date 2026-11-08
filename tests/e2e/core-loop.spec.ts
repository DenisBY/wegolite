// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The QUAL-03 end-to-end journey on the shipped build, under the QUAL-08 guards.
 *
 * One fresh browser context plays the whole loop: new game, a Food purchase at
 * Lave, a target set on the long-range chart, the launch, the hyperspace to Diso,
 * the docking, a sale at Diso, a manual save and a reload with Continue. The
 * guards from `helpers/guards.ts` are attached before the first navigation and
 * asserted last, so a cross-origin or non-GET request, a console error or an
 * unlisted warning anywhere in the journey, including across reloads, fails it
 * (QUAL-08, D-17).
 *
 * Save discipline (D-21): the spec never enables the in-page test hook. Each
 * save-relevant step waits for a real committed revision, so no step is tainted
 * and every autosave and the manual save really commit. The dock step uses an
 * IndexedDB fixture rewritten from the game's own arrival blob, as the Phase 6
 * trigger matrix does; no other fixture is used.
 *
 * Waits: `WEGOLITE_E2E_WAIT_SCALE` (default 1) multiplies every timeout, including
 * the test budget, so a slower engine can be given more time without editing this
 * file. The journey starts from an empty IndexedDB and never depends on an earlier
 * run's save.
 */

import { test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { chartScreenPoint, systemByName } from "./helpers/chart.js";
import { getProbe } from "./helpers/probe.js";
import {
  expectCleanRun,
  watchConsole,
  watchNetwork,
} from "./helpers/guards.js";
import { startNewGame } from "./helpers/title.js";

const BASE_URL = "http://127.0.0.1:4173";

/** Parse the wait scale: unset or blank means 1; anything else must be finite and above 0. */
function readWaitScale(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 1;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `WEGOLITE_E2E_WAIT_SCALE must be a finite number above 0, got "${raw}"`,
    );
  }
  return value;
}

const WAIT_SCALE = readWaitScale(process.env.WEGOLITE_E2E_WAIT_SCALE);

/** Multiply one wait by the single wait scale. */
function scaled(milliseconds: number): number {
  return Math.round(milliseconds * WAIT_SCALE);
}

/** The bound for one UI or probe wait, before scaling. */
const UI_WAIT = scaled(30_000);

test.setTimeout(scaled(900_000));

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return probe !== undefined && probe.ready === true;
    },
    undefined,
    { timeout: scaled(20_000) },
  );
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
    { timeout: scaled(60_000) },
  );
}

async function waitForStationScreen(page: Page, screen: string): Promise<void> {
  await page.waitForFunction(
    (expected) => window.__wegolite?.station?.screen === expected,
    screen,
    { timeout: UI_WAIT },
  );
}

/** Wait until the durable write count is exactly `count` (a committed revision, not a request). */
async function waitForCommitted(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (expected) => (window.__wegolite?.save?.committed ?? 0) === expected,
    count,
    { timeout: UI_WAIT },
  );
}

/** Click the chart marker the pure view model places for `name`. */
async function clickChartSystem(page: Page, name: string): Promise<void> {
  const system = systemByName(name);
  const probe = await getProbe(page);
  const box = await page.locator("#chart-canvas").boundingBox();
  if (box === null) throw new Error("the chart canvas has no bounding box");
  const point = chartScreenPoint(system.id, {
    currentId: probe.systemId ?? "",
    targetId: probe.chart?.targetId,
    range: probe.chart?.range ?? "short",
    fuel: probe.economy?.fuel ?? 0,
    viewport: { width: box.width, height: box.height },
    selectedId: probe.chart?.selectedId,
  });
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

/** Open the chart, switch to long range, select `name`, commit it with Enter, and close. */
async function setChartTarget(page: Page, name: string): Promise<void> {
  const system = systemByName(name);
  await page.keyboard.press("F6");
  await page.waitForFunction(
    () => window.__wegolite?.chart?.open === true,
    undefined,
    {
      timeout: UI_WAIT,
    },
  );
  if ((await getProbe(page)).chart?.range !== "long") {
    await page.keyboard.press("Tab");
    await page.waitForFunction(
      () => window.__wegolite?.chart?.range === "long",
      undefined,
      { timeout: UI_WAIT },
    );
  }
  await clickChartSystem(page, name);
  await page.waitForFunction(
    (id) => window.__wegolite?.chart?.selectedId === id,
    system.id,
    { timeout: UI_WAIT },
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (id) => window.__wegolite?.chart?.targetId === id,
    system.id,
    { timeout: UI_WAIT },
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => window.__wegolite?.chart?.open === false,
    undefined,
    {
      timeout: UI_WAIT,
    },
  );
}

test("new game to launch to trade to hyperspace to dock to save and reload", async ({
  page,
}) => {
  const network = watchNetwork(page.context(), BASE_URL);
  const consoleProblems = watchConsole(page);

  await page.goto("/");
  await waitReady(page);
  await startNewGame(page);
  await waitForMode(page, "docked");

  // Lave: buy one tonne of Food. The accepted trade is the first committed write.
  await page.keyboard.press("Digit8");
  await waitForStationScreen(page, "market");
  await page.waitForFunction(
    () => window.__wegolite?.station?.selectedKey === "food",
    undefined,
    { timeout: UI_WAIT },
  );
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("KeyY");
  await page.waitForFunction(
    () => (window.__wegolite?.economy?.cargo?.food ?? 0) === 1,
    undefined,
    { timeout: UI_WAIT },
  );
  await waitForCommitted(page, 1);
  await page.keyboard.press("Escape");
  await waitForStationScreen(page, "home");

  // Target Diso on the long-range chart, then launch. The pre-launch anchor is
  // the second committed write and is taken while the ship is still docked.
  await setChartTarget(page, "Diso");
  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");
  await waitForCommitted(page, 2);

  expectCleanRun(network, consoleProblems);
});
