// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The docked screen keys from every docked screen (debug session
 * docked-f-keys, Phase 19 UAT).
 *
 * The owner found F2 to F6 and F8 mostly dead while docked, and a second F6 on
 * the chart returning to the screen under it. In Oolite the keys work on every
 * docked GUI screen, the charts and the load/save screen included
 * (`pollDockedControls` calls `pollGuiScreenControls`). F6 on an open chart
 * does nothing: the chart stays open with its preset and camera (owner
 * decision 2026-11-24, FIDELITY E-184; Oolite's repeated F6 switches the
 * short-range and the long-range chart, but Wegolite has one zoomable chart
 * whose presets Tab switches). Each case here presses one key exactly once and
 * waits for the target, so a key that needs a second press fails. The source
 * screen is reached through a tab click, never through a key under test.
 * Evidence is the probe, never a captured image (D-08).
 *
 * A bubble-phase window keydown recorder, added after the game's own
 * listeners, keeps `{ code, targetId, defaultPrevented }` for every F1 to F8
 * press. A synthetic press never reloads the page, so the recorded
 * `defaultPrevented` is the evidence that F5 and the other reserved keys are
 * cancelled (quick 261124-pze F4).
 *
 * The Firefox project runs this file too (playwright.config.ts), because the
 * owner's report names both engines. The two market mouse cases of quick
 * 261125-ewd live here so the Firefox project runs them too.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

/** Parse the wait scale: unset or blank means 1 (core-loop.spec.ts rule). */
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
const UI_WAIT = Math.round(10_000 * WAIT_SCALE);

test.setTimeout(Math.round(180_000 * WAIT_SCALE));

/** Where the player is: an open overlay wins over the station screen under it. */
type Place =
  | "home"
  | "market"
  | "outfitting"
  | "interfaces"
  | "status"
  | "saveLoad"
  | "chart";

/** The six keys the tab strip advertises, with the screen each one opens. */
const KEYS: readonly (readonly [string, Place])[] = [
  ["F2", "saveLoad"],
  ["F3", "outfitting"],
  ["F4", "interfaces"],
  ["F5", "status"],
  ["F6", "chart"],
  ["F8", "market"],
];

const SOURCES: readonly Place[] = [
  "home",
  "market",
  "outfitting",
  "interfaces",
  "status",
  "saveLoad",
  "chart",
];

/** The chart camera spans of the two presets (chart-model.ts). */
const LOCAL_SPAN = 80;
const GALAXY_SPAN = 256;

/** The chart camera the probe publishes. */
interface Camera {
  readonly centre: { readonly x: number; readonly y: number };
  readonly spanX: number;
  readonly spanY: number;
}

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
  await startNewGame(page);
  await page.waitForFunction(
    () => window.__wegolite?.mode === "docked",
    undefined,
    { timeout: 60_000 },
  );
  await expect(page.locator("#docked")).toBeVisible();
  // A full page load would drop this marker. It only catches a real
  // navigation: a synthetic press never reloads the page, so the recorded
  // `defaultPrevented` below is the evidence that F5 is cancelled.
  await page.evaluate(() => {
    (window as unknown as { __fkeysNoReload?: boolean }).__fkeysNoReload = true;
  });
  // Bubble phase on window, registered after the game's listeners, so it sees
  // the final `defaultPrevented` of every F1 to F8 keydown.
  await page.evaluate(() => {
    const log: KeyRecord[] = [];
    (window as unknown as { __fkeysRecord?: KeyRecord[] }).__fkeysRecord = log;
    window.addEventListener("keydown", (event) => {
      if (!/^F[1-8]$/.test(event.code)) return;
      const target = event.target;
      log.push({
        code: event.code,
        targetId: target instanceof Element ? target.id : "",
        defaultPrevented: event.defaultPrevented,
      });
    });
  });
}

/** One F1 to F8 keydown as the window recorder saw it. */
interface KeyRecord {
  readonly code: string;
  readonly targetId: string;
  readonly defaultPrevented: boolean;
}

async function recordedKeys(page: Page): Promise<KeyRecord[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __fkeysRecord?: KeyRecord[] }).__fkeysRecord ??
      [],
  );
}

/**
 * Dispatch a keydown then a keyup on window for each code, all inside ONE
 * page task, so every key lands before the next animation frame.
 */
