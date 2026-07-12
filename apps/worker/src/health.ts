import { createServer, type Server } from 'node:http';
import type { HealthResponse } from '@daytrading/shared';
import type { Logger } from './logger.js';

export interface HealthProviders {
  databaseConnected: () => Promise<boolean>;
  binanceConnected: () => 'connected' | 'disconnected' | 'disabled';
  lastHeartbeatAt: () => string | null;
  version: string;
  killSwitch: boolean;
  paperTrading: boolean;
}

/**
 * Minimal HTTP health endpoint. Returns operational status only — never any
 * secrets or configuration values.
 */
export function startHealthServer(port: number, providers: HealthProviders, log: Logger): Server {
  const startedAt = Date.now();

  const server = createServer((req, res) => {
    void (async () => {
      if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
        let db = false;
        try {
          db = await providers.databaseConnected();
        } catch {
          db = false;
        }
        const binance = providers.binanceConnected();
        const body: HealthResponse = {
          status: db && binance !== 'disconnected' ? 'ok' : db ? 'degraded' : 'error',
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          version: providers.version,
          database: db ? 'connected' : 'disconnected',
          binance,
          lastHeartbeatAt: providers.lastHeartbeatAt(),
          killSwitch: providers.killSwitch,
          paperTrading: providers.paperTrading,
        };
        res.writeHead(body.status === 'error' ? 503 : 200, {
          'content-type': 'application/json',
        });
        res.end(JSON.stringify(body));
      } else {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      }
    })().catch((err) => {
      log.error('health endpoint error', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal error' }));
    });
  });

  server.listen(port, () => log.info('health server listening', { port }));
  return server;
}
