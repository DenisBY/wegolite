// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The save-store port (D-13, D-14, T-04-26, T-04-28, T-04-48).
 *
 * A write is durable only when its IndexedDB transaction completes, so the port
 * reports a `WriteResult` from a commit rather than from a request's success.
 * Every operation carries a monotonic `revision`; a late completion whose
 * revision is not greater than the last committed one is a no-op, so a stale
 * write cannot resurrect a blob a New game has already cleared.
 *
 * The port is deliberately tiny and async: the app never awaits it from the
 * frame loop, and every failure is reported as data (`SaveReadResult.error` /
 * `WriteResult.reason`) instead of an exception escaping into the game.
 */

/** Where a boot read ended up. `unavailable` means the database may not open. */
export type SaveStatus =
  | "absent"
  | "valid"
  | "corrupt"
  | "future"
  | "unreadable"
  | "unavailable";

export type SaveReadResult =
  | { readonly kind: "absent" }
  | { readonly kind: "ok"; readonly raw: string }
  | { readonly kind: "error"; readonly reason: string };

export interface WriteResult {
  readonly committed: boolean;
  readonly revision: number;
  /** Why a write or clear was not committed; absent on success. */
  readonly reason?: string;
}

export interface SaveStore {
  /** Read the raw `autosave` value; the string is never decoded here. */
  read(): Promise<SaveReadResult>;
  /** Write the raw JSON and resolve only when the transaction commits. */
  write(json: string, revision: number): Promise<WriteResult>;
  /** Delete the autosave key and resolve only when the transaction commits. */
  clear(revision: number): Promise<WriteResult>;
  /** Copy a corrupt blob aside, best effort; never read back. */
  backupCorrupt(raw: string): Promise<void>;
  /** Close the database; later operations are no-ops. */
  dispose(): void;
}

/** The one database, object store and record key this build owns. */
export const SAVE_DB_NAME = "wegolite";
export const SAVE_DB_VERSION = 1;
export const SAVE_STORE_NAME = "saves";
export const AUTOSAVE_KEY = "autosave";
export const CORRUPT_SAVE_KEY = "autosave.corrupt";
