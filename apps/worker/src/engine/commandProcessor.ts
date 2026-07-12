import type { SystemCommand } from '@daytrading/shared';
import type { Db } from '../db.js';
import type { Logger } from '../logger.js';

export interface CommandHandlers {
  start: (botId: string) => Promise<void>;
  pause: (botId: string) => Promise<void>;
  resume: (botId: string) => Promise<void>;
  stop: (botId: string) => Promise<void>;
  emergency_stop: (botId: string) => Promise<void>;
  close_position: (botId: string) => Promise<void>;
}

/**
 * Polls system_commands and executes them. Commands are claimed atomically
 * (pending → processing) so each command runs exactly once, then marked
 * completed/failed with a processed_at timestamp.
 */
export class CommandProcessor {
  constructor(
    private readonly db: Db,
    private readonly handlers: CommandHandlers,
    private readonly log: Logger,
  ) {}

  /** Process all currently pending commands. Returns number processed. */
  async processPending(): Promise<number> {
    let processed = 0;
    for (;;) {
      const command = await this.db.claimNextCommand();
      if (!command) break;
      await this.execute(command);
      processed += 1;
    }
    return processed;
  }

  private async execute(command: SystemCommand): Promise<void> {
    this.log.info('processing command', {
      commandId: command.id,
      botId: command.bot_id,
      command: command.command,
    });
    try {
      const handler = this.handlers[command.command];
      if (!handler) throw new Error(`Unknown command: ${command.command}`);
      await handler(command.bot_id);
      await this.db.finishCommand(command.id, true);
      await this.db.logEvent(
        command.bot_id,
        'info',
        'command_completed',
        `Command ${command.command} completed`,
        { commandId: command.id },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error('command failed', { commandId: command.id, error: message });
      try {
        await this.db.finishCommand(command.id, false, message);
        await this.db.logEvent(
          command.bot_id,
          'error',
          'command_failed',
          `Command ${command.command} failed: ${message}`,
          { commandId: command.id },
        );
      } catch (persistErr) {
        this.log.error('failed to persist command failure', {
          commandId: command.id,
          error: persistErr instanceof Error ? persistErr.message : String(persistErr),
        });
      }
    }
  }
}
