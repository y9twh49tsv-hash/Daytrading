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
  PAPER_TRADING: z
    .string()
    .optional()
    .transform((v) => String(v ?? 'true').toLowerCase() !== 'false'),
  KILL_SWITCH: boolFromString,
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  WORKER_INSTANCE_ID: z.string().default('worker-1'),
});

export type WorkerConfig = z.infer<typeof envSchema> & { VERSION: string };

/**
 * LIVE trading is not implemented in this release. There is deliberately no
 * environment variable that could enable it.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid worker environment: ${issues}`);
  }
  return { ...parsed.data, VERSION: '0.1.0' };
}
