# Trading UI Components - Professional Three-Column Layout

## Overview

This is a complete, production-ready trading user interface implementation based on professional platforms like Deriv Trader and Megaflip. The architecture follows a fixed three-column layout optimized for active trading workflows.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              TradeHeader (Top Nav Bar)                │
├──────────┬──────────────────────────┬────────────────┤
│          │                          │                │
│ Chart    │   CENTER MAIN CHART      │ Execution      │
│ Toolbar  │   (65-70% width)         │ Panel          │
│ • Types  │                          │ (25-30% width) │
│ • Time   │  • Live Price Chart      │                │
│ • Inds   │  • Responsive Canvas     │ • Trade Type   │
│ • Tools  │  • Smooth Animations     │ • Duration     │
│          │                          │ • Stake        │
│          ├──────────────────────────│ • Payouts      │
│          │  TickStatistics Widget   │ • Actions      │
│          │  • Last Digit Freq (0-9) │                │
│          │  • Visual Bars/Badges    │                │
│          │  • % Distribution        │                │
└──────────┴──────────────────────────┴────────────────┘
```

## Components

### 1. TradingLayout

**Main container component** that orchestrates all sub-components.

```tsx
import { TradingLayout } from "@/components/modules";

<TradingLayout
  chart={<YourChartComponent />}
  assetSymbol="Vol 75"
  currentPrice={9554.32}
  priceChange={0.14}
  accountBalance={5000.0}
  chartType="area"
  onChartTypeChange={setChartType}
  // ... other props
/>;
```

**Key Props:**

- `chart` (ReactNode) - Your main chart component
- `assetSymbol` (string) - Display name of active asset
- `currentPrice` (number) - Current market price
- `priceChange` (number) - Price change amount
- `accountBalance` (number) - User's account balance
- All configuration handlers for chart, trade, and execution settings

### 2. TradeHeader

**Top navigation bar** with logo, asset selector, price display, and account controls.

**Features:**

- Logo + branding on left
- Asset selector dropdown in center
- Real-time price display with percentage change
- Account balance with gold highlight
- Theme toggle (light/dark)
- User profile menu with account type

**Customization:**

```tsx
import { TradeHeader } from "@/components/modules";

<TradeHeader
  assetSymbol="EUR/USD"
  currentPrice={1.0856}
  priceChange={0.0012}
  accountBalance={10000.0}
/>;
```

### 3. ChartToolbar

**Left vertical sidebar** with chart type selection, timeframe options, indicators menu, and drawing tools.

**Features:**

- Chart type selector (Area, Candlestick, Hollow, OHLC)
- Time interval dropdown (1 Tick to 1 Day)
- Indicators menu with checkboxes
- Drawing tools menu
- Grid toggle
- Icon-based minimalist design
- Tooltips on hover

**Indicators Available:**

- Trend: SMA, EMA
- Momentum: MACD, RSI, Stochastic
- Volatility: Bollinger Bands

**Example Usage:**

```tsx
const [indicators, setIndicators] = useState<string[]>([]);
const [chartType, setChartType] = useState<ChartType>("area");

<ChartToolbar
  chartType={chartType}
  onChartTypeChange={setChartType}
  timeInterval="1tick"
  onTimeIntervalChange={handleTimeChange}
  indicators={indicators}
  onIndicatorToggle={handleIndicatorToggle}
/>;
```

### 4. TickStatistics

**Bottom widget** displaying last digit frequency statistics from recent price data.

**Features:**

- Visual bar chart for each digit (0-9)
- Frequency percentages
- Circular digit badges
- Highest frequency highlight
- Configurable display mode (percentage/count)
- Color-coded (primary = highest, muted = others)

**Data Format:**

```tsx
interface Tick {
  close: number;
  timestamp: number;
}

