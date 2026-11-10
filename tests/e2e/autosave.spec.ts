// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The autosave browser proof (DOCK-07, D-13, D-14, T-04-26…T-04-28, T-04-47…T-04-52).
 *
 * This is the only place real IndexedDB is exercised. Every case uses a fresh
 * Playwright context, waits on `window.__wegolite` and never reads a pixel
 * (D-08). The reload cases wait on `probe.save.committed` / `probe.save.status`,
 * never on `writes >= 1`: a requested write is not a durable write.
 *
 * Headless Chromium runs on SwiftShader, so every wait is a correctness wait on
 * the simulation probe with a generous bound (Pitfall 15).
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { CLOCK_START } from "../../src/sim/flight/state.js";
import { MAX_SAVE_CHARS } from "../../src/persistence/save.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
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
import { getProbe, waitForReady } from "./helpers/probe.js";
import { chartScreenPoint, systemByName } from "./helpers/chart.js";
import {
  AUTOSAVE_KEY,
  SAVE_DB,
  SAVE_STORE,
  readRaw,
  writeRaw,
} from "./helpers/save-store.js";

// The fly-away below runs at the SwiftShader sim rate (about 0.15 to 0.3 of wall
// time), so the budget is 600 s rather than 360 s. See hyperspace.spec.ts.
test.setTimeout(600_000);

const DISO_ID = systemByName("Diso").id;

const CORRUPT_KEY = "autosave.corrupt";

/** The authored Coriolis dock subentity offset and the Cobra's nose Z. */
const DOCK_OFFSET = 500.2561;
const COBRA_NOSE_Z = -43.4655;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

async function boot(page: Page, query = "/"): Promise<void> {
  await page.goto(query);
  await waitForReady(page);
}

async function startNewGame(page: Page): Promise<void> {
  await page.click("#title-start");
  // Every caller here boots with no clearable save, so this pins the
  // "a fresh boot starts immediately" half of the G-04-3 contract.
  await expect(page.locator("#title-confirm")).toBeHidden();
  await expect(page.locator("#docked")).toBeVisible();
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

/** Await `count` real animation frames, so a no-write window is frame-based. */
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

/** Wait until a station section is the live one. */
async function waitForStationScreen(page: Page, screen: string): Promise<void> {
  await page.waitForFunction(
    (expected) => window.__wegolite?.station?.screen === expected,
    screen,
    { timeout: 30_000 },
  );
}

/** Read one F5 field value by its rendered label. */
async function statusValue(page: Page, label: string): Promise<string | null> {
  return page.evaluate((wanted) => {
    const list = document.querySelector("[data-status-fields]");
    if (list === null) return null;
    const terms = Array.from(list.querySelectorAll("dt"));
    const term = terms.find((candidate) => candidate.textContent === wanted);
    return term?.nextElementSibling?.textContent ?? null;
  }, label);
}

/** Continue a committed save from the title and wait for the docked pose. */
async function continueGame(page: Page): Promise<void> {
  await expect(page.locator("#title-continue")).toBeVisible();
  await page.click("#title-continue");
  await waitForMode(page, "docked");
}

/** Write an arbitrary structured value (not necessarily a string). */
async function writeStored(
  page: Page,
  value: unknown,
  key: string = AUTOSAVE_KEY,
): Promise<void> {
  await page.evaluate(
    (payload: { value: unknown; key: string; db: string; store: string }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(payload.db, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(payload.store)) {
            db.createObjectStore(payload.store);
          }
        };
        request.onerror = () => {
          reject(new Error(`open failed: ${String(request.error)}`));
        };
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(payload.store, "readwrite");
          transaction
            .objectStore(payload.store)
            .put(payload.value, payload.key);
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => {
            reject(new Error(`write failed: ${String(transaction.error)}`));
          };
          transaction.onabort = () => {
            reject(new Error(`write aborted: ${String(transaction.error)}`));
          };
        };
      }),
    { value, key, db: SAVE_DB, store: SAVE_STORE },
  );
}

/** Read any stored shape, or `null` when the record is absent. */
async function readStored(
  page: Page,
  key: string = AUTOSAVE_KEY,
): Promise<unknown> {
  return page.evaluate(
    (payload: { key: string; db: string; store: string }) =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open(payload.db, 1);
        request.onerror = () => {
          reject(new Error(`open failed: ${String(request.error)}`));
        };
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(payload.store)) {
            db.close();
            resolve(null);
            return;
          }
          const transaction = db.transaction(payload.store, "readonly");
          const get = transaction.objectStore(payload.store).get(payload.key);
          get.onsuccess = () => {
            const value: unknown = get.result;
            db.close();
            resolve(value === undefined ? null : value);
          };
          get.onerror = () => {
            db.close();
            reject(new Error(`read failed: ${String(get.error)}`));
          };
        };
      }),
    { key, db: SAVE_DB, store: SAVE_STORE },
  );
}

