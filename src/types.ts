export type MainTabId = 'ALL_POSTS' | 'PHOTOS' | 'VIDEOS' | 'APK' | 'ANNOUNCEMENTS';

export type AdminTabId =
  | 'posts'
  | 'videos'
  | 'photos'
  | 'apk'
  | 'profile'
  | 'socials'
  | 'github';

export type PostCategory = 'Update' | 'Photo' | 'Announcement';

export interface CommentItem {
  id: string;
  author: string;
  text: string;
}

export interface PostItem {
  id: string;
  title: string;
  cat: PostCategory;
  body: string;
  img?: string;
  videoUrl?: string;
  createdAt?: string;
  comments: CommentItem[];
}

export interface PhotoItem {
  id: string;
  img: string;
  cap?: string;
}

export interface VideoItem {
  id: string;
  title: string;
  url: string;
  description?: string;
  createdAt?: string;
}

export interface ApkItem {
  id: string;
  name: string;
  version: string;
  description?: string;
  downloadUrl: string;
  fileName?: string;
  sizeLabel?: string;
  createdAt?: string;
}

export interface SocialLinks {
  facebook: string;
  whatsapp: string;
  tiktok: string;
  telegram: string;
  wechat: string;
}

export interface PortalState {
  avatar: string;
  bio: string;
  socials: SocialLinks;
  posts: PostItem[];
  photos: PhotoItem[];
  videos: VideoItem[];
  apks: ApkItem[];
}

export interface LightboxSlide {
  src: string;
  cap: string;
}

export const ADMIN_PASS_HASH =
  'a7fc04e4c6f7823a3ccbd1dd99a7300ded02962e8b259da67fe0af937903eed5';
export const STORAGE_KEY = 'kiron_portal_backup_v4';

export const DEFAULT_SOCIALS: SocialLinks = {
  facebook: 'https://www.facebook.com',
  whatsapp: 'https://www.whatsapp.com',
  tiktok: 'https://www.tiktok.com',
  telegram: 'https://telegram.org',
  wechat: 'https://www.wechat.com',
};

export const SERIAL_TABS: { id: MainTabId; label: string; nav: string }[] = [
  { id: 'ALL_POSTS', label: 'ALL POSTS', nav: 'Posts' },
  { id: 'PHOTOS', label: 'PHOTOS', nav: 'Photos' },
  { id: 'VIDEOS', label: 'VIDEOS', nav: 'Videos' },
  { id: 'APK', label: 'APK', nav: 'APK' },
  { id: 'ANNOUNCEMENTS', label: 'ANNOUNCEMENTS', nav: 'Announcements' },
];

export const ADMIN_TABS: { id: AdminTabId; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'videos', label: 'Videos' },
  { id: 'photos', label: 'Photos' },
  { id: 'apk', label: 'APK' },
  { id: 'profile', label: 'Profile & Bio' },
  { id: 'socials', label: 'Social Links' },
  { id: 'github', label: 'GitHub & Publish' },
];
