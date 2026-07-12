import crypto from 'node:crypto';

export class BinanceClient {
  constructor({ apiKey, apiSecret, baseUrl }) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async request(method, path, params = {}, signed = false) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) query.set(key, String(value));
    }
    if (signed) {
      if (!this.apiKey || !this.apiSecret) throw new Error('API key/secret fehlen.');
      query.set('timestamp', String(Date.now()));
      query.set('recvWindow', '5000');
      const signature = crypto.createHmac('sha256', this.apiSecret).update(query.toString()).digest('hex');
      query.set('signature', signature);
    }
    const url = `${this.baseUrl}${path}${query.size ? `?${query}` : ''}`;
    const response = await fetch(url, {
      method,
      headers: this.apiKey ? { 'X-MBX-APIKEY': this.apiKey } : {},
      signal: AbortSignal.timeout(15000)
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      const err = new Error(`Binance ${response.status}: ${data.msg ?? text}`);
      err.status = response.status;
      err.retryAfter = retryAfter ? Number(retryAfter) : null;
      throw err;
    }
    return data;
  }

  klines(symbol, interval, limit = 200) {
    return this.request('GET', '/api/v3/klines', { symbol, interval, limit });
  }

  exchangeInfo(symbol) {
    return this.request('GET', '/api/v3/exchangeInfo', { symbol });
  }

  account() {
    return this.request('GET', '/api/v3/account', {}, true);
  }

  order(symbol, side, quantity) {
    return this.request('POST', '/api/v3/order', {
      symbol,
      side,
      type: 'MARKET',
      quantity: quantity.toFixed(8),
      newOrderRespType: 'FULL'
    }, true);
  }
}