async function pressInOneFrame(
  page: Page,
  codes: readonly (readonly [string, string])[],
): Promise<void> {
  await page.evaluate((list) => {
    for (const [code, key] of list) {
      const init = { code, key, bubbles: true, cancelable: true };
      window.dispatchEvent(new KeyboardEvent("keydown", init));
      window.dispatchEvent(new KeyboardEvent("keyup", init));
    }
  }, codes);
}

async function placeOf(page: Page): Promise<Place | undefined> {
  return page.evaluate((): Place | undefined => {
    const probe = window.__wegolite;
    if (probe?.saveScreen?.open === true) return "saveLoad";
    if (probe?.chart?.open === true) return "chart";
    return probe?.station?.screen;
  });
}

async function waitForPlace(page: Page, place: Place): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const probe = window.__wegolite;
      const where =
        probe?.saveScreen?.open === true
          ? "saveLoad"
          : probe?.chart?.open === true
            ? "chart"
            : probe?.station?.screen;
      return where === expected;
    },
    place,
    { timeout: UI_WAIT },
  );
}

async function waitForSpan(page: Page, span: number): Promise<void> {
  await page.waitForFunction(
    (expected) =>
      window.__wegolite?.chart?.open === true &&
      window.__wegolite.chart.camera.spanX === expected,
    span,
    { timeout: UI_WAIT },
  );
}

async function chartCamera(page: Page): Promise<Camera> {
  const camera = await page.evaluate(() => window.__wegolite?.chart?.camera);
  if (camera === undefined) throw new Error("the probe has no chart camera");
  return camera;
}

/** Wait two animation frames so a negative (nothing happened) has settled. */
async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** The surface whose tab strip is on top. */
function surfaceOf(place: Place | undefined): string {
  if (place === "saveLoad") return "save-load";
  if (place === "chart") return "chart";
  return "docked";
}

/** Reach `place` with a click on the visible tab strip, never with a key. */
async function goTo(page: Page, place: Place): Promise<void> {
  const current = await placeOf(page);
  if (current === place) return;
  await page
    .locator(`#${surfaceOf(current)} [data-station-tab="${place}"]`)
    .click();
  await waitForPlace(page, place);
  if (place === "chart") await waitForSpan(page, LOCAL_SPAN);
}

/** Press `code` once from `source` and check the outcome. */
async function pressFrom(
  page: Page,
  source: Place,
  code: string,
  target: Place,
): Promise<void> {
  await goTo(page, source);
  const cameraBefore = source === "chart" ? await chartCamera(page) : undefined;
  if (!(source === "saveLoad" && code === "F2"))
    await page.keyboard.press(code);
  if (source === "chart" && code === "F6") {
    // F6 on an open chart does nothing (owner decision 2026-11-24): the chart
    // stays open and its camera does not move.
    await settleFrames(page);
    expect(await chartCamera(page), "F6 on the chart keeps the camera").toEqual(
      cameraBefore,
    );
  } else if (source === "saveLoad" && code === "F2") {
    // Oolite ignores F2 on its own screen. A close and reopen within the
    // frame would end on the same place, so the screen's hidden attribute is
    // watched: any toggle fails the case.
    await page.evaluate(() => {
      const holder = window as unknown as { __saveLoadMutations?: number };
      holder.__saveLoadMutations = 0;
      const element = document.getElementById("save-load");
      if (element === null) throw new Error("#save-load is missing");
      new MutationObserver((records) => {
        holder.__saveLoadMutations =
          (holder.__saveLoadMutations ?? 0) + records.length;
      }).observe(element, { attributes: true, attributeFilter: ["hidden"] });
    });
    await page.keyboard.press(code);
    await settleFrames(page);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __saveLoadMutations?: number })
            .__saveLoadMutations,
      ),
      "F2 on Save/Load neither hides nor shows the screen",
    ).toBe(0);
  } else {
    await waitForPlace(page, target);
  }
  expect(await placeOf(page), `${code} from ${source}`).toBe(
    source === "saveLoad" && code === "F2" ? "saveLoad" : target,
  );
  if (target === "chart" && source !== "chart") {
    // Every fresh open starts at the local preset.
    expect(
      await page.evaluate(() => window.__wegolite?.chart?.camera.spanX),
    ).toBe(LOCAL_SPAN);
  }
}

