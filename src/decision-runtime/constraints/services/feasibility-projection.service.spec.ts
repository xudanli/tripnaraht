import { ConflictSeverity, ConflictType } from '../../../trips/dto/trip-conflicts.dto';
import { FeasibilityProjectionService } from './feasibility-projection.service';
import { ScheduleConstraintProvider } from '../providers/schedule-constraint.provider';
import { PreTripReadinessP0Service } from '../../../trips/trip-constraint-solver/services/pre-trip-readiness-p0.service';

describe('FeasibilityProjectionService schedule projection', () => {
  const scheduleProvider = new ScheduleConstraintProvider();
  const preTripP0 = { buildP0Issues: jest.fn() } as unknown as PreTripReadinessP0Service;

  const dailyDriveConflict = {
    id: 'daily-drive-day-1',
    type: ConflictType.MAX_DAILY_DRIVE_EXCEEDED,
    severity: ConflictSeverity.HIGH,
    title: '每日驾驶上限',
    description: 'Day 1 超出驾驶上限',
    affectedDays: ['1'],
    affectedItemIds: ['item-a'],
    issueKind: 'daily_drive',
    fromDayNumber: 1,
    toDayNumber: 1,
    travelMinutes: 600,
    shortfallMinutes: 120,
  };

  const lunchConflict = {
    id: 'lunch-missing-day-1',
    type: ConflictType.LUNCH_MISSING,
    severity: ConflictSeverity.MEDIUM,
    title: '未安排午餐',
    description: 'Day 1 未安排午餐',
    affectedDays: ['1'],
    affectedItemIds: [],
  };

  beforeEach(() => {
    process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION = '1';
  });

  afterEach(() => {
    delete process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION;
  });

  it('CAS-012: projects schedule conflicts via gateway while preserving repair metadata', () => {
    const service = new FeasibilityProjectionService(
      {} as never,
      preTripP0,
      undefined,
      scheduleProvider,
    );
    const result = service.projectScheduleConflicts('trip-1', [dailyDriveConflict, lunchConflict]);
    expect(result.projectionApplied).toBe(true);
    expect(result.nonScheduleConflicts).toHaveLength(1);
    expect(result.nonScheduleConflicts[0].id).toBe('lunch-missing-day-1');
    expect(result.scheduleIssues).toHaveLength(1);
    expect(result.scheduleIssues[0].issueKind).toBe('daily_drive');
    expect(result.scheduleIssues[0].proofs?.[0]?.evidenceType).toBe('route_engine');
    expect(result.scheduleIssues[0].proofs?.[0]?.evidenceSource).toBe('trip.conflicts');
    expect(result.scheduleIssues[0].repairOptions?.length).toBeGreaterThan(0);
  });

  it('CAS-043: projects plan object assessments into feasibility issues', async () => {
    process.env.PLAN_OBJECT_GATEWAY_EVALUATION = '1';
    const planObjectProvider = {
      isEnabled: () => true,
      evaluateForTrip: jest.fn().mockResolvedValue([
        {
          assertionId: 'feas_plan_object_transfer_load_day_1',
          constraintType: 'plan_object_transfer_load_day_1',
          status: 'WARNING',
          severity: 'MEDIUM',
          scope: { tripId: 'trip-1', dayId: 'day-1', planObjectIds: ['po_t1'] },
          reasonCode: 'PLAN_OBJECT_TRANSFER_LOAD',
          evidenceRefs: ['po_t1'],
          message: 'Day 1 交通/转场合计 400 分钟',
          evaluator: {
            engine: 'plan-object-evaluator',
            version: '1.0.0',
            ruleId: 'TRANSFER_DAILY_LOAD',
          },
        },
      ]),
    };
    const service = new FeasibilityProjectionService(
      {} as never,
      preTripP0,
      undefined,
      undefined,
      undefined,
      planObjectProvider as never,
    );
    const issues = await service.projectPlanObjectIssues('trip-1');
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('transport');
    expect(issues[0].proofs?.[0]?.evidenceSource).toBe('plan-object-evaluator');
    delete process.env.PLAN_OBJECT_GATEWAY_EVALUATION;
  });

  it('CAS-044: strips legacy lunch-window conflicts when plan object gateway is on', () => {
    process.env.PLAN_OBJECT_GATEWAY_EVALUATION = '1';
    process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION = '1';
    const lunchConflict = {
      id: 'lunch-window-2026-07-10',
      type: ConflictType.LUNCH_WINDOW,
      severity: ConflictSeverity.MEDIUM,
      title: '午餐时间窗过短',
      description: 'test',
      affectedDays: ['2026-07-10'],
      affectedItemIds: [],
    };
    const service = new FeasibilityProjectionService(
      {} as never,
      preTripP0,
      undefined,
      scheduleProvider,
    );
    const result = service.projectScheduleConflicts('trip-1', [dailyDriveConflict, lunchConflict]);
    expect(result.nonScheduleConflicts).toHaveLength(0);
    expect(result.scheduleIssues).toHaveLength(1);
    delete process.env.PLAN_OBJECT_GATEWAY_EVALUATION;
  });
});
