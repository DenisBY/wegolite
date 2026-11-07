// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The versioned save blob (D-13, D-14, D-15, T-04-24…T-04-27).
 *
 * A save is a plain JSON string in IndexedDB, exactly like the settings blob is
 * a plain JSON string in `localStorage`: one `JSON.parse` and one strict schema,
 * no structured-clone object and no object merge. `version` is a literal, so a
 * blob from a future build is recognised *before* the schema runs and is then
 * left untouched — the same rule `src/settings/store.ts` applies to newer
 * settings versions.
 *
 * Three separate resource bounds run in this order, and the order is the
 * contract (T-04-27/T-04-49):
 *
 * 1. `MAX_SAVE_CHARS` is checked before `JSON.parse`, so boot never parses an
 *    unbounded string. A bounded prefix sniff still recognises an oversized
 *    newer-version blob before any destructive classification;
 * 2. the strict schema caps every field;
 * 3. the allow-lists reject an equipment key, system id or station key this
 *    build does not know, so a forged value can never reach `findShip` or the
 *    equipment catalogue.
 *
 * An oversized, unparseable or unrecognised blob is `unreadable`, never
 * `corrupt`: only a provably v1/v2-shaped-but-invalid blob may be backed up and
 * cleared by New game (T-04-47).
 *
 * The save carries no docked pose, no timestamp and no host data: a docked pose
 * is derived from the layout on restore. A v2 in-flight save additionally
 * carries the sanitized flight pose and the market snapshot (D-13).
 */

import { z } from "zod";

import type { CommodityUnit } from "../content/types.js";
import {
  capacityPodsFor,
  emptyCargo,
  holdPodsUsed,
} from "../sim/economy/cargo.js";
import { MARKET_LIMIT, marketSeedForSystem } from "../sim/economy/market.js";
import type { Market } from "../sim/economy/market.js";
import { CLOCK_START } from "../sim/flight/state.js";

/** The schema version this build writes and accepts (D-13). */
export const SAVE_VERSION = 2 as const;

/**
 * The largest raw blob the parser will even attempt to parse (D-15, T-06-04).
 *
 * This is a true upper bound on what `encodeSave` can produce, including
 * worst-case JSON escaping. The v2 worst case is:
 *
 * - equipment, 64 keys of 64 characters: 64 × 64 × 6 = 24,576 characters
 *   (a control character encodes to six characters, `\u00XX`);
 * - cargo, 17 entries: 17 × (64 × 6 + 8) ≈ 6,664;
 * - market, 17 goods: 17 × (64 × 6 + 28) ≈ 7,004;
 * - pose: about 250; scalar/system/station envelope: about 400.
 *
 * That is ≈38.9 KB, comfortably under 65,536 while remaining a hard resource
 * bound checked before `JSON.parse`. The version sniff copies at most
 * `MAX_VERSION_SNIFF_CHARS` characters, never the whole stored string.
 */
export const MAX_SAVE_CHARS = 65_536;

/** The most equipment keys one profile may carry. */
export const MAX_SAVE_EQUIPMENT = 64;

/** The longest equipment key accepted. */
export const MAX_SAVE_EQUIPMENT_KEY_CHARS = 64;

/**
 * The schema ceiling for the cargo array: 17 entries.
 *
 * The allow-list caps valid cargo at the 16 tradeable commodities. Alien Items is
 * a market good only, so a 17th cargo entry is rejected by `validateSaveSemantics`
 * rather than by this bound.
 */
export const MAX_SAVE_CARGO_ENTRIES = 17;

/** The largest quantity one cargo entry may hold. */
export const MAX_SAVE_CARGO_QUANTITY = 36_000_000;

/** The fuel tank cap in tenths of a light year. */
export const MAX_SAVE_FUEL = 70;

/** The missile pylon cap. */
export const MAX_SAVE_MISSILES = 3;

/** The passenger berth cap (a hard resource bound). */
export const MAX_SAVE_BERTHS = 7;

/** The longest system id accepted (`g0-s7` is the real shape). */
export const MAX_SAVE_SYSTEM_ID_CHARS = 16;