async function expectNoReload(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __fkeysNoReload?: boolean }).__fkeysNoReload,
    ),
  ).toBe(true);
  for (const record of await recordedKeys(page)) {
    expect(
      record.defaultPrevented,
      `${record.code} from #${record.targetId} is cancelled`,
    ).toBe(true);
  }
}

for (const source of SOURCES) {
  test(`each docked screen key works on the first press from ${source}`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await boot(page);
    for (const [code, target] of KEYS) {
      await pressFrom(page, source, code, target);
    }
    await expectNoReload(page);
    expect(errors).toEqual([]);
  });
}

test("the keys still work with the chart's Find planet box focused", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  const findInput = page.locator("#chart-find-input");
  for (const [code, target] of KEYS) {
    await goTo(page, "chart");
    await page.keyboard.press("Slash");
    await expect(findInput).toBeFocused();
    const cameraBefore = await chartCamera(page);
    await page.keyboard.press(code);
    if (code === "F6") {
      // F6 on the open chart does nothing, the focused box included.
      await settleFrames(page);
      expect(await placeOf(page)).toBe("chart");
      expect(await chartCamera(page)).toEqual(cameraBefore);
      // Leave the chart so the next round reopens it at the local preset.
      await goTo(page, "home");
    } else {
      await waitForPlace(page, target);
      // Closing the chart never leaves the hidden box holding the keys.
      await expect(findInput).not.toBeFocused();
    }
  }

  // F7 has no action on the chart: from the focused box it changes nothing,
  // the box keeps focus, and the browser default is still cancelled.
  await goTo(page, "chart");
  await page.keyboard.press("Slash");
  await expect(findInput).toBeFocused();
  await page.keyboard.press("F7");
  await settleFrames(page);
  expect(await placeOf(page)).toBe("chart");
  await expect(findInput).toBeFocused();

  // Every key pressed from the box was seen there and cancelled.
  const fromBox = (await recordedKeys(page)).filter(
    (record) => record.targetId === "chart-find-input",
  );
  for (const code of [...KEYS.map(([key]) => key), "F7"]) {
    const records = fromBox.filter((record) => record.code === code);
    expect(records.length, `${code} from the Find box`).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.defaultPrevented, `${code} from the Find box`).toBe(true);
    }
  }
  await expectNoReload(page);
  expect(errors).toEqual([]);
});

test("keys pressed in one frame apply in order (quick 261124-pze)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  const save = () => page.evaluate(() => window.__wegolite?.save);

  // 1. No save yet: S writes it at once, then F3 opens Outfitting.
  await goTo(page, "saveLoad");
  const fresh = await save();
  expect(fresh?.status).toBe("absent");
  const committedBefore = fresh?.committed ?? 0;
  await pressInOneFrame(page, [
    ["KeyS", "s"],
    ["F3", "F3"],
  ]);
  await waitForPlace(page, "outfitting");
  await page.waitForFunction(
    (before) => (window.__wegolite?.save?.committed ?? 0) >= before + 1,
    committedBefore,
    { timeout: UI_WAIT },
  );
  expect((await save())?.committed).toBe(committedBefore + 1);

  // 2. With a save present S opens the overwrite question first, and F3 does
  //    nothing under it (Oolite stops polling the F-keys there).
  await goTo(page, "saveLoad");
  await page.waitForFunction(
    () => window.__wegolite?.save?.status === "valid",
    undefined,
    { timeout: UI_WAIT },
  );
  await pressInOneFrame(page, [
    ["KeyS", "s"],
    ["F3", "F3"],
  ]);
  await settleFrames(page);
  expect(
    await page.evaluate(() => window.__wegolite?.saveScreen?.confirming),
  ).toBe(true);
  expect(await placeOf(page)).toBe("saveLoad");

  // 3. Escape answers the question; F3 then works again.
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => window.__wegolite?.saveScreen?.confirming === false,
    undefined,
    { timeout: UI_WAIT },
  );
  expect(await placeOf(page)).toBe("saveLoad");
  await page.keyboard.press("F3");
  await waitForPlace(page, "outfitting");

  // 4. On the chart (moved to the galaxy preset first), Escape then F6 in one
  //    frame closes it and opens it again, fresh at the local preset.
  await goTo(page, "chart");
  await page.keyboard.press("Tab");
  await waitForSpan(page, GALAXY_SPAN);
  await pressInOneFrame(page, [
    ["Escape", "Escape"],
    ["F6", "F6"],
  ]);
  await settleFrames(page);
  expect(await placeOf(page)).toBe("chart");
  await waitForSpan(page, LOCAL_SPAN);

  await expectNoReload(page);
  expect(errors).toEqual([]);
});

