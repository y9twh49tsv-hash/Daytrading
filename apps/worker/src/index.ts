import {
  COMMAND_POLL_INTERVAL_MS,
  RECONCILE_INTERVAL_MS,
  TIME_SYNC_INTERVAL_MS,
} from '@daytrading/shared';
import type { BotInstance } from '@daytrading/shared';
import { loadConfig } from './config.js';
import { Logger } from './logger.js';
import { Db } from './db.js';
import { BinanceRest } from './binance/rest.js';
import { PaperBroker } from './broker/paperBroker.js';
import { BinanceSpotBroker } from './broker/binanceTestnetBroker.js';
import type { Broker } from './broker/types.js';
import { createStrategy } from './strategy/registry.js';
import { BotEngine } from './engine/botEngine.js';
import { CommandProcessor } from './engine/commandProcessor.js';
import { startHealthServer } from './health.js';

const config = loadConfig();
const log = new Logger(config.LOG_LEVEL === 'debug' ? 'debug' : config.LOG_LEVEL);
const db = new Db(config, log);

const engines = new Map<string, BotEngine>();
let shuttingDown = false;
let lastHeartbeatAt: string | null = null;

/** Shared REST client for testnet market data (also used by paper bots). */
const marketData = new BinanceRest({
  baseUrl: config.BINANCE_BASE_URL,
  apiKey: config.BINANCE_API_KEY,
  apiSecret: config.BINANCE_API_SECRET,
  logger: log,
});

/** Latest prices per symbol so the paper broker can fill orders. */
const latestPrices = new Map<string, number>();

interface BotRuntime {
  broker: Broker;
  /** REST client for this bot's market (testnet or live). */
  rest: BinanceRest;
  /** WS base URL matching this bot's market. */
  wsBaseUrl: string;
}

/**
 * Build the broker + market-data endpoints for a bot based on its mode.
 *
 * - paper: fully simulated; testnet market data feeds the fills.
 * - testnet: signed orders against the Binance Spot Testnet (no real funds).
 * - live: signed orders against Binance mainnet with REAL funds. Gated behind
 *   ALLOW_LIVE_TRADING=true, PAPER_TRADING=false and KILL_SWITCH=false, and
 *   requires dedicated BINANCE_LIVE_API_KEY / BINANCE_LIVE_API_SECRET.
 */
function createRuntime(bot: BotInstance): BotRuntime {
  // KILL_SWITCH or PAPER_TRADING force the simulated broker regardless of mode.
  if (bot.mode === 'paper' || config.PAPER_TRADING || config.KILL_SWITCH) {
    return {
      broker: new PaperBroker({
        initialQuoteBalance: 10_000,
        getMarketPrice: (symbol) => latestPrices.get(symbol) ?? 0,
      }),
      rest: marketData,
      wsBaseUrl: config.BINANCE_WS_URL,
    };
  }

  if (bot.mode === 'testnet') {
    if (!config.BINANCE_API_KEY || !config.BINANCE_API_SECRET) {
      throw new Error('Testnet mode requires BINANCE_API_KEY and BINANCE_API_SECRET');
    }
    return {
      broker: new BinanceSpotBroker(marketData, log, 'testnet'),
      rest: marketData,
      wsBaseUrl: config.BINANCE_WS_URL,
    };
  }

  if (bot.mode === 'live') {
    if (!config.ALLOW_LIVE_TRADING) {
      throw new Error(
        'Live trading is disabled. Set ALLOW_LIVE_TRADING=true (and PAPER_TRADING=false) to enable real-money trading.',
      );
    }
    if (config.PAPER_TRADING) {
      throw new Error('Live trading requires PAPER_TRADING=false.');
    }
    if (!config.BINANCE_LIVE_API_KEY || !config.BINANCE_LIVE_API_SECRET) {
      throw new Error('Live mode requires BINANCE_LIVE_API_KEY and BINANCE_LIVE_API_SECRET');
    }
    // Dedicated live REST client on the mainnet endpoint.
    const liveRest = new BinanceRest({
      baseUrl: config.BINANCE_LIVE_BASE_URL,
      apiKey: config.BINANCE_LIVE_API_KEY,
      apiSecret: config.BINANCE_LIVE_API_SECRET,
      logger: log,
    });
    return {
      broker: new BinanceSpotBroker(liveRest, log, 'live'),
      rest: liveRest,
      wsBaseUrl: config.BINANCE_LIVE_WS_URL,
    };
  }

  throw new Error(`Unsupported mode: ${bot.mode}`);
}

async function getBot(botId: string): Promise<BotInstance> {
  const bots = await db.listBots();
  const bot = bots.find((b) => b.id === botId);
  if (!bot) throw new Error(`Bot ${botId} not found`);
  return bot;
}

