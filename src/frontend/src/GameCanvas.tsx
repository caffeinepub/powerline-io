import React, { useEffect, useRef, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
export const GRID_SIZE = 100;
export const CELL_SIZE = 9;

const CANVAS_W = GRID_SIZE * CELL_SIZE;
const CANVAS_H = GRID_SIZE * CELL_SIZE;

const INITIAL_TICK_RATE = 8;
const MAX_TICK_RATE = 18;
const SPEED_INCREASE_INTERVAL = 10_000;

const BOT_COLORS = [
  "#ff00ff",
  "#00ff41",
  "#ff6600",
  "#ffff00",
  "#ff2244",
  "#ff88ff",
];
const PLAYER_COLOR = "#00ffff";
const NUM_BOTS = 5;

// ─── Types ────────────────────────────────────────────────────────────────────
type Dir = { x: number; y: number };

const DIR_UP: Dir = { x: 0, y: -1 };
const DIR_DOWN: Dir = { x: 0, y: 1 };
const DIR_LEFT: Dir = { x: -1, y: 0 };
const DIR_RIGHT: Dir = { x: 1, y: 0 };
const ALL_DIRS: Dir[] = [DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT];

function dirOpposite(d: Dir): Dir {
  return { x: -d.x, y: -d.y };
}

function dirEq(a: Dir, b: Dir): boolean {
  return a.x === b.x && a.y === b.y;
}

interface Player {
  id: number;
  x: number;
  y: number;
  dir: Dir;
  nextDir: Dir;
  color: string;
  trail: Set<number>;
  alive: boolean;
  isBot: boolean;
  /** trail history ordered for shimmer effect */
  trailArray: number[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: "spark" | "ring" | "trail_spark";
}

interface ShockRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  color: string;
}

export interface GameCallbacks {
  onScoreUpdate: (score: number) => void;
  onBotsUpdate: (bots: number) => void;
  onGameOver: (score: number) => void;
}

function encode(x: number, y: number): number {
  return y * GRID_SIZE + x;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
}

// ─── Bot AI ───────────────────────────────────────────────────────────────────
function botChooseDir(bot: Player, allTrails: Set<number>): Dir {
  const LOOKAHEAD = 6;

  function isSafe(dir: Dir, steps: number): boolean {
    let nx = bot.x;
    let ny = bot.y;
    for (let i = 0; i < steps; i++) {
      nx += dir.x;
      ny += dir.y;
      if (!inBounds(nx, ny)) return false;
      if (allTrails.has(encode(nx, ny))) return false;
    }
    return true;
  }

  function countOpen(dir: Dir): number {
    const visited = new Set<number>();
    const queue: [number, number][] = [];
    const nx = bot.x + dir.x;
    const ny = bot.y + dir.y;
    if (!inBounds(nx, ny) || allTrails.has(encode(nx, ny))) return 0;
    queue.push([nx, ny]);
    visited.add(encode(nx, ny));
    let count = 0;
    while (queue.length > 0 && count < 200) {
      const [cx, cy] = queue.shift()!;
      count++;
      for (const d of ALL_DIRS) {
        const tx = cx + d.x;
        const ty = cy + d.y;
        const key = encode(tx, ty);
        if (inBounds(tx, ty) && !allTrails.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push([tx, ty]);
        }
      }
    }
    return count;
  }

  const opp = dirOpposite(bot.dir);
  const candidates = ALL_DIRS.filter(
    (d) => !dirEq(d, opp) && isSafe(d, 1)
  );

  if (candidates.length === 0) return bot.dir;
  if (isSafe(bot.dir, LOOKAHEAD) && Math.random() < 0.7) return bot.dir;

  const safeCandidates = candidates.filter((d) => isSafe(d, LOOKAHEAD));
  const pool = safeCandidates.length > 0 ? safeCandidates : candidates;
  const scored = pool.map((d) => ({ d, score: countOpen(d) }));
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 1) return scored[0].d;
  if (Math.random() < 0.7) return scored[0].d;
  return scored[Math.min(1, scored.length - 1)].d;
}

