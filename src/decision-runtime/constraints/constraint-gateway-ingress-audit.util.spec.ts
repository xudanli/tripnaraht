import {
  buildConstraintGatewayIngressSnapshot,
  constraintVerdictFromReport,
  recordConstraintGatewayIngressFromReport,
  resetConstraintGatewayIngressForTests,
  resolvePrimaryConstraintGatewayIngress,
  runWithConstraintGatewayIngressContext,
} from './constraint-gateway-ingress-audit.util';

describe('constraint-gateway-ingress-audit.util', () => {
  afterEach(() => {
    resetConstraintGatewayIngressForTests();
  });

  it('records ingress within request scope and prefers VERIFY phase', () => {
    runWithConstraintGatewayIngressContext(() => {
      recordConstraintGatewayIngressFromReport(
        {
          schemaId: 'tripnara.canonical_constraint_report@v1',
          evaluationId: 'eval_candidate',
          tripId: 'trip_1',
          evaluatedAt: '2026-07-03T00:00:00.000Z',
          assertions: [],
          completeness: {
            roads: 'MISSING',
            weather: 'MISSING',
            hazards: 'MISSING',
            ferries: 'MISSING',
            openingHours: 'MISSING',
          },
          overallStatus: 'FEASIBLE',
          degraded: false,
          degradedReasons: [],
          evaluationMode: 'CANDIDATE_FILTER',
        },
        'CANDIDATE_FILTER',
      );
      recordConstraintGatewayIngressFromReport(
        {
          schemaId: 'tripnara.canonical_constraint_report@v1',
          evaluationId: 'eval_verify',
          tripId: 'trip_1',
          evaluatedAt: '2026-07-03T00:00:01.000Z',
          assertions: [],
          completeness: {
            roads: 'MISSING',
            weather: 'MISSING',
            hazards: 'MISSING',
            ferries: 'MISSING',
            openingHours: 'MISSING',
          },
          overallStatus: 'INFEASIBLE',
          degraded: false,
          degradedReasons: [],
          evaluationMode: 'PLAN_VERIFY',
        },
        'VERIFY',
      );

      const primary = resolvePrimaryConstraintGatewayIngress();
      expect(primary?.evaluationId).toBe('eval_verify');
      expect(primary?.phase).toBe('VERIFY');
      expect(primary?.verdict).toBe('BLOCK');

      const snapshot = buildConstraintGatewayIngressSnapshot();
      expect(snapshot.records).toHaveLength(2);
    });
  });

  it('maps report overallStatus to ingress verdict', () => {
    expect(
      constraintVerdictFromReport({ overallStatus: 'CONDITIONALLY_FEASIBLE' }),
    ).toBe('WARN');
  });
});
