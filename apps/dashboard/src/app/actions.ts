'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { botSettingsSchema, createBotSchema, createCommandSchema } from '@daytrading/shared';
import { createClient } from '@/lib/supabase/server';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * The dashboard never talks to Binance or the worker directly. Every control
 * action is written to system_commands; the Railway worker polls and executes.
 * RLS guarantees users can only command their own bots.
 */
export async function sendCommand(botId: string, command: string): Promise<ActionResult> {
  const parsed = createCommandSchema.safeParse({ bot_id: botId, command });
  if (!parsed.success) return { ok: false, error: 'Ungültiger Command' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Nicht angemeldet' };

  const { error } = await supabase.from('system_commands').insert({
    bot_id: parsed.data.bot_id,
    command: parsed.data.command,
    status: 'pending',
    requested_by: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function createBot(formData: FormData): Promise<ActionResult> {
  const parsed = createBotSchema.safeParse({
    name: formData.get('name'),
    symbol: String(formData.get('symbol') ?? '').toUpperCase(),
    mode: formData.get('mode'),
    strategy: 'ema_rsi',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Nicht angemeldet' };

  const { data: bot, error } = await supabase
    .from('bot_instances')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      symbol: parsed.data.symbol,
      mode: parsed.data.mode,
      strategy: parsed.data.strategy,
      status: 'stopped',
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };

  // Default settings row
  const { error: settingsError } = await supabase.from('bot_settings').insert({
    bot_id: bot.id,
  });
  if (settingsError) return { ok: false, error: settingsError.message };

  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function saveSettings(botId: string, formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = botSettingsSchema.safeParse({
    ...raw,
    trailing_stop_percent:
      raw.trailing_stop_percent === '' || raw.trailing_stop_percent === undefined
        ? null
        : raw.trailing_stop_percent,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join('.')}: ${issue?.message}` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Nicht angemeldet' };

  // RLS restricts the update to bots owned by this user
  const { error } = await supabase.from('bot_settings').update(parsed.data).eq('bot_id', botId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings');
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
