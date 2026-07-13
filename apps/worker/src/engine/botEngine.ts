import type {
  BotInstance,
  BotSettings,
  Candle,
  DailyRisk,
  ExitReason,
  Position,
  Strategy,
  SymbolFilters,
} from '@daytrading/shared';
import { HEARTBEAT_INTERVAL_MS } from '@daytrading/shared';
import type { Broker } from '../broker/types.js';
import type { BinanceRest } from '../binance/rest.js';
import { klineToCandle } from '../binance/rest.js';
import { KlineStream } from '../binance/ws.js';
import { validateOrder } from '../binance/filters.js';
import type { Db } from '../db.js';
import type { Logger } from '../logger.js';
import type { WorkerConfig } from '../config.js';
import { checkEntryAllowed, checkExit, isDailyLossLimitReached } from '../risk/riskManager.js';
import {
  calculatePositionSize,
  stopLossPrice,
  takeProfitPrice,
  trailingStopPrice,
} from '../risk/positionSizing.js';
import { entryClientOrderId, exitClientOrderId } from './clientOrderId.js';

const MAX_CANDLES = 500;
const REST_FALLBACK_POLL_MS = 15_000;

export interface BotEngineDeps {
  db: Db;
  rest: BinanceRest;
  broker: Broker;
  strategy: Strategy;
  log: Logger;
  config: WorkerConfig;
  /** WebSocket base URL matching this bot's market (testnet or live). */
  wsBaseUrl: string;
  /** Called on every price update (used to feed the paper broker). */
  onPrice?: (symbol: string, price: number) => void;
}

/**
 * Runs a single bot: market data, strategy, risk checks, order execution and
 * persistence. One engine instance per bot_instances row.
 */
export class BotEngine {
  private candles: Candle[] = [];
  private filters: SymbolFilters | null = null;
  private stream: KlineStream | null = null;
  private position: Position | null = null;
  private dailyRisk: DailyRisk | null = null;
  private highestPriceSinceEntry = 0;
  private lastTradeClosedAt: number | null = null;
  private lastPrice = 0;
  private paused = false;
  private stopping = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private restFallbackTimer: NodeJS.Timeout | null = null;
  private processingCandle = false;

  constructor(
    readonly bot: BotInstance,
    private settings: BotSettings,
    private readonly deps: BotEngineDeps,
  ) {}

  get isRunning(): boolean {
    return !this.stopping;
  }

  wsConnected(): boolean {
    return this.stream?.connected ?? false;
  }

  updateSettings(settings: BotSettings): void {
    this.settings = settings;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    const { db, rest, broker, log } = this.deps;
    await db.setBotStatus(this.bot.id, 'starting');
    await db.logEvent(this.bot.id, 'info', 'bot_starting', `Bot ${this.bot.name} starting`, {
      mode: this.bot.mode,
      symbol: this.bot.symbol,
    });

    // 1. Exchange rules
    this.filters = await rest.getExchangeInfo(this.bot.symbol);

    // 2. Historical candles for indicator warm-up
    const klines = await rest.getKlines(this.bot.symbol, this.settings.timeframe, 200);
    this.candles = klines.map(klineToCandle);
    const last = this.candles[this.candles.length - 1];
    if (last) {
      this.lastPrice = last.close;
      this.deps.onPrice?.(this.bot.symbol, last.close);
    }

    // 3. Reconstruct state: open position + daily risk
    this.position = await db.getOpenPosition(this.bot.id, this.bot.symbol);
    if (this.position) {
      this.highestPriceSinceEntry = Math.max(this.position.entry_price, this.lastPrice);
      log.info('reconstructed open position', {
        botId: this.bot.id,
        entryPrice: this.position.entry_price,
        quantity: this.position.quantity,
      });
    }
    const balance = await broker.getQuoteBalance(this.quoteAsset());
    this.dailyRisk = await db.getOrCreateDailyRisk(this.bot.id, balance);

    // 4. Reconcile exchange orders vs local DB
    await this.reconcileOrders();

    // 5. Market data stream
    this.stream = new KlineStream({
      wsBaseUrl: this.deps.wsBaseUrl,
      symbol: this.bot.symbol,
      interval: this.settings.timeframe,
      logger: log,
      onCandle: (candle) => void this.onCandle(candle),
      onStatusChange: (connected) => {
        void db.logEvent(
          this.bot.id,
          connected ? 'info' : 'warn',
          connected ? 'ws_connected' : 'ws_disconnected',
          connected
            ? 'Market data stream connected'
            : 'Market data stream lost — REST fallback active',
        );
        this.toggleRestFallback(!connected);
      },
    });
    this.stream.start();

    // 6. Heartbeat
    this.heartbeatTimer = setInterval(() => {
      void this.deps.db.heartbeat(this.bot.id);
    }, HEARTBEAT_INTERVAL_MS);
    await db.heartbeat(this.bot.id);

    this.paused = false;
    this.stopping = false;
    await db.setBotStatus(this.bot.id, 'running');
    await db.logEvent(this.bot.id, 'info', 'bot_started', `Bot ${this.bot.name} running`);
  }

