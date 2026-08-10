/**
 * 六个观察任务的声明式 Observation Plan 模板（P0）。
 * 大模型可在 Registry 内裁剪/组合，但不得发明未注册 key；CRE 安全底线不可省略。
 */

import type {
  ObservationNeed,
  ObservationPlan,
  ObservationScope,
  RorObservationTask,
} from './reality-observation.types';

function need(
  partial: Omit<ObservationNeed, 'blocking'> & { blocking?: boolean },
): ObservationNeed {
  const { blocking, ...rest } = partial;
  return {
    ...rest,
    blocking: blocking ?? partial.necessity === 'REQUIRED',
  };
}

const TEMPLATES: Record<
  RorObservationTask,
  {
    labelZh: string;
    needs: ObservationNeed[];
    completionCriteria: ObservationPlan['completionCriteria'];
  }
> = {
  DAY_EXECUTABILITY: {
    labelZh: '当日/次日能否按计划执行',
    needs: [
      need({
        question: '目标日已安排了哪些活动',
        subject: 'day-activities',
        contextKeys: ['targetDay.date', 'targetDay.activities'],
        reason: '确认执行对象',
        necessity: 'REQUIRED',
      }),
      need({
        question: '活动间实际交通时间是多少',
        subject: 'travel-time',
        contextKeys: ['route.travelTimeMatrix'],
        reason: '判断时间轴是否可执行',
        necessity: 'REQUIRED',
      }),
      need({
        question: '道路开放状态是否允许通行',
        subject: 'road-status',
        contextKeys: ['road.segment.status', 'route.roadSegments'],
        reason: '自驾可执行性',
        necessity: 'CONDITIONAL',
        condition: "travelMode === 'SELF_DRIVE'",
        preferredSources: ['ROAD'],
      }),
      need({
        question: '天气与日照窗口是否足够',
        subject: 'weather-daylight',
        contextKeys: ['weather.forecast', 'environment.daylightWindow'],
        reason: '户外与驾驶窗口',
        necessity: 'CONDITIONAL',
        condition: 'containsOutdoorActivity',
      }),
      need({
        question: '是否有不可移动的固定订单',
        subject: 'fixed-bookings',
        contextKeys: ['booking.fixedCommitments'],
        reason: '确定硬时间锚点',
        necessity: 'REQUIRED',
      }),
      need({
        question: '车辆是否满足路线要求',
        subject: 'vehicle-fit',
        contextKeys: ['vehicle.profile', 'vehicle.driveType', 'vehicle.rentalRestriction'],
        reason: 'F-road / 租约合规',
        necessity: 'CONDITIONAL',
        condition: "travelMode === 'SELF_DRIVE'",
      }),
    ],
    completionCriteria: [
      { id: 'day_loaded', description: '目标日活动已观察' },
      { id: 'hard_blockers_known', description: '道路/车辆硬阻断已知或已标记未知' },
    ],
  },
  DAY_PACE: {
    labelZh: '评估当日节奏是否过赶/过累',
    needs: [
      need({
        question: '第三天（目标日）已经安排了什么',
        subject: 'day-activities',
        contextKeys: ['targetDay.date', 'targetDay.activities'],
        reason: '计算活动密度和时间占用',
        necessity: 'REQUIRED',
      }),
      need({
        question: '活动之间实际需要多少交通时间',
        subject: 'travel-time',
        contextKeys: ['route.travelTimeMatrix'],
        reason: '判断时间轴是否可执行',
        necessity: 'REQUIRED',
      }),
      need({
        question: '当天有多少可用日照',
        subject: 'daylight',
        contextKeys: ['environment.daylightWindow'],
        reason: '判断户外是否来得及',
        necessity: 'CONDITIONAL',
        condition: 'containsOutdoorActivity',
      }),
      need({
        question: '是否有不可移动的订单',
        subject: 'fixed-bookings',
        contextKeys: ['booking.fixedCommitments'],
        reason: '确定哪些活动不能调整',
        necessity: 'REQUIRED',
      }),
      need({
        question: '团队体能是否有限制',
        subject: 'team-capability',
        contextKeys: ['team.memberCapability', 'participants'],
        reason: '判断节奏是否适合成员',
        necessity: 'REQUIRED',
      }),
      need({
        question: '体验强度如何',
        subject: 'intensity',
        contextKeys: ['experience.physicalIntensity'],
        reason: '评估疲劳累积',
        necessity: 'OPTIONAL',
      }),
      need({
        question: '推导当日驾驶/活动/缓冲',
        subject: 'derived-pace',
        contextKeys: [
          'derived.day.totalDrivingMinutes',
          'derived.day.totalActivityMinutes',
          'derived.day.scheduleDensity',
          'derived.day.bufferMinutes',
        ],
        reason: '确定性节奏指标',
        necessity: 'REQUIRED',
        blocking: false,
      }),
      need({
        question: '用户当前是否疲劳（仅高影响时追问）',
        subject: 'fatigue',
        contextKeys: ['user.currentFatigue'],
        reason: '隐式疲劳需确认才可作软约束',
        necessity: 'OPTIONAL',
        blocking: false,
      }),
    ],
    completionCriteria: [
      { id: 'pace_metrics', description: '密度与驾驶分钟可计算或已标记缺口' },
      { id: 'fixed_known', description: '固定订单已知' },
    ],
  },
  ADD_ACTIVITY: {
    labelZh: '能否把活动加入某天',
    needs: [
      need({
        question: '目标日是哪一天、已有哪些安排',
        subject: 'day-slot',
        contextKeys: ['trip.id', 'targetDay.date', 'targetDay.activities'],
        reason: '插入点与冲突检测',
        necessity: 'REQUIRED',
      }),
      need({
        question: '要加入的体验产品是什么',
        subject: 'product',
        contextKeys: ['experience.product', 'experience.physicalIntensity'],
        reason: '时长/强度/集合点',
        necessity: 'REQUIRED',
      }),
      need({
        question: '交通时间矩阵是否允许插入',
        subject: 'travel-time',
        contextKeys: ['route.travelTimeMatrix'],
        reason: '可行性',
        necessity: 'REQUIRED',
        blocking: false,
      }),
      need({
        question: '成员与体能是否匹配',
        subject: 'participants',
        contextKeys: ['participants', 'team.memberCapability'],
        reason: '适配性',
        necessity: 'REQUIRED',
      }),
      need({
        question: '是否需要预订/可订状态',
        subject: 'booking',
        contextKeys: ['booking.availability'],
        reason: '库存',
        necessity: 'CONDITIONAL',
        condition: 'containsReservableActivity',
      }),
      need({
        question: '自驾时车辆与道路是否允许',
        subject: 'vehicle-road',
        contextKeys: ['vehicle.profile', 'road.segment.status'],
        reason: '路线合规',
        necessity: 'CONDITIONAL',
        condition: "travelMode === 'SELF_DRIVE'",
      }),
    ],
    completionCriteria: [
      { id: 'day_and_product', description: '目标日与产品已知' },
      { id: 'fit_known', description: '成员/交通适配已知或 FETCHABLE' },
    ],
  },
  REPLACE_ACTIVITY: {
    labelZh: '替换不可执行/不合适的活动',
    needs: [
      need({
        question: '要替换的活动是哪个',
        subject: 'activity-ref',
        contextKeys: ['activity.ref', 'targetDay.date', 'targetDay.activities'],
        reason: '定位对象',
        necessity: 'REQUIRED',
      }),
      need({
        question: '候选替代体验是什么',
        subject: 'replacement',
        contextKeys: ['experience.product'],
        reason: '替代方案',
        necessity: 'REQUIRED',
      }),
      need({
        question: '固定订单是否约束替换',
        subject: 'fixed',
        contextKeys: ['booking.fixedCommitments'],
        reason: '不可取消项',
        necessity: 'REQUIRED',
      }),
      need({
        question: '成员能力是否匹配替代项',
        subject: 'participants',
        contextKeys: ['participants'],
        reason: '适配',
        necessity: 'OPTIONAL',
        blocking: false,
      }),
    ],
    completionCriteria: [{ id: 'replace_pair', description: '原活动与替代产品已定位' }],
  },
  ROUTE_EXECUTABILITY: {
    labelZh: '当前路线能否走',
    needs: [
      need({
        question: '计划路线包含哪些路段',
        subject: 'segments',
        contextKeys: ['route.roadSegments'],
        reason: '路线对象',
        necessity: 'REQUIRED',
      }),
      need({
        question: '官方道路状态如何',
        subject: 'road-status',
        contextKeys: ['road.segment.status'],
        reason: '通行性',
        necessity: 'REQUIRED',
        freshnessRequirement: '3h',
      }),
      need({
        question: '车辆驱动与租约限制',
        subject: 'vehicle',
        contextKeys: ['vehicle.driveType', 'vehicle.rentalRestriction', 'vehicle.profile'],
        reason: 'F-road/涉水合规',
        necessity: 'REQUIRED',
      }),
      need({
        question: '天气是否放大路线风险',
        subject: 'weather',
        contextKeys: ['weather.forecast'],
        reason: '联合风险',
        necessity: 'REQUIRED',
        freshnessRequirement: '6h',
      }),
      need({
        question: '团队是否具备该路线经验',
        subject: 'capability',
        contextKeys: ['team.memberCapability'],
        reason: '执行能力',
        necessity: 'OPTIONAL',
        blocking: false,
      }),
    ],
    completionCriteria: [
      { id: 'road_and_vehicle', description: '道路状态与车辆档案已观察' },
    ],
  },
  RISK_REPLAN: {
    labelZh: '风险触发后如何调整',
    needs: [
      need({
        question: '风险触发是什么',
        subject: 'risk',
        contextKeys: ['risk.trigger'],
        reason: '重排原因',
        necessity: 'REQUIRED',
      }),
      need({
        question: '受影响日的活动与固定订单',
        subject: 'day',
        contextKeys: ['targetDay.activities', 'booking.fixedCommitments'],
        reason: '可调范围',
        necessity: 'REQUIRED',
      }),
      need({
        question: '最新天气与道路',
        subject: 'world',
        contextKeys: ['weather.forecast', 'road.segment.status'],
        reason: '现实变化',
        necessity: 'REQUIRED',
        freshnessRequirement: '3h',
      }),
      need({
        question: '剩余行程与成员约束',
        subject: 'remaining',
        contextKeys: ['trip.remainingDays', 'participants'],
        reason: '重排空间',
        necessity: 'REQUIRED',
        blocking: false,
      }),
    ],
    completionCriteria: [
      { id: 'risk_and_world', description: '风险与世界态已刷新' },
    ],
  },
};

