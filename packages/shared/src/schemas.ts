import { z } from 'zod';
import {
  BOT_STATUSES,
  COMMAND_STATUSES,
  COMMAND_TYPES,
  STRATEGIES,
  TIMEFRAMES,
  TRADING_MODES,
} from './constants.js';

export const botStatusSchema = z.enum(BOT_STATUSES);
export const tradingModeSchema = z.enum(TRADING_MODES);
export const commandTypeSchema = z.enum(COMMAND_TYPES);
export const commandStatusSchema = z.enum(COMMAND_STATUSES);
export const timeframeSchema = z.enum(TIMEFRAMES);
export const strategyNameSchema = z.enum(STRATEGIES);

/** Symbol like BTCUSDT — uppercase alphanumerics only. */
export const symbolSchema = z
  .string()
  .min(5)
  .max(20)
  .regex(/^[A-Z0-9]+$/, 'Symbol must be uppercase, e.g. BTCUSDT');

export const createBotSchema = z.object({
  name: z.string().min(1).max(60),
  symbol: symbolSchema,
  // Live trading uses REAL funds and must be enabled in the worker via
  // ALLOW_LIVE_TRADING; the risk controls still apply.
  mode: z.enum(['paper', 'testnet', 'live']),
  strategy: strategyNameSchema.default('ema_rsi'),
});

export const botSettingsSchema = z.object({
  timeframe: timeframeSchema.default('1m'),
  quote_amount: z.coerce.number().positive().max(1_000_000),
  max_position_size: z.coerce.number().positive().max(10_000_000),
  stop_loss_percent: z.coerce.number().positive().max(50),
  take_profit_percent: z.coerce.number().positive().max(100),
  trailing_stop_percent: z.coerce.number().positive().max(50).nullable().optional(),
  max_daily_loss_percent: z.coerce.number().positive().max(100),
  max_daily_trades: z.coerce.number().int().positive().max(1000),
  cooldown_minutes: z.coerce.number().int().min(0).max(1440),
  minimum_signal_score: z.coerce.number().min(0).max(1),
});

export const createCommandSchema = z.object({
  bot_id: z.string().uuid(),
  command: commandTypeSchema,
});

export type CreateBotInput = z.infer<typeof createBotSchema>;
export type BotSettingsInput = z.infer<typeof botSettingsSchema>;
export type CreateCommandInput = z.infer<typeof createCommandSchema>;
