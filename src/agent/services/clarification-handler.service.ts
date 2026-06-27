import { Injectable } from '@nestjs/common';
import type { ClarificationAnswer } from '../interfaces/clarification.interface';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import { tryParseLatLngPairFromString } from '../../skills/transport/transport-search.skill';

export type AppliedRelaxation =
  | { id: 'upgrade_vehicle_to_4wd' }
  | { id: 'increase_days_by_1' }
  | { id: 'drop_one_must_include_poi'; dropped_poi_id?: string }
  | { id: 'relax_pace_to_conservative' }
  | { id: 'relax_budget_by_10pct' }
  | { id: 'reduce_scope' };

@Injectable()
export class ClarificationHandlerService {
  /**
   * 将 ClarificationAnswer(s) 解析为对 TripPlanRequest 的组合放宽补丁（MVP：仅支持 PLAN_GEN 空草案的 3 个原子）。
   *
   * 约束：
   * - 幂等：同一答案重复应用不应产生额外副作用（例如 day+1 不应叠加多次）
   * - 纯函数：只返回新对象，不修改入参（方便 shadow / dry-run）
   */
  applyRelaxationsFromAnswers(
    base: TripPlanRequest,
    answers: ClarificationAnswer[] | undefined,
  ): {
    tripPlanRequest: TripPlanRequest;
    applied: AppliedRelaxation[];
    terminalIntent?: 'TERMINAL_NO_SOLUTION';
    fingerprint?: string;
    /** 早警「自担风险继续」：不 Patch，由编排层写 early_warning_acknowledged / DSO.systemState */
    earlyWarningProceedAtOwnRisk?: boolean;
    /** Whether any non-relaxation patch was applied (e.g. date). */
    didPatch?: boolean;
    /** 用户已回答 clarify_transport_endpoints_v1，可触发交通增量 RESEARCH */
    transportClarificationApplied?: boolean;
  } {
    const applied: AppliedRelaxation[] = [];
    if (!answers || answers.length === 0) return { tripPlanRequest: base, applied };

    const relPlanGen = answers.find((a) => a.questionId === 'plan_gen_empty_draft_relax_constraints');
    const relEarly = answers.find((a) => a.questionId === 'early_warning_relaxations');
    const relGate = answers.find((a) => a.questionId === 'gate_eval_relax_constraints');
    const relVerify = answers.find((a) => a.questionId === 'verify_relax_constraints');
    const relPlanning = answers.find((a) => a.questionId === 'planning_conflicts_relax_constraints');

    const toPicked = (rel: typeof relPlanGen): string[] => {
      if (!rel) return [];
      return Array.isArray(rel.value) ? (rel.value as any).filter(Boolean) : [String(rel.value)];
    };
    const pickedPlanGen = toPicked(relPlanGen);
    const pickedEarly = toPicked(relEarly);
    const pickedGate = toPicked(relGate);
    const pickedVerify = toPicked(relVerify);
    const pickedPlanning = toPicked(relPlanning);
    const RELAX_ATOMS = new Set([
      'upgrade_vehicle_to_4wd',
      'increase_days_by_1',
      'drop_one_must_include_poi',
      'relax_budget_by_10pct',
      'relax_pace_to_conservative',
      'reduce_scope',
      'manual_relax_constraints',
    ]);
    const earlyAtoms = pickedEarly.filter((x) => RELAX_ATOMS.has(x));
    const earlyProceedOnly =
      !!relEarly && pickedEarly.includes('proceed_at_own_risk') && earlyAtoms.length === 0;

    const picked = [
      ...pickedPlanGen,
      ...pickedEarly,
      ...pickedGate,
      ...pickedVerify,
      ...pickedPlanning,
    ];

    const next: TripPlanRequest = this.deepClone(base);
    let didPatch = false;

    // ---------- Generic clarifications (non-relaxation) ----------
    // These should be applied even when there is no relaxation question present.
    // Goal: make CLARIFY loops converge (e.g., date question-1).
    const scopeAnswer = answers.find(
      (a) => a.questionId === 'destination_scope_too_sparse' || a.questionId === 'destination_scope_refine',
    );
    if (scopeAnswer) {
      const v = String(scopeAnswer.value ?? '').trim();
      if (v) {
        // Heuristic: treat the chosen scope option as a more specific destination string.
        // This helps POI selection converge when the initial destination is a raw coordinate string.
        next.destination = v;
        didPatch = true;
      }
    }

    let transportClarificationApplied = false;
    const transportEpAnswer = answers.find((a) => a.questionId === 'clarify_transport_endpoints_v1');
    if (transportEpAnswer) {
      const raw = String(transportEpAnswer.value ?? '').trim();
      if (raw) {
        const coords = tryParseLatLngPairFromString(raw);
        if (coords) {
          next.origin = coords;
          transportClarificationApplied = true;
          didPatch = true;
        } else {
          const parts = raw.split(/[，,|]/).map((s) => s.trim()).filter(Boolean);
          if (parts.length >= 2) {
            next.origin = parts[0];
            next.destination = parts[1];
            transportClarificationApplied = true;
          } else {
            next.origin = raw;
            transportClarificationApplied = true;
          }
          didPatch = true;
        }
      }
    }

    const slotPlacementAnswer = answers.find((a) => a.questionId === 'itinerary_slot_placement_v1');
    if (slotPlacementAnswer) {
      const v = String(slotPlacementAnswer.value ?? '').trim();
      const dayMatch = /^PLACE_ON_D(\d+)$/.exec(v);
      if (dayMatch) {
        const day_number = parseInt(dayMatch[1], 10);
        const start = next.date_range?.start_date ?? next.start_date;
        let date_ymd: string | undefined;
        if (start && /^\d{4}-\d{2}-\d{2}$/.test(start) && day_number >= 1) {
          const d = new Date(`${start}T12:00:00.000Z`);
          d.setUTCDate(d.getUTCDate() + (day_number - 1));
          date_ymd = d.toISOString().slice(0, 10);
        }
        next.guardian_debate_trip_context = {
          ...(next.guardian_debate_trip_context ?? {}),
          scheduling_constraints: {
            ...(next.guardian_debate_trip_context?.scheduling_constraints ?? {}),
            itinerary_slot_placement: { day_number, date_ymd },
          },
        };
        didPatch = true;
      }
    }

    const peakSeasonAnswer = answers.find((a) => a.questionId === 'peak_season_midnight_sun_whale_v1');
    if (peakSeasonAnswer) {
      const v = String(peakSeasonAnswer.value ?? '').trim();
      if (v === 'LOCK_MIDNIGHT_SUN_WHALE_SLOT') {
        next.guardian_debate_trip_context = {
          ...(next.guardian_debate_trip_context ?? {}),
          user_intent_anchors: {
            ...(next.guardian_debate_trip_context?.user_intent_anchors ?? {}),
            peak_season_crowd_avoidance: true,
            whale_watching_husavik: true,
            overnight_stay_akureyri: true,
          },
          scheduling_constraints: {
            ...(next.guardian_debate_trip_context?.scheduling_constraints ?? {}),
            whale_watching_slot: {
              start_local: '20:30',
              end_local: '23:30',
              venue_zh: '胡萨维克',
              slot_label_zh: '午夜阳光观鲸场',
            },
            next_day_delayed_departure_until: '10:00',
            overnight_drive_after_activity: true,
            midnight_sun_slot_locked: true,
          },
        };
        didPatch = true;
      }
    }

    const debateAnswer = answers.find((a) => a.questionId === 'guardian_debate_abu_reject_v1');
    if (debateAnswer) {
      const v = String(debateAnswer.value ?? '').trim();
      if (v) {
        const ctx = { ...(next.guardian_debate_trip_context ?? {}) };
        ctx.debate_user_confirm = {
          question_id: 'guardian_debate_abu_reject_v1',
          choice: v,
          confirmed_at: new Date().toISOString(),
        };
        if (v === 'accept_neptune_alternative') {
          ctx.user_intent_anchors = {
            ...(ctx.user_intent_anchors ?? {}),
            midnight_sun_continuous_drive: false,
            ring_road_full_scope: true,
            user_accepted_segmented_ring: true,
          };
          ctx.scheduling_constraints = {
            ...(ctx.scheduling_constraints ?? {}),
            segmented_ring_over_calendar_days: true,
          };
        }
        next.guardian_debate_trip_context = ctx;
        didPatch = true;
      }
    }

    const froadAnswer = answers.find((a) => a.questionId === 'froad_2wd_compliance_v1');
    if (froadAnswer) {
      const v = String(froadAnswer.value ?? '').trim();
      if (v === 'UPGRADE_VEHICLE_TO_4WD' || v === 'upgrade_vehicle_to_4wd') {
        next.constraints = { ...(next.constraints ?? {}), vehicle_type: '4WD' };
        applied.push({ id: 'upgrade_vehicle_to_4wd' });
        didPatch = true;
      }
      if (v === 'SWITCH_GUIDE_MODE') {
        next.guardian_debate_trip_context = {
          ...(next.guardian_debate_trip_context ?? {}),
          scheduling_constraints: {
            ...(next.guardian_debate_trip_context?.scheduling_constraints ?? {}),
            guide_mode_requested: true,
          },
        };
        didPatch = true;
      }
      if (v === 'ACCEPT_NEPTUNE_DETOUR') {
        next.guardian_debate_trip_context = {
          ...(next.guardian_debate_trip_context ?? {}),
          route_alternatives: [
            {
              id: 'RT26_F208_NORTH_NON_FORD',
              type: 'highland_detour_2wd',
              extra_driving_time_mins: 45,
            },
          ],
        };
        didPatch = true;
      }
    }

    const dateAnswer = answers.find((a) => a.questionId === 'question-1' || a.questionId === 'question-2');
    if (dateAnswer) {
      const parsed = this.parseDateRangeAnswer(dateAnswer.value);
      if (parsed?.date_range) {
        next.date_range = parsed.date_range;
        didPatch = true;
      } else if (parsed?.start_date) {
        // if only a start date is provided, keep existing end_date if any
        next.date_range = { ...(next.date_range ?? {}), start_date: parsed.start_date } as any;
        didPatch = true;
      }
      if (parsed?.days && Number.isFinite(parsed.days)) {
        next.days = parsed.days;
        didPatch = true;
      } else if (!next.days && next.date_range?.start_date && next.date_range?.end_date) {
        const s = new Date(next.date_range.start_date + 'T00:00:00Z');
        const e = new Date(next.date_range.end_date + 'T00:00:00Z');
        if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e >= s) {
          const diffDays = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          if (diffDays > 0 && diffDays <= 60) next.days = diffDays;
          didPatch = true;
        }
      }
    }

