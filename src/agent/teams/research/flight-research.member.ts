import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import type { IResearchMember, ResearchMemberScopedCommerceInput } from './research-member.interface';
import { computeResearchPatchFromIsolation, deepCloneResearchData } from './research-context-manager';
import { ResearchTeamBusService } from './research-team-bus.service';
import { isResearchParallelAssignmentPayload } from './research-team-bus.types';
import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';
import { shouldApplyExperienceGossip } from './research-member-cognitive-gossip.util';
import { shouldEnableStabilityMode } from '../../memory/emotional-resonance/research-member-stability.util';

/**
 * 航班域 Member：`scoped_partial` + flight 时的 live commerce 轻量刷新。
 */
@Injectable()
export class FlightResearchMember implements IResearchMember, OnModuleInit, OnModuleDestroy {
  readonly memberId = 'FlightResearchMember' as const;
  readonly assetScopes = ['flight'] as const;

  private readonly logger = new Logger(FlightResearchMember.name);
  private busOff?: () => void;

  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly researchTeamBus?: ResearchTeamBusService,
  ) {}

  onModuleInit(): void {
    if (!this.researchTeamBus) return;
    this.busOff = this.researchTeamBus.subscribeGlobalAssignments(async (env) => {
      if (!isResearchParallelAssignmentPayload(env.payload) || env.payload.memberKind !== 'flight') return;
      const p = env.payload;
      try {
        const baselineRd = deepCloneResearchData(p.researchData);
        const baselineEr = [...p.evidenceRefs];
        await this.runScopedCommerce({
          requestId: env.requestId,
          tripPlanRequest: p.tripPlanRequest,
          researchData: p.researchData,
          evidenceRefs: p.evidenceRefs,
          userCognitiveProfile: p.userCognitiveProfile,
          ...(p.userEmotionalAccount ? { userEmotionalAccount: p.userEmotionalAccount } : {}),
        });
        const patch = computeResearchPatchFromIsolation({
          baselineResearchData: baselineRd,
          isolatedResearchData: p.researchData,
          baselineEvidenceRefs: baselineEr,
          isolatedEvidenceRefs: p.evidenceRefs,
          scope: 'flight',
        });
        this.researchTeamBus!.publishCompletion(env.requestId, env.slotId, { ok: true, patch });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[FlightResearchMember] bus assignment failed requestId=${env.requestId} slotId=${env.slotId} ${msg}`);
        this.researchTeamBus!.publishCompletion(env.requestId, env.slotId, { ok: false, error: msg });
      }
    });
  }

  onModuleDestroy(): void {
    this.busOff?.();
    this.busOff = undefined;
  }

  async runScopedCommerce(input: ResearchMemberScopedCommerceInput): Promise<void> {
    const { tripPlanRequest, researchData, evidenceRefs, userCognitiveProfile, userEmotionalAccount } = input;
    const stabilityFirst = shouldEnableStabilityMode(userEmotionalAccount);
    await this.runCommerceFlightRefresh(tripPlanRequest, researchData, evidenceRefs, userCognitiveProfile, {
      stabilityFirst,
    });
  }

  private buildFlightSearchGossip(profile: UserCognitiveProfile | undefined): {
    search_preferences: { luxuryLeaning: true; maxStops: number };
    audit_stub: { luxury_leaning: true; max_stops: number };
  } | null {
    if (!shouldApplyExperienceGossip(profile)) return null;
    return {
      search_preferences: { luxuryLeaning: true, maxStops: 1 },
      audit_stub: { luxury_leaning: true as const, max_stops: 1 as const },
    };
  }

  private async runCommerceFlightRefresh(
    tripRequest: ResearchMemberScopedCommerceInput['tripPlanRequest'],
    researchData: Record<string, unknown>,
    evidenceRefs: string[],
    userCognitiveProfile?: ResearchMemberScopedCommerceInput['userCognitiveProfile'],
    opts?: Readonly<{ stabilityFirst?: boolean }>,
  ): Promise<void> {
    if (!this.skillsRegistry) return;
    const dest = tripRequest.destination;
    const origin = tripRequest.origin;
    const queryParts = [
      typeof origin === 'string' ? origin : '',
      typeof dest === 'string' ? dest : '',
      tripRequest.date_range?.start_date ?? tripRequest.start_date ?? '',
    ].filter(Boolean);
    const query = queryParts.length ? `${queryParts.join(' ')} 航班` : '航班查询';
    const stabilityFirst = !!opts?.stabilityFirst;
    const gossip = stabilityFirst ? null : this.buildFlightSearchGossip(userCognitiveProfile);
    const candidates = stabilityFirst
      ? (['flight.search'] as const)
      : (['flight.search', 'flight.offers', 'amadeus.flight_offers'] as const);
    const limit = stabilityFirst ? 4 : 6;
    for (const name of candidates) {
      const skill = this.skillsRegistry.getSkill(name);
      if (!skill) continue;
      try {
        const skillInput: Record<string, unknown> = { query, limit };
        if (stabilityFirst) {
          skillInput.search_preferences = {
            stabilityMode: 'STABILITY_FIRST',
            directFlightPriority: true,
            excludeLcc: true,
          };
        } else if (gossip) {
          skillInput.search_preferences = gossip.search_preferences;
        }
        const result = await skill.execute(skillInput);
        researchData.live_flight_refresh = {
          skill: name,
          result,
          updated_at: new Date().toISOString(),
          ...(gossip ? { cognitive_gossip: gossip.audit_stub } : {}),
          ...(stabilityFirst ? { stability_mode_active: true as const } : {}),
        };
        const ev = (result as { evidence_id?: unknown })?.evidence_id;
        if (typeof ev === 'string' && ev.trim()) evidenceRefs.push(ev.trim());
        return;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.debug(`[FlightResearchMember] ${name} 跳过: ${msg}`);
      }
    }
  }
}
