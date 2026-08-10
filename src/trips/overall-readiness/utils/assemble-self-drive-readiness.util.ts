/**
 * 组装自驾准备 checklist 报告（四类目 + 五态）
 * @see SELF_DRIVE_READINESS_REPORT.md
 */

import {
  complianceCategoryDescriptionZh,
  complianceCategoryTipZh,
  resolveCompliancePack,
} from '../config/compliance-knowledge.resolve';
import type {
  SelfDriveCategoryDetailResponse,
  SelfDriveCategorySummary,
  SelfDriveCategoryTip,
  SelfDriveCriticalAlert,
  SelfDriveItemStatus,
  SelfDriveReadinessCategoryCode,
  SelfDriveReadinessFactInput,
  SelfDriveReadinessItem,
  SelfDriveReadinessReport,
  SelfDriveStatusCounts,
  SelfDriveStatusCountsWithRemaining,
} from '../types/self-drive-readiness.types';

const CATEGORY_META: Array<{
  code: SelfDriveReadinessCategoryCode;
  order: number;
  titleZh: string;
  descriptionZh: string;
  iconKey: string;
  summaryDetailZh: string;
}> = [
  {
    code: 'DRIVING_ELIGIBILITY',
    order: 1,
    titleZh: '驾驶资格',
    descriptionZh: '驾照、国际驾照认证等',
    iconKey: 'driving_license',
    summaryDetailZh: '请完成以下项以确保合法驾驶',
  },
  {
    code: 'VEHICLE_RENTAL',
    order: 2,
    titleZh: '车辆与租赁',
    descriptionZh: '车辆选择、保险、取还车等',
    iconKey: 'vehicle_rental',
    summaryDetailZh: '请完成以下项以避免取车时问题',
  },
  {
    code: 'ITINERARY_ANCHORS',
    order: 3,
    titleZh: '行程锚点',
    descriptionZh: '住宿、景点、活动预订等',
    iconKey: 'itinerary_anchor',
    summaryDetailZh: '请确认住宿与活动预订相关信息',
  },
  {
    code: 'COMPLIANCE_KNOWLEDGE',
    order: 4,
    titleZh: '合规知识',
    descriptionZh: '目的地交通规则与当地驾驶合规要点',
    iconKey: 'compliance',
    summaryDetailZh: '建议出发前阅读当地交通规则',
  },
];

const STATUS_LABEL_ZH: Record<SelfDriveItemStatus, string> = {
  COMPLETED: '已完成',
  TO_PREPARE: '待准备',
  TO_CONFIRM: '待确认',
  MUST_RESOLVE: '必须解决',
  BLOCKED: '已阻塞',
};

const AGGREGATE_PRIORITY: SelfDriveItemStatus[] = [
  'MUST_RESOLVE',
  'TO_PREPARE',
  'TO_CONFIRM',
  'BLOCKED',
  'COMPLETED',
];

export function emptyStatusCounts(): SelfDriveStatusCounts {
  return {
    completed: 0,
    toPrepare: 0,
    toConfirm: 0,
    mustResolve: 0,
    blocked: 0,
  };
}

export function countByStatus(items: SelfDriveReadinessItem[]): SelfDriveStatusCounts {
  const counts = emptyStatusCounts();
  for (const item of items) {
    switch (item.status) {
      case 'COMPLETED':
        counts.completed += 1;
        break;
      case 'TO_PREPARE':
        counts.toPrepare += 1;
        break;
      case 'TO_CONFIRM':
        counts.toConfirm += 1;
        break;
      case 'MUST_RESOLVE':
        counts.mustResolve += 1;
        break;
      case 'BLOCKED':
        counts.blocked += 1;
        break;
    }
  }
  return counts;
}

export function withRemaining(
  counts: SelfDriveStatusCounts,
): SelfDriveStatusCountsWithRemaining {
  return {
    ...counts,
    remaining:
      counts.toPrepare + counts.toConfirm + counts.mustResolve + counts.blocked,
  };
}

