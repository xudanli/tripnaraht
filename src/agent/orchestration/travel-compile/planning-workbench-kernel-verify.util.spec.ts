import type { GateStatus } from '../../../skills/plan/shared/plan-state.types';
import type { VerificationIssue } from '../../../decision/kernel/decision-state.types';
import {
  applyKernelVerifyIssuesToGateStatus,
  summarizeKernelVerifyMetadata,
  WORKBENCH_VERIFY_REASON_PREFIX,
  workbenchVerifyNeedsRepair,
} from './planning-workbench-kernel-verify.util';

describe('planning-workbench-kernel-verify.util', () => {
  const baseGate: GateStatus = {
    status: 'ALLOW',
    reasons: [],
    missingEvidence: [],
  };

  it('merges verify issues into gate status with prefix', () => {
    const issues: VerificationIssue[] = [
      { code: 'TIME_WINDOW_OVERLAP', class: 'CONFLICT', message: 'overlap on day 1' },
      { code: 'ROUTE_INFEASIBLE', class: 'FATAL', message: 'F-road closed' },
    ];

    const next = applyKernelVerifyIssuesToGateStatus(baseGate, issues);

    expect(next.status).toBe('REJECT');
    expect(next.reasons.some((r) => r.startsWith(WORKBENCH_VERIFY_REASON_PREFIX))).toBe(true);
    expect(next.reasons.some((r) => r.includes('TIME_WINDOW_OVERLAP'))).toBe(true);
  });

  it('replaces stale verify reasons on re-run', () => {
    const gate: GateStatus = {
      ...baseGate,
      reasons: [`${WORKBENCH_VERIFY_REASON_PREFIX} OLD: stale`],
    };
    const next = applyKernelVerifyIssuesToGateStatus(gate, [
      { code: 'POI_CLOSED', class: 'ADVISORY', message: 'closed Monday' },
    ]);
    expect(next.reasons.some((r) => r.includes('OLD'))).toBe(false);
    expect(next.reasons.some((r) => r.includes('POI_CLOSED'))).toBe(true);
    expect(next.status).toBe('NEED_CONFIRM');
  });

  it('summarizes verify metadata counts', () => {
    const summary = summarizeKernelVerifyMetadata({
      issues: [
        { code: 'A', class: 'FATAL', message: 'x' },
        { code: 'B', class: 'CONFLICT', message: 'y' },
        { code: 'C', class: 'ADVISORY', message: 'z' },
      ],
      confidenceDelta: -0.15,
      verifyItinerarySource: 'canonical_travel_graph@v0',
      graphProjectedItemCount: 4,
      applied: true,
    });

    expect(summary.issueCount).toBe(3);
    expect(summary.fatalCount).toBe(1);
    expect(summary.conflictCount).toBe(1);
    expect(summary.advisoryCount).toBe(1);
    expect(summary.graphProjectedItemCount).toBe(4);
  });

  it('detects repairable conflict issues', () => {
    expect(
      workbenchVerifyNeedsRepair([
        { code: 'TIME_WINDOW_OVERLAP', class: 'CONFLICT', message: 'overlap' },
      ]),
    ).toBe(true);
    expect(
      workbenchVerifyNeedsRepair([
        { code: 'ROUTE_INFEASIBLE', class: 'FATAL', message: 'blocked' },
      ]),
    ).toBe(false);
  });
});
