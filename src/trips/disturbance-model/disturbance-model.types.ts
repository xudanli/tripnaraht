/**
 * P-ECO-Closure-6 — Exogenous disturbance scales ξ(t) mapped onto normalized noise budgets.
 */

export interface DisturbanceModel {
  weatherNoise: number;
  routeNoise: number;
  temporalNoise: number;
  userDeviationNoise: number;
}
