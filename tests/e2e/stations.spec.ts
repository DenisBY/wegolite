// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Each system's own main station in the browser (Phase 22.1, WORLD-20,
 * Success Criterion 3).
 *
 * The player continues at a Coriolis (Lave), a Dodecahedron (Biarge) and an
 * Icosahedron (Zaonce) system, launches, and docks again. The proofs are the
 * probe (`window.__wegolite`) and the console guards; no screenshot and no pixel
 * read (PROJECT.md D-08):
 *
 * - the model drawn is the render's fact: `world.stationModel` is the kind of
 *   the model attached to the scene's station body (`null` while meshless), and
 *   every journey waits on it, never on the session's `world.stationKind`;
 * - the launch leaves through the kind's own slot: at the first in-flight frame
 *   the ship's local +X lies along the slot's long axis in world space, read
 *   from the published ship orientation and `world.stationOrientation`
 *   (a quarter roll for a portrait slot, none for a landscape one; the slot's
 *   shape comes from the committed dock record);
 * - a manual approach aligned with each slot docks (the aligned pose is derived
 *   here, in Node, from the published station and planet positions and the
 *   kind's own dock offset read from the committed catalogue);
 * - the docking computer docks inside the Icosahedron's aegis;
 * - one journey arrives by a hyperspace jump, so the countdown prefetch and the
 *   late attach of the station model run in the browser.
 *
 * The first-load bytes of a Continue at Zaonce are annotated, not gated
 * (`budget.spec.ts` gates a Lave start). This spec runs in `verify-full`, not
 * in the `test:e2e:fast` smoke subset: its journeys are slow on software GL.
 *
 * Every wait is on the probe, never on a fixed sleep.
 */

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { STATION_RECORDS } from "../../src/content/stations.js";
import type { StationKind } from "../../src/content/stations.js";
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
import type { Vec3 } from "../../src/sim/math.js";
import { systemByName } from "./helpers/chart.js";
import {
  FIRST_LAUNCH_WAIT_MS,
  getProbe,
  waitForReady,
} from "./helpers/probe.js";
import { dockedSaveAt, inFlightSaveAt } from "./helpers/save-fixtures.js";
import { writeRaw } from "./helpers/save-store.js";

/** Metres of the Cobra's nose past the mouth plane of the aligned pose. */
const NOSE_PAST_PLANE = 90;
/** The dot product a launched ship's wings must reach with the slot's long axis. */
const TWIST_DOT_MIN = 0.99;

interface ClientEntry {
  readonly key: string;
  readonly extras: { readonly name?: unknown };
  readonly shipDef: {
    readonly subentities: readonly {
      readonly isDock?: boolean;
      readonly position?: readonly number[];
    }[];
  };
}

interface DockPortRecord {
  readonly port: { readonly width: number; readonly height: number };
  readonly ship: { readonly min: readonly number[] };
}

function readGenerated<T>(fileName: string): T {
  return JSON.parse(
    readFileSync(
      new URL(`../../src/content/generated/${fileName}`, import.meta.url),
      "utf8",
    ),
  ) as T;
}

/** What a journey needs to know about one system's station, from the records. */
interface StationFacts {
  readonly kind: StationKind;
  readonly systemName: string;
  /** The station's compiled display name (`extras.name`). */
  readonly name: string;
  /** The absolute `z` of the dock subentity: the mouth's distance from the centre. */
  readonly dockOffset: number;
  /** A portrait slot is taller than wide (the Coriolis, the Icosahedron). */
  readonly portrait: boolean;
  /** The Cobra's nose-most local z, from the kind's dock record. */
  readonly noseZ: number;
}

const CLIENT_ENTRIES =
  readGenerated<readonly ClientEntry[]>("ships-client.json");

function stationFacts(kind: StationKind, systemName: string): StationFacts {
  const record = STATION_RECORDS[kind];
  expect(systemByName(systemName).station, `${systemName}'s station`).toBe(
    kind,
  );
  const entry = CLIENT_ENTRIES.find(
    (candidate) => candidate.key === record.shipKey,
  );
  const name = entry?.extras.name;
  const dockZ = entry?.shipDef.subentities.find(
    (entry) => entry.isDock === true,
  )?.position?.[2];
  if (typeof name !== "string" || dockZ === undefined) {
    throw new Error(`ships-client.json has no dock or name for ${kind}`);
  }
  const dock = readGenerated<DockPortRecord>(record.dockPortFile);
  const noseZ = dock.ship.min[2];
  if (noseZ === undefined) throw new Error(`${kind}: no ship nose z`);
  return {
    kind,
    systemName,
    name,
    dockOffset: Math.abs(dockZ),
    portrait: dock.port.width < dock.port.height,
    noseZ,
  };
}

const LAVE = stationFacts("coriolis", "Lave");
const BIARGE = stationFacts("dodecahedron", "Biarge");
const ZAONCE = stationFacts("icosahedron", "Zaonce");

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
    { timeout: FIRST_LAUNCH_WAIT_MS },
  );
}

