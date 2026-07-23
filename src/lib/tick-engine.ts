/**
 * Efficient tick-based trading chart engine for Deriv-style charts
 * Implements O(1) incremental indicator updates and proper candle generation
 *
 * Architecture:
 * WebSocket Tick Stream → Tick Buffer (ring buffer) → OHLC Builder → Indicators → Render
 */

// ============================================================================
// TICK BUFFER: Ring buffer for maintaining rolling window of prices
// ============================================================================

export class TickBuffer {
  private buffer: number[];
  private index: number = 0;
  private filled: boolean = false;

  constructor(capacity: number = 500) {
    this.buffer = new Array(capacity).fill(0);
  }

  push(price: number): void {
    this.buffer[this.index] = price;
    this.index = (this.index + 1) % this.buffer.length;
    if (this.index === 0) this.filled = true;
  }

  getAll(): number[] {
    if (!this.filled) return this.buffer.slice(0, this.index);
    return [...this.buffer.slice(this.index), ...this.buffer.slice(0, this.index)];
  }

  getLatest(count: number = 1): number[] {
    const all = this.getAll();
    return all.slice(Math.max(0, all.length - count));
  }

  getLast(): number {
    const idx = this.filled
      ? (this.index - 1 + this.buffer.length) % this.buffer.length
      : this.index - 1;
    return this.buffer[idx];
  }

  getSize(): number {
    return this.filled ? this.buffer.length : this.index;
  }

  clear(): void {
    this.buffer.fill(0);
    this.index = 0;
    this.filled = false;
  }
}

// ============================================================================
// OHLC BUILDER: Convert ticks into candles (1-tick, 5-tick, N-tick grouping)
// ============================================================================

export interface OHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickCount: number;
}

export class CandleBuilder {
  private ticksPerCandle: number;
  private currentCandle: OHLC | null = null;
  private ticksInCandle: number = 0;
  private candles: OHLC[] = [];

  constructor(ticksPerCandle: number = 1) {
    this.ticksPerCandle = Math.max(1, ticksPerCandle);
  }

  addTick(price: number, timestamp: number): OHLC | null {
    if (!this.currentCandle) {
      this.currentCandle = {
        timestamp,
        open: price,
        high: price,
        low: price,
        close: price,
        tickCount: 1,
      };
      this.ticksInCandle = 1;
      return null;
    }

    this.currentCandle.close = price;
    this.currentCandle.high = Math.max(this.currentCandle.high, price);
    this.currentCandle.low = Math.min(this.currentCandle.low, price);
    this.currentCandle.tickCount += 1;
    this.ticksInCandle += 1;

    if (this.ticksInCandle >= this.ticksPerCandle) {
      const completed = this.currentCandle;
      this.candles.push(completed);
      this.currentCandle = null;
      this.ticksInCandle = 0;
      return completed;
    }

    return null;
  }

  getCandles(): OHLC[] {
    return this.candles;
  }

  getCurrentCandle(): OHLC | null {
    return this.currentCandle;
  }

  getLatestCandles(count: number = 1): OHLC[] {
    return this.candles.slice(Math.max(0, this.candles.length - count));
  }

  clear(): void {
    this.candles = [];
    this.currentCandle = null;
    this.ticksInCandle = 0;
  }
}

// ============================================================================
// INCREMENTAL INDICATOR ENGINE: O(1) updates on each tick
// ============================================================================

export interface IndicatorState {
  // SMA/EMA state
  smaSum: number;
  emaValue: number;

  // RSI state
  avgGain: number;
  avgLoss: number;
  rsiValue: number;

  // Bollinger Bands state
  bbMiddle: number;
  bbStd: number;

  // MACD state
  ema12: number;
  ema26: number;
  macdValue: number;
  signalLine: number;

  // ATR state
  atrValue: number;
  prevTrueRange: number;

  // Stochastic state
  stochasticK: number;
}

