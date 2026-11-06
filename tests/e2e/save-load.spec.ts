// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The F2 Save/Load browser proof (SAVE-01, SAVE-04, SAVE-05).
 *
 * Every case boots the real app in a fresh Playwright context and waits on
 * `window.__wegolite`; no assertion reads a pixel. The screen is docked-only,
 * so the flight case launches first. IndexedDB is the only durable surface and
 * the isolation cases compare raw bytes across a failed load.
 *
 * Headless Chromium runs on SwiftShader, so every wait is a correctness wait on
 * the simulation probe with a generous bound.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getProbe, waitForReady } from "./helpers/probe.js";
import { formatClock } from "../../src/render/hud/format.js";

test.setTimeout(360_000);

const SAVE_DB = "wegolite";
const SAVE_STORE = "saves";
const AUTOSAVE_KEY = "autosave";

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

async function waitForDocked(page: Page): Promise<void> {
  await waitForMode(page, "docked");
  await expect(page.locator("#docked")).toBeVisible();
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

/** Delete a raw value from the save database from outside the app. */
async function deleteRaw(
  page: Page,
  key: string = AUTOSAVE_KEY,
): Promise<void> {
  await page.evaluate(
    (payload: { key: string; db: string; store: string }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(payload.db, 1);
        request.onerror = () => {
          reject(new Error(`open failed: ${String(request.error)}`));
        };
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(payload.store)) {
            db.close();
            resolve();
            return;
          }
          const transaction = db.transaction(payload.store, "readwrite");
          transaction.objectStore(payload.store).delete(payload.key);
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => {
            reject(new Error(`delete failed: ${String(transaction.error)}`));
          };
        };
      }),
    { key, db: SAVE_DB, store: SAVE_STORE },
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

/** Wait for a committed save count. */
async function waitForCommitted(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (expected) => (window.__wegolite?.save?.committed ?? 0) >= expected,
    count,
    { timeout: 60_000 },
  );
}

interface DecodedSave {
  version: number;
  mode: string;
  clockSeconds: number;
  credits: number;
  fuel: number;
  system: { id: string };
  station: { key: string };
  targetSystem?: string;
  marketSeed?: number;
  market?: { systemId: string; seed: number; goods: { key: string }[] };
  flight?: {
    position: [number, number, number];
    orientation: [number, number, number, number];
    speed: number;
    pitchRate: number;
    rollRate: number;
    torus: boolean;
  };
}

function decode(raw: string | null): DecodedSave {
  if (raw === null) throw new Error("the save record is absent");
  return JSON.parse(raw) as DecodedSave;
}

test("F2 opens the Save/Load screen only while docked and closes on Return/Escape", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await waitForDocked(page);

  // Docked-only: nothing is shown before F2.
  await expect(page.locator("#save-load")).toBeHidden();
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeVisible();
  await expect(page.locator("#save-load-screen")).toBeFocused();

  // One slot line, three semantic rows and no second <footer>.
  await expect(page.locator('[data-field="save-load-slot"]')).toHaveText(
    /^Autosave · Lave · \d{7}:\d{2}:\d{2}:\d{2}$/,
  );
  for (const row of ["save", "load", "return"]) {
    await expect(page.locator(`[data-save-action="${row}"]`)).toBeVisible();
  }
  await expect(page.locator("#save-load footer")).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(1);
  const probe = await getProbe(page);
  expect(probe.saveScreen?.open).toBe(true);
  expect(probe.saveScreen?.row).toBe("save");

  // Escape closes without pausing: Escape in saveScreen is Return, not pause.
  await page.keyboard.press("Escape");
  await expect(page.locator("#save-load")).toBeHidden();
  await expect(page.locator("#pause")).toBeHidden();
  expect((await getProbe(page)).paused).toBe(false);

  // The Return row closes it equally, and the station screen regains focus.
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeVisible();
  await page.click('[data-save-action="return"]');
  await expect(page.locator("#save-load")).toBeHidden();
  await expect(page.locator("#docked")).toBeVisible();
  await expect(page.locator("#station-screen")).toBeFocused();
  expect(errors).toEqual([]);
});

test("F2 is inert while paused and in flight", async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await waitForDocked(page);

  // Paused: the input layer resolves only `pause`, and the open sink repeats
  // the guard, so no z-index-10 overlay appears beneath the pause overlay.
  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.__wegolite?.paused === true,
    undefined,
    {
      timeout: 30_000,
    },
  );
  await expect(page.locator("#pause")).toBeVisible();
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeHidden();
  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.__wegolite?.paused === false,
    undefined,
    {
      timeout: 30_000,
    },
  );

  // In flight: F2 is docked-only.
  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeHidden();
  expect((await getProbe(page)).saveScreen?.open).toBe(false);
  expect(errors).toEqual([]);
});

