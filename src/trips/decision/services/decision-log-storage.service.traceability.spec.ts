/**
 * TD-04：DecisionLogStorage 写入/读出路径接入 analyzeDecisionLogTraceability
 */
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DecisionLogEntry } from '../shared/decision-result.types';
import { minimalJepaTraceForCandidate } from '../shared/decision-trace-jepa.types';
import { DecisionLogStorageService } from './decision-log-storage.service';

describe('DecisionLogStorageService (TD-04 traceability)', () => {
  const tripUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  const validEntry = (over?: Partial<DecisionLogEntry>): DecisionLogEntry => ({
    persona: 'ABU',
    action: 'ALLOW',
    explanation: 'through gate',
    reasonCodes: [],
    timestamp: new Date().toISOString(),
    decisionSource: 'PHYSICAL',
    decisionStage: 'ABU_GATE',
    evidenceRefs: ['ev-1'],
    ...over,
  });

  let service: DecisionLogStorageService;
  let prisma: {
    decisionLog: {
      create: jest.Mock;
      createMany: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    prisma = {
      decisionLog: {
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecisionLogStorageService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DecisionLogStorageService);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('saveLogEntry: logs [TD-04][save] when explanation invalid and still calls create', async () => {
    await service.saveLogEntry(
      validEntry({ explanation: '   ' }),
      { tripId: tripUuid },
    );

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[TD-04][save]'));
    expect(prisma.decisionLog.create).toHaveBeenCalled();
  });

  it('saveLogEntry: does not warn when entry satisfies TD-04', async () => {
    await service.saveLogEntry(validEntry(), { tripId: tripUuid });

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('[TD-04][save]'));
    expect(prisma.decisionLog.create).toHaveBeenCalled();
  });

  it('saveLogEntries: logs traceability once for batch', async () => {
    await service.saveLogEntries([validEntry({ explanation: '' })], { tripId: tripUuid });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[TD-04][save]'));
    expect(prisma.decisionLog.createMany).toHaveBeenCalled();
  });

  it('queryLogs: logs [TD-04][read] when mapped rows fail contract', async () => {
    prisma.decisionLog.findMany.mockResolvedValue([
      {
        persona: 'NOT_A_PERSONA',
        action: 'ALLOW',
        explanation: 'x',
        reasonCodes: [],
        evidenceRefs: [],
        timestamp: new Date(),
        decisionSource: 'PHYSICAL',
        decisionStage: 'ABU_GATE',
      },
    ]);

    await service.queryLogs({ tripId: tripUuid, limit: 10 });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[TD-04][read]'));
  });

  it('DECISION_LOG_STRICT_WRITE: skips create when traceability has errors', async () => {
    process.env.DECISION_LOG_STRICT_WRITE = '1';
    try {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await service.saveLogEntry(validEntry({ explanation: '' }), { tripId: tripUuid });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('DECISION_LOG_STRICT_WRITE'));
      expect(prisma.decisionLog.create).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    } finally {
      delete process.env.DECISION_LOG_STRICT_WRITE;
    }
  });

  it('saveLogEntry: merges jepaTrace into Prisma metadata.jepaTrace', async () => {
    await service.saveLogEntry(
      validEntry({
        jepaTrace: minimalJepaTraceForCandidate('cand-99'),
        metadata: {
          candidateSearchAudit: {
            budget: { maxCandidates: 12, repairMaxIters: 2, repairTopKPerCandidate: 2, maxNewCandidatesPerIter: 30, maxPoolSize: 200 },
            initialVariantCount: 10,
            finalCandidateCount: 8,
          },
        },
      }),
      { tripId: tripUuid },
    );

    expect(prisma.decisionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            jepaTrace: expect.objectContaining({ candidateId: 'cand-99' }),
            candidateSearchAudit: expect.any(Object),
          }),
        }),
      }),
    );
  });

  it('queryLogs: maps metadata.jepaTrace back to DecisionLogEntry.jepaTrace', async () => {
    prisma.decisionLog.findMany.mockResolvedValue([
      {
        persona: 'ABU',
        action: 'ALLOW',
        explanation: 'ok',
        reasonCodes: [],
        evidenceRefs: [],
        timestamp: new Date(),
        decisionSource: 'PHYSICAL',
        decisionStage: 'PLAN_SCORE',
        metadata: { jepaTrace: minimalJepaTraceForCandidate('from-db'), candidateSearchAudit: { initialVariantCount: 3 } },
      },
    ]);

    const rows = await service.queryLogs({ tripId: tripUuid, limit: 5 });
    expect(rows[0].jepaTrace?.candidateId).toBe('from-db');
    expect(rows[0].metadata?.candidateSearchAudit).toBeDefined();
  });

  it('queryLogs: supports requestId metadata filter when tripId is not a UUID', async () => {
    await service.queryLogs({ tripId: 'e2e-case-1', requestId: 'e2e-case-1', limit: 5 });

    expect(prisma.decisionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          metadata: {
            path: ['requestId'],
            equals: 'e2e-case-1',
          },
        }),
      }),
    );
  });

  it('getLogById: runs read traceability on returned entry', async () => {
    prisma.decisionLog.findUnique.mockResolvedValue({
      persona: 'ABU',
      action: 'ALLOW',
      explanation: '',
      reasonCodes: [],
      evidenceRefs: [],
      timestamp: new Date(),
      decisionSource: 'PHYSICAL',
      decisionStage: 'ABU_GATE',
      tripId: tripUuid,
    });

    await service.getLogById('some-uuid');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[TD-04][read]'));
  });
});
