/**
 * 聊天「活动/门票提前预订」卡片：官方或主流运营商跳转链接。
 * 行程项常缺 bookingUrl，用冰岛常用硬预约目录补链；亦可消费 activity MCP 结果。
 */

import {
  ICELAND_ACTIVITY_BOOKING_CATALOG,
  type ActivityBookingCategory,
  type IcelandActivityBookingCatalogEntry,
} from '../../mcp/activity-booking-catalog';
import {
  isChinaOtaMarket,
  resolveChinaActivityOtaLinks,
} from '../../trips/utils/china-ota-booking-link.util';

export const ACTIVITY_BOOKING_CARDS_SCHEMA =
  'tripnara/chat_activity_booking_cards@v1' as const;

export type ActivityBookingCard = {
  id: string;
  name: string;
  nameZh: string;
  nameEn?: string;
  category: ActivityBookingCategory;
  /** 主跳转：官网 / 运营商订票页 / 国内 OTA（飞猪为 https H5） */
  url: string;
  cta_zh: string;
  bookingProvider?: string;
  bookingLinks?: Array<{ provider: string; url: string; labelZh: string }>;
  /** 飞猪等：web = 浏览器打开 H5 */
  open_strategy?: 'web' | 'app_then_web';
  dayLabelZh?: string;
  associatedDayNumber?: number;
  urgencyZh?: string;
  reasonZh?: string;
  bookingStatus?: string;
  priceLabel?: string;
  availabilityDisclaimerZh?: string;
  source?: string;
  /** OTA 外键；加入行程时幂等 upsert Place */
  otaRef?: { provider: 'fliggy' | 'google' | 'unknown'; externalId: string };
  listing_lat?: number;
  listing_lng?: number;
  address?: string;
  actions?: Array<Record<string, unknown>>;
  /** 团队体能木桶适配：ok | tight | insufficient | unknown */
  teamFitnessFit?: string;
  teamFitnessFloorZh?: string;
  fields_zh: Array<{ key: string; label: string; value: string }>;
  field_labels_zh: Record<string, string>;
};

export { ICELAND_ACTIVITY_BOOKING_CATALOG };
/** 免费/无需预约景点：即使 bookingStatus=NEED_BOOKING 也不出跳转卡 */
const FREE_SIGHT_RE =
  /瀑布|瀑布观景|灯塔|海岬|沙滩|国家公园(?!.*船)|Golden\s*Circle|间歇泉|盖歇尔|辛格维利尔|塞里雅兰|斯科加|钻石沙滩|迪霍拉里/i;

/** 住宿域预订：不得进 Activity live sensor */
const LODGING_BOOKING_DOMAIN_RE =
  /(?:预订|预定|预约|订|找|换|推荐).{0,8}?(?:酒店|住宿|民宿|旅馆|宾馆|青旅|房源)|(?:酒店|住宿|民宿|旅馆|宾馆).{0,8}?(?:预订|预定|预约|订房)|订房|订酒店|酒店预订/i;

/** 租车域：不得进 Activity live sensor */
const VEHICLE_BOOKING_DOMAIN_RE =
  /租车|订车|预订车|预定车|租一辆|(?:预订|预定|预约|订).{0,6}?(?:车|车型)|(?:车|车型).{0,6}?(?:预订|预定|预约)/i;

/** 预订/订/预约/买票 等动作（不含「订酒店/订车」分流，由 domain 负例处理） */
const ACTIVITY_BOOKING_ACTION_RE =
  /预订|预定|预约|订票|买票|购票|提前订|去订|帮我订|要订|需(?:要)?订|订一下|订票链接|跳转订/i;

/** 指代当前焦点活动（无显式活动名时依赖 referent） */
const ACTIVITY_DEICTIC_RE = /这个|该项|这项|该活动|该景点|这个活动|这个景点|当前(?:的)?(?:活动|景点)/i;

