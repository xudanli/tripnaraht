import { selectActivityEditorInsight } from './activity-editor-insight.selector';
import type { ActivityEditorBuiltContext } from './activity-editor-page-context.builder';
import type { PlanProposal } from '../../arrange-itinerary/types/plan-proposal.types';

function baseBuilt(
  overrides: Partial<ActivityEditorBuiltContext> = {},
): ActivityEditorBuiltContext {
  return {
    authoritative: {
      tripSnapshot: { tripVersion: 'v1' },
      relevantWorldState: { worldStateVersion: 'none' },
      constraintAssessments: [],
      decisionProblems: [],
      selectedEntities: [],
      availableActions: [],
      pageFocus: {
        pageId: 'ACTIVITY_EDITOR',
        lifecycle: 'PLANNING',
        selectedRefs: [],
      },
    },
    versions: { relevantTripProjectionVersion: 'v1' },
    gate: { ok: true, missing: [] },
    placeId: 42,
    placeName: '黑沙滩',
    dayIndex: 3,
    dayItems: [],
    startTime: '10:00',
    endTime: '12:00',
    durationMinutes: 120,
    allowedFactTokens: ['黑沙滩', '3', '第3天', '10:00', '12:00', '2', '120'],
    ...overrides,
  };
}

function proposal(status: 'PASS' | 'WARN' | 'BLOCK', material = false): PlanProposal {
  return {
    proposalId: 'prop_1',
    tripId: 't1',
    userId: 'copilot-context-builder',
    intent: 'ADD_ITEM',
    basePlanVersion: 1,
    contextVersion: 1,
    affectedDays: [3],
    changes: [],
    tradeoffs: material ? ['建议改到第5天。'] : [],
    validation: {
      status,
      warnings: status === 'WARN' ? ['加入后当天延长约2小时，可能影响后续入场。'] : [],
      conflicts:
        status === 'BLOCK'
          ? [{ kind: 'TIME_WINDOW', message: '黑沙滩将晚于最晚入场时间。' }]
          : [],
    },
    diff: {
      timelineChanges: material
        ? [{ operation: 'ADD', label: '黑沙滩', dayIndex: 3, impact: 'high' }]
        : [{ operation: 'ADD', label: '黑沙滩', dayIndex: 3, impact: 'low' }],
      summary: 'add activity',
    },
    requiresConfirmation: true,
    status: 'AWAITING_CONFIRMATION',
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    source: { type: 'create_item', payload: {} },
  };
}

describe('selectActivityEditorInsight', () => {
  it('CONTEXT_MISSING when gate fails', () => {
    const sel = selectActivityEditorInsight({
      built: baseBuilt({
        gate: { ok: false, code: 'CONTEXT_MISSING', missing: ['activity'] },
        proposal: undefined,
      }),
    });
    expect(sel.modeReason).toBe('CONTEXT_MISSING');
    expect(sel.mode).toBe('ATTENTION');
    expect(sel.hasValidatedRecommendation).toBe(false);
  });

  it('PASS without material impact → SILENT', () => {
    const sel = selectActivityEditorInsight({
      built: baseBuilt({ proposal: proposal('PASS', false) }),
    });
    expect(sel.mode).toBe('SILENT');
    expect(sel.modeReason).toBe('NO_MATERIAL_IMPACT');
  });

  it('WARN with material impact → ATTENTION + validated recommend', () => {
    const sel = selectActivityEditorInsight({
      built: baseBuilt({
        proposal: proposal('WARN', true),
        allowedFactTokens: [
          '黑沙滩',
          '3',
          '第3天',
          '2',
          '加入后当天延长约2小时，可能影响后续入场。',
          '建议改到第5天。',
          '5',
        ],
      }),
    });
    expect(sel.mode).toBe('ATTENTION');
    expect(sel.hasValidatedRecommendation).toBe(true);
    expect(sel.actions[0]?.kind).toBe('PREVIEW');
    expect((sel.actions[0] as { actionType: string }).actionType).toBe(
      'PREVIEW_ADD_ACTIVITY',
    );
  });

  it('BLOCK → INTERVENTION without invented recommendation', () => {
    const sel = selectActivityEditorInsight({
      built: baseBuilt({
        proposal: proposal('BLOCK', true),
        allowedFactTokens: ['黑沙滩', '黑沙滩将晚于最晚入场时间。'],
      }),
    });
    expect(sel.mode).toBe('INTERVENTION');
    expect(sel.hasValidatedRecommendation).toBe(false);
    expect(sel.recommendation).toBeUndefined();
    expect(sel.ruleSuggestion).toContain('比较方案');
  });
});
