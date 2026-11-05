// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The in-memory save store (T-04-48, Pitfall: no `fake-indexeddb`).
 *
 * It implements the same commit/revision contract as the browser adapter, so
 * the autosave and restore paths are proved in Node without a new dependency.
 * Playwright is the only place real IndexedDB is exercised.
 */

import { boundCorruptBackup } from "./save.js";
import type { SaveReadResult, SaveStore, WriteResult } from "./store.js";

export interface MemorySaveStoreOptions {
  /** Resolve writes as a swallowed failure instead of committing. */
  readonly failWrites?: boolean;
  /** Reject writes outright, so a caller must catch them. */
  readonly rejectWrites?: boolean;
  /** Start with a raw blob already stored (a previous session's save). */
  readonly raw?: string;
}

export class MemorySaveStore implements SaveStore {
  /** The raw blobs that actually committed, in order. */
  readonly writes: string[] = [];
  /** How many clears committed. */
  clears = 0;
  /** Every corrupt blob handed to `backupCorrupt`, in order. */
  readonly backups: string[] = [];
  /** The highest revision that was applied. */
  committedRevision = 0;

  private stored: string | null;
  private disposed = false;
  private readonly failWrites: boolean;
  private readonly rejectWrites: boolean;

  constructor(options: MemorySaveStoreOptions = {}) {
    this.failWrites = options.failWrites === true;
    this.rejectWrites = options.rejectWrites === true;
    this.stored = options.raw ?? null;
  }

  /** The raw blob currently stored, for assertions. */
  get raw(): string | null {
    return this.stored;
  }

  read(): Promise<SaveReadResult> {
    if (this.disposed) {
      return Promise.resolve({ kind: "error", reason: "disposed" });
    }
    return Promise.resolve(
      this.stored === null
        ? { kind: "absent" }
        : { kind: "ok", raw: this.stored },
    );
  }

  write(json: string, revision: number): Promise<WriteResult> {
    if (this.disposed) {
      return Promise.resolve({
        committed: false,
        revision,
        reason: "disposed",
      });
    }
    if (this.rejectWrites) {
      return Promise.reject(new Error("save store rejected the write"));
    }
    if (this.failWrites) {
      return Promise.resolve({
        committed: false,
        revision,
        reason: "write-failed",
      });
    }
    if (revision <= this.committedRevision) {
      return Promise.resolve({ committed: false, revision, reason: "stale" });
    }
    this.stored = json;
    this.writes.push(json);
    this.committedRevision = revision;
    return Promise.resolve({ committed: true, revision });
  }

  clear(revision: number): Promise<WriteResult> {
    if (this.disposed) {
      return Promise.resolve({
        committed: false,
        revision,
        reason: "disposed",
      });
    }
    if (revision <= this.committedRevision) {
      return Promise.resolve({ committed: false, revision, reason: "stale" });
    }
    this.stored = null;
    this.clears += 1;
    this.committedRevision = revision;
    return Promise.resolve({ committed: true, revision });
  }

  backupCorrupt(raw: string): Promise<void> {
    if (!this.disposed) this.backups.push(boundCorruptBackup(raw));
    return Promise.resolve();
  }

  dispose(): void {
    this.disposed = true;
  }
}