test("a manual Save writes the one committed slot and the next Save asks before overwriting", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await waitForDocked(page);

  expect((await getProbe(page)).save?.status).toBe("absent");
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeVisible();
  const clockBefore = Math.floor((await getProbe(page)).clock);

  // An absent slot writes immediately: no confirmation on the first Save.
  await page.keyboard.press("KeyS");
  await waitForCommitted(page, 1);
  const first = await getProbe(page);
  expect(first.save?.writes).toBe(1);
  expect(first.save?.committed).toBe(1);
  // New game consumed a clear revision, so the first save is revision 2; the
  // assertion below pins monotonic increments rather than the absolute value.
  const firstRevision = first.save?.revision ?? 0;
  expect(firstRevision).toBeGreaterThanOrEqual(1);
  expect(first.save?.lastClock).toBe(clockBefore);
  expect(first.saveScreen?.notice).toMatch(/^Saved at /);
  await expect(page.locator('[data-field="save-load-slot"]')).toHaveText(
    `Autosave · Lave · ${formatClock(first.save?.lastClock ?? 0)}`,
  );

  // The manual blob is a canonical v2 docked save: one market snapshot, no
  // second seed encoding, no pose.
  const manualRaw = await readRaw(page);
  const blob = decode(manualRaw);
  expect(blob.version).toBe(2);
  expect(blob.mode).toBe("docked");
  expect(blob.system.id).toBe(first.systemId);
  expect(blob.clockSeconds).toBe(clockBefore);
  expect(blob.credits).toBe(first.economy?.credits);
  expect(blob.market?.systemId).toBe(first.systemId);
  expect(blob.market?.goods).toHaveLength(17);
  expect(blob.marketSeed).toBeUndefined();
  expect(blob.flight).toBeUndefined();

  // The second Save asks before replacing the committed slot.
  await page.keyboard.press("KeyS");
  await page.waitForFunction(
    () => window.__wegolite?.saveScreen?.confirming === true,
    undefined,
    { timeout: 30_000 },
  );
  await expect(page.locator("#save-load-confirm")).toBeVisible();
  await expect(page.locator("#save-load-confirm-cancel")).toBeFocused();
  await expect(page.locator('[data-field="save-load-confirm"]')).toHaveText(
    "Overwrite the autosave? [Y/N]",
  );

  // Cancel leaves the blob byte-identical and reports no new revision.
  const bytesBeforeCancel = await readRaw(page);
  await page.keyboard.press("KeyN");
  await expect(page.locator("#save-load-confirm")).toBeHidden();
  expect(await readRaw(page)).toBe(bytesBeforeCancel);
  const afterCancel = await getProbe(page);
  expect(afterCancel.save?.committed).toBe(1);
  expect(afterCancel.save?.revision).toBe(firstRevision);

  // Confirm writes exactly one new revision at the same committed clock.
  await page.keyboard.press("KeyS");
  await page.waitForFunction(
    () => window.__wegolite?.saveScreen?.confirming === true,
    undefined,
    { timeout: 30_000 },
  );
  await page.keyboard.press("KeyY");
  await waitForCommitted(page, 2);
  const confirmed = await getProbe(page);
  expect(confirmed.save?.committed).toBe(2);
  expect(confirmed.save?.revision).toBe(firstRevision + 1);
  expect(confirmed.save?.lastClock).toBe(clockBefore);
  await expect(page.locator("#save-load-confirm")).toBeHidden();

  // The manual shape is identical to an autosave from the same state: the
  // pre-launch anchor writes the same bytes because it uses the same encoder.
  const manualFinal = await readRaw(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#save-load")).toBeHidden();
  await page.keyboard.press("Digit1");
  await waitForCommitted(page, 3);
  expect(await readRaw(page)).toBe(manualFinal);
  expect(errors).toEqual([]);
});

