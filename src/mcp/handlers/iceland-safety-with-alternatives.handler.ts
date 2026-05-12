/**
 * MCP: check_trip_safety_with_alternatives — 双审计 + storm 候选 + 递归预检，仅返回可行 Plan B。
 */

import type { INestApplicationContext } from '@nestjs/common';
import type { StormRerouteStrategy } from '../../skills/world/utils/iceland-storm-rerouting-engine.util';
import { IcelandAlternativeValidatorSkill } from '../../skills/world/iceland-alternative-validator.skill';
import { IcelandRouteFeasibilitySkill } from '../../skills/world/iceland-route-feasibility.skill';
import { IcelandGasEvChargePlannerSkill } from '../../skills/world/iceland-gas-ev-planner.skill';
import type { CheckTripSafetyDualVerdictV1 } from '../../skills/world/iceland-check-trip-safety-dual-verdict.types';
import type { IcelandDualAuditInfrastructure } from '../../skills/world/utils/iceland-dual-audit-run.util';
import { runIcelandCheckTripSafetyDualAudit } from '../../skills/world/utils/iceland-dual-audit-run.util';
import {
  getCheckTripSafetyInputSchema,
  mapMcpPayloadToRouteFeasibilityInput,
  type McpContentResponse,
} from './iceland-safety-check.handler';

export const CHECK_TRIP_SAFETY_WITH_ALTERNATIVES_TOOL_NAME = 'check_trip_safety_with_alternatives';

export type CheckTripSafetyWithAlternativesPayload = {
  tool: typeof CHECK_TRIP_SAFETY_WITH_ALTERNATIVES_TOOL_NAME;
  original_verdict: CheckTripSafetyDualVerdictV1;
  original_infrastructure_audit: IcelandDualAuditInfrastructure;
  alternatives: Array<{
    strategy: StormRerouteStrategy;
    segments: ReturnType<typeof mapMcpPayloadToRouteFeasibilityInput>['segments'];
    pre_checked_verdict: CheckTripSafetyDualVerdictV1;
    infrastructure_audit: IcelandDualAuditInfrastructure;
  }>;
  rejected_pre_checks?: Array<{
    strategy: StormRerouteStrategy;
    segments: ReturnType<typeof mapMcpPayloadToRouteFeasibilityInput>['segments'];
    pre_checked_verdict: CheckTripSafetyDualVerdictV1;
  }>;
  storm_notes?: string[];
  note?: string;
};

export function registerCheckTripSafetyWithAlternativesTool(
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
  const route = app.get(IcelandRouteFeasibilitySkill, { strict: false });
  const gas = app.get(IcelandGasEvChargePlannerSkill, { strict: false });
  const validator = app.get(IcelandAlternativeValidatorSkill, { strict: false });
  if (!route || !validator) {
    console.error(
      '⚠️  check_trip_safety_with_alternatives: IcelandRouteFeasibilitySkill or IcelandAlternativeValidatorSkill missing — skip tool',
    );
    return false;
  }

  server.registerTool(
    CHECK_TRIP_SAFETY_WITH_ALTERNATIVES_TOOL_NAME,
    {
      description:
        '冰岛行程安全「全能接口」：先跑与 check_trip_safety 相同的双审计；若不可行则生成 storm 候选并对每组 segments 静默重跑双审计，仅返回 feasible 的替代方案（含 pre_checked_verdict）。',
      inputSchema: getCheckTripSafetyInputSchema(),
    },
    async (args: any) => {
      try {
        const input = mapMcpPayloadToRouteFeasibilityInput(args);
        const em = args?.energy_mode === 'ev' ? 'ev' : args?.energy_mode === 'ice' ? 'ice' : undefined;
        const first = await runIcelandCheckTripSafetyDualAudit(route, gas ?? null, input, em);

        if (first.verdict.feasible) {
          return formatResponse({
            tool: CHECK_TRIP_SAFETY_WITH_ALTERNATIVES_TOOL_NAME,
            original_verdict: first.verdict,
            original_infrastructure_audit: first.infrastructure_audit,
            alternatives: [],
            note: 'Original itinerary already feasible; no Plan B generated.',
          } satisfies CheckTripSafetyWithAlternativesPayload);
        }

        const validated = await validator.execute({
          request_id: input.request_id,
          travelDate: input.travelDate,
          vehicle: input.vehicle,
          original_segments: input.segments,
          failed_verdict: first.verdict,
          energy_mode: em,
          assumed_average_speed_kmh: input.assumedAverageSpeedKmh,
        });

        return formatResponse({
          tool: CHECK_TRIP_SAFETY_WITH_ALTERNATIVES_TOOL_NAME,
          original_verdict: validated.original_verdict,
          original_infrastructure_audit: first.infrastructure_audit,
          alternatives: validated.validated_alternatives.map((a) => ({
            strategy: a.strategy,
            segments: a.segments,
            pre_checked_verdict: a.pre_checked_verdict,
            infrastructure_audit: a.infrastructure_audit,
          })),
          rejected_pre_checks: validated.rejected_pre_checks,
          storm_notes: validated.storm_notes,
        } satisfies CheckTripSafetyWithAlternativesPayload);
      } catch (error: any) {
        return formatResponse({
          error: error?.message || 'Unknown error',
          stack: error?.stack,
        });
      }
    },
  );
  console.error(`  ✓ Registered tool: ${CHECK_TRIP_SAFETY_WITH_ALTERNATIVES_TOOL_NAME}`);
  return true;
}
