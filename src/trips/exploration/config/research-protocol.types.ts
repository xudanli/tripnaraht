import type { ExplorationInput } from '../types/exploration.types';
import type { ExploreEntryVariant } from '../constants/exploration-status.constants';

export interface ResearchProtocolConfig {
  protocolId: string;
  version: string;
  defaultScenario: Partial<ExplorationInput>;
  lockedFields: string[];
  entryVariants: ExploreEntryVariant[];
  strategyIds: string[];
  issueSelectionPolicy: {
    maxIssues: number;
    preferredSeverities: Array<'BLOCK' | 'CONFLICT'>;
    preferredCategories?: string[];
  };
  packagePresentationPolicy: {
    mode: 'LATIN_SQUARE' | 'RANDOM';
    packageIds: string[];
  };
  requiredEvents: string[];
  featureFlags: string[];
}
