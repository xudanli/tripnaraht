/**
 * VerificationResult / 旅行理解卡 → 用户四级确定性文案（PRD §13.5）
 */

import { getExperienceAtom } from '../config/mvp-experience-atoms.config';
import type { ExperienceFulfillmentState } from '../types/experience-fulfillment-state.types';
import type { TravelUnderstandingCard } from '../types/experience-intent.types';
import type {
  ExperienceExplanationCard,
  UserCertaintyLevel,
  CertaintyDimension,
} from '../types/experience-explanation.types';
import { USER_CERTAINTY_LABELS } from '../types/experience-explanation.types';
import type { VerificationResult, VerificationStatus } from '../types/verification-result.types';

function levelFromScore(score: number | undefined, warnBelow = 0.55): UserCertaintyLevel {
  if (score == null) return 'UNCERTAIN';
  if (score >= 0.82) return 'EXCELLENT_CONDITIONS';
  if (score >= warnBelow) return 'SUITABLE';
  return 'UNCERTAIN';
}

function overallFromVerification(status: VerificationStatus, metrics: VerificationResult['metrics']): UserCertaintyLevel {
  if (status === 'BLOCKED') return 'NOT_RECOMMENDED';
  if (status === 'UNKNOWN') return 'UNCERTAIN';
  if (status === 'REPAIR_REQUIRED') return 'UNCERTAIN';
  if (status === 'PASS_WITH_WARNING') {
    return levelFromScore(metrics.feasibilityScore, 0.65);
  }
  const feasibility = metrics.feasibilityScore ?? 0.7;
  const evidence = metrics.evidenceConfidence ?? 0.6;
  const avg = (feasibility + evidence) / 2;
  return levelFromScore(avg, 0.6);
}

function dim(
  level: UserCertaintyLevel,
  detail: string,
): CertaintyDimension {
  return { level, labelZh: USER_CERTAINTY_LABELS[level], detail };
}

function sanitizeUserMessage(message: string): string {
  return message
    .replace(/Decision OS/gi, '')
    .replace(/F-road/gi, '高地道路')
    .replace(/2WD/gi, '普通两驱')
    .replace(/VERIFY/gi, '')
    .trim();
}

export function buildExperienceExplanationFromVerification(
  verification: VerificationResult,
  understanding?: TravelUnderstandingCard,
): ExperienceExplanationCard {
  const overallLevel = overallFromVerification(verification.status, verification.metrics);
  const m = verification.metrics;

  const routeLevel =
    verification.status === 'BLOCKED'
      ? 'NOT_RECOMMENDED'
      : levelFromScore(m.feasibilityScore, 0.5);
  const experienceLevel = levelFromScore(m.experienceFulfillmentEstimate, 0.55);
  const changingLevel =
    verification.unknowns.length > 0 || verification.softRisks.length > 0
      ? 'UNCERTAIN'
      : levelFromScore(m.scheduleRobustness ?? m.evidenceConfidence, 0.55);

  const factors: string[] = [];
  if (verification.softRisks.some((r) => /weather|天气/i.test(r.message))) {
    factors.push('天气可能变化');
  }
  if (verification.hardViolations.some((v) => /road|道路|F_ROAD|TERRAIN/i.test(v.code))) {
    factors.push('道路或车型条件需再次确认');
  }
  if (verification.unknowns.length) factors.push('部分关键信息尚未确认');
  if (!factors.length && changingLevel === 'UNCERTAIN') factors.push('行程中可能有临时调整');

  const whyRecommended = buildWhyRecommended(understanding);
  const risks = [
    ...verification.softRisks.map((r) => sanitizeUserMessage(r.message)).filter(Boolean),
    ...verification.hardViolations
      .filter((v) => v.severity === 'SOFT')
      .map((v) => sanitizeUserMessage(v.message)),
  ].slice(0, 5);

  const planBHints = verification.repairInstructions
    .map((r) => r.detail ?? r.action)
    .filter(Boolean)
    .slice(0, 3);
  if (verification.status === 'REPAIR_REQUIRED' && planBHints.length === 0) {
    planBHints.push('已准备可替换方案，尽量保留你的核心体验');
  }

  return {
    revision: 'v1',
    overallLevel,
    overallLabelZh: USER_CERTAINTY_LABELS[overallLevel],
    overallSummary: buildOverallSummary(overallLevel, understanding),
    dimensions: {
      routeFeasibility: dim(
        routeLevel,
        routeLevel === 'NOT_RECOMMENDED'
          ? '当前路线条件不满足，系统已尝试自动调整'
          : routeLevel === 'EXCELLENT_CONDITIONS'
            ? '驾驶与时间安排较为宽裕'
            : '路线已做基础核验，整体可执行',
      ),
      experienceMatch: dim(
        experienceLevel,
        experienceLevel === 'EXCELLENT_CONDITIONS'
          ? '与你想获得的体验高度一致'
          : '体验方向匹配，部分细节可能需微调',
      ),
      changingFactors: {
        ...dim(changingLevel, factors.join('；') || '整体较稳定'),
        factors,
      },
    },
    whyRecommended,
    risks,
    planBHints,
  };
}

