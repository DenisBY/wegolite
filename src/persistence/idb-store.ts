// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The IndexedDB save adapter (D-13, D-14, T-04-26, T-04-28, T-04-48, T-04-51).
 *
 * Three properties are non-negotiable here:
 *
 * 1. **Commit, not request success.** A write resolves on the transaction's
 *    `oncomplete` and rejects on `onabort`/`onerror`. Resolving on the `put`
 *    request would let a reload race the transaction and lose the save.
 * 2. **One serialized queue.** Every operation chains onto a single promise, so
 *    a launch write, a purchase write and a New-game clear can never interleave
 *    transactions on the same key. A monotonic revision makes a late completion
 *    a no-op instead of an overwrite.
 * 3. **Never fatal, never destructive.** A private-mode, quota, blocked or
 *    version-mismatched database must leave the game running. In particular a
 *    `VersionError` (an existing database newer than v1) marks the store
 *    unavailable and is never repaired by `deleteDatabase`.
 *
 * The adapter is ~130 lines of glue because one object store needs no wrapper
 * dependency (`idb` and `fake-indexeddb` are both outside this plan).
 */

import {
  AUTOSAVE_KEY,
  CORRUPT_SAVE_KEY,
  SAVE_DB_NAME,
  SAVE_DB_VERSION,
  SAVE_STORE_NAME,
} from "./store.js";
import { boundCorruptBackup } from "./save.js";
import type { SaveReadResult, SaveStore, WriteResult } from "./store.js";

/** An open/transaction failure, carrying the short reason the probe reports. */
class StoreUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "StoreUnavailableError";
  }
}

