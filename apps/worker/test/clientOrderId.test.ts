import { describe, expect, it } from 'vitest';
import { entryClientOrderId, exitClientOrderId } from '../src/engine/clientOrderId.js';

const BINANCE_CLIENT_ID = /^[a-zA-Z0-9\-_]{1,36}$/;

describe('clientOrderId (duplicate-order protection)', () => {
  it('is deterministic per bot and candle — retries produce the same id', () => {
    const a = entryClientOrderId('11111111-2222-3333-4444-555555555555', 1735732800000);
    const b = entryClientOrderId('11111111-2222-3333-4444-555555555555', 1735732800000);
    expect(a).toBe(b);
  });

  it('differs across candles and bots', () => {
    const bot1 = '11111111-2222-3333-4444-555555555555';
    const bot2 = '99999999-8888-7777-6666-555555555555';
    expect(entryClientOrderId(bot1, 1000)).not.toBe(entryClientOrderId(bot1, 2000));
    expect(entryClientOrderId(bot1, 1000)).not.toBe(entryClientOrderId(bot2, 1000));
  });

  it('conforms to the Binance clientOrderId format', () => {
    const entry = entryClientOrderId('11111111-2222-3333-4444-555555555555', Date.now());
    const exit = exitClientOrderId('11111111-2222-3333-4444-555555555555', 'stop_loss', Date.now());
    expect(entry).toMatch(BINANCE_CLIENT_ID);
    expect(exit).toMatch(BINANCE_CLIENT_ID);
    expect(entry.length).toBeLessThanOrEqual(36);
    expect(exit.length).toBeLessThanOrEqual(36);
  });

  it('exit ids embed a sanitized reason tag', () => {
    const id = exitClientOrderId('11111111-2222-3333-4444-555555555555', 'take_profit', 123456);
    expect(id).toContain('xtakepr');
  });
});
