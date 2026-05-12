/**
 * ContextRetriever：从决策 history 与对话文本中回溯「最近可用的坐标事实」。
 * 与 `transport-endpoint-hydration` 配合，实现指代消解（起点/终点）的 MV-DO 可追溯来源。
 */

import { tryParseLatLngPairFromString } from '../../../skills/transport/transport-search.skill';

export type ContextRetrieverRole = 'origin' | 'destination';

/** 从单条文本中提取所有合法 lat,lng 对（出现顺序） */
export function extractCoordinatePairsFromText(text: string): Array<{ lat: number; lng: number }> {
  const raw = String(text ?? '');
  const re = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
  const out: Array<{ lat: number; lng: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const p = tryParseLatLngPairFromString(`${m[1]},${m[2]}`);
    if (p) out.push(p);
  }
  return out;
}

export class ContextRetriever {
  /**
   * 逆序遍历 recent_messages（末尾为最新），抽取坐标串；origin 取最新一对，destination 取与第一对明显不同的下一对，否则 undefined。
   */
  static findLastResolvedCoordinateFromMessages(
    recentMessages: string[] | undefined,
    role: ContextRetrieverRole,
  ): { lat: number; lng: number } | undefined {
    if (!recentMessages?.length) return undefined;
    const collected: Array<{ lat: number; lng: number }> = [];
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const pairs = extractCoordinatePairsFromText(String(recentMessages[i] ?? ''));
      for (const p of pairs) collected.push(p);
    }
    if (!collected.length) return undefined;
    if (role === 'origin') return collected[0];
    const first = collected[0];
    const distinct = collected.find(
      (p) => Math.abs(p.lat - first.lat) + Math.abs(p.lng - first.lng) > 1e-4,
    );
    return distinct;
  }
}
