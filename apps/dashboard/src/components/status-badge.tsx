import type { BotStatus, CommandStatus, OrderStatus, TradingMode } from '@daytrading/shared';
import { Badge } from '@/components/ui/badge';

const BOT_STATUS_MAP: Record<
  BotStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'muted' }
> = {
  running: { label: 'Läuft', variant: 'success' },
  starting: { label: 'Startet…', variant: 'warning' },
  paused: { label: 'Pausiert', variant: 'warning' },
  stopped: { label: 'Gestoppt', variant: 'muted' },
  error: { label: 'Fehler', variant: 'error' },
};

export function BotStatusBadge({ status }: { status: BotStatus }) {
  const cfg = BOT_STATUS_MAP[status] ?? BOT_STATUS_MAP.stopped;
  return (
    <Badge variant={cfg.variant}>
      <span className="relative mr-1.5 flex h-2 w-2">
        {status === 'running' && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <span
          className={
            'relative inline-flex h-2 w-2 rounded-full ' +
            (status === 'running'
              ? 'bg-emerald-400'
              : status === 'paused' || status === 'starting'
                ? 'bg-amber-400'
                : status === 'error'
                  ? 'bg-red-400'
                  : 'bg-zinc-500')
          }
        />
      </span>
      {cfg.label}
    </Badge>
  );
}

export function ModeBadge({ mode }: { mode: TradingMode }) {
  if (mode === 'paper') return <Badge variant="warning">PAPER</Badge>;
  if (mode === 'testnet') return <Badge variant="warning">TESTNET</Badge>;
  return <Badge variant="error">LIVE</Badge>;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const variant =
    status === 'filled'
      ? 'success'
      : status === 'canceled' ||
          status === 'rejected' ||
          status === 'failed' ||
          status === 'expired'
        ? 'error'
        : 'warning';
  return <Badge variant={variant}>{status}</Badge>;
}

export function CommandStatusBadge({ status }: { status: CommandStatus }) {
  const variant =
    status === 'completed' ? 'success' : status === 'failed' ? 'error' : ('warning' as const);
  return <Badge variant={variant}>{status}</Badge>;
}
