/** 固定汇率表（Phase 1）；后续可接实时汇率服务 */

const RATES_TO_CNY: Record<string, number> = {
  CNY: 1,
  ISK: 0.052,
  USD: 7.25,
  EUR: 7.85,
  GBP: 9.15,
  JPY: 0.048,
};

export function resolveExchangeRateToCny(currency: string): number {
  const key = currency.trim().toUpperCase();
  return RATES_TO_CNY[key] ?? 1;
}

export function convertToCny(amountLocal: number, currencyLocal: string): {
  amountCny: number;
  exchangeRate: number;
} {
  const exchangeRate = resolveExchangeRateToCny(currencyLocal);
  const amountCny = Math.round(amountLocal * exchangeRate * 100) / 100;
  return { amountCny, exchangeRate };
}
