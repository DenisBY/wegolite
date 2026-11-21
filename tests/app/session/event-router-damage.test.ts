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
  CARGO_DESTROYED_TEMPLATE,
  EQUIPMENT_DAMAGED_TEMPLATE,
  EVENT_KIND_SUBSCRIBER,
  createDamageFlow,
  createEventRouter,
  createHudMessages,
  formatDamageMessage,
} from "../../../src/app/session/event-router.js";
import { CommoditySchema } from "../../../src/content/schemas/commodity.js";
import { EquipmentSchema } from "../../../src/content/schemas/equipment.js";
import { setCargo } from "../../../src/sim/economy/cargo.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { newProfile } from "../../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../../src/sim/player/profile.js";
import { withoutComments } from "../../guards/source-scan.js";
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

/** A hold with `gold` units of gold (a null-prototype map, as the sim builds). */
function holding(gold: number): PlayerProfile {
  const base = newProfile();
  return { ...base, cargo: setCargo(base.cargo, "gold", gold) };
}

describe("the damage subscriber: cargoDestroyed", () => {
  it("commits once and prints the commodity name for 4.5 s after one clearPrevious", () => {
    const { ctx, log, commits, router } = harness(holding(2700));
    router.dispatch({
      kind: "cargoDestroyed",
      commodity: "gold",
      amount: 1000,
    });
    expect(commits).toHaveLength(1);
    expect(ctx.core.profile.cargo.gold).toBe(1700);
    expect(log).toEqual(["clearPrevious", "enqueue Gold destroyed. for 4.5"]);
  });

  it("prints nothing when no such goods are held", () => {
    const { ctx, log, commits, router } = harness(newProfile());
    const before = ctx.core.profile;
    router.dispatch({ kind: "cargoDestroyed", commodity: "gold", amount: 1 });
    expect(commits).toEqual([]);
    expect(ctx.core.profile).toBe(before);
    expect(log).toEqual([]);
  });

  it("prints nothing when more is destroyed than is held", () => {
    const { ctx, log, commits, router } = harness(holding(999));
    const before = ctx.core.profile;
    router.dispatch({
      kind: "cargoDestroyed",
      commodity: "gold",
      amount: 1000,
    });
    expect(commits).toEqual([]);
    expect(ctx.core.profile).toBe(before);
    expect(ctx.core.profile.cargo.gold).toBe(999);
    expect(log).toEqual([]);
  });

  it("falls back to the key for an unknown name, never an empty string", () => {
    const { ctx, log, router } = harness(fitted(DOCK_COMP));
    ctx.core.equipmentCatalogue = [];
    router.dispatch(DOCK_DAMAGED);
    expect(log).toEqual([
      "clearPrevious",
      `enqueue ${DOCK_COMP} damaged. for 4.5`,
    ]);
    const held = harness(holding(5));
    held.ctx.core.commodities = [];
    held.router.dispatch({
      kind: "cargoDestroyed",
      commodity: "gold",
      amount: 5,
    });
    expect(held.log).toEqual([
      "clearPrevious",
      "enqueue gold destroyed. for 4.5",
    ]);
  });
});

describe("the damage message templates", () => {
  const plist = readFileSync(
    "third_party/oolite/Config/descriptions.plist",
    "utf8",
  );
  const plistValue = (key: string): string => {
    const match = new RegExp(`"${key}"\\s*=\\s*"([^"]*)";`).exec(plist);
    if (match?.[1] === undefined) throw new Error(`${key} not in the plist`);
    return match[1];
  };

  it("equal the vendored descriptions.plist values", () => {
    expect(EQUIPMENT_DAMAGED_TEMPLATE).toBe(plistValue("@-damaged"));
    expect(CARGO_DESTROYED_TEMPLATE).toBe(plistValue("@-destroyed"));
  });

  it("fill the name into the template", () => {
    expect(
      formatDamageMessage(EQUIPMENT_DAMAGED_TEMPLATE, "Docking Computers"),
    ).toBe("Docking Computers damaged.");
    expect(formatDamageMessage(CARGO_DESTROYED_TEMPLATE, "Gold")).toBe(
      "Gold destroyed.",
    );
  });
});

describe("the damage subscriber source (D-11, T-19-17)", () => {
  const source = withoutComments(
    readFileSync("src/app/session/event-router.ts", "utf8"),
  );

  /** The brace-balanced body of `function name(`. */
  function body(name: string): string {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`function ${name} not found`);
    const open = source.indexOf("{", source.indexOf(")", start));
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(open, index + 1);
      }
    }
    throw new Error(`function ${name} has no closing brace`);
  }

  it("createDamageFlow writes no save", () => {
    expect(body("createDamageFlow")).not.toMatch(/autosave/i);
  });

  it("createHudMessages has no damage arm", () => {
    const hud = body("createHudMessages");
    expect(hud).not.toContain("equipmentDamaged");
    expect(hud).not.toContain("cargoDestroyed");
  });
});
