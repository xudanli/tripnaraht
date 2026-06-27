import type { BudgetGateStatus } from '../../budget-os/types/trip-budget-os.types';
import type {
  BudgetConstraintStatus,
  ConstraintFieldStatus,
  ConstraintsSummaryResponse,
} from '../types/constraints-summary.types';

export function resolveTravelerCount(input: {
  pacingConfig?: unknown;
  metadata?: unknown;
  budgetConfig?: unknown;
}): number {
  const fromArray = (raw: unknown): number | null => {
    if (!raw || typeof raw !== 'object') return null;
    const travelers = (raw as { travelers?: unknown[] }).travelers;
    if (!Array.isArray(travelers) || travelers.length === 0) return null;
    return travelers.length;
  };

  return (
    fromArray(input.pacingConfig) ??
    fromArray(input.metadata) ??
    fromArray(input.budgetConfig) ??
    0
  );
}

/** pacingConfig.travelMode 缺失时，从 legacy transport 推断（与 FE 一致） */
export function resolveEffectiveTravelMode(pacingConfig: unknown): string | null {
  if (!pacingConfig || typeof pacingConfig !== 'object') return null;
  const pacing = pacingConfig as { travelMode?: string; transport?: string };
  if (pacing.travelMode) return pacing.travelMode;

  const hint = pacing.transport?.toLowerCase();
  if (!hint) return null;
  if (hint === 'car' || hint === 'self_drive' || hint === 'driving' || hint === 'rental') {
    return 'DRIVING';
  }
  if (hint === 'transit' || hint === 'public_transit') return 'PUBLIC_TRANSIT';
  if (hint === 'mixed') return 'MIXED';
  return null;
}

export function resolveTravelersStatus(
  count: number,
  memberCount: number,
): ConstraintFieldStatus {
  if (count <= 0) return 'missing';
  if (memberCount > 0 && count !== memberCount) return 'misaligned';
  return 'confirmed';
}

export function resolveBudgetStatus(input: {
  total: number | null;
  gateStatus: BudgetGateStatus['verdict'] | null | undefined;
}): BudgetConstraintStatus {
  if (input.total == null || input.total <= 0) return 'missing';
  if (
    input.gateStatus === 'NEED_CONFIRM' ||
    input.gateStatus === 'NEED_ADJUST' ||
    input.gateStatus === 'REJECT'
  ) {
    return 'need_confirm';
  }
  return 'confirmed';
}

export function resolveTransportStatus(input: {
  travelMode: string | null;
  sampleTravelMode?: string | null;
  sampleDistanceMeters?: number | null;
}): ConstraintFieldStatus {
  if (!input.travelMode) return 'missing';

  const pacing = input.travelMode.toUpperCase();
  const segmentMode = input.sampleTravelMode?.toUpperCase();
  const distance = input.sampleDistanceMeters ?? 0;

  if (!segmentMode) return 'confirmed';

  const expectsDriving = pacing === 'DRIVING' || pacing === 'MIXED';
  if (expectsDriving && segmentMode === 'WALKING' && distance >= 2000) {
    return 'misaligned';
  }
  if (pacing === 'PUBLIC_TRANSIT' && segmentMode === 'DRIVING' && distance < 2000) {
    return 'misaligned';
  }
  return 'confirmed';
}

const PENDING_LABELS: Record<
  ConstraintsSummaryResponse['pendingItems'][number]['key'],
  Record<'need_confirm' | 'misaligned' | 'missing', string>
> = {
  time_range: {
    missing: '请设置出发与返回日期',
    need_confirm: '请确认出行日期',
    misaligned: '出行日期待对齐',
  },
  budget: {
    missing: '请设置预算上限',
    need_confirm: '预算待确认',
    misaligned: '预算待对齐',
  },
  travelers: {
    missing: '请设置出行人数',
    need_confirm: '出行人数待确认',
    misaligned: '人数与团队成员不一致',
  },
  transport: {
    missing: '请设置基础交通方式',
    need_confirm: '交通方式待确认',
    misaligned: '交通方式与时间轴不一致',
  },
};

export function buildPendingItems(
  parts: Pick<
    ConstraintsSummaryResponse,
    'timeRange' | 'budget' | 'travelers' | 'transport'
  >,
): ConstraintsSummaryResponse['pendingItems'] {
  const items: ConstraintsSummaryResponse['pendingItems'] = [];

  const push = (
    key: ConstraintsSummaryResponse['pendingItems'][number]['key'],
    status: 'need_confirm' | 'misaligned' | 'missing',
    deepLink: string,
  ) => {
    items.push({
      key,
      status,
      label: PENDING_LABELS[key][status],
      deepLink,
    });
  };

  if (parts.timeRange.status === 'missing') {
    push('time_range', 'missing', 'tab=overview');
  }
  if (parts.budget.status === 'need_confirm') {
    push('budget', 'need_confirm', 'tab=budget');
  } else if (parts.budget.status === 'missing') {
    push('budget', 'missing', 'tab=budget');
  }
  if (parts.travelers.status === 'misaligned') {
    push('travelers', 'misaligned', 'tab=team');
  } else if (parts.travelers.status === 'missing') {
    push('travelers', 'missing', 'tab=team');
  }
  if (parts.transport.status === 'misaligned') {
    push('transport', 'misaligned', 'openIntent=1');
  } else if (parts.transport.status === 'missing') {
    push('transport', 'missing', 'openIntent=1');
  }

  return items;
}

export function computeAllReady(
  parts: Pick<
    ConstraintsSummaryResponse,
    'timeRange' | 'budget' | 'travelers' | 'transport'
  >,
): boolean {
  return (
    parts.timeRange.status === 'confirmed' &&
    parts.budget.status === 'confirmed' &&
    parts.travelers.status === 'confirmed' &&
    parts.transport.status === 'confirmed'
  );
}
