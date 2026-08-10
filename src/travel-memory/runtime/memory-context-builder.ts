/**
 * memory.build_context(contract) — 按 Memory Contract 装载，禁止万能上下文。
 *
 * CRE → Task → Memory Need Planner → Memory Contract → buildContext(contract)
 */

import { planMemoryNeeds } from '../planner/memory-need-planner';
import { resolvePaceConflict } from '../resolver/memory-authority-resolver';
import {
  buildTripMemoryView,
  buildUserProfileView,
} from '../views/memory-view-builder';
import type { MemoryLedgerStore } from '../ledger/memory-ledger.store';
import type {
  MemoryContextPackage,
  UserProfileMemoryView,
  TripMemoryView,
} from '../types/memory-context-package.types';
import type { DecisionEpisodeV1 } from '../episode/decision-episode.types';
import type { MemoryContractV1 } from '../types/memory-contract.types';
import type { MemoryExplainableContextV1 } from '../types/memory-explainability.types';
import type { BuildContextRequest } from './memory-api.types';
import {
  assertNoCandidateInDecisionContext,
  toDecisionSafeMemoryContext,
} from './decision-context-guard.util';

export const TRAVEL_MEMORY_DESIGN_PRINCIPLE =
  'Travel Memory 不是保存用户历史，而是保存能够影响未来旅行决策的证据。';

export const TRAVEL_MEMORY_EVIDENCE_PRINCIPLE_EN =
  'Memory is not a storage of conversations. Memory is a versioned evidence system that improves future decisions.';

/** V1 运营规则（验证期冻结） */
export const TRAVEL_MEMORY_OPS_RULE =
  'Memory 不负责让 Nara 记住更多，而负责让 Nara 在相似决策中犯更少相同的错误。';

export const SEMANTIC_MEMORY_BOUNDARY =
  'Semantic Memory is evidence retrieval, not preference inference. 语义记忆只能提供解释证据，不直接生成用户偏好。';

function buildExplainableContext(input: {
  structured: UserProfileMemoryView;
  tripMemory: TripMemoryView | null;
  episodes: DecisionEpisodeV1[];
  conflicts: MemoryContextPackage['conflicts'];
  working?: MemoryContextPackage['working'];
}): MemoryExplainableContextV1 {
  const preferences: MemoryExplainableContextV1['preferences'] = [];
  const confidence: MemoryExplainableContextV1['confidence'] = [];
  const evidence: MemoryExplainableContextV1['evidence'] = [];
  const facts: MemoryExplainableContextV1['facts'] = [];

  const pushPref = (preference: string, field?: UserProfileMemoryView['pace']) => {
    if (!field || field.status !== 'ACTIVE') return;
    preferences.push({
      preference,
      value: field.value,
      confidence: field.confidence,
      lifecycle: 'ACTIVE',
      evidence: [
        {
          type: field.sourceType === 'USER_EXPLICIT' ? 'EXPLICIT' : 'EPISODE',
          date: field.validFrom,
        },
      ],
    });
    confidence.push({ key: preference, confidence: field.confidence });
    evidence.push({
      type: field.sourceType === 'USER_EXPLICIT' ? 'EXPLICIT' : 'EPISODE',
      date: field.validFrom,
      summary: `${preference}=${String(field.value)}`,
    });
  };

  pushPref('travel.pace', input.structured.pace);
  pushPref('decision.riskTolerance', input.structured.riskTolerance);
  if (input.tripMemory?.paceOverride?.status === 'ACTIVE') {
    pushPref('trip.pace', input.tripMemory.paceOverride);
  }
  if (input.tripMemory?.temporaryConstraints) {
    facts.push({
      key: 'trip.temporaryConstraints',
      value: input.tripMemory.temporaryConstraints.value,
      source: 'TRIP',
    });
  }
  if (input.working?.currentDay != null) {
    facts.push({
      key: 'working.currentDay',
      value: input.working.currentDay,
      source: 'WORKING',
    });
  }

  return {
    facts,
    preferences,
    episodes: input.episodes.map((ep) => ({
      episodeId: ep.episodeId,
      decisionType: ep.decision.type,
      summary: `${ep.userAction.type}→${ep.userAction.selected ?? '-'} regret=${ep.reflection?.decisionRegret ?? '-'}`,
      regret: ep.reflection?.decisionRegret ?? null,
      decisionId: ep.sourceRefs?.cgusDecisionId ?? null,
    })),
    confidence,
    evidence,
    conflicts: input.conflicts.map((c) => ({
      predicate: c.predicate,
      winnerLevel: c.winner.level,
      winnerValue: c.winner.value,
      ignoredLevel: c.losers[0]?.level,
      ignoredValue: c.losers[0]?.value,
      reason: c.reason,
    })),
  };
}

