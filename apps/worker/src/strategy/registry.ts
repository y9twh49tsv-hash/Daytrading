import type { Strategy, StrategyName } from '@daytrading/shared';
import { EmaRsiStrategy } from './emaRsi.js';

/** Add new strategies here; the engine looks them up by name. */
export function createStrategy(name: StrategyName): Strategy {
  switch (name) {
    case 'ema_rsi':
      return new EmaRsiStrategy();
    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown strategy: ${String(exhaustive)}`);
    }
  }
}
