// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The damage subscriber (Phase 19, plan 19-10; D-01, D-04, D-07, D-11;
 * CBT-08, CBT-12; threat T-19-17).
 *
 * `equipmentDamaged` and `cargoDestroyed` are routed to `damageFlow` alone. It
 * runs the pure profile operation, commits it once through `commitProfile`, and
 * prints Oolite's message only when that commit took effect, so a refused,
 * repeated or stale event prints nothing.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import {
  EVENT_KIND_SUBSCRIBER,
  createDamageFlow,
  createEventRouter,
  createHudMessages,
} from "../../../src/app/session/event-router.js";
import { CommoditySchema } from "../../../src/content/schemas/commodity.js";
import { EquipmentSchema } from "../../../src/content/schemas/equipment.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { newProfile } from "../../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../../src/sim/player/profile.js";
import { laveFixture } from "../../helpers/lave.js";

const lave = laveFixture();

const DOCK_COMP = "EQ_DOCK_COMP";

const EQUIPMENT = EquipmentSchema.array().parse(
  JSON.parse(readFileSync("src/content/generated/equipment.json", "utf8")),
);
const COMMODITIES = CommoditySchema.array().parse(
  JSON.parse(readFileSync("src/content/generated/commodities.json", "utf8")),
);

/** A router whose damage subscriber is real, over recording doubles. */
function harness(profile: PlayerProfile) {
  const ctx: SessionState = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  ctx.core.state = initFlightState(lave.layout);
  ctx.core.profile = profile;
  ctx.core.equipmentCatalogue = EQUIPMENT;
  ctx.core.commodities = COMMODITIES;
  const log: string[] = [];
  const commits: PlayerProfile[] = [];
  // The station controller's `commitProfile`: an identity check, then replace.
  const commitProfile = (next: PlayerProfile): boolean => {
    if (next === ctx.core.profile) return false;
    ctx.core.profile = next;
    commits.push(next);
    return true;
  };
  const messages = {
    enqueue: (text: string, seconds: number) => {
      log.push(`enqueue ${text} for ${String(seconds)}`);
    },
    clearPrevious: () => {
      log.push("clearPrevious");
    },
  };
  const router = createEventRouter(ctx, {
    stationFlow: () => undefined,
    damageFlow: createDamageFlow(ctx, { commitProfile, messages }),
    hudMessages: createHudMessages({ messages }, ctx),
    dockFeedback: () => undefined,
    hyperspaceFlow: () => undefined,
  });
  return { ctx, log, commits, router };
}

function fitted(...equipment: string[]): PlayerProfile {
  return { ...newProfile(), equipment };
}

const DOCK_DAMAGED: SimEvent = { kind: "equipmentDamaged", key: DOCK_COMP };

describe("the damage subscriber: equipmentDamaged", () => {
  it("routes both damage kinds to damageFlow alone", () => {
    expect(EVENT_KIND_SUBSCRIBER.equipmentDamaged).toEqual(["damageFlow"]);
    expect(EVENT_KIND_SUBSCRIBER.cargoDestroyed).toEqual(["damageFlow"]);
  });

  it("commits once and prints the catalogue name for 4.5 s after one clearPrevious", () => {
    const { ctx, log, commits, router } = harness(fitted(DOCK_COMP));
    router.dispatch(DOCK_DAMAGED);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.damagedEquipment).toEqual([DOCK_COMP]);
    expect(ctx.core.profile.equipment).toEqual([]);
    expect(log).toEqual([
      "clearPrevious",
      "enqueue Docking Computers damaged. for 4.5",
    ]);
  });

  it("commits nothing and prints nothing for a repeated event", () => {
    const { log, commits, router } = harness(fitted(DOCK_COMP));
    router.dispatch(DOCK_DAMAGED);
    router.dispatch(DOCK_DAMAGED);
    expect(commits).toHaveLength(1);
    expect(log).toHaveLength(2);
  });

  it("commits nothing and prints nothing for a key that is not installed", () => {
    const { ctx, log, commits, router } = harness(fitted());
    const before = ctx.core.profile;
    router.dispatch(DOCK_DAMAGED);
    expect(commits).toEqual([]);
    expect(ctx.core.profile).toBe(before);
    expect(log).toEqual([]);
  });
});