function reasonOf(error: unknown): string {
  if (error instanceof StoreUnavailableError) return error.reason;
  if (error instanceof Error) return error.message;
  return String(error);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export interface IndexedDbSaveStoreOptions {
  /** Injectable factory; defaults to the global `indexedDB`. */
  readonly factory?: IDBFactory | undefined;
}

export function createIndexedDbSaveStore(
  options: IndexedDbSaveStoreOptions = {},
): SaveStore {
  const factory =
    options.factory ??
    (typeof indexedDB === "undefined" ? undefined : indexedDB);

  let openPromise: Promise<IDBDatabase> | undefined;
  let connection: IDBDatabase | undefined;
  let disposed = false;
  let committedRevision = 0;
  let queue: Promise<unknown> = Promise.resolve();

  function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (factory === undefined) {
        reject(new StoreUnavailableError("unavailable"));
        return;
      }

      let request: IDBOpenDBRequest;
      try {
        request = factory.open(SAVE_DB_NAME, SAVE_DB_VERSION);
      } catch {
        // A throwing `open` is a security/private-mode denial, not a bug.
        reject(new StoreUnavailableError("unavailable"));
        return;
      }

      // `blocked` rejects the open, but the request may still fire `onsuccess`
      // later; that connection must be closed or it leaks for the session.
      let blocked = false;

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SAVE_STORE_NAME)) {
          db.createObjectStore(SAVE_STORE_NAME);
        }
      };
      request.onblocked = () => {
        blocked = true;
        reject(new StoreUnavailableError("blocked"));
      };
      request.onerror = () => {
        // T-04-51: a newer database is reported, never deleted or recreated.
        const name = request.error?.name;
        reject(
          new StoreUnavailableError(
            name === "VersionError" ? "version" : "unavailable",
          ),
        );
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked || disposed) {
          db.close();
          if (disposed) reject(new StoreUnavailableError("disposed"));
          return;
        }
        connection = db;
        resolve(db);
      };
    });
  }

  function getDatabase(): Promise<IDBDatabase> {
    // One shared promise per store: a failed open is remembered as unavailable
    // for the rest of the session rather than retried on every autosave.
    openPromise ??= openDatabase();
    return openPromise;
  }

  /**
   * Serialize one operation. The runner never rejects: a failure becomes the
   * caller's fallback value, which is what keeps a full quota out of the frame
   * loop.
   */
  function enqueue<T>(
    run: () => Promise<T>,
    fallback: (reason: string) => T,
  ): Promise<T> {
    const result = queue.then(async () => {
      if (disposed) return fallback("disposed");
      try {
        return await run();
      } catch (error) {
        return fallback(reasonOf(error));
      }
    });
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function runTransaction(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction(SAVE_STORE_NAME, mode);
      } catch (error) {
        reject(asError(error));
        return;
      }

      // `oncomplete` is the durability boundary (T-04-48).
      transaction.oncomplete = () => {
        resolve();
      };
      transaction.onabort = () => {
        reject(transaction.error ?? new Error("aborted"));
      };
      transaction.onerror = () => {
        reject(transaction.error ?? new Error("error"));
      };

      try {
        work(transaction.objectStore(SAVE_STORE_NAME));
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // Already aborting or finished; the original error is the report.
        }
        reject(asError(error));
      }
    });
  }

  return {
    read(): Promise<SaveReadResult> {
      return enqueue<SaveReadResult>(
        async () => {
          const db = await getDatabase();
          const raw = await new Promise<string | null>((resolve, reject) => {
            let transaction: IDBTransaction;
            try {
              transaction = db.transaction(SAVE_STORE_NAME, "readonly");
            } catch (error) {
              reject(asError(error));
              return;
            }
            const request = transaction
              .objectStore(SAVE_STORE_NAME)
              .get(AUTOSAVE_KEY);
            request.onsuccess = () => {
              const value: unknown = request.result;
              if (value === undefined || value === null) resolve(null);
              else if (typeof value === "string") resolve(value);
              // We only ever write strings. Anything else is an untrusted shape
              // this build will not guess at; the caller treats it as absent.
              else reject(new Error("save-shape"));
            };
            request.onerror = () => {
              reject(request.error ?? new Error("read-failed"));
            };
            transaction.onabort = () => {
              reject(transaction.error ?? new Error("aborted"));
            };
          });
          return raw === null
            ? ({ kind: "absent" } as const)
            : ({ kind: "ok", raw } as const);
        },
        (reason) => ({ kind: "error", reason }),
      );
    },

    write(json: string, revision: number): Promise<WriteResult> {
      return enqueue<WriteResult>(
        async () => {
          if (revision <= committedRevision) {
            return { committed: false, revision, reason: "stale" };
          }
          const db = await getDatabase();
          await runTransaction(db, "readwrite", (store) => {
            store.put(json, AUTOSAVE_KEY);
          });
          committedRevision = revision;
          return { committed: true, revision };
        },
        (reason) => ({ committed: false, revision, reason }),
      );
    },

    clear(revision: number): Promise<WriteResult> {
      return enqueue<WriteResult>(
        async () => {
          if (revision <= committedRevision) {
            return { committed: false, revision, reason: "stale" };
          }
          const db = await getDatabase();
          await runTransaction(db, "readwrite", (store) => {
            store.delete(AUTOSAVE_KEY);
          });
          committedRevision = revision;
          return { committed: true, revision };
        },
        (reason) => ({ committed: false, revision, reason }),
      );
    },

    backupCorrupt(raw: string): Promise<void> {
      return enqueue<void>(
        async () => {
          const db = await getDatabase();
          await runTransaction(db, "readwrite", (store) => {
            store.put(boundCorruptBackup(raw), CORRUPT_SAVE_KEY);
          });
        },
        () => undefined,
      );
    },

    dispose(): void {
      disposed = true;
      const current = connection;
      connection = undefined;
      try {
        current?.close();
      } catch {
        // An already-closed connection is exactly the desired state.
      }
      // Close a connection that resolves after disposal, so no earlier open can
      // leave the database locked for the next page.
      void openPromise
        ?.then((db) => {
          db.close();
        })
        .catch(() => undefined);
    },
  };
}
