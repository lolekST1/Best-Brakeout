# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**NEON BREAKOUT** — a visually rich Breakout/Arkanoid game. Pure HTML5 Canvas 2D + vanilla JavaScript, **zero dependencies, no build step, no framework**. UI text and code comments are in **Polish**; keep new user-facing strings and comments in Polish to match.

## Commands

There is no build system, package manager, linter, or test suite. Workflow:

- **Run locally:** open `index.html` directly, or serve the folder (needed for the service worker / PWA to register):
  ```bash
  python3 -m http.server 8000   # → http://localhost:8000
  ```
- **Syntax-check JS after edits** (the only automated check available here):
  ```bash
  node --check game.js
  ```
- **Validate manifest JSON:** `node -e "JSON.parse(require('fs').readFileSync('manifest.webmanifest'))"`
- **Deploy:** push to `main`. GitHub Pages is configured as *Deploy from a branch → main / root* (no CI workflow); the site auto-rebuilds at `https://lolekst1.github.io/Best-Brakeout/`. After changing `game.js`/`style.css`/`index.html`, **bump `CACHE` in `sw.js`** (e.g. `neon-breakout-vN`) or installed PWA clients keep serving stale cached assets.

**Cannot be browser-tested from this environment** (sandbox blocks `github.io`; no Canvas/Web Audio runtime). `node --check` only catches syntax, not runtime/reference errors — review integration points carefully and ask the user to verify behavior.

## Architecture

Three files do everything: `index.html` (shell, HUD, overlay menu/panels, editor DOM), `style.css` (neon styling, overlay layout, per-theme CSS vars), and `game.js` — the entire engine as **one big IIFE** (`(() => { 'use strict'; ... })()`), ~2000 lines, divided by `// ===` banner comments (Audio, Motywy, Tryby, Poziomy, Power-upy, Edytor, Sklep, Przepływ gry, Update, BOSS, render functions, główna pętla).

Key consequence of the single-IIFE design: **everything shares one closure scope.** Functions are hoisted, but `const`/`let` module state (e.g. `stats`, `coins`, `$shareBtn`, DOM refs declared mid-file) must be initialized before any code path that reads them runs. All gameplay reads happen inside `loop()`/`update()` which start at the very end via `requestAnimationFrame`, so ordering is usually fine — but adding new top-level `const` that an earlier-defined function reads at *load time* will throw (TDZ).

### Core loop & state machine

- `State = { MENU, READY, PLAYING, PAUSED, LEVELCLEAR, GAMEOVER, WIN }`; current state in `state`.
- `loop(now)` → eases `zoom`, honors `hitStop` (skips `update`, still renders), runs `update(dt)` unless paused, then `render(now)`. `dt` is normalized to 60fps (`1.0` = one 60fps frame); all motion is `* dt`.
- `update(dt)` decays effect timers, moves paddle/powerups/bricks/balls/boss/rockets, handles collisions, checks level-clear.
- Physics use **fixed constant ball speed**: each frame balls are renormalized to `speedTarget()`. Collisions reposition + reflect via `bounceOff()` (direction-aware: only flips velocity when the ball is moving *into* the surface, and fully ejects — this is what prevents getting stuck in steel/boss). `stepBall` sub-steps for CCD and **breaks after one collision per frame**.

### Cross-cutting systems (where to hook new behavior)

- **`FX` object** = timed active effects (frames @60fps): `wide, slow, sticky, rockets, fireball, big, magnet, shield, double` (positive) + `shrink, speedup, reverse` (negative). `grant(k, frames)` sets them; `update` decrements; `drawActiveFX()` shows them. Most "make the ball/paddle behave differently" features read `FX` inside `speedTarget()`, `paddleTargetW()`, `ballRadius()`, `stepBall`, `hitBricks`.
- **`mods`** = run modifiers (`fast, tiny, gravity, tough, chaos, big`) applied by game modes / daily challenge; read in the same param functions + `buildLevel`/`spawnPowerup`. `gravity` (number) is applied in `stepBall`.
- **Game modes** (`MODES`, `selectedMode`, `mode`, `endless`, `noLifeLoss`, `timeLeft`) and **daily challenge** (`mulberry32` seeded RNG by `dateSeed`, `buildDailyMods`) are configured in `startGame()`.
- **Bricks**: built by `buildLevel()` which dispatches to boss levels (`level % 5 === 0`), art levels (`artWordFor` — spells words like LOLEK), custom levels (editor), or procedural `patterns`. Brick `type`: `normal/steel/explosive/moving/regen/multiplier`. Damage flows `hitBricks → damageBrick → destroyBrick → (explode for chain)`. Level complete = all bricks gone (steel ignored) **and** boss dead.
- **Themes/skins**: `THEMES[key]` drives all draw colors via `T`; `applyTheme` also sets CSS vars (`--neon-cyan` etc.). Shop ball/paddle skins (`ballStyle()`/`padStyle()`) override `T` in `drawBalls`/`drawPaddle`.
- **Audio** (single IIFE): `master → {sfx, music}` gain graph; SFX are synthesized one-shots, music is a lookahead scheduler over `TRACKS`. `Audio.setIntensity(x)` (driven by combo/boss/low-life each frame) scales music gain + adds kick/lead/hats. `autoTrack` respects a manual `forcedTrack` set by `cycleTrack`.

### Persistence (localStorage keys)

`neonBreakoutScores` (TOP-10), `neonBreakoutStats` + `neonBreakoutAch` (stats/achievements, written via throttled `bumpStats()`), `neonBreakoutVol`, `neonBreakoutTheme`, `neonBreakoutMode`, `neonBreakoutDaily` (per-day challenge best), `neonBreakoutCoins`, `neonBreakoutShop`. Achievements are data-driven (`ACHIEVEMENTS[].test(stats)`) and unlock via `checkAchievements()` → toast.

### UI / overlay flow

One `#overlay` panel hosts menu, pause, and end screens. `showPanels()`/`hidePanels()` toggle the TOP-10 / Achievements / Shop tabs; `setPanel(p)` switches them. `showOverlay()` is the pause screen (adds `.compact` to hide settings); `showEndScreen()` handles game-over/win (coins earned, high-score name entry, share button). The level editor is a separate `#editor` overlay; "GRAJ" sets `customCells` + `startCustom` and calls `startGame()`.

## README

`README.md` is the player-facing feature list (power-ups, special bricks, bosses, modes, challenges, shop, themes, audio, editor, PWA, share) and the play link — keep it in sync when adding features.