/** Launch and wait for the launch write to commit, returning its clock. */
async function launchAndAwaitCommit(page: Page): Promise<number> {
  await page.click('button[data-action="launch"]');
  await page.waitForFunction(
    () => (window.__wegolite?.save?.committed ?? 0) >= 1,
    undefined,
    { timeout: 90_000 },
  );
  const probe = await getProbe(page);
  const clock = probe.save?.lastClock;
  if (typeof clock !== "number") {
    throw new Error("the launch write committed without a lastClock");
  }
  return clock;
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

test("a pre-launch write offers Continue at exactly the docked clock", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  await startNewGame(page);
  const savedClock = await launchAndAwaitCommit(page);
  // D-17: the anchor is taken before `beginLaunch`, so the +600 s launch
  // adjustment is not in the blob.
  expect(savedClock).toBe(CLOCK_START);

  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  const booted = await getProbe(page);
  expect(booted.save?.status).toBe("valid");
  expect(booted.save?.continueVisible).toBe(true);

  await page.click("#title-continue");
  await page.waitForFunction(
    (clock) => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.ready === true &&
        probe.mode === "docked" &&
        probe.clock === clock
      );
    },
    savedClock,
    { timeout: 60_000 },
  );

  const restored = await getProbe(page);
  expect(restored.mode).toBe("docked");
  expect(restored.clock).toBe(savedClock);
  await expect(page.locator("#docked")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a launch reloads to the station at the pre-launch clock, not +600 s", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  const savedClock = await launchAndAwaitCommit(page);
  expect(savedClock).toBe(CLOCK_START);
  await waitForMode(page, "launching");

  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  await page.click("#title-continue");
  await waitForMode(page, "docked");

  const restored = await getProbe(page);
  expect(restored.mode).toBe("docked");
  expect(restored.clock).toBe(CLOCK_START);
  expect(restored.clock).not.toBe(CLOCK_START + 600);
  await expect(page.locator("#docked")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a tainted manual dock reaches the trigger but skips the write: Continue still restores the pre-launch clock", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page, "/?test=1");
  await startNewGame(page);
  const savedClock = await launchAndAwaitCommit(page);
  await waitForMode(page, "inFlight");

  const probe = await getProbe(page);
  const station = probe.world?.station;
  const planet = probe.world?.planet;
  if (station === undefined || planet === undefined) {
    throw new Error("the probe has no station/planet world positions");
  }

  // The same independent dock frame docking.spec uses: the mouth is the station
  // centre plus the dock offset along station-to-planet.
  const stationVec = vec(station[0], station[1], station[2]);
  const planetVec = vec(planet[0], planet[1], planet[2]);
  const stationToPlanet = normalizeVec(sub(planetVec, stationVec));
  const mouth = add(stationVec, scale(stationToPlanet, DOCK_OFFSET));
  const qPort = quatFromUnitVectors(vec(0, 0, -1), stationToPlanet);
  const matched = normalize(axisAngle(1, 1, 0, Math.PI));
  const orientation = normalize(mul(qPort, matched));
  const k = rotate(qPort, vec(0, 0, -1));
  const position = add(mouth, scale(k, -COBRA_NOSE_Z - 90));

  await page.evaluate(
    (payload: { position: number[]; orientation: number[] }) => {
      const hook = window.__wegolite?.test;
      if (hook === undefined) throw new Error("the ?test=1 hook is missing");
      hook.setStationAngle(0);
      hook.setOrientation(
        payload.orientation[0] ?? 0,
        payload.orientation[1] ?? 0,
        payload.orientation[2] ?? 0,
        payload.orientation[3] ?? 0,
      );
      hook.setPosition(
        payload.position[0] ?? 0,
        payload.position[1] ?? 0,
        payload.position[2] ?? 0,
      );
      hook.setSpeed(0);
    },
    {
      position: [position.x, position.y, position.z],
      orientation: [orientation.w, orientation.x, orientation.y, orientation.z],
    },
  );

  await waitForMode(page, "docked");
  // D-17: docking IS an autosave trigger, but this case drives the dock through
  // `?test=1` pose mutations, so the taint guard suppresses the write. The
  // attempt is still recorded, which is what proves the trigger was reached.
  await page.waitForTimeout(600);
  const docked = await getProbe(page);
  expect(docked.mode).toBe("docked");
  // `attempts` is incremented before the taint skip: launch + dock.
  expect(docked.save?.attempts).toBe(2);
  expect(docked.save?.writes).toBe(1);
  expect(docked.save?.committed).toBe(1);
  expect(docked.save?.skipReason).toBe("tainted");
  expect(docked.save?.lastClock).toBe(savedClock);

  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  await page.click("#title-continue");
  await page.waitForFunction(
    (clock) => {
      const live = window.__wegolite;
      return (
        live !== undefined &&
        live.ready === true &&
        live.mode === "docked" &&
        live.clock === clock
      );
    },
    savedClock,
    { timeout: 60_000 },
  );
  expect((await getProbe(page)).clock).toBe(savedClock);
  expect(errors).toEqual([]);
});

