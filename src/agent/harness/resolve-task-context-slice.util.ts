/**
 * 按 TaskContract.contextPolicy / registry key 解析最小 Context Slice。
 */

import type { PrismaService } from '../../prisma/prisma.service';
import type { AgentTaskContractV1 } from './agent-task-contract.types';
import {
  buildTripLodgingCoverageAnswerZh,
  formatTripLodgingCoveragePromptLines,
  isLodgingGapDirectAnswerQuery,
  loadTripLodgingCoverageFactSlice,
  type TripLodgingCoverageFactSlice,
} from './trip-lodging-coverage-fact.util';
import {
  buildNextActivityAnswerZh,
  buildPendingAnswerZh,
  buildReadinessAnswerZh,
  buildTodayPlanAnswerZh,
  formatNextActivityPromptLines,
  formatPendingPromptLines,
  formatReadinessPromptLines,
  formatRiskPromptLines,
  formatTodayTimelinePromptLines,
  isNextActivityDirectAnswerQuery,
  isPendingDirectAnswerQuery,
  isReadinessDirectAnswerQuery,
  isTodayPlanDirectAnswerQuery,
  loadTripDayTimelineFactSlice,
  type TripDayTimelineFactSlice,
} from './trip-day-timeline-fact.util';

export type ResolvedTaskContextSlice = {
  registryKey?: string;
  promptLines: string[];
  /** 可绕过 LLM 的确定性答复 */
  directAnswerZh?: string;
  lodgingCoverage?: TripLodgingCoverageFactSlice;
  dayTimeline?: TripDayTimelineFactSlice;
  /** 为 true 时跳过全量 trip prompt summary */
  skipFullTripSummary: boolean;
};

export async function resolveTaskContextSlice(input: {
  prisma: PrismaService;
  tripId: string;
  contract: AgentTaskContractV1;
  message: string;
  asOfYmd?: string;
}): Promise<ResolvedTaskContextSlice | null> {
  const key = input.contract.scope.contextRegistryKey;
  if (!key || input.contract.taskType !== 'TRIP_QUERY') {
    return null;
  }

  if (key === 'TRIP_QUERY_LODGING') {
    const slice = await loadTripLodgingCoverageFactSlice(input.prisma, input.tripId);
    if (!slice) {
      return {
        registryKey: key,
        promptLines: [
          '【TaskContext·TRIP_QUERY_LODGING】未查到行程日程，无法扫描住宿缺口。',
        ],
        skipFullTripSummary: true,
      };
    }
    const promptLines = formatTripLodgingCoveragePromptLines(slice);
    const directAnswerZh = isLodgingGapDirectAnswerQuery(input.message)
      ? buildTripLodgingCoverageAnswerZh(slice)
      : undefined;
    return {
      registryKey: key,
      promptLines,
      directAnswerZh,
      lodgingCoverage: slice,
      skipFullTripSummary: true,
    };
  }

  if (
    key === 'TRIP_QUERY_TODAY' ||
    key === 'TRIP_QUERY_NEXT' ||
    key === 'TRIP_QUERY_PENDING' ||
    key === 'TRIP_QUERY_RISK' ||
    key === 'TRIP_QUERY_READINESS'
  ) {
    const timeline = await loadTripDayTimelineFactSlice(
      input.prisma,
      input.tripId,
      input.asOfYmd,
    );
    if (!timeline) {
      return {
        registryKey: key,
        promptLines: [`【TaskContext·${key}】未查到行程日程。`],
        skipFullTripSummary: true,
      };
    }

    if (key === 'TRIP_QUERY_TODAY') {
      return {
        registryKey: key,
        promptLines: formatTodayTimelinePromptLines(timeline),
        directAnswerZh: isTodayPlanDirectAnswerQuery(input.message)
          ? buildTodayPlanAnswerZh(timeline)
          : undefined,
        dayTimeline: timeline,
        skipFullTripSummary: true,
      };
    }
    if (key === 'TRIP_QUERY_NEXT') {
      return {
        registryKey: key,
        promptLines: formatNextActivityPromptLines(timeline),
        directAnswerZh: isNextActivityDirectAnswerQuery(input.message)
          ? buildNextActivityAnswerZh(timeline)
          : undefined,
        dayTimeline: timeline,
        skipFullTripSummary: true,
      };
    }
    if (key === 'TRIP_QUERY_PENDING') {
      return {
        registryKey: key,
        promptLines: formatPendingPromptLines(timeline),
        directAnswerZh: isPendingDirectAnswerQuery(input.message)
          ? buildPendingAnswerZh(timeline)
          : undefined,
        dayTimeline: timeline,
        skipFullTripSummary: true,
      };
    }
    if (key === 'TRIP_QUERY_RISK') {
      return {
        registryKey: key,
        promptLines: formatRiskPromptLines(timeline),
        dayTimeline: timeline,
        skipFullTripSummary: true,
      };
    }
    // READINESS
    const lodging = await loadTripLodgingCoverageFactSlice(input.prisma, input.tripId);
    const missing = lodging?.missingDayNumbers ?? [];
    return {
      registryKey: key,
      promptLines: formatReadinessPromptLines(timeline, missing),
      directAnswerZh: isReadinessDirectAnswerQuery(input.message)
        ? buildReadinessAnswerZh(timeline, missing)
        : undefined,
      dayTimeline: timeline,
      lodgingCoverage: lodging ?? undefined,
      skipFullTripSummary: true,
    };
  }

  return null;
}
