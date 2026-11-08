// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The WR-04 browser negative control (Phase 6 WR-04, D-18, QUAL-05).
 *
 * A committed hyperspace jump whose destination build throws must stop in the
 * system the player left: the failure surface shows the arrival copy, the
 * failure probe names the injected fault, and the save bytes do not change.
 *
 * The fault is injected through a page global that only the test-only build
 * reads (vite.seams.config.ts, served by Playwright on 127.0.0.1:4175). The
 * shipped site on 4173 never reads it, and the second test proves that from the
 * built bundles.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { WegoliteProbe } from "../../src/app/probe.js";

import { systemByName } from "./helpers/chart.js";
import { getProbe, waitForReady } from "./helpers/probe.js";
import { inFlightSaveAt } from "./helpers/save-fixtures.js";
import { readRaw, writeRaw } from "./helpers/save-store.js";

/** The page global the test build reads (src/main.ts `readSessionFaults`). */
const FAULT_GLOBAL = "__wegoliteFaults";
/** The compile-time switch name (src/main.ts `declare const`). */
const SEAM_CONSTANT = "__WEGOLITE_TEST_SEAMS__";
/** Where vite.seams.config.ts writes the test-only bundle (never dist/). */
const SEAMS_ASSETS = join(
  process.cwd(),
  "node_modules",
  ".wegolite-seams",
  "assets",
);
const SHIPPED_ASSETS = join(process.cwd(), "dist", "assets");

// Mirrors DESTINATION_BUILD_FAULT_MESSAGE in src/app/game-session.ts. The spec
// does not import game-session.ts: that module pulls in Vite-only imports
// (JSON and ?raw content), which Playwright's Node loader cannot evaluate.
const FAULT_MESSAGE = "Injected destination-build failure (test seam)";

// The sim advances slowly under headless SwiftShader, so the 15 s countdown needs
// a wide budget. Matches the hyperspace tracer spec.
test.setTimeout(600_000);

// The test build only. The shipped site on 4173 is covered by the bundle scan.
test.use({ baseURL: "http://127.0.0.1:4175" });

// The in-flight origin pose. The fixture is assumed to sit far outside the
// Coriolis blockage radius; the first test asserts that before pressing H.
const ORIGIN_POSE = {
  position: [0, 0, 0] as [number, number, number],
  orientation: [1, 0, 0, 0] as [number, number, number, number],
  speed: 0,
};

