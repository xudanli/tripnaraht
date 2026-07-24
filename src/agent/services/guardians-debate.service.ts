// src/agent/services/guardians-debate.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { GateResult, GuardianEvidenceAtom, TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { PersonaClosureAudit } from '../../trips/decision/shared/persona-closure.types';
import { deriveGuardianPersonaVotes } from '../utils/guardian-persona-surface.util';
import {
  debateOutputContradictsUserIntentAnchors,
  extractGuardianDebateUserIntentAnchors,
  inferPersonaHintFromUserIntentAnchors,
} from '../utils/guardian-debate-user-intent-anchor.util';
import {
  buildDeterministicMarathonGuardianResults,
  debateIgnoresMarathonAnchors,
  resolveTripPlanNlMessage,
} from '../utils/marathon-intake-signals.util';
import {
  debateInventsFalse2wdWhenVehicleUnspecified,
  sanitizeGuardianResultsForUnspecifiedVehicle,
} from '../utils/guardian-debate-user-surface.util';
import { isVehicleTypeUserSpecifiedInNl } from '../utils/trip-plan-intake-vehicle.util';
import {
  buildDeterministicFroad2wdGuardianResults,
  buildFroadHighlandIntentSignals,
  isFroad2wdComplianceScenario,
} from '../utils/froad-intake-signals.util';
import {
  buildDeterministicPeakSeasonGuardianResults,
  buildPeakSeasonTimeShiftSignals,
  isPeakSeasonWhaleTimeShiftScenario,
} from '../utils/peak-season-time-shift-intake.util';

export type GuardiansDebateLlmProviderOption =
  | 'auto'
  | 'openai'
  | 'deepseek'
  | 'gemini'
  | 'anthropic'
  | 'vllm';

export interface GuardiansDebateMergeOpts {
  personaHint?: TripPlanRequest['persona_hint'];
  tripContext?: TripPlanRequest | null;
  llmProvider?: GuardiansDebateLlmProviderOption;
  /** PR-B：DecisionTrajectory 缓冲关联键 */
  requestId?: string;
  /** persona closure 闭环审计：注入辩论 LLM 上下文 */
  personaClosureAudit?: PersonaClosureAudit;
}

/** 辩论 LLM 短路：BLOCK，或门控原生 HARD（不含 VERIFY 合成项 `verify_synthetic`） */
function isFatalGateViolation(gate: GateResult): boolean {
  if (gate.gate_result === 'BLOCK') return true;
  return (gate.violations ?? []).some(v => v.severity === 'HARD' && v.verify_synthetic !== true);
}

/** LLM 输出校验：任意 HARD（含 VERIFY 合成）或 BLOCK 时 Abu 不得 ALLOW */
function gateRequiresAbuRejectFromViolations(gate: GateResult): boolean {
  if (gate.gate_result === 'BLOCK') return true;
  return (gate.violations ?? []).some(v => v.severity === 'HARD');
}

function resolveLlmProvider(llmService: LlmService, opt?: GuardiansDebateLlmProviderOption): LlmProvider {
  if (opt && opt !== 'auto') {
    switch (opt) {
      case 'openai':
        return LlmProvider.OPENAI;
      case 'deepseek':
        return LlmProvider.DEEPSEEK;
      case 'gemini':
        return LlmProvider.GEMINI;
      case 'anthropic':
        return LlmProvider.ANTHROPIC;
      case 'vllm':
        return LlmProvider.VLLM;
      default:
        break;
    }
  }
  return llmService.getDefaultProvider();
}

