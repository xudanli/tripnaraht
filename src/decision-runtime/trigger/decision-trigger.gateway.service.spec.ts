import { Test } from '@nestjs/testing';
import { DecisionTriggerGatewayService } from './decision-trigger.gateway.service';
import { DecisionTriggerLineageStore } from './decision-trigger-lineage.store';
import { FullPlanSelectionService } from '../core/full-plan-selection.service';
import { DecisionTriggerCanonicalEvaluateHandler } from './decision-trigger-canonical-evaluate.handler';
import { EvidenceResolverService } from '../../trips/guardian-decision-core/evidence/evidence-resolver.service';
import { WeatherActivityProhibitedPipelineService } from '../../trips/guardian-decision-core/detection/weather-activity-prohibited-pipeline.service';
import { ExcessiveDailyLoadPipelineService } from '../../trips/guardian-decision-core/detection/excessive-daily-load-pipeline.service';

describe('DecisionTriggerGatewayService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, DECISION_TRIGGER_GATEWAY_ENABLED: '1' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('buildRunRequest records lineage when enabled', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DecisionTriggerGatewayService,
        DecisionTriggerLineageStore,
        {
          provide: FullPlanSelectionService,
          useValue: { selectRecommendedPlan: jest.fn() },
        },
        {
          provide: DecisionTriggerCanonicalEvaluateHandler,
          useValue: { evaluate: jest.fn() },
        },
        {
          provide: EvidenceResolverService,
          useValue: { fetchAndResolveWeatherIfChanged: jest.fn() },
        },
        {
          provide: WeatherActivityProhibitedPipelineService,
          useValue: { runFromResolvedEvidence: jest.fn() },
        },
        {
          provide: ExcessiveDailyLoadPipelineService,
          useValue: { scanTrip: jest.fn() },
        },
      ],
    }).compile();

    const gateway = moduleRef.get(DecisionTriggerGatewayService);
    const lineage = moduleRef.get(DecisionTriggerLineageStore);

    const request = gateway.buildRunRequest({
      kind: 'CANONICAL_PROBLEM_EVALUATE',
      tripId: 'trip-1',
      source: 'UNIFIED_DECISION_API',
      problemId: 'problem_1',
      requestId: 'run_lineage_1',
    });

    expect(request.runId).toBe('run_lineage_1');
    expect(lineage.list('trip-1')).toHaveLength(1);
  });

  it('dispatch returns DELEGATED for agentic route', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DecisionTriggerGatewayService,
        DecisionTriggerLineageStore,
        {
          provide: FullPlanSelectionService,
          useValue: { selectRecommendedPlan: jest.fn() },
        },
        {
          provide: DecisionTriggerCanonicalEvaluateHandler,
          useValue: { evaluate: jest.fn() },
        },
        {
          provide: EvidenceResolverService,
          useValue: { fetchAndResolveWeatherIfChanged: jest.fn() },
        },
        {
          provide: WeatherActivityProhibitedPipelineService,
          useValue: { runFromResolvedEvidence: jest.fn() },
        },
        {
          provide: ExcessiveDailyLoadPipelineService,
          useValue: { scanTrip: jest.fn() },
        },
      ],
    }).compile();

    const gateway = moduleRef.get(DecisionTriggerGatewayService);
    const result = await gateway.dispatch({
      kind: 'LEGACY_AGENT_ROUTE',
      tripId: 'trip-1',
      source: 'AGENT_ROUTE_AND_RUN',
      requestId: 'run_agent_1',
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.routeTarget).toBe('LEGACY_DECISION_ENGINE');
    expect((result.result as { delegated?: boolean }).delegated).toBe(true);
  });

  it('dispatch acknowledges user.trip-edit post-edit', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DecisionTriggerGatewayService,
        DecisionTriggerLineageStore,
        {
          provide: FullPlanSelectionService,
          useValue: { selectRecommendedPlan: jest.fn() },
        },
        {
          provide: DecisionTriggerCanonicalEvaluateHandler,
          useValue: { evaluate: jest.fn() },
        },
        {
          provide: EvidenceResolverService,
          useValue: { fetchAndResolveWeatherIfChanged: jest.fn() },
        },
        {
          provide: WeatherActivityProhibitedPipelineService,
          useValue: { runFromResolvedEvidence: jest.fn() },
        },
        {
          provide: ExcessiveDailyLoadPipelineService,
          useValue: { scanTrip: jest.fn() },
        },
      ],
    }).compile();

    const gateway = moduleRef.get(DecisionTriggerGatewayService);
    const result = await gateway.dispatch({
      kind: 'USER_INTENT',
      tripId: 'trip-1',
      source: 'HTTP',
      requestId: 'run_trip_edit_1',
      metadata: {
        entryPointId: 'user.trip-edit',
        intent: 'batch_itinerary_update',
        updatedCount: 2,
      },
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.routeTarget).toBe('AGENTIC_ORCHESTRATION');
    expect((result.result as { acknowledged?: boolean }).acknowledged).toBe(true);
    expect((result.result as { entryPointId?: string }).entryPointId).toBe('user.trip-edit');
  });

  it('dispatch acknowledges loops.in-trip-recovery', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DecisionTriggerGatewayService,
        DecisionTriggerLineageStore,
        {
          provide: FullPlanSelectionService,
          useValue: { selectRecommendedPlan: jest.fn() },
        },
        {
          provide: DecisionTriggerCanonicalEvaluateHandler,
          useValue: { evaluate: jest.fn() },
        },
        {
          provide: EvidenceResolverService,
          useValue: { fetchAndResolveWeatherIfChanged: jest.fn() },
        },
        {
          provide: WeatherActivityProhibitedPipelineService,
          useValue: { runFromResolvedEvidence: jest.fn() },
        },
        {
          provide: ExcessiveDailyLoadPipelineService,
          useValue: { scanTrip: jest.fn() },
        },
      ],
    }).compile();

    const gateway = moduleRef.get(DecisionTriggerGatewayService);
    const evaluate = moduleRef.get(DecisionTriggerCanonicalEvaluateHandler);
    const result = await gateway.dispatch({
      kind: 'IN_TRIP_DEVIATION',
      tripId: 'trip-1',
      source: 'INTERNAL',
      requestId: 'run_in_trip_1',
      metadata: {
        entryPointId: 'loops.in-trip-recovery',
        triggerType: 'ROAD_CLOSED',
        loopType: 'IN_TRIP_RECOVERY',
        eventSeverity: 'HIGH',
      },
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.routeTarget).toBe('CANONICAL_L2_EVALUATE');
    expect(evaluate.evaluate).not.toHaveBeenCalled();
    expect((result.result as { loopDelegated?: boolean }).loopDelegated).toBe(true);
    expect((result.result as { entryPointId?: string }).entryPointId).toBe(
      'loops.in-trip-recovery',
    );
  });

  it('dispatch acknowledges kernel.replan-coordinator', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DecisionTriggerGatewayService,
        DecisionTriggerLineageStore,
        {
          provide: FullPlanSelectionService,
          useValue: { selectRecommendedPlan: jest.fn() },
        },
        {
          provide: DecisionTriggerCanonicalEvaluateHandler,
          useValue: { evaluate: jest.fn() },
        },
        {
          provide: EvidenceResolverService,
          useValue: { fetchAndResolveWeatherIfChanged: jest.fn() },
        },
        {
          provide: WeatherActivityProhibitedPipelineService,
          useValue: { runFromResolvedEvidence: jest.fn() },
        },
        {
          provide: ExcessiveDailyLoadPipelineService,
          useValue: { scanTrip: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    const gateway = moduleRef.get(DecisionTriggerGatewayService);
    const loadPipeline = moduleRef.get(ExcessiveDailyLoadPipelineService);
    const result = await gateway.dispatch({
      kind: 'WORLD_EVENT',
      tripId: 'trip-1',
      source: 'INTERNAL',
      requestId: 'run_kernel_replan_1',
      metadata: {
        entryPointId: 'kernel.replan-coordinator',
        reason: 'flight_cancelled',
        eventSeverity: 'HIGH',
        replanPath: 'kernel_replan_coordinator',
      },
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.routeTarget).toBe('CANONICAL_MONITORING');
    expect(loadPipeline.scanTrip).not.toHaveBeenCalled();
    expect((result.result as { kernelDelegated?: boolean }).kernelDelegated).toBe(true);
    expect((result.result as { entryPointId?: string }).entryPointId).toBe(
      'kernel.replan-coordinator',
    );
  });

  it('dispatch acknowledges manual repair apply-repair', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DecisionTriggerGatewayService,
        DecisionTriggerLineageStore,
        {
          provide: FullPlanSelectionService,
          useValue: { selectRecommendedPlan: jest.fn() },
        },
        {
          provide: DecisionTriggerCanonicalEvaluateHandler,
          useValue: { evaluate: jest.fn() },
        },
        {
          provide: EvidenceResolverService,
          useValue: { fetchAndResolveWeatherIfChanged: jest.fn() },
        },
        {
          provide: WeatherActivityProhibitedPipelineService,
          useValue: { runFromResolvedEvidence: jest.fn() },
        },
        {
          provide: ExcessiveDailyLoadPipelineService,
          useValue: { scanTrip: jest.fn() },
        },
      ],
    }).compile();

    const gateway = moduleRef.get(DecisionTriggerGatewayService);
    const evaluate = moduleRef.get(DecisionTriggerCanonicalEvaluateHandler);
    const result = await gateway.dispatch({
      kind: 'MANUAL_REPAIR_REQUEST',
      tripId: 'trip-1',
      source: 'HTTP',
      requestId: 'run_manual_repair_1',
      metadata: {
        entryPointId: 'user.feasibility-apply-repair',
        issueId: 'issue_1',
        intent: 'manual_repair',
      },
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.routeTarget).toBe('CANONICAL_L2_EVALUATE');
    expect(evaluate.evaluate).not.toHaveBeenCalled();
    expect((result.result as { repairDelegated?: boolean }).repairDelegated).toBe(true);
    expect((result.result as { entryPointId?: string }).entryPointId).toBe(
      'user.feasibility-apply-repair',
    );
  });

  it('dispatch acknowledges agent.route-and-run advisory', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DecisionTriggerGatewayService,
        DecisionTriggerLineageStore,
        {
          provide: FullPlanSelectionService,
          useValue: { selectRecommendedPlan: jest.fn() },
        },
        {
          provide: DecisionTriggerCanonicalEvaluateHandler,
          useValue: { evaluate: jest.fn() },
        },
        {
          provide: EvidenceResolverService,
          useValue: { fetchAndResolveWeatherIfChanged: jest.fn() },
        },
        {
          provide: WeatherActivityProhibitedPipelineService,
          useValue: { runFromResolvedEvidence: jest.fn() },
        },
        {
          provide: ExcessiveDailyLoadPipelineService,
          useValue: { scanTrip: jest.fn() },
        },
      ],
    }).compile();

    const gateway = moduleRef.get(DecisionTriggerGatewayService);
    const result = await gateway.dispatch({
      kind: 'LEGACY_AGENT_ROUTE',
      tripId: 'trip-1',
      source: 'AGENT_ROUTE_AND_RUN',
      requestId: 'run_agent_dispatch_1',
      metadata: {
        entryPointId: 'agent.route-and-run',
        intent: 'agentic_orchestration',
      },
    });

    expect(result.status).toBe('COMPLETED');
    expect((result.result as { advisoryOnly?: boolean }).advisoryOnly).toBe(true);
    expect((result.result as { entryPointId?: string }).entryPointId).toBe('agent.route-and-run');
  });
});
