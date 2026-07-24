/**
 * Persona Alerts BFF — reason code → 中文 SSOT（C 端不得解析裸码）
 * @see docs/persona-alerts-bff-contract.md
 */

export type PersonaAlertReasonCodeEntry = {
  displayZh: string;
  explanationTemplate: string;
};

/** 新增码必须先入表再返回 C 端 */
export const PERSONA_ALERT_REASON_CODE_ZH: Record<string, PersonaAlertReasonCodeEntry> = {
  ABU_FATAL_REJECT: {
    displayZh: '安全门控拒绝',
    explanationTemplate: '当前方案存在不可接受的安全风险，需要调整后再继续规划。',
  },
  HIGH_WIND_DRIVING: {
    displayZh: '大风不宜自驾',
    explanationTemplate: '第 {day} 天大风条件下不建议自驾，请改用公共交通或缩短户外段。',
  },
  CLOSURE_RISK: {
    displayZh: '闭园风险',
    explanationTemplate: '{place} 在您计划到达时段可能不开放，请改时间或替换地点。',
  },
  PACE_OVERLOAD: {
    displayZh: '行程节奏过紧',
    explanationTemplate: '当天安排过多，建议减少站点或增加缓冲。',
  },
  BUFFER_INSUFFICIENT: {
    displayZh: '转场缓冲不足',
    explanationTemplate: '相邻行程之间预留时间不够，可能赶不上下一项。',
  },
  COVERAGE_GAP: {
    displayZh: '证据覆盖不足',
    explanationTemplate: '部分行程点尚未完成路线或开放时间验证，请打开决策检查器查看证据链。',
  },
  INTENT_REPAIR: {
    displayZh: '需结构修复',
    explanationTemplate: '原意图难以执行，系统有替代走法建议，请查看可执行证明。',
  },
  SPATIAL_REPAIR: {
    displayZh: '路线/空间需调整',
    explanationTemplate: '当前路线存在空间冲突，请查看可执行证明中的替代方案。',
  },
  GUARDIAN_ABU: {
    displayZh: '安全与规则',
    explanationTemplate: '安全门控发现需关注的规则或风险，请查看可执行证明。',
  },
  GUARDIAN_DRE: {
    displayZh: '节奏与强度',
    explanationTemplate: '行程节奏或体力负荷需要调整，请查看可执行证明。',
  },
  GUARDIAN_DRDRE: {
    displayZh: '节奏与强度',
    explanationTemplate: '行程节奏或体力负荷需要调整，请查看可执行证明。',
  },
  GUARDIAN_NEPTUNE: {
    displayZh: '路线与空间方案',
    explanationTemplate: '路线结构需要修复或替换，请查看可执行证明。',
  },
  HALLUCINATION_RISK: {
    displayZh: '内容风险标记',
    explanationTemplate: '部分叙述内容需要复核，请以可执行证明与证据为准。',
  },
};

const INTERNAL_OMIT_CODES = new Set([
  'HALLUCINATION_DETECTION',
  'FEEDBACK',
  'FEEDBACK_RECEIVED',
  'FEEDBACK_PERSIST',
  'NARRATE',
  'OPTIMIZE',
  'POI_SELECTION',
]);

export function isInternalPersonaAlertReasonCode(code: string): boolean {
  const key = String(code ?? '').trim();
  if (!key) return true;
  if (INTERNAL_OMIT_CODES.has(key)) return true;
  const base = key.split(':')[0];
  return INTERNAL_OMIT_CODES.has(base);
}

export function mapPersonaAlertReasonCodesDisplayZh(
  codes: string[] | undefined,
): { displayZh: string[]; templateExplanation?: string } {
  if (!codes?.length) return { displayZh: [] };

  const displayZh: string[] = [];
  let templateExplanation: string | undefined;

  for (const raw of codes) {
    const key = String(raw).trim();
    if (!key || isInternalPersonaAlertReasonCode(key)) continue;

    const base = key.split(':')[0];
    const entry = PERSONA_ALERT_REASON_CODE_ZH[key] ?? PERSONA_ALERT_REASON_CODE_ZH[base];
    if (!entry) continue;

    if (!displayZh.includes(entry.displayZh)) {
      displayZh.push(entry.displayZh);
    }
    if (!templateExplanation) {
      templateExplanation = entry.explanationTemplate;
    }
  }

  return { displayZh, templateExplanation };
}
