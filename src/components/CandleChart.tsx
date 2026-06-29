interface Candle { t: number; o: number; h: number; l: number; c: number }

interface Props {
  candles: Candle[];
  livePrice?: number;
  className?: string;
}

/** Compact OHLC candlestick chart. Pure SVG, no deps. */
export function CandleChart({ candles, livePrice, className }: Props) {
  if (!candles.length) {
    return <div className={"flex items-center justify-center text-xs text-muted-foreground " + (className ?? "")}>Loading candles...</div>;
  }

  // Use live tip if provided
  const data = livePrice
    ? [...candles.slice(0, -1), { ...candles[candles.length - 1], c: livePrice, h: Math.max(candles[candles.length - 1].h, livePrice), l: Math.min(candles[candles.length - 1].l, livePrice) }]
    : candles;

  const min = Math.min(...data.map((c) => c.l));
  const max = Math.max(...data.map((c) => c.h));
  const pad = (max - min) * 0.08 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const range = hi - lo || 1;

  const W = 100;
  const H = 100;
  const gap = 0.2;
  const cw = (W / data.length) * (1 - gap);
  const step = W / data.length;

  const y = (v: number) => H - ((v - lo) / range) * H;
  const last = data[data.length - 1];
  const bullColor = "oklch(0.76 0.18 152)";
  const bearColor = "oklch(0.66 0.24 22)";

  return (
    <div className={"relative w-full " + (className ?? "")}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1="0" x2={W} y1={H * t} y2={H * t} stroke="currentColor" strokeOpacity="0.06" strokeWidth="0.2" />
        ))}
        {data.map((c, i) => {
          const up = c.c >= c.o;
          const color = up ? bullColor : bearColor;
          const cx = i * step + step / 2;
          const bodyTop = y(Math.max(c.o, c.c));
          const bodyH = Math.max(0.4, Math.abs(y(c.o) - y(c.c)));
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
              <rect x={cx - cw / 2} y={bodyTop} width={cw} height={bodyH} fill={color} opacity={up ? 0.95 : 0.9} />
            </g>
          );
        })}
        {/* live price line */}
        <line x1="0" x2={W} y1={y(last.c)} y2={y(last.c)} stroke="oklch(0.78 0.13 86)" strokeOpacity="0.7" strokeDasharray="1 1" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute top-1 right-1 text-[10px] font-bold tabular-nums bg-surface/80 border border-border rounded px-1.5 py-0.5">
        {last.c.toFixed(last.c < 10 ? 4 : 2)}
      </div>
    </div>
  );
}