// ─── Hex to RGB ───────────────────────────────────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 255, b: 255 };
}

// ─── Grid rendering (pulsing) ─────────────────────────────────────────────────
function drawGrid(ctx: CanvasRenderingContext2D, time: number) {
  const pulse = 0.3 + 0.15 * Math.sin(time * 0.0008);
  ctx.strokeStyle = `rgba(20, 20, 70, ${pulse})`;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= GRID_SIZE; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, CANVAS_H);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID_SIZE; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(CANVAS_W, y * CELL_SIZE);
    ctx.stroke();
  }

  // Accent grid lines every 10 cells
  const accentPulse = 0.12 + 0.08 * Math.sin(time * 0.0005 + 1);
  ctx.strokeStyle = `rgba(40, 40, 120, ${accentPulse})`;
  ctx.lineWidth = 1;
  for (let x = 0; x <= GRID_SIZE; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, CANVAS_H);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID_SIZE; y += 10) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(CANVAS_W, y * CELL_SIZE);
    ctx.stroke();
  }
}

// ─── Trail rendering (multi-layer neon) ──────────────────────────────────────
function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: Set<number>,
  trailArray: number[],
  color: string,
  time: number
) {
  const rgb = hexToRgb(color);
  const len = trailArray.length;

  // Layer 1: outer fat glow
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`;
  for (const key of trail) {
    const x = key % GRID_SIZE;
    const y = Math.floor(key / GRID_SIZE);
    ctx.fillRect(
      x * CELL_SIZE - 3,
      y * CELL_SIZE - 3,
      CELL_SIZE + 6,
      CELL_SIZE + 6
    );
  }

  // Layer 2: mid glow
  ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.25)`;
  for (const key of trail) {
    const x = key % GRID_SIZE;
    const y = Math.floor(key / GRID_SIZE);
    ctx.fillRect(
      x * CELL_SIZE - 1,
      y * CELL_SIZE - 1,
      CELL_SIZE + 2,
      CELL_SIZE + 2
    );
  }

  // Layer 3: core with shimmer from tail to head
  for (let i = 0; i < len; i++) {
    const key = trailArray[i];
    const x = key % GRID_SIZE;
    const y = Math.floor(key / GRID_SIZE);
    const t = i / Math.max(len - 1, 1); // 0=oldest, 1=newest
    // Shimmer wave travelling along trail
    const wave = 0.6 + 0.4 * Math.sin(time * 0.004 - t * 8);
    const alpha = (0.4 + 0.6 * t) * wave;
    ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
    ctx.fillRect(
      x * CELL_SIZE + 1,
      y * CELL_SIZE + 1,
      CELL_SIZE - 2,
      CELL_SIZE - 2
    );
  }

  // Layer 4: bright center line for recent cells
  const recentCount = Math.min(len, 12);
  ctx.shadowBlur = 14;
  ctx.shadowColor = color;
  for (let i = len - recentCount; i < len; i++) {
    if (i < 0) continue;
    const key = trailArray[i];
    const x = key % GRID_SIZE;
    const y = Math.floor(key / GRID_SIZE);
    const t = (i - (len - recentCount)) / recentCount;
    ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.45 * t})`;
    ctx.fillRect(
      x * CELL_SIZE + 3,
      y * CELL_SIZE + 3,
      CELL_SIZE - 6,
      CELL_SIZE - 6
    );
  }
  ctx.shadowBlur = 0;
}

// ─── Head rendering (chromatic aberration + corona) ──────────────────────────
function drawHead(
  ctx: CanvasRenderingContext2D,
  p: Player,
  time: number
) {
  const px = p.x * CELL_SIZE;
  const py = p.y * CELL_SIZE;
  const rgb = hexToRgb(p.color);

  const pulse = 1 + 0.15 * Math.sin(time * 0.01 + p.id);

  // Outer corona ring
  ctx.save();
  const coronaSize = CELL_SIZE * 2.2 * pulse;
  const coronaGrad = ctx.createRadialGradient(
    px + CELL_SIZE / 2,
    py + CELL_SIZE / 2,
    0,
    px + CELL_SIZE / 2,
    py + CELL_SIZE / 2,
    coronaSize
  );
  coronaGrad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`);
  coronaGrad.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b},0.1)`);
  coronaGrad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
  ctx.fillStyle = coronaGrad;
  ctx.fillRect(
    px + CELL_SIZE / 2 - coronaSize,
    py + CELL_SIZE / 2 - coronaSize,
    coronaSize * 2,
    coronaSize * 2
  );
  ctx.restore();

  // Chromatic aberration: offset red/blue channels slightly
  const abr = 2;
  ctx.save();
  // Red channel offset
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = `rgba(255,0,0,0.5)`;
  ctx.shadowBlur = 20;
  ctx.shadowColor = `rgba(255,0,0,0.8)`;
  ctx.fillRect(px - abr - 1, py - 1, CELL_SIZE + 2, CELL_SIZE + 2);
  // Blue channel offset
  ctx.fillStyle = `rgba(0,100,255,0.5)`;
  ctx.shadowColor = `rgba(0,100,255,0.8)`;
  ctx.fillRect(px + abr - 1, py - 1, CELL_SIZE + 2, CELL_SIZE + 2);
  ctx.restore();

  // Main head glow body
  ctx.save();
  ctx.shadowBlur = 30 * pulse;
  ctx.shadowColor = p.color;
  ctx.fillStyle = p.color;
  ctx.fillRect(px - 1, py - 1, CELL_SIZE + 2, CELL_SIZE + 2);
  ctx.restore();

  // Bright white center with inner glow
  ctx.save();
  ctx.shadowBlur = 50;
  ctx.shadowColor = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(px + 2, py + 2, CELL_SIZE - 4, CELL_SIZE - 4);
  ctx.restore();

  // Direction arrow (subtle)
  ctx.save();
  ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.6)`;
  const cx = px + CELL_SIZE / 2;
  const cy = py + CELL_SIZE / 2;
  ctx.translate(cx, cy);
  const angle = Math.atan2(p.dir.y, p.dir.x);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(CELL_SIZE * 0.6, 0);
  ctx.lineTo(CELL_SIZE * 0.2, -CELL_SIZE * 0.25);
  ctx.lineTo(CELL_SIZE * 0.2, CELL_SIZE * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ─── Shockwave rings ──────────────────────────────────────────────────────────
function drawShockRings(ctx: CanvasRenderingContext2D, rings: ShockRing[]) {
  for (const ring of rings) {
    const alpha = ring.life * 0.8;
    const rgb = hexToRgb(ring.color);
    ctx.save();
    ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
    ctx.lineWidth = 2 + (1 - ring.life) * 4;
    ctx.shadowBlur = 15;
    ctx.shadowColor = ring.color;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ─── Scan line overlay ────────────────────────────────────────────────────────
function drawScanLines(ctx: CanvasRenderingContext2D, time: number) {
  // Moving scan line
  const scanY = (time * 0.1) % CANVAS_H;
  const scanGrad = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40);
  scanGrad.addColorStop(0, "rgba(0,255,255,0)");
  scanGrad.addColorStop(0.5, "rgba(0,255,255,0.04)");
  scanGrad.addColorStop(1, "rgba(0,255,255,0)");
  ctx.fillStyle = scanGrad;
  ctx.fillRect(0, scanY - 40, CANVAS_W, 80);

  // Static horizontal scan lines (subtle)
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  for (let y = 0; y < CANVAS_H; y += 3) {
    ctx.fillRect(0, y, CANVAS_W, 1);
  }
}

// ─── Vignette ─────────────────────────────────────────────────────────────────
function drawVignette(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createRadialGradient(
    CANVAS_W / 2,
    CANVAS_H / 2,
    CANVAS_W * 0.3,
    CANVAS_W / 2,
    CANVAS_H / 2,
    CANVAS_W * 0.75
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

// ─── HUD rendering ────────────────────────────────────────────────────────────
function drawHUD(
  ctx: CanvasRenderingContext2D,
  score: number,
  botsLeft: number,
  elapsed: number,
  tickRate: number
) {
  ctx.save();
  ctx.font = 'bold 15px "JetBrains Mono", monospace';
  ctx.textBaseline = "top";

  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  // Speed bar
  const speedPct = (tickRate - INITIAL_TICK_RATE) / (MAX_TICK_RATE - INITIAL_TICK_RATE);
  const barW = 80;
  const barH = 5;
  const barX = (CANVAS_W - barW) / 2;
  const barY = 34;
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(barX, barY, barW, barH);
  if (speedPct > 0) {
    const spGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    spGrad.addColorStop(0, "#00ff41");
    spGrad.addColorStop(0.5, "#ffff00");
    spGrad.addColorStop(1, "#ff0044");
    ctx.fillStyle = spGrad;
    ctx.shadowBlur = 6;
    ctx.shadowColor = "#00ff41";
    ctx.fillRect(barX, barY, barW * speedPct, barH);
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText("SPD", barX + barW + 5, barY - 1);

  ctx.font = 'bold 15px "JetBrains Mono", monospace';

  // Score
  ctx.shadowBlur = 14;
  ctx.shadowColor = "#00ffff";
  ctx.fillStyle = "#00ffff";
  ctx.fillText(`SCORE: ${score}`, 12, 12);

  // Bots
  ctx.shadowColor = "#ff00ff";
  ctx.fillStyle = "#ff00ff";
  ctx.fillText(
    `BOTS: ${botsLeft}`,
    CANVAS_W - 12 - ctx.measureText(`BOTS: ${botsLeft}`).width,
    12
  );

  // Timer
  ctx.shadowColor = "#00ff41";
  ctx.fillStyle = "#00ff41";
  const timeW = ctx.measureText(timeStr).width;
  ctx.fillText(timeStr, (CANVAS_W - timeW) / 2, 12);

  ctx.shadowBlur = 0;
  ctx.restore();
}

// ─── Particles ────────────────────────────────────────────────────────────────
function spawnExplosion(
  px: number,
  py: number,
  color: string,
  particles: Particle[],
  rings: ShockRing[]
) {
  const cx = px * CELL_SIZE + CELL_SIZE / 2;
  const cy = py * CELL_SIZE + CELL_SIZE / 2;

  // Spark particles
  for (let i = 0; i < 50; i++) {
    const angle = (Math.PI * 2 * i) / 50 + Math.random() * 0.3;
    const speed = 1.5 + Math.random() * 5;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 0.6 + Math.random() * 0.6,
      color,
      size: 2 + Math.random() * 4,
      type: "spark",
    });
  }

  // Additional white sparks
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 0.3 + Math.random() * 0.4,
      color: "#ffffff",
      size: 1 + Math.random() * 2,
      type: "spark",
    });
  }

  // Shockwave rings
  rings.push({ x: cx, y: cy, radius: 5, maxRadius: CELL_SIZE * 8, life: 1, color });
  rings.push({
    x: cx,
    y: cy,
    radius: 5,
    maxRadius: CELL_SIZE * 5,
    life: 0.7,
    color: "#ffffff",
  });
}

