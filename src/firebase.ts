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
import firebaseConfig from '../firebase-applet-config.json';
import {
  ADMIN_PASS_HASH,
  ApkItem,
  CommentItem,
  DEFAULT_SOCIALS,
  PhotoItem,
  PostCategory,
  PostItem,
  SocialLinks,
  VideoItem,
} from './types';
import { formatEnglishPostDate } from './utils';

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
const SESSION_PASS_KEY = 'kiron_admin_session_pass';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

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
            img: typeof d.img === 'string' ? d.img : '',
            cap: typeof d.cap === 'string' ? d.cap : '',
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
      img: (photo.img || '').slice(0, 450000),
      cap: (photo.cap || '').slice(0, 300),
      deleted: false,
      authProof,
      createdServerAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
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
