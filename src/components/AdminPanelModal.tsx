import React, { useEffect, useMemo, useRef, useState } from 'react';
import { compressImageFile, useMediaUrl } from '../db';
import {
  MAX_FIRESTORE_BINARY_BYTES,
  MAX_FIRESTORE_MEDIA_CHARS,
  PublicSiteProfile,
} from '../firebase';
import {
  ADMIN_TABS,
  AdminTabId,
  ApkItem,
  PhotoItem,
  PortalState,
  PostCategory,
  PostItem,
  SocialLinks,
  VideoItem,
} from '../types';
import {
  fmtSize,
  formatTikTok,
  generateStandaloneHtml,
  makeId,
  monthYear,
  normalizeApkDownloadUrl,
  normalizeVideoUrl,
  readDataUrl,
} from '../utils';

interface AdminPanelModalProps {
  isOpen: boolean;
  initialTab?: AdminTabId;
  state: PortalState;
  onSaveProfile: (profile: PublicSiteProfile) => Promise<void>;
  onCreatePost: (post: Omit<PostItem, 'comments'>) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  onDeleteComment: (postId: string, commentId: string) => Promise<void>;
  onCreatePhoto: (photo: PhotoItem) => Promise<void>;
  onDeletePhoto: (photoId: string) => Promise<void>;
  onCreateVideo: (video: VideoItem) => Promise<void>;
  onDeleteVideo: (videoId: string) => Promise<void>;
  onCreateApk: (apk: ApkItem) => Promise<void>;
  onDeleteApk: (apkId: string) => Promise<void>;
  onClose: () => void;
  onLock: () => Promise<void> | void;
}

function AdminThumb({ src, alt }: { src?: string; alt: string }) {
  const url = useMediaUrl(src);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={alt}
      className="w-12 h-12 rounded-lg object-contain bg-[#F2F8F6] border border-[#CBE5DC] shrink-0"
    />
  );
}