/** 显式活动目标（目录名 + 泛活动词） */
const ACTIVITY_TARGET_LEX_RE =
  /活动|景点|体验|门票|入场券|徒步|船游|冰洞|冰川|蓝湖|蓝潟湖|冰河湖|直升机|超级吉普|博物馆|温泉(?:门票)?|glacier\s*hike|Blue\s*Lagoon|Zodiac/i;

export type ActivityBookingPredicateOpts = {
  /** 当前焦点活动名（page focus / 日标题）；「这个需要提前订吗」依赖它 */
  activityReferent?: string | null;
};

function stripTrailingScheduleAnchor(message: string): string {
  return String(message ?? '')
    .replace(/\n*\[日程\][\s\S]*$/u, '')
    .trim();
}

/** 从 iOS `[日程] DayN · 标题` 抽出日标题作为活动 referent */
export function extractScheduleActivityReferent(message: string): string | undefined {
  const line = String(message ?? '').match(/\[日程\]\s*[^\n]*/i)?.[0];
  if (!line) return undefined;
  const afterSep = line.split(/[·•|]/).slice(1).join('·').trim();
  if (afterSep) return afterSep.replace(/\.{2,}$/, '').trim();
  const afterDay = line
    .replace(/^\[日程\]\s*/i, '')
    .replace(/^Day\s*[-_]?\s*\d+\s*/i, '')
    .replace(/^Day\s*\d+\s*/i, '')
    .trim();
  return afterDay || undefined;
}

function catalogMentionsActivity(text: string): boolean {
  const t = String(text ?? '');
  if (!t.trim()) return false;
  return ICELAND_ACTIVITY_BOOKING_CATALOG.some((e) => e.match.test(t));
}

function looksLikeActivityReferent(text: string | null | undefined): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  if (LODGING_BOOKING_DOMAIN_RE.test(t) || /酒店|住宿|民宿|旅馆/.test(t)) return false;
  if (VEHICLE_BOOKING_DOMAIN_RE.test(t) || /租车|车型|取车/.test(t)) return false;
  return catalogMentionsActivity(t) || ACTIVITY_TARGET_LEX_RE.test(t);
}

function hasExplicitActivityTarget(utterance: string, fullMessage: string): boolean {
  if (catalogMentionsActivity(utterance) || ACTIVITY_TARGET_LEX_RE.test(utterance)) {
    return true;
  }
  // 目录命中可落在日程锚点行（正文仅「帮我预订」时）
  if (catalogMentionsActivity(fullMessage) || ACTIVITY_TARGET_LEX_RE.test(fullMessage)) {
    return true;
  }
  return false;
}

/**
 * Activity Booking live predicate（SSOT）。
 * 预订/订/预约/买票 + 明确活动目标 → 允许 Activity live sensor / 解除 slimLoad 跳过。
 * 负例：订酒店、租车；纯指代无 activity referent 则 false。
 */
export function isActivityAdvanceBookingConsultQuery(
  message: string,
  opts?: ActivityBookingPredicateOpts,
): boolean {
  const full = String(message ?? '').trim();
  if (!full) return false;
  const utterance = stripTrailingScheduleAnchor(full);
  const probe = utterance || full;

  if (LODGING_BOOKING_DOMAIN_RE.test(probe)) return false;
  if (VEHICLE_BOOKING_DOMAIN_RE.test(probe)) return false;

  /** 经典「提前预订咨询 / 活动预订 UI 短语」 */
  if (
    /(?:门票|入场券).{0,24}?(?:多久|提前|预订|预约|预定)|(?:多久|几天).{0,16}?(?:提前|预订|预定|订座|要买)|提前(?:多久|几天)|(?:蓝湖|温泉|博物馆).{0,12}?(?:门票|预定|预订)|(?:景点|活动|体验|门票).{0,36}?(?:提前(?:预订|预定|预约|订票)|需要.{0,10}?提前)|(?:提前(?:预订|预定|预约|订票)|需要.{0,10}?提前).{0,36}?(?:景点|活动|体验|门票)|哪些.{0,16}?(?:需要|要).{0,12}?提前(?:预订|预定|预约)|活动预订|订票链接|跳转订/i.test(
      probe,
    )
  ) {
    return true;
  }

  const hasAction = ACTIVITY_BOOKING_ACTION_RE.test(probe);
  if (!hasAction) return false;

  if (hasExplicitActivityTarget(utterance, full)) return true;

  const referent =
    (opts?.activityReferent != null && String(opts.activityReferent).trim()) ||
    extractScheduleActivityReferent(full);
  if (ACTIVITY_DEICTIC_RE.test(probe) && looksLikeActivityReferent(referent)) {
    return true;
  }
  // 日编辑器：正文只有预订动作、焦点日标题是活动 → 视为有 target
  if (looksLikeActivityReferent(referent) && !LODGING_BOOKING_DOMAIN_RE.test(String(referent))) {
    return true;
  }

  return false;
}

