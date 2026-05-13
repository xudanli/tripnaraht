/**
 * policy.resolve — P0 Agent Constitution Engine
 * Fuses strategy, user preference, operational world state, readiness gate,
 * and optional OperationalArbitration (from worldState.summarize) into concrete policies + execution hook.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import type {
  OperationalWorldState,
  ReadinessAssessOutput,
  ResolvedPolicies,
} from './types/runtime-os.types';
import type { OperationalArbitration } from '../../world/operational/world-operational-arbitrator';
import { applyOperationalArbitrationToPolicies } from '../../world/operational/apply-arbitration-to-resolved-policies.util';

export interface PolicyResolveInput extends SkillInput {
  strategy?: Record<string, unknown>;
  userPreference?: Record<string, unknown>;
  operationalWorldState?: OperationalWorldState;
  readiness?: ReadinessAssessOutput;
  /** When set (e.g. from worldState.summarize), drives executionPolicyHook + route/driving restrictions. */
  operationalArbitration?: OperationalArbitration;
}

@Injectable()
export class PolicyResolveSkill implements Skill<PolicyResolveInput, ResolvedPolicies & SkillOutput> {
  private readonly logger = new Logger(PolicyResolveSkill.name);

  metadata = {
    name: 'policy.resolve',
    description:
      'OS: 将 strategy、userPreference、OperationalWorldState、readiness.assess、operationalArbitration 融合为 driving/route/lodging/risk 策略；裁决为 blocked/dangerous 时写入 executionPolicyHook（长距/F-road 等限制）。',
    version: '1.1.0',
    category: 'decision' as const,
    toolGroup: 'CONTEXT' as const,
  };

  async execute(input: PolicyResolveInput): Promise<ResolvedPolicies & SkillOutput> {
    this.logger.debug('policy.resolve execute');
    const ows = input.operationalWorldState;
    const r = input.readiness;
    const strat = input.strategy || {};
    const pref = input.userPreference || {};

    const riskTier = ows?.operationalRisk ?? 'low';
    const executable = r?.executable !== false;
    const blockedByReadiness = r && r.executable === false;

    const drivingPolicy: Record<string, unknown> = {
      maxNightDrivingRisk: riskTier === 'high' ? 'low' : 'medium',
      requireBufferOnWeatherSoft: riskTier !== 'low',
      studdedTiresBias: pref['winterTirePreference'] ?? 'follow_rental_contract',
      pace: strat['pace'] ?? (executable ? 'standard' : 'halt_until_unblocked'),
    };

    const routePolicy: Record<string, unknown> = {
      allowFRoads:
        executable &&
        !blockedByReadiness &&
        !(ows?.blockingFactors ?? []).some((b) => b.startsWith('road_closed')),
      rerouteOnClosure: true,
      maxDetourMinutes: riskTier === 'high' ? 45 : 25,
      preferScenic: pref['preferScenic'] ?? strat['preferScenic'] ?? false,
      allowLongDistanceAutorouting: true,
    };

    const lodgingPolicy: Record<string, unknown> = {
      hubAndSpokeBias: riskTier === 'high',
      flexibilityHours: riskTier === 'high' ? 4 : 2,
      cancelFriendlyWeight: pref['lodgingFlex'] ?? 0.35,
    };

    const riskPolicy: Record<string, unknown> = {
      operationalRisk: riskTier,
      blockers: ows?.blockingFactors ?? [],
      readinessBlockers: r?.blockers ?? [],
      escalation: riskTier === 'high' ? 'strict' : riskTier === 'medium' ? 'cautious' : 'normal',
      activeRecommended: ows?.recommendedPolicies ?? [],
    };

    const base: ResolvedPolicies = { drivingPolicy, routePolicy, lodgingPolicy, riskPolicy };

    if (input.operationalArbitration) {
      const merged = applyOperationalArbitrationToPolicies(input.operationalArbitration, base);
      return {
        drivingPolicy: merged.drivingPolicy,
        routePolicy: merged.routePolicy,
        lodgingPolicy: merged.lodgingPolicy,
        riskPolicy: merged.riskPolicy,
        executionPolicyHook: merged.executionPolicyHook,
      };
    }

    if (blockedByReadiness) {
      return {
        ...base,
        routePolicy: { ...base.routePolicy, allowLongDistanceAutorouting: false, maxSingleLegDriveHours: 2 },
        drivingPolicy: { ...base.drivingPolicy, automationPace: 'halt_until_readiness_cleared' },
      };
    }

    return base;
  }
}
