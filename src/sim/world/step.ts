// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The world step (FOUND-11, FOUND-13, D-04, D-14; ARCHITECTURE section 5.3).
 *
 * `stepWorld` runs after the flight step (see `src/sim/sim.ts`) and never
 * touches the `FlightState`: the player comes in read-only through the
 * `WorldView`. Phases, in order: update, think, commit.
 *
 * Every pass over the entities walks ascending ids by index over a length
 * snapshot taken at the start of the pass. An entity spawned during a tick is
 * therefore first updated and first thinks on the next tick, and an entity
 * killed earlier in the tick is skipped (Oolite still updates it,
 * Universe.m:6540; PROJECT.md Key Decisions row (c)). Id order, not Oolite's
 * distance order (Universe.m sortedEntities), is a determinism device (row (a)).
 *
 * Every think draws only from the thinking entity's own "ai" stream, so
 * spawning or killing another entity never changes its draws (D-04).
 *
 * Fault containment (FOUND-15, D-04): `invoke` is the only containment point.
 * A throw from an AI module's `think` or `onEvent` is caught there, the entity
 * becomes nullAI (`ai = null`, hash line `ai:none`), one `aiFaulted` event is
 * emitted and the step goes on. `stepSim` never wraps `stepWorld`, and nothing
 * else here has a try/catch, so a defect in the simulation itself still throws.
 */

import { AI_REGISTRY } from "../ai/registry.js";
import type { AiContext, AiEvent, AiModule } from "../ai/types.js";
import type { AiFaultSite, SimEvent } from "../events.js";
import type { FlightState } from "../flight/state.js";
import { steerShip } from "../npc/dispatch.js";
import { refreshEscorts } from "../npc/escort.js";
import { runProximityPass } from "../npc/proximity.js";
import { PLAYER_COLLISION_RADIUS_M, statsFor } from "../npc/stats.js";
import { startPendingTrackingCurves } from "../npc/tracking-curve.js";
import type { NpcStepFacts } from "../npc/stats.js";
import { createRngState, rngNext } from "../rng.js";
import { createShipControl } from "./control-impl.js";
import type { Entity } from "./entity.js";
import type { SystemLayout } from "./layout.js";
import { MAX_UINT32 } from "./limits.js";
import { sanitizeEntity, sanitizeStaticHealth } from "./sanitize.js";
import { createWorldView } from "./view-impl.js";
import type { WorldView } from "./view.js";
import { commitWorld, countAiDropped, postAiEvent } from "./world.js";
import type { World } from "./world.js";

/** The most passes one AI event drain makes; events posted in a pass arrive in the next. */
export const MAX_AI_EVENT_PASSES = 8;

/** The most events one drain dequeues, counting events skipped at delivery. */
export const MAX_AI_EVENTS_PER_DRAIN = 4096;

/** A registry of AI modules keyed by `AiKey`; injectable for tests. */
export type AiRegistry = Readonly<Record<string, AiModule>>;

/**
 * The module registered under `key`, or undefined. Looked up with
 * `Object.hasOwn`, never by plain indexing: a key such as "constructor"
 * resolves through `Object.prototype` and would throw a TypeError inside the
 * fixed step (T-08-53).
 */
function aiModuleFor(registry: AiRegistry, key: string): AiModule | undefined {
  return Object.hasOwn(registry, key) ? registry[key] : undefined;
}

/**
 * Advance the world one fixed step. `tick` is `player.tick`, which the flight
 * step already advanced this step. Returns the events of this tick.
 */
