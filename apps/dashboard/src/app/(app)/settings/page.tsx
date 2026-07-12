import { getBotOverviews } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModeBadge } from '@/components/status-badge';
import { SettingsForm } from '@/components/settings-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const overviews = await getBotOverviews();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Strategieeinstellungen</h1>
      <p className="text-sm text-muted-foreground">
        Strategie: EMA 9/21-Crossover mit RSI-14-Filter (Einstieg nur nach Kerzenschluss).
        Änderungen wirken beim nächsten Bot-Start.
      </p>

      {overviews.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Kein Bot vorhanden</CardTitle>
            <CardDescription>Lege zuerst in der Bot-Steuerung einen Bot an.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {overviews.map(({ bot, settings }) => (
        <Card key={bot.id}>
          <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
            <CardTitle className="text-lg">{bot.name}</CardTitle>
            <Badge variant="outline">{bot.symbol}</Badge>
            <ModeBadge mode={bot.mode} />
          </CardHeader>
          <CardContent>
            {settings ? (
              <SettingsForm botId={bot.id} settings={settings} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Keine Einstellungen gefunden — bitte Bot neu anlegen.
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
