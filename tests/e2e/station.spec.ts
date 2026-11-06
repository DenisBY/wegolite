// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The docked economy loop in the browser (ECON-01, ECON-02, ECON-04, ECON-09).
 *
 * Evidence is the probe and `textContent`, never a captured image. The tracer buys
 * one tonne of Food through the footer confirmation, proves the autosave, and
 * reloads into the same hold; the expansion proves the persisted seed and the
 * synchronous same-frame context switch.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { formatDecicredits } from "../../src/sim/player/profile.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import { getProbe, waitForReady } from "./helpers/probe.js";

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
  await startFromKeyboard(page);
}

/** Continue a saved game from the title with Tab/Enter only. */
async function continueFromKeyboard(page: Page): Promise<void> {
  await waitForReady(page);
  for (let presses = 0; presses < 12; presses += 1) {
    const active = await page.evaluate(() => document.activeElement?.id ?? "");
    if (active === "title-continue") break;
    await page.keyboard.press("Tab");
  }
  await expect(page.locator("#title-continue")).toBeFocused();
  await page.keyboard.press("Enter");
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

  // A zero-stock row is dimmed by CSS, not merely by a model flag: deleting the
  // rule must fail this assertion.
  const computersRow = page.locator('tr[data-key="computers"]');
  await expect(computersRow).toHaveClass(/dimmed/);
  await expect(computersRow).toHaveCSS("opacity", "0.6");

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
  await continueFromKeyboard(page);

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
    "marketSystemId",
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

test("F3/F5/F7/F8 cancel their browser defaults with a capture negative control", async ({
  page,
}) => {
  await bootToHome(page);
  // Pause first: a synthetic key must not open a screen or mutate anything.
  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.__wegolite?.paused === true,
    undefined,
    { timeout: 10_000 },
  );

  type PreventedRecord = {
    plain: Record<string, boolean>;
    capturing: Record<string, boolean>;
    chord: Record<string, boolean>;
  };
  type FKeyWindow = Window & { __fkeyPrevented?: PreventedRecord };

  await page.evaluate(() => {
    const target = window as FKeyWindow;
    target.__fkeyPrevented = { plain: {}, capturing: {}, chord: {} };
    window.addEventListener("keydown", (event) => {
      const record = target.__fkeyPrevented;
      if (record === undefined) return;
      const bucket = event.ctrlKey
        ? record.chord
        : document.body.dataset.capture !== undefined
          ? record.capturing
          : record.plain;
      bucket[event.code] = event.defaultPrevented;
    });
  });

  const codes = ["F3", "F5", "F7", "F8"];

  const plain = await page.evaluate((expectedCodes: string[]) => {
    for (const code of expectedCodes) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
    return { ...((window as FKeyWindow).__fkeyPrevented?.plain ?? {}) };
  }, codes);
  for (const code of codes) expect(plain[code]).toBe(true);

  // The negative control: while the Controls panel is capturing a rebind, the
  // same key must NOT be prevented. If the capture listener is deleted or made
  // unconditional, one of these two halves fails.
  await page.evaluate(() => {
    document.body.dataset.capture = "1";
  });
  const capturing = await page.evaluate((expectedCodes: string[]) => {
    for (const code of expectedCodes) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
    return { ...((window as FKeyWindow).__fkeyPrevented?.capturing ?? {}) };
  }, codes);
  for (const code of codes) expect(capturing[code]).toBe(false);
  await page.evaluate(() => {
    delete document.body.dataset.capture;
  });

  // A browser chord (Ctrl+F5, a hard reload) is never blocked.
  const chord = await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "F5",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    return { ...((window as FKeyWindow).__fkeyPrevented?.chord ?? {}) };
  });
  expect(chord.F5).toBe(false);

  // No synthetic key reached an action while paused.
  const probe = await getProbe(page);
  expect(probe.paused).toBe(true);
  expect(probe.station?.screen).toBe("home");
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
  await expect(row("EQ_DOCK_COMP")).toHaveCSS("opacity", "0.6");

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

