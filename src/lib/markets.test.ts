import test from "node:test";
import assert from "node:assert/strict";
import { payoutMultiplier, profitToPayoutMultiplier } from "./markets.ts";

test("profit-only payout rates include the returned stake", () => {
  assert.equal(profitToPayoutMultiplier(0.24), 1.24);
  assert.equal(payoutMultiplier("over_under", "over", 2), 1.24);
  assert.equal(payoutMultiplier("matches_differs", "differs", 7), 1.14);
});

test("fixed binary payout multiplier already represents total returned value", () => {
  assert.equal(payoutMultiplier("rise_fall", "rise"), 1.72);
  assert.equal(payoutMultiplier("even_odd", "even"), 1.72);
});
