import { describe, expect, it } from 'vitest';
import { EmaRsiStrategy } from '../src/strategy/emaRsi.js';
import { ema, rsi } from '../src/strategy/indicators.js';
import type { Candle } from '@daytrading/shared';

function makeCandles(closes: number[], volume = 100): Candle[] {
  return closes.map((close, i) => ({
    openTime: i * 60_000,
    closeTime: (i + 1) * 60_000 - 1,
    open: close,
    high: close * 1.001,
    low: close * 0.999,
    close,
    volume,
    isClosed: true,
  }));
}

/** Downtrend followed by a strong recovery → EMA9 crosses above EMA21. */
function crossoverCloses(): number[] {
  const closes: number[] = [];
  let price = 110;
  for (let i = 0; i < 40; i++) {
    price -= 0.5; // steady downtrend
    closes.push(price);
  }
  for (let i = 0; i < 12; i++) {
    price += 1.4; // sharp recovery
    closes.push(price);
  }
  return closes;
}

describe('indicators', () => {
  it('ema converges towards constant input', () => {
    const series = ema(new Array<number>(50).fill(42), 9);
    expect(series[49]).toBeCloseTo(42);
  });

  it('rsi is 100 for straight gains and near 0 for straight losses', () => {
    const up = rsi(
      Array.from({ length: 30 }, (_, i) => 100 + i),
      14,
    );
    expect(up[29]).toBe(100);
    const down = rsi(
      Array.from({ length: 30 }, (_, i) => 100 - i),
      14,
    );
    expect(down[29]!).toBeLessThan(1);
  });

  it('returns NaN during warm-up', () => {
    expect(Number.isNaN(ema([1, 2, 3], 9)[1])).toBe(true);
    expect(Number.isNaN(rsi([1, 2, 3], 14)[2])).toBe(true);
  });
});

describe('EmaRsiStrategy', () => {
  it('holds during warm-up', () => {
    const strategy = new EmaRsiStrategy();
    const signal = strategy.evaluate({ candles: makeCandles([1, 2, 3]), hasOpenPosition: false });
    expect(signal.action).toBe('hold');
    expect(signal.reason).toBe('warming_up');
  });

  it('enters long on EMA cross up with RSI in range', () => {
    const strategy = new EmaRsiStrategy();
    const closes = crossoverCloses();

    // Find the crossing candle: walk forward until strategy fires
    let fired = false;
    for (let end = 30; end <= closes.length; end++) {
      const signal = strategy.evaluate({
        candles: makeCandles(closes.slice(0, end)),
        hasOpenPosition: false,
      });
      if (signal.action === 'enter_long') {
        fired = true;
        expect(signal.score).toBeGreaterThanOrEqual(0.5);
        expect(signal.indicators?.rsi).toBeGreaterThanOrEqual(50);
        expect(signal.indicators?.rsi).toBeLessThanOrEqual(70);
        break;
      }
    }
    expect(fired).toBe(true);
  });

  it('does not enter when RSI is out of range', () => {
    // Very strong straight-up move → RSI > 70 at the cross
    const strategy = new EmaRsiStrategy({ rsiMin: 50, rsiMax: 55 });
    const closes = crossoverCloses();
    for (let end = 30; end <= closes.length; end++) {
      const signal = strategy.evaluate({
        candles: makeCandles(closes.slice(0, end)),
        hasOpenPosition: false,
      });
      expect(signal.action).not.toBe('enter_long');
    }
  });

  it('does not enter while a position is open', () => {
    const strategy = new EmaRsiStrategy();
    const closes = crossoverCloses();
    for (let end = 30; end <= closes.length; end++) {
      const signal = strategy.evaluate({
        candles: makeCandles(closes.slice(0, end)),
        hasOpenPosition: true,
      });
      expect(signal.action).not.toBe('enter_long');
    }
  });

  it('signals exit_long on EMA cross down with open position', () => {
    const strategy = new EmaRsiStrategy();
    // Uptrend then sharp drop
    const closes: number[] = [];
    let price = 100;
    for (let i = 0; i < 40; i++) closes.push((price += 0.5));
    for (let i = 0; i < 12; i++) closes.push((price -= 1.4));

    let fired = false;
    for (let end = 30; end <= closes.length; end++) {
      const signal = strategy.evaluate({
        candles: makeCandles(closes.slice(0, end)),
        hasOpenPosition: true,
      });
      if (signal.action === 'exit_long') {
        fired = true;
        expect(signal.reason).toBe('ema_cross_down');
        break;
      }
    }
    expect(fired).toBe(true);
  });

  it('applies the volume filter when enabled', () => {
    const closes = crossoverCloses();
    const lowVolumeStrategy = new EmaRsiStrategy({ useVolumeFilter: true, volumeFactor: 10 });
    // Constant volume can never be 10x the average → no entries
    for (let end = 30; end <= closes.length; end++) {
      const signal = lowVolumeStrategy.evaluate({
        candles: makeCandles(closes.slice(0, end), 100),
        hasOpenPosition: false,
      });
      expect(signal.action).not.toBe('enter_long');
    }
  });
});
