// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * One shared ESLint Node API instance for the guard tests.
 *
 * The root config uses `recommendedTypeChecked`, so every `npx eslint` spawn
 * rebuilt a TypeScript program (~3.5 s). The guard suite spawned it 17 times,
 * which dominated the unit run. `lintText` reuses that program across calls —
 * including probes created and deleted between calls — so all guard files lint
 * through a single instance and pay the build once per Vitest worker.
 *
 * The returned shape mirrors the old `spawnSync` result: `status` is 0 or 1,
 * `output` concatenates each `ruleId` with its message (the configured custom
 * messages carry the reasons the assertions match), and `messages` exposes the
 * structured form for assertions that name a rule or a `messageId`. The real
 * root config still runs, so the zones stay genuinely enforced.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ESLint } from "eslint";

const REPO_ROOT = process.cwd();

export interface GateMessage {
  ruleId: string | null;
  message: string;
  messageId: string | null;
}

export interface GateRun {
  status: number;
  output: string;
  messages: GateMessage[];
}

// Vitest isolates modules per test file, so this is one program per guard file
// rather than one for the whole suite — still far cheaper than one per probe.
let shared: ESLint | undefined;

function gate(): ESLint {
  shared ??= new ESLint({ cwd: REPO_ROOT });
  return shared;
}

/** Lint an existing probe through the real root config, zone rules included. */
export async function lintProbe(file: string): Promise<GateRun> {
  const absolute = join(REPO_ROOT, file);
  const results = await gate().lintText(readFileSync(absolute, "utf8"), {
    filePath: absolute,
  });
  const messages: GateMessage[] = results.flatMap((result) =>
    result.messages.map((message) => ({
      ruleId: message.ruleId,
      message: message.message,
      messageId: message.messageId ?? null,
    })),
  );
  return {
    status: results.some((result) => result.errorCount > 0) ? 1 : 0,
    output: messages
      .map((message) => `${message.ruleId ?? ""} ${message.message}`)
      .join("\n"),
    messages,
  };
}
