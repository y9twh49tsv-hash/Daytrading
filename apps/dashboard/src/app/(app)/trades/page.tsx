import { getBots, getTrades } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/filter-bar';
import { Pnl } from '@/components/pnl';
import { formatDateTime, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ bot?: string }>;
}) {
  const { bot } = await searchParams;
  const bots = await getBots();
  const trades = await getTrades(bot || undefined, 200);
  const botNames = new Map(bots.map((b) => [b.id, b.name]));

  const totalNet = trades.reduce((sum, t) => sum + Number(t.net_pnl), 0);
  const wins = trades.filter((t) => Number(t.net_pnl) > 0).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Trade-Historie</h1>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle>Abgeschlossene Trades ({trades.length})</CardTitle>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              Winrate: {trades.length > 0 ? `${((wins / trades.length) * 100).toFixed(0)} %` : '–'}
            </span>
            <Pnl value={totalNet} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterBar bots={bots} selectedBot={bot} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Geschlossen</TableHead>
                <TableHead>Bot</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Menge</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead>Exit</TableHead>
                <TableHead>Gebühren</TableHead>
                <TableHead>Netto-PnL</TableHead>
                <TableHead>Grund</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Noch keine Trades
                  </TableCell>
                </TableRow>
              )}
              {trades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell>{formatDateTime(trade.closed_at)}</TableCell>
                  <TableCell>{botNames.get(trade.bot_id) ?? '–'}</TableCell>
                  <TableCell className="font-medium">{trade.symbol}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatNumber(trade.quantity)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatNumber(trade.entry_price, 4)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatNumber(trade.exit_price, 4)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{formatNumber(trade.fees, 4)}</TableCell>
                  <TableCell>
                    <Pnl value={Number(trade.net_pnl)} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted">{trade.reason}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
