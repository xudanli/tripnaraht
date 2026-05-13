import type { GovernanceEventLevel, GovernanceLedgerEventType } from './governance-ledger.types';

const L1: GovernanceEventLevel = 'L1_operational';
const L2: GovernanceEventLevel = 'L2_policy';
const L3: GovernanceEventLevel = 'L3_world';

const OPERATIONAL: ReadonlySet<GovernanceLedgerEventType> = new Set([
  'execution_block',
  'reroute',
  'delay_departure',
  'route_suppressed',
  'recovery_suggested',
]);

const POLICY: ReadonlySet<GovernanceLedgerEventType> = new Set([
  'policy_generated',
  'policy_override',
  'policy_restriction',
  'severity_upgraded',
  'governance_branch_selected',
  'governance_branch_outcome',
  'governance_runtime_transition',
  'governance_resolution_event',
]);

const WORLD: ReadonlySet<GovernanceLedgerEventType> = new Set([
  'storm_detected',
  'road_closed',
  'weather_escalated',
  'official_warning_issued',
]);

export function governanceEventLevelForType(t: GovernanceLedgerEventType): GovernanceEventLevel {
  if (OPERATIONAL.has(t)) return L1;
  if (POLICY.has(t)) return L2;
  if (WORLD.has(t)) return L3;
  return L2;
}
