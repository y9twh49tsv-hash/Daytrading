import { getBotOverviews, getRecentCommands } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BotStatusBadge, CommandStatusBadge, ModeBadge } from '@/components/status-badge';
import { BotControls } from '@/components/bot-controls';
import { CreateBotForm } from '@/components/create-bot-form';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ControlPage() {
  const [overviews, commands] = await Promise.all([getBotOverviews(), getRecentCommands(20)]);
  const botNames = new Map(overviews.map((o) => [o.bot.id, o.bot.name]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Bot-Steuerung</h1>

      <Card>
        <CardHeader>
          <CardTitle>Neuen Bot anlegen</CardTitle>
          <CardDescription>
            Live-Trading ist in diesem Release deaktiviert. Verfügbar sind Paper-Trading und Binance
            Spot Testnet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateBotForm />
        </CardContent>
      </Card>

      {overviews.map(({ bot, openPosition }) => (
        <Card key={bot.id}>
          <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
            <CardTitle className="text-lg">{bot.name}</CardTitle>
            <Badge variant="outline">{bot.symbol}</Badge>
            <ModeBadge mode={bot.mode} />
            <BotStatusBadge status={bot.status} />
          </CardHeader>
          <CardContent>
            <BotControls
              botId={bot.id}
              status={bot.status}
              hasOpenPosition={openPosition !== null}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Commands werden in die Datenbank geschrieben und vom Worker verarbeitet (Polling alle
              2 Sekunden). Der Status aktualisiert sich nach wenigen Sekunden.
            </p>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Letzte Commands</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zeit</TableHead>
                <TableHead>Bot</TableHead>
                <TableHead>Command</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Verarbeitet</TableHead>
                <TableHead>Fehler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commands.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Noch keine Commands
                  </TableCell>
                </TableRow>
              )}
              {commands.map((cmd) => (
                <TableRow key={cmd.id}>
                  <TableCell>{formatDateTime(cmd.created_at)}</TableCell>
                  <TableCell>{botNames.get(cmd.bot_id) ?? cmd.bot_id.slice(0, 8)}</TableCell>
                  <TableCell className="font-mono text-xs">{cmd.command}</TableCell>
                  <TableCell>
                    <CommandStatusBadge status={cmd.status} />
                  </TableCell>
                  <TableCell>{formatDateTime(cmd.processed_at)}</TableCell>
                  <TableCell
                    className="max-w-48 truncate text-red-400"
                    title={cmd.error_message ?? ''}
                  >
                    {cmd.error_message ?? '–'}
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
