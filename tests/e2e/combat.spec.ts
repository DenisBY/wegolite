// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The one opt-in combat smoke of Phase 13 (plan 13-14; CBT-04 to CBT-07,
 * INPUT-01).
 *
 * The combat rules are proven by Vitest scenarios (ROADMAP criterion 5: at least
 * 90 % of the phase's behavioural assertions); this spec only shows that the
 * loop is wired in a real session: the fire key heats the laser, a scripted test
 * pilot placed ahead of the player takes its forward shield down, the ident
 * key locks it with a message, and a ship the player's laser brings to zero
 * energy is destroyed and leaves the scanner (FOUND-19, plan 15-04). The
 * shooter fires through Oolite's NPC fire gate (plan 17-05; heat, energy, the
 * 12-tick beam period, the range roll and aim): its hits drain the forward shield
 * and then the energy bank, read here 360 ticks after the spawn and equal to the
 * Node twin's literals (criterion 3: the route from a hook-spawned shooter to the
 * readout). Fire is held from the moment the shooter appears, because the shooter
 * fires back: the player's energy bank must still pay for every pulse until the
 * 12th hit kills it (the budget and its Vitest twin are in
 * tests/app/session/tick-parity.test.ts).
 * Step 5 (Phase 16, plan 16-09; WORLD-17, D16-08, D16-09) spawns the shooter
 * with 20 cargo capsules and proves the kill in the browser against its Node
 * twin, "the debris twin" in tests/app/session/tick-parity.test.ts (plan 16-06):
 * the kill lands on the twin's tick, the probe counts the twin's entities (the
 * pods, the plate and the wrecks included), the debris models and the particle
 * textures are requested only after the kill, the frame with the explosion and
 * the debris drawn stays within the 50-call budget, and the world hash 60 ticks
 * after the kill equals the twin's literal. The twin runs with no render layer,
 * so that equality proves the explosion and debris layers never touch the hash
 * (success criterion 3). It opts in by URL (`?test=1&traffic=1&clock=manual`,
 * the same opt-in as tests/e2e/traffic.spec.ts), because the browser-test bundle
 * defaults NPC traffic off and the hull and weapon tables load only with traffic
 * on. Every assertion is a count or a value read from the probe; none measures
 * time. The wait timeouts are correctness bounds, never assertions.
 *
 * The visuals (the four views, the laser lines, the ident frame) are not asserted
 * here: they are covered by unit tests and need a human look.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { waitForReady } from "./helpers/probe.js";
import { startNewGame } from "./helpers/title.js";

/** A correctness bound, not a performance claim (the SwiftShader loop is slow). */
const SLOW = 30_000;
/** The URL this spec boots: traffic on, manual clock (opt-in by URL only). */
const COMBAT_URL = "/?test=1&traffic=1&clock=manual";
/** The launch handover is 240 ticks (two seconds); this is comfortably past it. */
const LAUNCH_TICKS = 300;
/**
 * A bound well past the gate's first shots, not a think count: the beam-armed
 * Viper asks every tick and the NPC fire gate lets a shot out at most every 12
 * ticks (the first within 12 ticks of the spawn), so 360 ticks hold up to 30.
 */
const SHOOTING_TICKS = 360;
/** The chunk of manual ticks the kill step advances between scanner reads. */
const KILL_CHUNK_TICKS = 60;
/**
 * A correctness bound for the kill step, never an assertion of time: the bank
 * would refuse a pulse long after the kill (the twin measures the kill at 672).
 */
const KILL_BOUND_TICKS = 1500;
/** Cargo capsules the shooter carries, the debris twin's argument (D16-09). */
const SHOOTER_CARGO = 20;
/**
 * The debris twin's pins (tests/app/session/tick-parity.test.ts, plan 16-06):
 * the kill tick relative to the spawn, the probe's entity count on the kill
 * tick (the populated world plus the twin's debris, since plan 17-05 2 pods, no
 * plate and 1 wreck), and the world hash 60 ticks after the kill with fire released. Never edit these
 * to make the browser pass: a difference is a divergence to report.
 */
