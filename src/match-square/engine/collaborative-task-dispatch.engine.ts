import { randomUUID } from 'crypto';
import type { CaptainPersonaSnapshot } from '../types/match-square.types';
import { resolveActiveTaskTemplates } from '../config/scene-task-templates.config';
import {
  resolveTaskDispatchRule,
  type TaskAssigneePreference,
} from '../config/task-role-dispatch-matrix.config';
import {
  COLLABORATIVE_TASK_FLYWHEEL_VERSION,
  type CollaborativeTaskDispatchPlan,
  type CollaborativeTaskPreviewView,
  type CollaborativeTaskView,
  type SceneRoleAnchorId,
} from '../types/recruitment-task-flywheel.types';
import { buildUserFeatureVector } from './user-feature-vector.engine';

export interface CrewMemberForDispatch {
  userId: string;
  role: 'captain' | 'member';
  displayLabel: string;
  snapshot: CaptainPersonaSnapshot | null;
  /** 成员在 approved 列表中的顺序（0-based，不含队长） */
  memberSlotIndex?: number;
  sceneRoleAnchor?: SceneRoleAnchorId | null;
}

export interface BuildCollaborativeTaskDispatchInput {
  recruitmentPostId: string;
  canDispatch: boolean;
  blockReason?: string | null;
  vibeChipIds: string[];
  milestoneIds: string[];
  recruitmentScriptId: string | null;
  crew: CrewMemberForDispatch[];
  extraMitigatingTemplateIds?: string[];
}

function isIstpExecutor(snapshot: CaptainPersonaSnapshot | null): boolean {
  if (!snapshot) return false;
  const t = snapshot.mbtiType?.toUpperCase() ?? '';
  return t.startsWith('ISTP') || t.startsWith('ESTP');
}

function controlScore(snapshot: CaptainPersonaSnapshot | null): number {
  if (!snapshot) return 1;
  return buildUserFeatureVector({
    mbtiType: snapshot.mbtiType,
    rawScores: snapshot.rawScores,
    dimensionPercents: snapshot.dimensionPercents,
  }).cControl;
}

function resolveAssignee(
  preference: TaskAssigneePreference,
  crew: CrewMemberForDispatch[],
  noiseAnchoredUserId?: string | null,
): CrewMemberForDispatch | null {
  const captain = crew.find((c) => c.role === 'captain');
  const members = crew.filter((c) => c.role === 'member');

  switch (preference) {
    case 'captain':
      return captain ?? members[0] ?? null;
    case 'highest_control': {
      const sorted = [...crew].sort((a, b) => controlScore(b.snapshot) - controlScore(a.snapshot));
      return sorted[0] ?? null;
    }
    case 'istp_executor': {
      const istp = members.find((m) => isIstpExecutor(m.snapshot));
      return istp ?? members[0] ?? null;
    }
    case 'co_planning_deputy': {
      const deputy = members.find(
        (m) => (m.snapshot?.rawScores.control_desire ?? 0) >= 1 && m.snapshot?.mbtiType?.includes('J'),
      );
      return deputy ?? members[0] ?? null;
    }
    case 'noise_anchored_member': {
      if (noiseAnchoredUserId) {
        return members.find((m) => m.userId === noiseAnchoredUserId) ?? members[0] ?? null;
      }
      return members.find((m) => m.sceneRoleAnchor === 'blind_box_follower') ?? members[0] ?? null;
    }
    case 'member_slot_index_1':
      return members.find((m) => m.memberSlotIndex === 1) ?? members[0] ?? null;
    default:
      return members[0] ?? captain ?? null;
  }
}

function pickAssignee(
  templateId: string,
  crew: CrewMemberForDispatch[],
  noiseAnchoredUserId?: string | null,
): CrewMemberForDispatch | null {
  const rule = resolveTaskDispatchRule(templateId);
  if (!rule) return crew.find((c) => c.role === 'captain') ?? crew[0] ?? null;

  return (
    resolveAssignee(rule.prefer, crew, noiseAnchoredUserId) ??
    resolveAssignee(rule.fallback, crew, noiseAnchoredUserId)
  );
}

/**
 * PRD 3.13 — 成团后协同任务派发（纯函数）
 */
export function buildCollaborativeTaskDispatchPlan(
  input: BuildCollaborativeTaskDispatchInput,
): CollaborativeTaskDispatchPlan {
  const templateMap = new Map<string, ReturnType<typeof resolveActiveTaskTemplates>[number]>();

  for (const tpl of resolveActiveTaskTemplates({
    vibeChipIds: input.vibeChipIds,
    milestoneIds: input.milestoneIds,
    recruitmentScriptId: input.recruitmentScriptId,
  })) {
    templateMap.set(tpl.templateId, tpl);
  }

  for (const id of input.extraMitigatingTemplateIds ?? []) {
    const found = resolveActiveTaskTemplates({
      vibeChipIds: [],
      milestoneIds: [],
      recruitmentScriptId: null,
      mitigatingOnly: true,
    }).find((t) => t.templateId === id);
    if (found) templateMap.set(found.templateId, found);
    else if (id === 'pre_trip_safety_blueprint') {
      templateMap.set(id, {
        templateId: 'pre_trip_safety_blueprint',
        title: '行前安全蓝图交付任务',
        description:
          '为对冲行中断网/盲导焦虑，在出发前交付个人安全蓝图（联络窗口、撤退点、装备自检签名）。',
        priority: 'high',
        mitigatesNoise: true,
        behaviorCaptureEnabled: true,
      });
    }
  }

  const noiseAnchored = input.crew.find((c) => c.sceneRoleAnchor === 'blind_box_follower');

  const tasks: CollaborativeTaskView[] = [...templateMap.values()]
    .slice(0, 6)
    .map((tpl) => {
      const assignee = pickAssignee(tpl.templateId, input.crew, noiseAnchored?.userId);
      return {
        taskId: randomUUID(),
        templateId: tpl.templateId,
        title: tpl.title,
        description: tpl.description,
        assigneeUserId: assignee?.userId ?? input.crew[0]?.userId ?? '',
        assigneeRoleLabel: assignee?.displayLabel ?? '队员',
        priority: tpl.priority,
        status: 'pending' as const,
        triggeredBy: {
          vibeChipIds: tpl.vibeChipIds ? [...tpl.vibeChipIds] : [],
          milestoneIds: tpl.milestoneIds ? [...tpl.milestoneIds] : [],
        },
        behaviorCaptureEnabled: tpl.behaviorCaptureEnabled ?? true,
      };
    })
    .filter((t) => t.assigneeUserId);

  return {
    version: COLLABORATIVE_TASK_FLYWHEEL_VERSION,
    recruitmentPostId: input.recruitmentPostId,
    tasks,
    dispatchedAt: input.canDispatch ? new Date().toISOString() : null,
  };
}

export function buildCollaborativeTaskPreview(
  input: BuildCollaborativeTaskDispatchInput,
): CollaborativeTaskPreviewView {
  const plan = buildCollaborativeTaskDispatchPlan(input);
  return {
    canDispatch: input.canDispatch && plan.tasks.length > 0,
    blockReason: input.blockReason ?? (plan.tasks.length === 0 ? '无匹配场景任务模板' : null),
    plan,
  };
}
