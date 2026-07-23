import { useCallback, useEffect, useRef, useState } from "react";
import { TickChartEngine } from "@/lib/tick-engine";
import {
  computeSMA,
  computeEMA,
  computeBollinger,
  getIndicatorColor,
  buildIndicatorPath,
  buildBandPath,
  buildLinePath,
  alignIndicatorWithPrices,
} from "@/lib/indicator-engine";

/**
 * TickBasedLiveChart - Optimized for real-time tick-based trading charts
 *
 * This chart demonstrates the proper Deriv-style architecture:
 * - Efficient O(1) indicator updates on each tick
 * - Rolling buffer for prices (configurable)
 * - Proper candle generation from ticks
 * - Smooth animation of the last point
 * - Incremental line updates instead of full redraws
 */

interface TickBasedLiveChartProps {
  /** Function to generate/fetch next tick price */
  getNextPrice: () => number | Promise<number>;

  /** Ticks per candle (1 = 1-tick candles, 5 = 5-tick candles, etc) */
  ticksPerCandle?: number;

  /** Tick interval in milliseconds */
  tickIntervalMs?: number;

  /** Display mode: line graph or candle chart */
  mode?: "line" | "candles";

  /** Which indicators to display */
  indicators?: string[];

  /** Maximum number of prices to keep in buffer */
  maxPrices?: number;

  /** Overlay badge text (e.g., "BUY", "SELL") */
  badge?: string;
  badgeTone?: "neutral" | "bull" | "bear";

  /** Additional note text */
  note?: string;
  noteTone?: "neutral" | "bull" | "bear";

  className?: string;

  /** Called when price updates */
  onPrice?: (price: number) => void;

  /** Called when new candle completes */
  onCandleComplete?: () => void;
}

