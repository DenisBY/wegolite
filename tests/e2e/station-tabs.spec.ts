// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The station tab strip in the browser (quick task 261109-h8t).
 *
 * One registry-driven strip is hydrated into #docked, #chart and #save-load, so
 * every locator names its surface. Evidence is the probe and computed layout at
 * 1280x720, never a captured image. The Launch tab is enabled only on Home
 * (Phase 5 D-03), tab buttons are never focusable (T-05-25), and a button
 * forced enabled from page script still cannot act against the session guards.
 */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { chartScreenPoint, systemByName } from "./helpers/chart.js";
import { getProbe, waitForReady } from "./helpers/probe.js";

test.setTimeout(180_000);

const TAB_TEXTS = [
  "Home",
  "F1 Launch",
  "F2 Save/Load",
  "F3 Outfitting",
  "F4 Interfaces",
  "F5 Status",
  "F6 Chart",
  "F7 System data",
  "F8 Market",
];

type Surface = "docked" | "chart" | "save-load";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

async function boot(page: Page): Promise<void> {
  await page.goto("/?test=1");
  await waitForReady(page);
  await page.click("#title-start");
  await page.waitForFunction(
    () => window.__wegolite?.mode === "docked",
    undefined,
    {
      timeout: 30_000,
    },
  );
  await expect(page.locator("#docked")).toBeVisible();
}

function tab(page: Page, surface: Surface, id: string): Locator {
  return page.locator(`#${surface} [data-station-tab="${id}"]`);
}

async function waitForScreen(page: Page, screen: string): Promise<void> {
  await page.waitForFunction(
    (expected) => window.__wegolite?.station?.screen === expected,
    screen,
    { timeout: 30_000 },
  );
}

async function waitForMode(page: Page, mode: string): Promise<void> {
  await page.waitForFunction(
    (expected) => window.__wegolite?.mode === expected,
    mode,
    { timeout: 60_000 },
  );
}

async function waitForChart(page: Page, open: boolean): Promise<void> {
  await page.waitForFunction(
    (expected) => window.__wegolite?.chart?.open === expected,
    open,
    { timeout: 30_000 },
  );
}

async function waitForSaveScreen(page: Page, open: boolean): Promise<void> {
  await page.waitForFunction(
    (expected) => window.__wegolite?.saveScreen?.open === expected,
    open,
    { timeout: 30_000 },
  );
}

/** Wait two animation frames so a synchronous negative has fully settled. */
async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** Force a (possibly disabled) button enabled and click it from page script. */
async function forceClick(locator: Locator): Promise<void> {
  await locator.evaluate((element) => {
    if (element instanceof HTMLButtonElement) {
      element.disabled = false;
      element.click();
    }
  });
}

