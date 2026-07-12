-- =============================================================================
-- 0001_initial_schema.sql
-- Core schema for the Binance Spot trading bot (Testnet / Paper-Trading only)
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type bot_status as enum ('stopped', 'starting', 'running', 'paused', 'error');
create type trading_mode as enum ('paper', 'testnet', 'live');
create type position_side as enum ('long', 'short');
create type position_status as enum ('open', 'closed');
create type order_side as enum ('buy', 'sell');
create type order_type as enum ('market', 'limit', 'stop_loss_limit', 'take_profit_limit');
create type order_status as enum (
  'new', 'partially_filled', 'filled', 'canceled', 'rejected', 'expired', 'pending', 'failed'
);
create type event_level as enum ('debug', 'info', 'warn', 'error', 'critical');
create type command_type as enum ('start', 'pause', 'resume', 'stop', 'emergency_stop', 'close_position');
create type command_status as enum ('pending', 'processing', 'completed', 'failed');

-- -----------------------------------------------------------------------------
-- profiles — mirrors auth.users
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

-- Auto-create a profile whenever a new auth user registers
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- bot_instances
-- -----------------------------------------------------------------------------
create table public.bot_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  symbol text not null,
  status bot_status not null default 'stopped',
  mode trading_mode not null default 'paper',
  strategy text not null default 'ema_rsi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_heartbeat_at timestamptz,
  -- Live trading is NOT available in this release. Enforced at DB level.
  constraint no_live_trading check (mode <> 'live')
);

create index idx_bot_instances_user_id on public.bot_instances (user_id);

-- -----------------------------------------------------------------------------
-- bot_settings — one settings row per bot
-- -----------------------------------------------------------------------------
create table public.bot_settings (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null unique references public.bot_instances (id) on delete cascade,
  timeframe text not null default '1m',
  quote_amount numeric(20, 8) not null default 25 check (quote_amount > 0),
  max_position_size numeric(20, 8) not null default 100 check (max_position_size > 0),
  stop_loss_percent numeric(8, 4) not null default 1.0 check (stop_loss_percent > 0),
  take_profit_percent numeric(8, 4) not null default 1.5 check (take_profit_percent > 0),
  trailing_stop_percent numeric(8, 4) check (trailing_stop_percent is null or trailing_stop_percent > 0),
  max_daily_loss_percent numeric(8, 4) not null default 3.0 check (max_daily_loss_percent > 0),
  max_daily_trades integer not null default 10 check (max_daily_trades > 0),
  cooldown_minutes integer not null default 15 check (cooldown_minutes >= 0),
  minimum_signal_score numeric(5, 2) not null default 0.5 check (minimum_signal_score between 0 and 1),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- positions
-- -----------------------------------------------------------------------------
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bot_instances (id) on delete cascade,
  symbol text not null,
  side position_side not null default 'long',
  quantity numeric(28, 12) not null,
  entry_price numeric(28, 12) not null,
  current_price numeric(28, 12),
  stop_loss_price numeric(28, 12),
  take_profit_price numeric(28, 12),
  status position_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  realized_pnl numeric(28, 12),
  fees numeric(28, 12) not null default 0
);

create index idx_positions_bot_id on public.positions (bot_id);
-- Only one open position per bot & symbol
create unique index uq_positions_open_per_bot_symbol
  on public.positions (bot_id, symbol)
  where status = 'open';

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bot_instances (id) on delete cascade,
  binance_order_id bigint,
  client_order_id text not null,
  symbol text not null,
  side order_side not null,
  type order_type not null,
  quantity numeric(28, 12) not null,
  price numeric(28, 12),
  status order_status not null default 'pending',
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_orders_bot_id on public.orders (bot_id);
-- Duplicate order protection: clientOrderId must be globally unique
create unique index uq_orders_client_order_id on public.orders (client_order_id);

-- -----------------------------------------------------------------------------
-- trades — closed round-trips
-- -----------------------------------------------------------------------------
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bot_instances (id) on delete cascade,
  symbol text not null,
  side position_side not null default 'long',
  quantity numeric(28, 12) not null,
  entry_price numeric(28, 12) not null,
  exit_price numeric(28, 12) not null,
  gross_pnl numeric(28, 12) not null,
  fees numeric(28, 12) not null default 0,
  net_pnl numeric(28, 12) not null,
  reason text not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null default now()
);

create index idx_trades_bot_id on public.trades (bot_id);
create index idx_trades_closed_at on public.trades (closed_at desc);

-- -----------------------------------------------------------------------------
-- bot_events — structured log
-- -----------------------------------------------------------------------------
create table public.bot_events (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bot_instances (id) on delete cascade,
  level event_level not null default 'info',
  event_type text not null,
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_bot_events_bot_id_created on public.bot_events (bot_id, created_at desc);

-- -----------------------------------------------------------------------------
-- daily_risk — one row per bot per trading day
-- -----------------------------------------------------------------------------
create table public.daily_risk (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bot_instances (id) on delete cascade,
  trading_date date not null default current_date,
  starting_balance numeric(28, 12) not null,
  current_balance numeric(28, 12) not null,
  realized_pnl numeric(28, 12) not null default 0,
  unrealized_pnl numeric(28, 12) not null default 0,
  trade_count integer not null default 0,
  loss_limit_reached boolean not null default false,
  unique (bot_id, trading_date)
);

create index idx_daily_risk_bot_id on public.daily_risk (bot_id, trading_date desc);

-- -----------------------------------------------------------------------------
-- system_commands — dashboard writes, worker consumes
-- -----------------------------------------------------------------------------
create table public.system_commands (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bot_instances (id) on delete cascade,
  command command_type not null,
  status command_status not null default 'pending',
  requested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text
);

create index idx_system_commands_pending
  on public.system_commands (status, created_at)
  where status = 'pending';
create index idx_system_commands_bot_id on public.system_commands (bot_id, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at helper
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_bot_instances_updated before update on public.bot_instances
  for each row execute function public.set_updated_at();
create trigger trg_bot_settings_updated before update on public.bot_settings
  for each row execute function public.set_updated_at();
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();
