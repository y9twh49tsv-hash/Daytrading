import { TriangleAlert } from 'lucide-react';

/** Permanent warning: this system trades on testnet / paper only. */
export function TestnetBanner() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-xs font-medium text-amber-300">
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
      <span>
        PAPER-TRADING / TESTNET — es wird kein echtes Geld gehandelt. Keine Gewinngarantie. Trading
        ist mit erheblichen Risiken verbunden.
      </span>
    </div>
  );
}