/**
 * Hold the throttle (`KeyW`, the bound `speedUp` action in the flight context)
 * until the ship is at least `metres` from `origin`, by a Euclidean norm over the
 * three components. The key is released in a finally block. About 21 s of
 * simulated throttle reaches the 7,500 m target (175 u/s at launch, 350 u/s cap,
 * 160 u/s^2), which is roughly 90 to 130 s of wall time under SwiftShader. The
 * 240 s wait sits inside the 600 s per-test budget (line 44). The
 * fly-away is needed only so the completion is not refused as blocked: the dock
 * mouth lies about 500 m from the Coriolis station centre, and the blockage
 * radius is 6,747.0 m (ShipEntity.m lines 12504-12511).
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
      { timeout: 240_000 },
    );
  } finally {
    await page.keyboard.up("KeyW");
  }
}

test("the autosave trigger matrix writes exactly one revision per trigger and never mid-flight", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await waitForMode(page, "docked");

  // Trigger row 1 — an accepted trade writes exactly one revision.
  expect((await getProbe(page)).save?.committed).toBe(0);
  await page.keyboard.press("Digit8");
  await waitForStationScreen(page, "market");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("KeyY");
  await page.waitForFunction(
    () => (window.__wegolite?.economy?.cargo?.food ?? 0) === 1,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => (window.__wegolite?.save?.committed ?? 0) === 1,
    undefined,
    { timeout: 30_000 },
  );
  await page.keyboard.press("Escape");
  await waitForStationScreen(page, "home");

  // Trigger row 2 — the manual F2 Save confirms the committed overwrite once.
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeVisible();
  await page.keyboard.press("KeyS");
  await page.waitForFunction(
    () => window.__wegolite?.saveScreen?.confirming === true,
    undefined,
    { timeout: 30_000 },
  );
  await page.keyboard.press("KeyY");
  await page.waitForFunction(
    () => (window.__wegolite?.save?.committed ?? 0) === 2,
    undefined,
    { timeout: 30_000 },
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#save-load")).toBeHidden();

  // D-17: no in-flight blob exists until an arrival, so jump first. H is
  // flight-scoped, so launch before starting the countdown.
  await page.keyboard.press("F6");
  await page.waitForFunction(() => window.__wegolite?.chart?.open === true, {
    timeout: 30_000,
  });
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => window.__wegolite?.chart?.camera.spanX === 256,
    {
      timeout: 30_000,
    },
  );
  await clickChartSystem(page, "Diso");
  await page.waitForFunction(
    (id) => window.__wegolite?.chart?.selectedId === id,
    DISO_ID,
    { timeout: 30_000 },
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (id) => window.__wegolite?.chart?.targetId === id,
    DISO_ID,
    { timeout: 30_000 },
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__wegolite?.chart?.open === false, {
    timeout: 30_000,
  });

  // The docked pose is recorded before the launch, for the fly-away below.
  const dockedPose = (await getProbe(page)).position;
  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");
  // Trigger row 3 — the pre-launch anchor is the third committed write and is
  // taken while the state is still docked.
  await page.waitForFunction(
    () => (window.__wegolite?.save?.committed ?? 0) === 3,
    undefined,
    { timeout: 60_000 },
  );
  const committedBeforeJump = 3;

  // No write during ordinary in-flight frames.
  await waitFrames(page, 60);
  expect((await getProbe(page)).save?.committed).toBe(committedBeforeJump);

  // No write during a countdown, and an abort costs no revision.
  await page.keyboard.press("KeyH");
  await page.waitForFunction(
    () => (window.__wegolite?.hyperspace?.countdown ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  );
  expect((await getProbe(page)).save?.committed).toBe(committedBeforeJump);
  await page.keyboard.press("KeyH");
  await page.waitForFunction(
    () => window.__wegolite?.hyperspace?.countdown === 0,
    undefined,
    { timeout: 30_000 },
  );
  expect((await getProbe(page)).save?.committed).toBe(committedBeforeJump);

  // Fly clear of the station with the keyboard throttle before the arrival
  // commit. No write happens during the fly-away, which is in flight.
  await flyAwayFrom(page, dockedPose, 7_500);

  // Restart the countdown; the arrival writes row 4, exactly once.
  await page.keyboard.press("KeyH");
  await page.waitForFunction(
    () => (window.__wegolite?.hyperspace?.countdown ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    (id) => window.__wegolite?.systemId === id,
    DISO_ID,
    { timeout: 180_000 },
  );
  await page.waitForFunction(
    (expected) => (window.__wegolite?.save?.committed ?? 0) > expected,
    committedBeforeJump,
    { timeout: 60_000 },
  );
  expect((await getProbe(page)).save?.committed).toBe(4);

  const raw = await readRaw(page);
  expect(raw).not.toBeNull();
  const blob = JSON.parse(raw ?? "{}") as {
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
  };
  expect(blob.mode).toBe("inFlight");
  expect(blob.targetSystem).toBe(DISO_ID);
  expect(blob.flight).toBeDefined();
  if (blob.flight === undefined)
    throw new Error("the arrival blob has no pose");

  const arrived = await getProbe(page);
  const station = arrived.world?.station;
  const planet = arrived.world?.planet;
  if (station === undefined || planet === undefined) {
    throw new Error("the probe has no destination station/planet positions");
  }

  // The dock-mouth frame, computed from the destination layout (never Lave's).
  const stationVec = vec(station[0], station[1], station[2]);
  const planetVec = vec(planet[0], planet[1], planet[2]);
  const stationToPlanet = normalizeVec(sub(planetVec, stationVec));
  const mouth = add(stationVec, scale(stationToPlanet, DOCK_OFFSET));
  const qPort = quatFromUnitVectors(vec(0, 0, -1), stationToPlanet);
  const matched = normalize(axisAngle(1, 1, 0, Math.PI));
  const orientation = normalize(mul(qPort, matched));
  const k = rotate(qPort, vec(0, 0, -1));
  // A restored ship is disarmed, so start outside the mouth (+k is toward the
  // planet) and well clear of the contact proxy's outward face; it then flies
  // in. The manual-dock case can sit inside the mouth because a launch has
  // already armed the latch.
  const position = add(mouth, scale(k, 120));

  // Prove the in-flight Continue path copies the sanitized numbers exactly.
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  await page.click("#title-continue");
  await waitForMode(page, "inFlight");
  const restored = await getProbe(page);
  expect(restored.restore?.systemId).toBe(DISO_ID);
  expect(restored.restore?.position[0]).toBeCloseTo(blob.flight.position[0], 9);
  expect(restored.restore?.position[1]).toBeCloseTo(blob.flight.position[1], 9);
  expect(restored.restore?.position[2]).toBeCloseTo(blob.flight.position[2], 9);
  expect(restored.restore?.orientation[0]).toBeCloseTo(
    blob.flight.orientation[0],
    9,
  );
  expect(restored.restore?.orientation[1]).toBeCloseTo(
    blob.flight.orientation[1],
    9,
  );
  expect(restored.restore?.orientation[2]).toBeCloseTo(
    blob.flight.orientation[2],
    9,
  );
  expect(restored.restore?.orientation[3]).toBeCloseTo(
    blob.flight.orientation[3],
    9,
  );
  expect(restored.restore?.speed).toBe(blob.flight.speed);

  // Rewrite only the pose and speed; keep mode, clock, market and target.
  // A restore deliberately disarms the dock latch, so the ship needs forward
  // speed to fly into the corridor exactly as a real player would.
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
  await waitForReady(page);
  await writeRaw(page, JSON.stringify(rewritten));
  await page.reload();
  await waitForReady(page);
  await page.click("#title-continue");
  await waitForMode(page, "docked");

  const afterDock = await getProbe(page);
  expect(afterDock.mode).toBe("docked");
  expect(afterDock.systemId).toBe(DISO_ID);
  // Trigger row 5 — the docked event writes exactly once in this fresh page;
  // boot/Continue itself never writes.
  await page.waitForFunction(
    () => (window.__wegolite?.save?.committed ?? 0) === 1,
    undefined,
    { timeout: 60_000 },
  );
  const saved = await getProbe(page);
  expect(saved.save?.committed).toBe(1);
  expect(saved.save?.lastClock ?? 0).toBeGreaterThanOrEqual(blob.clockSeconds);

  // D-12/NAV-02: F5 shows the target that survived the reload.
  await page.keyboard.press("Digit5");
  await waitForStationScreen(page, "status");
  expect(await statusValue(page, "Hyperspace System")).toBe("Diso");
  await page.keyboard.press("Escape");
  await waitForStationScreen(page, "home");

  // A second reload + Continue restores the station, not the witchpoint.
  await page.reload();
  await waitForReady(page);
  await continueGame(page);
  const again = await getProbe(page);
  expect(again.mode).toBe("docked");
  expect(again.systemId).toBe(DISO_ID);
  expect(errors).toEqual([]);
});

test("the New-game confirmation traps focus, Escape returns to New game, and the save survives", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await launchAndAwaitCommit(page);

  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();

  // The first click only asks: nothing is deleted yet.
  await page.click("#title-start");
  await expect(page.locator("#title-confirm")).toBeVisible();

  // Escape backs out without starting anything and restores New game focus.
  await page.keyboard.press("Escape");
  await expect(page.locator("#title-confirm")).toBeHidden();
  await expect(page.locator("#title-start")).toBeFocused();
  await expect(page.locator("#docked")).toBeHidden();
  expect((await getProbe(page)).save?.status).toBe("valid");

  // Tab stays inside the dialog's two buttons.
  await page.click("#title-start");
  await expect(page.locator("#title-confirm")).toBeVisible();
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Tab");
  }
  const focusInside = await page.evaluate(() => {
    const confirm = document.getElementById("title-confirm");
    return confirm !== null && confirm.contains(document.activeElement);
  });
  expect(focusInside).toBe(true);

  // Cancel restores New game focus and leaves the save untouched.
  await page.click("#title-confirm-cancel");
  await expect(page.locator("#title-confirm")).toBeHidden();
  await expect(page.locator("#title-start")).toBeFocused();
  expect((await getProbe(page)).save?.status).toBe("valid");
  expect(errors).toEqual([]);
});

test("New game clears a committed save before starting", async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await launchAndAwaitCommit(page);

  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  const before = await readRaw(page);
  expect(before).not.toBeNull();

  // The first click only asks: the committed blob is still readable and valid.
  await page.click("#title-start");
  await expect(page.locator("#title-confirm")).toBeVisible();
  await expect(page.locator("#docked")).toBeHidden();
  expect((await getProbe(page)).save?.status).toBe("valid");
  expect(await readRaw(page)).toBe(before);

  // Cancel is non-destructive: the same bytes and the same status.
  await page.click("#title-confirm-cancel");
  await expect(page.locator("#title-confirm")).toBeHidden();
  expect((await getProbe(page)).save?.status).toBe("valid");
  expect(await readRaw(page)).toBe(before);

  // Only the explicit accept clears it, and the clear commits before the dock.
  await page.click("#title-start");
  await expect(page.locator("#title-confirm")).toBeVisible();
  await page.click("#title-confirm-accept");
  await page.waitForFunction(
    () => window.__wegolite?.save?.status === "absent",
    undefined,
    { timeout: 60_000 },
  );
  await expect(page.locator("#docked")).toBeVisible();

  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeHidden();
  expect((await getProbe(page)).save?.status).toBe("absent");
  expect(errors).toEqual([]);
});

test("a New game that fails to start leaves the committed save in place", async ({
  page,
}) => {
  await boot(page);
  await startNewGame(page);
  await launchAndAwaitCommit(page);

  // The station model fails to load. The route is installed before the
  // reload because the title screen already preloads the models. The clear
  // runs only once every load has succeeded, so the old save must survive a
  // new game that never started, even after the player accepted the overwrite.
  await page.route("**/models/coriolis.glb", (route) =>
    route.fulfill({ status: 404, contentType: "text/plain", body: "gone" }),
  );
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  const before = await readRaw(page);
  expect(before).not.toBeNull();

  await page.click("#title-start");
  await expect(page.locator("#title-confirm")).toBeVisible();
  await page.click("#title-confirm-accept");
  await expect(page.locator("#failure")).toBeVisible({ timeout: 60_000 });
  expect(await readRaw(page)).toBe(before);

  await page.unroute("**/models/coriolis.glb");
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  expect((await getProbe(page)).save?.status).toBe("valid");
  expect(await readRaw(page)).toBe(before);
});

