/**
 * iceland.stormReroutingEngine — P2 rule-driven Plan B segment candidates from a failed check_trip_safety verdict.
 */

import { Injectable } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import type { CheckTripSafetyDualVerdictV1 } from './iceland-check-trip-safety-dual-verdict.types';
import type { IcelandRouteFeasibilitySegment } from './iceland-world-driving-contracts';
import {
  suggestAlternativePlans,
  type IcelandStormRerouteCandidate,
  type StormRerouteStrategy,
} from './utils/iceland-storm-rerouting-engine.util';

export interface IcelandStormReroutingEngineInput extends SkillInput {
  request_id: string;
  failed_verdict: CheckTripSafetyDualVerdictV1;
  original_segments: IcelandRouteFeasibilitySegment[];
}

export interface IcelandStormReroutingEngineOutput extends SkillOutput {
  strategies_applied: StormRerouteStrategy[];
  candidates: IcelandStormRerouteCandidate[];
  /** segments-only mirror of candidates (backward compatible). */
  alternatives: IcelandRouteFeasibilitySegment[][];
  notes: string[];
}

@SkillDecorator({
  name: 'iceland.stormReroutingEngine',
  description:
    'P2：从失败的 dual-audit verdict 生成 2–3 组无地图的启发式替代路段（环岛绕行 / 拆分极夜里程 / 补给锚点），供再次 check_trip_safety 预检。',
  version: '0.1.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandStormReroutingEngineSkill implements Skill<IcelandStormReroutingEngineInput, IcelandStormReroutingEngineOutput> {
  metadata = {
    name: 'iceland.stormReroutingEngine',
    description: 'Plan B segment suggestions from structured verdict (no external routing API).',
    version: '0.1.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['request_id', 'failed_verdict', 'original_segments'],
      typeChecks: {
        request_id: { type: 'string' as const },
        original_segments: { type: 'array' as const, min: 1 },
      },
    },
  };

  suggestAlternative(failedVerdict: CheckTripSafetyDualVerdictV1, originalSegments: IcelandRouteFeasibilitySegment[]) {
    return suggestAlternativePlans(failedVerdict, originalSegments);
  }

  async execute(input: IcelandStormReroutingEngineInput): Promise<IcelandStormReroutingEngineOutput> {
    const plan = suggestAlternativePlans(input.failed_verdict, input.original_segments);
    return {
      strategies_applied: plan.strategies_applied,
      candidates: plan.candidates,
      alternatives: plan.candidates.map((c) => c.segments),
      notes: plan.notes,
    };
  }
}
