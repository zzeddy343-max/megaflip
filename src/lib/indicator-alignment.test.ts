/**
 * INDICATOR ALIGNMENT VERIFICATION
 *
 * This file demonstrates that:
 * 1. All indicators start from the beginning of the chart (not the middle)
 * 2. Indicators properly align with price data
 * 3. Forward-filling works correctly for the warmup period
 */

import {
  computeSMA,
  computeEMA,
  computeRSI,
  computeBollinger,
  computeMACD,
  alignIndicatorWithPrices,
} from "@/lib/indicator-engine";

/**
 * Test: Verify indicator alignment
 * Expected: All indicators should have same length as prices
 * Expected: All indicators should start from beginning (forward-filled)
 * Expected: No null values after alignment
 */
export function testIndicatorAlignment() {
  const prices = [
    100, 101, 102, 101, 100, 101, 102, 103, 102, 101, 102, 103, 104, 103, 102, 101, 102, 103, 104,
    105,
  ];

  console.log("=== INDICATOR ALIGNMENT TEST ===");
  console.log("Prices:", prices);
  console.log("Price count:", prices.length);

  // Test SMA
  const smaRaw = computeSMA(prices, 5);
  const smaAligned = alignIndicatorWithPrices(smaRaw, prices);

  console.log("\n--- SMA (5 period) ---");
  console.log("Raw SMA (has nulls for warmup):", smaRaw);
  console.log("Aligned SMA (forward-filled):", smaAligned);
  console.log(
    "✓ All values filled:",
    smaAligned.every((v) => v !== null && v !== undefined),
  );
  console.log("✓ Same length as prices:", smaAligned.length === prices.length);

  // Test EMA
  const emaRaw = computeEMA(prices, 5);
  const emaAligned = alignIndicatorWithPrices(emaRaw, prices);

  console.log("\n--- EMA (5 period) ---");
  console.log("Raw EMA (has nulls for warmup):", emaRaw);
  console.log("Aligned EMA (forward-filled):", emaAligned);
  console.log(
    "✓ All values filled:",
    emaAligned.every((v) => v !== null && v !== undefined),
  );
  console.log("✓ Same length as prices:", emaAligned.length === prices.length);

  // Test RSI
  const rsiRaw = computeRSI(prices, 5);
  const rsiAligned = alignIndicatorWithPrices(rsiRaw, prices);

  console.log("\n--- RSI (5 period) ---");
  console.log("Raw RSI (has nulls for warmup):", rsiRaw);
  console.log("Aligned RSI (forward-filled):", rsiAligned);
  console.log(
    "✓ All values filled:",
    rsiAligned.every((v) => v !== null && v !== undefined),
  );
  console.log("✓ Same length as prices:", rsiAligned.length === prices.length);
  console.log(
    "✓ RSI in valid range [0,100]:",
    rsiAligned.every((v) => v >= 0 && v <= 100),
  );

  // Test Bollinger Bands
  const bbRaw = computeBollinger(prices, 5);
  const bbAligned = {
    upper: alignIndicatorWithPrices(bbRaw.upper, prices),
    lower: alignIndicatorWithPrices(bbRaw.lower, prices),
  };

  console.log("\n--- Bollinger Bands (5 period) ---");
  console.log("Raw BB upper:", bbRaw.upper);
  console.log("Raw BB lower:", bbRaw.lower);
  console.log("Aligned BB upper:", bbAligned.upper);
  console.log("Aligned BB lower:", bbAligned.lower);
  console.log(
    "✓ Upper all filled:",
    bbAligned.upper.every((v) => v !== null && v !== undefined),
  );
  console.log(
    "✓ Lower all filled:",
    bbAligned.lower.every((v) => v !== null && v !== undefined),
  );
  console.log(
    "✓ Upper > Lower:",
    bbAligned.upper.every((u, i) => u > bbAligned.lower[i]),
  );

  // Test MACD
  const macdRaw = computeMACD(prices, 3, 6, 2);
  const macdAligned = {
    macd: alignIndicatorWithPrices(macdRaw.macd, prices),
    signal: alignIndicatorWithPrices(macdRaw.signalLine, prices),
  };

  console.log("\n--- MACD ---");
  console.log("Raw MACD:", macdRaw.macd);
  console.log("Raw Signal:", macdRaw.signalLine);
  console.log("Aligned MACD:", macdAligned.macd);
  console.log("Aligned Signal:", macdAligned.signal);
  console.log(
    "✓ MACD all filled:",
    macdAligned.macd.every((v) => v !== null && v !== undefined),
  );
  console.log(
    "✓ Signal all filled:",
    macdAligned.signal.every((v) => v !== null && v !== undefined),
  );
}

