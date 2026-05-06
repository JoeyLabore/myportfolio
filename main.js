// Background zoom sequence controller
// Uses assets in ./assets/nestbank to create a scroll-driven zoom experience

(function () {
  // Profiling toggle: set to true to show live performance stats
  const ENABLE_PROFILING = false;

  // Force top-left scroll position on refresh/navigation
  try {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    const restoreHomePageVisualState = () => {
      try {
        const homePage = document.querySelector('.page[data-name="home page"]');
        if (!homePage) return;

        const introOverlay = document.querySelector('.intro-overlay');
        const navTransition = document.querySelector('.nav-transition');

        try { document.documentElement.classList.remove('preloading'); } catch (_) {}

        if (introOverlay) {
          try {
            introOverlay.classList.remove('enter', 'fade-out');
            introOverlay.style.display = '';
            introOverlay.style.transform = '';
            introOverlay.style.opacity = '';
            introOverlay.style.pointerEvents = '';
          } catch (_) {}
        }

        if (navTransition) {
          try {
            navTransition.classList.remove('open');
            navTransition.style.opacity = '0';
            navTransition.style.pointerEvents = 'none';
          } catch (_) {}
        }

        try {
          homePage.style.visibility = 'visible';
          homePage.style.opacity = '1';
        } catch (_) {}
      } catch (_) {}
    };

    // Handle browser back/forward restores for the home page.
    window.addEventListener('popstate', restoreHomePageVisualState);
    window.addEventListener('pageshow', restoreHomePageVisualState);
    window.addEventListener('load', restoreHomePageVisualState, { once: true });
  } catch (_) { /* ignore */ }
  try {
    const resetScroll = () => {
      try { window.scrollTo(0, 0); } catch (_) {}
    };
    // On full load and when restored from bfcache
    window.addEventListener('load', resetScroll, { once: true });
    window.addEventListener('pageshow', (e) => { if (e && e.persisted) resetScroll(); });
  } catch (_) { /* ignore */ }

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

  // Site-wide: one-time load text scramble reveal (subtle, left-to-right)
  (function setupSiteLoadTextReveal() {
    try {
      if (window.__siteTextRevealInitialized) return;
      window.__siteTextRevealInitialized = true;

      const prefersReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (prefersReduced) return;

      const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=@▓▒░';
      const randomDuration = () => 800 + Math.floor(Math.random() * 601); // 800-1400ms

      const isVisible = (el) => {
        if (!el) return false;
        try {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          return el.getClientRects && el.getClientRects().length > 0;
        } catch (_) {
          return false;
        }
      };

      const collectTextNodes = (root) => {
        if (!root || !isVisible(root)) return [];
        const out = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            try {
              if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
              if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              if (parent.closest('script, style, noscript, svg, i, .material-symbols-outlined')) return NodeFilter.FILTER_REJECT;
              if (parent.getAttribute('aria-hidden') === 'true') return NodeFilter.FILTER_REJECT;
              if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            } catch (_) {
              return NodeFilter.FILTER_REJECT;
            }
          }
        });
        let node = walker.nextNode();
        while (node) {
          out.push(node);
          node = walker.nextNode();
        }
        return out;
      };

      const targetGroups = [
        {
          selectors: [
            '.home-game-hint__play',
            '.tile-grid .tile',
          ],
          baseDelay: 0,
          step: 35,
        },
        {
          selectors: [
            '.nav-split .nav-item',
            '.home-game-over__cta',
            '.mobile-menu-panel .nav-item',
            '.deep-dive-toc__link',
          ],
          baseDelay: 760,
          step: 45,
        },
      ];

      const interactiveRoots = new Set();
      const queue = [];

      const rebuildTargets = () => {
        const seenNodes = new Set();
        interactiveRoots.clear();
        queue.length = 0;

        targetGroups.forEach((group) => {
          const roots = [];
          (group.selectors || []).forEach((selector) => {
            try {
              document.querySelectorAll(selector).forEach((el) => roots.push(el));
            } catch (_) { /* ignore invalid selectors */ }
          });

          let localIndex = 0;
          roots.forEach((root) => {
            interactiveRoots.add(root);
            collectTextNodes(root).forEach((textNode) => {
              if (seenNodes.has(textNode)) return;
              seenNodes.add(textNode);
              queue.push({
                textNode,
                delay: group.baseDelay + (localIndex * group.step),
                duration: randomDuration(),
              });
              localIndex += 1;
            });
          });
        });
      };

      const getFinalTextForNode = (textNode) => {
        const parentEl = textNode ? textNode.parentElement : null;
        const rawText = String((textNode && textNode.nodeValue) || '');
        const hasInlineIcon = !!(parentEl && parentEl.querySelector && parentEl.querySelector('svg, .icon-arrow, .icon-menu'));
        return hasInlineIcon ? rawText.replace(/\s+/g, ' ').trim() : rawText;
      };

      const getTabClipRoot = (textNode) => {
        const parentEl = textNode ? textNode.parentElement : null;
        return parentEl ? parentEl.closest('.tabs .nav-item') : null;
      };

      const animateSpan = (span, finalText, delay, duration) => {
        if (!span || !String(finalText || '').trim()) return;

        try {
          if (span.__scrambleRaf) cancelAnimationFrame(span.__scrambleRaf);
        } catch (_) { /* ignore */ }

        try {
          const measuredWidth = Math.ceil(span.getBoundingClientRect().width);
          if (measuredWidth > 0) span.style.width = `${measuredWidth}px`;
        } catch (_) { /* ignore width lock failures */ }

        const startAt = performance.now() + Math.max(0, Number(delay) || 0);
        const len = finalText.length;

        const step = (now) => {
          if (now < startAt) {
            span.__scrambleRaf = requestAnimationFrame(step);
            return;
          }

          const progress = Math.min(1, (now - startAt) / Math.max(1, duration));
          const revealed = Math.floor(progress * len);

          if (progress >= 1) {
            span.textContent = finalText;
            span.style.width = '';
            span.__scrambleRaf = 0;
            return;
          }

          let next = finalText.slice(0, revealed);
          for (let i = revealed; i < len; i += 1) {
            const ch = finalText[i];
            if (/\s/.test(ch)) next += ch;
            else next += CHARSET[Math.floor(Math.random() * CHARSET.length)];
          }
          span.textContent = next;
          span.__scrambleRaf = requestAnimationFrame(step);
        };

        span.__scrambleRaf = requestAnimationFrame(step);
      };

      const replayRoot = (root) => {
        if (!root) return;
        const spans = Array.from(root.querySelectorAll('.text-reveal-scramble'));
        if (!spans.length) return;
        spans.forEach((span, idx) => {
          const finalText = String((span.dataset && span.dataset.finalText) || span.textContent || '');
          animateSpan(span, finalText, idx * 35, randomDuration());
        });
      };

      const stopRootScramble = (root) => {
        if (!root) return;
        const spans = Array.from(root.querySelectorAll('.text-reveal-scramble'));
        if (!spans.length) return;
        spans.forEach((span) => {
          try {
            if (span.__scrambleRaf) cancelAnimationFrame(span.__scrambleRaf);
          } catch (_) { /* ignore */ }
          span.__scrambleRaf = 0;
          const finalText = String((span.dataset && span.dataset.finalText) || span.textContent || '');
          span.textContent = finalText;
          span.style.width = '';
        });
      };

      const run = () => {
        rebuildTargets();
        if (!queue.length) return false;

        queue.forEach(({ textNode, delay, duration }) => {
          const finalText = getFinalTextForNode(textNode);
          if (!finalText.trim()) return;
          const tabClipRoot = getTabClipRoot(textNode);
          if (tabClipRoot) tabClipRoot.style.overflow = 'hidden';

          const span = document.createElement('span');
          span.className = 'text-reveal-scramble';
          span.textContent = finalText;
          span.dataset.finalText = finalText;
          span.style.display = 'inline-block';
          span.style.whiteSpace = 'pre';
          span.style.verticalAlign = 'baseline';

          try {
            textNode.parentNode.replaceChild(span, textNode);
          } catch (_) {
            return;
          }

          animateSpan(span, finalText, delay, duration);
        });

        interactiveRoots.forEach((root) => {
          if (!root || root.__scrambleReplayBound) return;
          root.__scrambleReplayBound = true;
          let lastReplayAt = 0;
          const triggerReplay = (event) => {
            if (event && event.type === 'focusin') {
              const keyboardFocused = !!(root.matches(':focus-visible') || root.querySelector(':focus-visible'));
              if (!keyboardFocused) return;
            }
            const now = performance.now();
            if (now - lastReplayAt < 160) return;
            lastReplayAt = now;
            replayRoot(root);
          };
          const stopReplay = () => {
            stopRootScramble(root);
          };
          root.addEventListener('mouseenter', triggerReplay);
          root.addEventListener('focusin', triggerReplay);
          root.addEventListener('mouseleave', stopReplay);
          root.addEventListener('focusout', stopReplay);
        });

        return true;
      };

      let hasRunInitialReveal = false;
      let retryCount = 0;
      const MAX_RETRIES = 10;
      const scheduleRun = () => {
        if (hasRunInitialReveal) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const didRun = run();
            if (didRun) {
              hasRunInitialReveal = true;
              return;
            }
            if (retryCount < MAX_RETRIES) {
              retryCount += 1;
              window.setTimeout(scheduleRun, 180);
            }
          });
        });
      };

      scheduleRun();
      if (document.readyState !== 'complete') {
        window.addEventListener('load', scheduleRun, { once: true });
      }
      window.addEventListener('pageshow', scheduleRun, { once: true });
    } catch (_) { /* ignore home text reveal errors */ }
  })();

  // Site-wide tabs: slide active background pill to selected tab
  (function setupGlobalSlidingTabPill() {
    try {
      const tabLists = Array.from(document.querySelectorAll('.tabs[role="tablist"]'));
      if (!tabLists.length) return;

      const updatePill = (tabList) => {
        if (!tabList) return;
        const tabs = Array.from(tabList.querySelectorAll('.nav-item[role="tab"]'));
        if (!tabs.length) return;

        const activeTab = tabs.find((tab) => tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true') || tabs[0];
        if (!activeTab) return;

        const listRect = tabList.getBoundingClientRect();
        const activeRect = activeTab.getBoundingClientRect();
        const x = Math.round(activeRect.left - listRect.left);
        const width = Math.round(activeRect.width);

        tabList.style.setProperty('--tabs-active-x', `${x}px`);
        tabList.style.setProperty('--tabs-active-width', `${width}px`);
        tabList.classList.add('has-active-pill');
      };

      tabLists.forEach((tabList) => {
        if (!tabList || tabList.__slidingPillBound) return;
        tabList.__slidingPillBound = true;

        const tabs = Array.from(tabList.querySelectorAll('.nav-item[role="tab"]'));
        if (!tabs.length) return;

        const scheduleUpdate = () => {
          requestAnimationFrame(() => updatePill(tabList));
        };

        tabs.forEach((tab) => {
          tab.addEventListener('click', scheduleUpdate);
          tab.addEventListener('keyup', (event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
              scheduleUpdate();
            }
          });
        });

        const observer = new MutationObserver(scheduleUpdate);
        tabs.forEach((tab) => {
          observer.observe(tab, { attributes: true, attributeFilter: ['class', 'aria-selected'] });
        });

        window.addEventListener('resize', scheduleUpdate);
        window.addEventListener('orientationchange', scheduleUpdate);
        scheduleUpdate();
      });
    } catch (_) { /* ignore sliding tab pill errors */ }
  })();

  // About page: subtle 3D tilt on the portrait when hovering with a mouse
  (function setupAboutPhotoTilt() {
    try {
      const root = document.querySelector('.page[data-name="about page"] .about-photo');
      if (!root) return;
      const supportsHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (!supportsHover) return; // only enable on hover-capable devices

      const MAX_TILT = 4; // degrees
      const LIFT = 8;     // px translateZ

      const update = (clientX, clientY) => {
        const r = root.getBoundingClientRect();
        const x = (clientX - r.left) / r.width;  // 0..1
        const y = (clientY - r.top) / r.height;  // 0..1
        const dx = (x - 0.5) * 2; // -1..1
        const dy = (y - 0.5) * 2; // -1..1
        const tiltY = (dx * MAX_TILT).toFixed(2) + 'deg';      // rotateY left/right
        const tiltX = (-dy * MAX_TILT).toFixed(2) + 'deg';     // rotateX up/down (invert for natural feel)
        root.style.setProperty('--tiltX', tiltX);
        root.style.setProperty('--tiltY', tiltY);
        root.style.setProperty('--liftZ', LIFT + 'px');
      };

      const reset = () => {
        root.style.setProperty('--tiltX', '0deg');
        root.style.setProperty('--tiltY', '0deg');
        root.style.setProperty('--liftZ', '0px');
      };

      const onMove = (e) => update(e.clientX, e.clientY);
      const onLeave = () => reset();
      const onFocus = (e) => {
        // center tilt when focused via keyboard
        const r = root.getBoundingClientRect();
        update(r.left + r.width / 2, r.top + r.height / 2);
      };

      root.addEventListener('mousemove', onMove);
      root.addEventListener('mouseleave', onLeave);
      root.addEventListener('focusin', onFocus);
      root.addEventListener('focusout', onLeave);

      // Click to open LinkedIn profile in a new tab (no layout changes)
      const openLinkedIn = () => {
        try { window.open('https://www.linkedin.com/in/josephgreenwood/', '_blank', 'noopener,noreferrer'); } catch (_) {}
      };
      root.addEventListener('click', openLinkedIn);
      root.setAttribute('tabindex', '0');
      root.setAttribute('role', 'link');
      root.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openLinkedIn();
        }
      });
    } catch (_) { /* ignore tilt errors */ }
  })();

  // About page: keep the portrait image height equal to the about card's content height
  (function setupAboutPhotoHeightSync() {
    try {
      const aboutPage = document.querySelector('.page[data-name="about page"]');
      if (!aboutPage) return;
      const card = aboutPage.querySelector('.about-card');
      const figure = aboutPage.querySelector('.about-photo');
      const img = figure ? figure.querySelector('img') : null;
      if (!card || !figure || !img) return;

      const apply = () => {
        try {
          const h = Math.max(0, Math.floor(card.getBoundingClientRect().height));
          figure.style.height = h ? h + 'px' : '';
          img.style.height = '100%';
          img.style.width = 'auto';
        } catch (_) { /* ignore */ }
      };
      // On load and resize
      window.addEventListener('load', apply);
      window.addEventListener('resize', apply);
      // Ensure we sync when the image finishes loading
      try { img.addEventListener('load', apply, { once: false }); } catch (_) {}
      // React to card content changes
      try {
        const ro = new ResizeObserver(() => apply());
        ro.observe(card);
        ro.observe(figure);
      } catch (_) { /* ignore if unsupported */ }
      // Initial call
      apply();
    } catch (_) { /* ignore about sync errors */ }
  })();

  // About page: scroll-triggered animations for elements with the scroll-reveal class
  (function setupScrollRevealAnimations() {
    try {
      const aboutPage = document.querySelector('.page[data-name="about page"]');
      if (!aboutPage) return;
      
      // Get all elements with the scroll-reveal class
      const revealElements = aboutPage.querySelectorAll('.scroll-reveal');
      if (!revealElements.length) return;
      
      // Create an Intersection Observer
      const observerOptions = {
        root: null, // viewport
        rootMargin: '0px',
        threshold: 0.15 // 15% of the element needs to be visible
      };
      
      const observerCallback = (entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            // Once revealed, no need to observe anymore
            observer.unobserve(entry.target);
          }
        });
      };
      
      const observer = new IntersectionObserver(observerCallback, observerOptions);
      
      // Observe each element
      revealElements.forEach(element => {
        observer.observe(element);
      });
      
    } catch (_) { /* ignore scroll reveal errors */ }
  })();

  // Case study: Intro overlay with typed text (e.g., NestBank)
  (function setupCaseStudyIntroOverlay() {
    try {
      const overlay = document.querySelector('.intro-overlay');
      if (!overlay) return; // only on pages that include the overlay (nestbank)
      // Run this logic only on case study pages, not on home (home uses overlay for routing only)
      const isCaseStudy = !!document.querySelector('.page[data-name="case study page"]');
      if (!isCaseStudy) return;

      const lines = Array.from(overlay.querySelectorAll('.intro-line'));
      const texts = lines.map((el) => (el && el.dataset ? String(el.dataset.text || '') : ''));

      // Hide nav bars until overlay completes
      const navs = Array.from(document.querySelectorAll('.nav-bar'));
      navs.forEach((n) => {
        n.classList.add('intro-top-hidden');
        n.classList.remove('intro-top-visible');
      });

      // Fade/slide overlay in for smooth transition unless coming from home handoff
      let cameFromHome = false;
      try { cameFromHome = (sessionStorage.getItem('nb_from_home') === '1'); } catch (_) { cameFromHome = false; }
      if (cameFromHome) {
        try {
          // Ensure overlay is already present without playing the enter animation
          const prev = overlay.style.transition;
          overlay.style.transition = 'none';
          overlay.classList.add('enter');
          // force reflow
          void overlay.offsetHeight;
          overlay.style.transition = prev;
        } catch (_) {}
        try { document.documentElement.classList.remove('route-handoff-pending'); } catch (_) {}
        try { sessionStorage.removeItem('nb_from_home'); } catch (_) {}
      } else {
        try { overlay.classList.add('enter'); } catch (_) {}
      }

      // Use a shorter overlay on NestBank for a snappier feel
      const IS_NESTBANK = (() => {
        try {
          const p = String(location && location.pathname || '').toLowerCase();
          const t = String(document && document.title || '').toLowerCase();
          return p.includes('nestbank.html') || t.includes('nestbank');
        } catch (_) { return false; }
      })();
      const IS_TOM = (() => {
        try {
          const p = String(location && location.pathname || '').toLowerCase();
          const t = String(document && document.title || '').toLowerCase();
          return p.includes('tom.html') || t.includes('tom');
        } catch (_) { return false; }
      })();
      const IS_TOYOTA = (() => {
        try {
          const p = String(location && location.pathname || '').toLowerCase();
          const t = String(document && document.title || '').toLowerCase();
          return p.includes('toyota.html') || t.includes('toyota');
        } catch (_) { return false; }
      })();
      const TOTAL_MS = IS_NESTBANK ? 1500 : (IS_TOM ? 1500 : (IS_TOYOTA ? 1800 : 2500));      // total overlay duration (reduced for faster transitions)
      const TYPE_TOTAL_MS = Math.min(7000, Math.floor(TOTAL_MS * 0.7));   // typing window (~70%)
      const perLineWindow = (lines.length > 0) ? (TYPE_TOTAL_MS / lines.length) : 0;

      // Build rich lines with bold label (before //) and value (after //)
      const rich = lines.map((el, idx) => {
        const raw = texts[idx] || '';
        const parts = raw.split('//');
        const label = (parts[0] || '').trim();
        const value = parts.slice(1).join('//').trim();
        try {
          el.innerHTML = `<span class="intro-label"><strong></strong></span>` + (value ? `<span class="intro-value"></span>` : '');
        } catch (_) {}
        const strongEl = el.querySelector('.intro-label strong');
        const valueEl = el.querySelector('.intro-value');
        return { el, strongEl, valueEl, labelText: label.length ? `${label} // ` : '', valueText: value };
      });

      function typeInto(targetEl, text, speed, done) {
        const L = text.length;
        let i = 0;
        (function tick() {
          try { if (targetEl) targetEl.textContent = text.slice(0, i); } catch (_) {}
          i++;
          if (i <= L) {
            setTimeout(tick, speed);
          } else if (typeof done === 'function') {
            done();
          }
        })();
      }

      // Chain typing sequentially across lines
      let idx = 0;
      (function next() {
        if (idx >= rich.length) return;
        const info = rich[idx];
        // Compute speeds for label and value to fit within per-line window
        const totalChars = (info.labelText || '').length + (info.valueText || '').length;
        const baseSpeed = Math.max(18, Math.floor(perLineWindow / Math.max(1, totalChars)));
        typeInto(info.strongEl, info.labelText || '', baseSpeed, () => {
          if (info.valueEl) {
            typeInto(info.valueEl, info.valueText || '', baseSpeed, () => { idx++; next(); });
          } else {
            idx++; next();
          }
        });
      })();

      // After total duration, fade out overlay and reveal nav with a nice stagger
      setTimeout(() => {
        try { overlay.classList.add('fade-out'); } catch (_) {}
        // Remove overlay after fade transition
        setTimeout(() => { try { overlay.remove(); } catch (_) {} }, 420);
        // Reveal navs (staggered)
        const BASE_DELAY = 0;
        const STEP = 180;
        navs.forEach((nav, i) => {
          setTimeout(() => {
            nav.classList.remove('intro-top-hidden');
            nav.classList.add('intro-top-visible');
          }, BASE_DELAY + i * STEP);
        });
      }, TOTAL_MS);
    } catch (_) { /* ignore overlay errors */ }
  })();
  const SAVE_DATA = (() => {
    try { return !!(navigator.connection && navigator.connection.saveData); } catch { return false; }
  })();
  const LITE_MODE = IS_SMALL_SCREEN || SAVE_DATA;

  const DEV_NOCACHE_ASSETS = (() => {
    try {
      const proto = String(location && location.protocol || '');
      const host = String(location && location.hostname || '');
      return proto === 'file:' || host === 'localhost' || host === '127.0.0.1' || host === '::';
    } catch (_) { return false; }
  })();
  const DEV_ASSET_BUST = DEV_NOCACHE_ASSETS ? String(Date.now()) : '';
  function withDevAssetBust(src) {
    if (!DEV_NOCACHE_ASSETS) return src;
    if (!src || typeof src !== 'string') return src;
    const sep = src.includes('?') ? '&' : '?';
    return `${src}${sep}v=${DEV_ASSET_BUST}`;
  }

  const NESTBANK_FILES = [
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

  const TOM_FILES = [
    "./assets/tom/1.jpg",
    "./assets/tom/2.svg",
    "./assets/tom/4.jpg",
    "./assets/tom/3.jpg",
    "./assets/tom/5.jpg",
    "./assets/tom/6.svg",
    "./assets/tom/7.jpg",
    "./assets/tom/8.jpg",
    "./assets/tom/10.jpg",
    "./assets/tom/9.jpg",
    "./assets/tom/11.jpg",
    // Remaining TOM assets after the 1–11 sequence
    "./assets/tom/12.jpg",
  ];

  const TRD_FILES = [
    "./assets/trd/1.jpg",
    "./assets/trd/2.png",
    "./assets/trd/3.jpg?v=2",
    "./assets/trd/5.png?v=2",
    "./assets/trd/3.5.jpg",
    "./assets/trd/4.jpg?v=4",
    "./assets/trd/7.jpg?v=2",
    "./assets/trd/8.png",
    "./assets/trd/6.jpeg",
  ];

  const RELIAS_FILES = [
    "./assets/relias/1.jpg",
    "./assets/relias/2.png",
    "./assets/relias/3.jpg",
    "./assets/relias/3,5.png",
    "./assets/relias/4.jpg",
    "./assets/relias/5.png",
    "./assets/relias/6.jpg",
    "./assets/relias/7.png",
    "./assets/relias/8.jpg",
    "./assets/relias/9.jpg",
    "./assets/relias/10.png?v=2",
  ];

  const QL_FILES = [
    "./assets/ql/1.jpg",
    "./assets/ql/2.png",
    "./assets/ql/3.jpg?v=2",
    "./assets/ql/4.png",
    "./assets/ql/5.jpg",
    "./assets/ql/6.png",
    "./assets/ql/7.jpg",
    "./assets/ql/8.jpg",
    "./assets/ql/9.png",
  ];

  function getCaseStudyFiles() {
    try {
      const p = String(location && location.pathname || '').toLowerCase();
      const t = String(document && document.title || '').toLowerCase();
      if (p.includes('tom.html') || t.includes('tom')) return TOM_FILES;
      if (p.includes('toyota.html') || t.includes('toyota')) return TRD_FILES;
      if (p.includes('nestbank.html') || t.includes('nestbank')) return NESTBANK_FILES;
      if (p.includes('ql.html') || t.includes('quicken') || t.includes('rocket')) return QL_FILES;
      if (p.includes('relias.html') || p.includes('virelia.html') || t.includes('relias') || t.includes('virelia')) return RELIAS_FILES;
    } catch (_) {}
    return NESTBANK_FILES;
  }

  // Keep ALL assets (images and videos), per requirement. We'll optimize how we load/play them instead.
  const files = getCaseStudyFiles();

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

      (function setupHomeGameStage() {
        try {
          const stage = document.querySelector('.home-game-stage__inner');
          const scoreEl = document.querySelector('.home-game-score');
          const hintEl = document.querySelector('.home-game-hint');
          const playHintWrap = document.querySelector('.home-game-hint__play-wrap');
          const playHintBtn = document.querySelector('.home-game-hint__play');
          const gameOverEl = document.querySelector('.home-game-over');
          const gameOverScoreEl = document.querySelector('.home-game-over__eyebrow');
          const playAgainBtn = document.querySelector('.home-game-over__replay');
          const gameOverTalkLink = document.querySelector('.home-game-over__cta--secondary');
          const asteroidLayer = document.querySelector('.home-game-asteroid-layer');
          const rocketWrap = document.querySelector('.home-game-rocket-wrap');
          const rocket = document.querySelector('.home-game-rocket');
          if (!stage || !scoreEl || !hintEl || !playHintWrap || !playHintBtn || !gameOverEl || !gameOverScoreEl || !playAgainBtn || !gameOverTalkLink || !asteroidLayer || !rocketWrap || !rocket) return;
          try { rocket.setAttribute('draggable', 'false'); } catch (_) {}
          try { rocket.addEventListener('dragstart', (e) => e.preventDefault()); } catch (_) {}

          const frameSets = {
            idle: [
              './assets/rocketgame/costumes/rocket/rocket-idle/rocket-idle-01.png',
              './assets/rocketgame/costumes/rocket/rocket-idle/rocket-idle-02.png',
              './assets/rocketgame/costumes/rocket/rocket-idle/rocket-idle-03.png',
            ],
            up: [
              './assets/rocketgame/costumes/rocket/rocket-up/rocket-up-01.png',
              './assets/rocketgame/costumes/rocket/rocket-up/rocket-up-02.png',
              './assets/rocketgame/costumes/rocket/rocket-up/rocket-up-03.png',
            ],
            down: [
              './assets/rocketgame/costumes/rocket/rocket-down/rocket-down-01.png',
              './assets/rocketgame/costumes/rocket/rocket-down/rocket-down-02.png',
              './assets/rocketgame/costumes/rocket/rocket-down/rocket-down-03.png',
            ],
          };
          const asteroidSprites = [
            './assets/rocketgame/costumes/asteroids/asteroid-small.png',
            './assets/rocketgame/costumes/asteroids/asteroid-medium.png',
          ];

          Object.values(frameSets).flat().forEach((src) => {
            try {
              const img = new Image();
              img.decoding = 'async';
              img.src = src;
            } catch (_) {}
          });
          asteroidSprites.forEach((src) => {
            try {
              const img = new Image();
              img.decoding = 'async';
              img.src = src;
            } catch (_) {}
          });

          let rocketOffsetY = 0;
          let rocketVelocityY = 0;
          let movementRAF = 0;
          const pressedKeys = new Set();
          let pointerDirection = 'neutral';
          let activePointerId = null;
          let activePointerIntent = 'neutral';
          let pointerStartedGame = false;
          let activeFrameSet = 'idle';
          let frameIndex = 0;
          const asteroids = [];
          let asteroidLoopRAF = 0;
          let lastAsteroidTick = 0;
          let lastSpawnAt = 0;
          let spawnsSinceRocketLane = 0;
          let gameStartedAt = 0;
          let pauseStartedAt = 0;
          let isDangerPhase = false;
          let isPaused = false;
          let hasStartedGame = false;
          let isRelaunching = false;
          let currentScore = 0;
          let isGameOver = false;
          let isCrashPending = false;
          let mobileTapReleaseTimer = 0;
          let lastMobileTouchImpulseAt = 0;
          let relaunchTimer = 0;
          const MAX_SPEED = 4.5;
          const ACCELERATION = 0.42;
          const FRICTION = 0.84;
          const ASTEROID_SPAWN_MIN = 480;
          const ASTEROID_SPAWN_MAX = 1050;
          let nextAsteroidSpawnIn = ASTEROID_SPAWN_MIN + Math.random() * (ASTEROID_SPAWN_MAX - ASTEROID_SPAWN_MIN);
          const isSmallGameBreakpoint = () => {
            try { return window.matchMedia && window.matchMedia('(max-width: 600px)').matches; } catch (_) { return false; }
          };
          const isButtonTouchBreakpoint = () => {
            try { return window.matchMedia && window.matchMedia('(max-width: 1000px)').matches; } catch (_) { return false; }
          };
          const getButtonActionDelay = () => isButtonTouchBreakpoint() ? 250 : 0;
          const applyRocketOffset = () => {
            rocket.style.setProperty('--rocket-offset-y', `${rocketOffsetY}px`);
          };
          const resetAsteroids = () => {
            asteroids.forEach((asteroid) => {
              try { asteroid.el.remove(); } catch (_) {}
            });
            asteroids.length = 0;
          };
          const attachTouchButtonFeedback = (wrap) => {
            if (!wrap) return;
            let hoverTimer = 0;
            let pressTimer = 0;
            const clearTouchState = () => {
              if (hoverTimer) window.clearTimeout(hoverTimer);
              if (pressTimer) window.clearTimeout(pressTimer);
              hoverTimer = 0;
              pressTimer = 0;
              wrap.classList.remove('is-touch-hover', 'is-touch-press');
            };
            wrap.addEventListener('pointerdown', (e) => {
              if (e.pointerType !== 'touch') return;
              clearTouchState();
              wrap.classList.add('is-touch-hover');
              hoverTimer = window.setTimeout(() => {
                wrap.classList.remove('is-touch-hover');
                wrap.classList.add('is-touch-press');
                hoverTimer = 0;
              }, 70);
            });
            wrap.addEventListener('pointerup', () => {
              if (!wrap.classList.contains('is-touch-hover') && !wrap.classList.contains('is-touch-press')) return;
              if (hoverTimer) {
                window.clearTimeout(hoverTimer);
                hoverTimer = 0;
                wrap.classList.remove('is-touch-hover');
                wrap.classList.add('is-touch-press');
              }
              pressTimer = window.setTimeout(() => {
                wrap.classList.remove('is-touch-press');
                pressTimer = 0;
              }, Math.max(110, getButtonActionDelay()));
            });
            wrap.addEventListener('pointercancel', clearTouchState);
            wrap.addEventListener('lostpointercapture', clearTouchState);
          };
          const syncCrashScene = (hitAsteroid = null) => {
            asteroids.forEach((asteroid) => {
              try {
                asteroid.el.classList.toggle('is-hidden-on-crash', !!hitAsteroid && asteroid !== hitAsteroid);
              } catch (_) {}
            });
          };
          const resetGameButtonStates = () => {
            try {
              const activeEl = document.activeElement;
              if (activeEl && activeEl.blur && (
                activeEl.closest('.home-game-hint__play-wrap') ||
                activeEl.closest('.home-game-over__cta-wrap')
              )) {
                activeEl.blur();
              }
            } catch (_) {}
          };
          const markGameStarted = () => {
            if (hasStartedGame) return;
            resetGameButtonStates();
            hasStartedGame = true;
            gameStartedAt = performance.now();
            lastAsteroidTick = gameStartedAt;
            lastSpawnAt = gameStartedAt;
            stage.classList.add('has-started');
          };
          const syncPausedState = () => {
            stage.classList.toggle('is-paused', isPaused);
            stage.setAttribute('aria-pressed', isPaused ? 'true' : 'false');
          };
          const syncGameOverState = () => {
            stage.classList.toggle('is-game-over', isGameOver);
          };
          const finishRelaunch = () => {
            isRelaunching = false;
            hasStartedGame = true;
            const startAt = performance.now();
            gameStartedAt = startAt;
            lastAsteroidTick = startAt;
            lastSpawnAt = startAt;
            spawnsSinceRocketLane = 0;
            stage.classList.add('has-started', 'is-ready');
            requestAnimationFrame(() => {
              try { rocketWrap.classList.remove('is-relaunching'); } catch (_) {}
            });
          };
          const updateScore = (elapsedMs) => {
            const score = Math.floor(elapsedMs / 10);
            scoreEl.textContent = `Score: ${score}`;
            return score;
          };
          const getMovementState = () => {
            const movingUp = pressedKeys.has('ArrowUp') || pointerDirection === 'up';
            const movingDown = pressedKeys.has('ArrowDown') || pointerDirection === 'down';
            return { movingUp, movingDown };
          };
          const getActiveFrameSet = () => {
            const { movingUp, movingDown } = getMovementState();
            if (movingUp && !movingDown) return 'up';
            if (movingDown && !movingUp) return 'down';
            return 'idle';
          };
          const syncRocketFrame = (forceReset = false) => {
            const nextFrameSet = getActiveFrameSet();
            if (forceReset || nextFrameSet !== activeFrameSet) {
              activeFrameSet = nextFrameSet;
              frameIndex = 0;
            }
            const frames = frameSets[activeFrameSet] || frameSets.idle;
            rocket.src = frames[frameIndex % frames.length];
          };
          const clampRocketOffset = (next) => {
            try {
              const stageHeight = stage.clientHeight || 0;
              const rocketHeight = rocket.getBoundingClientRect().height || 0;
              const availableTravel = Math.max(0, stageHeight - rocketHeight);
              const maxOffset = availableTravel / 2;
              if (!maxOffset) return 0;
              return Math.max(-maxOffset, Math.min(maxOffset, next));
            } catch (_) {
              return next;
            }
          };
          const moveRocket = () => {
            const { movingUp, movingDown } = getMovementState();

            if (movingUp && !movingDown) rocketVelocityY -= ACCELERATION;
            else if (movingDown && !movingUp) rocketVelocityY += ACCELERATION;
            else rocketVelocityY *= FRICTION;

            rocketVelocityY = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, rocketVelocityY));
            if (Math.abs(rocketVelocityY) < 0.05 && !movingUp && !movingDown) rocketVelocityY = 0;

            rocketOffsetY = clampRocketOffset(rocketOffsetY + rocketVelocityY);
            applyRocketOffset();
          };
          const getPointerMoveIntent = (clientY) => {
            try {
              const rocketRect = rocket.getBoundingClientRect();
              const rocketCenterY = rocketRect.top + (rocketRect.height / 2);
              const neutralBand = Math.max(18, rocketRect.height * 0.38);
              if (clientY < rocketCenterY - neutralBand) return 'up';
              if (clientY > rocketCenterY + neutralBand) return 'down';
            } catch (_) {}
            return 'neutral';
          };
          const getMobileTapIntent = (clientY) => {
            try {
              const rocketRect = rocket.getBoundingClientRect();
              const rocketCenterY = rocketRect.top + (rocketRect.height / 2);
              return clientY < rocketCenterY ? 'up' : 'down';
            } catch (_) {
              return 'neutral';
            }
          };
          const setPointerDirection = (direction) => {
            pointerDirection = direction === 'up' || direction === 'down' ? direction : 'neutral';
            syncRocketFrame();
            if (pointerDirection !== 'neutral') ensureMovementLoop();
          };
          const applyMobileTapImpulse = (direction) => {
            if (direction !== 'up' && direction !== 'down') return;
            if (mobileTapReleaseTimer) window.clearTimeout(mobileTapReleaseTimer);
            rocketVelocityY = direction === 'up' ? -MAX_SPEED : MAX_SPEED;
            rocketOffsetY = clampRocketOffset(rocketOffsetY + (direction === 'up' ? -18 : 18));
            applyRocketOffset();
            setPointerDirection(direction);
            mobileTapReleaseTimer = window.setTimeout(() => {
              pointerDirection = 'neutral';
              syncRocketFrame();
              mobileTapReleaseTimer = 0;
            }, 120);
          };
          const endGame = (hitAsteroid = null) => {
            if (isGameOver || isCrashPending) return;
            isCrashPending = true;
            isPaused = false;
            syncCrashScene(hitAsteroid);
            pressedKeys.clear();
            pointerDirection = 'neutral';
            activePointerId = null;
            activePointerIntent = 'neutral';
            pointerStartedGame = false;
            rocketVelocityY = 0;
            if (mobileTapReleaseTimer) window.clearTimeout(mobileTapReleaseTimer);
            mobileTapReleaseTimer = 0;
            syncPausedState();
            isCrashPending = false;
            isGameOver = true;
            gameOverScoreEl.textContent = `Score: ${currentScore}`;
            syncGameOverState();
          };
          const resetGame = () => {
            resetGameButtonStates();
            isGameOver = false;
            isCrashPending = false;
            isPaused = false;
            isDangerPhase = false;
            hasStartedGame = false;
            isRelaunching = true;
            currentScore = 0;
            rocketOffsetY = 0;
            rocketVelocityY = 0;
            pressedKeys.clear();
            pointerDirection = 'neutral';
            activePointerId = null;
            activePointerIntent = 'neutral';
            pointerStartedGame = false;
            if (mobileTapReleaseTimer) window.clearTimeout(mobileTapReleaseTimer);
            mobileTapReleaseTimer = 0;
            if (relaunchTimer) window.clearTimeout(relaunchTimer);
            relaunchTimer = 0;
            lastAsteroidTick = 0;
            lastSpawnAt = 0;
            spawnsSinceRocketLane = 0;
            gameStartedAt = 0;
            pauseStartedAt = 0;
            nextAsteroidSpawnIn = ASTEROID_SPAWN_MIN + Math.random() * (ASTEROID_SPAWN_MAX - ASTEROID_SPAWN_MIN);
            resetAsteroids();
            syncCrashScene(null);
            scoreEl.textContent = 'Score: 0';
            gameOverScoreEl.textContent = 'Score: 0';
            stage.classList.remove('is-danger', 'is-ready');
            stage.classList.add('has-started');
            syncPausedState();
            syncGameOverState();
            applyRocketOffset();
            syncRocketFrame(true);
            try {
              rocketWrap.classList.remove('is-relaunching');
              void rocketWrap.offsetWidth;
              rocketWrap.classList.add('is-relaunching');
            } catch (_) {}
            relaunchTimer = window.setTimeout(() => {
              relaunchTimer = 0;
              finishRelaunch();
            }, 820);
          };
          const isColliding = (a, b) => {
            return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          };
          const insetRect = (rect, inset) => {
            return {
              left: rect.left + (inset.left || 0),
              right: rect.right - (inset.right || 0),
              top: rect.top + (inset.top || 0),
              bottom: rect.bottom - (inset.bottom || 0),
            };
          };
          const getRocketHitRect = (rect) => {
            const w = rect.right - rect.left;
            const h = rect.bottom - rect.top;
            return {
              left: rect.left + (w * 0.42),
              right: rect.right - (w * 0.18),
              top: rect.top + (h * 0.2),
              bottom: rect.bottom - (h * 0.2),
            };
          };
          const getAsteroidHitRect = (rect) => {
            const w = rect.right - rect.left;
            const h = rect.bottom - rect.top;
            return {
              left: rect.left + (w * 0.16),
              right: rect.right - (w * 0.16),
              top: rect.top + (h * 0.16),
              bottom: rect.bottom - (h * 0.16),
            };
          };
          const getRocketLaneSpawnY = (size, stageHeight) => {
            try {
              const rocketRect = rocket.getBoundingClientRect();
              const stageRect = stage.getBoundingClientRect();
              const rocketCenterY = rocketRect.top + (rocketRect.height / 2);
              const stageCenterY = stageRect.top + (stageRect.height / 2);
              const variance = (Math.random() - 0.5) * Math.min(56, stageHeight * 0.14);
              const centeredY = (rocketCenterY - stageCenterY) - (size / 2) + variance;
              const minY = -((stageHeight - size) / 2);
              const maxY = (stageHeight - size) / 2;
              return Math.max(minY, Math.min(maxY, centeredY));
            } catch (_) {
              return 0;
            }
          };
          const spawnAsteroid = () => {
            try {
              const stageWidth = stage.clientWidth || 0;
              const stageHeight = stage.clientHeight || 0;
              if (!stageWidth || !stageHeight) return;

              const sprite = asteroidSprites[Math.floor(Math.random() * asteroidSprites.length)] || asteroidSprites[0];
              const baseSize = sprite.includes('medium') ? 42 : 24;
              const scoreSizeMultiplier = currentScore >= 15000 ? 2.25 : currentScore >= 10000 ? 1.5 : 1;
              const size = Math.round(baseSize * (1 + Math.random() * 0.75) * scoreSizeMultiplier);
              const el = document.createElement('div');
              const spriteEl = document.createElement('img');
              const travelRange = Math.max(0, stageHeight - size);
              const shouldBiasToRocketLane = spawnsSinceRocketLane >= 3 || (spawnsSinceRocketLane >= 1 && Math.random() < 0.24);
              const randomSpawnY = travelRange ? Math.round(Math.random() * travelRange) - (stageHeight - size) / 2 : 0;
              const spawnY = shouldBiasToRocketLane ? getRocketLaneSpawnY(size, stageHeight) : randomSpawnY;
              const spawnX = stageWidth + size + 40 + Math.round(Math.random() * 80);
              const asteroid = {
                el,
                spriteEl,
                x: spawnX,
                y: spawnY,
                speed: 1.6 + Math.random() * 1.6,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() * 1.6 + 0.3) * (Math.random() > 0.5 ? 1 : -1),
                size,
              };

              el.className = 'home-game-asteroid';
              spriteEl.className = 'home-game-asteroid-sprite';
              spriteEl.src = sprite;
              spriteEl.alt = '';
              spriteEl.decoding = 'async';
              spriteEl.draggable = false;
              try { spriteEl.addEventListener('dragstart', (e) => e.preventDefault()); } catch (_) {}
              spawnsSinceRocketLane = shouldBiasToRocketLane ? 0 : spawnsSinceRocketLane + 1;
              el.style.setProperty('--asteroid-size', `${size}px`);
              el.style.setProperty('--asteroid-x', `${spawnX}px`);
              el.style.setProperty('--asteroid-y', `${spawnY}px`);
              spriteEl.style.setProperty('--asteroid-rotation', `${asteroid.rotation}deg`);
              el.appendChild(spriteEl);
              asteroidLayer.appendChild(el);
              asteroids.push(asteroid);
            } catch (_) {}
          };
          const tickAsteroids = (now) => {
            if (!lastAsteroidTick) lastAsteroidTick = now;
            if (!hasStartedGame) {
              updateScore(0);
              lastAsteroidTick = now;
              asteroidLoopRAF = requestAnimationFrame(tickAsteroids);
              return;
            }
            if (isRelaunching) {
              updateScore(0);
              lastAsteroidTick = now;
              asteroidLoopRAF = requestAnimationFrame(tickAsteroids);
              return;
            }
            if (isCrashPending || isGameOver) {
              lastAsteroidTick = now;
              asteroidLoopRAF = requestAnimationFrame(tickAsteroids);
              return;
            }
            if (isPaused) {
              lastAsteroidTick = now;
              asteroidLoopRAF = requestAnimationFrame(tickAsteroids);
              return;
            }
            const delta = Math.min(32, now - lastAsteroidTick);
            lastAsteroidTick = now;
            const elapsedMs = now - gameStartedAt;
            const score = updateScore(elapsedMs);
            currentScore = score;
            isDangerPhase = score > 5000;
            stage.classList.toggle('is-danger', isDangerPhase);
            const targetDangerMultiplier = 2.2;
            const progressToDanger = Math.min(1, score / 5000);
            const speedRampMultiplier = 1 + ((targetDangerMultiplier - 1) * progressToDanger);
            const baseDifficultyMultiplier = Math.min(2.4, 1 + (elapsedMs / 1000) * 0.015);
            const difficultyMultiplier = baseDifficultyMultiplier * speedRampMultiplier;
            const spawnIntervalMultiplier = score >= 15000 ? 0.3 : score >= 8000 ? 0.48 : 1;

            if (!lastSpawnAt) lastSpawnAt = now;
            if (now - lastSpawnAt >= nextAsteroidSpawnIn * spawnIntervalMultiplier) {
              spawnAsteroid();
              lastSpawnAt = now;
              nextAsteroidSpawnIn = ASTEROID_SPAWN_MIN + Math.random() * (ASTEROID_SPAWN_MAX - ASTEROID_SPAWN_MIN);
            }

            for (let i = asteroids.length - 1; i >= 0; i -= 1) {
              const asteroid = asteroids[i];
              asteroid.x -= asteroid.speed * difficultyMultiplier * (delta / 16.6667);
              asteroid.rotation += asteroid.rotationSpeed * (delta / 16.6667);
              asteroid.el.style.setProperty('--asteroid-x', `${asteroid.x}px`);
              asteroid.el.style.setProperty('--asteroid-y', `${asteroid.y}px`);
              asteroid.spriteEl.style.setProperty('--asteroid-rotation', `${asteroid.rotation}deg`);

              const rocketRect = rocket.getBoundingClientRect();
              const asteroidRect = asteroid.spriteEl.getBoundingClientRect();
              const adjustedRocketRect = getRocketHitRect(rocketRect);
              const adjustedAsteroidRect = getAsteroidHitRect(asteroidRect);
              if (isColliding(adjustedRocketRect, adjustedAsteroidRect)) {
                endGame(asteroid);
                break;
              }

              if (asteroid.x < -asteroid.size - 80) {
                try { asteroid.el.remove(); } catch (_) {}
                asteroids.splice(i, 1);
              }
            }

            asteroidLoopRAF = requestAnimationFrame(tickAsteroids);
          };

          const tickMovement = () => {
            if (isPaused || isCrashPending || isGameOver) {
              movementRAF = 0;
              return;
            }
            moveRocket();
            if (pressedKeys.size || Math.abs(rocketVelocityY) > 0.05) {
              movementRAF = requestAnimationFrame(tickMovement);
            } else {
              movementRAF = 0;
            }
          };

          const ensureMovementLoop = () => {
            if (movementRAF) return;
            movementRAF = requestAnimationFrame(tickMovement);
          };

          applyRocketOffset();
          syncRocketFrame(true);
          syncPausedState();
          syncGameOverState();
          asteroidLoopRAF = requestAnimationFrame(tickAsteroids);

          requestAnimationFrame(() => {
            window.setTimeout(() => {
              try { stage.classList.add('is-ready'); } catch (_) {}
            }, 80);
          });

          window.addEventListener('resize', () => {
            rocketOffsetY = clampRocketOffset(rocketOffsetY);
            applyRocketOffset();
          });

          window.addEventListener('keydown', (e) => {
            if (e.defaultPrevented) return;
            const target = e.target;
            const isTypingTarget = !!(target && (
              target.tagName === 'INPUT' ||
              target.tagName === 'TEXTAREA' ||
              target.tagName === 'SELECT' ||
              target.isContentEditable
            ));
            if (isTypingTarget) return;
            const isArrowKey = e.key === 'ArrowUp' || e.key === 'ArrowDown';
            const isActivelyPlaying = hasStartedGame && !isPaused && !isCrashPending && !isGameOver;
            if (!hasStartedGame) {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
              }
              return;
            }
            if (!isActivelyPlaying && isArrowKey) {
              return;
            }
            if ((isCrashPending || isGameOver) && e.key === ' ') {
              e.preventDefault();
              return;
            }
            if (e.key === ' ') {
              e.preventDefault();
              togglePause();
              return;
            }
            if (isPaused || isCrashPending || isGameOver) return;
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              pressedKeys.add('ArrowUp');
              syncRocketFrame();
              ensureMovementLoop();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              pressedKeys.add('ArrowDown');
              syncRocketFrame();
              ensureMovementLoop();
            }
          });

          window.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              pressedKeys.delete(e.key);
              syncRocketFrame();
              ensureMovementLoop();
            }
          });

          const togglePause = () => {
            if (isCrashPending || isGameOver) return;
            const now = performance.now();
            isPaused = !isPaused;
            if (isPaused) {
              pauseStartedAt = now;
              pressedKeys.clear();
              pointerDirection = 'neutral';
              activePointerIntent = 'neutral';
              rocketVelocityY = 0;
            } else if (pauseStartedAt && gameStartedAt) {
              const pausedDuration = now - pauseStartedAt;
              gameStartedAt += pausedDuration;
              lastSpawnAt += pausedDuration;
              lastAsteroidTick = now;
              pauseStartedAt = 0;
            }
            syncPausedState();
            if (!isPaused) ensureMovementLoop();
          };

          stage.addEventListener('pointerdown', (e) => {
            if (isCrashPending || isGameOver) return;
            if (e.target && e.target.closest && e.target.closest('.home-game-hint__play, .home-game-over__cta')) return;
            if (typeof e.button === 'number' && e.button !== 0) return;
            if (!hasStartedGame) {
              return;
            }
            activePointerId = e.pointerId;
            pointerStartedGame = false;
            activePointerIntent = isSmallGameBreakpoint() ? getMobileTapIntent(e.clientY) : getPointerMoveIntent(e.clientY);
            if (activePointerIntent !== 'neutral') {
              if (isPaused) togglePause();
              if (isSmallGameBreakpoint()) {
                if (performance.now() - lastMobileTouchImpulseAt > 80) applyMobileTapImpulse(activePointerIntent);
              }
              else setPointerDirection(activePointerIntent);
              try { stage.setPointerCapture && stage.setPointerCapture(e.pointerId); } catch (_) {}
            }
          });
          stage.addEventListener('pointermove', (e) => {
            if (activePointerId == null || e.pointerId !== activePointerId || isCrashPending || isGameOver) return;
            if (activePointerIntent === 'neutral' && pointerDirection === 'neutral') return;
            const nextIntent = getPointerMoveIntent(e.clientY);
            activePointerIntent = nextIntent;
            setPointerDirection(nextIntent);
          });
          stage.addEventListener('pointerup', (e) => {
            if (activePointerId == null || e.pointerId !== activePointerId) return;
            activePointerId = null;
            activePointerIntent = 'neutral';
            pointerStartedGame = false;
            if (!isSmallGameBreakpoint()) setPointerDirection('neutral');
            try { stage.releasePointerCapture && stage.releasePointerCapture(e.pointerId); } catch (_) {}
          });
          stage.addEventListener('pointercancel', (e) => {
            if (activePointerId == null || e.pointerId !== activePointerId) return;
            activePointerId = null;
            activePointerIntent = 'neutral';
            pointerStartedGame = false;
            if (!isSmallGameBreakpoint()) setPointerDirection('neutral');
            try { stage.releasePointerCapture && stage.releasePointerCapture(e.pointerId); } catch (_) {}
          });
          stage.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!hasStartedGame) return;
            }
          });
          attachTouchButtonFeedback(playHintWrap);
          try {
            document.querySelectorAll('.home-game-over__cta-wrap').forEach((wrap) => attachTouchButtonFeedback(wrap));
          } catch (_) {}
          const runButtonAction = (action) => {
            const delay = getButtonActionDelay();
            if (!delay) {
              action();
              return;
            }
            window.setTimeout(action, delay);
          };
          playHintBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            runButtonAction(() => {
              markGameStarted();
            });
          });
          playHintWrap.addEventListener('click', (e) => {
            if (e.target === playHintBtn) return;
            e.preventDefault();
            e.stopPropagation();
            runButtonAction(() => {
              markGameStarted();
            });
          });
          playAgainBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            runButtonAction(() => {
              resetGame();
            });
          });
          gameOverTalkLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            runButtonAction(() => {
              try { window.location.href = gameOverTalkLink.href; } catch (_) {}
            });
          });

          const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (prefersReduced) {
            syncRocketFrame(true);
            return;
          }

          window.setInterval(() => {
            if (isPaused) return;
            const frames = frameSets[getActiveFrameSet()] || frameSets.idle;
            const nextFrameSet = getActiveFrameSet();
            if (nextFrameSet !== activeFrameSet) {
              activeFrameSet = nextFrameSet;
              frameIndex = 0;
            } else {
              frameIndex = (frameIndex + 1) % frames.length;
            }
            rocket.src = frames[frameIndex];
          }, 160);
        } catch (_) { /* ignore home game stage errors */ }
      })();

      // Minimal home interactivity: selectable tiles that expand when focused/selected
      (function setupTiles() {
        const tiles = Array.from(document.querySelectorAll('.tile-grid .tile'));
        if (!tiles.length) return;
        const tileGrid = document.querySelector('.tile-grid');
        const getTileByProject = (name) => {
          try { return tiles.find((t) => t && t.dataset && String(t.dataset.project || '').toLowerCase() === String(name || '').toLowerCase()); } catch (_) { return null; }
        };
        const PROJECT_YEARS = {
          toyota: '2026',
          relias: '2025',
          nestbank: '2023',
          orion: '2024',
          medigo: '2022',
          logofolio: '2025',
          tom: '2023',
          apendito: '2025',
          dinobytes: '2025',
          kinti: '2020',
          kakaoala: '2020',
          skilldex: '2021',
        };
        const PROJECT_CLIENTS = {
          toyota: 'Toyota',
          relias: 'Relias',
          nestbank: 'NestBank',
          orion: 'Rocket',
          medigo: 'Medigo',
          logofolio: 'Logofolio',
          apendito: 'Aprendito',
          dinobytes: 'DinoBytes',
          tom: 'TOM',
          skilldex: 'Skilldex',
          kinti: 'Kinti',
          kakaoala: 'Kakaoala',
        };
        const PROJECT_DISPLAY_TITLES = {
          toyota: 'Toyota Racing',
        };
        const PROJECT_THUMBNAIL_TAGS = {
          toyota: 'Product Design, Strategy, AI',
          relias: 'Product Design, Strategy, AI',
          nestbank: 'Product Design, Strategy, Visual',
          orion: 'Product Design, Strategy, DS',
          medigo: 'Product Design, Visual, DS',
          medbridge: 'Product Design, Visual, DS',
          logofolio: 'Branding, Visual, Logo Design',
          apendito: 'Branding, Strategy, Visual',
          dinobytes: 'Branding, Visual',
          tom: 'Branding, Strategy, Visual',
          skilldex: 'Product Design, Strategy, Visual',
          kinti: 'Branding, Visual',
          kakaoala: 'Branding, Visual',
        };
        const OPEN_IN_NEW_PROJECTS = new Set(['medigo', 'apendito', 'kinti', 'dinobytes', 'kakaoala', 'skilldex']);
        const IN_PROGRESS_PROJECTS = new Set(['medigo']);
        const NON_CLICKABLE_PROJECTS = new Set(['medigo']);
        // Helper: sort tiles by computed CSS order (fallback to DOM index)
        const sortByCssOrder = (list) => {
          try {
            return list
              .map((el, idx) => ({ el, idx, ord: Number(getComputedStyle(el).order || 0) || 0 }))
              .sort((a, b) => (a.ord - b.ord) || (a.idx - b.idx))
              .map((x) => x.el);
          } catch (_) { return list; }
        };
        // Inject thumbnail tags using each project's role
        try {
          tiles.forEach((tile) => {
            try {
              const tags = tile.querySelector('.tile-tags');
              if (tags) tags.remove();
              const flag = tile.querySelector('.tile-flag');
              if (flag) flag.remove();
              const lockBadge = tile.querySelector('.tile-lock-badge');
              if (lockBadge) lockBadge.remove();
              const externalBadge = tile.querySelector('.tile-external-badge');
              if (externalBadge) externalBadge.remove();
              const progressBadge = tile.querySelector('.tile-progress-badge');
              if (progressBadge) progressBadge.remove();
              const frameMeta = tile.querySelector('.tile-frame-meta');
              if (frameMeta) frameMeta.remove();
              const proj = (tile.dataset && tile.dataset.project) ? String(tile.dataset.project || '').trim().toLowerCase() : '';
              const title = (tile.dataset && tile.dataset.title) ? String(tile.dataset.title || '').trim() : '';
              const role = (tile.dataset && tile.dataset.role) ? String(tile.dataset.role || '').trim() : '';
              const industry = (tile.dataset && tile.dataset.industry) ? String(tile.dataset.industry || '').trim() : '';
              const year = PROJECT_YEARS[proj] || '';
              const client = PROJECT_CLIENTS[proj] || (title ? title.split('(')[0].trim() : '');
              const category = (tile.dataset && tile.dataset.category) ? String(tile.dataset.category || '') : '';
              const categoryLabel = category
                .split(/\s+/)
                .filter(Boolean)
                .map((part) => part.toUpperCase())
                .join(' + ');
              const secondaryTag = proj === 'logofolio' ? industry : year;

              const metaWrap = document.createElement('div');
              metaWrap.className = 'tile-frame-meta';

              const topRow = document.createElement('div');
              topRow.className = 'tile-frame-meta__row tile-frame-meta__row--top';
              const topLeft = document.createElement('span');
              topLeft.className = 'tile-frame-meta__text tile-frame-meta__text--client';
              topLeft.textContent = PROJECT_DISPLAY_TITLES[proj] || title || client || 'Project';
              const topRight = document.createElement('span');
              topRight.className = 'tile-frame-meta__text tile-frame-meta__text--title';
              topRight.textContent = role || categoryLabel || industry || '';
              topRow.appendChild(topLeft);
              topRow.appendChild(topRight);

              const bottomRow = document.createElement('div');
              bottomRow.className = 'tile-frame-meta__row tile-frame-meta__row--bottom';
              const explicitTagText = PROJECT_THUMBNAIL_TAGS[proj] || '';
              const explicitTags = explicitTagText
                ? explicitTagText.split(',').map((part) => part.trim()).filter(Boolean)
                : [];
              const bottomLeft = document.createElement('span');
              bottomLeft.className = 'tile-frame-meta__text tile-frame-meta__text--detail';
              if (explicitTags.length > 1) {
                bottomLeft.classList.add('tile-frame-meta__text--tag-group');
                explicitTags.forEach((tagText) => {
                  const chip = document.createElement('span');
                  chip.className = 'tile-frame-meta__text tile-frame-meta__text--tag';
                  chip.textContent = tagText;
                  bottomLeft.appendChild(chip);
                });
              } else {
                bottomLeft.classList.add('tile-frame-meta__text--tag');
                bottomLeft.textContent = explicitTags[0] || categoryLabel || industry || role;
              }
              const bottomRight = document.createElement('span');
              bottomRight.className = 'tile-frame-meta__text tile-frame-meta__text--year';
              bottomRight.textContent = year || industry || '';
              bottomRow.appendChild(bottomLeft);
              bottomRow.appendChild(bottomRight);

              if (bottomLeft.classList.contains('tile-frame-meta__text--tag-group')) {
                const syncBottomRowWrapState = () => {
                  try {
                    const firstChip = bottomLeft.firstElementChild;
                    if (!firstChip) {
                      bottomRow.classList.remove('is-tag-wrapped');
                      return;
                    }
                    const singleLineHeight = (firstChip.getBoundingClientRect().height || 24) + 1;
                    const wrapped = bottomLeft.getBoundingClientRect().height > singleLineHeight;
                    bottomRow.classList.toggle('is-tag-wrapped', wrapped);
                  } catch (_) { /* ignore wrap-state sync */ }
                };
                try { requestAnimationFrame(syncBottomRowWrapState); } catch (_) { syncBottomRowWrapState(); }
                if (typeof ResizeObserver !== 'undefined') {
                  try {
                    const rowResizeObserver = new ResizeObserver(() => syncBottomRowWrapState());
                    rowResizeObserver.observe(bottomLeft);
                    rowResizeObserver.observe(tile);
                  } catch (_) { /* ignore row resize observer */ }
                } else {
                  try { window.addEventListener('resize', syncBottomRowWrapState); } catch (_) { /* ignore fallback resize listener */ }
                }
              }

              metaWrap.appendChild(topRow);
              metaWrap.appendChild(bottomRow);
              tile.appendChild(metaWrap);

              if (role || secondaryTag) {
                const tagsWrap = document.createElement('div');
                tagsWrap.className = 'tile-tags';

                if (role) {
                  const roleTag = document.createElement('div');
                  roleTag.className = 'tile-tag tile-tag--role';
                  roleTag.textContent = role;
                  tagsWrap.appendChild(roleTag);
                }

                if (secondaryTag) {
                  const industryTag = document.createElement('div');
                  industryTag.className = 'tile-tag tile-tag--industry';
                  industryTag.textContent = secondaryTag;
                  tagsWrap.appendChild(industryTag);
                }

                tile.appendChild(tagsWrap);
              }

              if (proj === 'toyota' || proj === 'relias') {
                const lockBadgeWrap = document.createElement('div');
                lockBadgeWrap.className = 'tile-lock-badge';

                const lockTag = document.createElement('div');
                lockTag.className = 'tile-tag tile-tag--locked';
                lockTag.setAttribute('aria-label', 'Password protected project');

                const lockIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                lockIcon.setAttribute('class', 'tile-tag__locked');
                lockIcon.setAttribute('aria-hidden', 'true');
                lockIcon.setAttribute('viewBox', '0 0 24 24');
                lockIcon.setAttribute('width', '14');
                lockIcon.setAttribute('height', '14');
                lockIcon.setAttribute('fill', 'currentColor');
                lockIcon.setAttribute('focusable', 'false');
                const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                iconPath.setAttribute('d', 'M17 9h-1V7c0-2.76-2.24-5-5-5S6 4.24 6 7v2H5c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2m-6 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2m3.1-8H7.9V7c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1z');
                lockIcon.appendChild(iconPath);

                lockTag.appendChild(lockIcon);
                lockBadgeWrap.appendChild(lockTag);
                tile.appendChild(lockBadgeWrap);
              }

              if (OPEN_IN_NEW_PROJECTS.has(proj) && !NON_CLICKABLE_PROJECTS.has(proj)) {
                const externalBadgeWrap = document.createElement('div');
                externalBadgeWrap.className = 'tile-external-badge';

                const externalTag = document.createElement('div');
                externalTag.className = 'tile-tag tile-tag--external';
                externalTag.setAttribute('aria-label', 'Opens external project in new tab');

                const externalIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                externalIcon.setAttribute('class', 'tile-tag__external');
                externalIcon.setAttribute('aria-hidden', 'true');
                externalIcon.setAttribute('viewBox', '0 0 24 24');
                externalIcon.setAttribute('focusable', 'false');

                const externalPathA = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                externalPathA.setAttribute('fill', 'currentColor');
                externalPathA.setAttribute('d', 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7z');
                const externalPathB = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                externalPathB.setAttribute('fill', 'currentColor');
                externalPathB.setAttribute('d', 'M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z');
                externalIcon.appendChild(externalPathA);
                externalIcon.appendChild(externalPathB);

                externalTag.appendChild(externalIcon);
                externalBadgeWrap.appendChild(externalTag);
                tile.appendChild(externalBadgeWrap);
              }

              if (IN_PROGRESS_PROJECTS.has(proj)) {
                const progressBadgeWrap = document.createElement('div');
                progressBadgeWrap.className = 'tile-progress-badge';

                const progressTag = document.createElement('div');
                progressTag.className = 'tile-tag tile-tag--progress';
                progressTag.setAttribute('aria-label', 'Project currently building');

                const rocket = document.createElement('img');
                rocket.className = 'tile-tag__rocket';
                rocket.src = './assets/rocketgame/costumes/rocket/rocket-idle/rocket-idle-01.png';
                rocket.alt = '';
                rocket.setAttribute('aria-hidden', 'true');

                const label = document.createElement('span');
                label.textContent = 'Building';

                progressTag.appendChild(rocket);
                progressTag.appendChild(label);
                progressBadgeWrap.appendChild(progressTag);
                tile.appendChild(progressBadgeWrap);
              }
            } catch (_) { /* ignore flag errors */ }
          });

          try {
            const getProgressRockets = () => Array.from(document.querySelectorAll('.tile-progress-badge .tile-tag__rocket, .tile-hover-overlay__title-rocket'));
            if (getProgressRockets().length) {
              const rocketFrames = [
                './assets/rocketgame/costumes/rocket/rocket-idle/rocket-idle-01.png',
                './assets/rocketgame/costumes/rocket/rocket-idle/rocket-idle-02.png',
                './assets/rocketgame/costumes/rocket/rocket-idle/rocket-idle-03.png',
              ];
              if (window.__homeProgressRocketInterval) {
                window.clearInterval(window.__homeProgressRocketInterval);
              }
              let frameIndex = 0;
              window.__homeProgressRocketInterval = window.setInterval(() => {
                frameIndex = (frameIndex + 1) % rocketFrames.length;
                const progressRockets = getProgressRockets();
                progressRockets.forEach((rocket) => {
                  rocket.src = rocketFrames[frameIndex];
                });
              }, 140);
            }
          } catch (_) { /* ignore progress rocket animation errors */ }
        } catch (_) { /* ignore tag injection errors */ }

        try {
          const categoryLabel = (cat) => {
            const c = String(cat || '').toLowerCase();
            if (c === 'ux') return 'Product';
            if (c === 'branding') return 'Branding';
            return c ? c : '';
          };

          const arrowSvg = '<svg class="tile-hover-overlay__arrow-icon" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M7 17L17 7"></path><path d="M10 7h7v7"></path></svg>';

          tiles.forEach((tile) => {
            try {
              if (!tile || tile.querySelector('.tile-hover-overlay')) return;
              const proj = (tile.dataset && tile.dataset.project) ? String(tile.dataset.project || '') : '';
              const projKey = String(proj || '').toLowerCase();
              const title = (tile.dataset && tile.dataset.title) ? String(tile.dataset.title || '') : '';
              const industry = (tile.dataset && tile.dataset.industry) ? String(tile.dataset.industry || '') : '';
              const desc = (tile.dataset && tile.dataset.desc) ? String(tile.dataset.desc || '') : '';
              const cat = categoryLabel(tile.dataset ? tile.dataset.category : '');

              const overlay = document.createElement('div');
              overlay.className = 'tile-hover-overlay';
              overlay.setAttribute('aria-hidden', 'true');

              const header = document.createElement('div');
              header.className = 'tile-hover-overlay__header';

              const h = document.createElement('div');
              h.className = 'tile-hover-overlay__title';
              if (IN_PROGRESS_PROJECTS.has(projKey)) {
                const titleRocket = document.createElement('img');
                titleRocket.className = 'tile-hover-overlay__title-rocket';
                titleRocket.src = './assets/rocketgame/costumes/rocket/rocket-idle/rocket-idle-01.png';
                titleRocket.alt = '';
                titleRocket.setAttribute('aria-hidden', 'true');
                h.appendChild(titleRocket);
              }
              if (OPEN_IN_NEW_PROJECTS.has(projKey) && !NON_CLICKABLE_PROJECTS.has(projKey)) {
                const titleExternal = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                titleExternal.setAttribute('class', 'tile-hover-overlay__title-external');
                titleExternal.setAttribute('aria-hidden', 'true');
                titleExternal.setAttribute('viewBox', '0 0 24 24');
                titleExternal.setAttribute('focusable', 'false');

                const titleExternalPathA = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                titleExternalPathA.setAttribute('fill', 'currentColor');
                titleExternalPathA.setAttribute('d', 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7z');
                const titleExternalPathB = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                titleExternalPathB.setAttribute('fill', 'currentColor');
                titleExternalPathB.setAttribute('d', 'M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z');
                titleExternal.appendChild(titleExternalPathA);
                titleExternal.appendChild(titleExternalPathB);
                h.appendChild(titleExternal);
              }
              if (projKey === 'toyota' || projKey === 'relias') {
                const titleLock = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                titleLock.setAttribute('class', 'tile-hover-overlay__title-lock');
                titleLock.setAttribute('aria-hidden', 'true');
                titleLock.setAttribute('viewBox', '0 0 24 24');
                titleLock.setAttribute('width', '14');
                titleLock.setAttribute('height', '14');
                titleLock.setAttribute('fill', 'currentColor');
                titleLock.setAttribute('focusable', 'false');
                const titleLockPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                titleLockPath.setAttribute('d', 'M17 9h-1V7c0-2.76-2.24-5-5-5S6 4.24 6 7v2H5c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2m-6 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2m3.1-8H7.9V7c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1z');
                titleLock.appendChild(titleLockPath);
                h.appendChild(titleLock);
              }

              const hText = document.createElement('span');
              hText.textContent = IN_PROGRESS_PROJECTS.has(projKey) ? 'In Progress...' : (title || proj);
              h.appendChild(hText);
              header.appendChild(h);

              if (!NON_CLICKABLE_PROJECTS.has(projKey) && !OPEN_IN_NEW_PROJECTS.has(projKey)) {
                const arrow = document.createElement('div');
                arrow.className = 'tile-hover-overlay__arrow';
                arrow.innerHTML = arrowSvg;
                header.appendChild(arrow);
              }

              const body = document.createElement('div');
              body.className = 'tile-hover-overlay__body';

              if (desc) {
                const descEl = document.createElement('div');
                descEl.className = 'tile-hover-overlay__desc';
                descEl.textContent = desc;
                body.appendChild(descEl);
              }

              const tags = document.createElement('div');
              tags.className = 'tile-hover-overlay__tags';
              const role = (tile.dataset && tile.dataset.role) ? String(tile.dataset.role || '') : '';

              const tagParts = [];
              const roleValue = role || cat;
              if (roleValue) tagParts.push(roleValue);
              if (industry) tagParts.push(industry);

              tagParts.forEach((txt) => {
                const t = document.createElement('div');
                t.className = 'tile-hover-overlay__tag';
                t.textContent = txt;
                tags.appendChild(t);
              });
              if (tags.childNodes && tags.childNodes.length) body.appendChild(tags);

              overlay.appendChild(header);
              overlay.appendChild(body);
              tile.appendChild(overlay);
            } catch (_) { /* ignore overlay errors */ }
          });
        } catch (_) {}
        // Optional: home tile 4 video (Orion) and tile 7 video (Kinti)
        let orionVideo = null;
        let kintiVideo = null;
        let nestbankVideo = null;
        let logofolioVideo = null;
        let skilldexVideo = null;
        let reliasVideo = null;

        // Make tiles focusable and clickable
        tiles.forEach((tile) => {
          tile.setAttribute('tabindex', '0');
          tile.setAttribute('role', 'button');
          tile.setAttribute('aria-pressed', 'false');
        });

        // Subtle image tilt for thumbnail media on hover-capable devices
        try {
          const supportsHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
          if (supportsHover) {
            const MAX_TILT = 5;
            const updateTileTilt = (tile, clientX, clientY) => {
              if (!tile) return;
              const rect = tile.getBoundingClientRect();
              if (!rect.width || !rect.height) return;
              const x = (clientX - rect.left) / rect.width;
              const y = (clientY - rect.top) / rect.height;
              const dx = (x - 0.5) * 2;
              const dy = (y - 0.5) * 2;
              tile.style.setProperty('--media-tilt-y', (dx * MAX_TILT).toFixed(2) + 'deg');
              tile.style.setProperty('--media-tilt-x', (-dy * MAX_TILT).toFixed(2) + 'deg');
            };
            const resetTileTilt = (tile) => {
              if (!tile) return;
              tile.style.setProperty('--media-tilt-x', '0deg');
              tile.style.setProperty('--media-tilt-y', '0deg');
            };

            tiles.forEach((tile) => {
              try {
                tile.addEventListener('mousemove', (e) => updateTileTilt(tile, e.clientX, e.clientY));
                tile.addEventListener('mouseleave', () => resetTileTilt(tile));
                tile.addEventListener('blur', () => resetTileTilt(tile));
              } catch (_) { /* ignore thumbnail tilt handlers */ }
            });
          }
        } catch (_) { /* ignore thumbnail tilt setup */ }

        try {
          const prewarmed = new Set();
          const projectToUrl = {
            nestbank: './nestbank.html',
            toyota: './toyota.html',
            relias: './relias.html',
            orion: './ql.html',
            tom: './tom.html',
            logofolio: './logofolio.html',
          };
          const projectToFiles = {
            nestbank: (typeof NESTBANK_FILES !== 'undefined' ? NESTBANK_FILES : null),
            toyota: (typeof TRD_FILES !== 'undefined' ? TRD_FILES : null),
            relias: (typeof RELIAS_FILES !== 'undefined' ? RELIAS_FILES : null),
            orion: (typeof QL_FILES !== 'undefined' ? QL_FILES : null),
            tom: (typeof TOM_FILES !== 'undefined' ? TOM_FILES : null),
          };

          const prewarmProject = (proj) => {
            if (!proj || prewarmed.has(proj)) return;
            prewarmed.add(proj);

            const url = projectToUrl[proj];
            if (url) {
              try {
                fetch(url, { credentials: 'same-origin' })
                  .then((r) => { try { return r.text(); } catch (_) { return null; } })
                  .catch(() => {});
              } catch (_) {}
            }

            const files = projectToFiles[proj];
            if (files && Array.isArray(files)) {
              try {
                files
                  .filter((src) => typeof src === 'string' && !/\.mp4(\?|$)/i.test(src))
                  .slice(0, 3)
                  .forEach((src) => {
                    try {
                      const img = new Image();
                      img.decoding = 'async';
                      img.src = withDevAssetBust(src);
                    } catch (_) {}
                  });
              } catch (_) {}
            }
          };

          const schedulePrewarm = (proj) => {
            try {
              const run = () => prewarmProject(proj);
              if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 800 });
              else setTimeout(run, 0);
            } catch (_) {}
          };

          tiles.forEach((tile) => {
            const proj = (tile && tile.dataset && tile.dataset.project) ? String(tile.dataset.project || '').toLowerCase() : '';
            if (!proj) return;
            if (!projectToUrl[proj] && !projectToFiles[proj]) return;
            try { tile.addEventListener('mouseenter', () => schedulePrewarm(proj)); } catch (_) {}
            try { tile.addEventListener('focusin', () => schedulePrewarm(proj)); } catch (_) {}
            try { tile.addEventListener('touchstart', () => schedulePrewarm(proj), { passive: true }); } catch (_) {}
          });
        } catch (_) {}

        try {
          let aboutPrewarmed = false;
          const prewarmAbout = () => {
            if (aboutPrewarmed) return;
            aboutPrewarmed = true;
            try {
              fetch('./about.html', { credentials: 'same-origin' })
                .then((r) => { try { return r.text(); } catch (_) { return null; } })
                .catch(() => {});
            } catch (_) {}
            try {
              [
                './assets/me.jpg',
                './assets/profile-photo.jpg',
                './assets/brand-logos/toyota.png',
                './assets/brand-logos/relias.png',
              ].forEach((src) => {
                try {
                  const img = new Image();
                  img.decoding = 'async';
                  img.src = src;
                } catch (_) {}
              });
            } catch (_) {}
          };
          const scheduleAbout = () => {
            try {
              if (window.requestIdleCallback) window.requestIdleCallback(prewarmAbout, { timeout: 800 });
              else setTimeout(prewarmAbout, 0);
            } catch (_) {}
          };
          const aboutLinks = Array.from(document.querySelectorAll('a[href*="about.html"]'));
          aboutLinks.forEach((a) => {
            try { a.addEventListener('mouseenter', scheduleAbout); } catch (_) {}
            try { a.addEventListener('focusin', scheduleAbout); } catch (_) {}
            try { a.addEventListener('touchstart', scheduleAbout, { passive: true }); } catch (_) {}
          });
        } catch (_) {}

        // Intro animation: slide tiles in from the left with a small stagger
        try {
          const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          const footer = document.querySelector('.site-footer');
          if (footer) {
            footer.classList.remove('scroll-reveal-visible', 'scroll-reveal-hidden');
            footer.classList.add(prefersReduced ? 'scroll-reveal-visible' : 'scroll-reveal-hidden');
          }
          if (!prefersReduced) {
            const orderedTiles = sortByCssOrder(tiles);
            orderedTiles.forEach((tile) => {
              tile.classList.remove('intro-visible');
              tile.classList.add('intro-hidden');
            });

            let revealIndex = 0;
            const revealTile = (tile) => {
              if (!tile || tile.__introRevealed) return;
              tile.__introRevealed = true;
              const delay = Math.min(120, revealIndex * 28);
              revealIndex += 1;
              setTimeout(() => {
                try {
                  tile.classList.remove('intro-hidden');
                  tile.classList.add('intro-visible');
                } catch (_) { /* ignore tile intro reveal errors */ }
              }, delay);
            };

            if ('IntersectionObserver' in window) {
              const tileObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach((entry) => {
                  if (!entry.isIntersecting) return;
                  revealTile(entry.target);
                  observer.unobserve(entry.target);
                });
              }, { threshold: 0.01, rootMargin: '0px 0px 18% 0px' });

              const viewportHeight = Math.max(window.innerHeight || 0, 1);
              orderedTiles.forEach((tile) => {
                try {
                  const rect = tile.getBoundingClientRect();
                  const inInitialView = rect.top < viewportHeight * 0.92 && rect.bottom > 0;
                  if (inInitialView) {
                    revealTile(tile);
                    return;
                  }
                } catch (_) { /* ignore initial viewport checks */ }
                tileObserver.observe(tile);
              });

              if (footer) {
                const footerObserver = new IntersectionObserver((entries, observer) => {
                  if (!entries.some((entry) => entry.isIntersecting)) return;
                  try {
                    footer.classList.remove('scroll-reveal-hidden');
                    footer.classList.add('scroll-reveal-visible');
                  } catch (_) { /* ignore footer intro errors */ }
                  observer.disconnect();
                }, { threshold: 0.01, rootMargin: '0px 0px 20% 0px' });
                footerObserver.observe(footer);
              }
            } else {
              const BASE_DELAY = 200;
              const STEP = 70;
              orderedTiles.forEach((tile, i) => {
                setTimeout(() => {
                  tile.classList.remove('intro-hidden');
                  tile.classList.add('intro-visible');
                }, BASE_DELAY + i * STEP);
              });
              if (footer) {
                setTimeout(() => {
                  try {
                    footer.classList.remove('scroll-reveal-hidden');
                    footer.classList.add('scroll-reveal-visible');
                  } catch (_) { /* ignore footer intro errors */ }
                }, BASE_DELAY + orderedTiles.length * STEP);
              }
            }
          } else {
            if (footer) {
              footer.classList.remove('scroll-reveal-hidden');
              footer.classList.add('scroll-reveal-visible');
            }
          }
        } catch (_) { /* ignore animation errors */ }
        // Lazy-init the NestBank video and attach to the NestBank tile (by data-project)
        function ensureNestbankVideo() {
          if (nestbankVideo) return;
          const t = getTileByProject('nestbank');
          if (!t) return;
          const v = document.createElement('video');
          v.src = './assets/thumbnails/nestbank-thumbnail-video.mp4';
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          try { v.preload = 'auto'; } catch (_) {}
          v.autoplay = true;
          v.setAttribute('aria-hidden', 'true');
          const onMeta = () => {
            try { if (v.currentTime === 0) v.currentTime = 0.01; } catch (_) {}
            try { v.play().catch(() => {}); } catch (_) {}
          };
          v.addEventListener('loadedmetadata', onMeta, { once: true });
          // Do NOT clear innerHTML; preserve tags/overlays
          try {
            // Insert video as the first child so it sits beneath overlays (z-index handles layers)
            t.insertBefore(v, t.firstChild || null);
          } catch (_) {
            // Fallback: append if insertBefore fails
            try { t.appendChild(v); } catch (_) {}
          }
          nestbankVideo = v;
          try { v.play().catch(() => {}); } catch (_) {}
        }

        // Lazy-init the Logofolio video and attach to the Logofolio tile (by data-project)
        function ensureLogofolioVideo() {
          if (logofolioVideo) return;
          const t = getTileByProject('logofolio');
          if (!t) return;
          const v = document.createElement('video');
          v.src = './assets/thumbnails/logofolio-video.mp4';
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          try { v.preload = 'auto'; } catch (_) {}
          v.autoplay = true;
          v.setAttribute('aria-hidden', 'true');
          const onMeta = () => {
            try { if (v.currentTime === 0) v.currentTime = 0.01; } catch (_) {}
            try { v.play().catch(() => {}); } catch (_) {}
          };
          v.addEventListener('loadedmetadata', onMeta, { once: true });
          // Do NOT clear innerHTML; preserve tags/overlays
          try {
            t.insertBefore(v, t.firstChild || null);
          } catch (_) {
            try { t.appendChild(v); } catch (_) {}
          }
          logofolioVideo = v;
          try { v.play().catch(() => {}); } catch (_) {}
        }

        // Lazy-init the Orion video and attach to the Orion tile (by data-project)
        function ensureOrionVideo() {
          return;
        }

        // Lazy-init the Kinti video and attach to the Kinti tile (by data-project)
        function ensureKintiVideo() {
          if (kintiVideo) return;
          const t = getTileByProject('kinti');
          if (!t) return;
          const v = document.createElement('video');
          v.src = './assets/thumbnails/kinti.mp4';
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          try { v.preload = 'auto'; } catch (_) {}
          v.autoplay = true;
          v.setAttribute('aria-hidden', 'true');
          const onMeta = () => {
            try { if (v.currentTime === 0) v.currentTime = 0.01; } catch (_) {}
            try { v.play().catch(() => {}); } catch (_) {}
          };
          v.addEventListener('loadedmetadata', onMeta, { once: true });
          // Do NOT clear innerHTML; preserve tags/overlays
          try {
            t.insertBefore(v, t.firstChild || null);
          } catch (_) {
            try { t.appendChild(v); } catch (_) {}
          }
          kintiVideo = v;
          // Attempt immediate play in case metadata already available
          try { v.play().catch(() => {}); } catch (_) {}
        }
        
        // Lazy-init the Skilldex video and attach to the Skilldex tile (by data-project)
        function ensureSkilldexVideo() {
          if (skilldexVideo) return;
          const t = getTileByProject('skilldex');
          if (!t) return;
          const v = document.createElement('video');
          v.src = './assets/thumbnails/skilldex.mp4';
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          try { v.preload = 'auto'; } catch (_) {}
          v.autoplay = true;
          v.setAttribute('aria-hidden', 'true');
          const onMeta = () => {
            try { if (v.currentTime === 0) v.currentTime = 0.01; } catch (_) {}
            try { v.play().catch(() => {}); } catch (_) {}
          };
          v.addEventListener('loadedmetadata', onMeta, { once: true });
          // Do NOT clear innerHTML; preserve tags/overlays
          try {
            t.insertBefore(v, t.firstChild || null);
          } catch (_) {
            try { t.appendChild(v); } catch (_) {}
          }
          skilldexVideo = v;
          // Attempt immediate play in case metadata already available
          try { v.play().catch(() => {}); } catch (_) {}
        }
        
        // Lazy-init the Relias image and attach to the Relias tile (by data-project)
        function ensureReliasVideo() {
          if (reliasVideo) return;
          const t = getTileByProject('relias');
          if (!t) return;

          // Relias is rendered via CSS thumbnail plate; keep a truthy ref to prevent re-init
          reliasVideo = true;
        }

        const selectTile = (tile) => {
          // Clear any hover-proxy state when a selection occurs
          tiles.forEach((t) => t.classList.remove('hover-proxy'));
          tiles.forEach((t) => t.classList.remove('tap-pressed'));
          tiles.forEach((t) => {
            if (t === tile) {
              t.classList.add('selected');
              t.setAttribute('aria-pressed', 'true');
            } else {
              t.classList.remove('selected');
              t.setAttribute('aria-pressed', 'false');
            }
          });
          // Background theme is now fixed; do not toggle body classes on selection
          try {
            // Ensure videos exist and play continuously
            try { if (!nestbankVideo) ensureNestbankVideo(); } catch (_) {}
            try { if (nestbankVideo && nestbankVideo.paused) nestbankVideo.play().catch(() => {}); } catch (_) {}
            try { if (!logofolioVideo) ensureLogofolioVideo(); } catch (_) {}
            try { if (logofolioVideo && logofolioVideo.paused) logofolioVideo.play().catch(() => {}); } catch (_) {}
            // Ensure videos exist and play continuously
            try { if (!orionVideo) ensureOrionVideo(); } catch (_) {}
            try { if (orionVideo && orionVideo.paused) orionVideo.play().catch(() => {}); } catch (_) {}
            try { if (!kintiVideo) ensureKintiVideo(); } catch (_) {}
            try { if (kintiVideo && kintiVideo.paused) kintiVideo.play().catch(() => {}); } catch (_) {}
            try { if (!reliasVideo) ensureReliasVideo(); } catch (_) {}
          } catch (_) { /* ignore */ }
        };
        const clearSelectedTiles = () => {
          tiles.forEach((t) => {
            t.classList.remove('selected');
            t.setAttribute('aria-pressed', 'false');
          });
        };
        // Make selection callable from other modules (e.g., filtering) and init guard flag
        try {
          window.__homeSelectTile = selectTile;
          if (typeof window.__autoSelecting === 'undefined') window.__autoSelecting = false;
        } catch (_) { /* ignore */ }

        // On the <=600px stacked layout, promote exactly one tile at a time
        // based on which card has crossed into the top half of the viewport.
        try {
          const ENABLE_SMALL_SCROLL_AUTO_SELECT = false;
          const isSmallHomeStack = () => {
            try { return window.matchMedia && window.matchMedia('(max-width: 600px)').matches; } catch (_) { return false; }
          };

          const getVisibleScrollableTiles = () => tiles.filter((tile) => {
            if (!tile || !tile.isConnected) return false;
            if (tile.classList.contains('filtered-out') || tile.classList.contains('filter-hiding')) return false;
            const style = window.getComputedStyle(tile);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            return true;
          });

          const getScrollActiveTile = () => {
            const visibleTiles = getVisibleScrollableTiles();
            if (!visibleTiles.length) return null;

            const viewportHeight = Math.max(window.innerHeight || 0, 1);
            const topHalfBottom = viewportHeight * 0.5;
            let best = null;
            let bestRatio = 0;
            let bestTop = -Infinity;
            let bestOverall = null;
            let bestOverallRatio = -1;
            let bestOverallTop = -Infinity;
            let firstVisible = null;

            for (const tile of visibleTiles) {
              const rect = tile.getBoundingClientRect();
              if (rect.bottom <= 0 || rect.top >= viewportHeight) continue;
              if (!firstVisible) firstVisible = tile;
              const overlapTop = Math.max(rect.top, 0);
              const overlapBottom = Math.min(rect.bottom, topHalfBottom);
              const overlap = overlapBottom - overlapTop;
              const ratio = overlap > 0 ? (overlap / Math.max(rect.height, 1)) : 0;

              if (ratio > bestOverallRatio || (ratio === bestOverallRatio && rect.top > bestOverallTop)) {
                bestOverall = tile;
                bestOverallRatio = ratio;
                bestOverallTop = rect.top;
              }

              if (ratio >= 0.35 && (ratio > bestRatio || (ratio === bestRatio && rect.top > bestTop))) {
                best = tile;
                bestRatio = ratio;
                bestTop = rect.top;
              }
            }

            return best || bestOverall || firstVisible || visibleTiles[0] || null;
          };

          let scrollSelectionRaf = 0;
          const applyScrollDrivenSelection = () => {
            scrollSelectionRaf = 0;
            if (!ENABLE_SMALL_SCROLL_AUTO_SELECT) return;
            if (!isSmallHomeStack()) return;
            if ((window.scrollY || 0) <= 8) {
              clearSelectedTiles();
              return;
            }
            const nextTile = getScrollActiveTile();
            if (!nextTile || nextTile.classList.contains('selected')) return;
            selectTile(nextTile);
          };

          const requestScrollDrivenSelection = () => {
            if (!ENABLE_SMALL_SCROLL_AUTO_SELECT) return;
            if (!isSmallHomeStack()) return;
            if (scrollSelectionRaf) return;
            scrollSelectionRaf = window.requestAnimationFrame(applyScrollDrivenSelection);
          };

          try { window.__homeSyncScrollTile = requestScrollDrivenSelection; } catch (_) { /* ignore */ }
          if (ENABLE_SMALL_SCROLL_AUTO_SELECT) {
            window.addEventListener('scroll', requestScrollDrivenSelection, { passive: true });
            window.addEventListener('resize', requestScrollDrivenSelection, { passive: true });
            window.addEventListener('orientationchange', requestScrollDrivenSelection, { passive: true });
            requestAnimationFrame(applyScrollDrivenSelection);
          }
        } catch (_) { /* ignore scroll-selected tile errors */ }

        // Helper: trigger home overlay, then navigate to a URL
        function navigateWithOverlay(url) {
          try { sessionStorage.setItem('nb_from_home', '1'); } catch (_) {}
          const overlay = document.querySelector('.intro-overlay');
          if (!overlay) { window.location.href = url; return; }
          // start slide-in
          try { overlay.classList.add('enter'); } catch (_) {}
          let navigated = false;
          const go = () => {
            if (navigated) return; navigated = true;
            window.location.href = url;
          };
          // prefer transition end
          const onEnd = (e) => {
            try { overlay.removeEventListener('transitionend', onEnd); } catch (_) {}
            go();
          };
          try { overlay.addEventListener('transitionend', onEnd); } catch (_) {}
          // fallback timeout if transitionend not fired
          setTimeout(go, 500);
        }

        // Click/keyboard to navigate immediately to the relevant page (no select/expand state)
        const isSmallHomeBreakpoint = () => {
          try { return window.matchMedia && window.matchMedia('(max-width: 600px)').matches; } catch (_) { return false; }
        };

        const navigateProject = (proj) => {
          if (proj === 'nestbank') { navigateWithOverlay('./nestbank.html'); return; }
          if (proj === 'toyota') { navigateWithOverlay('./toyota.html'); return; }
          if (proj === 'relias') { navigateWithOverlay('./relias.html'); return; }
          if (proj === 'orion') { navigateWithOverlay('./ql.html'); return; }
          if (proj === 'medigo') { try { window.open('https://www.behance.net/gallery/179623015/Medigo-Physiotherapy-App-UXUI-Design', '_blank', 'noopener,noreferrer'); } catch (_) {} return; }
          if (proj === 'logofolio') { window.location.href = './logofolio.html'; return; }
          if (proj === 'tom') { navigateWithOverlay('./tom.html'); return; }
          if (proj === 'apendito') { try { window.open('https://www.behance.net/gallery/227407301/Aprendito-Brand-Identity', '_blank', 'noopener,noreferrer'); } catch (_) {} return; }
          if (proj === 'kinti') { try { window.open('https://www.behance.net/gallery/107789813/Kinti-Brand-Identity', '_blank', 'noopener,noreferrer'); } catch (_) {} return; }
          if (proj === 'dinobytes') { try { window.open('https://www.behance.net/gallery/227240103/DinoBytes-Brand-Identity', '_blank', 'noopener,noreferrer'); } catch (_) {} return; }
          if (proj === 'kakaoala') { try { window.open('https://www.behance.net/gallery/108371211/Kakaoala-Brand-Identity', '_blank', 'noopener,noreferrer'); } catch (_) {} return; }
          if (proj === 'skilldex') { try { window.open('https://www.behance.net/gallery/120932085/Skilldex-UIUX-Branding', '_blank', 'noopener,noreferrer'); } catch (_) {} return; }
          window.location.href = './password.html';
        };

        const triggerBlockedTileShake = (tile) => {
          if (!tile) return;
          try {
            tile.classList.remove('is-blocked-feedback');
            tile.classList.remove('is-blocked-shake');
            void tile.offsetWidth;
            tile.classList.add('is-blocked-feedback');
            tile.classList.add('is-blocked-shake');
            window.setTimeout(() => {
              try { tile.classList.remove('is-blocked-shake'); } catch (_) {}
              try { tile.classList.remove('is-blocked-feedback'); } catch (_) {}
            }, 420);
          } catch (_) {}
        };

        const handleTileClickNavigation = (tile, proj) => {
          if (NON_CLICKABLE_PROJECTS.has(proj)) {
            triggerBlockedTileShake(tile);
            return;
          }

          const isExternalOpen = OPEN_IN_NEW_PROJECTS.has(proj);
          if (!isSmallHomeBreakpoint() || isExternalOpen) {
            navigateProject(proj);
            return;
          }

          try { selectTile(tile); } catch (_) {}
          setTimeout(() => {
            try { tile.classList.add('tap-pressed'); } catch (_) {}
          }, 120);
          setTimeout(() => {
            navigateProject(proj);
          }, 240);
        };

        tiles.forEach((tile, idx) => {
          tile.addEventListener('click', () => {
            const proj = (tile && tile.dataset && tile.dataset.project) ? tile.dataset.project.toLowerCase() : '';
            handleTileClickNavigation(tile, proj);
          });

          tile.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const proj = (tile && tile.dataset && tile.dataset.project) ? tile.dataset.project.toLowerCase() : '';
              handleTileClickNavigation(tile, proj);
            }
          });
        });
        // Initialize video elements
        try { ensureNestbankVideo(); } catch (_) {}
        try { ensureLogofolioVideo(); } catch (_) {}
        try { ensureOrionVideo(); } catch (_) {}
        try { ensureKintiVideo(); } catch (_) {}
        try { ensureSkilldexVideo(); } catch (_) {}
        try { ensureReliasVideo(); } catch (_) {}

        // Hover-proxy: when cursor is in the gaps between tiles, slightly expand the nearest tile
        try {
          const grid = document.querySelector('.tile-grid');
          if (grid) {
            // If layout is CSS grid, skip hover-proxy entirely
            try {
              const isGrid = (window.getComputedStyle(grid).display || '').toLowerCase().includes('grid');
              if (isGrid) throw new Error('skip-hover-proxy');
            } catch (e) {
              if (String(e && e.message || '').includes('skip-hover-proxy')) {
                // Do nothing when using grid layout
              } else {
                // proceed below only if not grid
              }
            }
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
                // Ignore hidden or hiding tiles entirely
                if (t.classList && (t.classList.contains('filtered-out') || t.classList.contains('filter-hiding'))) continue;
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

            // Enable drag-to-scroll + wheel-to-horizontal on medium breakpoint (601px–1050px)
            try {
              const mm = window.matchMedia && window.matchMedia('(min-width: 601px) and (max-width: 1050px)');
              // If layout is CSS grid at this breakpoint, skip drag setup
              const isGridNow = (window.getComputedStyle(grid).display || '').toLowerCase().includes('grid');
              if (isGridNow) throw new Error('skip-drag');
              // Ensure carousel starts scrolled to the beginning on load within this breakpoint
              try { if (!mm || mm.matches) { grid.scrollLeft = 0; } } catch (_) {}
              let isDown = false;
              let startX = 0;
              let startScroll = 0;
              let moved = false;
              const DRAG_THRESHOLD = 8; // px before treating as drag

              const onPointerDown = (e) => {
                // Only primary button initiates drag
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                if (mm && !mm.matches) return; // only active in range
                isDown = true;
                moved = false;
                startX = e.clientX;
                startScroll = grid.scrollLeft;
                // do not preventDefault here to allow clicks
              };
              const onPointerMove = (e) => {
                if (!isDown) return;
                const dx = e.clientX - startX;
                if (!moved && Math.abs(dx) >= DRAG_THRESHOLD) {
                  moved = true;
                  grid.classList.add('dragging');
                  try { grid.setPointerCapture && grid.setPointerCapture(e.pointerId); } catch (_) {}
                }
                if (moved) {
                  grid.scrollLeft = startScroll - dx;
                }
              };
              const onPointerUp = (e) => {
                if (!isDown) return;
                isDown = false;
                grid.classList.remove('dragging');
                try { grid.releasePointerCapture && grid.releasePointerCapture(e.pointerId); } catch (_) {}
              };
              const onWheel = (e) => {
                // Convert vertical wheel to horizontal scroll within range
                if (mm && !mm.matches) return;
                if (!grid || grid.scrollWidth <= grid.clientWidth) return;
                // If vertical delta exists, scroll horizontally
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                  e.preventDefault();
                  grid.scrollLeft += e.deltaY;
                }
              };
              // Pointer events for robust drag
              grid.addEventListener('pointerdown', onPointerDown);
              window.addEventListener('pointermove', onPointerMove);
              window.addEventListener('pointerup', onPointerUp);
              window.addEventListener('pointercancel', onPointerUp);
              // Cancel clicks after a drag movement occurred
              grid.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
              // Wheel map: passive false to allow preventDefault
              grid.addEventListener('wheel', onWheel, { passive: false });
            } catch (_) { /* ignore drag setup errors */ }
          }
        } catch (_) { /* ignore hover-proxy errors */ }
      })();

      // Home: Tabs (All, Product, Branding)
      (function setupTabs() {
        const isHomePage = !!document.querySelector('.page[data-name="home page"]');
        if (!isHomePage) return;
        const tabList = document.querySelector('[role="tablist"]');
        if (!tabList) return;
        // Use user's existing nav-item styling for tabs
        const tabs = Array.from(tabList.querySelectorAll('.nav-item[role="tab"]'));
        if (!tabs.length) return;

        // Responsive label: at or below 475px, show 'UX' instead of 'Product' for the ux tab
        try {
          const uxTab = tabs.find((t) => t && t.dataset && t.dataset.tab === 'ux');
          const updateUxLabel = () => {
            if (!uxTab) return;
            const isNarrow = (window.innerWidth || 0) <= 475;
            const target = isNarrow ? 'UX' : 'Product';
            // Only touch text when it actually changes to avoid unnecessary layout work
            if (uxTab.textContent !== target) {
              uxTab.textContent = target;
            }
          };
          updateUxLabel();
          window.addEventListener('resize', updateUxLabel);
          window.addEventListener('orientationchange', updateUxLabel);
        } catch (_) { /* ignore responsive label errors */ }

        // Responsive label: at or below 630px, show 'Brand' instead of 'Branding' for the branding tab
        try {
          const brandingTab = tabs.find((t) => t && t.dataset && t.dataset.tab === 'branding');
          const updateBrandingLabel = () => {
            if (!brandingTab) return;
            const isNarrow = (window.innerWidth || 0) <= 630;
            const fullLabel = brandingTab.querySelector('.nav-item__label-full');
            const compactLabel = brandingTab.querySelector('.nav-item__label-compact');

            if (fullLabel && compactLabel) {
              if (fullLabel.textContent !== 'Branding') fullLabel.textContent = 'Branding';
              if (compactLabel.textContent !== 'Brand') compactLabel.textContent = 'Brand';
              return;
            }

            const target = isNarrow ? 'Brand' : 'Branding';
            if (brandingTab.textContent !== target) {
              brandingTab.textContent = target;
            }
          };
          updateBrandingLabel();
          window.addEventListener('resize', updateBrandingLabel);
          window.addEventListener('orientationchange', updateBrandingLabel);
        } catch (_) { /* ignore responsive label errors */ }

        // Helper: filter tiles by category with smooth transitions and maintain selection
        let hasRunInitialFilter = false;
        function filterTiles(category) {
          const tiles = Array.from(document.querySelectorAll('.tile-grid .tile'));
          const grid = document.querySelector('.tile-grid');
          if (!tiles.length) return;
          const want = (category || 'all').toLowerCase();
          const getCategories = (tile) => {
            const raw = (tile && tile.dataset && tile.dataset.category) ? String(tile.dataset.category || '').toLowerCase() : '';
            return raw.split(/\s+/).filter(Boolean);
          };

          const isInitialPass = !hasRunInitialFilter;

          // Full reset for all tiles; rely on CSS grid class to hide non-matching
          tiles.forEach((t) => {
            t.classList.remove('filtered-out');
            if (!isInitialPass) {
              t.classList.remove('intro-hidden');
              t.classList.add('intro-visible');
            }
            try { t.style.display = 'block'; } catch (_) {}
            try { t.setAttribute('aria-hidden', 'false'); } catch (_) {}
            try { t.tabIndex = 0; } catch (_) {}
          });

          // Clear any hover proxy from previous state
          try { tiles.forEach((t) => t.classList.remove('hover-proxy')); } catch (_) {}

          // Re-trigger intro animation for the currently visible set based on desired category
          // (skip on first pass so below-fold tiles can reveal on scroll enter)
          try {
            const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const visibleNow = tiles.filter((t) => {
              const categories = getCategories(t);
              return want === 'all' || categories.includes(want);
            });
            if (isInitialPass) {
              // Preserve observer-driven intro state from setupTiles.
            } else if (prefersReduced) {
              visibleNow.forEach((t) => { t.classList.remove('intro-hidden'); t.classList.add('intro-visible'); });
            } else {
              visibleNow.forEach((t) => { t.classList.remove('intro-visible'); t.classList.add('intro-hidden'); });
              const BASE_DELAY = 100, STEP = 60;
              requestAnimationFrame(() => {
                const ordered = (typeof sortByCssOrder === 'function') ? sortByCssOrder(visibleNow) : visibleNow;
                ordered.forEach((t, i) => setTimeout(() => { t.classList.remove('intro-hidden'); t.classList.add('intro-visible'); }, BASE_DELAY + i * STEP));
              });
            }
          } catch (_) { /* ignore animation errors */ }

          hasRunInitialFilter = true;

          // Auto-select the first visible tile in the requested category
          requestAnimationFrame(() => {
            const smallHome = !!(window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
            if (smallHome && (window.scrollY || 0) <= 8) {
              clearSelectedTiles();
              try { if (typeof window.__homeSyncScrollTile === 'function') window.__homeSyncScrollTile(); } catch (_) { /* ignore */ }
              return;
            }
            const firstVisible = tiles.find((t) => {
              const categories = getCategories(t);
              return want === 'all' || categories.includes(want);
            });
            if (!firstVisible) return;
            try {
              window.__autoSelecting = true;
              if (typeof window.__homeSelectTile === 'function') window.__homeSelectTile(firstVisible);
              else if (typeof selectTile === 'function') selectTile(firstVisible);
            } catch (_) { /* ignore */ }
            finally { setTimeout(() => { try { window.__autoSelecting = false; } catch (_) {} }, 0); }
            try { if (typeof window.__homeSyncScrollTile === 'function') window.__homeSyncScrollTile(); } catch (_) { /* ignore */ }
          });
        }

        const maybeScrollToTileGrid = (category) => {
          try {
            const want = String(category || 'all').toLowerCase();
            if (want !== 'all' && want !== 'ux' && want !== 'branding') return;
            const grid = document.querySelector('.tile-grid');
            if (!grid) return;
            const rect = grid.getBoundingClientRect();
            const targetTop = window.scrollY + rect.top - 120;
            window.scrollTo({
              top: Math.max(0, targetTop),
              behavior: 'smooth',
            });
          } catch (_) { /* ignore scroll errors */ }
        };

        const setActive = (idx) => {
          tabs.forEach((t, i) => {
            const active = i === idx;
            t.classList.toggle('active', active);
            t.setAttribute('aria-selected', active ? 'true' : 'false');
            t.tabIndex = active ? 0 : -1;
          });
          // Trigger filtering based on data-tab attribute of the active tab
          try {
            const tab = tabs[idx];
            const category = (tab && tab.dataset) ? tab.dataset.tab : 'all';
            // Reflect selected category on the grid for CSS targeting
            const grid = document.querySelector('.tile-grid');
            if (grid) {
              grid.classList.remove('filter-all', 'filter-ux', 'filter-branding');
              const cls = `filter-${String(category || 'all').toLowerCase()}`;
              grid.classList.add(cls);
              // Ensure grid itself is not hidden
              try { grid.setAttribute('aria-hidden', 'false'); } catch (_) {}
            }
            filterTiles(category);
          } catch (_) { /* ignore */ }
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
            maybeScrollToTileGrid((t && t.dataset) ? t.dataset.tab : 'all');
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
            maybeScrollToTileGrid((tabs[current] && tabs[current].dataset) ? tabs[current].dataset.tab : 'all');
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
          const rights = Array.from(split.querySelectorAll('.nav-right'));
          if (left) {
            left.setAttribute('tabindex', '0');
            left.setAttribute('role', 'link');
            left.addEventListener('click', () => { window.location.href = './index.html'; });
            left.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.href = './index.html'; } });
          }
          rights.forEach((right) => {
            // If there are explicit anchor links inside, do not bind a container-level click that would override them.
            const innerAnchors = Array.from(right.querySelectorAll('a.nav-item'));
            if (innerAnchors.length > 0) {
              right.setAttribute('role', 'group');
              right.removeAttribute('tabindex');
              return;
            }
            // Fallback behavior if a right card has no inner anchors
            right.setAttribute('tabindex', '0');
            right.setAttribute('role', 'link');
            const to = 'https://www.linkedin.com/in/josephgreenwood/';
            right.addEventListener('click', () => { try { window.open(to, '_blank', 'noopener,noreferrer'); } catch (_) { window.location.href = to; } });
            right.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); try { window.open(to, '_blank', 'noopener,noreferrer'); } catch (_) { window.location.href = to; } } });
          });
        } catch (_) {}
      })();

      // Home: Mobile menu overlay toggle
      (function setupMobileMenu() {
        try {
          const menuCard = document.querySelector('.nav-right.nav-menu a.nav-item');
          const overlay = document.querySelector('.mobile-menu-overlay');
          if (!menuCard || !overlay) return;
          const panel = overlay.querySelector('.mobile-menu-panel');

          const open = () => {
            overlay.classList.add('open');
            try { overlay.setAttribute('aria-hidden', 'false'); } catch (_) {}
            // Prevent background scroll while open
            try { document.body.style.overflow = 'hidden'; } catch (_) {}
          };
          const close = () => {
            overlay.classList.remove('open');
            try { overlay.setAttribute('aria-hidden', 'true'); } catch (_) {}
            try { document.body.style.overflow = ''; } catch (_) {}
          };

          menuCard.addEventListener('click', (e) => {
            e.preventDefault();
            if (overlay.classList.contains('open')) close(); else open();
          });
          // Click outside the panel closes
          overlay.addEventListener('click', (e) => {
            if (!panel) { close(); return; }
            if (!panel.contains(e.target)) close();
          });
          // Escape key closes
          window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('open')) close();
          });
        } catch (_) { /* ignore */ }
      })();

      // Logofolio page: infinite tiled logo canvas
      (function setupLogofolio() {
        try {
          const canvas = document.getElementById('logofolio-canvas');
          if (!canvas) return; // only on logofolio page

          const ctx = canvas.getContext('2d');
          const DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
          let vw = 0, vh = 0;
          function resize() {
            vw = window.innerWidth || document.documentElement.clientWidth || canvas.clientWidth || 0;
            vh = window.innerHeight || document.documentElement.clientHeight || canvas.clientHeight || 0;
            canvas.width = Math.max(1, Math.floor(vw * DPR));
            canvas.height = Math.max(1, Math.floor(vh * DPR));
            canvas.style.width = vw + 'px';
            canvas.style.height = vh + 'px';
          }
          resize();
          window.addEventListener('resize', resize);
          window.addEventListener('orientationchange', resize);

          // Manifest of logo assets (from ./assets/logofolio/)
          const LOGOS = [
            "./assets/logofolio/Union.svg",
            "./assets/logofolio/air-show-entertainment-icon.svg",
            "./assets/logofolio/aprendito-logo-2.svg",
            "./assets/logofolio/aprendito-logo-3.svg",
            "./assets/logofolio/aprendito-logo.svg",
            "./assets/logofolio/beez-kneez-icon.svg",
            "./assets/logofolio/bird-icon.svg",
            "./assets/logofolio/book-icon.svg",
            "./assets/logofolio/credence-designs-icon.svg",
            "./assets/logofolio/dinobytes-logo-2.svg",
            "./assets/logofolio/dinobytes-logo-3.svg",
            "./assets/logofolio/dinobytes-logo.svg",
            "./assets/logofolio/equa-icon.svg",
            "./assets/logofolio/familes-set-free-icon.svg",
            "./assets/logofolio/familes-set-free-secondary.svg",
            "./assets/logofolio/hanks-icon.svg",
            "./assets/logofolio/hanks-secondary.svg",
            "./assets/logofolio/jj-icon.svg",
            "./assets/logofolio/jj-secondary.svg",
            "./assets/logofolio/kakaoala-logo-2.svg",
            "./assets/logofolio/kakaoala-logo-3.svg",
            "./assets/logofolio/kakaoala-logo.svg",
            "./assets/logofolio/kinti-logo-2.svg",
            "./assets/logofolio/kinti-logo-3.svg",
            "./assets/logofolio/kinti-logo.svg",
            "./assets/logofolio/logo-svg-2.svg",
            "./assets/logofolio/logo-svg-3.svg",
            "./assets/logofolio/logo-svg.svg",
            "./assets/logofolio/medigo-icon.svg",
            "./assets/logofolio/mountbatten.svg",
            "./assets/logofolio/peacock.svg",
            "./assets/logofolio/queenfisher-farm-full.svg",
            "./assets/logofolio/queenfisher-farm-icon.svg",
            "./assets/logofolio/queenfisher-farm-secondary.svg",
            "./assets/logofolio/skilldex-icon.svg",
            "./assets/logofolio/squirrel-icon.svg",
            "./assets/logofolio/starwars.svg",
            "./assets/logofolio/swyndlr-icon.svg",
            "./assets/logofolio/tom-logo-2.svg",
            "./assets/logofolio/tom-logo-3.svg",
            "./assets/logofolio/tom-logo-4.svg",
            "./assets/logofolio/tom-logo-5.svg",
            "./assets/logofolio/tom-logo-6.svg",
            "./assets/logofolio/tom-logo.svg",
            "./assets/logofolio/version-1.svg",
            "./assets/logofolio/version-3.svg",
            "./assets/logofolio/wema-logo-2.svg",
            "./assets/logofolio/wema-logo-3.svg",
            "./assets/logofolio/wema-logo.svg",
          ];

          function loadImage(src) {
            return new Promise((resolve) => {
              const img = new Image();
              img.decoding = 'async';
              img.onload = () => resolve(img);
              img.onerror = () => resolve(null);
              img.src = src;
            });
          }

          let images = [];
          let ready = false;
          (async () => {
            const loaded = await Promise.all(LOGOS.map(loadImage));
            images = loaded.filter(Boolean);
            if (!images.length) return;
            initScene();
            // Default: start more zoomed out and centered
            try {
              scale = 0.6; // more zoomed out (bounded by MIN_SCALE)
              const visW = vw / scale;
              const visH = vh / scale;
              offsetX = (visW - baseW) / 2; // center on base tile
              offsetY = (visH - baseH) / 2 - 360; // start a bit further up
            } catch (_) {}
            ready = true;
            requestRender();
          })();

          // Scene setup: positions repeat over a base tile to create infinite tiling
          const rnd = (min, max) => min + Math.random() * (max - min);
          const randInt = (min, max) => Math.floor(rnd(min, max + 1));
          let baseW = 2200; // base tile width
          let baseH = 2200; // base tile height
          let sprites = [];
          // Fade-in state
          let fadeStart = 0;
          let fading = false;
          const FADE_MS = 900;
          const STAGGER_MS = 20;
          function startFade() {
            try { fadeStart = performance.now ? performance.now() : Date.now(); } catch (_) { fadeStart = Date.now(); }
            fading = true;
          }
          function initScene() {
            // Determine grid cell size and uniform logo size for even spacing
            const target = Math.max(1600, Math.min(3200, Math.hypot(vw, vh) * 1.6));
            const CELL = 220; // px per grid cell
            const UNIFORM_MAX = 120; // max dimension (width or height) for each logo
            const cols = Math.max(3, Math.floor(target / CELL));
            const rows = Math.max(3, Math.floor(target / CELL));
            baseW = cols * CELL;
            baseH = rows * CELL;

            const list = [];
            const JITTER = Math.max(4, Math.floor(CELL * 0.08)); // ~8% of cell size
            for (let j = 0; j < rows; j++) {
              const rowOffset = (j % 2 === 1) ? CELL / 2 : 0; // stagger every other row by half a cell
              for (let i = 0; i < cols; i++) {
                const img = images[(j * cols + i) % images.length];
                const iw = Math.max(1, img.naturalWidth || 0);
                const ih = Math.max(1, img.naturalHeight || 0);
                const ratio = (iw > 0 && ih > 0) ? (iw / ih) : 1;
                let w, h;
                if (ratio >= 1) {
                  w = UNIFORM_MAX;
                  h = Math.max(1, w / ratio);
                } else {
                  h = UNIFORM_MAX;
                  w = Math.max(1, h * ratio);
                }
                const cellX = i * CELL + rowOffset;
                const cellY = j * CELL;
                // Base centered position within the (possibly shifted) cell
                let x = cellX + (CELL - w) / 2;
                let y = cellY + (CELL - h) / 2;
                // Add small jitter for an organized-mess look
                x += (Math.random() * 2 - 1) * JITTER;
                y += (Math.random() * 2 - 1) * JITTER;
                const idx = j * cols + i;
                const delay = idx * STAGGER_MS + Math.random() * (STAGGER_MS * 0.5);
                list.push({ img, w, h, x, y, a: 1, delay });
              }
            }
            sprites = list;
            startFade();
          }
          window.addEventListener('resize', () => { if (ready) { initScene(); requestRender(); } });

          // Pan state
          let offsetX = 0, offsetY = 0; // world translation (px at scale=1)
          let velX = 0, velY = 0;
          let scale = 1; // world scale
          const MIN_SCALE = 0.4;
          const MAX_SCALE = 6.0;
          // Zoom inertia state
          let zoomVel = 0; // velocity in log-scale units per frame
          let zoomFocusX = 0; // last zoom focus (screen coords in CSS px)
          let zoomFocusY = 0;
          let animating = false;
          function zoomAt(screenX, screenY, factor) {
            const prevScale = scale;
            const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prevScale * factor));
            if (newScale === prevScale) return false;
            // Keep the world point under (screenX, screenY) stationary
            offsetX = offsetX + screenX * (1 / newScale - 1 / prevScale);
            offsetY = offsetY + screenY * (1 / newScale - 1 / prevScale);
            scale = newScale;
            return true;
          }
          function requestRender() {
            if (!animating) {
              animating = true;
              requestAnimationFrame(render);
            }
          }

          function render() {
            animating = false;
            if (!ready) return;
            // Apply inertia
            offsetX += velX;
            offsetY += velY;
            velX *= 0.94; velY *= 0.94;
            // Apply zoom inertia (convert log-velocity to multiplicative factor)
            if (Math.abs(zoomVel) > 0.00005) {
              const factor = Math.exp(zoomVel);
              if (zoomAt(zoomFocusX, zoomFocusY, factor)) {
                animating = true;
              }
              // decay zoom velocity
              zoomVel *= 0.88;
              // clamp very small values to zero
              if (Math.abs(zoomVel) < 1e-5) zoomVel = 0;
            }
            if (Math.abs(velX) > 0.02 || Math.abs(velY) > 0.02) animating = true;

            // Normalize offsets to avoid big numbers
            const ox = ((offsetX % baseW) + baseW) % baseW;
            const oy = ((offsetY % baseH) + baseH) % baseH;

            // Reset to device scale, clear, then apply world scale
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            ctx.clearRect(0, 0, vw, vh);
            ctx.save();
            ctx.scale(scale, scale);

            // Determine visible tile indices
            const visW = vw / scale;
            const visH = vh / scale;
            const margin = 200 / scale;
            const minX = -ox - margin;
            const minY = -oy - margin;
            const maxX = visW - ox + margin;
            const maxY = visH - oy + margin;
            const i0 = Math.floor(minX / baseW);
            const j0 = Math.floor(minY / baseH);
            const i1 = Math.floor(maxX / baseW);
            const j1 = Math.floor(maxY / baseH);

            let allFaded = true;
            const nowT = performance.now ? performance.now() : Date.now();
            const ease = (p) => (p <= 0 ? 0 : (p >= 1 ? 1 : (p * p * (3 - 2 * p))));
            for (let i = i0; i <= i1; i++) {
              for (let j = j0; j <= j1; j++) {
                const tx = i * baseW + ox;
                const ty = j * baseH + oy;
                for (let k = 0; k < sprites.length; k++) {
                  const s = sprites[k];
                  const x = tx + s.x;
                  const y = ty + s.y;
                  // Cull if out of viewport bounds (including margin)
                  if (x + s.w < -margin || y + s.h < -margin || x > visW + margin || y > visH + margin) continue;
                  let alpha = s.a;
                  if (fading) {
                    const t = (nowT - fadeStart - (s.delay || 0)) / FADE_MS;
                    const p = ease(t);
                    alpha *= p;
                    if (p < 1) allFaded = false;
                  }
                  ctx.globalAlpha = alpha;
                  ctx.drawImage(s.img, x, y, s.w, s.h);
                }
              }
            }

            ctx.globalAlpha = 1;
            ctx.restore();
            if (animating || (fading && !allFaded)) {
              animating = true;
              requestAnimationFrame(render);
            } else if (fading && allFaded) {
              fading = false;
            }
          }

          // Input handlers: drag, wheel, keys, touch
          let dragging = false;
          let lastX = 0, lastY = 0;
          canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragging = true;
            lastX = e.clientX; lastY = e.clientY;
            velX = velY = 0;
          });
          window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            offsetX += dx; offsetY += dy;
            velX = dx * 0.2; velY = dy * 0.2;
            lastX = e.clientX; lastY = e.clientY;
            requestRender();
            e.preventDefault();
          }, { passive: false });
          window.addEventListener('mouseup', () => { dragging = false; });

          canvas.addEventListener('wheel', (e) => {
            // Zoom when ctrlKey is held (pinch on trackpads sets ctrlKey)
            if (e.ctrlKey) {
              // Much higher sensitivity
              const ds = Math.exp(-e.deltaY * 0.006);
              const rect = canvas.getBoundingClientRect();
              const sx = e.clientX - rect.left;
              const sy = e.clientY - rect.top;
              if (zoomAt(sx, sy, ds)) {
                // accumulate zoom inertia around cursor
                zoomFocusX = sx; zoomFocusY = sy;
                zoomVel += Math.log(ds) * 0.6;
                // cap zoomVel to avoid runaway
                zoomVel = Math.max(-0.08, Math.min(0.08, zoomVel));
                requestRender();
              }
              e.preventDefault();
              return;
            }
            // Otherwise: pan freely in both axes
            const dx = e.deltaX;
            const dy = e.deltaY;
            offsetX -= dx;
            offsetY -= dy;
            velX = -dx * 0.1;
            velY = -dy * 0.1;
            requestRender();
            e.preventDefault();
          }, { passive: false });

          window.addEventListener('keydown', (e) => {
            const STEP = 40;
            if (e.key === 'ArrowUp') { offsetY += STEP; velY = 4; requestRender(); }
            else if (e.key === 'ArrowDown') { offsetY -= STEP; velY = -4; requestRender(); }
            else if (e.key === 'ArrowLeft') { offsetX += STEP; velX = 4; requestRender(); }
            else if (e.key === 'ArrowRight') { offsetX -= STEP; velX = -4; requestRender(); }
            else if (e.key === '+' || e.key === '=' ) {
              const cx = vw / 2, cy = vh / 2;
              if (zoomAt(cx, cy, 1.2)) requestRender();
            } else if (e.key === '-' || e.key === '_') {
              const cx = vw / 2, cy = vh / 2;
              if (zoomAt(cx, cy, 1/1.2)) requestRender();
            }
          });

          // Touch (drag + pinch to zoom + double-tap)
          let tDragging = false; let tLastX = 0; let tLastY = 0;
          let pinching = false; let lastDist = 0; let lastMidX = 0; let lastMidY = 0;
          let lastTapT = 0; let lastTapX = 0; let lastTapY = 0;
          function dist(a, b) { const dx = a.clientX - b.clientX; const dy = a.clientY - b.clientY; return Math.hypot(dx, dy); }
          function mid(a, b) { return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }; }
          canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
              const t = e.touches[0];
              tDragging = true; pinching = false; velX = velY = 0;
              tLastX = t.clientX; tLastY = t.clientY;
              // Double-tap to zoom in
              const now = performance.now ? performance.now() : Date.now();
              const dt = now - lastTapT;
              const d2 = Math.hypot(t.clientX - lastTapX, t.clientY - lastTapY);
              if (dt < 300 && d2 < 24) {
                const rect = canvas.getBoundingClientRect();
                const sx = t.clientX - rect.left; const sy = t.clientY - rect.top;
                if (zoomAt(sx, sy, 1.6)) requestRender();
              }
              lastTapT = now; lastTapX = t.clientX; lastTapY = t.clientY;
            } else if (e.touches.length === 2) {
              tDragging = false; pinching = true; velX = velY = 0;
              lastDist = dist(e.touches[0], e.touches[1]);
              const m = mid(e.touches[0], e.touches[1]); lastMidX = m.x; lastMidY = m.y;
            }
          }, { passive: true });
          canvas.addEventListener('touchmove', (e) => {
            if (pinching && e.touches.length === 2) {
              const d = dist(e.touches[0], e.touches[1]);
              if (d > 0 && lastDist > 0) {
                // Stronger sensitivity
                const ds = Math.pow(d / lastDist, 1.5);
                const rect = canvas.getBoundingClientRect();
                const m = mid(e.touches[0], e.touches[1]);
                const sx = m.x - rect.left;
                const sy = m.y - rect.top;
                if (zoomAt(sx, sy, ds)) {
                  zoomFocusX = sx; zoomFocusY = sy;
                  zoomVel += Math.log(ds) * 0.6;
                  zoomVel = Math.max(-0.08, Math.min(0.08, zoomVel));
                  requestRender();
                }
                lastDist = d;
                const m2 = mid(e.touches[0], e.touches[1]); lastMidX = m2.x; lastMidY = m2.y;
              }
              e.preventDefault();
              return;
            }
            const t = e.touches[0]; if (!t || !tDragging) return;
            const dx = t.clientX - tLastX; const dy = t.clientY - tLastY;
            offsetX += dx; offsetY += dy; velX = dx * 0.2; velY = dy * 0.2;
            tLastX = t.clientX; tLastY = t.clientY; requestRender();
            e.preventDefault();
          }, { passive: false });
          canvas.addEventListener('touchend', (e) => {
            const touches = e.touches ? e.touches.length : 0;
            if (touches === 0) { tDragging = false; pinching = false; }
            else if (touches === 1) { tDragging = true; pinching = false; }
            else if (touches === 2) { tDragging = false; pinching = true; }
          }, { passive: true });

          // Mouse: double-click to zoom (Shift/Alt to zoom out)
          canvas.addEventListener('dblclick', (e) => {
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left; const sy = e.clientY - rect.top;
            const factor = (e.shiftKey || e.altKey || e.metaKey) ? 1/1.6 : 1.6;
            if (zoomAt(sx, sy, factor)) {
              zoomFocusX = sx; zoomFocusY = sy;
              zoomVel += Math.log(factor) * 0.4;
              zoomVel = Math.max(-0.06, Math.min(0.06, zoomVel));
              requestRender();
            }
            e.preventDefault();
          });

          // Gentle auto drift to keep motion alive
          setInterval(() => {
            if (!ready) return;
            if (dragging || tDragging) return;
            velX += (Math.random() - 0.5) * 0.02;
            velY += (Math.random() - 0.5) * 0.02;
            requestRender();
          }, 1200);
        } catch (_) { /* ignore logofolio errors */ }
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

      const rightIsViewSwitch = !!(right && (right.classList.contains('nav-view-switch') || right.querySelector('[role="tablist"]')));
      if (right && !rightIsViewSwitch) {
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
      const isVideo = /\.mp4(\?|$)/i.test(String(src || ''));
      const requestSrc = withDevAssetBust(src);
      if (isVideo) {
        const v = document.createElement("video");
        v.src = requestSrc;
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
        img.src = requestSrc;
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
        || /(\/)5\.png(?:\?|$)/i.test(srcPath)
        || /(\/)8\.png$/i.test(srcPath)
        || /(\/)11\.png$/i.test(srcPath)
        || /(^|\/)12\.5\.mp4$/i.test(srcPath)
        || /(^|\/)20\.mp4$/i.test(srcPath)
        // TOM: keep specific frames from being cropped at <=600px
        || /(^|\/)2\.svg$/i.test(srcPath)
        // Removed 3.jpg to match behavior of images 1, 4, and 5
        || /(^|\/)6\.svg$/i.test(srcPath)
        || /(^|\/)trd\/2\.png$/i.test(srcPath)
        || /(^|\/)relias\/2\.png$/i.test(srcPath)
        || /(^|\/)ql\/2\.png$/i.test(srcPath)
        || /(^|\/)ql\/4\.png$/i.test(srcPath)
        || /(^|\/)ql\/6\.png$/i.test(srcPath)
        || /(^|\/)ql\/9\.png$/i.test(srcPath)
        || (/(^|\/)8\.jpg$/i.test(srcPath) && !/(^|\/)relias\/8\.jpg$/i.test(srcPath))
        // Relias: keep 3,5.png and 10.png original aspect ratio
        || /(^|\/)3,5\.png$/i.test(srcPath)
        || /(^|\/)7\.png$/i.test(srcPath)
        || /(^|\/)10\.png(?:\?|$)/i.test(srcPath)) {
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
        if (layers.length) {
          try { start(); } catch (_) {}
        }
      }
    }, FORCE_START_MS);
  } catch (_) {}

  // Continuous timeline-based engine (no discrete switches)
  // Continuous infinite timeline (circular). floor(timeline % L) selects current index.
  // Default view: second image current, third at 60% progress.
  function getInitialTimeline() {
    try {
      const p = String(location && location.pathname || '').toLowerCase();
      const t = String(document && document.title || '').toLowerCase();
      if (p.includes('tom.html') || t.includes('tom')) {
        // Tom: start with 1.jpg fully visible, and 2.svg partially progressed
        // timeline is idx + progress, where idx=0 => first frame.
        return { index: 0, progress: 0.35 };
      }
      if (p.includes('toyota.html') || t.includes('toyota')) {
        const isSmallToyotaScreen = (() => {
          try {
            const w1 = Number(window && window.innerWidth) || Infinity;
            const w2 = Number(document && document.documentElement && document.documentElement.clientWidth) || Infinity;
            const narrowByWidth = Math.min(w1, w2) <= 600;
            const narrowByMedia = !!(window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
            return narrowByWidth || narrowByMedia;
          } catch (_) { return false; }
        })();
        return { index: 0, progress: isSmallToyotaScreen ? 0.5 : 0.25 }; // Start higher on small screens so logo appears larger
      }
      if (p.includes('ql.html') || t.includes('quicken') || t.includes('rocket')) {
        const isSmallQlScreen = (() => {
          try {
            const w1 = Number(window && window.innerWidth) || Infinity;
            const w2 = Number(document && document.documentElement && document.documentElement.clientWidth) || Infinity;
            const narrowByWidth = Math.min(w1, w2) <= 600;
            const narrowByMedia = !!(window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
            return narrowByWidth || narrowByMedia;
          } catch (_) { return false; }
        })();
        return { index: 0, progress: isSmallQlScreen ? 0.5 : 0.3 }; // Start higher on small screens so logo appears larger
      }
      if (p.includes('relias.html') || p.includes('virelia.html') || t.includes('relias') || t.includes('virelia')) {
        const isSmallReliasScreen = (() => {
          try {
            const w1 = Number(window && window.innerWidth) || Infinity;
            const w2 = Number(document && document.documentElement && document.documentElement.clientWidth) || Infinity;
            const narrowByWidth = Math.min(w1, w2) <= 600;
            const narrowByMedia = !!(window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
            return narrowByWidth || narrowByMedia;
          } catch (_) { return false; }
        })();
        return { index: 0, progress: isSmallReliasScreen ? 0.6 : 0.19 }; // Use deeper start on <=600px
      }
    } catch (_) {}
    // Default: show 2nd image with 60% into next (3rd)
    return { index: 1, progress: 0.6 };
  }

  const { index: INITIAL_INDEX, progress: INITIAL_PROGRESS } = getInitialTimeline();
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
    if (!L) return;
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
    if (!layers.length) { return; }
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

      const isImpact = (label || '').trim().toLowerCase() === 'impact' || (label || '').trim().toLowerCase() === 'intended impact';
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

      // For Impact, create separate detail panels; for Problem & Solution, create two; for Deliverables, create panels; otherwise single
      let detailsToOpen = [];
      if (isImpact) {
        const body = card.querySelector('.text-body');
        const list = body ? (body.querySelector('ul') || body.querySelector('ol')) : null;
        const listItems = list ? Array.from(list.querySelectorAll(':scope > li')) : [];

        if (listItems.length) {
          const titles = listItems
            .map((li) => (li && li.textContent ? li.textContent.trim() : ''))
            .filter(Boolean);
          const existing = openDetails.get(card);
          if (existing && Array.isArray(existing) && existing.length === titles.length) {
            detailsToOpen = existing;
            detailsToOpen.forEach((d, i) => {
              d.classList.remove('open');
              d.style.marginTop = '';
              d.style.opacity = '';
              d.style.pointerEvents = '';
              const inner = d.querySelector('.paragraph-detail__inner') || d;
              inner.innerHTML = `<p class="text-label">${titles[i] || ''}</p>`;
            });
          } else {
            detailsToOpen = titles.map((title) => makeDetail(
              `<p class="text-label">${title}</p>`,
              title
            ));
          }
        } else {
          const metricItems = body ? Array.from(body.querySelectorAll('.impact-metric')) : [];
          const metricTitles = metricItems
            .map((item) => (item && item.textContent ? item.textContent.trim() : ''))
            .filter(Boolean);

          if (metricTitles.length) {
            const existing = openDetails.get(card);
            if (existing && Array.isArray(existing) && existing.length === metricTitles.length) {
              detailsToOpen = existing;
              detailsToOpen.forEach((d, i) => {
                d.classList.remove('open');
                d.style.marginTop = '';
                d.style.opacity = '';
                d.style.pointerEvents = '';
                const inner = d.querySelector('.paragraph-detail__inner') || d;
                inner.innerHTML = `<p class="text-label">${metricTitles[i] || ''}</p>`;
              });
            } else {
              detailsToOpen = metricTitles.map((title) => makeDetail(
                `<p class="text-label">${title}</p>`,
                title
              ));
            }
          } else {
          // Check which page we're on
          const isToyotaPage = window.location.pathname.includes('toyota.html') || document.title.toLowerCase().includes('toyota');
          const isReliasPage = window.location.pathname.includes('relias.html') || window.location.pathname.includes('virelia.html') || document.title.toLowerCase().includes('relias') || document.title.toLowerCase().includes('virelia');

          // Use different titles based on the page
          const titles = isReliasPage ? [
            'Reduced transcript creation time by shifting from manual drafting to AI-first generation',
            'Accelerated time to market for new educational content',
            'Decreased rework and errors across writing, QA, and compliance',
            'Enabled faster feature development through a scalable visual direction and design system'
          ] : isToyotaPage ? [
            'Unified fragmented workflows into one system',
            'Reduced reliance on tribal knowledge',
            'Shifted validation earlier to prevent errors',
            'Built a scalable design foundation',
            'Improved visibility for faster decision-making'
          ] : [
            '1,164,000+ loans disbursed digitally',
            '111,000+ active users',
            '97% of invited members registered',
            '4.9★ average app store rating',
            '65% of loans created and approved directly within the app',
          ];
          // If we already created them once, reuse
          const existing = openDetails.get(card);
          const expectedLength = titles.length;
          if (existing && Array.isArray(existing) && existing.length === expectedLength) {
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
          }
        }
        // Insert sequentially after the card
        let afterNode = card;
        detailsToOpen.forEach((d) => {
          if (afterNode.nextSibling) col.insertBefore(d, afterNode.nextSibling);
          else col.appendChild(d);
          afterNode = d;
        });
      } else if (isDeliverables) {
        // If the page provides a real deliverables list, use it directly.
        // This prevents TOM from inheriting NestBank's hardcoded deliverables panels.
        const body = card.querySelector('.text-body');
        const hasList = !!(body && (body.querySelector('ul') || body.querySelector('ol')));
        if (hasList) {
          const list = (body && (body.querySelector('ul') || body.querySelector('ol')));
          const items = list ? Array.from(list.querySelectorAll(':scope > li')) : [];

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
              inner.classList.remove('emphasize');
              const txt = (items[i] && items[i].textContent) ? items[i].textContent.trim() : '';
              inner.innerHTML = `<p class="text-label">${txt}</p>`;
            });
          } else {
            detailsToOpen = (items.length ? items : [null]).map((li, idx) => {
              const txt = li && li.textContent ? li.textContent.trim() : '';
              const d = makeDetail(
                `<p class="text-label">${txt}</p>`,
                txt ? `${txt} details` : `Deliverable ${idx + 1}`
              );
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
        } else {
          let detail = openDetails.get(card);
          if (!detail || Array.isArray(detail)) detail = null;
          if (!detail) {
            detail = makeDetail(bodyHTML, label ? `${label} details` : 'Details');
            detail.querySelector('.paragraph-detail__inner')?.classList.remove('emphasize');
          } else {
            const inner = detail.querySelector('.paragraph-detail__inner') || detail;
            inner.classList.remove('emphasize');
            inner.innerHTML = bodyHTML || '<div style="opacity:.8">No details available.</div>';
          }
          detail.classList.remove('open');
          detail.style.marginTop = '';
          detail.style.opacity = '';
          detail.style.pointerEvents = '';

          if (card.nextSibling) col.insertBefore(detail, card.nextSibling);
          else col.appendChild(detail);
          detailsToOpen = [detail];
        }
      } else if (isProblemSolution) {
        // Build two separate details: Problem and Solution
        const body = card.querySelector('.text-body');
        // Attempt to extract Problem/Solution paragraphs from the card body
        let problemHTML = '';
        let solutionHTML = '';
        if (body) {
          const labels = Array.from(body.querySelectorAll('.text-label'));
          // Collect all elements after a label until the next label.
          // This allows multi-paragraph content (used on TOM) to appear in the expanded details.
          const getContentBlockAfter = (labelEl) => {
            if (!labelEl) return '';
            const parts = [];
            let n = labelEl.nextElementSibling;
            while (n) {
              // Stop when we reach the next section label
              if (n.classList && n.classList.contains('text-label')) break;
              // Skip <br> tags; details layout can manage spacing itself
              if (String(n.tagName || '').toUpperCase() !== 'BR') {
                parts.push(n.outerHTML);
              }
              n = n.nextElementSibling;
            }
            return parts.join('');
          };
          const problemLabel = labels.find(l => (l.textContent || '').trim().toLowerCase() === 'problem');
          const solutionLabel = labels.find(l => (l.textContent || '').trim().toLowerCase() === 'solution');
          const problemBlock = getContentBlockAfter(problemLabel);
          const solutionBlock = getContentBlockAfter(solutionLabel);
          problemHTML = `<p class="text-label">Problem</p>${problemBlock || ''}`;
          solutionHTML = `<p class="text-label">Solution</p>${solutionBlock || ''}`;
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
      const deepDiveLocked = !!(document.body && document.body.classList.contains('toyota-deep-dive'));
      if (deepDiveLocked) {
        if (openCards && openCards.size > 0) {
          Array.from(openCards).forEach((c) => closeDetailFor(c));
        }
        document.documentElement.classList.remove('ui-exited');
        const nav = document.querySelector('.nav-bar');
        if (nav) nav.classList.remove('exit-out');
        document.querySelectorAll('.paragraph').forEach((el) => el.classList.remove('exit-out'));
        return;
      }
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
          // Disable hide-on-background-click for the NestBank page
          try {
            if (/nestbank\.html$/i.test(window.location.pathname)) {
              const introOverlayStillPresent = !!document.querySelector('.intro-overlay');
              if (introOverlayStillPresent) return;
            }
          } catch (_) {}
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