/** WCAG relative luminance of a computed `rgb(...)` colour. */
function luminance(color: string): number {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (match === null) throw new Error(`unparseable colour "${color}"`);
  const channels = [match[1], match[2], match[3]].map((value) => {
    const v = Number(value) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("the strip is nine tabs in F-key order on one row at 1280x720", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  const nav = page.locator('#docked nav[aria-label="Station computer"]');
  await expect(nav.locator("button")).toHaveText(TAB_TEXTS);
  await expect(nav.locator("button")).toHaveCount(9);
  await expect(nav).not.toHaveAttribute("role", "tablist");
  await expect(page.locator('[role="tablist"]')).toHaveCount(0);

  for (const button of await nav.locator("button").all()) {
    await expect(button).toHaveAttribute("tabindex", "-1");
  }
  // The Launch tab never carries data-action; the Home button stays unique.
  await expect(page.locator("nav [data-action]")).toHaveCount(0);
  await expect(page.locator('button[data-action="launch"]')).toHaveCount(1);

  const boxes = [];
  for (const button of await nav.locator("button").all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    if (box !== null) boxes.push(box);
  }
  const firstY = boxes[0]?.y ?? 0;
  for (const box of boxes) {
    expect(Math.abs(box.y - firstY)).toBeLessThanOrEqual(1);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
  }

  const navBox = await nav.boundingBox();
  const sectionBox = await page.locator("#station-screen").boundingBox();
  expect(navBox).not.toBeNull();
  expect(sectionBox).not.toBeNull();
  if (navBox !== null && sectionBox !== null) {
    expect(navBox.height).toBeLessThan(60);
    expect(navBox.y + navBox.height).toBeLessThanOrEqual(sectionBox.y + 1);
  }

  await tab(page, "docked", "market").click();
  await waitForScreen(page, "market");
  const headerBox = await page
    .locator('#docked [data-station-panel="market"] thead tr')
    .boundingBox();
  const footerBox = await page.locator("#docked .station-footer").boundingBox();
  expect(headerBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  if (headerBox !== null && footerBox !== null) {
    expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(footerBox.y);
  }

  expect(errors).toEqual([]);
});

test("section tabs open their screens, Launch stays disabled and F4 shows the empty state", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  const sections = [
    ["market", "market"],
    ["outfitting", "outfitting"],
    ["status", "status"],
    ["systemData", "systemData"],
    ["interfaces", "interfaces"],
  ] as const;
  for (const [id, screen] of sections) {
    await tab(page, "docked", id).click();
    await waitForScreen(page, screen);
    await expect(page.locator("#station-screen")).toHaveAttribute(
      "data-screen",
      screen,
    );
    await expect(tab(page, "docked", id)).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(tab(page, "docked", "launch")).toBeDisabled();
    await expect(tab(page, "docked", "home")).toBeEnabled();
  }

  await expect(page.locator('[data-field="interfaces-title"]')).toHaveText(
    "Ship and System Interfaces",
  );
  await expect(page.locator('[data-field="interfaces-empty"]')).toHaveText(
    "No interfaces are installed on your ship or enabled at this station",
  );

  await tab(page, "docked", "home").click();
  await waitForScreen(page, "home");
  await expect(tab(page, "docked", "launch")).toBeEnabled();
  await expect(tab(page, "docked", "home")).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.keyboard.press("F4");
  await waitForScreen(page, "interfaces");
  await expect(tab(page, "docked", "interfaces")).toHaveAttribute(
    "aria-current",
    "page",
  );

  expect(errors).toEqual([]);
});

test("re-clicking the active tab is a no-op and the screen under an overlay keeps its state", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  await tab(page, "docked", "market").click();
  await waitForScreen(page, "market");
  await page.keyboard.press("ArrowDown");
  const selected = (await getProbe(page)).station?.selectedKey;
  expect(selected).toBeTruthy();
  const initialKey = selected ?? "";

  // The active tab: nothing resets.
  await tab(page, "docked", "market").click();
  await settleFrames(page);
  expect((await getProbe(page)).station?.selectedKey).toBe(initialKey);

  // The chart overlay covers Market; clicking Market only closes the chart.
  await tab(page, "docked", "chart").click();
  await waitForChart(page, true);
  await tab(page, "chart", "market").click();
  await waitForChart(page, false);
  await settleFrames(page);
  const after = await getProbe(page);
  expect(after.station?.screen).toBe("market");
  expect(after.station?.selectedKey).toBe(initialKey);

  // A pending trade is cleared by navigating to another screen.
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () => window.__wegolite?.station?.pending !== null,
    undefined,
    { timeout: 10_000 },
  );
  await expect(page.locator('[data-field="station-confirm"]')).not.toHaveText(
    "",
  );
  await tab(page, "docked", "status").click();
  await waitForScreen(page, "status");
  expect((await getProbe(page)).station?.pending).toBeNull();
  await expect(page.locator('[data-field="station-confirm"]')).toHaveText("");

  expect(errors).toEqual([]);
});

