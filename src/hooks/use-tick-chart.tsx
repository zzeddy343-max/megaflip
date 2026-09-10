import { useCallback, useEffect, useRef, useState } from "react";
import { TickChartEngine, OHLC } from "@/lib/tick-engine";

/**
 * React hook for managing tick-based charts
 * Handles WebSocket tick stream, indicator updates, and efficient rendering
 *
 * Usage:
 * const { prices, candles, indicators } = useTickChart({
 *   onTick: (price) => fetchPriceFromAPI(),
 *   ticksPerCandle: 5
 * });
 */
export interface UseTickChartOptions {
  onTick?: () => Promise<number>;
  tickIntervalMs?: number;
  ticksPerCandle?: number;
  smaPeriod?: number;
  emaPeriod?: number;
  rsiPeriod?: number;
  bbPeriod?: number;
  maxDisplayPoints?: number;
}

export interface UseTickChartReturn {
  prices: number[];
  candles: OHLC[];
  currentPrice: number;
  indicators: {
    sma: number;
    ema: number;
    rsi: number;
    bollinger: { middle: number; upper: number; lower: number };
    macd: { macd: number; signal: number; histogram: number };
    atr: number;
    stochastic: number;
  };
  tickCount: number;
  isLoading: boolean;
  error: Error | null;
}

export function useTickChart(options: UseTickChartOptions = {}): UseTickChartReturn {
  const {
    onTick,
    tickIntervalMs = 500,
    ticksPerCandle = 1,
    smaPeriod = 20,
    emaPeriod = 20,
    rsiPeriod = 14,
    bbPeriod = 20,
    maxDisplayPoints = 500,
  } = options;

  const engineRef = useRef<TickChartEngine | null>(null);
  const [prices, setPrices] = useState<number[]>([]);
  const [candles, setCandles] = useState<OHLC[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [indicators, setIndicators] = useState({
    sma: 0,
    ema: 0,
    rsi: 0,
    bollinger: { middle: 0, upper: 0, lower: 0 },
    macd: { macd: 0, signal: 0, histogram: 0 },
    atr: 0,
    stochastic: 0,
  });
  const [tickCount, setTickCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize engine
  useEffect(() => {
    engineRef.current = new TickChartEngine({
      tickBufferSize: maxDisplayPoints,
      ticksPerCandle,
      smaPeriod,
      emaPeriod,
      rsiPeriod,
      bbPeriod,
    });

    return () => {
      engineRef.current?.reset();
    };
  }, [maxDisplayPoints, ticksPerCandle, smaPeriod, emaPeriod, rsiPeriod, bbPeriod]);

  // Handle incoming ticks
  const processTick = useCallback(
    async (price?: number) => {
      if (!engineRef.current) return;

      try {
        setIsLoading(true);
        let newPrice = price;

        if (newPrice === undefined && onTick) {
          newPrice = await onTick();
        }

        if (newPrice === undefined || newPrice === null) return;

        // Process tick through engine
        const completedCandle = engineRef.current.onTick(newPrice);

        // Update state
        const allPrices = engineRef.current.getPrices();
        const displayPrices = allPrices.slice(Math.max(0, allPrices.length - maxDisplayPoints));

        setPrices(displayPrices);
        setCurrentPrice(newPrice);
        setCandles(engineRef.current.getCandles());
        setIndicators(engineRef.current.getIndicators());
        setTickCount(engineRef.current.getTickCount());
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    },
    [onTick, maxDisplayPoints],
  );

  // Start tick timer
  useEffect(() => {
    const interval = setInterval(() => {
      processTick();
    }, tickIntervalMs);

    return () => clearInterval(interval);
  }, [processTick, tickIntervalMs]);

  return {
    prices,
    candles,
    currentPrice,
    indicators,
    tickCount,
    isLoading,
    error,
  };
}

/**
 * Hook for managing synthetic (simulated) price data
 * Used for demo charts with realistic market behavior
 */
export interface UseSyntheticTicksOptions {
  basePrice?: number;
  volatility?: number;
  tickIntervalMs?: number;
  enableMeanReversion?: boolean;
  enableVolatilityClusters?: boolean;
}

export function useSyntheticTicks(options: UseSyntheticTicksOptions = {}) {
  const {
    basePrice = 1000,
    volatility = 0.0008,
    tickIntervalMs = 500,
    enableMeanReversion = true,
    enableVolatilityClusters = true,
  } = options;

  const driftRef = useRef(0);
  const impulseRef = useRef(0);
  const lastPriceRef = useRef(basePrice);

  return useCallback(() => {
    let price = lastPriceRef.current;

    // Mean reversion toward base price
    if (enableMeanReversion) {
      const pull = (basePrice - price) * 0.015;
      price += pull;
    }

    // Random burst (volatility cluster)
    if (enableVolatilityClusters && Math.random() < 0.13) {
      const burst = (Math.random() - 0.5) * volatility * basePrice * 7.5;
      impulseRef.current = impulseRef.current * 0.68 + burst;
    } else {
      impulseRef.current *= 0.68;
    }

    // Drift component
    driftRef.current =
      driftRef.current * 0.76 +
      (Math.random() - 0.5) * volatility * basePrice * 1.35 +
      Math.sin(Date.now() / 4100) * volatility * basePrice * 0.18;

    price += driftRef.current + impulseRef.current;
    price = Math.max(0.01, price);

    lastPriceRef.current = price;
    return price;
  }, [basePrice, volatility, enableMeanReversion, enableVolatilityClusters]);
}

/**
 * Hook for WebSocket-based real-time price updates
 * Connects to trading API and streams ticks
 */
export interface UseWebSocketTicksOptions {
  url: string;
  onError?: (error: Error) => void;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocketTicks(options: UseWebSocketTicksOptions) {
  const { url, onError, reconnectDelay = 3000, maxReconnectAttempts = 5 } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef<(price: number) => void>(() => {});

  const connect = useCallback(() => {
    try {
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        reconnectCountRef.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.price !== undefined) {
            callbackRef.current(data.price);
          }
        } catch (err) {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      };

      wsRef.current.onerror = () => {
        setIsConnected(false);
        onError?.(new Error("WebSocket connection error"));
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        // Attempt reconnect
        if (reconnectCountRef.current < maxReconnectAttempts) {
          reconnectCountRef.current += 1;
          setTimeout(connect, reconnectDelay);
        }
      };
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [url, onError, reconnectDelay, maxReconnectAttempts]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const registerCallback = useCallback((callback: (price: number) => void) => {
    callbackRef.current = callback;
  }, []);

  return { isConnected, registerCallback };
}
