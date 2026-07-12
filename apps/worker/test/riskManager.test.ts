import { describe, expect, it } from 'vitest';
import { checkEntryAllowed, checkExit, isDailyLossLimitReached } from '../src/risk/riskManager.js';
import type { RiskLimits, RiskState } from '@daytrading/shared';

const limits: RiskLimits = {
  maxPositionSize: 100,
  maxDailyLossPercent: 3,
  maxDailyTrades: 5,
  cooldownMinutes: 15,
};

const baseState: RiskState = {
  startingBalance: 10_000,
  currentBalance: 10_000,
  realizedPnlToday: 0,
  tradesToday: 0,
  lastTradeClosedAt: null,
  lossLimitReached: false,
};

describe('checkEntryAllowed', () => {
  it('allows entry in a clean state', () => {
    const res = checkEntryAllowed(limits, baseState, { killSwitch: false });
    expect(res.allowed).toBe(true);
  });

  it('blocks entry when kill switch is active', () => {
    const res = checkEntryAllowed(limits, baseState, { killSwitch: true });
    expect(res).toEqual({ allowed: false, reason: 'kill_switch_active' });
  });

  it('blocks entry once daily loss limit is reached (flag)', () => {
    const res = checkEntryAllowed(
      limits,
      { ...baseState, lossLimitReached: true },
      { killSwitch: false },
    );
    expect(res).toEqual({ allowed: false, reason: 'daily_loss_limit_reached' });
  });

  it('blocks entry once realized loss exceeds the daily limit', () => {
    // 3% of 10000 = 300
    const res = checkEntryAllowed(
      limits,
      { ...baseState, realizedPnlToday: -300 },
      { killSwitch: false },
    );
    expect(res).toEqual({ allowed: false, reason: 'daily_loss_limit_reached' });
  });

  it('still allows entry with losses below the limit', () => {
    const res = checkEntryAllowed(
      limits,
      { ...baseState, realizedPnlToday: -299.99 },
      { killSwitch: false },
    );
    expect(res.allowed).toBe(true);
  });

  it('blocks entry after max daily trades', () => {
    const res = checkEntryAllowed(limits, { ...baseState, tradesToday: 5 }, { killSwitch: false });
    expect(res).toEqual({ allowed: false, reason: 'max_daily_trades_reached' });
  });

  it('blocks entry during cooldown and allows it afterwards', () => {
    const now = Date.now();
    const during = checkEntryAllowed(
      limits,
      { ...baseState, lastTradeClosedAt: now - 5 * 60_000 },
      { killSwitch: false, now },
    );
    expect(during).toEqual({ allowed: false, reason: 'cooldown_active' });

    const after = checkEntryAllowed(
      limits,
      { ...baseState, lastTradeClosedAt: now - 16 * 60_000 },
      { killSwitch: false, now },
    );
    expect(after.allowed).toBe(true);
  });

  it('ignores cooldown when set to 0', () => {
    const now = Date.now();
    const res = checkEntryAllowed(
      { ...limits, cooldownMinutes: 0 },
      { ...baseState, lastTradeClosedAt: now - 1000 },
      { killSwitch: false, now },
    );
    expect(res.allowed).toBe(true);
  });
});

describe('isDailyLossLimitReached', () => {
  it('detects breached limit', () => {
    expect(isDailyLossLimitReached(10_000, -300, 3)).toBe(true);
    expect(isDailyLossLimitReached(10_000, -299, 3)).toBe(false);
    expect(isDailyLossLimitReached(10_000, 100, 3)).toBe(false);
  });
});

describe('checkExit', () => {
  it('triggers stop-loss when price falls to the stop', () => {
    const res = checkExit({
      currentPrice: 98,
      stopLossPrice: 98,
      takeProfitPrice: 105,
      trailingStopActive: false,
    });
    expect(res).toEqual({ shouldExit: true, reason: 'stop_loss' });
  });

  it('reports trailing_stop when the trailing stop is hit', () => {
    const res = checkExit({
      currentPrice: 102,
      stopLossPrice: 102.5,
      takeProfitPrice: 110,
      trailingStopActive: true,
    });
    expect(res).toEqual({ shouldExit: true, reason: 'trailing_stop' });
  });

  it('triggers take-profit when price reaches the target', () => {
    const res = checkExit({
      currentPrice: 105,
      stopLossPrice: 98,
      takeProfitPrice: 105,
      trailingStopActive: false,
    });
    expect(res).toEqual({ shouldExit: true, reason: 'take_profit' });
  });

  it('holds between stop and target', () => {
    const res = checkExit({
      currentPrice: 100,
      stopLossPrice: 98,
      takeProfitPrice: 105,
      trailingStopActive: false,
    });
    expect(res).toEqual({ shouldExit: false });
  });
});
