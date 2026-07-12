import { TriangleAlert } from 'lucide-react';
import { getBotOverviews, getBots, getDailyRiskHistory } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FilterBar } from '@/components/filter-bar';
import { Pnl } from '@/components/pnl';
import { formatCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function RiskPage({
  searchParams,
}: {
  searchParams: Promise<{ bot?: string }>;
}) {
  const { bot } = await searchParams;
  const [bots, overviews, history] = await Promise.all([
    getBots(),
    getBotOverviews(),
    getDailyRiskHistory(bot || undefined, 30),
  ]);
  const botNames = new Map(bots.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Risikoübersicht</h1>

      <Alert variant="warning">
        <TriangleAlert className="h-4 w-4" />
        <AlertTitle>Risikohinweis</AlertTitle>
        <AlertDescription>
          Der Handel mit Kryptowährungen ist mit erheblichen Risiken verbunden. Dieses System
          garantiert keine Gewinne. Aktuell werden ausschließlich Paper-Trading und Binance Spot
          Testnet unterstützt — es wird kein echtes Geld eingesetzt.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2">
        {overviews.map(({ bot: b, settings, dailyRisk }) => {
          const maxLoss =
            dailyRisk && settings
              ? (settings.max_daily_loss_percent / 100) * dailyRisk.starting_balance
              : null;
          const usedLossPct =
            dailyRisk && maxLoss && maxLoss > 0
              ? Math.min(100, Math.max(0, (-dailyRisk.realized_pnl / maxLoss) * 100))
              : 0;
          return (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {b.name}
                  {dailyRisk?.loss_limit_reached && <Badge variant="error">Limit erreicht</Badge>}
                </CardTitle>
                <CardDescription>Aktive Risiko-Limits (heute)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Max. Tagesverlust">
                  {settings ? `${settings.max_daily_loss_percent} %` : '–'}
                  {maxLoss !== null && (
                    <span className="text-muted-foreground"> ({formatCurrency(maxLoss)})</span>
                  )}
                </Row>
                <Row label="Verlust heute">
                  <Pnl value={dailyRisk?.realized_pnl ?? null} />
                </Row>
                {maxLoss !== null && (
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={
                        'h-full rounded-full transition-all ' +
                        (usedLossPct >= 100
                          ? 'bg-red-500'
                          : usedLossPct > 60
                            ? 'bg-amber-500'
                            : 'bg-emerald-500')
                      }
                      style={{ width: `${usedLossPct}%` }}
                    />
                  </div>
                )}
                <Row label="Max. Positionsgröße">
                  {settings ? formatCurrency(settings.max_position_size) : '–'}
                </Row>
                <Row label="Max. Trades/Tag">
                  {dailyRisk?.trade_count ?? 0} / {settings?.max_daily_trades ?? '–'}
                </Row>
                <Row label="Cooldown">{settings ? `${settings.cooldown_minutes} min` : '–'}</Row>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tägliche Historie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterBar bots={bots} selectedBot={bot} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Bot</TableHead>
                <TableHead>Startkapital</TableHead>
                <TableHead>Kontostand</TableHead>
                <TableHead>Realisiert</TableHead>
                <TableHead>Unrealisiert</TableHead>
                <TableHead>Trades</TableHead>
                <TableHead>Limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Keine Daten
                  </TableCell>
                </TableRow>
              )}
              {history.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.trading_date}</TableCell>
                  <TableCell>{botNames.get(row.bot_id) ?? '–'}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatCurrency(row.starting_balance)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatCurrency(row.current_balance)}
                  </TableCell>
                  <TableCell>
                    <Pnl value={row.realized_pnl} />
                  </TableCell>
                  <TableCell>
                    <Pnl value={row.unrealized_pnl} />
                  </TableCell>
                  <TableCell>{row.trade_count}</TableCell>
                  <TableCell>
                    {row.loss_limit_reached ? (
                      <Badge variant="error">erreicht</Badge>
                    ) : (
                      <Badge variant="success">ok</Badge>
                    )}
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
