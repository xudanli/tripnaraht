import {
  buildActiveRunbookSummary,
  buildRunbookId,
  inferRunbookTrigger,
  projectImportantInfo,
  projectInlineReminder,
  projectInTripHome,
  requiresUserConfirmFromReasons,
} from './in-trip-home.projection.util';
import type { ExecutionAlertsDto } from '../dto/mobile-execution.types';
import { EXECUTION_ALERTS_SCHEMA_V2_ID } from '../dto/mobile-execution.types';
import { IMPORTANT_INFO_ORDER } from '../dto/mobile-in-trip-home.types';

function emptyAlerts(overrides?: Partial<ExecutionAlertsDto>): ExecutionAlertsDto {
  return {
    schemaId: EXECUTION_ALERTS_SCHEMA_V2_ID,
    tripId: 'trip-1',
    contextVersion: 1,
    alerts: [],
    aiRecommendation: { title: '建议', detail: '可继续', evidenceIds: [] },
    ...overrides,
  };
}

describe('in-trip-home.projection.util', () => {
  it('always returns 7 importantInfo rows in fixed order', () => {
    const home = projectInTripHome({});
    expect(home.importantInfo.map((r) => r.kind)).toEqual([...IMPORTANT_INFO_ORDER]);
    expect(home.schemaId).toBe('tripnara.in_trip_home@v1');
    expect(home.heading.attention).toBe('ON_TRACK');
  });

  it('never omits detail/trailing for parking fuel hard-window rows', () => {
    const home = projectInTripHome({
      safeParking: { detailZh: 'Seljalandsfoss 停车区', trailingZh: '约 12 km' },
      fuel: { detailZh: 'N1 Hvolsvöllur', trailingZh: '18 分钟后 · 24 km' },
      hardWindow: { detailZh: '黑沙滩日落 · 18:10 截止', trailingZh: '仍可赶上' },
    });
    for (const kind of ['NEXT_SAFE_PARKING', 'NEXT_FUEL', 'NEXT_HARD_WINDOW'] as const) {
      const row = home.importantInfo.find((r) => r.kind === kind)!;
      expect(row.detailZh.trim().length).toBeGreaterThan(0);
      expect(row.trailingZh?.trim().length).toBeGreaterThan(0);
      expect(row.detailZh).not.toMatch(/沿途最近安全停车点/);
    }
  });

  it('fills trailing when service omits it for fuel/parking', () => {
    const rows = projectImportantInfo({
      safeParking: { detailZh: '观景停车带' },
      fuel: { detailZh: 'N1 Selfoss' },
      hardWindow: { detailZh: '入住 17:00' },
    });
    expect(rows.find((r) => r.kind === 'NEXT_SAFE_PARKING')?.trailingZh).toBe('距离待确认');
    expect(rows.find((r) => r.kind === 'NEXT_FUEL')?.trailingZh).toBe('距离待确认');
    expect(rows.find((r) => r.kind === 'NEXT_HARD_WINDOW')?.trailingZh).toBe('仍可赶上');
  });

  it('maps STOP road closure to activeRunbook and blocks soft ETA reminder theme', () => {
    const alert = {
      id: 'risk_closure',
      riskId: 'risk_closure',
      level: 'STOP' as const,
      riskLevel: 'CRITICAL' as const,
      title: '路段关闭',
      reason: '1 号公路部分路段封闭',
      impact: '无法按原路线继续',
      affectedActivities: [],
      evidenceRefs: [],
      observedAt: '2026-07-19T12:00:00Z',
      requiresImmediateAttention: true,
    };
    expect(inferRunbookTrigger(alert)).toBe('ROAD_CLOSURE');
    const summary = buildActiveRunbookSummary(
      alert,
      buildRunbookId('ROAD_CLOSURE', 'risk_closure'),
    );
    expect(summary?.trigger).toBe('ROAD_CLOSURE');
    expect(summary?.severity).toBe('CRITICAL');

    const rem = projectInlineReminder({
      activeRunbook: summary,
      etaIncreased: true,
      restSuggested: true,
    });
    // ROAD_CLOSURE blocks ETA soft reminder; REST still allowed
    expect(rem?.kind).toBe('REST_SUGGESTED');
  });

  it('never promotes light wind alert to Runbook trigger', () => {
    const alert = {
      id: 'risk_wind',
      riskId: 'risk_wind',
      level: 'AT_RISK' as const,
      riskLevel: 'MEDIUM' as const,
      riskType: 'weather_wind',
      title: '沿海风略增',
      reason: '阵风略增',
      impact: '注意横风',
      affectedActivities: [],
      evidenceRefs: [],
      observedAt: '2026-07-19T12:00:00Z',
      requiresImmediateAttention: false,
    };
    expect(inferRunbookTrigger(alert)).toBeNull();
    const rem = projectInlineReminder({
      alerts: emptyAlerts({ primaryRisk: alert, alerts: [alert] }),
    });
    expect(rem?.kind).toBe('WIND_INCREASED');
  });

  it('CURRENT_RISK.relatedRiskId uses riskId ?? id', () => {
    const alerts = emptyAlerts({
      primaryRisk: {
        id: 'alert_1',
        riskId: 'risk_sunset_buffer',
        level: 'AT_RISK',
        riskLevel: 'MEDIUM',
        title: '日落缓冲减少',
        reason: '日落前到达缓冲减少',
        impact: '需留意时间窗',
        affectedActivities: [],
        evidenceRefs: [],
        observedAt: '2026-07-19T12:00:00Z',
        requiresImmediateAttention: false,
      },
    });
    const rows = projectImportantInfo({ alerts });
    const risk = rows.find((r) => r.kind === 'CURRENT_RISK');
    expect(risk?.relatedRiskId).toBe('risk_sunset_buffer');
  });

  it('respects dismissed reminder ids', () => {
    const rem = projectInlineReminder({
      restSuggested: true,
      dismissedReminderIds: ['rem_rest_suggested'],
    });
    expect(rem).toBeNull();
  });

  it('requiresUserConfirm mirrors non-empty confirmReasonCodes', () => {
    expect(requiresUserConfirmFromReasons([])).toBe(false);
    expect(requiresUserConfirmFromReasons(['CHANGE_MAIN_ROUTE'])).toBe(true);
  });

  it('fixture-like home projects reminder + seven rows', () => {
    const home = projectInTripHome({
      destinationNameZh: '维克',
      destinationLocalName: 'Vik',
      etaRangeLabelZh: '16:20 – 16:40',
      progress: 0.65,
      distanceProgressLabelZh: '62 km / 96 km',
      remainingDurationLabelZh: '1 小时 25 分钟',
      road: {
        alertTitle: '路况正常',
        alertDetail: '1 号公路，通行正常',
        severity: 'ok',
        plowDelayRangeMin: [20, 40],
      },
      remainingDrive: {
        detailZh: '1 小时 25 分钟（约 96 km）',
        trailingZh: '预计 16:10 到达',
      },
      safeParking: {
        detailZh: 'Dyrhólaey 停车区',
        trailingZh: '建议休息',
        restSuggested: true,
      },
      fuel: {
        detailZh: 'N1 Hvolsvöllur',
        trailingZh: '45 分钟后 · 42 km · €2.19/L',
      },
      hardWindow: {
        detailZh: '维克黑沙滩日落拍摄 · 18:10 截止（当地时间）',
        trailingZh: '仍可赶上',
      },
      inlineReminder: {
        id: 'rem_rest_1',
        kind: 'REST_SUGGESTED',
        titleZh: '休息建议',
        messageZh: '你将连续驾驶 2 小时，建议在下一个停车点休息',
        dismissible: true,
      },
      alerts: emptyAlerts({
        primaryRisk: {
          id: 'risk_sunset_buffer',
          riskId: 'risk_sunset_buffer',
          level: 'AT_RISK',
          riskLevel: 'MEDIUM',
          title: '日落前到达缓冲减少',
          reason: '日落前到达缓冲减少',
          impact: '中风险',
          affectedActivities: [],
          evidenceRefs: [],
          observedAt: '2026-07-19T12:00:00Z',
          requiresImmediateAttention: false,
        },
      }),
    });
    expect(home.heading.attention).toBe('NEEDS_ATTENTION');
    expect(home.inlineReminder?.kind).toBe('REST_SUGGESTED');
    expect(home.activeRunbook).toBeNull();
    expect(home.importantInfo).toHaveLength(7);
  });
});
