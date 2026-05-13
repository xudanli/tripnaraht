import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import { getSkillFailureStrategy } from '../../utils/skill-importance.util';
import { isIcelandTripForComplianceResearch } from './compliance-iceland-trip.util';
import type { ResearchMemberComplianceRunInput } from './research-member-compliance.types';
import { computeResearchPatchFromIsolation, deepCloneResearchData } from './research-context-manager';
import { ResearchTeamBusService } from './research-team-bus.service';
import { isResearchSequentialAssignmentPayload } from './research-team-bus.types';

/**
 * 合规域 Member：冰岛 SafeTravel RSS 等（与 Gatekeeper 侧写入键对齐，在拓扑最后串行执行）。
 */
@Injectable()
export class ComplianceResearchMember implements OnModuleInit, OnModuleDestroy {
  readonly memberId = 'ComplianceResearchMember' as const;

  private readonly logger = new Logger(ComplianceResearchMember.name);
  private busOff?: () => void;

  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly researchTeamBus?: ResearchTeamBusService,
  ) {}

  onModuleInit(): void {
    if (!this.researchTeamBus) return;
    this.busOff = this.researchTeamBus.subscribeGlobalAssignments(async (env) => {
      if (!isResearchSequentialAssignmentPayload(env.payload) || env.payload.memberKind !== 'compliance') return;
      const p = env.payload;
      try {
        const baselineRd = deepCloneResearchData(p.researchData);
        const baselineEr = [...p.evidenceRefs];
        await this.runComplianceResearch({
          requestId: env.requestId,
          tripPlanRequest: p.tripPlanRequest,
          researchData: p.researchData,
          evidenceRefs: p.evidenceRefs,
        });
        const patch = computeResearchPatchFromIsolation({
          baselineResearchData: baselineRd,
          isolatedResearchData: p.researchData,
          baselineEvidenceRefs: baselineEr,
          isolatedEvidenceRefs: p.evidenceRefs,
          scope: 'compliance',
        });
        this.researchTeamBus!.publishCompletion(env.requestId, env.slotId, { ok: true, patch });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[ComplianceResearchMember] bus assignment failed requestId=${env.requestId} slotId=${env.slotId} ${msg}`);
        this.researchTeamBus!.publishCompletion(env.requestId, env.slotId, { ok: false, error: msg });
      }
    });
  }

  onModuleDestroy(): void {
    this.busOff?.();
    this.busOff = undefined;
  }

  async runComplianceResearch(input: ResearchMemberComplianceRunInput): Promise<void> {
    const { requestId, tripPlanRequest, researchData, evidenceRefs } = input;
    if (!isIcelandTripForComplianceResearch(tripPlanRequest)) {
      this.logger.debug(`[ComplianceResearchMember] skip safetravel (non-Iceland) requestId=${requestId}`);
      return;
    }
    if (!this.skillsRegistry) {
      this.logger.debug(`[ComplianceResearchMember] no SkillsRegistry requestId=${requestId}`);
      return;
    }
    try {
      const skill = this.skillsRegistry.getSkill('safetravel.get_advisories');
      if (!skill) {
        this.logger.debug(`[ComplianceResearchMember] safetravel.get_advisories unavailable requestId=${requestId}`);
        return;
      }
      const st = await skill.execute({ max_items: 40 });
      researchData.safetravel_advisories = st;
      researchData.safetravel_gate_recommendation = (st as { gate_recommendation?: string }).gate_recommendation;
      const gid = (st as { alerts?: { id?: string }[] }).alerts?.[0]?.id;
      if (typeof gid === 'string' && gid.trim()) {
        evidenceRefs.push(`skill:safetravel.get_advisories:${gid}`);
      } else {
        evidenceRefs.push(`skill:safetravel.get_advisories:${requestId}`);
      }
    } catch (e: unknown) {
      const strategy = getSkillFailureStrategy(
        'safetravel.get_advisories',
        e instanceof Error ? e : new Error(String(e)),
      );
      this.logger.warn(
        `[ComplianceResearchMember] safetravel.get_advisories failed requestId=${requestId} strategy=${strategy.shouldDegrade ? 'degrade' : 'reject'} err=${e instanceof Error ? e.message : String(e)}`,
      );
      if (strategy.shouldDegrade && strategy.shouldMarkMissing) {
        researchData.safetravel_advisories = {
          missing: true,
          error: e instanceof Error ? e.message : String(e),
          degraded: true,
        };
      } else if (strategy.shouldReject) {
        throw new Error(strategy.errorMessage);
      }
    }
  }
}
