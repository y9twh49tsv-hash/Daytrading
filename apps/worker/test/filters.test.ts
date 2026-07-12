import { describe, expect, it } from 'vitest';
import {
  floorToStep,
  parseSymbolFilters,
  roundToTick,
  validateOrder,
} from '../src/binance/filters.js';
import type { SymbolFilters } from '@daytrading/shared';

const filters: SymbolFilters = {
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  baseAssetPrecision: 8,
  quoteAssetPrecision: 8,
  minQty: 0.0001,
  maxQty: 100,
  stepSize: 0.0001,
  minPrice: 0.01,
  maxPrice: 1_000_000,
  tickSize: 0.01,
  minNotional: 5,
};

describe('floorToStep', () => {
  it('floors to the LOT_SIZE step without float drift', () => {
    expect(floorToStep(0.123456, 0.0001)).toBe(0.1234);
    expect(floorToStep(1.9999999, 0.001)).toBe(1.999);
    expect(floorToStep(0.1 + 0.2, 0.1)).toBe(0.3);
  });

  it('handles integer steps', () => {
    expect(floorToStep(1234.56, 1)).toBe(1234);
  });
});

describe('roundToTick', () => {
  it('rounds prices to the tick size', () => {
    expect(roundToTick(100.567, 0.01)).toBe(100.57);
    expect(roundToTick(100.564, 0.01)).toBe(100.56);
  });
});

describe('validateOrder', () => {
  it('accepts a valid order and returns the adjusted quantity', () => {
    const res = validateOrder(filters, 0.12345678, 50_000);
    expect(res).toEqual({ valid: true, quantity: 0.1234 });
  });

  it('rejects quantity below minQty', () => {
    const res = validateOrder(filters, 0.00005, 50_000);
    expect(res.valid).toBe(false);
  });

  it('rejects quantity above maxQty', () => {
    const res = validateOrder(filters, 150, 50_000);
    expect(res.valid).toBe(false);
  });

  it('rejects notional below MIN_NOTIONAL', () => {
    const res = validateOrder(filters, 0.0001, 100); // 0.01 USDT
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.reason).toContain('MIN_NOTIONAL');
  });

  it('rejects prices outside PRICE_FILTER', () => {
    expect(validateOrder(filters, 1, 0.001).valid).toBe(false);
    expect(validateOrder(filters, 1, 2_000_000).valid).toBe(false);
  });

  it('rejects non-positive quantity and price', () => {
    expect(validateOrder(filters, 0, 100).valid).toBe(false);
    expect(validateOrder(filters, 1, -5).valid).toBe(false);
  });
});

describe('parseSymbolFilters', () => {
  it('parses a Binance exchangeInfo symbol entry', () => {
    const parsed = parseSymbolFilters({
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      baseAssetPrecision: 8,
      quoteAssetPrecision: 8,
      filters: [
        {
          filterType: 'PRICE_FILTER',
          minPrice: '0.01000000',
          maxPrice: '1000000.00',
          tickSize: '0.01000000',
        },
        { filterType: 'LOT_SIZE', minQty: '0.00001000', maxQty: '9000.00', stepSize: '0.00001000' },
        { filterType: 'NOTIONAL', minNotional: '5.00000000' },
      ],
    });
    expect(parsed.minQty).toBe(0.00001);
    expect(parsed.stepSize).toBe(0.00001);
    expect(parsed.tickSize).toBe(0.01);
    expect(parsed.minNotional).toBe(5);
    expect(parsed.quoteAsset).toBe('USDT');
  });

  it('falls back to MIN_NOTIONAL filter type', () => {
    const parsed = parseSymbolFilters({
      symbol: 'ETHUSDT',
      baseAsset: 'ETH',
      quoteAsset: 'USDT',
      baseAssetPrecision: 8,
      quoteAssetPrecision: 8,
      filters: [{ filterType: 'MIN_NOTIONAL', minNotional: '10.0' }],
    });
    expect(parsed.minNotional).toBe(10);
  });
});
