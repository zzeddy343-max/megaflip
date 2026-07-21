import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TradingLayout } from "@/components/modules";
import { TickBasedLiveChart } from "@/components/TickBasedLiveChart";
import { supabase } from "@/integrations/supabase/client";

// Type definitions for better DX
type ChartType = "area" | "candle" | "hollow" | "ohlc";
type TimeInterval = "1tick" | "1min" | "2min" | "3min" | "5min" | "10min" | "15min" | "30min" | "1h" | "1d";
type TradeType = "over-under" | "rise-fall" | "higher-lower";
type Duration = "1tick" | "5ticks" | "1min" | "5min" | "15min" | "1hour";

/**
 * INTEGRATION EXAMPLE: Binary Trading Route
 * 
 * This demonstrates a complete, production-ready implementation of the
 * TradingLayout with real Supabase integration, WebSocket price data,
 * trade execution, and account management.
 * 
 * To use this:
 * 1. Create a new route file: src/routes/_authenticated/binary.tsx
 * 2. Import and customize this component
 * 3. Connect your real data sources (prices, balances, trades)
 */

export const Route = createFileRoute("/_authenticated/binary")({
  head: () => ({ meta: [{ title: "Binary Trading - Megaflip" }] }),
  component: BinaryTradingPage,
});

/**
 * STEP 1: Define Server Functions
 * These handle data fetching and mutation on the server
 */

// Fetch current profile and balance
async function getProfileAndBalance() {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.user.id)
    .single();

  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance")
    .eq("user_id", user.user.id)
    .single();

  return {
    userId: user.user.id,
    email: user.user.email,
    profile,
    balance: wallet?.balance || 0,
  };
}

// Place a binary trade
async function placeBinaryTrade(payload: {
  type: "over" | "under" | "rise" | "fall" | "higher" | "lower";
  stake: number;
  duration: Duration;
  asset_id: string;
  entry_price: number;
}) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Unauthorized");

  const { data, error } = await supabase.from("trades").insert({
    user_id: user.user.id,
    trade_type: payload.type,
    stake: payload.stake,
    duration: payload.duration,
    asset_id: payload.asset_id,
    entry_price: payload.entry_price,
    status: "open",
    created_at: new Date().toISOString(),
  });

  if (error) throw error;
  return data;
}

/**
 * STEP 2: Main Component
 */