    // 幂等控制：用集合去重（proceed_at_own_risk 永不产生 TripPlanRequest Patch）
    const pickSet = new Set(picked);
    pickSet.delete('proceed_at_own_risk');

    const fpParts = answers
      .filter((a) => a && typeof a.questionId === 'string')
      .map((a) => ({
        questionId: a.questionId,
        value: Array.isArray(a.value) ? [...(a.value as any[])].filter(Boolean).sort() : String(a.value),
      }))
      .sort((a, b) => a.questionId.localeCompare(b.questionId));
    const fingerprint = this.fingerprintAnswers(fpParts);

    // 仅 PLAN_GEN 终止分支允许 accept_no_solution（用户批准无解）
    if (relPlanGen && pickSet.has('accept_no_solution')) {
      return { tripPlanRequest: base, applied: [], terminalIntent: 'TERMINAL_NO_SOLUTION', fingerprint };
    }

    if (pickSet.has('upgrade_vehicle_to_4wd')) {
      next.constraints = { ...(next.constraints ?? {}), vehicle_type: '4WD' };
      applied.push({ id: 'upgrade_vehicle_to_4wd' });
    }

    if (pickSet.has('increase_days_by_1')) {
      // 优先扩展 date_range.end_date；否则 days+1；否则无操作（让下一轮澄清补齐日期）
      if (next.date_range?.end_date) {
        const end = new Date(next.date_range.end_date + 'T00:00:00Z');
        if (!Number.isNaN(end.getTime())) {
          const plus = new Date(end);
          plus.setUTCDate(plus.getUTCDate() + 1);
          next.date_range = { ...next.date_range, end_date: plus.toISOString().slice(0, 10) };
        }
      } else if (typeof next.days === 'number' && Number.isFinite(next.days)) {
        next.days = Math.max(1, Math.floor(next.days) + 1);
      }
      applied.push({ id: 'increase_days_by_1' });
    }