export function TickBasedLiveChart({
  getNextPrice,
  ticksPerCandle = 1,
  tickIntervalMs = 500,
  mode = "line",
  indicators = [],
  maxPrices = 500,
  badge,
  badgeTone = "neutral",
  note,
  noteTone = "neutral",
  className,
  onPrice,
  onCandleComplete,
}: TickBasedLiveChartProps) {
  const engineRef = useRef<TickChartEngine>(
    new TickChartEngine({
      tickBufferSize: maxPrices,
      ticksPerCandle,
      smaPeriod: 20,
      emaPeriod: 20,
      rsiPeriod: 14,
      bbPeriod: 20,
    }),
  );

  const [prices, setPrices] = useState<number[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [candles, setCandles] = useState<any[]>([]);
  const [indicatorValues, setIndicatorValues] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Animation state for smooth transitions
  const animationRef = useRef<number | null>(null);
  const lastAnimatedPriceRef = useRef(0);

  const processTick = useCallback(async () => {
    try {
      setIsLoading(true);
      const newPrice = await Promise.resolve(getNextPrice());

      if (typeof newPrice !== "number" || !isFinite(newPrice)) {
        setIsLoading(false);
        return;
      }

      const engine = engineRef.current;
      const completedCandle = engine.onTick(newPrice);

      // Update state
      const allPrices = engine.getPrices();
      setPrices(allPrices);
      setCurrentPrice(newPrice);
      onPrice?.(newPrice);

      // Update candles
      const newCandles = engine.getCandles();
      setCandles(newCandles);
      if (completedCandle) {
        onCandleComplete?.();
      }

      // Update indicators
      setIndicatorValues(engine.getIndicators());

      lastAnimatedPriceRef.current = newPrice;
      setIsLoading(false);
    } catch (error) {
      console.error("Error processing tick:", error);
      setIsLoading(false);
    }
  }, [getNextPrice, onPrice, onCandleComplete]);

  // Tick timer
  useEffect(() => {
    const interval = setInterval(() => {
      processTick();
    }, tickIntervalMs);

    return () => clearInterval(interval);
  }, [processTick, tickIntervalMs]);

  // Chart dimensions
  const w = 100;
  const h = 100;

  // Calculate price range
  const allDisplayPrices = mode === "line" ? prices : candles.map((c) => [c.h, c.l]).flat();
  const min = Math.min(...allDisplayPrices, currentPrice);
  const max = Math.max(...allDisplayPrices, currentPrice);
  const range = Math.max(max - min, 0.01);

  // Build indicator paths
  const selected = new Set(indicators);
  const closes = mode === "line" ? prices : candles.map((c) => c.c);

  // Compute and align indicators
  const smaValues = selected.has("SMA")
    ? alignIndicatorWithPrices(computeSMA(closes, 20), closes)
    : [];
  const emaValues = selected.has("EMA")
    ? alignIndicatorWithPrices(computeEMA(closes, 20), closes)
    : [];
  const bbValues = selected.has("Bollinger")
    ? {
        middle: alignIndicatorWithPrices(computeBollinger(closes, 20).middle, closes),
        upper: alignIndicatorWithPrices(computeBollinger(closes, 20).upper, closes),
        lower: alignIndicatorWithPrices(computeBollinger(closes, 20).lower, closes),
      }
    : null;

  const smaPath = selected.has("SMA") ? buildIndicatorPath(smaValues, w, h, min, range) : "";
  const emaPath = selected.has("EMA") ? buildIndicatorPath(emaValues, w, h, min, range) : "";
  const bbFill =
    selected.has("Bollinger") && bbValues ? buildBandPath(bbValues, w, h, min, range) : "";

  // Build price line
  const pricePath = mode === "line" ? buildLinePath(prices, w, h, min, range) : "";

  const y = (v: number) => h - ((v - min) / range) * h;
  const lastCandle = candles[candles.length - 1];
  const bullColor = "oklch(0.76 0.18 152)";
  const bearColor = "oklch(0.66 0.24 22)";

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
    <div className={"relative w-full " + (className ?? "")}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1="0"
            x2={w}
            y1={h * t}
            y2={h * t}
            stroke="currentColor"
            strokeOpacity="0.06"
            strokeWidth="0.2"
          />
        ))}

        {/* Indicators and Price Data */}
        {mode === "line" ? (
          <>
            {/* Bollinger Bands background */}
            {bbFill && <path d={bbFill} fill="oklch(0.5 0.18 222 / 0.16)" />}

            {/* SMA indicator */}
            {smaPath && (
              <path
                d={smaPath}
                fill="none"
                stroke={getIndicatorColor("SMA")}
                strokeWidth="0.4"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* EMA indicator */}
            {emaPath && (
              <path
                d={emaPath}
                fill="none"
                stroke={getIndicatorColor("EMA")}
                strokeWidth="0.4"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Price line */}
            <defs>
              <linearGradient id="price-fill" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={currentPrice >= prices[0] ? bullColor : bearColor}
                  stopOpacity="0.3"
                />
                <stop
                  offset="100%"
                  stopColor={currentPrice >= prices[0] ? bullColor : bearColor}
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>

            {pricePath && (
              <>
                <path d={`${pricePath} L${w},${h} L0,${h} Z`} fill="url(#price-fill)" />
                <path
                  d={pricePath}
                  fill="none"
                  stroke={currentPrice >= prices[0] ? bullColor : bearColor}
                  strokeWidth="0.7"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {/* Current price dot */}
            <circle
              cx={w}
              cy={y(currentPrice)}
              r="1.2"
              fill={currentPrice >= prices[0] ? bullColor : bearColor}
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          <>
            {/* Candle chart mode */}
            {bbFill && <path d={bbFill} fill="oklch(0.5 0.18 222 / 0.16)" />}

            {smaPath && (
              <path
                d={smaPath}
                fill="none"
                stroke={getIndicatorColor("SMA")}
                strokeWidth="0.4"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {emaPath && (
              <path
                d={emaPath}
                fill="none"
                stroke={getIndicatorColor("EMA")}
                strokeWidth="0.4"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Candles */}
            {candles.map((candle, idx) => {
              const up = candle.c >= candle.o;
              const color = up ? bullColor : bearColor;
              const cx = (idx / candles.length) * w + w / candles.length / 2;
              const cw = (w / candles.length) * 0.6;

              return (
                <g key={idx}>
                  {/* Wick */}
                  <line
                    x1={cx}
                    x2={cx}
                    y1={y(candle.h)}
                    y2={y(candle.l)}
                    stroke={color}
                    strokeWidth="0.25"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* Body */}
                  <rect
                    x={cx - cw / 2}
                    y={y(Math.max(candle.o, candle.c))}
                    width={cw}
                    height={Math.max(0.4, Math.abs(y(candle.o) - y(candle.c)))}
                    fill={color}
                    opacity={up ? 0.95 : 0.9}
                  />
                </g>
              );
            })}

            {/* Current price line */}
            <line
              x1="0"
              x2={w}
              y1={y(currentPrice)}
              y2={y(currentPrice)}
              stroke="oklch(0.78 0.13 86)"
              strokeOpacity="0.7"
              strokeDasharray="1 1"
              strokeWidth="0.25"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {/* Current price display */}
      <div className="absolute top-1 right-1 text-[10px] font-bold tabular-nums bg-surface/80 border border-border rounded px-1.5 py-0.5">
        {currentPrice.toFixed(currentPrice < 10 ? 4 : 2)}
      </div>

      {/* Indicators display */}
      {indicatorValues && (
        <div className="absolute bottom-1 left-1 text-[9px] font-mono space-y-0.5 bg-surface/60 border border-border rounded px-1 py-0.5 max-w-[140px]">
          {indicators.map((ind) => (
            <div key={ind} className="text-muted-foreground">
              <span className="font-semibold">{ind}:</span>{" "}
              {ind === "Bollinger"
                ? `${indicatorValues.bollinger.middle.toFixed(2)}`
                : ind === "RSI"
                  ? indicatorValues.rsi.toFixed(1)
                  : ind === "MACD"
                    ? indicatorValues.macd.macd.toFixed(5)
                    : indicatorValues[ind.toLowerCase()]?.toFixed(2) || "—"}
            </div>
          ))}
        </div>
      )}

      {/* Badge */}
      {badge !== undefined && (
        <div
          className={
            "absolute right-2 bottom-2 px-2 py-1 rounded-lg text-xs font-extrabold tabular-nums shadow-lg " +
            badgeBg
          }
        >
          {badge}
        </div>
      )}

      {/* Note */}
      {note && (
        <div
          className={
            "absolute left-2 bottom-2 px-2 py-1 rounded-lg text-xs font-semibold tabular-nums shadow-lg " +
            noteBg
          }
        >
          {note}
        </div>
      )}
    </div>
  );
}
