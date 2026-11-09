// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The F4 Interfaces text is a literal in `station-model.ts` because the content
 * build does not compile the Oolite `interfaces-*` description keys. This guard
 * pins both strings to the vendored `descriptions.plist`, so a drift in either
 * the literal or the vendored input fails here.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  INTERFACES_EMPTY_TEXT,
  INTERFACES_TITLE,
  buildInterfacesModel,
} from "../../src/ui/station-model.js";

const PLIST = readFileSync(
  join(process.cwd(), "third_party/oolite/Config/descriptions.plist"),
  "utf8",
);

function plistValue(key: string): string | undefined {
  for (const line of PLIST.split("\n")) {
    const match = /^\s*"([^"]+)"\s*=\s*"(.*)";\s*$/.exec(line);
    if (match?.[1] === key) return match[2];
  }
  return undefined;
}

describe("Interfaces screen text", () => {
  it("matches the vendored descriptions.plist verbatim", () => {
    expect(plistValue("interfaces-title")).toBe(INTERFACES_TITLE);
    expect(plistValue("interfaces-no-interfaces-available-for-use")).toBe(
      INTERFACES_EMPTY_TEXT,
    );
  });

  it("builds a model holding exactly those two strings", () => {
    expect(buildInterfacesModel()).toEqual({
      title: "Ship and System Interfaces",
      emptyText:
        "No interfaces are installed on your ship or enabled at this station",
    });
  });
});
