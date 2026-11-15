import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
} from 'firebase/firestore';
import {
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';
import {
  ADMIN_PASS_HASH,
  ApkItem,
  CommentItem,
  DEFAULT_BASE_LIKES,
  DEFAULT_SOCIALS,
  LikeCollectionName,
  LikeInfo,
  PhotoItem,
  PostCategory,
  PostItem,
  SocialLinks,
  VideoItem,
} from './types';
import { formatEnglishPostDate, readDataUrl } from './utils';

function resolveEnglishDate(raw: unknown, serverTs: unknown): string {
  const str = typeof raw === 'string' ? raw.trim() : '';
  if (/^\d{2}\.\d{2}\.\d{4}\s-\s[A-Z]{3}$/.test(str)) {
    return str;
  }
  if (
    serverTs &&
    typeof (serverTs as { toDate?: () => Date }).toDate === 'function'
  ) {
    try {
      return formatEnglishPostDate(
        (serverTs as { toDate: () => Date }).toDate()
      );
    } catch {
      // Fall back to stored string
    }
  }
  return str;
}

export const MAX_FIRESTORE_MEDIA_CHARS = 430000;
export const MAX_FIRESTORE_BINARY_BYTES = 500 * 1024;
export const MAX_GALLERY_VIDEO_BYTES = 100 * 1024 * 1024;
const SESSION_PASS_KEY = 'kiron_admin_session_pass';
const VIDEO_CLOUD_CFG_KEY = 'kiron_cloudinary_cfg_v1';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const storage = getStorage(app);

export interface VideoCloudConfig {
  cloudName: string;
  uploadPreset: string;
}

export function getVideoCloudConfig(): VideoCloudConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(VIDEO_CLOUD_CFG_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        cloudName: typeof raw.cloudName === 'string' ? raw.cloudName.trim() : '',
        uploadPreset:
          typeof raw.uploadPreset === 'string' ? raw.uploadPreset.trim() : '',
      };
    }
  } catch {
    // Ignore storage restriction
  }
  return { cloudName: '', uploadPreset: '' };
}

export function saveVideoCloudConfig(cfg: VideoCloudConfig): void {
  try {
    const clean: VideoCloudConfig = {
      cloudName: cfg.cloudName.trim(),
      uploadPreset: cfg.uploadPreset.trim(),
    };
    if (!clean.cloudName && !clean.uploadPreset) {
      localStorage.removeItem(VIDEO_CLOUD_CFG_KEY);
    } else {
      localStorage.setItem(VIDEO_CLOUD_CFG_KEY, JSON.stringify(clean));
    }
  } catch {
    // Ignore storage restriction
  }
}

function uploadToCloudinary(
  file: File,
  cfg: VideoCloudConfig,
  onProgress?: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/video/upload`;
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', cfg.uploadPreset);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0 && onProgress) {
        onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      }
    };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText || '{}') as {
          secure_url?: string;
          error?: { message?: string };
        };
        if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) {
          onProgress?.(100);
          resolve(res.secure_url);
        } else {
          reject(
            new Error(
              `UPLOAD_ERROR:${res.error?.message || `Video upload failed (HTTP ${xhr.status}). Check Cloud Name and Unsigned Preset.`}`
            )
          );
        }
      } catch {
        reject(
          new Error(
            `UPLOAD_ERROR:Video upload failed (HTTP ${xhr.status}). Check Cloud Name and Unsigned Preset.`
          )
        );
      }
    };
    xhr.onerror = () => {
      reject(
        new Error(
          'UPLOAD_ERROR:Network error while uploading video. Check internet connection and try again.'
        )
      );
    };
    xhr.send(form);
  });
}

function uploadToFirebaseStorage(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'video.mp4';
    const fileRef = storageRef(storage, `videos/${Date.now()}-${safeName}`);
    const task = uploadBytesResumable(fileRef, file, {
      contentType: file.type || 'video/mp4',
    });
    task.on(
      'state_changed',
      (snap) => {
        if (snap.totalBytes > 0 && onProgress) {
          onProgress(
            Math.min(99, Math.round((snap.bytesTransferred / snap.totalBytes) * 100))
          );
        }
      },
      () => {
        reject(new Error('UPLOAD_ERROR:NEEDS_VIDEO_CLOUD_SETUP'));
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          onProgress?.(100);
          resolve(url);
        } catch {
          reject(new Error('UPLOAD_ERROR:NEEDS_VIDEO_CLOUD_SETUP'));
        }
      }
    );
  });
}

async function isFirebaseStorageReady(): Promise<boolean> {
  if (!firebaseConfig.storageBucket) return false;
  try {
    const res = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(firebaseConfig.storageBucket)}/o?maxResults=1`,
      { method: 'GET' }
    );
    return res.status !== 404;
  } catch {
    return false;
  }
}