async function startBot(botId: string): Promise<void> {
  if (config.KILL_SWITCH) {
    throw new Error('KILL_SWITCH is active — starting bots is disabled');
  }
  if (shuttingDown) throw new Error('Worker is shutting down');
  const existing = engines.get(botId);
  if (existing?.isRunning) {
    await existing.resume();
    return;
  }

  const bot = await getBot(botId);
  const settings = await db.getBotSettings(botId);
  if (!settings) throw new Error(`Bot ${botId} has no bot_settings row`);

  const runtime = createRuntime(bot);
  await runtime.broker.init();
  const strategy = createStrategy(bot.strategy);

  if (runtime.broker.kind === 'live') {
    log.warn('LIVE trading bot starting — REAL funds at risk', { botId, symbol: bot.symbol });
    await db.logEvent(
      botId,
      'critical',
      'live_trading_active',
      'LIVE trading is active for this bot — real money is at risk',
      { symbol: bot.symbol },
    );
  }

  const engine = new BotEngine(bot, settings, {
    db,
    rest: runtime.rest,
    broker: runtime.broker,
    strategy,
    log,
    config,
    wsBaseUrl: runtime.wsBaseUrl,
    onPrice: (symbol, price) => latestPrices.set(symbol, price),
  });

  engines.set(botId, engine);
  try {
    await engine.start();
  } catch (err) {
    engines.delete(botId);
    await db.setBotStatus(botId, 'error');
    throw err;
  }
}

async function withEngine(botId: string, fn: (engine: BotEngine) => Promise<void>): Promise<void> {
  const engine = engines.get(botId);
  if (!engine) throw new Error(`Bot ${botId} is not running on this worker`);
  await fn(engine);
}

const commandProcessor = new CommandProcessor(
  db,
  {
    start: (botId) => startBot(botId),
    pause: (botId) => withEngine(botId, (e) => e.pause()),
    resume: (botId) => withEngine(botId, (e) => e.resume()),
    stop: async (botId) => {
      const engine = engines.get(botId);
      if (engine) {
        await engine.stop(false);
        engines.delete(botId);
      } else {
        await db.setBotStatus(botId, 'stopped');
      }
    },
    emergency_stop: async (botId) => {
      const engine = engines.get(botId);
      if (engine) {
        await engine.emergencyStop();
        engines.delete(botId);
      } else {
        await db.setBotStatus(botId, 'stopped');
        await db.logEvent(
          botId,
          'critical',
          'emergency_stop',
          'Emergency stop (bot was not running)',
        );
      }
    },
    close_position: (botId) => withEngine(botId, (e) => e.manualClose()),
  },
  log,
);

// ---------------------------------------------------------------------------
// Main loops
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log.info('worker starting', {
    instanceId: config.WORKER_INSTANCE_ID,
    version: config.VERSION,
    paperTrading: config.PAPER_TRADING,
    killSwitch: config.KILL_SWITCH,
  });

  if (config.KILL_SWITCH) {
    log.warn('KILL_SWITCH is ACTIVE — no orders will be placed');
  }

  // Health endpoint
  startHealthServer(
    config.PORT,
    {
      databaseConnected: () => db.ping(),
      binanceConnected: () => {
        if (engines.size === 0) return 'disabled';
        for (const engine of engines.values()) {
          if (engine.wsConnected()) return 'connected';
        }
        return 'disconnected';
      },
      lastHeartbeatAt: () => lastHeartbeatAt,
      version: config.VERSION,
      killSwitch: config.KILL_SWITCH,
      paperTrading: config.PAPER_TRADING,
    },
    log,
  );

  // Initial Binance server time sync + periodic refresh
  try {
    const offset = await marketData.syncServerTime();
    log.info('binance time synced', { offsetMs: offset });
  } catch (err) {
    log.warn('initial time sync failed', { error: msg(err) });
  }
  setInterval(() => {
    marketData.syncServerTime().catch((err) => log.warn('time sync failed', { error: msg(err) }));
  }, TIME_SYNC_INTERVAL_MS);

  // Recover bots that were running before a restart
  try {
    const bots = await db.listBots();
    for (const bot of bots) {
      if (bot.status === 'running' || bot.status === 'starting' || bot.status === 'paused') {
        log.info('recovering bot after restart', { botId: bot.id, status: bot.status });
        try {
          await startBot(bot.id);
          if (bot.status === 'paused') await engines.get(bot.id)?.pause();
        } catch (err) {
          log.error('bot recovery failed', { botId: bot.id, error: msg(err) });
        }
      }
    }
  } catch (err) {
    log.error('bot recovery scan failed', { error: msg(err) });
  }

  // Command polling loop
  const commandLoop = setInterval(() => {
    if (shuttingDown) return;
    commandProcessor
      .processPending()
      .catch((err) => log.error('command loop error', { error: msg(err) }));
  }, COMMAND_POLL_INTERVAL_MS);

  // Periodic order reconciliation
  setInterval(() => {
    if (shuttingDown) return;
    for (const engine of engines.values()) {
      engine.reconcileOrders().catch((err) => log.warn('reconcile error', { error: msg(err) }));
    }
  }, RECONCILE_INTERVAL_MS);

  // Track worker-level heartbeat for /health
  setInterval(() => {
    lastHeartbeatAt = new Date().toISOString();
  }, 20_000);
  lastHeartbeatAt = new Date().toISOString();

  // Graceful shutdown: stop entries immediately, close streams, keep positions
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(commandLoop);
    log.info('graceful shutdown initiated', { signal });
    for (const engine of engines.values()) {
      engine.shutdown();
    }
    // Give in-flight DB writes a moment to finish
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  log.info('worker ready');
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

main().catch((err) => {
  log.error('fatal worker error', { error: msg(err) });
  process.exit(1);
});