function slimTripContext(trip: TripPlanRequest | null | undefined): Record<string, unknown> | undefined {
  if (!trip) return undefined;
  return {
    request_id: trip.request_id,
    origin: trip.origin,
    destination: trip.destination,
    date_range: trip.date_range,
    start_date: trip.start_date,
    days: trip.days,
    mode: trip.mode,
    pace: trip.pace,
    constraints: trip.constraints
      ? {
          ...(isVehicleTypeUserSpecifiedInNl(trip) && trip.constraints.vehicle_type
            ? { vehicle_type: trip.constraints.vehicle_type }
            : {}),
          max_ascent_m: trip.constraints.max_ascent_m,
          max_walk_km: trip.constraints.max_walk_km,
        }
      : undefined,
    vehicle_drivetrain: {
      specified: isVehicleTypeUserSpecifiedInNl(trip),
      vehicle_type: isVehicleTypeUserSpecifiedInNl(trip)
        ? (trip.constraints?.vehicle_type ?? null)
        : null,
      ...(!isVehicleTypeUserSpecifiedInNl(trip)
        ? {
            policy_zh:
              '用户未在请求中指定两驱/四驱；禁止将 2WD 当作已选车型写入合议。Abu 仅可提示「未确认车型、环岛建议评估四驱」；主冲突应围绕连续驾驶疲劳与路线节奏。',
          }
        : {}),
    },
    party: trip.party,
    message: resolveTripPlanNlMessage(trip)?.slice(0, 2000),
  };
}

/**
 * PLAN_GEN 前 await 辩论的上限：为后续 PLAN/VERIFY/NARRATE 保留墙钟。
 * @returns 0 表示不等待 LLM，直接用确定性/投影回退
 */
export function computeGuardiansDebateAwaitBudgetMs(remainingMs: number): number {
  const reserveAfterDebate = 42_000;
  const available = remainingMs - reserveAfterDebate;
  if (available < 2_000) return 0;
  return Math.min(22_000, available);
}

/** 用于 shadow 消费：仅比较门控真值，忽略 `guardian_results` 投影差异 */
export function computeGateSnapshotKey(gate: GateResult): string {
  return JSON.stringify({
    gate_result: gate.gate_result,
    violations: gate.violations ?? [],
    required_adjustments: gate.required_adjustments ?? [],
  });
}

function buildDebateTripContextPayload(
  trip: TripPlanRequest | null | undefined,
  personaClosureAudit?: PersonaClosureAudit,
): Record<string, unknown> | null {
  const slim = slimTripContext(trip) ?? {};
  const sku = trip?.guardian_debate_trip_context as Record<string, unknown> | undefined;
  const intentAnchors =
    (sku?.user_intent_anchors as Record<string, unknown> | undefined) ??
    extractGuardianDebateUserIntentAnchors(resolveTripPlanNlMessage(trip));
  const merged: Record<string, unknown> = {
    ...slim,
    ...(sku ?? {}),
    ...(intentAnchors ? { user_intent_anchors: intentAnchors } : {}),
    ...(personaClosureAudit ? { persona_closure_audit: personaClosureAudit } : {}),
  };
  return Object.keys(merged).length ? merged : null;
}

function resolveDebatePersonaHint(
  trip: TripPlanRequest | null | undefined,
  explicit?: TripPlanRequest['persona_hint'],
): TripPlanRequest['persona_hint'] | null {
  const skuAnchors = trip?.guardian_debate_trip_context?.user_intent_anchors;
  const inferred = inferPersonaHintFromUserIntentAnchors(
    skuAnchors ?? extractGuardianDebateUserIntentAnchors(resolveTripPlanNlMessage(trip)),
  );
  if (!inferred && !explicit) return null;
  return {
    ...inferred,
    ...explicit,
    ...(inferred?.drdre_tolerance && !explicit?.drdre_tolerance
      ? { drdre_tolerance: inferred.drdre_tolerance }
      : {}),
  };
}

function readUserIntentAnchorsForDebate(trip: TripPlanRequest | null | undefined) {
  return (
    trip?.guardian_debate_trip_context?.user_intent_anchors ??
    extractGuardianDebateUserIntentAnchors(resolveTripPlanNlMessage(trip))
  );
}

