// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The session-source helper is the reader behind two source scans, so it is
 * proven here to be non-vacuous and order-stable (D-12 step 0).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  SESSION_FACADE,
  sessionSource,
  sessionSourceFiles,
  sessionSources,
} from "../helpers/session-source.js";

const roots: string[] = [];

function tempRoot(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "wegolite-session-source-"));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    const absolute = path.join(root, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

describe("the session source helper", () => {
  it("lists exactly the facade before the split has started", () => {
    expect(sessionSourceFiles()).toEqual(["src/app/game-session.ts"]);
    expect(SESSION_FACADE).toBe("src/app/game-session.ts");
  });

  it("orders the facade and the session modules by code unit, recursively", () => {
    const root = tempRoot({
      "src/app/game-session.ts": "// facade\n",
      "src/app/session/b.ts": "// b\n",
      "src/app/session/a.ts": "// a\n",
      "src/app/session/nested/c.ts": "// c\n",
      "src/app/session/notes.md": "not a source\n",
    });
    expect(sessionSourceFiles(root)).toEqual([
      "src/app/game-session.ts",
      "src/app/session/a.ts",
      "src/app/session/b.ts",
      "src/app/session/nested/c.ts",
    ]);
  });

  it("returns each file's text and joins them behind marker lines", () => {
    const root = tempRoot({
      "src/app/game-session.ts": "facade\n",
      "src/app/session/a.ts": "alpha\n",
    });
    expect(sessionSources(root)).toEqual([
      { path: "src/app/game-session.ts", text: "facade\n" },
      { path: "src/app/session/a.ts", text: "alpha\n" },
    ]);
    expect(sessionSource(root)).toBe(
      "// ---- src/app/game-session.ts ----\nfacade\n\n// ---- src/app/session/a.ts ----\nalpha\n",
    );
  });

  it("throws when the facade is missing, even if session modules exist", () => {
    const empty = tempRoot({});
    expect(() => sessionSourceFiles(empty)).toThrow(SESSION_FACADE);
    const orphan = tempRoot({ "src/app/session/a.ts": "// a\n" });
    expect(() => sessionSources(orphan)).toThrow(SESSION_FACADE);
    expect(() => sessionSource(orphan)).toThrow(SESSION_FACADE);
  });
});
