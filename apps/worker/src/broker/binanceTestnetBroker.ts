import type { BrokerOrderRequest, BrokerOrderResult, OrderStatus } from '@daytrading/shared';
import type { Broker } from './types.js';
import { BinanceNetworkError, type BinanceRest } from '../binance/rest.js';
import type { Logger } from '../logger.js';

/**
 * Broker backed by the official Binance Spot REST API. The same implementation
 * serves the Testnet and the Live (mainnet) exchange — the difference is only
 * the base URL of the injected `rest` client and the `kind` flag. Live trading
 * uses REAL funds; the risk layer (stop-loss, daily loss limit, kill switch,
 * emergency stop) still applies.
 *
 * Order creation is never blindly retried: after a network error the broker
 * queries the real order status by clientOrderId. Only if the order verifiably
 * never reached the exchange does the error propagate (the engine may then
 * decide to place a new order with a NEW clientOrderId).
 */
export class BinanceSpotBroker implements Broker {
  readonly kind: 'testnet' | 'live';
  private connected = false;

  constructor(
    private readonly rest: BinanceRest,
    private readonly log: Logger,
    kind: 'testnet' | 'live' = 'testnet',
  ) {
    this.kind = kind;
  }

  async init(): Promise<void> {
    await this.rest.syncServerTime();
    // Verify credentials early so misconfiguration surfaces at startup
    await this.rest.getAccountBalances();
    this.connected = true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getQuoteBalance(quoteAsset: string): Promise<number> {
    const balances = await this.rest.getAccountBalances();
    return balances.find((b) => b.asset === quoteAsset)?.free ?? 0;
  }

  async executeMarketOrder(request: BrokerOrderRequest): Promise<BrokerOrderResult> {
    // Duplicate protection: if an order with this clientOrderId already
    // exists on the exchange, return it instead of creating a new one.
    const existing = await this.getOrderByClientId(request.symbol, request.clientOrderId);
    if (existing) {
      this.log.warn('duplicate clientOrderId detected, returning existing order', {
        clientOrderId: request.clientOrderId,
      });
      return existing;
    }

    try {
      const raw = await this.rest.placeMarketOrder({
        symbol: request.symbol,
        side: request.side === 'buy' ? 'BUY' : 'SELL',
        quantity: request.quantity,
        clientOrderId: request.clientOrderId,
      });
      this.connected = true;
      return this.parseOrderResponse(raw, request);
    } catch (err) {
      if (err instanceof BinanceNetworkError) {
        // The order may or may not have reached Binance — check before failing.
        this.log.warn('network error during order creation, verifying real status', {
          clientOrderId: request.clientOrderId,
        });
        const actual = await this.getOrderByClientId(request.symbol, request.clientOrderId);
        if (actual) return actual;
      }
      throw err;
    }
  }

  async getOrderByClientId(
    symbol: string,
    clientOrderId: string,
  ): Promise<BrokerOrderResult | null> {
    const raw = await this.rest.getOrderByClientId(symbol, clientOrderId);
    if (!raw) return null;
    return this.parseOrderQuery(raw, symbol, clientOrderId);
  }

  async getOpenOrderClientIds(symbol: string): Promise<string[]> {
    const orders = await this.rest.getOpenOrders(symbol);
    return orders
      .map((o) => (typeof o.clientOrderId === 'string' ? o.clientOrderId : null))
      .filter((v): v is string => v !== null);
  }

  // -------------------------------------------------------------------------

  private parseOrderResponse(
    raw: Record<string, unknown>,
    request: BrokerOrderRequest,
  ): BrokerOrderResult {
    const fills = Array.isArray(raw.fills)
      ? (raw.fills as Array<{ price: string; qty: string; commission: string }>)
      : [];
    let executedQty = Number(raw.executedQty ?? 0);
    let avgPrice = 0;
    let fee = 0;
    if (fills.length > 0) {
      let quoteSum = 0;
      let qtySum = 0;
      for (const f of fills) {
        quoteSum += Number(f.price) * Number(f.qty);
        qtySum += Number(f.qty);
        fee += Number(f.commission);
      }
      if (qtySum > 0) avgPrice = quoteSum / qtySum;
      if (executedQty === 0) executedQty = qtySum;
    } else if (Number(raw.cummulativeQuoteQty ?? 0) > 0 && executedQty > 0) {
      avgPrice = Number(raw.cummulativeQuoteQty) / executedQty;
    }

    return {
      clientOrderId: request.clientOrderId,
      exchangeOrderId: typeof raw.orderId === 'number' ? raw.orderId : Number(raw.orderId ?? 0),
      symbol: request.symbol,
      side: request.side,
      executedQty,
      avgPrice,
      fee,
      status: mapBinanceStatus(String(raw.status ?? 'NEW')),
      raw,
    };
  }

  private parseOrderQuery(
    raw: Record<string, unknown>,
    symbol: string,
    clientOrderId: string,
  ): BrokerOrderResult {
    const executedQty = Number(raw.executedQty ?? 0);
    const cumQuote = Number(raw.cummulativeQuoteQty ?? 0);
    return {
      clientOrderId,
      exchangeOrderId: typeof raw.orderId === 'number' ? raw.orderId : Number(raw.orderId ?? 0),
      symbol,
      side: String(raw.side ?? '').toLowerCase() === 'sell' ? 'sell' : 'buy',
      executedQty,
      avgPrice: executedQty > 0 ? cumQuote / executedQty : 0,
      fee: 0, // fees are only available via fills / myTrades
      status: mapBinanceStatus(String(raw.status ?? 'NEW')),
      raw,
    };
  }
}

export function mapBinanceStatus(status: string): OrderStatus {
  switch (status.toUpperCase()) {
    case 'NEW':
      return 'new';
    case 'PARTIALLY_FILLED':
      return 'partially_filled';
    case 'FILLED':
      return 'filled';
    case 'CANCELED':
      return 'canceled';
    case 'REJECTED':
      return 'rejected';
    case 'EXPIRED':
    case 'EXPIRED_IN_MATCH':
      return 'expired';
    default:
      return 'pending';
  }
}
