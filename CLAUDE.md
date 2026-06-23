# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"Neon Breakout" — a heavily featured Breakout/Arkanoid clone. Pure HTML5 Canvas + vanilla JavaScript, zero dependencies, zero build step. Deployed on GitHub Pages.

Live: https://lolekst1.github.io/Best-Brakeout/

## Running locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly from the filesystem also works (no CDN dependencies). The service worker (`sw.js`) enables offline play.

## File structure

```
index.html   — page shell, HUD elements, overlay screens, all DOM
style.css    — neon aesthetic, animations, glow, glitch effects
game.js      — entire game engine (2006 lines): physics, rendering, audio, levels
sw.js        — service worker (PWA / offline)
manifest.webmanifest — PWA metadata
```

All game logic lives in a single IIFE in `game.js`. There is no module system.

## Architecture (game.js)

The canvas is scaled responsively with DPR support via `resize()`. Logical world size is `W=880 × H=640`.

**Major sections (in order):**

- `Audio` IIFE — Web Audio API synthesizer, 3 music tracks, dynamic intensity, per-type SFX, volume sliders persisted in `localStorage`
- `Theme` system — 4 visual themes (NEON, VAPORWAVE, CRT RETRO, MATRIX), stored in `localStorage`
- `Particles` — explosion bursts, sparks, screen-shake, hit-stop, squash effects
- `Bricks` — grid `13 × 8`; 5 special types (steel, explosive, moving, regenerating, multiplier)
- `PowerUps` — 12 positive + 5 negative types; active-effect HUD with countdown bars
- `Ball` / `Paddle` — physics with glowing trail, sticky mode, fire-ball mode
- `Boss` — every 5th level; HP bar, movement, bullet shooting
- `Levels` — 25 procedural patterns + 5 art levels spelling "LOLEK"; `LevelEditor` for custom boards
- `Scoreboard` — TOP 10 in `localStorage`, nick entry, Web Share API
- `Achievements` — 12 unlockables stored in `localStorage`
- `Shop` — coin currency; skins + perks; persistent in `localStorage`
- `GameModes` — Classic / Endless / Timed / One-life / Gravity / Daily Challenge
- Main loop — `requestAnimationFrame`; `update()` + `draw()` per frame

State is kept in module-level variables; there is no explicit state machine class.

## Deployment

Any push to `main` is immediately live via GitHub Pages (static serving of repo root, configured manually — no workflow file).