test("F5 pages, F7 fields and direct section switching stay keyboard-only", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootToHome(page);
  const before = await getProbe(page);
  const committedBefore = before.save?.committed ?? 0;

  await page.keyboard.press("Digit5");
  await waitForScreen(page, "status");
  await expect(page.locator("#station-screen")).toHaveAttribute(
    "data-screen",
    "status",
  );
  await expect(page.locator('[data-field="status-page"]')).toHaveText(
    "Page 1/2",
  );

  const statusFields = page.locator("[data-status-fields]");
  for (const text of [
    "Commander",
    "Jameson",
    "Ship",
    "Cobra Mk III",
    "Present System",
    "Lave",
    "Hyperspace System",
    "(Unknown)",
    "Condition",
    "Docked",
    "Fuel",
    "7.0 Light Years",
    "Cash",
    "100.0 Cr",
    "Legal Status",
    "Clean",
    "Rating",
    "Harmless",
  ]) {
    await expect(statusFields).toContainText(text);
  }
  await expect(page.locator("[data-status-equipment]")).toContainText(
    "Missile ×3",
  );
  await expect(page.locator('[data-status-page="2"]')).toBeHidden();

  // Tab is page-next and is consumed: focus stays inside the station section.
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => window.__wegolite?.station?.page === 2,
    undefined,
    { timeout: 10_000 },
  );
  await expect(page.locator('[data-field="status-page"]')).toHaveText(
    "Page 2/2",
  );
  await expect(page.locator('[data-status-page="2"]')).toBeVisible();
  await expect(page.locator("[data-manifest-rows] tr")).toHaveCount(16);
  await expect(page.locator('[data-field="status-load"]')).toHaveText(
    "Load 0 of 20 t",
  );
  // 16 tradeable commodities only, each in its own unit; Alien Items is absent.
  await expect(page.locator('[data-key="gold"]')).toContainText("kg");
  await expect(page.locator('[data-key="gem_stones"]')).toContainText("g");
  await expect(page.locator('[data-key="alien_items"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document
          .getElementById("station-screen")
          ?.contains(document.activeElement) ?? false,
    ),
  ).toBe(true);

  // PageUp returns to page 1; paging never mutates the profile or the save.
  await page.keyboard.press("PageUp");
  await page.waitForFunction(
    () => window.__wegolite?.station?.page === 1,
    undefined,
    { timeout: 10_000 },
  );
  await expect(page.locator('[data-field="status-page"]')).toHaveText(
    "Page 1/2",
  );
  let probe = await getProbe(page);
  expect(probe.economy?.credits).toBe(before.economy?.credits);
  expect(probe.economy?.cargo).toEqual(before.economy?.cargo);
  expect(probe.save?.committed).toBe(committedBefore);

  // KeyP pauses without leaving the section; KeyP resumes it.
  await page.keyboard.press("KeyP");
  await page.waitForFunction(() => window.__wegolite?.paused === true);
  probe = await getProbe(page);
  expect(probe.station?.screen).toBe("status");
  await page.keyboard.press("KeyP");
  await page.waitForFunction(() => window.__wegolite?.paused === false);
  expect((await getProbe(page)).station?.screen).toBe("status");

  // Digit1 is inert inside a section (it launches only from home).
  await page.keyboard.press("Digit1");
  await page.waitForTimeout(300);
  probe = await getProbe(page);
  expect(probe.mode).toBe("docked");
  expect(probe.station?.screen).toBe("status");

  // F7 opens directly from F5 without a trip home.
  await page.keyboard.press("Digit7");
  await waitForScreen(page, "systemData");
  await expect(page.locator('[data-field="system-data-title"]')).toHaveText(
    "Data on Lave",
  );
  const systemFields = page.locator("[data-system-data-fields]");
  for (const text of [
    "Rich Agricultural",
    "Dictatorship",
    "2.5 Billion",
    "(Human Colonials)",
    "7000 M₢",
    "4116 km",
    "0.0 ly",
  ]) {
    await expect(systemFields).toContainText(text);
  }
  // Exactly 7 sysdata fields plus the inhabitants row; tech level renders 5.
  await expect(systemFields.locator("dt")).toHaveCount(8);
  await expect(systemFields).toContainText("5");
  await expect(
    page.locator('[data-field="system-data-description"]'),
  ).toContainText("Lave is most famous for its vast rain forests");

  // Direct switching between sections and Esc back to home, never pause.
  await page.keyboard.press("Digit3");
  await waitForScreen(page, "outfitting");
  await page.keyboard.press("Digit8");
  await waitForScreen(page, "market");
  await page.keyboard.press("Escape");
  await waitForScreen(page, "home");
  probe = await getProbe(page);
  expect(probe.paused).toBe(false);
  expect(probe.mode).toBe("docked");

  // One document footer, and the station footer never overlaps it.
  await expect(page.locator("footer")).toHaveCount(1);
  const footerBox = await page.locator("body > footer").boundingBox();
  const stationBox = await page
    .locator("#docked .station-footer")
    .boundingBox();
  expect(footerBox).not.toBeNull();
  expect(stationBox).not.toBeNull();
  if (footerBox !== null && stationBox !== null) {
    const overlaps =
      stationBox.y < footerBox.y + footerBox.height &&
      footerBox.y < stationBox.y + stationBox.height;
    expect(overlaps).toBe(false);
  }

  expect(errors).toEqual([]);
});

