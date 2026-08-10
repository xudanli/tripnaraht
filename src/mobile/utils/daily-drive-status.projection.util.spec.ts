import {
  buildConfirmSideEffectReminders,
  formatFuelDetailZh,
  projectDailyDriveStatus,
  projectRemindersFromAlerts,
  resolveDailyDriveGate,
} from './daily-drive-status.projection.util';
import type { ExecutionAlertsDto } from '../dto/mobile-execution.types';
import { EXECUTION_ALERTS_SCHEMA_V2_ID } from '../dto/mobile-execution.types';

function emptyAlerts(overrides?: Partial<ExecutionAlertsDto>): ExecutionAlertsDto {
  return {
    schemaId: EXECUTION_ALERTS_SCHEMA_V2_ID,
    tripId: 'trip-1',
    contextVersion: 1,
    alerts: [],
    aiRecommendation: { title: '建议', detail: '可继续按当前计划执行', evidenceIds: [] },
    ...overrides,
  };
}

describe('daily-drive-status.projection.util', () => {
  it('always returns 5 dimensions in fixed order', () => {
    const status = projectDailyDriveStatus({
      localDate: '2026-07-19',
      timezone: 'Atlantic/Reykjavik',
      fuel: { nextStationKm: 42, stationResolved: true },
    });
    expect(status.dimensions.map((d) => d.code)).toEqual([
      'ROAD',
      'WEATHER',
      'DAYLIGHT',
      'FUEL',
      'SCHEDULE',
    ]);
    expect(status.gate).toBe('CAN_DEPART');
    expect(status.confirmation.isConfirmed).toBe(false);
  });

  it('marks FUEL ATTENTION and avoids false CAN_DEPART when station unresolved', () => {
    const status = projectDailyDriveStatus({
      localDate: '2026-07-19',
      timezone: 'Atlantic/Reykjavik',
    });
    expect(status.dimensions.find((d) => d.code === 'FUEL')?.status).toBe('ATTENTION');
    expect(status.gate).toBe('NEEDS_ATTENTION');
  });

  it('bumps gate when remindersDeferred even if dimensions look OK', () => {
    const status = projectDailyDriveStatus({
      localDate: '2026-07-19',
      timezone: 'Atlantic/Reykjavik',
      fuel: { nextStationKm: 30, stationResolved: true },
      remindersDeferred: true,
      includeReminders: false,
    });
    expect(status.gate).toBe('NEEDS_ATTENTION');
    expect(status.evidence?.remindersDeferred).toBe(true);
  });

  it('maps STOP alerts to BLOCKED gate and excludes them from reminders', () => {
    const alerts = emptyAlerts({
      requiredAction: 'STOP',
      primaryRisk: {
        id: 'risk_stop',
        riskId: 'risk_stop',
        level: 'STOP',
        title: '道路封闭',
        reason: 'F208 暂不可通行',
        impact: '无法按计划行驶',
        affectedActivities: [],
        evidenceRefs: [],
        observedAt: '2026-07-19T08:00:00Z',
        requiresImmediateAttention: true,
      },
      alerts: [],
    });
    const { items, hasBlocking } = projectRemindersFromAlerts(alerts);
    expect(hasBlocking).toBe(true);
    expect(items).toHaveLength(0);

    const status = projectDailyDriveStatus({
      localDate: '2026-07-19',
      timezone: 'Atlantic/Reykjavik',
      alerts,
    });
    expect(status.gate).toBe('BLOCKED');
  });

  it('projects AT_RISK as MEDIUM reminder with relatedRiskId', () => {
    const alerts = emptyAlerts({
      primaryRisk: {
        id: 'risk_wind',
        riskId: 'risk_wind',
        level: 'AT_RISK',
        riskLevel: 'MEDIUM',
        riskType: 'weather_wind',
        title: '沿海风较大',
        reason: '阵风可达 10-12 m/s',
        impact: '注意横风',
        affectedActivities: [],
        evidenceRefs: [],
        observedAt: '2026-07-19T08:00:00Z',
        requiresImmediateAttention: false,
      },
    });
    const { items } = projectRemindersFromAlerts(alerts);
    expect(items).toHaveLength(1);
    expect(items[0].level).toBe('MEDIUM');
    expect(items[0].relatedRiskId).toBe('risk_wind');
    expect(items[0].dimensionCode).toBe('WEATHER');

    const status = projectDailyDriveStatus({
      localDate: '2026-07-19',
      timezone: 'Atlantic/Reykjavik',
      alerts,
    });
    expect(status.gate).toBe('NEEDS_ATTENTION');
  });

  it('consumes confirmed fuelLevel in FUEL detailZh', () => {
    const status = projectDailyDriveStatus({
      localDate: '2026-07-19',
      timezone: 'Atlantic/Reykjavik',
      confirmation: {
        isConfirmed: true,
        payload: {
          fuelLevel: 'THREE_QUARTERS',
          departOnPlan: true,
          driverMemberId: 'm1',
          fatigue: 'GOOD',
          vehicleAbnormal: false,
          prepCompleted: true,
        },
      },
      fuel: { nextStationKm: 92 },
    });
    const fuel = status.dimensions.find((d) => d.code === 'FUEL')!;
    expect(fuel.detailZh).toContain('3/4');
    expect(fuel.detailZh).toContain('92 km');
    expect(formatFuelDetailZh('HALF', 50)).toBe('当前油量：1/2\n下一可靠油站：50 km');
  });

  it('raises NEEDS_ATTENTION for vehicleAbnormal / prep incomplete', () => {
    const side = buildConfirmSideEffectReminders({
      fuelLevel: 'FULL',
      departOnPlan: true,
      driverMemberId: 'm1',
      fatigue: 'GOOD',
      vehicleAbnormal: true,
      prepCompleted: false,
    });
    expect(side.map((r) => r.id)).toEqual(
      expect.arrayContaining(['rem_vehicle_abnormal', 'rem_prep_incomplete']),
    );

    const status = projectDailyDriveStatus({
      localDate: '2026-07-19',
      timezone: 'Atlantic/Reykjavik',
      confirmation: {
        isConfirmed: true,
        payload: {
          fuelLevel: 'FULL',
          departOnPlan: true,
          driverMemberId: 'm1',
          fatigue: 'GOOD',
          vehicleAbnormal: true,
          prepCompleted: false,
        },
      },
    });
    expect(status.gate).toBe('NEEDS_ATTENTION');
    expect(status.gate).not.toBe('BLOCKED');
  });

  it('resolveDailyDriveGate prefers BLOCKED over ATTENTION', () => {
    expect(
      resolveDailyDriveGate({
        dimensions: [
          {
            code: 'ROAD',
            labelZh: '路况',
            status: 'BLOCKED',
            statusLabelZh: '阻断',
            detailZh: 'x',
          },
        ],
        reminders: [{ id: 'r', titleZh: 't', detailZh: 'd', level: 'MEDIUM', levelLabelZh: '中等' }],
        hasBlockingAlert: false,
      }),
    ).toBe('BLOCKED');
  });

  it('omits reminders when includeReminders=false', () => {
    const status = projectDailyDriveStatus({
      localDate: '2026-07-19',
      timezone: 'Atlantic/Reykjavik',
      includeReminders: false,
      confirmation: {
        isConfirmed: true,
        payload: {
          fuelLevel: 'FULL',
          departOnPlan: true,
          driverMemberId: 'm1',
          fatigue: 'GOOD',
          vehicleAbnormal: true,
          prepCompleted: true,
        },
      },
    });
    expect(status.reminders.items).toHaveLength(0);
    // 五维仍可因确认负向抬 ATTENTION
    expect(status.gate).toBe('NEEDS_ATTENTION');
  });
});
