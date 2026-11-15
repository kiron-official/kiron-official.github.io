import { useEffect, useState } from 'react';
import { PortalState, STORAGE_KEY } from './types';
import { getDefaultState, loadState, readDataUrl } from './utils';

const DB_NAME = 'kiron_portal_db';
const DB_VERSION = 2;
const STORE_NAME = 'portal';
const MEDIA_STORE = 'media';
const STATE_KEY = 'state';

const blobUrlCache = new Map<string, string>();

function openPortalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

function normalizeState(raw: unknown): PortalState {
  const def = getDefaultState();
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Partial<PortalState>;
  return {
    avatar: typeof r.avatar === 'string' ? r.avatar : def.avatar,
    bio: typeof r.bio === 'string' ? r.bio : '',
    socials: {
      facebook: r.socials?.facebook ?? def.socials.facebook,
      whatsapp: r.socials?.whatsapp ?? def.socials.whatsapp,
      tiktok: r.socials?.tiktok ?? def.socials.tiktok,
      telegram: r.socials?.telegram ?? def.socials.telegram,
      wechat: r.socials?.wechat ?? def.socials.wechat,
      youtube: r.socials?.youtube ?? def.socials.youtube,
      instagram: r.socials?.instagram ?? def.socials.instagram,
    },
    posts: Array.isArray(r.posts) ? r.posts : [],
    photos: Array.isArray(r.photos) ? r.photos : [],
    videos: Array.isArray(r.videos) ? r.videos : [],
    apks: Array.isArray(r.apks) ? r.apks : [],
  };
}

export async function loadPortalStateAsync(): Promise<PortalState> {
  try {
    const db = await openPortalDb();
    const idbData = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(STATE_KEY);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    });
    db.close();
    if (idbData && typeof idbData === 'object') {
      return normalizeState(idbData);
    }
  } catch {
    // Fall back to localStorage
  }

  const lsState = loadState();
  await savePortalStateAsync(lsState);
  return lsState;
}

export async function savePortalStateAsync(
  state: PortalState
): Promise<{ ok: boolean; error?: string }> {
  let savedToIdb = false;
  let savedToLs = false;

  try {
    const db = await openPortalDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(state, STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
    });
    db.close();
    savedToIdb = true;
  } catch {
    savedToIdb = false;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    savedToLs = true;
  } catch {
    savedToLs = false;
  }

  if (savedToIdb || savedToLs) {
    return { ok: true };
  }
  return {
    ok: false,
    error: 'Browser storage is full or unavailable. Try deleting unused media.',
  };
}

export async function saveMediaBlob(id: string, blob: Blob): Promise<string> {
  const ref = `idb:${id}`;
  const existing = blobUrlCache.get(ref);
  if (existing) {
    URL.revokeObjectURL(existing);
  }
  blobUrlCache.set(ref, URL.createObjectURL(blob));

  const db = await openPortalDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    tx.objectStore(MEDIA_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to store media'));
  });
  db.close();
  return ref;
}

export async function deleteMediaBlob(ref?: string): Promise<void> {
  if (!ref || !ref.startsWith('idb:')) return;
  const id = ref.slice(4);
  const cached = blobUrlCache.get(ref);
  if (cached) {
    URL.revokeObjectURL(cached);
    blobUrlCache.delete(ref);
  }
  try {
    const db = await openPortalDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      tx.objectStore(MEDIA_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Ignore cleanup failures
  }
}

export async function resolveMediaUrl(src?: string): Promise<string> {
  if (!src) return '';
  if (!src.startsWith('idb:')) return src;

  const cached = blobUrlCache.get(src);
  if (cached) return cached;

  const id = src.slice(4);
  try {
    const db = await openPortalDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const req = tx.objectStore(MEDIA_STORE).get(id);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (blob instanceof Blob) {
      const objUrl = URL.createObjectURL(blob);
      blobUrlCache.set(src, objUrl);
      return objUrl;
    }
  } catch {
    return '';
  }
  return '';
}

export function useMediaUrl(src?: string): string {
  const [resolved, setResolved] = useState<string>(() => {
    if (!src) return '';
    if (!src.startsWith('idb:')) return src;
    return blobUrlCache.get(src) || '';
  });

  useEffect(() => {
    let active = true;
    if (!src) {
      setResolved('');
      return;
    }
    if (!src.startsWith('idb:')) {
      setResolved(src);
      return;
    }
    const cached = blobUrlCache.get(src);
    if (cached) {
      setResolved(cached);
      return;
    }
    resolveMediaUrl(src).then((url) => {
      if (active) setResolved(url);
    });
    return () => {
      active = false;
    };
  }, [src]);

  return resolved;
}

export async function compressImageFile(
  file: File,
  maxDim = 960,
  quality = 0.76
): Promise<string> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    const raw = await readDataUrl(file);
    return raw.length <= 420000 ? raw : '';
  }
  const rawUrl = await readDataUrl(file);
  if (!rawUrl) return '';

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const renderWith = (dim: number, q: number): string => {
          let { width, height } = img;
          if (width > height && width > dim) {
            height = Math.round((height * dim) / width);
            width = dim;
          } else if (height > dim) {
            width = Math.round((width * dim) / height);
            height = dim;
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) return rawUrl;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', q) || rawUrl;
        };

        if (img.width <= maxDim && img.height <= maxDim && rawUrl.length <= 320000) {
          resolve(rawUrl);
          return;
        }

        let out = renderWith(maxDim, quality);
        if (out.length > 410000) out = renderWith(Math.min(maxDim, 760), 0.64);
        if (out.length > 410000) out = renderWith(560, 0.52);
        if (out.length > 430000) out = renderWith(420, 0.45);
        resolve(out);
      } catch {
        resolve(rawUrl.length <= 430000 ? rawUrl : '');
      }
    };
    img.onerror = () => resolve(rawUrl.length <= 430000 ? rawUrl : '');
    img.src = rawUrl;
  });
}
