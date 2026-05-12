/**
 * P-ECO-Closure-6 — Optional distributional view over physics projections (mean matches scalar state vector).
 *
 * Consumers may attach these when calibration supplies spread (e.g. mobility ~ N(mean, σ²)).
 */

/** Gaussian-style marginal over one projected scalar (variance is σ²). */
export interface GaussianScalarProjection {
  mean: number;
  variance: number;
}

/** Optional epistemic spreads alongside point estimates on {@link UnifiedPhysicsField}. */
export interface ProbabilisticPhysicsProjection {
  mobility?: GaussianScalarProjection;
  exposure?: GaussianScalarProjection;
  energy?: GaussianScalarProjection;
  temporalPressure?: GaussianScalarProjection;
}
