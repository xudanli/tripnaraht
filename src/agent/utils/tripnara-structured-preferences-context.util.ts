/**
 * 将 UserProfile.preferences.tripnara_structured_preferences 转为
 * 酒店 L1 规则 / 管家 persona / RAG query 偏置可用的切片（纯函数，无 IO）。
 */

import { TRIPNARA_STRUCTURED_PREFERENCES } from '../services/user-standing-preference.service';

export type TripnaraStructuredPrefsSlices = {
  standing_hotel_avoid_terms_lower?: string[];
  standing_hotel_style_digest_zh?: string;
  /** 拼在用户问题后，提升向量检索与用户口味对齐（勿过长） */
  rag_query_bias_zh?: string;
};

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/**
 * 从整条 `UserProfile.preferences` 或仅 structured 子对象解析。
 * `preferencesRoot` 可为 `userProfile.preferences`；若已取出 structured 也可把该对象当作根传入（无顶键时按扁平字段读）。
 */
export function extractTripnaraStructuredSlicesFromPreferences(
  preferencesRoot: Record<string, unknown> | null | undefined,
): TripnaraStructuredPrefsSlices {
  if (!preferencesRoot) return {};
  let st = asRecord(preferencesRoot[TRIPNARA_STRUCTURED_PREFERENCES]);
  if (!st) {
    st = asRecord(preferencesRoot);
    if (!st || (!('hotel_style' in st) && !('hotel_avoid' in st))) {
      return {};
    }
  }

  const hotelStyle = typeof st.hotel_style === 'string' ? st.hotel_style.trim() : '';
  const dining = typeof st.dining_preferences === 'string' ? st.dining_preferences.trim() : '';
  const transport = typeof st.transport_preferences === 'string' ? st.transport_preferences.trim() : '';
  const general = typeof st.general === 'string' ? st.general.trim() : '';

  const avoidRaw = Array.isArray(st.hotel_avoid) ? st.hotel_avoid : [];
  const avoidTerms = avoidRaw
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length >= 2);

  const digestParts: string[] = [];
  if (hotelStyle) digestParts.push(`住宿口味：${hotelStyle.slice(0, 120)}`);
  if (avoidTerms.length) digestParts.push(`住宿避免：${[...new Set(avoidTerms)].slice(0, 8).join('、')}`);
  if (dining) digestParts.push(`餐饮：${dining.slice(0, 80)}`);
  if (transport) digestParts.push(`交通：${transport.slice(0, 80)}`);
  if (general && digestParts.length < 3) digestParts.push(`其他：${general.slice(0, 80)}`);

  const standing_hotel_style_digest_zh = digestParts.length ? digestParts.join('；').slice(0, 220) : undefined;

  const ragParts: string[] = [];
  if (hotelStyle) ragParts.push(`住宿偏好 ${hotelStyle.slice(0, 100)}`);
  if (avoidTerms.length) ragParts.push(`避免 ${[...new Set(avoidTerms)].slice(0, 6).join(' ')}`);
  if (dining) ragParts.push(`用餐 ${dining.slice(0, 60)}`);
  if (transport) ragParts.push(`交通 ${transport.slice(0, 60)}`);
  const rag_query_bias_zh = ragParts.length
    ? `用户长期偏好（检索对齐）：${ragParts.join('；').slice(0, 200)}`
    : undefined;

  return {
    ...(avoidTerms.length ? { standing_hotel_avoid_terms_lower: [...new Set(avoidTerms)] } : {}),
    ...(standing_hotel_style_digest_zh ? { standing_hotel_style_digest_zh } : {}),
    ...(rag_query_bias_zh ? { rag_query_bias_zh } : {}),
  };
}
