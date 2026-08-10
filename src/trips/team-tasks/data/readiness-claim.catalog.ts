/**
 * Resolve readiness itemIds → task title/label for from-readiness.
 * Covers self-drive checklist types + overall-readiness issue codes.
 */

export type ReadinessClaimResolved = {
  refId: string;
  titleZh: string;
  labelZh: string;
  systemImage?: string;
};

const SELF_DRIVE: Record<string, Omit<ReadinessClaimResolved, 'refId'>> = {
  LICENSE_VALIDITY: {
    titleZh: '确认驾照有效期',
    labelZh: '准备清单 · 驾照',
    systemImage: 'car',
  },
  IDP_OR_TRANSLATION: {
    titleZh: '办理国际驾照 / 翻译件',
    labelZh: '准备清单 · 国际驾照',
    systemImage: 'doc.text',
  },
  PRIMARY_DRIVER_AGE: {
    titleZh: '确认主驾年龄符合要求',
    labelZh: '准备清单 · 主驾年龄',
    systemImage: 'person',
  },
  ADDITIONAL_DRIVERS: {
    titleZh: '确认附加驾驶人',
    labelZh: '准备清单 · 附加驾驶人',
    systemImage: 'person.2',
  },
  CHILD_SEAT: {
    titleZh: '确认儿童座椅安排',
    labelZh: '准备清单 · 儿童座椅',
    systemImage: 'figure.and.child.holdinghands',
  },
  RENTAL_ORDER: {
    titleZh: '确认租车订单',
    labelZh: '准备清单 · 租车订单',
    systemImage: 'car.fill',
  },
  VEHICLE_MODEL: {
    titleZh: '确认车型',
    labelZh: '准备清单 · 车型',
    systemImage: 'car.side',
  },
  PICKUP_DROPOFF: {
    titleZh: '确认取还车时间与地点',
    labelZh: '准备清单 · 取还车',
    systemImage: 'mappin.and.ellipse',
  },
  WINTER_TIRES: {
    titleZh: '确认冬季轮胎 / 钉胎',
    labelZh: '准备清单 · 冬季轮胎',
    systemImage: 'snowflake',
  },
  INSURANCE: {
    titleZh: '确认租车保险',
    labelZh: '准备清单 · 保险',
    systemImage: 'shield',
  },
  EMERGENCY_CONTACT: {
    titleZh: '填写紧急联系人',
    labelZh: '准备清单 · 紧急联系人',
    systemImage: 'phone',
  },
  ACCOMMODATION_ORDERS: {
    titleZh: '确认住宿订单',
    labelZh: '准备清单 · 住宿',
    systemImage: 'bed.double',
  },
  ACTIVITY_ORDERS: {
    titleZh: '确认活动 / 门票订单',
    labelZh: '准备清单 · 活动订单',
    systemImage: 'ticket',
  },
  MEETING_TIME: {
    titleZh: '对齐集合时间',
    labelZh: '准备清单 · 集合时间',
    systemImage: 'clock',
  },
  CHECKIN_TIME: {
    titleZh: '确认入住时间',
    labelZh: '准备清单 · 入住',
    systemImage: 'clock.badge.checkmark',
  },
  NIGHT_SELF_CHECKIN: {
    titleZh: '确认夜间自助入住说明',
    labelZh: '准备清单 · 夜间入住',
    systemImage: 'moon.stars',
  },
  SPEED_LIMIT: {
    titleZh: '了解限速规则',
    labelZh: '准备清单 · 合规',
    systemImage: 'gauge',
  },
  LIGHTS_ALWAYS_ON: {
    titleZh: '了解全天候开灯规定',
    labelZh: '准备清单 · 合规',
    systemImage: 'lightbulb',
  },
  NO_HANDHELD_PHONE: {
    titleZh: '了解禁持手机驾驶',
    labelZh: '准备清单 · 合规',
    systemImage: 'iphone.slash',
  },
  NO_OFFROAD: {
    titleZh: '了解禁止越野规定',
    labelZh: '准备清单 · 合规',
    systemImage: 'road.lanes',
  },
  SINGLE_LANE_BRIDGE: {
    titleZh: '了解单车道桥通行规则',
    labelZh: '准备清单 · 合规',
    systemImage: 'bridge',
  },
  DUI_RULE: {
    titleZh: '了解酒驾规定',
    labelZh: '准备清单 · 合规',
    systemImage: 'exclamationmark.triangle',
  },
  ROADSIDE_PARKING: {
    titleZh: '了解路边停车规则',
    labelZh: '准备清单 · 合规',
    systemImage: 'parkingsign',
  },
  ACCIDENT_HANDLING: {
    titleZh: '了解事故处理流程',
    labelZh: '准备清单 · 合规',
    systemImage: 'cross.case',
  },
};

