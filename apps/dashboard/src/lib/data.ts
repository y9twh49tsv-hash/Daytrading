import type {
  BotEvent,
  BotInstance,
  BotSettings,
  DailyRisk,
  OrderRow,
  Position,
  SystemCommand,
  TradeRow,
} from '@daytrading/shared';
import { createClient } from '@/lib/supabase/server';

/** All queries run under the user's session — RLS scopes them to own data. */

export async function getBots(): Promise<BotInstance[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('bot_instances')
    .select('*')
    .order('created_at', { ascending: true });
  return (data ?? []) as BotInstance[];
}

export interface BotOverview {
  bot: BotInstance;
  settings: BotSettings | null;
  openPosition: Position | null;
  dailyRisk: DailyRisk | null;
}

export async function getBotOverviews(): Promise<BotOverview[]> {
  const supabase = await createClient();
  const bots = await getBots();
  if (bots.length === 0) return [];

  const botIds = bots.map((b) => b.id);
  const today = new Date().toISOString().slice(0, 10);

  const [settingsRes, positionsRes, riskRes] = await Promise.all([
    supabase.from('bot_settings').select('*').in('bot_id', botIds),
    supabase.from('positions').select('*').in('bot_id', botIds).eq('status', 'open'),
    supabase.from('daily_risk').select('*').in('bot_id', botIds).eq('trading_date', today),
  ]);

  const settings = (settingsRes.data ?? []) as BotSettings[];
  const positions = (positionsRes.data ?? []) as Position[];
  const risks = (riskRes.data ?? []) as DailyRisk[];

  return bots.map((bot) => ({
    bot,
    settings: settings.find((s) => s.bot_id === bot.id) ?? null,
    openPosition: positions.find((p) => p.bot_id === bot.id) ?? null,
    dailyRisk: risks.find((r) => r.bot_id === bot.id) ?? null,
  }));
}

export async function getTrades(botId?: string, limit = 100): Promise<TradeRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from('trades')
    .select('*')
    .order('closed_at', { ascending: false })
    .limit(limit);
  if (botId) query = query.eq('bot_id', botId);
  const { data } = await query;
  return (data ?? []) as TradeRow[];
}

export async function getOrders(botId?: string, limit = 100): Promise<OrderRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (botId) query = query.eq('bot_id', botId);
  const { data } = await query;
  return (data ?? []) as OrderRow[];
}

export async function getEvents(botId?: string, level?: string, limit = 200): Promise<BotEvent[]> {
  const supabase = await createClient();
  let query = supabase
    .from('bot_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (botId) query = query.eq('bot_id', botId);
  if (level) query = query.eq('level', level);
  const { data } = await query;
  return (data ?? []) as BotEvent[];
}

export async function getDailyRiskHistory(botId?: string, limit = 30): Promise<DailyRisk[]> {
  const supabase = await createClient();
  let query = supabase
    .from('daily_risk')
    .select('*')
    .order('trading_date', { ascending: false })
    .limit(limit);
  if (botId) query = query.eq('bot_id', botId);
  const { data } = await query;
  return (data ?? []) as DailyRisk[];
}

export async function getRecentCommands(limit = 20): Promise<SystemCommand[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('system_commands')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as SystemCommand[];
}
