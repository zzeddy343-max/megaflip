import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  basePrice?: number;
  volatility?: number;
  className?: string;
  tickMs?: number;
  onPrice?: (p: number) => void;
  /** Overlay text shown bottom-right (e.g. current digit) */
  badge?: string;
  badgeTone?: "neutral" | "bull" | "bear";
}

/**
 * Smooth, realistic-feeling synthetic ticker.
 * Uses mean-reversion + small step size so movement isn't jittery/rapid.
 */
export function LiveChart({
  basePrice = 1000,
  volatility = 0.0008,
  className,
  tickMs = 500,
  onPrice,
  badge,
  badgeTone = "neutral",
}: Props) {
  const buildInitialPoints = useCallback(() => {
    const nowStep = Math.floor(Date.now() / tickMs);
    let drift = Math.sin(nowStep / 19) * basePrice * volatility * 0.8;
    return Array.from({ length: 90 }, (_, i) => {
      const t = nowStep - (89 - i);
      drift = drift * 0.86 + Math.sin(t / 7) * basePrice * volatility * 0.18;
      const wave = Math.sin(t / 11) * basePrice * volatility * 3;
      const pulse = Math.cos(t / 5) * basePrice * volatility * 0.9;
      return basePrice + wave + pulse + drift;
    });
  }, [basePrice, tickMs, volatility]);
  const [points, setPoints] = useState<number[]>(buildInitialPoints);
  const driftRef = useRef(0);

  useEffect(() => {
    const seeded = buildInitialPoints();
    setPoints(seeded);
    onPrice?.(seeded[seeded.length - 1]);
  }, [buildInitialPoints, onPrice]);

  useEffect(() => {
    const id = setInterval(() => {
      setPoints((prev) => {
        const last = prev[prev.length - 1];
        // Mean-revert toward basePrice + small random walk
        const pull = (basePrice - last) * 0.02;
        driftRef.current = driftRef.current * 0.85 + (Math.random() - 0.5) * volatility * basePrice * 0.4;
        const next = last + pull + driftRef.current;
        const arr = [...prev.slice(1), next];
        onPrice?.(next);
        return arr;
      });
    }, tickMs);
    return () => clearInterval(id);
  }, [volatility, basePrice, tickMs, onPrice]);

  const min = Math.min(...points);
  const max = Math.max(...points);
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
  const up = last >= first;
  const stroke = up ? "oklch(0.76 0.18 152)" : "oklch(0.66 0.24 22)";

  const badgeBg = badgeTone === "bull" ? "bg-bull text-bull-foreground" : badgeTone === "bear" ? "bg-bear text-bear-foreground" : "bg-surface text-foreground border border-border";

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
        <path d={area} fill="url(#lc-fill)" />
        <path d={path} fill="none" stroke={stroke} strokeWidth="0.7" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {/* live dot at tip */}
        <circle
          cx={w}
          cy={h - ((last - min) / range) * h}
          r="1.2"
          fill={stroke}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {badge !== undefined && (
        <div className={"absolute right-2 bottom-2 px-2 py-1 rounded-lg text-xs font-extrabold tabular-nums shadow-lg " + badgeBg}>
          {badge}
        </div>
      )}
    </div>
  );
}
