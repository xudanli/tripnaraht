/**
 * Single place to run route feasibility + gas planner + dual verdict assembly (MCP + P2 validator).
 */

import type { IcelandRouteFeasibilityInput } from '../iceland-route-feasibility.skill';
import type { IcelandRouteFeasibilitySkill } from '../iceland-route-feasibility.skill';
import type { IcelandGasEvChargePlannerSkill } from '../iceland-gas-ev-planner.skill';
import type { IcelandGasEvPlannerOutput } from '../iceland-world-driving-contracts';
import type { CheckTripSafetyDualVerdictV1 } from '../iceland-check-trip-safety-dual-verdict.types';
import { assembleCheckTripSafetyDualVerdictV1 } from '../../../mcp/handlers/check-trip-safety-dual-audit.assembler';

export type IcelandDualAuditInfrastructure =
  | IcelandGasEvPlannerOutput
  | { audit_skipped: true; reason: string };

export async function runIcelandCheckTripSafetyDualAudit(
  routeSkill: IcelandRouteFeasibilitySkill,
  gasSkill: IcelandGasEvChargePlannerSkill | null | undefined,
  input: IcelandRouteFeasibilityInput,
  energyMode?: 'ice' | 'ev',
): Promise<{
  route: Awaited<ReturnType<IcelandRouteFeasibilitySkill['execute']>>;
  energy: IcelandGasEvPlannerOutput | null;
  verdict: CheckTripSafetyDualVerdictV1;
  infrastructure_audit: IcelandDualAuditInfrastructure;
}> {
  const route = await routeSkill.execute(input);

  let energy: IcelandGasEvPlannerOutput | null = null;
  let infraSkipReason: string | null = null;
  if (gasSkill) {
    try {
      energy = await gasSkill.execute({
        request_id: input.request_id,
        energyDemandEstimate: route.energyDemandEstimate,
        segments: input.segments,
        vehicle: input.vehicle,
        ...(energyMode === 'ev' || energyMode === 'ice' ? { energy_mode: energyMode } : {}),
      });
    } catch (e: any) {
      infraSkipReason = e?.message || 'iceland.gasAndEvChargePlanner execution failed';
    }
  } else {
    infraSkipReason = 'IcelandGasEvChargePlannerSkill not registered';
  }

  const verdict = assembleCheckTripSafetyDualVerdictV1({
    route,
    energy,
    segments: input.segments,
  });

  const infrastructure_audit: IcelandDualAuditInfrastructure =
    energy ?? ({ audit_skipped: true, reason: infraSkipReason || 'unknown' } as const);

  return { route, energy, verdict, infrastructure_audit };
}
