/**
 * COMPLETE EXAMPLE: Tick-Based Trading Chart System
 * 
 * This file demonstrates how to use all components of the tick-based charting system
 * for a Deriv-style trading platform.
 */

import React, { useState, useCallback } from 'react';
import { TickChartEngine, CandleBuilder } from '@/lib/tick-engine';
import { useTickChart, useSyntheticTicks } from '@/hooks/use-tick-chart';
import { TickBasedLiveChart } from '@/components/TickBasedLiveChart';
import { computeSMA, computeEMA, computeRSI } from '@/lib/indicator-engine';

// ============================================================================
// EXAMPLE 1: Basic Usage with Synthetic Data
// ============================================================================

export function BasicTickChartExample() {
  const getNextPrice = useSyntheticTicks({
    basePrice: 100.00,
    volatility: 0.001,
    enableMeanReversion: true,
    enableVolatilityClusters: true,
  });

  const {
    prices,
    candles,
    currentPrice,
    indicators,
    tickCount,
    isLoading,
  } = useTickChart({
    onTick: getNextPrice,
    tickIntervalMs: 500,
    ticksPerCandle: 1,
    smaPeriod: 20,
    emaPeriod: 20,
    rsiPeriod: 14,
    maxDisplayPoints: 500,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Basic Tick Chart</h2>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-surface rounded border border-border">
          <p className="text-sm text-muted-foreground">Current Price</p>
          <p className="text-2xl font-bold">{currentPrice.toFixed(2)}</p>
        </div>
        
        <div className="p-4 bg-surface rounded border border-border">
          <p className="text-sm text-muted-foreground">Total Ticks</p>
          <p className="text-2xl font-bold">{tickCount}</p>
        </div>

        <div className="p-4 bg-surface rounded border border-border">
          <p className="text-sm text-muted-foreground">SMA (20)</p>
          <p className="text-2xl font-bold">{indicators.sma.toFixed(2)}</p>
        </div>

        <div className="p-4 bg-surface rounded border border-border">
          <p className="text-sm text-muted-foreground">RSI (14)</p>
          <p className="text-2xl font-bold">{indicators.rsi.toFixed(1)}</p>
        </div>
      </div>

      <div className="h-64 bg-surface rounded border border-border p-4">
        <TickBasedLiveChart
          getNextPrice={getNextPrice}
          mode="line"
          indicators={['SMA', 'EMA', 'Bollinger']}
          ticksPerCandle={1}
          tickIntervalMs={500}
        />
      </div>
    </div>
  );
}

// ============================================================================
// EXAMPLE 2: Tick-Based Candles (Multi-Tick Grouping)
// ============================================================================

export function TickBasedCandlesExample() {
  const getNextPrice = useSyntheticTicks({
    basePrice: 1000.00,
    volatility: 0.0008,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">5-Tick Candles</h2>
      <p className="text-sm text-muted-foreground">
        Every 5 individual ticks creates one candle
      </p>

      <div className="h-64 bg-surface rounded border border-border p-4">
        <TickBasedLiveChart
          getNextPrice={getNextPrice}
          mode="candles"
          ticksPerCandle={5}  // ← Key: 5 ticks per candle
          tickIntervalMs={100} // Ticks arrive every 100ms
          indicators={['SMA', 'EMA']}
        />
      </div>
    </div>
  );
}

// ============================================================================
// EXAMPLE 3: Direct Engine Usage (Low-Level)
// ============================================================================

export function DirectEngineExample() {
  const [engineStats, setEngineStats] = useState({
    tickCount: 0,
    priceCount: 0,
    candleCount: 0,
    latestIndicators: null,
  });

  const [isRunning, setIsRunning] = useState(false);

  const startEngine = useCallback(() => {
    const engine = new TickChartEngine({
      tickBufferSize: 500,
      ticksPerCandle: 5,
      smaPeriod: 20,
      emaPeriod: 20,
      rsiPeriod: 14,
      bbPeriod: 20,
    });

    let tickCount = 0;
    let price = 100;
    let drift = 0;

    const interval = setInterval(() => {
      // Generate synthetic price
      drift = drift * 0.8 + (Math.random() - 0.5) * 0.1;
      price = Math.max(95, Math.min(105, price + drift + (100 - price) * 0.01));

      // Process tick through engine
      const completedCandle = engine.onTick(price);

      tickCount += 1;

      // Update UI stats
      setEngineStats({
        tickCount,
        priceCount: engine.getPrices().length,
        candleCount: engine.getCandles().length,
        latestIndicators: engine.getIndicators(),
      });

      // Stop after 200 ticks
      if (tickCount >= 200) {
        clearInterval(interval);
        setIsRunning(false);
      }
    }, 100);
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Direct Engine Usage</h2>

      <button
        onClick={startEngine}
        disabled={isRunning}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isRunning ? 'Running...' : 'Start Engine'}
      </button>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-surface rounded border border-border">
          <p className="text-sm text-muted-foreground">Ticks Processed</p>
          <p className="text-2xl font-bold">{engineStats.tickCount}</p>
        </div>

        <div className="p-4 bg-surface rounded border border-border">
          <p className="text-sm text-muted-foreground">Prices in Buffer</p>
          <p className="text-2xl font-bold">{engineStats.priceCount}</p>
        </div>

        <div className="p-4 bg-surface rounded border border-border">
          <p className="text-sm text-muted-foreground">Candles Created</p>
          <p className="text-2xl font-bold">{engineStats.candleCount}</p>
        </div>

        {engineStats.latestIndicators && (
          <div className="p-4 bg-surface rounded border border-border">
            <p className="text-sm text-muted-foreground">Current RSI</p>
            <p className="text-2xl font-bold">
              {engineStats.latestIndicators.rsi.toFixed(1)}
            </p>
          </div>
        )}
      </div>

      {engineStats.latestIndicators && (
        <div className="p-4 bg-surface rounded border border-border">
          <h3 className="font-bold mb-2">All Indicators</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">SMA:</p>
              <p className="font-mono">{engineStats.latestIndicators.sma.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">EMA:</p>
              <p className="font-mono">{engineStats.latestIndicators.ema.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">RSI:</p>
              <p className="font-mono">{engineStats.latestIndicators.rsi.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">ATR:</p>
              <p className="font-mono">{engineStats.latestIndicators.atr.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">MACD:</p>
              <p className="font-mono">{engineStats.latestIndicators.macd.macd.toFixed(5)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">BB Middle:</p>
              <p className="font-mono">{engineStats.latestIndicators.bollinger.middle.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EXAMPLE 4: Comparing Time-Based vs Tick-Based Indicators
// ============================================================================

export function IndicatorComparisonExample() {
  const [prices, setPrices] = useState<number[]>([]);

  // Simulate collecting prices
  React.useEffect(() => {
    let price = 100;
    const newPrices: number[] = [];

    for (let i = 0; i < 100; i++) {
      price += (Math.random() - 0.5) * 2;
      newPrices.push(price);
    }

    setPrices(newPrices);
  }, []);

  if (prices.length === 0) return <p>Loading...</p>;

  // Calculate indicators both ways
  const smaValues = computeSMA(prices, 20);
  const emaValues = computeEMA(prices, 20);
  const rsiValues = computeRSI(prices, 14);

  // Get latest values
  const lastPrice = prices[prices.length - 1];
  const lastSMA = smaValues[smaValues.length - 1];
  const lastEMA = emaValues[emaValues.length - 1];
  const lastRSI = rsiValues[rsiValues.length - 1];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Indicator Comparison</h2>
      <p className="text-sm text-muted-foreground">
        Shows how indicators work the same way whether data comes from ticks or time-based candles
      </p>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-surface rounded border border-border">
          <p className="text-sm text-muted-foreground">Current Price</p>
          <p className="text-2xl font-bold">{lastPrice.toFixed(2)}</p>
        </div>

        <div className="p-4 bg-surface rounded border border-border">
          <p className="text-sm text-muted-foreground">SMA (20)</p>
          <p className="text-2xl font-bold">{lastSMA?.toFixed(2) || '—'}</p>
        </div>

        <div className="p-4 bg-surface rounded border border-border">
          <p className="text-sm text-muted-foreground">EMA (20)</p>
          <p className="text-2xl font-bold">{lastEMA?.toFixed(2) || '—'}</p>
        </div>
      </div>

      <div className="p-4 bg-surface rounded border border-border">
        <h3 className="font-bold mb-3">RSI (14) Values Over Time</h3>
        <div className="space-y-2 text-sm font-mono">
          {rsiValues
            .slice(-10)
            .reverse()
            .map((rsi, idx) => (
              <div key={idx} className="flex justify-between">
                <span className="text-muted-foreground">
                  Point {prices.length - 10 + idx}:
                </span>
                <span>
                  {rsi !== null ? rsi.toFixed(1) : '—'}
                </span>
              </div>
            ))}
        </div>
      </div>

      <div className="p-4 bg-surface/50 rounded border border-border text-sm text-muted-foreground">
        <p className="font-semibold mb-2">Key Insight:</p>
        <p>
          These same indicators work identically whether the data comes from:
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Individual ticks (1-tick, 5-tick candles)</li>
            <li>Time-based candles (1 minute, 5 minute)</li>
            <li>Any series of prices</li>
          </ul>
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// EXAMPLE 5: Real-Time Signal Generation
// ============================================================================

export function SignalGenerationExample() {
  const [signals, setSignals] = useState<Array<{ time: string; type: string; price: number }>>([]);

  const getNextPrice = useSyntheticTicks({
    basePrice: 100.00,
    volatility: 0.0015,
  });

  const {
    prices,
    currentPrice,
    indicators,
  } = useTickChart({
    onTick: getNextPrice,
    tickIntervalMs: 300,
    ticksPerCandle: 1,
    smaPeriod: 20,
    emaPeriod: 20,
  });

  // Generate buy/sell signals based on crossovers
  React.useEffect(() => {
    if (prices.length < 2) return;

    const prevPrice = prices[prices.length - 2];
    const smaValue = indicators.sma;
    const emaValue = indicators.ema;

    // Golden cross (SMA crosses above EMA) = BUY
    if (prevPrice < smaValue && currentPrice >= smaValue && emaValue < smaValue) {
      setSignals(prev => [...prev.slice(-9), {
        time: new Date().toLocaleTimeString(),
        type: 'BUY (Golden Cross)',
        price: currentPrice,
      }]);
    }

    // Death cross (SMA crosses below EMA) = SELL
    if (prevPrice > smaValue && currentPrice <= smaValue && emaValue > smaValue) {
      setSignals(prev => [...prev.slice(-9), {
        time: new Date().toLocaleTimeString(),
        type: 'SELL (Death Cross)',
        price: currentPrice,
      }]);
    }
  }, [prices, currentPrice, indicators]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Real-Time Trading Signals</h2>

      <div className="h-64 bg-surface rounded border border-border p-4">
        <TickBasedLiveChart
          getNextPrice={getNextPrice}
          mode="line"
          indicators={['SMA', 'EMA']}
          ticksPerCandle={1}
          tickIntervalMs={300}
          badge={
            signals.length > 0 
              ? signals[signals.length - 1].type.split(' ')[0]
              : undefined
          }
          badgeTone={
            signals.length > 0
              ? signals[signals.length - 1].type.includes('BUY')
                ? 'bull'
                : 'bear'
              : 'neutral'
          }
        />
      </div>

      <div className="p-4 bg-surface rounded border border-border">
        <h3 className="font-bold mb-3">Recent Signals</h3>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Waiting for signals...</p>
          ) : (
            signals.map((signal, idx) => (
              <div key={idx} className="text-sm border-b border-border pb-2">
                <p className="font-semibold">{signal.type}</p>
                <p className="text-xs text-muted-foreground">
                  {signal.time} @ {signal.price.toFixed(2)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EXPORT ALL EXAMPLES
// ============================================================================

export const EXAMPLES = [
  {
    name: 'Basic Tick Chart',
    component: BasicTickChartExample,
    description: 'Simple line chart with synthetic prices and indicators',
  },
  {
    name: 'Tick-Based Candles',
    component: TickBasedCandlesExample,
    description: 'Candle charts created from tick grouping (5-tick candles)',
  },
  {
    name: 'Direct Engine Usage',
    component: DirectEngineExample,
    description: 'Low-level engine usage for custom implementations',
  },
  {
    name: 'Indicator Comparison',
    component: IndicatorComparisonExample,
    description: 'Shows how indicators work with any price series',
  },
  {
    name: 'Trading Signals',
    component: SignalGenerationExample,
    description: 'Real-time signal generation from indicator crossovers',
  },
];

// Main example showcase
export function TickChartExamplesShowcase() {
  const [selectedExample, setSelectedExample] = useState(0);
  const Example = EXAMPLES[selectedExample].component;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Tick-Based Trading Charts</h1>
        <p className="text-muted-foreground mb-8">
          Examples demonstrating the complete tick-based charting system for Megaflip
        </p>

        <div className="grid grid-cols-5 gap-2 mb-8">
          {EXAMPLES.map((ex, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedExample(idx)}
              className={`px-3 py-2 rounded text-sm font-medium transition ${
                selectedExample === idx
                  ? 'bg-blue-600 text-white'
                  : 'bg-surface text-muted-foreground hover:bg-surface/80 border border-border'
              }`}
            >
              {ex.name}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground">{EXAMPLES[selectedExample].description}</p>
        </div>

        <div className="bg-surface rounded border border-border p-6">
          <Example />
        </div>
      </div>
    </div>
  );
}