  async pause(): Promise<void> {
    this.paused = true;
    await this.deps.db.setBotStatus(this.bot.id, 'paused');
    await this.deps.db.logEvent(this.bot.id, 'info', 'bot_paused', 'Bot paused — no new entries');
  }

  async resume(): Promise<void> {
    this.paused = false;
    await this.deps.db.setBotStatus(this.bot.id, 'running');
    await this.deps.db.logEvent(this.bot.id, 'info', 'bot_resumed', 'Bot resumed');
  }

  /** Stop the bot. Optionally close any open position first. */
  async stop(closePosition: boolean, reason: ExitReason = 'shutdown'): Promise<void> {
    this.stopping = true;
    if (closePosition && this.position) {
      try {
        await this.closeOpenPosition(reason);
      } catch (err) {
        await this.deps.db.logEvent(this.bot.id, 'error', 'close_failed', errMsg(err));
      }
    }
    this.teardown();
    await this.deps.db.setBotStatus(this.bot.id, 'stopped');
    await this.deps.db.logEvent(this.bot.id, 'info', 'bot_stopped', 'Bot stopped');
  }

  async emergencyStop(): Promise<void> {
    await this.deps.db.logEvent(
      this.bot.id,
      'critical',
      'emergency_stop',
      'EMERGENCY STOP triggered — closing position and halting',
    );
    await this.stop(true, 'emergency_stop');
  }

  async manualClose(): Promise<void> {
    if (!this.position) {
      await this.deps.db.logEvent(this.bot.id, 'info', 'close_noop', 'No open position to close');
      return;
    }
    await this.closeOpenPosition('manual_close');
  }

  /** Graceful shutdown: never opens new orders, keeps position, stops timers. */
  shutdown(): void {
    this.stopping = true;
    this.teardown();
  }

  private teardown(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.toggleRestFallback(false);
    this.stream?.stop();
    this.stream = null;
  }

  // -------------------------------------------------------------------------
  // Market data handling
  // -------------------------------------------------------------------------

  private toggleRestFallback(enable: boolean): void {
    if (enable && !this.restFallbackTimer && !this.stopping) {
      this.restFallbackTimer = setInterval(
        () => void this.pollRestCandles(),
        REST_FALLBACK_POLL_MS,
      );
    } else if (!enable && this.restFallbackTimer) {
      clearInterval(this.restFallbackTimer);
      this.restFallbackTimer = null;
    }
  }

  private async pollRestCandles(): Promise<void> {
    try {
      const klines = await this.deps.rest.getKlines(this.bot.symbol, this.settings.timeframe, 3);
      for (const k of klines.slice(0, -1)) {
        const candle = klineToCandle(k);
        const known = this.candles.some((c) => c.isClosed && c.openTime === candle.openTime);
        if (!known) await this.onCandle(candle);
      }
      const latest = klines[klines.length - 1];
      if (latest) this.lastPrice = Number(latest[4]);
    } catch (err) {
      this.deps.log.warn('REST fallback poll failed', { botId: this.bot.id, error: errMsg(err) });
    }
  }

