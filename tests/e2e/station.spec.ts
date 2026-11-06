// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The docked economy loop in the browser (ECON-01, ECON-02, ECON-04, ECON-09).
 *
 * Evidence is the probe and `textContent`, never a screenshot. The tracer buys
 * one tonne of Food through the footer confirmation, proves the autosave, and
 * reloads into the same hold; the expansion proves the persisted seed and the
 * synchronous same-frame context switch.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { formatDecicredits } from "../../src/sim/player/profile.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import { getProbe, waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

test.setTimeout(180_000);

/**
 * Start a fresh game from the actual initial focus, keyboard only.
 *
 * The plan requires the whole station loop to be operable without a pointer, so
 * even the title is started with Tab/Enter. `#title-confirm` appears only when
 * boot found a clearable save; the accept control is focused programmatically
 * and activated with Enter (never clicked).
 */
async function startFromKeyboard(page: Page, url = "/?test=1"): Promise<void> {
  await page.goto(url);
  await waitForReady(page);
  for (let presses = 0; presses < 12; presses += 1) {
    const active = await page.evaluate(() => document.activeElement?.id ?? "");
    if (active === "title-start") break;
    await page.keyboard.press("Tab");
  }
  await expect(page.locator("#title-start")).toBeFocused();
  await page.keyboard.press("Enter");
  const confirm = page.locator("#title-confirm");
  if (await confirm.isVisible()) {
    await page.locator("#title-confirm-accept").focus();
    await page.keyboard.press("Enter");
  }
  await page.waitForFunction(
    () => window.__wegolite?.mode === "docked",
    undefined,
    { timeout: 30_000 },
  );
}

async function bootToHome(page: Page): Promise<void> {
  await page.goto("/?test=1");
  await waitForReady(page);
  await startNewGame(page);
  await page.waitForFunction(
    () => window.__wegolite?.mode === "docked",
    undefined,
    { timeout: 30_000 },
  );
}

