import type { ExecutionDepartureObservation } from '../../guardian-decision-core/contracts/execution-slip.types';
import type { ExecutionSlipImpactResult } from '../../guardian-decision-core/detection/execution-slip-impact-analyzer';
import type { DailyDrivePlan } from '../contracts/tep-self-drive.types';
import { TepExecutionSlipDaylightBridgeService } from './tep-execution-slip-daylight.bridge';
import { TepRuntimePipelineBridgeService } from './tep-runtime-pipeline.bridge';
import { ExecutabilityAssessmentService } from './executability-assessment.service';

const glacierDay: DailyDrivePlan = {
  date: '2026-01-15',
  dayIndex: 1,
  origin: { ref: 'anchor_a', label: 'A' },
  destination: { ref: 'anchor_b', label: 'B' },
  legs: [
    {
      legId: 'drive_leg_1_1',
      fromRef: 'item_a',
      toRef: 'item_b',
      baseNavigationMinutes: 600,
      roadRefs: ['segment:cert_304:ring'],
      importance: 'MANDATORY',
      flexibility: 'FIXED',
    },
  ],
  activities: [],
  buffers: [],
};

describe('TepExecutionSlipDaylightBridgeService', () => {
  const observation: ExecutionDepartureObservation = {
    observationId: 'obs_slip_1',
    tripId: 'trip_slip_daylight',
    planVersionId: 'plan_v1',
    activityId: 'item_a',
    plannedDepartAt: '2026-01-15T10:00:00.000Z',
    observedAt: '2026-01-15T11:30:00.000Z',
    stillAtPoi: true,
    source: 'USER_REPORT',
    recordedBy: 'user_1',
    recordedAt: '2026-01-15T11:30:00.000Z',
  };

  const impact: ExecutionSlipImpactResult = {
    tripId: 'trip_slip_daylight',
    currentActivityId: 'item_a',
    nextActivityId: 'item_b',
    affectedPlanItemIds: ['item_a', 'item_b'],
    affectedEntityRefs: [],
    assessment: {
      result: 'AT_RISK',
      projectedEta: '2026-01-15T22:00:00.000Z',
      slipMinutes: 90,
      gate: 'NEED_CONFIRM',
      reasonCodes: [],
      infeasible: false,
    },
    nextWindow: null,
    travelDurationMinutes: 103,
    shortenDeltaMinutes: 45,
  };

  it('triggers daylight hook when slip increases dusk violation', async () => {
    const pipelineBridge = {
      tryTriggerFromDaylightScheduleRisk: jest.fn(async () => ({
        matched: true,
        transitioned: true,
        hook: { hookId: 'HOOK-DAYLIGHT-D1-1' },
        problem: { problemId: 'problem_tep_slip_daylight' },
      })),
    } as unknown as TepRuntimePipelineBridgeService;

    const executability = {
      getExecutability: jest.fn(async () => ({
        tripId: 'trip_slip_daylight',
        assessment: { packId: 'destination.is' },
        profile: {
          vehicle: { vehicleType: '4WD', vehicleSource: 'EXPLORATION' },
          drivers: [{ driverId: 'primary', experienceLevel: 'EXPERIENCED' }],
          drivingPolicy: {
            nightDrivingAllowed: false,
            nightDrivingPreference: 'AVOID',
          },
        },
        dailyDrivePlans: [glacierDay],
        worldStateEvidence: { activityArrivals: [] },
      })),
    } as unknown as ExecutabilityAssessmentService;

    const bridge = new TepExecutionSlipDaylightBridgeService(executability, pipelineBridge);

    const result = await bridge.tryTriggerFromExecutionSlip({
      tripId: 'trip_slip_daylight',
      observation,
      impact,
      triggerEventId: 'evt_slip_1',
      worldStateSnapshotId: 'ws_slip_1',
    });

    expect(result?.matched).toBe(true);
    expect(pipelineBridge.tryTriggerFromDaylightScheduleRisk).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip_slip_daylight',
        driveMinutesAfterCivilDusk: expect.any(Number),
      }),
    );
    const call = (pipelineBridge.tryTriggerFromDaylightScheduleRisk as jest.Mock).mock
      .calls[0]![0];
    expect(call.driveMinutesAfterCivilDusk).toBeGreaterThan(call.previousDriveMinutesAfterCivilDusk);
  });

  it('skips when slip minutes is zero', async () => {
    const pipelineBridge = {
      tryTriggerFromDaylightScheduleRisk: jest.fn(),
    } as unknown as TepRuntimePipelineBridgeService;
    const executability = {
      getExecutability: jest.fn(),
    } as unknown as ExecutabilityAssessmentService;

    const bridge = new TepExecutionSlipDaylightBridgeService(executability, pipelineBridge);

    const result = await bridge.tryTriggerFromExecutionSlip({
      tripId: 'trip_slip_daylight',
      observation,
      impact: {
        ...impact,
        assessment: { ...impact.assessment, slipMinutes: 0 },
      },
      triggerEventId: 'evt_slip_1',
      worldStateSnapshotId: 'ws_slip_1',
    });

    expect(result).toBeNull();
    expect(executability.getExecutability).not.toHaveBeenCalled();
  });
});
