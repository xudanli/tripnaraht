// src/agent/memory/decision-memory/vehicle-terrain-decision-memory.util.ts
import type { Itinerary } from '../../interfaces/trip-plan.interface';
import type { IcelandVehicleIntentHints } from '../../../skills/itinerary/iceland-vehicle-terrain-arbitrator.util';
import {
  buildVirtualCarRentalRowsFromIntent,
  extractCarRentalRowsFromResearch,
  inferCarRentalDriveFromResearchRows,
  isIcelandContextForArbitration,
  itineraryImpliesFRoadOrHighland,
} from '../../../skills/itinerary/iceland-vehicle-terrain-arbitrator.util';
import { buildDecisionMemory, type DecisionMemory } from './decision-memory.types';
import type { WorldDecisionMemoryService } from './world-decision-memory.service';

/** itinerary.verify 产出的 issue 子集（避免 skills 类型环依赖） */
export type VehicleTerrainIssueLike = {
  severity: string;
  message: string;
  suggestion?: string;
  violation?: {
    anchor?: { constraintId?: string; ruleId?: string };
    entityRef?: { id?: string; type?: string };
    evidence?: { source?: string; refIds?: string[] };
  };
};

function causedByForRuleId(
  ruleId: string | undefined,
  evidenceSource?: string,
  evidenceRefIds?: string[],
): string[] {
  const base = ['skill:itinerary.verify', 'vehicle_terrain_arbitrator'];
  if (!ruleId) return [...base, 'world_state.unknown_rule'];
  const caused: string[] = [...base, `rule:${ruleId}`];
  if (ruleId.includes('froad')) {
    caused.push('world_state.itinerary.f_road_or_highland', 'world_state.rental.drive_class');
  }
  if (ruleId.includes('studded')) {
    caused.push('world_state.calendar.iceland_winter_studded_window');
  }
  if (ruleId.includes('wind_pickup')) {
    caused.push('world_state.safetravel.wind_storm_signal', 'world_state.user_query.vehicle_pickup');
  }
  if (evidenceSource === 'WEATHER') {
    caused.push('world_state.safetravel.alerts');
  }
  for (const r of evidenceRefIds ?? []) {
    const s = String(r);
    if (s.startsWith('strat:')) caused.push(s);
  }
  return caused;
}

function outcomeFromSeverity(sev: string): DecisionMemory['outcome'] {
  const s = String(sev).toUpperCase();
  if (s === 'CRITICAL') return 'rejected';
  if (s === 'ERROR') return 'failed';
  return 'failed';
}

function decisionFromVehicleTerrainIssue(issue: VehicleTerrainIssueLike): DecisionMemory | null {
  if (issue.violation?.entityRef?.id !== 'vehicle_terrain_arbitrator') return null;
  const ruleId = issue.violation?.anchor?.ruleId;
  if (typeof ruleId !== 'string' || !ruleId.includes('iceland_vehicle_terrain')) return null;
  const ev = issue.violation?.evidence;
  return buildDecisionMemory({
    decisionType: 'vehicle',
    inputs: {
      rule_id: ruleId,
      constraint_id: issue.violation?.anchor?.constraintId,
      severity: issue.severity,
      evidence_source: ev?.source,
      evidence_ref_ids: ev?.refIds,
    },
    outputs: {
      user_visible_message: issue.message.slice(0, 800),
      suggestion: issue.suggestion?.slice(0, 400),
    },
    outcome: outcomeFromSeverity(issue.severity),
    rationale: [issue.message.slice(0, 400)],
    causedBy: causedByForRuleId(ruleId, typeof ev?.source === 'string' ? ev.source : undefined, ev?.refIds),
  });
}

/**
 * Ring buffer 回溯：当前 request 内从尾部向前，最近一条 decisionType=vehicle 且 outcome=accepted。
 * VerifyExecutor 的 TERRAIN 公理 risk_block 通过 priorCausalityIds 与之串链。
 */
export function pickLastVehicleAcceptedCausalityFromList(list: readonly DecisionMemory[]): string[] | undefined {
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    if (d.decisionType === 'vehicle' && d.outcome === 'accepted') {
      return [d.causalityId];
    }
  }
  return undefined;
}