export function resolveAggregateStatus(
  counts: SelfDriveStatusCounts,
): SelfDriveItemStatus {
  for (const status of AGGREGATE_PRIORITY) {
    if (status === 'COMPLETED') {
      if (
        counts.toPrepare === 0 &&
        counts.toConfirm === 0 &&
        counts.mustResolve === 0 &&
        counts.blocked === 0
      ) {
        return 'COMPLETED';
      }
      continue;
    }
    const key =
      status === 'MUST_RESOLVE'
        ? 'mustResolve'
        : status === 'TO_PREPARE'
          ? 'toPrepare'
          : status === 'TO_CONFIRM'
            ? 'toConfirm'
            : 'blocked';
    if (counts[key] > 0) return status;
  }
  return 'COMPLETED';
}

export function formatStatusSummaryZh(
  aggregate: SelfDriveItemStatus,
  counts: SelfDriveStatusCounts,
): string {
  if (aggregate === 'COMPLETED') return '已完成';
  const n =
    aggregate === 'MUST_RESOLVE'
      ? counts.mustResolve
      : aggregate === 'TO_PREPARE'
        ? counts.toPrepare
        : aggregate === 'TO_CONFIRM'
          ? counts.toConfirm
          : counts.blocked;
  const label =
    aggregate === 'MUST_RESOLVE'
      ? '必须解决'
      : aggregate === 'TO_PREPARE'
        ? '待准备'
        : aggregate === 'TO_CONFIRM'
          ? '待确认'
          : '已阻塞';
  return `${label} ${n} 项`;
}

function statusLabelForItem(
  status: SelfDriveItemStatus,
  opts?: { compliance?: boolean },
): string {
  if (opts?.compliance) {
    if (status === 'COMPLETED') return '已阅读';
    if (status === 'TO_PREPARE') return '未阅读';
  }
  return STATUS_LABEL_ZH[status];
}

function deepLink(tripId: string, path: string): string {
  return `tripnara://trips/${tripId}${path}`;
}

export function buildDrivingEligibilityItems(
  input: SelfDriveReadinessFactInput,
): SelfDriveReadinessItem[] {
  const d = input.driving;
  const tripId = input.tripId;
  const minAge = d.rentalMinAge ?? 20;

  let ageStatus: SelfDriveItemStatus = 'TO_PREPARE';
  let ageDesc: string | null = '尚未填写主驾年龄';
  if (typeof d.primaryDriverAge === 'number') {
    if (d.primaryDriverAge < minAge) {
      ageStatus = 'MUST_RESOLVE';
      ageDesc = `主驾年龄 ${d.primaryDriverAge} 岁，低于租车要求 ${minAge} 岁`;
    } else {
      ageStatus = 'COMPLETED';
      ageDesc = `主驾年龄 ${d.primaryDriverAge} 岁，满足租车要求`;
    }
  }

  let additionalStatus: SelfDriveItemStatus = 'TO_PREPARE';
  let additionalDesc: string | null = '尚未确认附加驾驶员登记';
  if (d.driverCount != null && d.driverCount <= 1) {
    additionalStatus = 'COMPLETED';
    additionalDesc = '仅主驾，无需附加驾驶员';
  } else if (d.additionalDriversRegistered === true) {
    additionalStatus = 'COMPLETED';
    additionalDesc = '附加驾驶员已登记';
  } else if (d.additionalDriversRegistered === false) {
    additionalStatus = 'TO_CONFIRM';
    additionalDesc = '有多名驾驶者，待确认是否已登记';
  }

  let childStatus: SelfDriveItemStatus = 'COMPLETED';
  let childDesc: string | null = '行程无儿童，无需儿童座椅';
  if (d.hasChildren) {
    if (d.childSeatPrepared === true) {
      childStatus = 'COMPLETED';
      childDesc = '儿童座椅已准备';
    } else if (d.childSeatPrepared === false) {
      childStatus = 'MUST_RESOLVE';
      childDesc = '有儿童同行但未确认儿童座椅';
    } else {
      childStatus = 'TO_PREPARE';
      childDesc = '有儿童同行，请确认儿童座椅';
    }
  }

  return [
    {
      id: 'license_validity',
      type: 'LICENSE_VALIDITY',
      titleZh: '驾照是否有效',
      descriptionZh: d.licenseConfirmed
        ? '已确认驾照有效'
        : '尚未确认驾照有效期与持证状态',
      status: d.licenseConfirmed ? 'COMPLETED' : 'TO_PREPARE',
      statusLabelZh: statusLabelForItem(
        d.licenseConfirmed ? 'COMPLETED' : 'TO_PREPARE',
      ),
      iconKey: 'driving_license',
      isTappable: true,
      deepLink: deepLink(tripId, '/driving-settings'),
      actionCode: 'CONFIRM_LICENSE_VALIDITY',
    },
    {
      id: 'idp_or_translation',
      type: 'IDP_OR_TRANSLATION',
      titleZh: '是否需要国际驾照 / 翻译件',
      descriptionZh: d.idpOrTranslationConfirmed
        ? '已确认国际驾照或翻译件要求'
        : '请确认是否需要国际驾照或官方翻译件',
      status: d.idpOrTranslationConfirmed ? 'COMPLETED' : 'TO_PREPARE',
      statusLabelZh: statusLabelForItem(
        d.idpOrTranslationConfirmed ? 'COMPLETED' : 'TO_PREPARE',
      ),
      iconKey: 'doc',
      isTappable: true,
      deepLink: deepLink(tripId, '/driving-settings'),
      actionCode: 'CONFIRM_IDP_OR_TRANSLATION',
    },
    {
      id: 'primary_driver_age',
      type: 'PRIMARY_DRIVER_AGE',
      titleZh: '主驾驶年龄',
      descriptionZh: ageDesc,
      status: ageStatus,
      statusLabelZh: statusLabelForItem(ageStatus),
      iconKey: 'driving_license',
      isTappable: true,
      deepLink: deepLink(tripId, '/driving-settings'),
      actionCode: 'CONFIRM_DRIVER_AGE',
    },
    {
      id: 'additional_drivers',
      type: 'ADDITIONAL_DRIVERS',
      titleZh: '附加驾驶员是否登记',
      descriptionZh: additionalDesc,
      status: additionalStatus,
      statusLabelZh: statusLabelForItem(additionalStatus),
      iconKey: 'driving_license',
      isTappable: true,
      deepLink: deepLink(tripId, '/driving-settings'),
      actionCode: 'CONFIRM_ADDITIONAL_DRIVERS',
    },
    {
      id: 'child_seat',
      type: 'CHILD_SEAT',
      titleZh: '儿童座椅是否准备',
      descriptionZh: childDesc,
      status: childStatus,
      statusLabelZh: statusLabelForItem(childStatus),
      iconKey: 'car',
      isTappable: d.hasChildren === true,
      deepLink: d.hasChildren
        ? deepLink(tripId, '/driving-settings')
        : null,
      actionCode: d.hasChildren ? 'CONFIRM_CHILD_SEAT' : null,
    },
  ];
}