test("a future or unreadable slot is refused and never overwritten", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  const futureRaw = JSON.stringify({ version: 3, future: true });
  await writeRaw(page, futureRaw);

  await page.reload();
  await waitForReady(page);
  await startNewGame(page);
  await waitForDocked(page);
  expect((await getProbe(page)).save?.status).toBe("future");

  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeVisible();
  await expect(page.locator('[data-field="save-load-notice"]')).toHaveText(
    /read-only/,
  );
  await page.keyboard.press("KeyS");
  await page.waitForFunction(
    () => (window.__wegolite?.save?.attempts ?? 0) >= 1,
    undefined,
    { timeout: 30_000 },
  );
  const futureProbe = await getProbe(page);
  expect(futureProbe.save?.writes).toBe(0);
  expect(futureProbe.save?.committed).toBe(0);
  expect(futureProbe.save?.skipReason).toBe("future");
  expect(await readRaw(page)).toBe(futureRaw);
  await expect(page.locator("#save-load")).toBeVisible();

  // An unreadable (non-save) blob is equally untouchable.
  await page.keyboard.press("Escape");
  await expect(page.locator("#save-load")).toBeHidden();
  const unreadableRaw = "this is not a wegolite save";
  await writeRaw(page, unreadableRaw);
  await page.reload();
  await waitForReady(page);
  await startNewGame(page);
  await waitForDocked(page);
  expect((await getProbe(page)).save?.status).toBe("unreadable");

  await page.keyboard.press("F2");
  await expect(page.locator('[data-field="save-load-notice"]')).toHaveText(
    /read-only/,
  );
  await page.keyboard.press("KeyS");
  await page.waitForFunction(
    () => (window.__wegolite?.save?.attempts ?? 0) >= 1,
    undefined,
    { timeout: 30_000 },
  );
  const unreadableProbe = await getProbe(page);
  expect(unreadableProbe.save?.writes).toBe(0);
  expect(unreadableProbe.save?.committed).toBe(0);
  expect(unreadableProbe.save?.skipReason).toBe("unreadable");
  expect(await readRaw(page)).toBe(unreadableRaw);
  expect(errors).toEqual([]);
});

test("an in-session Load restores the saved docked session without reloading", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // `?test=1` mutates the live profile so the load must put the saved one back.
  await boot(page, "/?test=1");
  await startNewGame(page);
  await waitForDocked(page);

  await page.keyboard.press("F2");
  await page.keyboard.press("KeyS");
  await waitForCommitted(page, 1);
  const savedRaw = await readRaw(page);
  const saved = decode(savedRaw);
  expect(saved.mode).toBe("docked");

  // Mutate after the save: the load must discard this live state.
  const mutatedCredits = saved.credits + 50_000;
  await page.evaluate((credits) => {
    window.__wegolite?.test?.setCredits(credits);
  }, mutatedCredits);
  await page.waitForFunction(
    (credits) => window.__wegolite?.economy?.credits === credits,
    mutatedCredits,
    { timeout: 30_000 },
  );
  // A page reload would drop this marker: Load must not navigate.
  await page.evaluate(() => {
    (window as unknown as { __loadMarker?: string }).__loadMarker = "alive";
  });

  await page.keyboard.press("KeyL");
  await page.waitForFunction(
    (credits) => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.ready === true &&
        probe.mode === "docked" &&
        probe.economy?.credits === credits
      );
    },
    saved.credits,
    { timeout: 60_000 },
  );

  const after = await getProbe(page);
  expect(after.mode).toBe("docked");
  expect(after.systemId).toBe(saved.system.id);
  expect(after.clock).toBe(saved.clockSeconds);
  expect(after.economy?.credits).toBe(saved.credits);
  expect(after.restore?.mode).toBe("docked");
  expect(after.restore?.clock).toBe(saved.clockSeconds);
  expect(after.saveScreen?.open).toBe(false);
  expect(after.chart?.open).toBe(false);
  // Load is read-only: the blob is byte-identical and the page never reloaded.
  expect(await readRaw(page)).toBe(savedRaw);
  expect(
    await page.evaluate(
      () => (window as unknown as { __loadMarker?: string }).__loadMarker,
    ),
  ).toBe("alive");
  await expect(page.locator("#save-load")).toBeHidden();
  await expect(page.locator("#docked")).toBeVisible();
  expect(errors).toEqual([]);
});