test("F4 then F6 then F6 keeps the chart open with an unchanged preset and camera", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.keyboard.press("F4");
  await waitForPlace(page, "interfaces");

  await page.keyboard.press("F6");
  await waitForPlace(page, "chart");
  await waitForSpan(page, LOCAL_SPAN);
  const local = await chartCamera(page);

  // The owner's report: this press used to return to F4 Interfaces. Owner
  // decision 2026-11-24: F6 on an open chart does nothing. Twice more, so F6
  // three times in all.
  await page.keyboard.press("F6");
  await settleFrames(page);
  expect(await placeOf(page)).toBe("chart");
  expect(await chartCamera(page)).toEqual(local);
  await page.keyboard.press("F6");
  await settleFrames(page);
  expect(await placeOf(page)).toBe("chart");
  expect(await chartCamera(page)).toEqual(local);

  // The preset is still local: Tab, which flips the preset, goes to the whole
  // galaxy. Tab is applied after the F6 presses, in key order, so a late F6
  // effect would show here too.
  await page.keyboard.press("Tab");
  await waitForSpan(page, GALAXY_SPAN);
  const galaxy = await chartCamera(page);
  expect(galaxy.centre).toEqual({ x: 128, y: 128 });

  // On the galaxy preset F6 does nothing either, and Tab returns to local.
  await page.keyboard.press("F6");
  await settleFrames(page);
  expect(await placeOf(page)).toBe("chart");
  expect(await chartCamera(page)).toEqual(galaxy);
  await page.keyboard.press("Tab");
  await waitForSpan(page, LOCAL_SPAN);
  expect(await chartCamera(page)).toEqual(local);

  // A wheel-zoomed camera stays where it is.
  const box = await page.locator("#chart-canvas").boundingBox();
  if (box === null) throw new Error("the chart canvas has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120);
  await page.waitForFunction(
    (span) => (window.__wegolite?.chart?.camera.spanX ?? span) < span,
    LOCAL_SPAN,
    { timeout: UI_WAIT },
  );
  await settleFrames(page);
  const zoomed = await chartCamera(page);
  await page.keyboard.press("F6");
  await settleFrames(page);
  expect(await placeOf(page)).toBe("chart");
  expect(await chartCamera(page)).toEqual(zoomed);

  // Escape is the way out, back to the screen under the chart.
  await page.keyboard.press("Escape");
  await waitForPlace(page, "interfaces");
  await expectNoReload(page);
  expect(errors).toEqual([]);
});

/** Wait for the station probe to show `screen` on `page` (Status or Market). */
async function waitForStationPage(
  page: Page,
  screen: "status" | "market",
  stationPage: 1 | 2,
): Promise<void> {
  await page.waitForFunction(
    ([expectedScreen, expectedPage]) => {
      const station = window.__wegolite?.station;
      return (
        station?.screen === expectedScreen && station.page === expectedPage
      );
    },
    [screen, stationPage] as const,
    { timeout: UI_WAIT },
  );
}

test("F5 twice shows the Manifest, a third press returns, and the footer names the next press", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await boot(page);
  const hints = page.locator('#docked [data-footer-role="hints"]');

  await page.keyboard.press("F5");
  await waitForStationPage(page, "status", 1);
  await expect(page.locator('#docked [data-status-page="1"]')).toBeVisible();
  await expect(hints).toContainText("F5 manifest");

  await page.keyboard.press("F5");
  await waitForStationPage(page, "status", 2);
  await expect(page.locator('#docked [data-status-page="2"]')).toBeVisible();
  await expect(page.locator('#docked [data-status-page="1"]')).toBeHidden();
  await expect(hints).toContainText("F5 status");

  await page.keyboard.press("F5");
  await waitForStationPage(page, "status", 1);
  await expect(page.locator('#docked [data-status-page="1"]')).toBeVisible();
  await expect(hints).toContainText("F5 manifest");
  await expectNoReload(page);
  expect(errors).toEqual([]);
});

