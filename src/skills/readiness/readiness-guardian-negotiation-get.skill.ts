// src/skills/readiness/readiness-guardian-negotiation-get.skill.ts
/**
 * skill.readiness.guardianNegotiation.get
 *
 * 读取 trip.metadata.readinessGuardianNegotiation 快照（pre/post repair 或 standalone 持久化结果）。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ReadinessGuardianNegotiationService } from '../../trips/readiness/services/readiness-guardian-negotiation.service';
import type { ReadinessGuardianNegotiationSnapshot } from '../../trips/readiness/types/coverage-map.types';

export interface ReadinessGuardianNegotiationGetInput extends SkillInput {
  tripId: string;
}

export interface ReadinessGuardianNegotiationGetOutput extends SkillOutput {
  tripId: string;
  snapshot?: ReadinessGuardianNegotiationSnapshot;
}

@Injectable()
export class ReadinessGuardianNegotiationGetSkill
  implements Skill<ReadinessGuardianNegotiationGetInput, ReadinessGuardianNegotiationGetOutput>
{
  private readonly logger = new Logger(ReadinessGuardianNegotiationGetSkill.name);

  metadata = {
    name: 'readiness.guardianNegotiation.get',
    description: '读取行程上已持久化的三人格博弈快照（preRepair / postRepair / latest）',
    version: '1.0.0',
    category: 'readiness' as const,
    inputSchema: {
      dependencies: [{ param: 'tripId' }],
      extractors: { tripId: 'tripId' },
    },
  };

  constructor(
    @Optional() private readonly guardianNegotiationService?: ReadinessGuardianNegotiationService,
  ) {}

  async execute(
    input: ReadinessGuardianNegotiationGetInput,
  ): Promise<ReadinessGuardianNegotiationGetOutput> {
    const tripId = input.tripId?.trim();
    if (!tripId) {
      throw new Error('tripId 不能为空');
    }

    if (!this.guardianNegotiationService) {
      this.logger.warn('ReadinessGuardianNegotiationService 不可用');
      return { tripId, snapshot: undefined };
    }

    const snapshot = await this.guardianNegotiationService.loadSnapshot(tripId);
    return { tripId, snapshot };
  }
}
