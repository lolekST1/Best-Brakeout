# 🎮 NEON BREAKOUT

Najbardziej **wypasiona wizualnie** wersja klasycznej gry Breakout / Arkanoid.
Czysty HTML5 Canvas + JavaScript, **zero zależności**, zero buildu — po prostu otwórz i graj.

![tech](https://img.shields.io/badge/Canvas2D-vanilla_JS-00f0ff) ![deps](https://img.shields.io/badge/dependencies-0-ff00e6)

## ▶️ Graj online

👉 **https://lolekst1.github.io/Best-Brakeout/**

> Pierwsze uruchomienie wymaga jednorazowego włączenia GitHub Pages:
> **Settings → Pages → Build and deployment → Source: „Deploy from a branch" → Branch: `main` `/ (root)` → Save**.
> Po ~1 minucie gra będzie dostępna pod powyższym linkiem.

## ✨ Co czyni ją wypasioną

- 🌈 **Neonowa estetyka** — świecące cegły z gradientami, bloom przez `shadowBlur`, paleta cyan→magenta
- 💥 **Cząsteczki** — eksplozje przy rozbiciu cegieł, iskry przy odbiciach, tryb mieszania `lighter`
- 🌠 **Świecący ogon piłki** i animowane tło z paralaksą gwiazd oraz pulsującą mgławicą
- 📳 **Screen shake** i błyski przy utracie życia / wielkich trafieniach
- 🔥 **System combo** z mnożnikiem punktów i animowanym wskaźnikiem
- 🎵 **Dźwięk syntezowany na żywo** (Web Audio API) + **muzyka w tle** (synthwave generowany na żywo)
- 🎚️ **25 poziomów** z proceduralnymi wzorami (piramida, diament, fala, szachownica...)
- 🏆 **Tabela TOP 10** z zapisem w `localStorage` i wpisywaniem nicku na koniec gry
- 📱 **Responsywność** + sterowanie dotykowe dla telefonów
- 🖱️ Sterowanie **myszą, klawiaturą i dotykiem**

### ⚡ Power-upy pozytywne (łap je!)

| Ikona | Efekt |
|-------|-------|
| `×3` | **Multiball** — trzy piłki naraz |
| `↔` | **Szersza paletka** |
| `⏳` | **Slow-mo** — spowolnienie piłki |
| `⊕` | **Klej** — piłki przyklejają się do paletki (wystrzel SPACJĄ) |
| `🚀` | **Rakiety** — paletka sama wystrzeliwuje pociski w cegły |
| `🔥` | **Ognista kula** — przebija cegły bez odbicia |
| `⬤` | **Wielka piłka** |
| `🛡` | **Tarcza** — dolna bariera odbijająca piłkę |
| `🧲` | **Magnes** — przyciąga dobre bonusy, odpycha złe |
| `2×` | **Podwójne punkty** |
| `♥` | **Dodatkowe życie** |
| `★` | **Bonus punktowy** |

### ☠️ Power-upy negatywne (UCIEKAJ przed nimi!)

Spadają jako **czerwone, kolczaste** kapsuły — nie łap ich, odsuń paletkę!

| Ikona | Efekt |
|-------|-------|
| `💣` | **Bomba** — tracisz życie |
| `✖` | **Negacja** — kasuje wszystkie aktywne bonusy |
| `><` | **Zmniejszenie paletki** |
| `»»` | **Przyspieszenie piłki** |
| `⇄` | **Odwrócone sterowanie** |

Aktywne efekty widać na pasku w lewym dolnym rogu (z odliczaniem czasu).

### 🧱 Cegły specjalne

Pojawiają się losowo, a ich częstotliwość rośnie wraz z poziomem:

| Wygląd | Typ | Zachowanie |
|--------|-----|------------|
| 🪨 metaliczna z nitami | **Stalowa** | Nie do zniszczenia (blokuje też ognistą kulę) — nie trzeba jej rozbijać, by ukończyć poziom |
| 💥 pomarańczowa | **Wybuchowa** | Po rozbiciu niszczy sąsiadów w promieniu — łańcuchowo odpala kolejne wybuchowe |
| ↔ animowana | **Ruchoma** | Przesuwa się w poziomie tam i z powrotem |
| ♻ zielona | **Regenerująca** | Jeśli nie dobijesz jej szybko, odbudowuje wytrzymałość |
| ★ złota | **Mnożnikowa** | Potrójne punkty i **gwarantowany** dobry power-up |

### 🎨 Motywy / skórki

Cztery style do wyboru z menu (zapamiętywane): **NEON**, **VAPORWAVE**, **CRT RETRO** (ze scanline), **MATRIX** (zielony monochrom + scanline). Motyw zmienia tło, gwiazdy, paletkę, piłkę, akcenty i kolory cegieł.

### 👹 Boss co 5. poziom

Poziomy 5, 10, 15, 20, 25 to walki z **bossem**: ma pasek HP (rosnący z poziomem), porusza się i ostrzeliwuje kolczastymi pociskami, które trzeba omijać (trafienie paletki = utrata życia). Ranisz go piłką i rakietami; ognista kula zadaje podwójne obrażenia. Poziom 25 to finałowy boss.

### ✍️ Plansze artystyczne

Co kilka poziomów (3, 8, 13, 18, 23) cegły układają się w napis **LOLEK**.

### 🎖️ Osiągnięcia + statystyki

12 osiągnięć (rozbij 1000 cegieł, combo ×20, pokonaj bossa, ukończ grę, 50 000 pkt...) z powiadomieniami w grze i panelem w menu (zakładka obok TOP 10). Statystyki i odblokowania zapisywane w `localStorage`.

## 🚀 Uruchomienie

Po prostu otwórz `index.html` w przeglądarce. Nic nie trzeba instalować.

Albo lokalny serwer (zalecane dla pełni dźwięku):

```bash
python3 -m http.server 8000
# otwórz http://localhost:8000
```

## 🕹️ Sterowanie

| Akcja | Klawisz |
|-------|---------|
| Ruch paletki | `←` `→` / `A` `D` / mysz / dotyk |
| Wystrzel / odklej piłkę | `SPACJA` / klik / dotyk |
| Pauza | `P` / `ESC` |
| Restart | `ENTER` na ekranie końca |
| Rakiety | strzelają automatycznie po zebraniu 🚀 |

## 🧱 Struktura

```
index.html   — szkielet, HUD, ekrany overlay
style.css    — neonowy styl, animacje, glitch, glow
game.js      — silnik gry: fizyka, kolizje, cząsteczki, audio, poziomy
```

Miłej zabawy! 🌟
