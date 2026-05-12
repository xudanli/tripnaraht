/**
 * 将 itinerary.verify 的结构化 issues 转为 repair.apply 所需的 RequiredAdjustment[]。
 * 保守策略：ADD_BUFFER（含多锚合并、max end 后移）/ SHORTEN_DAY / CHANGE_TRANSPORT / REDUCE_SCOPE。
 */

import type { RequiredAdjustment } from '../../agent/interfaces/trip-plan.interface';
import type { ItineraryVerifyOutput } from './itinerary-verify.skill';

export type VerifyIssueForMapping = ItineraryVerifyOutput['issues'][number];

export interface MapVerifyIssuesOptions {
  /** 默认仅 ERROR；为 true 时包含 WARNING */
  includeWarnings?: boolean;
}

export function mapVerifyIssuesToRequiredAdjustments(
  issues: VerifyIssueForMapping[],
  options?: MapVerifyIssuesOptions,
): RequiredAdjustment[] {
  const out: RequiredAdjustment[] = [];
  /** 同一后项 item_id 的多条 TIME_WINDOW_OVERLAP 合并为一条 ADD_BUFFER（多锚取 max end） */
  const overlapAgg = new Map<string, { anchors: Set<string>; whys: string[] }>();
  const seen = new Set<string>();

  for (const issue of issues) {
    const sev = issue.severity;
    if (sev !== 'ERROR' && sev !== 'CRITICAL' && !(options?.includeWarnings === true && sev === 'WARNING')) continue;

    const dedupeKey =
      issue.type === 'TIME_WINDOW_OVERLAP' && issue.related_item_id
        ? `${issue.type}:${issue.item_id ?? '_'}:${issue.related_item_id}`
        : `${issue.type}:${issue.item_id ?? issue.day ?? '_'}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const why = [issue.message, issue.suggestion].filter(Boolean).join(' — ') || String(issue.type);

    switch (issue.type) {
      case 'OPENING_HOURS_CONFLICT':
        if (issue.item_id) {
          out.push({ action: 'SHORTEN_DAY', why, target: issue.item_id });
        } else if (issue.day) {
          out.push({ action: 'SHORTEN_DAY', why, target: issue.day });
        } else {
          out.push({ action: 'REDUCE_SCOPE_OR_ADD_EVIDENCE', why });
        }
        break;
      case 'TRANSFER_BUFFER_INSUFFICIENT':
        out.push({ action: 'ADD_BUFFER', why, ...(issue.item_id ? { target: issue.item_id } : {}) });
        break;
      case 'REACHABILITY_ISSUE':
        out.push({
          action: 'CHANGE_TRANSPORT',
          why,
          ...(issue.item_id ? { target: issue.item_id } : {}),
        });
        break;
      case 'FATIGUE_THRESHOLD_EXCEEDED':
        out.push({
          action: 'REDUCE_SCOPE_OR_ADD_EVIDENCE',
          why,
          ...(issue.item_id ? { target: issue.item_id } : {}),
        });
        break;
      case 'TIME_WINDOW_OVERLAP':
        if (!issue.item_id) {
          out.push({ action: 'REDUCE_SCOPE_OR_ADD_EVIDENCE', why });
          break;
        }
        {
          const laterId = issue.item_id;
          let agg = overlapAgg.get(laterId);
          if (!agg) {
            agg = { anchors: new Set(), whys: [] };
            overlapAgg.set(laterId, agg);
          }
          if (issue.related_item_id) {
            agg.anchors.add(issue.related_item_id);
          }
          agg.whys.push(why);
        }
        break;
      default:
        out.push({ action: 'REDUCE_SCOPE_OR_ADD_EVIDENCE', why: `${why} [unknown issue type]` });
    }
  }

  // TIME_WINDOW_OVERLAP 对应项排在非 overlap 映射之后（repair.apply 内部会再按 action 排序，一般无影响）
  for (const [laterId, agg] of overlapAgg) {
    const mergedWhy = agg.whys.join(' | ');
    if (agg.anchors.size === 0) {
      out.push({ action: 'ADD_BUFFER', why: mergedWhy, target: laterId });
    } else if (agg.anchors.size === 1) {
      const [only] = [...agg.anchors];
      out.push({ action: 'ADD_BUFFER', why: mergedWhy, target: laterId, buffer_anchor_item_id: only });
    } else {
      out.push({
        action: 'ADD_BUFFER',
        why: mergedWhy,
        target: laterId,
        buffer_anchor_item_ids: [...agg.anchors],
      });
    }
  }

  return out;
}