test("F8 on the Market does nothing and a line under the list shows the selected commodity's comment at 1280x720", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await boot(page);
  const rows = page.locator("#docked [data-market-rows] tr");
  const comment = page.locator('#docked [data-field="market-comment"]');
  const cash = page.locator('#docked [data-field="market-cash-load"]');
  const hints = page.locator('#docked [data-footer-role="hints"]');
  const screen = page.locator("#docked #station-screen");

  async function top(locator: typeof cash): Promise<number> {
    const box = await locator.boundingBox();
    if (box === null) throw new Error("the element has no box");
    return box.y;
  }

  await page.keyboard.press("F8");
  await waitForStationPage(page, "market", 1);
  // Lave's first selectable good, as in core-loop.spec.ts.
  await page.waitForFunction(
    () => window.__wegolite?.station?.selectedKey === "food",
    undefined,
    { timeout: UI_WAIT },
  );
  await expect(rows).toHaveCount(17);
  await expect(comment).toBeVisible();
  await expect(comment).toHaveText("");
  const cashY = await top(cash);

  // A second F8 does nothing: the list, its page and the selection stay.
  await page.keyboard.press("F8");
  await settleFrames(page);
  await waitForStationPage(page, "market", 1);
  expect(
    await page.evaluate(() => window.__wegolite?.station?.selectedKey),
  ).toBe("food");
  await expect(hints).not.toContainText("F8");
  await expect(rows).toHaveCount(17);
  await expect(
    page.locator("#docked [data-market-rows] tr.selected"),
  ).toHaveAttribute("data-key", "food");

  // Down moves the selection and the line follows it: food, textiles,
  // radioactives, slaves in Lave's golden market order.
  for (let step = 0; step < 3; step++) await page.keyboard.press("ArrowDown");
  await page.waitForFunction(
    () => window.__wegolite?.station?.selectedKey === "slaves",
    undefined,
    { timeout: UI_WAIT },
  );
  await expect(comment).toHaveText(
    "It is illegal to export this good from Cooperative stations. Launching with it aboard makes you an offender.",
  );
  // The full note is also the line's title, readable when it is cut short.
  await expect(comment).toHaveAttribute(
    "title",
    "It is illegal to export this good from Cooperative stations. Launching with it aboard makes you an offender.",
  );

  // The line fits inside the station screen above the cash line and the
  // footer key line, is not ellipsised, and the screen does not scroll.
  const commentBox = await comment.boundingBox();
  const screenBox = await screen.boundingBox();
  const cashBox = await cash.boundingBox();
  const hintsBox = await hints.boundingBox();
  if (
    commentBox === null ||
    screenBox === null ||
    cashBox === null ||
    hintsBox === null
  ) {
    throw new Error("a measured element has no box");
  }
  expect(commentBox.y).toBeGreaterThanOrEqual(screenBox.y);
  expect(commentBox.y + commentBox.height).toBeLessThanOrEqual(
    screenBox.y + screenBox.height,
  );
  expect(commentBox.y + commentBox.height).toBeLessThanOrEqual(cashBox.y);
  expect(commentBox.y + commentBox.height).toBeLessThanOrEqual(hintsBox.y);
  const commentSizes = await comment.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(
    commentSizes.scrollWidth,
    "the comment line is not ellipsised",
  ).toBeLessThanOrEqual(commentSizes.clientWidth);
  const screenSizes = await screen.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(
    screenSizes.scrollHeight,
    "the station screen does not scroll",
  ).toBeLessThanOrEqual(screenSizes.clientHeight);
  expect(await top(cash), "the cash line has not moved").toBe(cashY);

  for (let step = 0; step < 3; step++) await page.keyboard.press("ArrowUp");
  await page.waitForFunction(
    () => window.__wegolite?.station?.selectedKey === "food",
    undefined,
    { timeout: UI_WAIT },
  );
  await expect(comment).toHaveText("");
  await expect(comment).toHaveAttribute("title", "");
  expect(await top(cash), "the cash line has not moved").toBe(cashY);

  await expectNoReload(page);
  expect(errors).toEqual([]);
});

/** The F8 row of `key` (quick 261125-ewd). */
function marketRow(page: Page, key: string) {
  return page.locator(`#docked [data-market-rows] tr[data-key="${key}"]`);
}

