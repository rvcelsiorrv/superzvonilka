'use strict';

/**
 * orbAudio — аудио-реактивность орбов.
 * Для каждого аудио-элемента (myAudio / <peer>___audio) подключает AnalyserNode
 * и выставляет CSS-переменную --level (0..1) на соответствующем тайле .Camera,
 * чтобы орб расцветал/пульсировал в такт голосу.
 */
(function () {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    let audioCtx = null;
    const hooked = new Map(); // audioEl -> { stream, analyser, data, level }

    function ctx() {
        if (!audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            audioCtx = new AC();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        return audioCtx;
    }

    function tileFor(audioEl) {
        const id = audioEl.id;
        if (id === 'myAudio') return document.getElementById('myVideoWrap');
        if (id.endsWith('___audio')) {
            const peer = id.slice(0, -'___audio'.length);
            return document.getElementById(peer + '_videoWrap');
        }
        return null;
    }

    function hook(audioEl) {
        const stream = audioEl.srcObject;
        if (!stream || typeof stream.getAudioTracks !== 'function') return null;
        if (stream.getAudioTracks().length === 0) return null;
        const ac = ctx();
        if (!ac) return null;
        let entry = hooked.get(audioEl);
        if (entry && entry.stream === stream) return entry;
        try {
            const source = ac.createMediaStreamSource(stream);
            const analyser = ac.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.6;
            source.connect(analyser); // НЕ подключаем к destination — без эха
            entry = { stream, analyser, data: new Uint8Array(analyser.fftSize), level: 0 };
            hooked.set(audioEl, entry);
            return entry;
        } catch (e) {
            return null;
        }
    }

    function rms(entry) {
        entry.analyser.getByteTimeDomainData(entry.data);
        let sum = 0;
        for (let i = 0; i < entry.data.length; i++) {
            const v = (entry.data[i] - 128) / 128;
            sum += v * v;
        }
        return Math.sqrt(sum / entry.data.length); // 0..~1
    }

    function frame() {
        const audios = document.querySelectorAll('audio#myAudio, audio[id$="___audio"]');
        for (let i = 0; i < audios.length; i++) {
            const el = audios[i];
            const tile = tileFor(el);
            if (!tile) continue;
            const entry = hook(el);
            if (!entry) continue;

            const raw = rms(entry);
            // нормализуем речь: ~0.02 тишина → 0, ~0.25+ громко → 1
            let lvl = Math.min(1, Math.max(0, (raw - 0.02) / 0.22));
            lvl = Math.pow(lvl, 0.7); // мягче в нижней части
            // быстрый подъём, плавный спад
            entry.level += (lvl - entry.level) * (lvl > entry.level ? 0.5 : 0.12);
            const out = entry.level < 0.012 ? 0 : entry.level;
            tile.style.setProperty('--level', out.toFixed(3));
        }
        requestAnimationFrame(frame);
    }

    // запуск после загрузки + возобновление контекста по первому жесту
    const kick = () => ctx();
    window.addEventListener('pointerdown', kick, { passive: true });
    window.addEventListener('keydown', kick, { passive: true });

    requestAnimationFrame(frame);
})();
