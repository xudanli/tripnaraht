import { ServiceUnavailableException } from '@nestjs/common';
import { ExplorationReliabilityService } from './services/exploration-reliability.service';
import { ConsumerExplorationIssuesService } from './services/consumer-exploration-issues.service';
import { ExplorationCheckJobStoreService } from './services/exploration-check-job.store';

describe('ExplorationReliabilityService', () => {
  const tripId = 'trip_test';
  const scenarioId = 'scenario_test';
  const problemId = 'problem_f208';

  const feasibility = {
    validate: jest.fn(async () => ({
      tripId,
      verdict: { status: 'NEEDS_ATTENTION', headline: '需处理' },
    })),
  };

  const gateway = {
    getOptions: jest.fn(async () => ({
      problemId,
      actions: [
        {
          actionId: 'opt_vehicle',
          type: 'CHANGE_RESOURCE',
          source: 'CANONICAL',
          title: '升级车辆',
          summary: '四驱 SUV',
          allowed: true,
        },
        {
          actionId: 'opt_route',
          type: 'CHANGE_ROUTE',
          source: 'CANONICAL',
          title: '调整路线',
          summary: '绕开 F208',
          allowed: true,
        },
      ],
    })),
    submitResolution: jest.fn(async () => ({
      problemId,
      status: 'SUBMITTED',
    })),
    applyResolution: jest.fn(async () => ({
      problemId,
      revalidation: { status: 'PASSED', message: '原问题已解决' },
      problem: { workflowStatus: 'RESOLVED', executionStatus: 'VERIFIED' },
    })),
  };

  const readModel = {
    invalidateCache: jest.fn(),
    projectPlanningConflicts: jest.fn(async () => ({
      conflicts: [
        {
          id: problemId,
          severity: 'BLOCK',
          title: 'F208 当前不可通行',
          message: '2WD 车辆无法进入 F 路',
          affectedScopeSummary: 'Day 3 · F208',
          decisionRequired: true,
          metadata: {
            gatewayAssessmentBatchId: 'batch_abc',
            sourceLabel: 'Iceland Road Administration',
          },
        },
      ],
      summary: {},
    })),
  };

  const issuesService = new ConsumerExplorationIssuesService(readModel as any);
  const checkJobStore = new ExplorationCheckJobStoreService();

  let service: ExplorationReliabilityService;
  let prevUnified: string | undefined;

  beforeEach(() => {
    prevUnified = process.env.DECISION_GATEWAY_UNIFIED;
    process.env.DECISION_GATEWAY_UNIFIED = '1';
    jest.clearAllMocks();
    service = new ExplorationReliabilityService(
      feasibility as any,
      gateway as any,
      readModel as any,
      issuesService,
      checkJobStore,
    );
  });

  afterEach(() => {
    if (prevUnified === undefined) delete process.env.DECISION_GATEWAY_UNIFIED;
    else process.env.DECISION_GATEWAY_UNIFIED = prevUnified;
  });

  it('runCheck sync returns issues from unified read model after validate', async () => {
    const result = await service.runCheck({
      scenarioId,
      tripId,
      protocolId: 'iceland-discovery-v1',
    });

    expect(result.mode).toBe('sync');
    expect(feasibility.validate).toHaveBeenCalledWith(tripId, {});
    expect(readModel.invalidateCache).toHaveBeenCalledWith(tripId);
    if (result.mode === 'sync') {
      expect(result.issues.totalIssueCount).toBe(1);
      expect(result.issues.displayedIssues[0]?.issueId).toBe(problemId);
      expect(result.issues.displayedIssues[0]?.source.gatewayAssessmentBatchId).toBe('batch_abc');
    }
  });

  it('getRepairOptions proxies gateway actions', async () => {
    const result = await service.getRepairOptions(tripId, problemId);
    expect(result.options).toHaveLength(2);
    expect(gateway.getOptions).toHaveBeenCalledWith(tripId, problemId);
  });

  it('submit → apply invalidates cache and returns revalidation', async () => {
    await service.submitDecision(tripId, problemId, 'user_1', {
      selectedActionId: 'opt_vehicle',
    });
    const applied = await service.applyDecision(tripId, problemId, 'user_1');
    expect(applied.revalidation?.status).toBe('PASSED');
    expect(readModel.invalidateCache).toHaveBeenCalled();
  });

  it('runCheck async persists job for polling', async () => {
    const result = await service.runCheck({
      scenarioId,
      tripId,
      userId: 'user_1',
      protocolId: 'iceland-discovery-v1',
      asyncMode: true,
    });

    expect(result.mode).toBe('async');
    if (result.mode === 'async') {
      const polled = await service.getCheckJobWithIssues(result.jobId, 'iceland-discovery-v1');
      expect(['PENDING', 'RUNNING', 'COMPLETED']).toContain(polled.job.status);
    }
  });

  it('throws when gateway unified disabled for repair flow', async () => {
    process.env.DECISION_GATEWAY_UNIFIED = '0';
    await expect(service.getRepairOptions(tripId, problemId)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
