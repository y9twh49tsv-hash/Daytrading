export function ema(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out = [];
  let current = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(current);
  for (let i = period; i < values.length; i++) {
    current = values[i] * k + current * (1 - k);
    out.push(current);
  }
  return out;
}

export function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gains += Math.max(d, 0);
    losses += Math.max(-d, 0);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function getSignal(closes, cfg) {
  const fast = ema(closes, cfg.fastEma);
  const slow = ema(closes, cfg.slowEma);
  if (fast.length < 2 || slow.length < 2) return { action: 'HOLD', reason: 'Zu wenig Daten' };
  const f0 = fast.at(-2), f1 = fast.at(-1);
  const s0 = slow.at(-2), s1 = slow.at(-1);
  const currentRsi = rsi(closes, cfg.rsiPeriod);
  const crossedUp = f0 <= s0 && f1 > s1;
  const crossedDown = f0 >= s0 && f1 < s1;
  if (crossedUp && currentRsi <= cfg.rsiBuyMax) return { action: 'BUY', reason: 'EMA-Crossover aufwärts', rsi: currentRsi };
  if (crossedDown || currentRsi >= cfg.rsiSellMin) return { action: 'SELL', reason: crossedDown ? 'EMA-Crossover abwärts' : 'RSI überkauft', rsi: currentRsi };
  return { action: 'HOLD', reason: 'Kein bestätigtes Signal', rsi: currentRsi };
}
