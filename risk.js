export function floorToStep(value, step) {
  const precision = Math.max(0, (step.toString().split('.')[1] || '').length);
  return Number((Math.floor(value / step) * step).toFixed(precision));
}

export function symbolRules(exchangeInfo) {
  const symbol = exchangeInfo.symbols[0];
  const lot = symbol.filters.find(f => f.filterType === 'LOT_SIZE');
  const notional = symbol.filters.find(f => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL');
  return {
    minQty: Number(lot.minQty),
    maxQty: Number(lot.maxQty),
    stepSize: Number(lot.stepSize),
    minNotional: Number(notional?.minNotional ?? 0)
  };
}

export function canTrade({ state, cfg, now = Date.now() }) {
  if (state.realizedPnlToday <= -Math.abs(cfg.maxDailyLossQuote)) return [false, 'Tagesverlustgrenze erreicht'];
  if (state.lastTradeAt && now - state.lastTradeAt < cfg.cooldownMinutes * 60_000) return [false, 'Cooldown aktiv'];
  return [true, 'OK'];
}
