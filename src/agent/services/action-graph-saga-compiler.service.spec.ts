import { ActionGraphSagaCompilerService } from './action-graph-saga-compiler.service';
import { ActionGraph } from '../interfaces/action-graph.interface';

describe('ActionGraphSagaCompilerService', () => {
  let service: ActionGraphSagaCompilerService;

  beforeEach(() => {
    service = new ActionGraphSagaCompilerService();
  });

  it('compiles hotel-rebook graph into staged execution plan', () => {
    const graph: ActionGraph = {
      graphId: 'graph_001',
      decisionId: 'decision_001',
      createdAt: new Date().toISOString(),
      contextSignature: {
        signatureId: 'sha256:sig001',
        physicalHash: 'sha256:p1',
        resourceHash: 'sha256:r1',
        policyVersion: 'policy-lab:v1',
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      nodes: [
        {
          nodeId: 'A',
          actionType: 'PLAN_EDIT',
          handlerId: 'check.booking',
          input: {},
          riskLevel: 'LOW',
          idempotencyKey: 'idem-A',
        },
        {
          nodeId: 'B',
          actionType: 'ROUTE_RECOMPUTE',
          handlerId: 'search.hotel',
          input: {},
          riskLevel: 'LOW',
          idempotencyKey: 'idem-B',
        },
        {
          nodeId: 'C',
          actionType: 'PLAN_EDIT',
          handlerId: 'check.budget',
          input: {},
          riskLevel: 'MEDIUM',
          idempotencyKey: 'idem-C',
        },
        {
          nodeId: 'D',
          actionType: 'BOOKING_HOLD',
          handlerId: 'inventory.lock.hotel',
          input: {},
          riskLevel: 'HIGH',
          idempotencyKey: 'idem-D',
          compensationHandlerId: 'inventory.release.hotel',
        },
        {
          nodeId: 'E',
          actionType: 'BOOKING_COMMIT',
          handlerId: 'booking.commit.hotel',
          input: {},
          riskLevel: 'HIGH',
          idempotencyKey: 'idem-E',
          compensationHandlerId: 'booking.restore.hotel',
        },
        {
          nodeId: 'F',
          actionType: 'PLAN_EDIT',
          handlerId: 'plan.mutate',
          input: {},
          riskLevel: 'MEDIUM',
          idempotencyKey: 'idem-F',
          compensationHandlerId: 'plan.rollback',
        },
        {
          nodeId: 'G',
          actionType: 'NOTIFICATION_SEND',
          handlerId: 'notify.user',
          input: {},
          riskLevel: 'LOW',
          idempotencyKey: 'idem-G',
          isIrreversible: true,
        },
      ],
      edges: [
        { from: 'A', to: 'D', dependencyType: 'MUST_COMPLETE_BEFORE' },
        { from: 'B', to: 'D', dependencyType: 'MUST_COMPLETE_BEFORE' },
        { from: 'C', to: 'D', dependencyType: 'MUST_COMPLETE_BEFORE' },
        { from: 'D', to: 'E', dependencyType: 'MUST_COMPLETE_BEFORE' },
        { from: 'E', to: 'F', dependencyType: 'MUST_COMPLETE_BEFORE' },
        { from: 'F', to: 'G', dependencyType: 'MUST_COMPLETE_BEFORE' },
      ],
    };

    const result = service.compile(graph);
    expect(result.valid).toBe(true);
    expect(result.plan).toBeDefined();
    expect(result.plan?.stages.map((s) => s.stageId)).toEqual([
      'dry_run',
      'lock',
      'commit',
      'state_mutation',
      'irreversible',
    ]);
    expect(result.plan?.riskLevel).toBe('HIGH');
  });

  it('rejects cycle graph', () => {
    const graph: ActionGraph = {
      graphId: 'graph_cycle',
      decisionId: 'd1',
      createdAt: new Date().toISOString(),
      contextSignature: {
        signatureId: 'sha256:sig',
        physicalHash: 'sha256:p',
        resourceHash: 'sha256:r',
        policyVersion: 'policy-lab:v1',
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      nodes: [
        {
          nodeId: 'A',
          actionType: 'PLAN_EDIT',
          handlerId: 'check.budget',
          input: {},
          riskLevel: 'LOW',
          idempotencyKey: 'idem-a',
        },
        {
          nodeId: 'B',
          actionType: 'BOOKING_COMMIT',
          handlerId: 'booking.commit',
          input: {},
          riskLevel: 'LOW',
          idempotencyKey: 'idem-b',
        },
      ],
      edges: [
        { from: 'A', to: 'B', dependencyType: 'MUST_COMPLETE_BEFORE' },
        { from: 'B', to: 'A', dependencyType: 'MUST_COMPLETE_BEFORE' },
      ],
    };
    const result = service.compile(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('GRAPH_CYCLE_ERROR'))).toBe(true);
  });

  it('rejects irreversible non-terminal node', () => {
    const graph: ActionGraph = {
      graphId: 'graph_irrev',
      decisionId: 'd2',
      createdAt: new Date().toISOString(),
      contextSignature: {
        signatureId: 'sha256:sig',
        physicalHash: 'sha256:p',
        resourceHash: 'sha256:r',
        policyVersion: 'policy-lab:v1',
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      nodes: [
        {
          nodeId: 'N1',
          actionType: 'NOTIFICATION_SEND',
          handlerId: 'notify.user',
          input: {},
          riskLevel: 'LOW',
          idempotencyKey: 'idem-1',
          isIrreversible: true,
        },
        {
          nodeId: 'N2',
          actionType: 'PLAN_EDIT',
          handlerId: 'plan.mutate',
          input: {},
          riskLevel: 'LOW',
          idempotencyKey: 'idem-2',
        },
      ],
      edges: [{ from: 'N1', to: 'N2', dependencyType: 'MUST_COMPLETE_BEFORE' }],
    };
    const result = service.compile(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('IRREVERSIBLE_NOT_TERMINAL'))).toBe(true);
  });
});
