/**
 * Intent Profile Registry — 集中管理咨询/CRUD/SKU 意图匹配，避免 util 文件膨胀。
 */

import { detectItineraryItemAddIntent } from '../utils/itinerary-item-add.util';
import { detectItineraryItemDeleteIntent } from '../utils/itinerary-item-delete.util';
import { detectItineraryItemUpdateIntent } from '../utils/itinerary-item-update.util';
import { detectItineraryDayViewIntent } from '../utils/itinerary-day-view.util';
import type { IntentMatchContext, IntentProfile, MatchedIntentProfile } from './intent-profile.types';

function diningMatch(msg: string): boolean {
  const lower = msg.toLowerCase();
  const diningLookupZh =
    /推荐.*餐厅|推荐.*吃|餐厅推荐|找餐厅|搜餐厅|附近.*餐厅|附近.*午餐|附近.*午饭|附近.*晚餐|找.*午餐|找.*午饭|找.*晚餐|午餐|午饭|晚餐|正餐|用餐|美食推荐|美食|好吃|吃的地方|去哪吃|吃饭推荐|有没有好吃的|宵夜|早餐店|想吃|吃啥|吃什么|特色小吃|特色(?:的)?餐厅|有没有.{0,12}餐厅|餐厅.{0,24}(?:提前|预订|预定|预约)|(?:提前|预订|预定).{0,16}餐厅|哪家餐厅|饭店推荐|特色饭店/i;
  const diningLookupEn =
    /\b(restaurants?|cafes?|dining|food\s+near|where\s+to\s+eat|places?\s+to\s+eat|eat\s+near|reservation|book(?:ing)?\s+(?:a\s+)?table)\b/i;
  return diningLookupZh.test(msg) || diningLookupEn.test(lower);
}

function supplyMatch(msg: string): boolean {
  const lower = msg.toLowerCase();
  const supplyLookupZh =
    /(?:可以|能).{0,12}(?:买|买到|购买|采购).{0,16}(?:什么|哪些|啥)|有什么(?:水果|蔬菜|食物|饮料|零食|补给)|(?:超市|便利店|商店|购物).{0,16}(?:有什么|卖什么|能买|买到什么|买什么)|(?:Bonus|Bónus|Krónan|Hagkaup|Nettó|维克).{0,16}(?:有什么|卖什么|能买|买到)/i;
  const supplyLookupEn =
    /\bwhat\s+(?:\w+\s+){0,4}can\s+(?:i|you|we)\s+buy\b/i.test(lower) ||
    /\bwhat\s+(?:fruits?|vegetables?|food|groceries)\s+(?:are|is)\s+(?:available|sold|there)\b/i.test(
      lower,
    ) ||
    /\b(?:supermarket|grocery|convenience\s+store).{0,24}(?:sell|stock|carry|have)\b/i.test(lower);
  return supplyLookupZh.test(msg) || supplyLookupEn;
}

/** 「附近能买苹果」类：有空间词 + 购买对象，但未必点名 POI */
function supplyNearbyMatch(msg: string): boolean {
  if (supplyMatch(msg)) return false;
  return (
    /(?:附近|周边|沿线|那一带|沿途).{0,24}(?:买|买到|购买|采购|超市|便利店|补给|水果|食物)/i.test(msg) ||
    /(?:买|买到|购买).{0,12}(?:水果|蔬菜|食物|苹果|香蕉|补给).{0,16}(?:吗|么|呢|？|\?)/i.test(msg)
  );
}

function accommodationMatch(msg: string): boolean {
  const lower = msg.toLowerCase();
  const zh =
    /推荐酒店|酒店推荐|找酒店|搜酒店|搜索酒店|查酒店|住宿推荐|有空房|哪家酒店|酒店价格|民宿推荐|推荐.{0,24}酒店|酒店.{0,12}推荐/i;
  /** 「可以给我推荐吗？8月19号的酒店」：日历日 + 住宿词 */
  const calendarLodging =
    /(\d{1,2}\s*月\s*\d{1,2}\s*[日号]?|\d{1,2}\s*[.．/]\s*\d{1,2}\s*[日号]?|\d{4}-\d{2}-\d{2}).{0,16}(酒店|住宿|旅馆|民宿|过夜)/i.test(
      msg,
    ) ||
    /(酒店|住宿|旅馆|民宿).{0,16}(\d{1,2}\s*月\s*\d{1,2}\s*[日号]?|\d{1,2}\s*[.．/]\s*\d{1,2}\s*[日号]?|\d{4}-\d{2}-\d{2})/i.test(
      msg,
    );
  const en =
    /\b(find|search|recommend)\s+(?:me\s+)?(?:some\s+)?(?:a\s+)?(?:hotels?|lodging|accommodation|bnb)\b/i;
  return zh.test(msg) || calendarLodging || en.test(lower);
}

function transportMatch(msg: string): boolean {
  const lower = msg.toLowerCase();
  const zh =
    /租车|租一辆|租辆|租越野|自驾|包车|提车|还车|租车行|路况|交规|碎石路|F\s*路|F\d+|环岛|驾照|冰岛开车/i;
  const en =
    /\b(car\s+rental|rent(?:ing)?\s+a\s+car|self[- ]drive|driving\s+in|road\s+rules|rental\s+car)\b/i;
  return zh.test(msg) || en.test(lower);
}

