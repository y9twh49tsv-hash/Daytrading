import type { BrokerOrderRequest, BrokerOrderResult } from '@daytrading/shared';

/**
 * Broker interface — identical for PaperBroker and BinanceTestnetBroker so
 * the engine cannot tell the difference.
 */
export interface Broker {
  readonly kind: 'paper' | 'testnet';
  /** Prepare the broker (load balances etc.). */
  init(): Promise<void>;
  /** Free quote-asset balance (e.g. USDT). */
  getQuoteBalance(quoteAsset: string): Promise<number>;
  /** Execute a market order. Must be safe against duplicate clientOrderIds. */
  executeMarketOrder(request: BrokerOrderRequest): Promise<BrokerOrderResult>;
  /** Look up an order by clientOrderId (used after network errors). */
  getOrderByClientId(symbol: string, clientOrderId: string): Promise<BrokerOrderResult | null>;
  /** clientOrderIds of open orders on the exchange (empty for paper). */
  getOpenOrderClientIds(symbol: string): Promise<string[]>;
  /** Whether the broker currently has a working connection. */
  isConnected(): boolean;
}