const OVERALL_ISSUES: Record<string, Omit<ReadinessClaimResolved, 'refId'>> = {
  TRANSPORT_NO_VEHICLE: {
    titleZh: '落实车辆或主要交通方式',
    labelZh: '准备清单 · 交通',
    systemImage: 'car',
  },
  TRANSPORT_VEHICLE_PENDING: {
    titleZh: '确认车型',
    labelZh: '准备清单 · 交通',
    systemImage: 'car',
  },
  TRANSPORT_INSURANCE_PENDING: {
    titleZh: '确认租车保险方案',
    labelZh: '准备清单 · 保险',
    systemImage: 'shield',
  },
  TRANSPORT_DRIVER_BLOCKED: {
    titleZh: '解决驾驶人资格问题',
    labelZh: '准备清单 · 驾驶人',
    systemImage: 'person.crop.circle.badge.exclamationmark',
  },
  ACCOM_MISSING_NIGHT: {
    titleZh: '补齐缺失住宿夜',
    labelZh: '准备清单 · 住宿',
    systemImage: 'bed.double',
  },
  ACCOM_BOOKING_PENDING: {
    titleZh: '完成待订住宿',
    labelZh: '准备清单 · 住宿',
    systemImage: 'bed.double',
  },
  ACTIVITY_BOOKING_PENDING: {
    titleZh: '完成待订活动',
    labelZh: '准备清单 · 活动',
    systemImage: 'ticket',
  },
  ACTIVITY_MEMBER_UNCONFIRMED: {
    titleZh: '确认成员活动参与',
    labelZh: '准备清单 · 活动',
    systemImage: 'person.2',
  },
  ROUTE_NOT_EXECUTABLE: {
    titleZh: '修复不可执行路线',
    labelZh: '准备清单 · 路线',
    systemImage: 'map',
  },
  MEMBER_PARTICIPATION_PENDING: {
    titleZh: '确认成员参与',
    labelZh: '准备清单 · 成员',
    systemImage: 'person.3',
  },
  MEMBER_PREFERENCES_PENDING: {
    titleZh: '完成偏好填写',
    labelZh: '准备清单 · 成员',
    systemImage: 'slider.horizontal.3',
  },
  MEMBER_HARD_LIMITS_PENDING: {
    titleZh: '确认硬性限制 / 费用偏好',
    labelZh: '准备清单 · 成员',
    systemImage: 'exclamationmark.circle',
  },
  MEMBER_CRITICAL_DECISIONS_OPEN: {
    titleZh: '处理待决关键决策',
    labelZh: '准备清单 · 成员',
    systemImage: 'checklist',
  },
  MEMBER_ROLES_PENDING: {
    titleZh: '分配团队角色',
    labelZh: '准备清单 · 成员',
    systemImage: 'person.badge.key',
  },
};

function normalizeKey(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  // VEHICLE_RENTAL.RENTAL_ORDER / VEHICLE_RENTAL/RENTAL_ORDER / sd:RENTAL_ORDER
  const parts = s.split(/[./:]/);
  const last = parts[parts.length - 1] ?? s;
  return last.toUpperCase().replace(/-/g, '_');
}

export function resolveReadinessClaimItem(
  itemId: string,
): ReadinessClaimResolved {
  const raw = itemId.trim();
  const key = normalizeKey(raw);

  const hit = SELF_DRIVE[key] ?? OVERALL_ISSUES[key] ?? OVERALL_ISSUES[raw];
  if (hit) {
    return { refId: raw, ...hit };
  }

  if (raw.startsWith('ROUTE_ISSUE_')) {
    return {
      refId: raw,
      titleZh: '处理路线问题',
      labelZh: '准备清单 · 路线',
      systemImage: 'map',
    };
  }
  if (raw.startsWith('ACTIVITY_MUST_FAILED_')) {
    return {
      refId: raw,
      titleZh: '处理必做活动失败项',
      labelZh: '准备清单 · 活动',
      systemImage: 'ticket',
    };
  }
  if (raw.startsWith('TRANSPORT_PROBLEM_')) {
    return {
      refId: raw,
      titleZh: '处理交通阻塞问题',
      labelZh: '准备清单 · 交通',
      systemImage: 'car',
    };
  }

  return {
    refId: raw,
    titleZh: `准备项 · ${raw}`,
    labelZh: '准备清单',
  };
}
