/**
 * itinerary.experience_curator — 旅行体验策划分型（感性脑）
 *
 * 四大编排美学：黄金时刻 / 感官交替 / 电影感转场 / 高潮余韵
 * 在 adaptive_replan 可行骨架之上做微润色，不替代 verify 硬约束。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { IcelandAuroraAdapter } from '../../data-contracts/adapters/iceland-aurora.adapter';
import { Skill, SkillInput, SkillMetadata } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import {
  projectExperienceFlowFromTraceSignals,
  readExperienceFlowFromResearchData,
} from '../../trips/decision/models/experience-flow.model';
import type {
  CuratorPhaseResult,
  ExperienceCuratorOutput,
  ExperienceCuratorPayload,
  ExperienceMetrics,
} from './experience-curator.types';
import { buildExperiencePreferences } from './experience-curator-preferences.util';
import { resolveExperienceAuroraContext } from './experience-curator-aurora.util';
import { applyGoldenHourAlignment } from './experience-curator-golden-hour.util';
import {
  resolveExperienceSolarTimes,
  resolveSolarAnchorFromItems,
} from './experience-curator-solar.util';
import { applySensoryDeescalation } from './experience-curator-sensory.util';
import { applyCinematicTransitions } from './experience-curator-cinematic.util';
import { applyRhythmWaveform } from './experience-curator-rhythm.util';
import { applyPacingRelaxationCuration } from './experience-curator-pacing-relax.util';
import { scoreItineraryExperience } from './experience-align-score.util';
import type { OdysseyPersonaSnapshot } from './adaptive-replan.types';

export type ItineraryExperienceCuratorInput = SkillInput &
  Omit<ExperienceCuratorPayload, 'currentDraftItinerary' | 'experiencePreferences'> & {
    itinerary: Itinerary;
    experiencePreferences?: ExperienceCuratorPayload['experiencePreferences'];
    personaSnapshot?: OdysseyPersonaSnapshot;
    apply_curation?: boolean;
  };

function cloneItinerary(it: Itinerary): Itinerary {
  return {
    ...it,
    days: it.days.map((day) => ({
      ...day,
      items: day.items.map((item) => ({ ...item })),
    })),
  };
}

@SkillDecorator({
  name: 'itinerary.experience_curator',
  description:
    '旅行体验策划：黄金时刻锚定、感官交替、电影感转场与高潮余韵波形，将可行骨架润色为高情绪价值旅程。',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class ItineraryExperienceCuratorSkill
  implements Skill<ItineraryExperienceCuratorInput, ExperienceCuratorOutput>
{
  private readonly logger = new Logger(ItineraryExperienceCuratorSkill.name);

  metadata: SkillMetadata = {
    name: 'itinerary.experience_curator',
    description:
      'itinerary.experience_curator：感性体验脑。在 adaptive_replan 之后注入转场美学、感官平衡与黄金时刻对齐；常与 experience_align 能力合并调用。',
    version: '1.0.0',
    category: 'trip',
    toolGroup: 'DOMAIN',
    inputSchema: {
      required: ['tripId', 'itinerary', 'targetDays'],
      typeChecks: {
        tripId: { type: 'string' },
        itinerary: { type: 'object' },
        targetDays: { type: 'array' },
      },
    },
  };

  constructor(
    @Optional() private readonly auroraAdapter?: IcelandAuroraAdapter,
  ) {
    this.logger.log('[ItineraryExperienceCuratorSkill] initialized');
  }

  async execute(input: ItineraryExperienceCuratorInput): Promise<ExperienceCuratorOutput> {
    const t0 = Date.now();
    const working = cloneItinerary(input.itinerary);

    const preferences =
      input.experiencePreferences ??
      buildExperiencePreferences({
        personaSnapshot: input.personaSnapshot,
        userIntent: input.userIntent,
      });

    const flow =
      input.experienceFlow ??
      readExperienceFlowFromResearchData(input.research_data) ??
      projectExperienceFlowFromTraceSignals({
        narrative_track:
          preferences.pacingStrategy === 'slow_burn' ? 'EMPATHY_RECOVERY' : 'EXPERIENCE_FIRST',
        frustration_circuit_triggered: preferences.pacingStrategy === 'slow_burn',
        stability_mode_active: true,
      });

    const phases: CuratorPhaseResult[] = [];
    const curation_notes_zh: string[] = [];
    let golden_hour_fit = 70;
    let sensory_balance = 75;
    let transition_cushion = 70;

    const shouldCurate = input.apply_curation !== false;

    for (let i = 0; i < working.days.length; i++) {
      const dayNumber = i + 1;
      if (!input.targetDays.includes(dayNumber)) continue;

      const day = working.days[i];
      let items = day.items;

      if (shouldCurate) {
        const anchorCoords = resolveSolarAnchorFromItems(items);
        const solarTimes = resolveExperienceSolarTimes({
          dateIso: day.date,
          lat: anchorCoords.lat,
          lng: anchorCoords.lng,
        });

        const auroraContext =
          preferences.goldenHourAlignment.auroraOrMilkyWay ||
          /极光|aurora|银河|milky/i.test(input.userIntent ?? '')
            ? await resolveExperienceAuroraContext({
                dateIso: day.date,
                lat: solarTimes.lat,
                lng: solarTimes.lng,
                researchData: input.research_data,
                auroraAdapter: this.auroraAdapter,
                preferLive: true,
              })
            : undefined;

        const golden = applyGoldenHourAlignment({
          items,
          dateIso: day.date,
          prefs: preferences,
          researchData: input.research_data,
          solarTimes,
          auroraContext,
        });
        items = golden.items;
        golden_hour_fit = Math.round((golden_hour_fit + golden.golden_hour_fit) / 2);
        if (golden.notes_zh.length) {
          phases.push({ phase: 'golden_hour', applied: true, notes_zh: golden.notes_zh });
          curation_notes_zh.push(...golden.notes_zh);
        }

        const sensory = applySensoryDeescalation({
          items,
          dateIso: day.date,
          prefs: preferences,
        });
        items = sensory.items;
        sensory_balance = Math.round((sensory_balance + sensory.sensory_balance) / 2);
        if (sensory.notes_zh.length) {
          phases.push({ phase: 'sensory', applied: true, notes_zh: sensory.notes_zh });
          curation_notes_zh.push(...sensory.notes_zh);
        }

        const cinematic = applyCinematicTransitions({
          items,
          dateIso: day.date,
          prefs: preferences,
        });
        items = cinematic.items;
        transition_cushion = Math.round((transition_cushion + cinematic.transition_cushion) / 2);
        if (cinematic.notes_zh.length) {
          phases.push({ phase: 'cinematic', applied: true, notes_zh: cinematic.notes_zh });
          curation_notes_zh.push(...cinematic.notes_zh);
        }

        const rhythm = applyRhythmWaveform({
          items,
          dateIso: day.date,
          prefs: preferences,
        });
        items = rhythm.items;
        if (rhythm.notes_zh.length) {
          phases.push({ phase: 'rhythm', applied: true, notes_zh: rhythm.notes_zh });
          curation_notes_zh.push(...rhythm.notes_zh);
        }

        const pacingRelax = applyPacingRelaxationCuration({
          items,
          dateIso: day.date,
          userIntent: input.userIntent,
        });
        items = pacingRelax.items;
        if (pacingRelax.notes_zh.length) {
          phases.push({ phase: 'pacing_relax', applied: true, notes_zh: pacingRelax.notes_zh });
          curation_notes_zh.push(...pacingRelax.notes_zh);
        }
      }

      day.items = items;
    }

    const targetItems = input.targetDays.flatMap((n) => working.days[n - 1]?.items ?? []);
    const { score } = scoreItineraryExperience({ items: targetItems, experienceFlow: flow });

    const metrics: ExperienceMetrics = {
      ...score,
      golden_hour_fit,
      sensory_balance,
      transition_cushion,
      overall: Math.round(
        score.overall * 0.55 +
          golden_hour_fit * 0.15 +
          sensory_balance * 0.15 +
          transition_cushion * 0.15,
      ),
    };

    const narrative =
      `ExperienceCurator: strategy=${preferences.pacingStrategy} overall=${metrics.overall} ` +
      `gh=${golden_hour_fit} sensory=${sensory_balance} trans=${transition_cushion}; ${Date.now() - t0}ms`;

    return {
      itinerary: working,
      metrics,
      preferences,
      phases,
      curation_notes_zh,
      experience_flow_tempo: flow.tempo,
      telemetry: { duration_ms: Date.now() - t0, narrative },
    };
  }
}
