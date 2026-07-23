import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTickCount, resolveContractOutcome } from "./binary-simulation.js";

test("normalizeTickCount clamps values to the supported range", () => {
  assert.equal(normalizeTickCount(1), 1);
  assert.equal(normalizeTickCount(4), 4);
  assert.equal(normalizeTickCount(8), 5);
  assert.equal(normalizeTickCount(0), 1);
});

test("resolveContractOutcome uses the settlement tick price for buy/sell contracts", () => {
  const won = resolveContractOutcome({
    type: "Buy/Sell",
    direction: "BUY",
    entryPrice: 1000,
    settlementPrice: 1004,
  });

  assert.equal(won, true);
});