test("overlay-to-overlay navigation restores the input context", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  // From a section: Market -> F6 Chart -> F2 Save/Load -> Esc.
  await tab(page, "docked", "market").click();
  await waitForScreen(page, "market");
  await tab(page, "docked", "chart").click();
  await waitForChart(page, true);
  await expect(page.locator("#chart nav")).toBeVisible();
  await expect(tab(page, "chart", "launch")).toBeDisabled();
  await expect(tab(page, "chart", "chart")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await tab(page, "chart", "saveLoad").click();
  await waitForSaveScreen(page, true);
  await waitForChart(page, false);
  await expect(tab(page, "save-load", "saveLoad")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Escape");
  await waitForSaveScreen(page, false);
  expect((await getProbe(page)).station?.screen).toBe("market");
  // The restored context is dockScreen: Digit7 opens System data directly.
  await page.keyboard.press("Digit7");
  await waitForScreen(page, "systemData");

  // From Home: Home -> F2 -> F6 -> Esc lands on Home, then Digit8 opens Market.
  await tab(page, "docked", "home").click();
  await waitForScreen(page, "home");
  await tab(page, "docked", "saveLoad").click();
  await waitForSaveScreen(page, true);
  await tab(page, "save-load", "chart").click();
  await waitForChart(page, true);
  await waitForSaveScreen(page, false);
  await page.keyboard.press("Escape");
  await waitForChart(page, false);
  expect((await getProbe(page)).station?.screen).toBe("home");
  await page.keyboard.press("Digit8");
  await waitForScreen(page, "market");

  // Clicking Home from the chart while Home lies underneath closes the chart.
  await tab(page, "docked", "home").click();
  await waitForScreen(page, "home");
  await tab(page, "docked", "chart").click();
  await waitForChart(page, true);
  await tab(page, "chart", "home").click();
  await waitForChart(page, false);
  expect((await getProbe(page)).station?.screen).toBe("home");

  expect(errors).toEqual([]);
});

test("the Launch tab launches only from Home", async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  await tab(page, "docked", "launch").click();
  await waitForMode(page, "inFlight");

  expect(errors).toEqual([]);
});

test("a force-enabled Launch tab never launches off Home", async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  // A section.
  await tab(page, "docked", "market").click();
  await waitForScreen(page, "market");
  await expect(tab(page, "docked", "launch")).toBeDisabled();
  await forceClick(tab(page, "docked", "launch"));
  await settleFrames(page);
  let probe = await getProbe(page);
  expect(probe.mode).toBe("docked");
  expect(probe.station?.screen).toBe("market");

  // The chart, opened from Home.
  await tab(page, "docked", "home").click();
  await waitForScreen(page, "home");
  await tab(page, "docked", "chart").click();
  await waitForChart(page, true);
  await expect(tab(page, "chart", "launch")).toBeDisabled();
  await forceClick(tab(page, "chart", "launch"));
  await settleFrames(page);
  probe = await getProbe(page);
  expect(probe.mode).toBe("docked");
  expect(probe.chart?.open).toBe(true);

  // The save screen.
  await tab(page, "chart", "saveLoad").click();
  await waitForSaveScreen(page, true);
  await expect(tab(page, "save-load", "launch")).toBeDisabled();
  await forceClick(tab(page, "save-load", "launch"));
  await settleFrames(page);
  probe = await getProbe(page);
  expect(probe.mode).toBe("docked");
  expect(probe.saveScreen?.open).toBe(true);

  expect(errors).toEqual([]);
});

test("navigation is refused while paused and while the overwrite dialog is open", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.__wegolite?.paused === true,
    undefined,
    { timeout: 10_000 },
  );
  await forceClick(tab(page, "docked", "market"));
  await settleFrames(page);
  expect((await getProbe(page)).station?.screen).toBe("home");
  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.__wegolite?.paused === false,
    undefined,
    { timeout: 10_000 },
  );

  // Save once, then Save again so the overwrite dialog is open.
  await page.keyboard.press("F2");
  await waitForSaveScreen(page, true);
  await page.keyboard.press("KeyS");
  await page.waitForFunction(
    () => (window.__wegolite?.save?.committed ?? 0) >= 1,
    undefined,
    { timeout: 60_000 },
  );
  await page.waitForFunction(
    () => (window.__wegolite?.saveScreen?.notice ?? "").startsWith("Saved at "),
    undefined,
    { timeout: 30_000 },
  );
  await page.keyboard.press("KeyS");
  await page.waitForFunction(
    () => window.__wegolite?.saveScreen?.confirming === true,
    undefined,
    { timeout: 30_000 },
  );
  await forceClick(tab(page, "save-load", "home"));
  await settleFrames(page);
  const probe = await getProbe(page);
  expect(probe.saveScreen?.open).toBe(true);
  expect(probe.saveScreen?.confirming).toBe(true);

  expect(errors).toEqual([]);
});

