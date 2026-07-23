/**
 * QUICK START: Add This to Your Routes
 *
 * This is the minimal code needed to display the trading layout.
 * Copy this to create a new route and you'll have a working trading interface.
 */

// File: src/routes/_authenticated/trading-demo.tsx

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { TradingLayout } from "@/components/modules";
import { TickBasedLiveChart } from "@/components/TickBasedLiveChart";

export const Route = createFileRoute("/_authenticated/trading-demo")({
  head: () => ({ meta: [{ title: "Trading - Megaflip" }] }),
  component: TradingDemoRoute,
});

function TradingDemoRoute() {
  // State
  const [chartType, setChartType] = useState("area");
  const [timeInterval, setTimeInterval] = useState("1tick");
  const [indicators, setIndicators] = useState<string[]>([]);
  const [tradeType, setTradeType] = useState("over-under");
  const [duration, setDuration] = useState("1tick");
  const [stake, setStake] = useState(10);
  const [currentPrice, setCurrentPrice] = useState(9554.32);
  const [ticks, setTicks] = useState<{ close: number; timestamp: number }[]>([]);

  // Refs for price simulation
  const priceRef = useRef(9554.32);

  // Simulate next price
  const getNextPrice = useCallback(() => {
    const change = (Math.random() - 0.5) * 20;
    const newPrice = Math.max(9500, Math.min(9610, priceRef.current + change));
    priceRef.current = newPrice;
    return newPrice;
  }, []);

  // Update price every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      const newPrice = getNextPrice();
      setCurrentPrice(newPrice);
      setTicks((prev) => [...prev, { close: newPrice, timestamp: Date.now() }].slice(-50));
    }, 500);
    return () => clearInterval(interval);
  }, [getNextPrice]);

  // Handlers
  const handleBuy = (stakeAmount: number) => {
    console.log("Buy order:", { tradeType, stake: stakeAmount, currentPrice });
  };

  const handleSell = (stakeAmount: number) => {
    console.log("Sell order:", { tradeType, stake: stakeAmount, currentPrice });
  };

  return (
    <TradingLayout
      chart={
        <TickBasedLiveChart
          getNextPrice={getNextPrice}
          ticksPerCandle={1}
          mode="line"
          indicators={indicators}
        />
      }
      assetSymbol="Vol 75"
      currentPrice={currentPrice}
      priceChange={0.14}
      accountBalance={5000}
      chartType={chartType as any}
      onChartTypeChange={setChartType as any}
      timeInterval={timeInterval as any}
      onTimeIntervalChange={setTimeInterval as any}
      indicators={indicators}
      onIndicatorToggle={(id) =>
        setIndicators((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
      }
      tradeType={tradeType as any}
      onTradeTypeChange={setTradeType as any}
      duration={duration as any}
      onDurationChange={setDuration as any}
      stake={stake}
      onStakeChange={setStake}
      payoutPercentage={138.1}
      ticks={ticks}
      onBuy={handleBuy}
      onSell={handleSell}
    />
  );
}

// ============================================
// TO USE THIS:
// ============================================
// 1. Create file: src/routes/_authenticated/trading-demo.tsx
// 2. Copy the code above into that file
// 3. Navigate to: http://localhost:3000/trading-demo
// 4. You'll see the full trading interface with live price simulation
//
// TO CUSTOMIZE:
// ============================================
// - Replace price simulation (getNextPrice) with real WebSocket
// - Connect handleBuy/handleSell to actual API endpoints
// - Integrate real account balance from Supabase
// - Connect real asset symbols and markets
//
// STYLING:
// ============================================
// The layout automatically uses your theme (dark/light mode)
// All colors are defined in Tailwind config
// See: docs/TAILWIND_CONFIG_GUIDE.ts for customization
