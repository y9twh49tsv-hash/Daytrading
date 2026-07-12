import { describe, expect, it, vi } from 'vitest';
import { CommandProcessor, type CommandHandlers } from '../src/engine/commandProcessor.js';
import type { Db } from '../src/db.js';
import type { SystemCommand } from '@daytrading/shared';
import { Logger } from '../src/logger.js';

function makeCommand(overrides: Partial<SystemCommand> = {}): SystemCommand {
  return {
    id: 'cmd-1',
    bot_id: 'bot-1',
    command: 'start',
    status: 'processing',
    requested_by: 'user-1',
    created_at: new Date().toISOString(),
    processed_at: null,
    error_message: null,
    ...overrides,
  };
}

function makeFakeDb(queue: SystemCommand[]) {
  const finished: Array<{ id: string; ok: boolean; error?: string }> = [];
  const events: Array<{ level: string; type: string }> = [];
  const db = {
    claimNextCommand: vi.fn(async () => queue.shift() ?? null),
    finishCommand: vi.fn(async (id: string, ok: boolean, error?: string) => {
      finished.push({ id, ok, error });
    }),
    logEvent: vi.fn(async (_botId: string, level: string, type: string) => {
      events.push({ level, type });
    }),
  } as unknown as Db;
  return { db, finished, events };
}

function makeHandlers(overrides: Partial<CommandHandlers> = {}): CommandHandlers {
  return {
    start: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    emergency_stop: vi.fn(async () => {}),
    close_position: vi.fn(async () => {}),
    ...overrides,
  };
}

const log = new Logger('error');

describe('CommandProcessor', () => {
  it('processes pending commands in order and marks them completed', async () => {
    const { db, finished } = makeFakeDb([
      makeCommand({ id: 'c1', command: 'start' }),
      makeCommand({ id: 'c2', command: 'pause' }),
    ]);
    const handlers = makeHandlers();
    const processor = new CommandProcessor(db, handlers, log);

    const count = await processor.processPending();

    expect(count).toBe(2);
    expect(handlers.start).toHaveBeenCalledWith('bot-1');
    expect(handlers.pause).toHaveBeenCalledWith('bot-1');
    expect(finished).toEqual([
      { id: 'c1', ok: true, error: undefined },
      { id: 'c2', ok: true, error: undefined },
    ]);
  });

  it('marks a command failed when its handler throws, and continues', async () => {
    const { db, finished } = makeFakeDb([
      makeCommand({ id: 'c1', command: 'start' }),
      makeCommand({ id: 'c2', command: 'stop' }),
    ]);
    const handlers = makeHandlers({
      start: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const processor = new CommandProcessor(db, handlers, log);

    const count = await processor.processPending();

    expect(count).toBe(2);
    expect(finished[0]).toEqual({ id: 'c1', ok: false, error: 'boom' });
    expect(finished[1]).toEqual({ id: 'c2', ok: true, error: undefined });
  });

  it('dispatches every command type to its handler', async () => {
    const commands = [
      'start',
      'pause',
      'resume',
      'stop',
      'emergency_stop',
      'close_position',
    ] as const;
    const { db } = makeFakeDb(commands.map((c, i) => makeCommand({ id: `c${i}`, command: c })));
    const handlers = makeHandlers();
    const processor = new CommandProcessor(db, handlers, log);

    await processor.processPending();

    for (const c of commands) {
      expect(handlers[c]).toHaveBeenCalledOnce();
    }
  });

  it('does nothing when no commands are pending', async () => {
    const { db, finished } = makeFakeDb([]);
    const processor = new CommandProcessor(db, makeHandlers(), log);
    expect(await processor.processPending()).toBe(0);
    expect(finished).toHaveLength(0);
  });
});
