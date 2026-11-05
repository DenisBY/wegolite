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

test.setTimeout(240_000);

const SAVE_DB = "wegolite";
const SAVE_STORE = "saves";
const AUTOSAVE_KEY = "autosave";
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

/** Write a raw value into the save database from outside the app. */
async function writeRaw(
  page: Page,
  raw: string,
  key: string = AUTOSAVE_KEY,
): Promise<void> {
  await page.evaluate(
    (payload: { raw: string; key: string; db: string; store: string }) =>
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
          transaction.objectStore(payload.store).put(payload.raw, payload.key);
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
    { raw, key, db: SAVE_DB, store: SAVE_STORE },
  );
}

/** Read a raw value, or `null` when the record is absent. */
async function readRaw(
  page: Page,
  key: string = AUTOSAVE_KEY,
): Promise<string | null> {
  return page.evaluate(
    (payload: { key: string; db: string; store: string }) =>
      new Promise<string | null>((resolve, reject) => {
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
            resolve(typeof value === "string" ? value : null);
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

test("a committed launch write offers Continue at exactly the saved clock", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  await startNewGame(page);
  const savedClock = await launchAndAwaitCommit(page);
  expect(savedClock).toBe(CLOCK_START + 600);

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

test("a manual dock does not autosave: Continue still restores the launch clock", async ({
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
  // Docking is not an autosave trigger: the launch write is still the only one.
  await page.waitForTimeout(600);
  const docked = await getProbe(page);
  expect(docked.mode).toBe("docked");
  // `attempts` is incremented before the taint skip, so this proves the dock
  // never called `autosave()` at all — not merely that the write was skipped.
  expect(docked.save?.attempts).toBe(1);
  expect(docked.save?.writes).toBe(1);
  expect(docked.save?.committed).toBe(1);
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

test("New game clears a committed save before starting", async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await launchAndAwaitCommit(page);

  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();

  await page.click("#title-start");
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

test("a future-version blob is never cleared or replaced", async ({ page }) => {
  await boot(page);
  const future = JSON.stringify({
    version: 2,
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
  // Version 2 appears in the first bytes; the rest is padding beyond the cap.
  const future = `${JSON.stringify({
    version: 2,
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