export function stepWorld(
  world: World,
  player: FlightState,
  layout: SystemLayout,
  dt: number,
  registry: AiRegistry = AI_REGISTRY,
  npc?: NpcStepFacts,
): SimEvent[] {
  if (!Number.isFinite(dt) || dt <= 0) {
    throw new RangeError(
      `Wegolite: stepWorld requires a positive finite dt, received ${String(dt)}.`,
    );
  }
  const tick = player.tick;
  const events: SimEvent[] = [];
  repairWorldFields(world);
  // The length snapshot: spawns made during the tick land at indices >= n.
  const n = world.store.live.length;

  // Update. Every live entity that has an AI is flown by the native steering
  // (`steerShip`, plan 14-11), in ascending id order over the length snapshot,
  // with its own flight constants (`statsFor`, Oolite's defaults for a kind with
  // no row). An entity with no AI (an inert ship, or one whose module faulted)
  // is skipped: it holds its placement and its speed field is not integrated
  // (Phase 12 D-02). Each steered ship draws only from its own "combat" stream,
  // through a local copy written back after the call, so spawning or removing
  // another ship never changes its draws (D-04). Events the steering posts go to
  // the ship's own AI through `postAiEvent` and are delivered at the next drain.
  // There is no try/catch: steering is total (tests/sim/npc/steering.property).
  let view: WorldView | undefined;
  // The player's body radius is the compiled constant, never lazily loaded hull
  // data, so a range to the player (`rangeToPrimaryTarget`) and every steered
  // hash are independent of when an asset loads (T-14-47).
  const getView = (): WorldView =>
    (view ??= createWorldView(
      world,
      player,
      layout,
      PLAYER_COLLISION_RADIUS_M,
    ));
  for (let i = 0; i < n; i += 1) {
    const entity = world.store.live[i];
    if (entity === undefined || entity.dead || entity.ai === null) continue;
    steerEntity(world, entity, getView(), dt, npc);
    // The escort leader refresh (ShipEntity.m:2427-2436): right after the
    // leader's own update, every steered ship it owns gets its formation
    // destination. It writes other ships, so it lives here and not in
    // `steerShip`; the leader has moved, so a higher-id follower reads the
    // fresh destination in the same tick.
    refreshEscorts(world, entity);
  }

  // Think. The view is shared with the update phase and built lazily, only when
  // a steered ship or a module is about to run, so a world with no AI allocates
  // no closures per tick. Queued AI events are delivered first in first out
  // before and after the thinks (Pitfall 7): nothing is delivered
  // synchronously, and the queue is empty when the step returns.
  drainAiEvents(world, registry, tick, getView, events);
  for (let i = 0; i < n; i += 1) {
    const entity = world.store.live[i];
    if (entity === undefined || entity.dead || entity.ai === null) continue;
    const ai = entity.ai;
    const wakeDue = ai.wakeTick > 0 && tick >= ai.wakeTick;
    const thinkDue = tick >= ai.nextThinkTick;
    if (!wakeDue && !thinkDue) continue;
    if (wakeDue) ai.wakeTick = 0;
    const module = aiModuleFor(registry, ai.aiKey);
    if (module === undefined) continue;
    invoke(world, entity, getView(), tick, events, "think", (ctx) =>
      module.think(ctx),
    );
  }
  drainAiEvents(world, registry, tick, getView, events);
  // Oolite's `addTarget:` restarts the target's tracking curve when the target
  // is set (ShipEntity.m:8659-8665). `setTarget` leaves the start pending, and
  // it runs here, after the final drain and before anything moves, so it samples
  // the target positions `addTarget:` would have sampled, at this tick.
  startPendingTrackingCurves(world, getView, tick);
  // Oolite's collision pass clears every ship's proximity alert and sets the
  // new ones (CollisionRegion.m:269-312); `setProximityAlert:` is read by the
  // next update, so an alert set at the end of tick N steers tick N+1.
  runProximityPass(world, player, getView, npc);

  // Sanitize every live entity before the commit, so no non-finite or
  // out-of-domain value reaches a hash or a snapshot (T-08-21, T-08-44).
  for (let i = 0; i < world.store.live.length; i += 1) {
    const entity = world.store.live[i];
    if (entity !== undefined && !entity.dead) sanitizeEntity(entity);
  }

  // Commit. One entityRemoved per removal, ascending (Pitfall 13).
  for (const id of commitWorld(world))
    events.push({ kind: "entityRemoved", id });
  return events;
}

/**
 * One native update of `entity` (plan 14-11): its own flight stats, a draw over
 * a local copy of its own "combat" stream written back after the call, and an
 * emit that queues the event for the ship's own AI. The event is built without
 * an `a` key when it has no argument (exactOptionalPropertyTypes).
 */
function steerEntity(
  world: World,
  entity: Entity,
  view: WorldView,
  dt: number,
  npc: NpcStepFacts | undefined,
): void {
  const stream = createRngState(entity.rng.combat);
  steerShip(entity, {
    view,
    stats: statsFor(npc?.flight, entity.specKey),
    dt,
    draw: () => rngNext(stream),
    emit: (event) => {
      postAiEvent(
        world,
        event.a === undefined
          ? { to: entity.id, name: event.name }
          : { to: entity.id, name: event.name, a: event.a },
      );
    },
  });
  entity.rng.combat = stream.s;
}

/**
 * Repair the world-level hashed state: the stream state, the drop count and the
 * static health (a repair of the last is counted nowhere, FOUND-18).
 */
function repairWorldFields(world: World): void {
  const s = world.rng.s;
  if (!Number.isSafeInteger(s) || s < 0 || s > MAX_UINT32) world.rng.s = 0;
  if (!Number.isSafeInteger(world.aiDropped) || world.aiDropped < 0) {
    world.aiDropped = 0;
  } else if (world.aiDropped > MAX_UINT32) {
    world.aiDropped = MAX_UINT32;
  }
  sanitizeStaticHealth(world);
}

