import {
  assertResultCtaSafe,
  buildEvidenceSheet,
  buildResultViewModel,
  parsePreviewRef,
  previewDeepLink,
} from './frontend-nara-look-result';
import type { NaraLookAssessment } from './frontend-nara-look-api.types';
import { nextCaptureScreen } from './frontend-nara-look-api-client';

function baseAssessment(
  overrides: Partial<NaraLookAssessment> = {},
): NaraLookAssessment {
  return {
    assessmentId: 'a1',
    observationId: 'obs_1',
    assessmentRevision: 1,
    summary: {
      whatHappened: '识别到 F 路标志',
      impact: '当前 2WD 车辆不适配',
      recommendation: '请查看安全替代方案',
    },
    status: 'EXECUTION_BLOCK',
    evidenceIds: ['ev_visual', 'ev_official'],
    actions: [
      {
        type: 'PREVIEW',
        previewRef: 'decision:look_dp_abc',
        label: '查看安全方案',
      },
      { type: 'ACKNOWLEDGE', label: '我知道了' },
    ],
    verificationStatus: 'VERIFIED',
    writesPlanVersion: false,
    authority: 'OFFICIAL_CORROBORATED',
    contextHash: 'lch_test_froad',
    decisionProblem: {
      type: 'INFEASIBILITY',
      semanticKey: 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
      linkedDecisionProblemId: 'look_dp_abc',
    },
    ...overrides,
  };
}

describe('frontend-nara-look-result (S5)', () => {
  it('builds four-layer RESULT view-model', () => {
    const vm = buildResultViewModel({ assessment: baseAssessment() });
    expect(vm.layers.status).toBe('EXECUTION_BLOCK');
    expect(vm.layers.whatHappened).toContain('F 路');
    expect(vm.layers.impact).toBeTruthy();
    expect(vm.layers.recommendation).toBeTruthy();
    expect(vm.writesPlanVersion).toBe(false);
    expect(vm.linkedDecisionProblemId).toBe('look_dp_abc');
  });

  it('primary CTA opens Decision Preview for linked problem', () => {
    const vm = buildResultViewModel({ assessment: baseAssessment() });
    expect(vm.cta.primary.action.type).toBe('OPEN_PREVIEW');
    if (vm.cta.primary.action.type === 'OPEN_PREVIEW') {
      expect(vm.cta.primary.action.entry.kind).toBe('DECISION');
    }
    expect(vm.previewEntry?.kind).toBe('DECISION');
    assertResultCtaSafe(vm);
  });

  it('rejects forbidden EXECUTION_BLOCK CTA copy', () => {
    const vm = buildResultViewModel({ assessment: baseAssessment() });
    vm.cta.secondary.label = '继续';
    expect(() => assertResultCtaSafe(vm)).toThrow(/forbidden/);
  });

  it('evidence sheet lists evidenceIds and blocks formal when empty', () => {
    const sheet = buildEvidenceSheet(baseAssessment());
    expect(sheet.items.length).toBe(2);
    expect(sheet.formalConclusionAllowed).toBe(true);

    const empty = buildEvidenceSheet(
      baseAssessment({ evidenceIds: [], verificationStatus: 'INSUFFICIENT' }),
    );
    expect(empty.formalConclusionAllowed).toBe(false);
    expect(empty.items[0]?.kind).toBe('UNKNOWN');
  });

  it('CONFLICTING evidence marks conflict item', () => {
    const sheet = buildEvidenceSheet(
      baseAssessment({
        verificationStatus: 'CONFLICTING',
        evidenceIds: ['e1', 'e2'],
      }),
    );
    expect(sheet.items.some((i) => i.kind === 'CONFLICT')).toBe(true);
  });

  it('parsePreviewRef covers Q2 corridors', () => {
    expect(parsePreviewRef('decision:p1', 'x').kind).toBe('DECISION');
    expect(parsePreviewRef('repair:TERRAIN_F_ROAD_UNFIT', 'x').kind).toBe(
      'REPAIR',
    );
    expect(parsePreviewRef('arrange:road_closure_reroute', 'x').kind).toBe(
      'ARRANGE_UWC',
    );
    expect(parsePreviewRef('navigation:meeting_point', 'x').kind).toBe(
      'NAVIGATION',
    );
    expect(
      parsePreviewRef('unsupported:UNSUPPORTED_ACTION_CORRIDOR', 'x').kind,
    ).toBe('UNSUPPORTED');
  });

  it('previewDeepLink never points at Look Apply', () => {
    const link = previewDeepLink(
      parsePreviewRef('decision:look_dp_1', '查看'),
      'trip_1',
    );
    expect(link).toContain('/decisions/look_dp_1');
    expect(link.toLowerCase()).not.toMatch(/apply/);
  });

  it('Member confirmApplyAllowed is false inside Look gate defaults', () => {
    const vm = buildResultViewModel({
      assessment: baseAssessment(),
      role: 'MEMBER',
    });
    expect(vm.confirmApplyAllowed).toBe(false);
  });

  it('NO_GPS CTA maps Enable location + evidence', () => {
    const vm = buildResultViewModel({
      assessment: baseAssessment({
        status: 'INFO',
        summary: {
          whatHappened: '无 GPS',
          impact: '无法匹配道路',
          recommendation: '请开启定位后重试',
        },
        actions: [{ type: 'ACKNOWLEDGE', label: '知道了' }],
        decisionProblem: {
          type: 'DATA_UNCERTAINTY',
          semanticKey: 'DATA_UNCERTAINTY.GPS_INSUFFICIENT',
        },
      }),
    });
    expect(vm.cta.primary.action.type).toBe('ENABLE_LOCATION');
    expect(vm.cta.secondary.action.type).toBe('OPEN_EVIDENCE');
  });

  it('RESULT → EVIDENCE_SHEET → RESULT navigation', () => {
    let s = nextCaptureScreen({
      current: 'RESULT',
      event: 'OPEN_EVIDENCE',
    });
    expect(s).toBe('EVIDENCE_SHEET');
    s = nextCaptureScreen({ current: s, event: 'BACK' });
    expect(s).toBe('RESULT');
  });
});
