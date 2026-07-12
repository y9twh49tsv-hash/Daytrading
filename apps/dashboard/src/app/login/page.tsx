'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, TriangleAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Inlined at build time — false means the Vercel env vars are missing.
  const isConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          router.push('/dashboard');
          router.refresh();
        } else {
          setInfo('Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-6 flex items-center gap-2 text-xl font-semibold">
        <Activity className="h-6 w-6 text-primary" />
        Daytrading Bot
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === 'login' ? 'Anmelden' : 'Registrieren'}</CardTitle>
          <CardDescription>
            {mode === 'login'
              ? 'Melde dich mit deinem Konto an.'
              : 'Erstelle ein neues Konto für das Dashboard.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isConfigured && (
            <Alert variant="destructive" className="mb-4">
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription>
                Supabase ist nicht konfiguriert. Bitte in Vercel die Environment-Variablen{' '}
                <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> und{' '}
                <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> setzen und
                neu deployen (siehe DEPLOYMENT.md).
              </AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {info && (
              <Alert variant="info">
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading || !isConfigured}>
              {loading ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : 'Registrieren'}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
              setInfo(null);
            }}
          >
            {mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Bereits registriert? Anmelden'}
          </button>
        </CardContent>
      </Card>

      <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">
        Nur Paper-Trading und Binance Spot Testnet. Es wird kein echtes Geld gehandelt. Diese
        Software garantiert keine Gewinne.
      </p>
    </div>
  );
}
