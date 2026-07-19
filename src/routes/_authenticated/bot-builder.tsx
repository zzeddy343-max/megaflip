import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, Bolt, Sparkles, Settings, ArrowRight, Circle, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bot-builder")({
  component: BotBuilderPage,
});

const MARKETS = [
  "Vol 10",
  "Vol 25",
  "Vol 50",
  "Vol 75",
  "Vol 100",
  "Crash 500",
  "Boom 500",
];
const CONTRACT_TYPES = ["DIGIT_OVER", "DIGIT_UNDER", "EVEN", "ODD", "MATCHES", "DIFFERS"] as const;
const DEFAULT_BLOCKS = [
  "Start",
  "Choose Market",
  "If last digit > 6",
  "Buy DIGIT_OVER",
  "Take profit at $100",
  "Stop after 3 losses",
];

type ContractType = (typeof CONTRACT_TYPES)[number];

function BotBuilderPage() {
  const [botName, setBotName] = useState("Digit Over Strategy");
  const [description, setDescription] = useState("Buy Digit Over when the last digit is greater than 6.");
  const [market, setMarket] = useState(MARKETS[3]);
  const [contractType, setContractType] = useState<ContractType>("DIGIT_OVER");
  const [stake, setStake] = useState(5);
  const [currency, setCurrency] = useState("USD");
  const [takeProfit, setTakeProfit] = useState(100);
  const [stopLoss, setStopLoss] = useState(50);
  const [martingale, setMartingale] = useState(2);
  const [maxTrades, setMaxTrades] = useState(10);
  const [blocks, setBlocks] = useState<string[]>(DEFAULT_BLOCKS);
  const [status, setStatus] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const botConfig = useMemo(
    () => ({
      botName,
      description,
      market,
      stake,
      currency,
      contractType,
      takeProfit,
      stopLoss,
      martingale,
      maxTrades,
      blocks,
    }),
    [botName, description, market, stake, currency, contractType, takeProfit, stopLoss, martingale, maxTrades, blocks],
  );

  const addBlock = (label: string) => {
    setBlocks((current) => [...current, label]);
  };

  const toggleRun = () => {
    if (isRunning) {
      setIsRunning(false);
      setStatus("Bot stopped. Adjust settings or run again.");
      return;
    }
    setIsRunning(true);
    setStatus("Bot running in simulation mode. No real trades are placed.");
  };

  const runBacktest = () => {
    setStatus("Backtest complete: 65% win rate, 18 trades, 7% ROI.");
  };

  return (
    <div className="space-y-6 bg-slate-50 text-slate-900 min-h-screen p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3 rounded-3xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary shadow-sm">
            <Bot className="h-5 w-5" />
            Bot Builder
          </div>
          <h1 className="mt-3 text-2xl font-extrabold">Visual strategy builder for automated trades</h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Build a Deriv-style bot visually with market selection, strategy blocks, risk management and backtesting.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Current status</div>
            <div className="mt-3 text-sm font-semibold">{isRunning ? "Running" : "Stopped"}</div>
            <div className="mt-2 text-sm text-slate-500">{status ?? "Ready to configure your bot."}</div>
          </div>
          <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Market</div>
            <div className="mt-2 text-lg font-semibold">{market}</div>
          </div>
          <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Strategy</div>
            <div className="mt-2 text-lg font-semibold">{contractType.replace("DIGIT_", "")}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
        <section className="space-y-4 rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            <Sparkles className="h-4 w-4" />
            Toolbox
          </div>
          <div className="grid gap-2">
            {[
              "Start",
              "Market",
              "Condition",
              "Trade",
              "Risk",
              "Repeat",
              "Indicator",
            ].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => addBlock(label)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            <ArrowRight className="h-4 w-4" />
            Strategy canvas
          </div>
          <div className="min-h-[420px] rounded-3xl bg-slate-50 p-4">
            <div className="space-y-3">
              {blocks.map((block, index) => (
                <div key={`${block}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>{block}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.24em] text-primary">
                      {index + 1}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            <Settings className="h-4 w-4" />
            Bot settings
          </div>

          <div className="grid gap-3">
            <label className="space-y-1 text-sm font-medium">
              Bot name
              <input
                value={botName}
                onChange={(event) => setBotName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full min-h-[92px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Market
              <select
                value={market}
                onChange={(event) => setMarket(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              >
                {MARKETS.map((value) => (
                  <option key={value} value={value} className="bg-white text-slate-900">
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              Contract type
              <select
                value={contractType}
                onChange={(event) => setContractType(event.target.value as ContractType)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              >
                {CONTRACT_TYPES.map((value) => (
                  <option key={value} value={value} className="bg-white text-slate-900">
                    {value.replace("DIGIT_", "")}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                Stake
                <input
                  type="number"
                  min={1}
                  value={stake}
                  onChange={(event) => setStake(Number(event.target.value))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Currency
                <input
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                Take profit
                <input
                  type="number"
                  min={0}
                  value={takeProfit}
                  onChange={(event) => setTakeProfit(Number(event.target.value))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Stop loss
                <input
                  type="number"
                  min={0}
                  value={stopLoss}
                  onChange={(event) => setStopLoss(Number(event.target.value))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
              </label>
            </div>
            <label className="space-y-1 text-sm font-medium">
              Martingale multiplier
              <input
                type="number"
                min={1}
                value={martingale}
                onChange={(event) => setMartingale(Number(event.target.value))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Max trades
              <input
                type="number"
                min={1}
                value={maxTrades}
                onChange={(event) => setMaxTrades(Number(event.target.value))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </label>

            <div className="mt-4 grid gap-3">
              <button
                onClick={toggleRun}
                className="rounded-3xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                {isRunning ? "Stop Bot" : "Run Bot"}
              </button>
              <button
                onClick={runBacktest}
                className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Backtest Strategy
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          <Target className="h-4 w-4" />
          Saved bot configuration
        </div>
        <pre className="mt-3 overflow-x-auto rounded-3xl bg-slate-50 p-4 text-xs text-slate-600">
          {JSON.stringify(botConfig, null, 2)}
        </pre>
      </section>
    </div>
  );
}