test("real F3/F5/F7/F8 presses never reload the page", async ({ page }) => {
  const errors = collectErrors(page);
  await bootToHome(page);

  type SentinelWindow = Window & { __stationSentinel?: string };
  await page.evaluate(() => {
    (window as SentinelWindow).__stationSentinel = "before";
  });

  const steps: [string, string][] = [
    ["F5", "status"],
    ["F3", "outfitting"],
    ["F7", "systemData"],
    ["F8", "market"],
  ];
  for (const [key, screen] of steps) {
    await page.keyboard.press(key);
    await waitForScreen(page, screen);
    expect(
      await page.evaluate(
        () => (window as SentinelWindow).__stationSentinel ?? "",
      ),
    ).toBe("before");
  }

  // Secondary signals only: the capture `preventDefault` proof above is primary.
  expect(
    await page.evaluate(
      () => performance.getEntriesByType("navigation").length,
    ),
  ).toBe(1);
  expect(errors).toEqual([]);
});

test("station F-keys are inert in flight", async ({ page }) => {
  const errors = collectErrors(page);
  await bootToHome(page);
  const before = await getProbe(page);

  await page.keyboard.press("Digit1");
  await page.waitForFunction(
    () => window.__wegolite?.mode === "inFlight",
    undefined,
    { timeout: 30_000 },
  );

  for (const key of ["F8", "F3", "F5", "F7"]) {
    await page.keyboard.press(key);
  }
  await page.waitForTimeout(300);

  const after = await getProbe(page);
  expect(after.mode).toBe("inFlight");
  expect(after.station?.screen).toBe("home");
  expect(after.economy?.cargo).toEqual(before.economy?.cargo);
  expect(errors).toEqual([]);
});

