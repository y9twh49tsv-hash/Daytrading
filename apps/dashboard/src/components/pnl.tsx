import { cn, formatCurrency } from '@/lib/utils';

/** Profit/loss value — green for gains, red for losses, clearly distinguishable. */
export function Pnl({
  value,
  currency = 'USDT',
  className,
}: {
  value: number | null | undefined;
  currency?: string;
  className?: string;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className={cn('text-muted-foreground', className)}>–</span>;
  }
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        positive && 'text-emerald-400',
        negative && 'text-red-400',
        !positive && !negative && 'text-muted-foreground',
        className,
      )}
    >
      {positive ? '+' : ''}
      {formatCurrency(value, currency)}
    </span>
  );
}
