import type { LedgerNode } from './decision-ledger.types';
import { containsHardConstraintViolation, HARD_CONSTRAINT_ACTION_TYPES } from './ledger-recompute-severity.config';

const base: Pick<LedgerNode, 'parentIds' | 'consumesNodeIds' | 'inputSignatures' | 'outputRef' | 'createdAt'> = {
  parentIds: [],
  consumesNodeIds: [],
  inputSignatures: { budgetAnchor: 'b', preferenceAnchor: 'p', worldAnchor: 'w' },
  outputRef: { kind: 'k', payloadDigest: 'd' },
  createdAt: 1,
};

describe('ledger-recompute-severity.config', () => {
  it('HARD_CONSTRAINT_ACTION_TYPES 含 LOGISTICS 与 WORLD', () => {
    expect(HARD_CONSTRAINT_ACTION_TYPES).toContain('LOGISTICS');
    expect(HARD_CONSTRAINT_ACTION_TYPES).toContain('WORLD');
  });

  it('containsHardConstraintViolation：次生列表命中 LOGISTICS 时为 true', () => {
    const nodes: LedgerNode[] = [
      { ...base, nodeId: 'V1', actionType: 'LOGISTICS', status: 'INVALIDATED' } as LedgerNode,
      { ...base, nodeId: 'P1', actionType: 'POI', status: 'INVALIDATED' } as LedgerNode,
    ];
    expect(containsHardConstraintViolation(['V1'], nodes)).toBe(true);
    expect(containsHardConstraintViolation(['P1'], nodes)).toBe(false);
  });

  it('空列表为 false', () => {
    expect(containsHardConstraintViolation([], [{ ...base, nodeId: 'x', actionType: 'WORLD', status: 'STABLE' } as LedgerNode])).toBe(
      false,
    );
  });
});