export function AdminPanelModal({
  isOpen,
  initialTab,
  state,
  onSaveProfile,
  onCreatePost,
  onDeletePost,
  onDeleteComment,
  onCreatePhoto,
  onDeletePhoto,
  onCreateVideo,
  onDeleteVideo,
  onCreateApk,
  onDeleteApk,
  onClose,
  onLock,
}: AdminPanelModalProps) {
  const [adminTab, setAdminTab] = useState<AdminTabId>(initialTab || 'posts');

  // Post form
  const [pTitle, setPTitle] = useState('');
  const [pCat, setPCat] = useState<PostCategory>('Update');
  const [pBody, setPBody] = useState('');
  const [pImgUrl, setPImgUrl] = useState('');
  const [pVideoUrl, setPVideoUrl] = useState('');
  const [pFile, setPFile] = useState<File | null>(null);
  const [pVideoFile, setPVideoFile] = useState<File | null>(null);
  const pFileRef = useRef<HTMLInputElement>(null);
  const pVideoRef = useRef<HTMLInputElement>(null);

  // Video form
  const [vTitle, setVTitle] = useState('');
  const [vUrl, setVUrl] = useState('');
  const [vDesc, setVDesc] = useState('');
  const [vFile, setVFile] = useState<File | null>(null);
  const vFileRef = useRef<HTMLInputElement>(null);

  // Photo form
  const [gCap, setGCap] = useState('');
  const [gUrl, setGUrl] = useState('');
  const [gFiles, setGFiles] = useState<File[]>([]);
  const gFileRef = useRef<HTMLInputElement>(null);

  // APK form
  const [aName, setAName] = useState('');
  const [aVer, setAVer] = useState('1.0');
  const [aUrl, setAUrl] = useState('');
  const [aSize, setASize] = useState('');
  const [aDesc, setADesc] = useState('');
  const [aFile, setAFile] = useState<File | null>(null);
  const aFileRef = useRef<HTMLInputElement>(null);

  // Avatar ref
  const avatarFileRef = useRef<HTMLInputElement>(null);

  // Bio & Socials form
  const [bioInput, setBioInput] = useState(state.bio);
  const [socialsInput, setSocialsInput] = useState<SocialLinks>(state.socials);

  // Feedback & busy state
  const [statusNote, setStatusNote] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);

  const resolvedAvatar = useMediaUrl(state.avatar);

  const pImgPreview = useMemo(
    () => (pFile ? URL.createObjectURL(pFile) : ''),
    [pFile]
  );
  useEffect(() => {
    return () => {
      if (pImgPreview) URL.revokeObjectURL(pImgPreview);
    };
  }, [pImgPreview]);

  const gPreviews = useMemo(
    () => gFiles.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })),
    [gFiles]
  );
  useEffect(() => {
    return () => {
      gPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [gPreviews]);

  useEffect(() => {
    if (isOpen && initialTab) {
      setAdminTab(initialTab);
    }
    if (isOpen) {
      setBioInput(state.bio);
      setSocialsInput(state.socials);
      setConfirmClear(null);
    }
  }, [isOpen, initialTab, state.bio, state.socials]);

  if (!isOpen) return null;

  const notify = (text: string, isError = false) => {
    setStatusNote({ text, isError });
    setTimeout(() => {
      setStatusNote((cur) => (cur?.text === text ? null : cur));
    }, 4500);
  };

  const formatActionError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Quota exceeded')) {
      return 'Daily database quota exceeded. Please try again tomorrow.';
    }
    if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
      return 'Admin permission denied. Lock and unlock KIRON panel with password.';
    }
    return 'Could not sync update to cloud. Check connection and try again.';
  };

  const compressForCloud = async (file: File): Promise<string> => {
    const compressed = await compressImageFile(file, 960, 0.76);
    if (!compressed || compressed.length > MAX_FIRESTORE_MEDIA_CHARS) {
      return '';
    }
    return compressed;
  };

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setIsBusy(true);
    try {
      const url = await compressImageFile(f, 640, 0.8);
      if (!url || url.length > MAX_FIRESTORE_MEDIA_CHARS) {
        notify('Selected photo is too large. Please pick a smaller photo.', true);
        return;
      }
      await onSaveProfile({
        avatar: url,
        bio: state.bio,
        socials: state.socials,
      });
      if (avatarFileRef.current) avatarFileRef.current.value = '';
      notify('Profile photo updated for all visitors.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteAvatar = async () => {
    setIsBusy(true);
    try {
      await onSaveProfile({
        avatar: '',
        bio: state.bio,
        socials: state.socials,
      });
      if (avatarFileRef.current) avatarFileRef.current.value = '';
      notify('Profile photo deleted for all visitors.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveBio = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    try {
      await onSaveProfile({
        avatar: state.avatar,
        bio: bioInput.trim(),
        socials: state.socials,
      });
      notify('Bio saved & synced live.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleClearBio = async () => {
    setIsBusy(true);
    try {
      setBioInput('');
      await onSaveProfile({
        avatar: state.avatar,
        bio: '',
        socials: state.socials,
      });
      notify('Bio cleared.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddPost = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = pTitle.trim();
    const body = pBody.trim();
    const imgUrl = pImgUrl.trim();
    const videoUrlInput = pVideoUrl.trim();
    if (!title && !body && !pFile && !pVideoFile && !imgUrl && !videoUrlInput) {
      notify('Please enter text or choose a photo/video.', true);
      return;
    }
    if (!videoUrlInput && pVideoFile && pVideoFile.size > MAX_FIRESTORE_BINARY_BYTES) {
      notify(
        `Video file is ${fmtSize(pVideoFile.size)}. Direct file upload supports clips up to 500 KB—upload HD/long videos to YouTube or Google Drive and paste the link above.`,
        true
      );
      return;
    }

    setIsBusy(true);
    try {
      let img = imgUrl;
      if (pFile) {
        img = await compressForCloud(pFile);
        if (!img) {
          notify('Could not compress selected image small enough for cloud sync.', true);
          return;
        }
      }

      let videoUrl = videoUrlInput ? normalizeVideoUrl(videoUrlInput) : '';
      if (!videoUrl && pVideoFile) {
        videoUrl = await readDataUrl(pVideoFile);
      }
      if (videoUrl && videoUrl.length > 740000) {
        notify('Selected video exceeds live sync size limit. Use a YouTube/Google Drive/HD video URL instead.', true);
        return;
      }

      const fallbackTitle = videoUrl
        ? 'New Video Post'
        : pCat === 'Photo' || pFile || img
          ? 'New Photo Post'
          : 'New Post';

      await onCreatePost({
        id: makeId('post'),
        title: title || fallbackTitle,
        cat: pCat,
        body,
        img: img || undefined,
        videoUrl: videoUrl || undefined,
        createdAt: monthYear(),
      });

      setPTitle('');
      setPBody('');
      setPImgUrl('');
      setPVideoUrl('');
      setPFile(null);
      setPVideoFile(null);
      if (pFileRef.current) pFileRef.current.value = '';
      if (pVideoRef.current) pVideoRef.current.value = '';
      notify('Post published live for everyone!');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeletePost = async (id: string) => {
    setIsBusy(true);
    try {
      await onDeletePost(id);
      notify('Post deleted.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteAllPosts = async () => {
    setIsBusy(true);
    try {
      await Promise.all(state.posts.map((p) => onDeletePost(p.id)));
      setConfirmClear(null);
      notify('All posts deleted.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    setIsBusy(true);
    try {
      await onDeleteComment(postId, commentId);
      notify('Comment deleted.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    let url = vUrl.trim() ? normalizeVideoUrl(vUrl.trim()) : '';
    if (!url && !vFile) {
      notify('Please paste a YouTube/Google Drive/GitHub Release video URL or choose a small clip.', true);
      return;
    }
    if (!url && vFile && vFile.size > MAX_FIRESTORE_BINARY_BYTES) {
      notify(
        `Video file is ${fmtSize(vFile.size)}. Direct file upload supports up to 500 KB—upload 500 MB / 30-min HD videos to YouTube, Google Drive, or GitHub Releases and paste the link above.`,
        true
      );
      return;
    }
    setIsBusy(true);
    try {
      if (!url && vFile) {
        url = await readDataUrl(vFile);
      }
      if (!url || url.length > 740000) {
        notify('Video URL or clip exceeds cloud limit. Please use a YouTube or direct link.', true);
        return;
      }
      await onCreateVideo({
        id: makeId('video'),
        title:
          vTitle.trim() ||
          (vFile ? vFile.name.replace(/\.[^.]+$/, '') : 'New Video'),
        url,
        description: vDesc.trim(),
        createdAt: monthYear(),
      });
      setVTitle('');
      setVUrl('');
      setVDesc('');
      setVFile(null);
      if (vFileRef.current) vFileRef.current.value = '';
      notify('Video published live!');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteVideo = async (id: string) => {
    setIsBusy(true);
    try {
      await onDeleteVideo(id);
      notify('Video deleted.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteAllVideos = async () => {
    setIsBusy(true);
    try {
      await Promise.all(state.videos.map((v) => onDeleteVideo(v.id)));
      setConfirmClear(null);
      notify('All videos deleted.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    const urlTrim = gUrl.trim();
    if (gFiles.length === 0 && !urlTrim) {
      notify('Please choose photo(s) from gallery or paste an image URL.', true);
      return;
    }
    setIsBusy(true);
    try {
      const cap = gCap.trim();
      const addedPhotos: PhotoItem[] = [];

      for (const f of gFiles) {
        const img = await compressForCloud(f);
        if (img) {
          addedPhotos.push({
            id: makeId('photo'),
            img,
            cap,
          });
        }
      }
      if (urlTrim) {
        addedPhotos.push({
          id: makeId('photo'),
          img: urlTrim,
          cap,
        });
      }

      if (addedPhotos.length === 0) {
        notify('Could not prepare the selected photo(s) for cloud sync.', true);
        return;
      }

      for (const item of addedPhotos) {
        await onCreatePhoto(item);
      }

      setGCap('');
      setGUrl('');
      setGFiles([]);
      if (gFileRef.current) gFileRef.current.value = '';
      notify(
        addedPhotos.length > 1
          ? `${addedPhotos.length} photos published live!`
          : 'Photo published live!'
      );
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeletePhoto = async (id: string) => {
    setIsBusy(true);
    try {
      await onDeletePhoto(id);
      notify('Photo deleted.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteAllPhotos = async () => {
    setIsBusy(true);
    try {
      await Promise.all(state.photos.map((g) => onDeletePhoto(g.id)));
      setConfirmClear(null);
      notify('All photos deleted.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddApk = async (e: React.FormEvent) => {
    e.preventDefault();
    let downloadUrl = aUrl.trim() ? normalizeApkDownloadUrl(aUrl.trim()) : '';
    let fileName = '';
    let sizeLabel = aSize.trim();
    if (!downloadUrl && !aFile) {
      notify('Please enter an APK URL or choose a small .apk file.', true);
      return;
    }
    if (!downloadUrl && aFile && aFile.size > MAX_FIRESTORE_BINARY_BYTES) {
      notify(
        `APK file is ${fmtSize(aFile.size)}. Upload large APKs (up to 500 MB – 2 GB) to GitHub Releases or Google Drive and paste the link above.`,
        true
      );
      return;
    }
    setIsBusy(true);
    try {
      if (!downloadUrl && aFile) {
        downloadUrl = await readDataUrl(aFile);
        fileName = aFile.name;
        sizeLabel = sizeLabel || fmtSize(aFile.size);
      }
      if (!downloadUrl || downloadUrl.length > 740000) {
        notify('APK URL or file exceeds cloud limit. Paste a direct download URL instead.', true);
        return;
      }
      const item: ApkItem = {
        id: makeId('apk'),
        name:
          aName.trim() ||
          fileName.replace(/\.apk$/i, '') ||
          'Android App',
        version: aVer.trim() || '1.0',
        description: aDesc.trim(),
        downloadUrl,
        fileName,
        sizeLabel,
        createdAt: monthYear(),
      };
      await onCreateApk(item);
      setAName('');
      setAVer('1.0');
      setAUrl('');
      setASize('');
      setADesc('');
      setAFile(null);
      if (aFileRef.current) aFileRef.current.value = '';
      notify('APK release published live!');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteApk = async (id: string) => {
    setIsBusy(true);
    try {
      await onDeleteApk(id);
      notify('APK deleted.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveSocials = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    try {
      await onSaveProfile({
        avatar: state.avatar,
        bio: state.bio,
        socials: {
          facebook: socialsInput.facebook.trim(),
          whatsapp: socialsInput.whatsapp.trim(),
          tiktok: formatTikTok(socialsInput.tiktok),
          telegram: socialsInput.telegram.trim(),
          wechat: socialsInput.wechat.trim(),
          youtube: (socialsInput.youtube || '').trim(),
        },
      });
      notify('Social links synced live!');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDownloadStandaloneHtml = () => {
    const html = generateStandaloneHtml(state);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    a.click();
    URL.revokeObjectURL(url);
    notify('Downloaded standalone index.html.');
  };

  const handleDownloadBackupJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kiron-website-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    notify('Backup JSON downloaded.');
  };

  const handleImportBackupJson = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setIsBusy(true);
    try {
      const text = await f.text();
      const parsed = JSON.parse(text) as Partial<PortalState>;
      if (!parsed || typeof parsed !== 'object') {
        notify('Invalid backup JSON file.', true);
        return;
      }
      await onSaveProfile({
        avatar:
          typeof parsed.avatar === 'string' &&
          parsed.avatar.length <= MAX_FIRESTORE_MEDIA_CHARS
            ? parsed.avatar
            : state.avatar,
        bio: typeof parsed.bio === 'string' ? parsed.bio : state.bio,
        socials: parsed.socials
          ? { ...state.socials, ...parsed.socials }
          : state.socials,
      });
      if (Array.isArray(parsed.posts)) {
        for (const p of parsed.posts) {
          await onCreatePost({
            id: p.id || makeId('post'),
            title: p.title || 'POSTS',
            cat: p.cat || 'Update',
            body: p.body || '',
            img: p.img,
            videoUrl: p.videoUrl,
            createdAt: p.createdAt || monthYear(),
          });
        }
      }
      if (Array.isArray(parsed.photos)) {
        for (const ph of parsed.photos) {
          if (ph.img) {
            await onCreatePhoto({
              id: ph.id || makeId('photo'),
              img: ph.img,
              cap: ph.cap || '',
            });
          }
        }
      }
      if (Array.isArray(parsed.videos)) {
        for (const v of parsed.videos) {
          if (v.url) {
            await onCreateVideo({
              id: v.id || makeId('video'),
              title: v.title || 'Video',
              url: v.url,
              description: v.description || '',
              createdAt: v.createdAt || monthYear(),
            });
          }
        }
      }
      if (Array.isArray(parsed.apks)) {
        for (const a of parsed.apks) {
          if (a.downloadUrl) {
            await onCreateApk({
              id: a.id || makeId('apk'),
              name: a.name || 'App',
              version: a.version || '1.0',
              description: a.description || '',
              downloadUrl: a.downloadUrl,
              fileName: a.fileName || '',
              sizeLabel: a.sizeLabel || '',
              createdAt: a.createdAt || monthYear(),
            });
          }
        }
      }
      notify('Backup synced to live database.');
    } catch (err) {
      notify(formatActionError(err), true);
    } finally {
      e.target.value = '';
      setIsBusy(false);
    }
  };

  const counts: Partial<Record<AdminTabId, number>> = {
    posts: state.posts.length,
    videos: state.videos.length,
    photos: state.photos.length,
    apk: state.apks.length,
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="KIRON Control Panel"
      className="fixed inset-0 z-50 bg-[#0F2937]/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white border border-[#9ED6C8] rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-[#DCEFE9] flex items-center justify-between gap-4 bg-gradient-to-r from-[#E6F6F0] to-[#E6F2FC]">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <h3 className="text-lg font-bold text-[#0F2937]">
              KIRON Control Panel
            </h3>
            {isBusy && (
              <span className="text-xs font-semibold text-[#0284C7]">
                Syncing...
              </span>
            )}
            {statusNote && (
              <span
                className={`text-xs font-semibold ${
                  statusNote.isError ? 'text-[#DC2626]' : 'text-[#059669]'
                }`}
              >
                {statusNote.text}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void onLock()}
              className="px-3 py-1.5 rounded-lg border border-[#A5DDD0] bg-white text-[#17465A] text-xs font-semibold hover:bg-[#EDF7F6] cursor-pointer whitespace-nowrap shrink-0"
            >
              Lock
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-lg text-[#4A6B7A] hover:bg-white/70 flex items-center justify-center cursor-pointer"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="px-6 pt-3 pb-0 border-b border-[#DCEFE9] flex flex-wrap gap-1 bg-white">
          {ADMIN_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setAdminTab(t.id);
                setConfirmClear(null);
                if (t.id === 'profile') setBioInput(state.bio);
                if (t.id === 'socials') setSocialsInput(state.socials);
              }}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 whitespace-nowrap shrink-0 cursor-pointer ${
                adminTab === t.id
                  ? 'border-[#0284C7] text-[#0284C7]'
                  : 'border-transparent text-[#4A6B7A]'
              }`}
            >
              {t.label}
              {typeof counts[t.id] === 'number' ? ` (${counts[t.id]})` : ''}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {adminTab === 'profile' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-[#0284C7]">
                  Profile Photo
                </h4>
                <div className="flex flex-wrap items-center gap-4">
                  {resolvedAvatar ? (
                    <img
                      src={resolvedAvatar}
                      alt="Profile preview"
                      className="w-16 h-16 rounded-full object-cover border border-[#A5DDD0]"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-[#EDF7F6] border border-[#A5DDD0] flex items-center justify-center font-bold text-[#059669]">
                      K
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="min-h-[42px] inline-flex items-center justify-center px-4 py-2 rounded-xl border border-dashed border-[#0284C7] bg-[#F0F9FF] text-[#0369A1] text-xs font-bold hover:bg-[#E0F2FE] cursor-pointer">
                      <span>Choose Photo from Gallery</span>
                      <input
                        ref={avatarFileRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUploadAvatar}
                        className="sr-only"
                      />
                    </label>
                    {state.avatar && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={handleDeleteAvatar}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#DC2626] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                      >
                        Delete Profile Photo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <form
                onSubmit={handleSaveBio}
                className="pt-4 border-t border-[#DCEFE9] space-y-3"
              >
                <h4 className="text-sm font-bold text-[#059669]">Bio</h4>
                <textarea
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  rows={3}
                  placeholder="Write your bio here..."
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm text-[#0F2937]"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    Save Bio
                  </button>
                  {state.bio && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={handleClearBio}
                      className="px-3.5 py-2 rounded-lg bg-[#FEE2E2] text-[#B91C1C] text-xs font-semibold cursor-pointer disabled:opacity-60"
                    >
                      Clear Bio
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {adminTab === 'posts' && (
            <>
              <form onSubmit={handleAddPost} className="space-y-3">
                <h4 className="text-sm font-bold text-[#059669]">
                  Create Post, Photo Post, or Announcement (Live for Everyone)
                </h4>
                <input
                  value={pTitle}
                  onChange={(e) => setPTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
                <select
                  value={pCat}
                  onChange={(e) => setPCat(e.target.value as PostCategory)}
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm bg-white"
                >
                  <option value="Update">POSTS</option>
                  <option value="Photo">Photo</option>
                  <option value="Announcement">Announcement</option>
                </select>
                <textarea
                  value={pBody}
                  onChange={(e) => setPBody(e.target.value)}
                  rows={3}
                  placeholder="Write post details..."
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
                <input
                  value={pImgUrl}
                  onChange={(e) => setPImgUrl(e.target.value)}
                  placeholder="Image URL (optional)"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
                <input
                  value={pVideoUrl}
                  onChange={(e) => setPVideoUrl(e.target.value)}
                  placeholder="HD Video URL (500 MB / 30m+) — YouTube, Google Drive, GitHub Release .mp4, Dropbox"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
                <div className="p-2.5 rounded-xl bg-[#F0F9FF] border border-[#BAE6FD] space-y-1.5">
                  <p className="text-[11px] text-[#0F2937] leading-relaxed">
                    <strong>500 MB / 30+ min HD Video:</strong> Direct browser file upload is capped at 500 KB by Firebase Firestore. Upload your full HD video using any free host below and paste the link above:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="https://studio.youtube.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#FCA5A5] text-[#DC2626] text-[11px] font-semibold hover:bg-[#FEF2F2]"
                    >
                      YouTube Studio (Unlimited HD)
                    </a>
                    <a
                      href="https://drive.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#93C5FD] text-[#0369A1] text-[11px] font-semibold hover:bg-[#EFF6FF]"
                    >
                      Google Drive (15 GB Free)
                    </a>
                    <a
                      href="https://github.com/kiron-official/kiron-official.github.io/releases/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#A5DDD0] text-[#047857] text-[11px] font-semibold hover:bg-[#ECFDF5]"
                    >
                      GitHub Releases (up to 2 GB .mp4)
                    </a>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[#059669] bg-[#F4FBF8] text-[#047857] text-xs font-bold hover:bg-[#E6F6F0] cursor-pointer">
                    <span>
                      {pFile ? `Photo: ${pFile.name}` : 'Choose Photo from Gallery'}
                    </span>
                    <input
                      ref={pFileRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => setPFile(e.target.files?.[0] || null)}
                      className="sr-only"
                    />
                  </label>

                  <label className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[#0284C7] bg-[#F0F9FF] text-[#0369A1] text-xs font-bold hover:bg-[#E0F2FE] cursor-pointer">
                    <span>
                      {pVideoFile
                        ? `Video: ${pVideoFile.name}`
                        : 'Small Video Clip (<500 KB)'}
                    </span>
                    <input
                      ref={pVideoRef}
                      type="file"
                      accept="video/*,.mp4,.mov,.webm,.3gp"
                      onChange={(e) =>
                        setPVideoFile(e.target.files?.[0] || null)
                      }
                      className="sr-only"
                    />
                  </label>
                </div>

                {(pImgPreview || pVideoFile) && (
                  <div className="flex flex-wrap items-center gap-3 p-2.5 rounded-xl bg-[#F4FBF8] border border-[#CDECE2]">
                    {pImgPreview && (
                      <div className="flex items-center gap-2">
                        <img
                          src={pImgPreview}
                          alt="Selected"
                          className="w-12 h-12 rounded-lg object-cover border border-[#A5DDD0]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setPFile(null);
                            if (pFileRef.current) pFileRef.current.value = '';
                          }}
                          className="text-xs font-semibold text-[#DC2626] cursor-pointer"
                        >
                          Remove photo
                        </button>
                      </div>
                    )}
                    {pVideoFile && (
                      <div className="flex items-center gap-2 text-xs text-[#0369A1]">
                        <span>
                          Video ready ({fmtSize(pVideoFile.size)})
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPVideoFile(null);
                            if (pVideoRef.current) pVideoRef.current.value = '';
                          }}
                          className="text-xs font-semibold text-[#DC2626] cursor-pointer"
                        >
                          Remove video
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {isBusy ? 'Publishing...' : 'Publish Post'}
                </button>
              </form>

              <div className="pt-4 border-t border-[#DCEFE9] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-xs font-bold text-[#17465A] uppercase tracking-wide">
                    Published Posts ({state.posts.length})
                  </h5>
                  {state.posts.length > 0 &&
                    (confirmClear === 'posts' ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={handleDeleteAllPosts}
                          className="px-2.5 py-1 rounded bg-[#DC2626] text-white text-xs font-semibold cursor-pointer"
                        >
                          Confirm Delete All
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClear(null)}
                          className="px-2.5 py-1 rounded bg-[#E2E8F0] text-[#0F2937] text-xs font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmClear('posts')}
                        className="text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer"
                      >
                        Delete All
                      </button>
                    ))}
                </div>

                {state.posts.length === 0 ? (
                  <p className="text-xs text-[#5A7B8A]">No posts yet.</p>
                ) : (
                  state.posts.map((p) => (
                    <div
                      key={p.id}
                      className="py-2.5 border-b border-[#E2F2EC] space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {p.img && <AdminThumb src={p.img} alt={p.title} />}
                          <div className="min-w-0">
                            <strong className="block text-sm text-[#0F2937] truncate">
                              {p.title}
                            </strong>
                            <span className="text-xs text-[#0369A1]">
                              {!p.cat || p.cat === 'Update' ? 'POSTS' : p.cat}
                              {p.videoUrl ? ' · Video' : ''}
                              {p.createdAt ? ` · ${p.createdAt}` : ''}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDeletePost(p.id)}
                          className="px-2.5 py-1 rounded bg-[#DC2626] text-white text-xs font-semibold cursor-pointer shrink-0 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                      {(p.comments || []).map((c) => (
                        <div
                          key={c.id}
                          className="pl-4 flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="text-[#335160]">
                            {c.author}: {c.text}
                          </span>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDeleteComment(p.id, c.id)}
                            className="px-2 py-0.5 rounded bg-[#FEE2E2] text-[#B91C1C] cursor-pointer shrink-0"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {adminTab === 'videos' && (
            <>
              <form onSubmit={handleAddVideo} className="space-y-3">
                <h4 className="text-sm font-bold text-[#0284C7]">
                  Videos Manager
                </h4>
                <input
                  value={vTitle}
                  onChange={(e) => setVTitle(e.target.value)}
                  placeholder="Video Title"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
                <input
                  value={vUrl}
                  onChange={(e) => setVUrl(e.target.value)}
                  placeholder="Paste 500 MB / 30+ min HD Video Link — YouTube, Google Drive, GitHub Release .mp4, Dropbox"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
                <div className="p-2.5 rounded-xl bg-[#F0F9FF] border border-[#BAE6FD] space-y-1.5">
                  <p className="text-[11px] text-[#0F2937] leading-relaxed">
                    <strong>30-min / 500 MB+ HD Videos:</strong> Upload to YouTube (Public or Unlisted), Google Drive (&ldquo;Anyone with the link&rdquo;), or GitHub Releases (.mp4 up to 2 GB) and paste the link above for instant HD playback.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="https://studio.youtube.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#FCA5A5] text-[#DC2626] text-[11px] font-semibold hover:bg-[#FEF2F2]"
                    >
                      YouTube Studio
                    </a>
                    <a
                      href="https://drive.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#93C5FD] text-[#0369A1] text-[11px] font-semibold hover:bg-[#EFF6FF]"
                    >
                      Google Drive
                    </a>
                    <a
                      href="https://github.com/kiron-official/kiron-official.github.io/releases/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#A5DDD0] text-[#047857] text-[11px] font-semibold hover:bg-[#ECFDF5]"
                    >
                      GitHub Releases (up to 2 GB)
                    </a>
                  </div>
                </div>
                <label className="min-h-[46px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[#0284C7] bg-[#F0F9FF] text-[#0369A1] text-xs font-bold hover:bg-[#E0F2FE] cursor-pointer">
                  <span>
                    {vFile
                      ? `Selected: ${vFile.name} (${fmtSize(vFile.size)})`
                      : 'Or Choose Small Video Clip (<500 KB)'}
                  </span>
                  <input
                    ref={vFileRef}
                    type="file"
                    accept="video/*,.mp4,.mov,.webm,.3gp"
                    onChange={(e) => setVFile(e.target.files?.[0] || null)}
                    className="sr-only"
                  />
                </label>
                {vFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setVFile(null);
                      if (vFileRef.current) vFileRef.current.value = '';
                    }}
                    className="text-xs font-semibold text-[#DC2626] cursor-pointer"
                  >
                    Remove selected video
                  </button>
                )}
                <textarea
                  value={vDesc}
                  onChange={(e) => setVDesc(e.target.value)}
                  rows={2}
                  placeholder="Description (Optional)"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2.5 rounded-xl bg-[#0284C7] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {isBusy ? 'Saving Video...' : 'Add Video'}
                </button>
              </form>

              <div className="pt-4 border-t border-[#DCEFE9] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-xs font-bold text-[#17465A] uppercase tracking-wide">
                    Published Videos ({state.videos.length})
                  </h5>
                  {state.videos.length > 0 &&
                    (confirmClear === 'videos' ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={handleDeleteAllVideos}
                          className="px-2.5 py-1 rounded bg-[#DC2626] text-white text-xs font-semibold cursor-pointer"
                        >
                          Confirm Delete All
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClear(null)}
                          className="px-2.5 py-1 rounded bg-[#E2E8F0] text-[#0F2937] text-xs font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmClear('videos')}
                        className="text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer"
                      >
                        Delete All
                      </button>
                    ))}
                </div>

                {state.videos.length === 0 ? (
                  <p className="text-xs text-[#5A7B8A]">No videos yet.</p>
                ) : (
                  state.videos.map((v) => (
                    <div
                      key={v.id}
                      className="py-2 flex items-center justify-between gap-3 border-b border-[#E2F2EC]"
                    >
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-[#0F2937] truncate">
                          {v.title}
                        </span>
                        <span className="block text-xs text-[#5A7B8A] truncate">
                          {v.url.startsWith('data:')
                            ? 'Uploaded clip'
                            : v.url}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDeleteVideo(v.id)}
                        className="px-2.5 py-1 rounded bg-[#DC2626] text-white text-xs font-semibold cursor-pointer shrink-0 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {adminTab === 'photos' && (
            <>
              <form onSubmit={handleAddPhoto} className="space-y-3">
                <h4 className="text-sm font-bold text-[#059669]">
                  Photos Manager
                </h4>
                <label className="min-h-[46px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[#059669] bg-[#F4FBF8] text-[#047857] text-xs font-bold hover:bg-[#E6F6F0] cursor-pointer">
                  <span>
                    {gFiles.length > 0
                      ? `${gFiles.length} photo(s) selected from Gallery`
                      : 'Choose Photos from Gallery'}
                  </span>
                  <input
                    ref={gFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) =>
                      setGFiles(Array.from(e.target.files || []))
                    }
                    className="sr-only"
                  />
                </label>

                {gPreviews.length > 0 && (
                  <div className="space-y-2 p-2.5 rounded-xl bg-[#F4FBF8] border border-[#CDECE2]">
                    <div className="flex flex-wrap gap-2">
                      {gPreviews.map((p, idx) => (
                        <img
                          key={`${p.name}-${idx}`}
                          src={p.url}
                          alt={p.name}
                          className="w-14 h-14 rounded-lg object-cover border border-[#A5DDD0]"
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setGFiles([]);
                        if (gFileRef.current) gFileRef.current.value = '';
                      }}
                      className="text-xs font-semibold text-[#DC2626] cursor-pointer"
                    >
                      Clear selected photos
                    </button>
                  </div>
                )}

                <input
                  value={gCap}
                  onChange={(e) => setGCap(e.target.value)}
                  placeholder="Caption (Optional)"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
                <input
                  value={gUrl}
                  onChange={(e) => setGUrl(e.target.value)}
                  placeholder="Or paste Photo URL"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2.5 rounded-xl bg-[#059669] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {isBusy ? 'Publishing Photos...' : 'Add Photo'}
                </button>
              </form>

              <div className="pt-4 border-t border-[#DCEFE9] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-xs font-bold text-[#17465A] uppercase tracking-wide">
                    Gallery Photos ({state.photos.length})
                  </h5>
                  {state.photos.length > 0 &&
                    (confirmClear === 'photos' ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={handleDeleteAllPhotos}
                          className="px-2.5 py-1 rounded bg-[#DC2626] text-white text-xs font-semibold cursor-pointer"
                        >
                          Confirm Delete All
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClear(null)}
                          className="px-2.5 py-1 rounded bg-[#E2E8F0] text-[#0F2937] text-xs font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmClear('photos')}
                        className="text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer"
                      >
                        Delete All
                      </button>
                    ))}
                </div>

                {state.photos.length === 0 ? (
                  <p className="text-xs text-[#5A7B8A]">No photos yet.</p>
                ) : (
                  state.photos.map((g, i) => (
                    <div
                      key={g.id}
                      className="py-2 flex items-center justify-between gap-3 border-b border-[#E2F2EC]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <AdminThumb
                          src={g.img}
                          alt={g.cap || `Photo ${i + 1}`}
                        />
                        <span className="text-sm text-[#0F2937] truncate">
                          {g.cap || `Photo ${i + 1}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDeletePhoto(g.id)}
                        className="px-2.5 py-1 rounded bg-[#DC2626] text-white text-xs font-semibold cursor-pointer shrink-0 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {adminTab === 'apk' && (
            <>
              <form onSubmit={handleAddApk} className="space-y-3">
                <h4 className="text-sm font-bold text-[#0284C7]">
                  APK Manager
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    value={aName}
                    onChange={(e) => setAName(e.target.value)}
                    placeholder="App Name"
                    className="px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                  />
                  <input
                    value={aVer}
                    onChange={(e) => setAVer(e.target.value)}
                    placeholder="Version"
                    className="px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                  />
                  <input
                    value={aSize}
                    onChange={(e) => setASize(e.target.value)}
                    placeholder="Size (e.g. 480 MB)"
                    className="px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                  />
                </div>
                <input
                  value={aUrl}
                  onChange={(e) => setAUrl(e.target.value)}
                  placeholder="APK Download URL — GitHub Releases (up to 2 GB) or Google Drive (500 MB+)"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
                <div className="p-2.5 rounded-xl bg-[#F4FBF8] border border-[#CDECE2] space-y-1.5">
                  <p className="text-[11px] text-[#0F2937] leading-relaxed">
                    <strong>Large APKs (up to 500 MB – 2 GB):</strong> Upload your .apk file to GitHub Releases or Google Drive (&ldquo;Anyone with the link&rdquo;) and paste the link above—visitors get a direct 1-click download.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="https://github.com/kiron-official/kiron-official.github.io/releases/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#A5DDD0] text-[#047857] text-[11px] font-semibold hover:bg-[#ECFDF5]"
                    >
                      Upload APK to GitHub Releases (up to 2 GB)
                    </a>
                    <a
                      href="https://drive.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#93C5FD] text-[#0369A1] text-[11px] font-semibold hover:bg-[#EFF6FF]"
                    >
                      Upload APK to Google Drive
                    </a>
                  </div>
                </div>
                <label className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-dashed border-[#0284C7] bg-[#F0F9FF] text-[#0369A1] text-xs font-bold hover:bg-[#E0F2FE] cursor-pointer">
                  <span>
                    {aFile
                      ? `Selected: ${aFile.name} (${fmtSize(aFile.size)})`
                      : 'Or Choose Small .apk (<500 KB)'}
                  </span>
                  <input
                    ref={aFileRef}
                    type="file"
                    accept=".apk,application/vnd.android.package-archive"
                    onChange={(e) => setAFile(e.target.files?.[0] || null)}
                    className="sr-only"
                  />
                </label>
                <textarea
                  value={aDesc}
                  onChange={(e) => setADesc(e.target.value)}
                  rows={2}
                  placeholder="Description (Optional)"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {isBusy ? 'Publishing...' : 'Add APK'}
                </button>
              </form>

              <div className="pt-4 border-t border-[#DCEFE9] space-y-2">
                {state.apks.map((a) => (
                  <div
                    key={a.id}
                    className="py-2 flex items-center justify-between gap-3 border-b border-[#E2F2EC]"
                  >
                    <span className="text-sm font-semibold">
                      {a.name} v{a.version}
                    </span>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDeleteApk(a.id)}
                      className="px-2.5 py-1 rounded bg-[#DC2626] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {adminTab === 'socials' && (
            <form onSubmit={handleSaveSocials} className="space-y-3">
              <h4 className="text-sm font-bold text-[#059669]">Social Links</h4>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Facebook
                </label>
                <input
                  value={socialsInput.facebook}
                  onChange={(e) =>
                    setSocialsInput((s) => ({ ...s, facebook: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  WhatsApp (URL or phone number)
                </label>
                <input
                  value={socialsInput.whatsapp}
                  onChange={(e) =>
                    setSocialsInput((s) => ({ ...s, whatsapp: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  TikTok
                </label>
                <input
                  value={socialsInput.tiktok}
                  onChange={(e) =>
                    setSocialsInput((s) => ({ ...s, tiktok: e.target.value }))
                  }
                  placeholder="https://www.tiktok.com/@username or username"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Telegram
                </label>
                <input
                  value={socialsInput.telegram}
                  onChange={(e) =>
                    setSocialsInput((s) => ({ ...s, telegram: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  YouTube
                </label>
                <input
                  value={socialsInput.youtube || ''}
                  onChange={(e) =>
                    setSocialsInput((s) => ({ ...s, youtube: e.target.value }))
                  }
                  placeholder="https://www.youtube.com/@yourchannel"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  WeChat (URL or WeChat ID)
                </label>
                <input
                  value={socialsInput.wechat}
                  onChange={(e) =>
                    setSocialsInput((s) => ({ ...s, wechat: e.target.value }))
                  }
                  placeholder="wxid_..."
                  className="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={isBusy}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                Save Social Links
              </button>
            </form>
          )}

          {adminTab === 'github' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-[#0284C7]">
                Live Cloud Sync, Backup &amp; Google Search
              </h4>
              <p className="text-xs text-[#335160] leading-relaxed">
                All posts, photos, videos, APKs, bio, and social links you save
                here sync live via Firebase so every visitor at{' '}
                <code className="font-mono text-[#0F2937]">
                  https://kiron-official.github.io/
                </code>{' '}
                sees updates immediately.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleDownloadStandaloneHtml}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  Download Offline index.html
                </button>
                <a
                  href="./profile.jpg"
                  download="profile.jpg"
                  className="px-4 py-2 rounded-lg border border-[#A5DDD0] bg-[#F4FBF8] text-[#17465A] text-xs font-semibold hover:bg-[#E6F6F0] whitespace-nowrap shrink-0"
                >
                  Download profile.jpg
                </a>
                <button
                  type="button"
                  onClick={handleDownloadBackupJson}
                  className="px-4 py-2 rounded-lg border border-[#CBE5DC] bg-white text-[#17465A] text-xs font-semibold hover:bg-[#F3FAF8] cursor-pointer whitespace-nowrap shrink-0"
                >
                  Export Backup JSON
                </button>
                <label className="px-4 py-2 rounded-lg border border-[#CBE5DC] bg-white text-[#17465A] text-xs font-semibold hover:bg-[#F3FAF8] cursor-pointer whitespace-nowrap shrink-0">
                  Import Backup JSON
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={handleImportBackupJson}
                    className="sr-only"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <a
                  href="https://kiron-official.github.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-lg border border-[#86EFAC] bg-[#ECFDF5] text-[#047857] text-xs font-semibold hover:bg-[#D1FAE5] whitespace-nowrap shrink-0"
                >
                  Open Live Site
                </a>
                <a
                  href="https://search.google.com/search-console"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-lg border border-[#93C5FD] bg-[#F0F9FF] text-[#0369A1] text-xs font-semibold hover:bg-[#E0F2FE] whitespace-nowrap shrink-0"
                >
                  Google Search Console
                </a>
                <a
                  href="https://github.com/kiron-official/kiron-official.github.io/settings/pages"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-lg border border-[#93C5FD] bg-[#F0F9FF] text-[#0369A1] text-xs font-semibold hover:bg-[#E0F2FE] whitespace-nowrap shrink-0"
                >
                  GitHub Pages Settings
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
