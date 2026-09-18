# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A classic Tetris implementation in vanilla JavaScript, HTML5 Canvas, and CSS — no dependencies, no build step, no framework. The README (in Spanish) is the primary source of truth for gameplay/feature documentation; keep it in sync with `game.js` when behavior changes.

## Running the game

There is no build, lint, or test tooling (no `package.json`). To run:

```bash
# Open directly
start index.html      # Windows
open index.html        # macOS

# Or serve locally (needed if testing features that require http:// origin)
python3 -m http.server 8000
npx serve .
```

Then open the page (or `http://localhost:8000`) in a browser and test changes manually by playing the game.

## Architecture

Three files, each with a single responsibility:

- **`index.html`** — DOM structure only: the main `<canvas id="board">` (300×600, i.e. `COLS×BLOCK` by `ROWS×BLOCK`), the `<canvas id="next-canvas">` preview, the HUD panel (score/lines/level), and the pause/game-over overlay.
- **`style.css`** — dark/retro arcade visual styling.
- **`game.js`** — all game logic, in one file with module-level `let` state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.). No classes, no modules.

### Key mechanics in `game.js`

- **Board model**: a `ROWS × COLS` matrix where each cell is `0` (empty) or a color index `1–7` identifying which piece type occupies it.
- **Pieces**: defined as square matrices in `PIECES`. Rotation is done via `rotateCW` (transpose + reverse), not by storing 4 pre-rotated states.
- **Collision** (`collide`): checks board bounds and overlap with locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until a non-colliding position is found, else the rotation is discarded.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates elapsed time in `dropAccum` and advances the piece one row once `dropAccum >= dropInterval`.
- **Line clearing** (`clearLines`): scans bottom-to-top, splices out full rows and unshifts empty ones at the top; re-checks the same row index after a splice.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 points per cell dropped, soft drop adds 1 point per row.
- **Level/speed**: level increases every 10 lines; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Ghost piece** (`ghostY`): projects the current piece straight down to its landing row, drawn at `globalAlpha = 0.2`.

### Control flow

```
init() → createBoard(), next = randomPiece(), spawn(), requestAnimationFrame(loop)
loop(ts) → accumulate dt → drop piece or lockPiece() when dropInterval exceeded → draw() → requestAnimationFrame(loop)
keydown → move / tryRotate / softDrop / hardDrop / togglePause
```

`spawn()` promotes `next` to `current` and generates a new `next`; if the newly spawned piece immediately collides, `endGame()` fires and the Game Over overlay is shown.

### Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, `dropInterval` (initial). If `COLS`, `ROWS`, or `BLOCK` change, update the `<canvas id="board">` `width`/`height` attributes in `index.html` to match (`COLS×BLOCK` and `ROWS×BLOCK`).

## Controls (for manual testing)

| Key | Action |
|---|---|
| `←` / `→` | Move horizontally |
| `↑` / `X` | Rotate clockwise |
| `↓` | Soft drop |
| `Space` | Hard drop |
| `P` | Pause/resume |
