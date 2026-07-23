export function isTradeStatusCompletedEnumError(message: string) {
  return /invalid input value/i.test(message) && /trade_status/i.test(message) && /completed/i.test(message);
}
