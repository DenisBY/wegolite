// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The raw IndexedDB save-store seam (SAVE-06, D-19).
 *
 * The fidelity proofs must read and restore the exact bytes the app persisted,
 * not a parsed or re-encoded value. This helper is the one copy of the database
 * shape (`wegolite` / `saves` / `autosave`); a spec must never import another
 * spec, so the helpers live here instead of in `autosave.spec.ts`.
 */

import type { Page } from "@playwright/test";

export const SAVE_DB = "wegolite";
export const SAVE_STORE = "saves";
export const AUTOSAVE_KEY = "autosave";

/** Read a raw value, or `null` when the record is absent. */
export async function readRaw(
  page: Page,
  key: string = AUTOSAVE_KEY,
): Promise<string | null> {
  return page.evaluate(
    (payload: { key: string; db: string; store: string }) =>
      new Promise<string | null>((resolve, reject) => {
        const request = indexedDB.open(payload.db, 1);
        request.onerror = () => {
          reject(new Error(`open failed: ${String(request.error)}`));
        };
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(payload.store)) {
            db.close();
            resolve(null);
            return;
          }
          const transaction = db.transaction(payload.store, "readonly");
          const get = transaction.objectStore(payload.store).get(payload.key);
          get.onsuccess = () => {
            const value: unknown = get.result;
            db.close();
            resolve(typeof value === "string" ? value : null);
          };
          get.onerror = () => {
            db.close();
            reject(new Error(`read failed: ${String(get.error)}`));
          };
        };
      }),
    { key, db: SAVE_DB, store: SAVE_STORE },
  );
}

/** Write a raw value into the save database from outside the app. */
export async function writeRaw(
  page: Page,
  raw: string,
  key: string = AUTOSAVE_KEY,
): Promise<void> {
  await page.evaluate(
    (payload: { raw: string; key: string; db: string; store: string }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(payload.db, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(payload.store)) {
            db.createObjectStore(payload.store);
          }
        };
        request.onerror = () => {
          reject(new Error(`open failed: ${String(request.error)}`));
        };
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(payload.store, "readwrite");
          transaction.objectStore(payload.store).put(payload.raw, payload.key);
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => {
            reject(new Error(`write failed: ${String(transaction.error)}`));
          };
          transaction.onabort = () => {
            reject(new Error(`write aborted: ${String(transaction.error)}`));
          };
        };
      }),
    { raw, key, db: SAVE_DB, store: SAVE_STORE },
  );
}
