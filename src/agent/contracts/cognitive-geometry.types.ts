/**
 * Information Geometry Layer (IGL) — execution as curves on a cognitive state manifold ℳ.
 *
 * Pure data geometry; no runtime services. ECPS samples a vector field; ETK is a discrete trajectory τ(t).
 */

export const IGL_SCHEMA_VERSION = 'igl/v1';
export const IGL_STATE_DIM = 6;

/** Point x ∈ ℳ — differentiable-friendly coordinate patch (fixed dimension). */
export interface CognitiveStateVector {
  schemaVersion: typeof IGL_SCHEMA_VERSION;
  components: number[];
}

/** Local metric tensor proxy — diagonal PSD weights g_dd(x) for execution cost form ds² ≈ Σ g_dd dx_d². */
export interface ExecutionMetricTensor {
  schemaVersion: typeof IGL_SCHEMA_VERSION;
  /** Length === `components.length` — positive diagonal entries. */
  diagonal: number[];
}

/** Discrete curve τ(t_i) ⊆ ℳ from an execution trace. */
export interface CognitiveTrajectory {
  schemaVersion: typeof IGL_SCHEMA_VERSION;
  states: CognitiveStateVector[];
}

/** ECPS as sampled tangent direction v(x) ∈ T_xℳ (same chart as state). */
export interface ECPSVectorFieldSample {
  schemaVersion: typeof IGL_SCHEMA_VERSION;
  baseState: CognitiveStateVector;
  /** Unnormalized direction toward preferred low-cost flow (e.g. SYSTEM1 / reuse). */
  tangent: number[];
}

/** Observability-sized IGL snapshot (gateway-friendly). */
export interface InformationGeometrySnapshot {
  schema_version: typeof IGL_SCHEMA_VERSION;
  /** Discrete Riemannian energy Σ segment ‖Δx‖²_g along the trace (proxy for ∫ g ds). */
  path_energy: number;
  trajectory_points: number;
  /** ⟨v_ECPS, Δτ⟩ / (‖v‖‖Δτ‖) on first segment — geodesic vs exploratory alignment. */
  flow_alignment: number | null;
}
