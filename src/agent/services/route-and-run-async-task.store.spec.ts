import { RouteAndRunAsyncTaskStore } from './route-and-run-async-task.store';

describe('RouteAndRunAsyncTaskStore', () => {
  const store = new RouteAndRunAsyncTaskStore();

  it('createInitialized and getStatus round-trip in memory', async () => {
    const request = { request_id: 'req-async-1', user_id: 'u1', message: '冰岛环岛' };
    const taskId = store.buildTaskId(request as any);
    const init = await store.createInitialized(request as any, taskId, {
      current_phase: 'INTAKE',
      progress_percentage: 8,
      message: '规划师已接收需求…',
    });
    expect(init.task_id).toBe(taskId);
    expect(init.status).toBe('PROCESSING');

    await store.updateProgress(taskId, {
      current_phase: 'RESEARCH',
      progress_percentage: 18,
      message: '正在检索 POI…',
    });

    const status = await store.getStatus(taskId);
    expect(status?.current_phase).toBe('RESEARCH');
    expect(status?.progress_percentage).toBe(18);
    expect(status?.data).toBeNull();
  });
});
