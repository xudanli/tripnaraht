import {
  validateNarrativeAgainstSafety,
  proseForNarrativeIntegrityCheck,
  enforceNarrativeIntegrityPipeline,
  appendRuntimeDowngradeToAnswer,
  buildNarrativeIntegrityObservabilitySlice,
  narrativeIntegrityScoreFromSafetyMode,
  fingerprintViolationPatternIds,
  emitNarrativeIntegrityMetricEvent,
} from './narrative-integrity-validator.util';
import type { NarrativeSafetyPayload } from './narrative-safety-evaluator.util';

describe('validateNarrativeAgainstSafety', () => {
  const safe: NarrativeSafetyPayload = {
    mode: 'safe',
    reasons: [],
    stale_domains: [],
    consistency_risk: 'low',
  };

  it('passes safe mode always', () => {
    const r = validateNarrativeAgainstSafety('已确认仍可订已锁定', safe);
    expect(r.ok).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('refresh_required catches coordinated wording', () => {
    const safety: NarrativeSafetyPayload = {
      mode: 'refresh_required',
      reasons: [],
      stale_domains: ['flight'],
      consistency_risk: 'high',
    };
    const r = validateNarrativeAgainstSafety('你的航班与酒店已经协调完成，仍可订。', safety);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.matched_text.includes('协调'))).toBe(true);
    expect(r.violations.some((v) => v.matched_text.includes('仍可订'))).toBe(true);
  });

  it('tentative catches 保证', () => {
    const safety: NarrativeSafetyPayload = {
      mode: 'tentative',
      reasons: ['temporal_skew_across_snapshots'],
      stale_domains: [],
      consistency_risk: 'medium',
    };
    const r = validateNarrativeAgainstSafety('我可以保证你能订到这家酒店。', safety);
    expect(r.ok).toBe(false);
  });

  it('proseForNarrativeIntegrityCheck strips dashboard block', () => {
    const raw = [
      '正文一句。',
      '<<<CONSULTATION_UI_JSON>>>',
      '{"version":1}',
      '<<<END_CONSULTATION_UI_JSON>>>',
      '尾部。',
    ].join('\n');
    expect(proseForNarrativeIntegrityCheck(raw)).toContain('正文');
    expect(proseForNarrativeIntegrityCheck(raw)).not.toContain('CONSULTATION');
  });
});

describe('buildNarrativeIntegrityObservabilitySlice', () => {
  it('builds reason_codes and summary for downgraded', () => {
    const safety: NarrativeSafetyPayload = {
      mode: 'tentative',
      reasons: ['temporal_skew_across_snapshots'],
      stale_domains: [],
      consistency_risk: 'medium',
    };
    const slice = buildNarrativeIntegrityObservabilitySlice(safety, {
      validator_version: 1,
      violations: [{ claim: 'tentative_language', severity: 'hard', matched_text: '保证', pattern_id: 'tentative:保证' }],
      enforcement_action: 'downgraded',
      regeneration_attempted: true,
      regenerate_duration_ms: 1200,
    });
    expect(slice.schema).toBe('runtime/narrative-integrity/v1');
    expect(slice.reason_codes.some((c) => c.startsWith('enforcement:'))).toBe(true);
    expect(slice.reason_codes.some((c) => c.includes('pattern:'))).toBe(true);
    expect(slice.integrity_summary_zh).toContain('降级');
    expect(slice.narrative_integrity_score).toBe(0.5);
    expect(slice.violation_pattern_fingerprint).toHaveLength(16);
  });
});

describe('narrativeIntegrityScoreFromSafetyMode', () => {
  it('maps modes', () => {
    expect(narrativeIntegrityScoreFromSafetyMode('safe')).toBe(1);
    expect(narrativeIntegrityScoreFromSafetyMode('tentative')).toBe(0.5);
    expect(narrativeIntegrityScoreFromSafetyMode('refresh_required')).toBe(0);
  });
});

describe('fingerprintViolationPatternIds', () => {
  it('is stable for sorted equivalence', () => {
    const a = fingerprintViolationPatternIds(['z', 'a']);
    const b = fingerprintViolationPatternIds(['a', 'z']);
    expect(a).toBe(b);
  });

  it('returns undefined when empty', () => {
    expect(fingerprintViolationPatternIds([])).toBeUndefined();
  });
});

describe('emitNarrativeIntegrityMetricEvent', () => {
  it('logs when env enabled', () => {
    process.env.NARRATIVE_INTEGRITY_METRICS_LOG = '1';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    emitNarrativeIntegrityMetricEvent({
      request_id: 'r1',
      trip_id: 't1',
      slice: buildNarrativeIntegrityObservabilitySlice(
        {
          mode: 'refresh_required',
          reasons: [],
          stale_domains: ['flight'],
          consistency_risk: 'high',
        },
        {
          validator_version: 1,
          violations: [],
          enforcement_action: 'pass',
        },
      ),
    });
    expect(logSpy).toHaveBeenCalled();
    const line = String(logSpy.mock.calls[0]?.[0]);
    expect(line).toContain('tripnara_metric');
    expect(line).toContain('narrative_integrity_score');
    logSpy.mockRestore();
    delete process.env.NARRATIVE_INTEGRITY_METRICS_LOG;
  });
});

describe('appendRuntimeDowngradeToAnswer', () => {
  it('inserts before consultation marker', () => {
    const full = '前言\n\n<<<CONSULTATION_UI_JSON>>>\n{}\n<<<END_CONSULTATION_UI_JSON>>>';
    const out = appendRuntimeDowngradeToAnswer(full, '⚠️降级');
    expect(out.indexOf('⚠️降级')).toBeLessThan(out.indexOf('<<<CONSULTATION_UI_JSON>>>'));
  });
});

describe('enforceNarrativeIntegrityPipeline', () => {
  const tentative: NarrativeSafetyPayload = {
    mode: 'tentative',
    reasons: ['x'],
    stale_domains: [],
    consistency_risk: 'medium',
  };

  it('returns pass when validation ok', async () => {
    const r = await enforceNarrativeIntegrityPipeline({
      answerText: '仅供参考，以预订页为准。',
      safety: tentative,
      basePrompt: 'base',
      callLlm: async () => 'should not run',
    });
    expect(r.report.enforcement_action).toBe('pass');
    expect(r.answerText).toContain('仅供参考');
  });

  it('regenerates once then passes', async () => {
    let calls = 0;
    const r = await enforceNarrativeIntegrityPipeline({
      answerText: '我保证你能订到。',
      safety: tentative,
      basePrompt: 'base',
      callLlm: async () => {
        calls++;
        return '价格可能变化，请以预订页为准。';
      },
    });
    expect(calls).toBe(1);
    expect(r.report.enforcement_action).toBe('regenerated');
    expect(r.report.initial_violations?.length).toBeGreaterThan(0);
    expect(validateNarrativeAgainstSafety(proseForNarrativeIntegrityCheck(r.answerText), tentative).ok).toBe(true);
  });

  it('downgrades after failed regen', async () => {
    const r = await enforceNarrativeIntegrityPipeline({
      answerText: '我保证你能订到。',
      safety: tentative,
      basePrompt: 'base',
      callLlm: async () => '仍然保证你能订到。',
    });
    expect(r.report.enforcement_action).toBe('downgraded');
    expect(r.answerText).toContain('⚠️');
  });
});
