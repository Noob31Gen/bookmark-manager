// IndexedDB-backed storage for heavy page archives (full-page screenshots + MHTML snapshots).
// These blobs can be many MB each, so they are kept out of chrome.storage metadata
// (which is read/written as one big JSON object) and stored as native Blobs instead.

export interface PageArchive {
  id: string; // bookmark id (or pending key)
  url: string;
  title?: string;
  capturedAt: number;
  fullPage?: Blob;
  fullPageWidth?: number;
  fullPageHeight?: number;
  mhtml?: Blob;
}

const DB_NAME = "noob31_page_archives";
const STORE = "archives";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function putArchive(archive: PageArchive): Promise<void> {
  await tx("readwrite", (s) => s.put(archive));
}

export async function getArchive(id: string): Promise<PageArchive | undefined> {
  try {
    return await tx<PageArchive>("readonly", (s) => s.get(id));
  } catch {
    return undefined;
  }
}

export async function deleteArchives(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    await tx("readwrite", (s) => {
      ids.forEach((id) => s.delete(id));
    });
  } catch (err) {
    console.warn("Failed to delete page archives", err);
  }
}

// Move an archive to a new key (e.g. pending capture -> real bookmark id)
export async function renameArchive(fromId: string, toId: string): Promise<PageArchive | undefined> {
  const existing = await getArchive(fromId);
  if (!existing) return undefined;
  const moved = { ...existing, id: toId };
  await putArchive(moved);
  if (fromId !== toId) await deleteArchives([fromId]);
  return moved;
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
