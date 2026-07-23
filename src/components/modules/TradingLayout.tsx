import { useState, ReactNode } from "react";
import { TradeHeader } from "./TradeHeader";
import { ChartToolbar } from "./ChartToolbar";
import { TickStatistics } from "./TickStatistics";
import { ExecutionPanel } from "./ExecutionPanel";

type ChartType = "area" | "candle" | "hollow" | "ohlc";
type TimeInterval =
  "1tick" | "1min" | "2min" | "3min" | "5min" | "10min" | "15min" | "30min" | "1h" | "1d";
type TradeType = "over-under" | "rise-fall" | "higher-lower";
type Duration = "1tick" | "5ticks" | "1min" | "5min" | "15min" | "1hour";

interface TradingLayoutProps {
  /** The main chart component to display in the center */
  chart: ReactNode;

  /** Current asset symbol */
  assetSymbol?: string;

  /** Current price */
  currentPrice?: number;

  /** Price change */
  priceChange?: number;

  /** Account balance */
  accountBalance?: number;

  /** Selected chart type */
  chartType?: ChartType;
  onChartTypeChange?: (type: ChartType) => void;

  /** Selected time interval */
  timeInterval?: TimeInterval;
  onTimeIntervalChange?: (interval: TimeInterval) => void;

  /** Active indicators */
  indicators?: string[];
  onIndicatorToggle?: (indicator: string) => void;

  /** Trade type */
  tradeType?: TradeType;
  onTradeTypeChange?: (type: TradeType) => void;

  /** Duration */
  duration?: Duration;
  onDurationChange?: (duration: Duration) => void;

  /** Stake amount */
  stake?: number;
  onStakeChange?: (stake: number) => void;

  /** Payout percentage */
  payoutPercentage?: number;

  /** Ticks for statistics */
  ticks?: { close: number; timestamp: number }[];

  /** Trade callbacks */
  onBuy?: (stake: number) => void;
  onSell?: (stake: number) => void;

  /** Loading state */
  isLoading?: boolean;
}

/**
 * Professional Three-Column Trading Layout
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────┐
 * │                   Top Navigation Bar                  │
 * ├──────────┬──────────────────────────────┬────────────┤
 * │          │                              │            │
 * │ Left     │     Center Main Chart        │   Right    │
 * │ Toolbar  │                              │ Execution  │
 * │ • Chart  │  • Live Price Action         │ Panel      │
 * │ • Time   │                              │ • Type     │
 * │ • Ind.   │──────────────────────────────│ • Duration │
 * │ • Tools  │     Bottom Statistics        │ • Stake    │
 * │          │     • Last Digit Freq        │ • Buttons  │
 * │          │                              │            │
 * └──────────┴──────────────────────────────┴────────────┘
 *
 * Key Features:
 * - Fixed, non-scrolling layout for responsive trading
 * - Dark theme optimized for long-session trading
 * - Chart dominates 65-70% horizontal space
 * - Clean visual hierarchy with accent colors (gold, green, red)
 * - Modular component structure for easy customization
 */
export function TradingLayout({
  chart,
  assetSymbol = "Vol 75",
  currentPrice = 9554.32,
  priceChange = 0.14,
  accountBalance = 5000.0,
  chartType = "area",
  onChartTypeChange,
  timeInterval = "1tick",
  onTimeIntervalChange,
  indicators = [],
  onIndicatorToggle,
  tradeType = "over-under",
  onTradeTypeChange,
  duration = "1tick",
  onDurationChange,
  stake = 10,
  onStakeChange,
  payoutPercentage = 138.1,
  ticks = [],
  onBuy,
  onSell,
  isLoading = false,
}: TradingLayoutProps) {
  const [showDrawingTools, setShowDrawingTools] = useState(false);

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      {/* ========== TOP NAVIGATION BAR ========== */}
      <TradeHeader
        assetSymbol={assetSymbol}
        currentPrice={currentPrice}
        priceChange={priceChange}
        accountBalance={accountBalance}
      />

      {/* ========== MAIN LAYOUT GRID ========== */}
      <div className="fixed inset-0 top-16 flex">
        {/* LEFT SIDEBAR - Chart Tools */}
        <ChartToolbar
          chartType={chartType}
          onChartTypeChange={onChartTypeChange}
          timeInterval={timeInterval}
          onTimeIntervalChange={onTimeIntervalChange}
          indicators={indicators}
          onIndicatorToggle={onIndicatorToggle}
          onDrawingToolSelect={() => setShowDrawingTools(!showDrawingTools)}
        />

        {/* CENTER WORKSPACE - Main Chart */}
        <div className="flex-1 ml-16 mr-80 flex flex-col relative">
          {/* Chart Area - 70% of vertical space */}
          <div className="flex-1 overflow-hidden relative bg-background">{chart}</div>

          {/* Bottom Statistics Widget - 30% of vertical space */}
          <TickStatistics
            ticks={ticks}
            displayMode="percentage"
            className="h-32 flex-shrink-0 border-t border-border"
          />
        </div>

        {/* RIGHT PANEL - Trade Execution */}
        <ExecutionPanel
          currentPrice={currentPrice}
          tradeType={tradeType}
          onTradeTypeChange={onTradeTypeChange}
          duration={duration}
          onDurationChange={onDurationChange}
          stake={stake}
          onStakeChange={onStakeChange}
          payoutPercentage={payoutPercentage}
          onBuy={onBuy}
          onSell={onSell}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