export type TripActivityBookingSeed = {
  id: string;
  name: string;
  dayNumber?: number;
  dayDate?: string;
  bookingUrl?: string | null;
  bookingStatus?: string | null;
};

function urgencyLabel(raw: string): string {
  if (raw === 'CRITICAL') return '尽快预订';
  if (raw === 'HIGH') return '建议本周内预订';
  return '可择机预订';
}

function formatDayLabel(dayNumber?: number, dayDate?: string): string | undefined {
  if (dayNumber != null && dayNumber > 0) {
    const d = dayDate ? `（${dayDate.slice(0, 10)}）` : '';
    return `第${dayNumber}天${d}`;
  }
  if (dayDate) return dayDate.slice(0, 10);
  return undefined;
}

function toCard(input: {
  id: string;
  nameZh: string;
  nameEn?: string;
  category: ActivityBookingCard['category'];
  url: string;
  urgencyCode: string;
  reasonZh: string;
  dayNumber?: number;
  dayDate?: string;
  bookingStatus?: string | null;
  bookingProvider?: string;
  bookingLinks?: ActivityBookingCard['bookingLinks'];
  linkHintZh?: string;
}): ActivityBookingCard {
  const dayLabelZh = formatDayLabel(input.dayNumber, input.dayDate);
  const urgencyZh = urgencyLabel(input.urgencyCode);
  const fields_zh: ActivityBookingCard['fields_zh'] = [];
  if (dayLabelZh) fields_zh.push({ key: 'day', label: '行程日', value: dayLabelZh });
  fields_zh.push({ key: 'urgency', label: '紧迫度', value: urgencyZh });
  if (input.reasonZh) fields_zh.push({ key: 'reason', label: '原因', value: input.reasonZh });
  if (input.bookingStatus) {
    fields_zh.push({ key: 'status', label: '状态', value: String(input.bookingStatus) });
  }
  fields_zh.push({
    key: 'link',
    label: '订票',
    value: input.linkHintZh ?? '点击跳转官网 / 运营商',
  });

  return {
    id: input.id,
    name: input.nameZh,
    nameZh: input.nameZh,
    ...(input.nameEn ? { nameEn: input.nameEn } : {}),
    category: input.category,
    url: input.url,
    cta_zh: '去预订',
    ...(input.bookingProvider ? { bookingProvider: input.bookingProvider } : {}),
    ...(input.bookingLinks?.length ? { bookingLinks: input.bookingLinks } : {}),
    ...(dayLabelZh ? { dayLabelZh } : {}),
    ...(input.dayNumber != null ? { associatedDayNumber: input.dayNumber } : {}),
    urgencyZh,
    reasonZh: input.reasonZh,
    ...(input.bookingStatus ? { bookingStatus: String(input.bookingStatus) } : {}),
    fields_zh,
    field_labels_zh: {
      day: '行程日',
      urgency: '紧迫度',
      reason: '原因',
      status: '状态',
      link: '订票',
    },
  };
}

