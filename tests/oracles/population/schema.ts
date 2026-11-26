// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The population oracle fixture contract (Phase 22, plan 22-01) as executable
 * zod schemas.
 *
 * Every fixture under `tests/oracles/population/fixtures/` is recorded, never
 * written by hand: `tools/ai-harness/populator-record.ts` runs Oolite's own
 * `Resources/Scripts/oolite-populator.js` (pin 7437f22) unmodified in
 * `node:vm` against a stub host and writes what the script did. This file is
 * the only shape a fixture may have. It imports `zod` and nothing else: the
 * oracle tree never reads Wegolite code (`tests/guards/oracle-independence`).
 *
 * Conventions fixed here so the recorder, the self-test and every later port
 * test agree:
 *
 * - A draw is a u32 integer; the value the script or engine model saw is
 *   `u / 2^32`, in [0, 1). Engine draws that Oolite takes from its own
 *   `Ranrot()` (`Ranrot() % 11`, `Ranrot() & 3`) are the same u32 reduced the
 *   way the engine reduces them (`u % 11`, `u & 3`). Every draw carries a tag
 *   from {@link POPULATION_DRAW_TAGS}: the site that took it.
 * - `draws` of a group list the draws of that group per tag, in the order they
 *   were taken. The port gives each site its own stream and replays the
 *   recorded draws of that site, so the interleaving between tags is not part
 *   of the contract.
 * - Entries are listed in registration order; `engineOrder` is the order the
 *   engine runs them (a stable sort by priority, equal priorities in insertion
 *   order, `Universe.m:9990-10001`, assumption A5). `groups` follow the engine
 *   order.
 * - Ship facts the script writes are stored as the engine stores them: accuracy
 *   as a float32 value, fuel in tenths of a light year (`lround(clamp(v, 0, 7)
 *   * 10)`), weapons as equipment keys (`EQ_WEAPON_NONE` for none), bounty as a
 *   non-negative integer.
 * - A write marked `cut: true` is recorded for completeness but is a path the
 *   port deliberately does not model (missiles, AI switches, equipment other
 *   than the fuel injector, heat insulation, escort capacity).
 */

import { z } from "zod";

/** The pinned Oolite commit every fixture is recorded at. */
export const POPULATION_OOLITE_PIN = "7437f22";

/** The pinned `oolite-populator.js`: `sha256sum` of the file at the pin. */
export const POPULATION_SCRIPT_SHA256 =
  "96a734a6cfc1ee39a7db7798716101640887e58d5fe947e56e2fcc4946e04df4";

/** The one script path, relative to the Oolite tree. */
export const POPULATION_SCRIPT_FILE = "Resources/Scripts/oolite-populator.js";

/**
 * The closed list of draw sites. `count` is a `randomise` draw of an entry; the
 * `body` tag is the script's own `Math.random()` inside a builder; `system`,
 * `weapons`, `skill` and `missiles` are the script helpers `_nearby*System` and
 * `_weightedNearbyTradeSystem`, `_setWeapons` and `_setEscortWeapons`,
 * `_setSkill`, and `_setMissiles`; `setup` is a draw taken before the first
 * counted entry (the two assassin draws, `oolite-populator.js:595-601`); the
 * rest are engine draws the stub models:
 *
 * - `pick`: the weighted record pick (`OOProbabilitySet`),
 * - `escort`: `Ranrot()` draws of the escort set-up and the trader escort
 *   removal,
 * - `accuracy`: the initial `randf() * 10 - 5`,
 * - `injector`: the `has_fuel_injection` roll,
 * - `cargo`: the trader's random initial cargo flag and the cargo count of
 *   `setCargoFlag`,
 * - `scatter`: the position draws of a group location and of an escort,
 * - `orient`: reserved for the orientation draws; the plan 22-01 stub does not
 *   take any (positions and orientations are not compared),
 * - `bounty`: the `20 + randf() * 50` bounty `newShipWithRole` gives a `pirate`
 *   role ship, which the script overwrites with `setBounty`.
 */
export const POPULATION_DRAW_TAGS = [
  "count",
  "setup",
  "body",
  "system",
  "weapons",
  "skill",
  "missiles",
  "pick",
  "escort",
  "accuracy",
  "injector",
  "cargo",
  "scatter",
  "orient",
  "bounty",
] as const;
export type PopulationDrawTag = (typeof POPULATION_DRAW_TAGS)[number];

