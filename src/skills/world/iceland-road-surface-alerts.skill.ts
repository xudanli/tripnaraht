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
    '检测 gravel 路段并输出 iceland 租车条款/碎石击伤与 GP 承保方向提醒（启发式）。在冰岛 routeFeasibility 或 worldState 需路面语义告警时调用。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandRoadSurfaceAlertsSkill implements Skill<IcelandRoadSurfaceAlertsInput, IcelandRoadSurfaceAlertsOutput> {
  metadata = {
    name: 'iceland.roadSurfaceAlerts',
    description: '检测 gravel 路段并输出 iceland 租车条款/碎石击伤与 GP 承保方向提醒（启发式）。在冰岛 routeFeasibility 或 worldState 需路面语义告警时调用。',
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