export function buildVehicleRentalItems(
  input: SelfDriveReadinessFactInput,
): SelfDriveReadinessItem[] {
  const r = input.rental;
  const tripId = input.tripId;

  let winterStatus: SelfDriveItemStatus = 'COMPLETED';
  let winterDesc: string | null = '当前季节无需额外确认冬季轮胎';
  if (r.winterTiresRequired) {
    if (r.winterTiresConfirmed === true) {
      winterStatus = 'COMPLETED';
      winterDesc = '冬季轮胎已确认';
    } else if (r.winterTiresConfirmed === false) {
      winterStatus = 'MUST_RESOLVE';
      winterDesc = '冬季出行需冬季轮胎，尚未确认';
    } else {
      winterStatus = 'TO_PREPARE';
      winterDesc = '请确认租车含冬季轮胎';
    }
  }

  const phone = r.emergencyPhone?.trim();
  const phoneStatus: SelfDriveItemStatus = phone ? 'COMPLETED' : 'TO_PREPARE';

  return [
    {
      id: 'rental_order',
      type: 'RENTAL_ORDER',
      titleZh: '租车订单',
      descriptionZh: r.hasRentalOrder ? '已关联租车订单' : '尚未上传或关联租车订单',
      status: r.hasRentalOrder ? 'COMPLETED' : 'TO_PREPARE',
      statusLabelZh: statusLabelForItem(
        r.hasRentalOrder ? 'COMPLETED' : 'TO_PREPARE',
      ),
      iconKey: 'doc',
      isTappable: true,
      deepLink: deepLink(tripId, '/rental'),
      actionCode: 'UPLOAD_RENTAL_ORDER',
    },
    {
      id: 'vehicle_model',
      type: 'VEHICLE_MODEL',
      titleZh: '车型确认',
      descriptionZh: r.vehicleModelConfirmed
        ? '车型已确认'
        : '尚未确认车型 / 四驱能力',
      status: r.vehicleModelConfirmed ? 'COMPLETED' : 'TO_CONFIRM',
      statusLabelZh: statusLabelForItem(
        r.vehicleModelConfirmed ? 'COMPLETED' : 'TO_CONFIRM',
      ),
      iconKey: 'car',
      isTappable: true,
      deepLink: deepLink(tripId, '/driving-settings'),
      actionCode: 'CONFIRM_VEHICLE_MODEL',
    },
    {
      id: 'pickup_dropoff',
      type: 'PICKUP_DROPOFF',
      titleZh: '取还车地点',
      descriptionZh: r.pickupDropoffConfirmed
        ? '取还车地点已确认'
        : '尚未确认取还车地点',
      status: r.pickupDropoffConfirmed ? 'COMPLETED' : 'TO_PREPARE',
      statusLabelZh: statusLabelForItem(
        r.pickupDropoffConfirmed ? 'COMPLETED' : 'TO_PREPARE',
      ),
      iconKey: 'location',
      isTappable: true,
      deepLink: deepLink(tripId, '/rental'),
      actionCode: 'CONFIRM_PICKUP_DROPOFF',
    },
    {
      id: 'winter_tires',
      type: 'WINTER_TIRES',
      titleZh: '冬季轮胎确认',
      descriptionZh: winterDesc,
      status: winterStatus,
      statusLabelZh: statusLabelForItem(winterStatus),
      iconKey: 'snowflake',
      isTappable: r.winterTiresRequired === true,
      deepLink: r.winterTiresRequired
        ? deepLink(tripId, '/driving-settings')
        : null,
      actionCode: r.winterTiresRequired ? 'CONFIRM_WINTER_TIRES' : null,
    },
    {
      id: 'insurance',
      type: 'INSURANCE',
      titleZh: '保险确认',
      descriptionZh: r.insuranceConfirmed
        ? '保险方案已确认'
        : '尚未确认租车保险覆盖',
      status: r.insuranceConfirmed ? 'COMPLETED' : 'TO_CONFIRM',
      statusLabelZh: statusLabelForItem(
        r.insuranceConfirmed ? 'COMPLETED' : 'TO_CONFIRM',
      ),
      iconKey: 'shield',
      isTappable: true,
      deepLink: deepLink(tripId, '/driving-settings'),
      actionCode: 'CONFIRM_INSURANCE',
    },
    {
      id: 'emergency_phone',
      type: 'EMERGENCY_CONTACT',
      titleZh: '紧急联系电话',
      descriptionZh: phone
        ? `${phone}（租车公司）`
        : '尚未填写租车公司紧急电话',
      status: phoneStatus,
      statusLabelZh: statusLabelForItem(phoneStatus),
      iconKey: 'phone',
      isTappable: true,
      deepLink: deepLink(tripId, '/rental'),
      actionCode: 'CONFIRM_RENTAL_EMERGENCY_PHONE',
    },
  ];
}

