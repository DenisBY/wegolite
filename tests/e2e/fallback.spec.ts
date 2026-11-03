// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * WORLD-05: a browser without WebGL2 sees an explanation, not a blank canvas.
 *
 * Every case waits on the probe (D-08 forbids screenshot evidence), asserts the
 * single `#failure` surface is visible, that `ready`/`webgl2` are false, that
 * the canvas and HUD are hidden, that the footer survives, and that no
 * `pageerror` was emitted.
 *
 * The content-manifest case is deliberately absent: `manifest.json` is a
 * build-time import bundled into the app chunk, so `page.route` on it would
 * never fire. `tests/app/boot.test.ts` proves that boundary in Node instead.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { waitForReady } from "./helpers/probe.js";

const FAILURE_MESSAGE = "Wegolite needs WebGL2";

interface WatchedErrors {
  /** Unhandled exceptions: a fallback path must never produce one. */
  readonly pageErrors: string[];
  /** Console errors; Three.js logs its own constructor failure before throwing. */
  readonly consoleErrors: string[];
}

function watchErrors(page: Page): WatchedErrors {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  return { pageErrors, consoleErrors };
}

async function waitForFailure(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      return probe !== undefined && probe.ready === false;
    },
    undefined,
    { timeout: 20_000 },
  );
}

async function expectFallback(page: Page, pageErrors: string[]): Promise<void> {
  const failure = page.locator("#failure");
  await expect(failure).toBeVisible();
  await expect(failure).toHaveAttribute("role", "alert");
  await expect(failure).toContainText(FAILURE_MESSAGE);
  await expect(failure).toContainText("hardware acceleration");

  // One surface, no dead canvas and no HUD over it.
  await expect(page.locator("#view")).toBeHidden();
  await expect(page.locator("#hud")).toBeHidden();
  await expect(page.locator("footer")).toBeVisible();

  const probe = await page.evaluate(() => window.__wegolite);
  expect(probe?.ready).toBe(false);
  expect(probe?.webgl2).toBe(false);
  expect(probe?.error).toBeTruthy();
  expect(probe?.hud.drawn).toBe(false);

  // Asserted last so an unhandled failure is reported before any noise. The
  // fallback being visible proves this is not a console-only path; Three.js's
  // own constructor `console.error` is expected and is not a pageerror.
  expect(pageErrors).toEqual([]);
}

test("getContext returning null for webgl2 shows the fallback", async ({
  page,
}) => {
  const errors = watchErrors(page);

  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "getContext",
    );
    const original = descriptor?.value as
      | ((
          this: HTMLCanvasElement,
          type: string,
          attributes?: unknown,
        ) => RenderingContext | null)
      | undefined;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      attributes?: unknown,
    ): RenderingContext | null {
      if (type === "webgl2") return null;
      if (original === undefined) throw new Error("getContext is unavailable");
      return original.call(this, type, attributes);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });

  await page.goto("/");
  await waitForFailure(page);
  await expectFallback(page, errors.pageErrors);
});

test("a throwing renderer constructor shows the fallback", async ({ page }) => {
  const errors = watchErrors(page);

  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "getContext",
    );
    const original = descriptor?.value as
      | ((
          this: HTMLCanvasElement,
          type: string,
          attributes?: unknown,
        ) => RenderingContext | null)
      | undefined;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      attributes?: unknown,
    ): RenderingContext | null {
      if (type === "webgl2") {
        throw new Error("forced WebGL2 renderer constructor failure");
      }
      if (original === undefined) throw new Error("getContext is unavailable");
      return original.call(this, type, attributes);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });

  await page.goto("/");
  await waitForFailure(page);
  await expectFallback(page, errors.pageErrors);
});

test("an undefined WebGL2RenderingContext global shows the fallback", async ({
  page,
}) => {
  const errors = watchErrors(page);

  await page.addInitScript(() => {
    Object.defineProperty(window, "WebGL2RenderingContext", {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto("/");
  await waitForFailure(page);
  await expectFallback(page, errors.pageErrors);
});

test("a normal browser still boots the game", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await waitForReady(page);

  const probe = await page.evaluate(() => window.__wegolite);
  expect(probe?.ready).toBe(true);
  expect(probe?.webgl2).toBe(true);
  await expect(page.locator("#failure")).toBeHidden();
  await expect(page.locator("#view")).toBeVisible();

  // The normal path is silent: no pageerror and no console error.
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