function stripJsonFences(text: string): string {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence?.[1]) return fence[1].trim();
  return t;
}

function isVerdict(v: unknown, allowed: readonly string[]): v is string {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v);
}

/** REPLACE 时 debate_summary_zh 的观测性启发式：仅打日志，不回退 v1 投影 */
const REPLACE_DEBATE_SUMMARY_MIN_CHARS = 15;
const REPLACE_DEBATE_RISK_HINT_SUBSTRINGS = [
  '注意',
  '风险',
  '驾驶时长',
  '残余',
  '预警',
  '疲劳',
  '路况',
  '黑冰',
  '发夹',
  '额外',
  '体力',
  '谨慎',
];

function replaceDebateSummaryHeuristicIssue(summary: string | undefined): string | null {
  const s = summary?.trim() ?? '';
  if (s.length < REPLACE_DEBATE_SUMMARY_MIN_CHARS) {
    return `debate_summary_zh too short (${s.length} < ${REPLACE_DEBATE_SUMMARY_MIN_CHARS})`;
  }
  const hasRiskHint = REPLACE_DEBATE_RISK_HINT_SUBSTRINGS.some(k => s.includes(k));
  if (!hasRiskHint) {
    return 'debate_summary_zh missing common residual-risk hints';
  }
  return null;
}

function normalizeEvidenceAtoms(atoms: unknown, fallbackText: string): GuardianEvidenceAtom[] {
  if (!Array.isArray(atoms) || atoms.length === 0) {
    return [{ text: fallbackText, violation_code: 'DEBATE:FALLBACK', tag: 'generic' }];
  }
  return atoms
    .map((a: any) => ({
      text: typeof a?.text === 'string' && a.text.trim() ? a.text.trim() : fallbackText,
      violation_code: typeof a?.violation_code === 'string' ? a.violation_code : undefined,
      tag: typeof a?.tag === 'string' ? (a.tag as GuardianEvidenceAtom['tag']) : undefined,
    }))
    .slice(0, 12);
}

/**
 * 影子辩论：在硬门已成立的前提下，可选调用 LLM 丰富 `guardian_results`。
 * `BLOCK` 或门控原生 **非合成** `HARD` 时跳过 LLM；VERIFY 合成 `HARD`（`verify_synthetic`）仍可辩论，但校验时 Abu 须 `REJECT`。
 */
@Injectable()
export class GuardiansDebateService {
  private readonly logger = new Logger(GuardiansDebateService.name);
  private systemPromptCache: string | null = null;
  private readonly shadowByRequestId = new Map<
    string,
    { snapshotKey: string; triggeredAt: number; promise: Promise<GateResult> }
  >();

  constructor(
    private readonly llmService: LlmService,
    @Optional()
    private readonly trajectoryInterlocutor?: import('../training/services/decision-trajectory-interlocutor.service').DecisionTrajectoryInterlocutorService,
  ) {}

  private captureDebateForTrajectory(
    requestId: string | undefined,
    gate: GateResult,
    capture?: {
      source: 'llm_debate' | 'deterministic_projection';
      prompts?: { system_prompt: string; user_prompt: string };
      raw_completion?: string;
    },
  ): void {
    if (!this.trajectoryInterlocutor?.isEnabled() || !requestId?.trim() || !gate.guardian_results) {
      return;
    }
    this.trajectoryInterlocutor.appendDebateBuffer(requestId, {
      source: capture?.source ?? (gate.guardian_results.source === 'llm_debate' ? 'llm_debate' : 'deterministic_projection'),
      gate,
      tie_break_used: Boolean((gate as { metadata?: { debate_gate_fusion?: string } }).metadata?.debate_gate_fusion),
      debate_gate_fusion: (gate as { metadata?: { debate_gate_fusion?: string } }).metadata?.debate_gate_fusion,
      prompts: capture?.prompts,
      raw_completion: capture?.raw_completion,
    });
  }