/** The sites the port replays exactly. */
export const POPULATION_EXACT_DRAW_TAGS = [
  "count",
  "body",
  "system",
  "weapons",
  "skill",
  "pick",
  "escort",
  "accuracy",
  "injector",
] as const satisfies readonly PopulationDrawTag[];

/** The sites that are cut or not stream-compared. */
export const POPULATION_UNCOMPARED_DRAW_TAGS = [
  "setup",
  "missiles",
  "cargo",
  "scatter",
  "orient",
  "bounty",
] as const satisfies readonly PopulationDrawTag[];

/**
 * Every `system.setPopulator` name the script registers, in registration
 * order (`oolite-populator.js:111-986`). Registration order is the tie-break of
 * the engine's stable priority sort.
 */
export const POPULATION_ENTRY_NAMES = [
  "oolite-nav-buoy",
  "oolite-witch-buoy",
  "oolite-route1-asteroids",
  "oolite-route2-asteroids",
  "oolite-offlane-hermit",
  "oolite-freighters",
  "oolite-freighters-docking",
  "oolite-couriers-route1",
  "oolite-couriers-route3",
  "oolite-smugglers",
  "oolite-hunters-triangle",
  "oolite-hunters-route1",
  "oolite-hunters-medium-route1",
  "oolite-hunters-medium-route3",
  "oolite-hunters-heavy-route1",
  "oolite-hunters-heavy-route3",
  "oolite-pirate-independent-route1",
  "oolite-pirate-independent-route2",
  "oolite-pirate-independent-route3",
  "oolite-pirate-light-route1",
  "oolite-pirate-light-triangle",
  "oolite-pirate-light-remote",
  "oolite-pirate-medium-route1",
  "oolite-pirate-medium-triangle",
  "oolite-pirate-medium-remote",
  "oolite-pirate-heavy-route1",
  "oolite-pirate-heavy-triangle",
  "oolite-pirate-heavy-remote",
  "oolite-assassins",
  "oolite-police-route1",
  "oolite-police-triangle",
  "oolite-police-stationpatrol",
  "oolite-interceptors-route1",
  "oolite-interceptors-witchpoint",
  "oolite-thargoid-scouts",
  "oolite-thargoid-strike",
] as const;
export type PopulationEntryName = (typeof POPULATION_ENTRY_NAMES)[number];

/** The cargo kinds a ship ends with (`entity.ts` `CARGO_KINDS` spelling). */
export const POPULATION_CARGO_KINDS = [
  "unset",
  "plentiful",
  "scarce",
  "medical",
  "contraband",
  "pirate",
] as const;

/** A draw: an integer in [0, 2^32). */
const U32 = z.number().int().min(0).max(4294967295);
const NonNegativeInt = z.number().int().min(0);

/** The draws of one site list, per tag, in the order taken. */
export const DrawsSchema = z.partialRecord(
  z.enum(POPULATION_DRAW_TAGS),
  z.array(U32),
);

const WriteValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

/** One script-visible write or call on a ship, in the order it happened. */
export const ShipWriteSchema = z.strictObject({
  member: z.string().min(1),
  value: WriteValueSchema,
  cut: z.literal(true).optional(),
});

export const ShipSchema = z.strictObject({
  /** Creation order within the group: a leader is followed by its escorts. */
  index: NonNegativeInt,
  /** The catalogue record key the weighted pick chose. */
  key: z.string().min(1),
  /** The role the ship was added with. */
  role: z.string().min(1),
  /** The primary role at the end of the callback. */
  primaryRole: z.string().min(1),
  bounty: NonNegativeInt,
  cargoKind: z.enum(POPULATION_CARGO_KINDS),
  cargoCount: NonNegativeInt,
  forwardWeapon: z.string().min(1),
  aftWeapon: z.string().min(1),
  /** float32 value of the accuracy property. */
  accuracy: z.number(),
  /** Tenths of a light year. */
  fuel: NonNegativeInt,
  homeSystem: NonNegativeInt,
  destinationSystem: NonNegativeInt,
  /** The `has_fuel_injection` roll, or an `EQ_FUEL_INJECTION` award. */
  injector: z.boolean(),
  /** Index into the group's `shipGroups`, `"station"`, or null. */
  group: z.union([NonNegativeInt, z.literal("station"), z.null()]),
  /** Leader of the ship's `shipGroups` entry, when it has one. */
  leader: NonNegativeInt.nullable(),
  /** The escort's mother ship, or null for every other ship. */
  owner: NonNegativeInt.nullable(),
  /** The escort's formation slot (0 to 15), or null. */
  escortSlot: z.number().int().min(0).max(15).nullable(),
  /** Equipment keys the script awarded and did not remove, sorted. */
  equipment: z.array(z.string()),
  /** Every write and call the script made on the ship. */
  writes: z.array(ShipWriteSchema),
});

