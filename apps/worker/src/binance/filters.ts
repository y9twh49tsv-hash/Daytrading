import type { SymbolFilters } from '@daytrading/shared';

/** Floor a quantity to the LOT_SIZE step. Avoids floating point drift. */
export function floorToStep(quantity: number, stepSize: number): number {
  if (stepSize <= 0) return quantity;
  const precision = stepDecimals(stepSize);
  const steps = Math.floor((quantity + Number.EPSILON) / stepSize);
  return Number((steps * stepSize).toFixed(precision));
}

/** Round a price to the PRICE_FILTER tick. */
export function roundToTick(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  const precision = stepDecimals(tickSize);
  const ticks = Math.round(price / tickSize);
  return Number((ticks * tickSize).toFixed(precision));
}

export function stepDecimals(step: number): number {
  const s = step.toFixed(12).replace(/0+$/, '');
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

export type FilterValidation = { valid: true; quantity: number } | { valid: false; reason: string };

/**
 * Validate and normalize an order quantity against the symbol's exchange
 * filters (LOT_SIZE, MIN_NOTIONAL, PRICE_FILTER).
 */
export function validateOrder(
  filters: SymbolFilters,
  quantity: number,
  price: number,
): FilterValidation {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { valid: false, reason: 'Quantity must be positive' };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { valid: false, reason: 'Price must be positive' };
  }
  if (filters.minPrice > 0 && price < filters.minPrice) {
    return {
      valid: false,
      reason: `Price ${price} below PRICE_FILTER.minPrice ${filters.minPrice}`,
    };
  }
  if (filters.maxPrice > 0 && price > filters.maxPrice) {
    return {
      valid: false,
      reason: `Price ${price} above PRICE_FILTER.maxPrice ${filters.maxPrice}`,
    };
  }

  const adjusted = floorToStep(quantity, filters.stepSize);
  if (adjusted < filters.minQty) {
    return { valid: false, reason: `Quantity ${adjusted} below LOT_SIZE.minQty ${filters.minQty}` };
  }
  if (filters.maxQty > 0 && adjusted > filters.maxQty) {
    return { valid: false, reason: `Quantity ${adjusted} above LOT_SIZE.maxQty ${filters.maxQty}` };
  }
  const notional = adjusted * price;
  if (notional < filters.minNotional) {
    return {
      valid: false,
      reason: `Notional ${notional.toFixed(8)} below MIN_NOTIONAL ${filters.minNotional}`,
    };
  }
  return { valid: true, quantity: adjusted };
}

interface RawExchangeFilter {
  filterType: string;
  [key: string]: unknown;
}

interface RawSymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  baseAssetPrecision: number;
  quoteAssetPrecision: number;
  filters: RawExchangeFilter[];
}

/** Parse Binance exchangeInfo symbol entry into our SymbolFilters. */
export function parseSymbolFilters(info: RawSymbolInfo): SymbolFilters {
  const get = (type: string): RawExchangeFilter | undefined =>
    info.filters.find((f) => f.filterType === type);
  const num = (f: RawExchangeFilter | undefined, key: string, fallback = 0): number => {
    const v = f?.[key];
    const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
    return Number.isFinite(n) ? n : fallback;
  };

  const lot = get('LOT_SIZE');
  const priceFilter = get('PRICE_FILTER');
  const notional = get('NOTIONAL') ?? get('MIN_NOTIONAL');

  return {
    symbol: info.symbol,
    baseAsset: info.baseAsset,
    quoteAsset: info.quoteAsset,
    baseAssetPrecision: info.baseAssetPrecision,
    quoteAssetPrecision: info.quoteAssetPrecision,
    minQty: num(lot, 'minQty'),
    maxQty: num(lot, 'maxQty'),
    stepSize: num(lot, 'stepSize'),
    minPrice: num(priceFilter, 'minPrice'),
    maxPrice: num(priceFilter, 'maxPrice'),
    tickSize: num(priceFilter, 'tickSize'),
    minNotional: num(notional, 'minNotional', num(notional, 'notional')),
  };
}
