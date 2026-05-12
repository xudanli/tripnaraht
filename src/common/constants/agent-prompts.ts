/**
 * Agent 澄清 / 引导文案矩阵（Fallback）。
 * 逻辑仍输出 GapCode；展示文案由此集中维护，便于 i18n 与后续接模板库 / LLM 润色。
 *
 * @see src/agent/utils/clarification-question-generator.util.ts
 */

export type ClarificationLocale = 'zh' | 'en';

export function resolveClarificationLocale(raw?: string | null): ClarificationLocale {
  const l = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  if (!l) return 'zh';
  if (l === 'en' || l.startsWith('en-')) return 'en';
  return 'zh';
}

/** Orchestrator answerText / clarifyMessage 头部 */
export const CLARIFICATION_INTRO = {
  zh: {
    plain: '为了更好地规划您的行程，请回答以下问题。',
    numberedPrefix: '为了更好地规划您的行程，请回答以下问题：\n',
  },
  en: {
    plain: 'To plan your trip better, please answer the following.',
    numberedPrefix: 'To plan your trip better, please answer the following:\n',
  },
} as const;

export function clarificationIntroPlain(localeRaw?: string | null): string {
  const loc = resolveClarificationLocale(localeRaw);
  return CLARIFICATION_INTRO[loc].plain;
}

export function clarificationIntroNumberedPrefix(localeRaw?: string | null): string {
  const loc = resolveClarificationLocale(localeRaw);
  return CLARIFICATION_INTRO[loc].numberedPrefix;
}

type GapStrings = {
  question: string;
  hint?: string;
  placeholder?: string;
  options?: string[];
};

const MISSING_DESTINATION: Record<ClarificationLocale, GapStrings> = {
  zh: {
    question: '请选择您的目的地',
    placeholder: '例如：冰岛、日本、瑞士',
    hint: '这将帮助我们为您推荐合适的景点和活动',
  },
  en: {
    question: 'Where would you like to go?',
    placeholder: 'e.g. Iceland, Japan, Switzerland',
    hint: 'This helps us recommend suitable places and activities.',
  },
};

const MISSING_DATES_DEPARTURE: Record<ClarificationLocale, GapStrings> = {
  zh: {
    question: '请选择您的出行日期',
    hint: '建议选择 1 个月后的日期，以便提前预订',
  },
  en: {
    question: 'When do you plan to travel?',
    hint: 'We recommend dates about one month out for easier booking.',
  },
};

const MISSING_DATES_RETURN: Record<ClarificationLocale, GapStrings> = {
  zh: {
    question: '请选择您的返回日期',
    hint: '返回日期必须晚于出发日期',
  },
  en: {
    question: 'When is your return date?',
    hint: 'Return date must be after departure.',
  },
};

const MISSING_CONSTRAINTS_PARTY: Record<ClarificationLocale, GapStrings> = {
  zh: {
    question: '同行人数',
    hint: '这将影响住宿和交通安排',
    options: ['1人', '2人', '3-4人', '5人以上'],
  },
  en: {
    question: 'Party size',
    hint: 'This affects lodging and transport.',
    options: ['Solo', '2 travelers', '3–4 travelers', '5+ travelers'],
  },
};

const MISSING_CONSTRAINTS_BUDGET: Record<ClarificationLocale, GapStrings> = {
  zh: {
    question: '总预算（人民币）',
    placeholder: '例如：100000',
    hint: '包含机票、住宿、餐饮、活动等所有费用',
  },
  en: {
    question: 'Total budget (CNY)',
    placeholder: 'e.g. 100000',
    hint: 'Includes flights, lodging, meals, activities, etc.',
  },
};

const MISSING_PREFERENCES_INTERESTS: Record<ClarificationLocale, GapStrings> = {
  zh: {
    question: '您的主要兴趣（可多选）',
    hint: '帮助我们为您推荐合适的景点和活动',
    options: ['极光', '冰川', '温泉', '文化', '美食', '户外运动', '购物', '摄影'],
  },
  en: {
    question: 'Main interests (multi-select)',
    hint: 'Helps us tailor recommendations.',
    options: [
      'Northern lights',
      'Glaciers',
      'Hot springs',
      'Culture',
      'Food',
      'Outdoor sports',
      'Shopping',
      'Photography',
    ],
  },
};