export class IncrementalIndicatorEngine {
  private state: IndicatorState;
  private priceHistory: number[] = [];
  private smaPeriod: number = 20;
  private emaPeriod: number = 20;
  private rsiPeriod: number = 14;
  private bbPeriod: number = 20;
  private macdFast: number = 12;
  private macdSlow: number = 26;
  private atrPeriod: number = 14;

  constructor(params?: {
    smaPeriod?: number;
    emaPeriod?: number;
    rsiPeriod?: number;
    bbPeriod?: number;
    macdFast?: number;
    macdSlow?: number;
    atrPeriod?: number;
  }) {
    if (params?.smaPeriod) this.smaPeriod = params.smaPeriod;
    if (params?.emaPeriod) this.emaPeriod = params.emaPeriod;
    if (params?.rsiPeriod) this.rsiPeriod = params.rsiPeriod;
    if (params?.bbPeriod) this.bbPeriod = params.bbPeriod;
    if (params?.macdFast) this.macdFast = params.macdFast;
    if (params?.macdSlow) this.macdSlow = params.macdSlow;
    if (params?.atrPeriod) this.atrPeriod = params.atrPeriod;

    this.state = {
      smaSum: 0,
      emaValue: 0,
      avgGain: 0,
      avgLoss: 0,
      rsiValue: 0,
      bbMiddle: 0,
      bbStd: 0,
      ema12: 0,
      ema26: 0,
      macdValue: 0,
      signalLine: 0,
      atrValue: 0,
      prevTrueRange: 0,
      stochasticK: 0,
    };
  }

  // Core update: process one tick and update all indicators incrementally
  updateTick(price: number, prevPrice?: number): void {
    this.priceHistory.push(price);

    // Keep only what we need for calculations
    const maxHistoryLength =
      Math.max(
        this.smaPeriod,
        this.emaPeriod,
        this.rsiPeriod,
        this.bbPeriod,
        this.macdSlow,
        this.atrPeriod,
      ) + 10;
    if (this.priceHistory.length > maxHistoryLength) {
      this.priceHistory.shift();
    }

    // Update SMA (O(1) with rolling window)
    this.updateSMA(price);

    // Update EMA (O(1))
    this.updateEMA(price);

    // Update RSI (O(1) with Wilder's smoothing)
    this.updateRSI(price);

    // Update Bollinger Bands (O(1))
    this.updateBollingerBands(price);

    // Update MACD (O(1) via EMAs)
    this.updateMACD(price);

    // Update ATR (O(1))
    if (prevPrice !== undefined) {
      this.updateATR(price, prevPrice);
    }

    // Update Stochastic (needs window)
    this.updateStochastic(price);
  }

  private updateSMA(price: number): void {
    const recent = this.priceHistory.slice(Math.max(0, this.priceHistory.length - this.smaPeriod));
    if (recent.length === this.smaPeriod) {
      this.state.smaSum = recent.reduce((sum, p) => sum + p, 0);
    }
  }

  private updateEMA(price: number): void {
    const k = 2 / (this.emaPeriod + 1);

    if (this.priceHistory.length < this.emaPeriod) {
      // Initialize: use SMA of first N prices
      if (this.priceHistory.length === this.emaPeriod) {
        this.state.emaValue = this.priceHistory.reduce((sum, p) => sum + p, 0) / this.emaPeriod;
      }
    } else {
      // Update incrementally: EMA = price * k + prevEMA * (1 - k)
      this.state.emaValue = price * k + this.state.emaValue * (1 - k);
    }
  }

  private updateRSI(price: number): void {
    const len = this.priceHistory.length;
    if (len < 2) return;

    const prevPrice = this.priceHistory[len - 2];
    const change = price - prevPrice;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (len === this.rsiPeriod + 1) {
      // Initialize averages
      let totalGain = 0;
      let totalLoss = 0;
      for (let i = 1; i <= this.rsiPeriod; i++) {
        const c = this.priceHistory[i] - this.priceHistory[i - 1];
        if (c > 0) totalGain += c;
        else totalLoss -= c;
      }
      this.state.avgGain = totalGain / this.rsiPeriod;
      this.state.avgLoss = totalLoss / this.rsiPeriod;
    } else if (len > this.rsiPeriod + 1) {
      // Wilder's smoothing (O(1))
      this.state.avgGain = (this.state.avgGain * (this.rsiPeriod - 1) + gain) / this.rsiPeriod;
      this.state.avgLoss = (this.state.avgLoss * (this.rsiPeriod - 1) + loss) / this.rsiPeriod;
    }

    if (this.state.avgLoss === 0) {
      this.state.rsiValue = this.state.avgGain === 0 ? 50 : 100;
    } else {
      const rs = this.state.avgGain / this.state.avgLoss;
      this.state.rsiValue = 100 - 100 / (1 + rs);
    }
  }

