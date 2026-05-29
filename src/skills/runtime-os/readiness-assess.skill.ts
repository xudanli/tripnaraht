/**
 * readiness.assess — P0 Execution Gate
 * Unified executable / blockers / warnings / mitigations from vehicle, weather, route, daylight, experience.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import type { ReadinessAssessOutput } from './types/runtime-os.types';

export interface ReadinessAssessInput extends SkillInput {
  vehicle?: {
    class?: string;
    drivetrain?: '2WD' | '4WD' | 'AWD' | 'unknown';
    studdedTires?: boolean;
  };
  weather?: { severity?: 'low' | 'medium' | 'high'; windMps?: number; summary?: string };
  route?: { includesFRoad?: boolean; includesHighlands?: boolean; maxRoadGradePct?: number; summary?: string };
  daylight?: { nightDrivingRisk?: 'low' | 'medium' | 'high'; usableDaylightH?: number };
  experience?: { winterDriving?: 'none' | 'some' | 'strong'; fRoadExperience?: boolean };
}

@Injectable()
export class ReadinessAssessSkill implements Skill<ReadinessAssessInput, ReadinessAssessOutput> {
  private readonly logger = new Logger(ReadinessAssessSkill.name);

  metadata = {
    name: 'readiness.assess',
    description:
      'readiness.assess：OS: 执行门控 — 根据车辆/天气/路线/日照/经验判断是否可执行，输出 executable、blockers、warnings、mitigationActions。',
    version: '1.0.0',
    category: 'readiness' as const,
    toolGroup: 'CONTEXT' as const,
  };

  async execute(input: ReadinessAssessInput): Promise<ReadinessAssessOutput> {
    this.logger.debug('readiness.assess execute');
    const blockers: string[] = [];
    const warnings: string[] = [];
    const mitigationActions: string[] = [];

    const v = input.vehicle;
    const route = input.route;
    const wx = input.weather;
    const day = input.daylight;
    const exp = input.experience;

    if (route?.includesFRoad || route?.includesHighlands) {
      if (v?.drivetrain && v.drivetrain === '2WD') {
        blockers.push('f_or_highlands_route_requires_non_2wd');
        mitigationActions.push('switch_to_4wd_or_remove_f_segments');
      }
      if (exp?.winterDriving === 'none' && wx?.severity === 'high') {
        blockers.push('high_weather_with_inexperienced_winter_driver_on_rugged_route');
        mitigationActions.push('defer_highlands_until_conditions_improve_or_add_experienced_driver');
      }
    }

    if (wx?.severity === 'high' && (wx.windMps ?? 0) > 28) {
      blockers.push('severe_wind_for_light_vehicle_classes');
      mitigationActions.push('reduce_exposed_segments_wait_for_wind_drop');
    } else if (wx?.severity === 'medium') {
      warnings.push('elevated_weather');
      mitigationActions.push('add_buffer_and_check_vedur_caps');
    }

    if (day?.nightDrivingRisk === 'high') {
      warnings.push('night_driving_pressure');
      mitigationActions.push('cluster_drives_in_civil_twilight_window');
    }

    if (route?.maxRoadGradePct != null && route.maxRoadGradePct > 18 && (exp?.fRoadExperience === false)) {
      warnings.push('steep_segments_without_f_road_experience');
      mitigationActions.push('insert_recovery_stops_or_bypass_steep_segments');
    }

    const executable = blockers.length === 0;

    return {
      executable,
      blockers: [...new Set(blockers)],
      warnings: [...new Set(warnings)],
      mitigationActions: [...new Set(mitigationActions)],
    };
  }
}