  /**
   * 是否跳过辩论 LLM：`BLOCK` 或 **非 VERIFY 合成**的 `HARD`。
   * VERIFY 并入的 `HARD`（`verify_synthetic: true`）仍可由 `mergeGuardianPersonaLlmIntoGate` 跑合议，但 `validateAndNormalizeGuardianResults` 要求 Abu 与门控 HARD 一致。
   */
  hasFatalViolation(gate: GateResult): boolean {
    return isFatalGateViolation(gate);
  }

  private loadSystemPrompt(): string {
    if (this.systemPromptCache) return this.systemPromptCache;
    const p = join(process.cwd(), 'prompts', 'agents', 'guardians-debate.md');
    if (!existsSync(p)) {
      throw new Error(`Guardians debate prompt missing: ${p}`);
    }
    this.systemPromptCache = readFileSync(p, 'utf-8');
    return this.systemPromptCache;
  }

  parseGuardianDebateJson(raw: string): unknown {
    const stripped = stripJsonFences(raw);
    return JSON.parse(stripped);
  }

  private validateAndNormalizeGuardianResults(
    parsed: unknown,
    gate: GateResult,
    tripContext?: TripPlanRequest | null,
  ): NonNullable<GateResult['guardian_results']> | null {
    if (!parsed || typeof parsed !== 'object') return null;
    const root = parsed as Record<string, unknown>;
    const gr = root.guardian_results;
    if (!gr || typeof gr !== 'object') return null;
    const g = gr as Record<string, unknown>;
    const abu = g.abu as Record<string, unknown> | undefined;
    const drdre = g.drdre as Record<string, unknown> | undefined;
    const neptune = g.neptune as Record<string, unknown> | undefined;
    if (!abu || !drdre || !neptune) return null;
    if (!isVerdict(abu.verdict, ['ALLOW', 'REJECT'])) return null;
    if (!isVerdict(drdre.verdict, ['ALLOW', 'ADJUST', 'REJECT'])) return null;
    if (!isVerdict(neptune.verdict, ['ALLOW', 'REPLACE', 'REJECT'])) return null;
    if (!Array.isArray(abu.evidence) || !Array.isArray(drdre.evidence) || !Array.isArray(neptune.evidence)) {
      return null;
    }

    if (gateRequiresAbuRejectFromViolations(gate) && abu.verdict !== 'REJECT') {
      this.logger.warn('[GuardiansDebate] LLM contradicted gate HARD/BLOCK; discarding debate output');
      return null;
    }

    const debateSummary =
      typeof g.debate_summary_zh === 'string' && g.debate_summary_zh.trim() ? g.debate_summary_zh.trim() : undefined;

    const out: NonNullable<GateResult['guardian_results']> = {
      source: 'llm_debate',
      is_simulated: false,
      abu: {
        verdict: abu.verdict as 'ALLOW' | 'REJECT',
        evidence: (abu.evidence as string[]).filter(Boolean).slice(0, 12),
        evidence_atoms: normalizeEvidenceAtoms(abu.evidence_atoms, 'Abu'),
      },
      drdre: {
        verdict: drdre.verdict as 'ALLOW' | 'ADJUST' | 'REJECT',
        evidence: (drdre.evidence as string[]).filter(Boolean).slice(0, 12),
        evidence_atoms: normalizeEvidenceAtoms(drdre.evidence_atoms, 'Dr.Dre'),
      },
      neptune: {
        verdict: neptune.verdict as 'ALLOW' | 'REPLACE' | 'REJECT',
        evidence: (neptune.evidence as string[]).filter(Boolean).slice(0, 12),
        evidence_atoms: normalizeEvidenceAtoms(neptune.evidence_atoms, 'Neptune'),
      },
    };
    if (debateSummary) {
      (out as { debate_summary_zh?: string }).debate_summary_zh = debateSummary;
    }

    if (neptune.verdict === 'REPLACE') {
      const issue = replaceDebateSummaryHeuristicIssue(debateSummary);
      if (issue) {
        const preview = (debateSummary ?? '').slice(0, 120);
        this.logger.warn(
          `[GuardiansDebate] REPLACE ${issue}; no v1 fallback. summary_preview=${JSON.stringify(preview)}`,
        );
      }
    }

    const drdreOut = out.drdre;
    const neptuneOut = out.neptune;
    if (!drdreOut || !neptuneOut) return null;

    const anchors = readUserIntentAnchorsForDebate(tripContext);
    const intakeNl = resolveTripPlanNlMessage(tripContext ?? undefined);
    if (isFroad2wdComplianceScenario(tripContext ?? undefined, intakeNl)) {
      const froadSignals =
        buildFroadHighlandIntentSignals(intakeNl) ??
        ({
          f_road_highland_crossing: true,
          interpretation_zh: anchors?.interpretation_zh ?? 'F 路高地穿越',
        } as const);
      return buildDeterministicFroad2wdGuardianResults(gate, froadSignals, tripContext ?? undefined);
    }

    if (isPeakSeasonWhaleTimeShiftScenario(tripContext ?? undefined, intakeNl)) {
      const peakSignals =
        buildPeakSeasonTimeShiftSignals(intakeNl, new Date().getFullYear(), tripContext ?? undefined) ??
        ({
          peak_season_crowd_avoidance: true,
          whale_watching_husavik: true,
          overnight_stay_akureyri: true,
          interpretation_zh: anchors?.interpretation_zh ?? '旺季观鲸错峰',
        } as const);
      return buildDeterministicPeakSeasonGuardianResults(gate, peakSignals);
    }

    if (
      debateOutputContradictsUserIntentAnchors(anchors, {
        debate_summary_zh: debateSummary,
        neptune_verdict: neptuneOut.verdict,
        drdre_verdict: drdreOut.verdict,
        neptune_evidence: neptuneOut.evidence,
        drdre_evidence: drdreOut.evidence,
      })
    ) {
      this.logger.warn(
        `[GuardiansDebate] LLM REPLACE/ADJUST contradicts user_intent_anchors (${anchors?.interpretation_zh ?? 'n/a'}); discarding debate output`,
      );
      return null;
    }

    if (
      debateIgnoresMarathonAnchors(anchors, {
        drdre_verdict: drdreOut.verdict,
        debate_summary_zh: debateSummary,
        drdre_evidence: drdreOut.evidence,
      })
    ) {
      this.logger.warn(
        `[GuardiansDebate] LLM ignored midnight_sun marathon anchors; using deterministic marathon projection`,
      );
      return buildDeterministicMarathonGuardianResults(gate, anchors!, tripContext ?? undefined);
    }

    if (debateInventsFalse2wdWhenVehicleUnspecified(tripContext ?? undefined, out)) {
      this.logger.warn(
        `[GuardiansDebate] LLM invented 2WD constraint without user specification; using marathon projection or scrub`,
      );
      if (anchors?.midnight_sun_continuous_drive) {
        return buildDeterministicMarathonGuardianResults(gate, anchors, tripContext ?? undefined);
      }
    }

    return sanitizeGuardianResultsForUnspecifiedVehicle(out, tripContext ?? undefined);
  }

