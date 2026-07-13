'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBot } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function CreateBotForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createBot(formData);
      if (!result.ok) setError(result.error ?? 'Fehler');
      else router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required placeholder="Mein BTC Bot" maxLength={60} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="symbol">Symbol</Label>
        <Input id="symbol" name="symbol" required placeholder="BTCUSDT" className="uppercase" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mode">Modus</Label>
        <Select id="mode" name="mode" defaultValue="paper">
          <option value="paper">Paper-Trading (empfohlen)</option>
          <option value="testnet">Binance Spot Testnet</option>
          <option value="live">Live — ECHTES GELD</option>
        </Select>
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Erstelle…' : 'Bot anlegen'}
        </Button>
      </div>
      <Alert variant="warning" className="sm:col-span-2 lg:col-span-4">
        <AlertDescription>
          Im <strong>Live-Modus</strong> wird mit echtem Geld gehandelt. Der Worker führt
          Live-Trades nur aus, wenn dort{' '}
          <span className="font-mono text-xs">ALLOW_LIVE_TRADING=true</span> und{' '}
          <span className="font-mono text-xs">PAPER_TRADING=false</span> gesetzt sind sowie echte
          Binance-Keys hinterlegt wurden. Es gibt keine Gewinngarantie — du kannst dein Kapital
          verlieren.
        </AlertDescription>
      </Alert>
      {error && (
        <Alert variant="destructive" className="sm:col-span-2 lg:col-span-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