function matchCatalog(text: string): IcelandActivityBookingCatalogEntry | undefined {
  return ICELAND_ACTIVITY_BOOKING_CATALOG.find((e) => e.match.test(text));
}

/** 将 activity MCP / live sensor 结果规范为聊天卡片 */
export function mapActivitySearchItemsToChatCards(
  items: Array<Record<string, unknown>>,
): ActivityBookingCard[] {
  return items.slice(0, 6).map((raw, i) => {
    const nameZh = String(raw.nameZh ?? raw.name ?? raw.title ?? `活动 ${i + 1}`).trim();
    const fromFliggy =
      String(raw.source ?? '') === 'fliggy' ||
      String(raw.bookingProvider ?? '') === 'fliggy';
    const urlRaw = String(
      (fromFliggy ? raw.webUrl ?? raw.url : raw.url ?? raw.webUrl) ?? '',
    ).trim();
    const url =
      (fromFliggy && urlRaw && !/^https?:\/\//i.test(urlRaw)
        ? String(raw.webUrl ?? '').trim()
        : urlRaw) || '#';
    const priceLabel = String(raw.priceLabel ?? '').trim() || undefined;
    const reasonZh = String(raw.reasonZh ?? '').trim() || undefined;
    const urgencyRaw = String(raw.urgencyZh ?? 'HIGH');
    const disclaimer =
      String(raw.availabilityDisclaimerZh ?? '').trim() ||
      '页面或目录提示，下单前以官网实时为准';
    const fields_zh: ActivityBookingCard['fields_zh'] = [];
    if (priceLabel) fields_zh.push({ key: 'price', label: '参考价', value: priceLabel });
    fields_zh.push({
      key: 'urgency',
      label: '紧迫度',
      value: urgencyLabel(urgencyRaw),
    });
    if (reasonZh) fields_zh.push({ key: 'reason', label: '原因', value: reasonZh });
    const teamFitnessFit = String(raw.teamFitnessFit ?? '').trim() || undefined;
    const teamFitnessFloorZh =
      String(raw.teamFitnessFloorZh ?? '').trim() || undefined;
    if (teamFitnessFit || teamFitnessFloorZh) {
      fields_zh.push({
        key: 'team_fitness',
        label: '团队体能',
        value: [teamFitnessFloorZh, teamFitnessFit]
          .filter(Boolean)
          .join(' · '),
      });
    }
    fields_zh.push({ key: 'inventory', label: '可订性', value: disclaimer });
    fields_zh.push({
      key: 'link',
      label: '订票',
      value: fromFliggy ? '点击打开飞猪 H5' : '点击跳转官网 / 运营商',
    });
    const id = String(raw.id ?? `activity-${i}`);
    const bookingProvider =
      String(raw.bookingProvider ?? '').trim() || (fromFliggy ? 'fliggy' : undefined);
    const bookingLinks = Array.isArray(raw.bookingLinks)
      ? (raw.bookingLinks as ActivityBookingCard['bookingLinks'])
      : undefined;
    const address = String(raw.address ?? '').trim() || undefined;
    const listing_lat =
      typeof raw.listing_lat === 'number' ? raw.listing_lat : undefined;
    const listing_lng =
      typeof raw.listing_lng === 'number' ? raw.listing_lng : undefined;
    const otaRefRaw = raw.otaRef as { provider?: string; externalId?: string } | undefined;
    const otaRef =
      otaRefRaw?.provider && String(otaRefRaw.externalId ?? '').trim()
        ? {
            provider: String(otaRefRaw.provider).trim() as 'fliggy' | 'google' | 'unknown',
            externalId: String(otaRefRaw.externalId).trim(),
          }
        : fromFliggy && id
          ? { provider: 'fliggy' as const, externalId: id }
          : undefined;
    const associatedDayNumber =
      typeof raw.associatedDayNumber === 'number'
        ? raw.associatedDayNumber
        : typeof raw.dayNumber === 'number'
          ? raw.dayNumber
          : undefined;
    const applySnapshot = {
      id,
      source: fromFliggy ? 'fliggy' : String(raw.source ?? 'unknown'),
      name: nameZh,
      nameZh,
      ...(url && url !== '#' ? { url } : {}),
      ...(priceLabel ? { priceLabel } : {}),
      ...(address ? { address } : {}),
      ...(listing_lat != null ? { listing_lat } : {}),
      ...(listing_lng != null ? { listing_lng } : {}),
      ...(otaRef ? { otaRef } : {}),
      ...(bookingProvider ? { bookingProvider } : {}),
      ...(associatedDayNumber != null ? { associatedDayNumber } : {}),
      ...(reasonZh ? { reasonZh } : {}),
      category: ((): ActivityBookingCategory => {
        const c = String(raw.category ?? '').trim();
        return c === 'ATTRACTION_TICKET' ? 'ATTRACTION_TICKET' : 'SPECIAL_EXPERIENCE';
      })(),
    };
    const existingActions = Array.isArray(raw.actions)
      ? (raw.actions as Array<Record<string, unknown>>)
      : [];
    const hasAddAction = existingActions.some(
      (a) => String(a.action ?? '') === 'add_activity_to_itinerary',
    );
    const actions = hasAddAction
      ? existingActions
      : [
          ...(url && url !== '#'
            ? [
                {
                  action: 'view_activity',
                  label: 'Book',
                  labelCN: fromFliggy ? '去飞猪预订' : '去预订',
                  params: { activityIndex: i, url, open_strategy: fromFliggy ? 'web' : undefined },
                },
              ]
            : []),
          {
            action: 'add_activity_to_itinerary',
            label: 'Add to Trip',
            labelCN: '加入行程',
            params: { activityIndex: i, applySnapshot },
          },
        ];
    return {
      id,
      name: nameZh,
      nameZh,
      ...(raw.nameEn ? { nameEn: String(raw.nameEn) } : {}),
      category: applySnapshot.category,
      url,
      cta_zh: String(raw.cta_zh ?? (fromFliggy ? '去飞猪预订' : '去预订')),
      urgencyZh: urgencyLabel(urgencyRaw),
      ...(reasonZh ? { reasonZh } : {}),
      ...(priceLabel ? { priceLabel } : {}),
      availabilityDisclaimerZh: disclaimer,
      ...(raw.source ? { source: String(raw.source) } : {}),
      ...(fromFliggy ? { open_strategy: 'web' as const } : {}),
      ...(bookingProvider ? { bookingProvider } : {}),
      ...(bookingLinks?.length ? { bookingLinks } : {}),
      ...(otaRef ? { otaRef } : {}),
      ...(address ? { address } : {}),
      ...(listing_lat != null ? { listing_lat } : {}),
      ...(listing_lng != null ? { listing_lng } : {}),
      ...(associatedDayNumber != null ? { associatedDayNumber } : {}),
      ...(teamFitnessFit ? { teamFitnessFit } : {}),
      ...(teamFitnessFloorZh ? { teamFitnessFloorZh } : {}),
      actions,
      fields_zh,
      field_labels_zh: {
        price: '参考价',
        urgency: '紧迫度',
        reason: '原因',
        team_fitness: '团队体能',
        inventory: '可订性',
        link: '订票',
      },
    };
  });
}

