// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The per-scene draw-call and triangle budget (QUAL-01, D-10, D-12).
 *
 * This spec gates deterministic budgets only. It never asserts a frame time:
 * a wall-clock frame rate inside the container measures SwiftShader, not a
 * player's GPU (research Pitfall 1), so 60 fps is claimed only from the manual
 * reference-desktop run recorded in docs/PERFORMANCE.md (D-10b). The planet
 * noise-evaluation budget is gated separately by tests/render/planet-budget.test.ts
 * (D-12).
 *
 * The probe publishes `renderer.info.render.calls` and `.triangles` for the most
 * recently rendered frame (src/app/game-session.ts). A scene is read only after
 * three further loop frames, so the counters describe a settled scene. The wait
 * counts loop frames (`probe.frames`), not rendered ones: a docked scene is
 * drawn when it is entered and then left alone (src/app/redraw-gate.ts), so its
 * `renders` counter stops while its counters stay those of the last draw. Every
 * comparison is inclusive: 50 calls and 250 000 triangles pass, 51 and 250 001
 * fail.
 *
 * The cold-start test also guards the on-demand promise of DATA-13 and D-07: it
 * logs every same-origin request path and asserts that none of the nine NPC ship
 * models, nor any texture file they reference, is requested before the first
 * in-flight frame, while the same log shows the Cobra model so it cannot pass on
 * an empty log. The bytes ceiling below is unchanged. Since Phase 16 (plan
 * 16-09, success criterion 4) it asserts the same of the seven debris models
 * (`ships-debris.json`), every texture they reference and the two explosion
 * particle textures: a traffic-off cold start requests none of them, nor the
 * debris and explosion catalogue chunks.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { systemByName } from "./helpers/chart.js";
import { dockedSaveAt } from "./helpers/save-fixtures.js";
import { writeRaw } from "./helpers/save-store.js";
import {
  FIRST_LAUNCH_WAIT_MS,
  getProbe,
  press,
  waitForReady,
} from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

// The old 240 s non-launch budget plus the first-launch wait (quick
// 261121-bjl).
test.setTimeout(240_000 + FIRST_LAUNCH_WAIT_MS);

/** Draw calls per rendered frame (STACK.md lines 442-443, research target). */
const DRAW_CALL_BUDGET = 50;
/** Triangles per rendered frame (STACK.md lines 442-443, research target). */
const TRIANGLE_BUDGET = 250_000;
/** Loop frames to wait for after a scene is reached, so counters settle. */
const SETTLE_FRAMES = 3;
/** The Diso system, reached through an IndexedDB save fixture. */
const DISO_ID = systemByName("Diso").id;
/** One MiB, the rounding unit of the first-load ceiling. */
const MIB = 1_048_576;
/**
 * Regression ceiling for the cold-start transfer to the first in-flight frame
 * (T-07-14, D-14). The measured baseline is 8 814 224 bytes (8.41 MiB) on
 * 2026-11-11, rounded up to the next MiB. It was 7 490 424 bytes before the
 * navigation buoy model and its textures were added, and 20 996 848 bytes
 * before the textures were re-encoded to WebP and the client ship catalogue
 * was trimmed.
 */
const FIRST_LOAD_BYTES_CEILING = 9 * MIB;

interface NpcAssetPaths {
  readonly glbs: readonly string[];
  readonly textures: readonly string[];
}

/** The compiled NPC records (`ships-npc.json`), each with its GLB path. */
function npcRecords(): readonly { readonly glb: string }[] {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), "src", "content", "generated", "ships-npc.json"),
      "utf8",
    ),
  ) as readonly { readonly glb: string }[];
}

/**
 * The URL paths of every NPC GLB and every texture those GLBs reference, from
 * the compiled records and each GLB's own JSON chunk (length at byte 12, text
 * from byte 20). Image URIs resolve against the GLB's own path.
 */
