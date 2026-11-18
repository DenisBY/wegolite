// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The zoomable, pannable F6 chart in the browser (D-01..D-10).
 *
 * The pure model runs in Vitest; this spec proves the shell gestures against
 * the production build. Every wait is a probe predicate, never a screenshot or
 * a fixed sleep. The camera is the single source the screen-point helper reads,
 * so an assertion about the wheel anchor is a statement about the same
 * projection the canvas painted.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { GALAXY0, chartScreenPoint, systemByName } from "./helpers/chart.js";
import { getProbe, waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

test.setTimeout(180_000);

const BEUSRIOR = systemByName("Beusrior");
const ESESLA = systemByName("Esesla");

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

async function bootDocked(page: Page): Promise<void> {
  await page.goto("/?test=1");
  await waitForReady(page);
  await startNewGame(page);
  await page.waitForFunction(
    () => window.__wegolite?.mode === "docked",
    undefined,
    { timeout: 30_000 },
  );
}

async function openChart(page: Page): Promise<void> {
  await page.keyboard.press("F6");
  await page.waitForFunction(() => window.__wegolite?.chart?.open === true, {
    timeout: 30_000,
  });
}

async function canvasBox(page: Page): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const box = await page.locator("#chart-canvas").boundingBox();
  if (box === null) throw new Error("the chart canvas has no bounding box");
  return box;
}

/** The page-pixel point the painter draws `systemId` at, from the live camera. */
async function markerPoint(
  page: Page,
  systemId: string,
): Promise<{ x: number; y: number }> {
  const probe = await getProbe(page);
  const camera = probe.chart?.camera;
  if (camera === undefined) throw new Error("the chart has no camera");
  const box = await canvasBox(page);
  const point = chartScreenPoint(systemId, {
    currentId: probe.systemId ?? "",
    targetId: probe.chart?.targetId,
    camera,
    fuel: probe.economy?.fuel ?? 0,
    viewport: { width: box.width, height: box.height },
    selectedId: probe.chart?.selectedId,
  });
  return { x: box.x + point.x, y: box.y + point.y };
}

/** Wait two animation frames so a suppressed click has fully settled. */
async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** Zoom in one notch around the canvas centre so the camera has pan room. */
async function zoomAtCentre(page: Page): Promise<void> {
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120);
  await page.waitForFunction(
    () => (window.__wegolite?.chart?.camera.spanX ?? 80) < 80,
    undefined,
    { timeout: 30_000 },
  );
}

test("the chart opens on the local preset without Short/Long sub-tabs", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootDocked(page);
  await openChart(page);

  const camera = (await getProbe(page)).chart?.camera;
  expect(camera?.spanX).toBe(80);
  expect(camera?.spanY).toBe(160);
  // Lave is at chart-x 20; the centre can reach the edge, so it stays on Lave.
  expect(camera?.centre).toEqual({ x: 20, y: 173 });
  await expect(page.locator("#chart .station-subnav")).toHaveCount(0);
  // Oolite's long-range-chart-title-d with galaxy_number + 1 (quick task
  // 261118-cyo).
  await expect(page.locator('#chart [data-field="chart-title"]')).toHaveText(
    "Galactic Chart 1",
  );

  expect(errors).toEqual([]);
});

test("hovering a system opens its information card and leaving closes it", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootDocked(page);
  await openChart(page);

  const lave = systemByName("Lave");
  const point = await markerPoint(page, lave.id);
  await page.mouse.move(point.x, point.y);

  const tooltip = page.locator("#chart-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(
    tooltip.locator('[data-field="chart-tooltip-title"]'),
  ).toHaveText("Lave");
  await expect(tooltip).toContainText("Rich Agricultural");
  await expect(tooltip).toContainText("Dictatorship");
  await expect(tooltip).toContainText("0.0 ly");
  // Oolite's sysdata-line-8: the inhabitants under the population, no label.
  await expect(tooltip).toContainText("(Human Colonials)");
  await expect(tooltip).not.toContainText("Inhabitants");
  await expect(
    tooltip.locator('[data-field="chart-tooltip-description"]'),
  ).toHaveText(
    "Lave is most famous for its vast rain forests and the Laveian tree grub.",
  );

  await page.mouse.move(1, 1);
  await expect(tooltip).toBeHidden();
  expect(errors).toEqual([]);
});

