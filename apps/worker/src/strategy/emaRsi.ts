import type { Strategy, StrategyContext, StrategySignal } from '@daytrading/shared';
import { ema, rsi, sma } from './indicators.js';

export interface EmaRsiOptions {
  fastPeriod?: number;
  slowPeriod?: number;
  rsiPeriod?: number;
  rsiMin?: number;
  rsiMax?: number;
  /** Require current volume above SMA(volume, volumePeriod) * volumeFactor. */
  useVolumeFilter?: boolean;
  volumePeriod?: number;
  volumeFactor?: number;
}

/**
 * EMA-RSI example strategy.
 *
 * Entry (long only, evaluated on candle close):
 *  - EMA 9 crosses above EMA 21 on the latest closed candle
 *  - RSI 14 between 50 and 70
 *  - optional volume filter
 *
 * Exit signal: EMA 9 crosses below EMA 21 (opposite signal). Stop-loss,
 * take-profit and trailing stop are handled by the risk layer, not here.
 */
export class EmaRsiStrategy implements Strategy {
  readonly name = 'ema_rsi' as const;
  readonly warmupCandles: number;

  private readonly fast: number;
  private readonly slow: number;
  private readonly rsiPeriod: number;
  private readonly rsiMin: number;
  private readonly rsiMax: number;
  private readonly useVolumeFilter: boolean;
  private readonly volumePeriod: number;
  private readonly volumeFactor: number;

  constructor(opts: EmaRsiOptions = {}) {
    this.fast = opts.fastPeriod ?? 9;
    this.slow = opts.slowPeriod ?? 21;
    this.rsiPeriod = opts.rsiPeriod ?? 14;
    this.rsiMin = opts.rsiMin ?? 50;
    this.rsiMax = opts.rsiMax ?? 70;
    this.useVolumeFilter = opts.useVolumeFilter ?? false;
    this.volumePeriod = opts.volumePeriod ?? 20;
    this.volumeFactor = opts.volumeFactor ?? 1.0;
    this.warmupCandles = Math.max(this.slow, this.rsiPeriod + 1, this.volumePeriod) + 2;
  }

  evaluate(ctx: StrategyContext): StrategySignal {
    const closed = ctx.candles.filter((c) => c.isClosed);
    if (closed.length < this.warmupCandles) {
      return { action: 'hold', score: 0, reason: 'warming_up' };
    }

    const closes = closed.map((c) => c.close);
    const emaFast = ema(closes, this.fast);
    const emaSlow = ema(closes, this.slow);
    const rsiSeries = rsi(closes, this.rsiPeriod);

    const i = closes.length - 1;
    const fastNow = emaFast[i]!;
    const slowNow = emaSlow[i]!;
    const fastPrev = emaFast[i - 1]!;
    const slowPrev = emaSlow[i - 1]!;
    const rsiNow = rsiSeries[i]!;

    if ([fastNow, slowNow, fastPrev, slowPrev, rsiNow].some((v) => !Number.isFinite(v))) {
      return { action: 'hold', score: 0, reason: 'indicators_not_ready' };
    }

    const indicators = {
      emaFast: fastNow,
      emaSlow: slowNow,
      rsi: rsiNow,
    };

    const crossedUp = fastPrev <= slowPrev && fastNow > slowNow;
    const crossedDown = fastPrev >= slowPrev && fastNow < slowNow;

    if (ctx.hasOpenPosition && crossedDown) {
      return { action: 'exit_long', score: 1, reason: 'ema_cross_down', indicators };
    }

    if (!ctx.hasOpenPosition && crossedUp) {
      if (rsiNow < this.rsiMin || rsiNow > this.rsiMax) {
        return {
          action: 'hold',
          score: 0,
          reason: `rsi_out_of_range (${rsiNow.toFixed(1)})`,
          indicators,
        };
      }
      if (this.useVolumeFilter) {
        const volumes = closed.map((c) => c.volume);
        const avgVolume = sma(volumes.slice(0, -1), this.volumePeriod);
        const currentVolume = volumes[volumes.length - 1]!;
        if (Number.isFinite(avgVolume) && currentVolume < avgVolume * this.volumeFactor) {
          return { action: 'hold', score: 0, reason: 'volume_too_low', indicators };
        }
      }
      // Score scales with RSI momentum inside the allowed band
      const score = Math.min(1, 0.5 + ((rsiNow - this.rsiMin) / (this.rsiMax - this.rsiMin)) * 0.5);
      return { action: 'enter_long', score, reason: 'ema_cross_up_rsi_ok', indicators };
    }

    return { action: 'hold', score: 0, reason: 'no_signal', indicators };
  }
}
