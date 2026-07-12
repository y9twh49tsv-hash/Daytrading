-- =============================================================================
-- 0002_row_level_security.sql
-- Users can only see and modify their own bots and related data.
-- The worker uses the service-role key which bypasses RLS.
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.bot_instances enable row level security;
alter table public.bot_settings enable row level security;
alter table public.positions enable row level security;
alter table public.orders enable row level security;
alter table public.trades enable row level security;
alter table public.bot_events enable row level security;
alter table public.daily_risk enable row level security;
alter table public.system_commands enable row level security;

-- Helper: does the current user own the given bot?
create or replace function public.owns_bot(p_bot_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.bot_instances b
    where b.id = p_bot_id and b.user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- profiles: users see and update only their own profile
-- -----------------------------------------------------------------------------
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- bot_instances: full CRUD on own bots (status transitions are worker-owned,
-- but users may create/rename/delete their bots)
-- -----------------------------------------------------------------------------
create policy "bots_select_own" on public.bot_instances
  for select using (user_id = auth.uid());
create policy "bots_insert_own" on public.bot_instances
  for insert with check (user_id = auth.uid() and mode <> 'live');
create policy "bots_update_own" on public.bot_instances
  for update using (user_id = auth.uid()) with check (user_id = auth.uid() and mode <> 'live');
create policy "bots_delete_own" on public.bot_instances
  for delete using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- bot_settings: CRUD for own bots
-- -----------------------------------------------------------------------------
create policy "settings_select_own" on public.bot_settings
  for select using (public.owns_bot(bot_id));
create policy "settings_insert_own" on public.bot_settings
  for insert with check (public.owns_bot(bot_id));
create policy "settings_update_own" on public.bot_settings
  for update using (public.owns_bot(bot_id)) with check (public.owns_bot(bot_id));
create policy "settings_delete_own" on public.bot_settings
  for delete using (public.owns_bot(bot_id));

-- -----------------------------------------------------------------------------
-- positions / orders / trades / bot_events / daily_risk:
-- read-only for owners; only the worker (service role) writes them
-- -----------------------------------------------------------------------------
create policy "positions_select_own" on public.positions
  for select using (public.owns_bot(bot_id));

create policy "orders_select_own" on public.orders
  for select using (public.owns_bot(bot_id));

create policy "trades_select_own" on public.trades
  for select using (public.owns_bot(bot_id));

create policy "events_select_own" on public.bot_events
  for select using (public.owns_bot(bot_id));

create policy "daily_risk_select_own" on public.daily_risk
  for select using (public.owns_bot(bot_id));

-- -----------------------------------------------------------------------------
-- system_commands: owners may insert pending commands for their own bots and
-- read their history. Status updates are done exclusively by the worker.
-- -----------------------------------------------------------------------------
create policy "commands_select_own" on public.system_commands
  for select using (public.owns_bot(bot_id));
create policy "commands_insert_own" on public.system_commands
  for insert with check (
    public.owns_bot(bot_id)
    and status = 'pending'
    and requested_by = auth.uid()
  );