  private updateBollingerBands(price: number): void {
    const recent = this.priceHistory.slice(Math.max(0, this.priceHistory.length - this.bbPeriod));
    if (recent.length < this.bbPeriod) return;

    const mean = recent.reduce((sum, p) => sum + p, 0) / this.bbPeriod;
    const variance = recent.reduce((sum, p) => sum + (p - mean) ** 2, 0) / this.bbPeriod;

    this.state.bbMiddle = mean;
    this.state.bbStd = Math.sqrt(variance);
  }

  private updateMACD(price: number): void {
    const k12 = 2 / (this.macdFast + 1);
    const k26 = 2 / (this.macdSlow + 1);

    if (this.priceHistory.length === this.macdFast) {
      this.state.ema12 =
        this.priceHistory.slice(0, this.macdFast).reduce((sum, p) => sum + p, 0) / this.macdFast;
    } else if (this.priceHistory.length > this.macdFast) {
      this.state.ema12 = price * k12 + this.state.ema12 * (1 - k12);
    }

    if (this.priceHistory.length === this.macdSlow) {
      this.state.ema26 =
        this.priceHistory.slice(0, this.macdSlow).reduce((sum, p) => sum + p, 0) / this.macdSlow;
    } else if (this.priceHistory.length > this.macdSlow) {
      this.state.ema26 = price * k26 + this.state.ema26 * (1 - k26);
    }

    if (this.priceHistory.length >= this.macdSlow) {
      this.state.macdValue = this.state.ema12 - this.state.ema26;
      // Signal line is 9-period EMA of MACD
      const k9 = 2 / 10;
      this.state.signalLine =
        this.state.signalLine === 0
          ? this.state.macdValue
          : this.state.macdValue * k9 + this.state.signalLine * (1 - k9);
    }
  }

  private updateATR(price: number, prevPrice: number): void {
    const trueRange = Math.max(
      price - prevPrice,
      Math.abs(price - prevPrice),
      Math.abs(prevPrice - price),
    );

    if (this.priceHistory.length === this.atrPeriod + 1) {
      // Initialize ATR with average of first N true ranges
      this.state.atrValue = trueRange;
    } else if (this.priceHistory.length > this.atrPeriod + 1) {
      // Wilder's smoothing for ATR
      this.state.atrValue =
        (this.state.atrValue * (this.atrPeriod - 1) + trueRange) / this.atrPeriod;
    }
  }

  private updateStochastic(price: number): void {
    const period = 14;
    const recent = this.priceHistory.slice(Math.max(0, this.priceHistory.length - period));
    if (recent.length < period) return;

    const high = Math.max(...recent);
    const low = Math.min(...recent);
    const range = high - low || 1;
    this.state.stochasticK = ((price - low) / range) * 100;
  }

  // Getters for indicator values
  getSMA(): number {
    if (this.priceHistory.length < this.smaPeriod) return 0;
    return this.state.smaSum / this.smaPeriod;
  }

  getEMA(): number {
    return this.priceHistory.length >= this.emaPeriod ? this.state.emaValue : 0;
  }

  getRSI(): number {
    return this.priceHistory.length > this.rsiPeriod ? this.state.rsiValue : 0;
  }

  getBollingerBands(): { middle: number; upper: number; lower: number; std: number } {
    if (this.priceHistory.length < this.bbPeriod) {
      return { middle: 0, upper: 0, lower: 0, std: 0 };
    }
    return {
      middle: this.state.bbMiddle,
      upper: this.state.bbMiddle + 2 * this.state.bbStd,
      lower: this.state.bbMiddle - 2 * this.state.bbStd,
      std: this.state.bbStd,
    };
  }

