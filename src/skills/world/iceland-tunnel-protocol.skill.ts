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
    '生成西峡湾 iceland 单车道 tunnel 会车与让行协议（启发式预设）。在西部 fjords 路线含隧道段、readiness/planning 需驾驶协议时调用。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandTunnelProtocolSkill implements Skill<IcelandTunnelProtocolInput, IcelandTunnelProtocolOutput> {
  metadata = {
    name: 'iceland.tunnelProtocol',
    description: '生成西峡湾 iceland 单车道 tunnel 会车与让行协议（启发式预设）。在西部 fjords 路线含隧道段、readiness/planning 需驾驶协议时调用。',
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
