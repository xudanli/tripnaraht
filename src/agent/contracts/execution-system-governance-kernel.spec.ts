// src/agent/contracts/execution-system-governance-kernel.spec.ts
import { ExecutionSystemGovernanceKernel } from './execution-system-governance-kernel';

describe('ExecutionSystemGovernanceKernel', () => {
  it('reject when constitution touched without revision bump', () => {
    expect(
      ExecutionSystemGovernanceKernel.adjudicateV1({
        touchesSemanticConstitution: true,
        touchesExecutionPolicy: false,
        touchesMutationControl: false,
        contractRevisionBumped: false,
      }),
    ).toBe('reject');
  });

  it('require_revision when only policy touched without bump', () => {
    expect(
      ExecutionSystemGovernanceKernel.adjudicateV1({
        touchesSemanticConstitution: false,
        touchesExecutionPolicy: true,
        touchesMutationControl: false,
        contractRevisionBumped: false,
      }),
    ).toBe('require_revision');
  });

  it('require_revision when mutation control touched without bump', () => {
    expect(
      ExecutionSystemGovernanceKernel.adjudicateV1({
        touchesSemanticConstitution: false,
        touchesExecutionPolicy: false,
        touchesMutationControl: true,
        contractRevisionBumped: false,
      }),
    ).toBe('require_revision');
  });

  it('allow when constitution touched and bump present', () => {
    expect(
      ExecutionSystemGovernanceKernel.adjudicateV1({
        touchesSemanticConstitution: true,
        touchesExecutionPolicy: true,
        touchesMutationControl: true,
        contractRevisionBumped: true,
      }),
    ).toBe('allow');
  });

  it('allow when nothing touched', () => {
    expect(
      ExecutionSystemGovernanceKernel.adjudicateV1({
        touchesSemanticConstitution: false,
        touchesExecutionPolicy: false,
        touchesMutationControl: false,
        contractRevisionBumped: false,
      }),
    ).toBe('allow');
  });
});
