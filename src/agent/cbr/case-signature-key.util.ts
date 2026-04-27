import { createHash } from 'node:crypto';
import type { CaseQuerySignature } from './case-record.types';

/** 与 LocalCaseStoreService 的 signature 键一致，便于 DB 聚合与内存温启动对齐。 */
export function caseQuerySignatureKey(sig: CaseQuerySignature): string {
  const relax = (sig.relaxation_types ?? []).slice().sort().join(',');
  return [
    `conflict=${sig.conflict_type}`,
    `vio=${sig.primary_violation_type ?? ''}`,
    `region=${sig.region_id ?? ''}`,
    `month=${sig.month ?? ''}`,
    `relax=${relax}`,
  ].join('|');
}

export function caseQuerySignatureHash(sig: CaseQuerySignature): string {
  return createHash('sha256').update(caseQuerySignatureKey(sig), 'utf8').digest('hex');
}