const TWIN_KILL_OFFSET = 672;
const TWIN_ENTITIES_AT_KILL = 15;
// The plates the twin's kill releases (DEBRIS_AT_KILL.plates in the Node twin):
// the re-measured debris stream releases none, so no plate model is requested.
const TWIN_PLATES_AT_KILL = 0;
// Follows the Node twin's re-pin in plan 17-05 (D-08): the shooter's shots are
// the NPC fire gate's, so the kill lands earlier and the debris stream moved.
// The forward shield and the bank 360 ticks after the spawn, fire held.
const TWIN_SHIELD_AFTER_SHOOTING = 0.18333333333333332;
const TWIN_ENERGY_AFTER_SHOOTING = 210.13333333333128;
// Follows the Node twin's re-pin in quick task 261117-pij (from "a10b2dfc"):
// the new-game clock start moved and the hash includes the clock. Follows it
// again in quick task 261118-mb5 (from "ca59f800"): the launch applies Oolite's
// launch twist, and the hash includes the orientation.
// Follows it again in plan 17-05 (D-08), from "34393ce1".
const TWIN_HASH_60_AFTER_KILL = "a545cb4b";
/** Ticks after the kill at which the hash is read (the twin's 60). */
const AFTER_KILL_TICKS = 60;
/** Draw calls per rendered frame (docs/PERFORMANCE.md, budget.spec.ts). */
const DRAW_CALL_BUDGET = 50;
/** Loop frames to wait for after a step, so the counters describe a settled scene. */
const SETTLE_FRAMES = 3;

/** One committed debris record (src/content/generated/ships-debris.json). */
interface DebrisRecord {
  readonly key: string;
  readonly glb: string;
  readonly role: string;
}

/** The debris records, read once from the committed catalogue. */
const debrisRecords = JSON.parse(
  readFileSync(
    join(process.cwd(), "src", "content", "generated", "ships-debris.json"),
    "utf8",
  ),
) as readonly DebrisRecord[];

/** The URL path the browser requests for a public asset path. */
function urlPath(asset: string): string {
  return new URL(`/${asset}`, "http://localhost").pathname;
}

/** The pod and plate GLB paths (always released by this kill) and the wreck GLB paths. */
const POD_GLB = urlPath(
  debrisRecords.find((record) => record.role === "pod")?.glb ?? "",
);
const PLATE_GLB = urlPath(
  debrisRecords.find((record) => record.role === "plate")?.glb ?? "",
);
const WRECK_GLBS = debrisRecords
  .filter((record) => record.role === "wreck")
  .map((record) => urlPath(record.glb));
/** The cloud texture of the drawn explosion and Oolite's flash texture. */
const PARTICLE_TEXTURES = [
  urlPath("textures/oolite-particle-cloud2.png"),
  urlPath("textures/oolite-particle-flash.png"),
];
/** Every path the kill may make the page request for the first time. */
const KILL_ASSETS = new Set([
  POD_GLB,
  PLATE_GLB,
  ...WRECK_GLBS,
  ...PARTICLE_TEXTURES,
]);

test.setTimeout(240_000);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

/** Wait until the session loop has run at least `count` more frames. */
async function waitForFrames(page: Page, count: number): Promise<void> {
  const start = await page.evaluate(() => window.__wegolite?.frames ?? 0);
  await page.waitForFunction(
    (target) => (window.__wegolite?.frames ?? 0) >= target,
    start + count,
    { timeout: SLOW },
  );
}

/** The ship contacts on the scanner, read from the probe. */
async function shipContacts(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window.__wegolite?.hud.contacts ?? []).filter(
        (contact) => contact === "ship",
      ).length,
  );
}

/** The simulation tick the probe last published. */
async function simTick(page: Page): Promise<number> {
  return page.evaluate(() => window.__wegolite?.sim?.tick ?? -1);
}

/** The draw calls and triangles of the last rendered frame. */
async function drawCounters(
  page: Page,
): Promise<{ readonly calls: number; readonly triangles: number }> {
  return page.evaluate(() => ({
    calls: window.__wegolite?.calls ?? -1,
    triangles: window.__wegolite?.triangles ?? -1,
  }));
}

/** Step `n` manual ticks, then let a frame publish the probe. */
async function advance(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) => window.__wegolite?.test?.advanceTicks(count),
    n,
  );
  await waitForFrames(page, 2);
}