function npcAssetPaths(): NpcAssetPaths {
  const root = process.cwd();
  const records = npcRecords();
  const glbs = new Set<string>();
  const textures = new Set<string>();
  for (const record of records) {
    const glbUrl = new URL(`/${record.glb}`, "http://localhost");
    glbs.add(glbUrl.pathname);
    const bytes = readFileSync(join(root, "public", record.glb));
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(
      bytes.subarray(20, 20 + jsonLength).toString("utf8"),
    ) as { readonly images?: readonly { readonly uri: string }[] };
    for (const image of json.images ?? []) {
      textures.add(new URL(image.uri, glbUrl).pathname);
    }
  }
  return { glbs: [...glbs].sort(), textures: [...textures].sort() };
}

/**
 * The URL paths of the seven debris GLBs (`ships-debris.json`), every texture
 * those GLBs reference (read from each GLB's JSON chunk, as `npcAssetPaths`
 * does) and the two explosion particle textures (`explosions.json`'s cloud
 * texture and Oolite's flash, `src/render/bodies/explosions.ts`).
 */
function debrisAssetPaths(): NpcAssetPaths & {
  readonly particles: readonly string[];
} {
  const root = process.cwd();
  const records = JSON.parse(
    readFileSync(
      join(root, "src", "content", "generated", "ships-debris.json"),
      "utf8",
    ),
  ) as readonly { readonly glb: string }[];
  const glbs = new Set<string>();
  const textures = new Set<string>();
  for (const record of records) {
    const glbUrl = new URL(`/${record.glb}`, "http://localhost");
    glbs.add(glbUrl.pathname);
    const bytes = readFileSync(join(root, "public", record.glb));
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(
      bytes.subarray(20, 20 + jsonLength).toString("utf8"),
    ) as { readonly images?: readonly { readonly uri: string }[] };
    for (const image of json.images ?? []) {
      textures.add(new URL(image.uri, glbUrl).pathname);
    }
  }
  const explosions = JSON.parse(
    readFileSync(
      join(root, "src", "content", "generated", "explosions.json"),
      "utf8",
    ),
  ) as readonly { readonly texture: string }[];
  const particles = new Set<string>(["/textures/oolite-particle-flash.png"]);
  for (const explosion of explosions) {
    particles.add(`/textures/${explosion.texture}`);
  }
  return {
    glbs: [...glbs].sort(),
    textures: [...textures].sort(),
    particles: [...particles].sort(),
  };
}

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
 * Assert one scene is inside the budget. The mode check ties the counters to the
 * scene the annotation names, so a scene cannot pass by reading another mode.
 */
async function expectWithinBudget(
  page: Page,
  scene: string,
  mode: string,
): Promise<void> {
  const before = (await getProbe(page)).frames;
  await page.waitForFunction(
    (wait: { since: number; frames: number }) => {
      const probe = window.__wegolite;
      return (
        probe !== undefined &&
        probe.ready === true &&
        probe.frames >= wait.since + wait.frames
      );
    },
    { since: before, frames: SETTLE_FRAMES },
    { timeout: 60_000 },
  );
  const probe = await getProbe(page);
  test.info().annotations.push({
    type: `budget-${scene}`,
    description: `${probe.calls} calls, ${probe.triangles} triangles`,
  });
  expect(probe.mode, `${scene}: flight mode`).toBe(mode);
  // The counters must come from a real draw, not from a scene never drawn.
  expect(probe.renders, `${scene}: rendered frames`).toBeGreaterThan(0);
  expect(probe.calls, `${scene}: draw calls (vacuity guard)`).toBeGreaterThan(
    0,
  );
  expect(
    probe.triangles,
    `${scene}: triangles (vacuity guard)`,
  ).toBeGreaterThan(0);
  expect(probe.calls, `${scene}: draw-call budget`).toBeLessThanOrEqual(
    DRAW_CALL_BUDGET,
  );
  expect(probe.triangles, `${scene}: triangle budget`).toBeLessThanOrEqual(
    TRIANGLE_BUDGET,
  );
}

test("Lave docked, launching and in-flight scenes stay within the draw-call and triangle budget", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await waitForReady(page);
  await startNewGame(page);
  await waitForMode(page, "docked");
  await expectWithinBudget(page, "lave-docked", "docked");
  await press(page, "Digit1");
  await waitForMode(page, "launching");
  await expectWithinBudget(page, "lave-launching", "launching");
  await waitForMode(page, "inFlight");
  await expectWithinBudget(page, "lave-in-flight", "inFlight");
  expect(errors).toEqual([]);
});

