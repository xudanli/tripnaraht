import { AgentActionLogService } from './agent-action-log.service';

describe('AgentActionLogService', () => {
  it('listPaginated passes evidence context filter to prisma where', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      agentActionLog: {
        findMany,
        count,
      },
    };
    const service = new AgentActionLogService(prisma);

    await service.listPaginated({
      status: 'FAILED',
      tripId: 'trip-1',
      hasEvidenceRequirementContext: true,
      take: 20,
      skip: 0,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'FAILED',
          tripId: 'trip-1',
          AND: [
            {
              payload: {
                path: ['evidence_requirement_context'],
                not: null,
              },
            },
          ],
        }),
      }),
    );
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              payload: {
                path: ['evidence_requirement_context'],
                not: null,
              },
            },
          ],
        }),
      }),
    );
  });

  it('listPaginated supports missing evidence context filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      agentActionLog: {
        findMany,
        count,
      },
    };
    const service = new AgentActionLogService(prisma);

    await service.listPaginated({
      hasEvidenceRequirementContext: false,
      take: 10,
      skip: 5,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              payload: {
                path: ['evidence_requirement_context'],
                equals: null,
              },
            },
          ],
        }),
      }),
    );
  });

  it('listPaginated does not inject payload filter when hasEvidenceRequirementContext is omitted', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      agentActionLog: {
        findMany,
        count,
      },
    };
    const service = new AgentActionLogService(prisma);

    await service.listPaginated({
      status: 'COMMITTED',
      take: 5,
      skip: 0,
    });

    const whereArg = findMany.mock.calls[0]?.[0]?.where;
    expect(whereArg.status).toBe('COMMITTED');
    expect(Object.prototype.hasOwnProperty.call(whereArg, 'payload')).toBe(false);
  });

  it('listPaginated combines status/tripId/evidence filters in one where clause', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      agentActionLog: {
        findMany,
        count,
      },
    };
    const service = new AgentActionLogService(prisma);

    await service.listPaginated({
      status: 'FAILED',
      tripId: 'trip-99',
      hasEvidenceRequirementContext: true,
      take: 25,
      skip: 50,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'FAILED',
          tripId: 'trip-99',
          AND: [
            {
              payload: {
                path: ['evidence_requirement_context'],
                not: null,
              },
            },
          ],
        }),
        orderBy: { updatedAt: 'desc' },
        take: 25,
        skip: 50,
      }),
    );
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'FAILED',
          tripId: 'trip-99',
          AND: [
            {
              payload: {
                path: ['evidence_requirement_context'],
                not: null,
              },
            },
          ],
        }),
      }),
    );
  });

  it('listPaginated adds hasApplyFailed JSON filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      agentActionLog: {
        findMany,
        count,
      },
    };
    const service = new AgentActionLogService(prisma);

    await service.listPaginated({
      hasApplyFailed: true,
      take: 20,
      skip: 0,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              payload: {
                path: ['realized_state', 'side_effects_ledger'],
                array_contains: [{ status: 'APPLY_FAILED' }],
              },
            },
          ]),
        }),
      }),
    );
  });

  it('listPaginated adds hasCompensationFailed JSON filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      agentActionLog: {
        findMany,
        count,
      },
    };
    const service = new AgentActionLogService(prisma);

    await service.listPaginated({
      hasCompensationFailed: true,
      take: 20,
      skip: 0,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              payload: {
                path: ['realized_state', 'side_effects_ledger'],
                array_contains: [{ status: 'COMPENSATION_FAILED' }],
              },
            },
          ]),
        }),
      }),
    );
  });

  it('listPaginated filters by minRetryCount and paginates filtered rows', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      agentActionLog: {
        findMany,
        count,
      },
    };
    const service = new AgentActionLogService(prisma);

    const res = await service.listPaginated({
      minRetryCount: 1,
      take: 1,
      skip: 1,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              payload: {
                path: ['realized_state', 'max_retry_count'],
                gte: 1,
              },
            },
          ]),
        }),
        take: 1,
        skip: 1,
      }),
    );
    expect(count).toHaveBeenCalled();
    expect(res.total).toBe(0);
  });

  it('listPaginated keeps minRetryCount=0 as valid DB filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      agentActionLog: {
        findMany,
        count,
      },
    };
    const service = new AgentActionLogService(prisma);

    await service.listPaginated({
      minRetryCount: 0,
      take: 10,
      skip: 0,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              payload: {
                path: ['realized_state', 'max_retry_count'],
                gte: 0,
              },
            },
          ]),
        }),
      }),
    );
  });

  it('listPaginated falls back to app filtering when minRetryCount DB filter fails', async () => {
    const findMany = jest
      .fn()
      .mockRejectedValueOnce(new Error('json gte unsupported'))
      .mockResolvedValueOnce([
        {
          id: 'log-3',
          payload: { realized_state: { max_retry_count: 3, side_effects_ledger: [{ retry_count: 3 }] } },
          updatedAt: new Date('2026-01-03T00:00:00.000Z'),
        },
        {
          id: 'log-1',
          payload: { realized_state: { max_retry_count: 1, side_effects_ledger: [{ retry_count: 1 }] } },
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'log-0',
          payload: { realized_state: { max_retry_count: 0, side_effects_ledger: [{ retry_count: 0 }] } },
          updatedAt: new Date('2025-12-31T00:00:00.000Z'),
        },
      ]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      agentActionLog: {
        findMany,
        count,
      },
    };
    const service = new AgentActionLogService(prisma);

    const res = await service.listPaginated({
      minRetryCount: 1,
      take: 1,
      skip: 1,
    });

    expect(res.total).toBe(2);
    expect(res.rows).toHaveLength(1);
    expect((res.rows[0] as any).id).toBe('log-1');
  });

  it('logs minRetryCount DB fallback warning only once per service instance', async () => {
    const findMany = jest
      .fn()
      .mockRejectedValueOnce(new Error('json gte unsupported #1'))
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('json gte unsupported #2'))
      .mockResolvedValueOnce([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      agentActionLog: { findMany, count },
    };
    const service = new AgentActionLogService(prisma);
    const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

    await service.listPaginated({ minRetryCount: 1, take: 10, skip: 0 });
    await service.listPaginated({ minRetryCount: 1, take: 10, skip: 0 });

    const fallbackWarns = warnSpy.mock.calls.filter((c) =>
      String(c?.[0] ?? '').includes('minRetryCount DB filter fallback'),
    );
    expect(fallbackWarns).toHaveLength(1);
  });

  it('listPaginated adds hasManualInterventionRequired JSON filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      agentActionLog: {
        findMany,
        count,
      },
    };
    const service = new AgentActionLogService(prisma);

    await service.listPaginated({
      hasManualInterventionRequired: true,
      take: 20,
      skip: 0,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              payload: {
                path: ['realized_state', 'side_effects_ledger'],
                array_contains: [{ status: 'MANUAL_INTERVENTION_REQUIRED' }],
              },
            },
          ]),
        }),
      }),
    );
  });
});