    if (pickSet.has('drop_one_must_include_poi')) {
      const must = Array.isArray(next.must_include_poi_ids) ? [...next.must_include_poi_ids] : [];
      const dropped = must.length > 0 ? must[must.length - 1] : undefined;
      if (must.length > 0) {
        must.pop();
        next.must_include_poi_ids = must;
      }
      applied.push({ id: 'drop_one_must_include_poi', dropped_poi_id: dropped });
    }

    if (pickSet.has('relax_pace_to_conservative')) {
      next.constraints = {
        ...(next.constraints ?? {}),
        ...( { pacing_mode: 'conservative' } as Record<string, unknown> ),
      };
      applied.push({ id: 'relax_pace_to_conservative' });
    }

    if (pickSet.has('relax_budget_by_10pct')) {
      const budgetRaw = (next.constraints as Record<string, unknown> | undefined)?.budget;
      if (budgetRaw && typeof budgetRaw === 'object' && typeof (budgetRaw as { total?: number }).total === 'number') {
        const b = budgetRaw as { total: number; currency?: string };
        next.constraints = {
          ...(next.constraints ?? {}),
          budget: { ...b, total: Math.ceil(b.total * 1.1) },
        };
        applied.push({ id: 'relax_budget_by_10pct' });
      }
    }

