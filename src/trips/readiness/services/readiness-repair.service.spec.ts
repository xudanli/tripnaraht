import { BadRequestException } from '@nestjs/common';
import { ReadinessRepairService } from './readiness-repair.service';
import type { CoverageMapService } from './coverage-map.service';
import type { FindingMarksService } from './finding-marks.service';
import type { TripReadinessWeatherForecastService } from './trip-readiness-weather-forecast.service';
import type { ReadinessDecisionRepairBridgeService } from './readiness-decision-repair-bridge.service';
import type { TripPlanPersistenceService } from './trip-plan-persistence.service';
import { READINESS_DECISION_ENGINE_PATH } from '../utils/trip-decision-repair-bridge.util';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('ReadinessRepairService', () => {
  const prisma = {
    trip: { findUnique: jest.fn() },
  } as unknown as PrismaService;

  const coverageMapService = {
    getRepairOptions: jest.fn(),
    getReadinessScore: jest.fn(),
    getCoverageMap: jest.fn(),
  } as unknown as CoverageMapService;

  const findingMarksService = {
    markNotApplicable: jest.fn(),
    addToLater: jest.fn(),
  } as unknown as FindingMarksService;

  const weatherForecastService = {
    buildForecastRisksForTrip: jest.fn(),
  } as unknown as TripReadinessWeatherForecastService;

  const decisionRepairBridge = {
    executeDecisionRepair: jest.fn(),
  } as unknown as ReadinessDecisionRepairBridgeService;

  const tripPlanPersistence = {
    persistRepairPlan: jest.fn(),
  } as unknown as TripPlanPersistenceService;

  const guardianNegotiationService = {
    isEnabled: jest.fn().mockReturnValue(false),
    negotiateForTrip: jest.fn(),
    persistSnapshot: jest.fn(),
  } as unknown as import('./readiness-guardian-negotiation.service').ReadinessGuardianNegotiationService;

  const causalPreanalysisService = {
    persistResult: jest.fn().mockResolvedValue(undefined),
    loadSnapshot: jest.fn(),
  } as unknown as import('./readiness-causal-preanalysis.service').ReadinessCausalPreanalysisService;

  let service: ReadinessRepairService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReadinessRepairService(
      prisma,
      coverageMapService,
      findingMarksService,
      weatherForecastService,
      decisionRepairBridge,
      tripPlanPersistence,
      guardianNegotiationService,
      causalPreanalysisService,
    );
  });

  it('marks blocker as not applicable for manual_confirm', async () => {
    (coverageMapService.getRepairOptions as jest.Mock).mockResolvedValue({
      blockerId: 'finding-1',
      options: [
        {
          id: 'option-1',
          title: '手动确认',
          description: '已确认',
          impact: 'low',
          actionType: 'manual_confirm',
        },
      ],
    });
    (findingMarksService.markNotApplicable as jest.Mock).mockResolvedValue({
      findingId: 'finding-1',
      marked: true,
    });
    (coverageMapService.getReadinessScore as jest.Mock).mockResolvedValue({
      tripId: 'trip-1',
      score: { overall: 70 },
    });

    const result = await service.applyRepair({
      tripId: 'trip-1',
      blockerId: 'finding-1',
      optionId: 'option-1',
    });

    expect(result.status).toBe('applied');
    expect(result.actionType).toBe('manual_confirm');
    expect(findingMarksService.markNotApplicable).toHaveBeenCalled();
    expect(result.readinessScore?.score.overall).toBe(70);
  });

  it('redirects schedule repairs to decision engine', async () => {
    (coverageMapService.getRepairOptions as jest.Mock).mockResolvedValue({
      blockerId: 'finding-2',
      blockerMessage: 'Day 2 too dense',
      options: [
        {
          id: 'option-2',
          title: '调整顺序',
          description: '重排 POI',
          impact: 'medium',
          actionType: 'reorder_pois',
        },
      ],
    });

    const result = await service.applyRepair({
      tripId: 'trip-1',
      blockerId: 'finding-2',
      optionId: 'option-2',
    });

    expect(result.status).toBe('redirect');
    expect(result.redirectUrl).toBe(READINESS_DECISION_ENGINE_PATH);
  });

  it('executes decision repair when executeDecision is true', async () => {
    (coverageMapService.getRepairOptions as jest.Mock).mockResolvedValue({
      blockerId: 'finding-2',
      blockerMessage: 'Day 2 too dense',
      options: [
        {
          id: 'option-2',
          title: '调整顺序',
          description: '重排 POI',
          impact: 'medium',
          actionType: 'reorder_pois',
        },
      ],
    });
    (decisionRepairBridge.executeDecisionRepair as jest.Mock).mockResolvedValue({
      plan: { days: [{ day: 1, timeSlots: [] }] },
      log: { trigger: 'manual_repair' },
    });
    (tripPlanPersistence.persistRepairPlan as jest.Mock).mockResolvedValue({
      applied: true,
      updatedItemIds: ['item-1'],
      createdItemIds: [],
      removedItemIds: ['item-2'],
      skippedLockedItemIds: [],
    });
    (coverageMapService.getReadinessScore as jest.Mock).mockResolvedValue({
      tripId: 'trip-1',
      score: { overall: 72 },
    });

    const result = await service.applyRepair({
      tripId: 'trip-1',
      blockerId: 'finding-2',
      optionId: 'option-2',
      executeDecision: true,
    });

    expect(result.status).toBe('applied');
    expect(result.decisionPlan).toBeTruthy();
    expect(result.persisted).toBe(true);
    expect(result.persistence?.removedItemIds).toEqual(['item-2']);
    expect(decisionRepairBridge.executeDecisionRepair).toHaveBeenCalled();
    expect(tripPlanPersistence.persistRepairPlan).toHaveBeenCalled();
  });

  it('skips persistence when persistDecision is false', async () => {
    (coverageMapService.getRepairOptions as jest.Mock).mockResolvedValue({
      blockerId: 'finding-2',
      options: [
        {
          id: 'option-2',
          title: '调整顺序',
          description: '重排 POI',
          impact: 'medium',
          actionType: 'reorder_pois',
        },
      ],
    });
    (decisionRepairBridge.executeDecisionRepair as jest.Mock).mockResolvedValue({
      plan: { days: [] },
      log: {},
    });
    (coverageMapService.getReadinessScore as jest.Mock).mockResolvedValue({
      tripId: 'trip-1',
      score: { overall: 72 },
    });

    const result = await service.applyRepair({
      tripId: 'trip-1',
      blockerId: 'finding-2',
      optionId: 'option-2',
      executeDecision: true,
      persistDecision: false,
    });

    expect(result.persisted).toBe(false);
    expect(tripPlanPersistence.persistRepairPlan).not.toHaveBeenCalled();
  });

  it('rejects unknown option ids', async () => {
    (coverageMapService.getRepairOptions as jest.Mock).mockResolvedValue({
      blockerId: 'finding-1',
      options: [],
    });

    await expect(
      service.applyRepair({
        tripId: 'trip-1',
        blockerId: 'finding-1',
        optionId: 'missing',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refreshEvidence returns score and coverage summary', async () => {
    (prisma.trip.findUnique as jest.Mock).mockResolvedValue({ id: 'trip-1' });
    (coverageMapService.getReadinessScore as jest.Mock).mockResolvedValue({
      tripId: 'trip-1',
      score: { overall: 55 },
    });
    (coverageMapService.getCoverageMap as jest.Mock).mockResolvedValue({
      summary: { coverageRate: 0.8, totalGaps: 2 },
    });

    const result = await service.refreshEvidence('trip-1');

    expect(result.tripId).toBe('trip-1');
    expect(result.score.score.overall).toBe(55);
    expect(result.coverageSummary.coverageRate).toBe(0.8);
    expect(result.refreshedAt).toBeTruthy();
  });

  it('autoRepair picks a locally applicable high-impact option first', async () => {
    (coverageMapService.getRepairOptions as jest.Mock).mockResolvedValue({
      blockerId: 'finding-3',
      options: [
        {
          id: 'option-schedule',
          title: '调整顺序',
          description: '重排',
          impact: 'high',
          actionType: 'reorder_pois',
        },
        {
          id: 'option-refresh',
          title: '刷新',
          description: '刷新检查',
          impact: 'low',
          actionType: 'refresh',
        },
      ],
    });
    (coverageMapService.getReadinessScore as jest.Mock).mockResolvedValue({
      tripId: 'trip-1',
      score: { overall: 60 },
    });

    const result = await service.autoRepair({
      tripId: 'trip-1',
      blockerId: 'finding-3',
    });

    expect(result.optionId).toBe('option-refresh');
    expect(result.status).toBe('applied');
  });
});
