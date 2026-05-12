import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { ExecutionKernel } from '../contracts/execution-semantic-field.types';
import type {
  CognitiveStateVector,
  CognitiveTrajectory,
  ECPSVectorFieldSample,
  ExecutionMetricTensor,
  InformationGeometrySnapshot,
} from '../contracts/cognitive-geometry.types';
import {
  IGL_SCHEMA_VERSION,
  IGL_STATE_DIM,
} from '../contracts/cognitive-geometry.types';
import type { ExecutionTrace, ExecutionTraceStep } from '../contracts/execution-trace.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function kernelAngle(kernel: ExecutionKernel): number {
  const angles: Record<ExecutionKernel, number> = {
    REFLEX_KERNEL: 0,
    LIGHTWEIGHT_KERNEL: Math.PI / 2,
    REASONING_KERNEL: Math.PI,
    WORKFLOW_KERNEL: (3 * Math.PI) / 2,
  };
  return angles[kernel];
}

function toolDepthScalar(d: ExecutionDecision['toolDepth']): number {
  switch (d) {
    case 'NONE':
      return 0;
    case 'LOW':
      return 0.33;
    case 'MEDIUM':
      return 0.66;
    case 'HIGH':
      return 1;
    default: {
      const _x: never = d;
      return _x;
    }
  }
}

function modeScalar(m: ExecutionDecision['mode']): number {
  switch (m) {
    case 'REUSE':
      return 1;
    case 'VALIDATE':
      return 0.55;
    case 'RECOMPUTE':
      return 0.12;
    default: {
      const _x: never = m;
      return _x;
    }
  }
}

function stepTypeScalar(stepType: ExecutionTraceStep['type']): number {
  const order: ExecutionTraceStep['type'][] = [
    'ECPS_EVAL',
    'ENGINE_SELECT',
    'TOOL_CALL',
    'STATE_TRANSITION',
    'REACT_THOUGHT',
    'ARTIFACT_READ',
    'ARTIFACT_WRITE',
  ];
  const i = order.indexOf(stepType);
  return clamp01((i + 1) / order.length);
}

/** Encode sealed trace header + ECPS decision as manifold coordinates. */
export function encodeDecisionState(trace: ExecutionTrace, decision: ExecutionDecision): CognitiveStateVector {
  const θ = kernelAngle(decision.kernel);
  const conf = clamp01(trace.confidence.score);
  return {
    schemaVersion: IGL_SCHEMA_VERSION,
    components: [
      conf,
      Math.cos(θ),
      Math.sin(θ),
      toolDepthScalar(decision.toolDepth),
      modeScalar(decision.mode),
      0,
    ],
  };
}

export function encodeStepState(trace: ExecutionTrace, step: ExecutionTraceStep): CognitiveStateVector {
  const θ = kernelAngle(trace.decision.kernel);
  const conf = clamp01(trace.confidence.score);
  const lat = typeof step.metadata?.latencyMs === 'number' ? clamp01(step.metadata.latencyMs / 30_000) : 0;
  return {
    schemaVersion: IGL_SCHEMA_VERSION,
    components: [
      conf,
      Math.cos(θ),
      Math.sin(θ),
      toolDepthScalar(trace.decision.toolDepth),
      modeScalar(trace.decision.mode),
      clamp01(0.65 * stepTypeScalar(step.type) + 0.35 * lat),
    ],
  };
}

/** τ(t_i) — curve samples from ETK (decision shell + each step). */
export function traceToTrajectory(trace: ExecutionTrace): CognitiveTrajectory {
  const states: CognitiveStateVector[] = [encodeDecisionState(trace, trace.decision)];
  for (const s of trace.steps) {
    states.push(encodeStepState(trace, s));
  }
  return { schemaVersion: IGL_SCHEMA_VERSION, states };
}

/** Diagonal metric g_dd(x) — higher weight ⇒ higher cost of motion in that coordinate. */
export function metricTensorDiagonal(state: CognitiveStateVector): ExecutionMetricTensor {
  const c = state.components;
  const explore = c[5];
  const td = c[3];
  const diagonal = [
    1.1 + 0.35 * c[0],
    1.25,
    1.25,
    1.6 + 1.2 * td,
    1.35 + 0.5 * c[4],
    1.2 + 0.9 * explore,
  ].slice(0, IGL_STATE_DIM);
  return { schemaVersion: IGL_SCHEMA_VERSION, diagonal };
}

/** Riemannian segment energy ‖Δx‖²_g between manifold chart points. */
export function riemannianSegmentEnergy(a: CognitiveStateVector, b: CognitiveStateVector): number {
  const mid: CognitiveStateVector = {
    schemaVersion: IGL_SCHEMA_VERSION,
    components: a.components.map((x, i) => (x + b.components[i]) / 2),
  };
  const g = metricTensorDiagonal(mid).diagonal;
  let s = 0;
  for (let d = 0; d < IGL_STATE_DIM; d++) {
    const dx = a.components[d] - b.components[d];
    s += g[d] * dx * dx;
  }
  return s;
}

/** Per-edge kinetic / metric costs — VCPO Lagrangian kinetic term uses these as E_density. */
export function listSegmentMetricEnergies(traj: CognitiveTrajectory): number[] {
  const out: number[] = [];
  for (let i = 0; i < traj.states.length - 1; i++) {
    out.push(riemannianSegmentEnergy(traj.states[i], traj.states[i + 1]));
  }
  return out;
}

/** Discrete ∫ g ds proxy along τ. */
export function discretePathEnergy(traj: CognitiveTrajectory): number {
  const parts = listSegmentMetricEnergies(traj);
  let e = 0;
  for (const p of parts) e += p;
  return e;
}

/** Preferred “geodesic” anchor — reflex kernel / NONE / REUSE at current confidence. */
export function ecpsGeodesicTarget(trace: ExecutionTrace): CognitiveStateVector {
  const θ = kernelAngle('REFLEX_KERNEL');
  const conf = clamp01(trace.confidence.score);
  return {
    schemaVersion: IGL_SCHEMA_VERSION,
    components: [
      conf,
      Math.cos(θ),
      Math.sin(θ),
      toolDepthScalar('NONE'),
      modeScalar('REUSE'),
      0,
    ],
  };
}

export function sampleECPSVectorField(trace: ExecutionTrace): ECPSVectorFieldSample {
  const base = encodeDecisionState(trace, trace.decision);
  const target = ecpsGeodesicTarget(trace);
  const tangent = base.components.map((x, i) => target.components[i] - x);
  return {
    schemaVersion: IGL_SCHEMA_VERSION,
    baseState: base,
    tangent,
  };
}

function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

function cosineSim(a: number[], b: number[]): number | null {
  const na = norm(a);
  const nb = norm(b);
  if (na < 1e-12 || nb < 1e-12) return null;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d / (na * nb);
}

export function computeInformationGeometrySnapshot(params: {
  trace: ExecutionTrace;
}): InformationGeometrySnapshot {
  const traj = traceToTrajectory(params.trace);
  const path_energy = discretePathEnergy(traj);
  let flow_alignment: number | null = null;
  if (traj.states.length >= 2) {
    const flow = sampleECPSVectorField(params.trace);
    const edge = traj.states[0].components.map((x, i) => traj.states[1].components[i] - x);
    flow_alignment = cosineSim(flow.tangent, edge);
  }
  return {
    schema_version: IGL_SCHEMA_VERSION,
    path_energy,
    trajectory_points: traj.states.length,
    flow_alignment,
  };
}
