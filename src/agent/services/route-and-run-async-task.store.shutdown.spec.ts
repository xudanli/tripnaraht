import { RouteAndRunAsyncTaskStore } from './route-and-run-async-task.store';

describe('RouteAndRunAsyncTaskStore (shutdown)', () => {
  it('abandonInFlightTasks marks PROCESSING tasks as FAILED', async () => {
    const store = new RouteAndRunAsyncTaskStore();
    const init = await store.createInitialized(
      { request_id: 'req_1' } as any,
      'task_shutdown_1',
      { current_phase: 'RESEARCH', progress_percentage: 18, message: '…' },
    );
    expect(init.status).toBe('PROCESSING');

    const abandoned = await store.abandonInFlightTasks('SERVER_SHUTDOWN');
    expect(abandoned).toContain('task_shutdown_1');

    const status = await store.getStatus('task_shutdown_1');
    expect(status?.status).toBe('FAILED');
    expect(status?.error).toContain('SERVER_SHUTDOWN');
  });
});