/** 门票/活动预订检索（含飞猪活动卡；勿吞住宿/租车域） */
function activityTicketMatch(msg: string): boolean {
  if (/(?:酒店|住宿|民宿|旅馆|租车|提车|还车)/i.test(msg)) return false;
  return (
    /(?:门票|入场券).{0,24}(?:多少|价格|预订|预定|预约|信息|链接|费用|票价)/i.test(msg) ||
    /(?:搜|搜索|查|查一下|订|买|购).{0,16}(?:门票|入场券)/i.test(msg) ||
    /(?:门票|入场券).{0,12}(?:预订|预定|预约)/i.test(msg) ||
    /景区.{0,16}门票/i.test(msg)
  );
}

function scopedFeasibilityMatch(msg: string): boolean {
  const lower = msg.toLowerCase();
  const zh =
    (/(\d{1,2}\s*点(?:之后|以前|前|后)|晚上|傍晚|下午|早上|凌晨|中午|晚间)/.test(msg) ||
      /(?:第[一二三四五六七八九十1-7]+天|第一天|第二天|第三天|第四天|第五天|第六天|第七天|当天|这天|首日)/.test(
        msg,
      )) &&
    /(?:可以|能|能否|是否|合适|安全|来得及|赶得上|顺路|绕路|顺不顺|折腾)/.test(msg) &&
    /(?:吗|么|呢)/.test(msg);
  const en =
    /\b(?:day\s*[1-7]|first\s+day)\b/i.test(lower) &&
    /\b(?:can\s+i|is\s+it\s+ok|possible|feasible|safe)\b/i.test(lower);
  return zh || en;
}

/** 内置 Profile 列表（按优先级：越具体越靠前） */
export const INTENT_PROFILES: readonly IntentProfile[] = [
  {
    id: 'crud.itinerary.delete',
    label: '行程删除',
    route: 'CRUD_SHORT_CIRCUIT',
    match: (msg) => detectItineraryItemDeleteIntent(msg),
  },
  {
    id: 'crud.itinerary.update',
    label: '行程时间修改',
    route: 'CRUD_SHORT_CIRCUIT',
    match: (msg) => detectItineraryItemUpdateIntent(msg),
  },
  {
    id: 'crud.itinerary.add',
    label: '行程新增 POI',
    route: 'CRUD_SHORT_CIRCUIT',
    match: (msg) => detectItineraryItemAddIntent(msg),
  },
  {
    id: 'consult.itinerary.day_view',
    label: '查看指定日行程',
    route: 'DATA_LOOKUP',
    match: (msg) => detectItineraryDayViewIntent(msg),
  },
  {
    id: 'consult.dining',
    label: '餐饮咨询',
    route: 'DATA_LOOKUP',
    ragChunkCategories: ['POI', 'DECISION_SUPPORT'],
    match: (msg) => diningMatch(msg),
  },
  {
    id: 'consult.supply',
    label: '超市/补给咨询',
    route: 'DATA_LOOKUP',
    ragChunkCategories: ['POI', 'DECISION_SUPPORT'],
    geoCategories: ['SHOPPING'],
    countries: ['IS'],
    match: (msg) => supplyMatch(msg),
  },
  {
    id: 'consult.supply.nearby',
    label: '附近补给检索',
    route: 'DATA_LOOKUP',
    ragChunkCategories: ['POI', 'DECISION_SUPPORT'],
    geoCategories: ['SHOPPING'],
    match: (msg) => supplyNearbyMatch(msg),
  },
  {
    id: 'consult.accommodation',
    label: '住宿检索',
    route: 'DATA_LOOKUP',
    match: (msg) => accommodationMatch(msg),
  },
  {
    id: 'consult.activity_ticket',
    label: '门票/活动预订检索',
    route: 'DATA_LOOKUP',
    ragChunkCategories: ['POI', 'DECISION_SUPPORT'],
    match: (msg) => activityTicketMatch(msg),
  },
  {
    id: 'consult.transport',
    label: '交通/租车咨询',
    route: 'DATA_LOOKUP',
    ragChunkCategories: ['ROUTE', 'SAFETY'],
    match: (msg) => transportMatch(msg),
  },
  {
    id: 'consult.scoped_feasibility',
    label: '单日可行性',
    route: 'DATA_LOOKUP',
    match: (msg) => scopedFeasibilityMatch(msg),
  },
];

export function matchIntentProfiles(
  message: string,
  ctx: IntentMatchContext = {},
): MatchedIntentProfile[] {
  const clause = String(message ?? '').trim();
  if (!clause) return [];
  const country = ctx.countryCode?.trim().toUpperCase();
  const out: MatchedIntentProfile[] = [];
  for (const profile of INTENT_PROFILES) {
    if (profile.countries?.length && country && !profile.countries.includes(country)) continue;
    if (profile.match(clause, ctx)) {
      out.push({ profile, clause });
    }
  }
  return out;
}

export function firstDataLookupProfile(message: string, ctx?: IntentMatchContext): IntentProfile | undefined {
  return matchIntentProfiles(message, ctx).find((m) => m.profile.route === 'DATA_LOOKUP')?.profile;
}

export function matchesAnyDataLookupProfile(message: string, ctx?: IntentMatchContext): boolean {
  return matchIntentProfiles(message, ctx).some((m) => m.profile.route === 'DATA_LOOKUP');
}

export function matchesCrudProfile(message: string, ctx?: IntentMatchContext): boolean {
  return matchIntentProfiles(message, ctx).some((m) => m.profile.route === 'CRUD_SHORT_CIRCUIT');
}
