import WebSocket from 'ws';
import type { Candle } from '@daytrading/shared';
import type { Logger } from '../logger.js';

export interface KlineStreamOptions {
  wsBaseUrl: string;
  symbol: string;
  interval: string;
  logger: Logger;
  onCandle: (candle: Candle) => void;
  onStatusChange?: (connected: boolean) => void;
}

interface KlineMessage {
  e?: string;
  k?: {
    t: number;
    T: number;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    x: boolean;
  };
}

/**
 * Binance kline WebSocket stream with automatic reconnect and exponential
 * backoff. On repeated failure the engine falls back to REST polling.
 */
export class KlineStream {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private closedByUser = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private _connected = false;

  constructor(private readonly opts: KlineStreamOptions) {}

  get connected(): boolean {
    return this._connected;
  }

  start(): void {
    this.closedByUser = false;
    this.connect();
  }

  stop(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        this.ws.close();
      } catch {
        // already closed
      }
      this.ws = null;
    }
    this.setConnected(false);
  }

  private setConnected(value: boolean): void {
    if (this._connected !== value) {
      this._connected = value;
      this.opts.onStatusChange?.(value);
    }
  }

  private connect(): void {
    const stream = `${this.opts.symbol.toLowerCase()}@kline_${this.opts.interval}`;
    const url = `${this.opts.wsBaseUrl}/ws/${stream}`;
    this.opts.logger.info('ws connecting', { url });

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.setConnected(true);
      this.opts.logger.info('ws connected', { stream });
    });

    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as KlineMessage;
        if (msg.e === 'kline' && msg.k) {
          const k = msg.k;
          this.opts.onCandle({
            openTime: k.t,
            closeTime: k.T,
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
            volume: Number(k.v),
            isClosed: k.x,
          });
        }
      } catch (err) {
        this.opts.logger.warn('ws message parse error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    ws.on('error', (err: Error) => {
      this.opts.logger.warn('ws error', { error: err.message });
    });

    ws.on('close', () => {
      this.setConnected(false);
      if (this.closedByUser) return;
      this.scheduleReconnect();
    });

    // Binance sends pings; ws library answers pongs automatically.
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 60_000);
    this.opts.logger.warn('ws reconnect scheduled', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });
    this.reconnectTimer = setTimeout(() => {
      if (!this.closedByUser) this.connect();
    }, delay);
  }
}
