'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BotSettings } from '@daytrading/shared';
import { TIMEFRAMES } from '@daytrading/shared';
import { saveSettings } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function SettingsForm({ botId, settings }: { botId: string; settings: BotSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveSettings(botId, formData);
      if (!result.ok) setError(result.error ?? 'Fehler');
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form action={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Timeframe" htmlFor={`tf-${botId}`}>
        <Select id={`tf-${botId}`} name="timeframe" defaultValue={settings.timeframe}>
          {TIMEFRAMES.map((tf) => (
            <option key={tf} value={tf}>
              {tf}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Einsatz pro Trade (Quote)" htmlFor={`qa-${botId}`}>
        <Input
          id={`qa-${botId}`}
          name="quote_amount"
          type="number"
          step="any"
          min="0"
          defaultValue={settings.quote_amount}
          required
        />
      </Field>
      <Field label="Max. Positionsgröße (Quote)" htmlFor={`mp-${botId}`}>
        <Input
          id={`mp-${botId}`}
          name="max_position_size"
          type="number"
          step="any"
          min="0"
          defaultValue={settings.max_position_size}
          required
        />
      </Field>
      <Field label="Stop-Loss (%)" htmlFor={`sl-${botId}`}>
        <Input
          id={`sl-${botId}`}
          name="stop_loss_percent"
          type="number"
          step="any"
          min="0"
          defaultValue={settings.stop_loss_percent}
          required
        />
      </Field>
      <Field label="Take-Profit (%)" htmlFor={`tp-${botId}`}>
        <Input
          id={`tp-${botId}`}
          name="take_profit_percent"
          type="number"
          step="any"
          min="0"
          defaultValue={settings.take_profit_percent}
          required
        />
      </Field>
      <Field label="Trailing-Stop (%, optional)" htmlFor={`ts-${botId}`}>
        <Input
          id={`ts-${botId}`}
          name="trailing_stop_percent"
          type="number"
          step="any"
          min="0"
          defaultValue={settings.trailing_stop_percent ?? ''}
          placeholder="leer = deaktiviert"
        />
      </Field>
      <Field label="Max. Tagesverlust (%)" htmlFor={`ml-${botId}`}>
        <Input
          id={`ml-${botId}`}
          name="max_daily_loss_percent"
          type="number"
          step="any"
          min="0"
          defaultValue={settings.max_daily_loss_percent}
          required
        />
      </Field>
      <Field label="Max. Trades pro Tag" htmlFor={`mt-${botId}`}>
        <Input
          id={`mt-${botId}`}
          name="max_daily_trades"
          type="number"
          step="1"
          min="1"
          defaultValue={settings.max_daily_trades}
          required
        />
      </Field>
      <Field label="Cooldown (Minuten)" htmlFor={`cd-${botId}`}>
        <Input
          id={`cd-${botId}`}
          name="cooldown_minutes"
          type="number"
          step="1"
          min="0"
          defaultValue={settings.cooldown_minutes}
          required
        />
      </Field>
      <Field label="Min. Signal-Score (0–1)" htmlFor={`ms-${botId}`}>
        <Input
          id={`ms-${botId}`}
          name="minimum_signal_score"
          type="number"
          step="0.05"
          min="0"
          max="1"
          defaultValue={settings.minimum_signal_score}
          required
        />
      </Field>

      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Speichere…' : 'Einstellungen speichern'}
        </Button>
        {saved && <span className="text-sm text-emerald-400">Gespeichert ✓</span>}
      </div>

      {error && (
        <Alert variant="destructive" className="sm:col-span-2 lg:col-span-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
