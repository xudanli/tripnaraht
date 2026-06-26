// src/agent/services/actions/readiness.actions.ts

/**
 * Readiness Actions
 *
 * 旅行准备度检查、三人格博弈与修复闭环相关的 Actions
 */

import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { ReadinessService } from '../../../trips/readiness/services/readiness.service';
import { ReadinessGuardianNegotiationService } from '../../../trips/readiness/services/readiness-guardian-negotiation.service';
import { ReadinessCausalPreanalysisService } from '../../../trips/readiness/services/readiness-causal-preanalysis.service';
import { ReadinessRepairService } from '../../../trips/readiness/services/readiness-repair.service';
import { buildReadinessCascadeUiHints } from '../../../trips/readiness/utils/readiness-causal-preanalysis.util';
import { TripContext } from '../../../trips/readiness/types/trip-context.types';
import {
  GUARDIAN_LOW_CONSENSUS_DEFER_THRESHOLD,
  shouldDeferRepairByPreNegotiation,
} from '../../../trips/readiness/utils/readiness-guardian-negotiation.util';

export interface ReadinessActionDeps {
  readinessService: ReadinessService;
  guardianNegotiationService?: ReadinessGuardianNegotiationService;
  causalPreanalysisService?: ReadinessCausalPreanalysisService;
  readinessRepairService?: ReadinessRepairService;
}

/**
 * 创建 Readiness Actions
 */
