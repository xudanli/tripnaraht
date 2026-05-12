/**
 * iceland.roadSurfaceAlerts — 碎石等路面语义提醒（租车条款 / GP 承保方向），无外部 API。
 */

import { Injectable } from '@nestjs/common';
import { Skill, SkillInput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import type { FeasibilityAdjustmentCode, IcelandRouteFeasibilitySegment } from './iceland-world-driving-contracts';
import { evaluateGravelRoadSurfaceAlerts } from './utils/iceland-gravel-road-surface-alerts.util';

export interface IcelandRoadSurfaceAlertsInput extends SkillInput {
  request_id: string;
  segments: IcelandRouteFeasibilitySegment[];
}

export interface IcelandRoadSurfaceAlertsOutput {
  triggered: boolean;
  drivingNotes: string[];
  recommendedAdjustments: FeasibilityAdjustmentCode[];
  affectedSegments: string[];
}

@SkillDecorator({
  name: 'iceland.roadSurfaceAlerts',
  description:
    '路面语义提醒：gravel 路段时提示碎石击伤、租车条款与 GP/SAAP 类承保方向（非法律/保单结论）。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandRoadSurfaceAlertsSkill implements Skill<IcelandRoadSurfaceAlertsInput, IcelandRoadSurfaceAlertsOutput> {
  metadata = {
    name: 'iceland.roadSurfaceAlerts',
    description: 'Gravel-surface rental insurance and driving-hazard hints (heuristic).',
    version: '1.0.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['request_id', 'segments'],
      typeChecks: {
        request_id: { type: 'string' as const },
        segments: { type: 'array' as const, min: 1 },
      },
    },
  };

  async execute(input: IcelandRoadSurfaceAlertsInput): Promise<IcelandRoadSurfaceAlertsOutput> {
    return evaluateGravelRoadSurfaceAlerts(input.segments ?? []);
  }
}
