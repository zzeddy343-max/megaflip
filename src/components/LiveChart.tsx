import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeBollinger,
  computeEMA,
  computeIndicatorSeries,
  computeSMA,
  getIndicatorColor,
} from "@/lib/indicator-engine";

interface Props {
  basePrice?: number;
  volatility?: number;
  className?: string;
  tickMs?: number;
  candleMs?: number;
  onPrice?: (p: number) => void;
  /** Overlay text shown bottom-right (e.g. current digit) */
  badge?: string;
  badgeTone?: "neutral" | "bull" | "bear";
  note?: string;
  noteTone?: "neutral" | "bull" | "bear";
  indicators?: string[];
  mode?: "line" | "candles";
  digitStats?: { d: number; pct: number }[];
  currentDigit?: number;
  selectedDigit?: number;
  digitMarkerTone?: "idle" | "active" | "win" | "loss";
}

type Candle = { bucket: number; o: number; h: number; l: number; c: number };

/**
 * Smooth, realistic-feeling synthetic ticker.
 * Uses mean-reversion + small step size so movement isn't jittery/rapid.
 */
export function LiveChart({
  basePrice = 1000,
  volatility = 0.0008,
  className,
  tickMs = 500,
  candleMs = 2200,
  onPrice,
  badge,
  badgeTone = "neutral",
  note,
  noteTone = "neutral",
  indicators = [],
  mode = "line",
  digitStats,
  currentDigit,
  selectedDigit,
  digitMarkerTone = "idle",
}: Props) {
  const buildInitialPoints = useCallback(() => {
    const nowStep = Math.floor(Date.now() / 1000);
    let drift = Math.sin(nowStep / 19) * basePrice * volatility * 0.8;
    return Array.from({ length: 90 }, (_, i) => {
      const t = nowStep - (89 - i);
      drift = drift * 0.86 + Math.sin(t / 7) * basePrice * volatility * 0.18;
      const wave = Math.sin(t / 11) * basePrice * volatility * 3;
      const pulse = Math.cos(t / 5) * basePrice * volatility * 0.9;
      return basePrice + wave + pulse + drift;
    });
  }, [basePrice, volatility]);
  const [points, setPoints] = useState<number[]>(buildInitialPoints);
  const [candles, setCandles] = useState<Candle[]>(() =>
    buildInitialCandles(basePrice, volatility, candleMs),
  );
  const driftRef = useRef(0);
  const impulseRef = useRef(0);

  useEffect(() => {
    const seeded = buildInitialPoints();
    setPoints(seeded);
    setCandles(buildInitialCandles(basePrice, volatility, candleMs));
    onPrice?.(seeded[seeded.length - 1]);
  }, [basePrice, buildInitialPoints, candleMs, onPrice, volatility]);

  useEffect(() => {
    const id = setInterval(() => {
      setPoints((prev) => {
        const last = prev[prev.length - 1];
        const pull = (basePrice - last) * 0.015;
        const burst =
          Math.random() < 0.13 ? (Math.random() - 0.5) * volatility * basePrice * 7.5 : 0;
        impulseRef.current = impulseRef.current * 0.68 + burst;
        driftRef.current =
          driftRef.current * 0.76 +
          (Math.random() - 0.5) * volatility * basePrice * 1.35 +
          Math.sin(Date.now() / 4100) * volatility * basePrice * 0.18;
        const next = Math.max(0.01, last + pull + driftRef.current + impulseRef.current);
        const arr = [...prev.slice(1), next];
        setCandles((current) => updateCandles(current, next, candleMs));
        onPrice?.(next);
        return arr;
      });
    }, tickMs);
    return () => clearInterval(id);
  }, [volatility, basePrice, tickMs, candleMs, onPrice]);

  const candleMin = Math.min(...candles.map((c) => c.l));
  const candleMax = Math.max(...candles.map((c) => c.h));
  const candlePad = (candleMax - candleMin) * 0.12 || basePrice * volatility * 8 || 1;
  const rawMin = Math.min(...points);
  const rawMax = Math.max(...points);
  const w = 100;
  const h = 100;
  const pad = (rawMax - rawMin) * 0.08 || basePrice * volatility * 3 || 1;
  const min = mode === "candles" ? candleMin - candlePad : rawMin - pad;
  const max = mode === "candles" ? candleMax + candlePad : rawMax + pad;
  const range = max - min || 1;
  const selected = new Set(indicators);
  const sma = selected.has("SMA") ? computeIndicatorSeries(points, "SMA", 20) : [];
  const ema = selected.has("EMA") ? computeIndicatorSeries(points, "EMA", 20) : [];
  const boll = selected.has("Bollinger") ? computeIndicatorSeries(points, "Bollinger", 20) : null;
  const smaPath = sma.length ? buildLinePath(sma, w, h, min, range) : "";
  const emaPath = ema.length ? buildLinePath(ema, w, h, min, range) : "";
  const bollFill =
    boll && typeof boll === "object"
      ? buildBandPath(
          boll as { upper: Array<number | null>; lower: Array<number | null> },
          w,
          h,
          min,
          range,
        )
      : "";
  const smoothedPoints = smoothPriceSeries(points);
  const path = buildSmoothPricePath(smoothedPoints, w, h, min, range);
  const area = `${path} L${w},${h} L0,${h} Z`;
  const last = points[points.length - 1];
  const first = points[0];
  const latestCandle = candles[candles.length - 1];
  const up = last >= first;
  const stroke = up ? "oklch(0.76 0.18 152)" : "oklch(0.66 0.24 22)";
  const priceY =
    h - (((mode === "candles" && latestCandle ? latestCandle.c : last) - min) / range) * h;
  const priceLabel = (mode === "candles" && latestCandle ? latestCandle.c : last).toFixed(2);
  const axisValues = Array.from({ length: 5 }, (_, i) => max - (range / 4) * i);
  const timeLabels = Array.from({ length: 5 }, (_, i) => {
    const age = (4 - i) * Math.max(1, Math.round(tickMs / 1000)) * 18;
    return new Date(Date.now() - age * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  });
  const badgeBg =
    badgeTone === "bull"
      ? "bg-bull text-bull-foreground"
      : badgeTone === "bear"
        ? "bg-bear text-bear-foreground"
        : "bg-surface text-foreground border border-border";
  const noteBg =
    noteTone === "bull"
      ? "bg-bull/10 text-bull border border-bull/30"
      : noteTone === "bear"
        ? "bg-bear/10 text-bear border border-bear/30"
        : "bg-surface/95 text-foreground border border-border";

  return (
    <div
      className={
        "relative w-full overflow-hidden bg-[var(--color-surface)] text-[var(--muted-foreground)] " +
        (className ?? "")
      }
    >
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-foreground)" stopOpacity="0.20" />
            <stop offset="72%" stopColor="var(--color-foreground)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--color-foreground)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={`h-${t}`}
            x1="0"
            x2={w}
            y1={h * t}
            y2={h * t}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="0.18"
          />
        ))}
        {Array.from({ length: 11 }, (_, i) => i * 10).map((x) => (
          <line
            key={`v-${x}`}
            x1={x}
            x2={x}
            y1="0"
            y2={h}
            stroke="rgba(255,255,255,0.045)"
            strokeWidth="0.14"
          />
        ))}
        {mode === "line" ? (
          <>
            {bollFill && <path d={bollFill} fill="oklch(0.5 0.18 222 / 0.16)" />}
            {smaPath && (
              <path
                d={smaPath}
                fill="none"
                stroke={getIndicatorColor("SMA")}
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {emaPath && (
              <path
                d={emaPath}
                fill="none"
                stroke={getIndicatorColor("EMA")}
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path d={area} fill="url(#lc-fill)" />
            <path
              d={path}
              fill="none"
              stroke="var(--color-foreground)"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx={w}
              cy={h - ((last - min) / range) * h}
              r="1.35"
              fill="var(--color-foreground)"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          <>
            {boll && typeof boll === "object" && (
              <path
                d={buildBandPath(
                  boll as { upper: Array<number | null>; lower: Array<number | null> },
                  w,
                  h,
                  min,
                  range,
                )}
                fill="oklch(0.5 0.18 222 / 0.16)"
              />
            )}
            {smaPath && (
              <path
                d={smaPath}
                fill="none"
                stroke={getIndicatorColor("SMA")}
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {emaPath && (
              <path
                d={emaPath}
                fill="none"
                stroke={getIndicatorColor("EMA")}
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {candles.map((c, i) => {
              const candleUp = c.c >= c.o;
              const color = candleUp ? "oklch(0.76 0.18 152)" : "oklch(0.66 0.24 22)";
              const step = w / candles.length;
              const cx = i * step + step / 2;
              const bodyTop = h - ((Math.max(c.o, c.c) - min) / range) * h;
              const bodyBottom = h - ((Math.min(c.o, c.c) - min) / range) * h;
              const bodyH = Math.max(1.05, bodyBottom - bodyTop);
              return (
                <g key={c.bucket}>
                  <line
                    x1={cx}
                    x2={cx}
                    y1={h - ((c.h - min) / range) * h}
                    y2={h - ((c.l - min) / range) * h}
                    stroke={color}
                    strokeWidth="0.36"
                    strokeOpacity="0.8"
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect
                    x={cx - step * 0.36}
                    y={bodyTop}
                    width={step * 0.72}
                    height={bodyH}
                    fill={color}
                    rx="0.08"
                  />
                </g>
              );
            })}
            <line
              x1="0"
              x2={w}
              y1={priceY}
              y2={priceY}
              stroke="oklch(0.78 0.13 86)"
              strokeOpacity="0.55"
              strokeDasharray="1 1"
              strokeWidth="0.25"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 border-l border-[var(--color-border)] bg-[var(--color-surface)]">
        {axisValues.map((value, i) => (
          <div
            key={i}
            className="absolute right-2 translate-y-[-50%] text-[11px] font-medium tabular-nums text-[var(--muted-foreground)]"
            style={{ top: `${i * 25}%` }}
          >
            {value.toFixed(2)}
          </div>
        ))}
      </div>
      <div
        className="pointer-events-none absolute right-2 rounded border border-[var(--primary)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--color-foreground)] shadow-[0_0_18px_rgba(0,200,255,0.18)]"
        style={{ top: `calc(${priceY}% - 10px)` }}
      >
        {priceLabel}
      </div>
      <div className="pointer-events-none absolute bottom-1 left-0 right-20 flex justify-between px-3 text-[10px] tabular-nums text-[var(--muted-foreground)]">
        {timeLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {/* Digit bubbles rendered inside SVG area via absolute positioned SVG group */}
      {digitStats && digitStats.length > 0 && (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="absolute left-0 top-0 w-full h-full pointer-events-none"
        >
          <g>
            {(() => {
              const total = digitStats.length;
              const totalWidth = w * 0.84;
              const startX = (w - totalWidth) / 2;
              const step = total <= 1 ? 0 : totalWidth / (total - 1);
              return digitStats.map((s, i) => {
                const x = startX + i * step;
                const y = h - 14;
                const isCurrent = currentDigit === s.d;
                const isSelected = selectedDigit === s.d;
                const r = isCurrent ? 4.35 : 3.95;
                const active = isSelected && digitMarkerTone === "active";
                const win = isSelected && digitMarkerTone === "win";
                const loss = isSelected && digitMarkerTone === "loss";
                const strokeColor = active
                  ? "#f59e0b"
                  : win
                    ? "#22C55E"
                    : loss
                      ? "#EF4444"
                      : isSelected || isCurrent
                        ? "#00C8FF"
                        : "#2b3953";
                const glow = active
                  ? "rgba(245,158,11,0.32)"
                  : win
                    ? "rgba(34,197,94,0.34)"
                    : loss
                      ? "rgba(239,68,68,0.34)"
                      : isSelected || isCurrent
                        ? "rgba(0,200,255,0.18)"
                        : "rgba(255,255,255,0.02)";
                return (
                  <g key={s.d} transform={`translate(${x.toFixed(2)},${y.toFixed(2)})`}>
                    <circle r={r + 1.3} fill={glow} />
                    <circle r={r} fill="#172033" stroke="#2d3b57" strokeWidth="0.62" />
                    {(isSelected || isCurrent || active || win || loss) && (
                      <circle
                        r={r + 0.12}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="0.64"
                        strokeDasharray={active ? "7 4" : undefined}
                        transform={active ? "rotate(-35)" : undefined}
                      />
                    )}
                    <text
                      x="0"
                      y="-0.35"
                      fontSize={isCurrent ? "3.4" : "3.1"}
                      fontWeight="850"
                      textAnchor="middle"
                      fill="#ffffff"
                    >
                      {s.d}
                    </text>
                    <text
                      x="0"
                      y="2.65"
                      fontSize="1.55"
                      fontWeight="700"
                      textAnchor="middle"
                      fill="#AAB4C5"
                    >
                      {s.pct.toFixed(1)}%
                    </text>
                    {(isSelected || isCurrent) && (
                      <path
                        d={`M -0.8 ${r + 1.4} L 0 ${r + 2.15} L 0.8 ${r + 1.4} Z`}
                        fill={active ? "#f59e0b" : strokeColor}
                      />
                    )}
                  </g>
                );
              });
            })()}
          </g>
        </svg>
      )}
      {mode === "candles" && latestCandle && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded border border-border bg-surface/85 text-[10px] font-extrabold tabular-nums">
          {latestCandle.c.toFixed(5)}
        </div>
      )}
      {note && (
        <div
          className={
            "pointer-events-none absolute left-16 top-24 z-20 rounded border px-2 py-1 text-xs font-semibold tabular-nums shadow-lg " +
            noteBg
          }
        >
          {note}
        </div>
      )}
    </div>
  );
}

function seededRandom(seed: number) {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function smoothPriceSeries(values: number[]) {
  if (values.length < 4) return values;
  return values.map((value, index) => {
    if (index === 0 || index === values.length - 1) return value;
    const prev = values[index - 1] ?? value;
    const next = values[index + 1] ?? value;
    const widerPrev = values[index - 2] ?? prev;
    const widerNext = values[index + 2] ?? next;
    return value * 0.45 + (prev + next) * 0.2 + (widerPrev + widerNext) * 0.075;
  });
}

function buildSmoothPricePath(
  values: number[],
  width: number,
  height: number,
  min: number,
  range: number,
) {
  if (values.length === 0) return "";
  const points = values.map((value, index) => ({
    x: (index / Math.max(values.length - 1, 1)) * width,
    y: height - ((value - min) / range) * height,
  }));
  if (points.length === 1) return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;

  let path = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const tension = 0.18;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    path += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return path;
}

function buildLinePath(
  values: Array<number | null>,
  width: number,
  height: number,
  min: number,
  range: number,
) {
  return values.reduce((acc, value, index) => {
    if (value === null) return acc;
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return acc + `${acc === "" ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }, "");
}

function buildBandPath(
  bands: { upper: Array<number | null>; lower: Array<number | null> },
  width: number,
  height: number,
  min: number,
  range: number,
) {
  const upperPoints = bands.upper
    .map((value, index) => {
      if (value === null) return "";
      const x = (index / (bands.upper.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .filter(Boolean);
  const lowerPoints = bands.lower
    .map((value, index) => {
      if (value === null) return "";
      const x = (index / (bands.lower.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .filter(Boolean)
    .reverse();
  return [...upperPoints, ...lowerPoints, "Z"].join(" ");
}

function buildInitialCandles(basePrice: number, volatility: number, candleMs: number): Candle[] {
  const nowBucket = Math.floor(Date.now() / candleMs);
  const candleCount = 46;
  const unit = Math.max(basePrice * volatility * 3.2, 0.12);
  let close = basePrice - basePrice * volatility * 6;
  return Array.from({ length: candleCount }, (_, i) => {
    const bucket = nowBucket - (candleCount - 1 - i);
    const r1 = seededRandom(Math.round(basePrice * 10) + bucket * 17);
    const r2 = seededRandom(Math.round(basePrice * 10) + bucket * 31);
    const r3 = seededRandom(Math.round(basePrice * 10) + bucket * 47);
    const pulse = Math.sin((bucket + i) / 4) * unit * 1.15;
    const body = (r1 - 0.48) * unit * 3.1 + pulse;
    const o = close;
    const c = Math.max(0.01, o + body);
    const upperWick = (0.18 + r2 * 1.45) * unit;
    const lowerWick = (0.18 + r3 * 1.45) * unit;
    const h = Math.max(o, c) + upperWick;
    const l = Math.max(0.01, Math.min(o, c) - lowerWick);
    close = c + (basePrice - c) * 0.028;
    return { bucket, o, h, l, c };
  });
}

function updateCandles(candles: Candle[], price: number, candleMs: number) {
  const bucket = Math.floor(Date.now() / candleMs);
  const last = candles[candles.length - 1];
  if (!last || last.bucket !== bucket) {
    return [...candles.slice(-45), { bucket, o: price, h: price, l: price, c: price }];
  }
  return [
    ...candles.slice(0, -1),
    {
      ...last,
      h: Math.max(last.h, price),
      l: Math.min(last.l, price),
      c: price,
    },
  ];
}
