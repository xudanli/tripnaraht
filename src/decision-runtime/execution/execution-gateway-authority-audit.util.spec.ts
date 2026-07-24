import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../agent/dto/route-and-run.dto';
import {
  recordConstraintGatewayIngressFromReport,
  runWithConstraintGatewayIngressContext,
} from '../../decision-runtime/constraints/constraint-gateway-ingress-audit.util';
import {
  applyGatewayAuthorityAuditToResponse,
  buildGatewayAuthorityEntryContext,
  resolveGatewayAuthorityConclusion,
} from './execution-gateway-authority-audit.util';

function baseResponse(): RouteAndRunResponseDto {
  return {
    request_id: 'gw-audit',
    route: { route: 'SYSTEM1_RAG', confidence: 0.9, reasons: [] },
    result: { status: 'OK', answer_text: 'ok', payload: {} },
    explain: { decision_log: [] },
    observability: { mode_final: 'CLAUDE_SM' },
  };
}

describe('execution-gateway-authority-audit.util', () => {
  it('marks read-only trip QA as READ_ONLY conclusion', () => {
    const request = {
      request_id: 'gw-read',
      user_id: 'u1',
      trip_id: 'trip_1',
      message: '这条路线安全吗？',
      options: {},
    } as RouteAndRunRequestDto;

    const entry = buildGatewayAuthorityEntryContext(request);
    expect(entry.readOnlyPath).toBe(true);
    expect(entry.mutationIntent).toBe(false);

    const response = applyGatewayAuthorityAuditToResponse({
      request,
      response: baseResponse(),
      entryContext: entry,
    });

    const audit = (response.observability as any)?.authority_audit_v1;
    const gateway = (response.observability as any)?.authority_gateway_v1;
    expect(audit?.mutationIntent).toBe(false);
    expect(gateway?.readOnlyPath).toBe(true);
    expect(gateway?.conclusion).toBe('READ_ONLY');
  });

  it('marks trip planning write path as BYPASS when no adapter audit present', () => {
    const request = {
      request_id: 'gw-write',
      user_id: 'u1',
      trip_id: 'trip_1',
      message: '帮我调整第三天的行程',
      options: { client_dso_version: 12 },
    } as RouteAndRunRequestDto;

    const entry = buildGatewayAuthorityEntryContext(request);
    expect(entry.mutationIntent).toBe(true);

    const response = applyGatewayAuthorityAuditToResponse({
      request,
      response: {
        ...baseResponse(),
        result: {
          status: 'OK',
          answer_text: 'draft',
          payload: { timeline: [{ day: 3, items: [] }] },
        },
      },
      entryContext: entry,
    });

    const audit = (response.observability as any)?.authority_audit_v1;
    const gateway = (response.observability as any)?.authority_gateway_v1;
    expect(audit?.mutationIntent).toBe(true);
    expect(audit?.mutationAttempted).toBe(true);
    expect(audit?.mutationCommitted).toBe(false);
    expect(gateway?.conclusion).toBe('BYPASS');
    expect(audit?.bypassDetected).toBe(true);
    expect((response.observability as any)?.result_status_v2?.schemaId).toBe(
      'tripnara.route_and_run.status@v2',
    );
  });

  it('merges existing adapter authority audit from legacy guard', () => {
    const request = {
      request_id: 'gw-legacy',
      user_id: 'u1',
      trip_id: 'trip_1',
      message: '调整',
      options: { client_dso_version: 12 },
    } as RouteAndRunRequestDto;

    const entry = buildGatewayAuthorityEntryContext(request);
    const response = applyGatewayAuthorityAuditToResponse({
      request,
      response: {
        ...baseResponse(),
        observability: {
          mode_final: 'LEGACY',
          authority_audit_v1: {
            schemaId: 'tripnara.authority_audit@v1',
            routeClass: 'LEGACY_FALLBACK',
            orchestrationMode: 'LEGACY',
            mutationIntent: true,
            mutationAttempted: true,
            mutationCommitted: false,
            constraintGateway: {
              required: true,
              invoked: true,
              evaluationId: 'eval_1',
              verdict: 'BLOCK',
            },
            decisionLedger: { required: true, recorded: false },
            tripVersion: { expected: 12 },
            writeGuard: { required: true, invoked: true, verdict: 'DENY' },
            evidence: { freshness: 'CURRENT', snapshotId: 'ev_1' },
            bypassDetected: true,
            reasonCodes: ['HARD_CONSTRAINT_BLOCK'],
          },
        },
        result: {
          status: 'OK',
          answer_text: 'blocked',
          payload: {
            timeline: [{ day: 3, items: [] }],
            canonical_mutation_guard: { canCommit: false, reasonCodes: ['HARD_CONSTRAINT_BLOCK'] },
          },
        },
      },
      entryContext: entry,
    });

    const audit = (response.observability as any)?.authority_audit_v1;
    expect(audit?.constraintGateway.invoked).toBe(true);
    expect(audit?.constraintGateway.verdict).toBe('BLOCK');
    expect(audit?.writeGuard.verdict).toBe('DENY');
    expect(audit?.reasonCodes).toEqual(expect.arrayContaining(['HARD_CONSTRAINT_BLOCK']));
  });

  it('resolveGatewayAuthorityConclusion maps bypass correctly', () => {
    expect(
      resolveGatewayAuthorityConclusion({
        mutationIntent: true,
        readOnlyPath: false,
        bypassDetected: true,
        mutationCommitted: false,
        constraintInvoked: false,
      }),
    ).toBe('BYPASS');
  });

  it('merges SM VERIFY ingress evaluationId into authority audit', () => {
    const request = {
      request_id: 'gw-ingress',
      user_id: 'u1',
      trip_id: 'trip_1',
      message: '调整行程',
      options: { client_dso_version: 12 },
    } as RouteAndRunRequestDto;

    const entry = buildGatewayAuthorityEntryContext(request);

    const response = runWithConstraintGatewayIngressContext(() => {
      recordConstraintGatewayIngressFromReport(
        {
          schemaId: 'tripnara.canonical_constraint_report@v1',
          evaluationId: 'eval_sm_verify_1',
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
          overallStatus: 'INFEASIBLE',
          degraded: false,
          degradedReasons: [],
          evaluationMode: 'PLAN_VERIFY',
        },
        'VERIFY',
      );

      return applyGatewayAuthorityAuditToResponse({
        request,
        response: {
          ...baseResponse(),
          result: {
            status: 'OK',
            answer_text: 'draft',
            payload: { timeline: [{ day: 3, items: [] }] },
          },
        },
        entryContext: entry,
      });
    });

    const audit = (response.observability as any)?.authority_audit_v1;
    const ingress = (response.observability as any)?.constraint_gateway_ingress_v1;
    expect(audit?.constraintGateway.invoked).toBe(true);
    expect(audit?.constraintGateway.evaluationId).toBe('eval_sm_verify_1');
    expect(audit?.constraintGateway.verdict).toBe('BLOCK');
    expect(ingress?.primary?.phase).toBe('VERIFY');
  });
});
