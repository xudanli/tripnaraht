import {
  parsePhysicalEvidenceGateMode,
  requiresPhysicalEvidenceRefs,
} from './physical-evidence-gate.util';

describe('physical-evidence-gate.util', () => {
  it('parsePhysicalEvidenceGateMode defaults to warn', () => {
    expect(parsePhysicalEvidenceGateMode(undefined)).toBe('warn');
    expect(parsePhysicalEvidenceGateMode('')).toBe('warn');
    expect(parsePhysicalEvidenceGateMode('invalid')).toBe('warn');
  });

  it('parsePhysicalEvidenceGateMode accepts error modes', () => {
    expect(parsePhysicalEvidenceGateMode('error')).toBe('error');
    expect(parsePhysicalEvidenceGateMode('ERROR')).toBe('error');
    expect(parsePhysicalEvidenceGateMode('error_critical_stages')).toBe('error_critical_stages');
  });

  it('requiresPhysicalEvidenceRefs respects error_critical_stages', () => {
    const base = {
      decisionSource: 'PHYSICAL' as const,
      decisionStage: 'ABU_GATE' as const,
      action: 'REJECT',
    };
    expect(requiresPhysicalEvidenceRefs(base, 'warn')).toBe(false);
    expect(requiresPhysicalEvidenceRefs(base, 'error')).toBe(true);
    expect(requiresPhysicalEvidenceRefs(base, 'error_critical_stages')).toBe(true);
    expect(
      requiresPhysicalEvidenceRefs(
        { ...base, action: 'ALLOW', decisionStage: 'ABU_GATE' },
        'error_critical_stages',
      ),
    ).toBe(false);
    expect(
      requiresPhysicalEvidenceRefs(
        { ...base, decisionStage: 'FINALIZE', action: 'REJECT' },
        'error_critical_stages',
      ),
    ).toBe(false);
  });
});
