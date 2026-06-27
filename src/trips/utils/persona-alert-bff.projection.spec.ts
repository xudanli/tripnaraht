import {
  isInternalDebugPersonaText,
  isPersonaMarketingTitle,
  projectPersonaAlertsForAudience,
} from './persona-alert-bff.projection';
import { mapPersonaAlertReasonCodesDisplayZh } from './persona-alert-reason-codes.util';
import { AlertSeverity, PersonaType } from '../dto/persona-alerts.dto';
import type { DecisionLogEntry } from '../decision/shared/decision-result.types';

describe('persona-alert-bff.projection', () => {
  const baseLog = (overrides: Partial<DecisionLogEntry> = {}): DecisionLogEntry => ({
    persona: 'ABU',
    action: 'REJECT',
    explanation: '第 3 天大风条件下不建议自驾穿越高地。',
    reasonCodes: ['ABU_FATAL_REJECT', 'HIGH_WIND_DRIVING'],
    timestamp: '2026-06-27T08:12:00.000Z',
    decisionSource: 'PHYSICAL',
    decisionStage: 'GATE_EVAL',
    ...overrides,
  });

  it('filters internal debug explanation for audience=user', () => {
    const alerts = projectPersonaAlertsForAudience({
      decisionLogs: [
        baseLog({
          explanation: 'persona closure\nstop=ABU_FATAL_REJECT rechecks=0',
          reasonCodes: ['ABU_FATAL_REJECT'],
        }),
      ],
      options: { audience: 'user' },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].explanation).toBe('当前方案存在不可接受的安全风险，需要调整后再继续规划。');
    expect(isInternalDebugPersonaText(alerts[0].explanation)).toBe(false);
  });

  it('rejects persona marketing titles', () => {
    expect(isPersonaMarketingTitle('安全守护者 Abu（北极熊 🐻‍❄️）')).toBe(true);
    const alerts = projectPersonaAlertsForAudience({
      decisionLogs: [baseLog()],
      options: { audience: 'user' },
    });
    expect(alerts[0].title).not.toMatch(/守护者|北极熊/);
  });

  it('includes reasonCodesDisplayZh', () => {
    const alerts = projectPersonaAlertsForAudience({
      decisionLogs: [baseLog()],
      options: { audience: 'user' },
    });
    expect(alerts[0].metadata.reasonCodesDisplayZh).toEqual(
      expect.arrayContaining(['安全门控拒绝', '大风不宜自驾']),
    );
  });

  it('returns empty array when no user-visible issues', () => {
    const alerts = projectPersonaAlertsForAudience({
      decisionLogs: [
        baseLog({
          action: 'ALLOW',
          explanation: '未发现阻断性冲突，允许继续。',
          reasonCodes: [],
        }),
      ],
      options: { audience: 'user' },
    });
    expect(alerts).toEqual([]);
  });

  it('does not return success severity for audience=user', () => {
    const alerts = projectPersonaAlertsForAudience({
      decisionLogs: [
        baseLog({
          action: 'ALLOW',
          explanation: '需要微调缓冲时间。',
          reasonCodes: ['PACE_BUFFER'],
        }),
      ],
      options: { audience: 'user' },
    });
    expect(alerts.every((a) => a.severity !== AlertSeverity.SUCCESS)).toBe(true);
  });

  it('maps feasibility issues with deepLink', () => {
    const alerts = projectPersonaAlertsForAudience({
      decisionLogs: [],
      feasibilityIssues: [
        {
          id: 'issue-pace-day2',
          priority: 'suggest_adjust',
          category: 'schedule',
          title: '第 2 天行程偏紧',
          message: '当天步行与车程合计超过舒适阈值，建议减少 1 个景点或延后出发。',
          affectedDays: [2],
          severity: 'medium',
        },
      ],
      options: { audience: 'user' },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].persona).toBe(PersonaType.DR_DRE);
    expect(alerts[0].presentation?.scenario).toBe('PACE_COST');
    expect(alerts[0].metadata.deepLink).toEqual({
      type: 'schedule_day',
      issueId: 'issue-pace-day2',
      dayIndex: 2,
    });
  });
});

describe('persona-alert-reason-codes.util', () => {
  it('maps known reason codes', () => {
    const { displayZh } = mapPersonaAlertReasonCodesDisplayZh(['ABU_FATAL_REJECT', 'PACE_OVERLOAD']);
    expect(displayZh).toEqual(['安全门控拒绝', '行程节奏过紧']);
  });
});