/** The longest station key accepted (`coriolis-station` is the real shape). */
export const MAX_SAVE_STATION_KEY_CHARS = 64;

/** A clock more than this far ahead of `CLOCK_START` is not credible. */
export const MAX_SAVE_CLOCK_DELTA = 1_000_000_000_000;

/**
 * The largest credit balance the schema accepts.
 *
 * Aligned with `isSafeCredits` (`Number.isSafeInteger` and non-negative), so
 * every balance `setCredits`/`grantCredits` can represent is also encodable.
 * The writer still validates the encoded blob before committing.
 */
export const MAX_SAVE_CREDITS = Number.MAX_SAFE_INTEGER;

/**
 * The largest position magnitude a save may carry, in metres (Pitfall 8).
 *
 * A finite-but-absurd position (1e30) is still finite, so `sanitizeFlightState`
 * would not repair it; the save schema and validator bound it instead. The
 * largest real coordinate is the system extent (tens of thousands of metres),
 * so 1e9 leaves a very wide margin while keeping camera arithmetic sane.
 */
export const MAX_SAVE_POSITION_MAGNITUDE = 1e9;

/** The largest scalar speed accepted (torus cap is 350 × 1024). */
export const MAX_SAVE_SPEED = 1_000_000;

/** The largest absolute pitch/roll rate accepted, in radians per second. */
export const MAX_SAVE_RATE = 10;

/** The exact number of market goods a snapshot carries (MARKET_LIMIT stock). */
export const MAX_SAVE_MARKET_GOODS = 17;

export const CargoEntrySchema = z.strictObject({
  key: z.string().min(1).max(MAX_SAVE_EQUIPMENT_KEY_CHARS),
  quantity: z.number().int().min(1).max(MAX_SAVE_CARGO_QUANTITY),
});

/**
 * The historical v1 schema (D-14).
 *
 * Its version stays `z.literal(1)` rather than following `SAVE_VERSION`: this
 * is the migration input, so it must describe exactly what Phase 4/5 wrote.
 */
export const SaveV1Schema = z.strictObject({
  version: z.literal(1),
  mode: z.literal("docked"),
  clockSeconds: z
    .number()
    .int()
    .min(CLOCK_START)
    .max(CLOCK_START + MAX_SAVE_CLOCK_DELTA),
  credits: z.number().int().min(0).max(MAX_SAVE_CREDITS),
  equipment: z
    .array(z.string().min(1).max(MAX_SAVE_EQUIPMENT_KEY_CHARS))
    .max(MAX_SAVE_EQUIPMENT),
  system: z.strictObject({
    id: z.string().min(1).max(MAX_SAVE_SYSTEM_ID_CHARS),
  }),
  station: z.strictObject({
    key: z.string().min(1).max(MAX_SAVE_STATION_KEY_CHARS),
  }),
  // Additive optional fields on the existing v1 blob (D-19): a Phase 4 save
  // stays readable and no version bump invents a migration Phase 6 owns.
  cargo: z.array(CargoEntrySchema).max(MAX_SAVE_CARGO_ENTRIES).optional(),
  fuel: z.number().int().min(0).max(MAX_SAVE_FUEL).optional(),
  missiles: z.number().int().min(0).max(MAX_SAVE_MISSILES).optional(),
  passengerBerths: z.number().int().min(0).max(MAX_SAVE_BERTHS).optional(),
  marketSeed: z.number().int().min(0).max(0xffffffff).optional(),
});

/** One persisted market good (D-13): key, decicredit price and shelf stock. */
export const MarketGoodSchema = z.strictObject({
  key: z.string().min(1).max(MAX_SAVE_EQUIPMENT_KEY_CHARS),
  price: z.number().int().min(0).max(MAX_SAVE_CREDITS),
  stock: z.number().int().min(0).max(MARKET_LIMIT),
});

/**
 * The current market snapshot (D-13).
 *
 * Exactly the 17 known goods, no duplicates, and a system id equal to the saved
 * system are enforced by the shared semantic validator, because `zod` alone
 * cannot express "allow-listed and unique" without a second parser.
 */