test("the whole station computer is keyboard-only, and every accepted action writes once", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootToHome(page);

  const start = await getProbe(page);
  expect(start.save?.committed).toBe(0);
  expect(start.economy?.credits).toBe(1000);
  expect(start.economy?.cargo).toEqual({});

  // F8: buy two tonnes of Food, then sell one back at the same unit price.
  await page.keyboard.press("Digit8");
  await waitForScreen(page, "market");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-field="station-confirm"]')).toHaveText(
    "Buy 2 t Food for 7.6 Cr? [Y/N]",
  );
  await page.keyboard.press("KeyY");
  await page.waitForFunction(
    () =>
      (window.__wegolite?.economy?.cargo?.food ?? 0) === 2 &&
      (window.__wegolite?.save?.committed ?? 0) === 1,
    undefined,
    { timeout: 30_000 },
  );

  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('[data-field="station-confirm"]')).toHaveText(
    "Sell 1 t Food for 3.8 Cr? [Y/N]",
  );
  await page.keyboard.press("KeyY");
  await page.waitForFunction(
    () =>
      (window.__wegolite?.economy?.cargo?.food ?? 0) === 1 &&
      (window.__wegolite?.save?.committed ?? 0) === 2,
    undefined,
    { timeout: 30_000 },
  );
  const afterSell = await getProbe(page);
  expect(afterSell.economy?.credits).toBe(962);

  // Digit1 is inert while a section is open, even the market.
  await page.keyboard.press("Digit1");
  await page.waitForTimeout(300);
  const stillDocked = await getProbe(page);
  expect(stillDocked.mode).toBe("docked");
  expect(stillDocked.station?.screen).toBe("market");
  expect(stillDocked.save?.committed).toBe(2);

  // F3: one Y opens the prompt, one applies the removal, a third is inert.
  await page.keyboard.press("Digit3");
  await waitForScreen(page, "outfitting");
  for (let presses = 0; presses < 7; presses += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(
    page.locator('[data-equipment-key="EQ_MISSILE_REMOVAL"]'),
  ).toHaveClass(/selected/);
  await page.keyboard.press("KeyY");
  await expect(page.locator('[data-field="station-confirm"]')).toHaveText(
    "Buy Remove Missile for 20.0 Cr? [Y/N]",
  );
  await page.keyboard.press("KeyY");
  await page.waitForFunction(
    () =>
      (window.__wegolite?.economy?.missiles ?? 3) === 0 &&
      (window.__wegolite?.save?.committed ?? 0) === 3,
    undefined,
    { timeout: 30_000 },
  );
  const afterRemoval = await getProbe(page);
  expect(afterRemoval.economy?.credits).toBe(1662);
  expect(afterRemoval.economy?.missiles).toBe(0);

  await page.keyboard.press("KeyY");
  await expect(page.locator('[data-field="station-confirm"]')).toHaveText("");
  const afterThirdY = await getProbe(page);
  expect(afterThirdY.economy?.credits).toBe(1662);
  expect(afterThirdY.save?.committed).toBe(3);

  // F5 pages, F7 opens system data, Escape returns home without pausing.
  await page.keyboard.press("Digit5");
  await waitForScreen(page, "status");
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => window.__wegolite?.station?.page === 2);
  await page.keyboard.press("PageUp");
  await page.waitForFunction(() => window.__wegolite?.station?.page === 1);

  await page.keyboard.press("Digit7");
  await waitForScreen(page, "systemData");
  await page.keyboard.press("Escape");
  await waitForScreen(page, "home");
  expect((await getProbe(page)).paused).toBe(false);

  // Pause: station keys are inert, Tab stays inside #pause, Enter resumes.
  await page.keyboard.press("KeyP");
  await page.waitForFunction(() => window.__wegolite?.paused === true);
  const pausedSnapshot = await getProbe(page);
  await expect(page.locator('[data-pause-action="resume"]')).toBeFocused();

  await page.keyboard.press("Digit8");
  await page.keyboard.press("KeyY");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  const stillPaused = await getProbe(page);
  expect(stillPaused.paused).toBe(true);
  expect(stillPaused.station?.screen).toBe("home");
  expect(stillPaused.economy?.credits).toBe(pausedSnapshot.economy?.credits);
  expect(stillPaused.economy?.cargo).toEqual(pausedSnapshot.economy?.cargo);
  expect(stillPaused.save?.committed).toBe(pausedSnapshot.save?.committed);

  // Tab moves focus inside the overlay; Shift+Tab returns to Resume; Enter
  // activates the focused control and must not open a station panel.
  await page.keyboard.press("Tab");
  const focusInsidePause = await page.evaluate(() => {
    const pause = document.getElementById("pause");
    return pause !== null && pause.contains(document.activeElement);
  });
  expect(focusInsidePause).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator('[data-pause-action="resume"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__wegolite?.paused === false);
  await waitForScreen(page, "home");
  await expect(page.locator('[data-field="station-confirm"]')).toHaveText("");
  expect((await getProbe(page)).save?.committed).toBe(3);

  // KeyP is also a clean resume with no replayed action.
  await page.keyboard.press("KeyP");
  await page.waitForFunction(() => window.__wegolite?.paused === true);
  await page.keyboard.press("KeyP");
  await page.waitForFunction(() => window.__wegolite?.paused === false);
  expect((await getProbe(page)).station?.screen).toBe("home");

  // Capture the pre-reload market and the launch write.
  const beforeLaunch = await getProbe(page);
  expect(beforeLaunch.economy?.market).toHaveLength(17);
  const seedBefore = beforeLaunch.economy?.marketSeed;
  const pricesBefore =
    beforeLaunch.economy?.market.map((row) => row.price) ?? [];
  const foodStockBefore = beforeLaunch.economy?.market.find(
    (row) => row.key === "food",
  )?.stock;
  expect(foodStockBefore).toBe(15);
  const committedBeforeLaunch = beforeLaunch.save?.committed ?? 0;

  // Digit1 launches only from home.
  await page.keyboard.press("Digit1");
  await page.waitForFunction(
    () => window.__wegolite?.mode === "inFlight",
    undefined,
    { timeout: 60_000 },
  );
  await page.waitForFunction(
    (expected) => (window.__wegolite?.save?.committed ?? 0) === expected,
    committedBeforeLaunch + 1,
    { timeout: 60_000 },
  );

  // Reload: credits, hold and every price come back from the persisted seed.
  await page.reload();
  await waitForReady(page);
  await continueFromKeyboard(page);
  await page.keyboard.press("Digit8");
  await waitForScreen(page, "market");

  const reloaded = await getProbe(page);
  expect(reloaded.economy?.cargo?.food).toBe(1);
  expect(reloaded.economy?.credits).toBe(1662);
  expect(reloaded.economy?.marketSeed).toBe(seedBefore);
  expect(reloaded.economy?.market.map((row) => row.price)).toEqual(
    pricesBefore,
  );
  // The v2 restore prefers the persisted market snapshot, so the buy and sell
  // are visible after reload: 15 t, not the seed's fresh Lave stock of 16 t.
  expect(
    reloaded.economy?.market.find((row) => row.key === "food")?.stock,
  ).toBe(15);

  // Redock: a `docked` event reuses the in-memory market, so the restored
  // stock (15 t) survives the round trip too.
  await page.keyboard.press("Escape");
  await waitForScreen(page, "home");
  await page.keyboard.press("Digit1");
  await page.waitForFunction(
    () => window.__wegolite?.mode === "inFlight",
    undefined,
    { timeout: 60_000 },
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
    { timeout: 60_000 },
  );

  const redocked = await getProbe(page);
  expect(redocked.economy?.marketSeed).toBe(seedBefore);
  expect(redocked.economy?.market.map((row) => row.price)).toEqual(
    pricesBefore,
  );
  expect(
    redocked.economy?.market.find((row) => row.key === "food")?.stock,
  ).toBe(15);
  expect(redocked.economy?.cargo?.food).toBe(1);
  // There is no arrival counter, and no price was claimed to change.
  expect(Object.keys(redocked.economy ?? {})).not.toContain("arrival");
  expect(errors).toEqual([]);
});

test("the New-game confirmation is operable from the keyboard", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootToHome(page);

  // Commit a save, then boot again so New game must confirm.
  await page.keyboard.press("Digit1");
  await page.waitForFunction(
    (expected) => (window.__wegolite?.save?.committed ?? 0) >= expected,
    1,
    { timeout: 60_000 },
  );
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();

  for (let presses = 0; presses < 12; presses += 1) {
    const active = await page.evaluate(() => document.activeElement?.id ?? "");
    if (active === "title-start") break;
    await page.keyboard.press("Tab");
  }
  await expect(page.locator("#title-start")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#title-confirm")).toBeVisible();

  await page.locator("#title-confirm-accept").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => window.__wegolite?.mode === "docked",
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => window.__wegolite?.save?.status === "absent",
    undefined,
    { timeout: 30_000 },
  );
  expect(errors).toEqual([]);
});
