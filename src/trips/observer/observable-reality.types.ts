/**
 * Reality slices observable under P22 — extend P21 seeds with audit geometry for visibility scoring.
 */

import type { RealitySeed } from '../meta-reality/meta-reality-kernel.types';

export type RealityTimelineKind = 'REALTIME' | 'WINDOWED' | 'CROSS_DAY';

export interface ObservableRealityCandidate extends RealitySeed {
  /** Tags derived from simulation/memory events — matched to observer focus domains. */
  observedEventTags?: string[];
  timelineKind?: RealityTimelineKind;
  /** Coarse region bucket id — matched under spatial resolution rules. */
  geoRegion?: string;
  /** Shannon-like coarse entropy proxy [0,1] — defaults from caller if absent. */
  entropy?: number;
  riskScore?: number;
  opportunityScore?: number;
}

export interface ObservedRealityOutcome extends ObservableRealityCandidate {
  collapseScore: number;
  visibility: number;
  biasMultiplier: number;
}
