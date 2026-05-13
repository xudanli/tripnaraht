import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import { getSkillFailureStrategy } from '../../utils/skill-importance.util';
import {
  TRANSPORT_SEARCH_DEGRADED_USER_GUIDANCE_ZH,
  TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY,
} from '../../execution/shared/transport-evidence-messages';
import { normalizeTransportEndpointsForSkill } from '../../execution/shared/transport-endpoint-hydration.util';
import type { ResearchMemberTransportRunInput } from './research-member-transport.types';
import { computeResearchPatchFromIsolation, deepCloneResearchData } from './research-context-manager';
import { ResearchTeamBusService } from './research-team-bus.service';
import { isResearchSequentialAssignmentPayload } from './research-team-bus.types';
import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';
import { shouldApplyExperienceGossip } from './research-member-cognitive-gossip.util';

/**
 * 交通域 Member：承接 `transport.search` 与端点归一（Monolith 迁出）。
 */
@Injectable()
export class TransportResearchMember implements OnModuleInit, OnModuleDestroy {
  readonly memberId = 'TransportResearchMember' as const;

  private readonly logger = new Logger(TransportResearchMember.name);
  private busOff?: () => void;

  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly researchTeamBus?: ResearchTeamBusService,
  ) {}

  onModuleInit(): void {
    if (!this.researchTeamBus) return;
    this.busOff = this.researchTeamBus.subscribeGlobalAssignments(async (env) => {
      if (!isResearchSequentialAssignmentPayload(env.payload) || env.payload.memberKind !== 'transport') return;
      const p = env.payload;
      try {
        const baselineRd = deepCloneResearchData(p.researchData);
        const baselineEr = [...p.evidenceRefs];
        await this.runTransportSearch({
          requestId: env.requestId,
          tripPlanRequest: p.tripPlanRequest,
          researchData: p.researchData,
          evidenceRefs: p.evidenceRefs,
          userCognitiveProfile: p.userCognitiveProfile,
        });
        const patch = computeResearchPatchFromIsolation({
          baselineResearchData: baselineRd,
          isolatedResearchData: p.researchData,
          baselineEvidenceRefs: baselineEr,
          isolatedEvidenceRefs: p.evidenceRefs,
          scope: 'transport',
        });
        this.researchTeamBus!.publishCompletion(env.requestId, env.slotId, { ok: true, patch });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[TransportResearchMember] bus assignment failed requestId=${env.requestId} slotId=${env.slotId} ${msg}`);
        this.researchTeamBus!.publishCompletion(env.requestId, env.slotId, { ok: false, error: msg });
      }
    });
  }

  onModuleDestroy(): void {
    this.busOff?.();
    this.busOff = undefined;
  }

  async runTransportSearch(input: ResearchMemberTransportRunInput): Promise<void> {
    const { tripPlanRequest, researchData, evidenceRefs, userCognitiveProfile } = input;
    const normalized = normalizeTransportEndpointsForSkill(tripPlanRequest);
    if (!this.skillsRegistry || !normalized) return;
    try {
      const skill = this.skillsRegistry.getSkill('transport.search');
      if (!skill) return;
      const gossip = this.buildTransportSearchGossip(userCognitiveProfile);
      const execPayload: Record<string, unknown> = {
        origin: normalized.origin,
        destination: normalized.destination,
        mode: tripPlanRequest?.mode || 'mixed',
      };
      if (gossip) {
        execPayload.search_preferences = gossip.search_preferences;
      }
      const result = await skill.execute(execPayload);
      researchData.transport_evidence = result;
      if (gossip) {
        researchData.transport_cognitive_gossip = gossip.audit_stub;
      }
      if (result?.evidence_id) evidenceRefs.push(result.evidence_id);
    } catch (e: unknown) {
      const strategy = getSkillFailureStrategy(
        'transport.search',
        e instanceof Error ? e : new Error(String(e)),
      );
      if (strategy.shouldDegrade && strategy.shouldMarkMissing) {
        delete researchData.transport_cognitive_gossip;
        researchData.transport_evidence = {
          missing: true,
          error: e instanceof Error ? e.message : String(e),
          degraded: true,
          user_guidance: TRANSPORT_SEARCH_DEGRADED_USER_GUIDANCE_ZH,
          suggested_action: TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY,
        };
      } else if (strategy.shouldReject) throw new Error(strategy.errorMessage);
      else if (strategy.shouldMarkMissing) {
        delete researchData.transport_cognitive_gossip;
        researchData.transport_evidence = {
          missing: true,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
  }

  private buildTransportSearchGossip(profile: UserCognitiveProfile | undefined): {
    search_preferences: { privateTransferLeaning: true };
    audit_stub: { private_transfer_leaning: true };
  } | null {
    if (!shouldApplyExperienceGossip(profile)) return null;
    return {
      search_preferences: { privateTransferLeaning: true },
      audit_stub: { private_transfer_leaning: true as const },
    };
  }
}