test("mouse wheel zooms around the cursor and clamps at both spans", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootDocked(page);
  await openChart(page);

  const anchor = await markerPoint(page, BEUSRIOR.id);
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.wheel(0, -120);
  await page.waitForFunction(
    () => (window.__wegolite?.chart?.camera.spanX ?? 80) < 80,
    undefined,
    { timeout: 30_000 },
  );

  // The chart point under the cursor is still under the cursor after the zoom.
  const afterZoom = await markerPoint(page, BEUSRIOR.id);
  expect(Math.abs(afterZoom.x - anchor.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(afterZoom.y - anchor.y)).toBeLessThanOrEqual(2);

  // Wheel out reaches, and stops at, the whole galaxy.
  for (let step = 0; step < 12; step += 1) {
    await page.mouse.wheel(0, 120);
  }
  await page.waitForFunction(
    () => window.__wegolite?.chart?.camera.spanX === 256,
    undefined,
    { timeout: 30_000 },
  );

  // Wheel in reaches, and stops at, the closest zoom.
  for (let step = 0; step < 25; step += 1) {
    await page.mouse.wheel(0, -120);
  }
  await page.waitForFunction(
    () => window.__wegolite?.chart?.camera.spanX === 20,
    undefined,
    { timeout: 30_000 },
  );

  expect(errors).toEqual([]);
});

test("left-button drag pans the camera inside the galaxy bounds", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootDocked(page);
  await openChart(page);
  await zoomAtCentre(page);

  const before = (await getProbe(page)).chart?.camera;
  if (before === undefined) throw new Error("the chart has no camera");
  const selectedBefore = (await getProbe(page)).chart?.selectedId;
  const box = await canvasBox(page);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 40, startY - 20, { steps: 4 });
  await page.mouse.move(startX + 80, startY - 40, { steps: 4 });
  await page.mouse.move(startX + 120, startY - 60, { steps: 4 });
  await page.mouse.up();

  await page.waitForFunction(
    (previousX) =>
      (window.__wegolite?.chart?.camera.centre.x ?? previousX) < previousX,
    before.centre.x,
    { timeout: 30_000 },
  );
  const after = (await getProbe(page)).chart?.camera;

  expect(after?.centre.x).toBeLessThan(before.centre.x);
  expect(after?.centre.y).not.toBe(before.centre.y);
  expect(after?.centre.x).toBeGreaterThanOrEqual(0);
  expect(after?.centre.x).toBeLessThanOrEqual(256);
  expect(after?.centre.y).toBeGreaterThanOrEqual(0);
  expect(after?.centre.y).toBeLessThanOrEqual(256);
  // A drag is not a selection.
  expect((await getProbe(page)).chart?.selectedId).toBe(selectedBefore);

  expect(errors).toEqual([]);
});

test("a plain click selects but a drag starting on a marker does not", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootDocked(page);
  await openChart(page);
  await zoomAtCentre(page);

  const clickPoint = await markerPoint(page, BEUSRIOR.id);
  await page.mouse.click(clickPoint.x, clickPoint.y);
  await page.waitForFunction(
    (id) => window.__wegolite?.chart?.selectedId === id,
    BEUSRIOR.id,
    { timeout: 30_000 },
  );

  const dragPoint = await markerPoint(page, ESESLA.id);
  await page.mouse.move(dragPoint.x, dragPoint.y);
  await page.mouse.down();
  await page.mouse.move(dragPoint.x + 40, dragPoint.y - 20, { steps: 4 });
  await page.mouse.move(dragPoint.x + 80, dragPoint.y - 40, { steps: 4 });
  await page.mouse.up();
  await settleFrames(page);

  // The click that follows a drag is suppressed, so Beusrior stays selected.
  expect((await getProbe(page)).chart?.selectedId).toBe(BEUSRIOR.id);

  expect(errors).toEqual([]);
});