function buildWhyRecommended(understanding?: TravelUnderstandingCard): string[] {
  if (!understanding) return [];
  const lines = [...understanding.travelGoals];
  for (const intent of understanding.experienceIntent.experienceIntents) {
    if (intent.priority === 'MUST_PRESERVE') {
      const atom = getExperienceAtom(intent.atom);
      lines.push(`保留核心体验：${atom?.displayNameZh ?? intent.atom}`);
    }
  }
  if (understanding.memberConditions.length) {
    lines.push('已考虑同行人体力与节奏');
  }
  return lines.slice(0, 5);
}

function buildOverallSummary(
  level: UserCertaintyLevel,
  understanding?: TravelUnderstandingCard,
): string {
  const dest = understanding?.travelGoals[0];
  switch (level) {
    case 'EXCELLENT_CONDITIONS':
      return dest
        ? `多项条件非常适合当前安排，${dest.replace(/^希望/, '')}`
        : '多项条件非常适合当前安排';
    case 'SUITABLE':
      return '路线已核验，当前条件适合按此方向推进';
    case 'UNCERTAIN':
      return '受天气、道路或资源变化影响，已准备备选方案';
    case 'NOT_RECOMMENDED':
      return '当前条件不满足，系统已自动替换或需要你做一次取舍';
    default:
      return USER_CERTAINTY_LABELS[level];
  }
}

export function buildExperienceExplanationFromUnderstanding(
  understanding: TravelUnderstandingCard,
): ExperienceExplanationCard {
  const intents = understanding.experienceIntent.experienceIntents;
  const avgWeight =
    intents.length
      ? intents.reduce((s, i) => s + i.weight, 0) / intents.length
      : 0.5;
  const experienceLevel = levelFromScore(avgWeight * (understanding.experienceIntent.confidence ?? 0.75));

  const hasElderly = understanding.memberConditions.some((c) => c.includes('父母') || c.includes('老人'));
  const routeLevel: UserCertaintyLevel = hasElderly ? 'SUITABLE' : 'UNCERTAIN';

  const verificationLike: VerificationResult = {
    verificationRunId: 'understanding-only',
    status: 'PASS_WITH_WARNING',
    scope: 'TRIP',
    hardViolations: [],
    softRisks: [],
    unknowns: [{ code: 'PLANNING_INCOMPLETE', message: '尚未完成全程硬约束验证' }],
    metrics: {
      feasibilityScore: hasElderly ? 0.72 : 0.58,
      evidenceConfidence: 0.55,
      experienceFulfillmentEstimate: avgWeight,
      scheduleRobustness: understanding.coreConstraints.some((c) => c.includes('不要太赶')) ? 0.75 : 0.6,
    },
    repairInstructions: [],
    userDecisionsRequired: [],
    evidenceRefs: [],
  };

  const card = buildExperienceExplanationFromVerification(verificationLike, understanding);
  card.dimensions.routeFeasibility = dim(
    routeLevel,
    routeLevel === 'SUITABLE'
      ? '基于目前已知约束，路线方向合理'
      : '仍需确认日期、车型与道路条件',
  );
  card.dimensions.experienceMatch = dim(
    experienceLevel,
    card.dimensions.experienceMatch.detail,
  );
  return card;
}

export function buildExperienceExplanationFromFulfillment(
  fulfillment?: ExperienceFulfillmentState,
  understanding?: TravelUnderstandingCard,
): ExperienceExplanationCard {
  if (fulfillment?.verificationResult) {
    return buildExperienceExplanationFromVerification(
      fulfillment.verificationResult,
      understanding,
    );
  }
  if (understanding) {
    return buildExperienceExplanationFromUnderstanding(understanding);
  }
  return buildExperienceExplanationFromUnderstanding({
    revision: 'v1',
    travelGoals: ['体验目的地自然景观'],
    memberConditions: [],
    coreConstraints: [],
    systemAssumptions: [],
    experienceIntent: {
      revision: 'v1',
      experienceIntents: [],
      negativePreferences: [],
    },
  });
}
