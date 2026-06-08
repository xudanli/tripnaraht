/**
 * DATA_LOOKUP 购物/补给咨询：判断是否为「某 POI/超市能买什么」类事实问答，
 * 避免在有 trip_id 时被误判为 TRIP_PLANNING → POI 稀疏区域澄清。
 */

import { matchIntentProfiles } from '../intent/intent-profile-registry';

/** 与 orchestration-signals 内 supply 分流语义对齐（委托 Intent Profile Registry） */
export function isPoiSupplyConsultationQuery(message: string): boolean {
  return matchIntentProfiles(message).some(
    (m) => m.profile.id === 'consult.supply' || m.profile.id === 'consult.supply.nearby',
  );
}