export function buildItineraryAnchorItems(
  input: SelfDriveReadinessFactInput,
): SelfDriveReadinessItem[] {
  const a = input.anchors;
  const tripId = input.tripId;

  let accomStatus: SelfDriveItemStatus = 'TO_PREPARE';
  let accomDesc: string | null = '尚未安排住宿';
  if (a.expectedNightCount <= 0) {
    accomStatus = 'COMPLETED';
    accomDesc = '单日行程，无需过夜住宿';
  } else if (a.bookedNightCount >= a.expectedNightCount) {
    accomStatus = 'COMPLETED';
    accomDesc = `${a.bookedNightCount} 晚已确认`;
  } else if (a.bookedNightCount > 0) {
    accomStatus = 'TO_CONFIRM';
    accomDesc = `${a.bookedNightCount} 晚已确认，${a.needBookingNightCount} 晚待确认`;
  } else if (a.needBookingNightCount > 0) {
    accomStatus = 'TO_PREPARE';
    accomDesc = `${a.needBookingNightCount} 晚待预订`;
  }

  let activityStatus: SelfDriveItemStatus = 'COMPLETED';
  let activityDesc: string | null = '暂无需要预订的活动';
  if (a.activityTotal > 0) {
    if (a.activityBooked >= a.activityTotal) {
      activityStatus = 'COMPLETED';
      activityDesc = `${a.activityBooked} 项活动已确认`;
    } else if (a.activityBooked > 0) {
      activityStatus = 'TO_CONFIRM';
      activityDesc = `${a.activityBooked}/${a.activityTotal} 项活动已确认`;
    } else {
      activityStatus = 'TO_PREPARE';
      activityDesc = `${a.activityTotal} 项活动待预订`;
    }
  }

  let nightSelfStatus: SelfDriveItemStatus = 'COMPLETED';
  let nightSelfDesc: string | null = '无需夜间自助入住确认';
  if (a.nightSelfCheckinConfirmed === true) {
    nightSelfStatus = 'COMPLETED';
    nightSelfDesc = '夜间自助入住信息已确认';
  } else if (a.nightSelfCheckinConfirmed === false) {
    nightSelfStatus = 'TO_CONFIRM';
    nightSelfDesc = '可能涉及夜间到达，请确认自助入住方式';
  } else if (a.expectedNightCount > 0) {
    nightSelfStatus = 'TO_PREPARE';
    nightSelfDesc = '请确认是否需要夜间自助入住';
  }

  return [
    {
      id: 'accommodation_orders',
      type: 'ACCOMMODATION_ORDERS',
      titleZh: '住宿订单',
      descriptionZh: accomDesc,
      status: accomStatus,
      statusLabelZh: statusLabelForItem(accomStatus),
      iconKey: 'bed',
      isTappable: true,
      deepLink: deepLink(tripId, '/accommodation'),
      actionCode: 'REVIEW_ACCOMMODATION_ORDERS',
    },
    {
      id: 'activity_orders',
      type: 'ACTIVITY_ORDERS',
      titleZh: '活动订单',
      descriptionZh: activityDesc,
      status: activityStatus,
      statusLabelZh: statusLabelForItem(activityStatus),
      iconKey: 'ticket',
      isTappable: a.activityTotal > 0,
      deepLink: a.activityTotal > 0 ? deepLink(tripId, '/activities') : null,
      actionCode: a.activityTotal > 0 ? 'REVIEW_ACTIVITY_ORDERS' : null,
    },
    {
      id: 'meeting_time',
      type: 'MEETING_TIME',
      titleZh: '集合时间',
      descriptionZh: a.meetingTimeConfirmed
        ? '集合时间已确认'
        : '尚未确认出发集合时间',
      status: a.meetingTimeConfirmed ? 'COMPLETED' : 'TO_PREPARE',
      statusLabelZh: statusLabelForItem(
        a.meetingTimeConfirmed ? 'COMPLETED' : 'TO_PREPARE',
      ),
      iconKey: 'clock',
      isTappable: true,
      deepLink: deepLink(tripId, '/plan'),
      actionCode: 'CONFIRM_MEETING_TIME',
    },
    {
      id: 'checkin_time',
      type: 'CHECKIN_TIME',
      titleZh: '入住时间',
      descriptionZh: a.checkinTimeConfirmed
        ? '入住时间已确认'
        : '尚未确认住宿入住时间',
      status: a.checkinTimeConfirmed ? 'COMPLETED' : 'TO_PREPARE',
      statusLabelZh: statusLabelForItem(
        a.checkinTimeConfirmed ? 'COMPLETED' : 'TO_PREPARE',
      ),
      iconKey: 'clock',
      isTappable: true,
      deepLink: deepLink(tripId, '/accommodation'),
      actionCode: 'CONFIRM_CHECKIN_TIME',
    },
    {
      id: 'night_self_checkin',
      type: 'NIGHT_SELF_CHECKIN',
      titleZh: '夜间自助入住',
      descriptionZh: nightSelfDesc,
      status: nightSelfStatus,
      statusLabelZh: statusLabelForItem(nightSelfStatus),
      iconKey: 'door',
      isTappable: nightSelfStatus !== 'COMPLETED',
      deepLink:
        nightSelfStatus !== 'COMPLETED'
          ? deepLink(tripId, '/accommodation')
          : null,
      actionCode:
        nightSelfStatus !== 'COMPLETED' ? 'CONFIRM_NIGHT_SELF_CHECKIN' : null,
    },
  ];
}

