import test from "node:test";
import assert from "node:assert/strict";
import { detectFraudSignals } from "./trades.functions.ts";

test("does not flag ordinary market switching as arbitrage", () => {
  const recentTrades = [
    { market: "Vol 100", direction: "BUY", created_at: new Date().toISOString() },
    { market: "Vol 75", direction: "SELL", created_at: new Date().toISOString() },
    { market: "Vol 50", direction: "BUY", created_at: new Date().toISOString() },
  ];

  assert.deepEqual(detectFraudSignals(recentTrades, "bot,arbitrage"), []);
});

test("flags a clear rapid burst of alternating trades", () => {
  const now = new Date();
  const recentTrades = [
    { market: "Vol 100", direction: "BUY", created_at: now.toISOString() },
    { market: "Vol 75", direction: "SELL", created_at: now.toISOString() },
    { market: "Vol 50", direction: "BUY", created_at: now.toISOString() },
    { market: "Vol 25", direction: "SELL", created_at: now.toISOString() },
    { market: "Vol 10", direction: "BUY", created_at: now.toISOString() },
  ];

  assert.deepEqual(detectFraudSignals(recentTrades, "bot,arbitrage"), [
    "rapid trade burst",
    "arbitrage-like market switching",
  ]);
});