async function compressShortVideoForFirestore(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string | null> {
  if (
    typeof document === 'undefined' ||
    typeof MediaRecorder === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return null;
  }

  const objUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = objUrl;

  try {
    const loaded = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 6000);
      video.onloadedmetadata = () => {
        clearTimeout(t);
        resolve(true);
      };
      video.onerror = () => {
        clearTimeout(t);
        resolve(false);
      };
    });

    if (
      !loaded ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      video.duration > 18
    ) {
      return null;
    }

    const maxW = 360;
    const vw = video.videoWidth || 360;
    const vh = video.videoHeight || 640;
    const scale = Math.min(1, maxW / vw);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(160, Math.round(vw * scale));
    canvas.height = Math.max(160, Math.round(vh * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.captureStream !== 'function') return null;

    const canvasStream = canvas.captureStream(18);
    const videoElAny = video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    };
    try {
      const elStream =
        typeof videoElAny.captureStream === 'function'
          ? videoElAny.captureStream()
          : typeof videoElAny.mozCaptureStream === 'function'
            ? videoElAny.mozCaptureStream()
            : null;
      if (elStream) {
        elStream.getAudioTracks().forEach((tr) => canvasStream.addTrack(tr));
      }
    } catch {
      // Proceed with video track only if audio capture is restricted
    }

    const mimeCandidates = [
      'video/mp4',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType =
      mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const targetBits = Math.min(
      320000,
      Math.max(85000, Math.floor((410 * 1024 * 8) / Math.max(2, video.duration)))
    );

    const recorder = new MediaRecorder(canvasStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: targetBits,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const blob = await new Promise<Blob | null>((resolve) => {
      let stopped = false;
      let rafId = 0;
      const finish = () => {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(rafId);
        clearTimeout(hardTimeout);
        try {
          if (recorder.state !== 'inactive') recorder.stop();
        } catch {
          resolve(null);
        }
      };

      const hardTimeout = setTimeout(
        finish,
        Math.ceil(video.duration * 1000) + 6000
      );

      recorder.onstop = () => {
        clearTimeout(hardTimeout);
        cancelAnimationFrame(rafId);
        if (!chunks.length) {
          resolve(null);
          return;
        }
        resolve(
          new Blob(chunks, {
            type: mimeType || 'video/webm',
          })
        );
      };

      recorder.onerror = () => {
        clearTimeout(hardTimeout);
        cancelAnimationFrame(rafId);
        resolve(null);
      };

      const drawFrame = () => {
        if (stopped) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (video.duration > 0 && onProgress) {
          onProgress(
            Math.min(95, Math.round((video.currentTime / video.duration) * 95))
          );
        }
        if (video.ended) {
          finish();
          return;
        }
        rafId = requestAnimationFrame(drawFrame);
      };

      video.onended = finish;
      recorder.start(250);
      video.play().then(drawFrame).catch(() => finish());
    });

    if (!blob || blob.size === 0 || blob.size > MAX_FIRESTORE_BINARY_BYTES) {
      return null;
    }

    const dataUrl = await readDataUrl(
      new File([blob], 'clip.mp4', { type: blob.type || 'video/webm' })
    );
    if (!dataUrl || dataUrl.length > 740000) return null;
    onProgress?.(100);
    return dataUrl;
  } finally {
    video.pause();
    video.removeAttribute('src');
    URL.revokeObjectURL(objUrl);
  }
}