test("an in-session Load of an in-flight save returns to flight with the station hidden", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await waitForDocked(page);

  // Produce a real v2 docked blob, then rewrite only the mode/pose fields so
  // the save exercises the in-flight branch of the same parser/restore.
  await page.keyboard.press("F2");
  await page.keyboard.press("KeyS");
  await waitForCommitted(page, 1);
  const dockedBlob = decode(await readRaw(page));
  const inFlightBlob = {
    ...dockedBlob,
    mode: "inFlight",
    flight: {
      position: [0, 0, 0],
      orientation: [1, 0, 0, 0],
      speed: 50,
      pitchRate: 0,
      rollRate: 0,
      torus: false,
    },
  };
  const stored = JSON.stringify(inFlightBlob);
  await writeRaw(page, stored);
  await page.evaluate(() => {
    (window as unknown as { __loadMarker?: string }).__loadMarker = "alive";
  });

  await page.keyboard.press("KeyL");
  await waitForMode(page, "inFlight");
  await page.waitForFunction(
    () => window.__wegolite?.restore?.mode === "inFlight",
    undefined,
    { timeout: 60_000 },
  );

  const after = await getProbe(page);
  expect(after.mode).toBe("inFlight");
  expect(after.restore?.systemId).toBe(dockedBlob.system.id);
  expect(after.restore?.position).toEqual([0, 0, 0]);
  expect(after.restore?.orientation).toEqual([1, 0, 0, 0]);
  expect(after.restore?.speed).toBe(50);
  expect(after.restore?.clock).toBe(dockedBlob.clockSeconds);
  expect(after.saveScreen?.open).toBe(false);
  // Flight is visible, the station overlay is not, and the blob is unchanged.
  await expect(page.locator("#docked")).toBeHidden();
  await expect(page.locator("#hud")).toBeVisible();
  expect(await readRaw(page)).toBe(stored);
  expect(
    await page.evaluate(
      () => (window as unknown as { __loadMarker?: string }).__loadMarker,
    ),
  ).toBe("alive");
  expect(errors).toEqual([]);
});

test("a failed Load shows the reason and leaves the session and bytes untouched", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await waitForDocked(page);

  await page.keyboard.press("F2");
  await page.keyboard.press("KeyS");
  await waitForCommitted(page, 1);
  const baseline = await getProbe(page);

  const corruptRaw = "this is not a wegolite save";
  await writeRaw(page, corruptRaw);
  await page.evaluate(() => {
    (window as unknown as { __loadMarker?: string }).__loadMarker = "alive";
  });
  await page.keyboard.press("KeyL");
  await page.waitForFunction(
    () => window.__wegolite?.saveScreen?.notice === "Save could not be read",
    undefined,
    { timeout: 30_000 },
  );
  const afterCorrupt = await getProbe(page);
  expect(afterCorrupt.mode).toBe(baseline.mode);
  expect(afterCorrupt.systemId).toBe(baseline.systemId);
  expect(afterCorrupt.clock).toBe(baseline.clock);
  expect(afterCorrupt.economy?.credits).toBe(baseline.economy?.credits);
  expect(afterCorrupt.save?.status).toBe("valid");
  expect(afterCorrupt.save?.committed).toBe(baseline.save?.committed);
  expect(afterCorrupt.saveScreen?.open).toBe(true);
  expect(await readRaw(page)).toBe(corruptRaw);

  // A future-version blob is refused by the same classifier and kept.
  const futureRaw = JSON.stringify({ version: 3, future: true });
  await writeRaw(page, futureRaw);
  await page.keyboard.press("KeyL");
  await page.waitForFunction(
    () =>
      window.__wegolite?.saveScreen?.notice ===
      "Save is from a newer version of Wegolite — cannot load",
    undefined,
    { timeout: 30_000 },
  );
  expect(await readRaw(page)).toBe(futureRaw);

  // An absent slot is a copy, not an error, and still changes nothing.
  await deleteRaw(page);
  await page.keyboard.press("KeyL");
  await page.waitForFunction(
    () => window.__wegolite?.saveScreen?.notice === "No saved game to load",
    undefined,
    { timeout: 30_000 },
  );
  expect(await readRaw(page)).toBeNull();
  const after = await getProbe(page);
  expect(after.mode).toBe(baseline.mode);
  expect(after.systemId).toBe(baseline.systemId);
  expect(after.clock).toBe(baseline.clock);
  expect(after.economy?.credits).toBe(baseline.economy?.credits);
  expect(after.save?.committed).toBe(baseline.save?.committed);
  expect(
    await page.evaluate(
      () => (window as unknown as { __loadMarker?: string }).__loadMarker,
    ),
  ).toBe("alive");
  await expect(page.locator("#save-load")).toBeVisible();
  await expect(page.locator("#docked")).toBeVisible();
  expect(errors).toEqual([]);
});