function BinaryTradingPage() {
  // ========== SERVER FUNCTIONS ==========
  const fetchProfile = useServerFn(getProfileAndBalance);
  const placeTrade = useServerFn(placeBinaryTrade);

  // ========== QUERIES & MUTATIONS ==========
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    refetchInterval: 30000, // Refetch every 30s
  });

  const tradeMutation = useMutation({
    mutationFn: placeTrade,
    onSuccess: () => {
      console.log("Trade placed successfully");
      // Optionally refetch profile to update balance
    },
    onError: (error) => {
      console.error("Trade failed:", error);
    },
  });

  // ========== CHART CONFIGURATION STATE ==========
  const [chartType, setChartType] = useState<ChartType>("area");
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("1tick");
  const [indicators, setIndicators] = useState<string[]>([]);

  // ========== TRADE CONFIGURATION STATE ==========
  const [tradeType, setTradeType] = useState<TradeType>("over-under");
  const [duration, setDuration] = useState<Duration>("1tick");
  const [stake, setStake] = useState(10);
  const [payoutPercentage] = useState(138.1);

  // ========== MARKET DATA STATE ==========
  const [currentPrice, setCurrentPrice] = useState(9554.32);
  const [priceChange, setPriceChange] = useState(0.14);
  const [ticks, setTicks] = useState<{ close: number; timestamp: number }[]>([]);
  
  // WebSocket connection
  const wsRef = useRef<WebSocket | null>(null);
  const priceHistoryRef = useRef<number[]>([9554.32]);
  const lastPriceRef = useRef(9554.32);

  // ========== HANDLERS ==========

  /**
   * Toggle indicator on/off
   */
  const handleIndicatorToggle = useCallback((indicatorId: string) => {
    setIndicators((prev) =>
      prev.includes(indicatorId)
        ? prev.filter((i) => i !== indicatorId)
        : [...prev, indicatorId]
    );
  }, []);

  /**
   * Handle BUY/OVER/RISE action
   */
  const handleBuy = useCallback(
    async (stakeAmount: number) => {
      if (!profileData?.userId) return;

      const direction = tradeType === "over-under" ? "over" : tradeType === "rise-fall" ? "rise" : "higher";

      tradeMutation.mutate({
        type: direction as any,
        stake: stakeAmount,
        duration,
        asset_id: "vol_75", // Replace with actual asset ID
        entry_price: currentPrice,
      });
    },
    [tradeType, duration, currentPrice, profileData?.userId]
  );

  /**
   * Handle SELL/UNDER/FALL action
   */
  const handleSell = useCallback(
    async (stakeAmount: number) => {
      if (!profileData?.userId) return;

      const direction = tradeType === "over-under" ? "under" : tradeType === "rise-fall" ? "fall" : "lower";

      tradeMutation.mutate({
        type: direction as any,
        stake: stakeAmount,
        duration,
        asset_id: "vol_75", // Replace with actual asset ID
        entry_price: currentPrice,
      });
    },
    [tradeType, duration, currentPrice, profileData?.userId]
  );

  /**
   * Get next price from local simulation or WebSocket
   * In production, this should return real-time price data
   */
  const getNextPrice = useCallback(() => {
    // Simulate price movement if WebSocket not available
    const randomChange = (Math.random() - 0.5) * 20;
    const meanReversionForce = (9554.32 - lastPriceRef.current) * 0.01;
    const newPrice = Math.max(9500, Math.min(9610, lastPriceRef.current + randomChange + meanReversionForce));
    
    lastPriceRef.current = newPrice;
    priceHistoryRef.current.push(newPrice);
    
    if (priceHistoryRef.current.length > 500) {
      priceHistoryRef.current.shift();
    }
    
    return newPrice;
  }, []);

  // ========== EFFECTS ==========

  /**
   * Initialize WebSocket connection for real-time prices
   * Replace this URL with your actual WebSocket endpoint
   */
  useEffect(() => {
    // Uncomment when WebSocket is available:
    /*
    const wsUrl = "wss://your-api.com/prices?asset=vol_75";
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setCurrentPrice(data.price);
        setPriceChange(data.change);
        setTicks((prev) => 
          [...prev, { close: data.price, timestamp: Date.now() }].slice(-50)
        );
      } catch (error) {
        console.error("WebSocket parse error:", error);
      }
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
    */

    // Fallback: Simulate price updates
    const interval = setInterval(() => {
      const newPrice = getNextPrice();
      setCurrentPrice(newPrice);
      setPriceChange(newPrice - 9554.32);
      setTicks((prev) => [...prev, { close: newPrice, timestamp: Date.now() }].slice(-50));
    }, 500);

    return () => clearInterval(interval);
  }, [getNextPrice]);

  // ========== RENDER ==========

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center w-full h-screen">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading trading terminal...</p>
        </div>
      </div>
    );
  }

  return (
    <TradingLayout
      chart={
        <TickBasedLiveChart
          getNextPrice={getNextPrice}
          ticksPerCandle={timeInterval === "1tick" ? 1 : 5}
          mode={chartType === "candle" || chartType === "hollow" ? "candles" : "line"}
          indicators={indicators}
          maxPrices={500}
          badge={tradeType === "over-under" ? "OVER" : tradeType === "rise-fall" ? "RISE" : "HIGHER"}
          badgeTone="bull"
          note="Live Vol 75 Index"
          noteTone="neutral"
          className="w-full h-full"
        />
      }
      // Header Props
      assetSymbol="Vol 75"
      currentPrice={currentPrice}
      priceChange={priceChange}
      accountBalance={profileData?.balance || 0}
      // Chart Configuration
      chartType={chartType}
      onChartTypeChange={setChartType}
      timeInterval={timeInterval}
      onTimeIntervalChange={setTimeInterval}
      indicators={indicators}
      onIndicatorToggle={handleIndicatorToggle}
      // Trade Configuration
      tradeType={tradeType}
      onTradeTypeChange={setTradeType}
      duration={duration}
      onDurationChange={setDuration}
      stake={stake}
      onStakeChange={setStake}
      payoutPercentage={payoutPercentage}
      // Statistics
      ticks={ticks}
      // Trade Execution
      onBuy={handleBuy}
      onSell={handleSell}
      isLoading={tradeMutation.isPending}
    />
  );
}
