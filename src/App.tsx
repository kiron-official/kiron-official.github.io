import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanelModal } from './components/AdminPanelModal';
import { LightboxModal } from './components/LightboxModal';
import { useMediaUrl } from './db';
import {
  addCloudComment,
  clearAdminSession,
  createCloudApk,
  createCloudPhoto,
  createCloudPost,
  createCloudVideo,
  deleteCloudApk,
  deleteCloudComment,
  deleteCloudPhoto,
  deleteCloudPost,
  deleteCloudVideo,
  PublicSiteProfile,
  restoreAdminSession,
  savePublicSiteProfile,
  subscribeApks,
  subscribeCollectionLikes,
  subscribePhotos,
  subscribePostComments,
  subscribePosts,
  subscribePublicSiteProfile,
  subscribeVideos,
  testConnection,
  toggleCloudLike,
  verifyAdminPasscode,
} from './firebase';
import {
  AdminTabId,
  CommentItem,
  DEFAULT_BASE_LIKES,
  LightboxSlide,
  LikeCollectionName,
  LikeInfo,
  MainTabId,
  PortalState,
  PostItem,
  SERIAL_TABS,
} from './types';
import {
  formatLikeCount,
  formatTikTok,
  formatWa,
  getDefaultState,
  getVisitorId,
  makeId,
  normalizeApkDownloadUrl,
  normalizeVideoUrl,
  ytEmbed,
} from './utils';

function ResolvedImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const url = useMediaUrl(src);
  if (!url) return null;
  return (
    <img src={url} alt={alt} referrerPolicy="no-referrer" className={className} />
  );
}

