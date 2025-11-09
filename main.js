// Background zoom sequence controller
// Uses assets in ./assets/nestbank to create a scroll-driven zoom experience

(function () {
  // Profiling toggle: set to true to show live performance stats
  const ENABLE_PROFILING = false;

  const files = [
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

  const root = document.getElementById("bg-sequence");
  if (!root) return;

  // --- Preload all media before initializing ---
  function preloadFile(src) {
    return new Promise((resolve) => {
      if (src.endsWith(".mp4")) {
        const v = document.createElement("video");
        v.src = src;
        v.preload = "auto";
        const done = () => { clearTimeout(timeoutId); resolve({ type: "video", el: v }); };
        // Consider any of these sufficient
        v.addEventListener("canplaythrough", done, { once: true });
        v.addEventListener("loadeddata", done, { once: true });
        v.addEventListener("loadedmetadata", done, { once: true });
        v.load();
        // Fallback timeout so we don't block the UI forever
        const timeoutId = setTimeout(done, 7000);
      } else {
        const img = new Image();
        img.src = src;
        img.decoding = "async";
        const done = async () => {
          clearTimeout(timeoutId);
          try {
            if (img.decode) await img.decode();
          } catch (_) { /* ignore decode errors, show anyway */ }
          resolve({ type: "image", el: img });
        };
        if (img.complete) return void done();
        img.addEventListener("load", () => { void done(); }, { once: true });
        img.addEventListener("error", done, { once: true });
        // Fallback timeout
        const timeoutId = setTimeout(() => { void done(); }, 5000);
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

  Promise.all(files.map(preloadFile)).then((results) => {
    // Build media layers with preloaded elements to avoid flicker
    results.forEach((res, i) => {
      const el = res.el;
      // For videos, set attributes before attaching
      if (res.type === "video") {
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        el.autoplay = true;
      }
      el.className = "bg-layer";
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
      // Nudge autoplay for videos after in-DOM to satisfy some browsers
      if (res.type === "video") {
        try { el.play().catch(() => {}); } catch (_) {}
      }
      layers.push(el);
    });

    // Warm GPU/upload/decoders across key positions before revealing
    warmUpAll();

    // One frame to settle, then reveal the UI and start
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("preloading");
      start();
    });
  });

  // Continuous timeline-based engine (no discrete switches)
  // Continuous infinite timeline (circular). floor(timeline % L) selects current index.
  // Default view: second image current, third at 60% progress.
  const INITIAL_INDEX = 1;     // 0-based -> second image
  const INITIAL_PROGRESS = 0.6; // 60%
  let timeline = 0; // current position along an infinite loop
  let targetTimeline = 0; // eased target along the loop
  const ZOOM_MAX = 1.6; // scale at the end of a segment
  const TIMELINE_PER_WHEEL = 0.0008; // sensitivity (higher = faster)
  const START_SCALE = 0.001; // scale for non-current images (as small as possible)
  const NEXT_MIN_VISIBLE = START_SCALE; // no minimum bump; start tiny
  const CONTINUE_GROWTH = 0.55; // extra growth for previous image during handoff (increased)
  const POST_SWITCH_MIN = 0.2; // stronger boost to targetZoom after a forward switch
  const SECOND_INITIAL = START_SCALE; // second image also starts tiny

  let pending = false;
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
    layers.forEach((layer) => {
      layer.style.visibility = "visible"; // never hide
      layer.style.transform = `scale(${START_SCALE})`;
      layer.style.zIndex = 1;
    });

    // Current image scale 1..ZOOM_MAX across progress 0..1
    const currScale = 1 + progress * (ZOOM_MAX - 1);
    curr.style.transform = `scale(${currScale})`;
    curr.style.zIndex = 2;

    // Next image grows from tiny to 1 across progress 0..1
    const nextScale = START_SCALE + progress * (1 - START_SCALE);
    next.style.transform = `scale(${nextScale})`;
    next.style.zIndex = 3; // on top during handoff

    // Previous image continues to grow slightly behind the new current
    const prevScale = ZOOM_MAX + progress * CONTINUE_GROWTH;
    prev.style.transform = `scale(${prevScale})`;
    // keep prev behind current
    prev.style.zIndex = 1;

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
    targetTimeline += deltaY * TIMELINE_PER_WHEEL;
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
  function start() {
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

      // Top nav intro
      const nav = document.querySelector('.nav-bar');
      // Ensure any prior exit state is cleared on load
      if (nav) nav.classList.remove('exit-out');
      if (nav) {
        nav.classList.add('intro-top-hidden');
        if (!prefersReduced) {
          // small delay so it starts first
          setTimeout(() => {
            nav.classList.remove('intro-top-hidden');
            nav.classList.add('intro-top-visible');
          }, 600);
        } else {
          nav.classList.remove('intro-top-hidden');
          nav.classList.add('intro-top-visible');
        }
      }

      const introCards = document.querySelectorAll('.paragraph');
      // Ensure any prior exit state is cleared on load
      document.documentElement.classList.remove('ui-exited');
      introCards.forEach((el) => el.classList.remove('exit-out'));
      introCards.forEach((el) => el.classList.add('intro-hidden'));
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

    // Touch
    let touchStartY = null;
    window.addEventListener("touchstart", (e) => {
      if (e.touches[0]) touchStartY = e.touches[0].clientY;
    }, { passive: true });
    window.addEventListener("touchmove", (e) => {
      if (touchStartY == null) return;
      const y = e.touches[0]?.clientY ?? touchStartY;
      const delta = touchStartY - y;
      onDelta(delta);
      touchStartY = y;
    }, { passive: false });

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

        // Intercept wheel over the card row to scroll horizontally instead of advancing background
        scroller.addEventListener('wheel', (e) => {
          const el = getScrollEl();
          // Prefer horizontal delta when available; fall back to vertical mapped to horizontal
          const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          el.scrollLeft += delta;
          // Prevent background timeline wheel handler
          e.stopPropagation();
          e.preventDefault();
        }, { passive: false });

        // Optional: improve cursor feedback while dragging
        scroller.style.cursor = 'grab';
        scroller.addEventListener('mousedown', () => { scroller.style.cursor = 'grabbing'; });
        window.addEventListener('mouseup', () => { scroller.style.cursor = 'grab'; });
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
            if (revealUI) revealUI();
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
})();
