/**
 * iceland.tunnelProtocol — 西峡湾单向隧道会让行语义（Vestfjarðagöng 等），无外部 API。
 */

import { Injectable } from '@nestjs/common';
import { Skill, SkillInput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import type { FeasibilityAdjustmentCode, IcelandRouteFeasibilitySegment } from './iceland-world-driving-contracts';
import { evaluateWestfjordsTunnelProtocol } from './utils/iceland-westfjords-tunnel-protocol.util';

export interface IcelandTunnelProtocolInput extends SkillInput {
  request_id: string;
  segments: IcelandRouteFeasibilitySegment[];
}

export interface IcelandTunnelProtocolOutput {
  triggered: boolean;
  drivingNotes: string[];
  recommendedAdjustments: FeasibilityAdjustmentCode[];
  affectedSegments: string[];
}

@SkillDecorator({
  name: 'iceland.tunnelProtocol',
  description:
    '西峡湾路网单向隧道会让行提示（Vestfjarðagöng 等）：基于预设区域触发的轻量语义，非封闭裁决、非实时封路。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandTunnelProtocolSkill implements Skill<IcelandTunnelProtocolInput, IcelandTunnelProtocolOutput> {
  metadata = {
    name: 'iceland.tunnelProtocol',
    description: 'Westfjords single-lane tunnel yielding protocol (heuristic, preset-based).',
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

  async execute(input: IcelandTunnelProtocolInput): Promise<IcelandTunnelProtocolOutput> {
    return evaluateWestfjordsTunnelProtocol(input.segments ?? []);
  }
}
