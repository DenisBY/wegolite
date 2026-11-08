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
import {
  AUTOSAVE_KEY,
  SAVE_DB,
  SAVE_STORE,
  readRaw,
  writeRaw,
} from "./helpers/save-store.js";
import { formatClock } from "../../src/render/hud/format.js";
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

test.setTimeout(360_000);

/** The authored Coriolis dock subentity offset and the Cobra's nose Z. */
const DOCK_OFFSET = 500.2561;
const COBRA_NOSE_Z = -43.4655;

/**
 * Place the ship at the dock mouth through the `?test=1` pose seam. This is the
 * same independent dock frame docking.spec and autosave.spec use, inlined here
 * rather than shared through a helper file.
 */
async function dockAtMouth(page: Page): Promise<void> {
  const probe = await getProbe(page);
  const station = probe.world?.station;
  const planet = probe.world?.planet;
  if (station === undefined || planet === undefined) {
    throw new Error("the probe has no station/planet world positions");
  }
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
}

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
  market?: {
    systemId: string;
    seed: number;
    goods: { key: string; price: number; stock: number }[];
  };
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
  // The notice is set synchronously on commit, but the probe's saveScreen
  // snapshot refreshes once per frame; wait for the frame that carries it.
  await page.waitForFunction(
    () => (window.__wegolite?.saveScreen?.notice ?? "").startsWith("Saved at "),
    undefined,
    { timeout: 30_000 },
  );
  expect((await getProbe(page)).saveScreen?.notice).toMatch(/^Saved at /);
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

/** Wait for the overwrite dialog to open on the probe (never a fixed sleep). */
async function waitForConfirming(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__wegolite?.saveScreen?.confirming === true,
    undefined,
    { timeout: 30_000 },
  );
}

test("the overwrite dialog: mouse Cancel, mouse Accept and Enter on Cancel each resolve once (G-3)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await startNewGame(page);
  await waitForDocked(page);
  await page.keyboard.press("F2");
  await expect(page.locator("#save-load")).toBeVisible();

  // The absent slot writes at once; every Save below targets a committed slot.
  await page.keyboard.press("KeyS");
  await waitForCommitted(page, 1);

  // 1. Mouse Cancel closes the dialog without writing, and the next Save asks
  //    again rather than silently doing nothing.
  await page.keyboard.press("KeyS");
  await waitForConfirming(page);
  await page.click("#save-load-confirm-cancel");
  await expect(page.locator("#save-load-confirm")).toBeHidden();
  await expect(page.locator('[data-field="save-load-confirm"]')).toHaveText("");
  await expect(page.locator("#save-load-screen")).toBeFocused();
  const afterMouseCancel = await getProbe(page);
  expect(afterMouseCancel.saveScreen?.confirming).toBe(false);
  expect(afterMouseCancel.save?.committed).toBe(1);
  const bytesBeforeAccept = await readRaw(page);
  const revisionBeforeAccept = afterMouseCancel.save?.revision ?? 0;

  // 2. Mouse Accept writes exactly one new revision and keeps focus inside the
  //    screen. The same docked state, with a frozen clock, encodes to the same
  //    bytes, and the revision is store metadata outside the blob.
  await page.keyboard.press("KeyS");
  await waitForConfirming(page);
  await page.click("#save-load-confirm-accept");
  await waitForCommitted(page, 2);
  await expect(page.locator("#save-load-confirm")).toBeHidden();
  await expect(page.locator("#save-load-screen")).toBeFocused();
  const afterAccept = await getProbe(page);
  expect(afterAccept.saveScreen?.confirming).toBe(false);
  expect(afterAccept.save?.committed).toBe(2);
  expect(afterAccept.save?.revision).toBe(revisionBeforeAccept + 1);
  expect(await readRaw(page)).toBe(bytesBeforeAccept);

  // 3. Enter follows the focused control: on the safe Cancel it cancels. The
  //    bytes stay identical and no revision commits.
  await page.keyboard.press("KeyS");
  await waitForConfirming(page);
  await expect(page.locator("#save-load-confirm-cancel")).toBeFocused();
  const bytesBeforeEnter = await readRaw(page);
  const beforeEnter = await getProbe(page);
  await page.keyboard.press("Enter");
  await expect(page.locator("#save-load-confirm")).toBeHidden();
  await expect(page.locator("#save-load-screen")).toBeFocused();
  expect(await readRaw(page)).toBe(bytesBeforeEnter);
  const afterEnter = await getProbe(page);
  expect(afterEnter.saveScreen?.confirming).toBe(false);
  expect(afterEnter.save?.committed).toBe(beforeEnter.save?.committed);
  expect(afterEnter.save?.revision).toBe(beforeEnter.save?.revision);

  // Save is still live after the Enter cancel, and Y is the direct confirm.
  await page.keyboard.press("KeyS");
  await waitForConfirming(page);
  await page.keyboard.press("KeyY");
  await waitForCommitted(page, 3);
  await expect(page.locator("#save-load-confirm")).toBeHidden();
  const afterY = await getProbe(page);
  expect(afterY.save?.committed).toBe(3);
  expect(afterY.save?.revision).toBe((afterEnter.save?.revision ?? 0) + 1);
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
  // SAVE-06: the restored market is the persisted snapshot verbatim, all 17
  // goods with the same key, price and stock — the seed is never re-run.
  const savedMarket = (saved.market?.goods ?? []).map((good) => ({
    key: good.key,
    price: good.price,
    stock: good.stock,
  }));
  expect(savedMarket).toHaveLength(17);
  expect(after.economy?.market).toEqual(savedMarket);
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

  // A reload after the in-session Load returns the same snapshot from the same
  // untouched bytes: Load never re-encoded or re-seeded them.
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  await page.click("#title-continue");
  await waitForDocked(page);
  const reloaded = await getProbe(page);
  expect(reloaded.mode).toBe("docked");
  expect(reloaded.systemId).toBe(saved.system.id);
  expect(reloaded.economy?.market).toEqual(savedMarket);
  expect(await readRaw(page)).toBe(savedRaw);
  expect(errors).toEqual([]);
});

