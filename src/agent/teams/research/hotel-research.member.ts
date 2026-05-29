import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import { inferResearchKeyScope, markResearchScopeFreshness } from '../../utils/research-asset-scope.util';
import type { IResearchMember, ResearchMemberScopedCommerceInput } from './research-member.interface';
import { computeResearchPatchFromIsolation, deepCloneResearchData } from './research-context-manager';
import { ResearchTeamBusService } from './research-team-bus.service';
import { isResearchParallelAssignmentPayload } from './research-team-bus.types';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';
import { shouldApplyExperienceGossip } from './research-member-cognitive-gossip.util';
import { buildResearchFinancialsFromHotelLiveRefresh } from './research-member-hotel-financials.util';
import { shouldEnableStabilityMode } from '../../memory/emotional-resonance/research-member-stability.util';
import {
  hotelStabilityRiskBuffer,
  resolveHotelEnvironmentConfidence,
  type HotelEnvironmentConfidence,
} from './research-member-hotel-env-confidence.util';

/**
 * 住宿域 Member：`scoped_partial` + hotel 时的 live commerce 刷新与 rollback 缝合。
 */
@Injectable()
export class HotelResearchMember implements IResearchMember, OnModuleInit, OnModuleDestroy {
  readonly memberId = 'HotelResearchMember' as const;
  readonly assetScopes = ['hotel'] as const;

