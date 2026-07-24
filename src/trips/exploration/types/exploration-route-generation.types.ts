import type { ExplorationInput } from '../types/exploration.types';
import type { ExplorationRouteDetailPayload } from '../config/iceland-route-detail.catalog';
import type { ExplorationRouteGenerationSource } from '../config/exploration-route-generation.config';

export interface GeneratedRouteVariantBundle {
  routeId: string;
  strategyId: string;
  variantBranchKey: string;
  title: string;
  narrative: string;
  metrics: Record<string, number>;
  gains: Array<{ id: string; label: string }>;
  sacrifices: Array<{ id: string; label: string }>;
  generationSource: ExplorationRouteGenerationSource;
  routeDetail?: ExplorationRouteDetailPayload;
  tagline?: string;
  badge?: { label: string; tone: string };
}

export interface RouteGenerationContext {
  scenarioId: string;
  tripId: string;
  destinationCode: string;
  protocolId: string | null;
  initialInput: ExplorationInput;
  rankedPrinciples?: string[];
  generationVersion: number;
}