function filterRelevantEpisodes(
  episodes: DecisionEpisodeV1[],
  task: string,
  limit: number,
): DecisionEpisodeV1[] {
  if (limit <= 0) return [];
  const tokens = task
    .toUpperCase()
    .split(/[^A-Z0-9\u4e00-\u9fff]+/)
    .filter((t) => t.length > 2);
  const scored = episodes.map((ep) => {
    const hay = `${ep.decision.type} ${ep.decision.alternatives.join(' ')}`.toUpperCase();
    const hit = tokens.reduce(
      (n, t) => (t.length > 2 && hay.includes(t) ? n + 1 : n),
      0,
    );
    return { ep, hit };
  });
  scored.sort((a, b) => b.hit - a.hit);
  const picked = scored.filter((s) => s.hit > 0).map((s) => s.ep);
  // 禁止 ALL_EPISODES：无命中时也不回退为全量，只返回空
  return picked.slice(0, limit);
}

function projectStructuredByContract(
  full: UserProfileMemoryView,
  contract: MemoryContractV1,
): UserProfileMemoryView {
  const out: UserProfileMemoryView = {};
  for (const field of contract.includeUserProfileFields) {
    if (field === 'pace' && full.pace) out.pace = full.pace;
    if (field === 'riskTolerance' && full.riskTolerance) {
      out.riskTolerance = full.riskTolerance;
    }
    if (field === 'accommodationMovement' && full.accommodationMovement) {
      out.accommodationMovement = full.accommodationMovement;
    }
    if (field === 'preferredExperience' && full.preferredExperience) {
      out.preferredExperience = full.preferredExperience;
    }
    if (field === 'planningStyle' && full.planningStyle) {
      out.planningStyle = full.planningStyle;
    }
  }
  return out;
}

function projectTripByContract(
  full: TripMemoryView | null,
  contract: MemoryContractV1,
): TripMemoryView | null {
  if (!full || !contract.includeTripMemory) return null;
  const allowConstraints = contract.allow.includes('TRIP_MEMBER_CONSTRAINT');
  const allowIntent = contract.allow.includes('TRIP_INTENT');
  const allowPace = contract.allow.includes('PACE_PREFERENCE');
  const allowNight = contract.allow.includes('NIGHT_DRIVING_PREFERENCE');

  return {
    tripId: full.tripId,
    tripGoal: allowIntent ? full.tripGoal : undefined,
    paceOverride: allowPace ? full.paceOverride : undefined,
    nightDriving: allowNight ? full.nightDriving : undefined,
    maxDailyDrivingMinutes: allowPace ? full.maxDailyDrivingMinutes : undefined,
    temporaryConstraints: allowConstraints ? full.temporaryConstraints : undefined,
    participants: allowConstraints ? full.participants : undefined,
  };
}

