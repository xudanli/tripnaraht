// src/agent/services/actions/readiness.actions.ts

/**
 * Readiness Actions
 * 
 * 旅行准备度检查相关的 Actions
 */

import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { ReadinessService } from '../../../trips/readiness/services/readiness.service';
import { TripContext } from '../../../trips/readiness/types/trip-context.types';

/**
 * 创建 Readiness Actions
 */
export function createReadinessActions(
  readinessService: ReadinessService
): Action[] {
  return [
    {
      name: 'readiness.check',
      description: '检查旅行准备度（基于目的地、行程信息和地理特征）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.MEDIUM,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['trip.trip_id'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          destination_id: { type: 'string' },
          traveler: {
            type: 'object',
            properties: {
              nationality: { type: 'string' },
              residency_country: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              budget_level: { type: 'string', enum: ['low', 'medium', 'high'] },
              risk_tolerance: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
          },
          trip: {
            type: 'object',
            properties: {
              start_date: { type: 'string' },
              end_date: { type: 'string' },
            },
          },
          itinerary: {
            type: 'object',
            properties: {
              countries: { type: 'array', items: { type: 'string' } },
              activities: { type: 'array', items: { type: 'string' } },
              season: { type: 'string' },
            },
          },
          geo: {
            type: 'object',
            properties: {
              lat: { type: 'number' },
              lng: { type: 'number' },
              enhance_with_geo: { type: 'boolean' },
            },
          },
        },
        required: ['destination_id'],
      },
      output_schema: {
        type: 'object',
        properties: {
          findings: { type: 'array' },
          summary: {
            type: 'object',
            properties: {
              total_blockers: { type: 'number' },
              total_must: { type: 'number' },
              total_should: { type: 'number' },
              total_optional: { type: 'number' },
              total_risks: { type: 'number' },
            },
          },
          constraints: { type: 'array' },
          tasks: { type: 'array' },
        },
      },
      execute: async (
        input: {
          destination_id: string;
          traveler?: {
            nationality?: string;
            residency_country?: string;
            tags?: string[];
            budget_level?: 'low' | 'medium' | 'high';
            risk_tolerance?: 'low' | 'medium' | 'high';
          };
          trip?: {
            start_date?: string;
            end_date?: string;
          };
          itinerary?: {
            countries?: string[];
            activities?: string[];
            season?: string;
          };
          geo?: {
            lat?: number;
            lng?: number;
            enhance_with_geo?: boolean;
          };
        },
        state: any
      ) => {
        // 构建 TripContext
        const context: TripContext = {
          traveler: input.traveler || {},
          trip: input.trip?.start_date || input.trip?.end_date ? {
            startDate: input.trip.start_date,
            endDate: input.trip.end_date,
          } : {},
          itinerary: {
            countries: input.itinerary?.countries || [],
            activities: input.itinerary?.activities || [],
            season: input.itinerary?.season,
          },
          geo: input.geo?.lat && input.geo?.lng ? {
            latitude: input.geo.lat,
          } : undefined,
        };

        // 调用 ReadinessService
        const result = await readinessService.checkFromDestination(
          input.destination_id,
          context,
          {
            enhanceWithGeo: input.geo?.enhance_with_geo ?? true,
            geoLat: input.geo?.lat,
            geoLng: input.geo?.lng,
          }
        );

        // 获取约束和任务
        const constraints = await readinessService.getConstraints(result);
        const tasks = await readinessService.getTasks(result);

        return {
          findings: result.findings,
          summary: result.summary,
          constraints,
          tasks,
        };
      },
    },
  ];
}

