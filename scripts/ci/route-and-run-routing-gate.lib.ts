/**
 * route_and_run 产品路由 CI gate — Golden protocol + fork-aware production drift.
 */

import type { RouteAndRunGoldenEvalFixture } from '../../src/agent/routing/route-and-run-routing-protocol.types';
import { ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES } from '../../src/agent/routing/route-and-run-golden-eval-fixtures';
import { classifyRouteAndRunRouteClass } from '../../src/agent/routing/route-and-run-route-class.util';
import {
  analyzeRouteClassDrift,
  inferProductionRouteClassProxy,
} from '../../src/agent/routing/route-and-run-route-class-projection.util';
import {
  applyRouteClassForkInPlace,
  applyRouteClassForkPolicyOverrides,
  readRouteClassForkFromRequest,
} from '../../src/agent/routing/route-and-run-route-class-fork.util';
import { signalsFromRequest } from '../../src/agent/utils/orchestration-signals.util';
import { routePolicy } from '../../src/agent/utils/orchestration-policy.util';
import type { RouteAndRunRequestDto } from '../../src/agent/dto/route-and-run.dto';

export interface RouteAndRunGoldenEvalRow {
  id: string;
  label: string;
  pass: boolean;
  expectedRouteClass: string;
  actualRouteClass: string;
  deepResearchV71: string;
  expectedDeepResearchV71: string;
}

export interface RouteClassDriftRow {
  id: string;
  label: string;
  isMatch: boolean;
  mismatchType: string;
  goldenAlignsProtocol: boolean;
  protocolRouteClass: string;
  productionRouteClass: string;
}

export interface RouteAndRunRoutingGateResult {
  schemaId: 'tripnara.route_and_run_routing_gate@v1';
  version: 1;
  generated_at: string;
  fixture_count: number;
  golden: {
    pass_count: number;
    fail_count: number;
    rows: RouteAndRunGoldenEvalRow[];
  };
  drift: {
    match_count: number;
    drift_count: number;
    protocol_golden_pass: number;
    confusion: Record<string, number>;
    rows: RouteClassDriftRow[];
  };
  ok: boolean;
}

function cloneRequest(request: RouteAndRunRequestDto): RouteAndRunRequestDto {
  return structuredClone(request);
}

function evaluateFixture(fx: RouteAndRunGoldenEvalFixture): {
  golden: RouteAndRunGoldenEvalRow;
  drift: RouteClassDriftRow;
} {
  const req = cloneRequest(fx.request);
  applyRouteClassForkInPlace(req);

  const protocol = classifyRouteAndRunRouteClass(fx.request);
  const signals = signalsFromRequest(req);
  let decision = routePolicy(process.env, req.options, signals);
  decision = applyRouteClassForkPolicyOverrides(decision, readRouteClassForkFromRequest(req));
  const production = inferProductionRouteClassProxy(req, signals, decision);
  const mismatchType = analyzeRouteClassDrift(protocol.routeClass, production.routeClass);

  const goldenPass =
    protocol.routeClass === fx.expected.routeClass &&
    protocol.needsClarificationBeforeWrite === fx.expected.needsClarificationBeforeWrite &&
    protocol.allowsDirectItineraryWrite === fx.expected.allowsDirectItineraryWrite &&
    protocol.deepResearchV71 === fx.expected.deepResearchV71;

  return {
    golden: {
      id: fx.id,
      label: fx.label,
      pass: goldenPass,
      expectedRouteClass: fx.expected.routeClass,
      actualRouteClass: protocol.routeClass,
      deepResearchV71: protocol.deepResearchV71,
      expectedDeepResearchV71: fx.expected.deepResearchV71,
    },
    drift: {
      id: fx.id,
      label: fx.label,
      isMatch: mismatchType === 'NONE',
      mismatchType,
      goldenAlignsProtocol: protocol.routeClass === fx.expected.routeClass,
      protocolRouteClass: protocol.routeClass,
      productionRouteClass: production.routeClass,
    },
  };
}

export function runRouteAndRunRoutingGate(
  fixtures: RouteAndRunGoldenEvalFixture[] = ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES,
): RouteAndRunRoutingGateResult {
  const goldenRows: RouteAndRunGoldenEvalRow[] = [];
  const driftRows: RouteClassDriftRow[] = [];
  const confusion: Record<string, number> = {
    match: 0,
    OVER_DEPTH: 0,
    UNDER_DEPTH: 0,
    CLASS_MISMATCH: 0,
  };

  for (const fx of fixtures) {
    const { golden, drift } = evaluateFixture(fx);
    goldenRows.push(golden);
    driftRows.push(drift);
    if (drift.isMatch) {
      confusion.match += 1;
    } else {
      confusion[drift.mismatchType] = (confusion[drift.mismatchType] ?? 0) + 1;
    }
  }

  const goldenPassCount = goldenRows.filter((r) => r.pass).length;
  const driftMatchCount = driftRows.filter((r) => r.isMatch).length;
  const protocolGoldenPass = driftRows.filter((r) => r.goldenAlignsProtocol).length;

  const ok =
    goldenPassCount === fixtures.length &&
    driftMatchCount === fixtures.length &&
    protocolGoldenPass === fixtures.length;

  return {
    schemaId: 'tripnara.route_and_run_routing_gate@v1',
    version: 1,
    generated_at: new Date().toISOString(),
    fixture_count: fixtures.length,
    golden: {
      pass_count: goldenPassCount,
      fail_count: fixtures.length - goldenPassCount,
      rows: goldenRows,
    },
    drift: {
      match_count: driftMatchCount,
      drift_count: fixtures.length - driftMatchCount,
      protocol_golden_pass: protocolGoldenPass,
      confusion,
      rows: driftRows,
    },
    ok,
  };
}
