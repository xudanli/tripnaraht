/**
 * 执行快速操作 / 成员状态 — 纯投影（场景、文案、建议、生命周期）
 * @see src/trips/execution-quick-actions/EXECUTION_QUICK_ACTIONS_API.md
 */

import type {
  MemberLifecycleStatus,
  MemberNeedCode,
  MemberReportPriority,
  MemberReportSource,
  MemberStatusArrangementDto,
  MemberStatusSuggestionDto,
  QuickActionsScene,
  TripActionCode,
  TripFieldFollowUpDto,
  TripFieldReportPayload,
} from '../dto/mobile-execution-quick-actions.types';
import { MEMBER_NEED_CODES } from '../dto/mobile-execution-quick-actions.types';

export const NEED_LABEL_ZH: Record<MemberNeedCode, string> = {
  NEED_TOILET: '需要上厕所',
  NEED_REST: '需要休息',
  CARSICK: '晕车',
  HUNGRY: '饿了',
  TOO_COLD: '太冷',
  UNWELL: '身体不舒服',
  FELL_BEHIND: '掉队',
  NEED_HELP: '需要帮助',
  ARRIVED: '我已到达',
  WAIT_FOR_ME: '等我一下',
  SHARE_LOCATION: '请求共享位置',
  SKIP_NEXT: '我不参加下一项',
  RETURN_EARLY: '我想提前回酒店',
  LOWER_INTENSITY: '降低活动强度',
  CAN_CONTINUE: '我可以继续',
};

export const LIFECYCLE_LABEL_ZH: Record<MemberLifecycleStatus, string> = {
  REPORTED: '已上报',
  TEAM_AWARE: '团队已知晓',
  ARRANGED: '已安排处理',
  RESOLVED: '已解决',
  CANCELLED: '已取消',
};

export const SCENE_LABEL_ZH: Record<QuickActionsScene, string> = {
  DRIVING: '驾驶途中',
  AT_POI: '已到点',
  DELAY_RISK: '延误风险',
};

const TERMINAL: ReadonlySet<MemberLifecycleStatus> = new Set(['RESOLVED', 'CANCELLED']);

const OPEN: ReadonlySet<MemberLifecycleStatus> = new Set([
  'REPORTED',
  'TEAM_AWARE',
  'ARRANGED',
]);

/** Forward edges (CANCELLED handled separately from any non-terminal). */
const LIFECYCLE_EDGES: Record<MemberLifecycleStatus, MemberLifecycleStatus[]> = {
  REPORTED: ['TEAM_AWARE', 'CANCELLED'],
  TEAM_AWARE: ['ARRANGED', 'CANCELLED'],
  ARRANGED: ['RESOLVED', 'CANCELLED'],
  RESOLVED: [],
  CANCELLED: [],
};

export function isMemberNeedCode(v: unknown): v is MemberNeedCode {
  return typeof v === 'string' && (MEMBER_NEED_CODES as readonly string[]).includes(v);
}

export function isOpenLifecycle(status: MemberLifecycleStatus): boolean {
  return OPEN.has(status);
}

