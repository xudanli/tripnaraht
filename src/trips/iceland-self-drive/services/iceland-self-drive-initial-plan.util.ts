import type { PrismaService } from '../../../prisma/prisma.service';
import type {
  IcelandSelfDriveInitialPlanState,
  IcelandSelfDriveInitialPlanStatus,
  IcelandSelfDriveInitialPlanVerificationStatus,
  IcelandSelfDriveInitialScheduleState,
  IcelandSelfDriveWarning,
} from '../types/iceland-self-drive.types';

export interface InitialPlanDayMetrics {
  scheduledDayCount: number;
  scheduledActivityCount: number;
  scheduledAnchorCount: number;
  emptyDayCount: number;
  totalItemCount: number;
}

export async function countInitialPlanMetrics(
  prisma: PrismaService,
  tripId: string,
): Promise<InitialPlanDayMetrics> {
  const days = await prisma.tripDay.findMany({
    where: { tripId },
    select: {
      id: true,
      ItineraryItem: {
        select: { type: true, bookingStatus: true },
      },
    },
    orderBy: { date: 'asc' },
  });

  let scheduledActivityCount = 0;
  let scheduledAnchorCount = 0;
  let emptyDayCount = 0;

  for (const day of days) {
    const items = day.ItineraryItem ?? [];
    if (items.length === 0) {
      emptyDayCount += 1;
      continue;
    }
    for (const item of items) {
      if (item.bookingStatus === 'CONFIRMED') {
        scheduledAnchorCount += 1;
      } else if (item.type === 'ACTIVITY') {
        scheduledActivityCount += 1;
      }
    }
  }

  return {
    scheduledDayCount: days.length,
    scheduledActivityCount,
    scheduledAnchorCount,
    emptyDayCount,
    totalItemCount: scheduledActivityCount + scheduledAnchorCount,
  };
}

export function classifyInitialPlanStatus(input: {
  metrics: InitialPlanDayMetrics;
  verificationStatus: IcelandSelfDriveInitialPlanVerificationStatus;
  applied: boolean;
}): IcelandSelfDriveInitialPlanStatus {
  const { metrics, verificationStatus, applied } = input;
  const hasAnything =
    metrics.scheduledActivityCount > 0 || metrics.scheduledAnchorCount > 0;

  if (applied && metrics.scheduledActivityCount >= 1) {
    if (verificationStatus === 'BLOCK') return 'PARTIAL';
    return 'READY';
  }
  if (hasAnything && metrics.scheduledActivityCount === 0) return 'PARTIAL';
  if (verificationStatus === 'BLOCK' && hasAnything) return 'PARTIAL';
  return 'FAILED';
}

export function buildInitialPlanState(input: {
  status: IcelandSelfDriveInitialPlanStatus;
  verificationStatus: IcelandSelfDriveInitialPlanVerificationStatus;
  metrics: InitialPlanDayMetrics;
  lastProposalId: string | null;
  generatedAt: string | null;
  warnings?: IcelandSelfDriveWarning[];
  arrangeAuthority?: IcelandSelfDriveInitialPlanState['arrangeAuthority'];
  regionCoverage?: IcelandSelfDriveInitialPlanState['regionCoverage'];
}): IcelandSelfDriveInitialPlanState {
  return {
    status: input.status,
    verificationStatus: input.verificationStatus,
    scheduledDayCount: input.metrics.scheduledDayCount,
    scheduledActivityCount: input.metrics.scheduledActivityCount,
    scheduledAnchorCount: input.metrics.scheduledAnchorCount,
    emptyDayCount: input.metrics.emptyDayCount,
    lastProposalId: input.lastProposalId,
    fallbackAllowed: input.status === 'FAILED',
    applyReason: 'INITIAL_PLAN_CREATION',
    authorizationSource: 'CREATE_WIZARD_SUBMISSION',
    generatedAt: input.generatedAt,
    warnings: input.warnings ?? [],
    ...(input.arrangeAuthority ? { arrangeAuthority: input.arrangeAuthority } : {}),
    ...(input.regionCoverage ? { regionCoverage: input.regionCoverage } : {}),
  };
}

export function generatingInitialPlanState(
  metrics?: Partial<InitialPlanDayMetrics>,
): IcelandSelfDriveInitialPlanState {
  return buildInitialPlanState({
    status: 'GENERATING',
    verificationStatus: 'NOT_RUN',
    metrics: {
      scheduledDayCount: metrics?.scheduledDayCount ?? 0,
      scheduledActivityCount: metrics?.scheduledActivityCount ?? 0,
      scheduledAnchorCount: metrics?.scheduledAnchorCount ?? 0,
      emptyDayCount: metrics?.emptyDayCount ?? 0,
      totalItemCount: metrics?.totalItemCount ?? 0,
    },
    lastProposalId: null,
    generatedAt: null,
  });
}

export function toCompatInitialSchedule(
  plan: IcelandSelfDriveInitialPlanState,
): IcelandSelfDriveInitialScheduleState {
  return {
    ready: plan.status === 'READY',
    scheduledItemCount: plan.scheduledActivityCount + plan.scheduledAnchorCount,
    appliedAt: plan.generatedAt,
    lastProposalId: plan.lastProposalId,
  };
}
