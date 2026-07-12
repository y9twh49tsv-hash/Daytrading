import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  BotEvent,
  BotInstance,
  BotSettings,
  BotStatus,
  DailyRisk,
  EventLevel,
  OrderRow,
  Position,
  SystemCommand,
  TradeRow,
} from '@daytrading/shared';
import type { WorkerConfig } from './config.js';
import type { Logger } from './logger.js';
import { redact } from './logger.js';

/**
 * Thin repository around Supabase. The worker uses the service-role key,
 * which bypasses RLS — it must therefore never accept unvalidated user input.
 */
export class Db {
  readonly client: SupabaseClient;

  constructor(
    config: WorkerConfig,
    private readonly log: Logger,
  ) {
    this.client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async ping(): Promise<boolean> {
    const { error } = await this.client.from('bot_instances').select('id').limit(1);
    return !error;
  }

  async listBots(): Promise<BotInstance[]> {
    const { data, error } = await this.client.from('bot_instances').select('*');
    if (error) throw new Error(`listBots failed: ${error.message}`);
    return (data ?? []) as BotInstance[];
  }

  async getBotSettings(botId: string): Promise<BotSettings | null> {
    const { data, error } = await this.client
      .from('bot_settings')
      .select('*')
      .eq('bot_id', botId)
      .maybeSingle();
    if (error) throw new Error(`getBotSettings failed: ${error.message}`);
    return data as BotSettings | null;
  }

  async setBotStatus(botId: string, status: BotStatus): Promise<void> {
    const { error } = await this.client.from('bot_instances').update({ status }).eq('id', botId);
    if (error) throw new Error(`setBotStatus failed: ${error.message}`);
  }

  async heartbeat(botId: string): Promise<void> {
    const { error } = await this.client
      .from('bot_instances')
      .update({ last_heartbeat_at: new Date().toISOString() })
      .eq('id', botId);
    if (error) this.log.warn('heartbeat update failed', { botId, error: error.message });
  }

  // -------------------------------------------------------------------------
  // Commands — claimed atomically: UPDATE ... WHERE status='pending' ensures a
  // command is only ever processed once even with multiple workers.
  // -------------------------------------------------------------------------

  async claimNextCommand(): Promise<SystemCommand | null> {
    const { data: pending, error: selError } = await this.client
      .from('system_commands')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);
    if (selError) throw new Error(`claimNextCommand select failed: ${selError.message}`);
    const candidate = (pending ?? [])[0] as SystemCommand | undefined;
    if (!candidate) return null;

    const { data: claimed, error: updError } = await this.client
      .from('system_commands')
      .update({ status: 'processing' })
      .eq('id', candidate.id)
      .eq('status', 'pending')
      .select();
    if (updError) throw new Error(`claimNextCommand update failed: ${updError.message}`);
    const row = (claimed ?? [])[0] as SystemCommand | undefined;
    return row ?? null; // another worker won the race
  }

  async finishCommand(id: string, ok: boolean, errorMessage?: string): Promise<void> {
    const { error } = await this.client
      .from('system_commands')
      .update({
        status: ok ? 'completed' : 'failed',
        processed_at: new Date().toISOString(),
        error_message: errorMessage ?? null,
      })
      .eq('id', id);
    if (error) throw new Error(`finishCommand failed: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  async logEvent(
    botId: string,
    level: EventLevel,
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.client.from('bot_events').insert({
      bot_id: botId,
      level,
      event_type: eventType,
      message,
      metadata: metadata ? (redact(metadata) as Record<string, unknown>) : null,
    });
    if (error) this.log.warn('logEvent failed', { botId, eventType, error: error.message });
  }

  // -------------------------------------------------------------------------
  // Positions
  // -------------------------------------------------------------------------

  async getOpenPosition(botId: string, symbol: string): Promise<Position | null> {
    const { data, error } = await this.client
      .from('positions')
      .select('*')
      .eq('bot_id', botId)
      .eq('symbol', symbol)
      .eq('status', 'open')
      .maybeSingle();
    if (error) throw new Error(`getOpenPosition failed: ${error.message}`);
    return data as Position | null;
  }

  async insertPosition(position: Omit<Position, 'id'>): Promise<Position> {
    const { data, error } = await this.client.from('positions').insert(position).select().single();
    if (error) throw new Error(`insertPosition failed: ${error.message}`);
    return data as Position;
  }

  async updatePosition(id: string, patch: Partial<Position>): Promise<void> {
    const { error } = await this.client.from('positions').update(patch).eq('id', id);
    if (error) throw new Error(`updatePosition failed: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  async orderExists(clientOrderId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('orders')
      .select('id')
      .eq('client_order_id', clientOrderId)
      .maybeSingle();
    if (error) throw new Error(`orderExists failed: ${error.message}`);
    return data !== null;
  }

  async insertOrder(order: Omit<OrderRow, 'id' | 'created_at' | 'updated_at'>): Promise<OrderRow> {
    const { data, error } = await this.client.from('orders').insert(order).select().single();
    if (error) throw new Error(`insertOrder failed: ${error.message}`);
    return data as OrderRow;
  }

  async updateOrderByClientId(clientOrderId: string, patch: Partial<OrderRow>): Promise<void> {
    const { error } = await this.client
      .from('orders')
      .update(patch)
      .eq('client_order_id', clientOrderId);
    if (error) throw new Error(`updateOrderByClientId failed: ${error.message}`);
  }

  async listOpenOrders(botId: string): Promise<OrderRow[]> {
    const { data, error } = await this.client
      .from('orders')
      .select('*')
      .eq('bot_id', botId)
      .in('status', ['new', 'partially_filled', 'pending']);
    if (error) throw new Error(`listOpenOrders failed: ${error.message}`);
    return (data ?? []) as OrderRow[];
  }

  // -------------------------------------------------------------------------
  // Trades
  // -------------------------------------------------------------------------

  async insertTrade(trade: Omit<TradeRow, 'id'>): Promise<void> {
    const { error } = await this.client.from('trades').insert(trade);
    if (error) throw new Error(`insertTrade failed: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // Daily risk
  // -------------------------------------------------------------------------

  async getOrCreateDailyRisk(botId: string, startingBalance: number): Promise<DailyRisk> {
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing, error: selError } = await this.client
      .from('daily_risk')
      .select('*')
      .eq('bot_id', botId)
      .eq('trading_date', today)
      .maybeSingle();
    if (selError) throw new Error(`getOrCreateDailyRisk failed: ${selError.message}`);
    if (existing) return existing as DailyRisk;

    const { data, error } = await this.client
      .from('daily_risk')
      .upsert(
        {
          bot_id: botId,
          trading_date: today,
          starting_balance: startingBalance,
          current_balance: startingBalance,
        },
        { onConflict: 'bot_id,trading_date' },
      )
      .select()
      .single();
    if (error) throw new Error(`getOrCreateDailyRisk insert failed: ${error.message}`);
    return data as DailyRisk;
  }

  async updateDailyRisk(id: string, patch: Partial<DailyRisk>): Promise<void> {
    const { error } = await this.client.from('daily_risk').update(patch).eq('id', id);
    if (error) throw new Error(`updateDailyRisk failed: ${error.message}`);
  }

  async listRecentEvents(botId: string, limit = 50): Promise<BotEvent[]> {
    const { data, error } = await this.client
      .from('bot_events')
      .select('*')
      .eq('bot_id', botId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`listRecentEvents failed: ${error.message}`);
    return (data ?? []) as BotEvent[];
  }
}