export function isTerminalLifecycle(status: MemberLifecycleStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionLifecycle(
  from: MemberLifecycleStatus,
  to: MemberLifecycleStatus,
): boolean {
  if (from === to) return false;
  if (isTerminalLifecycle(from)) return false;
  return LIFECYCLE_EDGES[from].includes(to);
}

export function allowedTransitionsFrom(
  from: MemberLifecycleStatus,
): MemberLifecycleStatus[] {
  return [...LIFECYCLE_EDGES[from]];
}

export function buildSourceLabelZh(input: {
  source: MemberReportSource;
  subjectName: string;
  reporterName: string;
  needLabelZh: string;
}): string {
  if (input.source === 'PROXY') {
    return `${input.reporterName} 为${input.subjectName}记录：${input.needLabelZh}`;
  }
  return `${input.subjectName}报告：${input.needLabelZh}`;
}

export function resolveReportPriority(input: {
  needCode: MemberNeedCode;
  isSubjectDriver: boolean;
}): MemberReportPriority {
  if (
    input.isSubjectDriver &&
    (input.needCode === 'NEED_REST' ||
      input.needCode === 'UNWELL' ||
      input.needCode === 'CARSICK')
  ) {
    return 'SAFETY_HIGH';
  }
  if (input.needCode === 'NEED_HELP' || input.needCode === 'UNWELL') {
    return 'SAFETY_HIGH';
  }
  return 'NORMAL';
}

/** Toilet ≠ rest: different placeCategoryHint and titles. */
export function projectMemberSuggestion(input: {
  needCode: MemberNeedCode;
  priority: MemberReportPriority;
  hardWindowLabelZh?: string | null;
  detourMinutes?: number;
  /** 服务端解析的真实 POI；有则覆盖 stub 地名 */
  resolvedPlace?: {
    placeId: string;
    placeNameZh: string;
    etaMinutes?: number;
    detourMinutes?: number;
    kind?: 'fuel' | 'safe_parking' | 'toilet' | 'food';
  } | null;
}): MemberStatusSuggestionDto {
  const detour = input.detourMinutes ?? defaultDetour(input.needCode);
  const affectsHardWindow = false; // personal reports default: no Decision Space
  const hardWindowNoteZh = input.hardWindowLabelZh
    ? `当前预计不会影响 ${input.hardWindowLabelZh}`
    : undefined;
  const place = input.resolvedPlace;

  const withResolved = (
    base: MemberStatusSuggestionDto,
    fallbackCategory: MemberStatusSuggestionDto['placeCategoryHint'],
  ): MemberStatusSuggestionDto => {
    if (!place) return base;
    const category =
      place.kind === 'toilet'
        ? 'toilet'
        : place.kind === 'fuel' || place.kind === 'food'
          ? place.kind === 'fuel'
            ? 'food'
            : 'food'
          : place.kind === 'safe_parking'
            ? 'safe_parking'
            : fallbackCategory;
    return {
      ...base,
      placeNameZh: place.placeNameZh,
      placeId: place.placeId,
      etaMinutes: place.etaMinutes ?? base.etaMinutes,
      detourMinutes: place.detourMinutes ?? base.detourMinutes,
      placeCategoryHint: category ?? base.placeCategoryHint,
      primaryAction:
        base.primaryAction?.type === 'NAVIGATE'
          ? {
              ...base.primaryAction,
              destinationId: place.placeId,
            }
          : base.primaryAction,
    };
  };

  switch (input.needCode) {
    case 'NEED_TOILET':
      return withResolved(
        {
          titleZh: '最近可用厕所',
          placeNameZh: place?.placeNameZh,
          placeId: place?.placeId,
          etaMinutes: place?.etaMinutes ?? 18,
          detourMinutes: detour,
          affectsHardWindow,
          hardWindowNoteZh,
          placeCategoryHint: 'toilet',
          primaryAction: {
            type: 'NAVIGATE',
            labelZh: '导航到这里',
            destinationId: place?.placeId,
          },
          secondaryAction: { type: 'NOTIFY_TEAM', labelZh: '告诉团队' },
        },
        'toilet',
      );
    case 'NEED_REST':
    case 'CARSICK':
    case 'UNWELL': {
      const base: MemberStatusSuggestionDto = {
        titleZh:
          input.needCode === 'NEED_REST'
            ? '附近安全停车点'
            : input.needCode === 'CARSICK'
              ? '尽快安全停车'
              : '建议尽快停靠',
        placeNameZh: place?.placeNameZh,
        placeId: place?.placeId,
        etaMinutes: place?.etaMinutes ?? 8,
        detourMinutes: Math.min(detour, 5),
        affectsHardWindow,
        hardWindowNoteZh,
        placeCategoryHint: 'safe_parking',
        primaryAction: {
          type: 'NAVIGATE',
          labelZh: '导航到停靠点',
          destinationId: place?.placeId,
        },
        secondaryAction: { type: 'NOTIFY_TEAM', labelZh: '告诉团队' },
      };
      if (input.priority === 'SAFETY_HIGH') {
        base.secondaryAction = {
          type: 'CHANGE_DRIVER',
          labelZh: '更换驾驶员',
        };
      }
      return withResolved(base, 'safe_parking');
    }
    case 'HUNGRY':
      return withResolved(
        {
          titleZh: '顺路补给点',
          placeNameZh: place?.placeNameZh,
          placeId: place?.placeId,
          etaMinutes: place?.etaMinutes ?? 22,
          detourMinutes: detour,
          affectsHardWindow,
          hardWindowNoteZh,
          placeCategoryHint: 'food',
          primaryAction: {
            type: 'NAVIGATE',
            labelZh: '导航到这里',
            destinationId: place?.placeId,
          },
          secondaryAction: { type: 'NOTIFY_TEAM', labelZh: '告诉团队' },
        },
        'food',
      );
    case 'TOO_COLD':
      return withResolved(
        {
          titleZh: '就近室内避寒',
          placeNameZh: place?.placeNameZh ?? '游客中心',
          placeId: place?.placeId ?? 'poi-indoor-visitor',
          etaMinutes: place?.etaMinutes ?? 15,
          detourMinutes: detour,
          affectsHardWindow,
          hardWindowNoteZh,
          placeCategoryHint: 'indoor',
          primaryAction: {
            type: 'NAVIGATE',
            labelZh: '导航到室内',
            destinationId: place?.placeId ?? 'poi-indoor-visitor',
          },
        },
        'indoor',
      );
    case 'FELL_BEHIND':
    case 'WAIT_FOR_ME':
      return {
        titleZh: '与团队会合',
        placeNameZh: '当前集合点',
        placeId: 'poi-meeting-current',
        etaMinutes: 12,
        detourMinutes: 0,
        affectsHardWindow,
        placeCategoryHint: 'meeting',
        primaryAction: { type: 'SHARE_LOCATION', labelZh: '共享我的位置' },
        secondaryAction: { type: 'NOTIFY_TEAM', labelZh: '告诉团队' },
      };
    case 'SHARE_LOCATION':
      return {
        titleZh: '请求团队共享位置',
        affectsHardWindow: false,
        placeCategoryHint: 'none',
        primaryAction: { type: 'SHARE_LOCATION', labelZh: '开启位置共享' },
      };
    case 'NEED_HELP':
      return withResolved(
        {
          titleZh: '需要帮助',
          placeNameZh: place?.placeNameZh,
          placeId: place?.placeId,
          etaMinutes: place?.etaMinutes ?? 5,
          detourMinutes: 2,
          affectsHardWindow: false,
          placeCategoryHint: 'safe_parking',
          primaryAction: { type: 'OPEN_SOS', labelZh: '打开 SOS' },
          secondaryAction: {
            type: 'NAVIGATE',
            labelZh: '导航到停靠点',
            destinationId: place?.placeId,
          },
        },
        'safe_parking',
      );
    case 'ARRIVED':
    case 'SKIP_NEXT':
    case 'RETURN_EARLY':
    case 'LOWER_INTENSITY':
    case 'CAN_CONTINUE':
      return {
        titleZh: NEED_LABEL_ZH[input.needCode],
        affectsHardWindow: false,
        placeCategoryHint: 'none',
        primaryAction: { type: 'NOTIFY_TEAM', labelZh: '告诉团队' },
      };
    default:
      return {
        titleZh: NEED_LABEL_ZH[input.needCode],
        affectsHardWindow: false,
        placeCategoryHint: 'none',
      };
  }
}

function defaultDetour(needCode: MemberNeedCode): number {
  if (needCode === 'NEED_TOILET') return 3;
  if (needCode === 'NEED_REST' || needCode === 'CARSICK') return 2;
  if (needCode === 'HUNGRY') return 5;
  return 4;
}

export function tripActionsForScene(
  scene: QuickActionsScene,
  canManageTrip: boolean,
): TripActionCode[] {
  if (!canManageTrip) return [];

  const byScene: Record<QuickActionsScene, TripActionCode[]> = {
    DRIVING: [
      'NEED_REST',
      'CHANGE_DRIVER',
      'LOW_FUEL',
      'ROAD_MISMATCH',
      'VEHICLE_ISSUE',
      'SAFE_STOP',
      'PAUSE_TRIP',
    ],
    AT_POI: [
      'ARRIVED',
      'START_ACTIVITY',
      'EXTEND_STAY',
      'END_EARLY',
      'SKIP_PLACE',
      'CONTACT_MERCHANT',
    ],
    DELAY_RISK: [
      'VIEW_ADJUST_PLAN',
      'CONTACT_MERCHANT',
      'NAVIGATE_MEETING',
      'CANCEL_ACTIVITY',
      'ADD_STOP',
      'VIEW_ALTERNATIVES',
    ],
  };

  const leaderAlways: TripActionCode[] = [
    'PAUSE_TRIP',
    'SKIP_PLACE',
    'EXTEND_STAY',
    'ADJUST_REMAINING',
    'CONTACT_MERCHANT',
    'ADD_STOP',
  ];

  const merged = new Set<TripActionCode>([...byScene[scene], ...leaderAlways]);
  return [...merged];
}

export function resolveQuickActionsScene(input: {
  hasDelayRisk?: boolean;
  atPoi?: boolean;
}): QuickActionsScene {
  if (input.hasDelayRisk) return 'DELAY_RISK';
  if (input.atPoi) return 'AT_POI';
  return 'DRIVING';
}

export function projectTripFieldFollowUp(
  actionCode: TripActionCode,
  payload?: TripFieldReportPayload,
): {
  followUp: TripFieldFollowUpDto;
  worldStateUpdated: boolean;
  createReport: boolean;
  suggestion: MemberStatusSuggestionDto | null;
  affectsHardWindow: boolean;
  hardWindowLabelZh?: string;
} {
  switch (actionCode) {
    case 'VIEW_ADJUST_PLAN':
    case 'VIEW_ALTERNATIVES':
    case 'ADJUST_REMAINING':
      return {
        followUp: { type: 'OPEN_ADJUSTMENT_QUEUE' },
        worldStateUpdated: false,
        createReport: false,
        suggestion: null,
        affectsHardWindow: false,
      };
    case 'CHANGE_DRIVER':
      return {
        followUp: { type: 'PROMPT_CHANGE_DRIVER' },
        worldStateUpdated: true,
        createReport: true,
        suggestion: {
          titleZh: '更换驾驶员',
          affectsHardWindow: false,
          placeCategoryHint: 'none',
          primaryAction: { type: 'CHANGE_DRIVER', labelZh: '选择新驾驶员' },
        },
        affectsHardWindow: false,
      };
    case 'NAVIGATE_MEETING':
      return {
        followUp: { type: 'OPEN_NAVIGATION' },
        worldStateUpdated: false,
        createReport: false,
        suggestion: {
          titleZh: '导航至集合点',
          placeCategoryHint: 'meeting',
          affectsHardWindow: false,
          primaryAction: {
            type: 'NAVIGATE',
            labelZh: '开始导航',
            destinationId: 'poi-meeting-current',
          },
        },
        affectsHardWindow: false,
      };
    case 'CONTACT_MERCHANT':
      return {
        followUp: {
          type: 'OPEN_CONTACT',
          contactLabelZh: '商家电话',
          contactValue: '+354-000-0000',
        },
        worldStateUpdated: false,
        createReport: true,
        suggestion: null,
        affectsHardWindow: false,
      };
    case 'EXTEND_STAY': {
      const extra = Number(payload?.extraMinutes ?? 0);
      const affects = extra >= 20;
      return {
        followUp: affects
          ? { type: 'OPEN_ADJUSTMENT_QUEUE' }
          : { type: 'NONE' },
        worldStateUpdated: true,
        createReport: true,
        suggestion: {
          titleZh: `延长停留 ${extra || 15} 分钟`,
          affectsHardWindow: affects,
          hardWindowNoteZh: affects
            ? '延长停留可能影响硬时间窗，请确认调整'
            : '当前延长预计不影响硬时间窗',
          placeCategoryHint: 'none',
        },
        affectsHardWindow: affects,
        hardWindowLabelZh: affects ? '下一硬时间窗集合' : undefined,
      };
    }
    case 'PAUSE_TRIP':
    case 'SKIP_PLACE':
    case 'CANCEL_ACTIVITY':
      return {
        followUp: { type: 'OPEN_ADJUSTMENT_QUEUE' },
        worldStateUpdated: true,
        createReport: true,
        suggestion: {
          titleZh: '行程进度已更新',
          affectsHardWindow: true,
          hardWindowNoteZh: '可能影响后续硬时间窗，请确认调整',
          placeCategoryHint: 'none',
        },
        affectsHardWindow: true,
        hardWindowLabelZh: '下一硬时间窗集合',
      };
    case 'ROAD_MISMATCH':
      return {
        followUp: { type: 'OPEN_RUNBOOK', runbookId: 'runbook-road-mismatch' },
        worldStateUpdated: true,
        createReport: true,
        suggestion: {
          titleZh: '路况与假设不符',
          affectsHardWindow: false,
          placeCategoryHint: 'none',
          primaryAction: { type: 'NOTIFY_TEAM', labelZh: '告诉团队' },
        },
        affectsHardWindow: false,
      };
    case 'LOW_FUEL':
    case 'VEHICLE_ISSUE':
    case 'SAFE_STOP':
    case 'NEED_REST':
      return {
        followUp:
          actionCode === 'NEED_REST' || actionCode === 'SAFE_STOP'
            ? { type: 'OPEN_NAVIGATION' }
            : { type: 'NONE' },
        worldStateUpdated: true,
        createReport: true,
        suggestion: projectMemberSuggestion({
          needCode: actionCode === 'NEED_REST' ? 'NEED_REST' : 'NEED_REST',
          priority: 'NORMAL',
        }),
        affectsHardWindow: false,
      };
    default:
      return {
        followUp: { type: 'NONE' },
        worldStateUpdated: true,
        createReport: true,
        suggestion: {
          titleZh: '现场状态已记录',
          affectsHardWindow: false,
          placeCategoryHint: 'none',
        },
        affectsHardWindow: false,
      };
  }
}

export function filterAllowedTransitionsForViewer(input: {
  from: MemberLifecycleStatus;
  viewerUserId: string;
  subjectMemberId: string;
  canManageTrip: boolean;
}): MemberLifecycleStatus[] {
  const all = allowedTransitionsFrom(input.from);
  const isSubject = input.viewerUserId === input.subjectMemberId;
  return all.filter((to) => {
    if (to === 'CANCELLED') return isSubject || input.canManageTrip;
    if (to === 'RESOLVED') return isSubject || input.canManageTrip;
    if (to === 'TEAM_AWARE' || to === 'ARRANGED') return input.canManageTrip;
    return false;
  });
}

export function buildArrangementFromBody(
  body: {
    summaryZh: string;
    placeId?: string;
    placeNameZh?: string;
    etaMinutes?: number;
  },
  arrangedByMemberId: string,
  arrangedAt: string,
): MemberStatusArrangementDto {
  return {
    summaryZh: body.summaryZh,
    placeId: body.placeId,
    placeNameZh: body.placeNameZh,
    etaMinutes: body.etaMinutes,
    arrangedByMemberId,
    arrangedAt,
  };
}
