/**
 * iceland.alternativeValidator — 对 storm 候选路段递归双审计，仅保留 feasible 的 Plan B。
 */

import { Injectable, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import type { CheckTripSafetyDualVerdictV1 } from './iceland-check-trip-safety-dual-verdict.types';
import type { IcelandRouteFeasibilitySegment, IcelandRouteFeasibilityVehicle } from './iceland-world-driving-contracts';
import { IcelandRouteFeasibilitySkill } from './iceland-route-feasibility.skill';
import { IcelandGasEvChargePlannerSkill } from './iceland-gas-ev-planner.skill';
import { suggestAlternativePlans } from './utils/iceland-storm-rerouting-engine.util';
import type { StormRerouteStrategy } from './utils/iceland-storm-rerouting-engine.util';
import { runIcelandCheckTripSafetyDualAudit } from './utils/iceland-dual-audit-run.util';
import type { IcelandDualAuditInfrastructure } from './utils/iceland-dual-audit-run.util';

export interface IcelandAlternativeValidatorInput extends SkillInput {
  request_id: string;
  travelDate: string;
  vehicle: IcelandRouteFeasibilityVehicle;
  original_segments: IcelandRouteFeasibilitySegment[];
  failed_verdict: CheckTripSafetyDualVerdictV1;
  energy_mode?: 'ice' | 'ev';
  assumed_average_speed_kmh?: number;
}

export interface IcelandValidatedAlternativeEntry extends SkillOutput {
  strategy: StormRerouteStrategy;
  segments: IcelandRouteFeasibilitySegment[];
  pre_checked_verdict: CheckTripSafetyDualVerdictV1;
  infrastructure_audit: IcelandDualAuditInfrastructure;
}

export interface IcelandAlternativeValidatorOutput extends SkillOutput {
  original_verdict: CheckTripSafetyDualVerdictV1;
  validated_alternatives: IcelandValidatedAlternativeEntry[];
  rejected_pre_checks: Array<{
    strategy: StormRerouteStrategy;
    segments: IcelandRouteFeasibilitySegment[];
    pre_checked_verdict: CheckTripSafetyDualVerdictV1;
  }>;
  storm_notes: string[];
}

@SkillDecorator({
  name: 'iceland.alternativeValidator',
  description:
    'P2 闭环：消费 iceland.stormReroutingEngine 候选，对每组 segments 静默重跑 routeFeasibility + gas + dual verdict，仅输出 pre_checked_verdict.feasible 为 true 的方案。',
  version: '0.1.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandAlternativeValidatorSkill implements Skill<IcelandAlternativeValidatorInput, IcelandAlternativeValidatorOutput> {
  metadata = {
    name: 'iceland.alternativeValidator',
    description: 'Recursive dual-audit filter for Plan B segments.',
    version: '0.1.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['request_id', 'travelDate', 'vehicle', 'original_segments', 'failed_verdict'],
      typeChecks: {
        request_id: { type: 'string' as const },
        original_segments: { type: 'array' as const, min: 1 },
      },
    },
  };

  constructor(
    private readonly routeSkill: IcelandRouteFeasibilitySkill,
    @Optional() private readonly gasSkill?: IcelandGasEvChargePlannerSkill,
  ) {}

  async execute(input: IcelandAlternativeValidatorInput): Promise<IcelandAlternativeValidatorOutput> {
    const plan = suggestAlternativePlans(input.failed_verdict, input.original_segments);
    const validated: IcelandValidatedAlternativeEntry[] = [];
    const rejected: IcelandAlternativeValidatorOutput['rejected_pre_checks'] = [];

    let i = 0;
    for (const cand of plan.candidates) {
      const rid = `${input.request_id}_alt_${i++}`;
      const routeInput = {
        request_id: rid,
        travelDate: input.travelDate,
        vehicle: input.vehicle,
        segments: cand.segments,
        ...(typeof input.assumed_average_speed_kmh === 'number' && input.assumed_average_speed_kmh > 0
          ? { assumedAverageSpeedKmh: input.assumed_average_speed_kmh }
          : {}),
      };
      const audit = await runIcelandCheckTripSafetyDualAudit(
        this.routeSkill,
        this.gasSkill ?? null,
        routeInput,
        input.energy_mode,
      );
      const entry = {
        strategy: cand.primary_strategy,
        segments: cand.segments,
        pre_checked_verdict: audit.verdict,
        infrastructure_audit: audit.infrastructure_audit,
      };
      if (audit.verdict.feasible) {
        validated.push(entry);
      } else {
        rejected.push({
          strategy: cand.primary_strategy,
          segments: cand.segments,
          pre_checked_verdict: audit.verdict,
        });
      }
    }

    return {
      original_verdict: input.failed_verdict,
      validated_alternatives: validated,
      rejected_pre_checks: rejected,
      storm_notes: plan.notes,
    };
  }
}
