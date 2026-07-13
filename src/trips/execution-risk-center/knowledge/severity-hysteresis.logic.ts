import type { ExecutionGate, RiskLevel } from '../types/execution-risk.types';
import type { SeverityHysteresisState } from './severity-hysteresis.service';

export interface HysteresisStoreEntry {
  level: RiskLevel;
  executionGate: ExecutionGate;
  confirmedImprovementReadings: number;
  updatedAt: string;
}

const LEVEL_ORDER: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const GATE_ORDER: ExecutionGate[] = ['ALLOW', 'AT_RISK', 'REPLAN_REQUIRED', 'STOP'];

export interface HysteresisApplyInput {
  prior: HysteresisStoreEntry;
  proposed: { level: RiskLevel; executionGate: ExecutionGate };
  isWeather: boolean;
}

export interface HysteresisApplyOutcome {
  entry: HysteresisStoreEntry;
  level: RiskLevel;
  executionGate: ExecutionGate;
  hysteresis?: SeverityHysteresisState;
}

export function computeSeverityHysteresisOutcome(
  input: HysteresisApplyInput,
): HysteresisApplyOutcome {
  const { prior, proposed, isWeather } = input;

  if (isEscalation(prior, proposed)) {
    const entry: HysteresisStoreEntry = {
      level: proposed.level,
      executionGate: proposed.executionGate,
      confirmedImprovementReadings: 0,
      updatedAt: new Date().toISOString(),
    };
    return { entry, level: proposed.level, executionGate: proposed.executionGate };
  }

  if (!isDowngrade(prior, proposed)) {
    const entry: HysteresisStoreEntry = {
      level: proposed.level,
      executionGate: proposed.executionGate,
      confirmedImprovementReadings: 0,
      updatedAt: new Date().toISOString(),
    };
    return { entry, level: proposed.level, executionGate: proposed.executionGate };
  }

  const readingsRequired = isWeather ? 2 : 1;
  const confirmed = prior.confirmedImprovementReadings + 1;
  const maxDropLevels = 1;
  const cappedLevel = capLevelDrop(prior.level, proposed.level, maxDropLevels);
  const cappedGate = capGateDrop(prior.executionGate, proposed.executionGate, maxDropLevels);
  const canDowngrade = confirmed >= readingsRequired;
  const nextLevel = canDowngrade ? cappedLevel : prior.level;
  const nextGate = canDowngrade ? cappedGate : prior.executionGate;

  const entry: HysteresisStoreEntry = {
    level: nextLevel,
    executionGate: nextGate,
    confirmedImprovementReadings: canDowngrade ? 0 : confirmed,
    updatedAt: new Date().toISOString(),
  };

  return {
    entry,
    level: nextLevel,
    executionGate: nextGate,
    hysteresis: {
      readingsRequired,
      readingsConfirmed: canDowngrade ? readingsRequired : confirmed,
      canDowngrade,
    },
  };
}

function isEscalation(
  prior: Pick<HysteresisStoreEntry, 'level' | 'executionGate'>,
  proposed: { level: RiskLevel; executionGate: ExecutionGate },
): boolean {
  return (
    levelIndex(proposed.level) > levelIndex(prior.level) ||
    gateIndex(proposed.executionGate) > gateIndex(prior.executionGate)
  );
}

function isDowngrade(
  prior: Pick<HysteresisStoreEntry, 'level' | 'executionGate'>,
  proposed: { level: RiskLevel; executionGate: ExecutionGate },
): boolean {
  return (
    levelIndex(proposed.level) < levelIndex(prior.level) ||
    gateIndex(proposed.executionGate) < gateIndex(prior.executionGate)
  );
}

function levelIndex(level: RiskLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

function gateIndex(gate: ExecutionGate): number {
  return GATE_ORDER.indexOf(gate);
}

function capLevelDrop(prior: RiskLevel, proposed: RiskLevel, maxDrop: number): RiskLevel {
  const priorIdx = levelIndex(prior);
  const proposedIdx = levelIndex(proposed);
  const minAllowed = Math.max(proposedIdx, priorIdx - maxDrop);
  return LEVEL_ORDER[minAllowed] ?? proposed;
}

function capGateDrop(prior: ExecutionGate, proposed: ExecutionGate, maxDrop: number): ExecutionGate {
  const priorIdx = gateIndex(prior);
  const proposedIdx = gateIndex(proposed);
  const minAllowed = Math.max(proposedIdx, priorIdx - maxDrop);
  return GATE_ORDER[minAllowed] ?? proposed;
}