const ticks = [
  { close: 9554.32, timestamp: 1625097600 },
  { close: 9554.45, timestamp: 1625097601 },
  // ...
];
```

**Usage:**

```tsx
<TickStatistics ticks={ticks} displayMode="percentage" className="h-32" />
```

### 5. ExecutionPanel

**Right sidebar** for trade execution with type selection, duration, stake control, payout information, and action buttons.

**Features:**

- Trade type tabs (Over/Under, Rise/Fall, Higher/Lower)
- Duration selector (6 preset options)
- Stake amount input with +/- adjusters
- 5 quick preset stake buttons ($1, $5, $10, $50, $100)
- Dynamic payout cards (Win/Lose scenarios)
- Large action buttons with icons
- Current price display at bottom

**Payout Calculation:**

```tsx
const potentialReturn = stake * (1 + payoutPercentage / 100);
const potentialProfit = potentialReturn - stake;
```

**Usage:**

```tsx
<ExecutionPanel
  currentPrice={9554.32}
  tradeType="over-under"
  onTradeTypeChange={setTradeType}
  duration="1tick"
  onDurationChange={setDuration}
  stake={10}
  onStakeChange={setStake}
  payoutPercentage={138.1}
  onBuy={handleBuy}
  onSell={handleSell}
/>
```

## Integration Example: Complete Trading Page

```tsx
import { useState, useEffect, useRef } from "react";
import { TradingLayout } from "@/components/modules";
import { TickBasedLiveChart } from "@/components/TickBasedLiveChart";