test("a future-version blob is never cleared or replaced", async ({ page }) => {
  await boot(page);
  const future = JSON.stringify({
    version: 3,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: 999_999,
    equipment: [],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
    futureBuild: "leave this alone",
  });
  await writeRaw(page, future);

  const errors = collectErrors(page);
  await page.reload();
  await waitForReady(page);

  await expect(page.locator("#title-continue")).toBeHidden();
  const booted = await getProbe(page);
  expect(booted.save?.status).toBe("future");
  expect(booted.save?.skipReason).toBe("future");
  // A future blob is not corrupt: boot must not copy it aside either.
  expect(await readRaw(page, CORRUPT_KEY)).toBeNull();

  // New game starts in memory without touching the blob.
  await startNewGame(page);
  await page.waitForFunction(
    () => window.__wegolite?.save?.status === "future",
    undefined,
    { timeout: 30_000 },
  );
  expect(await readRaw(page)).toBe(future);

  // A future blob disables the write path for the whole session, visibly.
  await expect(
    page.locator('#docked [data-footer-role="status"]'),
  ).toContainText("Saving is disabled");
  await expect(
    page.locator('#docked [data-footer-role="status"]'),
  ).toHaveAttribute("data-status-tone", "save");
  await page.keyboard.press("Digit8");
  await waitForStationScreen(page, "market");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("KeyY");
  await page.waitForFunction(
    () => (window.__wegolite?.economy?.cargo?.food ?? 0) === 1,
    undefined,
    { timeout: 30_000 },
  );
  const futureProbe = await getProbe(page);
  expect(futureProbe.save?.committed).toBe(0);
  expect(futureProbe.save?.skipReason).toBe("future");
  expect(await readRaw(page)).toBe(future);
  await expect(
    page.locator('#docked [data-footer-role="status"]'),
  ).toContainText("Saving is disabled");
  await expect(
    page.locator('#docked [data-footer-role="status"]'),
  ).toHaveAttribute("data-status-tone", "save");
  await page.keyboard.press("Escape");
  await waitForStationScreen(page, "home");

  // Nor may a manual F2 Save replace it: the slot is read-only.
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeVisible();
  await expect(page.locator('[data-field="save-load-notice"]')).toHaveText(
    /read-only/,
  );
  await page.keyboard.press("KeyS");
  await page.waitForFunction(
    () => (window.__wegolite?.save?.attempts ?? 0) >= 2,
    undefined,
    { timeout: 30_000 },
  );
  const afterManual = await getProbe(page);
  expect(afterManual.save?.writes).toBe(0);
  expect(afterManual.save?.committed).toBe(0);
  expect(afterManual.save?.skipReason).toBe("future");
  expect(await readRaw(page)).toBe(future);
  expect(await readRaw(page, CORRUPT_KEY)).toBeNull();
  await page.keyboard.press("Escape");
  await expect(page.locator("#save-load")).toBeHidden();

  // A launch must not replace it either.
  await page.click('button[data-action="launch"]');
  await waitForMode(page, "launching");
  await page.waitForFunction(
    () => (window.__wegolite?.save?.skipReason ?? "") === "future",
    undefined,
    { timeout: 30_000 },
  );
  const after = await getProbe(page);
  expect(after.save?.writes).toBe(0);
  expect(after.save?.committed).toBe(0);
  expect(await readRaw(page)).toBe(future);
  expect(errors).toEqual([]);
});

