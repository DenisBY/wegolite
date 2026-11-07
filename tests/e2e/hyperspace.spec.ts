// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The end-to-end navigation tracer (NAV-01..06, SAVE-05, D-01/D-02/D-06/D-09).
 *
 * One continuous browser path: F6 opens the chart and freezes the loop, a click
 * selects and Enter commits, H starts the fixed-step countdown, a second H
 * aborts it at no cost, the refusal names the exact reason, the arrival swaps
 * the scene and market, the arrival autosave commits, and a reload returns to
 * the same witchpoint, market and target.
 *
 * Every wait is on `window.__wegolite`; there is no screenshot and no pixel
 * diff (D-08). Headless Chromium runs on SwiftShader, so the waits carry a
 * generous bound.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getProbe, waitForReady } from "./helpers/probe.js";
import { chartScreenPoint, systemByName } from "./helpers/chart.js";
import { readRaw } from "./helpers/save-store.js";
import { startNewGame } from "./helpers/title.js";
import { DT } from "../../src/sim/time.js";

test.setTimeout(360_000);

const DISO = systemByName("Diso");
/** 9 integer chart units at 0.4 LY: 576 * 9^2 seconds of jump time. */
const DISO_JUMP_SECONDS = 576 * 9 * 9;
const DISO_FUEL_COST = 4 * 9;
const DISO_DISTANCE_LY = "3.6 LY";

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

async function paintCount(page: Page): Promise<number> {
  const value = await page.locator("#chart-canvas").getAttribute("data-paints");
  return Number(value ?? "0");
}

/** Click the marker the pure view model places for `name`. */
async function clickSystem(page: Page, name: string): Promise<void> {
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

async function openChart(page: Page): Promise<void> {
  await page.keyboard.press("F6");
  await page.waitForFunction(() => window.__wegolite?.chart?.open === true, {
    timeout: 30_000,
  });
}

async function closeChart(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__wegolite?.chart?.open === false, {
    timeout: 30_000,
  });
}

/** Commit `name` as the target through the click-then-Enter contract (D-02). */
async function commitTarget(
  page: Page,
  name: string,
  range?: "short" | "long",
): Promise<void> {
  const system = systemByName(name);
  await openChart(page);
  if (range !== undefined) {
    const current = (await getProbe(page)).chart?.range;
    if (current !== range) {
      await page.keyboard.press("Tab");
      await page.waitForFunction(
        (expected) => window.__wegolite?.chart?.range === expected,
        range,
        { timeout: 30_000 },
      );
    }
  }
  await clickSystem(page, name);
  await page.waitForFunction(
    (id) => window.__wegolite?.chart?.selectedId === id,
    system.id,
    { timeout: 30_000 },
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (id) => window.__wegolite?.chart?.targetId === id,
    system.id,
    { timeout: 30_000 },
  );
  await closeChart(page);
}

