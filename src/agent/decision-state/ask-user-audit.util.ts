/**
 * ASK_USER 出站审计（INV-01 运行时契约）。
 * 生成不出完整审计 → 禁止 ASK 出站。
 */

import type {
  DecisionReadinessResult,
  DecisionStateContract,
  DecisionStateProjection,
  StateKey,
} from './decision-state.types';

export type AskUserAuditV1 = {
  schema: 'tripnara.decision_ask_user_audit@v1';
  next_action: 'ASK_USER';
  decision_class: string;
  missing_key: StateKey;
  declared_by: string;
  required: boolean;
  acquisition_attempt: string[];
  result: {
    presence: string;
    note_zh?: string;
    value?: unknown;
  };
  why_user: 'no_authoritative_system_source' | 'user_owned_gap' | 'confirm_partial';
  question: string;
  /** 审计不完整时不得出站 */
  complete: boolean;
  incomplete_reasons: string[];
};

const KEY_ACQUISITION_CHAIN: Partial<Record<StateKey, string[]>> = {
  day_anchor: ['message', 'page.focusDay', 'trip_day'],
  activity_ref: ['message', 'catalog', 'itinerary'],
  team_fitness_floor: ['trip_members', 'fitness_profile', 'aggregate_min'],
  trip_binding: ['request.trip_id'],
  dining_anchor: ['message', 'page.focusDay', 'region_lex'],
  vehicle_profile: ['message', 'trip_vehicle'],
  road_access: ['message', 'road_service'],
  party_size: ['trip_state', 'user_input'],
  selected_slot: ['user_prompt'],
  contact_info: ['user_profile', 'user_prompt'],
  payment_authorization: ['user_confirm'],
  live_availability: ['provider_live'],
};

export function buildAskUserAudit(input: {
  contract: DecisionStateContract;
  projection: DecisionStateProjection | null;
  readiness: DecisionReadinessResult;
  questionZh: string;
}): AskUserAuditV1 {
  const incomplete: string[] = [];
  const missingKey = input.readiness.askUserKeys[0];
  if (!missingKey) incomplete.push('missing_key');
  if (input.readiness.nextAction !== 'ASK_USER') incomplete.push('next_action_not_ask');

  const decl = input.contract.keys.find((k) => k.key === missingKey);
  if (!decl) incomplete.push('key_not_declared_in_contract');

  const projected = input.projection?.keys.find((k) => k.key === missingKey);
  const acquisition = KEY_ACQUISITION_CHAIN[missingKey!] ?? [
    decl?.acquisition ?? 'unknown',
    decl?.source ?? 'unknown',
  ];

  let why: AskUserAuditV1['why_user'] = 'user_owned_gap';
  if (decl?.missingPolicy === 'NEED_CONFIRM') why = 'confirm_partial';
  if (decl?.acquisition === 'USER_PROMPT') why = 'no_authoritative_system_source';

  const complete = incomplete.length === 0 && Boolean(input.questionZh?.trim());
  if (!input.questionZh?.trim()) incomplete.push('empty_question');

  return {
    schema: 'tripnara.decision_ask_user_audit@v1',
    next_action: 'ASK_USER',
    decision_class: input.contract.decisionClass,
    missing_key: missingKey ?? ('day_anchor' as StateKey),
    declared_by: input.contract.version,
    required: decl?.necessity === 'REQUIRED' || decl?.necessity === 'CONDITIONAL',
    acquisition_attempt: acquisition,
    result: {
      presence: projected?.presence ?? 'MISSING',
      note_zh: projected?.noteZh,
      value: projected?.value,
    },
    why_user: why,
    question: String(input.questionZh ?? '').trim(),
    complete,
    incomplete_reasons: incomplete,
  };
}

/** INV-01 运行时：审计不完整则禁止 ASK 出站 */
export function assertAskUserAuditAllowsEgress(audit: AskUserAuditV1): boolean {
  return audit.complete === true && audit.next_action === 'ASK_USER';
}
