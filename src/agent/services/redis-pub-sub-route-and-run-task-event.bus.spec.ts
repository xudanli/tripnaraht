import { RedisPubSubRouteAndRunTaskEventBus } from './redis-pub-sub-route-and-run-task-event.bus';
import type { RouteAndRunTaskProgressPayload } from '../events/route-and-run-task.events';

function makePayload(taskId: string): RouteAndRunTaskProgressPayload {
  return {
    task_id: taskId,
    request_id: 'req_1',
    type: 'PHASE',
    current_phase: 'RESEARCH',
    progress_percentage: 18,
    message: '…',
    status: 'PROCESSING',
    ts: new Date().toISOString(),
  };
}

describe('RedisPubSubRouteAndRunTaskEventBus', () => {
  it('publish uses route_and_run:task channel', async () => {
    const publish = jest.fn().mockResolvedValue(1);
    const subscribe = jest.fn().mockResolvedValue(undefined);
    const unsubscribe = jest.fn().mockResolvedValue(undefined);
    const messageHandlers: Array<(ch: string, msg: string) => void> = [];

    const main = { publish } as any;
    const sub = {
      subscribe,
      unsubscribe,
      on: jest.fn((event: string, handler: (ch: string, msg: string) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      removeAllListeners: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    const bus = new RedisPubSubRouteAndRunTaskEventBus(main, sub);
    bus.emitProgress(makePayload('task_abc'));

    await new Promise((r) => setImmediate(r));
    expect(publish).toHaveBeenCalledWith(
      'route_and_run:task:task_abc',
      expect.stringContaining('"task_abc"'),
    );
  });

  it('routes redis message events to registered handlers', () => {
    const main = { publish: jest.fn(), disconnect: jest.fn() } as any;
    const messageHandlers: Array<(ch: string, msg: string) => void> = [];
    const sub = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      on: jest.fn((event: string, handler: (ch: string, msg: string) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      removeAllListeners: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    const bus = new RedisPubSubRouteAndRunTaskEventBus(main, sub);
    const received: RouteAndRunTaskProgressPayload[] = [];
    bus.onProgress('task_x', (p) => received.push(p));

    expect(sub.subscribe).toHaveBeenCalledWith('route_and_run:task:task_x');
    expect(messageHandlers.length).toBeGreaterThan(0);

    const payload = makePayload('task_x');
    messageHandlers[0]('route_and_run:task:task_x', JSON.stringify(payload));
    expect(received).toHaveLength(1);
    expect(received[0].current_phase).toBe('RESEARCH');
  });
});
