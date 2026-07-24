/**
 * Trigger Gateway wiring closure — catalog SSOT for 12/12 dispatch.
 */

import {
  DECISION_TRIGGER_WIRING_CATALOG,
  summarizeTriggerWiring,
} from '../trigger/decision-trigger-wiring.catalog';

export const TRIGGER_WIRING_CLOSURE_VERSION = 'trigger-wiring-closure@v1';

export interface TriggerWiringClosureReport {
  schemaId: 'tripnara.trigger_wiring_closure@v1';
  generatedAt: string;
  version: typeof TRIGGER_WIRING_CLOSURE_VERSION;
  summary: ReturnType<typeof summarizeTriggerWiring>;
  pass: boolean;
  engineeringComplete: boolean;
  blockers: string[];
  nextActions: string[];
}

export function evaluateTriggerWiringClosure(): TriggerWiringClosureReport {
  const summary = summarizeTriggerWiring(DECISION_TRIGGER_WIRING_CATALOG);
  const blockers: string[] = [];

  if (summary.notWired > 0) {
    blockers.push(`not_wired=${summary.notWired}`);
  }
  if (summary.lineageOnly > 0) {
    blockers.push(`lineage_only=${summary.lineageOnly}`);
  }
  if (summary.dispatchWired !== summary.total) {
    blockers.push(`dispatch=${summary.dispatchWired}/${summary.total}`);
  }

  const pass = blockers.length === 0;
  const nextActions: string[] = pass
    ? [
        'Layer 1 catalog complete — enable DECISION_TRIGGER_GATEWAY_ENABLED=1 on production selective',
        'Run: DECISION_RUNTIME_BASE_URL=<prod> npm run production-observation:report',
        'Weekly: npm run p5-weekly-ops',
      ]
    : ['npm run trigger-bypass-priority', 'Wire top bypass entries to dispatch'];

  return {
    schemaId: 'tripnara.trigger_wiring_closure@v1',
    generatedAt: new Date().toISOString(),
    version: TRIGGER_WIRING_CLOSURE_VERSION,
    summary,
    pass,
    engineeringComplete: pass,
    blockers,
    nextActions,
  };
}
