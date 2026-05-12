/**
 * 冰岛租车保险关键词词表（本地四大车行 + Booking 通用名）。
 *
 * 与 {@link collectIcelandInsurancePolicyIssues} 配套；正则按「整词 / 短语」优先，减少误报。
 */

/** 任一命中 */
export function insuranceLexiconMatchAny(text: string, patterns: readonly RegExp[]): boolean {
  const t = String(text ?? '');
  return patterns.some((r) => r.test(t));
}

/** 零自付额 / 全险档（命中则 GP/SAAP 缺口规则通常可视为已覆盖） */
export const ICELAND_INSURANCE_LEXICON_ZERO_EXCESS: readonly RegExp[] = [
  /\bzero[\s-]?excess\b/i,
  /\bzero[\s-]?deductible\b/i,
  /\bno[\s-]?excess\b/i,
  /\binsured[\s-]?to[\s-]?zero\b/i,
  /\bexcess[\s-]?reimbursement\b/i,
  /\bliability[\s-]?release\b/i,
  /** Rentalcars / OTA：全险 + 零起赔额（不等同于仅 CDW） */
  /\bfull[\s-]?insurance\b.*\bzero[\s-]?deductible\b/i,
  /\bfull[\s-]?protection\b/i,
  /\bfull[\s-]?cover\b/i,
  /\ball[\s-]?inclusive\b/i,
  /\bpremium[\s-]?plus\b/i,
  /\bplatinum\+?\b/i,
  /** 车行 API 缩写：SCDW 常伴随全险档；裸 CDW 不视为零免赔 */
  /\bscdw\b/i,
  /\bsuper[\s-]?cdw\b/i,
  /\bgold[\s-]?package\b/i,
  /\bblue\b.*\b(premium|platinum|liability\s*release)\b/i,
  /\blotus\b.*\b(platinum|gold|premium)\b/i,
  /\bzero\b.*\b(all[\s-]?inclusive|premium|platinum)\b/i,
  /\blava\b.*\b(full[\s-]?protection|premium|plus)\b/i,
  /免赔\s*0|0\s*免赔|全险|超级全险|零免赔/i,
];

/** 碎石险 GP / 等价 */
export const ICELAND_INSURANCE_LEXICON_GRAVEL: readonly RegExp[] = [
  /\bGP\b/i,
  /\bgravel\b/i,
  /\bgravel[\s-]?protection\b/i,
  /** OTA 混写「Stone Protection」或单列 stone（租车语境） */
  /\bstone\b/i,
  /\bstone[\s-]?(chip|protection)\b/i,
  /\broad[\s-]?surface\b.*\b(protection|insurance)\b/i,
  /碎石险|砂石险|碎石保护/i,
];

/** 沙尘 / 火山灰 SAAP 或等价 */
export const ICELAND_INSURANCE_LEXICON_SAND_ASH: readonly RegExp[] = [
  /\bSAAP\b/i,
  /** 部分供应商 / APICSV 用 SAP 表示 Sand-Ash Pack */
  /\bSAP\b/i,
  /\bsand\s*(and|&)?\s*ash\b/i,
  /\bash\s*(and|&)?\s*sand\b/i,
  /** 单列 ash（火山灰条款摘要） */
  /\bash\b/i,
  /\bvolcanic[\s-]?(ash|dust)\b/i,
  /\bstorm[\s-]?protection\b/i,
  /沙尘险|火山灰/i,
];

/** 基础险 / 高免赔（用于「环境复杂 + 条款偏弱」组合提示） */
export const ICELAND_INSURANCE_LEXICON_BASIC_OR_HIGH_EXCESS: readonly RegExp[] = [
  /\bbasic\b/i,
  /\bstandard\s*cover\b/i,
  /\bhigh[\s-]?excess\b/i,
  /\bexcess[\s-]?(?:EUR|USD|ISK)?\s*[1-9]\d{3,}\b/i,
  /基础险|高免赔|起赔额\s*高/i,
];

export const ICELAND_INSURANCE_LEXICON = {
  ZERO_EXCESS: ICELAND_INSURANCE_LEXICON_ZERO_EXCESS,
  GRAVEL: ICELAND_INSURANCE_LEXICON_GRAVEL,
  SAND_ASH: ICELAND_INSURANCE_LEXICON_SAND_ASH,
  BASIC_OR_HIGH_EXCESS: ICELAND_INSURANCE_LEXICON_BASIC_OR_HIGH_EXCESS,
} as const;
