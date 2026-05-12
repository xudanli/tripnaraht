/**
 * 轻量 DATA_LOOKUP RAG 路径前的主题关联度估计（无向量库调用），用于短路节省 Token / 延迟。
 * 与 `ClaudeOrchestratorService.isPreparationGearTravelQuery` 等保持语义对齐。
 */

import { isDiningRecommendationQuery } from './trip-dining-consultation.util';

export const LIGHTWEIGHT_KB_RAG_RELEVANCE_THRESHOLD = 0.6;

/**
 * 直升机 / 空中观光 / 冰川观光等活动「预订向」咨询：KB 常有区域限制与安全口径，
 * 须进入 `isDataLookupRagSupplementQuery` + 关联度门控（本函数亦为高关联信号）。
 */
export function isActivityBookingRagSupplementQuery(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  const lower = m.toLowerCase();
  return (
    /直升机|直升飞机|空中观光|观光直升|观光飞行|飞越冰川|冰川.*直升|包机观光|水上飞机/i.test(m) ||
    /\b(helicopter|sightseeing\s*flight|scenic\s*flight)\b/i.test(lower)
  );
}

function matchesPreparationGearTravelQuery(m: string): boolean {
  const msg = m.trim();
  if (!msg) return false;
  return (
    /准备|行前|装备|清单|穿搭|冰爪|要带|打包|衣物|注意事项|睡袋|冲锋衣|洋葱式|层叠穿法|登山鞋|雨靴|暖宝宝|无人机|报备|转换插头|欧标|电话卡|e\s*[Ss]im|无人机报备|电源转换/i.test(msg) ||
    /checklist|packing|crampon|tips|建议.*带|注意.*安全/i.test(msg) ||
    /\b(layer(?:ing)?|hiking\s+boots|rain\s+gear|windproof|sim\s+card|esim)\b/i.test(msg.toLowerCase())
  );
}

function matchesCarRentalOrDrivingTravelQuery(m: string): boolean {
  const msg = m.trim();
  if (!msg) return false;
  const lower = msg.toLowerCase();
  const transportZh =
    /租车|自驾|包车|提车|还车|租车行|用车|车型|四驱|SUV|路况|交规|碎石路|碎石险|火山灰|风沙险|车门.*风|驾照|开车|保险|SAAP|ASH|涉水|拖车|闭路|封路|加油卡|加油|充电桩|停车费|气象官网|路况官网|能开吗/i.test(
      msg,
    );
  const fRoadOrNumber = /f\s*路|f-road|\bf\s*\d{2,4}\b/i.test(lower);
  const icelandRoadBrand = /\bN1\b|olis|ölis/i.test(msg);
  const transportEn =
    /\b(car\s+rental|rent(?:ing)?\s+a\s+car|self[- ]drive|driving\s+in|road\s+rules|rental\s+car|gravel\s+protection|sand\s+and\s+ash|insurance|gas\s+station|charging\s+station|river\s+crossing)\b/i.test(
      lower,
    );
  const roadDotIs = /road\.is|vedur\.is|\bvedur\b/i.test(lower);
  return transportZh || fRoadOrNumber || icelandRoadBrand || transportEn || roadDotIs;
}

function matchesPolarInfrastructureOrEmergencyQuery(m: string): boolean {
  const msg = m.trim();
  if (!msg) return false;
  const lower = msg.toLowerCase();
  const rescue =
    /救援|求助|报警|警察|\b112\b|坏车|爆胎|陷车|黄警|红警|风暴预警|地震|火山|safetravel|safe\s*travel/i.test(msg) ||
    /\b(safe\s*travel|emergency)\b/i.test(lower);
  const infraCost =
    /极光|kp值|kp\s*\d|极光预测|蓝冰洞|观鲸|物价|消费|刷卡|现金|退税|超市|小费|马路|无人区|营地/i.test(msg) ||
    /\b(aurora|northern\s+lights|ice\s*cave|whale\s+watching|vat\s+refund|supermarket)\b/i.test(lower);
  const icelandShort =
    /\bf路\b|f-road|\bf\s*\d{2,4}\b|碎石险|火山灰|涉水|vedur|road\.is|风暴|封路|闭路/i.test(lower);
  return rescue || infraCost || icelandShort;
}

/**
 * 返回 [0,1]：与旅行知识库常见主题（极地/自驾/行前/餐饮/签证季节等）的启发式关联度。
 * 仅用于短路判定，非语义嵌入模型分数。
 */
export function estimateLightweightKbTopicRelevanceScore(message: string): number {
  const m = message.trim();
  if (!m) return 0;
  const lower = m.toLowerCase();

  if (matchesPreparationGearTravelQuery(m)) return 0.92;
  if (matchesCarRentalOrDrivingTravelQuery(m)) return 0.92;
  if (matchesPolarInfrastructureOrEmergencyQuery(m)) return 0.92;
  if (isDiningRecommendationQuery(m)) return 0.88;
  if (isActivityBookingRagSupplementQuery(m)) return 0.88;

  let score = 0;

  const destinationHints =
    /冰岛|挪威|芬兰|瑞典|丹麦|格陵兰|斯瓦尔巴|罗弗敦|苏格兰|法罗|北极|南极|新西兰|欧洲|申根|环岛|自驾游|目的地|行程规划/i.test(m) ||
    /\b(iceland|norway|finland|sweden|denmark|greenland|svalbard|lofoten|schengen|arctic|fjord)\b/i.test(lower);

  const kbTopicKeywords =
    /签证|季节|路况|安全|极光|蓝冰洞|观鲸|徒步|装备|租车|住宿|退税|刷卡|物价|消费|风暴|封路|碎石|保险|入境|海关|机票|火车|轮渡|超市|小费/i.test(m) ||
    /\b(aurora|northern\s+lights|ice\s*cave|whale\s+watching|visa|season|rental|insurance)\b/i.test(lower);

  const genericConsultation =
    /适合|什么人|哪种|哪类|人群|体质|新手|亲子|老人|值不值|攻略|指南|注意|安全|签证|季节/i.test(m);

  if (destinationHints) score += 0.45;
  if (kbTopicKeywords) score += 0.45;
  if (genericConsultation) score += 0.15;

  const encyclopedicWorldFact =
    /什么是|多少|几个|人口|面积|首都|成立于|哪一年|GDP|宏观|统计|世界第|排名第/i.test(m);
  if (encyclopedicWorldFact && !destinationHints && !kbTopicKeywords) {
    score -= 0.5;
  }

  return Math.min(1, Math.max(0, score));
}
