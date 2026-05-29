import {
  debateOutputContradictsUserIntentAnchors,
  extractGuardianDebateUserIntentAnchors,
  inferPersonaHintFromUserIntentAnchors,
} from './guardian-debate-user-intent-anchor.util';

describe('guardian-debate-user-intent-anchor.util', () => {
  it('extracts midnight sun + continuous ring road from user message', () => {
    const a = extractGuardianDebateUserIntentAnchors('想利用极昼，24小时不间断自驾环岛');
    expect(a?.midnight_sun_continuous_drive).toBe(true);
    expect(a?.ring_road_full_scope).toBe(true);
    expect(a?.interpretation_zh).toContain('连续自驾');
    expect(a?.disambiguation_zh).toContain('不得静默');
  });

  it('infers HIGH drdre_tolerance for marathon drive anchor', () => {
    const a = extractGuardianDebateUserIntentAnchors('24小时不间断自驾环岛');
    expect(inferPersonaHintFromUserIntentAnchors(a)?.drdre_tolerance).toBe('HIGH');
  });

  it('flags south-coast 2h REPLACE as contradicting marathon intent', () => {
    const anchors = extractGuardianDebateUserIntentAnchors('想利用极昼，24小时不间断自驾环岛');
    const conflict = debateOutputContradictsUserIntentAnchors(anchors, {
      debate_summary_zh:
        '采纳 Neptune REPLACE：缩至南岸精华，单日驾驶 1–1.5 小时，含 2 天弹性休息。',
      neptune_verdict: 'REPLACE',
      drdre_verdict: 'ALLOW',
      neptune_evidence: ['改为南岸经典线'],
      drdre_evidence: [],
    });
    expect(conflict).toBe(true);
  });

  it('allows REPLACE when intent tradeoff is explicit', () => {
    const anchors = extractGuardianDebateUserIntentAnchors('24小时不间断自驾环岛');
    const conflict = debateOutputContradictsUserIntentAnchors(anchors, {
      debate_summary_zh:
        '与用户 24 小时连续自驾诉求存在取舍：2WD 无法上 F 路，需确认是否改四驱或接受南岸折中；残余风险：…',
      neptune_verdict: 'REPLACE',
      drdre_verdict: 'ADJUST',
    });
    expect(conflict).toBe(false);
  });
});
