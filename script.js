(() => {
    'use strict';

    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ------------------------------------------------------------
       Audio (Web Audio API, created lazily on first user action)
    ------------------------------------------------------------ */
    let audioCtx = null;
    let audioOn = false;

    function initAudio() {
        if (!audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return false;
            audioCtx = new Ctx();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return true;
    }

    function playTone(freq, type = 'sine', duration = 1.2) {
        if (!audioOn || !audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration);
    }

    const btnAudio = $('#btnAudio');
    btnAudio.addEventListener('click', () => {
        if (!initAudio()) return;
        audioOn = !audioOn;
        $('#audioState').textContent = audioOn ? 'SOUND ON' : 'SOUND OFF';
        btnAudio.classList.toggle('active', audioOn);
        btnAudio.setAttribute('aria-pressed', String(audioOn));
        if (audioOn) playTone(440, 'sine', 1);
    });

    // Skill chips play a note (only when sound is on)
    document.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-tone]');
        if (chip) playTone(Number(chip.dataset.tone), 'triangle', 2);
    });

    /* ------------------------------------------------------------
       3D staircase (hero) – positions are driven by the --i CSS var
    ------------------------------------------------------------ */
    const stairs = $('#stairs');
    if (stairs) {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < 15; i++) {
            const step = document.createElement('div');
            step.className = 'stair-step';
            step.style.setProperty('--i', i);
            frag.appendChild(step);
        }
        stairs.appendChild(frag);
    }

    /* ------------------------------------------------------------
       Starfield – ONE shared fixed canvas (was 7 canvases)
       - pauses when the tab is hidden
       - frame-rate independent
       - single static frame when reduced motion is requested
    ------------------------------------------------------------ */
    const canvas = $('#stars');
    const ctx = canvas.getContext('2d', { alpha: true });
    const STAR_COUNT = window.innerWidth < 768 ? 60 : 110;
    const DEPTH = 1000;
    let width = 0;
    let height = 0;
    let rafId = 0;
    let lastTime = 0;

    const stars = Array.from({ length: STAR_COUNT }, () => ({
        x: Math.random(),
        y: Math.random(),
        z: Math.random() * DEPTH,
        size: Math.random() * 2 + 0.8
    }));

    function resizeCanvas() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    function drawStars(dt) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#fff';
        const cx = width / 2;
        const cy = height / 2;

        for (const s of stars) {
            s.z -= 0.8 * dt;
            if (s.z <= 1) {
                s.z = DEPTH;
                s.x = Math.random();
                s.y = Math.random();
            }
            const k = 252 / s.z;
            const px = (s.x * width - cx) * k + cx;
            const py = (s.y * height - cy) * k + cy;
            if (px < 0 || px > width || py < 0 || py > height) continue;
            ctx.globalAlpha = 1 - s.z / DEPTH;
            ctx.fillRect(px, py, s.size, s.size);
        }
        ctx.globalAlpha = 1;
    }

    function frame(time) {
        const dt = Math.min((time - lastTime) / 16.67, 3) || 1; // 1 = one 60fps frame
        lastTime = time;
        drawStars(dt);
        rafId = requestAnimationFrame(frame);
    }

    function startStars() {
        cancelAnimationFrame(rafId);
        if (reduceMotion.matches) {
            drawStars(1);
            return;
        }
        lastTime = performance.now();
        rafId = requestAnimationFrame(frame);
    }

    resizeCanvas();
    startStars();

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resizeCanvas();
            if (reduceMotion.matches) drawStars(1);
        }, 200);
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAnimationFrame(rafId);
        else startStars();
    });

    /* ------------------------------------------------------------
       Section tracking: active scene, reveal, progress dots
    ------------------------------------------------------------ */
    const sections = $$('.dream-section');
    const dots = $$('.progress-dot');
    let currentIndex = 0;

    function setActive(index) {
        currentIndex = index;
        dots.forEach((dot, i) => {
            const on = i === index;
            dot.classList.toggle('active', on);
            if (on) dot.setAttribute('aria-current', 'true');
            else dot.removeAttribute('aria-current');
        });
    }

    // A section becomes "active" when it crosses the middle band of the
    // viewport – works for sections of any height.
    const sectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const idx = sections.indexOf(entry.target);
            sections.forEach((s) => s.classList.toggle('active', s === entry.target));
            entry.target.classList.add('visible');
            setActive(idx);
            playTone(200 + idx * 60, 'sine', 1.2);
        }
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

    sections.forEach((s) => sectionObserver.observe(s));

    function goTo(index) {
        const target = sections[index];
        if (target) target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    }

    dots.forEach((dot) => dot.addEventListener('click', () => goTo(Number(dot.dataset.index))));
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-go]');
        if (!el) return;
        e.preventDefault();
        goTo(Number(el.dataset.go));
    });

    /* ------------------------------------------------------------
       Palette switcher
    ------------------------------------------------------------ */
    const themes = ['default', 'aether', 'liquid', 'violet', 'mono'];
    let themeIdx = 0;
    $('#btnTheme').addEventListener('click', () => {
        themeIdx = (themeIdx + 1) % themes.length;
        document.body.dataset.theme = themes[themeIdx];
        playTone(600, 'triangle', 0.5);
    });

    /* ------------------------------------------------------------
       Auto tour (stops as soon as the visitor scrolls or presses a key)
    ------------------------------------------------------------ */
    const btnTour = $('#btnTour');
    let tourTimer = 0;

    function stopTour() {
        if (!tourTimer) return;
        clearInterval(tourTimer);
        tourTimer = 0;
        btnTour.classList.remove('active');
        btnTour.setAttribute('aria-pressed', 'false');
        btnTour.textContent = 'AUTO TOUR';
    }

    function startTour() {
        btnTour.classList.add('active');
        btnTour.setAttribute('aria-pressed', 'true');
        btnTour.textContent = 'TOURING...';
        tourTimer = setInterval(() => goTo((currentIndex + 1) % sections.length), 6000);
    }

    btnTour.addEventListener('click', () => (tourTimer ? stopTour() : startTour()));
    ['wheel', 'touchstart', 'keydown'].forEach((evt) =>
        window.addEventListener(evt, (e) => {
            if (!btnTour.contains(e.target)) stopTour();
        }, { passive: true })
    );

    /* ------------------------------------------------------------
       Experience tabs (accessible: arrow keys, Home, End)
    ------------------------------------------------------------ */
    const tabs = $$('.tab');
    const panels = $$('.panel');

    function selectTab(index, focus = false) {
        tabs.forEach((tab, i) => {
            const on = i === index;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
            panels[i].classList.toggle('active', on);
        });
        if (focus) tabs[index].focus();
    }

    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => selectTab(i));
        tab.addEventListener('keydown', (e) => {
            const last = tabs.length - 1;
            let next = null;
            if (e.key === 'ArrowRight') next = i === last ? 0 : i + 1;
            else if (e.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = last;
            if (next !== null) {
                e.preventDefault();
                selectTab(next, true);
            }
        });
    });
})();
