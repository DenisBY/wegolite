// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The New-game confirmation policy (G-04-3, T-04-60).
 *
 * The predicate is the only place the boot status becomes a prompt. It must ask
 * exactly for the statuses `GameSession.clearSaveForNewGame` may delete
 * (`valid`, `corrupt`) and stay silent for the rest, so an untouchable blob can
 * never produce a prompt that promises a deletion which never happens.
 */

import { describe, expect, it } from "vitest";

import type { SaveStatus } from "../../src/persistence/store.js";
import { shouldConfirmNewGame } from "../../src/ui/title.js";

const CASES: ReadonlyArray<{ status: SaveStatus; expected: boolean }> = [
  { status: "valid", expected: true },
  { status: "corrupt", expected: true },
  { status: "absent", expected: false },
  { status: "future", expected: false },
  { status: "unreadable", expected: false },
  { status: "unavailable", expected: false },
];

describe("shouldConfirmNewGame", () => {
  it.each(CASES)(
    "returns $expected for the $status status",
    ({ status, expected }) => {
      expect(shouldConfirmNewGame(status)).toBe(expected);
    },
  );

  it("covers every SaveStatus at least once", () => {
    expect(new Set(CASES.map((entry) => entry.status)).size).toBe(6);
  });
});