/** The Slaves note the comment line shows (Lave is a Cooperative). */
const SLAVES_NOTE =
  "It is illegal to export this good from Cooperative stations. Launching with it aboard makes you an offender.";

/**
 * In ONE page task, dispatch a primary click on the first cell of the `key`
 * row and an ArrowRight press on window, in the given order, so both land
 * before the next animation frame.
 */
async function clickAndRightInOneTask(
  page: Page,
  key: string,
  order: "keyFirst" | "clickFirst",
): Promise<void> {
  await page.evaluate(
    ([rowKey, first]) => {
      const press = (): void => {
        const init = {
          code: "ArrowRight",
          key: "ArrowRight",
          bubbles: true,
          cancelable: true,
        };
        window.dispatchEvent(new KeyboardEvent("keydown", init));
        window.dispatchEvent(new KeyboardEvent("keyup", init));
      };
      const click = (): void => {
        const cell = document.querySelector(
          `#docked [data-market-rows] tr[data-key="${rowKey}"] td`,
        );
        if (cell === null) throw new Error(`no market row ${rowKey}`);
        cell.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
            detail: 1,
          }),
        );
      };
      if (first === "keyFirst") {
        press();
        click();
      } else {
        click();
        press();
      }
    },
    [key, order] as const,
  );
}

async function waitForSelectedKey(page: Page, key: string): Promise<void> {
  await page.waitForFunction(
    (expected) => window.__wegolite?.station?.selectedKey === expected,
    key,
    { timeout: UI_WAIT },
  );
}

async function waitForNoPending(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__wegolite?.station?.pending === null,
    undefined,
    { timeout: UI_WAIT },
  );
}

test("a click on a market row selects it as Up and Down do, and a click on a row the keys cannot select does nothing", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await boot(page);
  const comment = page.locator('#docked [data-field="market-comment"]');
  const selected = page.locator("#docked [data-market-rows] tr.selected");

  await page.keyboard.press("F8");
  await waitForStationPage(page, "market", 1);
  await waitForSelectedKey(page, "food");

  // A click lands where Down would: the selection and the comment follow.
  await marketRow(page, "slaves").click();
  await waitForSelectedKey(page, "slaves");
  await expect(selected).toHaveAttribute("data-key", "slaves");
  await expect(comment).toHaveText(SLAVES_NOTE);

  // Only rows the keys can select show the pointer.
  expect(
    await marketRow(page, "slaves").evaluate(
      (element) => getComputedStyle(element).cursor,
    ),
  ).toBe("pointer");
  await expect(marketRow(page, "alien_items")).toHaveClass(/dimmed/);
  expect(
    await marketRow(page, "alien_items").evaluate(
      (element) => getComputedStyle(element).cursor,
    ),
  ).not.toBe("pointer");

  // Alien Items has no stock and none is held: the click does nothing.
  await marketRow(page, "alien_items").click();
  await settleFrames(page);
  expect(
    await page.evaluate(() => window.__wegolite?.station?.selectedKey),
  ).toBe("slaves");
  await expect(comment).toHaveText(SLAVES_NOTE);

  // A key pressed before a click in the same frame applies first: Right plans
  // on Slaves, then the click on Textiles clears that line.
  await clickAndRightInOneTask(page, "textiles", "keyFirst");
  await settleFrames(page);
  await waitForSelectedKey(page, "textiles");
  expect(
    await page.evaluate(() => window.__wegolite?.station?.pending),
  ).toBeNull();

  // A key pressed after a click acts on the clicked row.
  await clickAndRightInOneTask(page, "radioactives", "clickFirst");
  await settleFrames(page);
  await waitForSelectedKey(page, "radioactives");
  await page.waitForFunction(
    () => window.__wegolite?.station?.pending?.key === "radioactives",
    undefined,
    { timeout: UI_WAIT },
  );
  expect(
    await page.evaluate(() => window.__wegolite?.station?.pending),
  ).toEqual({ kind: "trade", key: "radioactives" });
  await page.keyboard.press("KeyN");
  await waitForNoPending(page);

  // Under an open chart a click on the hidden market does nothing.
  await page.keyboard.press("F6");
  await waitForPlace(page, "chart");
  await page.evaluate(() => {
    const cell = document.querySelector(
      '#docked [data-market-rows] tr[data-key="food"] td',
    );
    if (cell === null) throw new Error("no market row food");
    cell.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        detail: 1,
      }),
    );
  });
  await settleFrames(page);
  expect(
    await page.evaluate(() => window.__wegolite?.station?.selectedKey),
  ).toBe("radioactives");
  await page.keyboard.press("Escape");
  await waitForPlace(page, "market");

  await expectNoReload(page);
  expect(errors).toEqual([]);
});

