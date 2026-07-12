import { describe, expect, it } from 'vitest';
import { PaperBroker } from '../src/broker/paperBroker.js';

function makeBroker(price = 100, balance = 1000) {
  return new PaperBroker({
    initialQuoteBalance: balance,
    getMarketPrice: () => price,
    slippage: 0.001, // 0.1 %
    feeRate: 0.001, // 0.1 %
  });
}

describe('PaperBroker', () => {
  it('fills a market buy with slippage and fee', async () => {
    const broker = makeBroker(100, 1000);
    const result = await broker.executeMarketOrder({
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'market',
      quantity: 1,
      clientOrderId: 'test-1',
    });

    expect(result.status).toBe('filled');
    expect(result.avgPrice).toBeCloseTo(100.1); // +0.1 % slippage
    expect(result.fee).toBeCloseTo(0.1001); // 0.1 % of notional
    const balance = await broker.getQuoteBalance('USDT');
    expect(balance).toBeCloseTo(1000 - 100.1 - 0.1001);
    expect(broker.getBaseBalance('BTCUSDT')).toBe(1);
  });

  it('fills a market sell with slippage against the trader', async () => {
    const broker = makeBroker(100, 1000);
    await broker.executeMarketOrder({
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'market',
      quantity: 2,
      clientOrderId: 'buy-1',
    });
    const sell = await broker.executeMarketOrder({
      symbol: 'BTCUSDT',
      side: 'sell',
      type: 'market',
      quantity: 2,
      clientOrderId: 'sell-1',
    });
    expect(sell.avgPrice).toBeCloseTo(99.9); // -0.1 % slippage
    expect(broker.getBaseBalance('BTCUSDT')).toBe(0);
  });

  it('rejects a buy exceeding the virtual balance', async () => {
    const broker = makeBroker(100, 50);
    await expect(
      broker.executeMarketOrder({
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        quantity: 1,
        clientOrderId: 'too-big',
      }),
    ).rejects.toThrow(/insufficient balance/);
  });

  it('rejects selling more than held', async () => {
    const broker = makeBroker(100, 1000);
    await expect(
      broker.executeMarketOrder({
        symbol: 'BTCUSDT',
        side: 'sell',
        type: 'market',
        quantity: 1,
        clientOrderId: 'no-base',
      }),
    ).rejects.toThrow(/insufficient base balance/);
  });

  it('is idempotent for duplicate clientOrderIds (duplicate-order protection)', async () => {
    const broker = makeBroker(100, 1000);
    const first = await broker.executeMarketOrder({
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'market',
      quantity: 1,
      clientOrderId: 'dup-1',
    });
    const second = await broker.executeMarketOrder({
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'market',
      quantity: 1,
      clientOrderId: 'dup-1',
    });
    expect(second).toBe(first);
    // Balance charged only once
    const balance = await broker.getQuoteBalance('USDT');
    expect(balance).toBeCloseTo(1000 - 100.1 - 0.1001);
    expect(broker.getBaseBalance('BTCUSDT')).toBe(1);
  });

  it('finds orders by clientOrderId', async () => {
    const broker = makeBroker();
    await broker.executeMarketOrder({
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'market',
      quantity: 0.5,
      clientOrderId: 'lookup-1',
    });
    const found = await broker.getOrderByClientId('BTCUSDT', 'lookup-1');
    expect(found?.executedQty).toBe(0.5);
    expect(await broker.getOrderByClientId('BTCUSDT', 'missing')).toBeNull();
  });

  it('rejects orders without a market price', async () => {
    const broker = new PaperBroker({ initialQuoteBalance: 1000, getMarketPrice: () => 0 });
    await expect(
      broker.executeMarketOrder({
        symbol: 'XXXUSDT',
        side: 'buy',
        type: 'market',
        quantity: 1,
        clientOrderId: 'no-price',
      }),
    ).rejects.toThrow(/no market price/);
  });
});
