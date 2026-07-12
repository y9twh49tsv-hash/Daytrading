import fs from 'node:fs';
import { BinanceClient } from './binance.js';
import { getSignal } from './strategy.js';
import { canTrade, floorToStep, symbolRules } from './risk.js';

function loadEnv(path = '.env') {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i > 0 && process.env[s.slice(0, i)] === undefined) process.env[s.slice(0, i)] = s.slice(i + 1);
  }
}
loadEnv();

const n = (k, d) => Number(process.env[k] ?? d);
const b = (k, d) => String(process.env[k] ?? d).toLowerCase() === 'true';
const cfg = {
  symbol: process.env.SYMBOL ?? 'BTCUSDT', baseAsset: process.env.BASE_ASSET ?? 'BTC', quoteAsset: process.env.QUOTE_ASSET ?? 'USDT',
  interval: process.env.INTERVAL ?? '1m', candleLimit: n('CANDLE_LIMIT', 200), loopSeconds: n('LOOP_SECONDS', 20),
  dryRun: b('DRY_RUN', true), tradeQuoteAmount: n('TRADE_QUOTE_AMOUNT', 25), maxPositionQuote: n('MAX_POSITION_QUOTE', 50),
  maxDailyLossQuote: n('MAX_DAILY_LOSS_QUOTE', 10), stopLossPct: n('STOP_LOSS_PCT', 0.008), takeProfitPct: n('TAKE_PROFIT_PCT', 0.012),
  cooldownMinutes: n('COOLDOWN_MINUTES', 10), fastEma: n('FAST_EMA', 9), slowEma: n('SLOW_EMA', 21), rsiPeriod: n('RSI_PERIOD', 14),
  rsiBuyMax: n('RSI_BUY_MAX', 62), rsiSellMin: n('RSI_SELL_MIN', 72), stateFile: process.env.STATE_FILE ?? './state.json', killSwitchFile: process.env.KILL_SWITCH_FILE ?? './STOP'
};
const client = new BinanceClient({ apiKey: process.env.BINANCE_API_KEY, apiSecret: process.env.BINANCE_API_SECRET, baseUrl: process.env.BINANCE_BASE_URL ?? 'https://testnet.binance.vision' });
const defaultState = { date: new Date().toISOString().slice(0,10), positionQty: 0, entryPrice: 0, realizedPnlToday: 0, lastTradeAt: 0 };
let state = fs.existsSync(cfg.stateFile) ? { ...defaultState, ...JSON.parse(fs.readFileSync(cfg.stateFile, 'utf8')) } : defaultState;
const save = () => fs.writeFileSync(cfg.stateFile, JSON.stringify(state, null, 2));
const log = (event, extra={}) => console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...extra }));

async function execute(side, qty, price, reason) {
  if (cfg.dryRun) log('DRY_RUN_ORDER', { side, qty, price, reason });
  else {
    const result = await client.order(cfg.symbol, side, qty);
    log('LIVE_ORDER', { side, orderId: result.orderId, status: result.status, reason });
  }
  if (side === 'BUY') { state.positionQty = qty; state.entryPrice = price; }
  else {
    state.realizedPnlToday += (price - state.entryPrice) * qty;
    state.positionQty = 0; state.entryPrice = 0;
  }
  state.lastTradeAt = Date.now(); save();
}

async function cycle(rules) {
  if (fs.existsSync(cfg.killSwitchFile)) { log('KILL_SWITCH', { file: cfg.killSwitchFile }); return; }
  const today = new Date().toISOString().slice(0,10);
  if (state.date !== today) { state = { ...defaultState, date: today }; save(); }
  const raw = await client.klines(cfg.symbol, cfg.interval, cfg.candleLimit);
  const closes = raw.map(k => Number(k[4]));
  const price = closes.at(-1);
  const positionValue = state.positionQty * price;

  if (state.positionQty > 0) {
    const change = (price - state.entryPrice) / state.entryPrice;
    if (change <= -cfg.stopLossPct) return execute('SELL', state.positionQty, price, 'Stop-Loss');
    if (change >= cfg.takeProfitPct) return execute('SELL', state.positionQty, price, 'Take-Profit');
  }

  const signal = getSignal(closes, cfg);
  log('TICK', { symbol: cfg.symbol, price, signal, positionQty: state.positionQty, positionValue, pnlToday: state.realizedPnlToday, dryRun: cfg.dryRun });
  const [allowed, why] = canTrade({ state, cfg });
  if (!allowed) return log('RISK_BLOCK', { reason: why });

  if (signal.action === 'BUY' && state.positionQty === 0) {
    const quote = Math.min(cfg.tradeQuoteAmount, cfg.maxPositionQuote);
    let qty = floorToStep(quote / price, rules.stepSize);
    if (qty < rules.minQty || qty * price < rules.minNotional) return log('ORDER_BLOCK', { reason: 'Mindestmenge/-notional nicht erreicht', qty });
    await execute('BUY', qty, price, signal.reason);
  } else if (signal.action === 'SELL' && state.positionQty > 0) {
    await execute('SELL', state.positionQty, price, signal.reason);
  }
}

async function main() {
  log('START', { cfg: { ...cfg, apiSecret: undefined } });
  const rules = symbolRules(await client.exchangeInfo(cfg.symbol));
  log('SYMBOL_RULES', rules);
  while (true) {
    try { await cycle(rules); }
    catch (err) {
      log('ERROR', { message: err.message, status: err.status });
      const wait = err.status === 429 ? Math.max(cfg.loopSeconds, err.retryAfter ?? 60) : cfg.loopSeconds;
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    await new Promise(r => setTimeout(r, cfg.loopSeconds * 1000));
  }
}
main().catch(err => { console.error(err); process.exit(1); });
