import {
  categoryLabelFor,
  resolveAffectedDayNumbers,
  resolveAffectedScopeSummary,
  resolveFeasibilityDiagnosisOccurrenceCount,
  resolveQueueDescription,
  resolveShortQueueTitle,
} from './decision-problem-queue-display.util';

describe('decision-problem-queue-display', () => {
  it('uses short title for meal window diagnostics', () => {
    expect(
      resolveShortQueueTitle({
        semanticKey: 'plan_object_meal_late_arrival_x',
        ruleId: 'MEAL_WINDOW_VS_ARRIVAL',
        dimension: 'SCHEDULE',
        rawTitle: '预计 彩虹街 结束于 16:27，晚于午餐窗 12:00',
        rawSummary: '预计 彩虹街 结束于 16:27，晚于午餐窗 12:00',
      }),
    ).toBe('午餐窗冲突');
  });

  it('uses short title for transfer buffer', () => {
    expect(
      resolveShortQueueTitle({
        semanticKey: 'INSUFFICIENT_TRANSFER_BUFFER',
        issueKind: 'buffer_insufficient',
        dimension: 'TRANSPORT',
        rawTitle: 'Day 1 交通缓冲偏紧',
      }),
    ).toBe('交通缓冲偏紧');
  });

  it('projects affectedDayNumbers and affectedScopeSummary from issue', () => {
    const issue = {
      id: 'i1',
      priority: 'suggest_adjust' as const,
      category: 'transport',
      title: '交通缓冲偏紧',
      message: '第1天 · 蓝湖温泉 → 辛格维利尔：路上约需 45 分钟，抵达后缓冲偏紧',
      affectedDays: [1],
      affectedDayNumbers: [1],
      affectedScopeSummary: '蓝湖温泉 → 辛格维利尔',
      severity: 'medium' as const,
    };

    expect(resolveAffectedDayNumbers({ issue, scopeDayIds: [2] })).toEqual([1, 2]);
    expect(resolveAffectedScopeSummary({ issue })).toBe('蓝湖温泉 → 辛格维利尔');
    expect(
      resolveQueueDescription({
        issue,
        rawTitle: '交通缓冲偏紧',
      }),
    ).toBe('第1天 · 蓝湖温泉 → 辛格维利尔：路上约需 45 分钟，抵达后缓冲偏紧');
  });

  it('parses POI scope from meal diagnostic message', () => {
    expect(
      resolveAffectedScopeSummary({
        diagnosticMessage: '预计 彩虹街 结束于 16:27，晚于午餐窗 12:00',
      }),
    ).toBe('彩虹街');
  });

  it('maps category to Chinese label', () => {
    expect(categoryLabelFor('transport')).toBe('交通');
    expect(categoryLabelFor('schedule')).toBe('日程');
  });

  it('counts feasibility diagnoses for meta occurrenceCount', () => {
    expect(
      resolveFeasibilityDiagnosisOccurrenceCount([
        { id: 'a', priority: 'must_handle', category: 'transport', title: 'a', message: 'm', affectedDays: [1], severity: 'high' },
        { id: 'b', priority: 'suggest_adjust', category: 'schedule', title: 'b', message: 'm', affectedDays: [1], severity: 'medium' },
      ]),
    ).toBe(2);
  });

  it('CAS-123: resolves day from plan-object anchors.toDayNumber when affectedDays empty', () => {
    expect(
      resolveAffectedDayNumbers({
        issue: {
          id: 'meal-1',
          priority: 'suggest_adjust',
          category: 'schedule',
          title: '午餐窗冲突',
          message: '预计 彩虹街 结束于 16:27，晚于午餐窗 12:00',
          affectedDays: [],
          severity: 'medium',
          issueKind: 'MEAL_WINDOW_VS_ARRIVAL',
          anchors: { toDayNumber: 1 },
        },
      }),
    ).toEqual([1]);
  });

  it('CAS-123: resolves day from diagnostic message 第N天', () => {
    expect(
      resolveAffectedDayNumbers({
        diagnosticMessage: '第1天 · 蓝湖温泉 → 辛格维利尔：路上约需 45 分钟',
      }),
    ).toEqual([1]);
  });

  it('CAS-123: resolves day from tripDayId day-N', () => {
    expect(
      resolveAffectedDayNumbers({
        issue: {
          id: 'meal-1',
          priority: 'suggest_adjust',
          category: 'schedule',
          title: '午餐窗冲突',
          message: '预计 彩虹街 结束于 16:27，晚于午餐窗 12:00',
          affectedDays: [],
          tripDayId: 'day-3',
          severity: 'medium',
        },
      }),
    ).toEqual([3]);
  });
});