export const ShipGroupSchema = z.strictObject({
  name: z.string(),
  leader: NonNegativeInt.nullable(),
  members: z.array(NonNegativeInt),
});

export const EngineCallSchema = z.strictObject({
  fn: z.enum(["addShips", "addGroup"]),
  role: z.string().min(1),
  count: z.number().int().min(1).max(64),
  spread: z.number(),
  /** Indices of the ships the call returned (escorts are not in the list). */
  ships: z.array(NonNegativeInt),
});

export const GroupSchema = z.strictObject({
  /** Ordinal of the entry in registration order. */
  entry: NonNegativeInt,
  /** Group number within the entry. */
  index: NonNegativeInt,
  location: z.string().min(1),
  /** `pos.z` the callback was given, and `pos.z` after it ran. */
  posInZ: z.number(),
  posOutZ: z.number(),
  draws: DrawsSchema,
  calls: z.array(EngineCallSchema),
  ships: z.array(ShipSchema),
  shipGroups: z.array(ShipGroupSchema),
});

export const EntrySchema = z.strictObject({
  ordinal: NonNegativeInt,
  name: z.enum(POPULATION_ENTRY_NAMES),
  priority: z.number(),
  location: z.string().min(1),
  /** The `groupCount` the script registered, or null when it has none. */
  groupCount: NonNegativeInt.nullable(),
  /** The engine's group count: `groupCount`, else 1 (`Universe.m:1727`). */
  count: NonNegativeInt,
  /** Whether the `groupCount` came from `randomise` (three `count` draws). */
  counted: z.boolean(),
  /** A path the port does not model: its callbacks were not run. */
  cut: z.boolean(),
  countDraws: z.array(U32),
  setupDraws: z.array(U32),
});

export const NeighbourSchema = z.strictObject({
  id: NonNegativeInt,
  government: NonNegativeInt,
  economy: NonNegativeInt,
  techLevel: NonNegativeInt,
  /** Ids within range of this neighbour (7 LY for locals, 3.5 for very local). */
  seconds: z.array(NonNegativeInt),
});

export const InputsSchema = z.strictObject({
  name: z.string().min(1),
  government: NonNegativeInt,
  economy: NonNegativeInt,
  techLevel: NonNegativeInt,
  /** l1 = |planet|, l2 = |planet - sun|, l3 = |sun| in metres. */
  laneLengths: z.strictObject({
    l1: z.number(),
    l2: z.number(),
    l3: z.number(),
  }),
  locals: z.array(NeighbourSchema),
  verylocals: z.array(NeighbourSchema),
  within25: z.array(NonNegativeInt),
  bottleneck: z.boolean(),
});

export const ShipFactSchema = z.strictObject({
  key: z.string().min(1),
  hyperspaceMotor: z.boolean(),
  /** The authored accuracy, or null when the record rolls one at spawn. */
  accuracy: z.number().nullable(),
});

export const HeaderSchema = z.strictObject({
  oolitePin: z.literal(POPULATION_OOLITE_PIN),
  scriptFile: z.literal(POPULATION_SCRIPT_FILE),
  scriptSha256: z.literal(POPULATION_SCRIPT_SHA256),
  system: z.string().regex(/^g[0-7]-s\d+$/),
  galaxy: z.number().int().min(0).max(7),
  systemIndex: z.number().int().min(0).max(255),
  seed: NonNegativeInt,
  startUp: z.strictObject({
    medicalPattern: z.string().min(1),
    medicalFlags: z.string(),
    weaponLevelBias: z.number(),
    skillLevelBias: z.number(),
    skillLevelMaximum: z.number(),
  }),
});

