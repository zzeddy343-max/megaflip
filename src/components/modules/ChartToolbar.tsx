import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Toggle } from "@/components/ui/toggle";
import {
  TrendingUp,
  Candlestick,
  BarChart3,
  Activity,
  Pen,
  Grid3x3,
  Zap,
  ChevronDown,
  LineChart,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type ChartType = "area" | "candle" | "hollow" | "ohlc";
type TimeInterval =
  "1tick" | "1min" | "2min" | "3min" | "5min" | "10min" | "15min" | "30min" | "1h" | "1d";

interface ChartToolbarProps {
  chartType?: ChartType;
  onChartTypeChange?: (type: ChartType) => void;
  timeInterval?: TimeInterval;
  onTimeIntervalChange?: (interval: TimeInterval) => void;
  indicators?: string[];
  onIndicatorToggle?: (indicator: string) => void;
  onDrawingToolSelect?: (tool: string) => void;
}

const CHART_TYPES = [
  { id: "area" as const, label: "Area", icon: TrendingUp },
  { id: "candle" as const, label: "Candlestick", icon: Candlestick },
  { id: "hollow" as const, label: "Hollow", icon: BarChart3 },
  { id: "ohlc" as const, label: "OHLC", icon: Activity },
];

const TIME_INTERVALS = [
  { id: "1tick" as const, label: "1 Tick", icon: Zap },
  { id: "1min" as const, label: "1 Minute" },
  { id: "2min" as const, label: "2 Minutes" },
  { id: "3min" as const, label: "3 Minutes" },
  { id: "5min" as const, label: "5 Minutes" },
  { id: "10min" as const, label: "10 Minutes" },
  { id: "15min" as const, label: "15 Minutes" },
  { id: "30min" as const, label: "30 Minutes" },
  { id: "1h" as const, label: "1 Hour" },
  { id: "1d" as const, label: "1 Day" },
];

const INDICATORS = [
  { id: "sma", label: "Moving Average", category: "Trend" },
  { id: "ema", label: "EMA", category: "Trend" },
  { id: "macd", label: "MACD", category: "Momentum" },
  { id: "rsi", label: "RSI", category: "Momentum" },
  { id: "bollinger", label: "Bollinger Bands", category: "Volatility" },
  { id: "stochastic", label: "Stochastic", category: "Momentum" },
];

const DRAWING_TOOLS = [
  { id: "line", label: "Line" },
  { id: "hline", label: "Horizontal Line" },
  { id: "vline", label: "Vertical Line" },
  { id: "crosshair", label: "Crosshair" },
];

export function ChartToolbar({
  chartType = "area",
  onChartTypeChange,
  timeInterval = "1tick",
  onTimeIntervalChange,
  indicators = [],
  onIndicatorToggle,
  onDrawingToolSelect,
}: ChartToolbarProps) {
  const [showIndicators, setShowIndicators] = useState(false);

  return (
    <div className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-16 bg-background/80 backdrop-blur border-r border-border flex flex-col items-center gap-1 py-2 z-30">
      <TooltipProvider>
        {/* Chart Type Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-10 w-10 rounded-lg flex items-center justify-center hover:bg-surface border border-border transition-colors group relative"
                  aria-label="Chart type"
                >
                  {chartType === "area" && <TrendingUp className="h-4 w-4 text-primary" />}
                  {chartType === "candle" && <Candlestick className="h-4 w-4 text-primary" />}
                  {chartType === "hollow" && <BarChart3 className="h-4 w-4 text-primary" />}
                  {chartType === "ohlc" && <Activity className="h-4 w-4 text-primary" />}
                  <span className="absolute -right-1 -top-1 h-2 w-2 bg-primary rounded-full opacity-75" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Chart Type</TooltipContent>
            </Tooltip>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-40">
            <DropdownMenuLabel>Chart Type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {CHART_TYPES.map(({ id, label, icon: Icon }) => (
              <DropdownMenuItem
                key={id}
                onClick={() => onChartTypeChange?.(id)}
                className={chartType === id ? "bg-surface" : ""}
              >
                <Icon className="h-4 w-4 mr-2" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Time Interval Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-10 w-10 rounded-lg flex items-center justify-center hover:bg-surface border border-border transition-colors"
                  aria-label="Time interval"
                >
                  <Zap className="h-4 w-4 text-primary" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Time Interval: {TIME_INTERVALS.find((t) => t.id === timeInterval)?.label}
              </TooltipContent>
            </Tooltip>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-44">
            <DropdownMenuLabel>Time Interval</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {TIME_INTERVALS.map(({ id, label }) => (
              <DropdownMenuItem
                key={id}
                onClick={() => onTimeIntervalChange?.(id)}
                className={timeInterval === id ? "bg-surface" : ""}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Indicators Menu */}
        <DropdownMenu open={showIndicators} onOpenChange={setShowIndicators}>
          <DropdownMenuTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-10 w-10 rounded-lg flex items-center justify-center hover:bg-surface border border-border transition-colors relative group"
                  aria-label="Indicators"
                >
                  <LineChart className="h-4 w-4 text-primary" />
                  {indicators.length > 0 && (
                    <span className="absolute -right-1 -top-1 h-5 w-5 bg-primary text-background text-xs rounded-full flex items-center justify-center font-bold">
                      {indicators.length}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Indicators ({indicators.length})</TooltipContent>
            </Tooltip>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-48">
            <DropdownMenuLabel>Technical Indicators</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {INDICATORS.map(({ id, label, category }) => (
              <DropdownMenuItem
                key={id}
                onClick={() => onIndicatorToggle?.(id)}
                className={indicators.includes(id) ? "bg-surface" : ""}
              >
                <div className="flex items-center gap-2 w-full">
                  <input
                    type="checkbox"
                    checked={indicators.includes(id)}
                    readOnly
                    className="h-4 w-4"
                  />
                  <div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">{category}</div>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Drawing Tools */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-10 w-10 rounded-lg flex items-center justify-center hover:bg-surface border border-border transition-colors"
                  aria-label="Drawing tools"
                >
                  <Pen className="h-4 w-4 text-primary" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Drawing Tools</TooltipContent>
            </Tooltip>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-40">
            <DropdownMenuLabel>Drawing Tools</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {DRAWING_TOOLS.map(({ id, label }) => (
              <DropdownMenuItem key={id} onClick={() => onDrawingToolSelect?.(id)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Grid Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="h-10 w-10 rounded-lg flex items-center justify-center hover:bg-surface border border-border transition-colors">
              <Grid3x3 className="h-4 w-4 text-muted-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Toggle Grid</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
