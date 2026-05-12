/**
 * MCP Interface Layer — 冰岛行程物理安全「单一入口」。
 * 单次 RPC 双审计：{@link IcelandRouteFeasibilitySkill} + {@link IcelandGasEvChargePlannerSkill}（共享 energyDemandEstimate）。
 */

import type { INestApplicationContext } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { IcelandRouteFeasibilityInput } from '../../skills/world/iceland-route-feasibility.skill';
import { IcelandRouteFeasibilitySkill } from '../../skills/world/iceland-route-feasibility.skill';
import { IcelandGasEvChargePlannerSkill } from '../../skills/world/iceland-gas-ev-planner.skill';
import type { IcelandGasEvPlannerOutput } from '../../skills/world/iceland-world-driving-contracts';
import type { CheckTripSafetyDualVerdictV1 } from '../../skills/world/iceland-check-trip-safety-dual-verdict.types';
import { runIcelandCheckTripSafetyDualAudit } from '../../skills/world/utils/iceland-dual-audit-run.util';

export const CHECK_TRIP_SAFETY_TOOL_NAME = 'check_trip_safety';

export type McpContentResponse = { content: Array<{ type: 'text'; text: string }> };

export function getCheckTripSafetyInputSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      itinerary_segments: {
        type: 'array',
        description: '区域级路段（无需 polyline）；可含 F-road 编号与里程',
        items: {
          type: 'object',
          properties: {
            from_region: { type: 'string', description: '如 reykjavik, vik, akureyri' },
            to_region: { type: 'string' },
            distance_km: { type: 'number', description: '可选；有则优先用于能耗与日照/时长裁决' },
            road_id: { type: 'string', description: '可选；F-road 如 F208' },
            surface: {
              type: 'string',
              enum: ['paved', 'gravel', 'mixed'],
              description: '可选；碎石/混合路抬升能耗规划里程（西峡湾等），不影响 F-road 硬挡',
            },
          },
          required: ['from_region', 'to_region'],
        },
      },
      vehicle_type: {
        type: 'string',
        enum: ['4x4', '2wd', 'campervan'],
        description: '与 iceland.routeFeasibility 一致',
      },
      travel_date: {
        type: 'string',
        description: '冰岛日历日 YYYY-MM-DD；缺省为 Atlantic/Reykjavik 当日',
      },
      request_id: {
        type: 'string',
        description: '可选；用于追踪与去重',
      },
      energy_mode: {
        type: 'string',
        enum: ['ice', 'ev'],
        description: '可选；传给 iceland.gasAndEvChargePlanner（缺省 ice）',
      },
      assumed_average_speed_kmh: {
        type: 'number',
        description: '可选；默认 60',
      },
    },
    required: ['itinerary_segments', 'vehicle_type'],
  };
}

function asVehicleType(raw: string): IcelandRouteFeasibilityInput['vehicle']['type'] {
  const t = String(raw || '').toLowerCase();
  if (t === '4x4' || t === '2wd' || t === 'campervan') return t;
  throw new Error(`invalid vehicle_type: ${raw}`);
}

function normalizeSegmentSurface(raw: string | undefined): 'paved' | 'gravel' | 'mixed' | undefined {
  if (raw == null || typeof raw !== 'string') return undefined;
  const x = raw.trim().toLowerCase();
  if (x === 'paved' || x === 'asphalt' || x === 'sealed') return 'paved';
  if (x === 'gravel' || x === 'unpaved' || x === 'dirt') return 'gravel';
  if (x === 'mixed' || x === 'partial') return 'mixed';
  return undefined;
}

/**
 * 将 MCP snake_case 负载转为 {@link IcelandRouteFeasibilitySkill} 输入。
 */
