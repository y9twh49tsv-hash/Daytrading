import type { BrokerOrderRequest, BrokerOrderResult } from '@daytrading/shared';
import { BINANCE_SPOT_TAKER_FEE, DEFAULT_PAPER_SLIPPAGE } from '@daytrading/shared';
import type { Broker } from './types.js';

export interface PaperBrokerOptions {
  /** Virtual starting balance in quote currency. */
  initialQuoteBalance: number;
  /** Callback returning the latest market price for a symbol. */
  getMarketPrice: (symbol: string) => number;
  /** Simulated slippage as a fraction (0.0005 = 0.05 %). */
  slippage?: number;
  /** Fee as a fraction (0.001 = 0.1 % Binance Spot taker fee). */
  feeRate?: number;
}

/**
 * Simulated broker for paper trading. Fills market orders instantly at the
 * current market price plus configurable slippage, charges the Binance Spot
 * fee and tracks a virtual quote/base balance.
 */
export class PaperBroker implements Broker {
  readonly kind = 'paper' as const;

  private quoteBalance: number;
  private baseBalances = new Map<string, number>();
  private readonly slippage: number;
  private readonly feeRate: number;
  private readonly filledOrders = new Map<string, BrokerOrderResult>();
  private orderCounter = 0;

  constructor(private readonly opts: PaperBrokerOptions) {
    this.quoteBalance = opts.initialQuoteBalance;
    this.slippage = opts.slippage ?? DEFAULT_PAPER_SLIPPAGE;
    this.feeRate = opts.feeRate ?? BINANCE_SPOT_TAKER_FEE;
  }

  async init(): Promise<void> {
    // nothing to prepare
  }

  isConnected(): boolean {
    return true;
  }

  async getQuoteBalance(_quoteAsset: string): Promise<number> {
    return this.quoteBalance;
  }

  getBaseBalance(symbol: string): number {
    return this.baseBalances.get(symbol) ?? 0;
  }

  async executeMarketOrder(request: BrokerOrderRequest): Promise<BrokerOrderResult> {
    // Duplicate-order protection: same clientOrderId returns the original fill
    const existing = this.filledOrders.get(request.clientOrderId);
    if (existing) return existing;

    const marketPrice = this.opts.getMarketPrice(request.symbol);
    if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
      throw new Error(`PaperBroker: no market price for ${request.symbol}`);
    }
    if (!Number.isFinite(request.quantity) || request.quantity <= 0) {
      throw new Error('PaperBroker: quantity must be positive');
    }

    // Slippage works against the trader in both directions
    const fillPrice =
      request.side === 'buy'
        ? marketPrice * (1 + this.slippage)
        : marketPrice * (1 - this.slippage);
    const notional = request.quantity * fillPrice;
    const fee = notional * this.feeRate;

    if (request.side === 'buy') {
      const totalCost = notional + fee;
      if (totalCost > this.quoteBalance) {
        throw new Error(
          `PaperBroker: insufficient balance (need ${totalCost.toFixed(8)}, have ${this.quoteBalance.toFixed(8)})`,
        );
      }
      this.quoteBalance -= totalCost;
      this.baseBalances.set(request.symbol, this.getBaseBalance(request.symbol) + request.quantity);
    } else {
      const held = this.getBaseBalance(request.symbol);
      if (request.quantity > held + 1e-12) {
        throw new Error(
          `PaperBroker: insufficient base balance (need ${request.quantity}, have ${held})`,
        );
      }
      this.baseBalances.set(request.symbol, held - request.quantity);
      this.quoteBalance += notional - fee;
    }

    this.orderCounter += 1;
    const result: BrokerOrderResult = {
      clientOrderId: request.clientOrderId,
      exchangeOrderId: this.orderCounter,
      symbol: request.symbol,
      side: request.side,
      executedQty: request.quantity,
      avgPrice: fillPrice,
      fee,
      status: 'filled',
      raw: {
        simulated: true,
        marketPrice,
        slippage: this.slippage,
        feeRate: this.feeRate,
      },
    };
    this.filledOrders.set(request.clientOrderId, result);
    return result;
  }

  async getOrderByClientId(
    _symbol: string,
    clientOrderId: string,
  ): Promise<BrokerOrderResult | null> {
    return this.filledOrders.get(clientOrderId) ?? null;
  }

  async getOpenOrderClientIds(_symbol: string): Promise<string[]> {
    return []; // market orders fill instantly in the simulation
  }
}