  /**
   * 编排器在 Gate 落定后尽早调用：与后续 PLAN 等步骤并行跑辩论 LLM。
   * 同一 `request_id` 仅保留首次；致命门控不启动。
   */
  startShadowIfEligible(requestId: string, gate: GateResult, opts: GuardiansDebateMergeOpts): void {
    const rid = requestId?.trim();
    if (!rid || this.shadowByRequestId.has(rid)) return;
    if (isFatalGateViolation(gate)) return;
    const snapshotKey = computeGateSnapshotKey(gate);
    const triggeredAt = Date.now();
    const promise = this.mergeGuardianPersonaLlmIntoGate(gate, { ...opts, requestId: rid });
    this.shadowByRequestId.set(rid, { snapshotKey, triggeredAt, promise });
    this.logger.debug(`[GuardiansDebate] shadow started request_id=${rid}`);
  }

  private buildDebateWaitFallback(gateSurfaced: GateResult, opts: GuardiansDebateMergeOpts): GateResult {
    const trip = opts.tripContext ?? undefined;
    const intakeNl = resolveTripPlanNlMessage(trip);
    if (isFroad2wdComplianceScenario(trip, intakeNl)) {
      const froadSignals =
        buildFroadHighlandIntentSignals(intakeNl) ??
        ({ f_road_highland_crossing: true, interpretation_zh: 'F 路高地穿越' } as const);
      return {
        ...gateSurfaced,
        guardian_results: buildDeterministicFroad2wdGuardianResults(
          gateSurfaced,
          froadSignals,
          trip,
        ),
      };
    }
    if (isPeakSeasonWhaleTimeShiftScenario(trip, intakeNl)) {
      const peakSignals =
        buildPeakSeasonTimeShiftSignals(intakeNl, new Date().getFullYear(), trip) ??
        ({
          peak_season_crowd_avoidance: true,
          whale_watching_husavik: true,
          overnight_stay_akureyri: true,
          interpretation_zh: '旺季观鲸错峰',
        } as const);
      return {
        ...gateSurfaced,
        guardian_results: buildDeterministicPeakSeasonGuardianResults(gateSurfaced, peakSignals),
      };
    }
    const anchors = readUserIntentAnchorsForDebate(trip);
    if (anchors?.midnight_sun_continuous_drive) {
      return {
        ...gateSurfaced,
        guardian_results: buildDeterministicMarathonGuardianResults(
          gateSurfaced,
          anchors,
          opts.tripContext ?? undefined,
        ),
      };
    }
    return {
      ...gateSurfaced,
      guardian_results: deriveGuardianPersonaVotes(gateSurfaced),
    };
  }

