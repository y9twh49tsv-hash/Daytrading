import { KeyRound, Lock, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

/**
 * Pure documentation page. API keys are NEVER entered, stored or displayed in
 * the browser — they live exclusively in the worker's environment (Railway).
 */
export default function ApiConfigPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">API-Konfiguration</h1>

      <Alert variant="destructive">
        <Lock className="h-4 w-4" />
        <AlertTitle>Secrets werden niemals im Browser angezeigt oder eingegeben</AlertTitle>
        <AlertDescription>
          Binance API-Key und Secret werden ausschließlich als Environment-Variablen im Railway
          Worker hinterlegt. Das Dashboard hat keinerlei Zugriff darauf — weder lesend noch
          schreibend.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Testnet-API-Keys erstellen
          </CardTitle>
          <CardDescription>
            Schritt-für-Schritt-Anleitung (nur Binance Spot Testnet)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              Öffne{' '}
              <a
                href="https://testnet.binance.vision"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-4"
              >
                testnet.binance.vision
              </a>{' '}
              und melde dich mit einem GitHub-Konto an.
            </li>
            <li>
              Erzeuge über <span className="font-mono text-xs">Generate HMAC_SHA256 Key</span> ein
              neues Schlüsselpaar (API Key + Secret).
            </li>
            <li>
              Hinterlege beide Werte <strong>ausschließlich</strong> im Railway-Projekt des Workers
              als <span className="font-mono text-xs">BINANCE_API_KEY</span> und{' '}
              <span className="font-mono text-xs">BINANCE_API_SECRET</span>.
            </li>
            <li>
              Setze <span className="font-mono text-xs">PAPER_TRADING=false</span> erst, wenn du
              bewusst gegen das Testnet handeln willst (Standard ist Paper-Trading).
            </li>
            <li>Starte den Worker neu, damit die Variablen wirksam werden.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Sicherheitsregeln
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>
              <strong>Keine Mainnet-Keys:</strong> Dieses System ist ausschließlich für Testnet und
              Paper-Trading ausgelegt. Live-Trading ist im aktuellen Release nicht implementiert.
            </li>
            <li>
              <strong>Keine Withdrawal-Berechtigung:</strong> Falls du später echte Keys nutzt,
              dürfen diese niemals Auszahlungsrechte besitzen.
            </li>
            <li>
              <strong>IP-Allowlisting:</strong> Beschränke API-Keys auf die statische Egress-IP
              deines Railway-Services (Railway → Settings → Networking → Static Outbound IP).
            </li>
            <li>
              <strong>Keine Keys im Repository:</strong>{' '}
              <span className="font-mono text-xs">.env</span>
              -Dateien sind git-ignoriert; committe niemals echte Werte.
            </li>
            <li>
              <strong>Keine NEXT_PUBLIC-Secrets:</strong> Variablen mit{' '}
              <span className="font-mono text-xs">NEXT_PUBLIC_</span> landen im Browser-Bundle und
              dürfen daher niemals Geheimnisse enthalten.
            </li>
            <li>
              <strong>KILL_SWITCH:</strong> Mit{' '}
              <span className="font-mono text-xs">KILL_SWITCH=true</span> im Worker wird jede
              Order-Erstellung global blockiert.
            </li>
            <li>
              <strong>Key-Rotation:</strong> Rotiere Keys regelmäßig und sofort bei Verdacht auf
              Kompromittierung.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Alert variant="warning">
        <TriangleAlert className="h-4 w-4" />
        <AlertTitle>Live-Trading nicht verfügbar</AlertTitle>
        <AlertDescription>
          Der Modus „live“ ist in diesem Release deaktiviert (UI, Datenbank-Constraint und Worker
          verweigern ihn). Eine Aktivierung erfordert ein separates, bewusstes Release.
        </AlertDescription>
      </Alert>
    </div>
  );
}
