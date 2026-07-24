/**
 * itinerary.experience_align — 兼容别名，委托 itinerary.experience_curator
 * @deprecated 请使用 itinerary.experience_curator
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillMetadata } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import type { ExperienceFlowModel } from '../../trips/decision/models/experience-flow.model';
import type { ExperienceAlignOutput } from './experience-align.types';
import type { OdysseyPersonaSnapshot } from './adaptive-replan.types';
import {
  ItineraryExperienceCuratorSkill,
  type ItineraryExperienceCuratorInput,
} from './itinerary-experience-curator.skill';

export type ItineraryExperienceAlignInput = SkillInput & {
  itinerary: Itinerary;
  targetDays: number[];
  tripId?: string;
  userIntent?: string;
  experienceFlow?: ExperienceFlowModel;
  personaSnapshot?: OdysseyPersonaSnapshot;
  research_data?: Record<string, unknown>;
  apply_craft?: boolean;
};

@SkillDecorator({
  name: 'itinerary.experience_align',
  description:
    '旅行体验对齐：评估节奏弧线、多样性、摩擦与留白，并轻量改排以提升感官体验与情绪安全。',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class ItineraryExperienceAlignSkill
  implements Skill<ItineraryExperienceAlignInput, ExperienceAlignOutput>
{
  private readonly logger = new Logger(ItineraryExperienceAlignSkill.name);

  metadata: SkillMetadata = {
    name: 'itinerary.experience_align',
    description:
      'itinerary.experience_align：旅行体验对齐。在可行方案之上优化节奏弧线、景观多样性、摩擦预算与恢复留白；常与 adaptive_replan 串联。',
    version: '1.0.0',
    category: 'trip',
    toolGroup: 'DOMAIN',
    inputSchema: {
      required: ['itinerary', 'targetDays'],
      typeChecks: {
        itinerary: { type: 'object' },
        targetDays: { type: 'array' },
      },
    },
  };

  constructor(@Optional() private readonly curator?: ItineraryExperienceCuratorSkill) {
    this.logger.log('[ItineraryExperienceAlignSkill] initialized (delegates to experience_curator)');
  }

  async execute(input: ItineraryExperienceAlignInput): Promise<ExperienceAlignOutput> {
    const curator = this.curator ?? new ItineraryExperienceCuratorSkill();
    const out = await curator.execute({
      tripId: input.tripId ?? 'experience-align-alias',
      itinerary: input.itinerary,
      targetDays: input.targetDays,
      userIntent: input.userIntent,
      personaSnapshot: input.personaSnapshot,
      experienceFlow: input.experienceFlow,
      research_data: input.research_data,
      apply_curation: input.apply_craft !== false,
      tokenContext: input.tokenContext,
    } satisfies ItineraryExperienceCuratorInput);

    return {
      itinerary: out.itinerary,
      score: out.metrics,
      insights: [],
      insights_zh: out.curation_notes_zh,
      experience_flow_tempo: out.experience_flow_tempo,
      telemetry: out.telemetry,
    };
  }
}
