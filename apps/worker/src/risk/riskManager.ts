import type { RiskCheckResult, RiskLimits, RiskState } from '@daytrading/shared';

/**
 * Pre-trade risk gate. Every entry must pass ALL checks:
 *  - global kill switch off
 *  - daily loss limit not reached
 *  - daily trade count below maximum
 *  - cooldown since last closed trade elapsed
 */
export function checkEntryAllowed(
  limits: RiskLimits,
  state: RiskState,
  opts: { killSwitch: boolean; now?: number },
): RiskCheckResult {
  const now = opts.now ?? Date.now();

  if (opts.killSwitch) {
    return { allowed: false, reason: 'kill_switch_active' };
  }

  if (state.lossLimitReached) {
    return { allowed: false, reason: 'daily_loss_limit_reached' };
  }

  const maxDailyLoss = (limits.maxDailyLossPercent / 100) * state.startingBalance;
  if (state.realizedPnlToday <= -maxDailyLoss) {
    return { allowed: false, reason: 'daily_loss_limit_reached' };
  }

  if (state.tradesToday >= limits.maxDailyTrades) {
    return { allowed: false, reason: 'max_daily_trades_reached' };
  }

  if (state.lastTradeClosedAt !== null && limits.cooldownMinutes > 0) {
    const cooldownMs = limits.cooldownMinutes * 60_000;
    if (now - state.lastTradeClosedAt < cooldownMs) {
      return { allowed: false, reason: 'cooldown_active' };
    }
  }

  return { allowed: true };
}

/** Has the daily loss limit been breached given current realized PnL? */
export function isDailyLossLimitReached(
  startingBalance: number,
  realizedPnlToday: number,
  maxDailyLossPercent: number,
): boolean {
  if (startingBalance <= 0) return false;
  const maxLoss = (maxDailyLossPercent / 100) * startingBalance;
  return realizedPnlToday <= -maxLoss;
}

export type ExitCheck =
  | { shouldExit: false }
  | { shouldExit: true; reason: 'stop_loss' | 'take_profit' | 'trailing_stop' };

/**
 * Exit check for a long position based on the latest price.
 * Trailing stop (if enabled) replaces the static stop once it is higher.
 */
export function checkExit(params: {
  currentPrice: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  trailingStopActive: boolean;
}): ExitCheck {
  const { currentPrice, stopLossPrice, takeProfitPrice, trailingStopActive } = params;

  if (stopLossPrice !== null && currentPrice <= stopLossPrice) {
    return { shouldExit: true, reason: trailingStopActive ? 'trailing_stop' : 'stop_loss' };
  }
  if (takeProfitPrice !== null && currentPrice >= takeProfitPrice) {
    return { shouldExit: true, reason: 'take_profit' };
  }
  return { shouldExit: false };
}
