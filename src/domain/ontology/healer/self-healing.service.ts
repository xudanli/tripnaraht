import { Injectable } from '@nestjs/common';
import type { PhysicalViolationItem } from '../validator/physical-validator.types';
import { ViolationCode } from '../validator/physical-validator.constants';
import { ICELAND_F_ROAD_POLICY_SOURCE } from '../validator/iceland-f-road-policy.util';
import { listStaticPhysicalPolicies } from '../validator/physical-validator.static-policies';
import type { HealingOption } from './healing-options.types';
import { addUtcCalendarDays, computeIcelandFrRoadTemporalShift, riskFromShiftDays } from './temporal-shift.util';

const DEFAULT_BUFFER_DAYS = 2;
/** Live Road.is closure: short deferral only (reopen time unknown). Override via ROAD_CLOSED_HEAL_SHIFT_DAYS. */
const DEFAULT_LIVE_CLOSURE_SHIFT_DAYS = 2;

function clonePlainRecord(input: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
}

/**
 * Computes non-mutating healing suggestions when PhysicalValidator emits INTERRUPT-tier spatial facts.
 * Does not execute actions — ActionExecutionService / UI decide whether to run a new PREVIEW with healed_input.
 */
@Injectable()
export class SelfHealingService {
  /**
   * Entry point: map violations + original action_input → suggested healing options (Phase B skeleton).
   */
  suggestOptions(violations: PhysicalViolationItem[], actionInput: Record<string, unknown>): HealingOption[] {
    const options: HealingOption[] = [];
    for (const v of violations) {
      if (v.code === ViolationCode.SEGMENT_SEASONALLY_CLOSED) {
        const o = this.calculateTemporalShiftForSeasonalClose(v, actionInput);
        if (o) options.push(o);
      }
      if (v.code === ViolationCode.SEGMENT_ROAD_CLOSED) {
        const o = this.calculateShortTemporalShiftForLiveRoadClosure(v, actionInput);
        if (o) options.push(o);
      }
    }
    return options;
  }

  /**
   * Merge a chosen healing option into the original action_input for a follow-up PREVIEW (Plan 1: anchor enter_at only here;
   * clients still apply the same calendar delta to itinerary timestamps when present).
   */
  buildHealedActionInput(option: HealingOption, original: Record<string, unknown>): Record<string, unknown> | null {
    if (option.kind === 'TEMPORAL_SHIFT' && option.temporal_shift) {
      const base = clonePlainRecord(original);
      const pd = (base.physical_domain as Record<string, unknown> | undefined) ?? {};
      base.physical_domain = {
        ...pd,
        enter_at: option.temporal_shift.suggested_enter_at,
      };
      return base;
    }
    return null;
  }

  /**
   * TEMPORAL_SHIFT for seasonal closure — Plan 1 whole-itinerary shift (same Δt everywhere).
   * Flight/hotel conflict validation: TODO (mark HIGH_RISK when overlap checker lands).
   */
  calculateTemporalShiftForSeasonalClose(
    violation: PhysicalViolationItem,
    actionInput: Record<string, unknown>,
  ): HealingOption | null {
    const pd = actionInput.physical_domain as { enter_at?: string } | undefined;
    const enterIso = pd?.enter_at;
    if (!enterIso) return null;

    const current = new Date(enterIso);
    if (Number.isNaN(current.getTime())) return null;

    const icelandPolicy = listStaticPhysicalPolicies().find((p) => p.id === 'ICELAND_HIGHLAND_DEFAULT');

    const openFrom = icelandPolicy?.open_window_utc.inclusive_from ?? '06-20';
    const { suggested_enter_at, shift_days, earliest_open_utc } = computeIcelandFrRoadTemporalShift({
      current_enter_at: current,
      open_window_inclusive_from: openFrom,
      buffer_days: DEFAULT_BUFFER_DAYS,
    });

    const risk = riskFromShiftDays(shift_days);

    return {
      kind: 'TEMPORAL_SHIFT',
      option_id: 'temporal_shift_iceland_fr_seasonal_v1',
      violation_codes_addressed: [violation.code],
      summary:
        `Whole-itinerary shift +${shift_days} day(s): move physical_domain.enter_at to ${suggested_enter_at.toISOString()} (open ≥ ${earliest_open_utc.toISOString()} + ${DEFAULT_BUFFER_DAYS}d buffer).`,
      temporal_shift: {
        anchor_enter_at: current.toISOString(),
        suggested_enter_at: suggested_enter_at.toISOString(),
        shift_days,
        buffer_days: DEFAULT_BUFFER_DAYS,
        policy_id: icelandPolicy?.id,
        policy_source_key: icelandPolicy?.policy_source_key ?? ICELAND_F_ROAD_POLICY_SOURCE,
        risk,
        rationale:
          risk === 'HIGH'
            ? 'Large calendar jump; validate flights/hotels before accepting (conflict check not yet automated).'
            : 'Plan 1 whole-itinerary shift: apply the same calendar delta to all itinerary timestamps. Uses ICELAND_HIGHLAND_DEFAULT open corridor as template until region-specific healers exist.',
      },
    };
  }

  /**
   * TEMPORAL_SHIFT for live Road.is / DB closure — defer anchor by 1–2 days (configurable) as a short hedge;
   * reopening is not predictable from the seasonal calendar.
   */
  calculateShortTemporalShiftForLiveRoadClosure(
    violation: PhysicalViolationItem,
    actionInput: Record<string, unknown>,
  ): HealingOption | null {
    const pd = actionInput.physical_domain as { enter_at?: string } | undefined;
    const enterIso = pd?.enter_at;
    if (!enterIso) return null;

    const current = new Date(enterIso);
    if (Number.isNaN(current.getTime())) return null;

    const raw = String(process.env.ROAD_CLOSED_HEAL_SHIFT_DAYS ?? '').trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    const shift_days =
      Number.isFinite(parsed) && parsed >= 1 && parsed <= 14 ? parsed : DEFAULT_LIVE_CLOSURE_SHIFT_DAYS;

    const suggested_enter_at = addUtcCalendarDays(current, shift_days);

    return {
      kind: 'TEMPORAL_SHIFT',
      option_id: 'temporal_shift_live_road_closure_v1',
      violation_codes_addressed: [violation.code],
      summary:
        `Temporary road closure — defer whole itinerary by ${shift_days} day(s) to ${suggested_enter_at.toISOString()}. ` +
        `Live closure may lift sooner or later; confirm Road.is or replan with a human guide.`,
      temporal_shift: {
        anchor_enter_at: current.toISOString(),
        suggested_enter_at: suggested_enter_at.toISOString(),
        shift_days,
        buffer_days: 0,
        risk: 'HIGH',
        rationale:
          'Live route closure (snow, washout, wind): short deferral only — seasonal open window does not predict reopen time. Validate flights/hotels before accepting.',
      },
    };
  }
}
