import test from "node:test";
import assert from "node:assert/strict";
import { shouldControlledBinaryTradeWin } from "./controlled-binary-outcomes.ts";

test("controlled binary outcomes produce 8 wins and 2 losses per 10 trades", () => {
  const results = Array.from({ length: 10 }, (_, index) =>
    shouldControlledBinaryTradeWin("user-a", "demo", index),
  );

  assert.equal(results.filter(Boolean).length, 8);
  assert.equal(results.filter((won) => !won).length, 2);
});

test("controlled binary outcomes stay at 80 wins per 100 without a constant loss pattern", () => {
  const results = Array.from({ length: 100 }, (_, index) =>
    shouldControlledBinaryTradeWin("user-a", "demo", index),
  );
  const lossSlotsByBlock = Array.from({ length: 10 }, (_, block) =>
    results
      .slice(block * 10, block * 10 + 10)
      .map((won, slot) => (won ? null : slot))
      .filter((slot): slot is number => slot != null)
      .join(","),
  );

  assert.equal(results.filter(Boolean).length, 80);
  assert.ok(new Set(lossSlotsByBlock).size > 1);
});
