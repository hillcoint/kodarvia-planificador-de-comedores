import type { DemoSeed } from './types';
import { generateDemoSeed } from './seed';

export const MANYAR_DB_NAME = 'manyar-planner';
export const MANYAR_DB_VERSION = 1;

export type StoreName =
  | 'options'
  | 'diningRooms'
  | 'ratings'
  | 'menus'
  | 'events'
  | 'snapshots'
  | 'settings'
  | 'users';

const STORES: StoreName[] = [
  'options', 'diningRooms', 'ratings', 'menus', 'events', 'snapshots', 'settings', 'users',
];

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function indexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB != null;
}

export function openManyarDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!indexedDbAvailable()) {
      reject(new Error('IndexedDB no está disponible en este navegador'));
      return;
    }
    const request = indexedDB.open(MANYAR_DB_NAME, MANYAR_DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB está bloqueado por otra pestaña'));
    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains('options')) {
        const store = db.createObjectStore('options', { keyPath: 'id' });
        store.createIndex('time', 'time', { unique: false });
      }
      if (!db.objectStoreNames.contains('diningRooms')) {
        const store = db.createObjectStore('diningRooms', { keyPath: 'id' });
        store.createIndex('active', 'active', { unique: false });
      }
      if (!db.objectStoreNames.contains('ratings')) {
        const store = db.createObjectStore('ratings', { keyPath: 'id' });
        store.createIndex('diningRoomId', 'diningRoomId', { unique: false });
        store.createIndex('optionId', 'optionId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('diningRoomOptionDate', ['diningRoomId', 'optionId', 'date'], { unique: false });
      }
      if (!db.objectStoreNames.contains('menus')) {
        const store = db.createObjectStore('menus', { keyPath: 'id' });
        store.createIndex('diningRoomId', 'diningRoomId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('diningRoomDate', ['diningRoomId', 'date'], { unique: false });
      }
      if (!db.objectStoreNames.contains('events')) {
        const store = db.createObjectStore('events', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('entity', ['entityType', 'entityId'], { unique: false });
        store.createIndex('userId', 'userId', { unique: false });
      }
      if (!db.objectStoreNames.contains('snapshots')) {
        const store = db.createObjectStore('snapshots', { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('users')) db.createObjectStore('users', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function getAllFromStore<T>(storeName: StoreName): Promise<T[]> {
  const db = await openManyarDb();
  try {
    const transaction = db.transaction(storeName, 'readonly');
    return await requestResult(transaction.objectStore(storeName).getAll()) as T[];
  } finally {
    db.close();
  }
}

export async function getFromStore<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openManyarDb();
  try {
    const transaction = db.transaction(storeName, 'readonly');
    return await requestResult(transaction.objectStore(storeName).get(key)) as T | undefined;
  } finally {
    db.close();
  }
}

export async function putInStore<T>(storeName: StoreName, value: T): Promise<void> {
  const db = await openManyarDb();
  try {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function deleteFromStore(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openManyarDb();
  try {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(key);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function countStore(storeName: StoreName): Promise<number> {
  const db = await openManyarDb();
  try {
    const transaction = db.transaction(storeName, 'readonly');
    return await requestResult(transaction.objectStore(storeName).count());
  } finally {
    db.close();
  }
}

async function writeSeed(seed: DemoSeed): Promise<void> {
  const db = await openManyarDb();
  try {
    const transaction = db.transaction(STORES, 'readwrite');
    const map: Record<StoreName, unknown[]> = {
      options: seed.options,
      diningRooms: seed.diningRooms,
      ratings: seed.ratings,
      menus: seed.menus,
      events: seed.events,
      snapshots: seed.snapshots,
      settings: seed.settings,
      users: seed.users,
    };
    for (const storeName of STORES) {
      const store = transaction.objectStore(storeName);
      store.clear();
      for (const item of map[storeName]) store.put(item);
    }
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function ensureDemoData(): Promise<boolean> {
  if (!indexedDbAvailable()) throw new Error('IndexedDB no está disponible en este navegador');
  const rooms = await countStore('diningRooms');
  if (rooms > 0) return false;
  await writeSeed(generateDemoSeed());
  return true;
}

export async function resetDemoData(): Promise<void> {
  if (!indexedDbAvailable()) throw new Error('IndexedDB no está disponible en este navegador');
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(MANYAR_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('No se pudo borrar IndexedDB'));
    request.onblocked = () => reject(new Error('Cerrá las otras pestañas de Manyar para restaurar los datos'));
  });
  await writeSeed(generateDemoSeed());
}
