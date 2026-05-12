import type {
  AgentState,
  EmergencePattern,
  EnvironmentState,
  PostSystemField,
  StableFlow,
} from './post-system-field.types';

function boundsCenter(env: EnvironmentState): number[] {
  const { min, max } = env.bounds;
  return min.map((lo, i) => (lo + max[i]) / 2);
}

function clampVec(
  from: number[],
  delta: number[],
  maxLen: number,
): number[] {
  const mag = Math.sqrt(delta.reduce((s, d) => s + d * d, 0));
  if (mag <= maxLen || mag === 0) {
    return from.map((x, i) => x + delta[i]);
  }
  const scale = maxLen / mag;
  return from.map((x, i) => x + delta[i] * scale);
}

function distance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
}

export function applyLocalConstraints(field: PostSystemField): PostSystemField {
  const center = boundsCenter(field.environment);
  const span = Math.max(
    1e-9,
    distance(field.environment.bounds.min, field.environment.bounds.max),
  );
  const agents = field.agents.map(agent => {
    const dist = distance(agent.position, center);
    const stress = Math.min(1, dist / span);
    return { ...agent, stress };
  });

  return {
    ...field,
    environment: {
      ...field.environment,
      tick: field.environment.tick + 1,
    },
    agents,
  };
}

export function relaxTowardsConstraints(field: PostSystemField): AgentState[] {
  const center = boundsCenter(field.environment);
  const { relaxationRate, maxDisplacementPerStep } = field.constraintField;

  return field.agents.map(agent => {
    const desiredDelta = center.map((c, i) => relaxationRate * (c - agent.position[i]));
    const nextPos = clampVec(agent.position, desiredDelta, maxDisplacementPerStep);
    const dist = distance(nextPos, center);
    const span = Math.max(
      1e-9,
      distance(field.environment.bounds.min, field.environment.bounds.max),
    );
    const stress = Math.min(1, dist / span);
    return { ...agent, position: nextPos, stress };
  });
}

function meanPairwiseDistance(positions: number[][]): number {
  if (positions.length < 2) {
    return 0;
  }
  let sum = 0;
  let n = 0;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      sum += distance(positions[i], positions[j]);
      n++;
    }
  }
  return sum / n;
}

export function detectStableFlows(agents: AgentState[]): StableFlow[] {
  if (agents.length === 0) {
    return [];
  }

  const stresses = agents.map(a => a.stress);
  const meanStress = stresses.reduce((s, x) => s + x, 0) / stresses.length;
  const positions = agents.map(a => a.position);

  const pairwise = meanPairwiseDistance(positions);
  /** Cohesion from relative spread — avoids centroid degeneracy for n = 2. */
  const cohesion = Math.min(1, 1 / (1 + pairwise * 8));

  const stabilityScore = Math.min(
    1,
    cohesion * (1 - meanStress) + (1 - meanStress) * 0.25,
  );

  const selfMaintaining = meanStress < 0.12 && stabilityScore > 0.55;

  return [
    {
      agentIds: agents.map(a => a.id),
      stabilityScore,
      selfMaintaining,
    },
  ];
}

export function detectEmergence(field: PostSystemField): EmergencePattern[] {
  return detectStableFlows(field.agents)
    .filter(flow => flow.selfMaintaining === true)
    .map(flow => ({
      type: 'natural_policy' as const,
      stability: flow.stabilityScore,
    }));
}

export function step(field: PostSystemField): PostSystemField {
  const afterConstraints = applyLocalConstraints(field);
  const agents = relaxTowardsConstraints({ ...afterConstraints, agents: afterConstraints.agents });
  const next: PostSystemField = {
    ...afterConstraints,
    agents,
    emergencePatterns: detectEmergence({ ...afterConstraints, agents }),
  };
  return next;
}