export function pickLastVehicleAcceptedCausalityIds(
  svc: WorldDecisionMemoryService | undefined,
): string[] | undefined {
  if (!svc) return undefined;
  return pickLastVehicleAcceptedCausalityFromList(svc.listForCurrentRequest());
}

/**
 * VERIFY 轴：意图 F-road × 2WD 公理命中（与 itinerary.verify 车型仲裁互补）。
 */
export function buildTerrainFroadUnfitAxiomDecisionMemory(params: {
  axiomCid: string;
  message: string;
  priorCausalityIds?: string[];
}): DecisionMemory {
  const causedBy = [
    'world_state.user_intent.constraints',
    `axiom:${params.axiomCid}`,
    ...(params.priorCausalityIds?.length ? params.priorCausalityIds.map((id) => `decision:${id}`) : []),
  ];
  return buildDecisionMemory({
    decisionType: 'risk_block',
    inputs: { axiom_cid: params.axiomCid, surface: 'VERIFY_AXIOM_TERRAIN_F_ROAD_UNFIT' },
    outputs: { action: 'block_2wd_froad_intent' },
    outcome: 'rejected',
    rationale: [params.message.slice(0, 600)],
    causedBy,
  });
}

function buildVehicleTerrainAcceptanceMemory(params: {
  itinerary: Itinerary;
  research_data?: Record<string, unknown>;
  user_query?: string;
  intent_hints?: IcelandVehicleIntentHints;
}): DecisionMemory {
  const { itinerary, research_data, user_query, intent_hints } = params;
  const fRoad = itineraryImpliesFRoadOrHighland(itinerary);
  const realRows = extractCarRentalRowsFromResearch(research_data);
  const virtualRows = realRows.length > 0 ? [] : buildVirtualCarRentalRowsFromIntent(user_query, intent_hints);
  const rows = realRows.length > 0 ? realRows : virtualRows;
  const drive = inferCarRentalDriveFromResearchRows(rows);
  return buildDecisionMemory({
    decisionType: 'vehicle',
    inputs: {
      iceland_context: true,
      itinerary_implies_f_road_or_highland: fRoad,
      rental_row_source: realRows.length > 0 ? 'mcp_car_rentals' : virtualRows.length > 0 ? 'intent_virtual' : 'none',
      drive_inference: drive,
    },
    outputs: { arbitration: 'no_vehicle_terrain_issue_emitted' },
    outcome: 'accepted',
    rationale: ['Vehicle–terrain arbitrator completed with no CRITICAL/WARNING/ERROR rows for this pass.'],
    causedBy: ['skill:itinerary.verify', 'vehicle_terrain_arbitrator'],
  });
}

/**
 * 车型–路况仲裁因果写入：每条 vehicle_terrain issue 一条；冰岛上下文中若本段无拦截则写一条 accepted（便于回溯「为何曾放行」）。
 */
export function appendVehicleTerrainArbitrationTrace(
  svc: WorldDecisionMemoryService | undefined,
  params: {
    terrainIssues: VehicleTerrainIssueLike[];
    itinerary: Itinerary;
    research_data?: Record<string, unknown>;
    user_query?: string;
    intent_hints?: IcelandVehicleIntentHints;
  },
): void {
  if (!svc) return;
  for (const issue of params.terrainIssues) {
    const dm = decisionFromVehicleTerrainIssue(issue);
    if (dm) svc.append(dm);
  }
  if (
    params.terrainIssues.length === 0 &&
    isIcelandContextForArbitration(params.research_data as Record<string, unknown> | undefined)
  ) {
    svc.append(
      buildVehicleTerrainAcceptanceMemory({
        itinerary: params.itinerary,
        research_data: params.research_data,
        user_query: params.user_query,
        intent_hints: params.intent_hints,
      }),
    );
  }
}

/** @deprecated 使用 appendVehicleTerrainArbitrationTrace（含 accepted 轨迹与 causedBy 规范） */
export function appendVehicleTerrainDecisionMemories(
  svc: WorldDecisionMemoryService | undefined,
  issues: VehicleTerrainIssueLike[],
): void {
  if (!svc) return;
  for (const issue of issues) {
    const dm = decisionFromVehicleTerrainIssue(issue);
    if (dm) svc.append(dm);
  }
}