export function buildComplianceItems(
  input: SelfDriveReadinessFactInput,
): SelfDriveReadinessItem[] {
  const pack = resolveCompliancePack(input.countryCode);
  return pack.map((entry) => {
    const readAt = input.complianceReads[entry.id];
    const status: SelfDriveItemStatus = readAt ? 'COMPLETED' : 'TO_PREPARE';
    return {
      id: entry.id,
      type: entry.type,
      titleZh: entry.titleZh,
      descriptionZh: null,
      status,
      statusLabelZh: statusLabelForItem(status, { compliance: true }),
      iconKey: entry.iconKey,
      isTappable: true,
      deepLink: `tripnara://trips/${input.tripId}/compliance/${entry.id}`,
      actionCode: 'MARK_COMPLIANCE_READ',
      contentUrl: entry.contentUrl,
    };
  });
}

export function buildAllCategoryItems(
  input: SelfDriveReadinessFactInput,
): Record<SelfDriveReadinessCategoryCode, SelfDriveReadinessItem[]> {
  return {
    DRIVING_ELIGIBILITY: buildDrivingEligibilityItems(input),
    VEHICLE_RENTAL: buildVehicleRentalItems(input),
    ITINERARY_ANCHORS: buildItineraryAnchorItems(input),
    COMPLIANCE_KNOWLEDGE: buildComplianceItems(input),
  };
}

