import { createHash } from 'crypto';
import type { PhysicalViolationItem } from './physical-validator.types';

/** Stable hash over validator identity + violation codes (PREVIEW/COMMIT physicalHash dimension). */
export function physicalGateFingerprint(parts: {
  validator_version: string;
  rule_bundle_id: string;
  violations: PhysicalViolationItem[];
}): string {
  const codes = [...new Set(parts.violations.map((v) => v.code))].sort();
  const raw = JSON.stringify({
    v: parts.validator_version,
    b: parts.rule_bundle_id,
    c: codes,
  });
  return `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`;
}
