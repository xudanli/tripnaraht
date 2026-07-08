import { resolveRepairCandidateExecutionCapability } from './repair-execution-capability.util';

describe('repair-execution-capability.util', () => {
  it('EXEC-CAP-001: SPLIT_DAY without materializer support → GUIDED_MANUAL', () => {
    expect(
      resolveRepairCandidateExecutionCapability({
        generationMethod: 'SPLIT_DAY',
        proposedOperations: [
          {
            operationId: 'op1',
            kind: 'SPLIT_DAY',
            targetRefs: [],
            parameters: {},
          },
        ],
      }),
    ).toBe('GUIDED_MANUAL');
  });

  it('EXEC-CAP-002: CHANGE_ROUTE only → DIRECT', () => {
    expect(
      resolveRepairCandidateExecutionCapability({
        generationMethod: 'ROUTE_REPAIR',
        proposedOperations: [
          {
            operationId: 'op1',
            kind: 'CHANGE_ROUTE',
            targetRefs: [],
            parameters: {},
          },
        ],
      }),
    ).toBe('DIRECT');
  });

  it('EXEC-CAP-004: ADD_ITEM only → DIRECT', () => {
    expect(
      resolveRepairCandidateExecutionCapability({
        generationMethod: 'TEMPLATE',
        proposedOperations: [
          {
            operationId: 'op1',
            kind: 'ADD_ITEM',
            targetRefs: [{ kind: 'DAY', id: '0' }],
            parameters: { tripDayIndex: 0 },
          },
        ],
      }),
    ).toBe('DIRECT');
  });
});