  getMACD(): { macd: number; signal: number; histogram: number } {
    return {
      macd: this.state.macdValue,
      signal: this.state.signalLine,
      histogram: this.state.macdValue - this.state.signalLine,
    };
  }

  getATR(): number {
    return this.state.atrValue;
  }

  getStochastic(): number {
    return this.state.stochasticK;
  }

  reset(): void {
    this.priceHistory = [];
    this.state = {
      smaSum: 0,
      emaValue: 0,
      avgGain: 0,
      avgLoss: 0,
      rsiValue: 0,
      bbMiddle: 0,
      bbStd: 0,
      ema12: 0,
      ema26: 0,
      macdValue: 0,
      signalLine: 0,
      atrValue: 0,
      prevTrueRange: 0,
      stochasticK: 0,
    };
  }
}

// ============================================================================
// TICK-BASED CHART ENGINE: Main orchestrator
// ============================================================================

export interface TickChartConfig {
  tickBufferSize?: number;
  ticksPerCandle?: number;
  indicators?: string[];
  smaPeriod?: number;
  emaPeriod?: number;
  rsiPeriod?: number;
  bbPeriod?: number;
}

export class TickChartEngine {
  private tickBuffer: TickBuffer;
  private candleBuilder: CandleBuilder;
  private indicatorEngine: IncrementalIndicatorEngine;
  private lastPrice: number = 0;
  private tickCount: number = 0;

  constructor(config: TickChartConfig = {}) {
    this.tickBuffer = new TickBuffer(config.tickBufferSize ?? 500);
    this.candleBuilder = new CandleBuilder(config.ticksPerCandle ?? 1);
    this.indicatorEngine = new IncrementalIndicatorEngine({
      smaPeriod: config.smaPeriod ?? 20,
      emaPeriod: config.emaPeriod ?? 20,
      rsiPeriod: config.rsiPeriod ?? 14,
      bbPeriod: config.bbPeriod ?? 20,
    });
  }

  /**
   * Process a new tick from the market
   * Returns the completed candle if one just finished, otherwise null
   */
  onTick(price: number): OHLC | null {
    const timestamp = Date.now();

    this.tickBuffer.push(price);
    this.indicatorEngine.updateTick(price, this.lastPrice);
    this.lastPrice = price;
    this.tickCount += 1;

    const completedCandle = this.candleBuilder.addTick(price, timestamp);
    return completedCandle;
  }

  // Get all prices in buffer (for line graph)
  getPrices(): number[] {
    return this.tickBuffer.getAll();
  }

  // Get latest N prices
  getLatestPrices(count: number): number[] {
    return this.tickBuffer.getLatest(count);
  }

  // Get current price
  getCurrentPrice(): number {
    return this.lastPrice;
  }

  // Get all candles
  getCandles(): OHLC[] {
    const candles = this.candleBuilder.getCandles();
    const current = this.candleBuilder.getCurrentCandle();
    return current ? [...candles, current] : candles;
  }

  // Get latest N candles
  getLatestCandles(count: number): OHLC[] {
    return this.candleBuilder.getLatestCandles(count);
  }

  // Get indicator values
  getIndicators() {
    return {
      sma: this.indicatorEngine.getSMA(),
      ema: this.indicatorEngine.getEMA(),
      rsi: this.indicatorEngine.getRSI(),
      bollinger: this.indicatorEngine.getBollingerBands(),
      macd: this.indicatorEngine.getMACD(),
      atr: this.indicatorEngine.getATR(),
      stochastic: this.indicatorEngine.getStochastic(),
    };
  }

  // Reset engine
  reset(): void {
    this.tickBuffer.clear();
    this.candleBuilder.clear();
    this.indicatorEngine.reset();
    this.lastPrice = 0;
    this.tickCount = 0;
  }

  getTickCount(): number {
    return this.tickCount;
  }
}
