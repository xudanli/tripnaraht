import type { DecisionLogEntry } from '../interfaces/trip-plan.interface';
import { rollupVerifyIssuesFromDecisionLog } from './decision-log-verify-rollup.util';

describe('rollupVerifyIssuesFromDecisionLog', () => {
  it('returns empty rollup when log missing or empty', () => {
    expect(rollupVerifyIssuesFromDecisionLog(undefined)).toEqual({
      hasConflict: false,
      hasAdvisory: false,
      conflictCodes: [],
    });
    expect(rollupVerifyIssuesFromDecisionLog([])).toEqual({
      hasConflict: false,
      hasAdvisory: false,
      conflictCodes: [],
    });
  });

  it('detects CONFLICT and ADVISORY from VERIFY metadata.issues', () => {
    const log: DecisionLogEntry[] = [
      {
        request_id: 'r1',
        step: 'VERIFY',
        actor: 'Orchestrator',
        inputs_summary: '',
        outputs_summary: 'issues',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          issues: [
            { code: 'POI_CLOSED', class: 'ADVISORY', message: 'x' },
            { code: 'ROUTE_INFEASIBLE', class: 'CONFLICT', message: 'y' },
          ],
        },
      } as DecisionLogEntry,
    ];
    const r = rollupVerifyIssuesFromDecisionLog(log);
    expect(r.hasConflict).toBe(true);
    expect(r.hasAdvisory).toBe(true);
    expect(r.conflictCodes).toContain('ROUTE_INFEASIBLE');
  });

  it('ignores non-VERIFY steps', () => {
    const log: DecisionLogEntry[] = [
      {
        request_id: 'r1',
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: '',
        outputs_summary: '',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          issues: [{ code: 'ROUTE_INFEASIBLE', class: 'CONFLICT', message: 'y' }],
        },
      } as DecisionLogEntry,
    ];
    expect(rollupVerifyIssuesFromDecisionLog(log).hasConflict).toBe(false);
  });
});
