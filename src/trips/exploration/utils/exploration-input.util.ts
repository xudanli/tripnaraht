import type { ExplorationInput } from '../types/exploration.types';

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function setAtPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cursor[key];
    if (!next || typeof next !== 'object') {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

export function mergeExplorationInputWithProtocol(
  userInput: ExplorationInput,
  protocolDefaults?: Partial<ExplorationInput>,
  lockedFields: string[] = [],
): ExplorationInput {
  const merged: ExplorationInput = {
    ...userInput,
    ...protocolDefaults,
    dateRange: { ...protocolDefaults?.dateRange, ...userInput.dateRange },
    budget: userInput.budget ?? protocolDefaults?.budget,
    mobilityContext: {
      ...protocolDefaults?.mobilityContext,
      ...userInput.mobilityContext,
    },
    insuranceContext: {
      ...protocolDefaults?.insuranceContext,
      ...userInput.insuranceContext,
    },
    rentalContext: {
      ...protocolDefaults?.rentalContext,
      ...userInput.rentalContext,
    },
    travelers: userInput.travelers?.length
      ? userInput.travelers
      : protocolDefaults?.travelers ?? userInput.travelers,
    destinationCodes: userInput.destinationCodes?.length
      ? userInput.destinationCodes
      : protocolDefaults?.destinationCodes ?? userInput.destinationCodes,
    source: userInput.source,
  };

  const mergedRecord = merged as unknown as Record<string, unknown>;
  const defaultsRecord = (protocolDefaults ?? {}) as unknown as Record<string, unknown>;

  for (const field of lockedFields) {
    const lockedValue = getAtPath(defaultsRecord, field);
    if (lockedValue !== undefined) {
      setAtPath(mergedRecord, field, lockedValue);
    }
  }

  return merged as ExplorationInput;
}

export function countTripDays(input: ExplorationInput): number {
  const start = new Date(input.dateRange.startDate);
  const end = new Date(input.dateRange.endDate);
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1);
}

export function readTripVersion(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object') return 1;
  const version = (metadata as Record<string, unknown>).tripVersion;
  return typeof version === 'number' && version > 0 ? version : 1;
}

export function bumpTripVersion(metadata: unknown): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};
  const prev = readTripVersion(base);
  return { ...base, tripVersion: prev + 1 };
}
