'use strict';

/**
 * Constellation — живой фон «сеть узлов» (P2P-метафора).
 * Дрейфующие узлы соединяются линиями при сближении; лёгкий параллакс по курсору.
 * Уважает prefers-reduced-motion, ставится на паузу в скрытой вкладке.
 */
(function () {
    const PALETTE = {
        node: 'rgba(110, 168, 255, ALPHA)', // --node-blue
        nodeMint: 'rgba(155, 231, 216, ALPHA)', // --node-mint
        line: 'rgba(110, 168, 255, ALPHA)',
        lineMint: 'rgba(155, 231, 216, ALPHA)',
    };

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let canvas = document.getElementById('constellation-bg');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'constellation-bg';
        canvas.setAttribute('aria-hidden', 'true');
        // вставляем самым первым ребёнком body, чтобы быть позади контента
        if (document.body.firstChild) {
            document.body.insertBefore(canvas, document.body.firstChild);
        } else {
            document.body.appendChild(canvas);
        }
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let nodes = [];
    let blobs = [];
    let rafId = null;
    let running = false;

    // Параллакс по курсору (мягко интерполируется)
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    const LINK_DIST = 150; // px — макс. расстояние связи
    const LINK_DIST_SQ = LINK_DIST * LINK_DIST;

    function nodeCount() {
        const area = window.innerWidth * window.innerHeight;
        // ~1 узел на 16k px², в разумных пределах
        return Math.max(44, Math.min(140, Math.round(area / 13000)));
    }

    function rand(min, max) {
        return Math.random() * (max - min) + min;
    }

    function makeNodes() {
        const count = nodeCount();
        nodes = [];
        for (let i = 0; i < count; i++) {
            const mint = Math.random() < 0.26; // часть узлов «мятные»
            const bright = Math.random() < 0.16; // редкие яркие пульсары
            nodes.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                vx: rand(-0.2, 0.2),
                vy: rand(-0.2, 0.2),
                r: bright ? rand(2.6, 3.8) : rand(1.1, 2.4),
                depth: rand(0.3, 1), // для параллакса и размера
                mint: mint,
                bright: bright,
                phase: Math.random() * Math.PI * 2,
                pulse: rand(0.6, 1.4),
            });
        }
    }

    function makeBlobs() {
        // крупные медленно дрейфующие световые пятна — заметное «дыхание» фона
        const colors = ['110, 168, 255', '139, 125, 255', '95, 240, 224'];
        blobs = [];
        for (let i = 0; i < 3; i++) {
            blobs.push({
                x: rand(0.15, 0.85) * window.innerWidth,
                y: rand(0.15, 0.85) * window.innerHeight,
                vx: rand(-0.12, 0.12),
                vy: rand(-0.1, 0.1),
                r: rand(320, 480),
                color: colors[i % colors.length],
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        makeNodes();
        makeBlobs();
    }

    function colorFor(node, kind, alpha) {
        const base = node && node.mint ? (kind === 'line' ? PALETTE.lineMint : PALETTE.nodeMint) : (kind === 'line' ? PALETTE.line : PALETTE.node);
        return base.replace('ALPHA', alpha.toFixed(3));
    }

    function draw(t) {
        ctx.clearRect(0, 0, W, H);

        // плавный параллакс
        pointer.x += (pointer.tx - pointer.x) * 0.04;
        pointer.y += (pointer.ty - pointer.y) * 0.04;

        // световые пятна (нижний слой, мягкое дыхание)
        for (let i = 0; i < blobs.length; i++) {
            const bb = blobs[i];
            const puls = reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 0.0004 + bb.phase);
            const bx = bb.x + pointer.x * 1.6;
            const by = bb.y + pointer.y * 1.6;
            const g = ctx.createRadialGradient(bx, by, 0, bx, by, bb.r);
            g.addColorStop(0, `rgba(${bb.color}, ${(0.2 * puls).toFixed(3)})`);
            g.addColorStop(0.5, `rgba(${bb.color}, ${(0.08 * puls).toFixed(3)})`);
            g.addColorStop(1, `rgba(${bb.color}, 0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(bx, by, bb.r, 0, Math.PI * 2);
            ctx.fill();
        }

        // линии связи
        for (let i = 0; i < nodes.length; i++) {
            const a = nodes[i];
            const ax = a.x + pointer.x * a.depth;
            const ay = a.y + pointer.y * a.depth;
            for (let j = i + 1; j < nodes.length; j++) {
                const b = nodes[j];
                const bx = b.x + pointer.x * b.depth;
                const by = b.y + pointer.y * b.depth;
                const dx = ax - bx;
                const dy = ay - by;
                const distSq = dx * dx + dy * dy;
                if (distSq < LINK_DIST_SQ) {
                    const dist = Math.sqrt(distSq);
                    const alpha = (1 - dist / LINK_DIST) * 0.9;
                    ctx.strokeStyle = colorFor(a.mint && b.mint ? a : { mint: false }, 'line', alpha);
                    ctx.lineWidth = 1.1;
                    ctx.beginPath();
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(bx, by);
                    ctx.stroke();
                }
            }
        }

        // узлы
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const px = n.x + pointer.x * n.depth;
            const py = n.y + pointer.y * n.depth;
            const tw = reduceMotion ? 1 : 0.6 + 0.4 * Math.sin(t * 0.001 * n.pulse + n.phase);
            const r = n.r * (0.85 + n.depth * 0.4);

            if (n.bright) {
                const glow = ctx.createRadialGradient(px, py, 0, px, py, r * 6);
                glow.addColorStop(0, colorFor(n, 'node', 0.5 * tw));
                glow.addColorStop(1, colorFor(n, 'node', 0));
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(px, py, r * 6, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = colorFor(n, 'node', (n.bright ? 1 : 0.92) * (0.55 + tw * 0.45));
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function step(t) {
        if (!running) return;
        // движение
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            n.x += n.vx * n.depth;
            n.y += n.vy * n.depth;
            if (n.x < -20) n.x = W + 20;
            else if (n.x > W + 20) n.x = -20;
            if (n.y < -20) n.y = H + 20;
            else if (n.y > H + 20) n.y = -20;
        }
        for (let i = 0; i < blobs.length; i++) {
            const bb = blobs[i];
            bb.x += bb.vx;
            bb.y += bb.vy;
            const m = bb.r * 0.5;
            if (bb.x < -m) bb.x = W + m;
            else if (bb.x > W + m) bb.x = -m;
            if (bb.y < -m) bb.y = H + m;
            else if (bb.y > H + m) bb.y = -m;
        }
        draw(t);
        rafId = requestAnimationFrame(step);
    }

    function start() {
        if (running) return;
        running = true;
        if (reduceMotion) {
            // один статичный кадр
            draw(0);
            running = false;
            return;
        }
        rafId = requestAnimationFrame(step);
    }

    function stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
    }

    // события
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 200);
    });

    if (!reduceMotion) {
        window.addEventListener(
            'pointermove',
            (e) => {
                const nx = (e.clientX / window.innerWidth - 0.5) * 2;
                const ny = (e.clientY / window.innerHeight - 0.5) * 2;
                pointer.tx = nx * 28; // амплитуда параллакса
                pointer.ty = ny * 28;
            },
            { passive: true }
        );
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop();
        else start();
    });

    resize();
    start();
})();