/**
 * Run `call` with `entity`'s context: its own control and a random closure over
 * a local copy of its own "ai" stream, written back after the call, so another
 * entity's spawn or death never changes its draws (D-04).
 *
 * The one containment point (FOUND-15, D-04): only the module call is guarded.
 * A throw sets `entity.ai = null` (nullAI) and pushes one `aiFaulted` event
 * with the entity id and `site`; the caught value is never read, stored or
 * formatted, and `entity.repairs` is not touched. The stream is written back on
 * both paths, so the draws the module made before it threw are kept.
 */
function invoke(
  world: World,
  entity: Entity,
  view: WorldView,
  tick: number,
  events: SimEvent[],
  site: AiFaultSite,
  call: (ctx: AiContext) => void,
): void {
  if (entity.ai === null) return;
  const stream = createRngState(entity.rng.ai);
  // Built outside the guarded region: a failure in the sim's own helpers is
  // never swallowed.
  const ctx: AiContext = {
    self: entity.id,
    view,
    ctl: createShipControl(world, entity.id, tick),
    ai: entity.ai,
    random: () => rngNext(stream),
  };
  try {
    call(ctx);
  } catch {
    entity.ai = null;
    events.push({ kind: "aiFaulted", id: entity.id, site });
  }
  entity.rng.ai = stream.s;
}

/**
 * Deliver the queued events first in first out, in passes: a pass takes the
 * events queued when it starts, and events posted during it arrive in the next.
 * At most `MAX_AI_EVENT_PASSES` passes and `MAX_AI_EVENTS_PER_DRAIN` dequeued
 * events (an event skipped at delivery still spends one unit of the budget);
 * when either bound is reached every event still queued is dropped and
 * counted in `world.aiDropped`, so a fan-out handler costs bounded work.
 */
function drainAiEvents(
  world: World,
  registry: AiRegistry,
  tick: number,
  getView: () => WorldView,
  events: SimEvent[],
): void {
  let passes = 0;
  let dequeued = 0;
  while (world.aiQueue.length > 0) {
    if (passes >= MAX_AI_EVENT_PASSES || dequeued >= MAX_AI_EVENTS_PER_DRAIN) {
      countAiDropped(world, world.aiQueue.length);
      world.aiQueue.length = 0;
      return;
    }
    passes += 1;
    const batch = world.aiQueue.splice(0, MAX_AI_EVENTS_PER_DRAIN - dequeued);
    dequeued += batch.length;
    for (const event of batch)
      deliverAiEvent(world, registry, tick, getView, events, event);
  }
}

/**
 * Deliver the AI events queued since `stepWorld` returned, at once (FOUND-19,
 * D-04, D-12). `resolveShots` calls it between the kills and the second
 * `commitWorld`, so the tick boundary holds no queued AI event.
 *
 * It returns at once when `world.aiQueue` is empty on entry (no handler can
 * run; the common case, because `stepWorld` already drained). Otherwise it
 * builds the view lazily exactly as `stepWorld` does, runs the same drain (same
 * pass and budget caps, same `aiDropped` accounting, same containment in
 * `invoke`) and truncates `world.fireQueue` back to its length on entry, so a
 * `ctl.fire` request made by an `onEvent` handler during this drain is
 * discarded (fire is a think-time action; inside `resolveShots` the length on
 * entry is 0, and a later in-step caller keeps the think phase's requests).
 */
export function drainAiEventsNow(
  world: World,
  player: FlightState,
  layout: SystemLayout,
  tick: number,
  events: SimEvent[],
  registry: AiRegistry = AI_REGISTRY,
): void {
  if (world.aiQueue.length === 0) return;
  let view: WorldView | undefined;
  const getView = (): WorldView =>
    (view ??= createWorldView(
      world,
      player,
      layout,
      PLAYER_COLLISION_RADIUS_M,
    ));
  const fireLength = world.fireQueue.length;
  drainAiEvents(world, registry, tick, getView, events);
  world.fireQueue.length = Math.min(world.fireQueue.length, fireLength);
}

/** Deliver one event to a live entity with an AI whose module handles events. */
function deliverAiEvent(
  world: World,
  registry: AiRegistry,
  tick: number,
  getView: () => WorldView,
  events: SimEvent[],
  event: AiEvent,
): void {
  const target = world.store.get(event.to);
  if (target === undefined || target.ai === null) return;
  const onEvent = aiModuleFor(registry, target.ai.aiKey)?.onEvent;
  if (onEvent === undefined) return;
  invoke(world, target, getView(), tick, events, "event", (ctx) =>
    onEvent(ctx, event),
  );
}
