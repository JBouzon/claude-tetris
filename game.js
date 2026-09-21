'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#ffffff', // J - white
  '#ffb74d', // L - orange
  '#9e9e9e', // N - metallic gray
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (nut)
];

const SKIN_COLORS = {
  retro: COLORS,
  neon: [
    null,
    '#00e5ff', // I - neon cyan
    '#faff00', // O - neon yellow
    '#e040fb', // T - neon magenta
    '#39ff14', // S - neon green
    '#ff1744', // Z - neon red
    '#ffffff', // J - neon white
    '#ff9100', // L - neon orange
    '#2979ff', // N - neon electric blue
  ],
  pastel: [
    null,
    '#a8e6ef', // I - pastel cyan
    '#fff3b0', // O - pastel yellow
    '#d9b3e6', // T - pastel purple
    '#b8e6b0', // S - pastel green
    '#f4b6b6', // Z - pastel red
    '#eef0f5', // J - pastel white/gray
    '#ffd9a8', // L - pastel orange
    '#cfd8dc', // N - pastel gray
  ],
  pixel: COLORS, // pixel art reuses retro's palette; look comes from the texture overlay
};

let currentSkin = 'retro';

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeSwitch = document.getElementById('theme-switch');
const skinSelect = document.getElementById('skin-select');

const THEME_STORAGE_KEY = 'tetris-theme';
const SKIN_STORAGE_KEY = 'tetris-skin';

function getGridColor() {
  if (currentSkin === 'neon') return 'rgba(0, 229, 255, 0.15)';
  return getComputedStyle(document.body).getPropertyValue('--grid-line').trim() || '#22222e';
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  themeSwitch.checked = theme === 'light';
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

function applySkin(skin) {
  currentSkin = SKIN_COLORS[skin] ? skin : 'retro';
  skinSelect.value = currentSkin;
  localStorage.setItem(SKIN_STORAGE_KEY, currentSkin);
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_STORAGE_KEY);
  applySkin(saved || 'retro');
}

themeSwitch.addEventListener('change', () => {
  applyTheme(themeSwitch.checked ? 'light' : 'dark');
  draw();
  drawNext();
});

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  draw();
  drawNext();
});

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function tracePixelRoundedRect(context, x, y, w, h, r) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, r);
  } else {
    const rr = Math.min(r, w / 2, h / 2);
    context.moveTo(x + rr, y);
    context.lineTo(x + w - rr, y);
    context.arcTo(x + w, y, x + w, y + rr, rr);
    context.lineTo(x + w, y + h - rr);
    context.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    context.lineTo(x + rr, y + h);
    context.arcTo(x, y + h, x, y + h - rr, rr);
    context.lineTo(x, y + rr);
    context.arcTo(x, y, x + rr, y, rr);
    context.closePath();
  }
}

function drawPixelTexture(context, px, py, s) {
  const half = s / 2;
  context.fillStyle = 'rgba(0,0,0,0.15)';
  context.fillRect(px, py, half, half);
  context.fillRect(px + half, py + half, s - half, s - half);
  context.fillStyle = 'rgba(255,255,255,0.15)';
  context.fillRect(px + half, py, s - half, half);
  context.fillRect(px, py + half, half, s - half);
}

// Shared base fill used by retro/pixel/neon: flat fillRect + a lighter
// top highlight strip. `highlightAlpha` lets neon use a slightly brighter strip.
function fillBlockBase(context, px, py, s, color, highlightAlpha) {
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  context.fillStyle = `rgba(255,255,255,${highlightAlpha})`;
  context.fillRect(px, py, s, 4);
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  // applySkin() only ever sets currentSkin to a valid SKIN_COLORS key, but
  // fall back to COLORS defensively in case that invariant is ever broken.
  const colors = SKIN_COLORS[currentSkin] || COLORS;
  const color = colors[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  context.globalAlpha = alpha ?? 1;

  switch (currentSkin) {
    case 'neon':
      context.shadowColor = color;
      context.shadowBlur = 12;
      fillBlockBase(context, px, py, s, color, 0.18);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      break;
    case 'pastel': {
      const r = Math.max(2, Math.min(6, s / 4));
      tracePixelRoundedRect(context, px, py, s, s, r);
      context.fillStyle = color;
      context.fill();
      context.save();
      context.clip();
      context.fillStyle = 'rgba(255,255,255,0.3)';
      context.fillRect(px, py, s, 4);
      context.restore();
      break;
    }
    case 'pixel':
      fillBlockBase(context, px, py, s, color, 0.12);
      drawPixelTexture(context, px, py, s);
      break;
    case 'retro':
    default:
      fillBlockBase(context, px, py, s, color, 0.12);
      break;
  }

  context.globalAlpha = 1;
}

function paintSkinBackground(context, canvasEl) {
  if (currentSkin === 'neon') {
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvasEl.width, canvasEl.height);
  }
}

function drawGrid() {
  ctx.strokeStyle = getGridColor();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintSkinBackground(ctx, canvas);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  paintSkinBackground(nextCtx, nextCanvas);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  initTheme();
  initSkin();
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

init();
