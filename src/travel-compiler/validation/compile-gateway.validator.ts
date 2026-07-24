import { randomUUID } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import type { ConstraintEvaluationGatewayService } from '../../decision-runtime/constraints/constraint-evaluation.gateway.service';
import type { ConstraintAssertion } from '../../decision-runtime/constraints/contracts/constraint-assertion';
import type { CompileIssue } from '../contracts/compilation-result.types';
import type {
  CanonicalTravelGraph,
  TravelGraphConstraintRef,
} from '../contracts/canonical-travel-graph.types';
import { buildTripWorldStateFromGraph } from '../projection/build-world-state-from-graph.util';
import { graphToTripPlan } from '../projection/graph-to-trip-plan.util';

export function isTravelCompilerGatewayEnabled(config?: ConfigService): boolean {
  const raw =
    config?.get<string>('TRAVEL_COMPILER_GATEWAY_ENABLED') ??
    process.env.TRAVEL_COMPILER_GATEWAY_ENABLED ??
    'true';
  return String(raw).trim().toLowerCase() !== 'false';
}

export async function evaluateCompileConstraintGateway(input: {
  graph: CanonicalTravelGraph;
  gateway: ConstraintEvaluationGatewayService;
  tripId?: string;
  countryCode: string;
}): Promise<{
  warnings: CompileIssue[];
  errors: CompileIssue[];
  constraints: TravelGraphConstraintRef[];
  overallStatus?: string;
}> {
  const warnings: CompileIssue[] = [];
  const errors: CompileIssue[] = [];
  const constraints: TravelGraphConstraintRef[] = [];

  const tripId = input.tripId ?? `compile_${input.graph.compileId.slice(0, 8)}`;
  const plan = graphToTripPlan(input.graph);
  const worldState = buildTripWorldStateFromGraph(input.graph);

  const report = await input.gateway.evaluatePlan({
    tripId,
    plan,
    worldState,
    countryCode: input.countryCode,
    evaluationMode: 'PLAN_VERIFY',
    skipLegacyChecker: true,
    packContext: {
      country: input.countryCode,
      semanticKey: 'compile_time_graph',
      facts: { source: 'travel_compiler', graphId: input.graph.graphId },
      candidateUsesRoute: plan.days.some((d) => d.timeSlots.length > 1),
    },
  });

  for (const assertion of report.assertions) {
    const ref = assertionToGraphConstraint(assertion);
    constraints.push(ref);

    const issue = assertionToCompileIssue(assertion, report.overallStatus);
    if (assertion.status === 'BLOCK') {
      errors.push(issue);
    } else if (
      assertion.status === 'WARNING' ||
      assertion.status === 'REQUIRES_VERIFICATION'
    ) {
      warnings.push(issue);
    }
  }

  if (report.overallStatus === 'INFEASIBLE') {
    warnings.push({
      issueId: randomUUID(),
      severity: 'warning',
      phase: 'VALIDATION',
      code: 'GATEWAY_INFEASIBLE',
      message: `Constraint Gateway: ${report.overallStatus}`,
      metadata: { evaluationId: report.evaluationId },
    });
  }

  return { warnings, errors, constraints, overallStatus: report.overallStatus };
}

function assertionToGraphConstraint(assertion: ConstraintAssertion): TravelGraphConstraintRef {
  return {
    constraintId: assertion.assertionId,
    source: 'travel_decision_contract',
    severity: assertion.status === 'BLOCK' ? 'hard' : 'soft',
    code: assertion.reasonCode ?? assertion.constraintType,
    message: assertion.message,
    affectedNodeIds: assertion.scope.activityId ? [assertion.scope.activityId] : undefined,
    evidenceRefs: assertion.evidenceRefs,
  };
}

function assertionToCompileIssue(
  assertion: ConstraintAssertion,
  overallStatus?: string,
): CompileIssue {
  return {
    issueId: randomUUID(),
    severity: assertion.status === 'BLOCK' ? 'error' : 'warning',
    phase: 'VALIDATION',
    code: assertion.reasonCode ?? 'GATEWAY_ASSERTION',
    message: assertion.message,
    nodeId: assertion.scope.activityId,
    metadata: { constraintType: assertion.constraintType, overallStatus },
  };
}