test("a v1-shaped invalid blob is backed up once and never blocks boot", async ({
  page,
}) => {
  await boot(page);
  // `corrupt` is reserved for a blob that is provably this build's save family
  // but fails its schema (negative credits here).
  const corrupt = JSON.stringify({
    version: 1,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: -1,
    equipment: [],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
  });
  await writeRaw(page, corrupt);

  const errors = collectErrors(page);
  await page.reload();
  await waitForReady(page);

  await expect(page.locator("#title-continue")).toBeHidden();
  const probe = await getProbe(page);
  expect(probe.save?.status).toBe("corrupt");
  expect(probe.save?.unavailable).toBe(false);
  expect(await readRaw(page)).toBe(corrupt);
  expect(await readRaw(page, CORRUPT_KEY)).toBe(corrupt);
  expect(errors).toEqual([]);
});

test("an unreadable blob is never backed up, cleared or overwritten", async ({
  page,
}) => {
  await boot(page);
  // Unparseable, short and not recognisably v1: this build cannot identify it,
  // so it must leave it exactly as it found it (T-04-47).
  const unreadable = "not-json{{{";
  await writeRaw(page, unreadable);

  const errors = collectErrors(page);
  await page.reload();
  await waitForReady(page);

  await expect(page.locator("#title-continue")).toBeHidden();
  expect((await getProbe(page)).save?.status).toBe("unreadable");
  expect(await readRaw(page, CORRUPT_KEY)).toBeNull();
  expect(await readRaw(page)).toBe(unreadable);

  // New game skips the destructive clear, and the launch skips the write.
  await startNewGame(page);
  await page.waitForFunction(
    () => window.__wegolite?.save?.status === "unreadable",
    undefined,
    { timeout: 30_000 },
  );
  expect(await readRaw(page)).toBe(unreadable);

  await page.click('button[data-action="launch"]');
  await waitForMode(page, "launching");
  const after = await getProbe(page);
  expect(after.save?.writes).toBe(0);
  expect(after.save?.committed).toBe(0);
  expect(await readRaw(page)).toBe(unreadable);
  expect(errors).toEqual([]);
});