test("tab clicks never move keyboard focus and keep native Enter and paging unchanged", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  await tab(page, "docked", "market").click();
  await waitForScreen(page, "market");
  const focusInNav = await page.evaluate(
    () => document.activeElement?.closest(".station-nav") !== null,
  );
  expect(focusInNav).toBe(false);

  // A cancelable mousedown on a strip button is cancelled by its host.
  const notPrevented = await tab(page, "docked", "status").evaluate((element) =>
    element.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    ),
  );
  expect(notPrevented).toBe(false);

  // Arrow keys never switch tabs.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(tab(page, "docked", "market")).toHaveAttribute(
    "aria-current",
    "page",
  );

  // After clicking Home, Enter does not launch through a focused tab.
  await tab(page, "docked", "home").click();
  await waitForScreen(page, "home");
  await page.keyboard.press("Enter");
  await settleFrames(page);
  expect((await getProbe(page)).mode).toBe("docked");

  // Tab still pages Status and Escape still goes home.
  await tab(page, "docked", "status").click();
  await waitForScreen(page, "status");
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => window.__wegolite?.station?.page === 2,
    undefined,
    { timeout: 10_000 },
  );
  await page.keyboard.press("Escape");
  await waitForScreen(page, "home");

  expect(errors).toEqual([]);
});

test("sub-tabs mirror the real Oolite sub-pages and stay in sync with the keys", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  await tab(page, "docked", "status").click();
  await waitForScreen(page, "status");
  const statusSub = (value: string): Locator =>
    page.locator(`#docked [data-station-subtab="${value}"]`);
  await expect(statusSub("1")).toHaveAttribute("aria-pressed", "true");
  await statusSub("2").click();
  await page.waitForFunction(
    () => window.__wegolite?.station?.page === 2,
    undefined,
    { timeout: 10_000 },
  );
  await expect(statusSub("2")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-status-page="2"]')).toBeVisible();
  await statusSub("1").click();
  await page.waitForFunction(
    () => window.__wegolite?.station?.page === 1,
    undefined,
    { timeout: 10_000 },
  );
  await expect(statusSub("1")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => window.__wegolite?.station?.page === 2,
    undefined,
    { timeout: 10_000 },
  );
  await expect(statusSub("2")).toHaveAttribute("aria-pressed", "true");

  await tab(page, "docked", "chart").click();
  await waitForChart(page, true);
  // The chart opens at the local preset; Tab toggles the whole-galaxy one.
  await page.waitForFunction(
    () => window.__wegolite?.chart?.camera.spanX === 80,
    undefined,
    { timeout: 10_000 },
  );
  await expect(page.locator("#chart .station-subnav")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => window.__wegolite?.chart?.camera.spanX === 256,
    undefined,
    { timeout: 10_000 },
  );
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => window.__wegolite?.chart?.camera.spanX === 80,
    undefined,
    { timeout: 10_000 },
  );

  // A marker click still selects with the nav visible.
  await page.waitForFunction(
    () =>
      Number(
        document.getElementById("chart-canvas")?.getAttribute("data-paints") ??
          "0",
      ) >= 1,
    undefined,
    { timeout: 30_000 },
  );
  await settleFrames(page);
  const system = systemByName("Diso");
  const probe = await getProbe(page);
  const box = await page.locator("#chart-canvas").boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) {
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
  await page.waitForFunction(
    (id) => window.__wegolite?.chart?.selectedId === id,
    system.id,
    { timeout: 30_000 },
  );

  expect(errors).toEqual([]);
});

test("in flight the chart opens without the station strip", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");
  await page.keyboard.press("F6");
  await waitForChart(page, true);
  await expect(page.locator("#chart")).toBeVisible();
  await expect(page.locator("#chart .station-nav")).toBeHidden();
  await expect(page.locator("#chart .station-subnav")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await waitForChart(page, false);

  expect(errors).toEqual([]);
});

