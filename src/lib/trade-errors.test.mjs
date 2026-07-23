import test from "node:test";
import assert from "node:assert/strict";
import { isTradeStatusCompletedEnumError } from "./trade-errors.ts";

test("detects completed trade_status enum errors from rpc and fallback paths", () => {
  assert.equal(
    isTradeStatusCompletedEnumError('invalid input value for enum trade_status: "completed"'),
    true,
  );
  assert.equal(
    isTradeStatusCompletedEnumError(
      'Could not settle trade with fallback: invalid input value for enum trade_status: "completed"',
    ),
    true,
  );
  assert.equal(
    isTradeStatusCompletedEnumError("invalid input value for enum transaction_status: pending"),
    false,
  );
});
