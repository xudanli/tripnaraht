import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import type { SuggestedPolicyAdjustment } from './governance-activation.types';

const NORTH_HINT = /north|northwest|north east|西峡|北部|阿克雷里|akureyri|westfjords|西峡湾/i;

/**
 * Read-only policy intelligence — never mutates policy.resolve output.
 * Detects repeated winter-north + 2WD + blocked style friction from ledger text.
 */
export function suggestPolicyAdjustmentsFromGovernance(
  events: readonly GovernanceLedgerEvent[],
  opts?: { minHits?: number },
): SuggestedPolicyAdjustment[] {
  const minHits = opts?.minHits ?? 12;
  const hits: GovernanceLedgerEvent[] = [];
  for (const e of events) {
    if (e.eventType !== 'execution_block') continue;
    const region = e.executionContextSummary?.routeRegion ?? '';
    const blob = [...(e.causedByPolicies ?? []), region].join(' ').toLowerCase();
    const twoWd = /2wd|two.wheel|2\s*wd|前驱/i.test(blob);
    const winter = /winter|冬季|snow|冰|storm/i.test(blob) || NORTH_HINT.test(region);
    if (twoWd && winter) hits.push(e);
  }
  if (hits.length < minHits) return [];
  return [
    {
      id: 'elevate_winter_vehicle_requirement',
      humanReadable:
        'Repeated winter/north exposure with 2WD-class blocks — consider elevating winter vehicle requirement in policy bundle.',
      evidenceEventIds: hits.map((h) => h.id),
    },
  ];
}