test("the footer hints fit one line and the disabled and selected states are legible", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  const keys = page.locator('#docked [data-field="station-keys"]');
  for (const id of [
    "home",
    "market",
    "outfitting",
    "status",
    "systemData",
    "interfaces",
  ]) {
    await tab(page, "docked", id).click();
    await waitForScreen(page, id);
    const box = await keys.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 999).toBeLessThan(36);
  }
  await tab(page, "docked", "status").click();
  await waitForScreen(page, "status");
  await expect(keys).toContainText("F3 outfitting");
  await expect(keys).toContainText("F8 market");
  await expect(keys).not.toContainText("F5 status");

  // A disabled tab reaches 3:1 against the opaque chart panel.
  await tab(page, "docked", "chart").click();
  await waitForChart(page, true);
  const colours = await tab(page, "chart", "launch").evaluate((element) => {
    const style = getComputedStyle(element);
    const panel = document.getElementById("chart");
    return {
      color: style.color,
      border: style.borderTopColor,
      background: panel === null ? "" : getComputedStyle(panel).backgroundColor,
    };
  });
  expect(contrast(colours.color, colours.background)).toBeGreaterThanOrEqual(3);
  expect(contrast(colours.border, colours.background)).toBeGreaterThanOrEqual(
    3,
  );
  await page.keyboard.press("Escape");
  await waitForChart(page, false);

  // The selected tab and a keyboard-focused tab are visibly different.
  await page.keyboard.press("Shift");
  await tab(page, "docked", "chart").evaluate((element) => {
    if (element instanceof HTMLElement) element.focus();
  });
  const styles = await page.evaluate(() => {
    const read = (id: string) => {
      const element = document.querySelector(
        `#docked [data-station-tab="${id}"]`,
      );
      if (element === null) throw new Error(`no tab ${id}`);
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, weight: style.fontWeight };
    };
    return { current: read("status"), focused: read("chart") };
  });
  expect(styles.current.outline).toBe("none");
  expect(styles.focused.outline).not.toBe("none");
  expect(styles.current).not.toEqual(styles.focused);

  expect(errors).toEqual([]);
});

test("the chart and Save/Load headers show the live balance, not the key label", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);

  const stationCredits = page.locator('#docked [data-field="credits"]');
  const chartCredits = page.locator('#chart [data-field="chart-credits"]');
  const saveCredits = page.locator('#save-load [data-field="save-credits"]');
  await expect(stationCredits).not.toHaveText("");
  const balance = (await stationCredits.textContent()) ?? "";

  await page.keyboard.press("F6");
  await waitForChart(page, true);
  await expect(chartCredits).toHaveText(balance);
  await expect(chartCredits).not.toHaveText("F6");
  await page.keyboard.press("Escape");
  await waitForChart(page, false);

  await page.keyboard.press("F2");
  await waitForSaveScreen(page, true);
  await expect(saveCredits).toHaveText(balance);
  await expect(saveCredits).not.toHaveText("F2");
  await page.keyboard.press("Escape");
  await waitForSaveScreen(page, false);

  // A changed balance reaches both overlays the next time they open.
  await page.evaluate(() => {
    window.__wegolite?.test?.setCredits(123_456);
  });
  await expect(stationCredits).not.toHaveText(balance);
  const changed = (await stationCredits.textContent()) ?? "";
  await page.keyboard.press("F6");
  await waitForChart(page, true);
  await expect(chartCredits).toHaveText(changed);
  await page.keyboard.press("Escape");
  await waitForChart(page, false);
  await page.keyboard.press("F2");
  await waitForSaveScreen(page, true);
  await expect(saveCredits).toHaveText(changed);
  await page.keyboard.press("Escape");
  await waitForSaveScreen(page, false);

  // The chart also opens in flight and still shows the balance.
  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");
  await page.keyboard.press("F6");
  await waitForChart(page, true);
  await expect(chartCredits).toHaveText(changed);
  await page.keyboard.press("Escape");
  await waitForChart(page, false);

  expect(errors).toEqual([]);
});
