/**
 * DecisionCognitionSlice → tripnara/cognition_four_layer@v1 投影。
 */

import type { DecisionCognitionSlice } from './decision-cognition.types';
import type {
  CognitionFourLayerView,
  ConstraintLayer,
} from './cognition-four-layer.types';
import { COGNITION_FOUR_LAYER_SCHEMA } from './cognition-four-layer.types';

export type {
  CognitionFourLayerView,
  ConstraintLayer,
} from './cognition-four-layer.types';
export { COGNITION_FOUR_LAYER_SCHEMA } from './cognition-four-layer.types';

/**
 * 内部 Gate / verification → 对外约束分层。
 */
export function mapToConstraintLayer(input: {
  gateDisposition?: string | null;
  verificationStatus?: string | null;
  problemType?: string | null;
  urgency?: string | null;
  freshnessStatus?: string | null;
  hasHardConflict?: boolean;
}): ConstraintLayer {
  if (
    input.hasHardConflict ||
    input.gateDisposition === 'REJECT' ||
    input.verificationStatus === 'BLOCK'
  ) {
    return 'BLOCK';
  }
  if (
    input.gateDisposition === 'NEED_CONFIRM' ||
    input.verificationStatus === 'NEED_CONFIRM'
  ) {
    return 'MUST_CONFIRM';
  }
  if (input.gateDisposition === 'SUGGEST_REPLACE') {
    return 'SUGGEST_REPLACE';
  }
  if (
    input.problemType === 'OPPORTUNITY' ||
    input.gateDisposition === 'ALLOW'
  ) {
    // 新鲜度未到决策窗 / 仅软优化
    if (
      input.freshnessStatus === 'STALE' ||
      input.freshnessStatus === 'UNKNOWN' ||
      input.urgency === 'LATER' ||
      input.urgency === 'BEFORE_TRIP'
    ) {
      return 'WATCH';
    }
    if (input.problemType === 'OPPORTUNITY' && input.urgency === 'LATER') {
      return 'WATCH';
    }
    return input.problemType === 'RISK' || input.problemType === 'PREFERENCE_CONFLICT'
      ? 'OPTIMIZE'
      : input.gateDisposition === 'ALLOW'
        ? 'WATCH'
        : 'OPTIMIZE';
  }
  if (
    input.freshnessStatus === 'STALE' ||
    input.freshnessStatus === 'DEGRADED' ||
    input.urgency === 'LATER'
  ) {
    return 'WATCH';
  }
  if (input.problemType === 'RISK' || input.problemType === 'PREFERENCE_CONFLICT') {
    return 'OPTIMIZE';
  }
  return 'WATCH';
}

function scoreTradeoffLabel(
  key: string,
  value: number | undefined,
): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return `${key}=${Math.round(value * 100) / 100}`;
}

/**
 * 从认知切片投影四层验收对象。
 */
