/**
 * SDR-003 — 租车合同限制（规划期 TEP Validator）
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md §2 SDR-003
 */

import type {
  DailyDrivePlan,
  PlanningRuleResult,
  RentalRestriction,
  SelfDriveProfile,
} from '../contracts/tep-self-drive.types';
import { loadRentalRules, type RentalRestrictionRule } from '../loaders/rental-rules.loader';
import {
  computeGravelRatio,
  hasUnresolvedGravelLeg,
  summarizeDayLegRoadProfiles,
  type LegRoadProfileSummary,
} from '../utils/route-gravel-ratio.util';

function evaluateNoFRoadRestriction(input: {
  restriction: RentalRestriction;
  rule: RentalRestrictionRule;
  summaries: LegRoadProfileSummary[];
  day: DailyDrivePlan;
}): PlanningRuleResult | null {
  const matchedClasses = new Set(input.rule.match?.roadClasses ?? []);
  if (matchedClasses.size === 0) return null;

  for (const summary of input.summaries) {
    if (!summary.roadClass || !matchedClasses.has(summary.roadClass)) continue;

    return {
      ruleId: 'SDR-003',
      outcome: input.rule.outcome ?? 'REJECT',
      severity: input.rule.severity ?? 'CRITICAL',
      affectedRefs: [
        summary.legId,
        ...summary.roadRefs,
        `day_${input.day.dayIndex}`,
      ],
      explanation: `租车合同限制 ${input.restriction.code}：路线含 ${summary.roadClass}（${summary.roadRefs.join(', ') || summary.legId}），${input.restriction.description}`,
      evidenceRefs: [
        {
          provider: 'PACK',
          sourceType: 'OFFICIAL',
          observedAt: new Date().toISOString(),
          predicate: 'rental.restriction',
          subjectRef: input.restriction.code,
        },
      ],
    };
  }

  return null;
}

function evaluateGravelLimitedRestriction(input: {
  restriction: RentalRestriction;
  rule: RentalRestrictionRule;
  summaries: LegRoadProfileSummary[];
  day: DailyDrivePlan;
}): PlanningRuleResult | null {
  const threshold = input.rule.gravelRatioThreshold ?? 0.25;
  const ratio = computeGravelRatio(input.summaries);
  const gravelLegs = input.summaries.filter((s) => s.isGravel);

  if (gravelLegs.length === 0 && !hasUnresolvedGravelLeg(input.summaries)) {
    return null;
  }

  if (hasUnresolvedGravelLeg(input.summaries)) {
    return {
      ruleId: 'SDR-003',
      outcome: input.rule.unknownRoadOutcome ?? 'NEED_CONFIRM',
      severity: input.rule.unknownRoadSeverity ?? 'MEDIUM',
      affectedRefs: [`day_${input.day.dayIndex}`, ...input.summaries.flatMap((s) => s.roadRefs)],
      explanation: `租车合同限制 ${input.restriction.code}：部分路段无道路 profile，无法确认碎石占比是否超出合同阈值`,
      evidenceRefs: [],
      degraded: true,
      degradationReason: 'ROAD_PROFILE_MISSING',
    };
  }

  if (ratio > threshold) {
    const pct = Math.round(ratio * 100);
    return {
      ruleId: 'SDR-003',
      outcome: input.rule.outcomeAboveThreshold ?? 'REJECT',
      severity: input.rule.severityAboveThreshold ?? 'HIGH',
      affectedRefs: [
        `day_${input.day.dayIndex}`,
        ...gravelLegs.map((s) => s.legId),
      ],
      explanation: `租车合同限制 ${input.restriction.code}：第 ${input.day.dayIndex} 日碎石路占比约 ${pct}%（阈值 ${Math.round(threshold * 100)}%）`,
      evidenceRefs: [
        {
          provider: 'TEP',
          sourceType: 'INTERNAL',
          observedAt: new Date().toISOString(),
          predicate: 'route.gravelRatio',
          confidence: ratio,
        },
      ],
    };
  }

  if (ratio > 0) {
    const pct = Math.round(ratio * 100);
    return {
      ruleId: 'SDR-003',
      outcome: input.rule.outcomeBelowThreshold ?? 'NEED_CONFIRM',
      severity: input.rule.severityBelowThreshold ?? 'MEDIUM',
      affectedRefs: [`day_${input.day.dayIndex}`, ...gravelLegs.map((s) => s.legId)],
      explanation: `租车合同限制 ${input.restriction.code}：第 ${input.day.dayIndex} 日含碎石路段（约 ${pct}%），需确认险种/合同是否覆盖`,
      evidenceRefs: [],
    };
  }

  return null;
}

function evaluateUnknownRestriction(input: {
  restriction: RentalRestriction;
  day: DailyDrivePlan;
}): PlanningRuleResult {
  return {
    ruleId: 'SDR-003',
    outcome: 'NEED_CONFIRM',
    severity: 'MEDIUM',
    affectedRefs: [`day_${input.day.dayIndex}`],
    explanation: `租车合同含未映射限制条款 ${input.restriction.code}：${input.restriction.description}，需人工确认`,
    evidenceRefs: [],
    degraded: true,
    degradationReason: 'RENTAL_RESTRICTION_UNMAPPED',
  };
}

export function evaluateSdr003RentalContractRestrictions(input: {
  profile: SelfDriveProfile;
  dailyDrivePlans: DailyDrivePlan[];
  countryCode: string;
}): PlanningRuleResult[] {
  const restrictions = input.profile.rentalRestrictions;
  if (!restrictions?.length) return [];

  const pack = loadRentalRules(input.countryCode);
  const results: PlanningRuleResult[] = [];

  for (const day of input.dailyDrivePlans) {
    if (day.legs.length === 0) continue;
    const summaries = summarizeDayLegRoadProfiles(day, input.countryCode);

    for (const restriction of restrictions) {
      const rule = pack?.restrictions[restriction.code];
      if (!rule) {
        results.push(evaluateUnknownRestriction({ restriction, day }));
        continue;
      }

      if (restriction.code === 'NO_F_ROAD' || rule.match?.roadClasses?.length) {
        const hit = evaluateNoFRoadRestriction({
          restriction,
          rule,
          summaries,
          day,
        });
        if (hit) results.push(hit);
        continue;
      }

      if (restriction.code === 'GRAVEL_ROAD_LIMITED' || rule.gravelRatioThreshold != null) {
        const hit = evaluateGravelLimitedRestriction({
          restriction,
          rule,
          summaries,
          day,
        });
        if (hit) results.push(hit);
      }
    }
  }

  return results;
}
