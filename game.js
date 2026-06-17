/* ============================================================
   NEON BREAKOUT — wypasiona wizualnie wersja klasyka
   Czysty Canvas 2D, bez zależności. Web Audio do dźwięku.
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

  // ============================================================
  //  Responsywne skalowanie z zachowaniem proporcji + DPR
  // ============================================================
  let scale = 1;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const margin = 28;
    const availW = window.innerWidth - margin;
    const availH = window.innerHeight - margin;
    scale = Math.min(availW / W, availH / H);
    canvas.style.width = (W * scale) + 'px';
    canvas.style.height = (H * scale) + 'px';
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ============================================================
  //  Audio — syntezowane dźwięki (bez plików)
  // ============================================================
  const Audio = (() => {
    let actx = null, muted = false, master = null;
    function ensure() {
      if (actx) return;
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain();
      master.gain.value = 0.5;
      master.connect(actx.destination);
    }
    function tone(freq, dur, type = 'sine', vol = 0.3, glideTo = null) {
      if (muted) return;
      ensure();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + dur + 0.02);
    }
    function noise(dur, vol = 0.25) {
      if (muted) return;
      ensure();
      const t = actx.currentTime;
      const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = actx.createBufferSource(); src.buffer = buf;
      const g = actx.createGain(); g.gain.value = vol;
      const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 800;
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t);
    }
    return {
      brick(combo) { tone(420 + Math.min(combo, 14) * 45, 0.10, 'square', 0.18); },
      paddle() { tone(180, 0.09, 'sine', 0.25, 120); },
      wall() { tone(140, 0.06, 'sine', 0.12); },
      power() { tone(520, 0.16, 'triangle', 0.3, 880); tone(660, 0.18, 'sine', 0.2, 1100); },
      lose() { tone(220, 0.5, 'sawtooth', 0.28, 60); noise(0.4, 0.18); },
      launch() { tone(300, 0.18, 'triangle', 0.25, 700); },
      level() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.28), i * 90)); },
      gameover() { [400, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sawtooth', 0.25), i * 160)); },
      win() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'square', 0.25), i * 110)); },
      toggle() { muted = !muted; if (!muted) { ensure(); actx.resume(); } return muted; },
      get muted() { return muted; }
    };
  })();

  // ============================================================
  //  Pomocnicze
  // ============================================================
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const TAU = Math.PI * 2;

  function hsl(h, s, l, a = 1) { return `hsla(${h}, ${s}%, ${l}%, ${a})`; }

  // ============================================================
  //  Tło — gwiazdy paralaksy + mgławica
  // ============================================================
  const stars = [];
  for (let i = 0; i < 140; i++) {
    stars.push({ x: rand(0, W), y: rand(0, H), z: rand(0.2, 1), r: rand(0.4, 1.8) });
  }

  // ============================================================
  //  Encje
  // ============================================================
  const paddle = {
    w: 130, h: 16, x: W / 2 - 65, y: H - 56,
    baseW: 130, targetX: W / 2, vx: 0, glow: 0
  };

  let balls = [];
  function newBall(x, y, vx, vy) {
    return { x, y, vx, vy, r: 9, trail: [], stuck: false, glowHue: 190 };
  }

  let bricks = [];
  let particles = [];
  let powerups = [];
  let floats = [];
  let shake = 0;
  let flash = 0;

  // ---------- Stan gry ----------
  const State = { MENU: 0, READY: 1, PLAYING: 2, PAUSED: 3, LEVELCLEAR: 4, GAMEOVER: 5, WIN: 6 };
  let state = State.MENU;
  let score = 0, lives = 3, level = 1, combo = 0, comboTimer = 0;
  let levelClearTimer = 0;

  const BASE_SPEED = 6.2;
  let ballSpeed = BASE_SPEED;

  // ============================================================
  //  Definicje poziomów (wzory układane proceduralnie)
  // ============================================================
  const COLS = 13;
  const ROWS = 8;
  const brickW = 56;
  const brickH = 24;
  const gapX = 6, gapY = 8;
  const fieldTop = 84;
  const fieldLeft = (W - (COLS * (brickW + gapX) - gapX)) / 2;

  // Generator wzorów — zwraca funkcję (col,row,rows,cols) => hp lub 0
  const patterns = [
    // 1: pełna piramida
    (c, r) => (r >= 1 && r <= 5 && c >= r && c <= COLS - 1 - r) ? (6 - r) : 0,
    // 2: paski
    (c, r) => (r % 2 === 0 && r < 6) ? (r < 2 ? 3 : 2) : (r < 6 ? 1 : 0),
    // 3: diament
    (c, r) => {
      const cc = COLS / 2 - 0.5, rr = 3;
      const d = Math.abs(c - cc) + Math.abs(r - rr) * 1.4;
      return d < 5 ? (d < 2 ? 4 : d < 3.5 ? 2 : 1) : 0;
    },
    // 4: szachownica wzmocniona
    (c, r) => r < 6 ? ((c + r) % 2 === 0 ? 3 : 1) : 0,
    // 5: serce / fala
    (c, r) => {
      if (r > 6) return 0;
      const wave = Math.sin(c * 0.6 + r * 0.4);
      return wave > -0.2 ? (r < 2 ? 4 : 2) : (r < 4 ? 1 : 0);
    }
  ];

  function buildLevel() {
    bricks = [];
    const pat = patterns[(level - 1) % patterns.length];
    const extra = Math.floor((level - 1) / patterns.length); // dodatkowa wytrzymałość po pełnym cyklu
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let hp = pat(c, r);
        if (hp <= 0) continue;
        hp += extra;
        const x = fieldLeft + c * (brickW + gapX);
        const y = fieldTop + r * (brickH + gapY);
        const hue = (r / ROWS) * 280 + 180; // gradient od cyjanu do magenty
        bricks.push({
          x, y, w: brickW, h: brickH, hp, maxHp: hp,
          hue: hue % 360, alive: true, hit: 0, indestructible: false
        });
      }
    }
  }

  function ballsRemainingMessage() {}

  // ============================================================
  //  Power-upy
  // ============================================================
  const POWER_TYPES = [
    { id: 'multi',  label: '×3',  hue: 300, fn: applyMulti },
    { id: 'wide',   label: '↔',  hue: 190, fn: () => { paddle.baseW = 200; paddle.w = lerp(paddle.w, 200, 1); setTimeout(() => paddle.baseW = 130, 12000); } },
    { id: 'slow',   label: '🐢', hue: 130, fn: () => { ballSpeed = Math.max(BASE_SPEED, ballSpeed * 0.7); setTimeout(() => ballSpeed = BASE_SPEED + (level - 1) * 0.3, 9000); } },
    { id: 'life',   label: '♥',  hue: 340, fn: () => { lives++; updateHUD(); } },
    { id: 'score',  label: '★',  hue: 50,  fn: () => { addScore(500); } },
  ];

  function applyMulti() {
    const src = balls[0];
    if (!src) return;
    for (let i = 0; i < 2; i++) {
      const ang = rand(-0.6, 0.6);
      const speed = Math.hypot(src.vx, src.vy) || ballSpeed;
      const dir = Math.atan2(src.vy, src.vx) + ang;
      balls.push(newBall(src.x, src.y, Math.cos(dir) * speed, Math.sin(dir) * speed));
    }
  }

  function spawnPowerup(x, y) {
    const t = POWER_TYPES[(Math.random() * POWER_TYPES.length) | 0];
    powerups.push({ x, y, vy: 2.4, r: 16, type: t, spin: 0 });
  }

  const lerp = (a, b, t) => a + (b - a) * t;

  // ============================================================
  //  Cząsteczki i floating text
  // ============================================================
  function burst(x, y, hue, n = 14, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(1, 6) * power;
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
        life: 1, decay: rand(0.012, 0.03), r: rand(1.5, 4),
        hue: hue + rand(-25, 25)
      });
    }
  }
  function floatText(x, y, text, hue) {
    floats.push({ x, y, text, hue, life: 1, vy: -0.8 });
  }

  // ============================================================
  //  HUD
  // ============================================================
  function updateHUD() {
    $score.textContent = score.toLocaleString('pl-PL');
    $level.textContent = level;
    $lives.textContent = lives > 0 ? '♥'.repeat(Math.min(lives, 6)) : '–';
  }
  function addScore(n) {
    score += Math.round(n * (1 + combo * 0.08));
    updateHUD();
  }
  function showCombo() {
    if (combo < 2) return;
    $comboText.textContent = 'x' + combo;
    $combo.classList.remove('show');
    void $combo.offsetWidth;
    $combo.classList.add('show');
    clearTimeout(showCombo._t);
    showCombo._t = setTimeout(() => $combo.classList.remove('show'), 800);
  }

  // ============================================================
  //  Sterowanie
  // ============================================================
  const keys = { left: false, right: false };
  let usingMouse = false;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.left = true; usingMouse = false; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.right = true; usingMouse = false; }
    if (e.code === 'Space') {
      e.preventDefault();
      if (state === State.READY) launchBalls();
      else if (state === State.PLAYING) togglePause();
      else if (state === State.PAUSED) togglePause();
    }
    if (e.code === 'Enter' && (state === State.MENU || state === State.GAMEOVER || state === State.WIN)) {
      startGame();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  });

  function pointerToWorld(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) / rect.width * W;
  }
  canvas.addEventListener('mousemove', (e) => {
    usingMouse = true;
    paddle.targetX = clamp(pointerToWorld(e.clientX), paddle.w / 2, W - paddle.w / 2);
  });
  canvas.addEventListener('mousedown', () => {
    if (state === State.READY) launchBalls();
  });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches[0]) { usingMouse = true; paddle.targetX = clamp(pointerToWorld(e.touches[0].clientX), paddle.w / 2, W - paddle.w / 2); }
  }, { passive: false });
  canvas.addEventListener('touchstart', () => { if (state === State.READY) launchBalls(); });

  // przyciski dotykowe
  bindTouch('touch-left', () => keys.left = true, () => keys.left = false);
  bindTouch('touch-right', () => keys.right = true, () => keys.right = false);
  bindTouch('touch-launch', () => { if (state === State.READY) launchBalls(); else if (state === State.PLAYING) togglePause(); });
  function bindTouch(id, on, off) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); usingMouse = false; on(); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); off && off(); }, { passive: false });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); on(); });
    el.addEventListener('mouseup', () => off && off());
  }

  $startBtn.addEventListener('click', () => {
    if (state === State.MENU || state === State.GAMEOVER || state === State.WIN) startGame();
  });
  $muteBtn.addEventListener('click', () => {
    const m = Audio.toggle();
    $muteBtn.textContent = m ? '🔇 WYCISZONE' : '🔊 DŹWIĘK';
    $muteBtn.classList.toggle('off', m);
  });

  // ============================================================
  //  Przepływ gry
  // ============================================================
  function startGame() {
    score = 0; lives = 3; level = 1; combo = 0; ballSpeed = BASE_SPEED;
    powerups = []; particles = []; floats = [];
    paddle.baseW = 130; paddle.w = 130;
    buildLevel();
    resetBallOnPaddle();
    updateHUD();
    hideOverlay();
    state = State.READY;
  }

  function resetBallOnPaddle() {
    balls = [newBall(paddle.x + paddle.w / 2, paddle.y - 14, 0, 0)];
    balls[0].stuck = true;
  }

  function launchBalls() {
    if (state !== State.READY) return;
    const b = balls[0];
    const ang = rand(-0.35, 0.35) - Math.PI / 2;
    b.vx = Math.cos(ang) * ballSpeed;
    b.vy = Math.sin(ang) * ballSpeed;
    b.stuck = false;
    state = State.PLAYING;
    Audio.launch();
  }

  function togglePause() {
    if (state === State.PLAYING) { state = State.PAUSED; showOverlay('PAUZA', 'Naciśnij SPACJĘ aby kontynuować', null, 'WZNÓW'); }
    else if (state === State.PAUSED) { hideOverlay(); state = State.PLAYING; }
  }
  $startBtn.addEventListener('click', () => { if (state === State.PAUSED) { hideOverlay(); state = State.PLAYING; } });

  function loseLife() {
    lives--;
    updateHUD();
    shake = 18; flash = 0.5; combo = 0;
    Audio.lose();
    if (lives <= 0) {
      state = State.GAMEOVER;
      Audio.gameover();
      showOverlay('GAME OVER', 'Neon przygasł...', `<div><span class="big">${score.toLocaleString('pl-PL')}</span></div><div>poziom ${level}</div>`, 'JESZCZE RAZ');
    } else {
      resetBallOnPaddle();
      state = State.READY;
    }
  }

  function nextLevel() {
    if (level >= 25) {
      state = State.WIN;
      Audio.win();
      showOverlay('ZWYCIĘSTWO!', 'Opanowałeś neonowy wymiar', `<div><span class="big">${score.toLocaleString('pl-PL')}</span></div><div>25 poziomów ukończonych</div>`, 'ZAGRAJ PONOWNIE');
      return;
    }
    level++;
    ballSpeed = BASE_SPEED + (level - 1) * 0.3;
    powerups = [];
    buildLevel();
    resetBallOnPaddle();
    updateHUD();
    Audio.level();
    state = State.READY;
  }

  // ============================================================
  //  Overlay helpers
  // ============================================================
  function showOverlay(title, sub, statsHTML, btn) {
    $overlayTitle.textContent = title;
    $overlayTitle.setAttribute('data-text', title);
    $overlaySub.textContent = sub;
    if (statsHTML) { $overlayStats.innerHTML = statsHTML; $overlayStats.classList.remove('hidden'); }
    else $overlayStats.classList.add('hidden');
    $startBtn.textContent = btn || 'START';
    $overlay.classList.remove('hidden');
  }
  function hideOverlay() { $overlay.classList.add('hidden'); }

  // ============================================================
  //  Aktualizacja fizyki
  // ============================================================
  function update(dt) {
    // gwiazdy
    for (const s of stars) {
      s.y += s.z * 0.25 * dt;
      if (s.y > H) { s.y = 0; s.x = rand(0, W); }
    }

    // efekty zanikają zawsze
    shake *= 0.86; if (shake < 0.1) shake = 0;
    flash *= 0.9; if (flash < 0.01) flash = 0;
    paddle.glow *= 0.9;

    updateParticles(dt);
    updateFloats(dt);

    if (state !== State.PLAYING && state !== State.READY) return;

    // ---- Paletka ----
    const pspeed = 11;
    if (!usingMouse) {
      if (keys.left) paddle.targetX -= pspeed * dt;
      if (keys.right) paddle.targetX += pspeed * dt;
      paddle.targetX = clamp(paddle.targetX, paddle.w / 2, W - paddle.w / 2);
    }
    paddle.w = lerp(paddle.w, paddle.baseW, 0.15);
    const cx = paddle.x + paddle.w / 2;
    const nx = lerp(cx, paddle.targetX, 0.3);
    paddle.vx = nx - cx;
    paddle.x = clamp(nx - paddle.w / 2, 0, W - paddle.w);
    paddle.y = H - 56;

    // ---- Power-upy spadają ----
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.y += p.vy * dt;
      p.spin += 0.08 * dt;
      if (p.y + p.r > paddle.y && p.y - p.r < paddle.y + paddle.h &&
          p.x > paddle.x - p.r && p.x < paddle.x + paddle.w + p.r) {
        p.type.fn();
        Audio.power();
        burst(p.x, p.y, p.type.hue, 22, 1.3);
        floatText(p.x, p.y - 10, p.type.label, p.type.hue);
        paddle.glow = 1;
        powerups.splice(i, 1);
      } else if (p.y - p.r > H) {
        powerups.splice(i, 1);
      }
    }

    // ---- Combo timer ----
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }

    // ---- Piłki ----
    if (state === State.READY) {
      // piłka trzyma się paletki
      const b = balls[0];
      if (b) { b.x = paddle.x + paddle.w / 2; b.y = paddle.y - 14; pushTrail(b); }
      return;
    }

    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      stepBall(b, dt);
      if (b.y - b.r > H) {
        burst(b.x, H - 6, 0, 16, 1);
        balls.splice(i, 1);
      }
    }

    if (balls.length === 0) { loseLife(); return; }

    // ---- Czy poziom ukończony? ----
    if (bricks.every(br => !br.alive || br.indestructible)) {
      state = State.LEVELCLEAR;
      levelClearTimer = 70;
      // wielki wybuch
      shake = 14;
      for (let k = 0; k < 40; k++) burst(rand(0, W), rand(fieldTop, H / 2), rand(180, 320), 6, 1.4);
    }
  }

  function pushTrail(b) {
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 14) b.trail.shift();
  }

  function stepBall(b, dt) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 4));
    const sx = (b.vx * dt) / steps;
    const sy = (b.vy * dt) / steps;
    for (let s = 0; s < steps; s++) {
      b.x += sx; b.y += sy;

      // ściany
      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); Audio.wall(); sparkWall(b, 0); }
      else if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); Audio.wall(); sparkWall(b, W); }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); Audio.wall(); sparkWall(b, b.x); }

      // paletka
      if (b.vy > 0 && b.y + b.r > paddle.y && b.y - b.r < paddle.y + paddle.h &&
          b.x > paddle.x - b.r && b.x < paddle.x + paddle.w + b.r) {
        b.y = paddle.y - b.r;
        const rel = (b.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2); // -1..1
        const ang = rel * (Math.PI * 0.42) - Math.PI / 2;
        const spd = Math.max(ballSpeed, Math.hypot(b.vx, b.vy));
        b.vx = Math.cos(ang) * spd + paddle.vx * 0.35;
        b.vy = Math.sin(ang) * spd;
        // normalizacja prędkości
        const m = Math.hypot(b.vx, b.vy);
        b.vx = b.vx / m * spd; b.vy = b.vy / m * spd;
        paddle.glow = 1;
        Audio.paddle();
        burst(b.x, paddle.y, 190, 8, 0.8);
        combo = 0; // reset combo gdy wraca do paletki (combo = serie bez dotyku paletki)
      }

      // cegły
      hitBricks(b);
    }
    pushTrail(b);
  }

  function sparkWall(b, x) {
    burst(clamp(b.x, 2, W - 2), b.y, 200, 5, 0.7);
  }

  function hitBricks(b) {
    for (let i = 0; i < bricks.length; i++) {
      const br = bricks[i];
      if (!br.alive) continue;
      if (b.x + b.r < br.x || b.x - b.r > br.x + br.w || b.y + b.r < br.y || b.y - b.r > br.y + br.h) continue;

      // wyznacz oś odbicia
      const overlapL = (b.x + b.r) - br.x;
      const overlapR = (br.x + br.w) - (b.x - b.r);
      const overlapT = (b.y + b.r) - br.y;
      const overlapB = (br.y + br.h) - (b.y - b.r);
      const minX = Math.min(overlapL, overlapR);
      const minY = Math.min(overlapT, overlapB);
      if (minX < minY) {
        b.vx = -b.vx;
        b.x += overlapL < overlapR ? -minX : minX;
      } else {
        b.vy = -b.vy;
        b.y += overlapT < overlapB ? -minY : minY;
      }

      damageBrick(br, b);
      break; // jedna cegła na krok
    }
  }

  function damageBrick(br, b) {
    br.hp--;
    br.hit = 1;
    combo++;
    comboTimer = 90;
    showCombo();
    Audio.brick(combo);
    burst(b.x, b.y, br.hue, 8, 0.9);

    if (br.hp <= 0) {
      br.alive = false;
      const pts = 80 * (br.maxHp);
      addScore(pts);
      floatText(br.x + br.w / 2, br.y, '+' + Math.round(pts * (1 + combo * 0.08)), br.hue);
      burst(br.x + br.w / 2, br.y + br.h / 2, br.hue, 20, 1.2);
      shake = Math.min(shake + 3, 12);
      // szansa na power-up rośnie z combo
      if (Math.random() < 0.12 + combo * 0.01) spawnPowerup(br.x + br.w / 2, br.y + br.h / 2);
    } else {
      addScore(15);
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 0.12 * dt; p.vx *= 0.99;
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function updateFloats(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.y += f.vy * dt; f.life -= 0.018 * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
  }

  // ============================================================
  //  Rendering
  // ============================================================
  function render(time) {
    ctx.save();
    // screen shake
    if (shake > 0.2) ctx.translate(rand(-shake, shake), rand(-shake, shake));

    ctx.clearRect(-30, -30, W + 60, H + 60);

    drawBackground(time);
    drawBricks(time);
    drawPowerups();
    drawPaddle();
    drawBalls();
    drawParticles();
    drawFloats();

    if (state === State.READY) drawReadyHint(time);

    ctx.restore();

    // flash (poza shake)
    if (flash > 0.01) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 40, 120, ${flash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function drawBackground(time) {
    // mgławica pulsująca
    const g = ctx.createRadialGradient(W / 2, -60, 40, W / 2, H * 0.3, W);
    const pulse = 0.12 + Math.sin(time * 0.0006) * 0.04;
    g.addColorStop(0, `rgba(157, 78, 221, ${pulse})`);
    g.addColorStop(0.5, 'rgba(20, 8, 48, 0.0)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // gwiazdy
    for (const s of stars) {
      ctx.globalAlpha = 0.3 + s.z * 0.6;
      ctx.fillStyle = s.z > 0.7 ? '#bfefff' : '#7a6bff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * s.z, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // siatka dolna (perspektywa retro)
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 44) {
      ctx.beginPath(); ctx.moveTo(x, H * 0.8); ctx.lineTo(W / 2 + (x - W / 2) * 2.2, H); ctx.stroke();
    }
  }

  function drawBricks(time) {
    for (const br of bricks) {
      if (!br.alive) continue;
      const lum = 45 + (br.hp / br.maxHp) * 18;
      const hit = br.hit;
      br.hit *= 0.85;

      ctx.save();
      ctx.shadowColor = hsl(br.hue, 100, 60);
      ctx.shadowBlur = 14 + hit * 16;

      // korpus z gradientem
      const grad = ctx.createLinearGradient(br.x, br.y, br.x, br.y + br.h);
      grad.addColorStop(0, hsl(br.hue, 95, lum + 14 + hit * 30));
      grad.addColorStop(1, hsl(br.hue, 90, lum - 6));
      ctx.fillStyle = grad;
      roundRect(br.x, br.y, br.w, br.h, 5);
      ctx.fill();

      // obrys jasny
      ctx.shadowBlur = 0;
      ctx.strokeStyle = hsl(br.hue, 100, 78, 0.9);
      ctx.lineWidth = 1.4;
      roundRect(br.x + 0.7, br.y + 0.7, br.w - 1.4, br.h - 1.4, 4);
      ctx.stroke();

      // refleks górny
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      roundRect(br.x + 3, br.y + 2, br.w - 6, br.h * 0.34, 3);
      ctx.fill();

      // wskaźnik wytrzymałości (kropki)
      if (br.maxHp > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const dots = br.hp;
        for (let d = 0; d < dots; d++) {
          ctx.beginPath();
          ctx.arc(br.x + br.w / 2 + (d - (dots - 1) / 2) * 7, br.y + br.h - 5, 1.6, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  function drawPaddle() {
    const x = paddle.x, y = paddle.y, w = paddle.w, h = paddle.h;
    ctx.save();
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 22 + paddle.glow * 24;
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#aefcff');
    grad.addColorStop(0.5, '#00f0ff');
    grad.addColorStop(1, '#0077aa');
    ctx.fillStyle = grad;
    roundRect(x, y, w, h, h / 2);
    ctx.fill();

    // rdzeń świetlny
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255,255,255,${0.5 + paddle.glow * 0.4})`;
    roundRect(x + 6, y + 3, w - 12, 3, 2);
    ctx.fill();

    // końcówki magenta
    ctx.fillStyle = '#ff00e6';
    ctx.shadowColor = '#ff00e6'; ctx.shadowBlur = 14;
    roundRect(x, y, 6, h, 3); ctx.fill();
    roundRect(x + w - 6, y, 6, h, 3); ctx.fill();
    ctx.restore();
  }

  function drawBalls() {
    for (const b of balls) {
      // ogon
      for (let i = 0; i < b.trail.length; i++) {
        const t = b.trail[i];
        const a = (i / b.trail.length);
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = hsl(190 + i * 4, 100, 65);
        ctx.beginPath();
        ctx.arc(t.x, t.y, b.r * a * 0.9, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.shadowColor = '#9fefff';
      ctx.shadowBlur = 24;
      const g = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, b.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#aefcff');
      g.addColorStop(1, '#00d6ff');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPowerups() {
    for (const p of powerups) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.sin(p.spin) * 0.3);
      ctx.shadowColor = hsl(p.type.hue, 100, 60);
      ctx.shadowBlur = 18;
      // kapsuła
      const g = ctx.createLinearGradient(0, -p.r, 0, p.r);
      g.addColorStop(0, hsl(p.type.hue, 100, 72));
      g.addColorStop(1, hsl(p.type.hue, 95, 45));
      ctx.fillStyle = g;
      roundRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.type.label, 0, 1);
      ctx.restore();
    }
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = hsl(p.hue, 100, 65);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.save();
    ctx.font = 'bold 20px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.shadowColor = hsl(f.hue, 100, 60);
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#fff';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawReadyHint(time) {
    const a = 0.5 + Math.sin(time * 0.005) * 0.4;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#aefcff';
    ctx.font = 'bold 18px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 14;
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
  //  Pętla główna (fixed-ish timestep, znormalizowana do 60fps)
  // ============================================================
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 16.667; // 1.0 = klatka 60fps
    last = now;
    dt = Math.min(dt, 2.5); // ochrona przy lagach

    if (state === State.LEVELCLEAR) {
      levelClearTimer -= dt;
      updateParticles(dt);
      if (levelClearTimer <= 0) nextLevel();
    } else if (state !== State.PAUSED) {
      update(dt);
    }
    render(now);
    requestAnimationFrame(loop);
  }

  updateHUD();
  requestAnimationFrame(loop);
})();