export const MarketSchema = z.strictObject({
  systemId: z.string().min(1).max(MAX_SAVE_SYSTEM_ID_CHARS),
  seed: z.number().int().min(0).max(0xffffffff),
  goods: z.array(MarketGoodSchema).length(MAX_SAVE_MARKET_GOODS),
});

const PositionComponentSchema = z
  .number()
  .min(-MAX_SAVE_POSITION_MAGNITUDE)
  .max(MAX_SAVE_POSITION_MAGNITUDE);

const Vec3TupleSchema = z.tuple([
  PositionComponentSchema,
  PositionComponentSchema,
  PositionComponentSchema,
]);
const QuatTupleSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

/**
 * A sanitized in-flight pose (D-13, D-16, Pitfall 8).
 *
 * Presence is tied to `mode` by the semantic validator; the numeric bounds are
 * in the schema so a finite-but-absurd value never reaches the renderer.
 */
export const FlightPoseSchema = z.strictObject({
  position: Vec3TupleSchema,
  orientation: QuatTupleSchema,
  speed: z.number().min(0).max(MAX_SAVE_SPEED),
  pitchRate: z.number().min(-MAX_SAVE_RATE).max(MAX_SAVE_RATE),
  rollRate: z.number().min(-MAX_SAVE_RATE).max(MAX_SAVE_RATE),
  torus: z.boolean(),
});

/**
 * The current v2 schema (D-13, D-15).
 *
 * One strict object: every v1 field plus `mode`, an optional committed target,
 * exactly one seed encoding (`market` or `marketSeed`) and, for `inFlight`, a
 * flight pose.
 */
export const SaveV2Schema = z.strictObject({
  version: z.literal(SAVE_VERSION),
  mode: z.enum(["docked", "inFlight"]),
  clockSeconds: z
    .number()
    .int()
    .min(CLOCK_START)
    .max(CLOCK_START + MAX_SAVE_CLOCK_DELTA),
  credits: z.number().int().min(0).max(MAX_SAVE_CREDITS),
  equipment: z
    .array(z.string().min(1).max(MAX_SAVE_EQUIPMENT_KEY_CHARS))
    .max(MAX_SAVE_EQUIPMENT),
  system: z.strictObject({
    id: z.string().min(1).max(MAX_SAVE_SYSTEM_ID_CHARS),
  }),
  station: z.strictObject({
    key: z.string().min(1).max(MAX_SAVE_STATION_KEY_CHARS),
  }),
  cargo: z.array(CargoEntrySchema).max(MAX_SAVE_CARGO_ENTRIES).optional(),
  fuel: z.number().int().min(0).max(MAX_SAVE_FUEL).optional(),
  missiles: z.number().int().min(0).max(MAX_SAVE_MISSILES).optional(),
  passengerBerths: z.number().int().min(0).max(MAX_SAVE_BERTHS).optional(),
  // Exactly one seed encoding: migration writes `marketSeed`, the canonical
  // writer writes `market.seed`. The validator rejects both and neither.
  marketSeed: z.number().int().min(0).max(0xffffffff).optional(),
  market: MarketSchema.optional(),
  targetSystem: z.string().min(1).max(MAX_SAVE_SYSTEM_ID_CHARS).optional(),
  // Required iff `mode === "inFlight"`; a docked save derives its pose.
  flight: FlightPoseSchema.optional(),
});

export type SaveV1 = z.infer<typeof SaveV1Schema>;
export type SaveV2 = z.infer<typeof SaveV2Schema>;
export type SaveCargoEntry = z.infer<typeof CargoEntrySchema>;

/** The catalogue facts a boot must supply before a blob can be trusted. */
export interface SaveAllowLists {
  readonly equipment: ReadonlySet<string>;
  readonly systems: ReadonlySet<string>;
  readonly stations: ReadonlySet<string>;
  /** Tradeable commodity key → unit; Alien Items is deliberately absent. */
  readonly commodities: ReadonlyMap<string, CommodityUnit>;
  /**
   * Every commodity key a market snapshot may carry (D-15, T-06-07).
   *
   * Deliberately separate from `commodities`: the market emits 17 goods
   * including Alien Items, while cargo can only ever hold the 16 tradeable
   * ones.
   */
  readonly marketGoods: ReadonlySet<string>;
}

