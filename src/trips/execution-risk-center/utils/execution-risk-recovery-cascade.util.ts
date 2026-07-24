export type RecoveryCascadePath = 'AUTO_CLEAR' | 'VERIFY_REQUIRED' | 'PERSIST';

const DERIVED_RECOVERY: Record<string, Record<string, RecoveryCascadePath>> = {
  'ENV-WIND-01': {
    'ROAD-CROSSWIND-01': 'AUTO_CLEAR',
    'BOOK-TIME-01': 'VERIFY_REQUIRED',
    'BOOK-ACTIVITY-01': 'VERIFY_REQUIRED',
    'SCHEDULE-DELAY-01': 'VERIFY_REQUIRED',
  },
  'ENV-PRECIP-02': {
    'ROAD-CLOSE-01': 'AUTO_CLEAR',
    'ROAD-ICE-01': 'AUTO_CLEAR',
    'SCHEDULE-DELAY-01': 'VERIFY_REQUIRED',
  },
  'BOOK-ACTIVITY-01': {
    'SCHEDULE-CASCADE-01': 'PERSIST',
  },
  'BOOK-TIME-01': {
    'BOOK-ACTIVITY-01': 'PERSIST',
  },
};

export function resolveRecoveryCascadePath(input: {
  rootKnowledgeCode: string;
  derivedKnowledgeCode: string;
}): RecoveryCascadePath {
  const byRoot = DERIVED_RECOVERY[input.rootKnowledgeCode];
  if (byRoot?.[input.derivedKnowledgeCode]) {
    return byRoot[input.derivedKnowledgeCode]!;
  }
  if (input.derivedKnowledgeCode.startsWith('ROAD-')) return 'AUTO_CLEAR';
  if (input.derivedKnowledgeCode.startsWith('BOOK-')) return 'VERIFY_REQUIRED';
  if (input.derivedKnowledgeCode.startsWith('SCHEDULE-')) return 'VERIFY_REQUIRED';
  return 'VERIFY_REQUIRED';
}

export function assertRecoveryCascadeExpectations(input: {
  scenarioId: string;
  rootKnowledgeCode: string;
  derivedKnowledgeCode: string;
  rootCleared: boolean;
}): string[] {
  const failures: string[] = [];
  const path = resolveRecoveryCascadePath({
    rootKnowledgeCode: input.rootKnowledgeCode,
    derivedKnowledgeCode: input.derivedKnowledgeCode,
  });
  if (!input.rootCleared) return failures;

  if (input.scenarioId === 'SH-ENV-001') {
    if (input.derivedKnowledgeCode === 'ROAD-CROSSWIND-01' && path !== 'AUTO_CLEAR') {
      failures.push(`${input.scenarioId}: ROAD-CROSSWIND-01 should AUTO_CLEAR when wind clears`);
    }
    if (input.derivedKnowledgeCode === 'BOOK-TIME-01' && path !== 'VERIFY_REQUIRED') {
      failures.push(`${input.scenarioId}: BOOK-TIME-01 should VERIFY_REQUIRED when wind clears`);
    }
  }
  if (input.scenarioId === 'SH-SCHED-002') {
    if (input.derivedKnowledgeCode === 'SCHEDULE-CASCADE-01' && path !== 'PERSIST') {
      failures.push(`${input.scenarioId}: missed booking cascade should PERSIST`);
    }
  }
  return failures;
}
