/**
 * NarrateExecutorService
 *
 * P3 C: 实现 INarrateExecutor，执行 NARRATE 阶段
 * 封装 NarratorAgent.narrate，产出用户可读解释（不得改硬字段）
 *
 * 参考: docs/P3_CONDUCTOR_CONVERGENCE_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type {
  INarrateExecutor,
  NarrateExecutorContext,
  NarrationEvidenceCard,
  NarrationLike,
  NarrationWarningEntry,
} from '../../decision/kernel/interfaces/phase-executor.interface';
import { ClaudeNarratorAgentService } from '../services/sub-agents/narrator-agent.service';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import {
  buildL3PersuasionLine,
  parseL3ProofPrefix,
  selectPersuasionMode,
} from '../utils/narrator-l3-persuasion.util';
import { ConstraintsEngineService } from '../training/services/constraints-engine.service';
import { resolveWallHitDistanceMsForConstraints } from '../utils/wall-hit-distance.util';
import { mergeOptimizationDecisionNarration } from './merge-optimization-decision-narration.util';
import { compileCausalNarrative } from '../../trips/decision/narration/causal-narrative-compiler.service';
import type { DecisionLogEntry as KernelDecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
import type { TimeDrift } from '../../trips/decision/temporal/time-drift.types';

@Injectable()
export class NarrateExecutorService implements INarrateExecutor {
  private readonly logger = new Logger(NarrateExecutorService.name);

  constructor(
    @Optional() private readonly narratorAgent?: ClaudeNarratorAgentService,
    @Optional() private readonly constraintsEngine?: ConstraintsEngineService,
  ) {}

  async execute(
    dso: DecisionState,
    ctx: NarrateExecutorContext,
  ): Promise<{ narration: NarrationLike }> {
    const state = ctx.orchestratorState as OrchestratorState | undefined;
    if (!state?.itinerary || !state?.gate_result) {
      this.logger.warn('[NarrateExecutor] 缺少 itinerary 或 gate_result，返回空叙述');
      return {
        narration: {
          user_friendly_summary: '',
          day_by_day_narrative: [],
          highlights: [],
          tips: [],
        },
      };
    }

    if (!this.narratorAgent) {
      this.logger.warn('[NarrateExecutor] NarratorAgent 未注入，返回空叙述');
      return {
        narration: {
          user_friendly_summary: '',
          day_by_day_narrative: [],
          highlights: [],
          tips: [],
        },
      };
    }

    try {
      const escalation = dso.verification?.escalationPlan;
      const party = (state.trip_plan_request as { party?: { has_elderly?: boolean } })?.party;
      const partyNoteZh = party?.has_elderly
        ? '我们注意到您带着父母同行，已在体能与路况校验中采用更保守的物理门槛。'
        : undefined;
      const causalCompiled = compileCausalNarrative({
        decisionLogs: (state.decision_log ?? []) as unknown as KernelDecisionLogEntry[],
        optimizationHints: dso.optimizationHints,
        timeDrifts: (state.itinerary as { temporal?: { drifts?: TimeDrift[] } } | undefined)?.temporal
          ?.drifts,
        partyNoteZh,
      });

      const stateForNarrate = {
        ...state,
        ...(escalation ? { kernel_escalation_plan: escalation } : {}),
        ...(ctx.researchConflict ? { narration_research_conflict: ctx.researchConflict } : {}),
        ...(causalCompiled ? { kernel_causal_narrative_compile: causalCompiled } : {}),
        ...(dso.optimizationHints ? { kernel_optimization_hints: dso.optimizationHints } : {}),
      } as OrchestratorState;

      let narration = (await this.narratorAgent.narrate(
        state.itinerary,
        state.gate_result,
        state.decision_log ?? [],
        stateForNarrate,
      )) as NarrationLike;

      narration = this.mergeTransportResearchGuidanceIntoNarration(narration, state);
      const md = state.metadata as Record<string, unknown> | undefined;
      const isItineraryAdjust =
        md?.itinerary_adjust_intake === true ||
        (md?.route_and_run_intent as { primary?: string } | undefined)?.primary === 'ITINERARY_ADJUST';
      if (!isItineraryAdjust) {
        narration = mergeOptimizationDecisionNarration(narration, dso.optimizationHints);
      }
      narration = this.mergeCausalProtectionNarration(narration, dso, state);

      if (state.metadata && typeof state.metadata === 'object') {
        const m = state.metadata as Record<string, unknown>;
        delete m.is_followup_transport_repair;
      }

      // Physical Narration (Level 2): inject rendered safety/compliance hints from rule engine if available.
      // This keeps the "Vault/Brain" decoupled: rule engine emits narrator_hint_rendered, narrator only surfaces it.
      if (this.constraintsEngine) {
        try {
          const raw = dso.environmentState?.daylightByDate as
            | Record<string, { sunset?: string; civil_dusk?: string; sunrise?: string }>
            | undefined;
          const daylightByDate = raw && typeof raw === 'object' ? raw : undefined;

          const riskTol = (state.trip_plan_request as any)?.party_profile?.risk_tolerance ?? (state.trip_plan_request as any)?.constraints?.risk_tolerance;
          const risk_appetite =
            String(riskTol ?? '').toLowerCase() === 'low'
              ? 'low'
              : String(riskTol ?? '').toLowerCase() === 'high'
                ? 'high'
                : 'medium';

          const overrideBuf = Number((dso.environmentState as any)?.twilightBufferMin);
          const buf =
            Number.isFinite(overrideBuf) && overrideBuf > 0
              ? overrideBuf
              : Number(process.env.DECISION_REPAIR_TWILIGHT_BUFFER_MIN ?? '');
          const twilightBufferMin = Number.isFinite(buf) && buf > 0 ? Math.round(buf) : undefined;

          const windSpeedMs =
            (dso.environmentState as any)?.windSpeedMs ??
            (dso.environmentState as any)?.weather?.wind_speed_mps ??
            undefined;
          const windSpeedByDate = (dso.environmentState as any)?.windSpeedByDate;
          const windSpeedBySegment = (dso.environmentState as any)?.windSpeedBySegment;
          const segmentNameBySegment = (dso.environmentState as any)?.segmentNameBySegment;

          const check = await this.constraintsEngine.checkConstraints(state.itinerary as any, {
            country_code: dso.environmentState?.countryCode ?? (state.trip_plan_request as any)?.destination?.country_code,
            risk_appetite,
            user_preferences: { risk_appetite },
            daylightByDate,
            decision_log: state.decision_log ?? [],
            wall_hit_distance_ms: resolveWallHitDistanceMsForConstraints({
              orchestratorState: state as any,
              decisionLog: state.decision_log ?? [],
            }),
            ...(Number.isFinite(Number(windSpeedMs)) ? { windSpeedMs: Number(windSpeedMs) } : {}),
            ...(windSpeedByDate ? { windSpeedByDate } : {}),
            ...(windSpeedBySegment ? { windSpeedBySegment } : {}),
            ...(segmentNameBySegment ? { segmentNameBySegment } : {}),
            ...(twilightBufferMin ? { twilightBufferMin } : {}),
          } as any);

          const renderedFromWarnings = (check.warnings ?? [])
            .map((w: any) => w?.details?.narrator_hint_rendered)
            .filter((x: any) => typeof x === 'string' && x.trim()) as string[];
          const renderedFromViolations = (check.violations ?? [])
            .map((v: any) => v?.details?.narrator_hint_rendered)
            .filter((x: any) => typeof x === 'string' && x.trim()) as string[];
          // Violations (e.g. wind HARD) should surface ahead of SOFT warnings in tips order.
          const rendered = [...renderedFromViolations, ...renderedFromWarnings].slice(0, 6);

          if (rendered.length > 0) {
            const tips = [...(narration.tips ?? [])];
            for (let i = rendered.length - 1; i >= 0; i--) {
              const line = rendered[i];
              const msg = `[安全贴士] ${line}`.slice(0, 500);
              if (!tips.includes(msg)) tips.unshift(msg);
            }
            narration = { ...narration, tips };
          }

          // Level 4: structured warnings (evidence cards) for UI / audit — not only plain tips text.
          const evidenceCards: NarrationEvidenceCard[] = [];
          const pushEvidenceCard = (row: any) => {
            const ev = row?.details?.evidence;
            const hintRendered = row?.details?.narrator_hint_rendered;
            if (!ev || typeof ev !== 'object' || Array.isArray(ev) || Object.keys(ev).length === 0) return;
            if (typeof hintRendered !== 'string' || !hintRendered.trim()) return;
            const rid = String(row?.rule_id ?? '').trim();
            if (!rid) return;
            const sev = String(row?.severity ?? 'SOFT').toUpperCase() === 'HARD' ? 'HARD' : 'SOFT';
            const msg = `[安全贴士] ${hintRendered.trim()}`.slice(0, 500);
            const pt = Number((row as any)?.details?.persuasion_tier);
            evidenceCards.push({
              kind: 'iron_shield_evidence',
              message: msg,
              severity: sev,
              rule_id: rid,
              rule_name: typeof row?.rule_name === 'string' ? row.rule_name : undefined,
              ...(pt === 1 || pt === 2 || pt === 3 ? { persuasion_tier: pt as 1 | 2 | 3 } : {}),
              evidence: ev as Record<string, unknown>,
              narrator_hint_rendered: hintRendered.trim(),
            });
          };
          for (const v of check.violations ?? []) pushEvidenceCard(v);
          for (const w of check.warnings ?? []) pushEvidenceCard(w);

          if (evidenceCards.length > 0) {
            const prev = (narration.warnings ?? []) as NarrationWarningEntry[];
            const seen = new Set(evidenceCards.map((c) => c.rule_id));
            const rest = prev.filter((w) => {
              if (typeof w === 'object' && w !== null && (w as NarrationEvidenceCard).kind === 'iron_shield_evidence') {
                return !seen.has((w as NarrationEvidenceCard).rule_id);
              }
              return true;
            });
            narration = { ...narration, warnings: [...evidenceCards, ...rest] };
          }
        } catch (e: any) {
          this.logger.debug(`[NarrateExecutor] physical narration hint inject skipped: ${e?.message}`);
        }
      }

      const envConstraintIssues = (dso.verification?.issues ?? []).filter(
        (i) => i.source === 'ENVIRONMENTAL_CONSTRAINTS',
      );
      if (envConstraintIssues.length > 0) {
        const tips = [...(narration.tips ?? [])];
        const label = '[内核提示·环境/可视约束]';
        const summary = envConstraintIssues
          .slice(0, 2)
          .map((i) => i.message)
          .join(' ');
        const line = `${label} 与路况无关的硬性约束需单独关注：${summary}`.slice(0, 500);
        if (!tips.some((t) => t.startsWith(label))) {
          tips.unshift(line);
        }
        narration = { ...narration, tips };
      }

      // L3-aware persuasion (demo): derive deterministic “intercept vs actuary” lines from L3-PROOF payloads.
      const l3Issues = (dso.verification?.issues ?? []).filter((i) =>
        String(i?.message ?? '').startsWith('[L3-PROOF|'),
      );
      if (l3Issues.length > 0) {
        const tips = [...(narration.tips ?? [])];
        const warnings = [...(narration.warnings ?? [])] as NarrationWarningEntry[];
        let addedTips = 0;
        let addedWarn = 0;
        for (const i of l3Issues) {
          const parsed = parseL3ProofPrefix(i.message);
          if (!parsed) continue;
          const mode = selectPersuasionMode(parsed.cid);
          const out = buildL3PersuasionLine({ proof: parsed, mode });
          if (!out) continue;
          if (out.channel === 'warnings' && addedWarn < 2) {
            if (!warnings.some((w) => typeof w === 'string' && w === out.line)) warnings.unshift(out.line);
            addedWarn++;
          }
          if (out.channel === 'tips' && addedTips < 2) {
            if (!tips.includes(out.line)) tips.unshift(out.line);
            addedTips++;
          }
          if (addedTips >= 2 && addedWarn >= 2) break;
        }
        narration = { ...narration, tips, warnings };
      }

      if (escalation?.userClarificationSnippet?.trim()) {
        const escPrefix =
          escalation.constraint === 'SUNSET_VISIBILITY' ? '[内核事实·日落/观景窗口]' : '[内核事实·须优先说明]';
        const core = `${escPrefix} ${escalation.userClarificationSnippet.trim()}`;
        const tips = [...(narration.tips ?? [])];
        if (!tips.some((t) => t.includes(escalation.userClarificationSnippet!.slice(0, 24)))) {
          tips.unshift(core);
        }
        const warnings = [...(narration.warnings ?? [])] as NarrationWarningEntry[];
        if (
          !warnings.some(
            (w) => typeof w === 'string' && w.includes(escalation.userClarificationSnippet!.slice(0, 24)),
          )
        ) {
          warnings.unshift(core);
        }
        narration = { ...narration, tips, warnings };
      }

      const hint = dso.poiPlanning?.narrationHint;
      if (hint?.trim()) {
        const tips = [...(narration.tips ?? [])];
        if (!tips.some((t) => t.includes(hint.slice(0, 20)))) {
          tips.unshift(hint);
        }
        return { narration: { ...narration, tips } };
      }
      return { narration };
    } catch (e: unknown) {
      this.logger.warn(`[NarrateExecutor] NarratorAgent 失败: ${(e as Error)?.message}`);
      return {
        narration: {
          user_friendly_summary: '',
          day_by_day_narrative: [],
          highlights: [],
          tips: [],
        },
      };
    }
  }

  /** 将 RESEARCH 产出的交通降级指引 / 区域一致性提示并入叙事 tips（不修改行程硬字段） */
  private mergeTransportResearchGuidanceIntoNarration(
    narration: NarrationLike,
    state: OrchestratorState,
  ): NarrationLike {
    const rd = (state as any)?.research_data as Record<string, any> | undefined;
    if (!rd) return narration;
    const te = rd.transport_evidence;
    const hy = rd.transport_endpoint_hydration;
    const prevTips = narration.tips ?? [];
    const tips = [...prevTips];
    const g = typeof te?.user_guidance === 'string' ? te.user_guidance.trim() : '';
    if (g && !tips.some((t) => t.includes(g.slice(0, 36)))) {
      tips.unshift(`[行程路线] ${g}`);
    }
    if (hy?.geo_context_hint === 'possible_region_mismatch') {
      const line =
        '系统检测到推断的出发点与目的地所在区域可能不一致；若为境外行程，请核对出发地。';
      if (!tips.some((t) => t.includes('所在区域可能不一致'))) {
        tips.unshift(`[区域一致性] ${line}`);
      }
    }
    if (tips.length === prevTips.length) return narration;
    return { ...narration, tips };
  }

  /**
   * 因果叙事编译器：将 monte_carlo / Neptune / TimeDrift trace 译为受控用户文案。
   * 若 NarratorAgent 已写入 causal_protection_summary_zh 则跳过（避免重复）。
   */
  private mergeCausalProtectionNarration(
    narration: NarrationLike,
    dso: DecisionState,
    state: OrchestratorState,
  ): NarrationLike {
    if (narration.causal_protection_summary_zh?.trim()) {
      return narration;
    }

    const plan = state.itinerary as { temporal?: { drifts?: TimeDrift[] } } | undefined;
    const party = (state.trip_plan_request as { party?: { has_elderly?: boolean } })?.party;
    const partyNoteZh = party?.has_elderly
      ? '我们注意到您带着父母同行，已在体能与路况校验中采用更保守的物理门槛。'
      : undefined;

    const compiled = compileCausalNarrative({
      decisionLogs: (state.decision_log ?? []) as unknown as KernelDecisionLogEntry[],
      optimizationHints: dso.optimizationHints,
      timeDrifts: plan?.temporal?.drifts,
      partyNoteZh,
    });
    if (!compiled) return narration;

    const summary = compiled.deterministicSummaryZh.trim();
    let userSummary = (narration.user_friendly_summary ?? '').trim();
    const anchor = summary.slice(0, Math.min(24, summary.length));
    if (anchor && !userSummary.includes(anchor)) {
      userSummary = userSummary ? `${summary}\n\n${userSummary}` : summary;
    }

    const tips = [...(narration.tips ?? [])];
    const label = '[决策保护]';
    const firstLine = summary.split('\n')[0]?.trim();
    if (firstLine) {
      const line = `${label} ${firstLine}`.slice(0, 500);
      if (!tips.some((t) => t.startsWith(label))) {
        tips.unshift(line);
      }
    }

    return {
      ...narration,
      user_friendly_summary: userSummary,
      tips,
      causal_protection_summary_zh: summary,
      causal_chain: compiled.chain,
    };
  }
}