test("New game leaves an unreadable stored shape byte-identical", async ({
  page,
}) => {
  await boot(page);
  // A structured clone is not a string; the adapter reports `save-shape` and
  // boot can only mark the store unavailable. WR-04: it must never be deleted.
  const stored = { version: 1, mode: "docked", note: "structured clone" };
  await writeStored(page, stored);

  const errors = collectErrors(page);
  await page.reload();
  await waitForReady(page);

  await expect(page.locator("#title-continue")).toBeHidden();
  const booted = await getProbe(page);
  expect(booted.save?.status).toBe("unavailable");
  expect(booted.save?.unavailable).toBe(true);
  expect(await readStored(page)).toEqual(stored);

  // New game must not clear a shape boot could not read...
  await startNewGame(page);
  await page.waitForFunction(
    () => window.__wegolite?.save?.status === "unavailable",
    undefined,
    { timeout: 30_000 },
  );
  expect(await readStored(page)).toEqual(stored);

  // ...and a launch must not overwrite it either.
  await page.click('button[data-action="launch"]');
  await waitForMode(page, "launching");
  const after = await getProbe(page);
  expect(after.save?.attempts).toBe(1);
  expect(after.save?.writes).toBe(0);
  expect(after.save?.skipReason).toBe("unavailable");
  expect(await readStored(page)).toEqual(stored);
  expect(errors).toEqual([]);
});

test("an oversized blob is unreadable and never overwritten", async ({
  page,
}) => {
  await boot(page);
  const oversized = "x".repeat(1_000_000);
  await writeRaw(page, oversized);

  const errors = collectErrors(page);
  await page.reload();
  await waitForReady(page);

  await expect(page.locator("#title-continue")).toBeHidden();
  expect((await getProbe(page)).save?.status).toBe("unreadable");
  // WR-02: the backup path never stores an unbounded copy.
  expect(await readRaw(page, CORRUPT_KEY)).toBeNull();
  expect(await readRaw(page)).toBe(oversized);

  await startNewGame(page);
  await page.click('button[data-action="launch"]');
  await waitForMode(page, "launching");
  expect((await getProbe(page)).save?.writes).toBe(0);
  expect(await readRaw(page)).toBe(oversized);
  expect(errors).toEqual([]);
});

test("an oversized future-version blob is still recognised and untouched", async ({
  page,
}) => {
  await boot(page);
  // Version 3 appears in the first bytes; the rest is padding beyond the cap.
  const future = `${JSON.stringify({
    version: 3,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: 999_999,
    equipment: [],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
    futureBuild: "leave this alone",
  })}${" ".repeat(MAX_SAVE_CHARS)}`;
  expect(future.length).toBeGreaterThan(MAX_SAVE_CHARS);
  await writeRaw(page, future);

  const errors = collectErrors(page);
  await page.reload();
  await waitForReady(page);

  await expect(page.locator("#title-continue")).toBeHidden();
  const booted = await getProbe(page);
  expect(booted.save?.status).toBe("future");
  expect(await readRaw(page, CORRUPT_KEY)).toBeNull();

  await startNewGame(page);
  await page.waitForFunction(
    () => window.__wegolite?.save?.status === "future",
    undefined,
    { timeout: 30_000 },
  );
  expect(await readRaw(page)).toBe(future);

  await page.click('button[data-action="launch"]');
  await waitForMode(page, "launching");
  expect((await getProbe(page)).save?.writes).toBe(0);
  expect(await readRaw(page)).toBe(future);
  expect(errors).toEqual([]);
});

