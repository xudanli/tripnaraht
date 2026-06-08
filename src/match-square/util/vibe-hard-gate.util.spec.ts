import { evaluateVibeHardGates } from '../util/vibe-hard-gate.util';
import { parseVibeFreeTextWithRules } from '../engine/vibe-llm-parse.engine';

describe('evaluateVibeHardGates', () => {
  const payload = parseVibeFreeTextWithRules(
    '希望搭子高学历大厂，靠谱别掉链子',
  );

  it('blocks when education baseline not met', () => {
    const result = evaluateVibeHardGates(payload, {});
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('学历');
  });

  it('passes with verified bachelor education', () => {
    const result = evaluateVibeHardGates(payload, {
      education: {
        verified: true,
        degreeLevel: 'bachelor',
        tierTag: '985_211',
        displayTag: '🎓 本科(985/211)✓',
        verificationChannel: 'xuexin_online_code',
        badge: { verified: true, badgeLabel: '已认证', badgeMark: '✓', renderHint: 'vector_component_watermark' },
        verifiedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(result.blocked).toBe(false);
  });
});