export type SaveParseFailure =
  "corrupt" | "future-version" | "absent" | "unreadable";

export type SaveParseResult =
  | { readonly ok: true; readonly save: SaveV2 }
  | { readonly ok: false; readonly reason: SaveParseFailure };

/** A flight pose in the wire shape: tuples, not the sim's `{x,y,z}` objects. */
export interface SaveFlightPose {
  readonly position: readonly [number, number, number];
  readonly orientation: readonly [number, number, number, number];
  readonly speed: number;
  readonly pitchRate: number;
  readonly rollRate: number;
  readonly torus: boolean;
}

/** The trusted values `encodeSave` projects into a `SaveV2`. */
export interface SaveInputs {
  readonly clockSeconds: number;
  readonly credits: number;
  readonly equipment: readonly string[];
  readonly cargo: readonly SaveCargoEntry[];
  readonly fuel: number;
  readonly missiles: number;
  readonly passengerBerths: number;
  readonly mode: "docked" | "inFlight";
  /** The committed hyperspace target, when one is selected (D-12). */
  readonly targetSystem?: string;
  /** The seed-only encoding; used by a v1 migration and as a fallback. */
  readonly marketSeed?: number;
  /** The canonical market snapshot; wins over `marketSeed` when present. */
  readonly market?: Market;
  /** Required iff `mode === "inFlight"`; never written for a docked save. */
  readonly flight?: SaveFlightPose;
  readonly systemId: string;
  readonly stationKey: string;
}

/** The Phase 4 equipment alias for one passenger berth. */
export const LEGACY_BERTH_ALIAS = "EQ_PASSENGER_BERTH";

/** The Phase 4 equipment alias for one missile. */
export const LEGACY_MISSILE_ALIAS = "EQ_MISSILE";

