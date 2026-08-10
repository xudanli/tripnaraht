import { projectOverviewDashboard } from './overview-dashboard.projection.util';
import type { DailyDriveStatusDto } from '../dto/mobile-daily-drive.types';
import { DAILY_DRIVE_STATUS_SCHEMA_ID } from '../dto/mobile-daily-drive.types';

function baseDailyDrive(
  overrides?: Partial<DailyDriveStatusDto>,
): DailyDriveStatusDto {
  return {
    schemaId: DAILY_DRIVE_STATUS_SCHEMA_ID,
    localDate: '2026-07-22',
    timezone: 'Atlantic/Reykjavik',
    gate: 'CAN_DEPART',
    gateLabelZh: '可出发',
    headline: '今天可以按计划出发',
    suggestedDepartBeforeLabelZh: '建议 10:35 前离开',
    suggestedDepartBeforeAt: '2026-07-22T10:35:00.000Z',
    confirmation: { isConfirmed: false },
    dimensions: [
      {
        code: 'FUEL',
        labelZh: '燃油',
        status: 'OK',
        statusLabelZh: 'OK',
        detailZh: '当前油量：3/4\n下一可靠油站：48 km',
      },
    ],
    reminders: { items: [] },
    ...overrides,
  };
}

describe('overview-dashboard.projection.util', () => {
  it('shadows Kernel advisories without changing overallStatus (K4)', () => {
    const dto = projectOverviewDashboard({
      lite: true,
      contextVersion: 1,
      serverTime: '2026-07-22T08:00:00.000Z',
      dailyDrive: baseDailyDrive(),
      team: { totalCount: 2, readyMemberIds: ['a', 'b'] },
      advisories: [
        {
          type: 'ALTITUDE',
          severity: 'WARNING',
          titleZh: '高海拔适应',
          summaryZh: '行程含高原区段',
        },
        {
          type: 'CHECKPOINT',
          severity: 'WARNING',
          titleZh: '检查站 / 通行核验',
          summaryZh: '请核验证件',
        },
      ],
      selfDriveKernel: {
        destinationPackId: 'destination.cn',
        countryCode: 'CN',
        corridorId: 'cn.route.g318',
        criticalSegmentCount: 1,
        roadEvidenceFreshness: 'PARTIAL',
        roadStatus: 'RESTRICTED',
        roadStrongJudgmentAllowed: false,
      },
    });

    expect(dto.overallStatus.code).toBe('ON_PLAN');
    expect(dto.overallStatus.hasImpact).toBe(false);
    expect(dto.advisories).toHaveLength(2);
    expect(dto.advisories?.[0].type).toBe('ALTITUDE');
    expect(dto.selfDriveKernel?.destinationPackId).toBe('destination.cn');
    expect(dto.selfDriveKernel?.roadStrongJudgmentAllowed).toBe(false);
  });

  it('projects ON_PLAN lite dashboard with display-ready headlines', () => {
    const dto = projectOverviewDashboard({
      lite: true,
      contextVersion: 42,
      serverTime: '2026-07-22T08:00:00.000Z',
      dailyDrive: baseDailyDrive(),
      confirmPayload: {
        fuelLevel: 'THREE_QUARTERS',
        departOnPlan: true,
        driverMemberId: 'm1',
        fatigue: 'GOOD',
        vehicleAbnormal: false,
        prepCompleted: true,
      },
      driverOptions: [{ memberId: 'm1', displayName: 'Alex', isPrimaryDriver: true }],
      currentActivity: {
        title: 'Skógafoss',
        estimatedArrival: '11:18',
        progress: 0,
      },
      next: {
        activityId: 'act-1',
        titleZh: 'Skógafoss',
        timeWindowStart: '11:30',
        timeWindowEnd: '12:30',
        distanceKm: 31,
        driveMinutes: 36,
        etaLocalHHmm: '11:18',
        latitude: 63.5,
        longitude: -19.5,
        imageUrl: 'https://example.com/img.jpg',
      },
      pendingAdjustmentCount: 0,
      alertCount: 0,
      team: { totalCount: 4, readyMemberIds: ['a', 'b', 'c', 'd'] },
      lodging: { nameZh: 'Vík Hotel', detailZh: '入住 18:00', statusZh: '已安排' },
    });

    expect(dto.schemaId).toBe('tripnara.execution_overview_dashboard@v1');
    expect(dto.lite).toBe(true);
    expect(dto.overallStatus.code).toBe('ON_PLAN');
    expect(dto.overallStatus.headlineZh).toBe('今天按计划进行');
    expect(dto.overallStatus.hasImpact).toBe(false);
    expect(dto.selfDrive.lifecycle).toBe('NOT_DEPARTED');
    expect(dto.nextDestination.titleZh).toBe('Skógafoss');
    expect(dto.nextDestination.timeWindowZh).toBe('11:30–12:30');
    expect(dto.nextDestination.distanceDurationZh).toBe('31 km · 驾驶约 36 分钟');
    expect(dto.nextDestination.timeMarginMinutes).toBe(12);
    expect(dto.nextDestination.timeMarginZh).toBe('提前 12 分钟');
    expect(dto.nextDestination.timeMarginSeverity).toBe('OK');
    expect(dto.nextDestination.latitude).toBeUndefined();
    expect(dto.nextDestination.imageUrl).toBeUndefined();
    expect(dto.departureSuggestion?.kind).toBe('DEPART_WITHIN');
    expect(dto.departureSuggestion?.departBeforeLocalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(dto.vehicle.isNormal).toBe(true);
    expect(dto.vehicle.fuelPercent).toBe(75);
    expect(dto.teamReadiness.kind).toBe('READY');
    expect(dto.teamReadiness.summaryLineZh).toBe('团队 4 人 · 4 人已准备好');
    expect(dto.lodging?.nameZh).toBe('Vík Hotel');
    expect(dto.lodging?.imageUrl).toBeUndefined();
    expect(dto.now?.kind).toBe('NOT_STARTED');
    expect(dto.now?.atDestination).toBe(false);
    expect(dto.planReality?.hasImpact).toBe(false);
    expect(dto.planReality?.realitySource).toBe('ETA');
    expect(dto.planReality?.actualOrEtaLocalHHmm).toBe('11:18');
    expect(dto.exception).toBeUndefined();
  });

  it('maps BLOCKED gate to PAUSE_EXECUTION and omits departure when driving', () => {
    const blocked = projectOverviewDashboard({
      lite: true,
      contextVersion: 1,
      serverTime: '2026-07-22T08:00:00.000Z',
      dailyDrive: baseDailyDrive({
        gate: 'BLOCKED',
        gateLabelZh: '暂缓',
        headline: '今天暂不建议按计划出发',
      }),
      pendingAdjustmentCount: 0,
      alertCount: 0,
      team: { totalCount: 2, readyMemberIds: ['a'], attentionNamesZh: ['Bob'], blocked: true },
      activeRunbookId: 'rb_road_1',
    });
    expect(blocked.overallStatus.code).toBe('PAUSE_EXECUTION');
    expect(blocked.overallStatus.detailZh).toBe('今天暂不建议按计划出发');
    expect(blocked.selfDrive.lifecycle).toBe('BLOCKED');
    expect(blocked.departureSuggestion?.kind).toBe('DO_NOT_DEPART');
    expect(blocked.teamReadiness.kind).toBe('BLOCKED');
    expect(blocked.activeRunbookId).toBe('rb_road_1');

    const driving = projectOverviewDashboard({
      lite: true,
      contextVersion: 1,
      serverTime: '2026-07-22T08:00:00.000Z',
      dailyDrive: baseDailyDrive({
        confirmation: { isConfirmed: true },
      }),
      currentActivity: { title: '下一站', progress: 0.4 },
      team: { totalCount: 1, readyMemberIds: ['a'] },
    });
    expect(driving.selfDrive.lifecycle).toBe('DRIVING');
    expect(driving.departureSuggestion).toBeUndefined();
    expect(driving.nextDestination.ctaPhase).toBe('DRIVING');
  });

  it('includes rental phone only when lite=false', () => {
    const full = projectOverviewDashboard({
      lite: false,
      contextVersion: 1,
      serverTime: '2026-07-22T08:00:00.000Z',
      dailyDrive: baseDailyDrive({
        dimensions: [
          {
            code: 'FUEL',
            labelZh: '燃油',
            status: 'OK',
            statusLabelZh: 'OK',
            detailZh: '当前油量：满\n下一可靠油站：48 km',
          },
          {
            code: 'ROAD',
            labelZh: '路况',
            status: 'ATTENTION',
            statusLabelZh: '注意',
            detailZh: '碎石路需关注',
          },
        ],
      }),
      confirmPayload: {
        fuelLevel: 'FULL',
        departOnPlan: true,
        driverMemberId: 'm1',
        fatigue: 'GOOD',
        vehicleAbnormal: false,
        prepCompleted: true,
      },
      rentalEmergencyPhone: '+354-555-0000',
      vehicleTypeZh: '四驱SUV',
      team: { totalCount: 1, readyMemberIds: ['a'] },
    });
    expect(full.vehicle.rentalEmergencyPhone).toBe('+354-555-0000');
    expect(full.vehicle.vehicleTypeZh).toBe('四驱SUV');
    expect(full.vehicle.roadFitZh).toBe('道路需关注');

    const lite = projectOverviewDashboard({
      lite: true,
      contextVersion: 1,
      serverTime: '2026-07-22T08:00:00.000Z',
      rentalEmergencyPhone: '+354-555-0000',
      team: { totalCount: 1, readyMemberIds: ['a'] },
    });
    expect(lite.vehicle.rentalEmergencyPhone).toBeUndefined();
  });

  it('maps pending adjustments to SUGGEST_ADJUST', () => {
    const dto = projectOverviewDashboard({
      lite: false,
      contextVersion: 3,
      serverTime: '2026-07-22T08:00:00.000Z',
      dailyDrive: baseDailyDrive({ gate: 'CAN_DEPART' }),
      pendingAdjustmentCount: 2,
      alertCount: 0,
      next: {
        titleZh: '黑沙滩',
        latitude: 63.4,
        longitude: -19.1,
        imageUrl: 'https://cdn/x.jpg',
      },
      team: { totalCount: 3, readyMemberIds: ['a', 'b'], attentionNamesZh: ['Alex'] },
    });
    expect(dto.overallStatus.code).toBe('SUGGEST_ADJUST');
    expect(dto.overallStatus.pendingAdjustmentCount).toBe(2);
    expect(dto.overallStatus.hasImpact).toBe(true);
    expect(dto.nextDestination.latitude).toBe(63.4);
    expect(dto.nextDestination.imageUrl).toBe('https://cdn/x.jpg');
    expect(dto.teamReadiness.kind).toBe('PARTIAL');
    expect(dto.teamReadiness.attentionLineZh).toContain('Alex');
    expect(dto.attention).toEqual({ riskCount: 0, pendingDecisionCount: 2 });
    expect(dto.planReality?.hasImpact).toBe(true);
    expect(dto.exception?.code).toBe('NEEDS_ADJUSTMENT');
    expect(dto.planReality?.recommendedAdjustment?.kind).toBe('OPEN_ADJUSTMENT_QUEUE');
  });

  it('keeps ON_PLAN when gate is NEEDS_ATTENTION but has no Impact (quiet principle)', () => {
    const dto = projectOverviewDashboard({
      lite: true,
      contextVersion: 1,
      serverTime: '2026-07-22T08:00:00.000Z',
      dailyDrive: baseDailyDrive({
        gate: 'NEEDS_ATTENTION',
        gateLabelZh: '需留意',
        headline: '车辆或准备项需留意',
      }),
      pendingAdjustmentCount: 0,
      alertCount: 0,
      next: {
        titleZh: 'Skógafoss',
        timeWindowStart: '11:30',
        timeWindowEnd: '12:30',
        etaLocalHHmm: '11:18',
      },
      team: { totalCount: 1, readyMemberIds: ['a'] },
    });
    expect(dto.overallStatus.code).toBe('ON_PLAN');
    expect(dto.planReality?.hasImpact).toBe(false);
    expect(dto.exception).toBeUndefined();
    // 出发建议仍可反映 gate，但不抬升综合态
    expect(dto.departureSuggestion?.kind).toBe('DELAY_DEPART');
  });

  it('marks LATE Impact and elevates NEEDS_ATTENTION', () => {
    const dto = projectOverviewDashboard({
      lite: true,
      contextVersion: 1,
      serverTime: '2026-07-22T08:00:00.000Z',
      dailyDrive: baseDailyDrive({ gate: 'CAN_DEPART' }),
      pendingAdjustmentCount: 0,
      alertCount: 0,
      next: {
        activityId: 'act-late',
        titleZh: '黑沙滩',
        timeWindowStart: '11:00',
        timeWindowEnd: '12:00',
        etaLocalHHmm: '11:25',
      },
      team: { totalCount: 1, readyMemberIds: ['a'] },
    });
    expect(dto.nextDestination.timeMarginSeverity).toBe('LATE');
    expect(dto.planReality?.hasImpact).toBe(true);
    expect(dto.planReality?.deviationMinutes).toBeLessThan(0);
    expect(dto.overallStatus.code).toBe('NEEDS_ATTENTION');
    expect(dto.exception?.code).toBe('LATE');
    expect(dto.planReality?.recommendedAdjustment?.kind).toBe('SHORTEN_STAY');
  });

  it('projects explicit now AT_STOP vs next destination', () => {
    const dto = projectOverviewDashboard({
      lite: true,
      contextVersion: 1,
      serverTime: '2026-07-22T12:00:00.000Z',
      dailyDrive: baseDailyDrive({
        confirmation: { isConfirmed: true },
      }),
      driveSession: { phase: 'ARRIVED', arrivedAtDestination: true },
      nowStop: {
        activityId: 'act-now',
        titleZh: 'Skógafoss',
        placeTypeZh: '瀑布',
        timeWindowStart: '11:30',
        timeWindowEnd: '12:30',
      },
      next: {
        activityId: 'act-next',
        titleZh: '黑沙滩',
        timeWindowStart: '14:00',
        timeWindowEnd: '15:30',
        distanceKm: 40,
        driveMinutes: 45,
        etaLocalHHmm: '13:50',
      },
      team: { totalCount: 1, readyMemberIds: ['a'] },
    });
    expect(dto.now?.kind).toBe('AT_STOP');
    expect(dto.now?.atDestination).toBe(true);
    expect(dto.now?.titleZh).toBe('Skógafoss');
    expect(dto.nextDestination.activityId).toBe('act-next');
    expect(dto.nextDestination.titleZh).toBe('黑沙滩');
    expect(dto.nextDestination.ctaPhase).toBe('AT_DESTINATION');
  });

  it('projects DRIVING now without conflating with atDestination', () => {
    const dto = projectOverviewDashboard({
      lite: true,
      contextVersion: 1,
      serverTime: '2026-07-22T12:00:00.000Z',
      dailyDrive: baseDailyDrive({
        confirmation: { isConfirmed: true },
      }),
      driveSession: { phase: 'DRIVING' },
      next: {
        activityId: 'act-next',
        titleZh: 'Vík',
        etaLocalHHmm: '13:10',
        timeWindowStart: '13:30',
      },
      team: { totalCount: 1, readyMemberIds: ['a'] },
    });
    expect(dto.now?.kind).toBe('DRIVING');
    expect(dto.now?.atDestination).toBe(false);
    expect(dto.now?.titleZh).toContain('Vík');
    expect(dto.nextDestination.ctaPhase).toBe('DRIVING');
  });
});