test("Tab toggles the local and whole-galaxy presets", async ({ page }) => {
  const errors = collectErrors(page);
  await bootDocked(page);
  await openChart(page);

  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => window.__wegolite?.chart?.camera.spanX === 256,
    undefined,
    { timeout: 30_000 },
  );
  const galaxy = (await getProbe(page)).chart?.camera;
  expect(galaxy?.centre).toEqual({ x: 128, y: 128 });
  expect(galaxy?.spanY).toBe(512);

  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => window.__wegolite?.chart?.camera.spanX === 80,
    undefined,
    { timeout: 30_000 },
  );
  const local = (await getProbe(page)).chart?.camera;
  expect(local?.centre).toEqual({ x: 20, y: 173 });

  expect(errors).toEqual([]);
});

test("arrows, Enter and Escape keep their chart meaning", async ({ page }) => {
  const errors = collectErrors(page);
  await bootDocked(page);
  await openChart(page);

  await page.keyboard.press("ArrowUp");
  await page.waitForFunction(
    () => {
      const selected = window.__wegolite?.chart?.selectedId;
      return typeof selected === "string" && selected.length > 0;
    },
    undefined,
    { timeout: 30_000 },
  );
  const selectedId = (await getProbe(page)).chart?.selectedId;
  if (selectedId === undefined) throw new Error("ArrowUp selected nothing");

  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (id) => window.__wegolite?.chart?.targetId === id,
    selectedId,
    { timeout: 30_000 },
  );

  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => window.__wegolite?.chart?.open === false,
    undefined,
    { timeout: 30_000 },
  );

  expect(errors).toEqual([]);
});

test("Find planet searches by name from the keyboard", async ({ page }) => {
  const errors = collectErrors(page);
  await bootDocked(page);
  await openChart(page);

  // Oolite's prefix rule (Universe.m:7745-7771): lower-cased, in system-index
  // order. "la" has several matches in galaxy 1, Lave first.
  const matches = [...GALAXY0]
    .sort((left, right) => left.systemIndex - right.systemIndex)
    .filter((system) => system.name.toLowerCase().startsWith("la"))
    .map((system) => system.id);
  expect(matches.length).toBeGreaterThan(1);

  const box = page.locator('#chart [data-field="chart-find"]');
  const result = page.locator('#chart [data-field="chart-find-result"]');
  await page.keyboard.press("Slash");
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("");

  await page.keyboard.type("la");
  await expect
    .poll(async () => (await getProbe(page)).chart?.selectedId)
    .toBe(matches[0]);
  await expect(result).toHaveText(`1 of ${String(matches.length)}`);

  await page.keyboard.press("ArrowDown");
  await expect
    .poll(async () => (await getProbe(page)).chart?.selectedId)
    .toBe(matches[1]);
  await expect(result).toHaveText(`2 of ${String(matches.length)}`);

  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await getProbe(page)).chart?.targetId)
    .toBe(matches[1]);
  await expect(box).not.toBeFocused();

  // Inside the box, P is text and Escape clears: no pause, no close.
  await page.keyboard.press("Slash");
  await expect(box).toBeFocused();
  await page.keyboard.type("p");
  await expect(box).toHaveValue("p");
  await page.waitForTimeout(200);
  let probe = await getProbe(page);
  expect(probe.paused).toBe(false);
  expect(probe.chart?.open).toBe(true);
  await page.keyboard.press("Escape");
  await expect(box).toHaveValue("");
  await expect(box).not.toBeFocused();
  await expect(result).toHaveText("");
  await page.waitForTimeout(200);
  probe = await getProbe(page);
  expect(probe.chart?.open).toBe(true);
  expect(probe.paused).toBe(false);

  // A prefix that matches nothing keeps the selection and the typed text.
  const selected = probe.chart?.selectedId;
  await page.keyboard.press("Slash");
  await expect(box).toBeFocused();
  await page.keyboard.type("0q");
  await expect(result).toHaveText("No match");
  await expect(box).toHaveValue("0q");
  expect((await getProbe(page)).chart?.selectedId).toBe(selected);

  expect(errors).toEqual([]);
});