/** Equipment keys a canonical snapshot never carries. */
const FORBIDDEN_EQUIPMENT: ReadonlySet<string> = new Set([
  "EQ_FUEL",
  "EQ_MISSILE_REMOVAL",
  "EQ_PASSENGER_BERTH_REMOVAL",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * How much of an oversized blob is inspected for a future-version marker.
 *
 * The sniff is bounded and allocation-safe: `raw.slice` copies at most this
 * many characters, never the whole (potentially megabyte) string. It only
 * needs to see the canonical `{"version":N,…}` prefix this app writes.
 */
const MAX_VERSION_SNIFF_CHARS = 256;

const VERSION_SNIFF = /"version"\s*:\s*(\d{1,16})/;

/** Read the leading version marker, or `null` when there is none. */
function sniffVersion(raw: string): number | null {
  const match = VERSION_SNIFF.exec(raw.slice(0, MAX_VERSION_SNIFF_CHARS));
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * The one ordered v1 → v2 migration (D-14).
 *
 * Pure and total: it never touches IndexedDB, a clock or the content loader,
 * and it never mutates its input. A v1 blob has no market snapshot, so the
 * migrated object carries exactly one seed (`marketSeed`); the session may
 * generate the market from it before the first v2 write.
 */
export function migrateV1ToV2(v1: SaveV1): SaveV2 {
  return {
    ...v1,
    version: SAVE_VERSION,
    mode: "docked",
    marketSeed: v1.marketSeed ?? marketSeedForSystem(v1.system.id),
    // No `market` and no `flight`: a v1 save is always docked and has no snapshot.
  };
}

/**
 * Validate an untrusted blob against the schema and the boot allow-lists.
 *
 * The order is load-bearing: absent, size cap (+ bounded version sniff),
 * parse, future version, shape family, strict schema, allow-lists. A `null`
 * raw value is the only input that produces `absent`; a store read failure is
 * converted to `null` by the caller.
 *
 * "Unreadable" is deliberately distinct from "corrupt". Only a blob this build
 * can positively recognise as its own v1 family (a JSON object with a numeric
 * `version` not newer than this build) may be backed up and cleared. Anything
 * else — oversized, unparseable, a JSON scalar, an object with no version — is
 * `unreadable`: the caller must never clear or overwrite it.
 */
export function parseSave(
  raw: string | null,
  allow: SaveAllowLists,
): SaveParseResult {
  if (raw === null) return { ok: false, reason: "absent" };

  // T-04-27/T-04-49: reject an oversized blob *before* JSON.parse. The cap
  // that ran after parsing would still allocate the attacker's string. Before
  // classifying it as unreadable, sniff the bounded prefix so a newer build's
  // oversized blob is still recognised as future-version (T-04-47).
  if (raw.length > MAX_SAVE_CHARS) {
    const version = sniffVersion(raw);
    if (version !== null && version > SAVE_VERSION) {
      return { ok: false, reason: "future-version" };
    }
    return { ok: false, reason: "unreadable" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  // A version newer than this build is not a save this build understands. It is
  // reported separately and the caller must never clear or overwrite it.
  if (isRecord(parsed)) {
    const version = parsed["version"];
    if (typeof version === "number" && version > SAVE_VERSION) {
      return { ok: false, reason: "future-version" };
    }
  }

  // A JSON value that does not carry this save family's numeric `version`
  // field is an unknown shape, not a corrupt save. Only a positively recognised
  // v1/v2 object may be backed up and cleared by New game.
  if (!isRecord(parsed) || typeof parsed["version"] !== "number") {
    return { ok: false, reason: "unreadable" };
  }

  const version = parsed["version"];
  let save: SaveV2;
  if (version === 1) {
    // The historical schema is the migration input; a v1-shaped blob that
    // fails it is positively corrupt.
    const migrated = SaveV1Schema.safeParse(parsed);
    if (!migrated.success) return { ok: false, reason: "corrupt" };
    save = migrateV1ToV2(migrated.data);
  } else if (version === 2) {
    const current = SaveV2Schema.safeParse(parsed);
    if (!current.success) return { ok: false, reason: "corrupt" };
    save = current.data;
  } else {
    // A numeric version this build knows is historical/current (0, negative,
    // fractional) but has no schema for: positively this family, so corrupt.
    return { ok: false, reason: "corrupt" };
  }

  // The schema proves the shape; the shared semantic validator proves the
  // referents, cargo accounting and canonical equipment. It is the same stage
  // the writer runs before committing, so a snapshot cannot be written that the
  // parser would reject (T-05-19).
  try {
    if (!validateSaveSemantics(save, allow, "read")) {
      return { ok: false, reason: "corrupt" };
    }
  } catch {
    // `parseSave` never throws: an internal error is an untrusted blob.
    return { ok: false, reason: "corrupt" };
  }

  // The allow-lists prove the referents exist; a forged id or key can never
  // reach `findShip` or the system catalogue.
  if (!allow.systems.has(save.system.id)) {
    return { ok: false, reason: "corrupt" };
  }
  if (!allow.stations.has(save.station.key)) {
    return { ok: false, reason: "corrupt" };
  }

  return { ok: true, save };
}

/**
 * The one semantic validation stage shared by the reader and the writer.
 *
 * Rejects unknown/duplicate equipment keys, the canonical-only exclusions,
 * unknown/duplicate/zero cargo keys, an over-capacity hold and — in `"write"`
 * mode — the Phase 4 equipment aliases a canonical snapshot never writes. In
 * `"read"` mode one alias is accepted only when its explicit count is zero;
 * the alias and a non-zero count together are ambiguous double-encoding.
 */
export function validateSaveSemantics(
  save: SaveV2,
  allow: SaveAllowLists,
  mode: "read" | "write",
): boolean {
  const seenEquipment = new Set<string>();
  let hasBerthAlias = false;
  let hasMissileAlias = false;

  for (const key of save.equipment) {
    if (seenEquipment.has(key) || !allow.equipment.has(key)) return false;
    seenEquipment.add(key);
    if (FORBIDDEN_EQUIPMENT.has(key)) return false;
    if (key === LEGACY_BERTH_ALIAS) {
      if (mode === "write") return false;
      hasBerthAlias = true;
    }
    if (key === LEGACY_MISSILE_ALIAS) {
      if (mode === "write") return false;
      hasMissileAlias = true;
    }
  }

  if (hasBerthAlias && (save.passengerBerths ?? 0) !== 0) return false;
  if (hasMissileAlias && (save.missiles ?? 0) !== 0) return false;

  // Normalise the alias into the effective count BEFORE measuring the hold, so
  // a 20 t hold plus a lone berth alias is corrupt at the effective 15 t.
  const effectiveBerths = (save.passengerBerths ?? 0) + (hasBerthAlias ? 1 : 0);
  const capacityPods = capacityPodsFor(save.equipment, effectiveBerths);
  if (capacityPods < 0) return false;

  const cargo = emptyCargo() as Record<string, number>;
  const seenCargo = new Set<string>();
  for (const entry of save.cargo ?? []) {
    if (seenCargo.has(entry.key)) return false;
    if (!allow.commodities.has(entry.key)) return false;
    if (!Number.isSafeInteger(entry.quantity) || entry.quantity <= 0) {
      return false;
    }
    seenCargo.add(entry.key);
    cargo[entry.key] = entry.quantity;
  }

  const usedPods = holdPodsUsed(cargo, allow.commodities);
  if (!Number.isSafeInteger(usedPods) || usedPods > capacityPods) return false;

  // D-16/Pitfall 9: exactly one seed per encoding. Both present (a hand-edited
  // save where `marketSeed` and `market.seed` disagree) or neither present is
  // ambiguous, so it is corrupt.
  if ((save.market === undefined) === (save.marketSeed === undefined)) {
    return false;
  }

  if (save.market !== undefined) {
    // D-16: the snapshot must describe the saved system, carry exactly the 17
    // known goods with no duplicate, and stay inside the market bounds.
    if (save.market.systemId !== save.system.id) return false;
    if (save.market.goods.length !== MAX_SAVE_MARKET_GOODS) return false;
    const seenGoods = new Set<string>();
    for (const good of save.market.goods) {
      if (seenGoods.has(good.key)) return false;
      if (!allow.marketGoods.has(good.key)) return false;
      if (!Number.isSafeInteger(good.price) || good.price < 0) return false;
      if (
        !Number.isInteger(good.stock) ||
        good.stock < 0 ||
        good.stock > MARKET_LIMIT
      ) {
        return false;
      }
      seenGoods.add(good.key);
    }
  }

  // D-16: a committed target, when present, must be a system this build knows.
  if (
    save.targetSystem !== undefined &&
    !allow.systems.has(save.targetSystem)
  ) {
    return false;
  }

  // D-16: an in-flight save carries a pose, a docked save does not.
  if ((save.flight !== undefined) !== (save.mode === "inFlight")) return false;

  if (save.flight !== undefined) {
    const { position, orientation } = save.flight;
    if (!position.every((value) => Number.isFinite(value))) return false;
    // Pitfall 8: finite-but-absurd positions are rejected here, not left for
    // `sanitizeFlightState` (which only repairs non-finite values).
    if (
      Math.hypot(position[0], position[1], position[2]) >
      MAX_SAVE_POSITION_MAGNITUDE
    ) {
      return false;
    }
    if (!orientation.every((value) => Number.isFinite(value))) return false;
    const orientationLengthSquared =
      orientation[0] ** 2 +
      orientation[1] ** 2 +
      orientation[2] ** 2 +
      orientation[3] ** 2;
    // D-16: normalized on read; zero length is corrupt and a true unit
    // quaternion is exactly 1. The upper bound permits an unnormalized input.
    if (!(orientationLengthSquared > 0 && orientationLengthSquared <= 4)) {
      return false;
    }
    if (
      !Number.isFinite(save.flight.speed) ||
      !Number.isFinite(save.flight.pitchRate) ||
      !Number.isFinite(save.flight.rollRate)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Validate an encoded blob against the writer's own contract.
 *
 * `queueAutosave` runs this before `store.write`: a snapshot that would encode
 * to a blob this build rejects must never replace the last good save. The
 * write-mode allow-lists and hold semantics are enforced through the same
 * `validateSaveSemantics` the parser uses, after the size cap and strict schema.
 */
export function isEncodedSaveValid(
  raw: string,
  allow: SaveAllowLists,
): boolean {
  if (raw.length > MAX_SAVE_CHARS) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return false;
  }
  const result = SaveV2Schema.safeParse(parsed);
  if (!result.success) return false;
  // The reader's referent allow-lists (see `parseSave`) apply here too, so the
  // writer can never replace a good blob with bytes the reader would classify as
  // corrupt (T-06-36).
  if (!allow.systems.has(result.data.system.id)) return false;
  if (!allow.stations.has(result.data.station.key)) return false;
  try {
    return validateSaveSemantics(result.data, allow, "write");
  } catch {
    return false;
  }
}

/** Marker prefixed to a truncated `autosave.corrupt` backup. */
export const CORRUPT_BACKUP_MARKER = "wegolite-corrupt-save-truncated";

/**
 * Bound a corrupt blob before it is copied to the backup key.
 *
 * A short blob is stored verbatim. An oversized one keeps a bounded prefix plus
 * a marker carrying its original length, so the backup path cannot double the
 * storage of a huge blob or exhaust the origin's quota (WR-02). The copy is
 * never read back, so a prefix is enough for diagnosis.
 */
export function boundCorruptBackup(raw: string): string {
  if (raw.length <= MAX_SAVE_CHARS) return raw;
  const header = `${CORRUPT_BACKUP_MARKER}:${raw.length}:`;
  const budget = Math.max(0, MAX_SAVE_CHARS - header.length);
  return `${header}${raw.slice(0, budget)}`;
}

/**
 * Project trusted values into the canonical v2 blob.
 *
 * Exactly one seed is always emitted: the market snapshot wins when present
 * (and `marketSeed` is omitted), otherwise the seed is written. A docked save
 * never writes a pose; an in-flight save writes the sanitized pose the caller
 * supplied. `snapshotForSave` is the only caller in the app, so these values are
 * already trusted — the writer gate re-validates the encoded bytes anyway.
 */
export function encodeSave(inputs: SaveInputs): string {
  const market =
    inputs.market === undefined
      ? undefined
      : {
          systemId: inputs.market.systemId,
          seed: inputs.market.seed,
          goods: inputs.market.goods.map((good) => ({
            key: good.key,
            price: good.price,
            stock: good.stock,
          })),
        };

  const save: SaveV2 = {
    version: SAVE_VERSION,
    mode: inputs.mode,
    clockSeconds: inputs.clockSeconds,
    credits: inputs.credits,
    equipment: [...inputs.equipment],
    cargo: inputs.cargo.map((entry) => ({
      key: entry.key,
      quantity: entry.quantity,
    })),
    fuel: inputs.fuel,
    missiles: inputs.missiles,
    passengerBerths: inputs.passengerBerths,
    system: { id: inputs.systemId },
    station: { key: inputs.stationKey },
    ...(inputs.targetSystem === undefined
      ? {}
      : { targetSystem: inputs.targetSystem }),
    ...(market !== undefined
      ? { market }
      : inputs.marketSeed === undefined
        ? {}
        : { marketSeed: inputs.marketSeed }),
    ...(inputs.mode === "inFlight" && inputs.flight !== undefined
      ? {
          flight: {
            position: [...inputs.flight.position] as [number, number, number],
            orientation: [...inputs.flight.orientation] as [
              number,
              number,
              number,
              number,
            ],
            speed: inputs.flight.speed,
            pitchRate: inputs.flight.pitchRate,
            rollRate: inputs.flight.rollRate,
            torus: inputs.flight.torus,
          },
        }
      : {}),
  };
  return JSON.stringify(save);
}
