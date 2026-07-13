-- =============================================================================
-- 0003_enable_live_trading.sql
-- Enables the 'live' trading mode (REAL funds).
--
-- The runtime safety controls remain fully in force: the worker still requires
-- ALLOW_LIVE_TRADING=true, PAPER_TRADING=false and KILL_SWITCH=false, and every
-- risk limit (stop-loss, take-profit, daily loss limit, max trades, cooldown,
-- emergency stop, one-position-per-bot) continues to apply.
--
-- This migration only removes the database-level *block* on mode='live'.
-- =============================================================================

-- 1. Drop the CHECK constraint that forbade live trading.
alter table public.bot_instances drop constraint if exists no_live_trading;

-- 2. Recreate the owner RLS policies without the `mode <> 'live'` restriction.
drop policy if exists "bots_insert_own" on public.bot_instances;
create policy "bots_insert_own" on public.bot_instances
  for insert with check (user_id = auth.uid());

drop policy if exists "bots_update_own" on public.bot_instances;
create policy "bots_update_own" on public.bot_instances
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