/**
 * 从行程种子 + 问答正文关键词生成可跳转活动预订卡（去重，最多 6 张）。
 */
export function buildActivityBookingChatCards(input: {
  tripItems?: TripActivityBookingSeed[];
  answerText?: string;
  userMessage?: string;
  countryCode?: string | null;
  countryName?: string | null;
  destination?: string | null;
}): ActivityBookingCard[] {
  const out: ActivityBookingCard[] = [];
  const seen = new Set<string>();
  const china = isChinaOtaMarket({
    countryCode: input.countryCode,
    countryName: input.countryName,
    destination: input.destination,
  });

  const push = (card: ActivityBookingCard) => {
    const key = card.url || card.id;
    if (seen.has(key) || seen.has(card.id)) return;
    seen.add(key);
    seen.add(card.id);
    out.push(card);
  };

  for (const item of input.tripItems ?? []) {
    const name = String(item.name ?? '').trim();
    if (!name) continue;
    if (!china && FREE_SIGHT_RE.test(name) && !matchCatalog(name)) continue;

    const catalog = matchCatalog(name);
    const explicitUrl = String(item.bookingUrl ?? '').trim();
    const chinaOta =
      china && !explicitUrl
        ? resolveChinaActivityOtaLinks({ nameZh: catalog?.nameZh ?? name })
        : null;
    const url = explicitUrl || catalog?.url || chinaOta?.bookingUrl;
    if (!url || url === '#') continue;

    const status = String(item.bookingStatus ?? '').toUpperCase();
    const needsBook =
      status === 'NEED_BOOKING' ||
      status === 'UNBOOKED' ||
      Boolean(catalog) ||
      Boolean(explicitUrl) ||
      Boolean(chinaOta);
    if (!needsBook) continue;

    push(
      toCard({
        id: catalog?.id ?? `item-${item.id}`,
        nameZh: catalog?.nameZh ?? name,
        nameEn: catalog?.nameEn,
        category: catalog?.category ?? 'ATTRACTION_TICKET',
        url,
        urgencyCode: catalog?.urgencyZh ?? (status === 'NEED_BOOKING' ? 'HIGH' : 'MEDIUM'),
        reasonZh:
          catalog?.reasonZh ??
          (chinaOta
            ? '可跳转携程/飞猪/去哪儿核验门票与可订性'
            : '行程标记需预订，请以平台实时可订为准'),
        dayNumber: item.dayNumber,
        dayDate: item.dayDate,
        bookingStatus: item.bookingStatus,
        ...(chinaOta
          ? {
              bookingProvider: chinaOta.bookingProvider,
              bookingLinks: chinaOta.bookingLinks,
              linkHintZh: '点击跳转携程 / 飞猪 / 去哪儿',
            }
          : {}),
      }),
    );
  }

  const blob = `${input.userMessage ?? ''}\n${input.answerText ?? ''}`;
  if (china) {
    // 国内：从话术抽活动名，生成 OTA 搜索跳转（无冰岛目录依赖）
    const nameHit =
      blob.match(
        /(?:预订|预定|预约|订|买|购)?\s*([\u4e00-\u9fffA-Za-z0-9·]{2,24}?)(?:门票|体验|一日游|船票|索道|观光)/,
      )?.[1] ||
      blob.match(/([\u4e00-\u9fff]{2,16}(?:景区|公园|古城|雪山|峡谷|博物馆))/)?.[1];
    if (nameHit) {
      const ota = resolveChinaActivityOtaLinks({ nameZh: nameHit });
      if (ota) {
        push(
          toCard({
            id: `cn-ota-${nameHit}`,
            nameZh: `${nameHit}门票`,
            category: 'ATTRACTION_TICKET',
            url: ota.bookingUrl,
            urgencyCode: 'HIGH',
            reasonZh: '可跳转携程/飞猪/去哪儿核验门票与可订性',
            bookingProvider: ota.bookingProvider,
            bookingLinks: ota.bookingLinks,
            linkHintZh: '点击跳转携程 / 飞猪 / 去哪儿',
          }),
        );
      }
    }
  } else {
    for (const entry of ICELAND_ACTIVITY_BOOKING_CATALOG) {
      if (!entry.match.test(blob)) continue;
      push(
        toCard({
          id: entry.id,
          nameZh: entry.nameZh,
          nameEn: entry.nameEn,
          category: entry.category,
          url: entry.url,
          urgencyCode: entry.urgencyZh,
          reasonZh: entry.reasonZh,
        }),
      );
    }
  }

  return out.slice(0, 6);
}
