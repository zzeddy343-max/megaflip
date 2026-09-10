import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { Plus, Minus, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

type TradeType = "over-under" | "rise-fall" | "higher-lower";
type Duration = "1tick" | "5ticks" | "1min" | "5min" | "15min" | "1hour";

interface ExecutionPanelProps {
  /** Current market price */
  currentPrice?: number;

  /** Trade type selection */
  tradeType?: TradeType;
  onTradeTypeChange?: (type: TradeType) => void;

  /** Selected duration */
  duration?: Duration;
  onDurationChange?: (duration: Duration) => void;

  /** Stake amount */
  stake?: number;
  onStakeChange?: (stake: number) => void;

  /** Predicted payout percentage */
  payoutPercentage?: number;

  /** Callback when buy/call is clicked */
  onBuy?: (stake: number) => void;

  /** Callback when sell/put is clicked */
  onSell?: (stake: number) => void;

  /** Is loading/processing */
  isLoading?: boolean;
}

const DURATIONS: { id: Duration; label: string }[] = [
  { id: "1tick", label: "1 Tick" },
  { id: "5ticks", label: "5 Ticks" },
  { id: "1min", label: "1 Min" },
  { id: "5min", label: "5 Min" },
  { id: "15min", label: "15 Min" },
  { id: "1hour", label: "1 Hour" },
];

const STAKE_PRESETS = [1, 5, 10, 50, 100];

export function ExecutionPanel({
  currentPrice = 9554.32,
  tradeType = "over-under",
  onTradeTypeChange,
  duration = "1tick",
  onDurationChange,
  stake = 10,
  onStakeChange,
  payoutPercentage = 138.1,
  onBuy,
  onSell,
  isLoading = false,
}: ExecutionPanelProps) {
  const [localStake, setLocalStake] = useState(stake);
  const [selectedDirection, setSelectedDirection] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    setLocalStake(stake);
  }, [stake]);

  const handleStakeChange = (value: string) => {
    const numValue = parseFloat(value) || 0;
    setLocalStake(Math.max(0, numValue));
    onStakeChange?.(Math.max(0, numValue));
  };

  const handleStakeAdjustment = (delta: number) => {
    const newStake = Math.max(0, localStake + delta);
    setLocalStake(newStake);
    onStakeChange?.(newStake);
  };

  const handlePresetStake = (preset: number) => {
    setLocalStake(preset);
    onStakeChange?.(preset);
  };

  const potentialReturn = (localStake * (1 + payoutPercentage / 100)).toFixed(2);
  const potentialProfit = (potentialReturn - localStake).toFixed(2);

  return (
    <div className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-80 bg-background/95 backdrop-blur border-l border-border overflow-y-auto flex flex-col">
      {/* Trade Type Selector */}
      <div className="p-4 border-b border-border">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
          Trade Type
        </Label>
        <Tabs value={tradeType} onValueChange={(v) => onTradeTypeChange?.(v as TradeType)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="over-under" className="text-xs">
              Over/Under
            </TabsTrigger>
            <TabsTrigger value="rise-fall" className="text-xs">
              Rise/Fall
            </TabsTrigger>
            <TabsTrigger value="higher-lower" className="text-xs">
              Higher/Lower
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Duration Selector */}
      <div className="p-4 border-b border-border">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 block">
          Duration
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {DURATIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onDurationChange?.(id)}
              className={cn(
                "px-2 py-2 rounded-lg text-xs font-semibold transition-all border",
                duration === id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface border-border hover:border-primary/50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stake Configuration */}
      <div className="p-4 border-b border-border">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 block">
          Stake Amount
        </Label>

        {/* Input with adjusters */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => handleStakeAdjustment(-1)}
            disabled={localStake <= 0 || isLoading}
            className="h-9 w-9 rounded-lg hover:bg-surface border border-border flex items-center justify-center disabled:opacity-50 transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>

          <div className="flex-1">
            <Input
              type="number"
              value={localStake}
              onChange={(e) => handleStakeChange(e.target.value)}
              className="text-center font-bold"
              placeholder="0.00"
              min="0"
              step="0.01"
              disabled={isLoading}
            />
          </div>

          <button
            onClick={() => handleStakeAdjustment(1)}
            disabled={isLoading}
            className="h-9 w-9 rounded-lg hover:bg-surface border border-border flex items-center justify-center disabled:opacity-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Preset buttons */}
        <div className="grid grid-cols-5 gap-1.5">
          {STAKE_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => handlePresetStake(preset)}
              disabled={isLoading}
              className={cn(
                "px-2 py-2 rounded-lg text-xs font-semibold transition-all border",
                localStake === preset
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface border-border hover:border-primary/50",
              )}
            >
              ${preset}
            </button>
          ))}
        </div>
      </div>

      {/* Payout Information Cards */}
      <div className="p-4 border-b border-border space-y-3">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
          Payout Information
        </Label>

        {/* If Win Card */}
        <Card className="bg-bull/10 border-bull/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-bull flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              If You Win
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Return:</span>
              <span className="font-bold text-sm text-bull">${potentialReturn}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Profit:</span>
              <span className="font-bold text-sm text-bull">+${potentialProfit}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-bull/20">
              <span className="text-xs text-muted-foreground">Payout:</span>
              <span className="font-bold text-sm text-bull">{payoutPercentage.toFixed(2)}%</span>
            </div>
          </CardContent>
        </Card>

        {/* If Lose Card */}
        <Card className="bg-bear/10 border-bear/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-bear flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              If You Lose
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Loss:</span>
              <span className="font-bold text-sm text-bear">-${localStake.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="p-4 space-y-2 mt-auto">
        <Button
          onClick={() => {
            setSelectedDirection("up");
            onBuy?.(localStake);
          }}
          disabled={isLoading || localStake === 0}
          className="w-full h-12 bg-bull hover:bg-bull/90 text-white font-bold text-base rounded-lg transition-all glow-bull flex items-center justify-center gap-2"
        >
          <TrendingUp className="h-5 w-5" />
          {tradeType === "over-under" ? "Over" : tradeType === "rise-fall" ? "Rise" : "Higher"}
        </Button>

        <Button
          onClick={() => {
            setSelectedDirection("down");
            onSell?.(localStake);
          }}
          disabled={isLoading || localStake === 0}
          className="w-full h-12 bg-bear hover:bg-bear/90 text-white font-bold text-base rounded-lg transition-all glow-bear flex items-center justify-center gap-2"
        >
          <TrendingDown className="h-5 w-5" />
          {tradeType === "over-under" ? "Under" : tradeType === "rise-fall" ? "Fall" : "Lower"}
        </Button>
      </div>

      {/* Info Footer */}
      <div className="px-4 py-2 text-xs text-muted-foreground text-center border-t border-border">
        Current Price: <span className="font-bold text-foreground">${currentPrice.toFixed(2)}</span>
      </div>
    </div>
  );
}
