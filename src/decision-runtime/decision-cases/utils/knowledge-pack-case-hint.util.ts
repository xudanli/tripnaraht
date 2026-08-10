/**
 * Map Decision Case trip flags → Iceland Self-Drive Knowledge Pack situation.
 * Uses pack road profiles + structured meta flags — no invented gust numbers.
 */

import { evaluateIcelandSelfDriveSituation } from '../../packs/knowledge/demo/evaluate-iceland-self-drive-situation';
import type { IcelandSelfDriveSituationResult } from '../../packs/knowledge/demo/iceland-self-drive-situation.types';
import { resolveFactsFromCaseFlags } from '../../packs/knowledge/demo/resolve-iceland-self-drive-facts';

export interface KnowledgePackCaseHint {
  verdictGate: IcelandSelfDriveSituationResult['verdict']['gate'];
  summary: string;
  vehicleRoadFitGate?: string;
  roadBaseType?: string;
  reasons: string[];
  runbookId?: string;
  primaryActions: string[];
}

export function buildKnowledgePackHintFromCaseFlags(input: {
  hasFRoad: boolean;
  hasGravel: boolean;
  highWind: boolean;
  vehicleType?: string;
  fRoadIdHint?: string;
  fRoadAllowed?: unknown;
  /** Optional measured gust from trip meta / weather — never invent a default */
  windGustMs?: number;
}): KnowledgePackCaseHint | undefined {
  const facts = resolveFactsFromCaseFlags(input);
  const situation = evaluateIcelandSelfDriveSituation({
    scenarioId: 'DECISION_CASE_ENRICH',
    vehicleRoadFit: facts.vehicleRoadFit,
    weather: facts.weather,
    executeFuelRunbookOnBlock: false,
  });

  return {
    verdictGate: situation.verdict.gate,
    summary: situation.verdict.summary,
    vehicleRoadFitGate: situation.vehicleRoadFit?.gate,
    roadBaseType: situation.vehicleRoadFit?.roadBaseType,
    reasons: situation.aggregate.reasons,
    runbookId: situation.runbook?.runbookId,
    primaryActions: situation.verdict.primaryActions,
  };
}