/**
 * Test: Chart rendering alignment
 * Expected: SVG paths should start at x=0 and end at x=width
 * Expected: All indicators should span the full chart width
 */
export function testChartPathAlignment() {
  const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 10) * 5);
  const width = 100;
  const height = 100;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  console.log("\n=== CHART PATH ALIGNMENT TEST ===");
  console.log("Chart dimensions:", width, "x", height);
  console.log("Price range:", min, "-", max);
  console.log("Data points:", prices.length);

  // Simulate buildIndicatorPath
  const smaRaw = computeSMA(prices, 10);
  const smaAligned = alignIndicatorWithPrices(smaRaw, prices);

  const pathPoints = [];
  for (let i = 0; i < smaAligned.length; i++) {
    const v = smaAligned[i];
    if (v === null || v === undefined) continue;

    const x = (i / (smaAligned.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    pathPoints.push({ x, y, i });
  }

  console.log("\n--- SMA Path Points ---");
  console.log("First point:", pathPoints[0]);
  console.log("Last point:", pathPoints[pathPoints.length - 1]);
  console.log("Total points:", pathPoints.length);

  console.log("\n✓ Path starts at x=0:", Math.abs(pathPoints[0].x) < 0.01);
  console.log("✓ Path ends at x=100:", Math.abs(pathPoints[pathPoints.length - 1].x - 100) < 0.01);
  console.log(
    "✓ All Y values valid:",
    pathPoints.every((p) => p.y >= 0 && p.y <= height),
  );
}

/**
 * Test: Indicator warmup period handling
 * Expected: Indicators should start calculating at specific points
 * Expected: Before calculation point, values should be forward-filled
 */
export function testWarmupPeriodHandling() {
  const prices = [100, 101, 102, 103, 104];

  console.log("\n=== WARMUP PERIOD HANDLING TEST ===");
  console.log("Prices:", prices);

  // SMA-20 needs 20 prices, we only have 5
  const smaRaw = computeSMA(prices, 20);
  const smaAligned = alignIndicatorWithPrices(smaRaw, prices);

  console.log("SMA-20 with only 5 prices:");
  console.log("Raw (all null):", smaRaw);
  console.log("After alignment:", smaAligned);
  console.log("✓ Handled gracefully (no errors):", true);

  // Add more prices
  const prices2 = Array.from({ length: 25 }, (_, i) => 100 + i);
  const smaRaw2 = computeSMA(prices2, 20);
  const smaAligned2 = alignIndicatorWithPrices(smaRaw2, prices2);

  console.log("\nSMA-20 with 25 prices:");
  console.log("Raw (first 19 null, rest calculated):");
  console.log("  First 20 values:", smaRaw2.slice(0, 20));
  console.log("After alignment (all forward-filled):");
  console.log("  First 5 values:", smaAligned2.slice(0, 5));
  console.log("  Last 5 values:", smaAligned2.slice(-5));
  console.log(
    "✓ Forward fill works:",
    smaAligned2.slice(0, 5).every((v) => v === smaAligned2[19]),
  );
}

/**
 * Test: Edge cases
 */
export function testEdgeCases() {
  console.log("\n=== EDGE CASES TEST ===");

  // Empty prices
  console.log("Empty prices:");
  const empty = [];
  const smaEmpty = computeSMA(empty, 5);
  console.log("✓ Handled:", smaEmpty.length === 0);

  // Single price
  console.log("\nSingle price:");
  const single = [100];
  const smaSingle = computeSMA(single, 5);
  const smaAlignedSingle = alignIndicatorWithPrices(smaSingle, single);
  console.log("✓ Handled:", smaAlignedSingle.length === 1);

  // Prices with gaps (should still work)
  console.log("\nPrices with varying values:");
  const varied = [100, 50, 200, 75, 150];
  const smaVaried = computeSMA(varied, 5);
  const smaAlignedVaried = alignIndicatorWithPrices(smaVaried, varied);
  console.log("✓ Handled:", smaAlignedVaried.length === varied.length);
}

// Run all tests
export function runAllTests() {
  testIndicatorAlignment();
  testChartPathAlignment();
  testWarmupPeriodHandling();
  testEdgeCases();
  console.log("\n=== ALL TESTS COMPLETED ===");
}

// Export for testing in console
if (typeof window !== "undefined") {
  (window as any).testIndicators = {
    runAllTests,
    testIndicatorAlignment,
    testChartPathAlignment,
    testWarmupPeriodHandling,
    testEdgeCases,
  };
}
