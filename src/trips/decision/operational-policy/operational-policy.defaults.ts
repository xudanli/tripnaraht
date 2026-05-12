import {
  type OpsOperationalPolicyConfigV1,
  OPS_OPERATIONAL_POLICY_SCHEMA,
} from './operational-policy.types';

/** Safe defaults: advisory weather HARD/SOFT; stale facts warn; routing defers to warn. */
export const DEFAULT_OPS_OPERATIONAL_POLICY_V1: OpsOperationalPolicyConfigV1 = {
  version: OPS_OPERATIONAL_POLICY_SCHEMA,
  weather: {
    onHardViolation: 'WARN_ONLY',
    onSoftViolation: 'WARN_ONLY',
    enforceHardBlock: false,
  },
  worldFact: {
    warnAboveAgeSeconds: 86_400,
    degradedAboveAgeSeconds: 604_800,
    onExpiredValidTo: 'WARN_ONLY',
  },
  routing: {
    onStructuralReplanSuggested: 'REQUIRE_REROUTE_OR_USER_CONFIRM',
  },
};
