import type { MatchSquareRecruitmentApplication, MatchSquareRecruitmentPost } from '@prisma/client';
import { readTrekkingOrchestrationFromSnapshot } from '../engine/trekking-vibe-orchestration.engine';
import { readVibePayloadFromSnapshot } from '../engine/vibe-llm-parse.engine';
import { buildPreMatchDecisionBrief } from '../engine/pre-match-decision.engine';
import {
  buildCollaborativeTaskPreview,
  type CrewMemberForDispatch,
} from '../engine/collaborative-task-dispatch.engine';
import type { CaptainPersonaSnapshot, RecruitmentPlanningStyle } from '../types/match-square.types';
import type { TripInstantiationPlan } from '../types/trip-instantiation.types';
import type {
  CollaborativeTaskPreviewView,
  PreMatchDecisionBriefView,
} from '../types/recruitment-task-flywheel.types';
import type { PhysicalFitnessFitReportView } from '../types/physical-fitness-gate.types';

function parseCaptainSnapshot(raw: unknown): CaptainPersonaSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as CaptainPersonaSnapshot;
}

export function extractVibeChipIds(snapshot: unknown): string[] {
  const payload = readVibePayloadFromSnapshot(snapshot);
  return payload?.vibe_chips?.map((c) => c.id) ?? [];
}

export function extractRecruitmentScriptId(snapshot: unknown): string | null {
  const payload = readVibePayloadFromSnapshot(snapshot);
  return payload?.recruitment_script_id ?? null;
}

export function extractMilestoneIds(snapshot: unknown): string[] {
  const orch = readTrekkingOrchestrationFromSnapshot(snapshot);
  return orch?.eventStreamMilestones.map((m) => m.eventId) ?? [];
}

export function buildApplicationDecisionBrief(input: {
  post: Pick<MatchSquareRecruitmentPost, 'captainPersonaSnapshot' | 'planningStyle'>;
  applicantSnapshot: CaptainPersonaSnapshot | null;
  hardMetricsPass: boolean;
  physicalFitnessReport?: PhysicalFitnessFitReportView | null;
}): PreMatchDecisionBriefView | null {
  const captain = parseCaptainSnapshot(input.post.captainPersonaSnapshot);
  if (!captain || !input.applicantSnapshot) return null;

  const snapshot = input.post.captainPersonaSnapshot;
  const vibeChipIds = extractVibeChipIds(snapshot);
  const trekkingOrchestration = readTrekkingOrchestrationFromSnapshot(snapshot);

  return buildPreMatchDecisionBrief({
    captain,
    applicant: input.applicantSnapshot,
    teamworkStyle: input.post.planningStyle as RecruitmentPlanningStyle | null,
    hardMetricsPass: input.hardMetricsPass,
    vibeChipIds,
    trekkingOrchestration,
    recruitmentScriptId: extractRecruitmentScriptId(snapshot),
    physicalFitnessReport: input.physicalFitnessReport ?? null,
  });
}

export function buildCollaborativeTaskPreviewForPost(input: {
  post: MatchSquareRecruitmentPost;
  plan: TripInstantiationPlan;
  approvedApplications: Pick<
    MatchSquareRecruitmentApplication,
    'id' | 'applicantUserId' | 'applicantDisplayName' | 'applicantCardTitle' | 'applicantPersonaSnapshot'
  >[];
}): CollaborativeTaskPreviewView {
  const snapshot = input.post.captainPersonaSnapshot;
  const vibeChipIds = input.plan.vibeChipIds.length
    ? input.plan.vibeChipIds
    : extractVibeChipIds(snapshot);
  const milestoneIds = extractMilestoneIds(snapshot);
  const scriptId = input.plan.recruitmentScriptId ?? extractRecruitmentScriptId(snapshot);

  const mitigatingIds = new Set<string>();
  const crew: CrewMemberForDispatch[] = [
    {
      userId: input.post.captainUserId,
      role: 'captain',
      displayLabel: '队长',
      snapshot: parseCaptainSnapshot(snapshot),
    },
  ];

  input.approvedApplications.forEach((app, index) => {
    const applicantSnapshot = parseCaptainSnapshot(app.applicantPersonaSnapshot);
    const brief = buildApplicationDecisionBrief({
      post: input.post,
      applicantSnapshot,
      hardMetricsPass: true,
    });
    for (const id of brief?.mitigatingTaskTemplateIds ?? []) {
      mitigatingIds.add(id);
    }

    crew.push({
      userId: app.applicantUserId,
      role: 'member',
      displayLabel: app.applicantDisplayName ?? app.applicantCardTitle ?? '队员',
      snapshot: applicantSnapshot,
      memberSlotIndex: index + 1,
      sceneRoleAnchor: brief?.suggestedSceneRoleAnchor ?? null,
    });
  });

  return buildCollaborativeTaskPreview({
    recruitmentPostId: input.post.id,
    canDispatch: input.plan.canInstantiate,
    blockReason: input.plan.blockReason,
    vibeChipIds,
    milestoneIds,
    recruitmentScriptId: scriptId,
    crew,
    extraMitigatingTemplateIds: [...mitigatingIds],
  });
}
