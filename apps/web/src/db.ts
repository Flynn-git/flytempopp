/**
 * Local storage for imported collections, in IndexedDB on hovering.today's
 * origin. Nothing here leaves the browser. A server-side sync layer can sit
 * behind the same functions later.
 */

import { collectionKey, type CollectionSnapshot } from '@hovering/core';

const DB_NAME = 'hovering';
const DB_VERSION = 1;
const SNAPSHOTS = 'snapshots';

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SNAPSHOTS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveSnapshots(snapshots: CollectionSnapshot[]): Promise<void> {
  const tx = (await open()).transaction(SNAPSHOTS, 'readwrite');
  const store = tx.objectStore(SNAPSHOTS);
  for (const s of snapshots) store.put(s, collectionKey(s.collection));
  await done(tx);
}

export async function loadSnapshots(): Promise<CollectionSnapshot[]> {
  const tx = (await open()).transaction(SNAPSHOTS, 'readonly');
  const req = tx.objectStore(SNAPSHOTS).getAll();
  await done(tx);
  return req.result as CollectionSnapshot[];
}

export async function deletePlatform(platform: string): Promise<void> {
  const tx = (await open()).transaction(SNAPSHOTS, 'readwrite');
  const store = tx.objectStore(SNAPSHOTS);
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const r = store.getAllKeys();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  for (const k of keys) if (String(k).startsWith(`${platform}:`)) store.delete(k);
  await done(tx);
}