test("duplicate equipment makes an otherwise valid blob corrupt", async ({
  page,
}) => {
  await boot(page);
  const duplicate = JSON.stringify({
    version: 1,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: ["EQ_DOCK_COMP", "EQ_DOCK_COMP"],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
  });
  await writeRaw(page, duplicate);

  const errors = collectErrors(page);
  await page.reload();
  await waitForReady(page);

  await expect(page.locator("#title-continue")).toBeHidden();
  expect((await getProbe(page)).save?.status).toBe("corrupt");
  expect(await readRaw(page, CORRUPT_KEY)).toBe(duplicate);
  expect(errors).toEqual([]);
});

test("a v2 blob with an unknown market good is corrupt and backed up", async ({
  page,
}) => {
  await boot(page);
  // Exactly the 17 market goods, with one key this build does not know: the
  // shared validator rejects it and the blob is backed up before any clear.
  const keys = [
    "food",
    "textiles",
    "radioactives",
    "slaves",
    "liquor_wines",
    "luxuries",
    "narcotics",
    "computers",
    "machinery",
    "alloys",
    "firearms",
    "furs",
    "minerals",
    "gold",
    "platinum",
    "gem_stones",
    "alien_items",
  ];
  const goods = keys.map((key, index) => ({
    key: index === keys.length - 1 ? "unobtainium" : key,
    price: 10 + index,
    stock: index % 128,
  }));
  const corrupt = JSON.stringify({
    version: 2,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: [],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
    market: { systemId: "g0-s7", seed: marketSeedForSystem("g0-s7"), goods },
  });
  await writeRaw(page, corrupt);

  const errors = collectErrors(page);
  await page.reload();
  await waitForReady(page);

  await expect(page.locator("#title-continue")).toBeHidden();
  expect((await getProbe(page)).save?.status).toBe("corrupt");
  expect(await readRaw(page, CORRUPT_KEY)).toBe(corrupt);
  expect(errors).toEqual([]);
});

test("a tainted ?test=1 profile is never autosaved", async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, "/?test=1");
  await startNewGame(page);

  await page.evaluate(() => {
    const hook = window.__wegolite?.test;
    if (hook === undefined) throw new Error("the ?test=1 hook is missing");
    hook.setCredits(5000);
  });
  await page.waitForFunction(
    () => window.__wegolite?.test?.tainted === true,
    undefined,
    { timeout: 10_000 },
  );

  await page.click('button[data-action="launch"]');
  await waitForMode(page, "launching");
  await page.waitForFunction(
    () => (window.__wegolite?.save?.skipReason ?? "") === "tainted",
    undefined,
    { timeout: 30_000 },
  );

  const after = await getProbe(page);
  expect(after.save?.writes).toBe(0);
  expect(after.save?.committed).toBe(0);
  expect(await readRaw(page)).toBeNull();
  expect(errors).toEqual([]);
});

test("a Phase 4 blob without the new fields still restores and offers Continue", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  const oldBlob = JSON.stringify({
    version: 1,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: [],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
  });
  await writeRaw(page, oldBlob);

  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  const booted = await getProbe(page);
  expect(booted.save?.status).toBe("valid");
  expect(booted.save?.continueVisible).toBe(true);

  await continueGame(page);
  const probe = await getProbe(page);
  expect(probe.economy?.credits).toBe(1000);
  expect(probe.economy?.cargo).toEqual({});
  expect(probe.economy?.fuel).toBe(70);
  expect(probe.economy?.missiles).toBe(3);
  expect(probe.economy?.passengerBerths).toBe(0);
  expect(probe.economy?.capacityPods).toBe(20);
  // The missing seed defaults to the system's deterministic seed, never a
  // random or clock value.
  expect(probe.economy?.marketSeed).toBe(marketSeedForSystem("g0-s7"));
  await expect(page.locator('[data-field="credits"]')).toHaveText("100.0 Cr");
  expect(errors).toEqual([]);
});

test("a v1 blob with 21 t of Food at Lave is corrupt, backed up and never offered", async ({
  page,
}) => {
  await boot(page);
  const overCapacity = JSON.stringify({
    version: 1,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: [],
    cargo: [{ key: "food", quantity: 21 }],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
  });
  await writeRaw(page, overCapacity);

  const errors = collectErrors(page);
  await page.reload();
  await waitForReady(page);

  await expect(page.locator("#title-continue")).toBeHidden();
  expect((await getProbe(page)).save?.status).toBe("corrupt");
  expect(await readRaw(page)).toBe(overCapacity);
  expect(await readRaw(page, CORRUPT_KEY)).toBe(overCapacity);
  // Never silently clamped into a smaller hold.
  expect((await getProbe(page)).save?.continueVisible).toBe(false);
  expect(errors).toEqual([]);
});

