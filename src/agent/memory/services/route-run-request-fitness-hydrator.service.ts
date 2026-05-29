// src/agent/memory/services/route-run-request-fitness-hydrator.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';
import { resolveRouteRunPartyProfileSnapshot } from '../../utils/route-and-run-party-profile.util';
import { FitnessAssessmentService } from '../../../trips/decision/services/fitness-assessment.service';
import type { FitnessLevel } from '../../../trips/decision/models/human-capability.model';
import {
  buildFitnessProfileLinesZhFromTravelPreference,
  buildPhysicalCapabilityConstraintBlockEnFromTravelPreference,
  PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY,
  REQUEST_FITNESS_PROFILE_LINES_KEY,
} from '../utils/fitness-travel-preference-prompt.util';
import { INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION } from '../../orchestration/graph/nodes/intake-request-sanitizer.util';

function mapFitnessLevelToRouteBand(level: FitnessLevel): 'low' | 'medium' | 'high' {
  if (level === 'LOW' || level === 'MEDIUM_LOW') return 'low';
  if (level === 'MEDIUM') return 'medium';
  return 'high';
}

/**
 * Request-scope：按 user_id 拉取「体能画像」并写入本轮 request / memory（不落 L1）。
 * 避免 MemoryModule 直接依赖 DecisionModule 的 DI 环；由 AgentModule 注入 FitnessAssessmentService。
 */
@Injectable()
export class RouteRunRequestFitnessHydratorService {
  private readonly logger = new Logger(RouteRunRequestFitnessHydratorService.name);

  constructor(@Optional() private readonly fitnessAssessment?: FitnessAssessmentService) {}

  async hydrate(request: RouteAndRunRequestDto, memory: AgentMemoryContext): Promise<void> {
    const reqAny = request as unknown as Record<string, unknown>;
    delete reqAny[REQUEST_FITNESS_PROFILE_LINES_KEY];
    delete reqAny[PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY];

    if (process.env.DISABLE_AGENT_FITNESS_HYDRATION === '1') {
      return;
    }
    if (!this.fitnessAssessment) {
      return;
    }
    const userId = memory.userId;
    if (!userId || userId === 'anonymous') {
      return;
    }

    const before = resolveRouteRunPartyProfileSnapshot(request);
    const hasExplicitRouteFitness = before?.fitness_level != null;

    try {
      const model = await this.fitnessAssessment.loadUserModel(userId);
      if (!model) {
        return;
      }
      const profile = await this.fitnessAssessment.getFitnessProfile(userId, model);
      const mapped = mapFitnessLevelToRouteBand(profile.fitnessLevel);

      if (hasExplicitRouteFitness && before.fitness_level !== mapped) {
        this.logger.warn(
          `[FitnessHydrate] explicit_vs_profile_mismatch userId=${userId} request_id=${request.request_id} ` +
            `explicit=${before.fitness_level} profile_mapped=${mapped} profile_enum=${profile.fitnessLevel} score=${profile.overallScore}`,
        );
      }

      if (!hasExplicitRouteFitness) {
        request.fitness_level = mapped;
      }

      memory.routePartyProfile = resolveRouteRunPartyProfileSnapshot(request);
      if (memory.routePartyProfile && !memory.observability.layers.includes('route_party_profile')) {
        memory.observability.layers.push('route_party_profile');
      }
      if (!memory.observability.layers.includes('request_fitness_profile')) {
        memory.observability.layers.push('request_fitness_profile');
      }

      const tp: Record<string, unknown> = { ...(memory.travelPreference ?? {}) };
      tp.request_fitness_overall_score = profile.overallScore;
      tp.request_fitness_recommended_daily_ascent_m = profile.recommendedDailyAscentM;
      tp.request_fitness_recommended_daily_distance_km = profile.recommendedDailyDistanceKm;
      tp.request_fitness_confidence = profile.confidence;
      tp.request_fitness_level_enum = profile.fitnessLevel;
      tp.request_fitness_level_description_zh = profile.levelDescription;
      tp.request_fitness_confidence_description_zh = profile.confidenceDescription;
      tp.request_fitness_mapped_route_level = mapped;
      tp.request_fitness_show_mapped_band_hint = !hasExplicitRouteFitness;
      if (hasExplicitRouteFitness && before.fitness_level !== mapped) {
        tp.request_fitness_explicit_vs_profile_mismatch = true;
      }
      tp.request_fitness_dimensions = {
        climbingAbility: profile.dimensions.climbingAbility,
        endurance: profile.dimensions.endurance,
        recoverySpeed: profile.dimensions.recoverySpeed,
      };
      if (profile.ageInfo) {
        tp.request_fitness_age_group = profile.ageInfo.ageGroup;
        tp.request_fitness_age_modifier = profile.ageInfo.modifier;
      }
      if (memory.routePartyProfile?.fitness_level) {
        tp.route_fitness_level = memory.routePartyProfile.fitness_level;
      }
      memory.travelPreference = tp;

      const linesZh = buildFitnessProfileLinesZhFromTravelPreference(tp);
      const blockEn = buildPhysicalCapabilityConstraintBlockEnFromTravelPreference(tp);
      if (linesZh?.length || blockEn) {
        request.options = {
          ...(request.options ?? {}),
          [INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION]: { ...tp },
        } as RouteAndRunRequestDto['options'];
      }
      if (process.env.ROUTE_RUN_FITNESS_TRANSIENT_ON_REQUEST === '1') {
        if (linesZh?.length) {
          reqAny[REQUEST_FITNESS_PROFILE_LINES_KEY] = linesZh;
        }
        if (blockEn) {
          reqAny[PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY] = blockEn;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[FitnessHydrate] userId=${userId} request_id=${request.request_id} failed: ${msg}`);
    }
  }
}
