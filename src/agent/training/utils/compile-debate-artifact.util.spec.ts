import { compileDebateArtifact } from './compile-debate-artifact.util';
import { PIIAnonymizerService } from '../services/pii-anonymizer.service';
import type { GateResult } from '../../interfaces/trip-plan.interface';

describe('compileDebateArtifact', () => {
  const pii = new PIIAnonymizerService();

  const gate: GateResult = {
    gate_result: 'ADJUST_REQUIRED',
    violations: [],
    required_adjustments: [],
    guardian_results: {
      source: 'llm_debate',
      abu: {
        verdict: 'REJECT',
        evidence: ['Svalbard black ice risk in late May', 'contact john.doe@hotel.com'],
        evidence_atoms: [{ violation_code: 'GATE_VIOLATION:SAFETY:HARD', tag: 'safety' }],
      },
      drdre: {
        verdict: 'ADJUST',
        evidence: ['pace too dense for 14h drive'],
        evidence_atoms: [{ violation_code: 'DEBATE:FATIGUE_01', tag: 'fatigue' }],
      },
      neptune: {
        verdict: 'REPLACE',
        evidence: ['alternate fjord route'],
        evidence_atoms: [],
      },
    },
  };

  it('maps Abu/Dr.Dre/Neptune votes and redacts PII in reasons', () => {
    const artifact = compileDebateArtifact(
      {
        source: 'llm_debate',
        gate,
        prompts: {
          system_prompt: 'System',
          user_prompt: 'User email test@example.com',
        },
        raw_completion: '{"guardian_results":{}}',
      },
      pii,
    );

    expect(artifact?.guardian_votes_redacted.abu.vote).toBe('BLOCK');
    expect(artifact?.guardian_votes_redacted.dr_dre.vote).toBe('WARN');
    expect(artifact?.guardian_votes_redacted.neptune?.vote).toBe('WARN');
    expect(artifact?.guardian_votes_redacted.abu.reason).toContain('[Abu]');
    expect(artifact?.guardian_votes_redacted.abu.reason).toContain('black ice');
    expect(artifact?.guardian_votes_redacted.abu.reason).not.toContain('john.doe@hotel.com');
    expect(artifact?.guardian_votes_redacted.abu.axiom_refs).toContain('GATE_VIOLATION:SAFETY:HARD');
    expect(artifact?.prompts_redacted?.user_prompt).not.toContain('test@example.com');
  });
});
