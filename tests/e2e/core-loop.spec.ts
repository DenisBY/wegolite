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
 * Steps, in order. Each save-relevant step waits for its committed revision, and
 * the count is the write number within the page that makes it:
 *   1. New game; Digit8 market; buy one tonne of Food at Lave (committed 1).
 *   2. F6 chart, Tab to long range, select and commit Diso, Escape.
 *   3. Digit1 launch; the pre-launch anchor is taken while docked (committed 2).
 *   4. Fly 7,500 m clear on KeyW; KeyH; the arrival writes the in-flight save
 *      (committed 3). The save is read back and must be inFlight, targeting Diso.
 *   5. Rewrite only the arrival save's pose and speed to the Diso dock mouth;
 *      reload, write, reload, Continue; the docked event writes once (committed 1
 *      in the fresh page), and the docked state equals the arrival state.
 *   6. Digit8 market; sell one tonne of Food at Diso (committed 2 in that page).
 *   7. Escape home and record the state; F2, KeyS, KeyY overwrites the slot
 *      (committed 3).
 *   8. Reload, Continue; the system, credits, cargo and every market row equal
 *      the recorded state exactly. expectCleanRun covers the whole run.
 *
 * Observed wall time: 3.3 min for the whole journey on one worker, headless
 * Chromium under SwiftShader, with `WEGOLITE_E2E_WAIT_SCALE` unset.
 *
 * Waits: `WEGOLITE_E2E_WAIT_SCALE` (default 1) multiplies every timeout, including
 * the test budget, so a slower engine can be given more time without editing this
 * file. The journey starts from an empty IndexedDB and never depends on an earlier
 * run's save.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  add,
  axisAngle,
  mul,
  normalize,
  normalizeVec,
  quatFromUnitVectors,
  rotate,
  scale,
  sub,
  vec,
} from "../../src/sim/math.js";
import { chartScreenPoint, systemByName } from "./helpers/chart.js";
import {
  expectCleanRun,
  watchConsole,
  watchNetwork,
} from "./helpers/guards.js";
import { getProbe } from "./helpers/probe.js";
import { readRaw, writeRaw } from "./helpers/save-store.js";
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
    camera: probe.chart?.camera ?? { centre: { x: 128, y: 128 }, spanX: 256 },
    fuel: probe.economy?.fuel ?? 0,
    viewport: { width: box.width, height: box.height },
    selectedId: probe.chart?.selectedId,
  });
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

