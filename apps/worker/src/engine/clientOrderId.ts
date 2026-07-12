import { CLIENT_ORDER_ID_PREFIX } from '@daytrading/shared';

/**
 * Deterministic clientOrderId for entries: one id per bot per candle.
 * Retrying the same signal therefore reuses the same id and cannot create a
 * duplicate order (DB unique index + exchange-side lookup both catch it).
 *
 * Binance allows /^[a-zA-Z0-9-_]{1,36}$/.
 */
export function entryClientOrderId(botId: string, candleCloseTime: number): string {
  const bot = botId.replace(/-/g, '').slice(0, 10);
  return `${CLIENT_ORDER_ID_PREFIX}-${bot}-e-${candleCloseTime.toString(36)}`;
}

/** Exit ids include a reason tag and timestamp (exits must never be blocked). */
export function exitClientOrderId(botId: string, reasonTag: string, ts: number): string {
  const bot = botId.replace(/-/g, '').slice(0, 10);
  const tag = reasonTag.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6);
  return `${CLIENT_ORDER_ID_PREFIX}-${bot}-x${tag}-${ts.toString(36)}`;
}
