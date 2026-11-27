// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tripwire: the local agent skills stay unpublished but reach worktree agents.
 *
 * The skills are third-party text without recorded licences (QUAL-07), so they
 * are never committed. Their real directory is `.claude/skills/` (the only place
 * Claude Code discovers project skills; `.agents/skills` links to it), and GSD
 * executors run in harness worktrees that hold tracked files only. Two lines
 * keep both rules true: `.gitignore` ignores the directory, and
 * `.worktreeinclude` copies it into every new worktree. Claude Code copies only
 * paths that are also ignored, so the two lines must match.
 *
 * Read from the files, not from git: a worktree's `.git` points at a host path
 * the test container does not mount. `scripts/audit-release.sh` checks the
 * tracked paths with git.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

function patterns(file: string): string[] {
  return readFileSync(join(REPO_ROOT, file), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

describe("agent skills layout", () => {
  it("ignores the agent tooling so it is never published", () => {
    const ignored = patterns(".gitignore");
    expect(ignored).toContain(".agents/");
    expect(ignored).toContain(".claude/skills/");
    expect(ignored).toContain("skills-lock.json");
  });

  it("copies the skill directory into every new worktree", () => {
    expect(patterns(".worktreeinclude")).toContain(".claude/skills/");
  });

  it("copies only what is also ignored", () => {
    const ignored = new Set(patterns(".gitignore"));
    for (const pattern of patterns(".worktreeinclude")) {
      expect(ignored.has(pattern), `${pattern} is not in .gitignore`).toBe(
        true,
      );
    }
  });
});
