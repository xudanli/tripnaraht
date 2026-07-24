/**
 * Travel Latent State — unified implicit representation for rollout / social grounding.
 * Bridges heuristic TravelPartyPersona tags into a transferable latent vector space.
 */

/** Motive distribution over [0, 1]; components need not sum to 1 (independent axes). */
export interface MotiveDistribution {
  /** 逃避现实度 / 隐世感 */
  detachment: number;
  /** 探索欲 / 特种兵指数 */
  exploration: number;
  /** 社交寻求度 */
  social_seeking: number;
  /** 松弛感 */
  relaxation: number;
}

export interface TravelLatentState {
  motive_distribution: MotiveDistribution;
  /** 疲劳耐受度 — lower = faster emotional decay under DEM / long drives */
  fatigue_tolerance: number;
  /** 社交表达欲 — high expressiveness × fatigue = conflict source */
  social_expressiveness: number;
  /** 风险厌恶度 — drives Hold vs Proceed under perturbation */
  risk_aversion: number;
}

export interface PartyMemberLatent {
  userId: string;
  displayName?: string;
  latentState: TravelLatentState;
}

/**
 * Party context for robustness rollout — distinct from per-member {@link TravelPartyPersona}.
 * Aggregates latent vectors for organizational robustness scoring.
 */
export interface RobustnessPartyContext {
  partyId: string;
  members: PartyMemberLatent[];
  /** Initial team cohesion baseline [0, 1] */
  cohesionIndex: number;
}

export const DEFAULT_TRAVEL_LATENT_STATE: TravelLatentState = {
  motive_distribution: {
    detachment: 0.3,
    exploration: 0.5,
    social_seeking: 0.4,
    relaxation: 0.5,
  },
  fatigue_tolerance: 0.6,
  social_expressiveness: 0.4,
  risk_aversion: 0.5,
};