/** The market footer hint with default bindings (quick 261125-ewd). */
const MARKET_HINT =
  "Up/Down/Click select · Double-click sell all/buy max · Left sells +1 · Right buys +1 · Shift max · Enter/Y confirm · N cancel · Esc back · P pause";

async function economyOf(
  page: Page,
): Promise<{ credits: number; cargo: Record<string, number> }> {
  const economy = await page.evaluate(() => window.__wegolite?.economy);
  if (economy === undefined) throw new Error("the probe has no economy");
  return { credits: economy.credits, cargo: { ...economy.cargo } };
}

async function waitForPendingTrade(page: Page, key: string): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const pending = window.__wegolite?.station?.pending;
      return pending?.kind === "trade" && pending.key === expected;
    },
    key,
    { timeout: UI_WAIT },
  );
}

test("a double click on a market row opens the [Y/N] line of Oolite's Enter trade and the footer names the mouse at 1280x720", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await boot(page);
  const hints = page.locator('#docked [data-footer-role="hints"]');
  const status = page.locator('#docked [data-footer-role="status"]');

  await page.keyboard.press("F8");
  await waitForStationPage(page, "market", 1);
  await waitForSelectedKey(page, "food");

  // The footer names the mouse, lists Left before Right, and fits.
  await expect(hints).toHaveText(MARKET_HINT);
  const hintSizes = await hints.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(
    hintSizes.scrollWidth,
    "the market hint line is not ellipsised",
  ).toBeLessThanOrEqual(hintSizes.clientWidth);

  // None held: the buy-max line; nothing is bought until Y.
  const start = await economyOf(page);
  await marketRow(page, "food").dblclick();
  await waitForPendingTrade(page, "food");
  await expect(status).toHaveText(/^Buy \d+ t Food for .+\? \[Y\/N\]$/);
  expect(await economyOf(page)).toEqual(start);
  expect(start.cargo).toEqual({});
  await page.keyboard.press("KeyN");
  await waitForNoPending(page);

  // Buy one tonne with the keys.
  await page.keyboard.press("ArrowRight");
  await waitForPendingTrade(page, "food");
  await page.keyboard.press("KeyY");
  await page.waitForFunction(
    () => window.__wegolite?.economy?.cargo.food === 1,
    undefined,
    { timeout: UI_WAIT },
  );
  const bought = await economyOf(page);

  // Some held: the sell-all line.
  await marketRow(page, "food").dblclick();
  await waitForPendingTrade(page, "food");
  await expect(status).toHaveText(/^Sell 1 t Food for .+\? \[Y\/N\]$/);
  expect(await economyOf(page)).toEqual(bought);
  await page.keyboard.press("KeyN");
  await waitForNoPending(page);

  // Shift: the buy-max line even though some is held.
  await marketRow(page, "food").dblclick({ modifiers: ["Shift"] });
  await waitForPendingTrade(page, "food");
  await expect(status).toHaveText(/^Buy \d+ t Food/);
  await page.keyboard.press("KeyN");
  await waitForNoPending(page);

  // Another row: it is selected and its buy-max line opens.
  await marketRow(page, "slaves").dblclick();
  await waitForPendingTrade(page, "slaves");
  await waitForSelectedKey(page, "slaves");
  await expect(status).toHaveText(/^Buy \d+ t Slaves/);
  await page.keyboard.press("KeyN");
  await waitForNoPending(page);

  // A row the keys cannot select: nothing happens.
  await marketRow(page, "alien_items").dblclick();
  await settleFrames(page);
  expect(
    await page.evaluate(() => window.__wegolite?.station?.selectedKey),
  ).toBe("slaves");
  expect(
    await page.evaluate(() => window.__wegolite?.station?.pending),
  ).toBeNull();
  await expect(status).not.toContainText("[Y/N]");

  expect(await economyOf(page)).toEqual(bought);
  await expectNoReload(page);
  expect(errors).toEqual([]);
});
