/**
 * Derives ranked goals from memory (P13), abstract constraint pressure, and environment snapshots.
 */

import { createHash } from 'crypto';
import type { ExecutionMemoryGraph } from '../execution-memory/execution-memory.types';
import type { ExecutionGoal, ExecutionGoalSource, ExecutionGoalType } from './execution-goal.types';

export interface ConstraintPressureMetrics {
  /** Fraction of road-unfriendly outcomes / legs — caller-defined [0,1]. */
  roadFailureRate?: number;
  /** Aggregated aurora opportunity — caller-defined [0,1]. */
  auroraOpportunityScore?: number;
}

export interface GoalSignalSnapshot {
  auroraOpportunityScore?: number;
  weatherStress?: number;
}

export interface GoalGenerationContext {
  memory?: ExecutionMemoryGraph;
  constraints?: ConstraintPressureMetrics;
  signals?: GoalSignalSnapshot;
}

function stableGoalId(parts: string): string {
  return createHash('sha256').update(parts, 'utf8').digest('hex').slice(0, 20);
}

function makeGoal(
  type: ExecutionGoalType,
  priority: number,
  source: ExecutionGoalSource,
  triggerContext: unknown,
): ExecutionGoal {
  return {
    id: stableGoalId(`${type}|${source}|${JSON.stringify(triggerContext)}`),
    type,
    priority,
    source,
    triggerContext,
  };
}

export function deriveFromMemory(memory?: ExecutionMemoryGraph): ExecutionGoal[] {
  if (!memory?.events?.length) {
    return [];
  }

  const goals: ExecutionGoal[] = [];
  let maxTriggers = 0;
  let maxRegret = 0;

  for (const e of memory.events) {
    if (e.type === 'NEPTUNE_DECISION') {
      const p = e.payload as { triggerCount?: number } | null;
      maxTriggers = Math.max(maxTriggers, typeof p?.triggerCount === 'number' ? p.triggerCount : 0);
    }
    if (e.type === 'SIMULATION_RUN') {
      const p = e.payload as { regretByVariantId?: Record<string, number> } | null;
      const r = p?.regretByVariantId;
      if (r) {
        for (const v of Object.values(r)) {
          maxRegret = Math.max(maxRegret, v);
        }
      }
    }
  }

  if (maxTriggers >= 3) {
    goals.push(
      makeGoal('REDUCE_RISK', 0.82, 'MEMORY', {
        reason: 'high_neptune_triggers',
        maxTriggers,
      }),
    );
  }

  if (maxRegret >= 0.35) {
    goals.push(
      makeGoal('IMPROVE_STABILITY', 0.78, 'MEMORY', {
        reason: 'high_simulation_regret',
        maxRegret,
      }),
    );
  }

  return goals;
}

export function deriveFromConstraintStress(constraints?: ConstraintPressureMetrics): ExecutionGoal[] {
  if (!constraints) {
    return [];
  }
  const goals: ExecutionGoal[] = [];

  if (typeof constraints.roadFailureRate === 'number' && constraints.roadFailureRate > 0.3) {
    goals.push(
      makeGoal('REDUCE_RISK', 0.9, 'CONSTRAINT_PRESSURE', {
        roadFailureRate: constraints.roadFailureRate,
      }),
    );
  }

  if (typeof constraints.auroraOpportunityScore === 'number' && constraints.auroraOpportunityScore > 0.8) {
    goals.push(
      makeGoal('EXPLORE_AURORA', 0.95, 'CONSTRAINT_PRESSURE', {
        auroraOpportunityScore: constraints.auroraOpportunityScore,
      }),
    );
  }

  return goals;
}

export function deriveFromSignals(signals?: GoalSignalSnapshot): ExecutionGoal[] {
  if (!signals) {
    return [];
  }
  const goals: ExecutionGoal[] = [];

  if (typeof signals.auroraOpportunityScore === 'number' && signals.auroraOpportunityScore > 0.75) {
    goals.push(
      makeGoal('EXPLORE_AURORA', 0.88, 'ENVIRONMENT_SIGNAL', {
        auroraOpportunityScore: signals.auroraOpportunityScore,
      }),
    );
  }

  if (typeof signals.weatherStress === 'number' && signals.weatherStress > 0.65) {
    goals.push(
      makeGoal('REDUCE_RISK', 0.84, 'ENVIRONMENT_SIGNAL', {
        weatherStress: signals.weatherStress,
      }),
    );
  }

  if (
    typeof signals.weatherStress === 'number' &&
    signals.weatherStress < 0.25 &&
    typeof signals.auroraOpportunityScore === 'number' &&
    signals.auroraOpportunityScore < 0.4
  ) {
    goals.push(
      makeGoal('OPTIMIZE_EXPERIENCE', 0.72, 'ENVIRONMENT_SIGNAL', {
        weatherStress: signals.weatherStress,
      }),
    );
  }

  return goals;
}

export function rankGoals(goals: ExecutionGoal[]): ExecutionGoal[] {
  const priorityOrder: ExecutionGoalType[] = [
    'EXPLORE_AURORA',
    'REDUCE_RISK',
    'IMPROVE_STABILITY',
    'OPTIMIZE_EXPERIENCE',
    'MINIMIZE_COST',
  ];

  return [...goals].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type);
  });
}

export function generateExecutionGoals(ctx: GoalGenerationContext): ExecutionGoal[] {
  const goals: ExecutionGoal[] = [
    ...deriveFromMemory(ctx.memory),
    ...deriveFromConstraintStress(ctx.constraints),
    ...deriveFromSignals(ctx.signals),
  ];

  const dedup = new Map<string, ExecutionGoal>();
  for (const g of goals) {
    const key = `${g.type}|${g.source}`;
    const prev = dedup.get(key);
    if (!prev || g.priority > prev.priority) {
      dedup.set(key, g);
    }
  }

  return rankGoals([...dedup.values()]);
}
