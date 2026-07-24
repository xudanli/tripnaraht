import { BadRequestException } from '@nestjs/common';
import {
  GUIDE_PARSE_JOB_STATUS,
  GUIDE_TO_PLAN_SESSION_STATUS,
  type GuideToPlanSessionStatus,
} from '../constants/guide-to-plan-status.constants';
import type { ConfirmGuideTravelContextDto } from '../dto/guide-to-plan.dto';
import type { GuideToPlanSessionView, GuideTravelContext } from '../types/guide-to-plan.types';
import { normalizeGuideTransportMode } from '../../common/constants/travel-mode-scope.constants';
import { buildPendingConfirmations } from './guide-pending-confirmations.util';

const MUTABLE_STATUSES = new Set<GuideToPlanSessionStatus>([
  GUIDE_TO_PLAN_SESSION_STATUS.COLLECTING,
  GUIDE_TO_PLAN_SESSION_STATUS.PARSING,
  GUIDE_TO_PLAN_SESSION_STATUS.UNDERSTANDING,
  GUIDE_TO_PLAN_SESSION_STATUS.AWAITING_CONTEXT,
  GUIDE_TO_PLAN_SESSION_STATUS.GENERATING,
  GUIDE_TO_PLAN_SESSION_STATUS.DRAFT_READY,
]);

export function mergeTravelContext(
  existing: GuideTravelContext | null | undefined,
  patch: ConfirmGuideTravelContextDto,
): GuideTravelContext {
  const merged: GuideTravelContext = { ...(existing ?? {}) };

  if (patch.startDate !== undefined) merged.startDate = patch.startDate;
  if (patch.endDate !== undefined) merged.endDate = patch.endDate;
  if (patch.travelers !== undefined) merged.travelers = patch.travelers;
  if (patch.transportMode !== undefined) {
    merged.transportMode = normalizeGuideTransportMode(patch.transportMode);
  }
  merged.transportMode = normalizeGuideTransportMode(merged.transportMode);
  if (patch.vehicleType !== undefined) {
    merged.vehicleType = patch.vehicleType as GuideTravelContext['vehicleType'];
  }
  if (patch.preserveExperiences !== undefined) {
    merged.preserveExperiences = patch.preserveExperiences;
  }
  if (patch.countryCode !== undefined) merged.countryCode = patch.countryCode;
  if (patch.destination !== undefined) merged.destination = patch.destination;

  return merged;
}

export function assertMutableSession(status: string, action = '操作'): void {
  if (status === GUIDE_TO_PLAN_SESSION_STATUS.ABANDONED) {
    throw new BadRequestException(`会话已放弃，无法${action}`);
  }
  if (status === GUIDE_TO_PLAN_SESSION_STATUS.ACCEPTED) {
    throw new BadRequestException(`会话已接受并生成行程，无法${action}`);
  }
  if (!MUTABLE_STATUSES.has(status as GuideToPlanSessionStatus)) {
    throw new BadRequestException(`当前会话状态 (${status}) 不允许${action}`);
  }
}

/** 导入/删除攻略：解析或生成进行中时不允许 */
export function assertCanImportSession(status: string, action = '导入攻略'): void {
  assertMutableSession(status, action);
  if (status === GUIDE_TO_PLAN_SESSION_STATUS.PARSING) {
    throw new BadRequestException('解析进行中，请稍后再导入');
  }
  if (status === GUIDE_TO_PLAN_SESSION_STATUS.GENERATING) {
    throw new BadRequestException('草案生成中，请稍后再导入');
  }
}

/** 触发解析：草案生成进行中时不允许 */
export function assertCanParseSession(status: string, action = '解析攻略'): void {
  assertMutableSession(status, action);
  if (status === GUIDE_TO_PLAN_SESSION_STATUS.GENERATING) {
    throw new BadRequestException('草案生成中，请稍后再解析');
  }
}

/** 接受/逐项确认草案：仅 draft_ready */
export function assertDraftReadySession(status: string, action = '接受草案'): void {
  assertMutableSession(status, action);
  if (status !== GUIDE_TO_PLAN_SESSION_STATUS.DRAFT_READY) {
    throw new BadRequestException(`当前会话状态 (${status}) 无法${action}，请先生成草案`);
  }
}

const GENERATE_ALLOWED_STATUSES = new Set<GuideToPlanSessionStatus>([
  GUIDE_TO_PLAN_SESSION_STATUS.UNDERSTANDING,
  GUIDE_TO_PLAN_SESSION_STATUS.AWAITING_CONTEXT,
  GUIDE_TO_PLAN_SESSION_STATUS.DRAFT_READY,
]);

/** 生成草案：需已完成解析，且不在解析/生成中 */
export function assertCanGenerateSession(status: string, action = '生成草案'): void {
  assertMutableSession(status, action);
  if (status === GUIDE_TO_PLAN_SESSION_STATUS.PARSING) {
    throw new BadRequestException('解析进行中，请稍后再生成草案');
  }
  if (status === GUIDE_TO_PLAN_SESSION_STATUS.GENERATING) {
    throw new BadRequestException('草案生成中，请稍候');
  }
  if (!GENERATE_ALLOWED_STATUSES.has(status as GuideToPlanSessionStatus)) {
    throw new BadRequestException(`当前会话状态 (${status}) 无法${action}，请先完成攻略解析`);
  }
}

export function computeRequiresTravelContext(
  travelContext: GuideTravelContext | null | undefined,
  session: { countryCode?: string | null; destination?: string | null },
): boolean {
  return buildPendingConfirmations(travelContext, session).some((item) => item.required);
}

export function inferResumeRoute(input: {
  status: string;
  parseJobStatus?: string;
  requiresTravelContext: boolean;
  hasGuides: boolean;
  draftCandidateCount: number;
  tripId?: string | null;
}): GuideToPlanSessionView['resumeRoute'] {
  if (input.tripId || input.status === GUIDE_TO_PLAN_SESSION_STATUS.ACCEPTED) {
    return 'trip';
  }
  if (input.status === GUIDE_TO_PLAN_SESSION_STATUS.PARSING) {
    return 'parse_progress';
  }
  if (
    input.parseJobStatus === GUIDE_PARSE_JOB_STATUS.RUNNING ||
    input.parseJobStatus === GUIDE_PARSE_JOB_STATUS.QUEUED
  ) {
    return 'parse_progress';
  }
  if (input.status === GUIDE_TO_PLAN_SESSION_STATUS.DRAFT_READY || input.draftCandidateCount > 0) {
    return 'draft';
  }
  if (input.requiresTravelContext && input.status === GUIDE_TO_PLAN_SESSION_STATUS.AWAITING_CONTEXT) {
    return 'travel_context';
  }
  if (
    input.status === GUIDE_TO_PLAN_SESSION_STATUS.AWAITING_CONTEXT ||
    input.status === GUIDE_TO_PLAN_SESSION_STATUS.UNDERSTANDING
  ) {
    return 'understanding';
  }
  if (!input.hasGuides) {
    return 'import';
  }
  if (input.parseJobStatus === GUIDE_PARSE_JOB_STATUS.FAILED) {
    return 'import';
  }
  return 'import';
}
