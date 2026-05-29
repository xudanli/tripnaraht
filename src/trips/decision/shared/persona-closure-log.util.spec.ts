import {
  countAbuPostNeptuneRechecks,
  extractPersonaClosureAuditFromLogs,
} from '../shared/persona-closure-log.util';
import type { DecisionLogEntry } from '../shared/decision-result.types';

describe('persona-closure-log.util', () => {
  const recheckLog: DecisionLogEntry = {
    persona: 'ABU',
    action: 'ALLOW',
    explanation: 'recheck',
    reasonCodes: [],
    timestamp: new Date().toISOString(),
    decisionSource: 'PHYSICAL',
    decisionStage: 'ABU_GATE',
    metadata: { persona_closure: { iter: 0, phase: 'post_neptune_recheck' } },
  };

  const auditLog: DecisionLogEntry = {
    persona: 'ABU',
    action: 'ALLOW',
    explanation: 'audit',
    reasonCodes: ['PERSONA_CLOSURE'],
    timestamp: new Date().toISOString(),
    decisionSource: 'PHYSICAL',
    decisionStage: 'FINALIZE',
    metadata: {
      personaClosureAudit: {
        iters: [],
        stopReason: 'ABU_RECHECK_PASS',
        totalAbuRechecks: 1,
      },
    },
  };

  it('countAbuPostNeptuneRechecks', () => {
    expect(countAbuPostNeptuneRechecks([recheckLog])).toBe(1);
    expect(countAbuPostNeptuneRechecks([])).toBe(0);
  });

  it('extractPersonaClosureAuditFromLogs', () => {
    expect(extractPersonaClosureAuditFromLogs([recheckLog, auditLog])?.stopReason).toBe(
      'ABU_RECHECK_PASS',
    );
  });
});