  private async onCandle(candle: Candle): Promise<void> {
    if (this.stopping) return;
    this.lastPrice = candle.close;
    this.deps.onPrice?.(this.bot.symbol, candle.close);

    // Live (unclosed) updates: track price, manage exits
    if (this.position) {
      this.highestPriceSinceEntry = Math.max(this.highestPriceSinceEntry, candle.close);
      await this.managePositionExits(candle.close);
    }

    if (!candle.isClosed) return;

    // Store closed candle
    const existing = this.candles.findIndex((c) => c.openTime === candle.openTime);
    if (existing >= 0) this.candles[existing] = candle;
    else this.candles.push(candle);
    this.candles.sort((a, b) => a.openTime - b.openTime);
    if (this.candles.length > MAX_CANDLES)
      this.candles.splice(0, this.candles.length - MAX_CANDLES);

    // Only evaluate strategy on candle close, one at a time
    if (this.processingCandle) return;
    this.processingCandle = true;
    try {
      await this.evaluateStrategy(candle);
      await this.updateDailyRiskSnapshot();
    } catch (err) {
      this.deps.log.error('candle processing failed', { botId: this.bot.id, error: errMsg(err) });
      await this.deps.db.logEvent(this.bot.id, 'error', 'engine_error', errMsg(err));
    } finally {
      this.processingCandle = false;
    }
  }

  // -------------------------------------------------------------------------
  // Strategy & entries
  // -------------------------------------------------------------------------

  private async evaluateStrategy(closedCandle: Candle): Promise<void> {
    const signal = this.deps.strategy.evaluate({
      candles: this.candles.filter((c) => c.isClosed),
      hasOpenPosition: this.position !== null,
    });

    if (signal.action === 'exit_long' && this.position) {
      await this.closeOpenPosition('opposite_signal');
      return;
    }

    if (signal.action !== 'enter_long') return;
    if (this.paused || this.stopping) return;
    if (this.position) return; // only one open position per bot & symbol
    if (signal.score < this.settings.minimum_signal_score) {
      await this.deps.db.logEvent(this.bot.id, 'debug', 'signal_below_score', signal.reason, {
        score: signal.score,
        minimum: this.settings.minimum_signal_score,
      });
      return;
    }

    // Risk gate
    const risk = this.dailyRisk;
    const riskCheck = checkEntryAllowed(
      {
        maxPositionSize: this.settings.max_position_size,
        maxDailyLossPercent: this.settings.max_daily_loss_percent,
        maxDailyTrades: this.settings.max_daily_trades,
        cooldownMinutes: this.settings.cooldown_minutes,
      },
      {
        startingBalance: risk?.starting_balance ?? 0,
        currentBalance: risk?.current_balance ?? 0,
        realizedPnlToday: risk?.realized_pnl ?? 0,
        tradesToday: risk?.trade_count ?? 0,
        lastTradeClosedAt: this.lastTradeClosedAt,
        lossLimitReached: risk?.loss_limit_reached ?? false,
      },
      { killSwitch: this.deps.config.KILL_SWITCH },
    );
    if (!riskCheck.allowed) {
      await this.deps.db.logEvent(this.bot.id, 'info', 'entry_blocked', riskCheck.reason, {
        signal: signal.reason,
      });
      return;
    }

    await this.openPosition(closedCandle, signal.score, signal.indicators);
  }

