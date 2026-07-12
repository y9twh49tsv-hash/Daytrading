import { createHmac } from 'node:crypto';
import type { SymbolFilters } from '@daytrading/shared';
import { parseSymbolFilters } from './filters.js';
import type { Logger } from '../logger.js';

export interface BinanceRestOptions {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  timeoutMs?: number;
  logger?: Logger;
}

export class BinanceApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly binanceCode?: number,
  ) {
    super(message);
    this.name = 'BinanceApiError';
  }
}

export class BinanceNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BinanceNetworkError';
  }
}

interface RawKline {
  0: number; // open time
  1: string; // open
  2: string; // high
  3: string; // low
  4: string; // close
  5: string; // volume
  6: number; // close time
}

/**
 * Minimal signed Binance Spot REST client (Testnet).
 *
 * Retry policy: only safe, idempotent GET requests are retried automatically.
 * Order creation (POST) is NEVER retried blindly — after a network error the
 * caller must check the real order status via getOrderByClientId().
 */
export class BinanceRest {
  private timeOffsetMs = 0;
  private readonly timeoutMs: number;

  constructor(private readonly opts: BinanceRestOptions) {
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  // ---------------------------------------------------------------------
  // Time sync
  // ---------------------------------------------------------------------

  async syncServerTime(): Promise<number> {
    const res = await this.request<{ serverTime: number }>('GET', '/api/v3/time', {}, false, 2);
    this.timeOffsetMs = res.serverTime - Date.now();
    return this.timeOffsetMs;
  }

  now(): number {
    return Date.now() + this.timeOffsetMs;
  }

  // ---------------------------------------------------------------------
  // Market data (public, idempotent — retried)
  // ---------------------------------------------------------------------

  async getExchangeInfo(symbol: string): Promise<SymbolFilters> {
    const data = await this.request<{
      symbols: Array<{
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
        baseAssetPrecision: number;
        quoteAssetPrecision: number;
        filters: Array<{ filterType: string; [k: string]: unknown }>;
      }>;
    }>('GET', '/api/v3/exchangeInfo', { symbol }, false, 2);
    const info = data.symbols.find((s) => s.symbol === symbol);
    if (!info) throw new BinanceApiError(`Symbol ${symbol} not found in exchangeInfo`, 404);
    return parseSymbolFilters(info);
  }

  async getKlines(symbol: string, interval: string, limit = 200): Promise<RawKline[]> {
    return this.request<RawKline[]>('GET', '/api/v3/klines', { symbol, interval, limit }, false, 2);
  }

  async getPrice(symbol: string): Promise<number> {
    const data = await this.request<{ price: string }>(
      'GET',
      '/api/v3/ticker/price',
      { symbol },
      false,
      2,
    );
    return Number(data.price);
  }

  // ---------------------------------------------------------------------
  // Account / orders (signed)
  // ---------------------------------------------------------------------

  async getAccountBalances(): Promise<Array<{ asset: string; free: number; locked: number }>> {
    const data = await this.request<{
      balances: Array<{ asset: string; free: string; locked: string }>;
    }>('GET', '/api/v3/account', {}, true, 2);
    return data.balances.map((b) => ({
      asset: b.asset,
      free: Number(b.free),
      locked: Number(b.locked),
    }));
  }

  async getOpenOrders(symbol: string): Promise<Array<Record<string, unknown>>> {
    return this.request<Array<Record<string, unknown>>>(
      'GET',
      '/api/v3/openOrders',
      { symbol },
      true,
      2,
    );
  }

  async getOrderByClientId(
    symbol: string,
    clientOrderId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      return await this.request<Record<string, unknown>>(
        'GET',
        '/api/v3/order',
        { symbol, origClientOrderId: clientOrderId },
        true,
        2,
      );
    } catch (err) {
      // -2013 = order does not exist
      if (err instanceof BinanceApiError && err.binanceCode === -2013) return null;
      throw err;
    }
  }

  /**
   * Place a market order. NOT retried on network errors — the caller must
   * verify via getOrderByClientId() whether the order actually reached the
   * exchange before deciding to resubmit.
   */
  async placeMarketOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    clientOrderId: string;
  }): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'POST',
      '/api/v3/order',
      {
        symbol: params.symbol,
        side: params.side,
        type: 'MARKET',
        quantity: params.quantity,
        newClientOrderId: params.clientOrderId,
        newOrderRespType: 'FULL',
      },
      true,
      0, // no automatic retries for order creation
    );
  }

  async cancelOrder(symbol: string, clientOrderId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'DELETE',
      '/api/v3/order',
      { symbol, origClientOrderId: clientOrderId },
      true,
      0,
    );
  }

  // ---------------------------------------------------------------------
  // Core request handling
  // ---------------------------------------------------------------------

  private sign(query: string): string {
    return createHmac('sha256', this.opts.apiSecret).update(query).digest('hex');
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params: Record<string, string | number | undefined>,
    signed: boolean,
    retries: number,
  ): Promise<T> {
    let attempt = 0;
    // Retry loop only applies to idempotent requests (retries > 0)
    for (;;) {
      try {
        return await this.requestOnce<T>(method, path, params, signed);
      } catch (err) {
        const retryable =
          err instanceof BinanceNetworkError ||
          (err instanceof BinanceApiError && err.httpStatus >= 500);
        if (!retryable || attempt >= retries) throw err;
        attempt += 1;
        const delay = Math.min(2000 * 2 ** attempt, 10_000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  private async requestOnce<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params: Record<string, string | number | undefined>,
    signed: boolean,
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) search.set(k, String(v));
    }
    if (signed) {
      search.set('timestamp', String(this.now()));
      search.set('recvWindow', '5000');
      search.set('signature', this.sign(search.toString()));
    }

    const url = `${this.opts.baseUrl}${path}?${search.toString()}`;
    const headers: Record<string, string> = {};
    if (signed || this.opts.apiKey) headers['X-MBX-APIKEY'] = this.opts.apiKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { method, headers, signal: controller.signal });
    } catch (err) {
      throw new BinanceNetworkError(
        `Network error calling ${method} ${path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    if (!res.ok) {
      let code: number | undefined;
      let msg = text.slice(0, 300);
      try {
        const body = JSON.parse(text) as { code?: number; msg?: string };
        code = body.code;
        msg = body.msg ?? msg;
      } catch {
        // non-JSON error body
      }
      throw new BinanceApiError(
        `Binance ${method} ${path} failed (${res.status}): ${msg}`,
        res.status,
        code,
      );
    }
    return JSON.parse(text) as T;
  }
}

export function klineToCandle(k: RawKline): {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  isClosed: boolean;
} {
  return {
    openTime: k[0],
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: k[6],
    isClosed: true,
  };
}
