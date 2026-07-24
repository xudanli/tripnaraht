import type { ExplorationInsuranceCoverageTier } from '../../trips/exploration/config/exploration-insurance.config';

export interface ExplorationInsuranceOntologyProjection {
  coveredCauses: string[];
  excludedCauses: string[];
  confidence: number;
  sourceRef: string;
}

/** 探索条件页保险档位 → Ontology InsurancePolicy 事实投影（用户声明权威） */
export function projectExplorationInsuranceTier(
  tier: ExplorationInsuranceCoverageTier,
): ExplorationInsuranceOntologyProjection | null {
  switch (tier) {
    case 'BASIC':
      return {
        coveredCauses: ['collision'],
        excludedCauses: ['gravel', 'waterCrossing', 'undercarriage'],
        confidence: 0.85,
        sourceRef: 'exploration_insurance_basic',
      };
    case 'STANDARD':
      return {
        coveredCauses: ['collision', 'gravel'],
        excludedCauses: ['waterCrossing'],
        confidence: 0.8,
        sourceRef: 'exploration_insurance_standard',
      };
    case 'FULL':
      return {
        coveredCauses: ['collision', 'gravel', 'undercarriage', 'waterCrossing'],
        excludedCauses: [],
        confidence: 0.75,
        sourceRef: 'exploration_insurance_full',
      };
    case 'UNKNOWN':
      return null;
    default:
      return null;
  }
}
