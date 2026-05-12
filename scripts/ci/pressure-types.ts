/**
 * Shared shapes for P-CI pressure stack (deterministic; no runtime imports from trips/).
 */

export interface RuntimePressureInputs {
  ecoDriftRate?: number;
  identityRejectRate?: number;
  closureRetryRate?: number;
}

export interface LaneTscSnapshot {
  tsconfig: string;
  errorCount: number;
}

export interface StaticPressureCore {
  physicsPressure: number;
  tripsPressure: number;
  entropyPressure: number;
  coupling: number;
  stability: number;
  lanes: {
    physics: LaneTscSnapshot;
    trips: LaneTscSnapshot;
    entropy: LaneTscSnapshot;
  };
  normalization: {
    physicsDenom: number;
    tripsDenom: number;
    entropyDenom: number;
  };
}

export interface PressureGradient {
  dPhysicsPressure: number;
  dTripsPressure: number;
  dEntropyPressure: number;
  dCoupling: number;
  dStability: number;
  dRuntimePressure: number;
  dEcoDriftRate: number;
  dIdentityRejectRate: number;
  dClosureRetryRate: number;
  dFusedPhysicsPressure: number;
  dFusedStability: number;
}

export interface PressureForecastHorizon {
  physicsPressure: number;
  stability: number;
  fusedPhysicsPressure?: number;
  fusedStability?: number;
}

export interface PressureForecast {
  horizons: {
    t1: PressureForecastHorizon;
    t2: PressureForecastHorizon;
    t3: PressureForecastHorizon;
  };
  trend: 'improving' | 'stable' | 'degrading';
  instabilityRisk: number;
}

export interface ControlSignal {
  ecoThrottle: number;
  identityGuardTighten: boolean;
  closureRetryLimit: number;
  neptuneRetryPolicy: 'allow' | 'restrict' | 'block';
}

/** P-CI-2 / P-CI-3 combined pressure document (merge output). */
export interface SystemPressureState extends StaticPressureCore {
  schema: 'p-ci-pressure/2' | 'p-ci-pressure/3';
  runtimeOverlay?: {
    alpha: number;
    inputs: Partial<RuntimePressureInputs>;
    runtimePressure: number;
    fusedPhysicsPressure: number;
    fusedCoupling: number;
    fusedStability: number;
  };
  gradient?: PressureGradient | null;
  forecast?: PressureForecast;
  control?: ControlSignal;
}