  private attachShadowGuardianResults(
    gateSurfaced: GateResult,
    resolved: GateResult,
    entry: { triggeredAt: number },
    shadowWaitMs: number,
  ): GateResult {
    const lat = resolved.guardian_results?.debate_latency_ms ?? 0;
    const debateOverlappingLatencySavedEstimateMs = Math.max(0, lat - shadowWaitMs);
    return {
      ...gateSurfaced,
      guardian_results: resolved.guardian_results
        ? {
            ...resolved.guardian_results,
            debate_shadow_wait_ms: shadowWaitMs,
            debate_overlapping_latency_saved_estimate_ms: debateOverlappingLatencySavedEstimateMs,
            debate_shadow_triggered_at: entry.triggeredAt,
          }
        : gateSurfaced.guardian_results,
    };
  }

  /**
   * PLAN_GEN 前消费 shadow：在 `maxWaitMs` 内 await；超时则用确定性/投影回退，避免整链 60s 掐死。
   */
  async consumeShadowOrMergeWithBudget(
    requestId: string,
    gateSurfaced: GateResult,
    opts: GuardiansDebateMergeOpts,
    maxWaitMs: number,
  ): Promise<{ gate: GateResult; debate_wait_timed_out: boolean }> {
    const rid = requestId?.trim();
    const currentKey = computeGateSnapshotKey(gateSurfaced);
    const entry = rid ? this.shadowByRequestId.get(rid) : undefined;

    if (entry && entry.snapshotKey === currentKey && rid) {
      this.shadowByRequestId.delete(rid);
      const tAwait = Date.now();

      if (maxWaitMs <= 0) {
        return {
          gate: this.buildDebateWaitFallback(gateSurfaced, opts),
          debate_wait_timed_out: true,
        };
      }

      try {
        const resolved = await Promise.race([
          entry.promise,
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('DEBATE_WAIT_BUDGET_EXCEEDED')), maxWaitMs);
          }),
        ]);
        const shadowWaitMs = Date.now() - tAwait;
        return {
          gate: this.attachShadowGuardianResults(gateSurfaced, resolved, entry, shadowWaitMs),
          debate_wait_timed_out: false,
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'DEBATE_WAIT_BUDGET_EXCEEDED') {
          this.logger.warn(
            `[GuardiansDebate] debate await budget exceeded request_id=${rid} maxWaitMs=${maxWaitMs}`,
          );
          return {
            gate: this.buildDebateWaitFallback(gateSurfaced, opts),
            debate_wait_timed_out: true,
          };
        }
        this.logger.warn(`[GuardiansDebate] shadow await failed: ${msg}`);
        return {
          gate: this.buildDebateWaitFallback(gateSurfaced, opts),
          debate_wait_timed_out: true,
        };
      }
    }

    if (entry && rid) {
      this.shadowByRequestId.delete(rid);
      this.logger.debug(`[GuardiansDebate] shadow discarded (gate snapshot mismatch) request_id=${rid}`);
    }

    if (maxWaitMs <= 0) {
      return {
        gate: this.buildDebateWaitFallback(gateSurfaced, opts),
        debate_wait_timed_out: true,
      };
    }

    try {
      const merged = await Promise.race([
        this.mergeGuardianPersonaLlmIntoGate(gateSurfaced, { ...opts, requestId: rid ?? opts.requestId }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('DEBATE_WAIT_BUDGET_EXCEEDED')), maxWaitMs);
        }),
      ]);
      return { gate: merged, debate_wait_timed_out: false };
    } catch {
      return {
        gate: this.buildDebateWaitFallback(gateSurfaced, opts),
        debate_wait_timed_out: true,
      };
    }
  }

  /**
   * Assembler 消费：若存在与当前门控快照一致的 shadow，则 `await` 并合并 `guardian_results`；
   * 否则现场调用 `mergeGuardianPersonaLlmIntoGate`。
   */
  async consumeShadowOrMerge(
    requestId: string,
    gateSurfaced: GateResult,
    opts: GuardiansDebateMergeOpts,
  ): Promise<GateResult> {
    const { gate } = await this.consumeShadowOrMergeWithBudget(
      requestId,
      gateSurfaced,
      opts,
      Number.POSITIVE_INFINITY,
    );
    return gate;
  }

  /**
   * 在已附着 `guardian_results` 的 gate 上，可选覆盖为 LLM 合议输出；失败则返回原 gate。
   */
  async mergeGuardianPersonaLlmIntoGate(gate: GateResult, opts: GuardiansDebateMergeOpts): Promise<GateResult> {
    if (isFatalGateViolation(gate)) {
      const out = {
        ...gate,
        guardian_results: deriveGuardianPersonaVotes(gate),
      };
      this.captureDebateForTrajectory(opts.requestId, out, { source: 'deterministic_projection' });
      return out;
    }

    const tripCtx = opts.tripContext ?? undefined;
    const intakeNl = resolveTripPlanNlMessage(tripCtx);
    if (isFroad2wdComplianceScenario(tripCtx, intakeNl)) {
      const froadSignals =
        buildFroadHighlandIntentSignals(intakeNl) ??
        ({ f_road_highland_crossing: true, interpretation_zh: 'F 路高地穿越' } as const);
      const froadOut: GateResult = {
        ...gate,
        guardian_results: buildDeterministicFroad2wdGuardianResults(gate, froadSignals, tripCtx),
      };
      this.captureDebateForTrajectory(opts.requestId, froadOut, { source: 'deterministic_projection' });
      return froadOut;
    }

    if (isPeakSeasonWhaleTimeShiftScenario(tripCtx, intakeNl)) {
      const peakSignals =
        buildPeakSeasonTimeShiftSignals(intakeNl, new Date().getFullYear(), tripCtx) ??
        ({
          peak_season_crowd_avoidance: true,
          whale_watching_husavik: true,
          overnight_stay_akureyri: true,
          interpretation_zh: '胡萨维克观鲸错峰',
        } as const);
      const peakOut: GateResult = {
        ...gate,
        guardian_results: buildDeterministicPeakSeasonGuardianResults(gate, peakSignals),
      };
      this.captureDebateForTrajectory(opts.requestId, peakOut, { source: 'deterministic_projection' });
      return peakOut;
    }

    const provider = resolveLlmProvider(this.llmService, opts.llmProvider);
    const personaHint = resolveDebatePersonaHint(opts.tripContext ?? undefined, opts.personaHint);
    const personaClosureAudit =
      opts.personaClosureAudit ?? gate.persona_closure_audit ?? undefined;
    const userPayload = {
      gate_result: gate.gate_result,
      violations: gate.violations ?? [],
      required_adjustments: gate.required_adjustments ?? [],
      persona_hint: personaHint,
      trip_context: buildDebateTripContextPayload(opts.tripContext ?? undefined, personaClosureAudit),
      ...(personaClosureAudit ? { persona_closure_audit: personaClosureAudit } : {}),
    };

    const systemPrompt = this.loadSystemPrompt();
    const userPrompt = JSON.stringify(userPayload, null, 2);
    const prompt = `${systemPrompt}\n\n---\n\nUser JSON package (parse fields, then output ONLY the JSON object):\n${userPrompt}`;

    const started = Date.now();
    let rawText: string;
    try {
      rawText = await this.llmService.callLlmWithSchema(provider, prompt, undefined, undefined);
    } catch (e: any) {
      this.logger.warn(`[GuardiansDebate] LLM call failed: ${e?.message ?? e}`);
      return gate;
    }

    let parsed: unknown;
    try {
      parsed = this.parseGuardianDebateJson(rawText);
    } catch (e: any) {
      this.logger.warn(`[GuardiansDebate] JSON parse failed: ${e?.message ?? e}`);
      return gate;
    }

    const normalized = this.validateAndNormalizeGuardianResults(parsed, gate, opts.tripContext ?? undefined);
    if (!normalized) {
      const projection = deriveGuardianPersonaVotes(gate);
      const anchors = readUserIntentAnchorsForDebate(opts.tripContext ?? undefined);
      if (anchors?.midnight_sun_continuous_drive) {
        const marathonOut: GateResult = {
          ...gate,
          guardian_results: buildDeterministicMarathonGuardianResults(
            gate,
            anchors,
            opts.tripContext ?? undefined,
          ),
        };
        this.captureDebateForTrajectory(opts.requestId, marathonOut, { source: 'deterministic_projection' });
        return marathonOut;
      }
      if (anchors?.interpretation_zh) {
        const anchorOut: GateResult = {
          ...gate,
          guardian_results: {
            ...projection,
            debate_summary_zh: `您的诉求：${anchors.interpretation_zh}。若下方日程与「连续自驾/环岛」强度不符，说明尚未按该诉求定稿；存在安全或合规阻碍时，请改车型/改线，或确认是否接受降强度方案。`,
          },
        };
        this.captureDebateForTrajectory(opts.requestId, anchorOut, { source: 'deterministic_projection' });
        return anchorOut;
      }
      const projOut: GateResult = { ...gate, guardian_results: projection };
      this.captureDebateForTrajectory(opts.requestId, projOut, { source: 'deterministic_projection' });
      return projOut;
    }

    const latencyMs = Date.now() - started;
    const out: GateResult = {
      ...gate,
      guardian_results: {
        ...normalized,
        debate_latency_ms: latencyMs,
      },
    };
    this.captureDebateForTrajectory(opts.requestId, out, {
      source: 'llm_debate',
      prompts: { system_prompt: systemPrompt, user_prompt: userPrompt },
      raw_completion: rawText,
    });
    return out;
  }
}