test("an in-session Load of an in-flight save returns to flight with the station hidden", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // `?test=1` is needed for the dock-mouth pose seam that puts a real message
  // in the queue before the Load (G-8). Without a mutation the hook is inert.
  await boot(page, "/?test=1");
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

  // G-8 step 1: F2 is docked-only, so a pre-load message has to be queued in
  // flight and then carried into a docked F2 screen. Close F2, launch, and wait
  // for the launch's pre-launch autosave to commit (it writes a docked blob, so
  // it must land before the `stored` rewrite below) and for a fresh message.
  const committedBeforeLaunch = (await getProbe(page)).save?.committed ?? 0;
  await page.keyboard.press("Escape");
  await expect(page.locator("#save-load")).toBeHidden();
  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");
  await page.waitForFunction(
    (before) => (window.__wegolite?.save?.committed ?? 0) > before,
    committedBeforeLaunch,
    { timeout: 60_000 },
  );
  await page.waitForFunction(
    () => (window.__wegolite?.messages ?? 0) >= 1,
    undefined,
    { timeout: 60_000 },
  );

  // G-8 step 2: dock through the pose seam. The mutation taints the session, so
  // the dock autosave is suppressed and cannot overwrite the rewritten slot.
  await dockAtMouth(page);
  await waitForMode(page, "docked");

  // G-8 step 3: every autosave trigger has passed, so rewrite the slot, open F2
  // and capture the pre-load message that is visible at the moment of the Load.
  await writeRaw(page, stored);
  await page.keyboard.press("F2");
  const beforeLoad = await getProbe(page);
  expect(beforeLoad.messages).toBeGreaterThanOrEqual(1);
  const preLoadMessage = beforeLoad.hud?.message ?? "";
  expect(preLoadMessage).not.toBe("");

  // G-8 step 4: Load the in-flight blob and prove the captured message is gone.
  // A first-use hint may legitimately be queued afterward, so only the
  // specific pre-load text is asserted absent and the queue is bounded.
  expect(await readRaw(page)).toBe(stored);
  await page.keyboard.press("KeyL");
  await waitForMode(page, "inFlight");
  await page.waitForFunction(
    () => window.__wegolite?.restore?.mode === "inFlight",
    undefined,
    { timeout: 60_000 },
  );

  const after = await getProbe(page);
  expect(after.hud?.message ?? "").not.toBe(preLoadMessage);
  expect(after.hud?.message ?? "").not.toContain(preLoadMessage);
  expect(after.messages).toBeLessThanOrEqual(1);
  // The dock envelopes are replaced with the Load, so neither channel carries
  // the replaced session's bounce or scrape feedback.
  expect(after.dock?.shake ?? 0).toBe(0);
  expect(after.dock?.flash ?? 0).toBe(0);
  expect(after.mode).toBe("inFlight");
  expect(after.restore?.systemId).toBe(dockedBlob.system.id);
  expect(after.restore?.position).toEqual([0, 0, 0]);
  expect(after.restore?.orientation).toEqual([1, 0, 0, 0]);
  expect(after.restore?.speed).toBe(50);
  expect(after.restore?.clock).toBe(dockedBlob.clockSeconds);
  // The in-flight branch restores the same persisted market verbatim.
  expect(after.economy?.market).toEqual(
    (dockedBlob.market?.goods ?? []).map((good) => ({
      key: good.key,
      price: good.price,
      stock: good.stock,
    })),
  );
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

  // G-8 step 5: the ?test=1 hook must mutate the live state the Load installed,
  // not the pre-Load object. Speed 0 keeps the restored clock from moving the
  // ship, so the probe settles on the requested point.
  await page.evaluate(() => {
    const hook = window.__wegolite?.test;
    if (hook === undefined) {
      throw new Error("the ?test=1 hook is missing after the Load");
    }
    hook.setPosition(1, 2, 3);
    hook.setSpeed(0);
  });
  await page.waitForFunction(
    () => {
      const position = window.__wegolite?.position;
      if (position === undefined) return false;
      return (
        Math.abs(position[0] - 1) <= 1e-3 &&
        Math.abs(position[1] - 2) <= 1e-3 &&
        Math.abs(position[2] - 3) <= 1e-3
      );
    },
    undefined,
    { timeout: 30_000 },
  );
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