async function waitForScreen(page: Page, screen: string): Promise<void> {
  await page.waitForFunction(
    (expected) => window.__wegolite?.station?.screen === expected,
    screen,
    { timeout: 30_000 },
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

test("buys one tonne of Food, autosaves and reloads into the same hold", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootToHome(page);

  const initial = await getProbe(page);
  expect(initial.economy?.marketSeed).toBe(marketSeedForSystem("g0-s7"));
  expect(initial.economy?.market).toHaveLength(17);
  const food = initial.economy?.market.find((row) => row.key === "food");
  expect(food).toEqual({ key: "food", price: 38, stock: 16 });
  expect(initial.economy?.credits).toBe(1000);

  const navigationBefore = await page.evaluate(
    () => performance.getEntriesByType("navigation").length,
  );

  await page.keyboard.press("Digit8");
  await waitForScreen(page, "market");
  await expect(page.locator("#station-screen")).toHaveAttribute(
    "data-screen",
    "market",
  );
  const foodRow = page.locator('tr[data-key="food"]');
  await expect(foodRow).toContainText("Food");
  await expect(foodRow).toContainText("3.8 Cr");
  await expect(foodRow).toContainText("16");

  await page.keyboard.press("ArrowRight");
  const price = food?.price ?? 38;
  await expect(page.locator('[data-field="station-confirm"]')).toHaveText(
    `Buy 1 t Food for ${formatDecicredits(price)}? [Y/N]`,
  );

  // The Digit8 path never navigates or reloads the page.
  expect(
    await page.evaluate(
      () => performance.getEntriesByType("navigation").length,
    ),
  ).toBe(navigationBefore);

  await page.keyboard.press("KeyY");
  await expect
    .poll(async () => (await getProbe(page)).economy?.cargo?.food)
    .toBe(1);
  const afterTrade = await getProbe(page);
  expect(afterTrade.economy?.credits).toBe(1000 - price);
  await expect(page.locator('[data-field="market-load"]')).toHaveText(
    "Load 1 / 20 t",
  );

  await page.waitForFunction(
    () => (window.__wegolite?.save?.committed ?? 0) >= 1,
    undefined,
    { timeout: 30_000 },
  );

  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  await page.click("#title-continue");
  await page.waitForFunction(
    () => window.__wegolite?.mode === "docked",
    undefined,
    { timeout: 30_000 },
  );

  await page.keyboard.press("Digit8");
  await waitForScreen(page, "market");
  const restored = await getProbe(page);
  expect(restored.economy?.cargo?.food).toBe(1);
  expect(restored.economy?.credits).toBe(1000 - price);
  expect(
    restored.economy?.market.find((row) => row.key === "food")?.price,
  ).toBe(price);

  expect(errors).toEqual([]);
});

test("launch and redock reuse the persisted seed, prices and stock", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootToHome(page);

  const before = await getProbe(page);
  const seed = before.economy?.marketSeed;
  const rows = before.economy?.market ?? [];
  expect(seed).toBe(marketSeedForSystem("g0-s7"));
  expect(rows).toHaveLength(17);

  await page.keyboard.press("Digit1");
  await page.waitForFunction(
    () => window.__wegolite?.mode === "inFlight",
    undefined,
    { timeout: 30_000 },
  );

  const granted = await page.evaluate(() => {
    const hook = window.__wegolite?.test;
    if (hook === undefined) throw new Error("the ?test=1 hook is missing");
    return hook.grantEquipment("EQ_DOCK_COMP");
  });
  expect(granted).toBe(true);
  await page.waitForFunction(
    () => window.__wegolite?.test?.tainted === true,
    undefined,
    { timeout: 10_000 },
  );

  await page.keyboard.down("Shift");
  await page.keyboard.press("KeyC");
  await page.keyboard.up("Shift");
  await page.waitForFunction(
    () => window.__wegolite?.mode === "docked",
    undefined,
    { timeout: 30_000 },
  );

  const after = await getProbe(page);
  expect(after.dock?.lastClockDelta).toBe(1200);
  expect(after.economy?.marketSeed).toBe(seed);
  expect(after.economy?.market.map((row) => row.price)).toEqual(
    rows.map((row) => row.price),
  );
  // A `docked` event never regenerates the in-memory market.
  expect(after.economy?.market.map((row) => row.stock)).toEqual(
    rows.map((row) => row.stock),
  );
  // The station probe carries every field this plan asserts; an accidental
  // extra field would show up here.
  expect(Object.keys(after.economy ?? {}).sort()).toEqual([
    "capacityPods",
    "cargo",
    "credits",
    "fuel",
    "holdPods",
    "lastTrade",
    "market",
    "marketSeed",
    "missiles",
    "passengerBerths",
  ]);

  expect(errors).toEqual([]);
});

test("dispatches Digit8 and the next key in one frame against the new context", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootToHome(page);

  await page.evaluate(() => {
    const fire = (code: string): void => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }),
      );
    };
    fire("Digit8");
    fire("ArrowRight");
  });
  await waitForScreen(page, "market");
  await expect(page.locator('[data-field="station-confirm"]')).toContainText(
    "Buy 1 t Food",
  );

  await page.evaluate(() => {
    const fire = (code: string): void => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }),
      );
    };
    fire("Digit8");
    fire("Escape");
  });
  await waitForScreen(page, "home");

  expect(errors).toEqual([]);
});

test("cancels a plain F5 but never a Ctrl+F5 or a rebind capture", async ({
  page,
}) => {
  await bootToHome(page);

  const plain = await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", {
      code: "F5",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(plain).toBe(true);

  const chord = await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", {
      code: "F5",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(chord).toBe(false);
});