export async function uploadGalleryVideo(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  if (file.size > MAX_GALLERY_VIDEO_BYTES) {
    throw new Error(
      `UPLOAD_ERROR:Video is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Maximum gallery video upload size is 100 MB.`
    );
  }

  if (file.size <= MAX_FIRESTORE_BINARY_BYTES) {
    const dataUrl = await readDataUrl(file);
    if (dataUrl && dataUrl.length <= 740000) {
      onProgress?.(100);
      return dataUrl;
    }
  }

  const cfg = getVideoCloudConfig();
  if (cfg.cloudName && cfg.uploadPreset) {
    return uploadToCloudinary(file, cfg, onProgress);
  }

  if (await isFirebaseStorageReady()) {
    return uploadToFirebaseStorage(file, onProgress);
  }

  const compressed = await compressShortVideoForFirestore(file, onProgress);
  if (compressed) {
    return compressed;
  }

  throw new Error('UPLOAD_ERROR:NEEDS_VIDEO_CLOUD_SETUP');
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

let inMemoryAdminPass: string | null = null;

export async function verifyAdminPasscode(passcode: string): Promise<boolean> {
  const clean = passcode.trim();
  if (!clean) return false;
  const hash = await sha256Hex(clean);
  if (hash !== ADMIN_PASS_HASH) return false;
  inMemoryAdminPass = clean;
  try {
    sessionStorage.setItem(SESSION_PASS_KEY, clean);
  } catch {
    // Ignore storage restriction
  }
  return true;
}

export async function restoreAdminSession(): Promise<boolean> {
  try {
    const saved = sessionStorage.getItem(SESSION_PASS_KEY);
    if (!saved) return false;
    return await verifyAdminPasscode(saved);
  } catch {
    return false;
  }
}

export function clearAdminSession(): void {
  inMemoryAdminPass = null;
  try {
    sessionStorage.removeItem(SESSION_PASS_KEY);
  } catch {
    // Ignore storage restriction
  }
}

async function requireAuthProof(scope: string): Promise<string> {
  let pass = inMemoryAdminPass;
  if (!pass) {
    try {
      pass = sessionStorage.getItem(SESSION_PASS_KEY);
    } catch {
      pass = null;
    }
  }
  if (!pass) {
    throw new Error('PERMISSION_DENIED: Admin session is locked.');
  }
  return sha256Hex(`${pass}:${scope}`);
}

export interface PublicSiteProfile {
  avatar: string;
  bio: string;
  socials: SocialLinks;
}

export function subscribePublicSiteProfile(
  onData: (profile: PublicSiteProfile) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'site/public';
  return onSnapshot(
    doc(db, 'site', 'public'),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      onData({
        avatar: typeof d.avatar === 'string' ? d.avatar : 'profile.jpg',
        bio: typeof d.bio === 'string' ? d.bio : '',
        socials: {
          facebook:
            typeof d.socials?.facebook === 'string'
              ? d.socials.facebook
              : DEFAULT_SOCIALS.facebook,
          whatsapp:
            typeof d.socials?.whatsapp === 'string'
              ? d.socials.whatsapp
              : DEFAULT_SOCIALS.whatsapp,
          tiktok:
            typeof d.socials?.tiktok === 'string' &&
            d.socials.tiktok.trim() !== 'https://www.tiktok.com' &&
            d.socials.tiktok.trim() !== 'https://tiktok.com'
              ? d.socials.tiktok
              : DEFAULT_SOCIALS.tiktok,
          telegram:
            typeof d.socials?.telegram === 'string'
              ? d.socials.telegram
              : DEFAULT_SOCIALS.telegram,
          wechat:
            typeof d.socials?.wechat === 'string' &&
            d.socials.wechat.trim() !== 'https://www.wechat.com' &&
            d.socials.wechat.trim() !== 'https://wechat.com'
              ? d.socials.wechat
              : DEFAULT_SOCIALS.wechat,
          youtube:
            typeof d.socials?.youtube === 'string'
              ? d.socials.youtube
              : DEFAULT_SOCIALS.youtube,
        },
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export async function savePublicSiteProfile(
  profile: PublicSiteProfile
): Promise<void> {
  const path = 'site/public';
  try {
    const authProof = await requireAuthProof('public');
    await setDoc(doc(db, 'site', 'public'), {
      avatar: (profile.avatar || '').slice(0, 450000),
      bio: (profile.bio || '').slice(0, 2000),
      socials: {
        facebook: (profile.socials.facebook || '').slice(0, 500),
        whatsapp: (profile.socials.whatsapp || '').slice(0, 500),
        tiktok: (profile.socials.tiktok || '').slice(0, 500),
        telegram: (profile.socials.telegram || '').slice(0, 500),
        wechat: (profile.socials.wechat || '').slice(0, 500),
        youtube: (profile.socials.youtube || '').slice(0, 500),
      },
      authProof,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribePosts(
  onData: (posts: Omit<PostItem, 'comments'>[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'posts';
  const q = query(collection(db, path), orderBy('createdServerAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .filter((docSnap) => docSnap.data().deleted !== true)
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: typeof d.id === 'string' ? d.id : docSnap.id,
            title: typeof d.title === 'string' ? d.title : 'POSTS',
            cat: (d.cat === 'Photo' || d.cat === 'Announcement'
              ? d.cat
              : 'Update') as PostCategory,
            body: typeof d.body === 'string' ? d.body : '',
            img: typeof d.img === 'string' && d.img ? d.img : undefined,
            videoUrl:
              typeof d.videoUrl === 'string' && d.videoUrl
                ? d.videoUrl
                : undefined,
            createdAt: resolveEnglishDate(d.createdAt, d.createdServerAt),
            baseLikes:
              typeof d.baseLikes === 'number' && Number.isFinite(d.baseLikes)
                ? d.baseLikes
                : DEFAULT_BASE_LIKES,
          };
        });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export async function createCloudPost(post: {
  id: string;
  title: string;
  cat: PostCategory;
  body: string;
  img?: string;
  videoUrl?: string;
  createdAt?: string;
  baseLikes?: number;
}): Promise<void> {
  const path = `posts/${post.id}`;
  try {
    const authProof = await requireAuthProof(post.id);
    await setDoc(doc(db, 'posts', post.id), {
      id: post.id,
      title: (post.title || 'New Post').slice(0, 200),
      cat: post.cat,
      body: (post.body || '').slice(0, 8000),
      img: (post.img || '').slice(0, 450000),
      videoUrl: (post.videoUrl || '').slice(0, 750000),
      createdAt: (post.createdAt || '').slice(0, 40),
      baseLikes:
        typeof post.baseLikes === 'number' && Number.isFinite(post.baseLikes)
          ? Math.min(1000000, Math.max(0, Math.floor(post.baseLikes)))
          : DEFAULT_BASE_LIKES,
      deleted: false,
      authProof,
      createdServerAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCloudPost(postId: string): Promise<void> {
  const path = `posts/${postId}`;
  try {
    const authProof = await requireAuthProof(`${postId}:delete`);
    await updateDoc(doc(db, 'posts', postId), {
      deleted: true,
      authProof,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribePostComments(
  postId: string,
  onData: (comments: CommentItem[]) => void
): Unsubscribe {
  const path = `posts/${postId}/comments`;
  const q = query(
    collection(db, 'posts', postId, 'comments'),
    orderBy('createdServerAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: CommentItem[] = snap.docs
        .filter((docSnap) => docSnap.data().deleted !== true)
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: typeof d.id === 'string' ? d.id : docSnap.id,
            author: typeof d.author === 'string' ? d.author : 'Visitor',
            text: typeof d.text === 'string' ? d.text : '',
          };
        });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function addCloudComment(
  postId: string,
  comment: CommentItem
): Promise<void> {
  const path = `posts/${postId}/comments/${comment.id}`;
  try {
    await setDoc(doc(db, 'posts', postId, 'comments', comment.id), {
      id: comment.id,
      author: (comment.author.trim() || 'Visitor').slice(0, 80),
      text: comment.text.trim().slice(0, 1000),
      deleted: false,
      authProof: '',
      createdServerAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCloudComment(
  postId: string,
  commentId: string
): Promise<void> {
  const path = `posts/${postId}/comments/${commentId}`;
  try {
    const authProof = await requireAuthProof(`${commentId}:delete`);
    await updateDoc(doc(db, 'posts', postId, 'comments', commentId), {
      deleted: true,
      authProof,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribePhotos(
  onData: (photos: PhotoItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'photos';
  const q = query(collection(db, path), orderBy('createdServerAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list: PhotoItem[] = snap.docs
        .filter((docSnap) => docSnap.data().deleted !== true)
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: typeof d.id === 'string' ? d.id : docSnap.id,
            title: typeof d.title === 'string' ? d.title : '',
            img: typeof d.img === 'string' ? d.img : '',
            cap: typeof d.cap === 'string' ? d.cap : '',
            baseLikes:
              typeof d.baseLikes === 'number' && Number.isFinite(d.baseLikes)
                ? d.baseLikes
                : DEFAULT_BASE_LIKES,
          };
        });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export async function createCloudPhoto(photo: PhotoItem): Promise<void> {
  const path = `photos/${photo.id}`;
  try {
    const authProof = await requireAuthProof(photo.id);
    await setDoc(doc(db, 'photos', photo.id), {
      id: photo.id,
      title: (photo.title || '').slice(0, 200),
      img: (photo.img || '').slice(0, 450000),
      cap: (photo.cap || '').slice(0, 300),
      baseLikes:
        typeof photo.baseLikes === 'number' && Number.isFinite(photo.baseLikes)
          ? Math.min(1000000, Math.max(0, Math.floor(photo.baseLikes)))
          : DEFAULT_BASE_LIKES,
      deleted: false,
      authProof,
      createdServerAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeCollectionLikes(
  collectionName: LikeCollectionName,
  docId: string,
  visitorId: string,
  onData: (info: LikeInfo) => void
): Unsubscribe {
  const path = `${collectionName}/${docId}/likes`;
  return onSnapshot(
    collection(db, collectionName, docId, 'likes'),
    (snap) => {
      let count = 0;
      let liked = false;
      let hasDoc = false;
      snap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        if (docSnap.id === visitorId) {
          hasDoc = true;
          if (d.active === true) liked = true;
        }
        if (d.active === true) {
          count += 1;
        }
      });
      onData({ count, liked, hasDoc });
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function toggleCloudLike(
  collectionName: LikeCollectionName,
  docId: string,
  visitorId: string,
  nextLiked: boolean,
  hasExistingDoc: boolean
): Promise<void> {
  const path = `${collectionName}/${docId}/likes/${visitorId}`;
  const likeRef = doc(db, collectionName, docId, 'likes', visitorId);
  try {
    if (!hasExistingDoc) {
      await setDoc(likeRef, {
        id: visitorId,
        active: true,
        createdServerAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(likeRef, {
        active: nextLiked,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudPhoto(photoId: string): Promise<void> {
  const path = `photos/${photoId}`;
  try {
    const authProof = await requireAuthProof(`${photoId}:delete`);
    await updateDoc(doc(db, 'photos', photoId), {
      deleted: true,
      authProof,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeVideos(
  onData: (videos: VideoItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'videos';
  const q = query(collection(db, path), orderBy('createdServerAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list: VideoItem[] = snap.docs
        .filter((docSnap) => docSnap.data().deleted !== true)
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: typeof d.id === 'string' ? d.id : docSnap.id,
            title: typeof d.title === 'string' ? d.title : 'Video',
            url: typeof d.url === 'string' ? d.url : '',
            description:
              typeof d.description === 'string' ? d.description : '',
            createdAt: resolveEnglishDate(d.createdAt, d.createdServerAt),
            baseLikes:
              typeof d.baseLikes === 'number' && Number.isFinite(d.baseLikes)
                ? d.baseLikes
                : DEFAULT_BASE_LIKES,
          };
        });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export async function createCloudVideo(video: VideoItem): Promise<void> {
  const path = `videos/${video.id}`;
  try {
    const authProof = await requireAuthProof(video.id);
    await setDoc(doc(db, 'videos', video.id), {
      id: video.id,
      title: (video.title || 'New Video').slice(0, 200),
      url: (video.url || '').slice(0, 750000),
      description: (video.description || '').slice(0, 2000),
      createdAt: (video.createdAt || '').slice(0, 40),
      baseLikes:
        typeof video.baseLikes === 'number' && Number.isFinite(video.baseLikes)
          ? Math.min(1000000, Math.max(0, Math.floor(video.baseLikes)))
          : DEFAULT_BASE_LIKES,
      deleted: false,
      authProof,
      createdServerAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCloudVideo(videoId: string): Promise<void> {
  const path = `videos/${videoId}`;
  try {
    const authProof = await requireAuthProof(`${videoId}:delete`);
    await updateDoc(doc(db, 'videos', videoId), {
      deleted: true,
      authProof,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeApks(
  onData: (apks: ApkItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'apks';
  const q = query(collection(db, path), orderBy('createdServerAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list: ApkItem[] = snap.docs
        .filter((docSnap) => docSnap.data().deleted !== true)
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: typeof d.id === 'string' ? d.id : docSnap.id,
            name: typeof d.name === 'string' ? d.name : 'Android App',
            version: typeof d.version === 'string' ? d.version : '1.0',
            description:
              typeof d.description === 'string' ? d.description : '',
            downloadUrl:
              typeof d.downloadUrl === 'string' ? d.downloadUrl : '',
            fileName: typeof d.fileName === 'string' ? d.fileName : '',
            sizeLabel: typeof d.sizeLabel === 'string' ? d.sizeLabel : '',
            createdAt: resolveEnglishDate(d.createdAt, d.createdServerAt),
          };
        });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export async function createCloudApk(apk: ApkItem): Promise<void> {
  const path = `apks/${apk.id}`;
  try {
    const authProof = await requireAuthProof(apk.id);
    await setDoc(doc(db, 'apks', apk.id), {
      id: apk.id,
      name: (apk.name || 'Android App').slice(0, 150),
      version: (apk.version || '1.0').slice(0, 40),
      description: (apk.description || '').slice(0, 2000),
      downloadUrl: (apk.downloadUrl || '').slice(0, 750000),
      fileName: (apk.fileName || '').slice(0, 200),
      sizeLabel: (apk.sizeLabel || '').slice(0, 40),
      createdAt: (apk.createdAt || '').slice(0, 40),
      deleted: false,
      authProof,
      createdServerAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCloudApk(apkId: string): Promise<void> {
  const path = `apks/${apkId}`;
  try {
    const authProof = await requireAuthProof(`${apkId}:delete`);
    await updateDoc(doc(db, 'apks', apkId), {
      deleted: true,
      authProof,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