  private async openPosition(
    candle: Candle,
    score: number,
    indicators?: Record<string, number>,
  ): Promise<void> {
    const { db, broker, log } = this.deps;
    if (!this.filters) throw new Error('filters not loaded');

    const balance = await broker.getQuoteBalance(this.quoteAsset());
    const sizing = calculatePositionSize({
      quoteAmount: this.settings.quote_amount,
      maxPositionSize: this.settings.max_position_size,
      price: candle.close,
      availableBalance: balance,
      filters: this.filters,
    });
    if (!sizing.ok) {
      await db.logEvent(this.bot.id, 'warn', 'sizing_rejected', sizing.reason);
      return;
    }

    const validation = validateOrder(this.filters, sizing.quantity, candle.close);
    if (!validation.valid) {
      await db.logEvent(this.bot.id, 'warn', 'filter_rejected', validation.reason);
      return;
    }

    // Deterministic id per candle → duplicate-order protection
    const clientOrderId = entryClientOrderId(this.bot.id, candle.closeTime);
    if (await db.orderExists(clientOrderId)) {
      await db.logEvent(this.bot.id, 'warn', 'duplicate_order_blocked', clientOrderId);
      return;
    }

    await db.insertOrder({
      bot_id: this.bot.id,
      binance_order_id: null,
      client_order_id: clientOrderId,
      symbol: this.bot.symbol,
      side: 'buy',
      type: 'market',
      quantity: validation.quantity,
      price: candle.close,
      status: 'pending',
      raw_response: null,
    });

    let result;
    try {
      result = await broker.executeMarketOrder({
        symbol: this.bot.symbol,
        side: 'buy',
        type: 'market',
        quantity: validation.quantity,
        clientOrderId,
      });
    } catch (err) {
      await db.updateOrderByClientId(clientOrderId, { status: 'failed' });
      await db.logEvent(this.bot.id, 'error', 'entry_order_failed', errMsg(err));
      return;
    }

    await db.updateOrderByClientId(clientOrderId, {
      binance_order_id: result.exchangeOrderId,
      status: result.status,
      price: result.avgPrice,
      raw_response: result.raw,
    });

    if (result.status !== 'filled' || result.executedQty <= 0) {
      await db.logEvent(this.bot.id, 'warn', 'entry_not_filled', `status=${result.status}`);
      return;
    }

    const sl = stopLossPrice(result.avgPrice, this.settings.stop_loss_percent);
    const tp = takeProfitPrice(result.avgPrice, this.settings.take_profit_percent);
    this.position = await db.insertPosition({
      bot_id: this.bot.id,
      symbol: this.bot.symbol,
      side: 'long',
      quantity: result.executedQty,
      entry_price: result.avgPrice,
      current_price: result.avgPrice,
      stop_loss_price: sl,
      take_profit_price: tp,
      status: 'open',
      opened_at: new Date().toISOString(),
      closed_at: null,
      realized_pnl: null,
      fees: result.fee,
    });
    this.highestPriceSinceEntry = result.avgPrice;

    log.info('position opened', {
      botId: this.bot.id,
      qty: result.executedQty,
      entry: result.avgPrice,
    });
    await db.logEvent(
      this.bot.id,
      'info',
      'position_opened',
      `Long ${result.executedQty} ${this.bot.symbol} @ ${result.avgPrice.toFixed(8)}`,
      { score, stopLoss: sl, takeProfit: tp, ...(indicators ?? {}) },
    );
  }

  // -------------------------------------------------------------------------
  // Exits
  // -------------------------------------------------------------------------

  private async managePositionExits(currentPrice: number): Promise<void> {
    const pos = this.position;
    if (!pos) return;

    // Trailing stop ratchets the stop upward
    let trailingActive = false;
    let effectiveStop = pos.stop_loss_price;
    if (this.settings.trailing_stop_percent && effectiveStop !== null) {
      const newStop = trailingStopPrice(
        this.highestPriceSinceEntry,
        this.settings.trailing_stop_percent,
        effectiveStop,
      );
      if (newStop > effectiveStop) {
        effectiveStop = newStop;
        trailingActive = true;
        pos.stop_loss_price = newStop;
        await this.deps.db.updatePosition(pos.id, {
          stop_loss_price: newStop,
          current_price: currentPrice,
        });
      }
    }

    const exit = checkExit({
      currentPrice,
      stopLossPrice: effectiveStop,
      takeProfitPrice: pos.take_profit_price,
      trailingStopActive: trailingActive,
    });
    if (exit.shouldExit) {
      await this.closeOpenPosition(exit.reason);
    }
  }

  private async closeOpenPosition(reason: ExitReason): Promise<void> {
    const { db, broker } = this.deps;
    const pos = this.position;
    if (!pos || !this.filters) return;

    const clientOrderId = exitClientOrderId(this.bot.id, reason, Date.now());
    const validation = validateOrder(this.filters, pos.quantity, this.lastPrice || pos.entry_price);
    const quantity = validation.valid ? validation.quantity : pos.quantity;

    await db.insertOrder({
      bot_id: this.bot.id,
      binance_order_id: null,
      client_order_id: clientOrderId,
      symbol: pos.symbol,
      side: 'sell',
      type: 'market',
      quantity,
      price: this.lastPrice || null,
      status: 'pending',
      raw_response: null,
    });

    let result;
    try {
      result = await broker.executeMarketOrder({
        symbol: pos.symbol,
        side: 'sell',
        type: 'market',
        quantity,
        clientOrderId,
      });
    } catch (err) {
      await db.updateOrderByClientId(clientOrderId, { status: 'failed' });
      await db.logEvent(this.bot.id, 'error', 'exit_order_failed', errMsg(err), { reason });
      throw err;
    }

    await db.updateOrderByClientId(clientOrderId, {
      binance_order_id: result.exchangeOrderId,
      status: result.status,
      price: result.avgPrice,
      raw_response: result.raw,
    });

    const exitPrice = result.avgPrice || this.lastPrice || pos.entry_price;
    const grossPnl = (exitPrice - pos.entry_price) * result.executedQty;
    const totalFees = pos.fees + result.fee;
    const netPnl = grossPnl - totalFees;
    const closedAt = new Date().toISOString();

    await db.updatePosition(pos.id, {
      status: 'closed',
      closed_at: closedAt,
      current_price: exitPrice,
      realized_pnl: netPnl,
      fees: totalFees,
    });

    await db.insertTrade({
      bot_id: this.bot.id,
      symbol: pos.symbol,
      side: 'long',
      quantity: result.executedQty,
      entry_price: pos.entry_price,
      exit_price: exitPrice,
      gross_pnl: grossPnl,
      fees: totalFees,
      net_pnl: netPnl,
      reason,
      opened_at: pos.opened_at,
      closed_at: closedAt,
    });

    this.position = null;
    this.highestPriceSinceEntry = 0;
    this.lastTradeClosedAt = Date.now();

    await this.applyTradeToDailyRisk(netPnl);
    await db.logEvent(
      this.bot.id,
      'info',
      'position_closed',
      `Closed ${result.executedQty} ${pos.symbol} @ ${exitPrice.toFixed(8)} (${reason})`,
      { grossPnl, netPnl, fees: totalFees, reason },
    );
  }

