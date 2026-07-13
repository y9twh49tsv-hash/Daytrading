import { z } from 'zod';

const boolFromString = z
  .string()
  .optional()
  .transform((v) => String(v ?? '').toLowerCase() === 'true');

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  BINANCE_API_KEY: z.string().optional().default(''),
  BINANCE_API_SECRET: z.string().optional().default(''),
  BINANCE_BASE_URL: z.string().url().default('https://testnet.binance.vision'),
  BINANCE_WS_URL: z.string().url().default('wss://stream.testnet.binance.vision'),
  // Live (mainnet) endpoints — only used by bots with mode=live.
  BINANCE_LIVE_BASE_URL: z.string().url().default('https://api.binance.com'),
  BINANCE_LIVE_WS_URL: z.string().url().default('wss://stream.binance.com:9443'),
  // Separate credentials for live trading. Keep these distinct from the
  // testnet keys so a misconfiguration can never trade real funds by accident.
  BINANCE_LIVE_API_KEY: z.string().optional().default(''),
  BINANCE_LIVE_API_SECRET: z.string().optional().default(''),
  PAPER_TRADING: z
    .string()
    .optional()
    .transform((v) => String(v ?? 'true').toLowerCase() !== 'false'),
  // Explicit, deliberate opt-in required before any bot may trade real money.
  // Live trading additionally requires PAPER_TRADING=false and KILL_SWITCH=false.
  ALLOW_LIVE_TRADING: boolFromString,
  KILL_SWITCH: boolFromString,
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  WORKER_INSTANCE_ID: z.string().default('worker-1'),
});

export type WorkerConfig = z.infer<typeof envSchema> & { VERSION: string };

/**
 * Live trading with real funds is possible but gated behind ALLOW_LIVE_TRADING
 * (plus PAPER_TRADING=false and KILL_SWITCH=false). All risk controls
 * (stop-loss, take-profit, daily loss limit, max trades, cooldown, emergency
 * stop) still apply in live mode.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid worker environment: ${issues}`);
  }
  return { ...parsed.data, VERSION: '0.1.0' };
}
