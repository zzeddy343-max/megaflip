import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Crosshair, Search } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { deepScanMarket } from "@/lib/scanner.functions";
import { toast } from "sonner";
import { logDebugEvent, serializeError } from "@/lib/debug-logger";

export const Route = createFileRoute("/_authenticated/scanner")({
  component: ScannerPage,
});

const CATEGORIES = ["Buy/Sell", "Even/Odd", "Matches/Differs", "Over/Under"] as const;
type Cat = (typeof CATEGORIES)[number];

function ScannerPage() {
  const [cat, setCat] = useState<Cat>("Buy/Sell");
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Awaited<
    ReturnType<ReturnType<typeof useServerFn<typeof deepScanMarket>>>
  > | null>(null);
  const scan = useServerFn(deepScanMarket);
  const navigate = useNavigate();

  async function runScan() {
    logDebugEvent("info", "scanner", "AI scanner started", { category: cat });
    setScanning(true);
    setResult(null);
    setProgress(0);
    const tick = setInterval(() => setProgress((p) => Math.min(11, p + 1)), 250);
    try {
      const out = await scan({ data: { category: cat } });
      logDebugEvent("info", "scanner", "AI scanner completed", out);
      clearInterval(tick);
      setProgress(12);
      setResult(out);
    } catch (e) {
      logDebugEvent("error", "scanner", "AI scanner failed", serializeError(e));
      clearInterval(tick);
      setProgress(0);
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function loadBot() {
    if (!result) {
      toast.error("Run a scan first");
      return;
    }
    window.sessionStorage.setItem(
      "megaflip-scanner-bot",
      JSON.stringify({
        category: cat,
        market: result.bestMarket,
        direction: result.bias,
        bias: result.bias,
        edge: result.edge,
        autotrade: true,
      }),
    );
    toast.success("Scanner bot loaded and auto trade armed");
    navigate({ to: "/binary" });
  }

  return (
    <div className="w-full h-full overflow-y-auto space-y-4 p-4">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary grid place-items-center glow-primary border border-primary/40">
          <Crosshair className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-bold text-xl">AI Market Scanner</h1>
          <p className="text-xs text-muted-foreground">
            Deep scan for the best market — picked for you.
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
        AI-powered market finder: deep-scans volatility indices for the strongest trade setup in
        your chosen category. Signals only — not financial advice.
      </div>

      <div>
        <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">
          Market category
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value as Cat)}
          className="w-full bg-card border border-border rounded-xl px-4 py-3 font-bold outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c} className="bg-card">
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {scanning
            ? `Scanning 12 indices for the best ${cat} setup…`
            : result
              ? "Scan complete"
              : "Ready to scan"}
        </span>
        <span className="font-bold tabular-nums">{progress}/12</span>
      </div>
      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all"
          style={{ width: `${(progress / 12) * 100}%` }}
        />
      </div>

      <button
        onClick={runScan}
        disabled={scanning}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary/80 to-primary-glow/60 text-primary-foreground font-bold flex items-center justify-center gap-2 glow-primary disabled:opacity-60"
      >
        <Search className="h-4 w-4" /> {scanning ? "Scanning…" : "Deep scan for best market"}
      </button>
      <button
        onClick={loadBot}
        disabled={!result || scanning}
        className="w-full py-3 rounded-xl border border-primary text-primary font-bold disabled:opacity-50"
      >
        Load and start auto bot
      </button>

      {result && (
        <div className="bg-card border border-primary/40 rounded-2xl p-4 space-y-3 glow-primary">
          <div className="text-[10px] uppercase tracking-wider font-bold text-primary">
            Best market to trade
          </div>
          <div>
            <h2 className="font-extrabold text-xl">{result.bestMarket}</h2>
            <div className="text-sm text-muted-foreground">
              {cat} · {result.recommendation}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-bull font-semibold">
              Buy {result.buyCount} · Sell {result.sellCount} · edge {result.edge}
            </span>
            <span className="text-xs text-muted-foreground">
              bias <span className="font-bold text-foreground">{result.bias}</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{result.rationale}</p>
          <button
            onClick={loadBot}
            className="w-full py-3 rounded-xl bg-bull/15 border border-bull text-bull font-bold"
          >
            Apply and start auto bot
          </button>
        </div>
      )}
    </div>
  );
}
