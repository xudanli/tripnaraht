/**
 * 冰岛「意图车型」词表 — 与 {@link buildVirtualCarRentalRowsFromIntent} 配套。
 *
 * - 仅做 **NFC + NFD 去重音** 的规范化，便于 Norðurland、Landmannalaugar 等上下文与英文车型混写时稳定匹配。
 * - 命中顺序：**先 4WD 标杆，再 2WD 禁区**（避免 Duster 等歧义被经济车规则吃掉）。
 *
 * 证据权重为产品语义文档位（供 BBR / 面板）；仲裁 severity 仍由 arbitrator 决定。
 */

/** 与下游审计 / 面板对齐的类别标签 */
export type IcelandIntentVehicleLexiconCategory = 'CRITICAL_2WD' | 'HIGH_TRUSTED_4WD';

/** 文档位：关键词桶 → 相对权重（非数值 slack） */
export const ICELAND_INTENT_VEHICLE_LEXICON_WEIGHT: Record<IcelandIntentVehicleLexiconCategory, 'HIGH' | 'MEDIUM'> = {
  CRITICAL_2WD: 'HIGH',
  HIGH_TRUSTED_4WD: 'HIGH',
};

/**
 * 规范化用户话术 / 偏好文本：小写 + 去组合音标（ð→d 等由 NFD 剥离实现）。
 */
export function normalizeIcelandVehicleIntentText(raw: string): string {
  const s = String(raw ?? '');
  try {
    return s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

/** 4WD / 越野意图：子串匹配（已 normalize） */
const SUBSTR_4WD: readonly string[] = [
  'dacia duster',
  'duster 4',
  'duster4',
  'land cruiser',
  'landcruiser',
  'lc200',
  'lc150',
  'prado',
  'defender',
  'wrangler',
  'bronco',
  'patrol',
  'hilux',
  'ranger',
  'raptor',
  'g-class',
  'g63',
  'jimny',
  'jimney',
  '4x4',
  'four wheel',
  'forester',
  'outback',
  'crosstrek',
  '帕杰罗',
  '牧马人',
  '陆巡',
  '兰德酷路泽',
  '四驱',
  '全驱',
];

/** 2WD / 经济车禁区：子串匹配（已 normalize） */
const SUBSTR_2WD: readonly string[] = [
  'yaris',
  'vitz',
  'aygo',
  'vw up',
  'polo',
  'fabia',
  'micra',
  'march',
  'versa',
  'fit',
  'jazz',
  'swift',
  'i10',
  'i20',
  'rio',
  'picanto',
  'morning',
  'spark',
  'mirage',
  'mazda2',
  'demio',
  'fiesta',
  'fiat 500',
  'clio',
  'zoe',
  'leaf',
  'bolt',
  'e-golf',
  'accent',
  'elantra',
  'sentra',
  'jetta',
  'passat',
  'mini cooper',
  'bmw 1',
  'tesla model 3',
  'model 3',
  '雅力士',
  '威驰',
  '致炫',
  '飞度',
  '波罗',
  '五菱',
  'economy',
  'compact',
  '微型车',
  '小型车',
  '最便宜的租车',
];

/** 在 4WD 桶中需整词匹配的拉丁 token（避免误伤） */
const REGEX_4WD_EXTRA: readonly RegExp[] = [
  /\b4wd\b/i,
  /\bawd\b/i,
  /\bsuv\b/i,
  /\bjeep\b/i,
  /\bdacia\s+duster\b/i,
  /\bduster\b/i,
];

/** 在 2WD 桶中需整词匹配的拉丁 token */
const REGEX_2WD_EXTRA: readonly RegExp[] = [
  /\b2wd\b/i,
  /\bfwd\b/i,
  /\bmini\b/i,
  /\bcorolla\b(?!\s*cross)/i,
  /\bcivic\b(?!\s*type)/i,
];

export function lexiconMatchFourWheelIntent(normalized: string): boolean {
  for (const x of SUBSTR_4WD) {
    if (normalized.includes(x)) return true;
  }
  for (const r of REGEX_4WD_EXTRA) {
    if (r.test(normalized)) return true;
  }
  return false;
}

export function lexiconMatchTwoWheelIntent(normalized: string): boolean {
  for (const x of SUBSTR_2WD) {
    if (normalized.includes(x)) return true;
  }
  for (const r of REGEX_2WD_EXTRA) {
    if (r.test(normalized)) return true;
  }
  if (/二驱|两驱|前驱/.test(normalized)) return true;
  return false;
}
