import type {
  VerificationIssue,
  VerificationIssueClass,
  VerificationIssueCode,
} from '../../decision/kernel/decision-state.types';

export type VerificationIssueRule = {
  id: string;
  /** Returns true if this rule matches the raw issue text */
  match: (text: string) => boolean;
  code: VerificationIssueCode;
  class: VerificationIssueClass;
  suggestedActions?: VerificationIssue['suggestedActions'];
};

const hasAny = (text: string, needles: string[]) => needles.some((n) => text.includes(n));

export const DEFAULT_VERIFICATION_ISSUE_RULES: VerificationIssueRule[] = [
  {
    id: 'fatal.destination_closed_disaster',
    match: (t) => hasAny(t, ['自然灾害', '灾害', '封锁', '全面关闭']),
    code: 'DESTINATION_CLOSED_DISASTER',
    class: 'FATAL',
    suggestedActions: [{ action: 'BLOCK', detail: 'destination unavailable' }],
  },
  {
    id: 'fatal.budget_order_magnitude',
    match: (t) =>
      hasAny(t, ['数量级']) ||
      (t.toLowerCase().includes('order of magnitude') && t.toLowerCase().includes('budget')),
    code: 'BUDGET_ORDER_OF_MAGNITUDE_MISMATCH',
    class: 'FATAL',
    suggestedActions: [{ action: 'ASK_USER', detail: 'budget mismatch: confirm constraints' }],
  },
  {
    id: 'conflict.poi_closed',
    match: (t) => hasAny(t, ['闭馆', 'closed']),
    code: 'POI_CLOSED',
    class: 'CONFLICT',
    suggestedActions: [{ action: 'REPLACE', detail: 'replace with an open POI' }],
  },
  {
    id: 'conflict.time_window',
    match: (t) => hasAny(t, ['时间窗']) || t.toLowerCase().includes('time window') || t.toLowerCase().includes('overlap'),
    code: 'TIME_WINDOW_OVERLAP',
    class: 'CONFLICT',
    suggestedActions: [{ action: 'REORDER', detail: 'swap/shift items to resolve time overlap' }],
  },
  {
    id: 'conflict.route_infeasible',
    match: (t) => hasAny(t, ['不可达', '道路关闭']) || t.toLowerCase().includes('infeasible') || t.toLowerCase().includes('road closed'),
    code: 'ROUTE_INFEASIBLE',
    class: 'CONFLICT',
    suggestedActions: [{ action: 'RELAX', detail: 'insert buffer or reduce density' }],
  },
  {
    id: 'conflict.sunset_visibility',
    match: (t) =>
      hasAny(t, ['日落', '黄昏', '日照', '天黑']) ||
      t.toLowerCase().includes('sunset') ||
      t.toLowerCase().includes('visibility') ||
      t.toLowerCase().includes('civil dusk'),
    code: 'SUNSET_BREACH',
    class: 'CONFLICT',
    suggestedActions: [{ action: 'REORDER', detail: 'move outdoor before dusk; move indoor after sunset' }],
  },
  {
    id: 'advisory.weather',
    match: (t) => hasAny(t, ['天气']) || t.toLowerCase().includes('weather'),
    code: 'WEATHER_RISK',
    class: 'ADVISORY',
  },
  {
    id: 'advisory.fatigue',
    match: (t) => hasAny(t, ['疲劳']) || t.toLowerCase().includes('fatigue'),
    code: 'FATIGUE_OVERLOAD',
    class: 'ADVISORY',
    suggestedActions: [{ action: 'RELAX', detail: 'reduce experience density to lower fatigue' }],
  },
];

export function classifyVerificationIssueFromText(params: {
  text: string;
  source?: VerificationIssue['source'];
  rules?: VerificationIssueRule[];
}): VerificationIssue | undefined {
  const t = (params.text ?? '').trim();
  if (!t) return undefined;
  const rules = params.rules ?? DEFAULT_VERIFICATION_ISSUE_RULES;
  const now = new Date().toISOString();

  const rule = rules.find((r) => {
    try {
      return r.match(t);
    } catch {
      return false;
    }
  });

  if (!rule) {
    return {
      code: 'UNKNOWN',
      class: 'ADVISORY',
      message: t,
      source: params.source ?? 'OTHER',
      at: now,
    };
  }

  return {
    code: rule.code,
    class: rule.class,
    message: t,
    suggestedActions: rule.suggestedActions,
    source: params.source ?? 'OTHER',
    at: now,
  };
}

