import type { PersonaClosureAudit } from '../../trips/decision/shared/persona-closure.types';
import {
  filterSpatialReplaceAdjustments,
  PERSONA_CLOSURE_SKIP_REASON,
  resolvePersonaClosureAudit,
  shouldSkipRepairNeptuneReplace,
} from './persona-closure-repair-skip.util';

const convergedAudit: PersonaClosureAudit = {
  stopReason: 'ABU_RECHECK_PASS',
  totalAbuRechecks: 1,
  iters: [],
};

describe('persona-closure-repair-skip.util', () => {
  it('resolvePersonaClosureAudit prefers explicit ctx over gate/metadata/systemState', () => {
    const explicit = { ...convergedAudit, totalAbuRechecks: 2 };
    expect(
      resolvePersonaClosureAudit({
        personaClosureAudit: explicit,
        gateResult: { persona_closure_audit: convergedAudit } as any,
        orchestratorMetadata: { persona_closure_audit: convergedAudit },
        systemState: { personaClosureAudit: convergedAudit } as any,
      }),
    ).toBe(explicit);
  });

  it('shouldSkipRepairNeptuneReplace when ABU_RECHECK_PASS and no fatal verification', () => {
    expect(
      shouldSkipRepairNeptuneReplace(convergedAudit, {
        verification: { issues: [{ class: 'CONFLICT', code: 'X', message: 'm', source: 'OTHER', at: '' }] },
      } as any),
    ).toBe(true);
  });

  it('should not skip when verification has fatal', () => {
    expect(
      shouldSkipRepairNeptuneReplace(convergedAudit, {
        verification: { hasFatal: true, issues: [] },
      } as any),
    ).toBe(false);
  });

  it('should not skip when stopReason is not ABU_RECHECK_PASS', () => {
    expect(
      shouldSkipRepairNeptuneReplace(
        { ...convergedAudit, stopReason: 'ITER_LIMIT' },
        { verification: { issues: [] } } as any,
      ),
    ).toBe(false);
  });

  it('filterSpatialReplaceAdjustments removes REPLACE_* when skip=true', () => {
    const adjustments = [
      { action: 'REPLACE_SEGMENT', why: 'a' },
      { action: 'REPLACE_POI', why: 'b' },
      { action: 'REDUCE_SCOPE', why: 'c' },
    ];
    expect(filterSpatialReplaceAdjustments(adjustments, true)).toEqual([{ action: 'REDUCE_SCOPE', why: 'c' }]);
    expect(filterSpatialReplaceAdjustments(adjustments, false)).toEqual(adjustments);
  });

  it('PERSONA_CLOSURE_SKIP_REASON is stable contract string', () => {
    expect(PERSONA_CLOSURE_SKIP_REASON).toBe('persona_closure_already_converged');
  });
});