export const InventorySchema = z.strictObject({
  /** Host members the script read that the stub did not answer. */
  missing: z.array(z.string()),
  /** Host members answered by a stub default because only a cut path reads them. */
  cutReads: z.array(z.string()),
});

export const PopulationFixtureSchema = z.strictObject({
  header: HeaderSchema,
  inputs: InputsSchema,
  entries: z.array(EntrySchema),
  engineOrder: z.array(NonNegativeInt),
  groups: z.array(GroupSchema),
  shipFacts: z.array(ShipFactSchema),
  inventory: InventorySchema,
});

export type PopulationFixture = z.infer<typeof PopulationFixtureSchema>;
export type PopulationGroup = z.infer<typeof GroupSchema>;
export type PopulationShip = z.infer<typeof ShipSchema>;
export type PopulationShipWrite = z.infer<typeof ShipWriteSchema>;
export type PopulationShipGroup = z.infer<typeof ShipGroupSchema>;
export type PopulationEngineCall = z.infer<typeof EngineCallSchema>;
export type PopulationEntry = z.infer<typeof EntrySchema>;
export type PopulationNeighbour = z.infer<typeof NeighbourSchema>;
export type PopulationDraws = z.infer<typeof DrawsSchema>;

// ---------------------------------------------------------------------------
// Plan 22-02: the widened oracle. Three more recorded files sit next to the
// per-(system, seed) fixtures: the all-2,048 neighbourhood table, the
// boundary-draw cases and the per-key ship facts. Each is strict and each is
// recorded by `tools/ai-harness/populator-record.ts --all`, never edited.
// ---------------------------------------------------------------------------

/** Systems per galaxy and galaxies in the universe the table covers. */
export const POPULATION_GALAXIES = 8;
export const POPULATION_SYSTEMS_PER_GALAXY = 256;

/** The header every widened file carries (the same pin as the fixtures). */
export const WidenedHeaderSchema = z.strictObject({
  oolitePin: z.literal(POPULATION_OOLITE_PIN),
  scriptFile: z.literal(POPULATION_SCRIPT_FILE),
  scriptSha256: z.literal(POPULATION_SCRIPT_SHA256),
});

const SystemIdList = z.array(z.number().int().min(0).max(255));

/** True when the ids ascend strictly (system-id order, no duplicates). */
function ascendingIds(ids: readonly number[]): boolean {
  return ids.every((id, at) => at === 0 || id > (ids[at - 1] ?? -1));
}

/**
 * One galaxy of the neighbourhood table, column by column (index = system id):
 * the ids within 7 LY and within 3.5 LY in system-id order, the count within
 * 25 LY, and the ids of the bottleneck systems (the script's own
 * `_systemIsBottleneck(locals, seconds)` value).
 */
export const NeighbourhoodGalaxySchema = z
  .strictObject({
    galaxy: z
      .number()
      .int()
      .min(0)
      .max(POPULATION_GALAXIES - 1),
    locals: z.array(SystemIdList).length(POPULATION_SYSTEMS_PER_GALAXY),
    verylocals: z.array(SystemIdList).length(POPULATION_SYSTEMS_PER_GALAXY),
    within25: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(POPULATION_SYSTEMS_PER_GALAXY - 1),
      )
      .length(POPULATION_SYSTEMS_PER_GALAXY),
    bottleneck: SystemIdList,
  })
  .superRefine((galaxy, context) => {
    const lists: readonly (readonly number[])[] = [
      ...galaxy.locals,
      ...galaxy.verylocals,
      galaxy.bottleneck,
    ];
    if (!lists.every(ascendingIds)) {
      context.addIssue({
        code: "custom",
        message: "ids must ascend in system-id order",
      });
    }
    galaxy.verylocals.forEach((very, at) => {
      const locals = galaxy.locals[at] ?? [];
      if (!very.every((id) => locals.includes(id))) {
        context.addIssue({
          code: "custom",
          message: `system ${String(at)}: a 3.5 LY neighbour is not a 7 LY neighbour`,
        });
      }
      if (locals.includes(at) || very.includes(at)) {
        context.addIssue({
          code: "custom",
          message: `system ${String(at)} lists itself`,
        });
      }
    });
  });