function ResolvedVideoPlayer({
  url,
  title,
  className = 'w-full h-full object-contain bg-black',
}: {
  url: string;
  title: string;
  className?: string;
}) {
  const cleanUrl = normalizeVideoUrl(url);
  const resolved = useMediaUrl(cleanUrl);
  const yt = ytEmbed(cleanUrl);
  const isDirectVideo =
    cleanUrl.startsWith('idb:') ||
    cleanUrl.startsWith('data:video/') ||
    /\.(mp4|webm|ogg|mov|m4v|mkv|3gp)(\?|$)/i.test(cleanUrl);

  if (yt) {
    return (
      <iframe
        src={yt}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className="w-full h-full border-0"
      />
    );
  }
  if (isDirectVideo) {
    return resolved ? (
      <video
        src={resolved}
        controls
        playsInline
        preload="metadata"
        className={className}
      />
    ) : (
      <div className="w-full h-full flex items-center justify-center text-xs text-white/70">
        Loading video...
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0F2937] to-[#0369A1] p-6">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-2 rounded-lg bg-[#059669] text-white text-xs font-semibold"
      >
        Watch Video
      </a>
    </div>
  );
}

function ExpandableBody({
  text,
  isExpanded,
  onToggle,
  wrapperClassName = 'mb-2.5',
}: {
  text: string;
  isExpanded: boolean;
  onToggle: () => void;
  wrapperClassName?: string;
}) {
  const pRef = useRef<HTMLParagraphElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      const el = pRef.current;
      if (!el || isExpanded) return;
      setHasOverflow(el.scrollHeight > el.clientHeight + 2);
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [text, isExpanded]);

  return (
    <div className={wrapperClassName}>
      <p
        ref={pRef}
        className={`text-[13.5px] text-[#335160] leading-relaxed whitespace-pre-line ${
          isExpanded ? '' : 'line-clamp-5'
        }`}
      >
        {text}
      </p>
      {(hasOverflow || isExpanded) && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-1 text-xs font-semibold text-[#0284C7] hover:underline cursor-pointer"
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

function LikeButton({
  info,
  baseLikes = DEFAULT_BASE_LIKES,
  onToggle,
}: {
  info?: LikeInfo;
  baseLikes?: number;
  onToggle: () => void;
}) {
  const liked = !!info?.liked;
  const count = Math.max(0, baseLikes) + (info?.count ?? 0);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={liked}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
        liked
          ? 'border-[#FDA4AF] bg-[#FFF1F2] text-[#E11D48] hover:bg-[#FFE4E6]'
          : 'border-[#BCE2D6] bg-[#F4FBF8] text-[#17465A] hover:bg-[#E6F7F1]'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-3.5 h-3.5 shrink-0"
        fill={liked ? '#E11D48' : 'none'}
        stroke={liked ? '#E11D48' : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <span>{count > 0 ? `Like (${formatLikeCount(count)})` : 'Like'}</span>
    </button>
  );
}

export default function App() {
  const [profile, setProfile] = useState<PublicSiteProfile>(() => {
    const def = getDefaultState();
    return { avatar: def.avatar, bio: def.bio, socials: def.socials };
  });
  const [rawPosts, setRawPosts] = useState<Omit<PostItem, 'comments'>[]>([]);
  const [commentsByPost, setCommentsByPost] = useState<
    Record<string, CommentItem[]>
  >({});
  const [photos, setPhotos] = useState<PortalState['photos']>([]);
  const [videos, setVideos] = useState<PortalState['videos']>([]);
  const [apks, setApks] = useState<PortalState['apks']>([]);

  const [activeTab, setActiveTab] = useState<MainTabId>('ALL_POSTS');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<AdminTabId>('posts');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState(false);

  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>(
    {}
  );
  const [commentAuthors, setCommentAuthors] = useState<Record<string, string>>(
    {}
  );
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSlides, setLightboxSlides] = useState<LightboxSlide[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const [copiedWeChat, setCopiedWeChat] = useState<string | null>(null);
  const [wechatModalId, setWechatModalId] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);

  const visitorId = useMemo(() => getVisitorId(), []);
  const [likesByKey, setLikesByKey] = useState<Record<string, LikeInfo>>({});

  const passInputRef = useRef<HTMLInputElement>(null);
  const resolvedAvatar = useMediaUrl(profile.avatar);

  // Boot connection check & session restore
  useEffect(() => {
    void testConnection();
    void restoreAdminSession().then((ok) => {
      if (ok) setIsAuthenticated(true);
    });
  }, []);

  // Real-time public Firestore subscriptions (visible to all visitors immediately)
  useEffect(() => {
    const unsubProfile = subscribePublicSiteProfile(setProfile);
    const unsubPosts = subscribePosts(setRawPosts);
    const unsubPhotos = subscribePhotos(setPhotos);
    const unsubVideos = subscribeVideos(setVideos);
    const unsubApks = subscribeApks(setApks);
    return () => {
      unsubProfile();
      unsubPosts();
      unsubPhotos();
      unsubVideos();
      unsubApks();
    };
  }, []);

  // Real-time comment & like listeners per post
  const postIdsKey = rawPosts.map((p) => p.id).join(',');
  useEffect(() => {
    if (!postIdsKey) return;
    const ids = postIdsKey.split(',').filter(Boolean);
    const unsubs: (() => void)[] = [];
    ids.forEach((postId) => {
      unsubs.push(
        subscribePostComments(postId, (cmts) => {
          setCommentsByPost((prev) => ({ ...prev, [postId]: cmts }));
        })
      );
      unsubs.push(
        subscribeCollectionLikes('posts', postId, visitorId, (info) => {
          setLikesByKey((prev) => ({ ...prev, [`posts:${postId}`]: info }));
        })
      );
    });
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [postIdsKey, visitorId]);

  // Real-time like listeners per photo
  const photoIdsKey = photos.map((p) => p.id).join(',');
  useEffect(() => {
    if (!photoIdsKey) return;
    const ids = photoIdsKey.split(',').filter(Boolean);
    const unsubs = ids.map((photoId) =>
      subscribeCollectionLikes('photos', photoId, visitorId, (info) => {
        setLikesByKey((prev) => ({ ...prev, [`photos:${photoId}`]: info }));
      })
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [photoIdsKey, visitorId]);

  // Real-time like listeners per video
  const videoIdsKey = videos.map((v) => v.id).join(',');
  useEffect(() => {
    if (!videoIdsKey) return;
    const ids = videoIdsKey.split(',').filter(Boolean);
    const unsubs = ids.map((videoId) =>
      subscribeCollectionLikes('videos', videoId, visitorId, (info) => {
        setLikesByKey((prev) => ({ ...prev, [`videos:${videoId}`]: info }));
      })
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [videoIdsKey, visitorId]);

  const posts: PostItem[] = rawPosts.map((p) => ({
    ...p,
    comments: commentsByPost[p.id] || [],
  }));

  const state: PortalState = {
    avatar: profile.avatar,
    bio: profile.bio,
    socials: profile.socials,
    posts,
    photos,
    videos,
    apks,
  };

  useEffect(() => {
    setAvatarBroken(false);
  }, [state.avatar, resolvedAvatar]);

  useEffect(() => {
    if (isLoginOpen) {
      setTimeout(() => passInputRef.current?.focus(), 0);
    }
  }, [isLoginOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxOpen(false);
        setIsLoginOpen(false);
        setIsAdminOpen(false);
      } else if (
        e.key === 'ArrowLeft' &&
        lightboxOpen &&
        lightboxSlides.length > 1
      ) {
        setLightboxIndex(
          (i) => (i - 1 + lightboxSlides.length) % lightboxSlides.length
        );
      } else if (
        e.key === 'ArrowRight' &&
        lightboxOpen &&
        lightboxSlides.length > 1
      ) {
        setLightboxIndex((i) => (i + 1) % lightboxSlides.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxOpen, lightboxSlides.length]);

  const handleSetMainTab = (tab: MainTabId, scrollToContent: boolean) => {
    setActiveTab(tab);
    if (scrollToContent) {
      const el = document.getElementById('content-tabs');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const openAdminOnTab = (tab: AdminTabId) => {
    setAdminInitialTab(tab);
    setIsAdminOpen(true);
  };

  const handleOpenAdminTrigger = () => {
    if (isAuthenticated) {
      setIsAdminOpen(true);
    } else {
      setLoginError(false);
      setIsLoginOpen(true);
    }
  };

  const handleCloseLogin = () => {
    setIsLoginOpen(false);
    setPasswordInput('');
    setLoginError(false);
  };

  const handleCheckPass = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await verifyAdminPasscode(passwordInput);
    if (ok) {
      setIsAuthenticated(true);
      handleCloseLogin();
      setIsAdminOpen(true);
    } else {
      setLoginError(true);
    }
  };

  const handleCopyWeChat = (id: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id).catch(() => {});
    }
    setCopiedWeChat(id);
    setWechatModalId(id);
    setTimeout(() => {
      setCopiedWeChat((cur) => (cur === id ? null : cur));
    }, 2500);
  };

  const handleAddComment = async (e: React.FormEvent, postId: string) => {
    e.preventDefault();
    const text = (commentTexts[postId] || '').trim();
    if (!text) return;
    const author = (commentAuthors[postId] || '').trim() || 'Visitor';
    setCommentTexts((prev) => ({ ...prev, [postId]: '' }));
    setOpenComments((prev) => ({ ...prev, [postId]: true }));
    await addCloudComment(postId, {
      id: makeId('cmt'),
      author,
      text,
    });
  };

  const handleToggleLike = async (col: LikeCollectionName, docId: string) => {
    const key = `${col}:${docId}`;
    const current: LikeInfo = likesByKey[key] || {
      count: 0,
      liked: false,
      hasDoc: false,
    };
    const nextLiked = !current.liked;
    const optimistic: LikeInfo = {
      count: Math.max(0, current.count + (nextLiked ? 1 : -1)),
      liked: nextLiked,
      hasDoc: current.hasDoc,
    };
    setLikesByKey((prev) => ({ ...prev, [key]: optimistic }));
    try {
      await toggleCloudLike(col, docId, visitorId, nextLiked, current.hasDoc);
    } catch {
      setLikesByKey((prev) => ({ ...prev, [key]: current }));
    }
  };

  const openSingleLightbox = (postIdx: number) => {
    const p = state.posts[postIdx];
    if (!p || !p.img) return;
    setLightboxSlides([{ src: p.img, cap: p.title }]);
    setLightboxIndex(0);
    setLightboxOpen(true);
  };

  const openGalleryLightbox = (photoIdx: number) => {
    setLightboxSlides(
      state.photos.map((g, idx) => ({
        src: g.img,
        cap:
          [g.title, g.cap].filter(Boolean).join(' — ') || `Photo ${idx + 1}`,
      }))
    );
    setLightboxIndex(photoIdx);
    setLightboxOpen(true);
  };

  const socialItems = [
    {
      name: 'Facebook',
      url: state.socials.facebook.trim(),
      cls: 'border-[#93C5FD] bg-[#F0F9FF] text-[#0369A1] hover:bg-[#E0F2FE]',
      isWeChat: false,
    },
    {
      name: 'WhatsApp',
      url: formatWa(state.socials.whatsapp),
      cls: 'border-[#86EFAC] bg-[#ECFDF5] text-[#047857] hover:bg-[#D1FAE5]',
      isWeChat: false,
    },
    {
      name: 'TikTok',
      url: formatTikTok(state.socials.tiktok),
      cls: 'border-[#99D6C9] bg-[#F0FDFA] text-[#0F766E] hover:bg-[#CCFBF1]',
      isWeChat: false,
    },
    {
      name: 'Telegram',
      url: state.socials.telegram.trim(),
      cls: 'border-[#7DD3FC] bg-[#F0F9FF] text-[#0284C7] hover:bg-[#E0F2FE]',
      isWeChat: false,
    },
    {
      name: 'YouTube',
      url: (state.socials.youtube || '').trim(),
      cls: 'border-[#FCA5A5] bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2]',
      isWeChat: false,
    },
    {
      name: 'WeChat',
      url: state.socials.wechat.trim(),
      cls: 'border-[#6EE7B7] bg-[#ECFDF5] text-[#047857] hover:bg-[#D1FAE5]',
      isWeChat: true,
    },
  ].filter((x) => x.url);

  const announcementPosts = state.posts.filter((p) => p.cat === 'Announcement');

  const quickAddTab: Record<MainTabId, { label: string; tab: AdminTabId }> = {
    ALL_POSTS: { label: '+ Add Post', tab: 'posts' },
    PHOTOS: { label: '+ Add Photo', tab: 'photos' },
    VIDEOS: { label: '+ Add Video', tab: 'videos' },
    APK: { label: '+ Add APK', tab: 'apk' },
    ANNOUNCEMENTS: { label: '+ Add Announcement', tab: 'posts' },
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F3FAF8] text-[#0F2937]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-[#E3F6EE]/95 via-[#EAF7F7]/95 to-[#E1F1FE]/95 backdrop-blur-md border-b border-[#9ED6C8]">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="inline-flex items-center gap-3 text-[#0F2937] font-bold text-base sm:text-lg tracking-tight whitespace-nowrap shrink-0"
          >
            <span className="w-9 h-9 rounded-full border-2 border-[#059669] bg-white flex items-center justify-center font-bold text-sm text-[#059669] overflow-hidden shrink-0">
              {resolvedAvatar && !avatarBroken ? (
                <img
                  src={resolvedAvatar}
                  alt="MD KIRON MONDAL (বাবুনির বাবু)"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarBroken(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                'K'
              )}
            </span>
            <span>MD KIRON MONDAL</span>
          </a>

          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-semibold text-[#114B5F]"
          >
            {SERIAL_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSetMainTab(t.id, true)}
                className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer underline-offset-4 ${
                  activeTab === t.id
                    ? 'text-[#059669] underline'
                    : 'hover:text-[#0284C7] hover:underline'
                }`}
              >
                {t.nav}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleOpenAdminTrigger}
              className="px-4 py-2 rounded-lg text-xs font-semibold tracking-wide bg-gradient-to-r from-[#059669] to-[#0284C7] text-white hover:from-[#047857] hover:to-[#0369A1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isAuthenticated ? 'KIRON Panel' : 'KIRON'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero & 1-Line Social Connect Bar */}
        <section
          id="top"
          className="bg-gradient-to-r from-[#D8F3E8] via-[#E5F4FA] to-[#DCEFFE] border-b border-[#A5DDD0]"
        >
          <div className="max-w-6xl mx-auto px-5 py-6 sm:py-8 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex items-center gap-4 max-w-xl">
              {resolvedAvatar && !avatarBroken && (
                <img
                  src={resolvedAvatar}
                  alt="MD KIRON MONDAL (বাবুনির বাবু)"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarBroken(true)}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-white shadow-lg shrink-0"
                />
              )}
              {state.avatar && avatarBroken && (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white border-4 border-white shadow-lg flex items-center justify-center font-display text-2xl font-bold text-[#059669] shrink-0">
                  K
                </div>
              )}
              <div>
                <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-[#0F2937] leading-tight text-balance">
                  MD KIRON MONDAL
                </h1>
                {state.bio && state.bio.trim() && (
                  <p className="mt-2 text-sm sm:text-base text-[#17465A] leading-relaxed whitespace-pre-line">
                    {state.bio}
                  </p>
                )}
              </div>
            </div>

            {socialItems.length > 0 && (
              <div className="inline-flex flex-nowrap items-center gap-1.5 bg-white/90 border border-[#9ED6C8] rounded-xl p-1.5 self-start lg:self-center max-w-full overflow-x-auto shrink-0">
                {socialItems.map((item) =>
                  item.isWeChat && !item.url.startsWith('http') ? (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => handleCopyWeChat(item.url)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${item.cls}`}
                    >
                      <span>
                        {copiedWeChat === item.url ? `Copied: ${item.url}` : 'WeChat'}
                      </span>
                    </button>
                  ) : (
                    <a
                      key={item.name}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${item.cls}`}
                    >
                      {item.name}
                    </a>
                  )
                )}
              </div>
            )}
          </div>
        </section>

        {/* Serial Tabs & Active Content */}
        <section id="content-tabs" className="py-7 sm:py-9">
          <div className="max-w-6xl mx-auto px-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div
                role="tablist"
                aria-label="Content sections"
                className="inline-flex flex-wrap items-center gap-1.5 p-1.5 bg-white border border-[#9ED6C8] rounded-xl"
              >
                {SERIAL_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === t.id}
                    onClick={() => handleSetMainTab(t.id, false)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeTab === t.id
                        ? 'bg-gradient-to-r from-[#059669] to-[#0284C7] text-white'
                        : 'text-[#17465A] hover:bg-[#EAF6F4]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => openAdminOnTab(quickAddTab[activeTab].tab)}
                  className="px-4 py-2 rounded-lg bg-[#059669] text-white text-xs font-semibold hover:bg-[#047857] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {quickAddTab[activeTab].label}
                </button>
              )}
            </div>

            <div role="tabpanel">
              {activeTab === 'ALL_POSTS' &&
                (state.posts.length === 0 ? (
                  <div className="bg-white border border-[#B7DFD4] rounded-2xl p-10 text-center">
                    <p className="text-sm text-[#335160]">No posts yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
                    {state.posts.map((p, idx) => {
                      const cmts = p.comments || [];
                      const isOpen = !!openComments[p.id];
                      const isExpanded = !!expandedPosts[p.id];
                      return (
                        <article
                          key={p.id}
                          className="bg-white border border-[#A7DFD2] rounded-xl overflow-hidden flex flex-col shadow-xs hover:shadow-md transition-shadow"
                        >
                          {p.img && (
                            <button
                              type="button"
                              onClick={() => openSingleLightbox(idx)}
                              className="block w-full overflow-hidden group cursor-pointer shrink-0"
                            >
                              <ResolvedImage
                                src={p.img}
                                alt={p.title}
                                className="w-full h-auto block transition-transform duration-200 group-hover:scale-[1.02]"
                              />
                            </button>
                          )}
                          {p.videoUrl && (
                            <div className="aspect-video bg-[#0F2937] shrink-0">
                              <ResolvedVideoPlayer
                                url={p.videoUrl}
                                title={p.title}
                              />
                            </div>
                          )}
                          <div className="p-3.5 flex-1 flex flex-col">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="flex flex-wrap items-center gap-1 text-xs font-semibold text-[#059669]">
                                <span>
                                  {!p.cat || p.cat === 'Update' ? 'POSTS' : p.cat}
                                </span>
                                {p.createdAt && (
                                  <>
                                    <span
                                      aria-hidden="true"
                                      className="text-[#8EB9AD]"
                                    >
                                      &middot;
                                    </span>
                                    <span className="text-[#0369A1] font-medium whitespace-nowrap">
                                      {p.createdAt}
                                    </span>
                                  </>
                                )}
                              </div>
                              {isAuthenticated && (
                                <button
                                  type="button"
                                  onClick={() => void deleteCloudPost(p.id)}
                                  className="px-1.5 py-0.5 rounded bg-[#DC2626] text-white text-[10px] font-semibold hover:bg-[#B91C1C] cursor-pointer shrink-0"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                            <h3 className="text-[15.5px] font-bold text-[#0F2937] leading-snug line-clamp-2 mb-1.5">
                              {p.title}
                            </h3>
                            {p.body && (
                              <ExpandableBody
                                text={p.body}
                                isExpanded={isExpanded}
                                onToggle={() =>
                                  setExpandedPosts((prev) => ({
                                    ...prev,
                                    [p.id]: !prev[p.id],
                                  }))
                                }
                              />
                            )}

                            <div className="mt-auto pt-2.5 border-t border-[#E4F3EE] flex flex-wrap items-center gap-2">
                              <LikeButton
                                info={likesByKey[`posts:${p.id}`]}
                                baseLikes={p.baseLikes}
                                onToggle={() => void handleToggleLike('posts', p.id)}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenComments((prev) => ({
                                    ...prev,
                                    [p.id]: !prev[p.id],
                                  }))
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#93C5FD] bg-[#F0F9FF] text-[#0369A1] text-xs font-semibold hover:bg-[#E0F2FE] cursor-pointer"
                              >
                                Comments ({cmts.length})
                              </button>
                            </div>

                            {isOpen && (
                              <div className="mt-2.5 pt-2.5 border-t border-[#E4F3EE] space-y-2">
                                {cmts.length > 0 ? (
                                  cmts.map((c) => (
                                    <div
                                      key={c.id}
                                      className="bg-[#F4FBF8] border border-[#CDECE2] rounded-xl px-2.5 py-1.5 text-[13px] flex items-start justify-between gap-2"
                                    >
                                      <div>
                                        <div className="font-bold text-[#047857] text-xs mb-0.5">
                                          {c.author}
                                        </div>
                                        <div className="text-[#0F2937]">
                                          {c.text}
                                        </div>
                                      </div>
                                      {isAuthenticated && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void deleteCloudComment(p.id, c.id)
                                          }
                                          className="px-2 py-0.5 rounded bg-[#FEE2E2] text-[#B91C1C] text-[11px] font-semibold cursor-pointer shrink-0"
                                        >
                                          Delete
                                        </button>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-[#5A7B8A]">
                                    No comments yet.
                                  </p>
                                )}
                                <form
                                  onSubmit={(e) => void handleAddComment(e, p.id)}
                                  className="space-y-2 pt-1"
                                >
                                  <input
                                    value={commentAuthors[p.id] || ''}
                                    onChange={(e) =>
                                      setCommentAuthors((prev) => ({
                                        ...prev,
                                        [p.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Your name (optional)"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#BCE2D6] bg-white text-xs text-[#0F2937]"
                                  />
                                  <div className="flex gap-2">
                                    <input
                                      value={commentTexts[p.id] || ''}
                                      onChange={(e) =>
                                        setCommentTexts((prev) => ({
                                          ...prev,
                                          [p.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="Write a comment..."
                                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[#BCE2D6] bg-white text-xs text-[#0F2937]"
                                    />
                                    <button
                                      type="submit"
                                      className="px-3 py-1.5 rounded-lg bg-[#059669] text-white text-xs font-semibold hover:bg-[#047857] shrink-0 cursor-pointer"
                                    >
                                      Send
                                    </button>
                                  </div>
                                </form>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ))}

              {activeTab === 'PHOTOS' &&
                (state.photos.length === 0 ? (
                  <div className="bg-white border border-[#B4D8EC] rounded-2xl p-10 text-center">
                    <p className="text-sm text-[#335160]">
                      No photos added yet.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
                    {state.photos.map((g, i) => (
                      <figure
                        key={g.id}
                        className="bg-white border border-[#A7DFD2] rounded-xl overflow-hidden group flex flex-col shadow-xs hover:shadow-md transition-shadow"
                      >
                        <button
                          type="button"
                          onClick={() => openGalleryLightbox(i)}
                          className="block w-full overflow-hidden cursor-pointer shrink-0"
                        >
                          <ResolvedImage
                            src={g.img}
                            alt={g.title || g.cap || 'Photo'}
                            className="w-full h-auto block transition-transform duration-200 group-hover:scale-[1.02]"
                          />
                        </button>
                        <div className="p-3.5 flex-1 flex flex-col">
                          {g.title && (
                            <h3 className="text-[15.5px] font-bold text-[#0F2937] leading-snug line-clamp-2 mb-1">
                              {g.title}
                            </h3>
                          )}
                          {g.cap && (
                            <figcaption className="text-[13.5px] text-[#335160] leading-relaxed mb-2.5">
                              {g.cap}
                            </figcaption>
                          )}
                          <div className="mt-auto pt-2.5 border-t border-[#E4F3EE] flex items-center justify-between gap-2">
                            <LikeButton
                              info={likesByKey[`photos:${g.id}`]}
                              baseLikes={g.baseLikes}
                              onToggle={() =>
                                void handleToggleLike('photos', g.id)
                              }
                            />
                            {isAuthenticated && (
                              <button
                                type="button"
                                onClick={() => void deleteCloudPhoto(g.id)}
                                className="px-2 py-0.5 rounded bg-[#DC2626] text-white text-[11px] font-semibold hover:bg-[#B91C1C] cursor-pointer shrink-0"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </figure>
                    ))}
                  </div>
                ))}

              {activeTab === 'VIDEOS' &&
                (state.videos.length === 0 ? (
                  <div className="bg-white border border-[#B4D8EC] rounded-2xl p-10 text-center">
                    <p className="text-sm text-[#335160]">
                      No videos added yet.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
                    {state.videos.map((v) => (
                      <article
                        key={v.id}
                        className="bg-white border border-[#9FD0EC] rounded-xl overflow-hidden flex flex-col shadow-xs hover:shadow-md transition-shadow"
                      >
                        <div className="aspect-video bg-[#0F2937] shrink-0">
                          <ResolvedVideoPlayer url={v.url} title={v.title} />
                        </div>
                        <div className="p-3.5 flex-1 flex flex-col">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            {v.createdAt ? (
                              <div className="text-xs font-semibold text-[#0284C7] whitespace-nowrap">
                                {v.createdAt}
                              </div>
                            ) : (
                              <span />
                            )}
                            {isAuthenticated && (
                              <button
                                type="button"
                                onClick={() => void deleteCloudVideo(v.id)}
                                className="px-1.5 py-0.5 rounded bg-[#DC2626] text-white text-[10px] font-semibold hover:bg-[#B91C1C] cursor-pointer shrink-0"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          <h3 className="text-[15.5px] font-bold text-[#0F2937] line-clamp-2">
                            {v.title}
                          </h3>
                          {v.description && (
                            <p className="mt-1 mb-2.5 text-[13.5px] text-[#335160] leading-relaxed whitespace-pre-line line-clamp-4">
                              {v.description}
                            </p>
                          )}
                          <div className="mt-auto pt-2.5 border-t border-[#E4F3EE]">
                            <LikeButton
                              info={likesByKey[`videos:${v.id}`]}
                              baseLikes={v.baseLikes}
                              onToggle={() =>
                                void handleToggleLike('videos', v.id)
                              }
                            />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ))}

              {activeTab === 'APK' &&
                (state.apks.length === 0 ? (
                  <div className="bg-white border border-[#A7DFD2] rounded-2xl p-10 text-center">
                    <p className="text-sm text-[#335160]">
                      No APK files shared yet.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
                    {state.apks.map((a) => {
                      const isData = a.downloadUrl.startsWith('data:');
                      return (
                        <article
                          key={a.id}
                          className="bg-white border border-[#A7DFD2] rounded-xl p-3.5 flex flex-col justify-between gap-3 shadow-xs hover:shadow-md transition-shadow"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-[15.5px] font-bold text-[#0F2937] line-clamp-1">
                                {a.name}
                              </h3>
                              {isAuthenticated && (
                                <button
                                  type="button"
                                  onClick={() => void deleteCloudApk(a.id)}
                                  className="px-1.5 py-0.5 rounded bg-[#DC2626] text-white text-[10px] font-semibold hover:bg-[#B91C1C] cursor-pointer shrink-0"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                            <div className="text-xs text-[#0369A1] font-medium mt-0.5">
                              v{a.version}
                              {a.sizeLabel ? ` · ${a.sizeLabel}` : ''}
                              {a.createdAt ? ` · ${a.createdAt}` : ''}
                            </div>
                            {a.description && (
                              <p className="text-[13.5px] text-[#335160] leading-relaxed mt-1.5 line-clamp-4">
                                {a.description}
                              </p>
                            )}
                          </div>
                          <a
                            href={
                              isData
                                ? a.downloadUrl
                                : normalizeApkDownloadUrl(a.downloadUrl)
                            }
                            {...(isData
                              ? { download: a.fileName || `${a.name}.apk` }
                              : {
                                  target: '_blank',
                                  rel: 'noopener noreferrer',
                                })}
                            className="inline-flex items-center justify-center w-full px-3.5 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold"
                          >
                            Download APK
                          </a>
                        </article>
                      );
                    })}
                  </div>
                ))}

              {activeTab === 'ANNOUNCEMENTS' &&
                (announcementPosts.length === 0 ? (
                  <div className="bg-white border border-[#B4D8EC] rounded-2xl p-10 text-center">
                    <p className="text-sm text-[#335160]">
                      No announcements published yet.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
                    {announcementPosts.map((item) => {
                      const isExpanded = !!expandedPosts[`ann-${item.id}`];
                      return (
                        <article
                          key={item.id}
                          className="bg-white border border-[#9FD0EC] rounded-xl p-3.5 flex flex-col shadow-xs hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="text-xs font-semibold text-[#0284C7]">
                              Announcement
                              {item.createdAt ? ` · ${item.createdAt}` : ''}
                            </div>
                            {isAuthenticated && (
                              <button
                                type="button"
                                onClick={() => void deleteCloudPost(item.id)}
                                className="px-1.5 py-0.5 rounded bg-[#DC2626] text-white text-[10px] font-semibold hover:bg-[#B91C1C] cursor-pointer shrink-0"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          <h3 className="text-[15.5px] font-bold text-[#0F2937] line-clamp-2 mb-1.5">
                            {item.title}
                          </h3>
                          {item.body && (
                            <ExpandableBody
                              text={item.body}
                              isExpanded={isExpanded}
                              wrapperClassName="mb-2.5"
                              onToggle={() =>
                                setExpandedPosts((prev) => ({
                                  ...prev,
                                  [`ann-${item.id}`]: !prev[`ann-${item.id}`],
                                }))
                              }
                            />
                          )}
                          <div className="mt-auto pt-2.5 border-t border-[#E4F3EE]">
                            <LikeButton
                              info={likesByKey[`posts:${item.id}`]}
                              baseLikes={item.baseLikes}
                              onToggle={() =>
                                void handleToggleLike('posts', item.id)
                              }
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#9ED6C8] bg-gradient-to-r from-[#E3F6EE] to-[#E1F1FE] py-5">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-medium text-[#17465A]">
          <span>&copy; {new Date().getFullYear()} MD KIRON MONDAL</span>
          <div className="flex flex-wrap items-center gap-5">
            {SERIAL_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  handleSetMainTab(t.id, false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="hover:text-[#059669] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </footer>

      {/* Lightbox Modal */}
      <LightboxModal
        slides={lightboxSlides}
        index={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onNavigate={(dir) =>
          setLightboxIndex(
            (i) => (i + dir + lightboxSlides.length) % lightboxSlides.length
          )
        }
      />

      {/* Password Login Modal */}
      {isLoginOpen && (
        <div
          onClick={handleCloseLogin}
          role="dialog"
          aria-modal="true"
          aria-label="KIRON Login"
          className="fixed inset-0 z-50 bg-[#0F2937]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white border border-[#9ED6C8] rounded-2xl p-6 shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#0F2937]">KIRON</h3>
              <button
                type="button"
                onClick={handleCloseLogin}
                aria-label="Close"
                className="w-8 h-8 rounded-lg text-[#4A6B7A] hover:bg-[#EDF7F6] flex items-center justify-center cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={(e) => void handleCheckPass(e)} className="space-y-4">
              <div>
                <label
                  htmlFor="adminPass"
                  className="block text-xs font-semibold text-[#17465A] mb-1.5"
                >
                  Password
                </label>
                <input
                  ref={passInputRef}
                  id="adminPass"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBE5DC] text-sm text-[#0F2937] focus:outline-none focus:border-[#0284C7]"
                />
              </div>
              {loginError && (
                <p className="text-xs font-semibold text-[#DC2626]">
                  Wrong password! Try again.
                </p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCloseLogin}
                  className="px-4 py-2 rounded-lg bg-[#E2E8F0] text-[#0F2937] text-xs font-semibold hover:bg-[#CBD5E1] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold hover:from-[#047857] hover:to-[#0369A1] cursor-pointer"
                >
                  Login
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WeChat ID Modal */}
      {wechatModalId && (
        <div
          onClick={() => setWechatModalId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="WeChat ID"
          className="fixed inset-0 z-50 bg-[#0F2937]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white border border-[#9ED6C8] rounded-2xl p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#0F2937]">WeChat ID</h3>
              <button
                type="button"
                onClick={() => setWechatModalId(null)}
                aria-label="Close"
                className="w-8 h-8 rounded-lg text-[#4A6B7A] hover:bg-[#EDF7F6] flex items-center justify-center cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-[#ECFDF5] border border-[#6EE7B7] text-center space-y-1">
              <div className="text-xs font-semibold text-[#047857]">
                {copiedWeChat === wechatModalId
                  ? 'WeChat ID Copied!'
                  : 'Copy ID & search in WeChat'}
              </div>
              <div className="text-base font-bold font-mono text-[#0F2937] select-all break-all">
                {wechatModalId}
              </div>
            </div>
            <p className="text-xs text-[#335160] leading-relaxed">
              Open WeChat &rarr; Tap <strong>+</strong> &rarr;{' '}
              <strong>Add Contacts</strong> &rarr; Paste this WeChat ID to connect.
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleCopyWeChat(wechatModalId)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#6EE7B7] bg-[#ECFDF5] text-[#047857] text-xs font-bold hover:bg-[#D1FAE5] cursor-pointer"
              >
                {copiedWeChat === wechatModalId ? 'Copied!' : 'Copy WeChat ID'}
              </button>
              <a
                href="weixin://"
                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-bold hover:from-[#047857] hover:to-[#0369A1]"
              >
                Open WeChat App
              </a>
            </div>
          </div>
        </div>
      )}

      {/* KIRON Control Panel Modal */}
      <AdminPanelModal
        isOpen={isAdminOpen}
        initialTab={adminInitialTab}
        state={state}
        onSaveProfile={savePublicSiteProfile}
        onCreatePost={createCloudPost}
        onDeletePost={deleteCloudPost}
        onDeleteComment={deleteCloudComment}
        onCreatePhoto={createCloudPhoto}
        onDeletePhoto={deleteCloudPhoto}
        onCreateVideo={createCloudVideo}
        onDeleteVideo={deleteCloudVideo}
        onCreateApk={createCloudApk}
        onDeleteApk={deleteCloudApk}
        onClose={() => setIsAdminOpen(false)}
        onLock={() => {
          clearAdminSession();
          setIsAuthenticated(false);
          setIsAdminOpen(false);
        }}
      />
    </div>
  );
}
