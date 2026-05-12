/**
 * 驾驶/租车相关轻量 RAG 的 intent phase：避免把「租车事务」与「自驾安全」「路线规划」混为同一套多池召回。
 */

export type DrivingRagIntentPhase = 'rental_transaction' | 'driving_safety' | 'road_trip_planning';

/**
 * 仅当问句落在「车/驾/租」域内时返回 phase；否则返回 null（由调用方决定是否走租车分支）。
 */
export function classifyDrivingRagIntentPhase(message: string): DrivingRagIntentPhase | null {
  const m = message.trim();
  if (!m) return null;
  const lower = m.toLowerCase();

  const hasCarContext =
    /租车|自驾|开车|包车|提车|还车|路况|用车|驾照|SUV|四驱|碎石|f\s*路|f-road|\bcar\s+rental|self[-\s]?drive|rental\s+car/i.test(m) ||
    /\b(rental|driving|gravel)\b/i.test(lower);

  const roadTripPlanning =
    /环岛|绕岛|分段\s*开|行程.*安排|自驾.*(安排|规划|攻略)|路线.*(规划|安排)|几天.*(一圈|环岛)|多日|绕\s*岛|补给|露营|过夜.*(城镇|点)/i.test(m) ||
    /\b(ring\s*road|itinerary|route\s*plan)\b/i.test(lower);
  if (roadTripPlanning && (hasCarContext || /环岛|绕岛|ring/i.test(m))) {
    return 'road_trip_planning';
  }

  const drivingSafety =
    /危险|安全|注意.*(开|驾驶)|冬天.*开|冬季|路况|能见|黑冰|风速|打滑|翻车|封路|风暴|暴雪|结冰|夜间.*开|疲劳|山路|垭口|山口|陷车|爆胎|坏车|车门.*风|能开吗|交规|涉水/i.test(m) ||
    /\bf[-\s]?road|碎石路|碎石险|火山灰|风沙险|road\.is|vedur\.is|\bvedur\b/i.test(lower);
  if (drivingSafety) {
    return 'driving_safety';
  }

  if (
    hasCarContext ||
    /\b(gas\s+station|charging\s+station|river\s+crossing|sand\s+and\s+ash|gravel\s+protection)\b/i.test(lower)
  ) {
    return 'rental_transaction';
  }

  return null;
}

/** 事务型租车：扩写 query，便于 practical 池命中保险/提还车/车型等文档，而非泛冰岛百科。 */
export function expandedRentalTransactionRagQuery(message: string): string {
  const m = message.trim() || '租车';
  const hints = ['保险', '碎石险', '提车', '还车', '驾照', '车型', '租车平台'];
  const parts = hints.filter((h) => !m.includes(h));
  return [m, ...parts].join(' ').replace(/\s+/g, ' ').trim();
}
