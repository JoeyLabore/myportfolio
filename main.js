// Background zoom sequence controller
// Uses assets in ./assets/nestbank to create a scroll-driven zoom experience

(function () {
  // Profiling toggle: set to true to show live performance stats
  const ENABLE_PROFILING = false;

  // First-load markers: cookie + localStorage; REMOVE service worker and its caches
  try {
    // LocalStorage flag
    if (!localStorage.getItem('jg_first_visit')) {
      localStorage.setItem('jg_first_visit', String(Date.now()));
    }
    // Cookie (1 year)
    document.cookie = `jg_first_visit=1; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
    // Unregister any existing service workers and clear SW-managed caches
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister().catch(() => {}));
      }).catch(() => {});
    }
    if (typeof caches !== 'undefined') {
      caches.keys().then((keys) => {
        keys.forEach((k) => {
          // Remove our app caches to avoid stale shell conflicts
          if (/^jg-(?:runtime|shell)-/.test(k)) {
            caches.delete(k).catch(() => {});
          }
        });
      }).catch(() => {});
    }
  } catch (_) { /* ignore storage/sw errors */ }

  // Detect mobile/lite contexts for performance tuning
  const IS_SMALL_SCREEN = (() => {
    try { return window.matchMedia && window.matchMedia('(max-width: 600px)').matches; } catch { return false; }
  })();
  const SAVE_DATA = (() => {
    try { return !!(navigator.connection && navigator.connection.saveData); } catch { return false; }
  })();
  const LITE_MODE = IS_SMALL_SCREEN || SAVE_DATA;

  const ALL_FILES = [
    // Ordered to match assets/nestbank folder including videos
    // Sequence follows numeric filenames, with fractional steps like 4.5, 12.5, 16
    "./assets/nestbank/1.jpg",
    "./assets/nestbank/2.jpg",
    "./assets/nestbank/3.png",
    "./assets/nestbank/4.5.mp4",
    "./assets/nestbank/7.png",
    "./assets/nestbank/5.png",
    "./assets/nestbank/9.jpg",
    "./assets/nestbank/11.png",
    "./assets/nestbank/12.5.mp4",
    "./assets/nestbank/4.jpg",
    "./assets/nestbank/6.jpg",
    "./assets/nestbank/16.mp4",
    "./assets/nestbank/12.jpg",
    "./assets/nestbank/17.jpg",
    "./assets/nestbank/20.mp4",
    "./assets/nestbank/19.jpg",
    "./assets/nestbank/8.png",
  ];

  // Keep ALL assets (images and videos), per requirement. We'll optimize how we load/play them instead.
  const files = ALL_FILES;

  const root = document.getElementById("bg-sequence");
  if (!root) {
    // No background sequence on this page (e.g., home). Still run the nav intro animation.
    try {
      const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const navs = Array.from(document.querySelectorAll('.nav-bar'));
      navs.forEach((n) => n.classList.remove('exit-out'));
      navs.forEach((nav) => {
        nav.classList.add('intro-top-hidden');
      });
      
      if (!prefersReduced) {
        const BASE_DELAY = 600;
        const STEP = 180; // stagger between nav cards
        navs.forEach((nav, i) => {
          setTimeout(() => {
            nav.classList.remove('intro-top-hidden');
            nav.classList.add('intro-top-visible');
          }, BASE_DELAY + i * STEP);
        });
      } else {
        navs.forEach((nav) => {
          nav.classList.remove('intro-top-hidden');
          nav.classList.add('intro-top-visible');
        });
      }

      // Minimal home interactivity: selectable tiles that expand when focused/selected
      (function setupTiles() {
        const tiles = Array.from(document.querySelectorAll('.tile-grid .tile'));
        if (!tiles.length) return;
        // Optional: home tile 4 video (Orion) and tile 7 video (Kinti)
        let orionVideo = null;
        let kintiVideo = null;

        // Make tiles focusable and clickable
        tiles.forEach((tile) => {
          tile.setAttribute('tabindex', '0');
          tile.setAttribute('role', 'button');
          tile.setAttribute('aria-pressed', 'false');
        });

        // Intro animation: slide tiles in from the left with a small stagger
        try {
          const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!prefersReduced) {
            tiles.forEach((tile) => tile.classList.add('intro-hidden'));
            const BASE_DELAY = 200; // ms delay before first tile
            const STEP = 70; // ms between tiles
            tiles.forEach((tile, i) => {
              setTimeout(() => {
                tile.classList.remove('intro-hidden');
                tile.classList.add('intro-visible'); // keep this class to avoid reverse flash
              }, BASE_DELAY + i * STEP);
            });
          }
        } catch (_) { /* ignore animation errors */ }
        // Lazy-init the Orion video and attach to the 4th tile (index 3)
        function ensureOrionVideo() {
          if (orionVideo || tiles.length < 4) return;
          const t4 = tiles[3];
          if (!t4) return;
          const v = document.createElement('video');
          v.src = './assets/thumbnails/orion.mp4';
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          try { v.preload = 'metadata'; } catch (_) {}
          v.autoplay = false;
          v.setAttribute('aria-hidden', 'true');
          // Nudge to first frame so a poster-like frame is visible while paused
          const onMeta = () => {
            try { if (v.currentTime === 0) v.currentTime = 0.01; } catch (_) {}
          };
          v.addEventListener('loadedmetadata', onMeta, { once: true });
          // Insert as the only content for the tile
          try {
            t4.innerHTML = '';
          } catch (_) {}
          t4.appendChild(v);
          orionVideo = v;
        }

        // Lazy-init the Kinti video and attach to the 7th tile (index 6)
        function ensureKintiVideo() {
          if (kintiVideo || tiles.length < 7) return;
          const t7 = tiles[6];
          if (!t7) return;
          const v = document.createElement('video');
          v.src = './assets/thumbnails/kinti.mp4';
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          try { v.preload = 'metadata'; } catch (_) {}
          v.autoplay = false;
          v.setAttribute('aria-hidden', 'true');
          const onMeta = () => {
            try { if (v.currentTime === 0) v.currentTime = 0.01; } catch (_) {}
          };
          v.addEventListener('loadedmetadata', onMeta, { once: true });
          try { t7.innerHTML = ''; } catch (_) {}
          t7.appendChild(v);
          kintiVideo = v;
        }

        const selectTile = (tile) => {
          // Clear any hover-proxy state when a selection occurs
          tiles.forEach((t) => t.classList.remove('hover-proxy'));
          tiles.forEach((t) => {
            if (t === tile) {
              t.classList.add('selected');
              t.setAttribute('aria-pressed', 'true');
            } else {
              t.classList.remove('selected');
              t.setAttribute('aria-pressed', 'false');
            }
          });
          // Home page background color when specific tiles are selected
          try {
            const idx = tiles.indexOf(tile);
            // Clear all home bg classes, then apply based on index
            document.body.classList.remove('home-bg-nestbank');
            document.body.classList.remove('home-bg-medigo');
            document.body.classList.remove('home-bg-logofolio');
            document.body.classList.remove('home-bg-orion');
            document.body.classList.remove('home-bg-tom');
            document.body.classList.remove('home-bg-kinti');
            document.body.classList.remove('home-bg-kakakoala');
            if (idx === 0) {
              document.body.classList.add('home-bg-nestbank');
            } else if (idx === 1) {
              document.body.classList.add('home-bg-medigo');
            } else if (idx === 2) {
              document.body.classList.add('home-bg-logofolio');
            } else if (idx === 3) {
              document.body.classList.add('home-bg-orion');
            } else if (idx === 4) {
              document.body.classList.add('home-bg-tom');
            } else if (idx === 6) {
              document.body.classList.add('home-bg-kinti');
            } else if (idx === 7) {
              document.body.classList.add('home-bg-kakakoala');
            }
            // Manage Orion video playback for 4th tile
            try {
              if (!orionVideo && tiles.length >= 4) ensureOrionVideo();
              if (orionVideo) {
                const isOrionSelected = idx === 3;
                if (isOrionSelected) {
                  if (orionVideo.paused) { try { orionVideo.play().catch(() => {}); } catch (_) {} }
                } else {
                  if (!orionVideo.paused) { try { orionVideo.pause(); } catch (_) {} }
                  // Reset to initial visible frame
                  try { orionVideo.currentTime = Math.max(0.01, orionVideo.currentTime); } catch (_) {}
                }
              }
              // Manage Kinti video playback for 7th tile
              if (!kintiVideo && tiles.length >= 7) ensureKintiVideo();
              if (kintiVideo) {
                const isKintiSelected = idx === 6;
                if (isKintiSelected) {
                  if (kintiVideo.paused) { try { kintiVideo.play().catch(() => {}); } catch (_) {} }
                } else {
                  if (!kintiVideo.paused) { try { kintiVideo.pause(); } catch (_) {} }
                  // Reset to initial visible frame
                  try { kintiVideo.currentTime = Math.max(0.01, kintiVideo.currentTime); } catch (_) {}
                }
              }
            } catch (_) { /* ignore video control errors */ }
          } catch (_) { /* ignore */ }
        };
        // Click/keyboard to select; if first tile is already selected (expanded), navigate to case study
        tiles.forEach((tile, idx) => {
          tile.addEventListener('click', () => {
            // If first tile and already expanded, navigate to NestBank
            if (idx === 0 && tile.classList.contains('selected')) {
              window.location.href = './nestbank.html';
              return;
            }
            selectTile(tile);
          });

          // Mouse tilt effect only for hover-capable pointers and only when tile is selected
          try {
            const supportsHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
            if (supportsHover) {
              const MAX_TILT = 1; // degrees (ultra subtle)
              const onMove = (e) => {
                if (!tile.classList.contains('selected')) return; // only tilt expanded tile
                const r = tile.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width;  // 0..1
                const y = (e.clientY - r.top) / r.height;  // 0..1
                const dx = (x - 0.5) * 2; // -1..1
                const dy = (y - 0.5) * 2; // -1..1
                const tiltY = (dx * MAX_TILT).toFixed(2) + 'deg';      // left/right => rotateY
                const tiltX = (-dy * MAX_TILT).toFixed(2) + 'deg';     // up/down => rotateX (invert for natural feel)
                tile.style.setProperty('--tiltX', tiltX);
                tile.style.setProperty('--tiltY', tiltY);
              };
              const onLeave = () => {
                tile.style.setProperty('--tiltX', '0deg');
                tile.style.setProperty('--tiltY', '0deg');
              };
              tile.addEventListener('mousemove', onMove);
              tile.addEventListener('mouseleave', onLeave);
            }
          } catch (_) { /* ignore tilt errors */ }
          tile.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (idx === 0 && tile.classList.contains('selected')) {
                window.location.href = './nestbank.html';
                return;
              }
              selectTile(tile);
            }
          });
        });
        // Initialize video elements before first selection so paused frames are visible
        try { ensureOrionVideo(); } catch (_) {}
        try { ensureKintiVideo(); } catch (_) {}
        // Default to first tile selected on load
        selectTile(tiles[0]);

        // Hover-proxy: when cursor is in the gaps between tiles, slightly expand the nearest tile
        try {
          const grid = document.querySelector('.tile-grid');
          if (grid) {
            let lastProxy = null;
            const clearProxy = () => {
              if (lastProxy) { lastProxy.classList.remove('hover-proxy'); lastProxy = null; }
              // Ensure no stale proxies remain
              tiles.forEach((t) => t.classList.remove('hover-proxy'));
            };
            const updateProxy = (clientX, clientY) => {
              // Find the nearest tile center to the cursor
              let best = null;
              let bestD = Infinity;
              for (const t of tiles) {
                const r = t.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const dx = clientX - cx;
                const dy = clientY - cy;
                const d = dx * dx + dy * dy;
                if (d < bestD) { bestD = d; best = t; }
              }
              // Apply proxy class to best tile if not selected
              if (best && !best.classList.contains('selected')) {
                if (lastProxy !== best) {
                  tiles.forEach((t) => t.classList.remove('hover-proxy'));
                  best.classList.add('hover-proxy');
                  lastProxy = best;
                }
              } else {
                clearProxy();
              }
            };
            grid.addEventListener('mousemove', (e) => {
              // If the actual target is a tile, let native :hover handle it and clear proxy
              const t = e.target.closest && e.target.closest('.tile');
              if (t) {
                clearProxy();
                return;
              }
              updateProxy(e.clientX, e.clientY);
            });
            grid.addEventListener('mouseleave', () => {
              clearProxy();
            });
          }
        } catch (_) { /* ignore hover-proxy errors */ }
      })();

      // Home: Tabs (All, Product, Branding)
      (function setupTabs() {
        const tabList = document.querySelector('[role="tablist"]');
        if (!tabList) return;
        // Use user's existing nav-item styling for tabs
        const tabs = Array.from(tabList.querySelectorAll('.nav-item[role="tab"]'));
        if (!tabs.length) return;

        const setActive = (idx) => {
          tabs.forEach((t, i) => {
            const active = i === idx;
            t.classList.toggle('active', active);
            t.setAttribute('aria-selected', active ? 'true' : 'false');
            t.tabIndex = active ? 0 : -1;
          });
          // TODO: If/when filtering is desired, trigger it here based on tabs[idx].textContent
        };

        // Initialize: ensure only one active (default to first if none)
        let current = tabs.findIndex((t) => t.classList.contains('active'));
        if (current < 0) current = 0;
        setActive(current);

        // Click activation
        tabs.forEach((t, i) => {
          t.addEventListener('click', (e) => {
            e.preventDefault();
            current = i;
            setActive(current);
            t.focus();
          });
        });

        // Keyboard navigation: ArrowLeft/ArrowRight, Home/End
        tabList.addEventListener('keydown', (e) => {
          const key = e.key;
          if (key === 'ArrowRight' || key === 'ArrowLeft' || key === 'Home' || key === 'End') {
            e.preventDefault();
            const last = tabs.length - 1;
            if (key === 'ArrowRight') current = current === last ? 0 : current + 1;
            if (key === 'ArrowLeft') current = current === 0 ? last : current - 1;
            if (key === 'Home') current = 0;
            if (key === 'End') current = last;
            setActive(current);
            tabs[current].focus();
          }
        });
      })();

      // Make split nav cards clickable on home page too (if present)
      (function setupHomeSplitNav() {
        try {
          const split = document.querySelector('.nav-split');
          if (!split) return;
          // If this split is being used as a tablist on the home page, do not attach link behaviors
          if (split.getAttribute('role') === 'tablist') return;
          const left = split.querySelector('.nav-left');
          const right = split.querySelector('.nav-right');
          if (left) {
            left.setAttribute('tabindex', '0');
            left.setAttribute('role', 'link');
            left.addEventListener('click', () => { window.location.href = './index.html'; });
            left.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.href = './index.html'; } });
          }
          if (right) {
            right.setAttribute('tabindex', '0');
            right.setAttribute('role', 'link');
            const to = 'https://www.linkedin.com/in/josephgreenwood/';
            right.addEventListener('click', () => { try { window.open(to, '_blank', 'noopener,noreferrer'); } catch (_) { window.location.href = to; } });
            right.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); try { window.open(to, '_blank', 'noopener,noreferrer'); } catch (_) { window.location.href = to; } } });
          }
        } catch (_) {}
      })();
    } catch (_) { /* ignore animation errors on minimal page */ }
    return;
  }

  // Case study page (bg-sequence present): make split nav cards clickable
  (function setupCaseStudyNav() {
    try {
      const split = document.querySelector('.nav-split');
      if (!split) return; // only on case study page

      const left = split.querySelector('.nav-left');
      const right = split.querySelector('.nav-right');

      if (left) {
        left.setAttribute('tabindex', '0');
        left.setAttribute('role', 'link');
        left.addEventListener('click', () => {
          window.location.href = './index.html';
        });
        left.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.location.href = './index.html';
          }
        });
      }

      if (right) {
        right.setAttribute('tabindex', '0');
        right.setAttribute('role', 'link');
        const to = 'https://www.linkedin.com/in/josephgreenwood/';
        right.addEventListener('click', () => {
          try { window.open(to, '_blank', 'noopener,noreferrer'); } catch (_) { window.location.href = to; }
        });
        right.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            try { window.open(to, '_blank', 'noopener,noreferrer'); } catch (_) { window.location.href = to; }
          }
        });
      }
    } catch (_) { /* ignore */ }
  })();

  // --- Preload all media before initializing ---
  function preloadFile(src) {
    return new Promise((resolve) => {
      if (src.endsWith(".mp4")) {
        const v = document.createElement("video");
        v.src = src;
        v.preload = "auto";
        let timeoutId;
        const done = () => { if (timeoutId) clearTimeout(timeoutId); resolve({ type: "video", el: v }); };
        // Consider any of these sufficient
        v.addEventListener("canplaythrough", done, { once: true });
        v.addEventListener("loadeddata", done, { once: true });
        v.addEventListener("loadedmetadata", done, { once: true });
        v.load();
        // Fallback timeout so we don't block the UI forever
        timeoutId = setTimeout(done, 7000);
      } else {
        const img = new Image();
        img.src = src;
        img.decoding = "async";
        let timeoutId;
        const done = async () => {
          if (timeoutId) clearTimeout(timeoutId);
          try {
            if (img.decode) await img.decode();
          } catch (_) { /* ignore decode errors, show anyway */ }
          resolve({ type: "image", el: img });
        };
        if (img.complete) return void done();
        img.addEventListener("load", () => { void done(); }, { once: true });
        img.addEventListener("error", done, { once: true });
        // Fallback timeout
        timeoutId = setTimeout(() => { void done(); }, 5000);
      }
    });
  }

  // Render a few representative positions for every image to warm GPU and decoders
  function warmUpAll() {
    if (!layers || !layers.length) return;
    const L = layers.length;
    const samples = [0.0, 0.6, 0.98];
    const savedTimeline = timeline;
    const savedTarget = targetTimeline;
    for (let i = 0; i < L; i++) {
      for (const s of samples) {
        const pos = i + s;
        timeline = pos;
        targetTimeline = pos;
        render();
      }
    }
    // restore timeline; start() will set initial anyway
    timeline = savedTimeline;
    targetTimeline = savedTarget;
  }

  const preloaded = [];
  const layers = [];

  document.documentElement.classList.add("preloading");

  // Limit concurrent preloads to reduce peak memory on mobile
  async function preloadInBatches(list, concurrency) {
    const out = new Array(list.length);
    let idx = 0;
    const workers = new Array(Math.min(concurrency, list.length)).fill(0).map(async () => {
      while (idx < list.length) {
        const myIndex = idx++;
        const src = list[myIndex];
        out[myIndex] = await preloadFile(src);
      }
    });
    await Promise.all(workers);
    return out;
  }

  preloadInBatches(files, LITE_MODE ? 2 : 5).then((results) => {
    // Build media layers with preloaded elements to avoid flicker
    results.forEach((res, i) => {
      const el = res.el;
      const srcPath = files[i] || '';
      // For videos, set attributes before attaching
      if (res.type === "video") {
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        // Always use metadata preload and control play/pause from render() so it autoplays programmatically
        try { el.preload = 'metadata'; } catch (_) {}
        el.autoplay = false; // programmatic autoplay handled in render()
      }
      el.className = "bg-layer";
      // Expose original src for targeting in CSS if needed
      try { el.dataset.src = srcPath; } catch (_) {}
      // Mark media that should keep object-fit: contain on small screens
      if (/(^|\/)3\.png$/i.test(srcPath)
        || /(\/)5\.png$/i.test(srcPath)
        || /(\/)8\.png$/i.test(srcPath)
        || /(\/)11\.png$/i.test(srcPath)
        || /(^|\/)12\.5\.mp4$/i.test(srcPath)
        || /(^|\/)20\.mp4$/i.test(srcPath)) {
        el.classList.add('keep-contain');
      }
      el.style.opacity = "1";
      if (i === 0) {
        el.classList.add('bg-first');
        el.style.transform = "scale(1)";
        el.style.visibility = "visible";
      } else if (i === 1) {
        // second image starts as small as possible
        el.style.transform = `scale(${SECOND_INITIAL})`;
        el.style.visibility = "visible";
      } else {
        el.style.transform = "scale(0.001)";
        el.style.visibility = "visible"; // keep visible at all times
      }
      root.appendChild(el);
      // Do not autoplay here; render() will decide which videos to play
      layers.push(el);
    });

    // Warm GPU/upload/decoders across key positions before revealing
    // On small screens, skip warm-up to avoid memory spikes (will load on demand)
    if (!IS_SMALL_SCREEN) {
      warmUpAll();
    }

    // One frame to settle, then reveal the UI and start
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("preloading");
      start();
    });
  }).catch(() => {
    // Fallback: if preloading failed, still try to start the experience
    try {
      document.documentElement.classList.remove('preloading');
      start();
    } catch (_) {}
  });

  // Safety: if something stalls (mobile resume, network hiccup), force start after timeout
  try {
    const FORCE_START_MS = 5000;
    setTimeout(() => {
      if (document.documentElement.classList.contains('preloading')) {
        document.documentElement.classList.remove('preloading');
        try { start(); } catch (_) {}
      }
    }, FORCE_START_MS);
  } catch (_) {}

  // Continuous timeline-based engine (no discrete switches)
  // Continuous infinite timeline (circular). floor(timeline % L) selects current index.
  // Default view: second image current, third at 60% progress.
  const INITIAL_INDEX = 1;     // 0-based -> second image
  const INITIAL_PROGRESS = 0.6; // 60%
  let timeline = 0; // current position along an infinite loop
  let targetTimeline = 0; // eased target along the loop
  const ZOOM_MAX = 1.6; // scale at the end of a segment
  const TIMELINE_PER_WHEEL = 0.0008; // sensitivity for wheel/trackpad (higher = faster)
  const TOUCH_DRAG_MULTIPLIER = IS_SMALL_SCREEN ? 2.2 : 3.0; // reduce sensitivity on small screens
  const START_SCALE = 0.001; // scale for non-current images (as small as possible)
  const NEXT_MIN_VISIBLE = START_SCALE; // no minimum bump; start tiny
  const CONTINUE_GROWTH = 0.55; // extra growth for previous image during handoff (increased)
  const POST_SWITCH_MIN = 0.2; // stronger boost to targetZoom after a forward switch
  const SECOND_INITIAL = START_SCALE; // second image also starts tiny

  // In lite mode, reduce zoom span to cut GPU work slightly
  const ZOOM_MAX_EFFECTIVE = LITE_MODE ? Math.min(1.4, ZOOM_MAX) : ZOOM_MAX;

  let pending = false;
  let playVideosAfter = 0; // ms timestamp to defer video playback after fast scroll
  let wheelAccum = 0;
  const SMOOTHING = 0.12; // easing factor for timeline
  const VISIBILITY_THRESHOLD = 0.005; // reveal sooner to avoid pop-in

  // --- Adaptive foreground color (text/logo) ---
  // We sample the current top background layer to estimate brightness.
  // Then set CSS var --fg-color to white or black accordingly.
  const THEME_SAMPLE_INTERVAL = 6; // frames between samples
  const USE_ADAPTIVE_THEME = false; // set to true to adapt text color to background
  let themeSampleCountdown = 0;
  let lastSampledIdx = -1;
  const themeCanvas = document.createElement('canvas');
  themeCanvas.width = 32;
  themeCanvas.height = 32;
  const themeCtx = themeCanvas.getContext('2d', { willReadFrequently: true });

  // --- Profiling state ---
  let __perf = {
    lastLogT: 0,
    frames: 0,
    accumRenderMs: 0,
    maxRenderMs: 0,
    lumSamples: 0,
    accumLumMs: 0,
    maxLumMs: 0,
  };
  let __lastPerfText = 'profiling active…';
  let __lastPerfSummary = '';

  function applyTheme(useBlack) {
    // Prefer white when possible, but choose black if background is very light
    const rootEl = document.documentElement;
    if (useBlack) {
      rootEl.style.setProperty('--fg-color', '#000000');
      rootEl.classList.add('theme-light');
    } else {
      rootEl.style.setProperty('--fg-color', '#ffffff');
      rootEl.classList.remove('theme-light');
    }
  }

  function sampleLuminance(el) {
    if (!el || !themeCtx) return null;
    const t0 = ENABLE_PROFILING ? performance.now() : 0;
    try {
      // Draw element content into small canvas
      themeCtx.clearRect(0, 0, themeCanvas.width, themeCanvas.height);
      // Videos and images can be drawn directly
      themeCtx.drawImage(el, 0, 0, themeCanvas.width, themeCanvas.height);
      const img = themeCtx.getImageData(0, 0, themeCanvas.width, themeCanvas.height).data;
      let sum = 0;
      // Average luminance using Rec. 709 coefficients
      for (let i = 0; i < img.length; i += 4) {
        const r = img[i], g = img[i + 1], b = img[i + 2];
        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += y;
      }
      const avg = sum / (themeCanvas.width * themeCanvas.height);
      if (ENABLE_PROFILING) {
        const dt = performance.now() - t0;
        __perf.lumSamples++;
        __perf.accumLumMs += dt;
        if (dt > __perf.maxLumMs) __perf.maxLumMs = dt;
      }
      return avg; // 0..255
    } catch (_) {
      // If drawing fails for any reason, skip sampling
      return null;
    }
  }

  function updateAdaptiveTheme(idx, progress, curr, next) {
    // Only sample occasionally or when index changes
    if (themeSampleCountdown > 0 && lastSampledIdx === idx) {
      themeSampleCountdown--;
      return;
    }
    lastSampledIdx = idx;
    themeSampleCountdown = THEME_SAMPLE_INTERVAL;
    // Choose which layer to sample: during handoff, next is visually on top
    const topEl = (progress > 0.4) ? next : curr;
    const lum = sampleLuminance(topEl);
    if (lum == null) return;
    // Threshold with a slight bias toward white text (require quite bright bg to switch to black)
    const USE_BLACK_THRESHOLD = 190; // 0..255
    const useBlack = lum >= USE_BLACK_THRESHOLD;
    applyTheme(useBlack);
  }

  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }

  function render() {
    pending = false;
    const t0 = ENABLE_PROFILING ? performance.now() : 0;
    // Ease timeline toward target (no clamping for infinite loop)
    timeline += (targetTimeline - timeline) * SMOOTHING;

    const L = layers.length;
    const loopPos = ((timeline % L) + L) % L; // [0, L)
    const idx = Math.floor(loopPos);
    const progress = loopPos - idx; // [0,1)
    const nextIdx = (idx + 1) % L;
    const prevIdx = (idx - 1 + L) % L;
    const prev2Idx = (idx - 2 + L) % L; // two steps behind
    const curr = layers[idx];
    const next = layers[nextIdx];
    const prev = layers[prevIdx];

    // Reset all layers to a consistent baseline first to avoid stale transforms
    // Only keep a small window of layers visible to reduce GPU/memory pressure on mobile
    const ACTIVE_RADIUS = IS_SMALL_SCREEN ? 1 : 3;
    const activeSet = new Set();
    for (let r = -ACTIVE_RADIUS; r <= ACTIVE_RADIUS; r++) {
      activeSet.add((idx + r + layers.length) % layers.length);
    }
    layers.forEach((layer, i) => {
      const isActive = activeSet.has(i);
      // Toggle display instead of removing from DOM to minimize layout churn
      if (isActive) {
        layer.style.display = '';
        layer.style.visibility = 'visible';
      } else {
        layer.style.display = 'none';
        layer.style.visibility = 'hidden';
      }
      layer.style.transform = `scale(${START_SCALE})`;
      layer.style.zIndex = 1;
    });

    // Current image scale 1..ZOOM_MAX across progress 0..1
    const currScale = 1 + progress * (ZOOM_MAX_EFFECTIVE - 1);
    curr.style.transform = `scale(${currScale})`;
    curr.style.zIndex = 2;

    // Next image grows from tiny to 1 across progress 0..1
    const nextScale = START_SCALE + progress * (1 - START_SCALE);
    next.style.transform = `scale(${nextScale})`;
    next.style.zIndex = 3; // on top during handoff

    // Previous image continues to grow slightly behind the new current
    const prevScale = ZOOM_MAX_EFFECTIVE + progress * CONTINUE_GROWTH;
    prev.style.transform = `scale(${prevScale})`;
    // keep prev behind current
    prev.style.zIndex = 1;

    // Video play/pause management (autoplay programmatically)
    try {
      const now = performance.now ? performance.now() : Date.now();
      const shouldBePlaying = new Set([idx, nextIdx]);
      for (let i = 0; i < layers.length; i++) {
        const el = layers[i];
        if (!el || el.tagName !== 'VIDEO') continue;
        // Determine if the video is actually visible in the viewport
        let isVisible = false;
        try {
          const r = el.getBoundingClientRect();
          const vw = window.innerWidth || document.documentElement.clientWidth || 0;
          const vh = window.innerHeight || document.documentElement.clientHeight || 0;
          const horizontally = r.right > 0 && r.left < vw;
          const vertically = r.bottom > 0 && r.top < vh;
          isVisible = horizontally && vertically && r.width > 0 && r.height > 0 && el.style.display !== 'none' && el.style.visibility !== 'hidden';
        } catch (_) { /* ignore */ }

        if (now < playVideosAfter && !isVisible) {
          // During rapid scroll, pause non-visible videos immediately
          if (!el.paused) { try { el.pause(); } catch (_) {} }
          continue;
        }

        // Rule: if a video is visible at all, it must play
        if (isVisible || shouldBePlaying.has(i)) {
          if (el.paused) { try { el.play().catch(() => {}); } catch (_) {} }
        } else {
          if (!el.paused) { try { el.pause(); } catch (_) {} }
        }
      }
    } catch (_) { /* ignore video state errors */ }

    // The image two steps behind should not snap to tiny immediately.
    // Hold it large for a portion of the segment, then decay to small later.
    const TAIL_HOLD = 0.55; // portion of progress to keep prev2 large (increased)
    const prev2 = layers[prev2Idx];
    if (prev2) {
      const decayP = Math.max(0, (progress - TAIL_HOLD) / (1 - TAIL_HOLD));
      const prev2Start = ZOOM_MAX + CONTINUE_GROWTH; // start large
      const prev2Scale = prev2Start * (1 - decayP) + START_SCALE * decayP;
      prev2.style.transform = `scale(${prev2Scale})`;
      prev2.style.zIndex = 0; // far back
    }

    // Update lightweight header each frame (composed with summary in refresher)
    const header = `img ${idx + 1}/${layers.length} | t=${loopPos.toFixed(3)} -> ${(((targetTimeline % L)+L)%L).toFixed(3)} p=${progress.toFixed(3)}`;
    __lastPerfText = header + (__lastPerfSummary ? `\n${__lastPerfSummary}` : '');

    // Update adaptive theme based on the visible background
    if (USE_ADAPTIVE_THEME) {
      updateAdaptiveTheme(idx, progress, curr, next);
    }

    // keep animating if timeline not at target
    if (Math.abs(targetTimeline - timeline) > 0.0005) queueRender();

    if (ENABLE_PROFILING) {
      const dt = performance.now() - t0;
      __perf.frames++;
      __perf.accumRenderMs += dt;
      if (dt > __perf.maxRenderMs) __perf.maxRenderMs = dt;
      const now = performance.now();
      if (!__perf.lastLogT) __perf.lastLogT = now;
      const elapsed = now - __perf.lastLogT;
      if (elapsed >= 1000) {
        const fps = (__perf.frames * 1000) / elapsed;
        const avgRender = __perf.accumRenderMs / __perf.frames;
        const avgLum = __perf.lumSamples ? (__perf.accumLumMs / __perf.lumSamples) : 0;
        __lastPerfSummary = `fps=${fps.toFixed(1)} render(ms): avg=${avgRender.toFixed(2)} max=${__perf.maxRenderMs.toFixed(2)} | ` +
          `lum(ms): n=${__perf.lumSamples} avg=${avgLum.toFixed(3)} max=${__perf.maxLumMs.toFixed(3)}`;
        // Compose full text; interval refresher will paint it
        __lastPerfText = header + '\n' + __lastPerfSummary;
        if (!window.__DBG) {
          // Fallback console output if overlay not present
          // eslint-disable-next-line no-console
          console.log(`[perf] ${__lastPerfText.replace(/\n/g, ' | ')}`);
        }
        // reset window
        __perf.lastLogT = now;
        __perf.frames = 0;
        __perf.accumRenderMs = 0;
        __perf.maxRenderMs = 0;
        __perf.lumSamples = 0;
        __perf.accumLumMs = 0;
        __perf.maxLumMs = 0;
      }
    }
  }

  function queueRender() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(render);
    }
  }

  function onDelta(deltaY) {
    // Positive deltaY moves forward along the infinite loop
    // Clamp per-event delta to avoid huge jumps that spike decoders
    const MAX_EVENT_DELTA = IS_SMALL_SCREEN ? 220 : 360;
    const d = Math.max(-MAX_EVENT_DELTA, Math.min(MAX_EVENT_DELTA, deltaY));
    targetTimeline += d * TIMELINE_PER_WHEEL;
    // Defer video playback slightly during rapid scrolling
    playVideosAfter = (performance.now ? performance.now() : Date.now()) + (IS_SMALL_SCREEN ? 140 : 80);
    queueRender();
  }

  // Wheel / trackpad (normalize delta across devices)
  function normalizeWheelDelta(e) {
    let delta = e.deltaY;
    // deltaMode: 0=pixel, 1=line, 2=page
    if (e.deltaMode === 1) delta *= 16; // approx line height
    else if (e.deltaMode === 2) delta *= window.innerHeight;
    // Clamp extreme spikes from some devices
    const MAX = 120;
    if (Math.abs(delta) > MAX) delta = MAX * Math.sign(delta);
    return delta;
  }
  let __started = false;
  function start() {
    if (__started) { return; }
    __started = true;
    // Initialize timeline so default view shows 2nd image with 60% into next (3rd)
    timeline = INITIAL_INDEX + INITIAL_PROGRESS;
    targetTimeline = timeline;
    // Set a fixed foreground color when adaptive theme is disabled
    if (!USE_ADAPTIVE_THEME) {
      applyTheme(false); // use white text
    }
    // Initial render
    render();

    // Intro animations: top nav slides from top, then category cards slide up
    try {
      const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Top nav intro (support multiple nav bars, staggered like home page)
      const navs = Array.from(document.querySelectorAll('.nav-bar'));
      navs.forEach(n => n.classList.remove('exit-out'));
      navs.forEach(n => n.classList.add('intro-top-hidden'));
      if (!prefersReduced) {
        const BASE_DELAY = 600;
        const STEP = 180; // stagger between nav cards
        navs.forEach((n, i) => {
          setTimeout(() => {
            n.classList.remove('intro-top-hidden');
            n.classList.add('intro-top-visible');
          }, BASE_DELAY + i * STEP);
        });
      } else {
        navs.forEach(n => {
          n.classList.remove('intro-top-hidden');
          n.classList.add('intro-top-visible');
        });
      }

      const introCards = document.querySelectorAll('.paragraph');
      // Ensure any prior exit state is cleared on load
      document.documentElement.classList.remove('ui-exited');
      introCards.forEach((el) => el.classList.remove('exit-out'));
      introCards.forEach((el) => el.classList.add('intro-hidden'));
      // Force UI to be visible on small screens (<=600px)
      try {
        const smallScreen = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
        if (smallScreen) {
          const nav = document.querySelector('.nav-bar');
          if (nav) nav.classList.remove('exit-out');
          document.documentElement.classList.remove('ui-exited');
        }
      } catch (_) {}
      if (!prefersReduced) {
        const BASE_DELAY = 900; // ms before first card (after nav starts)
        const STEP = 260; // ms between cards (slower)
        introCards.forEach((el, i) => {
          setTimeout(() => {
            el.classList.remove('intro-hidden');
            el.classList.add('intro-visible');
          }, BASE_DELAY + i * STEP);
        });
      } else {
        introCards.forEach((el) => {
          el.classList.remove('intro-hidden');
          el.classList.add('intro-visible');
        });
      }
    } catch (_) {
      /* no-op if animation fails */
    }

    // Input bindings
    window.addEventListener("wheel", (e) => {
      e.preventDefault();
      const d = normalizeWheelDelta(e);
      onDelta(d);
    }, { passive: false });

    // Keyboard
    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        onDelta(60); // gentler step
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        onDelta(-60);
      }
    });

    // Touch (refined for mobile: ignore nav, allow horizontal card scroll)
    let touchStartY = null;
    let touchStartX = null;
    let touchStartTarget = null;
    let ignoreTouchForTimeline = false;
    // Momentum state
    let velY = 0; // low-pass filtered velocity (in px per event)
    let lastTouchTs = 0;
    let accumDX = 0;
    let accumDY = 0;
    let inertiaRAF = null;
    const stopInertia = () => { if (inertiaRAF) { cancelAnimationFrame(inertiaRAF); inertiaRAF = null; } };

    window.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      if (!t) return;
      touchStartY = t.clientY;
      touchStartX = t.clientX;
      touchStartTarget = e.target;
      lastTouchTs = performance.now ? performance.now() : Date.now();
      velY = 0;
      accumDX = 0;
      accumDY = 0;
      // Stop any ongoing inertia when a new gesture starts
      stopInertia();
      // If starting on nav, never advance the background timeline
      if (touchStartTarget && touchStartTarget.closest && touchStartTarget.closest('.nav-bar')) {
        ignoreTouchForTimeline = true;
      } else {
        ignoreTouchForTimeline = false;
      }
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (!t || touchStartY == null || touchStartX == null) return;

      // If gesture started on nav, ignore entirely
      if (ignoreTouchForTimeline) return;

      const y = t.clientY;
      const x = t.clientX;
      const dy = touchStartY - y;
      const dx = touchStartX - x;
      accumDX += dx;
      accumDY += dy;
      // Update low-pass velocity estimate
      velY = 0.85 * velY + 0.15 * dy;

      // If gesture originates within the horizontal card scroller, allow native pan-x
      const inScroller = !!(touchStartTarget && touchStartTarget.closest && touchStartTarget.closest('.paragraph-containers'));
      if (inScroller) {
        // If the movement is predominantly horizontal, do not drive the background
        if (Math.abs(dx) >= Math.abs(dy)) {
          // Let the scroller handle it; also stop the background handler from fighting
          return; // do not preventDefault to keep native momentum scrolling
        }
        // If predominantly vertical inside scroller, treat as background gesture
        // fall through to onDelta
      }

      onDelta(dy * TOUCH_DRAG_MULTIPLIER);
      // Prevent the browser from also attempting to scroll the page when we consume the gesture
      e.preventDefault();
      touchStartY = y;
      touchStartX = x;
    }, { passive: false });

    // Momentum/inertia on touch end
    window.addEventListener("touchend", () => {
      if (touchStartY == null || touchStartX == null) return;
      // If gesture was ignored (started on nav), skip inertia
      if (ignoreTouchForTimeline) { touchStartY = touchStartX = null; return; }

      const inScroller = !!(touchStartTarget && touchStartTarget.closest && touchStartTarget.closest('.paragraph-containers'));
      // Determine dominant axis of the gesture overall
      const horizDominant = Math.abs(accumDX) >= Math.abs(accumDY);
      if (inScroller && horizDominant) {
        // Horizontal swipe over scroller: no background inertia
        touchStartY = touchStartX = null; return;
      }

      // Start inertia with the last filtered velocity
      let v = velY * TOUCH_DRAG_MULTIPLIER; // px per frame-ish
      const friction = 0.92; // decay per frame
      const minV = 0.05; // stop threshold
      stopInertia();
      const step = () => {
        // Apply to timeline
        onDelta(v);
        v *= friction;
        if (Math.abs(v) > minV) {
          inertiaRAF = requestAnimationFrame(step);
        } else {
          stopInertia();
        }
      };
      if (Math.abs(v) > minV) inertiaRAF = requestAnimationFrame(step);

      // Reset start markers
      touchStartY = touchStartX = null;
    }, { passive: true });

    // --- Horizontal drag/scroll for card row (desktop) ---
    // Enable click-drag to scroll the card strip on desktop and override wheel while hovering it.
    try {
      const scroller = document.querySelector('.paragraph-containers');
      if (scroller) {
        const getScrollEl = () => {
          // On mobile/tablet (<=1050px), the container itself scrolls; on desktop, the page scrolls horizontally
          const isMobile = window.matchMedia && window.matchMedia('(max-width: 1050px)').matches;
          return isMobile ? scroller : (document.scrollingElement || document.documentElement);
        };

        // Drag-to-scroll with mouse
        let isDragging = false;
        let startX = 0;
        let startScrollLeft = 0;

        const onMouseDown = (e) => {
          // Only react to primary button
          if (e.button !== 0) return;
          isDragging = true;
          scroller.classList.add('dragging');
          startX = e.clientX;
          startScrollLeft = getScrollEl().scrollLeft;
          e.preventDefault();
        };
        const onMouseMove = (e) => {
          if (!isDragging) return;
          const dx = startX - e.clientX;
          const el = getScrollEl();
          el.scrollLeft = startScrollLeft + dx;
          e.preventDefault();
        };
        const endDrag = () => {
          if (!isDragging) return;
          isDragging = false;
          scroller.classList.remove('dragging');
        };
        scroller.addEventListener('mousedown', onMouseDown, { passive: false });
        window.addEventListener('mousemove', onMouseMove, { passive: false });
        window.addEventListener('mouseup', endDrag, { passive: true });
        scroller.addEventListener('mouseleave', endDrag, { passive: true });

        // Intercept wheel over the card row ONLY on mobile (<=1050px)
        scroller.addEventListener('wheel', (e) => {
          const isMobile = window.matchMedia && window.matchMedia('(max-width: 1050px)').matches;
          if (!isMobile) {
            // Desktop: allow background timeline to scroll even when hovering cards
            return; // do not stop propagation or prevent default
          }
          const el = getScrollEl();
          // Prefer horizontal delta when available; fall back to vertical mapped to horizontal
          const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          el.scrollLeft += delta;
          // Prevent background timeline wheel handler on mobile
          e.stopPropagation();
          e.preventDefault();
        }, { passive: false });

        // Remove cursor styling so no grab/grabbing cursor appears
      }
    } catch (_) {
      /* no-op if drag-to-scroll setup fails */
    }

    // Debug overlay (only when profiling enabled)
    if (ENABLE_PROFILING) {
      const dbg = document.createElement('div');
      dbg.style.position = 'fixed';
      dbg.style.left = '8px';
      dbg.style.bottom = '8px';
      dbg.style.padding = '4px 8px';
      dbg.style.background = 'rgba(0,0,0,0.6)';
      dbg.style.color = '#fff';
      dbg.style.font = '12px/1.6 Menlo, monospace';
      dbg.style.pointerEvents = 'none';
      dbg.style.whiteSpace = 'pre';
      dbg.style.borderRadius = '6px';
      dbg.style.zIndex = '2147483647'; // ensure on top
      dbg.style.visibility = 'visible';
      dbg.style.opacity = '1';
      // Promote to its own composited layer so it doesn't get occluded during heavy paints
      dbg.style.willChange = 'transform, opacity';
      dbg.style.transform = 'translateZ(0)';
      dbg.style.backfaceVisibility = 'hidden';
      dbg.style.webkitBackfaceVisibility = 'hidden';
      dbg.style.mixBlendMode = 'normal';
      document.body.appendChild(dbg);
      window.__DBG = dbg;
      // Keep the stats visible even when not animating by refreshing from cache
      dbg.textContent = __lastPerfText;
      setInterval(() => {
        if (window.__DBG) {
          // Force visibility and repaint of the overlay text
          window.__DBG.style.visibility = 'visible';
          window.__DBG.style.opacity = '1';
          window.__DBG.textContent = __lastPerfText;
        }
      }, 100);
    } else {
      // If an overlay exists from a hot-reload, remove it
      if (window.__DBG && window.__DBG.parentNode) {
        window.__DBG.parentNode.removeChild(window.__DBG);
      }
      window.__DBG = null;
    }

    // --- Expandable detail cards (sibling, allow multiple) ---
    const openDetails = new WeakMap(); // card => detail element OR array of elements
    const openCards = new Set(); // iterable set of open cards

    // Remove any stray detail nodes that might exist from hot reloads
    document.querySelectorAll('.paragraph-detail').forEach((n) => n.remove());

    function closeDetailFor(card, immediate = false) {
      const val = openDetails.get(card);
      if (!val) return;
      const els = Array.isArray(val) ? val : [val];
      els.forEach((el) => {
        if (!el) return;
        if (immediate) {
          // Keep node to avoid layout jump; collapse instead of remove
          el.classList.remove('open');
          el.style.height = '0px';
          el.style.marginTop = '0px';
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        } else {
          const currentH = el.scrollHeight;
          el.style.height = currentH + 'px';
          void el.offsetHeight; // reflow
          el.classList.remove('open');
          el.style.height = '0px';
          const cleanup = () => {
            el.removeEventListener('transitionend', cleanup);
            // Keep collapsed element in DOM to avoid late reflow
            el.style.marginTop = '0px';
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
          };
          el.addEventListener('transitionend', cleanup);
        }
      });
      card.setAttribute('aria-expanded', 'false');
      openDetails.delete(card);
      openCards.delete(card);
    }

    function openFor(card) {
      // Toggle if this card is already open
      if (openDetails.has(card)) { closeDetailFor(card); return; }

      const label = card.querySelector('.text-label')?.textContent ?? '';
      const bodyHTML = card.querySelector('.text-body')?.innerHTML ?? '';

      const isImpact = (label || '').trim().toLowerCase() === 'impact';
      const isProblemSolution = (label || '').trim().toLowerCase() === 'problem & solution';
      const isDeliverables = (label || '').trim().toLowerCase() === 'deliverables';

      // Insert directly after the clicked card within the same column
      // This keeps it in the same vertical column and matches width
      const col = card.closest('.paragraph-col') || card.parentElement;

      // Helper to create a detail node with content
      const makeDetail = (html, aria) => {
        const d = document.createElement('div');
        d.className = 'paragraph-detail';
        d.setAttribute('role', 'region');
        d.setAttribute('aria-label', aria || (label ? `${label} details` : 'Details'));
        const inner = document.createElement('div');
        inner.className = 'paragraph-detail__inner';
        inner.innerHTML = html || '<div style="opacity:.8">No details available.</div>';
        d.appendChild(inner);
        return d;
      };

      // For Impact, create three separate detail panels; for Problem & Solution, create two; for Deliverables, create three; otherwise single
      let detailsToOpen = [];
      if (isImpact) {
        const titles = [
          '1,164,000+ loans disbursed digitally',
          '111,000+ active users',
          '97% of invited members registered',
          '4.9★ average app store rating',
          '65% of loans created and approved directly within the app',
        ];
        // If we already created them once, reuse
        const existing = openDetails.get(card);
        if (existing && Array.isArray(existing) && existing.length === 5) {
          detailsToOpen = existing;
          // Clear inline closed styles before reopening and enforce title-only
          detailsToOpen.forEach((d, i) => {
            d.classList.remove('open');
            d.style.marginTop = '';
            d.style.opacity = '';
            d.style.pointerEvents = '';
            const inner = d.querySelector('.paragraph-detail__inner') || d;
            inner.innerHTML = `<p class="text-label">${titles[i] || ''}</p>`;
          });
        } else {
          detailsToOpen = titles.map(title => makeDetail(
            `<p class="text-label">${title}</p>`,
            title
          ));
        }
        // Insert sequentially after the card
        let afterNode = card;
        detailsToOpen.forEach((d) => {
          if (afterNode.nextSibling) col.insertBefore(d, afterNode.nextSibling);
          else col.appendChild(d);
          afterNode = d;
        });
      } else if (isDeliverables) {
        // Three deliverable panels with title and supporting description
        const items = [
          {
            title: "NestBank's Visual Identity Definition",
            body: 'Defined the brand’s core visual language, including colour palette, typography, iconography, and imagery style.',
          },
          {
            title: 'Design System Creation',
            body: 'Built a scalable component library to ensure consistency and efficiency across design and development.',
          },
          {
            title: 'Mobile App Interface Design',
            body: 'Designed end-to-end user flows covering onboarding, loan management, payments, and financial tracking.',
          },
          {
            title: 'User & Process Research',
            body: 'Analysed user groups, current loan journeys, and brand perception to identify opportunities for a digital-first experience.',
          },
        ];
        // If we already created them once, reuse
        const existing = openDetails.get(card);
        if (existing && Array.isArray(existing) && existing.length === items.length) {
          detailsToOpen = existing;
          detailsToOpen.forEach((d, i) => {
            d.classList.remove('open');
            d.style.marginTop = '';
            d.style.opacity = '';
            d.style.pointerEvents = '';
            const inner = d.querySelector('.paragraph-detail__inner') || d;
            // Ensure regular weight for deliverables
            inner.classList.remove('emphasize');
            const itm = items[i] || { title: '', body: '' };
            inner.innerHTML = `<p class="text-label">${itm.title}</p>`;
          });
        } else {
          detailsToOpen = items.map(({ title, body }) => {
            const d = makeDetail(
              `<p class=\"text-label\">${title}</p>`,
              `${title} details`
            );
            // Ensure regular weight for deliverables
            d.querySelector('.paragraph-detail__inner')?.classList.remove('emphasize');
            return d;
          });
        }
        // Insert sequentially after the card
        let afterNode = card;
        detailsToOpen.forEach((d) => {
          if (afterNode.nextSibling) col.insertBefore(d, afterNode.nextSibling);
          else col.appendChild(d);
          afterNode = d;
        });
      } else if (isProblemSolution) {
        // Build two separate details: Problem and Solution
        const body = card.querySelector('.text-body');
        // Attempt to extract Problem/Solution paragraphs from the card body
        let problemHTML = '';
        let solutionHTML = '';
        if (body) {
          const labels = Array.from(body.querySelectorAll('.text-label'));
          // Find the first non-label paragraph after each label as its content
          const getContentAfter = (labelEl) => {
            let n = labelEl ? labelEl.nextElementSibling : null;
            while (n && (n.classList && n.classList.contains('text-label') || n.tagName === 'BR')) {
              n = n.nextElementSibling;
            }
            return n && n.tagName === 'P' ? n.outerHTML : '';
          };
          const problemLabel = labels.find(l => (l.textContent || '').trim().toLowerCase() === 'problem');
          const solutionLabel = labels.find(l => (l.textContent || '').trim().toLowerCase() === 'solution');
          const problemP = getContentAfter(problemLabel);
          const solutionP = getContentAfter(solutionLabel);
          problemHTML = `<p class="text-label">Problem</p>${problemP || ''}`;
          solutionHTML = `<p class="text-label">Solution</p>${solutionP || ''}`;
        }
        // If we already created them once, reuse
        const existing = openDetails.get(card);
        if (existing && Array.isArray(existing) && existing.length === 2) {
          detailsToOpen = existing;
          detailsToOpen.forEach((d, i) => {
            d.classList.remove('open');
            d.style.marginTop = '';
            d.style.opacity = '';
            d.style.pointerEvents = '';
            const inner = d.querySelector('.paragraph-detail__inner') || d;
            inner.classList.add('emphasize');
            inner.innerHTML = i === 0 ? problemHTML : solutionHTML;
          });
        } else {
          const dProblem = makeDetail(problemHTML, 'Problem details');
          const dSolution = makeDetail(solutionHTML, 'Solution details');
          // Emphasize labels inside injected container
          dProblem.querySelector('.paragraph-detail__inner')?.classList.add('emphasize');
          dSolution.querySelector('.paragraph-detail__inner')?.classList.add('emphasize');
          detailsToOpen = [dProblem, dSolution];
        }
        // Insert sequentially after the card
        let afterNode = card;
        detailsToOpen.forEach((d) => {
          if (afterNode.nextSibling) col.insertBefore(d, afterNode.nextSibling);
          else col.appendChild(d);
          afterNode = d;
        });
      } else {
        // Single detail using the card's bodyHTML
        let detail = openDetails.get(card);
        if (!detail || Array.isArray(detail)) detail = null;
        if (!detail) {
          detail = makeDetail(bodyHTML, label ? `${label} details` : 'Details');
          // Add emphasis class for Problem & Solution detail content
          const inner = detail.querySelector('.paragraph-detail__inner') || detail;
          if ((label || '').trim().toLowerCase() === 'problem & solution') {
            inner.classList.add('emphasize');
          }
        } else {
          const inner = detail.querySelector('.paragraph-detail__inner') || detail;
          inner.innerHTML = bodyHTML || '<div style="opacity:.8">No details available.</div>';
          // Ensure emphasis class is applied when reusing
          if ((label || '').trim().toLowerCase() === 'problem & solution') {
            inner.classList.add('emphasize');
          } else {
            inner.classList.remove('emphasize');
          }
        }
        detail.classList.remove('open');
        detail.style.marginTop = '';
        detail.style.opacity = '';
        detail.style.pointerEvents = '';

        if (card.nextSibling) col.insertBefore(detail, card.nextSibling);
        else col.appendChild(detail);
        detailsToOpen = [detail];
      }

      // Mark the owning column (optional visual hook)
      if (col) col.classList.add('has-open-detail');

      // Animate open for each detail
      detailsToOpen.forEach((detail) => {
        detail.style.pointerEvents = 'auto';
        detail.style.height = '0px';
        requestAnimationFrame(() => {
          const targetH = detail.scrollHeight;
          detail.classList.add('open');
          detail.style.height = targetH + 'px';
          const after = () => {
            detail.removeEventListener('transitionend', after);
            detail.style.height = 'auto';
          };
          detail.addEventListener('transitionend', after);
        });
      });

      // Mark state
      card.setAttribute('aria-expanded', 'true');
      openDetails.set(card, (isImpact || isProblemSolution || isDeliverables) ? detailsToOpen : detailsToOpen[0]);
      openCards.add(card);
    }

    const cards = document.querySelectorAll('.paragraph');
    cards.forEach((card, idx) => {
      // Make focusable and identify as a button for a11y
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-expanded', 'false');
      card.setAttribute('aria-controls', `detail-for-${idx}`);

      card.addEventListener('click', (e) => {
        e.stopPropagation();
        openFor(card);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openFor(card);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeDetailFor(card);
        }
      });
    });

    // Reveal UI when mouse enters the top or bottom 15% of the window
    // Expose reveal function within start() scope so other handlers can call it
    let revealUI = null;
    try {
      const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      revealUI = () => {
        if (!document.documentElement.classList.contains('ui-exited')) return;
        document.documentElement.classList.remove('ui-exited');
        const nav = document.querySelector('.nav-bar');
        const cardsArr = Array.from(document.querySelectorAll('.paragraph'));
        // Clear exit state first
        if (nav) nav.classList.remove('exit-out');
        cardsArr.forEach((el) => el.classList.remove('exit-out'));
        // Force reflow so the removal is committed
        void document.body.offsetWidth;
        if (!prefersReduced) {
          // Slide nav in
          if (nav) nav.classList.add('intro-top-visible');
          // Slide cards in with a light stagger
          const BASE_DELAY = 120;
          const STEP = 120;
          cardsArr.forEach((el, i) => {
            // Ensure starting state is not hidden
            el.classList.remove('intro-hidden');
            setTimeout(() => {
              el.classList.add('intro-visible');
            }, BASE_DELAY + i * STEP);
          });
        } else {
          if (nav) nav.classList.add('intro-top-visible');
          cardsArr.forEach((el) => el.classList.add('intro-visible'));
        }
      };

      let lastZone = 'middle';
      window.addEventListener('mousemove', (e) => {
        const h = window.innerHeight || 1;
        const ratio = e.clientY / h;
        const zone = (ratio <= 0.15) ? 'top' : (ratio >= 0.85) ? 'bottom' : 'middle';
        if (zone !== lastZone) {
          lastZone = zone;
          if ((zone === 'top' || zone === 'bottom')) {
            // Avoid triggering reveal/hide logic checks when locked on small screens
            const lockedSmall = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
            if (!lockedSmall && revealUI) revealUI();
          }
        }
      }, { passive: true });
    } catch (_) {
      /* ignore reveal wiring errors */
    }

    // Close all open details when clicking the background (outside of any card/detail)
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented) return;
      const insideCard = e.target.closest('.paragraph');
      const insideDetail = e.target.closest('.paragraph-detail');
      const insideNav = e.target.closest('.nav-bar');
      if (insideCard || insideDetail) return;
      // Hard lock: below or equal to 600px, never exit UI, but still allow background tap to close any open categories
      const lockSmall = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
      if (lockSmall) {
        // Close any open categories first
        if (openCards && openCards.size > 0) {
          Array.from(openCards).forEach((c) => closeDetailFor(c));
        }
        // Ensure any accidental exit classes are cleared immediately
        document.documentElement.classList.remove('ui-exited');
        const nav = document.querySelector('.nav-bar');
        if (nav) nav.classList.remove('exit-out');
        document.querySelectorAll('.paragraph').forEach((el) => el.classList.remove('exit-out'));
        return;
      }
      // If UI is exited, clicking background should bring it back
      if (document.documentElement.classList.contains('ui-exited') && !insideNav) {
        e.preventDefault();
        try { if (revealUI) revealUI(); } catch (_) {}
        return;
      }
      // Capture whether any categories were open BEFORE closing them.
      const hadAnyOpen = openCards.size > 0;
      Array.from(openCards).forEach((c) => closeDetailFor(c));
      // If all categories are closed and user tapped empty space, animate UI out
      // Use next frame to avoid any race with openCards mutations during close
      requestAnimationFrame(() => {
        // If there were any open categories, we only collapse them and STOP here.
        if (hadAnyOpen) return;
        // Do not allow nav/menu to disappear on small screens (<=600px)
        const canExitUI = !(window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
        if (!canExitUI) return;
        if (openCards.size === 0 && !insideNav) {
          document.documentElement.classList.add('ui-exited');
          const nav = document.querySelector('.nav-bar');
          const cardsArr = Array.from(document.querySelectorAll('.paragraph'));
          // Step 1: clear intro classes
          if (nav) nav.classList.remove('intro-top-hidden', 'intro-top-visible');
          cardsArr.forEach((el) => el.classList.remove('intro-hidden', 'intro-visible'));
          // Step 2: force reflow so browser commits the current transform state
          void document.body.offsetWidth;
          // Step 3: next frame, add exit classes to trigger transition
          requestAnimationFrame(() => {
            if (nav) nav.classList.add('exit-out');
            cardsArr.forEach((el) => el.classList.add('exit-out'));
          });
        }
      });
    });

    // Note: outside-click closing is disabled to allow multiple open at once.
  }

  // Global safety: when resizing to <=600px, immediately clear exit state/classes
  window.addEventListener('resize', () => {
    try {
      const small = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
      if (small) {
        document.documentElement.classList.remove('ui-exited');
        const nav = document.querySelector('.nav-bar');
        if (nav) nav.classList.remove('exit-out');
        document.querySelectorAll('.paragraph').forEach((el) => el.classList.remove('exit-out'));
      }
    } catch (_) {}
  }, { passive: true });
})();
