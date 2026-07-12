import type { SymbolFilters } from '@daytrading/shared';
import { floorToStep } from '../binance/filters.js';

export interface PositionSizeInput {
  /** Quote currency amount to spend per trade (e.g. 25 USDT). */
  quoteAmount: number;
  /** Hard cap on position value in quote currency. */
  maxPositionSize: number;
  /** Current market price. */
  price: number;
  /** Available quote balance. */
  availableBalance: number;
  filters: SymbolFilters;
}

export type PositionSizeResult =
  { ok: true; quantity: number; notional: number } | { ok: false; reason: string };

/**
 * Compute a market-buy quantity from a quote amount, respecting:
 *  - available balance
 *  - max position size
 *  - LOT_SIZE step/min/max
 *  - MIN_NOTIONAL
 */
export function calculatePositionSize(input: PositionSizeInput): PositionSizeResult {
  const { quoteAmount, maxPositionSize, price, availableBalance, filters } = input;

  if (price <= 0 || !Number.isFinite(price)) {
    return { ok: false, reason: 'Invalid price' };
  }
  if (quoteAmount <= 0) {
    return { ok: false, reason: 'quote_amount must be positive' };
  }

  const spend = Math.min(quoteAmount, maxPositionSize, availableBalance);
  if (spend <= 0) {
    return { ok: false, reason: 'No available balance' };
  }

  const rawQty = spend / price;
  const quantity = floorToStep(rawQty, filters.stepSize);

  if (quantity < filters.minQty || quantity <= 0) {
    return { ok: false, reason: `Quantity ${quantity} below minQty ${filters.minQty}` };
  }
  if (filters.maxQty > 0 && quantity > filters.maxQty) {
    return { ok: false, reason: `Quantity ${quantity} above maxQty ${filters.maxQty}` };
  }

  const notional = quantity * price;
  if (notional < filters.minNotional) {
    return {
      ok: false,
      reason: `Notional ${notional.toFixed(8)} below minNotional ${filters.minNotional}`,
    };
  }
  if (notional > maxPositionSize) {
    return { ok: false, reason: `Notional ${notional.toFixed(8)} exceeds max_position_size` };
  }

  return { ok: true, quantity, notional };
}

/** Stop-loss price for a long position. */
export function stopLossPrice(entryPrice: number, stopLossPercent: number): number {
  return entryPrice * (1 - stopLossPercent / 100);
}

/** Take-profit price for a long position. */
export function takeProfitPrice(entryPrice: number, takeProfitPercent: number): number {
  return entryPrice * (1 + takeProfitPercent / 100);
}

/**
 * Trailing stop for a long position: highest price seen since entry minus
 * the trailing distance. Returns the new stop (never lower than current).
 */
export function trailingStopPrice(
  highestPriceSinceEntry: number,
  trailingStopPercent: number,
  currentStop: number,
): number {
  const candidate = highestPriceSinceEntry * (1 - trailingStopPercent / 100);
  return Math.max(candidate, currentStop);
}
