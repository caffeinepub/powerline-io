import React, { useRef, useState, useEffect, useCallback } from "react";
import { useGameLoop, GRID_SIZE, CELL_SIZE } from "./GameCanvas";
import { useTopScores, useSubmitScore } from "./hooks/useQueries";

type GamePhase = "start" | "playing" | "gameover";

// ─── Animated Background (high-fidelity neon grid + moving lines) ─────────────
interface BgLine {
  x: number;
  y: number;
  dir: "h" | "v";
  length: number;
  speed: number;
  color: string;
  width: number;
  glow: number;
}

interface PulseRing {
  x: number;
  y: number;
  radius: number;
  maxR: number;
  life: number;
  color: string;
}

const BG_LINE_COLORS = [
  "#00ffff",
  "#ff00ff",
  "#00ff41",
  "#ff6600",
  "#ffff00",
  "#ff2244",
];

function createBgLines(count: number, w: number, h: number): BgLine[] {
  const lines: BgLine[] = [];
  for (let i = 0; i < count; i++) {
    const dir: "h" | "v" = Math.random() > 0.5 ? "h" : "v";
    lines.push({
      x: Math.random() * w,
      y: Math.random() * h,
      dir,
      length: 60 + Math.random() * 200,
      speed: 0.4 + Math.random() * 1.8,
      color: BG_LINE_COLORS[Math.floor(Math.random() * BG_LINE_COLORS.length)],
      width: 1 + Math.random() * 2,
      glow: 8 + Math.random() * 16,
    });
  }
  return lines;
}

function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const linesRef = useRef<BgLine[]>([]);
  const ringsRef = useRef<PulseRing[]>([]);
  const rafRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      linesRef.current = createBgLines(35, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // Spawn pulse rings periodically
    const ringInterval = setInterval(() => {
      const c = canvas;
      ringsRef.current.push({
        x: Math.random() * c.width,
        y: Math.random() * c.height,
        radius: 5,
        maxR: 100 + Math.random() * 150,
        life: 1,
        color: BG_LINE_COLORS[Math.floor(Math.random() * BG_LINE_COLORS.length)],
      });
    }, 1200);

    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      timeRef.current += dt;
      const t = timeRef.current;

      const w = canvas.width;
      const h = canvas.height;

      // Deep background
      ctx.fillStyle = "#06060e";
      ctx.fillRect(0, 0, w, h);

      // Static grid with pulse
      const gridAlpha = 0.07 + 0.03 * Math.sin(t * 0.0006);
      ctx.strokeStyle = `rgba(20,20,80,${gridAlpha})`;
      ctx.lineWidth = 0.5;
      const step = 40;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Accent grid lines (brighter every 5th)
      const accentAlpha = 0.12 + 0.06 * Math.sin(t * 0.0004 + 1);
      ctx.strokeStyle = `rgba(40,40,140,${accentAlpha})`;
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += step * 5) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += step * 5) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Pulse rings
      ringsRef.current = ringsRef.current
        .map((r) => ({ ...r, radius: r.radius + (r.maxR * dt) / 1200, life: r.life - dt / 2000 }))
        .filter((r) => r.life > 0);

      for (const ring of ringsRef.current) {
        const hex = ring.color.replace("#", "");
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        ctx.save();
        ctx.strokeStyle = `rgba(${r},${g},${b},${ring.life * 0.4})`;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = ring.color;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Moving neon lines
      for (const line of linesRef.current) {
        if (line.dir === "h") {
          line.x += line.speed;
          if (line.x > w + line.length) line.x = -line.length;
        } else {
          line.y += line.speed;
          if (line.y > h + line.length) line.y = -line.length;
        }

        ctx.save();
        ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 0.002 + line.x * 0.01);
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.width;
        ctx.shadowBlur = line.glow;
        ctx.shadowColor = line.color;

        // Gradient fade-out on the line
        let grad: CanvasGradient;
        if (line.dir === "h") {
          grad = ctx.createLinearGradient(line.x, 0, line.x + line.length, 0);
        } else {
          grad = ctx.createLinearGradient(0, line.y, 0, line.y + line.length);
        }
        grad.addColorStop(0, line.color + "00");
        grad.addColorStop(0.2, line.color);
        grad.addColorStop(0.8, line.color);
        grad.addColorStop(1, line.color + "00");
        ctx.strokeStyle = grad;

        ctx.beginPath();
        if (line.dir === "h") {
          ctx.moveTo(line.x, line.y);
          ctx.lineTo(line.x + line.length, line.y);
        } else {
          ctx.moveTo(line.x, line.y);
          ctx.lineTo(line.x, line.y + line.length);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Scan line sweep
      const scanY = (t * 0.06) % h;
      const scanGrad = ctx.createLinearGradient(0, scanY - 60, 0, scanY + 60);
      scanGrad.addColorStop(0, "rgba(0,255,255,0)");
      scanGrad.addColorStop(0.5, "rgba(0,255,255,0.025)");
      scanGrad.addColorStop(1, "rgba(0,255,255,0)");
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 60, w, 120);

      // Scanline texture
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      for (let y = 0; y < h; y += 4) {
        ctx.fillRect(0, y, w, 2);
      }

      // Vignette
      const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.9);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.65)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(ringInterval);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
      }}
    />
  );
}