function buildTips(
  code: SelfDriveReadinessCategoryCode,
  countryCode?: string | null,
): SelfDriveCategoryTip[] {
  switch (code) {
    case 'DRIVING_ELIGIBILITY':
      return [
        {
          style: 'TIP',
          iconKey: 'lightbulb',
          textZh:
            (countryCode ?? '').toUpperCase() === 'CN'
              ? '境内自驾核验本人驾照与准驾车型；入境旅客确认签证及租车公司对国际驾照要求'
              : '中国驾照通常需要国际驾照或官方翻译件，请提前确认租车公司要求',
        },
      ];
    case 'VEHICLE_RENTAL':
      return [
        {
          style: 'TIP',
          iconKey: 'lightbulb',
          textZh: '建议将租车公司紧急电话和保险单号保存到手机',
        },
      ];
    case 'ITINERARY_ANCHORS':
      return [
        {
          style: 'TIP',
          iconKey: 'info',
          textZh: '夜间抵达时请提前与住宿确认自助入住流程与门锁密码',
        },
      ];
    case 'COMPLIANCE_KNOWLEDGE': {
      const tip = complianceCategoryTipZh(countryCode);
      return [
        {
          style: tip.style,
          iconKey: 'info',
          textZh: tip.textZh,
        },
      ];
    }
  }
}

function computeChecklistScore(
  items: SelfDriveReadinessItem[],
): { score: number; hasMustResolve: boolean } {
  const total = items.length;
  if (total === 0) return { score: 0, hasMustResolve: false };
  const completed = items.filter((i) => i.status === 'COMPLETED').length;
  const hasMustResolve = items.some((i) => i.status === 'MUST_RESOLVE');
  let score = Math.round((completed / total) * 100);
  if (hasMustResolve) {
    score = Math.min(score, 79);
  }
  return { score, hasMustResolve };
}

function resolveReportDisplayLabel(
  score: number,
  hasMustResolve: boolean,
  overallState: string,
  overallDisplayLabelZh: string,
): { state: string; displayLabelZh: string } {
  if (hasMustResolve || overallState === 'BLOCKED') {
    return { state: 'BLOCKED', displayLabelZh: '已阻塞' };
  }
  if (score >= 85 && overallState === 'READY') {
    return { state: 'READY', displayLabelZh: '已准备好' };
  }
  if (score >= 70) {
    return { state: 'NEAR_READY', displayLabelZh: '良好' };
  }
  if (score >= 30) {
    return { state: 'IN_PROGRESS', displayLabelZh: overallDisplayLabelZh || '尚未就绪' };
  }
  return { state: 'NOT_STARTED', displayLabelZh: '尚未就绪' };
}

function buildCriticalAlerts(
  allItems: Array<{
    categoryCode: SelfDriveReadinessCategoryCode;
    item: SelfDriveReadinessItem;
  }>,
  mustResolveCount: number,
): SelfDriveCriticalAlert[] {
  const mustItems = allItems.filter((x) => x.item.status === 'MUST_RESOLVE');
  return mustItems.slice(0, 3).map((x, index) => ({
    id: x.item.id,
    severity: 'MUST_RESOLVE' as const,
    titleZh:
      index === 0
        ? `${mustResolveCount} 项必须解决`
        : x.item.titleZh,
    messageZh: x.item.descriptionZh ?? x.item.titleZh,
    categoryCode: x.categoryCode,
    itemId: x.item.id,
    deepLink: x.item.deepLink,
    actionCode: x.item.actionCode,
  }));
}