export function getObservationTaskTemplate(task: RorObservationTask) {
  return TEMPLATES[task];
}

export function listObservationTaskTemplates(): RorObservationTask[] {
  return Object.keys(TEMPLATES) as RorObservationTask[];
}

/** 条件展开：不满足 condition 的 CONDITIONAL need 剔除 */
export function expandTemplateNeeds(
  task: RorObservationTask,
  flags: {
    travelMode?: 'SELF_DRIVE' | 'OTHER' | null;
    containsOutdoorActivity?: boolean;
    containsReservableActivity?: boolean;
  },
): ObservationNeed[] {
  const tpl = TEMPLATES[task];
  return tpl.needs.filter((n) => {
    if (!n.condition) return true;
    if (n.condition === "travelMode === 'SELF_DRIVE'") {
      return flags.travelMode === 'SELF_DRIVE';
    }
    if (n.condition === 'containsOutdoorActivity') {
      return flags.containsOutdoorActivity === true;
    }
    if (n.condition === 'containsReservableActivity') {
      return flags.containsReservableActivity === true;
    }
    return true;
  });
}

export function buildPlanFromTemplate(
  task: RorObservationTask,
  scope: ObservationScope,
  flags: Parameters<typeof expandTemplateNeeds>[1],
  safetyFloorKeys: string[],
): ObservationPlan {
  const tpl = TEMPLATES[task];
  return {
    operation: task,
    labelZh: tpl.labelZh,
    scope,
    needs: expandTemplateNeeds(task, flags),
    completionCriteria: tpl.completionCriteria,
    safetyFloorKeys: [...new Set(safetyFloorKeys)],
    maxReflectRounds: 2,
  };
}