// ─── Holographic Title ────────────────────────────────────────────────────────
function HoloTitle() {
  return (
    <div style={{ textAlign: "center", marginBottom: "0.5rem", position: "relative" }}>
      {/* Reflection copy */}
      <div
        aria-hidden="true"
        style={{
          fontSize: "clamp(3rem, 8vw, 6rem)",
          fontWeight: 900,
          letterSpacing: "0.12em",
          margin: 0,
          lineHeight: 1,
          color: "#00ffff",
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          transform: "scaleY(-0.3) translateY(4px)",
          opacity: 0.18,
          filter: "blur(2px)",
          background: "linear-gradient(to bottom, #00ffff, transparent)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        POWERLINE
      </div>
      <h1
        style={{
          fontSize: "clamp(3rem, 8vw, 6rem)",
          fontWeight: 900,
          letterSpacing: "0.12em",
          margin: 0,
          lineHeight: 1,
          color: "#00ffff",
          textShadow:
            "0 0 10px #00ffff, 0 0 30px #00ffff, 0 0 60px #00ffff88, 0 0 100px #00ffff44",
          animation: "titleFlicker 4s infinite",
        }}
      >
        POWERLINE
      </h1>
      <div
        style={{
          fontSize: "clamp(1.5rem, 4vw, 2.5rem)",
          fontWeight: 700,
          letterSpacing: "0.4em",
          color: "#ff00ff",
          textShadow: "0 0 10px #ff00ff, 0 0 30px #ff00ff, 0 0 60px #ff00ff44",
          marginTop: "-0.1em",
          animation: "subtitlePulse 2s ease-in-out infinite",
        }}
      >
        .IO
      </div>
    </div>
  );
}

// ─── Start Screen ─────────────────────────────────────────────────────────────
function StartScreen({ onStart }: { onStart: () => void }) {
  const { data: scores } = useTopScores();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") onStart();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onStart]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      <HoloTitle />

      {/* Tagline */}
      <p
        style={{
          color: "#00ff41",
          fontSize: "0.9rem",
          letterSpacing: "0.25em",
          textShadow: "0 0 10px #00ff41, 0 0 20px #00ff4166",
          margin: 0,
          textAlign: "center",
          animation: "taglineScan 3s linear infinite",
        }}
      >
        SURVIVE · ELIMINATE · DOMINATE
      </p>

      {/* Controls panel */}
      <div
        style={{
          border: "1px solid rgba(0,255,255,0.35)",
          padding: "1rem 2rem",
          color: "rgba(0,255,255,0.75)",
          fontSize: "0.8rem",
          letterSpacing: "0.12em",
          lineHeight: 2.2,
          textAlign: "center",
          background: "rgba(0,255,255,0.04)",
          boxShadow:
            "0 0 20px rgba(0,255,255,0.12), inset 0 0 20px rgba(0,255,255,0.04), 0 0 0 1px rgba(0,255,255,0.08)",
          backdropFilter: "blur(4px)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Corner accents */}
        <span style={{ position: "absolute", top: 0, left: 0, width: 12, height: 12, borderTop: "2px solid #00ffff", borderLeft: "2px solid #00ffff" }} />
        <span style={{ position: "absolute", top: 0, right: 0, width: 12, height: 12, borderTop: "2px solid #00ffff", borderRight: "2px solid #00ffff" }} />
        <span style={{ position: "absolute", bottom: 0, left: 0, width: 12, height: 12, borderBottom: "2px solid #00ffff", borderLeft: "2px solid #00ffff" }} />
        <span style={{ position: "absolute", bottom: 0, right: 0, width: 12, height: 12, borderBottom: "2px solid #00ffff", borderRight: "2px solid #00ffff" }} />
        <div>WASD / ARROW KEYS — STEER</div>
        <div>SURVIVE BOTS — +50 PTS PER KILL</div>
        <div>+1 PT PER SECOND ALIVE</div>
      </div>

      {/* Press to start button */}
      <button
        type="button"
        onClick={onStart}
        style={{
          background: "transparent",
          border: "2px solid #00ffff",
          color: "#00ffff",
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: "1.1rem",
          letterSpacing: "0.22em",
          padding: "0.85rem 2.8rem",
          cursor: "pointer",
          textTransform: "uppercase",
          boxShadow:
            "0 0 20px #00ffff66, 0 0 40px #00ffff22, inset 0 0 20px rgba(0,255,255,0.06)",
          animation: "buttonPulse 1.8s ease-in-out infinite",
          transition: "all 0.15s ease",
          position: "relative",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          el.style.background = "rgba(0,255,255,0.12)";
          el.style.boxShadow = "0 0 40px #00ffff, 0 0 80px #00ffff44, inset 0 0 30px rgba(0,255,255,0.12)";
          el.style.letterSpacing = "0.28em";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget;
          el.style.background = "transparent";
          el.style.boxShadow = "0 0 20px #00ffff66, 0 0 40px #00ffff22, inset 0 0 20px rgba(0,255,255,0.06)";
          el.style.letterSpacing = "0.22em";
        }}
      >
        PRESS ENTER TO PLAY
      </button>

      {/* High Scores */}
      <div style={{ textAlign: "center", minWidth: 300, maxWidth: 400 }}>
        <div
          style={{
            color: "#ff00ff",
            fontSize: "0.78rem",
            letterSpacing: "0.3em",
            marginBottom: "0.75rem",
            textShadow: "0 0 10px #ff00ff, 0 0 20px #ff00ff44",
          }}
        >
          ── HIGH SCORES ──
        </div>
        {scores && scores.length > 0 ? (
          <div
            style={{
              border: "1px solid rgba(255,0,255,0.22)",
              boxShadow: "0 0 15px rgba(255,0,255,0.1), inset 0 0 15px rgba(255,0,255,0.03)",
              padding: "0.75rem 1.2rem",
              background: "rgba(255,0,255,0.03)",
              backdropFilter: "blur(4px)",
            }}
          >
            {scores.slice(0, 10).map((entry, i) => (
              <div
                key={`${entry.name}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.75rem",
                  letterSpacing: "0.08em",
                  padding: "0.22rem 0",
                  borderBottom:
                    i < 9 && i < scores.length - 1
                      ? "1px solid rgba(255,255,255,0.04)"
                      : "none",
                  color:
                    i === 0
                      ? "#ffff00"
                      : i < 3
                      ? "#00ffff"
                      : "rgba(0,255,255,0.55)",
                  textShadow:
                    i === 0
                      ? "0 0 8px #ffff00"
                      : i < 3
                      ? "0 0 6px #00ffff"
                      : "none",
                }}
              >
                <span>
                  <span style={{ color: "#ff00ff", marginRight: "0.5rem" }}>
                    {String(i + 1).padStart(2, "0")}.
                  </span>
                  {entry.name || "ANONYMOUS"}
                </span>
                <span>{Number(entry.score).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              color: "rgba(0,255,255,0.3)",
              fontSize: "0.78rem",
              letterSpacing: "0.1em",
              padding: "1rem",
              border: "1px solid rgba(0,255,255,0.1)",
            }}
          >
            NO SCORES YET — BE THE FIRST!
          </div>
        )}
      </div>

      <div
        style={{
          color: "rgba(255,255,255,0.18)",
          fontSize: "0.6rem",
          letterSpacing: "0.1em",
          marginTop: "0.25rem",
        }}
      >
        © {new Date().getFullYear()} BUILT WITH{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgba(0,255,255,0.35)", textDecoration: "none" }}
        >
          CAFFEINE.AI
        </a>
      </div>
    </div>
  );
}

// ─── Game Over Screen ─────────────────────────────────────────────────────────
function GameOverScreen({
  score,
  onPlayAgain,
}: {
  score: number;
  onPlayAgain: () => void;
}) {
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { mutate: submitScore, isPending } = useSubmitScore();
  const { data: scores } = useTopScores();

  const handleSubmit = useCallback(() => {
    if (!name.trim() || submitted) return;
    submitScore(
      { name: name.trim().toUpperCase().slice(0, 12), score },
      { onSuccess: () => setSubmitted(true) }
    );
  }, [name, score, submitScore, submitted]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (!submitted && name.trim()) handleSubmit();
        else if (submitted) onPlayAgain();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSubmit, submitted, onPlayAgain, name]);

  const isNewHighScore =
    scores && scores.length > 0 ? score > Number(scores[0]?.score ?? 0) : false;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      {/* Game Over */}
      <div style={{ textAlign: "center" }}>
        <h2
          aria-label="Game Over"
          style={{
            fontSize: "clamp(2.5rem, 7vw, 5rem)",
            fontWeight: 900,
            letterSpacing: "0.1em",
            margin: 0,
            lineHeight: 1,
            color: "#ff2244",
            textShadow:
              "0 0 15px #ff2244, 0 0 40px #ff224488, 0 0 80px #ff224422",
            animation: "gameOverFlicker 0.8s ease-in-out infinite",
          }}
        >
          GAME OVER
        </h2>
      </div>

      {isNewHighScore && (
        <div
          style={{
            color: "#ffff00",
            textShadow: "0 0 12px #ffff00, 0 0 30px #ffff00, 0 0 60px #ffff0066",
            fontSize: "1rem",
            letterSpacing: "0.25em",
            animation: "newHsBounce 0.6s ease-in-out infinite alternate",
          }}
        >
          ★ NEW HIGH SCORE ★
        </div>
      )}

      {/* Score */}
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            color: "rgba(0,255,255,0.45)",
            fontSize: "0.75rem",
            letterSpacing: "0.25em",
          }}
        >
          FINAL SCORE
        </div>
        <div
          style={{
            color: "#00ffff",
            fontSize: "clamp(2rem, 6vw, 4rem)",
            fontWeight: 700,
            textShadow: "0 0 15px #00ffff, 0 0 40px #00ffff88",
            letterSpacing: "0.05em",
          }}
        >
          {score.toLocaleString()}
        </div>
      </div>

      {/* Name entry */}
      {!submitted ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              color: "rgba(0,255,255,0.55)",
              fontSize: "0.75rem",
              letterSpacing: "0.18em",
            }}
          >
            ENTER YOUR NAME TO SUBMIT SCORE
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <input
              className="neon-input"
              type="text"
              maxLength={12}
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="YOUR NAME"
              style={{
                padding: "0.55rem 1rem",
                fontSize: "0.95rem",
                letterSpacing: "0.15em",
                width: 185,
                textAlign: "center",
              }}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !name.trim()}
              className="neon-button"
              style={{
                padding: "0.55rem 1rem",
                fontSize: "0.85rem",
                cursor: name.trim() ? "pointer" : "not-allowed",
                opacity: name.trim() ? 1 : 0.45,
              }}
            >
              {isPending ? "..." : "SUBMIT"}
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            color: "#00ff41",
            textShadow: "0 0 10px #00ff41, 0 0 20px #00ff4166",
            fontSize: "0.9rem",
            letterSpacing: "0.18em",
          }}
        >
          ✓ SCORE SUBMITTED!
        </div>
      )}

      {/* Play Again */}
      <button
        type="button"
        onClick={onPlayAgain}
        className="neon-button-pink"
        style={{
          padding: "0.8rem 2.8rem",
          fontSize: "1rem",
          cursor: "pointer",
          letterSpacing: "0.22em",
          animation: "buttonPulse 2s ease-in-out infinite",
        }}
      >
        PLAY AGAIN
      </button>

      {/* Top 5 */}
      {scores && scores.length > 0 && (
        <div style={{ textAlign: "center", minWidth: 280 }}>
          <div
            style={{
              color: "rgba(255,0,255,0.55)",
              fontSize: "0.72rem",
              letterSpacing: "0.22em",
              marginBottom: "0.5rem",
              textShadow: "0 0 8px #ff00ff",
            }}
          >
            ── TOP 5 ──
          </div>
          <div
            style={{
              border: "1px solid rgba(255,0,255,0.18)",
              padding: "0.6rem 1rem",
              boxShadow: "0 0 12px rgba(255,0,255,0.08)",
              background: "rgba(255,0,255,0.025)",
            }}
          >
            {scores.slice(0, 5).map((entry, i) => (
              <div
                key={`go-${entry.name}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.72rem",
                  letterSpacing: "0.08em",
                  padding: "0.18rem 0",
                  color: i === 0 ? "#ffff00" : "rgba(0,255,255,0.5)",
                  gap: "2rem",
                }}
              >
                <span>
                  <span style={{ color: "#ff00ff", marginRight: "0.4rem" }}>
                    {i + 1}.
                  </span>
                  {entry.name || "ANON"}
                </span>
                <span>{Number(entry.score).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Playing View ─────────────────────────────────────────────────────────────
function PlayingView({ onGameOver }: { onGameOver: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setScoreDisplay] = useState(0);
  const [, setBotsDisplay] = useState(5);

  const callbacks = {
    onScoreUpdate: setScoreDisplay,
    onBotsUpdate: setBotsDisplay,
    onGameOver,
  };

  const { canvasWidth, canvasHeight } = useGameLoop(canvasRef, true, callbacks);

  const scale = Math.min(
    window.innerWidth / canvasWidth,
    window.innerHeight / canvasHeight,
    1.8
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#080810",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          display: "block",
          // No pixelated — let the browser smooth-scale the high-DPI canvas
        }}
      />
    </div>
  );
}

// ─── Main Game Component ──────────────────────────────────────────────────────
export default function Game() {
  const [phase, setPhase] = useState<GamePhase>("start");
  const [finalScore, setFinalScore] = useState(0);

  const handleStart = useCallback(() => setPhase("playing"), []);

  const handleGameOver = useCallback((score: number) => {
    setFinalScore(score);
    setTimeout(() => setPhase("gameover"), 700);
  }, []);

  const handlePlayAgain = useCallback(() => setPhase("playing"), []);

  return (
    <>
      {phase !== "playing" && <AnimatedBackground />}

      {phase === "start" && <StartScreen onStart={handleStart} />}
      {phase === "playing" && <PlayingView onGameOver={handleGameOver} />}
      {phase === "gameover" && (
        <>
          <AnimatedBackground />
          <GameOverScreen score={finalScore} onPlayAgain={handlePlayAgain} />
        </>
      )}
    </>
  );
}
