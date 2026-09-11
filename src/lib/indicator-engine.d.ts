/**
 * Type declarations for indicator-engine.js
 * Provides TypeScript support for indicator calculations
 */

export declare function computeSMA(values: number[], period?: number): (number | null)[];
export declare function computeEMA(values: number[], period?: number): (number | null)[];
export declare function computeBollinger(
  values: number[],
  period?: number,
  multiplier?: number,
): { middle: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] };
export declare function computeRSI(values: number[], period?: number): (number | null)[];
export declare function computeMACD(
  values: number[],
  fast?: number,
  slow?: number,
  signal?: number,
): { macd: (number | null)[]; signalLine: (number | null)[] };
export declare function computeATR(values: number[], period?: number): (number | null)[];
export declare function computeVWAP(values: number[], period?: number): (number | null)[];
export declare function computeIndicatorSeries(
  values: number[],
  indicator: string,
): (number | null)[];
export declare function getIndicatorColor(indicator: string): string;
export declare function buildLinePath(
  values: (number | null)[],
  width: number,
  height: number,
  minValue: number,
  range: number,
): string;
export declare function buildBandPath(
  band: { upper: (number | null)[]; lower: (number | null)[] },
  width: number,
  height: number,
  minValue: number,
  range: number,
): string;
