// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The `spawnFlyers` step of the Node tick replay (plan 14-18, WORLD-07): the
 * replay half of the `?test=1` hook `spawnTestFlyers`, which a browser spec
 * compares against the real session hash for hash. Node only.
 */

import { describe, expect, it } from "vitest";

import { spawnTestFlyers } from "../../../src/sim/ai/test-spawn.js";
import type { Command } from "../../../src/sim/commands.js";
import { laveFixture } from "../../helpers/lave.js";
import { flyerRecords } from "../../helpers/flyer-records.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { runTickScript } from "../../helpers/tick-script.js";
import type { TickStep } from "../../helpers/tick-script.js";

const { layout } = laveFixture();
const launch: Command = { kind: "launch" };

/** The launch-and-fly prefix of the browser smoke: a launch, then 600 ticks. */
const LAUNCHED: readonly TickStep[] = [
  { commands: [launch], ticks: 1 },
  { commands: [], ticks: 600 },
];

/**
 * The ships the Node replay's Lave launch world holds before the flyers join.
 * Re-pinned once in plan 22-13 (WORLD-08, owner-sanctioned under the Phase 21
 * D-04 standing approval) from 12 to 28: the replay populates through the
 * system populator (`createSystemPopulate`), whose Lave world at epoch 1 holds
 * the 28 ships the census golden records (`population-census.json`, digest
 * `g0-s7`, first token), where it used the 12-ship inert table. The flyers
 * still take the ids and the slots after the populated ships.
 */
const POPULATED = 28;

describe("the spawnFlyers replay step", () => {
  it("spawns the Shuttle, the Viper and the Adder after the populated ships, before the step's ticks", () => {
    const spawned = runTickScript(
      [...LAUNCHED, { commands: [], ticks: 0, spawnFlyers: true }],
      { traffic: true },
    );
    const world = spawned.world;
    if (world === undefined) throw new Error("no world");

    expect(world.store.live).toHaveLength(POPULATED + 3);
    expect(
      world.store.live.slice(POPULATED).map((entity) => entity.specKey),
    ).toEqual(["shuttle", "viper", "adder"]);
    expect(
      world.store.live
        .slice(POPULATED)
        .map((entity) => entity.ai?.params["script"]),
    ).toEqual(["station", "intercept", "flee"]);
    // Spawned at the tick the step starts on, with no tick run since.
    expect(spawned.state.tick).toBe(601);
    expect(
      world.store.live.slice(POPULATED).map((entity) => entity.speed),
    ).toEqual(
      ["shuttle", "viper", "adder"].map(
        (key) =>
          realNpcFlightTable().find((row) => row.specKey === key)
            ?.maxFlightSpeed,
      ),
    );
  });

  it("is the same call the hook makes: an explicit spawn on the same state gives the same flyers", () => {
    const viaStep = runTickScript(
      [...LAUNCHED, { commands: [], ticks: 0, spawnFlyers: true }],
      { traffic: true },
    );
    const without = runTickScript(LAUNCHED, { traffic: true });
    const world = without.world;
    if (world === undefined) throw new Error("no world");
    const ok = spawnTestFlyers(
      world,
      without.state,
      flyerRecords(),
      realNpcFlightTable(),
      without.state.tick,
      layout.station.position,
    );
    expect(ok).toBe(true);

    const mine = world.store.live.slice(POPULATED);
    const theirs = (viaStep.world?.store.live ?? []).slice(POPULATED);
    expect(mine).toHaveLength(3);
    expect(
      mine.map((e) => [e.specKey, e.position, e.orientation, e.speed]),
    ).toEqual(
      theirs.map((e) => [e.specKey, e.position, e.orientation, e.speed]),
    );
  });

  it("changes the hash and keeps replaying deterministically through the flyers' flight", () => {
    const plain = runTickScript([...LAUNCHED, { commands: [], ticks: 300 }], {
      traffic: true,
    });
    const script: readonly TickStep[] = [
      ...LAUNCHED,
      { commands: [], ticks: 300, spawnFlyers: true },
    ];
    const first = runTickScript(script, { traffic: true });
    const again = runTickScript(script, { traffic: true });

    expect(first.hash).toBe(again.hash);
    expect(first.hash).not.toBe(plain.hash);
    // One spawn then 300 ticks equals the spawn step with no ticks followed by
    // the ticks as two calls, as the hook is called between two advanceTicks.
    const split = runTickScript(
      [
        ...LAUNCHED,
        { commands: [], ticks: 0, spawnFlyers: true },
        { commands: [], ticks: 1 },
        { commands: [], ticks: 299 },
      ],
      { traffic: true },
    );
    expect(split.hash).toBe(first.hash);
  });

  it("throws rather than hash a script that spawned nothing", () => {
    // Traffic off: no content, no records.
    expect(() =>
      runTickScript(
        [...LAUNCHED, { commands: [], ticks: 0, spawnFlyers: true }],
        {},
      ),
    ).toThrow(/spawnFlyers/);
    // Docked: the hook works only in flight.
    expect(() =>
      runTickScript([{ commands: [], ticks: 0, spawnFlyers: true }], {
        traffic: true,
      }),
    ).toThrow(/spawnFlyers/);
  });
});
