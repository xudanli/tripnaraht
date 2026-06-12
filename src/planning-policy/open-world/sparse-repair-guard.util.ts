import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { isOpenWorldStubNumericId } from './open-world-poi-stub.util';

/** 稀疏区 intentional slack 已激活 — Repair 不应惩罚性填充/轮播替换 */
export function isSparseIntentionalSlackActive(dso: DecisionState | undefined): boolean {
  const ctx = dso?.constraints?.decisionContext;
  if (!ctx?.sparseProfileId) return false;
  return (ctx.intentionalSlack?.length ?? 0) > 0 || (ctx.openWorldStubs?.length ?? 0) > 0;
}

export function isOpenWorldElasticPoiRef(poiId: string | undefined | null): boolean {
  const id = String(poiId ?? '').trim();
  if (!id) return false;
  if (id.startsWith('provisional_')) return true;
  const num = Number(id);
  return isOpenWorldStubNumericId(num);
}

export function shouldSkipAggressivePoiRepairForSparseContext(
  dso: DecisionState | undefined,
  targetPoiId?: string,
): boolean {
  if (isOpenWorldElasticPoiRef(targetPoiId)) return true;
  return isSparseIntentionalSlackActive(dso);
}