test("chart target, countdown, abort, refusal, arrival and reload", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await waitForReady(page);
  await startNewGame(page);
  await waitForMode(page, "docked");

  // D-01: F6 opens in the docked state; the chart is opaque and never adds a
  // second document footer.
  await openChart(page);
  expect(await page.locator("footer").count()).toBe(1);

  const paintsBefore = await paintCount(page);
  await waitFrames(page, 60);
  // The chart paints on open/selection/range/resize only, never per frame.
  expect(await paintCount(page)).toBe(paintsBefore);

  await clickSystem(page, "Diso");
  await page.waitForFunction(
    (id) => window.__wegolite?.chart?.selectedId === id,
    DISO.id,
    { timeout: 30_000 },
  );
  await expect(page.locator('[data-field="chart-distance"]')).toHaveText(
    DISO_DISTANCE_LY,
  );
  await expect(page.locator('[data-field="chart-fuel"]')).toHaveText(
    `${String(DISO_FUEL_COST)} fuel units`,
  );
  // A click only selects (D-02); it is a repaint, not a new frame loop.
  expect(await paintCount(page)).toBeGreaterThan(paintsBefore);

  // Enter commits the selection, and the readout keeps the committed target.
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (id) => window.__wegolite?.chart?.targetId === id,
    DISO.id,
    { timeout: 30_000 },
  );
  await closeChart(page);

  // H is flight-scoped: while docked there is no countdown and no refusal.
  await page.keyboard.press("KeyH");
  await waitFrames(page, 10);
  let probe = await getProbe(page);
  expect(probe.hyperspace?.countdown).toBe(0);
  expect(probe.hyperspace?.lastRefusal).toBeNull();
  expect(probe.hyperspace?.lastJump).toBeNull();

  // Every jump sequence starts from flight.
  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");

  // D-01's suspension is observable only in flight.
  await openChart(page);
  const frozenClock = (await getProbe(page)).clock;
  await waitFrames(page, 60);
  expect((await getProbe(page)).clock).toBe(frozenClock);
  await closeChart(page);

  // A committed out-of-range target is refused at H with the exact reason.
  await commitTarget(page, "Tibedied", "long");
  await page.keyboard.press("KeyH");
  await page.waitForFunction(
    () => window.__wegolite?.hyperspace?.lastRefusal?.reason === "too far",
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () =>
      (window.__wegolite?.hud?.message ?? "").includes(
        "Destination is too far",
      ),
    undefined,
    { timeout: 30_000 },
  );
  probe = await getProbe(page);
  expect(probe.hyperspace?.countdown).toBe(0);
  expect(probe.hyperspace?.lastJump).toBeNull();

  // Commit the reachable target and start the countdown.
  await commitTarget(page, "Diso", "long");
  await page.keyboard.press("KeyH");
  await page.waitForFunction(
    () => (window.__wegolite?.hyperspace?.countdown ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () =>
      /^Hyperspace to Diso in \d+ seconds$/.test(
        window.__wegolite?.hud?.message ?? "",
      ),
    undefined,
    { timeout: 30_000 },
  );

  probe = await getProbe(page);
  const fuelBefore = probe.economy?.fuel ?? 0;
  const clockBeforeCancel = probe.clock;
  const jumpBeforeCancel = probe.hyperspace?.lastJump ?? null;
  const refusalBeforeCancel = probe.hyperspace?.lastRefusal ?? null;

  // A second H aborts: no fuel, no jump time, no new refusal.
  await page.keyboard.press("KeyH");
  await page.waitForFunction(
    () => window.__wegolite?.hyperspace?.countdown === 0,
    undefined,
    { timeout: 30_000 },
  );
  await waitFrames(page, 12);
  probe = await getProbe(page);
  expect(probe.economy?.fuel).toBe(fuelBefore);
  expect(probe.hyperspace?.lastJump).toEqual(jumpBeforeCancel);
  expect(probe.hyperspace?.lastRefusal).toEqual(refusalBeforeCancel);
  const ordinaryFlightTime = probe.clock - clockBeforeCancel;
  expect(ordinaryFlightTime).toBeGreaterThan(0);
  // The abort adds no jump-time; ordinary fixed steps are far below 46,656 s.
  expect(ordinaryFlightTime).toBeLessThan(DISO_JUMP_SECONDS);

  // Restart and wait for the commit.
  const committedBeforeJump = probe.save?.committed ?? 0;
  await page.keyboard.press("KeyH");
  await page.waitForFunction(
    () => (window.__wegolite?.hyperspace?.countdown ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    (id) => window.__wegolite?.hyperspace?.lastJump?.destinationId === id,
    DISO.id,
    { timeout: 180_000 },
  );
  probe = await getProbe(page);
  expect(probe.mode).toBe("inFlight");
  expect(probe.systemId).toBe(DISO.id);
  expect(probe.speed).toBe(50);
  expect(probe.torus?.engaged).toBe(false);
  expect(probe.economy?.marketSystemId).toBe(DISO.id);
  const fuelCost = probe.hyperspace?.lastJump?.fuelCost ?? 0;
  expect(fuelCost).toBe(DISO_FUEL_COST);
  expect(probe.economy?.fuel).toBe(fuelBefore - fuelCost);
  // G-4: the HUD reads the live tank after the jump (70 - 36 = 34 tenths),
  // never the full tank the Phase 3 constant printed.
  expect(probe.hud?.fuelText).toBe("3.4 LY");
  expect(probe.hud?.fuel).toBeCloseTo(34 / 70, 6);
  // G-7: the committed target survives the arrival (the snapshot and the HUD/F5
  // line keep naming the destination), and the global overlay names the live
  // system instead of the boot string `new game: Lave` (IN-02).
  expect(probe.hyperspace?.targetId).toBe(DISO.id);
  expect(probe.hud?.hyperspaceTarget).toBe("Diso");
  await expect(page.locator("#status")).toHaveText("Wegolite — Diso");

  // D-17/SAVE-05: the arrival anchor is one complete in-flight v2 snapshot.
  await page.waitForFunction(
    (expected) => (window.__wegolite?.save?.committed ?? 0) > expected,
    committedBeforeJump,
    { timeout: 60_000 },
  );
  const arrival = await getProbe(page);
  const arrivedMarket = (arrival.economy?.market ?? []).map((good) => ({
    key: good.key,
    price: good.price,
    stock: good.stock,
  }));
  expect(arrivedMarket).toHaveLength(17);

  // SAVE-06/T-06-18: the raw autosave is the authoritative persisted pose. The
  // live probe pose has already advanced since the jump commit, so only the
  // blob is a stable comparison for the exact restore.
  const arrivalRaw = await readRaw(page);
  if (arrivalRaw === null) {
    throw new Error("the arrival autosave is absent");
  }
  const arrivalBlob = JSON.parse(arrivalRaw) as {
    mode: string;
    clockSeconds: number;
    flight?: {
      position: [number, number, number];
      orientation: [number, number, number, number];
      speed: number;
      torus: boolean;
    };
  };
  expect(arrivalBlob.mode).toBe("inFlight");
  if (arrivalBlob.flight === undefined) {
    throw new Error("the arrival autosave has no flight pose");
  }

  // The reload proof: same system, same market, same committed target, and the
  // pose the restore installed — not the live, resumed one.
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  await page.click("#title-continue");
  await waitForMode(page, "inFlight");
  // The live pose is sampled only after a resumed fixed step has advanced the
  // clock past the saved clock. A teleport on that first step therefore shows
  // in the sample instead of hiding behind a pre-step reading.
  await page.waitForFunction(
    (savedClock) => (window.__wegolite?.clock ?? 0) > savedClock,
    arrivalBlob.clockSeconds,
    { timeout: 30_000 },
  );
  probe = await getProbe(page);
  expect(probe.mode).toBe("inFlight");
  expect(probe.systemId).toBe(DISO.id);
  expect(probe.economy?.marketSystemId).toBe(DISO.id);
  expect(probe.hyperspace?.targetId).toBe(DISO.id);
  // IN-02: Continue installs the saved system into the global overlay.
  await expect(page.locator("#status")).toHaveText("Wegolite — Diso");
  // D-12: the HUD carries the same target name F5 renders, inside the existing
  // eleven-element set (no twelfth element).
  expect(probe.hud?.hyperspaceTarget).toBe("Diso");
  expect(probe.hud?.elements).toHaveLength(11);
  expect(
    (probe.economy?.market ?? []).map((good) => ({
      key: good.key,
      price: good.price,
      stock: good.stock,
    })),
  ).toEqual(arrivedMarket);

  // The install copies the sanitized blob numbers within 1e-9.
  expect(probe.restore?.mode).toBe("inFlight");
  expect(probe.restore?.systemId).toBe(DISO.id);
  expect(probe.restore?.clock).toBe(arrivalBlob.clockSeconds);
  expect(probe.restore?.position[0]).toBeCloseTo(
    arrivalBlob.flight.position[0],
    9,
  );
  expect(probe.restore?.position[1]).toBeCloseTo(
    arrivalBlob.flight.position[1],
    9,
  );
  expect(probe.restore?.position[2]).toBeCloseTo(
    arrivalBlob.flight.position[2],
    9,
  );
  expect(probe.restore?.orientation[0]).toBeCloseTo(
    arrivalBlob.flight.orientation[0],
    9,
  );
  expect(probe.restore?.orientation[1]).toBeCloseTo(
    arrivalBlob.flight.orientation[1],
    9,
  );
  expect(probe.restore?.orientation[2]).toBeCloseTo(
    arrivalBlob.flight.orientation[2],
    9,
  );
  expect(probe.restore?.orientation[3]).toBeCloseTo(
    arrivalBlob.flight.orientation[3],
    9,
  );
  expect(probe.restore?.speed).toBe(arrivalBlob.flight.speed);

  // The live pose is compared only within the documented SAVE-03 tolerance:
  // the resumed loop advances straight at the restored speed, so the live
  // displacement from the blob is `speed * elapsed simulated seconds`; the
  // residual is floating-point step error, not saved-state drift. The wait
  // above guarantees at least one resumed fixed step ran, so `elapsed` is
  // strictly positive and a resumed teleport (hundreds of kilometres against a
  // few metres of expected travel) fails this comparison.
  const live = probe.position;
  const liveDistance = Math.hypot(
    live[0] - arrivalBlob.flight.position[0],
    live[1] - arrivalBlob.flight.position[1],
    live[2] - arrivalBlob.flight.position[2],
  );
  const elapsed = probe.clock - arrivalBlob.clockSeconds;
  expect(elapsed).toBeGreaterThan(0);
  const expectedTravel = probe.speed * elapsed;
  // The clock is a float64 near 1.8e11 s, so its last representable step is
  // about 3e-5 s, and each resumed `clockSeconds += DT` rounds to that grid.
  // The elapsed time therefore carries up to one grid step of error per fixed
  // step, which is millimetres of travel at 50 m/s. The bound is that per-step
  // rounding times the step count and speed; a resumed teleport of hundreds of
  // kilometres exceeds it by many orders of magnitude.
  const steps = Math.round(elapsed / DT);
  const clockGrid =
    Number.EPSILON *
    Math.max(Math.abs(probe.clock), Math.abs(arrivalBlob.clockSeconds));
  const clockRoundingBound = probe.speed * steps * clockGrid;
  expect(Math.abs(liveDistance - expectedTravel)).toBeLessThanOrEqual(
    clockRoundingBound + Math.max(1, expectedTravel) * 1e-6,
  );
  expect(probe.speed).toBe(arrivalBlob.flight.speed);
  expect(probe.torus?.engaged).toBe(arrivalBlob.flight.torus);
  expect(probe.orientation[0]).toBeCloseTo(
    arrivalBlob.flight.orientation[0],
    9,
  );
  expect(probe.orientation[1]).toBeCloseTo(
    arrivalBlob.flight.orientation[1],
    9,
  );
  expect(probe.orientation[2]).toBeCloseTo(
    arrivalBlob.flight.orientation[2],
    9,
  );
  expect(probe.orientation[3]).toBeCloseTo(
    arrivalBlob.flight.orientation[3],
    9,
  );

  // A second reload repeats the same market values: the snapshot is never
  // regenerated from the seed once it exists.
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  await page.click("#title-continue");
  await waitForMode(page, "inFlight");
  const second = await getProbe(page);
  expect(second.systemId).toBe(DISO.id);
  expect(
    (second.economy?.market ?? []).map((good) => ({
      key: good.key,
      price: good.price,
      stock: good.stock,
    })),
  ).toEqual(arrivedMarket);
  expect(errors).toEqual([]);
});
