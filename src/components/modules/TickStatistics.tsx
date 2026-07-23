import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface TickStatisticsProps {
  /** Array of the last N ticks/candles */
  ticks?: { close: number; timestamp: number }[];

  /** Class name for styling */
  className?: string;

  /** Show percentage or count */
  displayMode?: "percentage" | "count";
}

export function TickStatistics({
  ticks = [],
  className,
  displayMode = "percentage",
}: TickStatisticsProps) {
  // Calculate last digit statistics
  const stats = useMemo(() => {
    const digitCounts = new Map<number, number>();

    // Initialize digit counts 0-9
    for (let i = 0; i < 10; i++) {
      digitCounts.set(i, 0);
    }

    // Count occurrences of each last digit
    ticks.forEach(({ close }) => {
      const lastDigit = Math.floor(close % 10);
      digitCounts.set(lastDigit, (digitCounts.get(lastDigit) || 0) + 1);
    });

    const total = ticks.length || 1;
    const digits = Array.from(digitCounts.entries()).map(([digit, count]) => ({
      digit,
      count,
      percentage: ((count / total) * 100).toFixed(1),
    }));

    return digits;
  }, [ticks]);

  const maxCount = Math.max(...stats.map((s) => s.count), 1);

  return (
    <div
      className={cn(
        "w-full bg-surface/60 backdrop-blur border-t border-border px-4 py-3",
        className,
      )}
    >
      {/* Label */}
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Last Digit Statistics
        </h4>
        <span className="text-xs text-muted-foreground">
          {ticks.length} {ticks.length === 1 ? "tick" : "ticks"}
        </span>
      </div>

      {/* Digit Badges */}
      <div className="flex items-end justify-start gap-1.5 h-24">
        {stats.map(({ digit, count, percentage }) => {
          const heightPercent = (count / maxCount) * 100;
          const isHighest = count === maxCount && count > 0;

          return (
            <div key={digit} className="flex flex-col items-center gap-1.5 flex-1 group">
              {/* Bar Chart */}
              <div className="relative w-full h-16 flex items-end justify-center">
                <div
                  className={cn(
                    "w-full rounded-t transition-all duration-300 group-hover:opacity-80",
                    isHighest ? "bg-primary shadow-lg shadow-primary/50" : "bg-primary/40",
                  )}
                  style={{
                    height: `${Math.max(heightPercent, 5)}%`,
                  }}
                />
              </div>

              {/* Digit Badge */}
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border transition-all",
                  isHighest
                    ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30"
                    : "bg-surface border-border text-foreground",
                )}
              >
                {digit}
              </div>

              {/* Value Text */}
              <div className="text-center min-h-[1.25rem]">
                <div className="text-xs font-semibold text-foreground">
                  {displayMode === "percentage" ? `${percentage}%` : count}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend/Info */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Most frequent: <span className="font-bold text-foreground">{stats[0]?.digit || 0}</span>
        </span>
        <span>
          Highest frequency:{" "}
          <span className="font-bold text-primary">
            {stats.length > 0 ? Math.max(...stats.map((s) => parseFloat(s.percentage))) : 0}%
          </span>
        </span>
      </div>
    </div>
  );
}