function updateParticles(particles: Particle[], dt: number): Particle[] {
  return particles
    .map((p) => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      vx: p.vx * 0.93,
      vy: p.vy * 0.93 + 0.05, // subtle gravity
      life: p.life - dt / (p.maxLife * 1000),
    }))
    .filter((p) => p.life > 0);
}

function updateRings(rings: ShockRing[], dt: number): ShockRing[] {
  return rings
    .map((r) => ({
      ...r,
      radius: r.radius + (r.maxRadius - r.radius) * 0.12,
      life: r.life - dt / 500,
    }))
    .filter((r) => r.life > 0);
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.shadowBlur = 12;
    ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    if (p.type === "spark") {
      // Draw as elongated line spark
      const len = Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 1.5;
      const angle = Math.atan2(p.vy, p.vx);
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.fillRect(-len / 2, -p.size / 3, len, p.size / 1.5);
    } else {
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }
}

// ─── Spawn positions ──────────────────────────────────────────────────────────
function getSpawnPositions(): { x: number; y: number; dir: Dir }[] {
  const pad = 10;
  return [
    { x: pad, y: Math.floor(GRID_SIZE / 2), dir: DIR_RIGHT },
    { x: GRID_SIZE - pad, y: Math.floor(GRID_SIZE / 2), dir: DIR_LEFT },
    { x: Math.floor(GRID_SIZE / 2), y: pad, dir: DIR_DOWN },
    { x: Math.floor(GRID_SIZE / 2), y: GRID_SIZE - pad, dir: DIR_UP },
    { x: pad, y: pad, dir: DIR_RIGHT },
    { x: GRID_SIZE - pad, y: GRID_SIZE - pad, dir: DIR_LEFT },
  ];
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useGameLoop(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  active: boolean,
  callbacks: GameCallbacks
) {
  const stateRef = useRef<{
    players: Player[];
    particles: Particle[];
    rings: ShockRing[];
    score: number;
    startTime: number;
    lastTickTime: number;
    lastSpeedUp: number;
    tickRate: number;
    gameOver: boolean;
    animFrame: number;
    inputQueue: Dir[];
    lastTime: number;
  } | null>(null);

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const initGame = useCallback(() => {
    const spawns = getSpawnPositions();
    const players: Player[] = [];

    players.push({
      id: 0,
      x: Math.floor(GRID_SIZE / 4),
      y: Math.floor(GRID_SIZE / 2),
      dir: DIR_RIGHT,
      nextDir: DIR_RIGHT,
      color: PLAYER_COLOR,
      trail: new Set([encode(Math.floor(GRID_SIZE / 4), Math.floor(GRID_SIZE / 2))]),
      trailArray: [encode(Math.floor(GRID_SIZE / 4), Math.floor(GRID_SIZE / 2))],
      alive: true,
      isBot: false,
    });

    for (let i = 0; i < NUM_BOTS; i++) {
      const spawn = spawns[i % spawns.length];
      players.push({
        id: i + 1,
        x: spawn.x,
        y: spawn.y,
        dir: spawn.dir,
        nextDir: spawn.dir,
        color: BOT_COLORS[i % BOT_COLORS.length],
        trail: new Set([encode(spawn.x, spawn.y)]),
        trailArray: [encode(spawn.x, spawn.y)],
        alive: true,
        isBot: true,
      });
    }

    stateRef.current = {
      players,
      particles: [],
      rings: [],
      score: 0,
      startTime: performance.now(),
      lastTickTime: performance.now(),
      lastSpeedUp: performance.now(),
      tickRate: INITIAL_TICK_RATE,
      gameOver: false,
      animFrame: 0,
      inputQueue: [],
      lastTime: performance.now(),
    };
  }, []);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!stateRef.current) return;
    let dir: Dir | null = null;
    switch (e.key) {
      case "ArrowUp": case "w": case "W": dir = DIR_UP; break;
      case "ArrowDown": case "s": case "S": dir = DIR_DOWN; break;
      case "ArrowLeft": case "a": case "A": dir = DIR_LEFT; break;
      case "ArrowRight": case "d": case "D": dir = DIR_RIGHT; break;
    }
    if (dir) {
      e.preventDefault();
      stateRef.current.inputQueue.push(dir);
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    initGame();
    window.addEventListener("keydown", handleKey);

    const canvas = canvasRef.current;
    if (!canvas) return;

    // High DPI rendering
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width = `${CANVAS_W}px`;
    canvas.style.height = `${CANVAS_H}px`;

    const ctx = canvas.getContext("2d", { alpha: false })!;
    ctx.scale(dpr, dpr);

    let rafId: number;

    const tick = () => {
      const state = stateRef.current;
      if (!state || state.gameOver) return;

      const now = performance.now();
      const dt = Math.min(now - state.lastTime, 50);
      state.lastTime = now;

      if (now - state.lastSpeedUp > SPEED_INCREASE_INTERVAL) {
        state.tickRate = Math.min(state.tickRate + 0.5, MAX_TICK_RATE);
        state.lastSpeedUp = now;
      }

      const tickInterval = 1000 / state.tickRate;
      const elapsed = now - state.startTime;

      if (now - state.lastTickTime >= tickInterval) {
        state.lastTickTime = now;

        const allTrails = new Set<number>();
        for (const p of state.players) {
          if (p.alive) for (const t of p.trail) allTrails.add(t);
        }

        const player = state.players[0];
        if (player.alive && state.inputQueue.length > 0) {
          const nextDir = state.inputQueue.shift()!;
          if (!dirEq(nextDir, dirOpposite(player.dir))) {
            player.nextDir = nextDir;
          }
        }

        for (const p of state.players) {
          if (!p.alive || !p.isBot) continue;
          p.nextDir = botChooseDir(p, allTrails);
        }

        for (const p of state.players) {
          if (!p.alive) continue;
          p.dir = p.nextDir;
          const nx = p.x + p.dir.x;
          const ny = p.y + p.dir.y;

          if (!inBounds(nx, ny)) {
            p.alive = false;
            spawnExplosion(p.x, p.y, p.color, state.particles, state.rings);
            continue;
          }
          if (allTrails.has(encode(nx, ny))) {
            p.alive = false;
            spawnExplosion(p.x, p.y, p.color, state.particles, state.rings);
            continue;
          }

          p.x = nx;
          p.y = ny;
          const key = encode(nx, ny);
          p.trail.add(key);
          p.trailArray.push(key);
        }

        const aliveBotsCount = state.players.filter((p) => p.isBot && p.alive).length;
        const deadBots = state.players.filter((p) => p.isBot && !p.alive).length;
        state.score = Math.floor(elapsed / 1000) + deadBots * 50;

        callbacksRef.current.onScoreUpdate(state.score);
        callbacksRef.current.onBotsUpdate(aliveBotsCount);

        if (!state.players[0].alive) {
          state.gameOver = true;
          callbacksRef.current.onGameOver(state.score);
          return;
        }
      }

      state.particles = updateParticles(state.particles, dt);
      state.rings = updateRings(state.rings, dt);

      // ─── Render ──────────────────────────────────────────────────────────

      // Deep space background
      ctx.fillStyle = "#080810";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      drawGrid(ctx, now);

      // Dead trails (faded, slightly dull)
      for (const p of state.players) {
        if (!p.alive) {
          ctx.globalAlpha = 0.18;
          drawTrail(ctx, p.trail, p.trailArray, p.color, now);
          ctx.globalAlpha = 1;
        }
      }

      // Alive trails
      for (const p of state.players) {
        if (p.alive) {
          drawTrail(ctx, p.trail, p.trailArray, p.color, now);
        }
      }

      // Shockwave rings (behind heads)
      drawShockRings(ctx, state.rings);

      // Heads
      for (const p of state.players) {
        if (p.alive) drawHead(ctx, p, now);
      }

      // Particles (on top)
      drawParticles(ctx, state.particles);

      // Post-processing
      drawScanLines(ctx, now);
      drawVignette(ctx);

      // HUD last (on top of everything)
      const elapsed2 = now - state.startTime;
      drawHUD(
        ctx,
        state.score,
        state.players.filter((p) => p.isBot && p.alive).length,
        elapsed2,
        state.tickRate
      );

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    stateRef.current!.animFrame = rafId;

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKey);
    };
  }, [active, canvasRef, initGame, handleKey]);

  return { canvasWidth: CANVAS_W, canvasHeight: CANVAS_H };
}
