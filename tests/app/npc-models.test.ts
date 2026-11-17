// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The per-session NPC model loader (Phase 12, plan 12-11; Open Question 5 and
 * the deferral of owner decision 2026-11-14, option A).
 *
 * Node only: `loadNpcModel` is a spy over a hand-resolved promise, so the rows
 * decide when a load settles. They prove the loader is closed to requests until
 * `open()`, that a request made while closed is not remembered, that a key is
 * fetched once, that a failure is recorded without a retry or any console
 * output, and that a resolution after `dispose()` is dropped.
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";

import {
  createNpcModelLoader,
  trafficModelGlb,
} from "../../src/app/npc-models.js";
import type { TrafficContent } from "../../src/app/session/traffic.js";

const GLBS: Readonly<Record<string, string>> = {
  viper: "models/viper.glb",
  adder: "models/adder.glb",
};

function glbFor(key: string): string | undefined {
  return GLBS[key];
}

function model(): GLTF {
  return { scene: new THREE.Group() } as unknown as GLTF;
}

interface Deferred {
  readonly promise: Promise<GLTF>;
  resolve(value: GLTF): void;
  reject(error: Error): void;
}

function deferred(): Deferred {
  let resolve!: (value: GLTF) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<GLTF>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A loader over a spy that hands out one deferred promise per call. */
function harness() {
  const pending: Deferred[] = [];
  const loadNpcModel = vi.fn((glb: string): Promise<GLTF> => {
    void glb;
    const next = deferred();
    pending.push(next);
    return next.promise;
  });
  const loader = createNpcModelLoader({ loadNpcModel }, glbFor);
  return { loader, loadNpcModel, pending };
}

/** Let promise reactions run. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createNpcModelLoader: closed until open()", () => {
  it("ignores a request before open() and does not remember it", async () => {
    const { loader, loadNpcModel, pending } = harness();
    loader.request(["viper"]);
    expect(loadNpcModel).not.toHaveBeenCalled();
    expect(loader.loaded().size).toBe(0);

    loader.open();
    // Opening alone fetches nothing: the closed request was not remembered.
    expect(loadNpcModel).not.toHaveBeenCalled();

    loader.request(["viper"]);
    expect(loadNpcModel).toHaveBeenCalledTimes(1);
    expect(loadNpcModel).toHaveBeenCalledWith("models/viper.glb");
    pending[0]?.resolve(model());
    await settle();
    expect(loader.loaded().has("viper")).toBe(true);
  });

  it("open() is idempotent", () => {
    const { loader, loadNpcModel } = harness();
    loader.open();
    loader.open();
    expect(loadNpcModel).not.toHaveBeenCalled();
    loader.request(["viper"]);
    expect(loadNpcModel).toHaveBeenCalledTimes(1);
  });
});

describe("createNpcModelLoader: once open", () => {
  it("fetches a key once and does not fetch it again while loading or after loading", async () => {
    const { loader, loadNpcModel, pending } = harness();
    loader.open();
    loader.request(["viper"]);
    loader.request(["viper"]);
    expect(loadNpcModel).toHaveBeenCalledTimes(1);

    const gltf = model();
    pending[0]?.resolve(gltf);
    await settle();
    expect(loader.loaded().get("viper")).toBe(gltf);
    loader.request(["viper", "viper"]);
    expect(loadNpcModel).toHaveBeenCalledTimes(1);
  });

  it("loads each distinct key once", () => {
    const { loader, loadNpcModel } = harness();
    loader.open();
    loader.request(["viper", "adder", "viper"]);
    expect(loadNpcModel.mock.calls.map((call) => call[0])).toEqual([
      "models/viper.glb",
      "models/adder.glb",
    ]);
  });

  it("marks a rejected key failed, never retries it, never throws and prints nothing", async () => {
    const { loader, loadNpcModel, pending } = harness();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    loader.open();
    loader.request(["viper"]);
    pending[0]?.reject(new Error("network down"));
    await settle();

    expect(loader.loaded().has("viper")).toBe(false);
    loader.request(["viper"]);
    loader.request(["viper"]);
    expect(loadNpcModel).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
  });

  it("ignores a key with no glb", () => {
    const { loader, loadNpcModel } = harness();
    loader.open();
    loader.request(["unknown"]);
    expect(loadNpcModel).not.toHaveBeenCalled();
    expect(loader.loaded().size).toBe(0);
  });

  it("drops a resolution that arrives after dispose()", async () => {
    const { loader, pending } = harness();
    loader.open();
    loader.request(["viper"]);
    loader.dispose();
    pending[0]?.resolve(model());
    await settle();
    expect(loader.loaded().size).toBe(0);
  });

  it("fetches nothing after dispose()", () => {
    const { loader, loadNpcModel } = harness();
    loader.open();
    loader.dispose();
    loader.request(["viper"]);
    expect(loadNpcModel).not.toHaveBeenCalled();
  });

  it("reads the glb at request time, not at construction", () => {
    const loadNpcModel = vi.fn((glb: string): Promise<GLTF> => {
      void glb;
      return new Promise<GLTF>(() => undefined);
    });
    let table: Readonly<Record<string, string>> = {};
    const loader = createNpcModelLoader({ loadNpcModel }, (key) => table[key]);
    loader.open();
    loader.request(["viper"]);
    expect(loadNpcModel).not.toHaveBeenCalled();
    table = GLBS;
    loader.request(["viper"]);
    expect(loadNpcModel).toHaveBeenCalledTimes(1);
  });
});

describe("trafficModelGlb (WORLD-15, WORLD-17)", () => {
  const traffic = {
    catalogue: [{ key: "viper", glb: "models/viper.glb" }],
    debrisModels: [
      { key: "barrel", glb: "models/barrel.glb" },
      { key: "wreck1", glb: "models/wreck1.glb" },
    ],
  } as unknown as Pick<TrafficContent, "catalogue" | "debrisModels">;

  it("resolves a ship key from the ship catalogue", () => {
    expect(trafficModelGlb(traffic, "viper")).toBe("models/viper.glb");
  });

  it("resolves a debris key from the debris catalogue", () => {
    expect(trafficModelGlb(traffic, "barrel")).toBe("models/barrel.glb");
    expect(trafficModelGlb(traffic, "wreck1")).toBe("models/wreck1.glb");
  });

  it("is undefined for an unknown key, no traffic or no debris catalogue", () => {
    expect(trafficModelGlb(traffic, "adder")).toBeUndefined();
    expect(trafficModelGlb(undefined, "viper")).toBeUndefined();
    const shipsOnly = {
      catalogue: traffic.catalogue,
    } as Pick<TrafficContent, "catalogue" | "debrisModels">;
    expect(trafficModelGlb(shipsOnly, "barrel")).toBeUndefined();
  });
});
