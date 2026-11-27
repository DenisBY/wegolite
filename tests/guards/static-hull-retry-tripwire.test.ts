// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tripwire: the static hull loaders cache their rejection (todo
 * `2026-11-27-static-hull-load-retry`, plan 22.1-09 Issues Encountered, closed
 * out in plan 22.1-13).
 *
 * `loadStationHulls` and `loadStaticHulls` memoise the promise of a lazy hull
 * artifact. A failed load (a dropped chunk fetch) is memoised too, so every
 * later ask returns the same rejection until the page is reloaded, although
 * `ensureStationHulls` is written to ask again. That is accepted for Phase
 * 22.1 and recorded in the todo. This guard keeps the todo from being
 * forgotten in either direction:
 *
 * - the loaders start to evict a rejected load: the fix landed, so the todo
 *   must be closed and this guard deleted (the first assertion fails);
 * - the loaders stop memoising altogether: the loaders changed shape, so the
 *   todo's premise has to be re-read (the second assertion fails).
 *
 * It keys on tokens of the module, so it is green on the current tree and each
 * trigger has a synthetic input that fails. It is a tripwire, not a proof: an
 * eviction spelled without the tokens is not seen.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

const MODULE = "src/content/ships-static-hulls.ts";

const TODO = ".planning/todos/pending/2026-11-27-static-hull-load-retry.md";

/** What a loader module does with a rejected load. */
type LoaderBehaviour = "keeps-rejection" | "evicts-rejection" | "no-memo";

const MEMO_TOKENS = [
  /\bcachedArtifact\s*\?\?=\s*readArtifact\(/,
  /\bcachedStations\.set\(/,
];

const EVICTION_TOKENS = [
  /\.catch\(/,
  /\bcachedStations\.delete\(/,
  /\bcachedArtifact\s*=\s*undefined\b/,
];

/** Classify the code (comments removed) of a hull loader module. */
function loaderBehaviour(source: string): LoaderBehaviour {
  const code = withoutComments(source);
  if (!MEMO_TOKENS.every((token) => token.test(code))) return "no-memo";
  return EVICTION_TOKENS.some((token) => token.test(code))
    ? "evicts-rejection"
    : "keeps-rejection";
}

const KEEPS = `
let cachedArtifact: Promise<X> | undefined;
export function loadStaticHulls() { cachedArtifact ??= readArtifact("a"); return cachedArtifact; }
const cachedStations = new Map();
export function loadStationHulls(kind) {
  let cached = cachedStations.get(kind);
  if (cached === undefined) { cached = readArtifact("b"); cachedStations.set(kind, cached); }
  return cached;
}
`;

const EVICTS_BY_CATCH = KEEPS.replace(
  'readArtifact("b");',
  'readArtifact("b").catch((e) => { cachedStations.delete(kind); throw e; });',
);

const EVICTS_BY_RESET = KEEPS.replace(
  'cachedArtifact ??= readArtifact("a");',
  'cachedArtifact ??= readArtifact("a"); cachedArtifact = undefined;',
);

const NO_MEMO = `
export function loadStationHulls(kind) { return readArtifact(kind); }
`;

describe("the static hull loaders cache their rejection (todo 2026-11-27-static-hull-load-retry)", () => {
  it("classifies a memoising loader that keeps a rejection, one that evicts it, and one that does not memoise", () => {
    expect(loaderBehaviour(KEEPS)).toBe("keeps-rejection");
    expect(loaderBehaviour(EVICTS_BY_CATCH)).toBe("evicts-rejection");
    expect(loaderBehaviour(EVICTS_BY_RESET)).toBe("evicts-rejection");
    expect(loaderBehaviour(NO_MEMO)).toBe("no-memo");
  });

  it("ignores an eviction token that appears only in a comment", () => {
    const commented = `// a .catch( here would evict, and cachedStations.delete( too\n${KEEPS}`;
    expect(loaderBehaviour(commented)).toBe("keeps-rejection");
  });

  it(`still keeps a rejected load in ${MODULE}: when it evicts, the fix landed, so move ${TODO} to .planning/todos/completed and delete this guard`, () => {
    const behaviour = loaderBehaviour(
      readFileSync(join(REPO_ROOT, MODULE), "utf8"),
    );
    expect(
      behaviour,
      `${MODULE} ${
        behaviour === "evicts-rejection"
          ? `now evicts a rejected load: the retry fix landed, so close ${TODO} (move it to .planning/todos/completed) and delete this guard`
          : `no longer memoises its hull loads the way ${TODO} describes: re-read the todo, then update or delete this guard`
      }`,
    ).toBe("keeps-rejection");
  });
});
