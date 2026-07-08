import { useCallback, useEffect, useRef, useState } from "react";

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
  const [candles, setCandles] = useState<Candle[]>(() => buildInitialCandles(basePrice, volatility, candleMs));
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
        const burst = Math.random() < 0.13 ? (Math.random() - 0.5) * volatility * basePrice * 7.5 : 0;
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
  const pad = (rawMax - rawMin) * 0.08 || basePrice * volatility * 3 || 1;
  const min = mode === "candles" ? candleMin - candlePad : rawMin - pad;
  const max = mode === "candles" ? candleMax + candlePad : rawMax + pad;
  const range = max - min || 1;
  const w = 100;
  const h = 100;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  const last = points[points.length - 1];
  const first = points[0];
  const latestCandle = candles[candles.length - 1];
  const up = last >= first;
  const stroke = up ? "oklch(0.76 0.18 152)" : "oklch(0.66 0.24 22)";
  const priceY = h - (((mode === "candles" && latestCandle ? latestCandle.c : last) - min) / range) * h;
  const badgeBg = badgeTone === "bull" ? "bg-bull text-bull-foreground" : badgeTone === "bear" ? "bg-bear text-bear-foreground" : "bg-surface text-foreground border border-border";
  const noteBg = noteTone === "bull" ? "bg-bull/10 text-bull border border-bull/30" : noteTone === "bear" ? "bg-bear/10 text-bear border border-bear/30" : "bg-surface/95 text-foreground border border-border";

  return (
    <div className={"relative w-full " + (className ?? "")}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.30" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1="0" x2={w} y1={h * t} y2={h * t} stroke="currentColor" strokeOpacity="0.08" strokeWidth="0.2" />
        ))}
        {mode === "line" ? (
          <>
            <path d={area} fill="url(#lc-fill)" />
            <path d={path} fill="none" stroke={stroke} strokeWidth="0.7" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            <circle
              cx={w}
              cy={h - ((last - min) / range) * h}
              r="1.2"
              fill={stroke}
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          <>
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
                  <rect x={cx - step * 0.36} y={bodyTop} width={step * 0.72} height={bodyH} fill={color} rx="0.08" />
                </g>
              );
            })}
            <line x1="0" x2={w} y1={priceY} y2={priceY} stroke="oklch(0.78 0.13 86)" strokeOpacity="0.55" strokeDasharray="1 1" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {mode === "candles" && latestCandle && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded border border-border bg-surface/85 text-[10px] font-extrabold tabular-nums">
          {latestCandle.c.toFixed(5)}
        </div>
      )}
      {badge !== undefined && (
        <div className={"absolute right-2 bottom-2 px-2 py-1 rounded-lg text-xs font-extrabold tabular-nums shadow-lg " + badgeBg}>
          {badge}
        </div>
      )}
      {indicators.length > 0 && (
        <div className="absolute left-2 top-2 space-y-1 text-[10px] text-muted-foreground">
          <div className="font-bold uppercase tracking-[0.18em]">Indicators</div>
          <div className="flex flex-wrap gap-1">
            {indicators.slice(0, 6).map((indicator) => (
              <span key={indicator} className="rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-foreground border border-border">
                {indicator}
              </span>
            ))}
            {indicators.length > 6 && (
              <span className="rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-foreground border border-border">
                +{indicators.length - 6}
              </span>
            )}
          </div>
        </div>
      )}
      {note && (
        <div className={"absolute left-2 bottom-2 px-2 py-1 rounded-lg text-xs font-semibold tabular-nums shadow-lg " + noteBg}>
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