export function buildMemoryContextPackage(
  ledger: MemoryLedgerStore,
  req: BuildContextRequest,
): MemoryContextPackage {
  const needPlan = planMemoryNeeds({
    task: req.task,
    tripId: req.tripId,
    day: req.day,
    creOperation: req.creOperation,
    messageHint: req.messageHint,
  });
  const baseContract = req.contract ?? needPlan.contract;
  // 硬 deny：永不装载全量（不修改 Planner 产出的原对象）
  const contract: MemoryContractV1 = {
    ...baseContract,
    deny: Array.from(
      new Set([
        ...baseContract.deny,
        'ALL_USER_HISTORY',
        'ALL_EPISODES',
        'FULL_SEMANTIC_DUMP',
      ]),
    ),
  };

  const fullStructured = req.userId
    ? buildUserProfileView(ledger, req.userId)
    : {};
  const structured = projectStructuredByContract(fullStructured, contract);

  const fullTrip = req.tripId ? buildTripMemoryView(ledger, req.tripId) : null;
  const tripMemory = projectTripByContract(fullTrip, contract);

  const episodes = filterRelevantEpisodes(
    req.episodes ?? [],
    req.task,
    contract.maxEpisodes,
  );

  const conflicts = [];
  if (
    contract.allow.includes('PACE_PREFERENCE') &&
    (structured.pace || tripMemory?.paceOverride || req.worldHints?.driverFatigueHigh)
  ) {
    const paceConflict = resolvePaceConflict({
      worldFatigueHigh: req.worldHints?.driverFatigueHigh,
      tripPace: (tripMemory?.paceOverride?.value as string | undefined) ?? null,
      tripConfidence: tripMemory?.paceOverride?.confidence,
      explicitUserPace:
        structured.pace?.sourceType === 'USER_EXPLICIT'
          ? (structured.pace.value as string)
          : null,
      explicitUserConfidence: structured.pace?.confidence,
      learnedUserPace:
        structured.pace && structured.pace.sourceType !== 'USER_EXPLICIT'
          ? (structured.pace.value as string)
          : null,
      learnedUserConfidence: structured.pace?.confidence,
    });
    if (paceConflict && paceConflict.losers.length > 0) {
      conflicts.push(paceConflict);
    }
  }

  const missingMemory = needPlan.memoryNeeds.filter((need) => {
    if (!need.required) return false;
    if (need.type === 'PACE_PREFERENCE') {
      return !structured.pace && !tripMemory?.paceOverride;
    }
    if (need.type === 'TRIP_MEMBER_CONSTRAINT') {
      return !tripMemory?.temporaryConstraints;
    }
    if (need.type === 'TRIP_INTENT') {
      return !tripMemory?.tripGoal;
    }
    if (need.type === 'ACCOMMODATION_MOVEMENT') {
      return !structured.accommodationMovement;
    }
    if (need.type === 'PAST_SIMILAR_DECISION') {
      return episodes.length === 0;
    }
    return false;
  });

  const working = contract.includeWorking ? req.working ?? null : null;
  const memoryContext = buildExplainableContext({
    structured,
    tripMemory,
    episodes,
    conflicts,
    working,
  });

  const raw: MemoryContextPackage = {
    schemaId: 'tripnara.memory_context_package@v1',
    task: req.task,
    tripId: req.tripId ?? null,
    day: req.day ?? null,
    builtAt: new Date().toISOString(),
    working,
    structured,
    tripMemory,
    relevantEpisodes: episodes,
    semanticEvidence: contract.includeSemantic ? [] : [],
    conflicts,
    missingMemory,
    contract,
    memoryContext,
    designPrinciple: TRAVEL_MEMORY_DESIGN_PRINCIPLE,
  };

  // Runtime 硬约束：CANDIDATE 永不进 Decision Context
  const safe = toDecisionSafeMemoryContext(raw);
  const guard = assertNoCandidateInDecisionContext(safe);
  if (!guard.ok) {
    // 防御性：再剥一层 structured
    return {
      ...safe,
      structured: {},
      decisionSafe: true,
    };
  }
  return safe;
}
