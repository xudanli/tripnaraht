/**
 * 复合意图：同一句中的 CRUD + 咨询并列解析与执行顺序（CRUD 优先，咨询 follow-up）。
 */

import { matchIntentProfiles } from './intent-profile-registry';
import type { IntentMatchContext, IntentProfileId } from './intent-profile.types';

export type CompoundClauseKind = 'CRUD' | 'DATA_LOOKUP' | 'OTHER';

export interface CompoundIntentClause {
  text: string;
  kind: CompoundClauseKind;
  profileIds: IntentProfileId[];
}

export interface CompoundIntentPlan {
  isCompound: boolean;
  clauses: CompoundIntentClause[];
  crudClauses: string[];
  dataLookupClauses: string[];
  /** CRUD 子句合并（供逐条短路尝试） */
  crudMessages: string[];
}

const COMPOUND_SPLIT_RE =
  /(?:，|,|；|;|\s*顺便|\s*同时|\s*并且|\s*以及(?:帮我|看看)?|\s*另外(?:帮我|看看)?|\s*还有(?:一个问题|一事)?)/u;

/** 将用户句拆分为可独立分类的子句 */
export function splitCompoundClauses(message: string): string[] {
  const raw = String(message ?? '').trim();
  if (!raw) return [];
  const parts = raw
    .split(COMPOUND_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
  return parts.length > 0 ? parts : [raw];
}

function classifyClause(clause: string, ctx: IntentMatchContext): CompoundIntentClause {
  const matches = matchIntentProfiles(clause, ctx);
  const profileIds = matches.map((m) => m.profile.id);
  let kind: CompoundClauseKind = 'OTHER';
  if (matches.some((m) => m.profile.route === 'CRUD_SHORT_CIRCUIT')) kind = 'CRUD';
  else if (matches.some((m) => m.profile.route === 'DATA_LOOKUP')) kind = 'DATA_LOOKUP';
  return { text: clause, kind, profileIds };
}

/** 解析复合意图计划：识别是否多意图，并拆分 CRUD / DATA_LOOKUP 队列 */
export function parseCompoundIntentPlan(
  message: string,
  ctx: IntentMatchContext = {},
): CompoundIntentPlan {
  const clauses = splitCompoundClauses(message).map((c) => classifyClause(c, ctx));
  const crudClauses = clauses.filter((c) => c.kind === 'CRUD').map((c) => c.text);
  const dataLookupClauses = clauses.filter((c) => c.kind === 'DATA_LOOKUP').map((c) => c.text);
  const isCompound =
    (crudClauses.length > 0 && dataLookupClauses.length > 0) ||
    crudClauses.length > 1 ||
    dataLookupClauses.length > 1;

  return {
    isCompound,
    clauses,
    crudClauses,
    dataLookupClauses,
    crudMessages: crudClauses.length ? crudClauses : isCompound ? [] : [message.trim()],
  };
}

export function buildCompoundDataLookupFollowupText(clauses: string[]): string {
  return clauses.map((c) => c.trim()).filter(Boolean).join('；');
}
