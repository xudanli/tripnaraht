import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DecisionCollaborativeSubTaskService } from './decision-collaborative-subtask.service';

describe('DecisionCollaborativeSubTaskService', () => {
  const store = {
    create: jest.fn(),
    listForTrip: jest.fn(),
    listForResolution: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    syncActionPlanIdForResolution: jest.fn(),
  };

  const resolutionStore = {
    getForProblem: jest.fn(),
  };

  let service: DecisionCollaborativeSubTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DecisionCollaborativeSubTaskService(store as never, resolutionStore as never);
  });

  it('creates sub-task when resolution matches problem', async () => {
    resolutionStore.getForProblem.mockResolvedValue({
      resolutionId: 'res_p1',
      actionPlanId: 'ap_1',
    });
    store.create.mockResolvedValue({
      id: 'csub_abc',
      tripId: 'trip1',
      problemId: 'p1',
      resolutionId: 'res_p1',
      actionPlanId: 'ap_1',
      kind: 'OTHER',
      title: '查取消政策',
      status: 'pending',
      createdAt: '2026-07-03T00:00:00Z',
      createdByUserId: 'user1',
    });

    const result = await service.createSubTask('trip1', 'p1', 'user1', {
      resolutionId: 'res_p1',
      title: '查取消政策',
    });

    expect(store.create).toHaveBeenCalledWith(
      'trip1',
      expect.objectContaining({
        problemId: 'p1',
        resolutionId: 'res_p1',
        actionPlanId: 'ap_1',
        title: '查取消政策',
      }),
    );
    expect(result.subTask.id).toBe('csub_abc');
    expect(result.schemaId).toBe('tripnara.decision_collaborative_subtask_create@v1');
  });

  it('creates sub-task when resolutionId omitted (binds active resolution)', async () => {
    resolutionStore.getForProblem.mockResolvedValue({
      resolutionId: 'res_p1',
      actionPlanId: 'ap_1',
    });
    store.create.mockResolvedValue({
      id: 'csub_auto',
      tripId: 'trip1',
      problemId: 'p1',
      resolutionId: 'res_p1',
      kind: 'OTHER',
      title: '团队确认',
      status: 'pending',
      createdAt: '2026-07-03T00:00:00Z',
      createdByUserId: 'user1',
    });

    await service.createSubTask('trip1', 'p1', 'user1', { title: '团队确认' });

    expect(store.create).toHaveBeenCalledWith(
      'trip1',
      expect.objectContaining({ resolutionId: 'res_p1' }),
    );
  });

  it('accepts decisionId alias as resolution binding', async () => {
    resolutionStore.getForProblem.mockResolvedValue({
      resolutionId: 'res_p1',
      decisionId: 'dec_99',
    });
    store.create.mockResolvedValue({
      id: 'csub_alias',
      tripId: 'trip1',
      problemId: 'p1',
      resolutionId: 'res_p1',
      kind: 'OTHER',
      title: 'x',
      status: 'pending',
      createdAt: '2026-07-03T00:00:00Z',
      createdByUserId: 'user1',
    });

    await service.createSubTask('trip1', 'p1', 'user1', {
      resolutionId: 'dec_99',
      title: 'x',
    });

    expect(store.create).toHaveBeenCalledWith(
      'trip1',
      expect.objectContaining({ resolutionId: 'res_p1' }),
    );
  });

  it('rejects when resolution not found', async () => {
    resolutionStore.getForProblem.mockResolvedValue(undefined);

    await expect(
      service.createSubTask('trip1', 'p1', 'user1', {
        resolutionId: 'res_missing',
        title: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects resolutionId mismatch', async () => {
    resolutionStore.getForProblem.mockResolvedValue({
      resolutionId: 'res_other',
      decisionId: 'dec_other',
    });

    await expect(
      service.createSubTask('trip1', 'p1', 'user1', {
        resolutionId: 'res_p1',
        title: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists sub-tasks filtered by resolutionId', async () => {
    resolutionStore.getForProblem.mockResolvedValue({ resolutionId: 'res_p1' });
    store.listForResolution.mockResolvedValue([
      {
        id: 'csub_1',
        tripId: 'trip1',
        problemId: 'p1',
        resolutionId: 'res_p1',
        kind: 'TEAM_CONFIRM',
        title: '确认团队',
        status: 'pending',
        createdAt: '2026-07-03T00:00:00Z',
        createdByUserId: 'user1',
      },
    ]);

    const result = await service.listSubTasks('trip1', 'p1', 'res_p1');

    expect(store.listForResolution).toHaveBeenCalledWith('trip1', 'res_p1');
    expect(result.items).toHaveLength(1);
    expect(result.schemaId).toBe('tripnara.decision_collaborative_subtasks@v1');
  });

  it('updates sub-task status', async () => {
    store.getById.mockResolvedValue({
      id: 'csub_1',
      tripId: 'trip1',
      problemId: 'p1',
      resolutionId: 'res_p1',
      kind: 'OTHER',
      title: 'x',
      status: 'pending',
      createdAt: '2026-07-03T00:00:00Z',
      createdByUserId: 'user1',
    });
    store.update.mockResolvedValue({
      id: 'csub_1',
      tripId: 'trip1',
      problemId: 'p1',
      resolutionId: 'res_p1',
      kind: 'OTHER',
      title: 'x',
      status: 'completed',
      createdAt: '2026-07-03T00:00:00Z',
      createdByUserId: 'user1',
    });

    const result = await service.updateSubTask('trip1', 'p1', 'csub_1', { status: 'completed' });

    expect(store.update).toHaveBeenCalledWith('trip1', 'csub_1', { status: 'completed' });
    expect(result.subTask.status).toBe('completed');
  });

  it('seeds suggested sub-tasks on apply when none exist', async () => {
    store.listForResolution.mockResolvedValue([]);
    store.create.mockImplementation(async (_tripId, input) => ({
      id: `csub_${input.kind}`,
      tripId: 'trip1',
      createdAt: '2026-07-03T00:00:00Z',
      ...input,
    }));

    const items = await service.ensureSuggestedOnApply({
      tripId: 'trip1',
      problemId: 'p1',
      resolutionId: 'res_p1',
      actionPlanId: 'ap_1',
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
      userId: 'user1',
    });

    expect(store.syncActionPlanIdForResolution).toHaveBeenCalledWith('trip1', 'res_p1', 'ap_1');
    expect(store.create).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(2);
  });

  it('skips seeding when sub-tasks already exist', async () => {
    store.listForResolution.mockResolvedValue([
      {
        id: 'csub_existing',
        tripId: 'trip1',
        problemId: 'p1',
        resolutionId: 'res_p1',
        kind: 'OTHER',
        title: 'manual',
        status: 'pending',
        createdAt: '2026-07-03T00:00:00Z',
        createdByUserId: 'user1',
      },
    ]);

    const items = await service.ensureSuggestedOnApply({
      tripId: 'trip1',
      problemId: 'p1',
      resolutionId: 'res_p1',
      userId: 'user1',
    });

    expect(store.create).not.toHaveBeenCalled();
    expect(items).toHaveLength(1);
  });

  it('deletes sub-task', async () => {
    store.getById.mockResolvedValue({
      id: 'csub_1',
      tripId: 'trip1',
      problemId: 'p1',
      resolutionId: 'res_p1',
      kind: 'OTHER',
      title: 'x',
      status: 'pending',
      createdAt: '2026-07-03T00:00:00Z',
      createdByUserId: 'user1',
    });
    store.remove.mockResolvedValue(true);

    const result = await service.deleteSubTask('trip1', 'p1', 'csub_1');

    expect(store.remove).toHaveBeenCalledWith('trip1', 'csub_1');
    expect(result.deleted).toBe(true);
    expect(result.schemaId).toBe('tripnara.decision_collaborative_subtask_delete@v1');
  });
});