    if (pickSet.has('reduce_scope') && typeof next.days === 'number' && next.days > 1) {
      next.days = Math.max(1, next.days - 1);
      applied.push({ id: 'reduce_scope' });
    }

    return {
      tripPlanRequest: next,
      applied,
      fingerprint,
      earlyWarningProceedAtOwnRisk: earlyProceedOnly ? true : undefined,
      didPatch: didPatch ? true : undefined,
      transportClarificationApplied: transportClarificationApplied ? true : undefined,
    };
  }

  private parseDateRangeAnswer(
    value: ClarificationAnswer['value'],
  ): { start_date?: string; date_range?: { start_date: string; end_date: string }; days?: number } | undefined {
    const s = String(value ?? '').trim();
    if (!s) return undefined;

    // Accept:
    // - "2026-06-01"
    // - "2026-06-01 to 2026-06-02"
    // - "2026-06-01 至 2026-06-02"
    const m = s.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|至|到|-|~)\s*(\d{4}-\d{2}-\d{2})/i);
    if (m) {
      const start_date = m[1];
      const end_date = m[2];
      const start = new Date(start_date + 'T00:00:00Z');
      const end = new Date(end_date + 'T00:00:00Z');
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
        const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return { date_range: { start_date, end_date }, days };
      }
      return { date_range: { start_date, end_date } };
    }

    const d = s.match(/\d{4}-\d{2}-\d{2}/);
    if (d) return { start_date: d[0] };
    return undefined;
  }

  private fingerprintAnswers(answers: Array<{ questionId: string; value: unknown }>): string {
    const stable = JSON.stringify(answers, (_k, v) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return Object.keys(v as any)
          .sort()
          .reduce((acc: any, key) => {
            acc[key] = (v as any)[key];
            return acc;
          }, {});
      }
      return v;
    });
    // 避免引入 crypto 依赖到边角环境：使用一个轻量稳定 hash（djb2）
    let h = 5381;
    for (let i = 0; i < stable.length; i++) h = (h * 33) ^ stable.charCodeAt(i);
    return `djb2:${(h >>> 0).toString(16)}`;
  }

  private deepClone<T>(v: T): T {
    // Node 18+ 支持 structuredClone；fallback 到 JSON clone（DSO/TripPlanRequest 当前为纯 JSON 结构）
    const sc = (globalThis as any).structuredClone as ((x: any) => any) | undefined;
    if (typeof sc === 'function') return sc(v);
    return JSON.parse(JSON.stringify(v)) as T;
  }
}