export function createReadinessActions(deps: ReadinessActionDeps): Action[] {
  const { readinessService, guardianNegotiationService, causalPreanalysisService, readinessRepairService } = deps;

  const actions: Action[] = [
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
        _state: unknown,
      ) => {
        const context: TripContext = {
          traveler: input.traveler || {},
          trip:
            input.trip?.start_date || input.trip?.end_date
              ? {
                  startDate: input.trip.start_date,
                  endDate: input.trip.end_date,
                }
              : {},
          itinerary: {
            countries: input.itinerary?.countries || [],
            activities: input.itinerary?.activities || [],
            season: input.itinerary?.season,
          },
          geo:
            input.geo?.lat && input.geo?.lng
              ? {
                  latitude: input.geo.lat,
                }
              : undefined,
        };

        const result = await readinessService.checkFromDestination(input.destination_id, context, {
          enhanceWithGeo: input.geo?.enhance_with_geo ?? true,
          geoLat: input.geo?.lat,
          geoLng: input.geo?.lng,
        });

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

  if (guardianNegotiationService) {
    actions.push(
      {
        name: 'readiness.guardianNegotiate',
        description:
          '对当前行程运行三人格博弈（辩论/投票），返回共识度与人类决策点；对应 skill decision.guardianNegotiate',
        metadata: {
          kind: ActionKind.INTERNAL,
          cost: ActionCost.HIGH,
          side_effect: ActionSideEffect.WRITES_DB,
          preconditions: ['trip.trip_id'],
          idempotent: false,
          cacheable: false,
        },
        input_schema: {
          type: 'object',
          properties: {
            trip_id: { type: 'string' },
            persist_to_trip: { type: 'boolean' },
          },
          required: ['trip_id'],
        },
        output_schema: { type: 'object' },
        execute: async (
          input: { trip_id: string; persist_to_trip?: boolean },
          _state: unknown,
        ) => {
          const tripId = input.trip_id?.trim();
          if (!tripId) {
            throw new Error('trip_id 不能为空');
          }

          const enabled = guardianNegotiationService.isEnabled();
          if (!enabled) {
            return {
              enabled: false,
              message: '三人格博弈未启用或 GuardianDebateService 不可用',
            };
          }

          const summary = await guardianNegotiationService.negotiateForTrip(
            tripId,
            'standalone',
          );

          if (summary && input.persist_to_trip) {
            await guardianNegotiationService.persistSnapshot(tripId, { latest: summary });
          }

          return {
            enabled: true,
            summary,
            shouldDeferRepair: summary
              ? shouldDeferRepairByPreNegotiation(summary)
              : false,
            lowConsensusThreshold: GUARDIAN_LOW_CONSENSUS_DEFER_THRESHOLD,
          };
        },
      },
      {
        name: 'readiness.guardianNegotiation.get',
        description: '读取 trip.metadata.readinessGuardianNegotiation 快照',
        metadata: {
          kind: ActionKind.INTERNAL,
          cost: ActionCost.LOW,
          side_effect: ActionSideEffect.NONE,
          preconditions: ['trip.trip_id'],
          idempotent: true,
          cacheable: true,
        },
        input_schema: {
          type: 'object',
          properties: {
            trip_id: { type: 'string' },
          },
          required: ['trip_id'],
        },
        output_schema: { type: 'object' },
        execute: async (input: { trip_id: string }, _state: unknown) => {
          const tripId = input.trip_id?.trim();
          if (!tripId) {
            throw new Error('trip_id 不能为空');
          }
          const snapshot = await guardianNegotiationService.loadSnapshot(tripId);
          return { tripId, snapshot: snapshot ?? null };
        },
      },
    );
  }

  if (causalPreanalysisService) {
    actions.push(
      {
        name: 'readiness.cascadeImpact.get',
        description: '读取 trip.metadata.readinessCausalPreAnalysis 级联影响快照',
        metadata: {
          kind: ActionKind.INTERNAL,
          cost: ActionCost.LOW,
          side_effect: ActionSideEffect.NONE,
          preconditions: ['trip.trip_id'],
          idempotent: true,
          cacheable: true,
        },
        input_schema: {
          type: 'object',
          properties: {
            trip_id: { type: 'string' },
          },
          required: ['trip_id'],
        },
        output_schema: { type: 'object' },
        execute: async (input: { trip_id: string }, _state: unknown) => {
          const tripId = input.trip_id?.trim();
          if (!tripId) {
            throw new Error('trip_id 不能为空');
          }
          const snapshot = await causalPreanalysisService.loadSnapshot(tripId);
          const causalPreAnalysis = snapshot?.latest;
          return {
            tripId,
            snapshot: snapshot ?? null,
            causalPreAnalysis: causalPreAnalysis ?? null,
            cascadeUiHints: buildReadinessCascadeUiHints(causalPreAnalysis),
            updatedAt: snapshot?.updatedAt ?? null,
          };
        },
      },
    );
  }

  if (readinessRepairService) {
    actions.push({
      name: 'readiness.applyRepair',
      description:
        '应用准备度修复选项（含 pre/post 三人格博弈与 Neptune 写回）；对应 skill readiness.applyRepair',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.HIGH,
        side_effect: ActionSideEffect.WRITES_DB,
        preconditions: ['trip.trip_id'],
        idempotent: false,
        cacheable: false,
      },
      input_schema: {
        type: 'object',
        properties: {
          trip_id: { type: 'string' },
          blocker_id: { type: 'string' },
          option_id: { type: 'string' },
          reason: { type: 'string' },
          execute_decision: { type: 'boolean' },
          persist_decision: { type: 'boolean' },
          run_guardian_negotiation: { type: 'boolean' },
          force_decision_repair: { type: 'boolean' },
        },
        required: ['trip_id', 'blocker_id', 'option_id'],
      },
      output_schema: { type: 'object' },
      execute: async (
        input: {
          trip_id: string;
          blocker_id: string;
          option_id: string;
          reason?: string;
          execute_decision?: boolean;
          persist_decision?: boolean;
          run_guardian_negotiation?: boolean;
          force_decision_repair?: boolean;
        },
        _state: unknown,
      ) => {
        return readinessRepairService.applyRepair({
          tripId: input.trip_id.trim(),
          blockerId: input.blocker_id.trim(),
          optionId: input.option_id.trim(),
          reason: input.reason,
          executeDecision: input.execute_decision ?? true,
          persistDecision: input.persist_decision ?? true,
          runGuardianNegotiation: input.run_guardian_negotiation ?? true,
          forceDecisionRepair: input.force_decision_repair,
        });
      },
    });
  }

  return actions;
}
