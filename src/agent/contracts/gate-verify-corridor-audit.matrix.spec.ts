import {
  GATE_VERIFY_CORRIDOR_AUDIT_MATRIX,
  MAIN_CHAIN_GATE_BLOCK_SCOPE,
} from './gate-verify-corridor-audit.matrix';

describe('gate-verify-corridor-audit.matrix', () => {
  it('scopes main-chain GATE BLOCK narrowly', () => {
    expect(MAIN_CHAIN_GATE_BLOCK_SCOPE).toMatch(/route_and_run/);
    expect(MAIN_CHAIN_GATE_BLOCK_SCOPE).not.toMatch(/entire system/i);
  });

  it('marks independent apply corridors as canWriteWithoutMainChainGate', () => {
    const iceland = GATE_VERIFY_CORRIDOR_AUDIT_MATRIX.find((r) => r.corridorId === 'iceland_apply');
    expect(iceland?.usesMainChainGateEval).toBe(false);
    expect(iceland?.canWriteWithoutMainChainGate).toBe(true);
    expect(iceland?.auditStatus).toBe('needs_audit');
  });

  it('proves main SM corridor cannot write past GATE without main chain', () => {
    const sm = GATE_VERIFY_CORRIDOR_AUDIT_MATRIX.find((r) => r.corridorId === 'route_and_run_sm');
    expect(sm?.canWriteWithoutMainChainGate).toBe(false);
    expect(sm?.auditStatus).toBe('proven');
  });
});
