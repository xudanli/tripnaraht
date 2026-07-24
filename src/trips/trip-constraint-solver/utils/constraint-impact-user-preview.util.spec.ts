import { TRIP_CONSTRAINT_LEGACY_IDS } from '../types/trip-constraint.types';
import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import type { TripConstraint } from '../types/trip-constraint.types';
import { buildStructuredConstraintImpactPreview } from './constraint-impact-preview.util';
import {
  buildUserFacingImpactPreview,
  sanitizeDayNumbers,
} from './constraint-impact-user-preview.util';

describe('constraint-impact-user-preview.util', () => {
  it('sanitizeDayNumbers filters invalid day indices', () => {
    expect(sanitizeDayNumbers([1, 2, 2026, 0, -1], 10)).toEqual([1, 2]);
  });

  it('pacing preview tolerates undefined optional bullet fields', () => {
    const pacingItem = {
      id: TRIP_CONSTRAINT_LEGACY_IDS.PACING_LEVEL,
      tripId: 't1',
      name: '行程节奏',
      category: 'ACTIVITY' as const,
      type: 'SOFT' as const,
      status: 'ACTIVE' as const,
      scope: { type: 'TRIP' as const },
      operator: 'EQ' as const,
      value: 'normal',
      allowRelaxation: true,
      locked: false,
      source: { type: 'USER' as const },
      visibility: 'TEAM' as const,
    };
    const structured = buildStructuredConstraintImpactPreview({
      changes: [{ constraintId: TRIP_CONSTRAINT_LEGACY_IDS.PACING_LEVEL, patch: { value: 'relaxed' } }],
      items: [pacingItem],
      conflictsBefore: [],
    });

    const preview = buildUserFacingImpactPreview({
      tripId: 't1',
      tripDayCount: 4,
      refreshType: 'quick',
      persist: false,
      changes: [{ constraintId: TRIP_CONSTRAINT_LEGACY_IDS.PACING_LEVEL, patch: { value: 'relaxed' } }],
      items: [pacingItem],
      conflictItems: [],
      conflictsBefore: { mustHandle: 0, suggestAdjust: 0, pendingConfirm: 0 },
      structuredImpact: structured,
    });

    expect(preview.structuredImpact.constraintChanges[0]?.userFacingSummary).toBe(
      '行程节奏从 适中 调整为 悠闲',
    );
    expect(preview.diffBullets.length).toBeGreaterThan(0);
  });

  const pilotDriveConflict: PlanningConflictItem = {
    id: 'c-drive-day1',
    source: 'feasibility',
    priority: 'must_handle',
    category: 'transport',
    title: '每日驾驶上限',
    message: 'Day 1 daily drive exceeded',
    affectedDays: [1],
    issue: {
      id: 'issue-drive-day1',
      priority: 'must_handle',
      category: 'transport',
      title: '每日驾驶上限',
      message: 'Day 1 daily drive exceeded',
      affectedDays: [1],
      severity: 'high',
      issueKind: 'daily_drive',
      anchors: {
        fromDayNumber: 1,
        fromPlaceLabel: '雷克雅未克',
        toPlaceLabel: '维克',
        travelMinutes: 1286,
        travelTimeMinutes: 160,
        departAt: '2026-07-01T09:00:00.000Z',
        toItemId: 'iti_vik',
      },
      proofs: [
        {
          entity: '路线引擎',
          constraint: 'max_daily_drive',
          currentFact: '预计驾驶 21 小时 26 分钟',
          evidenceSource: 'trip.conflicts',
          evidenceType: 'route_engine',
          conclusion: '超出上限',
          confidence: 0.95,
        },
      ],
    },
  };

  const baseItem = {
    id: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE,
    tripId: '5945a3ab-75d2-4911-ae82-9647c8c29e96',
    name: '每日驾驶上限',
    category: 'TRANSPORT' as const,
    type: 'HARD' as const,
    status: 'ACTIVE' as const,
    scope: { type: 'TRIP' as const },
    operator: 'LTE' as const,
    value: 6,
    unit: 'hour',
    allowRelaxation: true,
    locked: false,
    source: { type: 'USER' as const, templateId: 'max_daily_drive' },
    visibility: 'TEAM' as const,
  };

  it('PILOT Case B: 6h→5h Day1 still blocked with userSummary and day details', () => {
    const structured = buildStructuredConstraintImpactPreview({
      changes: [{ constraintId: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE, patch: { value: 5 } }],
      items: [baseItem],
      conflictsBefore: [pilotDriveConflict],
      assessBefore: {
        overallAverageScore: 49,
        overallGrade: 'FAIR',
        reasonableDays: 3,
        hasIssuesDays: 1,
        plannedDays: 7,
      },
      conflictsAfter: { mustHandle: 0, suggestAdjust: 0, pendingConfirm: 0 },
    });

    const preview = buildUserFacingImpactPreview({
      tripId: '5945a3ab-75d2-4911-ae82-9647c8c29e96',
      tripDayCount: 7,
      refreshType: 'deep',
      persist: false,
      changes: [{ constraintId: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE, patch: { value: 5 } }],
      items: [baseItem],
      conflictItems: [pilotDriveConflict],
      conflictsBefore: { mustHandle: 6, suggestAdjust: 0, pendingConfirm: 0 },
      conflictsAfter: { mustHandle: 0, suggestAdjust: 0, pendingConfirm: 0 },
      assessBefore: {
        overallAverageScore: 49,
        overallGrade: 'FAIR',
        reasonableDays: 3,
        hasIssuesDays: 1,
        plannedDays: 7,
      },
      assessAfter: {
        overallAverageScore: 49,
        overallGrade: 'FAIR',
        reasonableDays: 3,
        hasIssuesDays: 1,
        plannedDays: 7,
      },
      structuredImpact: structured,
      tepRuleResults: [
        {
          ruleId: 'SDR-101',
          outcome: 'REJECT',
          severity: 'HIGH',
          affectedRefs: ['day_1'],
          explanation: '第 1 日等效驾驶负荷 1286min（EXTREME）',
          evidenceRefs: [],
        },
      ],
    });

    expect(preview.userSummary.verdict).toBe('STILL_NOT_EXECUTABLE');
    expect(preview.userSummary.verdictLabel).toBe('仍不可执行');
    expect(preview.userSummary.verdictReason).toContain('第 1 天驾驶');
    expect(preview.userSummary.verdictReason).toContain('5 小时');

    expect(preview.executeabilityDelta.scoreDeltaReason).toContain('冲突计数已更新');
    expect(preview.executeabilityDelta.blockingRuleIds).toEqual(['SDR-101']);
    expect(preview.executeabilityDelta.conflictsDeltaSummary?.mustHandle?.label).toContain('驾驶');

    expect(preview.structuredImpact.constraintChanges[0]?.userFacingSummary).toBe(
      '从 6 小时/天 改为 5 小时/天',
    );

    expect(preview.affectedDayDetails.length).toBeGreaterThan(0);
    expect(preview.affectedDayDetails[0]?.dayNumber).toBe(1);
    expect(preview.affectedDayDetails[0]?.daySummary).toMatch(/21.*26.*分钟|21.*小时/);
    expect(preview.affectedDayDetails[0]?.items?.[0]?.label).toContain('雷克雅未克');

    expect(preview.suggestedFollowUp.label).toBe('保存并检查是否走得通');
    expect(preview.suggestedFollowUp.action).toBe('CONFIRM_AND_DEEP_CHECK');
    expect(preview.suggestedFollowUp).not.toHaveProperty('endpoint');

    expect(preview.diffBullets.some((b) => /\/api\//.test(b))).toBe(false);
    expect(preview.diffBullets.some((b) => /persist|validate-scope|读模型/i.test(b))).toBe(false);

    expect(preview.constraintAssessments.some((a) => a.constraintKey === 'MAX_DAILY_DRIVE')).toBe(
      true,
    );
    const maxDrive = preview.constraintAssessments.find((a) => a.constraintKey === 'MAX_DAILY_DRIVE');
    expect(maxDrive?.lanes.executability?.ruleId).toBe('SDR-101');
    expect(maxDrive?.contractRequirement).toBe('≤ 5h');
  });

  it('falls back to TEP dailyDrivePlans when daily_drive anchors lack route labels', () => {
    const dayOnlyConflict: PlanningConflictItem = {
      ...pilotDriveConflict,
      issue: {
        ...pilotDriveConflict.issue!,
        anchors: {
          fromDayNumber: 1,
          travelMinutes: 1286,
          shortfallMinutes: 386,
        },
      },
    };

    const preview = buildUserFacingImpactPreview({
      tripId: '5945a3ab-75d2-4911-ae82-9647c8c29e96',
      tripDayCount: 7,
      refreshType: 'quick',
      persist: false,
      changes: [{ constraintId: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE, patch: { value: 5 } }],
      items: [baseItem],
      conflictItems: [dayOnlyConflict],
      conflictsBefore: { mustHandle: 1, suggestAdjust: 0, pendingConfirm: 0 },
      structuredImpact: buildStructuredConstraintImpactPreview({
        changes: [{ constraintId: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE, patch: { value: 5 } }],
        items: [baseItem],
        conflictsBefore: [dayOnlyConflict],
      }),
      dailyDrivePlans: [
        {
          date: '2026-07-01',
          dayIndex: 1,
          origin: { ref: 'anchor_rey', label: '雷克雅未克' },
          destination: { ref: 'anchor_vik', label: '维克' },
          legs: [
            {
              legId: 'drive_leg_1_1',
              fromRef: 'iti_rey',
              toRef: 'iti_vik',
              baseNavigationMinutes: 160,
              roadRefs: [],
              importance: 'RECOMMENDED',
              flexibility: 'MOVABLE',
            },
          ],
          activities: [],
          buffers: [],
        },
      ],
      itemLabelsById: new Map([
        ['iti_rey', '雷克雅未克'],
        ['iti_vik', '维克'],
      ]),
    });

    expect(preview.scheduleDetailLevel).toBe('activity');
    expect(preview.affectedDayDetails[0]?.items?.[0]?.label).toBe('雷克雅未克 → 维克');
  });

  it('NO_NIGHT_DRIVE preview returns activity detail and structured assessment evidence', () => {
    const noNightItem = {
      id: TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE,
      tripId: '5945a3ab-75d2-4911-ae82-9647c8c29e96',
      name: '不夜驾',
      category: 'TRANSPORT' as const,
      type: 'HARD' as const,
      status: 'ACTIVE' as const,
      scope: { type: 'TRIP' as const },
      operator: 'EQ' as const,
      value: { maxMinutesAfterSunset: 30 },
      allowRelaxation: true,
      locked: false,
      source: { type: 'USER' as const, templateId: 'no_night_drive' },
      visibility: 'TEAM' as const,
    };

    const noNightConflict: PlanningConflictItem = {
      id: 'no-night-day1',
      source: 'feasibility',
      priority: 'must_handle',
      category: 'transport',
      title: '不夜驾',
      message:
        '日落后 30 分钟不得继续驾驶。Day 1「雷克雅未克 → 维克」预计 23:40 抵达，晚于截止 23:57（日落 23:27）。',
      affectedDays: [1],
      issue: {
        id: 'issue-no-night-day1',
        priority: 'must_handle',
        category: 'transport',
        title: '不夜驾',
        message:
          '日落后 30 分钟不得继续驾驶。Day 1「雷克雅未克 → 维克」预计 23:40 抵达，晚于截止 23:57（日落 23:27）。',
        affectedDays: [1],
        severity: 'high',
        issueKind: 'no_night_drive',
        anchors: {
          fromPlaceLabel: '雷克雅未克',
          toPlaceLabel: '维克',
          fromItemId: 'iti_rey',
          toItemId: 'iti_vik',
          departAt: '2026-07-15T09:00:00.000Z',
          arriveAt: '2026-07-15T23:40:00.000Z',
        },
      },
    };

    const preview = buildUserFacingImpactPreview({
      tripId: '5945a3ab-75d2-4911-ae82-9647c8c29e96',
      tripDayCount: 7,
      refreshType: 'quick',
      persist: false,
      changes: [
        {
          constraintId: TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE,
          patch: { maxMinutesAfterSunset: 30 },
        },
      ],
      items: [noNightItem],
      conflictItems: [noNightConflict],
      conflictsBefore: { mustHandle: 1, suggestAdjust: 0, pendingConfirm: 0 },
      structuredImpact: buildStructuredConstraintImpactPreview({
        changes: [
          {
            constraintId: TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE,
            patch: { maxMinutesAfterSunset: 30 },
          },
        ],
        items: [noNightItem],
        conflictsBefore: [noNightConflict],
      }),
      tepRuleResults: [
        {
          ruleId: 'SDR-202',
          outcome: 'SUGGEST_REPAIR',
          severity: 'HIGH',
          affectedRefs: ['drive_leg_1_1', 'day_1'],
          explanation:
            '驾驶段预计 23:40 结束，超出安全截止 23:57（日落 23:27 + 30 分钟，+43min）',
          evidenceRefs: [
            {
              provider: 'TEP',
              sourceType: 'INTERNAL',
              observedAt: '2026-07-15T00:00:00.000Z',
              predicate: 'daylight.sunset:23:27',
            },
          ],
        },
      ],
    });

    expect(preview.scheduleDetailLevel).toBe('activity');
    expect(preview.affectedDayDetails[0]?.items?.[0]?.label).toBe('雷克雅未克 → 维克');
    expect(preview.affectedDayDetails[0]?.items?.[0]?.detail).toContain('23:40');

    const noNightAssessment = preview.constraintAssessments.find(
      (a) => a.constraintKey === 'NO_NIGHT_DRIVE',
    );
    expect(noNightAssessment?.lanes.executability?.evidence?.sunsetLocal).toBe('23:27');
    expect(noNightAssessment?.lanes.executability?.evidence?.arriveLocal).toBe('23:40');
    expect(noNightAssessment?.contractRequirement).toBe('日落后 30 分钟内结束驾驶');
  });

  it('NO_NIGHT_DRIVE draft 30→45 reprojects verdict and assessment with +45min cutoff', () => {
    const noNightItem = {
      id: TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE,
      tripId: '5945a3ab-75d2-4911-ae82-9647c8c29e96',
      name: '不夜驾',
      category: 'TRANSPORT' as const,
      type: 'HARD' as const,
      status: 'ACTIVE' as const,
      scope: { type: 'TRIP' as const },
      operator: 'EQ' as const,
      value: { maxMinutesAfterSunset: 30 },
      allowRelaxation: true,
      locked: false,
      source: { type: 'USER' as const, templateId: 'no_night_drive' },
      visibility: 'TEAM' as const,
    };

    const preview = buildUserFacingImpactPreview({
      tripId: '5945a3ab-75d2-4911-ae82-9647c8c29e96',
      tripDayCount: 7,
      refreshType: 'quick',
      persist: false,
      changes: [
        {
          constraintId: TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE,
          patch: { value: { maxMinutesAfterSunset: 45 }, unit: 'minute' },
        },
      ],
      items: [noNightItem],
      conflictItems: [],
      conflictsBefore: { mustHandle: 0, suggestAdjust: 0, pendingConfirm: 0 },
      structuredImpact: buildStructuredConstraintImpactPreview({
        changes: [
          {
            constraintId: TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE,
            patch: { value: { maxMinutesAfterSunset: 45 }, unit: 'minute' },
          },
        ],
        items: [noNightItem],
        conflictsBefore: [],
      }),
      tepRuleResults: [
        {
          ruleId: 'SDR-202',
          outcome: 'SUGGEST_REPAIR',
          severity: 'HIGH',
          affectedRefs: ['drive_leg_1_1', 'day_1'],
          explanation:
            '驾驶段预计 00:53 结束，超出安全截止 23:34（日落 23:04 + 30 分钟，+79min）',
          evidenceRefs: [
            {
              provider: 'TEP',
              sourceType: 'INTERNAL',
              observedAt: '2026-07-15T00:00:00.000Z',
              predicate: 'daylight.sunset:23:04',
            },
          ],
        },
      ],
      dailyDrivePlans: [
        {
          date: '2026-07-01',
          dayIndex: 1,
          origin: { ref: 'anchor_rey', label: '雷克雅未克' },
          destination: { ref: 'anchor_vik', label: '维克' },
          legs: [
            {
              legId: 'drive_leg_1_1',
              fromRef: 'iti_rey',
              toRef: 'iti_vik',
              baseNavigationMinutes: 160,
              roadRefs: [],
              importance: 'RECOMMENDED',
              flexibility: 'MOVABLE',
            },
          ],
          activities: [],
          buffers: [],
        },
      ],
      itemLabelsById: new Map([
        ['iti_rey', '雷克雅未克'],
        ['iti_vik', '维克'],
      ]),
    });

    expect(preview.userSummary.verdict).toBe('STILL_NOT_EXECUTABLE');
    expect(preview.userSummary.verdictReason).toContain('23:49');
    expect(preview.userSummary.verdictReason).toContain('45 分钟');
    expect(preview.userSummary.verdictReason).toContain('+64min');
    expect(preview.structuredImpact.constraintChanges[0]?.userFacingSummary).toBe(
      '不夜驾：日落后 30 分钟内停止驾驶 → 日落后 45 分钟内停止驾驶',
    );

    const assessment = preview.constraintAssessments.find((a) => a.constraintKey === 'NO_NIGHT_DRIVE');
    expect(assessment?.lanes.executability?.evidence?.cutoffLocal).toBe('23:49');
    expect(assessment?.lanes.executability?.evidence?.maxMinutesAfterSunset).toBe(45);
    expect(assessment?.lanes.executability?.evidence?.measuredMinutes).toBe(64);
  });

  it('tolerates undefined items in preview assessments path', () => {
    const preview = buildUserFacingImpactPreview({
      tripId: 't1',
      tripDayCount: 4,
      refreshType: 'quick',
      persist: false,
      changes: [
        {
          constraintId: TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE,
          patch: { value: { maxMinutesAfterSunset: 45 }, unit: 'minute' },
        },
      ],
      items: undefined as unknown as TripConstraint[],
      conflictItems: [],
      conflictsBefore: { mustHandle: 0, suggestAdjust: 0, pendingConfirm: 0 },
      structuredImpact: buildStructuredConstraintImpactPreview({
        changes: [
          {
            constraintId: TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE,
            patch: { value: { maxMinutesAfterSunset: 45 }, unit: 'minute' },
          },
        ],
        items: [],
        conflictsBefore: [],
      }),
      tepRuleResults: [
        {
          ruleId: 'SDR-202',
          outcome: 'SUGGEST_REPAIR',
          severity: 'HIGH',
          affectedRefs: ['day_1'],
          explanation:
            '驾驶段预计 00:53 结束，超出安全截止 23:34（日落 23:04 + 30 分钟，+79min）',
          evidenceRefs: [],
        },
      ],
    });

    expect(preview.userSummary.verdict).toBe('STILL_NOT_EXECUTABLE');
    expect(preview.constraintAssessments.length).toBeGreaterThan(0);
  });
});