export function buildCognitionFourLayerView(
  cognition: DecisionCognitionSlice | undefined,
): CognitionFourLayerView | undefined {
  if (!cognition) return undefined;

  const reality = cognition.realitySnapshot;
  const rel = cognition.relationGraph;
  const focus = cognition.focusedProblem;
  const future = cognition.futureSimulation;

  const knownFacts: string[] = [];
  if (reality) {
    for (const e of reality.evidence ?? []) {
      knownFacts.push(e.detail ?? e.id);
    }
    if (reality.tripState?.destination != null) {
      knownFacts.push(`destination:${String(reality.tripState.destination)}`);
    }
    if (reality.tripState?.vehicle != null) {
      knownFacts.push('vehicle:observed');
    }
    if (reality.worldState?.roadStatus != null) {
      knownFacts.push('roadStatus:observed');
    }
  }

  const missingContext = (reality?.unknowns ?? []).map(
    (u) => `${u.blocking ? '[blocking] ' : ''}${u.question}`,
  );

  const conflicts = (reality?.conflicts ?? []).map(
    (c) => `[${c.severity ?? 'SOFT'}:${c.code}] ${c.summary}`,
  );

  const freshness: string[] = [];
  if (reality?.freshness) {
    freshness.push(`status=${reality.freshness.status}`);
    for (const r of reality.freshness.reasons ?? []) freshness.push(r);
    if (reality.freshness.maxAgeSec != null) {
      freshness.push(`maxAgeSec=${Math.round(reality.freshness.maxAgeSec)}`);
    }
  }

  const causalLinks = (rel?.edges ?? [])
    .filter((e) => e.relation === 'CAUSES' || e.relation === 'AMPLIFIES')
    .map((e) => `${e.from} -[${e.relation}]-> ${e.to}${e.detail ? ` (${e.detail})` : ''}`);

  const dependencyLinks = (rel?.edges ?? [])
    .filter((e) => e.relation === 'DEPENDS_ON' || e.relation === 'CONSTRAINS')
    .map((e) => `${e.from} -[${e.relation}]-> ${e.to}`);

  const affectedEntities = (rel?.nodes ?? []).map(
    (n) => `${n.id}${n.label ? `:${n.label}` : ''}`,
  );

  const propagation = (rel?.impactChains ?? []).map((c) =>
    c.steps.length ? c.steps.join(' → ') : c.summary,
  );

  const hasHardConflict = (reality?.conflicts ?? []).some((c) => c.severity === 'HARD');
  const constraintLayer = focus
    ? mapToConstraintLayer({
        gateDisposition: focus.gateDisposition,
        verificationStatus: future?.verification.status,
        problemType: focus.type,
        urgency: focus.urgency,
        freshnessStatus: reality?.freshness.status,
        hasHardConflict,
      })
    : future?.verification.status === 'BLOCK'
      ? 'BLOCK'
      : future?.verification.status === 'NEED_CONFIRM'
        ? 'MUST_CONFIRM'
        : '';

  const scenarios = [
    future?.baseline?.label ? `baseline:${future.baseline.label}` : 'baseline:current',
    ...(future?.alternatives ?? []).map((a) => `${a.id}:${a.label}`),
  ];

  const tradeoffs = [
    scoreTradeoffLabel('safety', future?.comparison?.safety),
    scoreTradeoffLabel('feasibility', future?.comparison?.feasibility),
    scoreTradeoffLabel('experience', future?.comparison?.experience),
    scoreTradeoffLabel('fatigue', future?.comparison?.fatigue),
    scoreTradeoffLabel('cost', future?.comparison?.cost),
    scoreTradeoffLabel('resilience', future?.comparison?.resilience),
  ].filter(Boolean) as string[];

  const residualRisks = [
    ...(future?.baseline?.predictedRisks ?? []),
    ...(future?.verification.issues ?? []).map(
      (i) => i.detail ?? i.code ?? i.class ?? 'issue',
    ),
  ];

  const requiresConfirmation =
    future?.requiresConfirmation === true ||
    (future?.verification.status != null && future.verification.status !== 'PASS') ||
    constraintLayer === 'MUST_CONFIRM' ||
    constraintLayer === 'BLOCK';

  const actionDeadline =
    focus?.actionDeadline ??
    future?.predictionWindow?.interventionDeadline ??
    null;

  return {
    schema: COGNITION_FOUR_LAYER_SCHEMA,
    reality: {
      knownFacts: knownFacts.slice(0, 40),
      missingContext: missingContext.slice(0, 20),
      conflicts: conflicts.slice(0, 20),
      freshness,
      currentState: reality?.currentState ?? (knownFacts.length ? '现实快照已收敛' : '现实证据不足'),
    },
    relationships: {
      causalLinks: causalLinks.slice(0, 20),
      dependencyLinks: dependencyLinks.slice(0, 20),
      affectedEntities: affectedEntities.slice(0, 30),
      propagation: propagation.slice(0, 12),
    },
    focus: {
      primaryProblem: focus?.question ?? '',
      priority: focus?.urgency ?? '',
      decisionRequired:
        constraintLayer === 'MUST_CONFIRM' ||
        constraintLayer === 'BLOCK' ||
        focus?.gateDisposition === 'NEED_CONFIRM' ||
        focus?.gateDisposition === 'REJECT',
      reason: focus?.whyThisProblem ?? '',
      actionDeadline,
      constraintLayer: constraintLayer || '',
    },
    simulation: {
      scenarios,
      recommendedScenario: future?.recommendedAlternativeId ?? future?.baseline?.id ?? '',
      tradeoffs,
      residualRisks: residualRisks.slice(0, 20),
      requiresConfirmation,
    },
  };
}