export function mapMcpPayloadToRouteFeasibilityInput(args: {
  itinerary_segments: Array<{
    from_region: string;
    to_region: string;
    distance_km?: number;
    road_id?: string;
    surface?: string;
  }>;
  vehicle_type: string;
  travel_date?: string;
  request_id?: string;
  energy_mode?: 'ice' | 'ev';
  assumed_average_speed_kmh?: number;
}): IcelandRouteFeasibilityInput {
  const travelDate =
    args.travel_date?.trim() ||
    DateTime.now().setZone('Atlantic/Reykjavik').toISODate() ||
    new Date().toISOString().slice(0, 10);

  const request_id =
    args.request_id?.trim() || `mcp_${CHECK_TRIP_SAFETY_TOOL_NAME}_${Date.now()}`;

  const segments = (args.itinerary_segments || []).map((s) => ({
    from_region: String(s.from_region ?? '').trim(),
    to_region: String(s.to_region ?? '').trim(),
    ...(typeof s.distance_km === 'number' && Number.isFinite(s.distance_km)
      ? { distanceKm: s.distance_km }
      : {}),
    ...(s.road_id ? { roadId: String(s.road_id).trim() } : {}),
    ...(normalizeSegmentSurface(s.surface) ? { surface: normalizeSegmentSurface(s.surface)! } : {}),
  }));

  if (!segments.length) {
    throw new Error('itinerary_segments must be a non-empty array');
  }

  return {
    request_id,
    travelDate,
    segments,
    vehicle: { type: asVehicleType(args.vehicle_type) },
    ...(typeof args.assumed_average_speed_kmh === 'number' && args.assumed_average_speed_kmh > 0
      ? { assumedAverageSpeedKmh: args.assumed_average_speed_kmh }
      : {}),
  };
}

export type CheckTripSafetyMcpSuccessPayload = {
  tool: typeof CHECK_TRIP_SAFETY_TOOL_NAME;
  underlying_skills: [string, string] | [string];
  verdict: CheckTripSafetyDualVerdictV1;
  infrastructure_audit: IcelandGasEvPlannerOutput | { audit_skipped: true; reason: string };
};

export function registerCheckTripSafetyTool(
  server: {
    registerTool: (
      name: string,
      meta: { description: string; inputSchema: Record<string, unknown> },
      handler: (args: any) => Promise<McpContentResponse>,
    ) => void;
  },
  app: INestApplicationContext,
  formatResponse: (data: unknown) => McpContentResponse,
): boolean {
  const skill = app.get(IcelandRouteFeasibilitySkill, { strict: false });
  if (!skill) {
    console.error('⚠️  check_trip_safety: IcelandRouteFeasibilitySkill not registered — skip tool');
    return false;
  }

  const gasPlanner = app.get(IcelandGasEvChargePlannerSkill, { strict: false });

  server.registerTool(
    CHECK_TRIP_SAFETY_TOOL_NAME,
    {
      description:
        'Performs a comprehensive dual-audit for Iceland trips, including physical safety (weather, F-roads, wind, daylight), energy logistics (gas/EV range & supply deserts), and expert driving protocols (tunnel etiquette, gravel surface insurance). Returns a unified safety verdict. For failed audits, use check_trip_safety_with_alternatives to retrieve pre-checked viable reroutes.',
      inputSchema: getCheckTripSafetyInputSchema(),
    },
    async (args: any) => {
      try {
        const input = mapMcpPayloadToRouteFeasibilityInput(args);
        const em = args?.energy_mode === 'ev' ? 'ev' : args?.energy_mode === 'ice' ? 'ice' : undefined;
        const { verdict, infrastructure_audit } = await runIcelandCheckTripSafetyDualAudit(
          skill,
          gasPlanner,
          input,
          em,
        );

        const payload: CheckTripSafetyMcpSuccessPayload = {
          tool: CHECK_TRIP_SAFETY_TOOL_NAME,
          underlying_skills: gasPlanner
            ? ['iceland.routeFeasibility', 'iceland.gasAndEvChargePlanner']
            : ['iceland.routeFeasibility'],
          verdict,
          infrastructure_audit,
        };
        return formatResponse(payload);
      } catch (error: any) {
        return formatResponse({
          error: error?.message || 'Unknown error',
          stack: error?.stack,
        });
      }
    },
  );
  console.error(`  ✓ Registered tool: ${CHECK_TRIP_SAFETY_TOOL_NAME}`);
  return true;
}
