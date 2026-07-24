import type { GuideImportPreviewView } from '../types/guide-to-plan.types';

const RISK_PATTERN = /不建议|风险|避坑|注意|关闭|预约|排队|危险|冬季.*(?:自驾|驾驶)/i;
const RESTAURANT_PATTERN = /餐厅|美食|吃|restaurant|café|cafe|必吃/i;
const HOTEL_PATTERN = /酒店|住宿|hotel|guesthouse|bnb|民宿/i;

/**
 * 导入页「预计提取」轻量启发式（解析前），非 LLM。
 */
export function estimateImportPreview(
  combinedText: string,
  guideCount: number,
): GuideImportPreviewView {
  if (!combinedText.trim()) {
    return {
      guideCount,
      estimatedPlaces: 0,
      estimatedRestaurants: 0,
      estimatedHotels: 0,
      estimatedRisks: 0,
    };
  }

  const lines = combinedText
    .split(/\n+/)
    .map((l) => l.replace(/^[\d\-*•·]+\s*/, '').trim())
    .filter((l) => l.length >= 2 && l.length <= 120);

  let places = 0;
  let restaurants = 0;
  let hotels = 0;
  let risks = 0;

  for (const line of lines) {
    if (/^https?:\/\//i.test(line)) continue;
    if (RISK_PATTERN.test(line)) risks++;
    if (RESTAURANT_PATTERN.test(line)) restaurants++;
    else if (HOTEL_PATTERN.test(line)) hotels++;
    else if (looksLikePlaceLine(line)) places++;
  }

  return {
    guideCount,
    estimatedPlaces: Math.min(places, 60),
    estimatedRestaurants: Math.min(restaurants, 30),
    estimatedHotels: Math.min(hotels, 20),
    estimatedRisks: Math.min(risks, 15),
  };
}

function looksLikePlaceLine(line: string): boolean {
  if (/建议|费用|预算|day\s*\d|第\s*\d+\s*天/i.test(line)) return false;
  return /[\u4e00-\u9fff]{2,}/.test(line) || /[A-Za-z]{3,}/.test(line);
}