export const NeighbourhoodTableSchema = z.strictObject({
  header: WidenedHeaderSchema,
  /** `systemsInRange` ranges in light years (`oolite-populator.js:2477-2611`). */
  ranges: z.strictObject({
    local: z.literal(7),
    veryLocal: z.literal(3.5),
    far: z.literal(25),
  }),
  galaxies: z
    .array(NeighbourhoodGalaxySchema)
    .length(POPULATION_GALAXIES)
    .refine(
      (galaxies) => galaxies.every((galaxy, at) => galaxy.galaxy === at),
      {
        message: "galaxies must be listed in order 0 to 7",
      },
    ),
});

export type NeighbourhoodTable = z.infer<typeof NeighbourhoodTableSchema>;

/** A value an edge-draw probe observed. */
export const EdgeResultSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  z.array(z.number()),
]);

/**
 * One boundary probe: the crafted doubles fed to the case's draw slots (the
 * listed `slots`, in order; every other script draw is the case's `fixedDraw`)
 * and what Oolite's script produced.
 */
export const EdgeProbeSchema = z.strictObject({
  draws: z.array(z.number().min(0).lt(1)),
  result: EdgeResultSchema,
});

/** Where in the script a crafted draw lands: the nth call on a source line. */
export const EdgeSlotSchema = z.strictObject({
  label: z.string().min(1),
  line: z.number().int().min(1),
  occurrence: NonNegativeInt,
});

export const EdgeCaseSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    /** `file:line` of the comparison the case probes. */
    site: z.string().min(1),
    /** The comparison in words, and what `result` is. */
    boundary: z.string().min(1),
    observes: z.string().min(1),
    /** The (system, seed) the script ran for, and the entry run, if any. */
    system: z.string().regex(/^g[0-7]-s\d+$/),
    seed: NonNegativeInt,
    entry: z.enum(POPULATION_ENTRY_NAMES).nullable(),
    /** Facts the case needs besides the draws (for example the pre-draw count). */
    inputs: z.record(z.string(), z.union([z.number(), z.string()])),
    /** Every script draw not named by a slot takes this value. */
    fixedDraw: z.number().min(0).lt(1),
    slots: z.array(EdgeSlotSchema).min(1),
    probes: z.array(EdgeProbeSchema).min(2),
  })
  .superRefine((edge, context) => {
    edge.probes.forEach((probe, at) => {
      if (probe.draws.length !== edge.slots.length) {
        context.addIssue({
          code: "custom",
          message: `probe ${String(at)} has ${String(probe.draws.length)} draws for ${String(edge.slots.length)} slots`,
        });
      }
    });
  });

/** A boundary the script cannot reach, kept as a recorded answer. */
export const EdgeUnreachableSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  site: z.string().min(1),
  boundary: z.string().min(1),
  reason: z.string().min(1),
});

export const EdgeDrawsSchema = z.strictObject({
  header: WidenedHeaderSchema,
  cases: z.array(EdgeCaseSchema).min(1),
  unreachable: z.array(EdgeUnreachableSchema),
});

export type EdgeDraws = z.infer<typeof EdgeDrawsSchema>;
export type EdgeCase = z.infer<typeof EdgeCaseSchema>;

/**
 * Per catalogue key, the ship facts `shipdata.plist` carries that
 * `ships-npc.json` does not (plan 22-05 compiles them): `hyperspace_motor`
 * (default YES, `ShipEntity.m:382`), an authored `accuracy` (else the engine
 * rolls one at spawn) and `cargo_carried`, resolved through `like_ship`.
 */
export const ShipFactRowSchema = z.strictObject({
  key: z.string().min(1),
  hasHyperspaceMotor: z.boolean(),
  accuracy: z.number().nullable(),
  cargoCarried: z.string().nullable(),
});

export const ShipFactsSchema = z
  .strictObject({
    header: WidenedHeaderSchema,
    ships: z.array(ShipFactRowSchema).min(1),
  })
  .superRefine((facts, context) => {
    const keys = facts.ships.map((ship) => ship.key);
    const sorted = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (
      keys.join("\n") !== sorted.join("\n") ||
      new Set(keys).size !== keys.length
    ) {
      context.addIssue({
        code: "custom",
        message: "ship fact keys must be unique and in code-unit order",
      });
    }
  });

export type ShipFacts = z.infer<typeof ShipFactsSchema>;
