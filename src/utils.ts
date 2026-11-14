import {
  ADMIN_PASS_HASH,
  DEFAULT_SOCIALS,
  PortalState,
  STORAGE_KEY,
} from './types';

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatEnglishPostDate(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return `${dd}.${mm}.${yyyy} - ${days[date.getDay()]}`;
}

export function monthYear(): string {
  return formatEnglishPostDate();
}

export function formatWa(val: string): string {
  const t = String(val || '').trim();
  if (!t) return '';
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  const digits = t.replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : t;
}

export function normalizeVideoUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.hostname.includes('dropbox.com')) {
      u.searchParams.delete('dl');
      u.searchParams.set('raw', '1');
      return u.toString();
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

export function normalizeApkDownloadUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.hostname.includes('drive.google.com')) {
      const match = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = match?.[1] || u.searchParams.get('id');
      if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
    }
    if (u.hostname.includes('dropbox.com')) {
      u.searchParams.delete('raw');
      u.searchParams.set('dl', '1');
      return u.toString();
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

export function ytEmbed(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '').trim();
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/shorts/')[1]?.split('/')[0];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (u.pathname.startsWith('/live/')) {
        const id = u.pathname.split('/live/')[1]?.split('/')[0];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (u.pathname.startsWith('/embed/')) return url;
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes('drive.google.com')) {
      const match = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = match?.[1] || u.searchParams.get('id');
      return id ? `https://drive.google.com/file/d/${id}/preview` : null;
    }
    if (u.hostname.includes('vimeo.com')) {
      const match = u.pathname.match(/\/(\d+)/);
      return match?.[1] ? `https://player.vimeo.com/video/${match[1]}` : null;
    }
    if (u.hostname.includes('dailymotion.com')) {
      const match = u.pathname.match(/\/video\/([^/_]+)/);
      return match?.[1] ? `https://www.dailymotion.com/embed/video/${match[1]}` : null;
    }
    if (u.hostname === 'dai.ly') {
      const id = u.pathname.replace('/', '').trim();
      return id ? `https://www.dailymotion.com/embed/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function readDataUrl(file?: File | null): Promise<string> {
  return new Promise((resolve) => {
    if (!file) return resolve('');
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => resolve('');
    r.readAsDataURL(file);
  });
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getDefaultState(): PortalState {
  return {
    avatar: 'profile.jpg',
    bio: '',
    socials: { ...DEFAULT_SOCIALS },
    posts: [],
    photos: [],
    videos: [],
    apks: [],
  };
}

export function loadState(): PortalState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return getDefaultState();
    return {
      avatar: typeof raw.avatar === 'string' ? raw.avatar : 'profile.jpg',
      bio: typeof raw.bio === 'string' ? raw.bio : '',
      socials: {
        facebook: raw.socials?.facebook ?? DEFAULT_SOCIALS.facebook,
        whatsapp: raw.socials?.whatsapp ?? DEFAULT_SOCIALS.whatsapp,
        tiktok: raw.socials?.tiktok ?? DEFAULT_SOCIALS.tiktok,
        telegram: raw.socials?.telegram ?? DEFAULT_SOCIALS.telegram,
        wechat: raw.socials?.wechat ?? DEFAULT_SOCIALS.wechat,
        youtube: raw.socials?.youtube ?? DEFAULT_SOCIALS.youtube,
      },
      posts: Array.isArray(raw.posts) ? raw.posts : [],
      photos: Array.isArray(raw.photos) ? raw.photos : [],
      videos: Array.isArray(raw.videos) ? raw.videos : [],
      apks: Array.isArray(raw.apks) ? raw.apks : [],
    };
  } catch {
    return getDefaultState();
  }
}

export function saveState(state: PortalState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function generateStandaloneHtml(state: PortalState): string {
  const safeJson = JSON.stringify(state).replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>বাবুনির বাবু · MD KIRON MONDAL — Official Website</title>
  <meta name="description" content="বাবুনির বাবু (MD KIRON MONDAL) — Official personal website at kiron-official.github.io. View profile photo, posts, photos, HD videos, and APKs." />
  <meta name="keywords" content="বাবুনির বাবু, Babunir Babu, MD KIRON MONDAL, Kiron Mondal, kiron-official, kiron-official.github.io" />
  <meta name="author" content="বাবুনির বাবু (MD KIRON MONDAL)" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <link rel="canonical" href="https://kiron-official.github.io/" />
  <link rel="icon" type="image/jpeg" href="./profile.jpg" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://kiron-official.github.io/" />
  <meta property="og:title" content="বাবুনির বাবু · MD KIRON MONDAL — Official Website" />
  <meta property="og:description" content="বাবুনির বাবু (MD KIRON MONDAL) — Official personal website at kiron-official.github.io." />
  <meta property="og:image" content="https://kiron-official.github.io/profile.jpg" />
  <meta property="og:image:alt" content="বাবুনির বাবু (MD KIRON MONDAL) Profile Photo" />
  <meta property="og:site_name" content="বাবুনির বাবু — MD KIRON MONDAL" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="বাবুনির বাবু · MD KIRON MONDAL — Official Website" />
  <meta name="twitter:description" content="বাবুনির বাবু (MD KIRON MONDAL) — Official personal website at kiron-official.github.io." />
  <meta name="twitter:image" content="https://kiron-official.github.io/profile.jpg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "name": "MD KIRON MONDAL",
        "alternateName": ["বাবুনির বাবু", "Babunir Babu", "Kiron Mondal", "kiron-official"],
        "url": "https://kiron-official.github.io/",
        "image": "https://kiron-official.github.io/profile.jpg"
      },
      {
        "@type": "WebSite",
        "name": "MD KIRON MONDAL (বাবুনির বাবু)",
        "alternateName": ["বাবুনির বাবু", "Babunir Babu"],
        "url": "https://kiron-official.github.io/"
      }
    ]
  }
  </script>
  <style>
    html { scroll-behavior: smooth; font-family: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif; background-color: #F3FAF8; color: #0F2937; }
    .font-display { font-family: "Playfair Display", Georgia, serif; }
  </style>
</head>
<body class="min-h-screen flex flex-col bg-[#F3FAF8] text-[#0F2937]">
  <header class="sticky top-0 z-30 bg-gradient-to-r from-[#E3F6EE]/95 via-[#EAF7F7]/95 to-[#E1F1FE]/95 backdrop-blur-md border-b border-[#9ED6C8]">
    <div class="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-8">
      <a href="#top" class="inline-flex items-center gap-3 text-[#0F2937] font-bold text-base sm:text-lg tracking-tight whitespace-nowrap shrink-0">
        <span id="navAvatar" class="w-9 h-9 rounded-full border-2 border-[#059669] bg-white flex items-center justify-center font-bold text-sm text-[#059669] overflow-hidden shrink-0">K</span>
        <span>MD KIRON MONDAL</span>
      </a>
      <nav aria-label="Primary Navigation" class="hidden md:flex items-center gap-6 text-sm font-semibold text-[#114B5F]" id="topNavLinks"></nav>
      <div class="flex items-center gap-3 shrink-0">
        <button type="button" id="kironBtn" onclick="openAdminTrigger()" class="px-4 py-2 rounded-lg text-xs font-semibold tracking-wide bg-gradient-to-r from-[#059669] to-[#0284C7] text-white hover:from-[#047857] hover:to-[#0369A1] transition-colors whitespace-nowrap shrink-0 cursor-pointer">
          KIRON
        </button>
      </div>
    </div>
  </header>

  <main class="flex-1">
    <section id="top" class="bg-gradient-to-r from-[#D8F3E8] via-[#E5F4FA] to-[#DCEFFE] border-b border-[#A5DDD0]">
      <div class="max-w-6xl mx-auto px-5 py-6 sm:py-8 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div class="flex items-center gap-4 max-w-xl">
          <img id="heroAvatar" src="profile.jpg" alt="MD KIRON MONDAL" class="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-white shadow-lg shrink-0" />
          <div>
            <h1 class="font-display text-2xl sm:text-4xl font-bold tracking-tight text-[#0F2937] leading-tight">MD KIRON MONDAL</h1>
            <p id="heroBio" class="mt-2 text-sm sm:text-base text-[#17465A] leading-relaxed whitespace-pre-line hidden"></p>
          </div>
        </div>
        <div id="socialBarWrap" class="inline-flex flex-nowrap items-center gap-1.5 bg-white/90 border border-[#9ED6C8] rounded-xl p-1.5 self-start lg:self-center max-w-full overflow-x-auto shrink-0"></div>
      </div>
    </section>

    <section id="content-tabs" class="py-8 sm:py-10">
      <div class="max-w-6xl mx-auto px-5">
        <div id="serialTabs" role="tablist" aria-label="Content sections" class="inline-flex flex-wrap items-center gap-1.5 p-1.5 bg-white border border-[#9ED6C8] rounded-xl mb-7"></div>
        <div id="tabContent" role="tabpanel"></div>
      </div>
    </section>
  </main>

  <footer class="border-t border-[#9ED6C8] bg-gradient-to-r from-[#E3F6EE] to-[#E1F1FE] py-5">
    <div class="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-medium text-[#17465A]">
      <span id="footerYear"></span>
      <div id="footerTabs" class="flex flex-wrap items-center gap-5"></div>
    </div>
  </footer>

  <div id="lightboxModal" onclick="closeLightbox()" class="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm hidden items-center justify-center p-4 sm:p-8">
    <button type="button" onclick="closeLightbox()" aria-label="Close photo viewer" class="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 text-white hover:bg-white/25 flex items-center justify-center cursor-pointer text-lg font-bold">&times;</button>
    <button type="button" id="lbPrev" onclick="event.stopPropagation(); navLightbox(-1)" aria-label="Previous photo" class="absolute left-3 sm:left-6 w-11 h-11 rounded-full bg-white/15 text-white hover:bg-white/25 flex items-center justify-center cursor-pointer text-xl font-bold">&lsaquo;</button>
    <div onclick="event.stopPropagation()" class="max-w-4xl w-full flex flex-col items-center gap-3">
      <img id="lbImg" src="" alt="" class="max-h-[78vh] w-auto max-w-full rounded-xl object-contain shadow-2xl" />
      <div class="flex items-center justify-between gap-4 w-full max-w-2xl px-2 text-white/90 text-sm">
        <p id="lbCap" class="leading-snug"></p>
        <span id="lbCount" class="text-xs text-white/70 tabular-nums shrink-0"></span>
      </div>
    </div>
    <button type="button" id="lbNext" onclick="event.stopPropagation(); navLightbox(1)" aria-label="Next photo" class="absolute right-3 sm:right-6 w-11 h-11 rounded-full bg-white/15 text-white hover:bg-white/25 flex items-center justify-center cursor-pointer text-xl font-bold">&rsaquo;</button>
  </div>

  <div id="loginModal" onclick="closeLogin()" class="fixed inset-0 z-50 bg-[#0F2937]/60 backdrop-blur-xs hidden items-center justify-center p-4">
    <div onclick="event.stopPropagation()" class="w-full max-w-sm bg-white border border-[#9ED6C8] rounded-2xl p-6 shadow-xl">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-[#0F2937]">KIRON</h3>
        <button type="button" onclick="closeLogin()" aria-label="Close" class="w-8 h-8 rounded-lg text-[#4A6B7A] hover:bg-[#EDF7F6] flex items-center justify-center cursor-pointer">&times;</button>
      </div>
      <form onsubmit="checkPass(event)" class="space-y-4">
        <div>
          <label for="adminPass" class="block text-xs font-semibold text-[#17465A] mb-1.5">Password</label>
          <input id="adminPass" type="password" placeholder="Enter password" class="w-full px-3.5 py-2.5 rounded-xl border border-[#CBE5DC] text-sm text-[#0F2937] focus:outline-none focus:border-[#0284C7]" />
        </div>
        <p id="loginErr" class="text-xs font-semibold text-[#DC2626] hidden">Wrong password! Try again.</p>
        <div class="flex items-center justify-end gap-2 pt-1">
          <button type="button" onclick="closeLogin()" class="px-4 py-2 rounded-lg bg-[#E2E8F0] text-[#0F2937] text-xs font-semibold hover:bg-[#CBD5E1] cursor-pointer">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold hover:from-[#047857] hover:to-[#0369A1] cursor-pointer">Login</button>
        </div>
      </form>
    </div>
  </div>

  <div id="adminModal" onclick="closeAdmin()" class="fixed inset-0 z-50 bg-[#0F2937]/60 backdrop-blur-xs hidden items-center justify-center p-4">
    <div onclick="event.stopPropagation()" class="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white border border-[#9ED6C8] rounded-2xl shadow-2xl overflow-hidden">
      <div class="px-6 py-4 border-b border-[#DCEFE9] flex items-center justify-between gap-4 bg-gradient-to-r from-[#E6F6F0] to-[#E6F2FC]">
        <h3 class="text-lg font-bold text-[#0F2937]">KIRON Control Panel</h3>
        <div class="flex items-center gap-2">
          <button type="button" onclick="lockSession()" class="px-3 py-1.5 rounded-lg border border-[#A5DDD0] bg-white text-[#17465A] text-xs font-semibold hover:bg-[#EDF7F6] cursor-pointer">Lock</button>
          <button type="button" onclick="closeAdmin()" aria-label="Close" class="w-8 h-8 rounded-lg text-[#4A6B7A] hover:bg-white/70 flex items-center justify-center cursor-pointer">&times;</button>
        </div>
      </div>
      <div id="adminTabsBar" class="px-6 pt-3 pb-0 border-b border-[#DCEFE9] flex flex-wrap gap-1 bg-white"></div>
      <div id="adminTabBody" class="p-6 overflow-y-auto space-y-6"></div>
    </div>
  </div>

  <script>
    const PASS_HASH = '${ADMIN_PASS_HASH}';
    const KEY = '${STORAGE_KEY}';
    const BAKED_INITIAL_STATE = ${safeJson};

    const SERIAL_TABS = [
      { id: 'ALL_POSTS', label: 'ALL POSTS', nav: 'Posts' },
      { id: 'PHOTOS', label: 'PHOTOS', nav: 'Photos' },
      { id: 'VIDEOS', label: 'VIDEOS', nav: 'Videos' },
      { id: 'APK', label: 'APK', nav: 'APK' },
      { id: 'ANNOUNCEMENTS', label: 'ANNOUNCEMENTS', nav: 'Announcements' }
    ];

    const ADMIN_TABS = [
      { id: 'posts', label: 'Posts' },
      { id: 'videos', label: 'Videos' },
      { id: 'photos', label: 'Photos' },
      { id: 'apk', label: 'APK' },
      { id: 'profile', label: 'Profile & Bio' },
      { id: 'socials', label: 'Social Links' }
    ];

    let activeTab = 'ALL_POSTS';
    let adminTab = 'posts';
    let isAuthenticated = false;
    let openComments = {};
    let lbSlides = [];
    let lbIndex = 0;

    function loadState() {
      try {
        const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (!raw || typeof raw !== 'object') return JSON.parse(JSON.stringify(BAKED_INITIAL_STATE));
        return {
          avatar: (typeof raw.avatar === 'string' && raw.avatar) ? raw.avatar : BAKED_INITIAL_STATE.avatar,
          bio: typeof raw.bio === 'string' ? raw.bio : BAKED_INITIAL_STATE.bio,
          socials: {
            facebook: raw.socials?.facebook ?? BAKED_INITIAL_STATE.socials.facebook,
            whatsapp: raw.socials?.whatsapp ?? BAKED_INITIAL_STATE.socials.whatsapp,
            tiktok: raw.socials?.tiktok ?? BAKED_INITIAL_STATE.socials.tiktok,
            telegram: raw.socials?.telegram ?? BAKED_INITIAL_STATE.socials.telegram,
            wechat: raw.socials?.wechat ?? BAKED_INITIAL_STATE.socials.wechat,
            youtube: raw.socials?.youtube ?? BAKED_INITIAL_STATE.socials.youtube
          },
          posts: Array.isArray(raw.posts) ? raw.posts : BAKED_INITIAL_STATE.posts,
          photos: Array.isArray(raw.photos) ? raw.photos : BAKED_INITIAL_STATE.photos,
          videos: Array.isArray(raw.videos) ? raw.videos : BAKED_INITIAL_STATE.videos,
          apks: Array.isArray(raw.apks) ? raw.apks : BAKED_INITIAL_STATE.apks
        };
      } catch {
        return JSON.parse(JSON.stringify(BAKED_INITIAL_STATE));
      }
    }

    let state = loadState();
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} render(); }
    function esc(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function makeId(p) { return p + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7); }
    function monthYear() { const d = new Date(); const dd = String(d.getDate()).padStart(2, '0'); const mm = String(d.getMonth() + 1).padStart(2, '0'); const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']; return dd + '.' + mm + '.' + d.getFullYear() + ' - ' + days[d.getDay()]; }
    function formatWa(val) { const t = String(val || '').trim(); if (!t) return ''; if (t.startsWith('http://') || t.startsWith('https://')) return t; const d = t.replace(/[^\\d]/g, ''); return d ? 'https://wa.me/' + d : t; }
    function ytEmbed(url) { try { const u = new URL(url); if (u.hostname.includes('youtu.be')) { const id = u.pathname.replace('/', '').trim(); return id ? 'https://www.youtube.com/embed/' + id : null; } if (u.hostname.includes('youtube.com')) { if (u.pathname.startsWith('/shorts/')) { const id = u.pathname.split('/shorts/')[1]?.split('/')[0]; return id ? 'https://www.youtube.com/embed/' + id : null; } if (u.pathname.startsWith('/embed/')) return url; const id = u.searchParams.get('v'); return id ? 'https://www.youtube.com/embed/' + id : null; } } catch {} return null; }
    function readDataUrl(f) { return new Promise((res) => { if (!f) return res(''); const r = new FileReader(); r.onload = () => res(typeof r.result === 'string' ? r.result : ''); r.onerror = () => res(''); r.readAsDataURL(f); }); }
    function fmtSize(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
    function setMainTab(tab, scroll) { activeTab = tab; render(); if (scroll) { const el = document.getElementById('content-tabs'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
    function copyWeChat(id) { if (navigator.clipboard) navigator.clipboard.writeText(id).catch(() => {}); const btn = document.getElementById('wechatBtnLabel'); if (btn) { btn.textContent = 'Copied: ' + id; setTimeout(() => { btn.textContent = 'WeChat: ' + id; }, 2000); } }
    function renderSocialBar() {
      const wrap = document.getElementById('socialBarWrap');
      const items = [
        { name: 'Facebook', url: state.socials.facebook.trim(), cls: 'border-[#93C5FD] bg-[#F0F9FF] text-[#0369A1] hover:bg-[#E0F2FE]' },
        { name: 'WhatsApp', url: formatWa(state.socials.whatsapp), cls: 'border-[#86EFAC] bg-[#ECFDF5] text-[#047857] hover:bg-[#D1FAE5]' },
        { name: 'TikTok', url: state.socials.tiktok.trim(), cls: 'border-[#99D6C9] bg-[#F0FDFA] text-[#0F766E] hover:bg-[#CCFBF1]' },
        { name: 'Telegram', url: state.socials.telegram.trim(), cls: 'border-[#7DD3FC] bg-[#F0F9FF] text-[#0284C7] hover:bg-[#E0F2FE]' },
        { name: 'YouTube', url: (state.socials.youtube || '').trim(), cls: 'border-[#FCA5A5] bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2]' },
        { name: 'WeChat', url: state.socials.wechat.trim(), cls: 'border-[#6EE7B7] bg-[#ECFDF5] text-[#047857] hover:bg-[#D1FAE5]', isWeChat: true }
      ].filter((x) => x.url);
      if (!items.length) { wrap.classList.add('hidden'); return; }
      wrap.classList.remove('hidden');
      wrap.innerHTML = items.map((item) => item.isWeChat && !item.url.startsWith('http')
        ? '<button type="button" onclick="copyWeChat(\\'' + esc(item.url) + '\\')" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ' + item.cls + '"><span id="wechatBtnLabel">WeChat: ' + esc(item.url) + '</span></button>'
        : '<a href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ' + item.cls + '">' + item.name + '</a>'
      ).join('');
    }
    function renderPosts() {
      if (!state.posts.length) return '<div class="bg-white border border-[#B7DFD4] rounded-2xl p-10 text-center"><p class="text-sm text-[#335160]">No posts yet.</p></div>';
      return '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">' + state.posts.map((p, idx) => {
        const cmts = p.comments || []; const isOpen = !!openComments[p.id];
        return '<article class="bg-white border border-[#A7DFD2] rounded-xl overflow-hidden flex flex-col">' +
          (p.img ? '<button type="button" onclick="openSingleLightbox(' + idx + ')" class="block w-full overflow-hidden group cursor-pointer shrink-0"><img src="' + p.img + '" alt="' + esc(p.title) + '" class="w-full h-auto block transition-transform duration-200 group-hover:scale-[1.02]" /></button>' : '') +
          '<div class="p-3.5 flex-1 flex flex-col"><div class="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[#059669] mb-1.5"><span>' + esc(p.cat || 'Update') + '</span>' + (p.createdAt ? '<span class="text-[#8EB9AD]">&middot;</span><span class="text-[#0369A1] font-medium">' + esc(p.createdAt) + '</span>' : '') + '</div>' +
          '<h3 class="text-[15.5px] font-bold text-[#0F2937] leading-snug line-clamp-2 mb-1.5">' + esc(p.title) + '</h3>' +
          '<p class="text-[13.5px] text-[#335160] leading-relaxed whitespace-pre-line line-clamp-5 mb-2.5">' + esc(p.body) + '</p>' +
          '<div class="mt-auto pt-2.5 border-t border-[#E4F3EE]"><button type="button" onclick="toggleCmt(\\'' + esc(p.id) + '\\')" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#93C5FD] bg-[#F0F9FF] text-[#0369A1] text-xs font-semibold hover:bg-[#E0F2FE] cursor-pointer">Comments (' + cmts.length + ')</button></div>' +
          (isOpen ? '<div class="mt-2.5 pt-2.5 border-t border-[#E4F3EE] space-y-2">' + (cmts.length ? cmts.map((c) => '<div class="bg-[#F4FBF8] border border-[#CDECE2] rounded-xl px-2.5 py-1.5 text-[13px]"><div class="font-bold text-[#047857] text-xs mb-0.5">' + esc(c.author) + '</div><div class="text-[#0F2937]">' + esc(c.text) + '</div></div>').join('') : '<p class="text-xs text-[#5A7B8A]">No comments yet.</p>') + '<form onsubmit="addCmt(event, \\'' + esc(p.id) + '\\')" class="space-y-2 pt-1"><input id="ca-' + esc(p.id) + '" placeholder="Your name (optional)" class="w-full px-2.5 py-1.5 rounded-lg border border-[#BCE2D6] bg-white text-xs text-[#0F2937]" /><div class="flex gap-2"><input id="ct-' + esc(p.id) + '" placeholder="Write a comment..." class="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[#BCE2D6] bg-white text-xs text-[#0F2937]" /><button type="submit" class="px-3 py-1.5 rounded-lg bg-[#059669] text-white text-xs font-semibold hover:bg-[#047857] shrink-0 cursor-pointer">Send</button></div></form></div>' : '') +
          '</div></article>';
      }).join('') + '</div>';
    }
    function renderPhotos() {
      if (!state.photos.length) return '<div class="bg-white border border-[#B4D8EC] rounded-2xl p-10 text-center"><p class="text-sm text-[#335160]">No photos added yet.</p></div>';
      return '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-start">' + state.photos.map((g, i) => '<figure class="bg-white border border-[#A7DFD2] rounded-xl overflow-hidden group"><button type="button" onclick="openGalleryLightbox(' + i + ')" class="block w-full overflow-hidden cursor-pointer"><img src="' + g.img + '" alt="' + esc(g.cap || 'Photo') + '" class="w-full h-auto block transition-transform duration-200 group-hover:scale-[1.02]" /></button>' + (g.cap ? '<figcaption class="px-3.5 py-2.5 text-[13.5px] text-[#17465A]">' + esc(g.cap) + '</figcaption>' : '') + '</figure>').join('') + '</div>';
    }
    function renderVideos() {
      if (!state.videos.length) return '<div class="bg-white border border-[#B4D8EC] rounded-2xl p-10 text-center"><p class="text-sm text-[#335160]">No videos added yet.</p></div>';
      return '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-start">' + state.videos.map((v) => {
        const yt = ytEmbed(v.url); const direct = v.url.startsWith('data:video/') || /\\.(mp4|webm|ogg)(\\?|$)/i.test(v.url);
        const media = yt ? '<iframe src="' + esc(yt) + '" title="' + esc(v.title) + '" allowfullscreen class="w-full h-full border-0"></iframe>' : direct ? '<video src="' + v.url + '" controls preload="metadata" class="w-full h-full object-contain bg-black"></video>' : '<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0F2937] to-[#0369A1] p-6"><a href="' + esc(v.url) + '" target="_blank" rel="noopener noreferrer" class="px-4 py-2 rounded-lg bg-[#059669] text-white text-xs font-semibold">Watch Video</a></div>';
        return '<article class="bg-white border border-[#9FD0EC] rounded-xl overflow-hidden"><div class="aspect-video bg-[#0F2937]">' + media + '</div><div class="p-3.5">' + (v.createdAt ? '<div class="text-xs font-semibold text-[#0284C7] mb-1.5">' + esc(v.createdAt) + '</div>' : '') + '<h3 class="text-[15.5px] font-bold text-[#0F2937]">' + esc(v.title) + '</h3>' + (v.description ? '<p class="mt-1 text-[13.5px] text-[#335160]">' + esc(v.description) + '</p>' : '') + '</div></article>';
      }).join('') + '</div>';
    }
    function renderApk() {
      if (!state.apks.length) return '<div class="bg-white border border-[#A7DFD2] rounded-2xl p-10 text-center"><p class="text-sm text-[#335160]">No APK files shared yet.</p></div>';
      return '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-start">' + state.apks.map((a) => {
        const isData = a.downloadUrl.startsWith('data:');
        return '<article class="bg-white border border-[#A7DFD2] rounded-xl p-3.5 flex flex-col justify-between gap-3"><div><h3 class="text-[15.5px] font-bold text-[#0F2937]">' + esc(a.name) + '</h3><div class="text-xs text-[#0369A1] font-medium mt-0.5">v' + esc(a.version) + (a.sizeLabel ? ' &middot; ' + esc(a.sizeLabel) : '') + (a.createdAt ? ' &middot; ' + esc(a.createdAt) : '') + '</div>' + (a.description ? '<p class="text-[13.5px] text-[#335160] mt-1.5">' + esc(a.description) + '</p>' : '') + '</div><a href="' + esc(a.downloadUrl) + '" ' + (isData ? 'download="' + esc(a.fileName || a.name + '.apk') + '"' : 'target="_blank" rel="noopener noreferrer"') + ' class="inline-flex items-center justify-center w-full px-3.5 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold">Download APK</a></article>';
      }).join('') + '</div>';
    }
    function renderAnnouncements() {
      const list = state.posts.filter((p) => p.cat === 'Announcement');
      if (!list.length) return '<div class="bg-white border border-[#B4D8EC] rounded-2xl p-10 text-center"><p class="text-sm text-[#335160]">No announcements published yet.</p></div>';
      return '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-start">' + list.map((item) => '<article class="bg-white border border-[#9FD0EC] rounded-xl p-3.5"><div class="text-xs font-semibold text-[#0284C7] mb-1.5">Announcement' + (item.createdAt ? ' &middot; ' + esc(item.createdAt) : '') + '</div><h3 class="text-[15.5px] font-bold text-[#0F2937] mb-1.5">' + esc(item.title) + '</h3><p class="text-[13.5px] text-[#335160] leading-relaxed whitespace-pre-line">' + esc(item.body) + '</p></article>').join('') + '</div>';
    }
    function render() {
      const av = document.getElementById('navAvatar');
      av.innerHTML = state.avatar ? '<img src="' + state.avatar + '" alt="MD KIRON MONDAL" class="w-full h-full object-cover" />' : 'K';
      const heroAvatar = document.getElementById('heroAvatar');
      if (heroAvatar) { heroAvatar.src = state.avatar || 'profile.jpg'; heroAvatar.style.display = state.avatar ? 'block' : 'none'; }
      const bioEl = document.getElementById('heroBio');
      if (state.bio && state.bio.trim()) { bioEl.textContent = state.bio; bioEl.classList.remove('hidden'); } else { bioEl.classList.add('hidden'); }
      document.getElementById('kironBtn').textContent = isAuthenticated ? 'KIRON Panel' : 'KIRON';
      document.getElementById('topNavLinks').innerHTML = SERIAL_TABS.map((t) => '<button type="button" onclick="setMainTab(\\'' + t.id + '\\', true)" class="transition-colors whitespace-nowrap shrink-0 cursor-pointer underline-offset-4 ' + (activeTab === t.id ? 'text-[#059669] underline' : 'hover:text-[#0284C7] hover:underline') + '">' + t.nav + '</button>').join('');
      document.getElementById('serialTabs').innerHTML = SERIAL_TABS.map((t) => '<button type="button" onclick="setMainTab(\\'' + t.id + '\\', false)" class="px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer ' + (activeTab === t.id ? 'bg-gradient-to-r from-[#059669] to-[#0284C7] text-white' : 'text-[#17465A] hover:bg-[#EAF6F4]') + '">' + t.label + '</button>').join('');
      document.getElementById('footerYear').innerHTML = '&copy; ' + new Date().getFullYear() + ' MD KIRON MONDAL';
      document.getElementById('footerTabs').innerHTML = SERIAL_TABS.map((t) => '<button type="button" onclick="setMainTab(\\'' + t.id + '\\', false); window.scrollTo({top:0,behavior:\\'smooth\\'})" class="hover:text-[#059669] transition-colors cursor-pointer">' + t.label + '</button>').join('');
      renderSocialBar();
      const body = document.getElementById('tabContent');
      if (activeTab === 'ALL_POSTS') body.innerHTML = renderPosts();
      else if (activeTab === 'PHOTOS') body.innerHTML = renderPhotos();
      else if (activeTab === 'VIDEOS') body.innerHTML = renderVideos();
      else if (activeTab === 'APK') body.innerHTML = renderApk();
      else body.innerHTML = renderAnnouncements();
      if (isAuthenticated) renderAdminBody();
    }
    function toggleCmt(id) { openComments[id] = !openComments[id]; render(); }
    function addCmt(e, id) { e.preventDefault(); const text = document.getElementById('ct-' + id).value.trim(); if (!text) return; const author = document.getElementById('ca-' + id).value.trim() || 'Visitor'; const p = state.posts.find((x) => x.id === id); if (!p) return; p.comments = p.comments || []; p.comments.push({ id: makeId('cmt'), author, text }); openComments[id] = true; save(); }
    function openGalleryLightbox(i) { lbSlides = state.photos.map((g, idx) => ({ src: g.img, cap: g.cap || 'Photo ' + (idx + 1) })); lbIndex = i; showLightbox(); }
    function openSingleLightbox(postIdx) { const p = state.posts[postIdx]; if (!p || !p.img) return; lbSlides = [{ src: p.img, cap: p.title }]; lbIndex = 0; showLightbox(); }
    function showLightbox() { const m = document.getElementById('lightboxModal'); const cur = lbSlides[lbIndex]; if (!cur) return; document.getElementById('lbImg').src = cur.src; document.getElementById('lbCap').textContent = cur.cap; document.getElementById('lbCount').textContent = lbSlides.length > 1 ? (lbIndex + 1) + ' / ' + lbSlides.length : ''; document.getElementById('lbPrev').style.display = lbSlides.length > 1 ? 'flex' : 'none'; document.getElementById('lbNext').style.display = lbSlides.length > 1 ? 'flex' : 'none'; m.classList.remove('hidden'); m.classList.add('flex'); }
    function navLightbox(dir) { if (lbSlides.length < 2) return; lbIndex = (lbIndex + dir + lbSlides.length) % lbSlides.length; showLightbox(); }
    function closeLightbox() { const m = document.getElementById('lightboxModal'); m.classList.add('hidden'); m.classList.remove('flex'); }
    function openAdminTrigger() { if (isAuthenticated) openAdmin(); else { document.getElementById('loginErr').classList.add('hidden'); const m = document.getElementById('loginModal'); m.classList.remove('hidden'); m.classList.add('flex'); document.getElementById('adminPass').focus(); } }
    function closeLogin() { const m = document.getElementById('loginModal'); m.classList.add('hidden'); m.classList.remove('flex'); document.getElementById('adminPass').value = ''; }
    async function checkPass(e) { e.preventDefault(); const raw = document.getElementById('adminPass').value.trim(); const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)); const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''); if (hex === PASS_HASH) { isAuthenticated = true; closeLogin(); openAdmin(); render(); } else { document.getElementById('loginErr').classList.remove('hidden'); } }
    function openAdmin() { const m = document.getElementById('adminModal'); m.classList.remove('hidden'); m.classList.add('flex'); renderAdminBody(); }
    function closeAdmin() { const m = document.getElementById('adminModal'); m.classList.add('hidden'); m.classList.remove('flex'); }
    function lockSession() { isAuthenticated = false; closeAdmin(); render(); }
    function setAdminTab(t) { adminTab = t; renderAdminBody(); }
    function renderAdminBody() {
      document.getElementById('adminTabsBar').innerHTML = ADMIN_TABS.map((t) => '<button type="button" onclick="setAdminTab(\\'' + t.id + '\\')" class="px-3.5 py-2 text-xs font-semibold border-b-2 whitespace-nowrap shrink-0 cursor-pointer ' + (adminTab === t.id ? 'border-[#0284C7] text-[#0284C7]' : 'border-transparent text-[#4A6B7A]') + '">' + t.label + '</button>').join('');
      const body = document.getElementById('adminTabBody');
      if (adminTab === 'profile') {
        body.innerHTML = '<div class="space-y-6"><div class="space-y-3"><h4 class="text-sm font-bold text-[#0284C7]">Profile Photo</h4><input type="file" accept="image/*" onchange="uploadAvatar(event)" class="block text-xs" />' + (state.avatar ? '<button type="button" onclick="deleteAvatar()" class="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white text-xs font-semibold cursor-pointer">Delete Profile Photo</button>' : '') + '</div><form onsubmit="saveBio(event)" class="pt-4 border-t border-[#DCEFE9] space-y-3"><h4 class="text-sm font-bold text-[#059669]">Bio</h4><textarea id="adminBioInput" rows="3" placeholder="Write your bio here..." class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm">' + esc(state.bio) + '</textarea><div class="flex gap-2"><button type="submit" class="px-4 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold cursor-pointer">Save Bio</button>' + (state.bio ? '<button type="button" onclick="clearBio()" class="px-3.5 py-2 rounded-lg bg-[#FEE2E2] text-[#B91C1C] text-xs font-semibold cursor-pointer">Clear Bio</button>' : '') + '</div></form></div>';
      } else if (adminTab === 'posts') {
        body.innerHTML = '<form onsubmit="addPost(event)" class="space-y-3"><h4 class="text-sm font-bold text-[#059669]">Create Post or Announcement</h4><input id="pTitle" placeholder="Title" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /><select id="pCat" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm bg-white"><option value="Update">Update</option><option value="Photo">Photo</option><option value="Announcement">Announcement</option></select><textarea id="pBody" rows="3" placeholder="Description" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"></textarea><input id="pFile" type="file" accept="image/*" class="block text-xs" /><button type="submit" class="px-4 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold cursor-pointer">Publish Post</button></form><div class="pt-4 border-t border-[#DCEFE9] space-y-2">' + state.posts.map((p) => '<div class="py-2 border-b border-[#E2F2EC]"><div class="flex items-center justify-between gap-2"><strong class="text-sm">' + esc(p.title) + ' (' + esc(p.cat) + ')</strong><button type="button" onclick="delPost(\\'' + esc(p.id) + '\\')" class="px-2.5 py-1 rounded bg-[#DC2626] text-white text-xs font-semibold cursor-pointer">Delete</button></div>' + (p.comments || []).map((c) => '<div class="pl-4 mt-1 flex items-center justify-between text-xs"><span>' + esc(c.author) + ': ' + esc(c.text) + '</span><button type="button" onclick="delCmt(\\'' + esc(p.id) + '\\',\\'' + esc(c.id) + '\\')" class="px-2 py-0.5 rounded bg-[#FEE2E2] text-[#B91C1C] cursor-pointer">Delete</button></div>').join('') + '</div>').join('') + '</div>';
      } else if (adminTab === 'videos') {
        body.innerHTML = '<form onsubmit="addVideo(event)" class="space-y-3"><h4 class="text-sm font-bold text-[#0284C7]">Videos Manager</h4><input id="vTitle" placeholder="Video Title" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /><input id="vUrl" placeholder="YouTube or Video URL" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /><input id="vFile" type="file" accept="video/*" class="block text-xs" /><textarea id="vDesc" rows="2" placeholder="Description (Optional)" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"></textarea><button type="submit" class="px-4 py-2 rounded-lg bg-[#0284C7] text-white text-xs font-semibold cursor-pointer">Add Video</button></form><div class="pt-4 border-t border-[#DCEFE9] space-y-2">' + state.videos.map((v) => '<div class="py-2 flex items-center justify-between border-b border-[#E2F2EC]"><span class="text-sm font-semibold">' + esc(v.title) + '</span><button type="button" onclick="delVideo(\\'' + esc(v.id) + '\\')" class="px-2.5 py-1 rounded bg-[#DC2626] text-white text-xs font-semibold cursor-pointer">Delete</button></div>').join('') + '</div>';
      } else if (adminTab === 'photos') {
        body.innerHTML = '<form onsubmit="addPhoto(event)" class="space-y-3"><h4 class="text-sm font-bold text-[#059669]">Photos Manager</h4><input id="gCap" placeholder="Caption (Optional)" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /><input id="gFile" type="file" accept="image/*" class="block text-xs" /><button type="submit" class="px-4 py-2 rounded-lg bg-[#059669] text-white text-xs font-semibold cursor-pointer">Add Photo</button></form><div class="pt-4 border-t border-[#DCEFE9] space-y-2">' + state.photos.map((g, i) => '<div class="py-2 flex items-center justify-between border-b border-[#E2F2EC]"><span class="text-sm">' + esc(g.cap || 'Photo ' + (i + 1)) + '</span><button type="button" onclick="delPhoto(\\'' + esc(g.id) + '\\')" class="px-2.5 py-1 rounded bg-[#DC2626] text-white text-xs font-semibold cursor-pointer">Delete</button></div>').join('') + '</div>';
      } else if (adminTab === 'apk') {
        body.innerHTML = '<form onsubmit="addApk(event)" class="space-y-3"><h4 class="text-sm font-bold text-[#0284C7]">APK Manager</h4><div class="grid grid-cols-2 gap-3"><input id="aName" placeholder="App Name" class="px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /><input id="aVer" value="1.0" placeholder="Version" class="px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /></div><input id="aUrl" placeholder="APK Download URL" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /><input id="aFile" type="file" accept=".apk,application/vnd.android.package-archive" class="block text-xs" /><textarea id="aDesc" rows="2" placeholder="Description (Optional)" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm"></textarea><button type="submit" class="px-4 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold cursor-pointer">Add APK</button></form><div class="pt-4 border-t border-[#DCEFE9] space-y-2">' + state.apks.map((a) => '<div class="py-2 flex items-center justify-between border-b border-[#E2F2EC]"><span class="text-sm font-semibold">' + esc(a.name) + ' v' + esc(a.version) + '</span><button type="button" onclick="delApk(\\'' + esc(a.id) + '\\')" class="px-2.5 py-1 rounded bg-[#DC2626] text-white text-xs font-semibold cursor-pointer">Delete</button></div>').join('') + '</div>';
      } else {
        body.innerHTML = '<form onsubmit="saveSocials(event)" class="space-y-3"><h4 class="text-sm font-bold text-[#059669]">Social Links</h4><div><label class="block text-xs font-semibold mb-1">Facebook</label><input id="sFb" value="' + esc(state.socials.facebook) + '" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /></div><div><label class="block text-xs font-semibold mb-1">WhatsApp (URL or phone number)</label><input id="sWa" value="' + esc(state.socials.whatsapp) + '" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /></div><div><label class="block text-xs font-semibold mb-1">TikTok</label><input id="sTt" value="' + esc(state.socials.tiktok) + '" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /></div><div><label class="block text-xs font-semibold mb-1">Telegram</label><input id="sTg" value="' + esc(state.socials.telegram) + '" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /></div><div><label class="block text-xs font-semibold mb-1">YouTube</label><input id="sYt" value="' + esc(state.socials.youtube || '') + '" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /></div><div><label class="block text-xs font-semibold mb-1">WeChat (URL or WeChat ID)</label><input id="sWc" value="' + esc(state.socials.wechat) + '" class="w-full px-3 py-2 rounded-xl border border-[#CBE5DC] text-sm" /></div><button type="submit" class="px-4 py-2 rounded-lg bg-gradient-to-r from-[#059669] to-[#0284C7] text-white text-xs font-semibold cursor-pointer">Save Social Links</button></form>';
      }
    }
    async function uploadAvatar(e) { const f = e.target.files[0]; if (!f) return; state.avatar = await readDataUrl(f); save(); }
    function deleteAvatar() { state.avatar = ''; save(); }
    function saveBio(e) { e.preventDefault(); state.bio = document.getElementById('adminBioInput').value.trim(); save(); }
    function clearBio() { state.bio = ''; save(); }
    async function addPost(e) { e.preventDefault(); const title = document.getElementById('pTitle').value.trim(); const cat = document.getElementById('pCat').value; const body = document.getElementById('pBody').value.trim(); const file = document.getElementById('pFile').files[0]; if (!title && !body && !file) return; const img = await readDataUrl(file); state.posts.unshift({ id: makeId('post'), title: title || 'New Update', cat, body, img, createdAt: monthYear(), comments: [] }); save(); }
    function delPost(id) { state.posts = state.posts.filter((p) => p.id !== id); save(); }
    function delCmt(pid, cid) { const p = state.posts.find((x) => x.id === pid); if (p) p.comments = (p.comments || []).filter((c) => c.id !== cid); save(); }
    async function addVideo(e) { e.preventDefault(); const title = document.getElementById('vTitle').value.trim(); let url = document.getElementById('vUrl').value.trim(); const description = document.getElementById('vDesc').value.trim(); const file = document.getElementById('vFile').files[0]; if (!url && file) url = await readDataUrl(file); if (!url) return; state.videos.unshift({ id: makeId('video'), title: title || 'New Video', url, description, createdAt: monthYear() }); save(); }
    function delVideo(id) { state.videos = state.videos.filter((v) => v.id !== id); save(); }
    async function addPhoto(e) { e.preventDefault(); const file = document.getElementById('gFile').files[0]; const cap = document.getElementById('gCap').value.trim(); if (!file) return; const img = await readDataUrl(file); if (!img) return; state.photos.unshift({ id: makeId('photo'), img, cap }); save(); }
    function delPhoto(id) { state.photos = state.photos.filter((g) => g.id !== id); save(); }
    async function addApk(e) { e.preventDefault(); const name = document.getElementById('aName').value.trim(); const version = document.getElementById('aVer').value.trim() || '1.0'; const description = document.getElementById('aDesc').value.trim(); let downloadUrl = document.getElementById('aUrl').value.trim(); let fileName = '', sizeLabel = ''; const file = document.getElementById('aFile').files[0]; if (file) { downloadUrl = await readDataUrl(file); fileName = file.name; sizeLabel = fmtSize(file.size); } if (!downloadUrl) return; state.apks.unshift({ id: makeId('apk'), name: name || fileName.replace(/\\.apk$/i, '') || 'Android App', version, description, downloadUrl, fileName, sizeLabel, createdAt: monthYear() }); save(); }
    function delApk(id) { state.apks = state.apks.filter((a) => a.id !== id); save(); }
    function saveSocials(e) { e.preventDefault(); state.socials = { facebook: document.getElementById('sFb').value.trim(), whatsapp: document.getElementById('sWa').value.trim(), tiktok: document.getElementById('sTt').value.trim(), telegram: document.getElementById('sTg').value.trim(), youtube: document.getElementById('sYt').value.trim(), wechat: document.getElementById('sWc').value.trim() }; save(); }
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeLightbox(); closeLogin(); closeAdmin(); } else if (e.key === 'ArrowLeft') navLightbox(-1); else if (e.key === 'ArrowRight') navLightbox(1); });
    render();
  </script>
</body>
</html>`;
}
