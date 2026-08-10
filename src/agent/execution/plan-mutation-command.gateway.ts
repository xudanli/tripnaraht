/**
 * 薄写回网关：编排器内所有行程落库须经此入口，禁止直接 getSkill('trip.applyEdit').execute。
 * 完整 WRITE_PREVIEW → AUTHORIZE → APPLY 节点化留待后续批次。
 */

import {
  buildEffectivePlanWriteChainBlockedPayload,
  isDirectPlanMutationBlocked,
} from '../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import type { TripUserEdit } from '../../skills/trip/utils/trip-user-edit.util';
import type { Itinerary } from '../interfaces/trip-plan.interface';

export type PlanMutationCommandType =
  | 'APPLY_EDITS'
  | 'SMART_UPDATE'
  | 'ITINERARY_ADJUST_AUTO'
  | 'ITINERARY_ITEM_DELETE'
  | 'ITINERARY_ITEM_ADD'
  | 'ITINERARY_ITEM_UPDATE'
  | 'ITINERARY_DAY_REPLAN'
  | 'ITINERARY_ADJUST_DRAFT_APPLY'
  | 'POI_SLOT_FILL';

export type PlanMutationCommand = {
  tripId: string;
  userId?: string;
  commandType: PlanMutationCommandType;
  source: string;
  requestId?: string;
  idempotencyKey?: string;
  mode?: 'auto' | 'smart' | 'db';
  edits?: TripUserEdit[];
  itinerary?: Itinerary;
  research_data?: Record<string, unknown>;
  user_change_intent?: string;
  intent_hints?: string[];
  extra_adjustments?: unknown[];
  alternatives?: Record<string, unknown>;
};

export type PlanMutationCommandResult = {
  success: boolean;
  blocked?: boolean;
  reason?: string;
  writeChainRequired?: boolean;
  authorizedPaths?: readonly string[];
  message?: string;
  mode?: 'smart' | 'db';
  itinerary?: Itinerary;
  smartUpdate?: unknown;
  dbEdit?: unknown;
  degraded?: boolean;
  degradedReason?: string;
  raw?: unknown;
};

export type PlanMutationSkillLike = {
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

export type PlanMutationSkillsRegistryLike = {
  getSkill: (name: string) => PlanMutationSkillLike | undefined;
};

/**
 * 统一执行 PlanMutationCommand → trip.applyEdit（唯一 Skill 调用点）。
 */
export async function runPlanMutationCommand(
  skillsRegistry: PlanMutationSkillsRegistryLike | undefined | null,
  command: PlanMutationCommand,
): Promise<PlanMutationCommandResult> {
  const tripId = String(command.tripId ?? '').trim();
  if (!tripId) {
    return { success: false, reason: 'missing_trip_id' };
  }

  if (isDirectPlanMutationBlocked()) {
    const blocked = buildEffectivePlanWriteChainBlockedPayload(
      `plan_mutation_gateway:${command.source}`,
    );
    return {
      success: false,
      blocked: true,
      reason: 'write_chain_blocked',
      writeChainRequired: true,
      authorizedPaths: blocked.authorizedPaths,
      message: blocked.message,
      degraded: true,
      degradedReason: blocked.code,
    };
  }

  const skill = skillsRegistry?.getSkill('trip.applyEdit');
  if (!skill) {
    return { success: false, reason: 'trip_apply_edit_unavailable' };
  }

  const mode =
    command.mode === 'smart' || command.mode === 'db'
      ? command.mode
      : command.edits?.length
        ? 'db'
        : 'smart';

  if (mode === 'db' && !(command.edits?.length)) {
    return { success: false, reason: 'missing_edits' };
  }

  const out = (await skill.execute({
    mode,
    tripId,
    edits: command.edits,
    itinerary: command.itinerary,
    research_data: command.research_data,
    user_change_intent: command.user_change_intent,
    intent_hints: command.intent_hints,
    extra_adjustments: command.extra_adjustments,
    alternatives: command.alternatives,
    userId: command.userId,
    requestId: command.requestId,
    idempotencyKey: command.idempotencyKey,
    commandType: command.commandType,
    source: command.source,
  })) as Record<string, unknown>;

  const success = out?.success === true;
  return {
    success,
    blocked: out?.writeChainRequired === true,
    reason:
      out?.writeChainRequired === true
        ? 'write_chain_blocked'
        : success
          ? undefined
          : String(out?.degradedReason ?? out?.message ?? 'apply_failed'),
    writeChainRequired: out?.writeChainRequired === true ? true : undefined,
    authorizedPaths: out?.authorizedPaths as readonly string[] | undefined,
    message: typeof out?.message === 'string' ? out.message : undefined,
    mode: out?.mode === 'smart' || out?.mode === 'db' ? out.mode : mode,
    itinerary: out?.itinerary as Itinerary | undefined,
    smartUpdate: out?.smartUpdate,
    dbEdit: out?.dbEdit,
    degraded: out?.degraded === true,
    degradedReason: typeof out?.degradedReason === 'string' ? out.degradedReason : undefined,
    raw: out,
  };
}

/** 供仍接收 applyEditSkill 形参的 util 使用：包装为 Skill-like，内部走网关。 */
export function createPlanMutationApplyEditSkillAdapter(
  skillsRegistry: PlanMutationSkillsRegistryLike | undefined | null,
  meta: { commandType: PlanMutationCommandType; source: string; requestId?: string; userId?: string },
): PlanMutationSkillLike {
  return {
    execute: async (input: Record<string, unknown>) => {
      const result = await runPlanMutationCommand(skillsRegistry, {
        tripId: String(input.tripId ?? ''),
        userId: meta.userId,
        commandType: meta.commandType,
        source: meta.source,
        requestId: meta.requestId,
        mode: input.mode as PlanMutationCommand['mode'],
        edits: input.edits as TripUserEdit[] | undefined,
        itinerary: input.itinerary as Itinerary | undefined,
        research_data: input.research_data as Record<string, unknown> | undefined,
        user_change_intent:
          typeof input.user_change_intent === 'string' ? input.user_change_intent : undefined,
        intent_hints: input.intent_hints as string[] | undefined,
        extra_adjustments: input.extra_adjustments as unknown[] | undefined,
        alternatives: input.alternatives as Record<string, unknown> | undefined,
      });
      return {
        success: result.success,
        mode: result.mode ?? 'db',
        writeChainRequired: result.writeChainRequired,
        authorizedPaths: result.authorizedPaths,
        message: result.message,
        degraded: result.degraded ?? result.blocked,
        degradedReason: result.degradedReason ?? result.reason,
        itinerary: result.itinerary,
        smartUpdate: result.smartUpdate,
        dbEdit: result.dbEdit,
      };
    },
  };
}