  // -------------------------------------------------------------------------
  // Daily risk bookkeeping
  // -------------------------------------------------------------------------

  private async applyTradeToDailyRisk(netPnl: number): Promise<void> {
    const { db, broker } = this.deps;
    const balance = await broker.getQuoteBalance(this.quoteAsset());
    this.dailyRisk = await db.getOrCreateDailyRisk(this.bot.id, balance);
    const risk = this.dailyRisk;

    const realized = risk.realized_pnl + netPnl;
    const tradeCount = risk.trade_count + 1;
    const limitReached = isDailyLossLimitReached(
      risk.starting_balance,
      realized,
      this.settings.max_daily_loss_percent,
    );

    await db.updateDailyRisk(risk.id, {
      realized_pnl: realized,
      trade_count: tradeCount,
      current_balance: balance,
      loss_limit_reached: limitReached,
    });
    this.dailyRisk = {
      ...risk,
      realized_pnl: realized,
      trade_count: tradeCount,
      current_balance: balance,
      loss_limit_reached: limitReached,
    };

    if (limitReached && !risk.loss_limit_reached) {
      await db.logEvent(
        this.bot.id,
        'warn',
        'daily_loss_limit',
        'Daily loss limit reached — no further entries today',
        { realizedPnl: realized },
      );
    }
  }

  private async updateDailyRiskSnapshot(): Promise<void> {
    const risk = this.dailyRisk;
    if (!risk) return;
    const pos = this.position;
    const unrealized = pos ? (this.lastPrice - pos.entry_price) * pos.quantity : 0;
    await this.deps.db.updateDailyRisk(risk.id, { unrealized_pnl: unrealized });
    if (pos) {
      await this.deps.db.updatePosition(pos.id, { current_price: this.lastPrice });
    }
  }

  // -------------------------------------------------------------------------
  // Reconciliation
  // -------------------------------------------------------------------------

  /** Compare open orders in the DB with the exchange and fix mismatches. */
  async reconcileOrders(): Promise<void> {
    const { db, broker } = this.deps;
    try {
      const localOpen = await db.listOpenOrders(this.bot.id);
      for (const order of localOpen) {
        const actual = await broker.getOrderByClientId(order.symbol, order.client_order_id);
        if (!actual) {
          // Order never reached the exchange → mark failed
          if (order.status === 'pending' && broker.kind !== 'paper') {
            await db.updateOrderByClientId(order.client_order_id, { status: 'failed' });
            await db.logEvent(
              this.bot.id,
              'warn',
              'reconcile_order_missing',
              order.client_order_id,
            );
          }
          continue;
        }
        if (actual.status !== order.status) {
          await db.updateOrderByClientId(order.client_order_id, {
            status: actual.status,
            binance_order_id: actual.exchangeOrderId,
            price: actual.avgPrice || order.price,
          });
          await db.logEvent(this.bot.id, 'info', 'reconcile_order_updated', order.client_order_id, {
            from: order.status,
            to: actual.status,
          });
        }
      }
    } catch (err) {
      await db.logEvent(this.bot.id, 'warn', 'reconcile_failed', errMsg(err));
    }
  }

  private quoteAsset(): string {
    return this.filters?.quoteAsset ?? 'USDT';
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