/**
 * Wait until the session is in `systemId` and the render has the station kind's
 * model attached: `world.stationModel` (the scene body's `modelKind`) equals the
 * kind. The session's `world.stationKind` is asserted beside it, never instead.
 */
async function waitForStationModel(
  page: Page,
  kind: StationKind,
  systemId: string,
): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.ready === true &&
        probe.systemId === expected.systemId &&
        probe.world?.stationModel === expected.kind
      );
    },
    { kind, systemId },
    { timeout: 120_000 },
  );
  expect((await getProbe(page)).world?.stationKind).toBe(kind);
}

/**
 * Seed `raw` as the autosave, reload and press Continue. The URL keeps its query
 * across the reload, so `?test=1` reaches the session.
 */
async function continueFrom(
  page: Page,
  url: string,
  raw: string,
): Promise<void> {
  await page.goto(url);
  await waitForReady(page);
  await writeRaw(page, raw);
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  await page.click("#title-continue");
}

/** The subtitle of the docked home screen. */
function subtitleOf(page: Page): ReturnType<Page["locator"]> {
  return page.locator('#docked [data-field="home-station-subtitle"]');
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

type Wxyz = readonly [number, number, number, number];

function quatOf(value: Wxyz): { w: number; x: number; y: number; z: number } {
  return { w: value[0], x: value[1], y: value[2], z: value[3] };
}

/**
 * Wait for the first in-flight probe after a launch and read, from that single
 * probe object, the ship's orientation and the station's live orientation.
 */
async function firstInFlightOrientations(
  page: Page,
): Promise<{ readonly ship: Wxyz; readonly station: Wxyz }> {
  const handle = await page.waitForFunction(
    () => {
      const probe = window.__wegolite;
      if (probe === undefined || probe.ready !== true) return null;
      if (probe.mode !== "inFlight") return null;
      const station = probe.world?.stationOrientation;
      if (station === undefined) return null;
      return { ship: probe.orientation, station };
    },
    undefined,
    { timeout: FIRST_LAUNCH_WAIT_MS },
  );
  const value = await handle.jsonValue();
  if (value === null) throw new Error("no in-flight orientations");
  return value;
}

/**
 * The launch twist of one kind, proven from published orientations: the ship's
 * local +X lies along the slot's long axis (the station's local +Y for a
 * portrait slot, its local +X for a landscape one) and across the other one.
 * Returns the two measured |dot| values for the annotation.
 */
function expectLaunchTwist(
  facts: StationFacts,
  orientations: { readonly ship: Wxyz; readonly station: Wxyz },
): { readonly along: number; readonly across: number } {
  const wings = rotate(quatOf(orientations.ship), vec(1, 0, 0));
  const stationQuat = quatOf(orientations.station);
  const stationX = rotate(stationQuat, vec(1, 0, 0));
  const stationY = rotate(stationQuat, vec(0, 1, 0));
  const longAxis = facts.portrait ? stationY : stationX;
  const shortAxis = facts.portrait ? stationX : stationY;
  const along = Math.abs(dot(wings, longAxis));
  const across = Math.abs(dot(wings, shortAxis));
  expect(
    along,
    `${facts.kind}: the wings lie along the slot's long axis`,
  ).toBeGreaterThanOrEqual(TWIST_DOT_MIN);
  expect(
    across,
    `${facts.kind}: the wings lie across the slot's short axis`,
  ).toBeLessThan(0.15);
  return { along, across };
}

/**
 * Put the ship in the aligned approach of `facts`'s slot through the `?test=1`
 * hook: the arithmetic of `docking.spec.ts` with the kind's own dock offset and
 * a half turn chosen by the slot's shape (about (1,1,0) for a portrait slot, so
 * local X runs along the tall slot; about (0,1,0) for a landscape one, so local
 * X stays along the wide slot).
 */
async function placeAlignedPose(
  page: Page,
  facts: StationFacts,
): Promise<void> {
  const probe = await getProbe(page);
  const station = probe.world?.station;
  const planet = probe.world?.planet;
  if (station === undefined || planet === undefined) {
    throw new Error("the probe has no station/planet world positions");
  }
  const stationVec = vec(station[0], station[1], station[2]);
  const planetVec = vec(planet[0], planet[1], planet[2]);
  const stationToPlanet = normalizeVec(sub(planetVec, stationVec));
  const mouth = add(stationVec, scale(stationToPlanet, facts.dockOffset));
  const qPort = quatFromUnitVectors(vec(0, 0, -1), stationToPlanet);
  const halfTurn = facts.portrait
    ? axisAngle(1, 1, 0, Math.PI)
    : axisAngle(0, 1, 0, Math.PI);
  const orientation = normalize(mul(qPort, normalize(halfTurn)));
  const k = rotate(qPort, vec(0, 0, -1));
  const position = add(mouth, scale(k, -facts.noseZ - NOSE_PAST_PLANE));
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

/**
 * Continue at `facts`'s system, check the docked line and the drawn model,
 * launch, prove the launch twist, then dock by the aligned manual approach.
 */
async function launchTwistAndManualDock(
  page: Page,
  facts: StationFacts,
): Promise<void> {
  const errors = collectErrors(page);
  const system = systemByName(facts.systemName);
  await continueFrom(page, "/?test=1", dockedSaveAt(facts.systemName));
  await waitForMode(page, "docked");
  await expect(subtitleOf(page)).toHaveText(`${facts.name} · Docked`);
  await waitForStationModel(page, facts.kind, system.id);

  await page.keyboard.press("Digit1");
  await waitForMode(page, "inFlight");
  const orientations = await firstInFlightOrientations(page);
  const measured = expectLaunchTwist(facts, orientations);
  test.info().annotations.push({
    type: `launch-twist-${facts.kind}`,
    description: `|dot(ship +X, slot long axis)| = ${measured.along.toFixed(5)}, across = ${measured.across.toFixed(5)}`,
  });

  const before = (await getProbe(page)).dock?.dockCount ?? 0;
  await placeAlignedPose(page, facts);
  await waitForMode(page, "docked");
  const docked = await getProbe(page);
  expect(docked.dock?.dockCount).toBe(before + 1);
  expect(docked.dock?.outcome).toBe("docked");
  expect(docked.world?.stationKind).toBe(facts.kind);
  expect(docked.world?.stationModel).toBe(facts.kind);
  expect(errors).toEqual([]);
}

test.describe("each station type in the browser", () => {
  test("a Continue at Zaonce names the Icosahedron, launches, and the docking computer docks inside its aegis (tracer)", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(240_000 + FIRST_LAUNCH_WAIT_MS);
    const errors = collectErrors(page);
    const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;
    const requested: string[] = [];
    let transferred: Promise<number>[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin === origin) requested.push(url.pathname);
    });
    page.on("requestfinished", (request) => {
      if (new URL(request.url()).origin !== origin) return;
      transferred.push(request.sizes().then((sizes) => sizes.responseBodySize));
    });
    // A pass-through route: Chromium bypasses its HTTP cache while a route is
    // active, so the reload below is a cold load and the bytes are comparable
    // with the cold start of `budget.spec.ts`.
    await page.route("**/*", (route) => route.continue());

    await page.goto("/");
    await waitForReady(page);
    await writeRaw(
      page,
      dockedSaveAt(ZAONCE.systemName, { equipment: ["EQ_DOCK_COMP"] }),
    );
    // The measured load: the reload to the first in-flight frame of a Continue.
    transferred = [];
    requested.length = 0;
    await page.reload();
    await waitForReady(page);
    await expect(page.locator("#title-continue")).toBeVisible();
    await page.click("#title-continue");
    await waitForMode(page, "docked");

    // The docked line names the system's own station, from the record.
    await expect(subtitleOf(page)).toHaveText(`${ZAONCE.name} · Docked`);
    await waitForStationModel(
      page,
      "icosahedron",
      systemByName(ZAONCE.systemName).id,
    );

    await page.keyboard.press("Digit1");
    await waitForMode(page, "inFlight");
    const total = (await Promise.all(transferred)).reduce(
      (sum, bytes) => sum + bytes,
      0,
    );
    test.info().annotations.push({
      type: "continue-zaonce-first-load-bytes",
      description: `${total} bytes to the first in-flight frame (Coriolis preload plus the Icosahedron)`,
    });
    expect(
      requested.some((path) =>
        path.endsWith(`/${STATION_RECORDS.icosahedron.glb}`),
      ),
      "the Icosahedron model was requested by the Continue",
    ).toBe(true);
    expect(total, "Continue-at-Zaonce bytes").toBeGreaterThan(0);

    const before = (await getProbe(page)).dock?.dockCount ?? 0;
    await page.keyboard.down("Shift");
    await page.keyboard.press("KeyC");
    await page.keyboard.up("Shift");
    await waitForMode(page, "docked");
    const docked = await getProbe(page);
    expect(docked.dock?.dockCount).toBe(before + 1);
    expect(docked.dock?.lastClockDelta).toBe(1200);
    expect(docked.world?.stationKind).toBe("icosahedron");
    expect(docked.world?.stationModel).toBe("icosahedron");
    await expect(subtitleOf(page)).toHaveText(`${ZAONCE.name} · Docked`);
    expect(errors).toEqual([]);
  });

  for (const facts of [LAVE, BIARGE, ZAONCE]) {
    test(`${facts.systemName} (${facts.kind}): the launch leaves through the kind's own slot and an aligned manual approach docks`, async ({
      page,
    }) => {
      test.setTimeout(240_000 + FIRST_LAUNCH_WAIT_MS);
      await launchTwistAndManualDock(page, facts);
    });
  }

  test("a jump from Lave to Zaonce arrives at an Icosahedron station and attaches its model", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(600_000);
    const errors = collectErrors(page);
    const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;
    const requested: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin === origin) requested.push(url.pathname);
    });
    const zaonce = systemByName(ZAONCE.systemName);
    const lave = systemByName(LAVE.systemName);
    const icosahedronGlb = `/${STATION_RECORDS.icosahedron.glb}`;

    // An in-flight save 1,000 m from the Lave witchpoint buoy, far outside the
    // station's blockage radius, with Zaonce (5.73 light years) committed.
    await continueFrom(
      page,
      "/",
      inFlightSaveAt(
        LAVE.systemName,
        {
          position: [1000, 0, 0],
          orientation: [1, 0, 0, 0],
          speed: 0,
        },
        ZAONCE.systemName,
      ),
    );
    await waitForMode(page, "inFlight");
    await waitForStationModel(page, "coriolis", lave.id);
    expect(
      requested.filter((path) => path === icosahedronGlb),
      "no Icosahedron model before the countdown",
    ).toEqual([]);

    await page.keyboard.press("KeyH");
    await page.waitForFunction(
      () => (window.__wegolite?.hyperspace?.countdown ?? 0) > 0,
      undefined,
      { timeout: 60_000 },
    );
    // The countdown prefetch: the destination's model is requested while the
    // countdown still runs, before the arrival.
    await expect
      .poll(() => requested.includes(icosahedronGlb), { timeout: 60_000 })
      .toBe(true);

    await page.waitForFunction(
      (id) => {
        const probe = window.__wegolite;
        return (
          probe !== undefined && probe.ready === true && probe.systemId === id
        );
      },
      zaonce.id,
      { timeout: 300_000 },
    );
    const arrival = await getProbe(page);
    await waitForStationModel(page, "icosahedron", zaonce.id);
    const attached = await getProbe(page);
    test.info().annotations.push({
      type: "jump-arrival-model-frames",
      description: `${attached.frames - arrival.frames} loop frames from the first probe at Zaonce to world.stationModel icosahedron (model already attached at that probe: ${String(arrival.world?.stationModel === "icosahedron")})`,
    });
    expect(attached.world?.stationKind).toBe("icosahedron");
    expect(attached.world?.stationModel).toBe("icosahedron");
    expect(errors).toEqual([]);
  });
});