export function BinaryTradingPage() {
  const [chartType, setChartType] = useState("area");
  const [timeInterval, setTimeInterval] = useState("1tick");
  const [indicators, setIndicators] = useState<string[]>([]);
  const [tradeType, setTradeType] = useState("over-under");
  const [duration, setDuration] = useState("1tick");
  const [stake, setStake] = useState(10);
  const [currentPrice, setCurrentPrice] = useState(9554.32);
  const [ticks, setTicks] = useState([]);

  // Simulate or fetch real price data
  const getNextPrice = () => {
    const randomChange = (Math.random() - 0.5) * 20;
    return currentPrice + randomChange;
  };

  // Price update effect
  useEffect(() => {
    const interval = setInterval(() => {
      const newPrice = getNextPrice();
      setCurrentPrice(newPrice);
      setTicks((prev) => [...prev, { close: newPrice, timestamp: Date.now() }].slice(-50));
    }, 500);

    return () => clearInterval(interval);
  }, []);

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
      accountBalance={5000.0}
      chartType={chartType}
      onChartTypeChange={setChartType}
      timeInterval={timeInterval}
      onTimeIntervalChange={setTimeInterval}
      indicators={indicators}
      onIndicatorToggle={(id) =>
        setIndicators((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
      }
      tradeType={tradeType}
      onTradeTypeChange={setTradeType}
      duration={duration}
      onDurationChange={setDuration}
      stake={stake}
      onStakeChange={setStake}
      payoutPercentage={138.1}
      ticks={ticks}
      onBuy={async (amount) => console.log("Buy", amount)}
      onSell={async (amount) => console.log("Sell", amount)}
    />
  );
}
```

## Design Specifications

### Color Scheme

- **Background**: Dark theme (`#000000` or `#0a0a0a`)
- **Surface**: Elevated surfaces (`#1a1a1a`)
- **Primary**: Brand color (typically gold/primary accent)
- **Bull**: Uptrend/Win (typically `#10b981` - emerald)
- **Bear**: Downtrend/Lose (typically `#ef4444` - red)
- **Text**: Foreground light, muted secondary text

### Layout Dimensions

- **Header Height**: 64px (4rem)
- **Left Sidebar Width**: 64px (fixed, icon-only)
- **Right Panel Width**: 320px (fixed)
- **Center Chart Area**: `calc(100vw - 64px - 320px)` (flexible)
- **Chart/Stats Split**: 70% chart, 30% statistics

### Responsive Behavior

- **Desktop (1200px+)**: Full three-column layout
- **Tablet (768px-1199px)**: Simplified with collapsible panels
- **Mobile (<768px)**: Not recommended for trading; consider mobile-specific app

### Typography

- **Headers**: Bold, tracking-wide
- **Labels**: Small caps, uppercase
- **Values**: Monospace for numbers (prices, amounts)
- **Buttons**: Bold, with glowing effects on hover

## Styling & Customization

All components use **Tailwind CSS** for styling and are compatible with your existing theme system.

### Dark Mode

Components automatically respect the theme context:

```tsx
import { applyTheme } from "@/lib/theme";

// In your component
applyTheme("dark"); // or "light"
```

### Custom Colors

Override Tailwind config in `tailwind.config.ts`:

```js
theme: {
  extend: {
    colors: {
      gold: "#FFD700",
      bull: "#10b981",
      bear: "#ef4444",
    }
  }
}
```

### Spacing & Layout

Adjust container dimensions in `TradingLayout`:

```tsx
// Modify sidebar widths or header height
<div className="ml-16 mr-80"> {/* Adjust ml/mr values */}
```

## State Management Patterns

### Option 1: Local Component State (Simple)

```tsx
const [chartType, setChartType] = useState("area");
```

### Option 2: Zustand Store (Recommended for Complex)

```tsx
import create from "zustand";

const useTradeStore = create((set) => ({
  chartType: "area",
  setChartType: (type) => set({ chartType: type }),
}));
```

### Option 3: Redux Toolkit (Enterprise)

```tsx
import { useDispatch, useSelector } from "react-redux";
import { setChartType } from "@/store/trading.slice";
```

## API Integration

### Real Price Data

Replace the simulation in `TradingPageDemo`:

```tsx
// WebSocket approach
useEffect(() => {
  const ws = new WebSocket("wss://your-api.com/prices");
  ws.onmessage = (event) => {
    const { price } = JSON.parse(event.data);
    setCurrentPrice(price);
    setTicks((prev) => [...prev, { close: price, timestamp: Date.now() }]);
  };
  return () => ws.close();
}, []);
```

### Trade Execution

Implement in `onBuy` and `onSell` callbacks:

```tsx
const handleBuy = async (stakeAmount: number) => {
  const response = await fetch("/api/trades", {
    method: "POST",
    body: JSON.stringify({
      type: "buy",
      direction: tradeType === "over-under" ? "over" : "rise",
      stake: stakeAmount,
      duration,
      assetId: "vol_75",
    }),
  });
  const trade = await response.json();
  // Update open positions, balance, etc.
};
```

## Common Implementation Tasks

### Add Custom Indicator

1. Implement calculation in `lib/indicator-engine.ts`
2. Add to `INDICATORS` array in `ChartToolbar.tsx`
3. Handle in chart component

### Modify Payout Calculation

Edit `ExecutionPanel.tsx`:

```tsx
const potentialReturn = (localStake * (1 + payoutPercentage / 100)).toFixed(2);
// Customize calculation here
```

### Change Chart Color Scheme

Update chart in `TickBasedLiveChart.tsx` SVG styles or pass color props

### Add More Duration Options

Extend in `ExecutionPanel.tsx`:

```tsx
const DURATIONS = [
  // Add new durations
  { id: "30sec", label: "30 Sec" },
];
```

## Performance Considerations

1. **Chart Rendering**: Uses Canvas for efficiency, not DOM
2. **Price Updates**: Throttled to reasonable intervals (500ms)
3. **Statistics**: Memoized calculations for frequent rerenders
4. **Indicators**: O(1) updates on new tick rather than O(n) recalculation
5. **Component Splits**: Each panel isolated to prevent unnecessary rerenders

## Accessibility

- All buttons have `aria-label` attributes
- Keyboard navigation via Tab
- Tooltips for icon-only controls
- High contrast colors for readability
- Semantic HTML structure

## Browser Support

- Chrome/Chromium: Full support
- Firefox: Full support
- Safari: Full support (iOS 13+)
- Edge: Full support

## Troubleshooting

### Chart Not Updating

- Ensure `getNextPrice` callback is being called
- Check price data format: `{ close: number, timestamp: number }`
- Verify chart component is receiving new props

### Buttons Not Clickable

- Check for overlapping absolutely-positioned elements
- Verify `isLoading` state is properly managed
- Check z-index values in CSS

### Statistics Not Displaying

- Ensure `ticks` array has sufficient data (at least 10)
- Verify tick format matches expected structure
- Check TickStatistics component isn't hidden behind another element

## Future Enhancements

- [ ] Multi-chart layouts (side-by-side comparison)
- [ ] Customizable button layouts
- [ ] Volume profile integrations
- [ ] Order history panel
- [ ] Market depth visualization
- [ ] Advanced drawing tools
- [ ] Custom indicators builder
- [ ] Mobile-responsive version
- [ ] Dark/light theme presets
- [ ] Keyboard shortcuts system

## Support & Questions

For integration help or custom modifications, refer to the component prop interfaces or contact the development team.
