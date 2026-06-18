/* ============================================================
   NEON BREAKOUT — wypasiona wizualnie wersja klasyka
   Czysty Canvas 2D, bez zależności. Web Audio: SFX + muzyka.
   ============================================================ */
(() => {
  'use strict';

  // ---------- Wymiary logiczne (świat gry) ----------
  const W = 880;
  const H = 640;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ---------- DOM ----------
  const $score = document.getElementById('score');
  const $level = document.getElementById('level');
  const $lives = document.getElementById('lives');
  const $combo = document.getElementById('combo-badge');
  const $comboText = document.getElementById('combo-text');
  const $overlay = document.getElementById('overlay');
  const $overlayTitle = $overlay.querySelector('.title');
  const $overlaySub = document.getElementById('overlay-subtitle');
  const $overlayStats = document.getElementById('overlay-stats');
  const $startBtn = document.getElementById('start-btn');
  const $muteBtn = document.getElementById('mute-btn');
  const $musicBtn = document.getElementById('music-btn');
  const $nameEntry = document.getElementById('name-entry');
  const $nameInput = document.getElementById('name-input');
  const $saveScore = document.getElementById('save-score');
  const $scoreboard = document.getElementById('scoreboard');
  const $scoreList = document.getElementById('score-list');

  // ============================================================
  //  Responsywne skalowanie z zachowaniem proporcji + DPR
  // ============================================================
  let scale = 1;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const margin = 28;
    scale = Math.min((window.innerWidth - margin) / W, (window.innerHeight - margin) / H);
    canvas.style.width = (W * scale) + 'px';
    canvas.style.height = (H * scale) + 'px';
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ============================================================
  //  Audio — SFX syntezowane + muzyka w tle (Web Audio)
  // ============================================================
  const Audio = (() => {
    let actx = null, master = null, sfx = null, musicGain = null;
    let muted = false, musicOn = false;
    let schedTimer = null, step = 0, nextTime = 0;
    let trackIdx = 0, intensity = 0;
    const STEP_DUR = 0.2272; // ~110 BPM, ósemka
    const clampA = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

    const VKEY = 'neonBreakoutVol';
    let vol = { master: 0.7, music: 0.6, sfx: 0.9 };
    try { vol = Object.assign(vol, JSON.parse(localStorage.getItem(VKEY)) || {}); } catch {}
    function saveVol() { try { localStorage.setItem(VKEY, JSON.stringify(vol)); } catch {} }

    function ensure() {
      if (actx) return;
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = muted ? 0 : vol.master; master.connect(actx.destination);
      sfx = actx.createGain(); sfx.gain.value = vol.sfx; sfx.connect(master);
      musicGain = actx.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);
    }
    function resume() { ensure(); if (actx.state === 'suspended') actx.resume(); }

    function tone(freq, dur, type = 'sine', vol = 0.3, glideTo = null) {
      if (muted) return; resume();
      const t = actx.currentTime;
      const osc = actx.createOscillator(), g = actx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, t);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(sfx);
      osc.start(t); osc.stop(t + dur + 0.02);
    }
    function noise(dur, v = 0.25, hp = 800, dest) {
      if (muted) return; resume();
      const t = actx.currentTime;
      const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = actx.createBufferSource(); src.buffer = buf;
      const g = actx.createGain(); g.gain.value = v;
      const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
      src.connect(f); f.connect(g); g.connect(dest || sfx); src.start(t);
    }

    // ----- Muzyka: 3 utwory (progresje akordów) -----
    const TRACKS = [
      { name: 'Synthwave', wave: ['triangle', 'square', 'triangle'], bars: [
        { root: 110.00, arp: [220.00, 261.63, 329.63, 440.00], pad: [220, 261.63, 329.63] },
        { root: 87.31, arp: [174.61, 220.00, 261.63, 349.23], pad: [174.61, 220, 261.63] },
        { root: 130.81, arp: [261.63, 329.63, 392.00, 523.25], pad: [261.63, 329.63, 392] },
        { root: 98.00, arp: [196.00, 246.94, 293.66, 392.00], pad: [196, 246.94, 293.66] } ] },
      { name: 'Darkwave', wave: ['sine', 'triangle', 'sawtooth'], bars: [
        { root: 73.42, arp: [146.83, 174.61, 220.00, 293.66], pad: [146.83, 174.61, 220.00] },
        { root: 116.54, arp: [116.54, 146.83, 233.08, 293.66], pad: [116.54, 146.83, 174.61] },
        { root: 87.31, arp: [174.61, 220.00, 261.63, 349.23], pad: [174.61, 220.00, 261.63] },
        { root: 130.81, arp: [130.81, 164.81, 196.00, 261.63], pad: [130.81, 164.81, 196.00] } ] },
      { name: 'Drive', wave: ['sawtooth', 'square', 'triangle'], bars: [
        { root: 82.41, arp: [164.81, 196.00, 246.94, 329.63], pad: [164.81, 196.00, 246.94] },
        { root: 130.81, arp: [130.81, 164.81, 196.00, 329.63], pad: [130.81, 164.81, 196.00] },
        { root: 98.00, arp: [196.00, 246.94, 293.66, 392.00], pad: [196.00, 246.94, 293.66] },
        { root: 73.42, arp: [146.83, 185.00, 220.00, 293.66], pad: [146.83, 185.00, 220.00] } ] }
    ];
    function mTone(freq, time, dur, type, v, cut) {
      const osc = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
      osc.type = type; osc.frequency.value = freq;
      f.type = 'lowpass'; f.frequency.value = cut || 2000;
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(v, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(f); f.connect(g); g.connect(musicGain);
      osc.start(time); osc.stop(time + dur + 0.05);
    }
    function mHat(time, v) {
      const dur = 0.05;
      const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = actx.createBufferSource(); src.buffer = buf;
      const g = actx.createGain(); g.gain.value = v;
      const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 8000;
      src.connect(f); f.connect(g); g.connect(musicGain); src.start(time);
    }
    function playStep(s, time) {
      const tr = TRACKS[trackIdx];
      const bar = tr.bars[(s >> 3) % 4];
      const i = s % 8;
      const cut = 1400 + intensity * 2600;
      if (i % 2 === 0) mTone(bar.root, time, 0.42, tr.wave[0], 0.34, 600);
      const seq = [0, 1, 2, 3, 2, 1, 0, 1];
      mTone(bar.arp[seq[i]] * 2, time, 0.22, tr.wave[1], 0.06 + intensity * 0.04, cut);
      mTone(bar.arp[seq[i]], time, 0.26, tr.wave[2], 0.10, 1800);
      if (i === 0) bar.pad.forEach(f => mTone(f, time, STEP_DUR * 8, 'sawtooth', 0.035, 900));
      if (intensity > 0.35) mHat(time, 0.03 + intensity * 0.05);
      if (intensity > 0.7 && i % 2 === 1) mHat(time, 0.04);
    }
    function scheduler() {
      while (nextTime < actx.currentTime + 0.25) { playStep(step, nextTime); nextTime += STEP_DUR; step++; }
    }
    function musicTarget() { return (0.06 + intensity * 0.12) * vol.music * 1.6; }
    function startMusic() {
      resume(); musicOn = true;
      musicGain.gain.cancelScheduledValues(actx.currentTime);
      musicGain.gain.linearRampToValueAtTime(musicTarget(), actx.currentTime + 1.2);
      step = 0; nextTime = actx.currentTime + 0.1;
      if (schedTimer) clearInterval(schedTimer);
      schedTimer = setInterval(scheduler, 25);
    }
    function stopMusic() {
      musicOn = false;
      if (actx) musicGain.gain.linearRampToValueAtTime(0.0001, actx.currentTime + 0.4);
      if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    }

    return {
      brick(c) { tone(420 + Math.min(c, 14) * 45, 0.10, 'square', 0.18); },
      paddle() { tone(180, 0.09, 'sine', 0.25, 120); },
      wall() { tone(140, 0.06, 'sine', 0.12); },
      steel() { tone(2200, 0.05, 'square', 0.08, 1500); tone(700, 0.05, 'square', 0.06); },
      power() { tone(520, 0.16, 'triangle', 0.3, 880); tone(660, 0.18, 'sine', 0.2, 1100); },
      coin() { tone(880, 0.07, 'square', 0.16, 1320); tone(1320, 0.10, 'square', 0.12); },
      bad() { tone(160, 0.3, 'sawtooth', 0.3, 70); noise(0.25, 0.2, 400); },
      rocket() { tone(900, 0.14, 'sawtooth', 0.15, 200); },
      explode() { noise(0.35, 0.35, 200); tone(90, 0.4, 'sawtooth', 0.3, 40); },
      lose() { tone(220, 0.5, 'sawtooth', 0.28, 60); noise(0.4, 0.18); },
      launch() { tone(300, 0.18, 'triangle', 0.25, 700); },
      level() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.28), i * 90)); },
      gameover() { [400, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sawtooth', 0.25), i * 160)); },
      win() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'square', 0.25), i * 110)); },
      toggleMute() { muted = !muted; ensure(); master.gain.value = muted ? 0 : vol.master; if (!muted) resume(); return muted; },
      toggleMusic() { if (musicOn) stopMusic(); else startMusic(); return musicOn; },
      setMaster(v) { vol.master = clampA(v); saveVol(); if (master && !muted) master.gain.value = vol.master; },
      setMusicVol(v) { vol.music = clampA(v); saveVol(); if (musicOn && musicGain) musicGain.gain.value = musicTarget(); },
      setSfxVol(v) { vol.sfx = clampA(v); saveVol(); if (sfx) sfx.gain.value = vol.sfx; },
      setIntensity(x) { intensity = clampA(x); if (musicOn && musicGain) musicGain.gain.value = musicTarget(); },
      setTrack(i) { trackIdx = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length; },
      trackName() { return TRACKS[trackIdx].name; },
      get trackCount() { return TRACKS.length; },
      get vol() { return vol; },
      get muted() { return muted; },
      get musicOn() { return musicOn; }
    };
  })();

  // ============================================================
  //  Pomocnicze
  // ============================================================
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

  // ============================================================
  //  Motywy / skórki
  // ============================================================
  const THEMES = {
    neon: {
      name: 'NEON', nebula: '157, 78, 221', stars: ['#bfefff', '#7a6bff'],
      grid: 'rgba(0, 240, 255, 0.06)', accent: 190, accentColor: '#00f0ff',
      paddle: ['#aefcff', '#00f0ff', '#0077aa'], paddleGlow: '#00f0ff', paddleEnd: '#ff00e6',
      ball: ['#ffffff', '#aefcff', '#00d6ff'], ballGlow: '#9fefff', ballTrail: 190,
      brick: (h) => ({ h, s: 92 }),
      css: { cyan: '#00f0ff', magenta: '#ff00e6', purple: '#9d4edd' }, scan: false, tint: null
    },
    vapor: {
      name: 'VAPORWAVE', nebula: '180, 90, 255', stars: ['#ffd6f6', '#8be9ff'],
      grid: 'rgba(255, 120, 230, 0.07)', accent: 300, accentColor: '#ff77e6',
      paddle: ['#fff0fb', '#ff77e6', '#7a2bd6'], paddleGlow: '#ff77e6', paddleEnd: '#26e0ff',
      ball: ['#ffffff', '#ffd6f6', '#26e0ff'], ballGlow: '#ffb3ec', ballTrail: 300,
      brick: (h) => ({ h: (h + 110) % 360, s: 95 }),
      css: { cyan: '#26e0ff', magenta: '#ff77e6', purple: '#b15cff' }, scan: false, tint: 'rgba(60, 0, 60, 0.06)'
    },
    crt: {
      name: 'CRT RETRO', nebula: '120, 90, 30', stars: ['#ffe7a0', '#bf8f3f'],
      grid: 'rgba(255, 176, 0, 0.07)', accent: 40, accentColor: '#ffb000',
      paddle: ['#fff0c0', '#ffb000', '#a05a00'], paddleGlow: '#ffb000', paddleEnd: '#ff7000',
      ball: ['#ffffff', '#ffe7a0', '#ffb000'], ballGlow: '#ffd060', ballTrail: 40,
      brick: (h) => ({ h: 32 + (h / 360) * 22, s: 88 }),
      css: { cyan: '#ffb000', magenta: '#ff7000', purple: '#c98a00' }, scan: true, tint: 'rgba(40, 24, 0, 0.10)'
    },
    matrix: {
      name: 'MATRIX', nebula: '0, 200, 60', stars: ['#b6ffb6', '#39ff14'],
      grid: 'rgba(57, 255, 20, 0.08)', accent: 130, accentColor: '#39ff14',
      paddle: ['#d6ffd6', '#39ff14', '#0a7a0a'], paddleGlow: '#39ff14', paddleEnd: '#aaffaa',
      ball: ['#ffffff', '#aaffaa', '#39ff14'], ballGlow: '#39ff14', ballTrail: 130,
      brick: (h) => ({ h: 110 + (h / 360) * 40, s: 100 }),
      css: { cyan: '#39ff14', magenta: '#aaffaa', purple: '#1fbf0a' }, scan: true, tint: 'rgba(0, 40, 0, 0.12)'
    }
  };
  const THEME_KEY = 'neonBreakoutTheme';
  let themeKey = 'neon';
  try { const s = localStorage.getItem(THEME_KEY); if (s && THEMES[s]) themeKey = s; } catch {}
  let T = THEMES[themeKey];

  function applyTheme(key) {
    if (!THEMES[key]) return;
    themeKey = key; T = THEMES[key];
    try { localStorage.setItem(THEME_KEY, key); } catch {}
    const root = document.documentElement.style;
    root.setProperty('--neon-cyan', T.css.cyan);
    root.setProperty('--neon-magenta', T.css.magenta);
    root.setProperty('--neon-purple', T.css.purple);
    document.querySelectorAll('#theme-row .theme-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.theme === key));
  }

  // ============================================================
  //  Tło — gwiazdy paralaksy
  // ============================================================
  const stars = [];
  for (let i = 0; i < 140; i++) stars.push({ x: rand(0, W), y: rand(0, H), z: rand(0.2, 1), r: rand(0.4, 1.8) });

  // ============================================================
  //  Encje
  // ============================================================
  const paddle = { w: 130, h: 16, x: W / 2 - 65, y: H - 56, targetX: W / 2, vx: 0, glow: 0, squash: 0 };

  let balls = [];
  function newBall(x, y, vx, vy) { return { x, y, vx, vy, r: 9, trail: [], stuck: false, stickDX: 0 }; }

  let bricks = [];
  let particles = [];
  let powerups = [];
  let rockets = [];
  let floats = [];
  let boss = null;
  let bossShots = [];
  let shake = 0, flash = 0, flashHue = 320;
  let hitStop = 0, zoom = 1, bgEnergy = 0, gravity = 0; // juice + dynamiczne tło + grawitacja
  const isBossLevel = (lvl) => lvl % 5 === 0;
  function punch(z, hs) { zoom = Math.max(zoom, z); hitStop = Math.max(hitStop, hs); }
  let onBossDamaged = null, onBossDefeated = null; // hooki dla osiągnięć

  // ---------- Aktywne efekty (czas w klatkach 60 fps) ----------
  const FX = {
    wide: 0, slow: 0, sticky: 0, rockets: 0, fireball: 0, big: 0, magnet: 0, shield: 0, double: 0, // pozytywne
    shrink: 0, speedup: 0, reverse: 0 // negatywne
  };
  function grant(k, frames) { FX[k] = Math.max(FX[k], frames); }
  let rocketCd = 0;

  // ---------- Stan gry ----------
  const State = { MENU: 0, READY: 1, PLAYING: 2, PAUSED: 3, LEVELCLEAR: 4, GAMEOVER: 5, WIN: 6 };
  let state = State.MENU;
  let score = 0, lives = 3, level = 1, combo = 0, comboTimer = 0;
  let levelClearTimer = 0, awaitingName = false, lostThisLevel = false;

  const BASE_SPEED = 6.2;
  const MAX_LEVEL = 25;

  function speedTarget() {
    let s = BASE_SPEED + (level - 1) * 0.3;
    if (FX.slow > 0) s *= 0.66;
    if (FX.speedup > 0) s *= 1.5;
    return s;
  }
  function paddleTargetW() {
    let w = 130;
    if (FX.wide > 0) w *= 1.6;
    if (FX.shrink > 0) w *= 0.58;
    return w;
  }
  function ballRadius() { return FX.big > 0 ? 15 : 9; }

  // ============================================================
  //  Poziomy (proceduralne wzory)
  // ============================================================
  const COLS = 13, ROWS = 8, brickW = 56, brickH = 24, gapX = 6, gapY = 8, fieldTop = 84;
  const fieldLeft = (W - (COLS * (brickW + gapX) - gapX)) / 2;

  const patterns = [
    (c, r) => (r >= 1 && r <= 5 && c >= r && c <= COLS - 1 - r) ? (6 - r) : 0,
    (c, r) => (r % 2 === 0 && r < 6) ? (r < 2 ? 3 : 2) : (r < 6 ? 1 : 0),
    (c, r) => { const cc = COLS / 2 - 0.5, d = Math.abs(c - cc) + Math.abs(r - 3) * 1.4; return d < 5 ? (d < 2 ? 4 : d < 3.5 ? 2 : 1) : 0; },
    (c, r) => r < 6 ? ((c + r) % 2 === 0 ? 3 : 1) : 0,
    (c, r) => { if (r > 6) return 0; const w = Math.sin(c * 0.6 + r * 0.4); return w > -0.2 ? (r < 2 ? 4 : 2) : (r < 4 ? 1 : 0); }
  ];

  // Losuje typ cegły specjalnej — szanse rosną z poziomem
  function rollBrickType() {
    const roll = Math.random();
    if (roll < 0.05) return 'multiplier';                 // złota — gwarantowany bonus
    if (level >= 2 && roll < 0.13) return 'explosive';    // wybuchowa
    if (level >= 3 && roll < 0.20) return 'steel';        // stalowa (nierozbijalna)
    if (level >= 4 && roll < 0.27) return 'moving';       // ruchoma
    if (level >= 5 && roll < 0.33) return 'regen';        // regenerująca
    return 'normal';
  }

  // ---- Plansze "artystyczne" (napis z cegieł) ----
  const FONT5 = {
    L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
    O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
    E: ['XXX', 'X..', 'XXX', 'X..', 'XXX'],
    K: ['X.X', 'XX.', 'X..', 'XX.', 'X.X']
  };
  function wordBitmap(word) {
    const rows = ['', '', '', '', ''];
    word.split('').forEach((ch, i) => {
      const g = FONT5[ch];
      for (let r = 0; r < 5; r++) rows[r] += (i ? '.' : '') + g[r];
    });
    return rows;
  }
  // które poziomy są artystyczne i jaki mają napis
  function artWordFor(lvl) {
    return (lvl % 5 === 3) ? 'LOLEK' : null; // poziomy 3, 8, 13, 18, 23
  }

  function buildArtLevel(word) {
    bricks = [];
    const rows = wordBitmap(word);
    const cols = rows[0].length, rws = rows.length;
    const cw = 40, ch = 26, gx = 5, gy = 7;
    const cellW = cw + gx, cellH = ch + gy;
    const left = (W - (cols * cellW - gx)) / 2;
    const top = fieldTop + 36;
    for (let r = 0; r < rws; r++) {
      for (let c = 0; c < cols; c++) {
        if (rows[r][c] !== 'X') continue;
        const x = left + c * cellW, y = top + r * cellH;
        bricks.push({
          x, y, w: cw, h: ch, hp: 2, maxHp: 2,
          hue: ((c / cols) * 300 + 180) % 360, alive: true, hit: 0,
          type: 'normal', vx: 0, originX: x, range: 0, regen: 0, heal: 0, pulse: rand(0, TAU)
        });
      }
    }
  }

  function buildLevel() {
    boss = null; bossShots = [];
    Audio.setTrack(isBossLevel(level) ? 2 : (level - 1) % 3);
    if (isBossLevel(level)) { buildBossLevel(); return; }
    const word = artWordFor(level);
    if (word) { buildArtLevel(word); return; }
    bricks = [];
    const pat = patterns[(level - 1) % patterns.length];
    const extra = Math.floor((level - 1) / patterns.length);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let hp = pat(c, r);
        if (hp <= 0) continue;
        hp += extra;
        const x = fieldLeft + c * (brickW + gapX);
        const y = fieldTop + r * (brickH + gapY);
        const type = rollBrickType();
        const br = {
          x, y, w: brickW, h: brickH, hp, maxHp: hp,
          hue: ((r / ROWS) * 280 + 180) % 360, alive: true, hit: 0,
          type, vx: 0, originX: x, range: 0, regen: 0, heal: 0, pulse: rand(0, TAU)
        };
        if (type === 'explosive' || type === 'multiplier' || type === 'steel') { br.hp = 1; br.maxHp = 1; }
        else if (type === 'regen') { br.hp = br.maxHp = Math.max(2, hp); }
        else if (type === 'moving') {
          br.vx = (Math.random() < 0.5 ? -1 : 1) * (0.8 + level * 0.06);
          br.range = brickW + gapX; // patrol ±1 komórka
        }
        bricks.push(br);
      }
    }
  }

  // ============================================================
  //  Definicje power-upów
  // ============================================================
  // POZYTYWNE (warto łapać)
  const GOOD = [
    { id: 'multi',   label: '×3',  hue: 300, fn: applyMulti },
    { id: 'wide',    label: '↔',   hue: 190, fn: () => grant('wide', 780) },
    { id: 'slow',    label: '⏳',  hue: 150, fn: () => grant('slow', 600) },
    { id: 'sticky',  label: '⊕',   hue: 95,  fn: () => grant('sticky', 660) },
    { id: 'rockets', label: '🚀',  hue: 205, fn: () => grant('rockets', 600) },
    { id: 'fireball',label: '🔥',  hue: 25,  fn: () => grant('fireball', 480) },
    { id: 'big',     label: '⬤',   hue: 270, fn: () => grant('big', 600) },
    { id: 'shield',  label: '🛡',  hue: 180, fn: () => grant('shield', 900) },
    { id: 'magnet',  label: '🧲',  hue: 330, fn: () => grant('magnet', 780) },
    { id: 'double',  label: '2×',  hue: 55,  fn: () => grant('double', 660) },
    { id: 'life',    label: '♥',   hue: 340, fn: () => { lives++; updateHUD(); } },
    { id: 'score',   label: '★',   hue: 50,  fn: () => addScore(500) },
  ];
  // NEGATYWNE (uciekaj!)
  const BAD = [
    { id: 'bomb',    label: '💣',  fn: bombHit },
    { id: 'negate',  label: '✖',   fn: negateAll },
    { id: 'shrink',  label: '><',  fn: () => grant('shrink', 540) },
    { id: 'speedup', label: '»»',  fn: () => grant('speedup', 480) },
    { id: 'reverse', label: '⇄',   fn: () => grant('reverse', 420) },
  ];

  function applyMulti() {
    const src = balls.find(b => !b.stuck) || balls[0];
    if (!src) return;
    const speed = Math.hypot(src.vx, src.vy) || speedTarget();
    for (let i = 0; i < 2; i++) {
      const dir = Math.atan2(src.vy || -1, src.vx || 0) + rand(-0.6, 0.6);
      balls.push(newBall(src.x, src.y, Math.cos(dir) * speed, Math.sin(dir) * speed));
    }
  }
  function negateAll() {
    ['wide', 'slow', 'sticky', 'rockets', 'fireball', 'big', 'magnet', 'shield', 'double'].forEach(k => FX[k] = 0);
    flash = 0.6; flashHue = 280; shake = 12;
    floatText(paddle.x + paddle.w / 2, paddle.y - 30, 'NEGACJA!', 280);
  }
  function bombHit() {
    flash = 0.85; flashHue = 15; shake = 28; punch(1.06, 4);
    Audio.explode();
    for (let k = 0; k < 36; k++) burst(rand(paddle.x, paddle.x + paddle.w), paddle.y, rand(10, 40), 6, 1.6);
    lives--; updateHUD();
    if (lives <= 0) gameOver();
  }

  function spawnPowerup(x, y) {
    const spawnChance = 0.20 + combo * 0.008;
    if (Math.random() > spawnChance) return;
    const badChance = Math.min(0.14 + level * 0.012, 0.34);
    const bad = Math.random() < badChance;
    const def = bad ? BAD[(Math.random() * BAD.length) | 0] : GOOD[(Math.random() * GOOD.length) | 0];
    powerups.push({ x, y, vy: bad ? 3.0 : 2.4, r: 16, def, good: !bad, spin: rand(0, TAU), pulse: 0 });
  }

  // gwarantowany dobry bonus (z cegły mnożnikowej)
  function spawnGood(x, y) {
    const def = GOOD[(Math.random() * GOOD.length) | 0];
    powerups.push({ x, y, vy: 2.4, r: 16, def, good: true, spin: rand(0, TAU), pulse: 0 });
  }

  // ============================================================
  //  Cząsteczki / floating text
  // ============================================================
  function burst(x, y, hue, n = 14, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(1, 6) * power;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, decay: rand(0.012, 0.03), r: rand(1.5, 4), hue: hue + rand(-25, 25) });
    }
  }
  function floatText(x, y, text, hue) { floats.push({ x, y, text, hue, life: 1, vy: -0.8 }); }

  // ============================================================
  //  HUD
  // ============================================================
  function updateHUD() {
    $score.textContent = score.toLocaleString('pl-PL');
    $level.textContent = level;
    $lives.textContent = lives > 0 ? '♥'.repeat(Math.min(lives, 6)) : '–';
  }
  function addScore(n) {
    const mult = (1 + combo * 0.08) * (FX.double > 0 ? 2 : 1);
    score += Math.round(n * mult);
    updateHUD();
  }
  function showCombo() {
    if (combo > stats.maxCombo) { stats.maxCombo = combo; bumpStats(); }
    if (combo < 2) return;
    $comboText.textContent = 'x' + combo;
    $combo.classList.remove('show'); void $combo.offsetWidth; $combo.classList.add('show');
    clearTimeout(showCombo._t);
    showCombo._t = setTimeout(() => $combo.classList.remove('show'), 800);
  }

  // ============================================================
  //  Sterowanie
  // ============================================================
  const keys = { left: false, right: false };
  let usingMouse = false, lastPointerX = W / 2;

  function applyPointer(worldX) {
    lastPointerX = worldX;
    const x = FX.reverse > 0 ? (W - worldX) : worldX;
    paddle.targetX = clamp(x, paddle.w / 2, W - paddle.w / 2);
  }

  window.addEventListener('keydown', (e) => {
    if (e.target === $nameInput) return; // nie przechwytuj klawiszy podczas wpisywania nicku
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.left = true; usingMouse = false; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.right = true; usingMouse = false; }
    if (e.code === 'Space') { e.preventDefault(); onAction(); }
    if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); if (state === State.PLAYING || state === State.PAUSED) togglePause(); }
    if (e.code === 'Enter' && !awaitingName && (state === State.MENU || state === State.GAMEOVER || state === State.WIN)) startGame();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  });

  function pointerToWorld(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) / rect.width * W;
  }
  canvas.addEventListener('mousemove', (e) => { usingMouse = true; applyPointer(pointerToWorld(e.clientX)); });
  canvas.addEventListener('mousedown', () => onAction());
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (e.touches[0]) { usingMouse = true; applyPointer(pointerToWorld(e.touches[0].clientX)); } }, { passive: false });
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onAction(); }, { passive: false });

  bindTouch('touch-left', () => keys.left = true, () => keys.left = false);
  bindTouch('touch-right', () => keys.right = true, () => keys.right = false);
  bindTouch('touch-launch', () => onAction());
  function bindTouch(id, on, off) {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); usingMouse = false; on(); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); off && off(); }, { passive: false });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); on(); });
    el.addEventListener('mouseup', () => off && off());
  }

  // Akcja kontekstowa: wystrzel piłkę / odklej / pauza
  function onAction() {
    if (state === State.READY) { releaseStuck(); state = State.PLAYING; Audio.launch(); return; }
    if (state === State.PLAYING) {
      if (balls.some(b => b.stuck)) { releaseStuck(); Audio.launch(); return; }
      togglePause();
    } else if (state === State.PAUSED) { togglePause(); }
  }

  $startBtn.addEventListener('click', () => {
    if (state === State.PAUSED) togglePause();
    else if (state === State.MENU || state === State.GAMEOVER || state === State.WIN) startGame();
  });
  $muteBtn.addEventListener('click', () => {
    const m = Audio.toggleMute();
    $muteBtn.textContent = m ? '🔇 WYCISZONE' : '🔊 DŹWIĘK';
    $muteBtn.classList.toggle('off', m);
  });
  $musicBtn.addEventListener('click', () => {
    const on = Audio.toggleMusic();
    $musicBtn.textContent = on ? '🎵 MUZYKA' : '🎵 MUZYKA (off)';
    $musicBtn.classList.toggle('off', !on);
  });
  document.querySelectorAll('#theme-row .theme-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });
  // suwaki głośności
  const $volMaster = document.getElementById('vol-master');
  const $volMusic = document.getElementById('vol-music');
  const $volSfx = document.getElementById('vol-sfx');
  $volMaster.value = Math.round(Audio.vol.master * 100);
  $volMusic.value = Math.round(Audio.vol.music * 100);
  $volSfx.value = Math.round(Audio.vol.sfx * 100);
  $volMaster.addEventListener('input', () => Audio.setMaster($volMaster.value / 100));
  $volMusic.addEventListener('input', () => Audio.setMusicVol($volMusic.value / 100));
  $volSfx.addEventListener('input', () => { Audio.setSfxVol($volSfx.value / 100); });
  $volSfx.addEventListener('change', () => Audio.power());

  // ============================================================
  //  Tabela najlepszych wyników (localStorage)
  // ============================================================
  const HS_KEY = 'neonBreakoutScores';
  function loadScores() { try { return JSON.parse(localStorage.getItem(HS_KEY)) || []; } catch { return []; } }
  function saveScores(a) { try { localStorage.setItem(HS_KEY, JSON.stringify(a)); } catch {} }
  function qualifies(s) { const a = loadScores(); return s > 0 && (a.length < 10 || s > a[a.length - 1].score); }
  function addScoreEntry(name, s, lvl) {
    const a = loadScores();
    a.push({ name, score: s, level: lvl });
    a.sort((x, y) => y.score - x.score);
    a.splice(10);
    saveScores(a);
    return a;
  }
  let lastMeIdx = -1;
  function renderScoreboard(meIdx = -1) {
    lastMeIdx = meIdx;
    const a = loadScores();
    $scoreList.innerHTML = '';
    if (a.length === 0) {
      $scoreList.innerHTML = '<li class="empty"><span class="nm">— brak wyników —</span></li>';
    } else {
      a.forEach((e, i) => {
        const li = document.createElement('li');
        if (i === meIdx) li.className = 'me';
        li.innerHTML = `<span class="nm">${escapeHtml(e.name)}</span><span class="sc">${e.score.toLocaleString('pl-PL')}</span>`;
        $scoreList.appendChild(li);
      });
    }
  }
  function escapeHtml(s) { return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

  // ============================================================
  //  Osiągnięcia i statystyki (localStorage)
  // ============================================================
  const ACHIEVEMENTS = [
    { id: 'first', icon: '🧱', name: 'Pierwsze starcie', desc: 'Rozbij 100 cegieł', test: s => s.bricks >= 100 },
    { id: 'breaker', icon: '🏗️', name: 'Burzyciel', desc: 'Rozbij 1000 cegieł', test: s => s.bricks >= 1000 },
    { id: 'collector', icon: '🎁', name: 'Zbieracz', desc: 'Złap 100 power-upów', test: s => s.powerups >= 100 },
    { id: 'sapper', icon: '💣', name: 'Saper', desc: 'Odpal 50 wybuchowych cegieł', test: s => s.explosives >= 50 },
    { id: 'gold', icon: '⭐', name: 'Złotko', desc: 'Rozbij 25 mnożnikowych cegieł', test: s => s.multipliers >= 25 },
    { id: 'combo10', icon: '🔥', name: 'Kombinator', desc: 'Osiągnij combo ×10', test: s => s.maxCombo >= 10 },
    { id: 'combo20', icon: '⚡', name: 'Mistrz combo', desc: 'Osiągnij combo ×20', test: s => s.maxCombo >= 20 },
    { id: 'flawless', icon: '🛡️', name: 'Bez skazy', desc: 'Ukończ poziom bez utraty życia', test: s => s.flawless },
    { id: 'boss1', icon: '👹', name: 'Pogromca', desc: 'Pokonaj pierwszego bossa', test: s => s.bosses >= 1 },
    { id: 'survivor', icon: '🚀', name: 'Wytrwały', desc: 'Dojdź do poziomu 10', test: s => s.maxLevel >= 10 },
    { id: 'highroller', icon: '💎', name: 'Wysokie loty', desc: 'Zdobądź 50 000 pkt w jednej grze', test: s => s.bestScore >= 50000 },
    { id: 'champion', icon: '👑', name: 'Legenda neonu', desc: 'Ukończ całą grę (poziom 25)', test: s => s.won },
  ];
  const STATS_KEY = 'neonBreakoutStats', ACH_KEY = 'neonBreakoutAch';
  const defaultStats = () => ({ bricks: 0, powerups: 0, explosives: 0, multipliers: 0, bosses: 0, maxLevel: 1, maxCombo: 0, bestScore: 0, games: 0, flawless: false, won: false });
  let stats = defaultStats();
  try { stats = Object.assign(defaultStats(), JSON.parse(localStorage.getItem(STATS_KEY)) || {}); } catch {}
  let unlocked = new Set();
  try { unlocked = new Set(JSON.parse(localStorage.getItem(ACH_KEY)) || []); } catch {}
  function saveStats() { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch {} }
  function saveUnlocked() { try { localStorage.setItem(ACH_KEY, JSON.stringify([...unlocked])); } catch {} }
  let statsDirty = false;
  function bumpStats() { statsDirty = true; checkAchievements(); } // zapis throttlowany niżej
  setInterval(() => { if (statsDirty) { saveStats(); statsDirty = false; } }, 1500);
  window.addEventListener('beforeunload', () => { if (statsDirty) saveStats(); });
  function checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (!unlocked.has(a.id) && a.test(stats)) {
        unlocked.add(a.id); saveUnlocked(); toastAchievement(a);
      }
    }
  }

  const $achList = document.getElementById('ach-list');
  const $achStats = document.getElementById('ach-stats');
  const $achievements = document.getElementById('achievements');
  const $panelTabs = document.getElementById('panel-tabs');
  const $toast = document.getElementById('ach-toast');

  function renderAchievements() {
    const got = ACHIEVEMENTS.filter(a => unlocked.has(a.id)).length;
    $achStats.innerHTML =
      `<span>🏅 ${got}/${ACHIEVEMENTS.length}</span>` +
      `<span>🧱 ${stats.bricks}</span>` +
      `<span>🎁 ${stats.powerups}</span>` +
      `<span>👹 ${stats.bosses}</span>` +
      `<span>🔥 ×${stats.maxCombo}</span>` +
      `<span>💎 ${stats.bestScore.toLocaleString('pl-PL')}</span>`;
    $achList.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const has = unlocked.has(a.id);
      const div = document.createElement('div');
      div.className = 'ach-item' + (has ? ' got' : '');
      div.innerHTML = `<span class="ach-ic">${a.icon}</span><span class="ach-tx"><b>${a.name}</b><i>${a.desc}</i></span><span class="ach-st">${has ? '✓' : '🔒'}</span>`;
      $achList.appendChild(div);
    }
  }

  const toastQ = [];
  function toastAchievement(a) { toastQ.push(a); if (toastQ.length === 1) showNextToast(); }
  function showNextToast() {
    const a = toastQ[0]; if (!a) return;
    $toast.innerHTML = `<span class="t-ic">${a.icon}</span><span class="t-tx"><b>OSIĄGNIĘCIE</b><span>${a.name}</span></span>`;
    $toast.classList.add('show');
    Audio.power();
    setTimeout(() => {
      $toast.classList.remove('show');
      setTimeout(() => { toastQ.shift(); showNextToast(); }, 420);
    }, 2600);
  }

  // ---- Menedżer paneli (TOP 10 / Osiągnięcia) ----
  let activePanel = 'scores';
  function setPanel(p) {
    activePanel = p;
    $scoreboard.classList.toggle('hidden', p !== 'scores');
    $achievements.classList.toggle('hidden', p !== 'ach');
    document.querySelectorAll('#panel-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.panel === p));
  }
  function showPanels() {
    renderScoreboard(lastMeIdx); renderAchievements();
    $panelTabs.classList.remove('hidden');
    setPanel(activePanel);
  }
  function hidePanels() {
    $panelTabs.classList.add('hidden');
    $scoreboard.classList.add('hidden');
    $achievements.classList.add('hidden');
  }
  document.querySelectorAll('#panel-tabs .tab-btn').forEach(b =>
    b.addEventListener('click', () => setPanel(b.dataset.panel)));

  $saveScore.addEventListener('click', commitName);
  $nameInput.addEventListener('keydown', (e) => { if (e.code === 'Enter') { e.preventDefault(); commitName(); } });
  function commitName() {
    if (!awaitingName) return;
    const name = ($nameInput.value.trim() || 'GRACZ').slice(0, 12).toUpperCase();
    const arr = addScoreEntry(name, score, level);
    const idx = arr.findIndex(e => e.name === name && e.score === score && e.level === level);
    awaitingName = false;
    $nameEntry.classList.add('hidden');
    renderScoreboard(idx);
    setPanel('scores'); showPanels();
    $startBtn.classList.remove('start-hidden');
  }

  // ============================================================
  //  Przepływ gry
  // ============================================================
  function resetFX() { for (const k in FX) FX[k] = 0; }

  function startGame() {
    score = 0; lives = 3; level = 1; combo = 0;
    powerups = []; particles = []; floats = []; rockets = [];
    resetFX();
    paddle.w = 130;
    awaitingName = false;
    lostThisLevel = false;
    stats.games++; bumpStats();
    $nameEntry.classList.add('hidden');
    hidePanels();
    $startBtn.classList.remove('start-hidden');
    buildLevel();
    resetBallOnPaddle();
    updateHUD();
    hideOverlay();
    state = State.READY;
  }

  function resetBallOnPaddle() {
    balls = [newBall(paddle.x + paddle.w / 2, paddle.y - 14, 0, 0)];
    balls[0].stuck = true;
    balls[0].stickDX = paddle.w / 2;
  }

  function releaseStuck() {
    for (const b of balls) {
      if (!b.stuck) continue;
      const off = clamp((b.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -0.85, 0.85);
      const ang = off * (Math.PI * 0.4) - Math.PI / 2;
      const s = speedTarget();
      b.vx = Math.cos(ang) * s; b.vy = Math.sin(ang) * s; b.stuck = false;
    }
  }

  function togglePause() {
    if (state === State.PLAYING) {
      state = State.PAUSED;
      showOverlay('PAUZA', 'Naciśnij SPACJĘ / P aby kontynuować', null, 'WZNÓW');
      showPanels(); setPanel('ach'); // pokaż bieżący postęp osiągnięć podczas pauzy
    } else if (state === State.PAUSED) { hideOverlay(); state = State.PLAYING; }
  }

  function loseLife() {
    lives--; updateHUD();
    shake = 18; flash = 0.5; flashHue = 320; combo = 0;
    Audio.lose();
    lostThisLevel = true;
    if (lives <= 0) { gameOver(); return; }
    resetFX();
    bossShots = [];
    paddle.w = paddleTargetW();
    resetBallOnPaddle();
    state = State.READY;
  }

  function gameOver() {
    state = State.GAMEOVER;
    balls = [];
    Audio.gameover();
    showEndScreen('GAME OVER', 'Neon przygasł...');
  }

  function nextLevel() {
    // poziom właśnie ukończony — czy bez utraty życia?
    if (!lostThisLevel) { stats.flawless = true; bumpStats(); }
    if (level >= MAX_LEVEL) {
      stats.won = true; bumpStats();
      state = State.WIN;
      Audio.win();
      showEndScreen('ZWYCIĘSTWO!', `Opanowałeś wszystkie ${MAX_LEVEL} poziomów`);
      return;
    }
    level++;
    stats.maxLevel = Math.max(stats.maxLevel, level); bumpStats();
    lostThisLevel = false;
    powerups = []; rockets = [];
    resetFX();
    buildLevel();
    resetBallOnPaddle();
    updateHUD();
    Audio.level();
    state = State.READY;
  }

  // ============================================================
  //  Overlay
  // ============================================================
  function showOverlay(title, sub, statsHTML, btn) {
    $overlayTitle.textContent = title;
    $overlayTitle.setAttribute('data-text', title);
    $overlaySub.textContent = sub;
    if (statsHTML) { $overlayStats.innerHTML = statsHTML; $overlayStats.classList.remove('hidden'); }
    else $overlayStats.classList.add('hidden');
    $nameEntry.classList.add('hidden');
    hidePanels();
    $startBtn.textContent = btn || 'START';
    $startBtn.classList.remove('start-hidden');
    $overlay.classList.remove('hidden');
  }
  function hideOverlay() { $overlay.classList.add('hidden'); }

  function showEndScreen(title, sub) {
    $overlayTitle.textContent = title;
    $overlayTitle.setAttribute('data-text', title);
    $overlaySub.textContent = sub;
    $overlayStats.innerHTML = `<div><span class="big">${score.toLocaleString('pl-PL')}</span></div><div>poziom ${level}</div>`;
    $overlayStats.classList.remove('hidden');
    $startBtn.textContent = 'JESZCZE RAZ';
    $overlay.classList.remove('hidden');

    // zapis statystyk z gry
    stats.bestScore = Math.max(stats.bestScore, score); bumpStats();

    if (qualifies(score)) {
      awaitingName = true;
      $nameEntry.classList.remove('hidden');
      hidePanels();
      $startBtn.classList.add('start-hidden');
      $nameInput.value = '';
      setTimeout(() => $nameInput.focus(), 60);
    } else {
      awaitingName = false;
      $nameEntry.classList.add('hidden');
      renderScoreboard(-1);
      showPanels();
      $startBtn.classList.remove('start-hidden');
    }
  }

  // ============================================================
  //  Update
  // ============================================================
  function update(dt) {
    for (const s of stars) { s.y += s.z * 0.25 * dt; if (s.y > H) { s.y = 0; s.x = rand(0, W); } }

    shake *= 0.86; if (shake < 0.1) shake = 0;
    flash *= 0.9; if (flash < 0.01) flash = 0;
    paddle.glow *= 0.9;
    paddle.squash *= 0.85;
    bgEnergy = lerp(bgEnergy, clamp(combo / 12, 0, 1), 0.05);

    // timery efektów
    for (const k in FX) if (FX[k] > 0) FX[k] = Math.max(0, FX[k] - dt);

    updateParticles(dt);
    updateFloats(dt);
    updateRockets(dt);

    if (state !== State.PLAYING && state !== State.READY) return;

    // ---- Paletka ----
    if (!usingMouse) {
      const dir = FX.reverse > 0 ? -1 : 1;
      if (keys.left) paddle.targetX -= 11 * dt * dir;
      if (keys.right) paddle.targetX += 11 * dt * dir;
    }
    paddle.w = lerp(paddle.w, paddleTargetW(), 0.15);
    paddle.targetX = clamp(paddle.targetX, paddle.w / 2, W - paddle.w / 2);
    const cx = paddle.x + paddle.w / 2;
    const nx = lerp(cx, paddle.targetX, 0.3);
    paddle.vx = nx - cx;
    paddle.x = clamp(nx - paddle.w / 2, 0, W - paddle.w);
    paddle.y = H - 56;

    // auto-fire rakiet
    if (FX.rockets > 0 && state === State.PLAYING) {
      rocketCd -= dt;
      if (rocketCd <= 0) { fireRockets(); rocketCd = 16; }
    }

    // ---- Power-upy spadają ----
    const pcx = paddle.x + paddle.w / 2;
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.y += p.vy * dt; p.spin += 0.08 * dt; p.pulse += 0.15 * dt;
      // magnes: przyciąga dobre, odpycha złe
      if (FX.magnet > 0) {
        const pull = (p.good ? 1 : -1) * 0.05;
        p.x += (pcx - p.x) * pull * dt;
      }
      const caught = p.y + p.r > paddle.y && p.y - p.r < paddle.y + paddle.h &&
        p.x > paddle.x - p.r && p.x < paddle.x + paddle.w + p.r;
      if (caught) {
        p.def.fn();
        if (p.good) {
          Audio.power();
          burst(p.x, p.y, p.def.hue, 22, 1.3);
          floatText(p.x, p.y - 10, p.def.label, p.def.hue);
          paddle.glow = 1;
          stats.powerups++; bumpStats();
        } else {
          Audio.bad();
          burst(p.x, p.y, 10, 22, 1.3);
        }
        powerups.splice(i, 1);
      } else if (p.y - p.r > H) {
        powerups.splice(i, 1);
      }
    }

    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }

    updateBricks(dt);
    if (state === State.PLAYING) {
      updateBoss(dt); updateBossShots(dt);
      Audio.setIntensity(clamp(combo / 14 + (boss && boss.alive ? 0.3 : 0) + (lives <= 1 ? 0.25 : 0), 0, 1));
    }

    // ---- Piłki ----
    if (state === State.READY) {
      const b = balls[0];
      if (b) { b.r = ballRadius(); b.x = paddle.x + paddle.w / 2; b.y = paddle.y - b.r - 5; pushTrail(b); }
      return;
    }

    const starget = speedTarget();
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.r = ballRadius();
      if (b.stuck) {
        b.x = clamp(paddle.x + b.stickDX, b.r, W - b.r);
        b.y = paddle.y - b.r - 2;
        pushTrail(b);
        continue;
      }
      // normalizacja prędkości do bieżącego targetu
      const m = Math.hypot(b.vx, b.vy);
      if (m > 0) { b.vx = b.vx / m * starget; b.vy = b.vy / m * starget; }
      stepBall(b, dt);
      if (b.y - b.r > H) { burst(b.x, H - 6, 0, 16, 1); balls.splice(i, 1); }
    }

    // jeśli sticky wygasł, odklej piłki
    if (FX.sticky <= 0 && state === State.PLAYING && balls.some(b => b.stuck)) releaseStuck();

    if (balls.length === 0) { loseLife(); return; }

    if (bricks.every(br => !br.alive || br.type === 'steel') && (!boss || !boss.alive)) {
      state = State.LEVELCLEAR; levelClearTimer = 70; shake = 14; punch(1.06, 5);
      for (let k = 0; k < 40; k++) burst(rand(0, W), rand(fieldTop, H / 2), rand(180, 320), 6, 1.4);
    }
  }

  function updateBricks(dt) {
    for (const br of bricks) {
      if (!br.alive) continue;
      if (br.type === 'moving') {
        br.x += br.vx * dt;
        const lo = Math.max(2, br.originX - br.range);
        const hi = Math.min(W - br.w - 2, br.originX + br.range);
        if (br.x < lo) { br.x = lo; br.vx = Math.abs(br.vx); }
        else if (br.x > hi) { br.x = hi; br.vx = -Math.abs(br.vx); }
      } else if (br.type === 'regen' && br.hp < br.maxHp) {
        br.regen += dt;
        if (br.regen > 150) { br.hp++; br.regen = 0; br.heal = 1; }
      }
      if (br.heal > 0) br.heal *= 0.92;
      br.pulse += 0.05 * dt;
    }
  }

  function pushTrail(b) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 14) b.trail.shift(); }

  function stepBall(b, dt) {
    if (gravity) b.vy += gravity * dt; // tryb grawitacji — tor wygina się w dół
    const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 4));
    const sx = (b.vx * dt) / steps, sy = (b.vy * dt) / steps;
    for (let s = 0; s < steps; s++) {
      b.x += sx; b.y += sy;

      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); Audio.wall(); burst(b.x, b.y, 200, 5, 0.7); }
      else if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); Audio.wall(); burst(b.x, b.y, 200, 5, 0.7); }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); Audio.wall(); burst(b.x, b.y, 200, 5, 0.7); }

      // tarcza (dolna bariera)
      if (FX.shield > 0 && b.vy > 0 && b.y + b.r > H - 14 && b.y < H - 6) {
        b.y = H - 14 - b.r; b.vy = -Math.abs(b.vy);
        burst(b.x, H - 14, 180, 8, 0.9); Audio.wall();
      }

      // paletka
      if (b.vy > 0 && !b.stuck && b.y + b.r > paddle.y && b.y - b.r < paddle.y + paddle.h &&
          b.x > paddle.x - b.r && b.x < paddle.x + paddle.w + b.r) {
        if (FX.sticky > 0) {
          b.stuck = true; b.vx = 0; b.vy = 0;
          b.stickDX = clamp(b.x - paddle.x, 8, paddle.w - 8);
          paddle.glow = 1; Audio.paddle();
          return;
        }
        b.y = paddle.y - b.r;
        const rel = (b.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        const ang = rel * (Math.PI * 0.42) - Math.PI / 2;
        const spd = speedTarget();
        b.vx = Math.cos(ang) * spd + paddle.vx * 0.35;
        b.vy = Math.sin(ang) * spd;
        const m = Math.hypot(b.vx, b.vy); b.vx = b.vx / m * spd; b.vy = b.vy / m * spd;
        paddle.glow = 1; paddle.squash = 1; Audio.paddle();
        burst(b.x, paddle.y, 190, 8, 0.8);
        combo = 0;
      }

      hitBricks(b);
      hitBoss(b);
    }
    pushTrail(b);
  }

  function bounceOff(br, b) {
    const oL = (b.x + b.r) - br.x, oR = (br.x + br.w) - (b.x - b.r);
    const oT = (b.y + b.r) - br.y, oB = (br.y + br.h) - (b.y - b.r);
    const minX = Math.min(oL, oR), minY = Math.min(oT, oB);
    if (minX < minY) { b.vx = -b.vx; b.x += oL < oR ? -minX : minX; }
    else { b.vy = -b.vy; b.y += oT < oB ? -minY : minY; }
  }

  function hitBricks(b) {
    for (let i = 0; i < bricks.length; i++) {
      const br = bricks[i];
      if (!br.alive) continue;
      if (b.x + b.r < br.x || b.x - b.r > br.x + br.w || b.y + b.r < br.y || b.y - b.r > br.y + br.h) continue;

      // stalowa — zawsze odbija i blokuje (nawet ognistą kulę), nie do zniszczenia
      if (br.type === 'steel') {
        bounceOff(br, b); br.hit = 1;
        Audio.steel(); burst(b.x, b.y, 205, 6, 0.8);
        break;
      }
      if (FX.fireball > 0) { damageBrick(br, b, true); continue; } // przebija resztę
      bounceOff(br, b);
      damageBrick(br, b, false);
      break;
    }
  }

  function damageBrick(br, b, pierce) {
    if (br.type === 'steel') return;
    if (pierce) br.hp = 0; else br.hp--;
    br.hit = 1; br.regen = 0;
    combo++; comboTimer = 90; showCombo();
    Audio.brick(combo);
    burst(b.x, b.y, br.hue, 8, 0.9);
    if (br.hp <= 0) destroyBrick(br, true);
    else addScore(15);
  }

  function destroyBrick(br, allowDrop) {
    if (!br.alive) return;
    br.alive = false;
    const isMult = br.type === 'multiplier';
    stats.bricks++; if (isMult) stats.multipliers++; bumpStats();
    const pts = (isMult ? 300 : 80) * Math.max(1, br.maxHp);
    addScore(pts);
    const hue = isMult ? 48 : (br.type === 'explosive' ? 18 : br.hue);
    floatText(br.x + br.w / 2, br.y, (isMult ? '★ +' : '+') + Math.round(pts), hue);
    burst(br.x + br.w / 2, br.y + br.h / 2, hue, isMult ? 30 : 20, 1.2);
    shake = Math.min(shake + 3, 12);
    if (allowDrop) {
      if (isMult) spawnGood(br.x + br.w / 2, br.y + br.h / 2);
      else spawnPowerup(br.x + br.w / 2, br.y + br.h / 2);
    }
    if (br.type === 'explosive') explode(br);
  }

  // wybuch — niszczy sąsiadów w promieniu (łańcuchowo dla kolejnych wybuchowych)
  function explode(src) {
    Audio.explode();
    stats.explosives++; bumpStats();
    punch(1.05, 3);
    shake = Math.min(shake + 8, 22); flash = Math.max(flash, 0.32); flashHue = 25;
    const cx = src.x + src.w / 2, cy = src.y + src.h / 2, radius = 80;
    burst(cx, cy, 25, 36, 1.9);
    for (const br of bricks) {
      if (!br.alive || br === src || br.type === 'steel') continue;
      const bx = br.x + br.w / 2, by = br.y + br.h / 2;
      if (Math.hypot(bx - cx, by - cy) < radius) destroyBrick(br, false);
    }
  }

  // ============================================================
  //  BOSS (co 5. poziom)
  // ============================================================
  function buildBossLevel() {
    bricks = [];
    const tier = level / 5;
    const hp = Math.round(16 + tier * 12);
    boss = {
      x: W / 2, y: 150, w: 210, h: 74, hp, maxHp: hp,
      vx: (1.6 + tier * 0.35) * (Math.random() < 0.5 ? 1 : -1),
      bob: rand(0, TAU), fireTimer: 150, hit: 0, alive: true, hue: 330
    };
  }

  function updateBoss(dt) {
    if (!boss || !boss.alive) return;
    boss.bob += 0.04 * dt;
    boss.x += boss.vx * dt;
    const half = boss.w / 2;
    if (boss.x - half < 12) { boss.x = 12 + half; boss.vx = Math.abs(boss.vx); }
    else if (boss.x + half > W - 12) { boss.x = W - 12 - half; boss.vx = -Math.abs(boss.vx); }
    if (boss.hit > 0) boss.hit *= 0.88;
    boss.fireTimer -= dt;
    if (boss.fireTimer <= 0) {
      const tier = level / 5;
      fireBossShots(1 + Math.min(2, Math.floor(tier / 2)));
      boss.fireTimer = Math.max(58, 150 - tier * 12);
    }
  }

  function fireBossShots(n) {
    const bx = boss.x, by = boss.y + boss.h / 2;
    const tx = paddle.x + paddle.w / 2;
    const lead = clamp((tx - bx) / 200, -1.4, 1.4);
    const sp = 3.0 + level * 0.04;
    for (let i = 0; i < n; i++) {
      bossShots.push({
        x: bx, y: by, vx: lead * 1.8 + (i - (n - 1) / 2) * 1.2 + rand(-0.4, 0.4),
        vy: sp, r: 10, spin: rand(0, TAU)
      });
    }
    Audio.bad();
  }

  function updateBossShots(dt) {
    for (let i = bossShots.length - 1; i >= 0; i--) {
      const s = bossShots[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.spin += 0.2 * dt;
      if (Math.random() < 0.5) particles.push({ x: s.x, y: s.y, vx: rand(-0.3, 0.3), vy: rand(-0.4, 0.6), life: 1, decay: 0.07, r: rand(1, 2.5), hue: 335 });
      if (s.y + s.r > paddle.y && s.y - s.r < paddle.y + paddle.h && s.x > paddle.x - s.r && s.x < paddle.x + paddle.w + s.r) {
        bossShots.splice(i, 1);
        flash = 0.7; flashHue = 335; shake = 20; Audio.explode();
        burst(s.x, paddle.y, 335, 22, 1.3);
        loseLife();
        return;
      }
      if (s.y - s.r > H || s.x < -24 || s.x > W + 24) bossShots.splice(i, 1);
    }
  }

  function hitBoss(b) {
    if (!boss || !boss.alive) return;
    const bx = boss.x - boss.w / 2, by = boss.y - boss.h / 2;
    if (b.x + b.r < bx || b.x - b.r > bx + boss.w || b.y + b.r < by || b.y - b.r > by + boss.h) return;
    if (FX.fireball <= 0) {
      const oL = (b.x + b.r) - bx, oR = (bx + boss.w) - (b.x - b.r);
      const oT = (b.y + b.r) - by, oB = (by + boss.h) - (b.y - b.r);
      const minX = Math.min(oL, oR), minY = Math.min(oT, oB);
      if (minX < minY) { b.vx = -b.vx; b.x += oL < oR ? -minX : minX; }
      else { b.vy = -b.vy; b.y += oT < oB ? -minY : minY; }
    }
    damageBoss(b.x, b.y, FX.fireball > 0 ? 2 : 1);
  }

  function damageBoss(px, py, dmg) {
    if (!boss || !boss.alive) return;
    boss.hp -= dmg; boss.hit = 1;
    combo++; comboTimer = 90; showCombo();
    Audio.brick(combo);
    burst(px, py, boss.hue, 12, 1.1);
    shake = Math.min(shake + 2, 12);
    addScore(45 * dmg);
    onBossDamaged && onBossDamaged(dmg);
    if (boss.hp <= 0) defeatBoss();
  }

  function defeatBoss() {
    boss.alive = false; bossShots = [];
    const bonus = 1000 * (level / 5);
    addScore(bonus);
    floatText(boss.x, boss.y, '★ BOSS +' + bonus, boss.hue);
    shake = 28; flash = 0.6; flashHue = 330; punch(1.09, 9);
    for (let k = 0; k < 64; k++) burst(boss.x + rand(-boss.w / 2, boss.w / 2), boss.y + rand(-boss.h / 2, boss.h / 2), rand(300, 360), 6, 1.9);
    Audio.explode(); Audio.win();
    onBossDefeated && onBossDefeated();
  }

  // ---- Rakiety ----
  function fireRockets() {
    rockets.push({ x: paddle.x + 12, y: paddle.y, vy: -10 });
    rockets.push({ x: paddle.x + paddle.w - 12, y: paddle.y, vy: -10 });
    Audio.rocket();
  }
  function updateRockets(dt) {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.y += r.vy * dt;
      particles.push({ x: r.x, y: r.y + 8, vx: rand(-0.4, 0.4), vy: rand(1, 2.5), life: 1, decay: 0.08, r: rand(1.5, 3), hue: rand(20, 50) });
      let hit = false;
      for (const br of bricks) {
        if (!br.alive) continue;
        if (r.x > br.x && r.x < br.x + br.w && r.y < br.y + br.h && r.y > br.y - 6) {
          damageBrick(br, { x: r.x, y: r.y }, false);
          hit = true; break;
        }
      }
      if (!hit && boss && boss.alive &&
          r.x > boss.x - boss.w / 2 && r.x < boss.x + boss.w / 2 &&
          r.y < boss.y + boss.h / 2 && r.y > boss.y - boss.h / 2 - 6) {
        damageBoss(r.x, r.y, 1); hit = true;
      }
      if (hit || r.y < -10) rockets.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.12 * dt; p.vx *= 0.99;
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function updateFloats(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.y += f.vy * dt; f.life -= 0.018 * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
  }

  // ============================================================
  //  Render
  // ============================================================
  function render(time) {
    ctx.save();
    if (zoom > 1.001) { ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2); }
    if (shake > 0.2) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    ctx.clearRect(-60, -60, W + 120, H + 120);

    drawBackground(time);
    drawShield(time);
    drawBricks();
    drawBoss(time);
    drawBossShots();
    drawPowerups();
    drawRockets();
    drawPaddle();
    drawBalls();
    drawParticles();
    drawFloats();
    drawActiveFX();
    if (state === State.READY) drawReadyHint(time);

    ctx.restore();

    if (flash > 0.01) {
      ctx.save();
      ctx.fillStyle = hsl(flashHue, 100, 55, flash * 0.5);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // overlay motywu: scanlines (CRT/Matrix) + zabarwienie
    if (T.scan || T.tint) {
      ctx.save();
      if (T.tint) { ctx.fillStyle = T.tint; ctx.fillRect(0, 0, W, H); }
      if (T.scan) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1.4);
      }
      ctx.restore();
    }
  }

  function drawBackground(time) {
    const g = ctx.createRadialGradient(W / 2, -60, 40, W / 2, H * 0.3, W);
    // mgławica reaguje na energię combo (dynamiczne tło)
    const pulse = 0.12 + Math.sin(time * 0.0006) * 0.04 + bgEnergy * 0.22;
    g.addColorStop(0, `rgba(${T.nebula}, ${pulse})`);
    g.addColorStop(0.5, 'rgba(20, 8, 48, 0)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // pierścienie energii przy wysokim combo
    if (bgEnergy > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rings = 3;
      for (let i = 0; i < rings; i++) {
        const ph = (time * 0.0004 + i / rings) % 1;
        ctx.globalAlpha = bgEnergy * 0.25 * (1 - ph);
        ctx.strokeStyle = `rgba(${T.nebula}, 1)`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(W / 2, H * 0.32, 60 + ph * W * 0.7, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }

    const starBoost = 1 + bgEnergy * 1.5;
    for (const s of stars) {
      ctx.globalAlpha = 0.3 + s.z * 0.6;
      ctx.fillStyle = s.z > 0.7 ? T.stars[0] : T.stars[1];
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.z * starBoost, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 44) { ctx.beginPath(); ctx.moveTo(x, H * 0.8); ctx.lineTo(W / 2 + (x - W / 2) * 2.2, H); ctx.stroke(); }
  }

  function drawShield(time) {
    if (FX.shield <= 0) return;
    const a = 0.4 + Math.sin(time * 0.01) * 0.2;
    const fade = FX.shield < 90 ? FX.shield / 90 : 1;
    ctx.save();
    ctx.globalAlpha = a * fade;
    ctx.strokeStyle = T.accentColor; ctx.lineWidth = 4;
    ctx.shadowColor = T.accentColor; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.moveTo(0, H - 12); ctx.lineTo(W, H - 12); ctx.stroke();
    ctx.restore();
  }

  function drawBoss(time) {
    if (!boss || !boss.alive) return;
    const cx = boss.x, cy = boss.y + Math.sin(boss.bob) * 6;
    const w = boss.w, h = boss.h, x = cx - w / 2, y = cy - h / 2;
    ctx.save();
    // korpus
    ctx.shadowColor = hsl(boss.hue, 100, 60); ctx.shadowBlur = 26 + boss.hit * 34;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, hsl(boss.hue, 95, 62 + boss.hit * 30));
    g.addColorStop(1, hsl(boss.hue, 90, 36));
    ctx.fillStyle = g; roundRect(x, y, w, h, 18); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hsl(boss.hue, 100, 82, 0.85); ctx.lineWidth = 2;
    roundRect(x + 2, y + 2, w - 4, h - 4, 16); ctx.stroke();
    // rogi
    ctx.fillStyle = hsl(boss.hue, 90, 50);
    ctx.beginPath(); ctx.moveTo(x + 18, y + 4); ctx.lineTo(x + 36, y + 4); ctx.lineTo(x + 22, y - 16); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w - 18, y + 4); ctx.lineTo(x + w - 36, y + 4); ctx.lineTo(x + w - 22, y - 16); ctx.closePath(); ctx.fill();
    // oczy
    const eyeY = cy - 6;
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 14;
    for (const ex of [cx - 42, cx + 42]) { ctx.beginPath(); ctx.ellipse(ex, eyeY, 15, 11, 0, 0, TAU); ctx.fill(); }
    ctx.shadowBlur = 0; ctx.fillStyle = '#1a0308';
    for (const ex of [cx - 42, cx + 42]) { ctx.beginPath(); ctx.arc(ex + clamp(boss.vx, -1, 1) * 4, eyeY + 2, 5.5, 0, TAU); ctx.fill(); }
    // paszcza z zębami
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(cx - 50, cy + 16, 100, 16, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 46 + i * 16, cy + 16); ctx.lineTo(cx - 38 + i * 16, cy + 16); ctx.lineTo(cx - 42 + i * 16, cy + 26); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // pasek HP
    const bw = w, bx = cx - w / 2, byy = y - 22;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(bx - 2, byy - 2, bw + 4, 12, 5); ctx.fill();
    const frac = clamp(boss.hp / boss.maxHp, 0, 1);
    ctx.fillStyle = hsl(120 * frac, 90, 52); ctx.shadowColor = hsl(120 * frac, 90, 52); ctx.shadowBlur = 12;
    roundRect(bx, byy, bw * frac, 8, 4); ctx.fill();
    ctx.restore();
  }

  function drawBossShots() {
    for (const s of bossShots) {
      ctx.save();
      ctx.translate(s.x, s.y); ctx.rotate(s.spin);
      ctx.shadowColor = '#ff2b6b'; ctx.shadowBlur = 16;
      ctx.fillStyle = '#1a0308'; ctx.strokeStyle = '#ff2b6b'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, rr = i % 2 ? s.r - 3 : s.r + 3; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  function drawBricks() {
    for (const br of bricks) {
      if (!br.alive) continue;
      const hit = br.hit; br.hit *= 0.85;
      const cxp = br.x + br.w / 2, cyp = br.y + br.h / 2;
      ctx.save();

      // ---- STALOWA (metaliczna, nity) ----
      if (br.type === 'steel') {
        ctx.shadowColor = '#9fb4c8'; ctx.shadowBlur = 8 + hit * 16;
        const g = ctx.createLinearGradient(br.x, br.y, br.x, br.y + br.h);
        g.addColorStop(0, '#e6eef6'); g.addColorStop(0.5, '#8a99ab'); g.addColorStop(1, '#566273');
        ctx.fillStyle = g; roundRect(br.x, br.y, br.w, br.h, 5); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2;
        roundRect(br.x + 0.7, br.y + 0.7, br.w - 1.4, br.h - 1.4, 4); ctx.stroke();
        ctx.fillStyle = 'rgba(20,28,40,0.65)';
        for (const rx of [br.x + 6, br.x + br.w - 6])
          for (const ry of [br.y + 6, br.y + br.h - 6]) { ctx.beginPath(); ctx.arc(rx, ry, 1.8, 0, TAU); ctx.fill(); }
        ctx.restore(); continue;
      }

      // ---- pozostałe typy ----
      let hue, sat;
      if (br.type === 'explosive') { hue = 18; sat = 92; }
      else if (br.type === 'regen') { hue = 135; sat = 92; }
      else if (br.type === 'multiplier') { hue = 48; sat = 100; }
      else { const bc = T.brick(br.hue); hue = bc.h; sat = bc.s; } // zwykłe/ruchome wg motywu
      const lum = 45 + (Math.min(br.hp, br.maxHp) / br.maxHp) * 18;
      const healGlow = br.heal > 0 ? br.heal * 26 : 0;
      const pulseGlow = (br.type === 'multiplier' || br.type === 'explosive') ? 5 + Math.sin(br.pulse) * 5 : 0;

      ctx.shadowColor = hsl(hue, 100, 60); ctx.shadowBlur = 14 + hit * 16 + pulseGlow + healGlow;
      const grad = ctx.createLinearGradient(br.x, br.y, br.x, br.y + br.h);
      grad.addColorStop(0, hsl(hue, sat, lum + 14 + hit * 30 + healGlow * 0.4));
      grad.addColorStop(1, hsl(hue, sat - 6, lum - 6));
      ctx.fillStyle = grad; roundRect(br.x, br.y, br.w, br.h, 5); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = hsl(hue, 100, 78, 0.9); ctx.lineWidth = 1.4;
      roundRect(br.x + 0.7, br.y + 0.7, br.w - 1.4, br.h - 1.4, 4); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      roundRect(br.x + 3, br.y + 2, br.w - 6, br.h * 0.34, 3); ctx.fill();

      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (br.type === 'explosive') { ctx.font = '13px Rajdhani, sans-serif'; ctx.fillText('💥', cxp, cyp + 1); }
      else if (br.type === 'multiplier') { ctx.fillStyle = '#3a2a00'; ctx.font = 'bold 15px Orbitron, sans-serif'; ctx.fillText('★', cxp, cyp + 1); }
      else if (br.type === 'regen') { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '13px Rajdhani, sans-serif'; ctx.fillText('♻', cxp, cyp + 1); }
      else if (br.type === 'moving') { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '13px Rajdhani, sans-serif'; ctx.fillText('↔', cxp, cyp + 1); }
      else if (br.maxHp > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let d = 0; d < br.hp; d++) { ctx.beginPath(); ctx.arc(cxp + (d - (br.hp - 1) / 2) * 7, br.y + br.h - 5, 1.6, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
  }

  function drawPaddle() {
    const x = paddle.x, y = paddle.y, w = paddle.w, h = paddle.h;
    ctx.save();
    if (paddle.squash > 0.01) { // squash & stretch przy odbiciu
      const sx = 1 + paddle.squash * 0.16, sy = 1 - paddle.squash * 0.32;
      ctx.translate(x + w / 2, y + h); ctx.scale(sx, sy); ctx.translate(-(x + w / 2), -(y + h));
    }
    const danger = FX.shrink > 0 || FX.reverse > 0;
    ctx.shadowColor = danger ? '#ff3b6b' : T.paddleGlow;
    ctx.shadowBlur = 22 + paddle.glow * 24;
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (danger) { grad.addColorStop(0, '#ffb3c6'); grad.addColorStop(0.5, '#ff3b6b'); grad.addColorStop(1, '#aa1133'); }
    else { grad.addColorStop(0, T.paddle[0]); grad.addColorStop(0.5, T.paddle[1]); grad.addColorStop(1, T.paddle[2]); }
    ctx.fillStyle = grad; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255,255,255,${0.5 + paddle.glow * 0.4})`;
    roundRect(x + 6, y + 3, w - 12, 3, 2); ctx.fill();
    // wyrzutnie rakiet
    if (FX.rockets > 0) {
      ctx.fillStyle = '#ffd86b'; ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 10;
      roundRect(x + 8, y - 5, 8, 6, 2); ctx.fill();
      roundRect(x + w - 16, y - 5, 8, 6, 2); ctx.fill();
    }
    ctx.fillStyle = T.paddleEnd; ctx.shadowColor = T.paddleEnd; ctx.shadowBlur = 14;
    roundRect(x, y, 6, h, 3); ctx.fill(); roundRect(x + w - 6, y, 6, h, 3); ctx.fill();
    ctx.restore();
  }

  function drawBalls() {
    for (const b of balls) {
      const fire = FX.fireball > 0;
      for (let i = 0; i < b.trail.length; i++) {
        const t = b.trail[i], a = i / b.trail.length;
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = fire ? hsl(20 + i * 3, 100, 60) : hsl(T.ballTrail + i * 4, 100, 65);
        ctx.beginPath(); ctx.arc(t.x, t.y, b.r * a * 0.9, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.shadowColor = fire ? '#ffae42' : T.ballGlow; ctx.shadowBlur = 24;
      const g = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, b.r);
      if (fire) { g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#ffd86b'); g.addColorStop(1, '#ff5a1f'); }
      else { g.addColorStop(0, T.ball[0]); g.addColorStop(0.5, T.ball[1]); g.addColorStop(1, T.ball[2]); }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawRockets() {
    for (const r of rockets) {
      ctx.save();
      ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 14;
      const g = ctx.createLinearGradient(0, r.y - 10, 0, r.y + 6);
      g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#ffd86b'); g.addColorStop(1, '#ff7a00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y - 11); ctx.lineTo(r.x + 3.5, r.y + 4); ctx.lineTo(r.x - 3.5, r.y + 4); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPowerups() {
    for (const p of powerups) {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.good) {
        ctx.rotate(Math.sin(p.spin) * 0.3);
        ctx.shadowColor = hsl(p.def.hue, 100, 60); ctx.shadowBlur = 18;
        const g = ctx.createLinearGradient(0, -p.r, 0, p.r);
        g.addColorStop(0, hsl(p.def.hue, 100, 72)); g.addColorStop(1, hsl(p.def.hue, 95, 45));
        ctx.fillStyle = g; roundRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4, 7); ctx.fill();
      } else {
        // NEGATYWNY — ostrzegawczy, kolczasty, pulsujący
        const pulse = 1 + Math.sin(p.pulse) * 0.12;
        ctx.scale(pulse, pulse);
        ctx.rotate(p.spin * 0.5);
        ctx.shadowColor = '#ff2b3c'; ctx.shadowBlur = 22;
        ctx.fillStyle = '#1a0306';
        ctx.strokeStyle = '#ff2b3c'; ctx.lineWidth = 2.5;
        // gwiazda-kolce
        ctx.beginPath();
        const spikes = 8, R = p.r + 3, r2 = p.r - 3;
        for (let i = 0; i < spikes * 2; i++) {
          const ang = (i / (spikes * 2)) * TAU;
          const rr = i % 2 === 0 ? R : r2;
          ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.rotate(-p.spin * 0.5);
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = p.good ? '#fff' : '#ff6b7d';
      ctx.font = 'bold 15px Rajdhani, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.def.label, 0, 1);
      ctx.restore();
    }
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = hsl(p.hue, 100, 65);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.save();
    ctx.font = 'bold 20px Orbitron, sans-serif'; ctx.textAlign = 'center';
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.shadowColor = hsl(f.hue, 100, 60); ctx.shadowBlur = 12;
      ctx.fillStyle = '#fff'; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Pasek aktywnych efektów (lewy dolny róg)
  const FX_META = {
    wide: ['↔', 190], slow: ['⏳', 150], sticky: ['⊕', 95], rockets: ['🚀', 205],
    fireball: ['🔥', 25], big: ['⬤', 270], magnet: ['🧲', 330], shield: ['🛡', 180], double: ['2×', 55],
    shrink: ['><', 0], speedup: ['»', 0], reverse: ['⇄', 0]
  };
  function drawActiveFX() {
    let x = 14;
    const y = H - 26;
    for (const k in FX_META) {
      if (FX[k] <= 0) continue;
      const bad = (k === 'shrink' || k === 'speedup' || k === 'reverse');
      const [icon, hue] = FX_META[k];
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = bad ? 'rgba(40,4,8,0.7)' : 'rgba(8,10,30,0.6)';
      roundRect(x, y, 30, 18, 5); ctx.fill();
      ctx.strokeStyle = bad ? '#ff2b3c' : hsl(hue, 90, 60); ctx.lineWidth = 1;
      roundRect(x, y, 30, 18, 5); ctx.stroke();
      // pasek czasu
      const frac = clamp(FX[k] / 780, 0, 1);
      ctx.fillStyle = bad ? '#ff2b3c' : hsl(hue, 95, 60);
      ctx.fillRect(x + 2, y + 15, 26 * frac, 2);
      ctx.fillStyle = '#fff'; ctx.font = '11px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(icon, x + 15, y + 8);
      ctx.restore();
      x += 36;
    }
  }

  function drawReadyHint(time) {
    const a = 0.5 + Math.sin(time * 0.005) * 0.4;
    ctx.save();
    ctx.globalAlpha = a; ctx.fillStyle = T.ball[1];
    ctx.font = 'bold 18px Orbitron, sans-serif'; ctx.textAlign = 'center';
    ctx.shadowColor = T.accentColor; ctx.shadowBlur = 14;
    ctx.fillText('SPACJA / KLIK — WYSTRZEL', W / 2, paddle.y - 60);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ============================================================
  //  Pętla główna
  // ============================================================
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 16.667; last = now;
    dt = Math.min(dt, 2.5);
    zoom += (1 - zoom) * 0.18; // wygaszanie "punch zoom"
    if (hitStop > 0) { hitStop -= dt; render(now); requestAnimationFrame(loop); return; }
    if (state === State.LEVELCLEAR) {
      levelClearTimer -= dt; updateParticles(dt);
      if (levelClearTimer <= 0) nextLevel();
    } else if (state !== State.PAUSED) {
      update(dt);
    }
    render(now);
    requestAnimationFrame(loop);
  }

  // init
  onBossDefeated = () => { stats.bosses++; bumpStats(); };
  $musicBtn.classList.add('off');
  $musicBtn.textContent = '🎵 MUZYKA (off)';
  applyTheme(themeKey);
  checkAchievements();            // odblokuj zaległe na bazie zapisanych statystyk
  showPanels();                   // pokaż TOP10 / osiągnięcia na ekranie startowym
  updateHUD();
  requestAnimationFrame(loop);
})();
