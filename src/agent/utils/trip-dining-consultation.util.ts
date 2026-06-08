/**
 * DATA_LOOKUP 餐饮咨询：判断是否为餐厅推荐意图、用户是否已写明地理/日程锚点，
 * 以及行程摘要里是否有可引用的入库日程项。
 */

import { matchIntentProfiles } from '../intent/intent-profile-registry';

/** 与 orchestration-signals `diningLookupZh` / `diningLookupEn` 语义对齐（委托 Registry） */
export function isDiningRecommendationQuery(message: string): boolean {
  return matchIntentProfiles(message).some((m) => m.profile.id === 'consult.dining');
}

/**
 * 用户是否已在话术里限定区域/地标/哪一天（则无需再追问「锚哪一站」）。
 */
export function messageHasDiningLocationAnchor(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  const lower = m.toLowerCase();

  const regionOrLandmark =
    /黄金圈|南岸|北岸|东部|西部|环岛|斯奈山|峡湾|雷克雅未克|凯夫拉维克|维克|霍芬|阿克雷里|米湖|草帽山|教会山/i.test(m) ||
    /\b(?:golden\s+circle|south\s+coast|snæfellsnes|reykjavik|keflavik|vik|hofn)\b/i.test(lower);

  const goldenCirclePois =
    /间歇泉|盖歇尔|Geysir|黄金瀑布|古佛斯|Gullfoss|辛格维利尔|辛格韦德利|Þingvellir|Thingvellir/i.test(m) ||
    /\b(?:geysir|gullfoss|thingvellir)\b/i.test(lower);

  const dayRef =
    /第[一二三四五六七八九十1-7]+天|第\s*\d\s*天|首日|次日|当天|这天|那一天|行程里.{0,8}天|日程.{0,8}天/i.test(m) ||
    /\bday\s*[1-7]\b/i.test(lower);

  const coarseNear =
    /附近|周边|沿线|那一带|这一块|这块区域/i.test(m) && (regionOrLandmark || goldenCirclePois || dayRef);

  return regionOrLandmark || goldenCirclePois || dayRef || coarseNear;
}

/** 咨询摘要里由 `appendConsultationItineraryDraftToSummary` 写入的日程项计数 */
export function tripSummaryIndicatesNonEmptyItineraryDraft(summaryBlob: string): boolean {
  const m = summaryBlob.match(/日程项总数:\s*(\d+)/);
  if (!m) return false;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) && n > 0;
}

/**
 * 从 `appendConsultationItineraryDraftToSummary` 注入块中解析「按日」行程行（`- 日期: …`），用于生成「锚定第 N 天」一键操作。
 * 行顺序即第 1 天、第 2 天…（与摘要展示一致）。
 */
export function extractConsultationDraftDayRows(summaryBlob: string): Array<{
  dayIndex1: number;
  dateLabel: string;
}> {
  const marker = '【当前已入库日程草案';
  const idx = summaryBlob.indexOf(marker);
  if (idx === -1) return [];
  const rest = summaryBlob.slice(idx);
  const stopIdx = rest.indexOf('日程项总数:');
  const section = stopIdx === -1 ? rest : rest.slice(0, stopIdx);
  const rows: Array<{ dayIndex1: number; dateLabel: string }> = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^\-\s*([^:]+):\s*/);
    if (!m) continue;
    const dateLabel = m[1]!.trim();
    rows.push({ dayIndex1: rows.length + 1, dateLabel });
  }
  return rows;
}
