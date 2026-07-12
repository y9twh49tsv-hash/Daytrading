import Link from 'next/link';
import { HEARTBEAT_STALE_MS } from '@daytrading/shared';
import { ArrowLeftRight, Gauge, HeartPulse, TrendingUp, Wallet } from 'lucide-react';
import { getBotOverviews, getTrades } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { BotStatusBadge, ModeBadge } from '@/components/status-badge';
import { Pnl } from '@/components/pnl';
import { formatCurrency, formatNumber, timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const overviews = await getBotOverviews();

  if (overviews.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Übersicht</h1>
        <Card>
          <CardHeader>
            <CardTitle>Kein Bot vorhanden</CardTitle>
            <CardDescription>
              Lege in der Bot-Steuerung deinen ersten Bot an (Paper-Trading empfohlen).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/control" className={buttonVariants()}>
              Zur Bot-Steuerung
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const trades = await getTrades(undefined, 500);
  const tradesToday = trades.filter((t) => t.closed_at.slice(0, 10) === today);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Übersicht</h1>

      {overviews.map(({ bot, settings, openPosition, dailyRisk }) => {
        const heartbeatFresh =
          bot.last_heartbeat_at !== null &&
          Date.now() - new Date(bot.last_heartbeat_at).getTime() < HEARTBEAT_STALE_MS;
        const dayPnl = (dailyRisk?.realized_pnl ?? 0) + (dailyRisk?.unrealized_pnl ?? 0);
        const botTradesToday = tradesToday.filter((t) => t.bot_id === bot.id).length;
        const maxLoss =
          dailyRisk && settings
            ? (settings.max_daily_loss_percent / 100) * dailyRisk.starting_balance
            : null;

        return (
          <Card key={bot.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle className="text-lg">{bot.name}</CardTitle>
                <Badge variant="outline">{bot.symbol}</Badge>
                <ModeBadge mode={bot.mode} />
                <BotStatusBadge status={bot.status} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <HeartPulse
                  className={heartbeatFresh ? 'h-4 w-4 text-emerald-400' : 'h-4 w-4 text-red-400'}
                />
                Heartbeat: {timeAgo(bot.last_heartbeat_at)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <Stat
                  icon={<Wallet className="h-4 w-4" />}
                  label="Kontostand"
                  value={formatCurrency(dailyRisk?.current_balance)}
                />
                <div className="rounded-md border p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendingUp className="h-4 w-4" /> Tages-PnL
                  </div>
                  <Pnl value={dailyRisk ? dayPnl : null} className="text-sm font-semibold" />
                </div>
                <Stat
                  icon={<ArrowLeftRight className="h-4 w-4" />}
                  label="Trades heute"
                  value={
                    settings
                      ? `${botTradesToday} / ${settings.max_daily_trades}`
                      : String(botTradesToday)
                  }
                />
                <div className="rounded-md border p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Gauge className="h-4 w-4" /> Tageslimit
                  </div>
                  {dailyRisk?.loss_limit_reached ? (
                    <Badge variant="error">Erreicht</Badge>
                  ) : (
                    <span className="text-sm font-semibold">
                      {maxLoss !== null ? `max. -${formatCurrency(maxLoss)}` : '–'}
                    </span>
                  )}
                </div>
                <div className="col-span-2 rounded-md border p-3">
                  <div className="mb-1 text-xs text-muted-foreground">Offene Position</div>
                  {openPosition ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="font-semibold">
                        {formatNumber(openPosition.quantity)} {bot.symbol}
                      </span>
                      <span className="text-muted-foreground">
                        Entry {formatNumber(openPosition.entry_price, 2)}
                      </span>
                      {openPosition.current_price !== null && (
                        <Pnl
                          value={
                            (openPosition.current_price - openPosition.entry_price) *
                            openPosition.quantity
                          }
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">keine</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="truncate text-sm font-semibold">{value}</div>
    </div>
  );
}
