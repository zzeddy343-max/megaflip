import { useState, useEffect, useRef } from "react";
import { TradingLayout } from "./TradingLayout";
import { TickBasedLiveChart } from "@/components/TickBasedLiveChart";

type ChartType = "area" | "candle" | "hollow" | "ohlc";
type TimeInterval =
  "1tick" | "1min" | "2min" | "3min" | "5min" | "10min" | "15min" | "30min" | "1h" | "1d";
type TradeType = "over-under" | "rise-fall" | "higher-lower";
type Duration = "1tick" | "5ticks" | "1min" | "5min" | "15min" | "1hour";

interface TradingPageDemoProps {
  /** Initial asset symbol */
  initialAsset?: string;

  /** Initial price (for simulation) */
  initialPrice?: number;

  /** Account balance */
  accountBalance?: number;
}

/**
 * Complete Trading Page Demo
 *
 * This component demonstrates how to wire up the TradingLayout
 * with state management, price simulation, and trade execution.
 *
 * Use this as a template for implementing real trading pages.
 */
export function TradingPageDemo({
  initialAsset = "Vol 75",
  initialPrice = 9554.32,
  accountBalance = 5000.0,
}: TradingPageDemoProps) {
  // ========== STATE MANAGEMENT ==========

  // Chart configuration
  const [chartType, setChartType] = useState<ChartType>("area");
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("1tick");
  const [indicators, setIndicators] = useState<string[]>([]);

  // Trade configuration
  const [tradeType, setTradeType] = useState<TradeType>("over-under");
  const [duration, setDuration] = useState<Duration>("1tick");
  const [stake, setStake] = useState(10);
  const [payoutPercentage] = useState(138.1);

  // Market data
  const [currentPrice, setCurrentPrice] = useState(initialPrice);
  const [priceChange, setPriceChange] = useState(0.14);
  const [ticks, setTicks] = useState<{ close: number; timestamp: number }[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const priceHistoryRef = useRef<number[]>([initialPrice]);
  const lastPriceRef = useRef(initialPrice);

  // ========== PRICE SIMULATION ==========

  /**
   * Simulates live price movement
   * In production, this would connect to a WebSocket or streaming API
   */
  const generateNextPrice = () => {
    const lastPrice = lastPriceRef.current;

    // Simulate random walk with mean reversion
    const randomChange = (Math.random() - 0.5) * 20; // ±10 points
    const meanReversionForce = (9554.32 - lastPrice) * 0.01; // 1% pull toward mean
    const newPrice = Math.max(9500, Math.min(9610, lastPrice + randomChange + meanReversionForce));

    lastPriceRef.current = newPrice;
    priceHistoryRef.current.push(newPrice);

    // Keep last 500 prices
    if (priceHistoryRef.current.length > 500) {
      priceHistoryRef.current.shift();
    }

    return newPrice;
  };

  // ========== EVENT HANDLERS ==========

  const handleIndicatorToggle = (indicatorId: string) => {
    setIndicators((prev) =>
      prev.includes(indicatorId) ? prev.filter((i) => i !== indicatorId) : [...prev, indicatorId],
    );
  };

  const handleBuy = async (stakeAmount: number) => {
    setIsLoading(true);
    try {
      console.log("Placing BUY order:", {
        tradeType,
        direction: tradeType === "over-under" ? "Over" : "Rise",
        stake: stakeAmount,
        duration,
        entryPrice: currentPrice,
        timestamp: new Date().toISOString(),
      });

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // In production, you would:
      // 1. Send trade to backend
      // 2. Deduct stake from balance
      // 3. Track open position
      // 4. Update UI accordingly
    } finally {
      setIsLoading(false);
    }
  };

  const handleSell = async (stakeAmount: number) => {
    setIsLoading(true);
    try {
      console.log("Placing SELL order:", {
        tradeType,
        direction: tradeType === "over-under" ? "Under" : "Fall",
        stake: stakeAmount,
        duration,
        entryPrice: currentPrice,
        timestamp: new Date().toISOString(),
      });

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // In production, same as handleBuy but for opposite direction
    } finally {
      setIsLoading(false);
    }
  };

  // ========== EFFECTS ==========

  /**
   * Simulate live price updates
   * In production, replace with WebSocket subscription
   */
  useEffect(() => {
    const interval = setInterval(() => {
      const newPrice = generateNextPrice();
      setCurrentPrice(newPrice);

      // Calculate percentage change
      const change = newPrice - initialPrice;
      setPriceChange(change);

      // Add to ticks history for statistics
      setTicks((prev) => [...prev, { close: newPrice, timestamp: Date.now() }].slice(-50)); // Keep last 50 ticks
    }, 500); // Update every 500ms

    return () => clearInterval(interval);
  }, []);

  // ========== RENDER ==========

  return (
    <TradingLayout
      chart={
        <TickBasedLiveChart
          getNextPrice={generateNextPrice}
          ticksPerCandle={timeInterval === "1tick" ? 1 : 5}
          mode={chartType === "candle" || chartType === "hollow" ? "candles" : "line"}
          indicators={indicators}
          maxPrices={500}
          badge={tradeType === "over-under" ? "OVER" : "RISE"}
          badgeTone="bull"
          note="Live Market Data"
          noteTone="neutral"
          className="w-full h-full"
        />
      }
      assetSymbol={initialAsset}
      currentPrice={currentPrice}
      priceChange={priceChange}
      accountBalance={accountBalance}
      chartType={chartType}
      onChartTypeChange={setChartType}
      timeInterval={timeInterval}
      onTimeIntervalChange={setTimeInterval}
      indicators={indicators}
      onIndicatorToggle={handleIndicatorToggle}
      tradeType={tradeType}
      onTradeTypeChange={setTradeType}
      duration={duration}
      onDurationChange={setDuration}
      stake={stake}
      onStakeChange={setStake}
      payoutPercentage={payoutPercentage}
      ticks={ticks}
      onBuy={handleBuy}
      onSell={handleSell}
      isLoading={isLoading}
    />
  );
}
