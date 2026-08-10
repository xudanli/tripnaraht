/**
 * CN / G318 试点 golden 夹具 SSOT。
 * - 协议层：`toRouteAndRunGoldenEvalFixtures()` → route-and-run-golden-eval-fixtures
 * - 端到端：`CN_G318_E2E_GOLDENS` → scripts/e2e-g318-golden-chat.ts
 * - 护栏单测：`cn-g318-golden-fixtures.spec.ts`
 */
import type { RouteAndRunGoldenEvalFixture } from './route-and-run-routing-protocol.types';

const TRIP_C = '00000000-0000-4000-8000-000000000003';

export type CnG318E2eExpect = {
  expectCards?: Array<
    'activity_booking_cards' | 'car_rental_cards' | 'hotel_cards' | 'flight_cards' | 'activities'
  >;
  expectMeta?: 'cn_hotspot_booking';
  /** 仅要求有可读正文（咨询类） */
  expectAnswer?: boolean;
};

export type CnG318GoldenSeed = {
  id: string;
  label: string;
  message: string;
  successPayload: 'answer_text_only' | 'answer_plus_list';
  e2e?: CnG318E2eExpect;
};

/** 协议 + 端到端共用话术（均须 classify → QUICK_ANSWER） */
export const CN_G318_GOLDEN_SEEDS: readonly CnG318GoldenSeed[] = [
  {
    id: 'golden-cn-g318-how-to-plan',
    label: '川藏线怎么排 → 快答',
    message: '川藏线怎么排，14天够吗',
    successPayload: 'answer_text_only',
    e2e: { expectAnswer: true },
  },
  {
    id: 'golden-cn-mugecuo-ticket',
    label: '木格措门票预订检索 → 快答',
    message: '帮我搜索康定木格措景区8月21日的门票预订信息和价格',
    successPayload: 'answer_plus_list',
    e2e: {
      expectCards: ['activity_booking_cards', 'activities'],
      expectMeta: 'cn_hotspot_booking',
    },
  },
  {
    id: 'golden-cn-kangding-car-rental',
    label: '康定租车 → 快答',
    message: '我想在康定租一辆越野车',
    successPayload: 'answer_plus_list',
    e2e: { expectCards: ['car_rental_cards'] },
  },
  {
    id: 'golden-cn-kangding-hotel',
    label: '康定住宿推荐 → 快答',
    message: '康定8月21日住哪家酒店',
    successPayload: 'answer_plus_list',
    e2e: { expectCards: ['hotel_cards'], expectAnswer: true },
  },
  {
    id: 'golden-cn-litang-hotel',
    label: '理塘住宿推荐 → 快答',
    message: '理塘附近有什么住宿推荐',
    successPayload: 'answer_plus_list',
    e2e: { expectCards: ['hotel_cards'], expectAnswer: true },
  },
  {
    id: 'golden-cn-mugecuo-advance-booking',
    label: '木格措是否需提前订 → 快答',
    message: '木格措需要提前订票吗',
    successPayload: 'answer_text_only',
    // 咨询向：未必走 activity live sensor；meta 由护栏单测覆盖
    e2e: { expectAnswer: true },
  },
  {
    id: 'golden-cn-altitude-acclimatize',
    label: '成都到康定高反 → 快答',
    message: '成都到康定要注意高反吗',
    successPayload: 'answer_text_only',
    e2e: { expectAnswer: true },
  },
  {
    id: 'golden-cn-zheduo-pass-risk',
    label: '折多山垭口风险 → 快答',
    message: '折多山垭口危险吗',
    successPayload: 'answer_text_only',
    e2e: { expectAnswer: true },
  },
  {
    id: 'golden-cn-g318-rainy-landslide',
    label: 'G318 雨季塌方风险 → 快答',
    message: 'G318 雨季塌方风险高吗',
    successPayload: 'answer_text_only',
    e2e: { expectAnswer: true },
  },
  {
    id: 'golden-cn-g318-fuel-sparse',
    label: 'G318 加油站稀疏 → 快答',
    message: 'G318 加油站稀疏吗',
    successPayload: 'answer_text_only',
    e2e: { expectAnswer: true },
  },
  {
    id: 'golden-cn-flight-hz-ctu',
    label: '杭州到成都机票查询 → 快答',
    message: '查一下杭州到成都机场机票',
    successPayload: 'answer_plus_list',
    e2e: { expectCards: ['flight_cards'], expectAnswer: true },
  },
] as const;

export const CN_G318_E2E_GOLDENS = CN_G318_GOLDEN_SEEDS.filter((s) => s.e2e).map((s) => ({
  id: s.id,
  message: s.message,
  expectRouteClass: 'QUICK_ANSWER' as const,
  expectCards: s.e2e?.expectCards,
  expectMeta: s.e2e?.expectMeta,
  expectAnswer: s.e2e?.expectAnswer ?? false,
}));

export function toRouteAndRunGoldenEvalFixtures(): RouteAndRunGoldenEvalFixture[] {
  return CN_G318_GOLDEN_SEEDS.map((s) => ({
    id: s.id,
    label: s.label,
    request: {
      request_id: s.id.replace(/^golden-/, 'golden-req-'),
      user_id: 'eval-user',
      trip_id: TRIP_C,
      message: s.message,
    },
    expected: {
      routeClass: 'QUICK_ANSWER',
      tripId: 'optional',
      needsClarificationBeforeWrite: false,
      allowsDirectItineraryWrite: false,
      successPayload: s.successPayload,
      gate: { terminalStatus: 'OK' },
      deepResearchV71: 'OFF',
      orchestrationDepth: 'LIGHT_LOOKUP',
      asyncEligible: false,
    },
  }));
}
