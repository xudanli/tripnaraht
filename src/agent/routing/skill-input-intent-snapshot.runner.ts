/**
 * 裁剪版意图快照（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/claude-orchestration.interface';
import type {
  IcelandVehicleIntentHints,
  SkillInputIntentSnapshot,
} from '../../skills/itinerary/iceland-vehicle-terrain-arbitrator.util';
import { resolveTransportPreferenceText } from '../utils/resolve-transport-preference-text.util';

export function buildSkillInputIntentSnapshot(
  request: RouteAndRunRequestDto,
  context: AgentContext,
): SkillInputIntentSnapshot | undefined {
  const hints: IcelandVehicleIntentHints = {};
  const reqAny = request as unknown as Record<string, unknown>;
  const optAny = (request.options ?? {}) as Record<string, unknown>;
  const tpReq = optAny.trip_plan_request as { constraints?: { vehicle_type?: string } } | undefined;
  const vtRaw =
    (reqAny.constraints as { vehicle_type?: string } | undefined)?.vehicle_type ??
    tpReq?.constraints?.vehicle_type;
  if (vtRaw === '2WD' || vtRaw === '4WD') {
    hints.constraints_vehicle_type = vtRaw;
  }

  const prefText = resolveTransportPreferenceText(
    context.userPreferences as Record<string, unknown> | undefined,
  );
  if (prefText) {
    hints.preference_text = prefText;
    if (!hints.transport_preferences) hints.transport_preferences = prefText;
  }

  if (Object.keys(hints).length === 0) return undefined;
  return { intent_hints: hints };
}
