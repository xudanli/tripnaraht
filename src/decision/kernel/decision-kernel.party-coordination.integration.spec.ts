/**
 * PR-4 integration — Kernel executeOptimize wires MultiPersonDecisionService on multi-party trips.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { DecisionKernelService } from './decision-kernel.service';
import { StateManagerService } from './state-manager.service';
import { ConstraintEngineAdapterService } from './constraint-engine-adapter.service';
import { OptimizationEngineAdapterService } from './optimization-engine-adapter.service';
import { ContextEngineAdapterService } from './context-engine-adapter.service';
import { FeedbackEngineAdapterService } from './feedback-engine-adapter.service';
import { MultiPersonDecisionService } from '../../trips/decision/services/multi-person-decision.service';
import type { DecisionState } from './decision-state.types';

describe('PR-4 Decision Kernel — party coordination integration', () => {
  const mkDso = (): DecisionState =>
    ({
      userIntent: {
        destination: 'Iceland',
        days: 5,
        party: { count: 2, has_elderly: true },
      },
      tripState: {
        planDraft: {
          request_id: 'req-party',
          days: [
            {
              date: '2026-10-13',
              items: [
                {
                  id: 'a',
                  type: 'POI',
                  start_window: '09:00',
                  end_window: '10:00',
                  location_ref: { place_id: 'p1', name: 'P1' },
                },
              ],
            },
          ],
        },
      },
      environmentState: { routeDirectionId: 'rd-is', countryCode: 'IS' },
      systemState: { requestId: 'req-party', version: 0, startedAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString() },
      requestId: 'req-party',
    }) as DecisionState;

  it('executeOptimize attaches partyCoordination to research_data for multi-party DSO', async () => {
    const supportSpy = jest.fn(async () => ({
      individualAnalysis: [],
      conflictAreas: [
        {
          id: 'physical-conflict',
          type: 'PHYSICAL_CAPACITY_GAP',
          severity: 'HIGH',
          involvedTravelers: ['traveler_0', 'traveler_1'],
          description: '体能差异',
          reason: 'party barrel',
          impact: ['pace'],
        },
      ],
      consensus: [],
      optionsForCoordination: [
        {
          id: 'relaxed-with-upgrade',
          strategy: 'OVERALL_RELAXED_WITH_UPGRADE',
          description: '舒缓+升级',
          implementation: [],
          resolvedConflicts: ['physical-conflict'],
          advantages: [],
          disadvantages: [],
          suitabilityScore: 0.8,
          expectedSatisfaction: {},
        },
      ],
      suggestedDiscussionPoints: [],
      overallRecommendation: '建议采用舒缓节奏并讨论升级选项',
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecisionKernelService,
        StateManagerService,
        {
          provide: ConstraintEngineAdapterService,
          useValue: { getConstraintReport: jest.fn(), getConstraintReportAsync: jest.fn() },
        },
        {
          provide: OptimizationEngineAdapterService,
          useValue: {
            getHintsAsync: jest.fn(async () => ({ method: 'CGUS', recommendedAlternativeId: 'base' })),
            getHints: jest.fn(() => ({ method: 'HEURISTIC' })),
          },
        },
        { provide: ContextEngineAdapterService, useValue: { buildContextPackage: jest.fn() } },
        { provide: FeedbackEngineAdapterService, useValue: {} },
        { provide: MultiPersonDecisionService, useValue: { supportMultiPersonDecision: supportSpy } },
      ],
    }).compile();

    const kernel = module.get(DecisionKernelService);
    const { newState } = await kernel.executeOptimize(mkDso());

    expect(supportSpy).toHaveBeenCalled();
    const pc = (newState.research_data as any)?.partyCoordination;
    expect(pc?.schemaVersion).toBe('party-coordination/v1');
    expect(pc?.summary?.conflictCount).toBe(1);
    expect(pc?.summary?.topStrategy).toBe('OVERALL_RELAXED_WITH_UPGRADE');
  });
});