/** Collect console errors and uncaught page errors. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
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

test("a forced destination-build throw after a committed jump stops in the origin system with the save untouched", async ({
  page,
}) => {
  const errors = collectErrors(page);

  // The fault global is set before any app script runs, so the test build reads
  // it at boot. The page-level value is the only way in: no URL parameter.
  await page.addInitScript(() => {
    Object.assign(window, {
      __wegoliteFaults: { failDestinationBuild: true },
    });
  });

  // Seed an in-flight save at Lave with a committed target of Diso, then reload
  // so the boot reader resumes it.
  await page.goto("/");
  await waitForReady(page);
  await writeRaw(page, inFlightSaveAt("Lave", ORIGIN_POSE, "Diso"));
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible({
    timeout: 60_000,
  });
  await page.click("#title-continue");
  await waitForMode(page, "inFlight");

  // publishFailure replaces window.__wegolite with a new object, but the session
  // keeps writing its own probe object. Keep a reference to the session's object
  // now, so the origin state can be read after the failure surface appears.
  await page.evaluate(() => {
    Object.assign(window, { __probeBeforeFault: window.__wegolite });
  });

  // The Coriolis blockage must not refuse the jump: the origin is far from it.
  const before = await getProbe(page);
  const lave = systemByName("Lave");
  const fuelBefore = before.economy?.fuel;
  const committedBefore = before.save?.committed;
  expect(before.systemId).toBe(lave.id);
  expect(fuelBefore).toBeDefined();
  expect(committedBefore).toBeDefined();
  const [sx, sy, sz] = before.world?.station ?? [
    Number.NaN,
    Number.NaN,
    Number.NaN,
  ];
  const [px, py, pz] = before.position;
  expect(Math.hypot(px - sx, py - sy, pz - sz)).toBeGreaterThan(7000);

  const savedBeforeJump = await readRaw(page);
  expect(savedBeforeJump).not.toBeNull();

  // Commit the jump: H starts the countdown, which completes into the arrival.
  await page.keyboard.press("KeyH");
  await page.waitForFunction(
    () => (window.__wegolite?.hyperspace?.countdown ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );

  // The injected throw runs inside the arrival build. The failure surface shows
  // the arrival copy once the countdown completes.
  const failure = page.locator("#failure");
  await expect(failure).toBeVisible({ timeout: 300_000 });
  await expect(failure).toContainText("Hyperspace arrival failed");

  // getProbe would throw here (ready: false), so read the failure probe directly.
  const failedProbe = await page.evaluate(() => window.__wegolite);
  expect(failedProbe?.ready).toBe(false);
  expect(failedProbe?.error).toContain(FAULT_MESSAGE);

  // The session's own probe, read through the kept reference. The arrival never
  // installed Diso, so the origin system and market stay Lave, the fuel and the
  // jump record are unchanged, and nothing was committed.
  const kept = await page.evaluate(
    () =>
      (window as unknown as { __probeBeforeFault?: WegoliteProbe })
        .__probeBeforeFault,
  );
  expect(kept).toBeDefined();
  if (kept === undefined) return;
  expect(kept.systemId).toBe(lave.id);
  expect(kept.economy?.marketSystemId).toBe(lave.id);
  expect(kept.hyperspace?.lastJump ?? null).toBeNull();
  expect(kept.economy?.fuel).toBe(fuelBefore);
  expect(kept.save?.committed).toBe(committedBefore);

  // The session is paused behind the failure, so the flight clock is frozen,
  // while the origin scene keeps rendering (nothing was half-swapped).
  const flightBefore = kept.flightTime;
  const rendersBefore = kept.renders;
  await page.evaluate(
    () => new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  );
  const after = await page.evaluate(
    () =>
      (window as unknown as { __probeBeforeFault?: WegoliteProbe })
        .__probeBeforeFault,
  );
  expect(after?.flightTime).toBe(flightBefore);
  expect(after?.renders ?? 0).toBeGreaterThan(rendersBefore);

  // WR-04: a failed arrival writes no save bytes.
  expect(await readRaw(page)).toBe(savedBeforeJump);

  // The fault is caught and shown, so no uncaught exception reaches the page.
  // A console error that names the injected fault is the one allowed entry.
  expect(errors.filter((text) => !text.includes(FAULT_MESSAGE))).toEqual([]);
});

/** Every `.js` file directly under `dir`. A missing directory throws, so a vacuous scan fails. */
function jsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => join(dir, name));
}

// The seam is compiled out of every shipped JavaScript bundle. The trigger is the
// only thing that must be absent: the arrival failure copy and the fault message
// may legitimately ship, because the code path itself ships. Source maps
// (dist/assets/*.js.map) are not scanned: they carry the public GPL source text by
// design, so the seam's name appears there as source, not as executable code.
test("the shipped bundle contains no fault seam, and the test bundle does (positive control)", () => {
  const shipped = jsFiles(SHIPPED_ASSETS);
  const testBuild = jsFiles(SEAMS_ASSETS);

  // Vacuity guards: both directories must hold at least one bundle.
  expect(shipped.length).toBeGreaterThan(0);
  expect(testBuild.length).toBeGreaterThan(0);

  for (const file of shipped) {
    const code = readFileSync(file, "utf8");
    expect(code, file).not.toContain(FAULT_GLOBAL);
    expect(code, file).not.toContain(SEAM_CONSTANT);
  }

  // Positive control: the same scan finds the global in the test-only build.
  const seamPresent = testBuild.some((file) =>
    readFileSync(file, "utf8").includes(FAULT_GLOBAL),
  );
  expect(seamPresent).toBe(true);
});