test("a failed IndexedDB write is visible in the station footer and leaves the blob intact", async ({
  page,
}) => {
  // Wrap `put` before the app boots. `runTransaction` catches the synchronous
  // throw and rejects the write, which is exactly the store-failure path the
  // session reports.
  await page.addInitScript(() => {
    const failWindow = window as Window & { __failSaveWrites?: boolean };
    // Kept as the native function and applied with the real store as `this`.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called with the store instance below
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest {
      if (failWindow.__failSaveWrites === true) {
        throw new Error("injected write failure");
      }
      return original.call(this, value, key);
    };
  });

  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await launchAndAwaitCommit(page);
  const previous = await readRaw(page);
  expect(previous).not.toBeNull();

  await page.reload();
  await waitForReady(page);
  await continueGame(page);
  const committedBefore = (await getProbe(page)).save?.committed ?? 0;

  await page.evaluate(() => {
    (window as Window & { __failSaveWrites?: boolean }).__failSaveWrites = true;
  });

  await page.keyboard.press("Digit8");
  await waitForStationScreen(page, "market");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("KeyY");

  // The trade is playable in memory...
  await page.waitForFunction(
    () => (window.__wegolite?.economy?.cargo?.food ?? 0) === 1,
    undefined,
    { timeout: 30_000 },
  );
  // ...but the write failure is published, not silent.
  await page.waitForFunction(
    () =>
      (window.__wegolite?.save?.skipReason ?? "") === "injected write failure",
    undefined,
    { timeout: 30_000 },
  );

  const after = await getProbe(page);
  expect(after.save?.committed).toBe(committedBefore);
  expect(after.save?.skipReason).toBe("injected write failure");
  const stationStatus = page.locator('#docked [data-footer-role="status"]');
  await expect(stationStatus).toHaveText("Save failed — progress not saved");
  await expect(stationStatus).toHaveAttribute("data-status-tone", "save");
  // The save notice owns the status line; the home hint is never clobbered.
  await expect(page.locator('[data-field="message"]')).not.toContainText(
    "Save failed",
  );
  expect(await readRaw(page)).toBe(previous);

  // A confirmation opened after the failure takes priority over the save part,
  // and cancelling it reveals the retained save failure. The parts are
  // independent, so a failed autosave never cleared a pending [Y/N].
  await page.keyboard.press("ArrowRight");
  await expect(stationStatus).toContainText("Buy");
  await expect(stationStatus).toHaveAttribute("data-status-tone", "confirm");
  await page.keyboard.press("KeyN");
  await expect(stationStatus).toHaveText("Save failed — progress not saved");
  await expect(stationStatus).toHaveAttribute("data-status-tone", "save");
  expect(errors).toEqual([]);
});

test("an accepted buy and removal each write exactly one autosave", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await launchAndAwaitCommit(page);

  await page.reload();
  await waitForReady(page);
  await continueGame(page);
  const base = (await getProbe(page)).save?.committed ?? 0;

  // Opening a screen and changing a selection never write.
  await page.keyboard.press("Digit8");
  await waitForStationScreen(page, "market");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  expect((await getProbe(page)).save?.committed).toBe(base);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("KeyY");
  await page.waitForFunction(
    (expected) => (window.__wegolite?.save?.committed ?? 0) === expected,
    base + 1,
    { timeout: 30_000 },
  );

  // Switching screens and paging never write either.
  await page.keyboard.press("Digit3");
  await waitForStationScreen(page, "outfitting");
  await page.keyboard.press("ArrowDown");
  expect((await getProbe(page)).save?.committed).toBe(base + 1);

  for (let presses = 0; presses < 6; presses += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("KeyY");
  await page.keyboard.press("KeyY");
  await page.waitForFunction(
    (expected) => (window.__wegolite?.save?.committed ?? 0) === expected,
    base + 2,
    { timeout: 30_000 },
  );

  const afterRemoval = await getProbe(page);
  expect(afterRemoval.economy?.missiles).toBe(0);
  expect(afterRemoval.economy?.cargo?.food).toBe(1);

  // A third Y is a no-op: no prompt, no credits, no save. The cursor now sits
  // on the unaffordable passenger berth, so its notice is the visible status.
  const credits = afterRemoval.economy?.credits;
  await page.keyboard.press("KeyY");
  await expect(page.locator('#docked [data-footer-role="status"]')).toHaveText(
    "Requires TL 5",
  );
  await expect(
    page.locator('#docked [data-footer-role="status"]'),
  ).toHaveAttribute("data-status-tone", "notice");
  const idle = await getProbe(page);
  expect(idle.economy?.credits).toBe(credits);
  expect(idle.save?.committed).toBe(base + 2);

  await page.keyboard.press("Digit5");
  await waitForStationScreen(page, "status");
  await page.keyboard.press("Tab");
  await page.keyboard.press("PageUp");
  expect((await getProbe(page)).save?.committed).toBe(base + 2);
  expect(errors).toEqual([]);
});