/** Open the chart, switch to the galaxy preset, select `name`, commit it with Enter, and close. */
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
  if ((await getProbe(page)).chart?.camera.spanX !== 256) {
    await page.keyboard.press("Tab");
    await page.waitForFunction(
      () => window.__wegolite?.chart?.camera.spanX === 256,
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

const DISO_ID = systemByName("Diso").id;

/** The authored Coriolis dock subentity offset (the value autosave.spec.ts derives the pose from). */
const DOCK_OFFSET = 500.2561;

/** The fields of the game's own arrival save that the dock fixture reads and rewrites. */
interface ArrivalBlob {
  mode: string;
  clockSeconds: number;
  targetSystem?: string;
  flight?: {
    position: [number, number, number];
    orientation: [number, number, number, number];
    speed: number;
    pitchRate: number;
    rollRate: number;
    torus: boolean;
  };
}

/** The state the journey compares across a save and a reload: where, what, how much and the market. */
interface JourneySnapshot {
  systemId: string | undefined;
  credits: number | undefined;
  cargo: Record<string, number>;
  market: { key: string; price: number; stock: number }[];
}

async function snapshot(page: Page): Promise<JourneySnapshot> {
  const probe = await getProbe(page);
  return {
    systemId: probe.systemId,
    credits: probe.economy?.credits,
    cargo: { ...probe.economy?.cargo },
    market: (probe.economy?.market ?? []).map((good) => ({
      key: good.key,
      price: good.price,
      stock: good.stock,
    })),
  };
}

/**
 * Hold the throttle (`KeyW`) until the ship is at least `metres` from `origin`.
 * About 21 s of simulated throttle reaches 7,500 m, which is roughly 90 to 130 s
 * of wall time under SwiftShader. The key is released in a finally block.
 */
async function flyAwayFrom(
  page: Page,
  origin: readonly [number, number, number],
  metres: number,
): Promise<void> {
  await page.keyboard.down("KeyW");
  try {
    await page.waitForFunction(
      ({ from, distance }) => {
        const probe = window.__wegolite;
        if (probe === undefined) return false;
        const [x, y, z] = probe.position;
        return Math.hypot(x - from[0], y - from[1], z - from[2]) >= distance;
      },
      { from: origin, distance: metres },
      { timeout: scaled(240_000) },
    );
  } finally {
    await page.keyboard.up("KeyW");
  }
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
  const dockedPose = (await getProbe(page)).position;
  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");
  await waitForCommitted(page, 2);

  // Clear the station on the throttle, so the completing jump is outside the
  // Coriolis blockage radius (6,747.0 m). Then jump to Diso: the arrival is the
  // third committed write, and the only one in flight.
  await flyAwayFrom(page, dockedPose, 7_500);
  await page.keyboard.press("KeyH");
  await page.waitForFunction(
    () => (window.__wegolite?.hyperspace?.countdown ?? 0) > 0,
    undefined,
    { timeout: UI_WAIT },
  );
  await page.waitForFunction(
    (id) => window.__wegolite?.systemId === id,
    DISO_ID,
    { timeout: scaled(180_000) },
  );
  await waitForCommitted(page, 3);

  // Read the arrival save the game wrote, and record the state it carries.
  const arrival = await snapshot(page);
  const raw = await readRaw(page);
  expect(raw).not.toBeNull();
  const blob = JSON.parse(raw ?? "{}") as ArrivalBlob;
  expect(blob.mode).toBe("inFlight");
  expect(blob.targetSystem).toBe(DISO_ID);
  if (blob.flight === undefined) {
    throw new Error("the arrival blob has no pose");
  }

  // The dock-mouth frame, computed from the destination layout (never Lave's).
  const arrivedProbe = await getProbe(page);
  const station = arrivedProbe.world?.station;
  const planet = arrivedProbe.world?.planet;
  if (station === undefined || planet === undefined) {
    throw new Error("the probe has no destination station or planet position");
  }
  const stationVec = vec(station[0], station[1], station[2]);
  const planetVec = vec(planet[0], planet[1], planet[2]);
  const stationToPlanet = normalizeVec(sub(planetVec, stationVec));
  const mouth = add(stationVec, scale(stationToPlanet, DOCK_OFFSET));
  const qPort = quatFromUnitVectors(vec(0, 0, -1), stationToPlanet);
  const matched = normalize(axisAngle(1, 1, 0, Math.PI));
  const orientation = normalize(mul(qPort, matched));
  const k = rotate(qPort, vec(0, 0, -1));
  // A restored ship is disarmed, so start outside the mouth (+k is toward the
  // planet) and well clear of the contact proxy; it then flies in at speed 50.
  const position = add(mouth, scale(k, 120));

  // Rewrite only the flight pose and speed; mode, clock, market and target are
  // the game's own values. Then dock through a fresh Continue (D-21).
  const rewritten = {
    ...blob,
    flight: {
      ...blob.flight,
      position: [position.x, position.y, position.z],
      orientation: [orientation.w, orientation.x, orientation.y, orientation.z],
      speed: 50,
    },
  };
  await page.reload();
  await waitReady(page);
  await writeRaw(page, JSON.stringify(rewritten));
  await page.reload();
  await waitReady(page);
  await expect(page.locator("#title-continue")).toBeVisible({
    timeout: UI_WAIT,
  });
  await page.click("#title-continue");
  await waitForMode(page, "docked");
  // The docked event is the one write in this fresh page. The docked state
  // carries the arrival's system, credits, cargo and market unchanged.
  await waitForCommitted(page, 1);
  expect(await snapshot(page)).toEqual(arrival);

  // Sell the tonne of Food at Diso. The sale is the second write in this page.
  await page.keyboard.press("Digit8");
  await waitForStationScreen(page, "market");
  await page.waitForFunction(
    () => window.__wegolite?.station?.selectedKey === "food",
    undefined,
    { timeout: UI_WAIT },
  );
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('#docked [data-footer-role="status"]')).toHaveText(
    /^Sell 1 t Food for [0-9.]+ Cr\? \[Y\/N\]$/,
    { timeout: UI_WAIT },
  );
  await page.keyboard.press("KeyY");
  await page.waitForFunction(
    () =>
      (window.__wegolite?.economy?.cargo?.food ?? 0) === 0 &&
      window.__wegolite?.economy?.lastTrade?.kind === "sell",
    undefined,
    { timeout: UI_WAIT },
  );
  await waitForCommitted(page, 2);

  // Return home and record the state the manual save must restore exactly.
  await page.keyboard.press("Escape");
  await waitForStationScreen(page, "home");
  const recorded = await snapshot(page);

  // Manual save: the slot is committed, so the overwrite dialog asks first; Y
  // then writes the third revision.
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeVisible({ timeout: UI_WAIT });
  await page.keyboard.press("KeyS");
  await page.waitForFunction(
    () => window.__wegolite?.saveScreen?.confirming === true,
    undefined,
    { timeout: UI_WAIT },
  );
  await page.keyboard.press("KeyY");
  await waitForCommitted(page, 3);
  await page.keyboard.press("Escape");
  await expect(page.locator("#save-load")).toBeHidden({ timeout: UI_WAIT });

  // Reload and Continue: the docked system, credits, cargo and every market row
  // equal the values recorded just before the manual save.
  await page.reload();
  await waitReady(page);
  await expect(page.locator("#title-continue")).toBeVisible({
    timeout: UI_WAIT,
  });
  await page.click("#title-continue");
  await waitForMode(page, "docked");
  expect(await snapshot(page)).toEqual(recorded);

  // The guards cover the whole journey, including both reloads.
  expectCleanRun(network, consoleProblems);
});