test("a second system's docked and in-flight scenes stay within the budget", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await waitForReady(page);
  await writeRaw(page, dockedSaveAt("Diso"));
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#title-continue")).toBeVisible();
  await page.click("#title-continue");
  await waitForMode(page, "docked");
  expect((await getProbe(page)).systemId).toBe(DISO_ID);
  await expectWithinBudget(page, "diso-docked", "docked");
  await press(page, "Digit1");
  await waitForMode(page, "inFlight");
  expect((await getProbe(page)).systemId).toBe(DISO_ID);
  await expectWithinBudget(page, "diso-in-flight", "inFlight");
  expect(errors).toEqual([]);
});

test("a cold start to the first in-flight frame stays under the first-load bytes ceiling", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;
  const transferred: Promise<number>[] = [];
  const requested: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin) requested.push(url.pathname);
  });
  page.on("requestfinished", (request) => {
    if (new URL(request.url()).origin !== origin) return;
    transferred.push(request.sizes().then((sizes) => sizes.responseBodySize));
  });
  await page.goto("/");
  await waitForReady(page);
  await startNewGame(page);
  await waitForMode(page, "docked");
  await press(page, "Digit1");
  await waitForMode(page, "inFlight");
  const total = (await Promise.all(transferred)).reduce(
    (sum, bytes) => sum + bytes,
    0,
  );
  test.info().annotations.push({
    type: "first-load-bytes",
    description: `${total} bytes (ceiling ${FIRST_LOAD_BYTES_CEILING})`,
  });
  const npc = npcAssetPaths();
  const npcPaths = new Set([...npc.glbs, ...npc.textures]);
  // Plan 21-04: the roster grows in plan 21-08 without touching this spec, so
  // the counts follow the catalogue (9 GLBs and 43 textures today) and the
  // guards keep a floor: some GLB, and at least one texture per GLB.
  expect(npc.glbs.length, "NPC GLB paths (vacuity guard)").toBeGreaterThan(0);
  expect(npc.glbs, "NPC GLB paths (vacuity guard)").toHaveLength(
    npcRecords().length,
  );
  expect(
    npc.textures.length,
    "NPC texture paths (vacuity guard)",
  ).toBeGreaterThanOrEqual(npc.glbs.length);
  expect(
    requested.some((path) => path.endsWith("/models/cobra3.glb")),
    "the request log is live (the Cobra model was requested)",
  ).toBe(true);
  expect(
    requested.filter((path) => npcPaths.has(path)),
    "NPC models and textures requested on a cold start",
  ).toEqual([]);
  // Phase 16 (success criterion 4): no debris model, debris texture or
  // particle texture before the first in-flight frame.
  const debris = debrisAssetPaths();
  const debrisPaths = new Set([
    ...debris.glbs,
    ...debris.textures,
    ...debris.particles,
  ]);
  expect(debris.glbs, "debris GLB paths (vacuity guard)").toHaveLength(7);
  expect(debris.textures, "debris texture paths (vacuity guard)").toHaveLength(
    6,
  );
  expect(debris.particles, "particle texture paths (vacuity guard)").toEqual([
    "/textures/oolite-particle-cloud2.png",
    "/textures/oolite-particle-flash.png",
  ]);
  expect(
    requested.filter((path) => debrisPaths.has(path)),
    "debris models, debris textures and particle textures requested on a cold start",
  ).toEqual([]);
  // The debris and explosion catalogues load with traffic on only (plan 16-06).
  expect(
    requested.filter((path) =>
      /\/assets\/(ships-debris|explosions)-[^/]+\.js$/.test(path),
    ),
    "the debris and explosion chunks requested by a traffic-off cold start",
  ).toEqual([]);
  // The hull chunk (plan 13-11, D-01) joins the boot load only with traffic on:
  // a traffic-off session never fetches it.
  expect(
    requested.filter((path) => /\/assets\/ships-hulls-[^/]+\.js$/.test(path)),
    "the lazy hull chunk requested by a traffic-off cold start",
  ).toEqual([]);
  expect(total, "first-load bytes").toBeGreaterThan(0);
  expect(total, "first-load bytes ceiling").toBeLessThanOrEqual(
    FIRST_LOAD_BYTES_CEILING,
  );
});