  private readonly logger = new Logger(HotelResearchMember.name);
  private busOff?: () => void;

  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly researchTeamBus?: ResearchTeamBusService,
  ) {}

  onModuleInit(): void {
    if (!this.researchTeamBus) return;
    this.busOff = this.researchTeamBus.subscribeGlobalAssignments(async (env) => {
      if (!isResearchParallelAssignmentPayload(env.payload) || env.payload.memberKind !== 'hotel') return;
      const p = env.payload;
      try {
        const baselineRd = deepCloneResearchData(p.researchData);
        const baselineEr = [...p.evidenceRefs];
        await this.runScopedCommerce({
          requestId: env.requestId,
          tripPlanRequest: p.tripPlanRequest,
          researchData: p.researchData,
          evidenceRefs: p.evidenceRefs,
          researchAtomicRollbackSnapshot: p.researchAtomicRollbackSnapshot,
          userCognitiveProfile: p.userCognitiveProfile,
          ...(p.dso ? { dso: p.dso } : {}),
          ...(p.userEmotionalAccount ? { userEmotionalAccount: p.userEmotionalAccount } : {}),
          ...(p.budgetArbitrationHints?.austerity_mode
            ? {
                budgetRerunHints: {
                  austerityMode: true as const,
                  ...(p.budgetBucket ? { tightenedBudgetBucket: p.budgetBucket } : {}),
                },
              }
            : {}),
        });
        const patch = computeResearchPatchFromIsolation({
          baselineResearchData: baselineRd,
          isolatedResearchData: p.researchData,
          baselineEvidenceRefs: baselineEr,
          isolatedEvidenceRefs: p.evidenceRefs,
          scope: 'hotel',
        });
        const financials = buildResearchFinancialsFromHotelLiveRefresh(p.researchData);
        this.researchTeamBus!.publishCompletion(env.requestId, env.slotId, {
          ok: true,
          patch,
          ...(financials ? { financials } : {}),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[HotelResearchMember] bus assignment failed requestId=${env.requestId} slotId=${env.slotId} ${msg}`);
        this.researchTeamBus!.publishCompletion(env.requestId, env.slotId, { ok: false, error: msg });
      }
    });
  }

  onModuleDestroy(): void {
    this.busOff?.();
    this.busOff = undefined;
  }

  async runScopedCommerce(input: ResearchMemberScopedCommerceInput): Promise<void> {
    const {
      tripPlanRequest,
      researchData,
      evidenceRefs,
      requestId,
      researchAtomicRollbackSnapshot,
      userCognitiveProfile,
      budgetRerunHints,
      userEmotionalAccount,
      dso,
    } = input;
    const stabilityFirst = shouldEnableStabilityMode(userEmotionalAccount);
    await this.runCommerceHotelRefresh(tripPlanRequest, researchData, evidenceRefs, userCognitiveProfile, {
      austerityMode: !!budgetRerunHints?.austerityMode,
      stabilityFirst,
      dso,
    });
    if (!this.isLiveHotelRefreshHealthy(researchData) && researchAtomicRollbackSnapshot) {
      this.stitchHotelScopeFromRollback(researchData, researchAtomicRollbackSnapshot);
      this.logger.warn(
        `[HotelResearchMember] live_hotel_refresh 未产出有效结果，已从 researchAtomicRollbackSnapshot 缝合 hotel 域 requestId=${requestId}`,
      );
    }
  }

  private isLiveHotelRefreshHealthy(researchData: Record<string, unknown>): boolean {
    const v = researchData.live_hotel_refresh;
    if (!v || typeof v !== 'object') return false;
    const r = (v as Record<string, unknown>).result as unknown;
    if (Array.isArray(r)) return r.length > 0;
    if (r && typeof r === 'object') {
      const o = r as Record<string, unknown>;
      if (Array.isArray(o.hotels)) return o.hotels.length > 0;
      if (Array.isArray(o.results)) return o.results.length > 0;
      if (Array.isArray(o.items)) return o.items.length > 0;
      if (o.hotel && typeof o.hotel === 'object') return true;
    }
    return false;
  }

  private stitchHotelScopeFromRollback(
    researchData: Record<string, unknown>,
    rollback: Record<string, unknown>,
  ): void {
    for (const key of Object.keys(rollback)) {
      if (key.startsWith('__')) continue;
      if (inferResearchKeyScope(key) !== 'hotel') continue;
      const val = rollback[key];
      try {
        const sc = (globalThis as { structuredClone?: (x: unknown) => unknown }).structuredClone;
        researchData[key] =
          typeof sc === 'function' ? (sc(val) as unknown) : (JSON.parse(JSON.stringify(val)) as unknown);
      } catch {
        researchData[key] = val;
      }
    }
    (researchData as Record<string, unknown>).live_hotel_refresh = {
      stitched_from_rollback: true,
      updated_at: new Date().toISOString(),
    };
    markResearchScopeFreshness(researchData, 'hotel', 'STALE_RECOVERED', {
      attribution: 'HARNESS:live_hotel_refresh_stitch_from_rollback',
    });
  }

  private async runCommerceHotelRefresh(
    tripRequest: ResearchMemberScopedCommerceInput['tripPlanRequest'],
    researchData: Record<string, unknown>,
    evidenceRefs: string[],
    userCognitiveProfile?: ResearchMemberScopedCommerceInput['userCognitiveProfile'],
    opts?: Readonly<{ austerityMode?: boolean; stabilityFirst?: boolean; dso?: DecisionState }>,
  ): Promise<void> {
    if (!this.skillsRegistry) return;
    const dest = tripRequest.destination;
    const query =
      typeof dest === 'string' && dest.trim()
        ? `${dest.trim()} 酒店 住宿`
        : typeof dest === 'object' && dest
          ? '目的地附近酒店 住宿'
          : '酒店 住宿';
    const austerity = !!opts?.austerityMode;
    const stabilityFirst = !!opts?.stabilityFirst;
    const dso = opts?.dso;
    const gossip =
      austerity || stabilityFirst ? null : this.buildHotelSearchGossip(userCognitiveProfile, researchData, dso);
    const candidates = stabilityFirst ? (['hotel.search'] as const) : (['hotel.search', 'hotel.recommend'] as const);
    const limit = austerity ? 4 : 8;
    for (const name of candidates) {
      const skill = this.skillsRegistry.getSkill(name);
      if (!skill) continue;
      try {
        const skillInput: Record<string, unknown> = { query, limit };
        const sp: Record<string, unknown> = {};
        if (austerity) sp.austerityMode = true;
        let stabilityEnvBand: HotelEnvironmentConfidence | undefined;
        let stabilityRiskBuffer: 'MODERATE' | 'MAXIMUM' | undefined;
        if (stabilityFirst) {
          stabilityEnvBand = resolveHotelEnvironmentConfidence({ researchData, dso });
          stabilityRiskBuffer = hotelStabilityRiskBuffer(stabilityEnvBand);
          sp.stabilityMode = 'STABILITY_FIRST';
          sp.mode = 'STABILITY_DRIVEN';
          sp.risk_buffer = stabilityRiskBuffer;
          sp.guarantee_priority = true;
          sp.environment_confidence = stabilityEnvBand;
        }
        if (Object.keys(sp).length) {
          skillInput.search_preferences = sp;
        } else if (gossip) {
          skillInput.search_preferences = gossip.search_preferences;
        }
        const result = await skill.execute(skillInput);
        researchData.live_hotel_refresh = {
          skill: name,
          result,
          updated_at: new Date().toISOString(),
          ...(gossip ? { cognitive_gossip: gossip.audit_stub } : {}),
          ...(austerity ? { budget_arbitration_austerity: true as const } : {}),
          ...(stabilityFirst ? { stability_mode_active: true as const } : {}),
          ...(stabilityFirst && stabilityEnvBand !== undefined && stabilityRiskBuffer !== undefined
            ? {
                stability_env_modulation: {
                  environment_confidence: stabilityEnvBand,
                  risk_buffer: stabilityRiskBuffer,
                },
              }
            : {}),
        };
        const ev = (result as { evidence_id?: unknown })?.evidence_id;
        if (typeof ev === 'string' && ev.trim()) evidenceRefs.push(ev.trim());
        return;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.debug(`[HotelResearchMember] ${name} 跳过: ${msg}`);
      }
    }
  }

  /**
   * 4.0 Gossip：体验轴足够负时向酒店 Skill 注入 `search_preferences.relaxedSafety`，供底层放宽安全硬滤、偏景观/体验信号。
   * 同时附带 `environment_confidence`（来自 researchData / 可选 DSO），供 Skill 或 MCP 侧做软参考（不关闭 Gossip 本身阈值）。
   */
  private buildHotelSearchGossip(
    profile: UserCognitiveProfile | undefined,
    researchData: Record<string, unknown>,
    dso?: DecisionState,
  ): {
    search_preferences: { relaxedSafety: true; environment_confidence: HotelEnvironmentConfidence };
    audit_stub: { relaxed_safety: true; environment_confidence: HotelEnvironmentConfidence };
  } | null {
    if (!shouldApplyExperienceGossip(profile)) return null;
    const environment_confidence = resolveHotelEnvironmentConfidence({ researchData, dso });
    return {
      search_preferences: { relaxedSafety: true, environment_confidence },
      audit_stub: { relaxed_safety: true as const, environment_confidence },
    };
  }
}