export function assembleSelfDriveReadinessReport(
  input: SelfDriveReadinessFactInput,
): SelfDriveReadinessReport {
  const categoryItems = buildAllCategoryItems(input);
  const flat: Array<{
    categoryCode: SelfDriveReadinessCategoryCode;
    item: SelfDriveReadinessItem;
  }> = [];
  for (const meta of CATEGORY_META) {
    for (const item of categoryItems[meta.code]) {
      flat.push({ categoryCode: meta.code, item });
    }
  }

  const allItems = flat.map((f) => f.item);
  const counts = withRemaining(countByStatus(allItems));
  const { score: checklistScore, hasMustResolve } =
    computeChecklistScore(allItems);

  // 与壳层同向：取 checklist 与 overall 的较低分，mustResolve 时封顶
  let score = Math.min(input.overallScore, checklistScore);
  if (hasMustResolve) score = Math.min(score, 79);

  const { state, displayLabelZh } = resolveReportDisplayLabel(
    score,
    hasMustResolve,
    input.overallState,
    input.overallDisplayLabelZh,
  );

  const categories: SelfDriveCategorySummary[] = CATEGORY_META.map((meta) => {
    const items = categoryItems[meta.code];
    const itemCounts = countByStatus(items);
    const aggregateStatus = resolveAggregateStatus(itemCounts);
    const descriptionZh =
      meta.code === 'COMPLIANCE_KNOWLEDGE'
        ? complianceCategoryDescriptionZh(input.countryCode)
        : meta.descriptionZh;
    return {
      code: meta.code,
      order: meta.order,
      titleZh: meta.titleZh,
      descriptionZh,
      iconKey: meta.iconKey,
      aggregateStatus,
      statusSummaryZh: formatStatusSummaryZh(aggregateStatus, itemCounts),
      itemCounts,
    };
  });

  const criticalAlerts = buildCriticalAlerts(flat, counts.mustResolve);

  const firstIncomplete =
    categories.find((c) => c.aggregateStatus !== 'COMPLETED') ?? categories[0];

  const categoryTips = Object.fromEntries(
    CATEGORY_META.map((m) => [m.code, buildTips(m.code, input.countryCode)]),
  ) as Record<SelfDriveReadinessCategoryCode, SelfDriveCategoryTip[]>;

  return {
    tripId: input.tripId,
    contextVersion: input.contextVersion,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    tripSummary: input.tripSummary,
    score,
    state,
    displayLabelZh,
    headlineZh:
      counts.remaining > 0
        ? `还有 ${counts.remaining} 项待完成`
        : '准备项已全部完成',
    mustResolveSummaryZh: `${counts.mustResolve} 项必须解决`,
    counts,
    categories,
    criticalAlerts,
    primaryCta: {
      labelZh: '查看全部细节',
      action: 'OPEN_FIRST_INCOMPLETE_CATEGORY',
      categoryCode: firstIncomplete.code,
    },
    categoryItems,
    categoryTips,
  };
}

export function projectSelfDriveCategoryDetail(
  report: SelfDriveReadinessReport,
  categoryCode: SelfDriveReadinessCategoryCode,
): SelfDriveCategoryDetailResponse {
  const meta = CATEGORY_META.find((c) => c.code === categoryCode);
  if (!meta) {
    throw new Error(`Unknown categoryCode: ${categoryCode}`);
  }
  const summary = report.categories.find((c) => c.code === categoryCode)!;
  const items = report.categoryItems?.[categoryCode] ?? [];
  const tips = report.categoryTips?.[categoryCode] ?? buildTips(categoryCode);

  return {
    tripId: report.tripId,
    contextVersion: report.contextVersion,
    category: {
      code: meta.code,
      order: meta.order,
      titleZh: meta.titleZh,
      aggregateStatus: summary.aggregateStatus,
      summaryTitleZh: summary.statusSummaryZh,
      summaryDetailZh: meta.summaryDetailZh,
      iconKey: meta.iconKey,
    },
    items,
    tips,
  };
}

export function isSelfDriveReadinessCategoryCode(
  value: string,
): value is SelfDriveReadinessCategoryCode {
  return CATEGORY_META.some((c) => c.code === value);
}

export { CATEGORY_META };
