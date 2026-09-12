import test from "node:test";
import assert from "node:assert/strict";
import {
  buildControlledBinaryExitPrice,
  shouldControlledBinaryTradeWin,
} from "./controlled-binary-outcomes.ts";

test("controlled binary outcomes use the configured win rate", () => {
  const results = Array.from({ length: 100 }, (_, index) =>
    shouldControlledBinaryTradeWin("user-a", "demo", index),
  );

  assert.equal(results.filter(Boolean).length, 80);
  assert.equal(results.filter((won) => !won).length, 20);
});

test("controlled binary outcomes support non-default win rates", () => {
  const results = Array.from({ length: 100 }, (_, index) =>
    shouldControlledBinaryTradeWin("user-a", "demo", index, 63),
  );

  assert.equal(results.filter(Boolean).length, 63);
});

test("controlled binary outcomes also apply to agent real-account trades", () => {
  const results = Array.from({ length: 100 }, (_, index) =>
    shouldControlledBinaryTradeWin("agent-a", "real", index),
  );

  assert.equal(results.filter(Boolean).length, 80);
  assert.equal(results.filter((won) => !won).length, 20);
});

test("controlled over/under settlements land on a digit that matches the chosen result", () => {
  const winPrice = buildControlledBinaryExitPrice({
    entryPrice: 1000,
    requestedExitPrice: 1000.1234,
    contractType: "over_under",
    direction: "over",
    digitTarget: 4,
    decimals: 4,
    shouldWin: true,
    seed: "over-win",
  });
  const lossPrice = buildControlledBinaryExitPrice({
    entryPrice: 1000,
    requestedExitPrice: 1000.1234,
    contractType: "over_under",
    direction: "over",
    digitTarget: 4,
    decimals: 4,
    shouldWin: false,
    seed: "over-loss",
  });

  assert.ok(lastDigit(winPrice, 4) > 4);
  assert.ok(lastDigit(lossPrice, 4) <= 4);
});

test("controlled digit contracts produce matching final digits for both sides", () => {
  const evenWin = buildControlledBinaryExitPrice({
    entryPrice: 1000,
    requestedExitPrice: 1000.1234,
    contractType: "even_odd",
    direction: "even",
    decimals: 4,
    shouldWin: true,
    seed: "even-win",
  });
  const matchesWin = buildControlledBinaryExitPrice({
    entryPrice: 1000,
    requestedExitPrice: 1000.1234,
    contractType: "matches_differs",
    direction: "matches",
    digitTarget: 7,
    decimals: 4,
    shouldWin: true,
    seed: "matches-win",
  });
  const differsLoss = buildControlledBinaryExitPrice({
    entryPrice: 1000,
    requestedExitPrice: 1000.1234,
    contractType: "matches_differs",
    direction: "differs",
    digitTarget: 7,
    decimals: 4,
    shouldWin: false,
    seed: "differs-loss",
  });

  assert.equal(lastDigit(evenWin, 4) % 2, 0);
  assert.equal(lastDigit(matchesWin, 4), 7);
  assert.equal(lastDigit(differsLoss, 4), 7);
});

test("controlled rise/fall settlements move to the correct side of entry", () => {
  const riseWin = buildControlledBinaryExitPrice({
    entryPrice: 1000,
    requestedExitPrice: 999,
    contractType: "rise_fall",
    direction: "rise",
    decimals: 4,
    shouldWin: true,
    seed: "rise-win",
  });
  const fallWin = buildControlledBinaryExitPrice({
    entryPrice: 1000,
    requestedExitPrice: 1001,
    contractType: "rise_fall",
    direction: "fall",
    decimals: 4,
    shouldWin: true,
    seed: "fall-win",
  });

  assert.ok(riseWin > 1000);
  assert.ok(fallWin < 1000);
});

function lastDigit(price: number, decimals: number) {
  return Math.abs(Math.round(price * 10 ** decimals)) % 10;
}
