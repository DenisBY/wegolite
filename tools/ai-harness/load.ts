// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Loader of the AI-11 spike: runs the pinned Oolite priority AI library and the
 * shuttle role AI in `node:vm`, one context per script.
 *
 * `vm` is not a security boundary. It is used here only on the two fixed,
 * pinned, GPL-licensed files named below, read from an operator-supplied
 * `OOLITE_SRC` directory; no fixture, environment or network value is ever
 * evaluated. Every entry into Oolite code (loading a file, `aiStarted`, every
 * `aiAwoken` wake) goes through `runInContext` with a positive integer
 * `timeout`, because the timeout covers only code run that way.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext, type Context } from "node:vm";

import type { StubHost } from "./host.js";

/** The only files the loader reads, relative to the `OOLITE_SRC` root. */
export const LIBRARY_FILE = "Resources/Scripts/oolite-priorityai.js";
export const ROLE_FILE = "Resources/AIs/oolite-shuttleAI.js";

/** Positive integer milliseconds for every entry into Oolite code. */
export const ENTRY_TIMEOUT_MS = 2000;

/** The one-line installer that routes a context's `Math.random` to the host draw. */
const RANDOM_INSTALLER =
  "Math.random = __harnessDraw; delete globalThis.__harnessDraw;";

export interface AiContext {
  readonly name: string;
  readonly context: Context;
  /** The context's global object (`this` at the top of its script). */
  readonly global: Record<string, unknown>;
  /** Every entry into this context, in order (loads and `callInContext`). */
  readonly entries: string[];
}

export interface LoadedAi {
  readonly library: AiContext;
  readonly role: AiContext;
}

/** Run `source` in `context` with the entry timeout, recording the entry. */
function enter(
  target: AiContext,
  source: string,
  label: string,
  filename: string,
): unknown {
  target.entries.push(label);
  return runInContext(source, target.context, {
    filename,
    timeout: ENTRY_TIMEOUT_MS,
  });
}

/** Evaluate a fixed expression such as `this.aiStarted()` inside `target`. */
export function callInContext(target: AiContext, expression: string): unknown {
  return enter(target, expression, expression, `harness:${target.name}`);
}

/** Make a context whose globals are the host members, each read counted. */
function makeContext(
  name: string,
  host: StubHost,
  extra: Readonly<Record<string, unknown>>,
): AiContext {
  const sandbox: Record<string, unknown> = {};
  const members: Record<string, unknown> = {
    ...host.globals,
    ...extra,
    __harnessDraw: host.draw,
  };
  for (const [key, value] of Object.entries(members)) {
    Object.defineProperty(sandbox, key, {
      configurable: true,
      enumerable: true,
      get(): unknown {
        host.inventory.globals.set(
          `${name}.${key}`,
          (host.inventory.globals.get(`${name}.${key}`) ?? 0) + 1,
        );
        return value;
      },
    });
  }
  const context = createContext(sandbox, { name });
  const target: AiContext = { name, context, global: sandbox, entries: [] };
  enter(target, RANDOM_INSTALLER, "install Math.random", `harness:${name}`);
  const global = enter(target, "this", "global", `harness:${name}`) as Record<
    string,
    unknown
  >;
  return { ...target, global };
}

function readPinned(root: string, relative: string): string {
  // Only the two fixed relative names above ever reach this join.
  return readFileSync(join(root, relative), "utf8");
}

/**
 * Load the library and the shuttle AI. The library context's global becomes
 * `worldScripts["oolite-libPriorityAI"]`; the role context's global is the
 * ship's `AIScript` (attached through `host.attach`).
 */
export function loadAiLibrary(oolitePath: string, host: StubHost): LoadedAi {
  const library = makeContext("library", host, {});
  enter(
    library,
    readPinned(oolitePath, LIBRARY_FILE),
    `load ${LIBRARY_FILE}`,
    LIBRARY_FILE,
  );
  host.worldScripts["oolite-libPriorityAI"] = library.global;

  const role = makeContext("role", host, { ship: host.ship });
  enter(
    role,
    readPinned(oolitePath, ROLE_FILE),
    `load ${ROLE_FILE}`,
    ROLE_FILE,
  );
  host.attach(role);
  return { library, role };
}
