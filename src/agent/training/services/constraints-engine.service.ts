// src/agent/training/services/constraints-engine.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ConstraintRule,
  ConstraintCheckResult,
  ConstraintViolation,
  ConstraintWarning,
  SEVLevel,
} from '../interfaces/safety-compliance.interface';
import { Itinerary } from '../../interfaces/trip-plan.interface';
import { ConstraintRuleManagerService } from './constraint-rule-manager.service';
import { deriveVisibilityWindow, parseTimeToMinutes as parseDayTimeToMinutes } from '../../../decision/kernel/environmental-physics.service';
import { renderTemplate } from '../../utils/template-renderer.util';
import { SideEffectParamResolverService } from '../../services/side-effect-param-resolver.service';
import {
  pickNarratorHintTemplate,
  resolvePersuasionTierFromContext,
  type PersuasionTier,
} from '../../utils/persuasion-tier.util';

function buildPersuasionTierTemplateVars(context: any): Record<string, string | number> {
  const wallMs = Number(context?.wall_hit_distance_ms);
  const wall_hit_hours =
    Number.isFinite(wallMs) && wallMs > 0 ? Math.max(0.1, wallMs / 3_600_000).toFixed(1) : '2.0';
  const precedent_n = Number(context?.precedent_n ?? 8);
  const precedent_accept_pct = Number(context?.precedent_accept_pct ?? 90);
  return {
    wall_hit_hours,
    precedent_n: Number.isFinite(precedent_n) ? precedent_n : 8,
    precedent_accept_pct: Number.isFinite(precedent_accept_pct) ? precedent_accept_pct : 90,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseTimeToMinutes(s: string): number | null {
  const raw = String(s ?? '').trim();
  // allow ISO datetime too
  if (!raw) return null;
  if (raw.includes('T')) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function getItemTags(item: any): string[] {
  const raw = item?.metadata?.tags ?? item?.metadata?.tag ?? item?.tags;
  const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(',') : []);
  return arr.map((x) => String(x).trim()).filter(Boolean);
}

function itemHasAnyTag(item: any, tags: string[]): boolean {
  if (!tags.length) return false;
  const it = new Set(getItemTags(item).map((t) => t.toLowerCase()));
  return tags.some((t) => it.has(String(t).toLowerCase()));
}

function normalizeSegmentKey(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function resolveWindSpeedMps(args: {
  item: any;
  dayDate?: string;
  context: any;
}): {
  windSpeedMps: number | null;
  source: 'segment' | 'date' | 'global' | 'none';
  segmentKey?: string;
  segmentName?: string;
} {
  const { item, dayDate, context } = args;

  const bySegment = context?.windSpeedBySegment as Record<string, number> | Map<string, number> | undefined;
  const byDate = context?.windSpeedByDate as Record<string, number> | undefined;
  const segmentNames = context?.segmentNameBySegment as Record<string, string> | Map<string, string> | undefined;

  const segCandidates = [
    normalizeSegmentKey(item?.id),
    normalizeSegmentKey(item?.location_ref?.place_id),
    normalizeSegmentKey(item?.metadata?.segment_id),
    normalizeSegmentKey(item?.metadata?.segmentId),
    normalizeSegmentKey(item?.metadata?.route_segment_id),
  ].filter(Boolean) as string[];

  if (bySegment) {
    for (const key of segCandidates) {
      const v =
        bySegment instanceof Map ? bySegment.get(key) : (bySegment as any)[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        const name =
          segmentNames instanceof Map
            ? segmentNames.get(key)
            : segmentNames
              ? (segmentNames as any)[key]
              : undefined;
        return {
          windSpeedMps: v,
          source: 'segment',
          segmentKey: key,
          segmentName: typeof name === 'string' && name.trim() ? name.trim() : undefined,
        };
      }
    }
  }

  if (dayDate && byDate && typeof (byDate as any)[dayDate] === 'number' && Number.isFinite((byDate as any)[dayDate])) {
    return { windSpeedMps: Number((byDate as any)[dayDate]), source: 'date' };
  }

  const g = Number(context?.windSpeedMs ?? context?.environment?.windSpeedMs ?? context?.weather?.wind_speed_mps);
  if (Number.isFinite(g)) return { windSpeedMps: g, source: 'global' };

  return { windSpeedMps: null, source: 'none' };
}

/**
 * ConstraintsEngineService
 * 
 * 职责：实现硬约束规则引擎（禁区/风险/consent）
 * 
 * 功能：
 * 1. checkConstraints() - 检查规划是否违反约束
 * 2. 规则匹配和执行
 */
@Injectable()
export class ConstraintsEngineService {
  private readonly logger = new Logger(ConstraintsEngineService.name);
  private readonly rules: ConstraintRule[] = [];

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ruleManager?: ConstraintRuleManagerService,
    @Optional() private readonly paramOverrides?: SideEffectParamResolverService,
  ) {
    // 注意：规则现在从ConstraintRuleManagerService异步加载，不再在构造函数中初始化
  }

  /**
   * 加载规则（从ConstraintRuleManager加载）
   */
  private async loadRules(): Promise<ConstraintRule[]> {
    if (this.ruleManager) {
      try {
        const geographicRules = await this.ruleManager.getGeographicRules();
        const temporalRules = await this.ruleManager.getTemporalRules();
        const complianceRules = await this.ruleManager.getComplianceRules();
        const userPreferenceRules = await this.ruleManager.getUserPreferenceRules();
        return [
          ...geographicRules,
          ...temporalRules,
          ...complianceRules,
          ...userPreferenceRules,
        ];
      } catch (error: any) {
        this.logger.warn(`[ConstraintsEngine] 加载规则失败，使用空规则集: ${error?.message}`);
        return [];
      }
    }
    // 如果没有RuleManager，返回空数组
    return [];
  }

  /**
   * 检查约束
   */
  async checkConstraints(
    itinerary: Itinerary,
    context: {
      country_code?: string;
      season?: string;
      user_preferences?: Record<string, any>;
      model_version?: string;
      /**
       * Optional daylight knowledge injected from DSO.environmentState.daylightByDate.
       * Key must match itinerary day.date (YYYY-MM-DD).
       */
      daylightByDate?: Record<string, { sunset?: string; civil_dusk?: string; sunrise?: string }>;
      /** Optional: sunset override per day (YYYY-MM-DD -> time string). */
      sunsetByDate?: Record<string, string>;
      /** Optional: twilight buffer used by physics window. */
      twilightBufferMin?: number;
      /** Optional: orchestrator decision_log for persuasion tiering */
      decision_log?: unknown[];
      /** Optional: wall-hit latency (ms) for Tier2 impact copy */
      wall_hit_distance_ms?: number;
      /** Optional: force tier 1|2|3 (overrides decision_log inference) */
      persuasion_tier?: PersuasionTier | number;
      precedent_n?: number;
      precedent_accept_pct?: number;
    },
  ): Promise<ConstraintCheckResult> {
    this.logger.debug(
      `[ConstraintsEngine] 检查约束: countryCode=${context.country_code}`,
    );

    const violations: ConstraintViolation[] = [];
    const warnings: ConstraintWarning[] = [];

    // 加载规则（从ConstraintRuleManager）
    if (this.ruleManager) {
      // Build runtime indexes once (Brain layer)
      await this.ruleManager.loadAll();
    }
    const rules = await this.loadRules();

    // 检查硬约束
    for (const rule of rules.filter((r) => r.severity === 'HARD')) {
      const violation = await this.checkRule(rule, itinerary, context);
      if (violation) {
        violations.push(violation);
      }
    }

    // 检查软约束
    for (const rule of rules.filter((r) => r.severity === 'SOFT')) {
      const warning = await this.checkRuleAsWarning(rule, itinerary, context);
      if (warning) {
        warnings.push(warning);
      }
    }

    // 确定SEV级别
    const sevLevel = this.determineSevLevel(violations, warnings);

    // 判断是否需要阻止
    const isBlocked = violations.length > 0 || sevLevel === 'SEV-1';

    // 判断是否需要审批
    const requiresApproval =
      sevLevel === 'SEV-2' || violations.some((v) => v.sev_level === 'SEV-2');

    const result: ConstraintCheckResult = {
      violations,
      warnings,
      is_blocked: isBlocked,
      sev_level: sevLevel,
      requires_approval: requiresApproval,
    };

    this.logger.debug(
      `[ConstraintsEngine] 约束检查完成: violations=${violations.length}, warnings=${warnings.length}, sevLevel=${sevLevel}`,
    );

    return result;
  }

  /**
   * 检查规则（返回违反）
   */
  private async checkRule(
    rule: ConstraintRule,
    itinerary: Itinerary,
    context: any,
  ): Promise<ConstraintViolation | null> {
    try {
      switch (rule.type) {
        case 'GEOGRAPHIC':
          return await this.checkGeographicConstraint(rule, itinerary, context);
        case 'TEMPORAL':
          return await this.checkTemporalConstraint(rule, itinerary, context);
        case 'COMPLIANCE':
          return await this.checkComplianceConstraint(rule, itinerary, context);
        case 'USER_PREFERENCE':
          return await this.checkUserPreferenceConstraint(rule, itinerary, context);
        default:
          return null;
      }
    } catch (error: any) {
      this.logger.warn(
        `[ConstraintsEngine] 规则检查失败: ruleId=${rule.id}, error=${error?.message}`,
      );
      return null;
    }
  }

  /**
   * 检查规则（返回警告）
   */
  private async checkRuleAsWarning(
    rule: ConstraintRule,
    itinerary: Itinerary,
    context: any,
  ): Promise<ConstraintWarning | null> {
    const violation = await this.checkRule(rule, itinerary, context);
    if (violation) {
      return {
        rule_id: violation.rule_id,
        rule_name: violation.rule_name,
        type: violation.type,
        message: violation.message,
        details: violation.details,
        timestamp: violation.timestamp,
      };
    }
    return null;
  }

  /**
   * 检查地理约束
   */
  private async checkGeographicConstraint(
    _rule: ConstraintRule,
    _itinerary: Itinerary,
    _context: any,
  ): Promise<ConstraintViolation | null> {
    // TODO: 实际实现应该检查危险区域、禁区等
    // 这里先返回null（示例）
    return null;
  }

  /**
   * 检查时间约束
   */
  private async checkTemporalConstraint(
    rule: ConstraintRule,
    itinerary: Itinerary,
    context: any,
  ): Promise<ConstraintViolation | null> {
    const condRaw = rule.condition;
    let cond: any;
    try {
      cond = typeof condRaw === 'string' ? JSON.parse(condRaw) : condRaw;
    } catch {
      return null;
    }

    const persuasionTier = resolvePersuasionTierFromContext(context);
    const tierVars = buildPersuasionTierTemplateVars(context);

    // v1b: DYNAMIC_THRESHOLD (wind/precip/etc)
    // Condition schema:
    // {
    //   "trigger": { "tags": ["drive"], "country_code": "IS" },
    //   "constraint": {
    //     "type": "DYNAMIC_THRESHOLD",
    //     "engine_func": "WIND_SPEED_LIMIT",
    //     "applies_to_item_types": ["DRIVE","TRANSIT"],
    //     "params": { "threshold_mps": 15 }
    //   },
    //   "narrator_hint": "... {{windSpeed}} ..."
    // }
    if (cond?.constraint?.type === 'DYNAMIC_THRESHOLD') {
      const engineFunc = String(cond?.constraint?.engine_func ?? '');
      if (engineFunc === 'WIND_SPEED_LIMIT') {
        // Layer-2 override: DecisionRuleConfig row keyed by action_name="IRON_SHIELD" + handler_id=<rule.id>
        // (reuses SideEffectParamResolverService as a generic runtime param override map).
        const layer2 =
          this.paramOverrides?.getSnapshot().overrides?.IRON_SHIELD?.[String(rule.id)] ?? undefined;
        if (layer2 && typeof layer2 === 'object' && !Array.isArray(layer2)) {
          cond = {
            ...cond,
            constraint: {
              ...cond.constraint,
              params: { ...(cond.constraint?.params ?? {}), ...(layer2 as any) },
            },
          };
        }
        const country = cond?.trigger?.country_code ? String(cond.trigger.country_code) : undefined;
        if (country && context?.country_code && String(context.country_code) !== country) return null;

        const appliesToItemTypes: string[] = Array.isArray(cond?.constraint?.applies_to_item_types)
          ? cond.constraint.applies_to_item_types.map((x: any) => String(x).toUpperCase())
          : [];
        const threshold = Number(cond?.constraint?.params?.threshold_mps ?? 15);
        if (!Number.isFinite(threshold)) return null;

        const offenders: Array<{
          day: string;
          itemId: string;
          name: string;
          itemType?: string;
          segmentKey?: string;
          segmentName?: string;
          windSpeedMps?: number;
          windSource?: string;
        }> = [];
        for (const day of itinerary.days ?? []) {
          const dayDate = String((day as any)?.date ?? '');
          for (const item of day.items ?? []) {
            const itemType = String((item as any)?.type ?? '').toUpperCase();
            if (appliesToItemTypes.length > 0 && !appliesToItemTypes.includes(itemType)) continue;
            const resolved = resolveWindSpeedMps({ item, dayDate, context });
            if (resolved.windSpeedMps == null) continue;
            if (resolved.windSpeedMps <= threshold) continue;
            offenders.push({
              day: dayDate,
              itemId: String((item as any)?.id),
              name: String(item?.location_ref?.name ?? ''),
              itemType,
              segmentKey: resolved.segmentKey,
              segmentName: resolved.segmentName,
              windSpeedMps: resolved.windSpeedMps,
              windSource: resolved.source,
            });
          }
        }

        if (offenders.length === 0) return null;

        // Use max offender wind as headline.
        const maxWind = offenders.reduce((m, o) => (typeof o.windSpeedMps === 'number' ? Math.max(m, o.windSpeedMps) : m), -Infinity);
        const headlineWind = Number.isFinite(maxWind) ? maxWind : offenders[0]?.windSpeedMps ?? threshold + 0.1;

        const hint = pickNarratorHintTemplate(cond, persuasionTier);
        const locationName =
          (offenders[0]?.segmentName ?? '').trim() ||
          (offenders[0]?.name ?? '').trim() ||
          '该路段';
        const windEvidenceSource =
          offenders[0]?.windSource === 'segment'
            ? 'segment_prediction'
            : offenders[0]?.windSource === 'date'
              ? 'date_prediction'
              : offenders[0]?.windSource === 'global'
                ? 'global_estimate'
                : 'unknown';
        const evidence = {
          type: 'weather_physics',
          source: windEvidenceSource,
          value_mps: Number(headlineWind),
          threshold_mps: threshold,
          segment_key: offenders[0]?.segmentKey ?? undefined,
          segment_name: locationName.slice(0, 60),
        };
        const renderedHint = hint
          ? renderTemplate(hint, {
              windSpeed: Number(headlineWind).toFixed(1),
              windSpeedMps: Number(headlineWind).toFixed(1),
              thresholdMps: threshold,
              threshold: threshold,
              // Prefer segmentName (dictionary) -> item.name -> fallback
              location: locationName.slice(0, 60),
              segmentName: locationName.slice(0, 60),
              segmentKey: offenders[0]?.segmentKey ?? '',
              evidence,
              persuasion_tier: persuasionTier,
              ...tierVars,
            })
          : undefined;

        return {
          rule_id: rule.id,
          rule_name: rule.name,
          type: rule.type,
          severity: rule.severity,
          sev_level: rule.sev_level,
          message: `High wind detected (${Number(headlineWind).toFixed(1)} m/s > ${threshold} m/s).`,
          details: {
            engine_func: engineFunc,
            persuasion_tier: persuasionTier,
            wind_speed_mps: headlineWind,
            threshold_mps: threshold,
            applies_to_item_types: appliesToItemTypes,
            offenders,
            evidence,
            narrator_hint: hint,
            narrator_hint_rendered: renderedHint,
          },
          timestamp: nowIso(),
        };
      }
    }

    // v1: DYNAMIC_WINDOW (sunset physics)
    // Condition schema:
    // {
    //   "trigger": { "tags": ["aurora", "night-sky"], "country_code": "IS" },
    //   "constraint": {
    //     "type": "DYNAMIC_WINDOW",
    //     "engine_func": "DERIVE_SUNSET_WINDOW",
    //     "params": { "offset_min": 90, "twilight_buffer_min": 30 }
    //   },
    //   "narrator_hint": "..."
    // }
    if (cond?.constraint?.type === 'DYNAMIC_WINDOW') {
      const engineFunc = String(cond?.constraint?.engine_func ?? '');
      if (engineFunc === 'DERIVE_SUNSET_WINDOW') {
        // Layer-2 override (same keying as above): action_name="IRON_SHIELD" + handler_id=<rule.id>
        const layer2 =
          this.paramOverrides?.getSnapshot().overrides?.IRON_SHIELD?.[String(rule.id)] ?? undefined;
        if (layer2 && typeof layer2 === 'object' && !Array.isArray(layer2)) {
          cond = {
            ...cond,
            constraint: {
              ...cond.constraint,
              params: { ...(cond.constraint?.params ?? {}), ...(layer2 as any) },
            },
          };
        }
        const tags: string[] = Array.isArray(cond?.trigger?.tags)
          ? cond.trigger.tags.map((x: any) => String(x))
          : [];
        const country = cond?.trigger?.country_code ? String(cond.trigger.country_code) : undefined;
        if (country && context?.country_code && String(context.country_code) !== country) return null;

        // Optional trigger: risk appetite (for safety rules)
        const requiredRiskAppetite = cond?.trigger?.risk_appetite ? String(cond.trigger.risk_appetite).toLowerCase() : undefined;
        if (requiredRiskAppetite) {
          const actual =
            String(
              context?.risk_appetite ??
                context?.user_preferences?.risk_appetite ??
                context?.user_preferences?.risk_tolerance ??
                '',
            ).toLowerCase();
          if (actual && actual !== requiredRiskAppetite) return null;
        }

        const offsetMin = Number(cond?.constraint?.params?.offset_min ?? 90);
        const twilightBufferMin = Number(cond?.constraint?.params?.twilight_buffer_min ?? context?.twilightBufferMin ?? 30);
        const mode = String(cond?.constraint?.params?.mode ?? 'START_TIME_MIN').toUpperCase();
        const preferCivilDusk = Boolean(cond?.constraint?.params?.prefer_civil_dusk);
        const appliesToItemTypes: string[] = Array.isArray(cond?.constraint?.applies_to_item_types)
          ? cond.constraint.applies_to_item_types.map((x: any) => String(x).toUpperCase())
          : [];

        const offenders: Array<{
          day: string;
          itemId: string;
          name: string;
          start: string;
          end: string;
          sunsetOrDusk?: string;
          requiredEarliestStart?: string;
          requiredLatestEnd?: string;
          itemType?: string;
        }> = [];

        for (const day of itinerary.days ?? []) {
          const dayDate = String(day.date);
          const daylight = context?.daylightByDate?.[dayDate];
          const chosen =
            (context?.sunsetByDate && context.sunsetByDate[dayDate]) ||
            (preferCivilDusk ? (daylight?.civil_dusk ?? daylight?.sunset) : (daylight?.sunset ?? daylight?.civil_dusk));
          if (!chosen) continue;

          let sunsetMin: number;
          try {
            sunsetMin = parseDayTimeToMinutes(dayDate, String(chosen));
          } catch {
            continue;
          }
          // Handle polar / high-latitude cases where civil dusk is after midnight and is reported as "HH:mm".
          // In such cases, interpret it as next-day minutes (e.g. 00:30 => 24:30).
          const chosenStr = String(chosen).trim();
          if (!chosenStr.includes('T') && sunsetMin >= 0 && sunsetMin < 6 * 60) {
            sunsetMin += 24 * 60;
          }

          for (const item of day.items ?? []) {
            const name = String(item.location_ref?.name ?? '');
            const lower = name.toLowerCase();
            const itemType = String((item as any)?.type ?? '').toUpperCase();

            // v1 trigger: tags-driven by convention.
            // - Prefer itinerary item tags (ontology semantics).
            // - Fallback to name matching if itinerary doesn't carry structured tags yet.
            // - Else, if applies_to_item_types is provided, match by item type.
            const matchedByTags = tags.length > 0 ? itemHasAnyTag(item, tags) : false;
            const matchedByName = !matchedByTags && tags.length > 0 ? tags.some((t) => lower.includes(String(t).toLowerCase())) : false;
            const matchedByType =
              tags.length === 0 && appliesToItemTypes.length > 0
                ? appliesToItemTypes.includes(itemType)
                : false;

            if (!matchedByTags && !matchedByName && !matchedByType) continue;

            const startMin = parseTimeToMinutes(item.start_window);
            const endMin = parseTimeToMinutes(item.end_window);
            if (startMin == null && endMin == null) continue;

            // Reuse physics window math. For aurora: earliestStartMin = sunset + offset.
            const node = { tags: ['aurora'], aurora_offset: offsetMin };
            const w = deriveVisibilityWindow(node, sunsetMin, {
              twilightBufferMin: Number.isFinite(twilightBufferMin) ? twilightBufferMin : 30,
              defaultAuroraOffsetMin: offsetMin,
            });
            const earliest = w?.earliestStartMin;
            const latestEnd = typeof earliest === 'number' ? earliest : undefined; // for END_TIME_LIMIT we use same computed boundary

            if (mode === 'END_TIME_LIMIT') {
              if (typeof latestEnd === 'number' && endMin != null && endMin > latestEnd) {
                const hh = Math.floor(latestEnd / 60);
                const mm = latestEnd % 60;
                const req = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                offenders.push({
                  day: dayDate,
                  itemId: item.id,
                  name,
                  start: String(item.start_window),
                  end: String(item.end_window),
                  sunsetOrDusk: String(chosen),
                  requiredLatestEnd: req,
                  itemType,
                });
              }
            } else {
              if (typeof earliest === 'number' && startMin != null && startMin < earliest) {
                const hh = Math.floor(earliest / 60);
                const mm = earliest % 60;
                const req = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                offenders.push({
                  day: dayDate,
                  itemId: item.id,
                  name,
                  start: String(item.start_window),
                  end: String(item.end_window),
                  sunsetOrDusk: String(chosen),
                  requiredEarliestStart: req,
                  itemType,
                });
              }
            }
          }
        }

        if (offenders.length > 0) {
          const hint = pickNarratorHintTemplate(cond, persuasionTier);
          const first = offenders[0];
          const evidence = {
            type: 'solar_physics',
            source: 'civil_dusk_or_sunset', // overwritten below if we can infer more precisely
            baseline: first?.sunsetOrDusk,
            offset_min: offsetMin,
            twilight_buffer_min: twilightBufferMin,
            mode,
            prefer_civil_dusk: preferCivilDusk,
          };
          // Attempt to infer exact source from preferCivilDusk + baseline field name.
          // We keep this as best-effort; templates and CI only require source to be in a known allowlist.
          if (preferCivilDusk) evidence.source = 'civil_dusk';
          else evidence.source = 'sunset';
          const renderedHint =
            hint && first
              ? renderTemplate(hint, {
                  requiredLatestEnd: first.requiredLatestEnd,
                  requiredEarliestStart: first.requiredEarliestStart,
                  // Back-compat alias used by earlier drafts
                  requiredEndTime: first.requiredLatestEnd,
                  requiredStartTime: first.requiredEarliestStart,
                  sunsetOrDusk: first.sunsetOrDusk,
                  evidence,
                  persuasion_tier: persuasionTier,
                  ...tierVars,
                })
              : undefined;
          return {
            rule_id: rule.id,
            rule_name: rule.name,
            type: rule.type,
            severity: rule.severity,
            sev_level: rule.sev_level,
            message:
              mode === 'END_TIME_LIMIT'
                ? `Night driving fatigue window violated (latestEnd = sunset + ${offsetMin}min). Found ${offenders.length} item(s) ending too late.`
                : `Aurora/night-sky window violated (earliestStart = sunset + ${offsetMin}min). Found ${offenders.length} item(s) scheduled too early.`,
            details: {
              engine_func: engineFunc,
              persuasion_tier: persuasionTier,
              offset_min: offsetMin,
              twilight_buffer_min: twilightBufferMin,
              mode,
              prefer_civil_dusk: preferCivilDusk,
              applies_to_item_types: appliesToItemTypes,
              offenders,
              evidence,
              narrator_hint: hint,
              narrator_hint_rendered: renderedHint,
            },
            timestamp: nowIso(),
          };
        }

        return null;
      }
    }

    // v0 (legacy): night-sky / aurora must be at night by static threshold
    const keywords: string[] = Array.isArray(cond?.itinerary_item_name_matches_any)
      ? cond.itinerary_item_name_matches_any.map((x: any) => String(x))
      : [];
    const requiredStart = parseTimeToMinutes(cond?.required_start_time_gte);

    if (keywords.length > 0 && typeof requiredStart === 'number') {
      const hits: Array<{ day: string; itemId: string; name: string; start: string; end: string }> = [];
      for (const day of itinerary.days ?? []) {
        for (const item of day.items ?? []) {
          const name = String(item.location_ref?.name ?? '');
          const lower = name.toLowerCase();
          const matched = keywords.some((k) => lower.includes(String(k).toLowerCase()));
          if (!matched) continue;

          const startMin = parseTimeToMinutes(item.start_window);
          if (startMin == null) continue;

          if (startMin < requiredStart) {
            hits.push({
              day: day.date,
              itemId: item.id,
              name,
              start: String(item.start_window),
              end: String(item.end_window),
            });
          }
        }
      }

      if (hits.length > 0) {
        const msg =
          `Night-sky activity must start at or after ${cond.required_start_time_gte}. ` +
          `Found ${hits.length} item(s) scheduled too early.`;
        return {
          rule_id: rule.id,
          rule_name: rule.name,
          type: rule.type,
          severity: rule.severity,
          sev_level: rule.sev_level,
          message: msg,
          details: {
            required_start_time_gte: cond.required_start_time_gte,
            matched_keywords: keywords,
            offenders: hits,
            country_code: context?.country_code,
          },
          timestamp: nowIso(),
        };
      }
    }

    return null;
  }

  /**
   * 检查合规约束
   */
  private async checkComplianceConstraint(
    _rule: ConstraintRule,
    _itinerary: Itinerary,
    _context: any,
  ): Promise<ConstraintViolation | null> {
    // TODO: 实际实现应该检查签证、许可、法规要求等
    return null;
  }

  /**
   * 检查用户偏好约束
   */
  private async checkUserPreferenceConstraint(
    _rule: ConstraintRule,
    _itinerary: Itinerary,
    _context: any,
  ): Promise<ConstraintViolation | null> {
    // TODO: 实际实现应该检查用户风险偏好、健康限制等
    return null;
  }

  /**
   * 确定SEV级别
   */
  private determineSevLevel(
    violations: ConstraintViolation[],
    warnings: ConstraintWarning[],
  ): SEVLevel {
    if (violations.length === 0 && warnings.length === 0) {
      return 'SEV-4';
    }

    // 检查是否有SEV-1违反
    if (violations.some((v) => v.sev_level === 'SEV-1')) {
      return 'SEV-1';
    }

    // 检查是否有SEV-2违反
    if (violations.some((v) => v.sev_level === 'SEV-2')) {
      return 'SEV-2';
    }

    // 检查是否有SEV-3违反
    if (violations.some((v) => v.sev_level === 'SEV-3')) {
      return 'SEV-3';
    }

    return 'SEV-4';
  }

  /**
   * 初始化约束规则
   */
  private initializeRules(): void {
    // TODO: 从数据库或配置文件加载规则
    // 这里先添加一些示例规则
    this.rules.push({
      id: 'rule_001',
      name: '危险区域禁止',
      type: 'GEOGRAPHIC',
      severity: 'HARD',
      condition: '{}',
      action: 'BLOCK',
      sev_level: 'SEV-1',
    });

    this.rules.push({
      id: 'rule_002',
      name: '高风险季节警告',
      type: 'TEMPORAL',
      severity: 'SOFT',
      condition: '{}',
      action: 'WARN',
      sev_level: 'SEV-3',
    });
  }

  /**
   * 添加约束规则
   */
  addRule(rule: ConstraintRule): void {
    this.rules.push(rule);
    this.logger.log(`[ConstraintsEngine] 添加约束规则: ruleId=${rule.id}`);
  }

  /**
   * 获取所有规则
   */
  getAllRules(): ConstraintRule[] {
    return [...this.rules];
  }
}