test("the fire key heats the laser, a test shooter drains the shield and R locks it, and its kill leaves the twin's debris", async ({
  page,
  baseURL,
}) => {
  const errors = collectErrors(page);
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;
  const requested: string[] = [];
  const finished = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin) requested.push(url.pathname);
  });
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin) finished.add(url.pathname);
  });
  expect(WRECK_GLBS, "wreck GLB paths (vacuity guard)").toHaveLength(5);

  await page.goto(COMBAT_URL);
  await waitForReady(page);
  await startNewGame(page);
  await page.waitForFunction(
    () =>
      window.__wegolite?.mode === "docked" &&
      window.__wegolite.sim !== undefined,
    undefined,
    { timeout: SLOW },
  );

  // Launch and fly the scripted exit out, then park the ship so the geometry
  // of the shooter's line stays put.
  await page.click('button[data-action="launch"]');
  await waitForFrames(page, 1);
  await advance(page, 1);
  await advance(page, LAUNCH_TICKS);
  await page.waitForFunction(
    () => window.__wegolite?.mode === "inFlight",
    undefined,
    {
      timeout: SLOW,
    },
  );
  await page.evaluate(() => window.__wegolite?.test?.setSpeed(0));

  // 1. Holding A for 30 ticks fires the fore laser, which is then warm.
  await page.keyboard.down("KeyA");
  await advance(page, 30);
  await page.keyboard.up("KeyA");
  await waitForFrames(page, 1);
  expect(
    await page.evaluate(() => window.__wegolite?.combat?.laserTemp),
    "LT after holding A",
  ).toBeGreaterThan(0);
  // The pulse laser's period is 61 ticks, so after 60 more ticks with the key
  // released the fore laser is ready when the shooter appears.
  await advance(page, 60);

  // 2. A test shooter 1,500 m ahead fires at the player; the forward shield falls.
  //    A is held from the spawn: the shooter fires back through the gate, and
  //    the bank must pay for every shot until the 12th hit destroys it.
  const full = await page.evaluate(() => window.__wegolite?.combat?.fwdShield);
  expect(full, "the shield before the shooter appears").toBe(128);
  await page.keyboard.down("KeyA");
  // The shooter carries 20 cargo capsules (D16-09): `spawnTestShooter(20)`, as
  // in the debris twin. The cargo changes no combat value, so the kill tick and
  // the bank budget stand.
  expect(
    await page.evaluate(
      (cargo) => window.__wegolite?.test?.spawnTestShooter(cargo),
      SHOOTER_CARGO,
    ),
    "the hook spawned the shooter",
  ).toBe(true);
  // The manual clock steps nothing between the last frame and the hook call.
  const spawnTick = await simTick(page);
  expect(spawnTick, "the spawn tick was published").toBeGreaterThan(0);
  const contactsWithShooter = await shipContacts(page);
  await advance(page, SHOOTING_TICKS);
  expect(
    await page.evaluate(() => window.__wegolite?.combat?.fwdShield),
    "forward shield after the shooter's fire",
  ).toBeLessThan(128);
  // The hits' route to the readout (criterion 3, D-04: no first-tick
  // expectation and no gate bypass): the shield and the bank 360 ticks after
  // the spawn are the Node twin's literals. The HUD draws its shield and
  // energy gauges from this same combat state (they are not separate
  // `hud.elements`: tests/e2e/hud.spec.ts pins the element list), so the HUD
  // must be drawing in the same session.
  const readout = await page.evaluate(() => ({
    fwd: window.__wegolite?.combat?.fwdShield,
    aft: window.__wegolite?.combat?.aftShield,
    energy: window.__wegolite?.combat?.energy,
    hudDrawn: window.__wegolite?.hud.drawn,
  }));
  expect(readout.fwd, "the twin's forward shield at spawn + 360").toBeCloseTo(
    TWIN_SHIELD_AFTER_SHOOTING,
    9,
  );
  expect(readout.energy, "the twin's energy bank at spawn + 360").toBeCloseTo(
    TWIN_ENERGY_AFTER_SHOOTING,
    9,
  );
  expect(readout.aft, "the aft shield is never hit from ahead").toBe(128);
  expect(readout.hudDrawn, "the HUD is drawing the gauges").toBe(true);
  expect(
    await page.evaluate(() => window.__wegolite?.test?.tainted),
    "the hook taints the session so nothing is saved",
  ).toBe(true);

  // 3. R engages the ident system and locks the ship in the sights.
  await page.keyboard.press("KeyR");
  await advance(page, 2);
  await page.waitForFunction(
    () =>
      (window.__wegolite?.hud.messageRows ?? []).some((row) =>
        row.startsWith("Ident system locked onto"),
      ),
    undefined,
    { timeout: SLOW },
  );
  expect(
    await page.evaluate(() => window.__wegolite?.combat?.identLocked),
    "an ident lock exists",
  ).toBe(true);

  // 4. The held laser destroys the shooter: it leaves the scanner and the lock
  //    on it ends. Advance in chunks until the ship count is one lower; the
  //    bound only stops the loop (the vacuity guard below fails if it ended on
  //    the bound instead of the kill). The chunks stop one tick short of the
  //    twin's kill tick and then step one tick, so the kill is observed on the
  //    exact tick and fire is released there, as the twin releases it.
  let contacts = contactsWithShooter;
  let ticksSinceSpawn = SHOOTING_TICKS + 2;
  let requestsBeforeKill = -1;
  let beforeKill = { calls: -1, triangles: -1 };
  while (
    contacts >= contactsWithShooter &&
    ticksSinceSpawn < KILL_BOUND_TICKS
  ) {
    const lastBeforeKill = TWIN_KILL_OFFSET - 1;
    const chunk =
      ticksSinceSpawn < lastBeforeKill
        ? Math.min(KILL_CHUNK_TICKS, lastBeforeKill - ticksSinceSpawn)
        : ticksSinceSpawn === lastBeforeKill
          ? 1
          : KILL_CHUNK_TICKS;
    if (ticksSinceSpawn === lastBeforeKill) {
      requestsBeforeKill = requested.length;
      beforeKill = await drawCounters(page);
    }
    await advance(page, chunk);
    ticksSinceSpawn += chunk;
    contacts = await shipContacts(page);
  }
  await page.keyboard.up("KeyA");
  expect(contacts, "the scanner lost exactly the destroyed shooter").toBe(
    contactsWithShooter - 1,
  );
  // Ident stays engaged after a lost lock and re-scans, so another ship in the
  // sights is locked on the same tick; either outcome ends the lock on the
  // destroyed ship.
  await page.waitForFunction(
    () => {
      const rows = window.__wegolite?.hud.messageRows ?? [];
      const locked = window.__wegolite?.combat?.identLocked === true;
      return locked
        ? rows.some((row) => row.startsWith("Ident system locked onto"))
        : rows.includes("Target lost.");
    },
    undefined,
    { timeout: SLOW },
  );

  // 5. The shooter explodes into the twin's debris (plan 16-09, WORLD-17).
  const killTick = await simTick(page);
  expect(killTick - spawnTick, "the kill landed on the twin's tick").toBe(
    TWIN_KILL_OFFSET,
  );
  expect(ticksSinceSpawn, "the spec's own tick count agrees").toBe(
    TWIN_KILL_OFFSET,
  );
  await waitForFrames(page, SETTLE_FRAMES);
  expect(
    await page.evaluate(() => window.__wegolite?.sim?.entities),
    "live entities on the kill tick (the twin's count, debris included)",
  ).toBe(TWIN_ENTITIES_AT_KILL);
  // Lazy: no debris model and no particle texture was requested before the
  // kill; the kill makes the page request them.
  expect(requestsBeforeKill, "the request mark was taken").toBeGreaterThan(0);
  expect(
    requested
      .slice(0, requestsBeforeKill)
      .filter((path) => KILL_ASSETS.has(path)),
    "debris and particle assets requested before the kill",
  ).toEqual([]);

  expect(
    await page.evaluate(
      (n) => window.__wegolite?.test?.advanceTicks(n),
      AFTER_KILL_TICKS,
    ),
    "the tick 60 after the kill",
  ).toBe(killTick + AFTER_KILL_TICKS);
  // The pod models, the plate model when the twin's kill releases one, a wreck
  // model and both particle textures were requested after the kill and
  // arrived; the bound is a correctness bound.
  const drawnAssets = [
    POD_GLB,
    ...(TWIN_PLATES_AT_KILL > 0 ? [PLATE_GLB] : []),
    ...PARTICLE_TEXTURES,
  ];
  await expect
    .poll(() => drawnAssets.filter((path) => !finished.has(path)), {
      timeout: SLOW,
    })
    .toEqual([]);
  await expect
    .poll(() => WRECK_GLBS.some((path) => finished.has(path)), {
      timeout: SLOW,
    })
    .toBe(true);
  await waitForFrames(page, SETTLE_FRAMES * 10);

  // The Node twin has no render layer: the browser hash with the explosion and
  // debris layers drawing equals it, so neither layer touches the world hash.
  expect(
    await page.evaluate(() => window.__wegolite?.test?.worldHash()),
    "worldHash() 60 ticks after the kill equals the debris twin's literal",
  ).toBe(TWIN_HASH_60_AFTER_KILL);
  const afterKill = await drawCounters(page);
  test.info().annotations.push(
    {
      type: "combat-before-kill",
      description: `${beforeKill.calls} calls, ${beforeKill.triangles} triangles`,
    },
    {
      type: "combat-after-kill",
      description: `${afterKill.calls} calls, ${afterKill.triangles} triangles (debris and explosion live, kill + ${AFTER_KILL_TICKS} ticks)`,
    },
  );
  expect(afterKill.calls, "draw calls after the kill").toBeGreaterThan(0);
  expect(
    afterKill.calls,
    "draw-call budget after the kill",
  ).toBeLessThanOrEqual(DRAW_CALL_BUDGET);

  expect(errors).toEqual([]);
});