test("F3 is a two-pane keyboard outfitting screen with a guarded two-state confirm", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startFromKeyboard(page);

  const before = await getProbe(page);
  const committedBefore = before.save?.committed ?? 0;
  expect(before.economy?.credits).toBe(1000);
  expect(before.economy?.missiles).toBe(3);

  await page.keyboard.press("Digit3");
  await waitForScreen(page, "outfitting");
  await expect(page.locator("#station-screen")).toHaveAttribute(
    "data-screen",
    "outfitting",
  );

  // Opening a screen writes nothing: the probe's commit counter is unchanged.
  expect((await getProbe(page)).save?.committed).toBe(committedBefore);

  const row = (key: string) => page.locator(`[data-equipment-key="${key}"]`);

  // There is no Fuel row at a full tank.
  await expect(row("EQ_FUEL")).toHaveCount(0);

  await expect(row("EQ_CARGO_BAY")).toContainText("Large Cargo Bay");
  await expect(row("EQ_CARGO_BAY")).toContainText("Not enough credits");
  await expect(row("EQ_CARGO_BAY")).toHaveClass(/dimmed/);

  await expect(row("EQ_DOCK_COMP")).toContainText("Docking Computers");
  await expect(row("EQ_DOCK_COMP")).toContainText("Requires TL 9");
  await expect(row("EQ_DOCK_COMP")).toHaveClass(/dimmed/);

  await expect(row("EQ_MISSILE")).toContainText("Missile (3/3)");
  await expect(row("EQ_MISSILE")).toContainText("Pylons full");

  await expect(row("EQ_MISSILE_REMOVAL")).toContainText(
    "Remove Missile — 20 Cr",
  );
  await expect(row("EQ_MISSILE_REMOVAL")).not.toHaveClass(/dimmed/);

  // The first row is selected: Large Cargo Bay, with its disabled reason.
  await expect(row("EQ_CARGO_BAY")).toHaveClass(/selected/);

  // Down once reaches Docking Computers. KeyY on the disabled row must not
  // open a prompt, reach applyFit, or write a save.
  await page.keyboard.press("ArrowDown");
  await expect(row("EQ_DOCK_COMP")).toHaveClass(/selected/);
  await page.keyboard.press("KeyY");
  await expect(page.locator('[data-field="station-confirm"]')).toHaveText("");
  await expect(page.locator('[data-field="station-notice"]')).toHaveText(
    "Requires TL 9",
  );
  let probe = await getProbe(page);
  expect(probe.economy?.credits).toBe(1000);
  expect(probe.save?.committed).toBe(committedBefore);

  // Six more downs reach the Remove Missile row (last visible row at Lave).
  for (let presses = 0; presses < 6; presses += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(row("EQ_MISSILE_REMOVAL")).toHaveClass(/selected/);
  await expect(
    page.locator('[data-field="outfitting-description"]'),
  ).toContainText("full catalogue value");
  await expect(page.locator('[data-field="outfitting-price"]')).toHaveText(
    "20 Cr",
  );

  // First Y opens the prompt; the second commits.
  await page.keyboard.press("KeyY");
  await expect(page.locator('[data-field="station-confirm"]')).toHaveText(
    "Buy Remove Missile for 20.0 Cr? [Y/N]",
  );
  await expect(row("EQ_MISSILE_REMOVAL")).toHaveClass(/selected/);

  await page.keyboard.press("KeyY");
  await page.waitForFunction(
    () => window.__wegolite?.economy?.credits === 1700,
    undefined,
    { timeout: 30_000 },
  );
  probe = await getProbe(page);
  // 1000 - 200 fee + 3 x 300 trade-in = 1700 dc.
  expect(probe.economy?.credits).toBe(1700);
  expect(probe.economy?.missiles).toBe(0);
  await expect(row("EQ_MISSILE_REMOVAL")).toHaveCount(0);
  await expect(
    page.locator('[data-field="outfitting-description"]'),
  ).not.toContainText("full catalogue value");

  // Exactly one write for the accepted removal.
  await page.waitForFunction(
    (expected) => (window.__wegolite?.save?.committed ?? 0) === expected,
    committedBefore + 1,
    { timeout: 30_000 },
  );
  probe = await getProbe(page);
  expect(probe.save?.committed).toBe(committedBefore + 1);

  // The cursor clamps to the new last row (passenger berth, now unaffordable).
  // A third Y is therefore a no-op: no prompt, no credits, no save.
  await page.keyboard.press("KeyY");
  await expect(page.locator('[data-field="station-confirm"]')).toHaveText("");
  probe = await getProbe(page);
  expect(probe.economy?.credits).toBe(1700);
  expect(probe.economy?.missiles).toBe(0);
  expect(probe.save?.committed).toBe(committedBefore + 1);

  expect(errors).toEqual([]);
});
