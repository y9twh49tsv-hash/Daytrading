import type {
  BOT_STATUSES,
  COMMAND_STATUSES,
  COMMAND_TYPES,
  EVENT_LEVELS,
  EXIT_REASONS,
  ORDER_SIDES,
  ORDER_STATUSES,
  ORDER_TYPES,
  POSITION_SIDES,
  POSITION_STATUSES,
  STRATEGIES,
  TIMEFRAMES,
  TRADING_MODES,
} from './constants.js';

export type BotStatus = (typeof BOT_STATUSES)[number];
export type TradingMode = (typeof TRADING_MODES)[number];
export type CommandType = (typeof COMMAND_TYPES)[number];
export type CommandStatus = (typeof COMMAND_STATUSES)[number];
export type EventLevel = (typeof EVENT_LEVELS)[number];
export type OrderSide = (typeof ORDER_SIDES)[number];
export type OrderType = (typeof ORDER_TYPES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PositionStatus = (typeof POSITION_STATUSES)[number];
export type PositionSide = (typeof POSITION_SIDES)[number];
export type Timeframe = (typeof TIMEFRAMES)[number];
export type StrategyName = (typeof STRATEGIES)[number];
export type ExitReason = (typeof EXIT_REASONS)[number];

// ---------------------------------------------------------------------------
// Database row types (mirror supabase/migrations)
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  email: string;
  created_at: string;
}

export interface BotInstance {
  id: string;
  user_id: string;
  name: string;
  symbol: string;
  status: BotStatus;
  mode: TradingMode;
  strategy: StrategyName;
  created_at: string;
  updated_at: string;
  last_heartbeat_at: string | null;
}

export interface BotSettings {
  id: string;
  bot_id: string;
  timeframe: Timeframe;
  quote_amount: number;
  max_position_size: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  trailing_stop_percent: number | null;
  max_daily_loss_percent: number;
  max_daily_trades: number;
  cooldown_minutes: number;
  minimum_signal_score: number;
  updated_at: string;
}

export interface Position {
  id: string;
  bot_id: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  entry_price: number;
  current_price: number | null;
  stop_loss_price: number | null;
  take_profit_price: number | null;
  status: PositionStatus;
  opened_at: string;
  closed_at: string | null;
  realized_pnl: number | null;
  fees: number;
}

export interface OrderRow {
  id: string;
  bot_id: string;
  binance_order_id: number | null;
  client_order_id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price: number | null;
  status: OrderStatus;
  raw_response: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TradeRow {
  id: string;
  bot_id: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  entry_price: number;
  exit_price: number;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
  reason: ExitReason | string;
  opened_at: string;
  closed_at: string;
}

export interface BotEvent {
  id: string;
  bot_id: string;
  level: EventLevel;
  event_type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DailyRisk {
  id: string;
  bot_id: string;
  trading_date: string;
  starting_balance: number;
  current_balance: number;
  realized_pnl: number;
  unrealized_pnl: number;
  trade_count: number;
  loss_limit_reached: boolean;
}

export interface SystemCommand {
  id: string;
  bot_id: string;
  command: CommandType;
  status: CommandStatus;
  requested_by: string | null;
  created_at: string;
  processed_at: string | null;
  error_message: string | null;
}

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  /** true once the kline is final (candle closed) */
  isClosed: boolean;
}

// ---------------------------------------------------------------------------
// Strategy contract
// ---------------------------------------------------------------------------

export type SignalAction = 'enter_long' | 'exit_long' | 'hold';

export interface StrategySignal {
  action: SignalAction;
  /** 0..1 confidence score; entries below minimum_signal_score are ignored */
  score: number;
  reason: string;
  indicators?: Record<string, number>;
}

export interface StrategyContext {
  candles: Candle[];
  hasOpenPosition: boolean;
}

/**
 * Strategy interface — implement this to add new strategies.
 * Strategies are pure: they receive candles and return a signal.
 */
export interface Strategy {
  readonly name: StrategyName;
  /** Minimum number of closed candles required before signals are produced. */
  readonly warmupCandles: number;
  evaluate(ctx: StrategyContext): StrategySignal;
}

// ---------------------------------------------------------------------------
// Risk types
// ---------------------------------------------------------------------------

export interface RiskLimits {
  maxPositionSize: number;
  maxDailyLossPercent: number;
  maxDailyTrades: number;
  cooldownMinutes: number;
}

export interface RiskState {
  startingBalance: number;
  currentBalance: number;
  realizedPnlToday: number;
  tradesToday: number;
  lastTradeClosedAt: number | null;
  lossLimitReached: boolean;
}

export type RiskCheckResult = { allowed: true } | { allowed: false; reason: string };

// ---------------------------------------------------------------------------
// Broker contract (shared by PaperBroker and BinanceTestnetBroker)
// ---------------------------------------------------------------------------

export interface BrokerOrderRequest {
  symbol: string;
  side: OrderSide;
  type: 'market';
  quantity: number;
  clientOrderId: string;
}

export interface BrokerOrderResult {
  clientOrderId: string;
  exchangeOrderId: number | null;
  symbol: string;
  side: OrderSide;
  executedQty: number;
  /** average fill price */
  avgPrice: number;
  fee: number;
  status: OrderStatus;
  raw: Record<string, unknown>;
}

export interface SymbolFilters {
  symbol: string;
  /** LOT_SIZE */
  minQty: number;
  maxQty: number;
  stepSize: number;
  /** PRICE_FILTER */
  minPrice: number;
  maxPrice: number;
  tickSize: number;
  /** MIN_NOTIONAL / NOTIONAL */
  minNotional: number;
  baseAsset: string;
  quoteAsset: string;
  baseAssetPrecision: number;
  quoteAssetPrecision: number;
}

// ---------------------------------------------------------------------------
// Health check response
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  uptimeSeconds: number;
  version: string;
  database: 'connected' | 'disconnected';
  binance: 'connected' | 'disconnected' | 'disabled';
  lastHeartbeatAt: string | null;
  killSwitch: boolean;
  paperTrading: boolean;
}
