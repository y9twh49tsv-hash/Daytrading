'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CircleStop, OctagonX, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { BotStatus } from '@daytrading/shared';
import { sendCommand } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function BotControls({
  botId,
  status,
  hasOpenPosition,
}: {
  botId: string;
  status: BotStatus;
  hasOpenPosition: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  function run(command: string) {
    setError(null);
    startTransition(async () => {
      const result = await sendCommand(botId, command);
      if (!result.ok) setError(result.error ?? 'Fehler');
      router.refresh();
    });
  }

  const canStart = status === 'stopped' || status === 'error';
  const canPause = status === 'running';
  const canResume = status === 'paused';
  const canStop = status === 'running' || status === 'paused' || status === 'starting';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!canStart || pending} onClick={() => run('start')}>
          <Play className="h-4 w-4" /> Start
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!canPause || pending}
          onClick={() => run('pause')}
        >
          <Pause className="h-4 w-4" /> Pause
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!canResume || pending}
          onClick={() => run('resume')}
        >
          <RotateCcw className="h-4 w-4" /> Fortsetzen
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canStop || pending}
          onClick={() => run('stop')}
        >
          <CircleStop className="h-4 w-4" /> Stop
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!hasOpenPosition || pending}
          onClick={() => run('close_position')}
        >
          <X className="h-4 w-4" /> Position schließen
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => setEmergencyOpen(true)}
          className="ml-auto"
        >
          <OctagonX className="h-4 w-4" /> EMERGENCY STOP
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Emergency stop confirmation dialog */}
      {emergencyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-red-500/50 bg-card p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2 text-lg font-semibold text-red-400">
              <OctagonX className="h-5 w-5" /> Emergency Stop
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Der Emergency Stop schließt eine offene Position sofort per Market Order und hält den
              Bot an. Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <p className="mb-2 text-sm">
              Tippe <span className="font-mono font-semibold text-red-400">STOP</span> zur
              Bestätigung:
            </p>
            <Input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="STOP"
              className="mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setEmergencyOpen(false);
                  setConfirmText('');
                }}
              >
                Abbrechen
              </Button>
              <Button
                variant="destructive"
                disabled={confirmText !== 'STOP' || pending}
                onClick={() => {
                  setEmergencyOpen(false);
                  setConfirmText('');
                  run('emergency_stop');
                }}
              >
                Emergency Stop ausführen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
