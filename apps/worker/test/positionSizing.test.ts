import { describe, expect, it } from 'vitest';
import {
  calculatePositionSize,
  stopLossPrice,
  takeProfitPrice,
  trailingStopPrice,
} from '../src/risk/positionSizing.js';
import type { SymbolFilters } from '@daytrading/shared';

const filters: SymbolFilters = {
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  baseAssetPrecision: 8,
  quoteAssetPrecision: 8,
  minQty: 0.00001,
  maxQty: 9000,
  stepSize: 0.00001,
  minPrice: 0.01,
  maxPrice: 1_000_000,
  tickSize: 0.01,
  minNotional: 5,
};

describe('calculatePositionSize', () => {
  it('computes quantity from quote amount and floors to step size', () => {
    const result = calculatePositionSize({
      quoteAmount: 100,
      maxPositionSize: 1000,
      price: 50_000,
      availableBalance: 10_000,
      filters,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quantity).toBe(0.002);
      expect(result.notional).toBeCloseTo(100, 6);
    }
  });

  it('caps the spend at max_position_size', () => {
    const result = calculatePositionSize({
      quoteAmount: 500,
      maxPositionSize: 100,
      price: 50_000,
      availableBalance: 10_000,
      filters,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.notional).toBeLessThanOrEqual(100);
  });

  it('caps the spend at the available balance', () => {
    const result = calculatePositionSize({
      quoteAmount: 500,
      maxPositionSize: 1000,
      price: 50_000,
      availableBalance: 50,
      filters,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.notional).toBeLessThanOrEqual(50);
  });

  it('rejects orders below MIN_NOTIONAL', () => {
    const result = calculatePositionSize({
      quoteAmount: 1,
      maxPositionSize: 1000,
      price: 50_000,
      availableBalance: 10_000,
      filters,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when no balance is available', () => {
    const result = calculatePositionSize({
      quoteAmount: 100,
      maxPositionSize: 1000,
      price: 50_000,
      availableBalance: 0,
      filters,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid prices', () => {
    const result = calculatePositionSize({
      quoteAmount: 100,
      maxPositionSize: 1000,
      price: 0,
      availableBalance: 10_000,
      filters,
    });
    expect(result.ok).toBe(false);
  });
});

describe('stop loss / take profit', () => {
  it('computes stop-loss below entry for longs', () => {
    expect(stopLossPrice(100, 1)).toBeCloseTo(99);
    expect(stopLossPrice(50_000, 0.5)).toBeCloseTo(49_750);
  });

  it('computes take-profit above entry for longs', () => {
    expect(takeProfitPrice(100, 1.5)).toBeCloseTo(101.5);
    expect(takeProfitPrice(50_000, 2)).toBeCloseTo(51_000);
  });

  it('trailing stop only ratchets upward', () => {
    const initial = stopLossPrice(100, 2); // 98
    const after = trailingStopPrice(110, 2, initial); // 107.8
    expect(after).toBeCloseTo(107.8);
    // price falls back — stop must NOT move down
    const later = trailingStopPrice(105, 2, after);
    expect(later).toBeCloseTo(after);
  });
});