const MISSING_PREFERENCES_PACE: Record<ClarificationLocale, GapStrings> = {
  zh: {
    question: '节奏偏好',
    hint: '轻松：每天安排较少活动；平衡：适中安排；紧凑：尽可能多安排活动',
    options: ['轻松', '平衡', '紧凑'],
  },
  en: {
    question: 'Pace preference',
    hint: 'Relaxed: fewer daily activities; Balanced; Packed: maximize activities.',
    options: ['Relaxed', 'Balanced', 'Packed'],
  },
};

const SPEC_TYPE_ERROR = {
  zh: {
    questionPrefix: '【意图语法错误】',
    questionSuffix: '。请补充或修正关键字段后重试。',
    placeholder: '请用一句话补充：目的地/日期/天数/交通方式等',
    hint: '这是编译器级语法/类型检查，信息缺失将导致后续物理推演不可用。',
  },
  en: {
    questionPrefix: '[Intent syntax error] ',
    questionSuffix: '. Please fix or add key fields and retry.',
    placeholder: 'One line: destination / dates / duration / transport mode, etc.',
    hint: 'Compiler-level checks; missing fields block downstream planning.',
  },
} as const;

const INTENT_COMPILE_ERROR = {
  zh: {
    questionPrefix: '【意图编译失败】',
    hint: '这是物理下界校验失败：即使在最理想情况下也无法满足硬约束。',
    options: ['增加天数', '缩小范围/减少必去点', '改为更快交通方式', '我想重新描述需求'],
  },
  en: {
    questionPrefix: '[Intent compile failed] ',
    hint: 'Hard feasibility bound violated; relax constraints or replan.',
    options: ['Add days', 'Narrow scope / fewer must-sees', 'Faster transport', 'Rephrase my request'],
  },
} as const;

export function clarificationGapMissingDestination(locale: ClarificationLocale): GapStrings {
  return MISSING_DESTINATION[locale];
}

export function clarificationGapMissingDatesDeparture(locale: ClarificationLocale): GapStrings {
  return MISSING_DATES_DEPARTURE[locale];
}

export function clarificationGapMissingDatesReturn(locale: ClarificationLocale): GapStrings {
  return MISSING_DATES_RETURN[locale];
}

export function clarificationGapMissingConstraintsParty(locale: ClarificationLocale): GapStrings {
  return MISSING_CONSTRAINTS_PARTY[locale];
}

export function clarificationGapMissingConstraintsBudget(locale: ClarificationLocale): GapStrings {
  return MISSING_CONSTRAINTS_BUDGET[locale];
}

export function clarificationGapMissingPreferencesInterests(locale: ClarificationLocale): GapStrings {
  return MISSING_PREFERENCES_INTERESTS[locale];
}

export function clarificationGapMissingPreferencesPace(locale: ClarificationLocale): GapStrings {
  return MISSING_PREFERENCES_PACE[locale];
}

export function clarificationGapSpecTypeError(locale: ClarificationLocale, detail: string): GapStrings {
  const b = SPEC_TYPE_ERROR[locale];
  return {
    question: `${b.questionPrefix}${detail}${b.questionSuffix}`,
    placeholder: b.placeholder,
    hint: b.hint,
  };
}

export function clarificationGapIntentCompileError(locale: ClarificationLocale, detail: string): GapStrings {
  const b = INTENT_COMPILE_ERROR[locale];
  return {
    question: `${b.questionPrefix}${detail}`,
    hint: b.hint,
    options: [...b.options],
  };
}

/** MISSING_PREFERENCES「平衡」默认值 — option label 随 locale 变化 */
export function clarificationDefaultPaceOption(locale: ClarificationLocale): string {
  return locale === 'en' ? 'Balanced' : '平衡';
}
